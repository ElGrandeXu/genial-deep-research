import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");
const args = process.argv.slice(2);

if (args.length === 0) {
  throw new Error("Usage: node tools/run-next.mjs <dev|build|start> [...args]");
}

const child = spawn(process.execPath, [nextCli, ...args], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
  },
});

child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Next.js interrompu par le signal ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
