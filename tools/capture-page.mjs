import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const [url, outputPath, rawWidth = "1440", rawHeight = "1000", rawScenario] =
  process.argv.slice(2);

if (url === undefined || outputPath === undefined) {
  throw new Error(
    "Usage: node tools/capture-page.mjs <url> <output.png> [width] [height] [scenario-json]",
  );
}

const width = Number.parseInt(rawWidth, 10);
const height = Number.parseInt(rawHeight, 10);
if (!Number.isSafeInteger(width) || width < 320 || width > 2560) {
  throw new Error("Capture width must be between 320 and 2560.");
}
if (!Number.isSafeInteger(height) || height < 480 || height > 2400) {
  throw new Error("Capture height must be between 480 and 2400.");
}

const scenario = rawScenario === undefined
  ? null
  : JSON.parse(rawScenario);
const browserCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
let browserPath;
for (const candidate of browserCandidates) {
  try {
    await access(candidate);
    browserPath = candidate;
    break;
  } catch {
    // Try the next installed Chromium browser.
  }
}
if (browserPath === undefined) throw new Error("No supported Chromium browser found.");

const port = 12_000 + Math.floor(Math.random() * 20_000);
const profile = await mkdtemp(join(tmpdir(), "genial-capture-"));
const browser = spawn(
  browserPath,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore", windowsHide: true },
);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForPageTarget() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page");
      if (page?.webSocketDebuggerUrl !== undefined) return page.webSocketDebuggerUrl;
    } catch {
      // Browser startup is still in progress.
    }
    await delay(100);
  }
  throw new Error("Chromium DevTools endpoint did not become ready.");
}

class CdpClient {
  #id = 0;
  #pending = new Map();
  #listeners = new Map();

  constructor(socket) {
    this.socket = socket;
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(String(data));
      if (typeof message.id === "number") {
        const pending = this.#pending.get(message.id);
        if (pending === undefined) return;
        this.#pending.delete(message.id);
        if (message.error !== undefined) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      const listeners = this.#listeners.get(message.method) ?? [];
      for (const listener of listeners) listener(message.params);
    });
  }

  send(method, params = {}) {
    this.#id += 1;
    const id = this.#id;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method) {
    return new Promise((resolve) => {
      const listener = (params) => {
        this.#listeners.delete(method);
        resolve(params);
      };
      this.#listeners.set(method, [listener]);
    });
  }
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails !== undefined) {
    throw new Error(result.exceptionDetails.text ?? "Browser evaluation failed.");
  }
  return result.result.value;
}

async function waitFor(client, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return;
    await delay(250);
  }
  throw new Error(`Browser condition timed out: ${expression}`);
}

let socket;
try {
  const endpoint = await waitForPageTarget();
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const client = new CdpClient(socket);
  await Promise.all([
    client.send("Page.enable"),
    client.send("Runtime.enable"),
    client.send("Network.enable"),
    client.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 500,
    }),
  ]);
  const loaded = client.once("Page.loadEventFired");
  await client.send("Page.navigate", { url });
  await loaded;
  await waitFor(client, "document.readyState === 'complete'", 10_000);

  if (scenario !== null) {
    const safeScenario = JSON.stringify({
      name: String(scenario.name ?? ""),
      entityType: String(scenario.entityType ?? "auto"),
      context: String(scenario.context ?? ""),
    });
    await evaluate(client, `(() => {
      const scenario = ${safeScenario};
      const setValue = (selector, value) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) throw new Error('field missing');
        const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
        element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
      };
      setValue('#entity-type', scenario.entityType);
      setValue('#entity-name', scenario.name);
      setValue('#entity-context', scenario.context);
      document.querySelector('form').requestSubmit();
      return true;
    })()`);
    await waitFor(
      client,
      "document.querySelector('.result-card, .error-box') !== null && document.querySelector('[aria-busy=\"true\"]') === null",
      180_000,
    );
  }

  await delay(500);
  const layout = await client.send("Page.getLayoutMetrics");
  const content = layout.cssContentSize ?? layout.contentSize;
  const overflow = await evaluate(client, `({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    activeElement: document.activeElement?.className ?? document.activeElement?.tagName ?? null,
    resultStatus: document.querySelector('.result-status')?.textContent?.trim() ?? null
  })`);
  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
    clip: {
      x: 0,
      y: 0,
      width: Math.ceil(content.width),
      height: Math.min(12_000, Math.ceil(content.height)),
      scale: 1,
    },
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(screenshot.data, "base64"));
  process.stdout.write(`${JSON.stringify({
    outputPath,
    width,
    height: Math.ceil(content.height),
    overflow,
    profile,
  })}\n`);
} finally {
  socket?.close();
  browser.kill();
}
