import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  createResearchPostHandler,
  GET,
  maxDuration,
} from "../src/app/api/research/route";
import {
  createResearchRequestGuard,
  RESEARCH_RATE_LIMIT_MODE,
  RESEARCH_WAF_MAX_REQUESTS,
  RESEARCH_WAF_WINDOW_SECONDS,
  type ResearchRequestGuard,
} from "../src/server/research/request-guard";

const routeUrl = "https://genial.test/api/research";
const requestGuardSource = readFileSync(
  new URL("../src/server/research/request-guard.ts", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(
  new URL("../src/app/api/research/route.ts", import.meta.url),
  "utf8",
);

function requestFor(address: string, body: unknown = { name: "Airbus" }): Request {
  return new Request(routeUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://genial.test",
      "sec-fetch-site": "same-origin",
      "x-forwarded-for": address,
    },
    body: JSON.stringify(body),
  });
}

describe("research request guard", () => {
  it("returns a no-store 405 for GET without touching the provider", async () => {
    const response = GET();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "method_not_allowed" },
    });
  });

  it("uses the explicit WAF-only contract without a local distributed limiter", () => {
    expect(RESEARCH_RATE_LIMIT_MODE).toBe("waf_only");
    expect(RESEARCH_WAF_MAX_REQUESTS).toBe(20);
    expect(RESEARCH_WAF_WINDOW_SECONDS).toBe(600);
    expect(requestGuardSource).not.toContain(["check", "RateLimit"].join(""));
    expect(requestGuardSource).not.toContain(["research-dossier", "fixed-window"].join("-"));
    expect(routeSource).not.toContain(["rate_limit", "unavailable"].join("_"));
  });

  it("limits global concurrency to two and releases leases idempotently", async () => {
    const guard = createResearchRequestGuard();
    const [first, second] = await Promise.all([
      guard.acquire(requestFor("203.0.113.1")),
      guard.acquire(requestFor("203.0.113.2")),
    ]);
    const busy = await guard.acquire(requestFor("203.0.113.3"));

    expect(first.admitted).toBe(true);
    expect(second.admitted).toBe(true);
    expect(busy).toEqual({
      admitted: false,
      code: "server_busy",
      retryAfterSeconds: 1,
    });

    if (first.admitted) {
      first.release();
      first.release();
    }
    const third = await guard.acquire(requestFor("203.0.113.3"));
    expect(third.admitted).toBe(true);
    if (second.admitted) second.release();
    if (third.admitted) third.release();
  });
});

describe("research route admission", () => {
  it("keeps the route budget at 180 seconds", () => {
    expect(maxDuration).toBe(180);
  });

  it("parses and validates the request before asking for admission", async () => {
    const acquire = vi.fn<ResearchRequestGuard["acquire"]>();
    const handler = createResearchPostHandler({
      requestGuard: { acquire },
      providerFactory: vi.fn(() => {
        throw new Error("provider must not be constructed");
      }),
      sourceVerifierFactory: vi.fn(() => {
        throw new Error("verifier must not be constructed");
      }),
      logger: { info: () => undefined },
    });

    const response = await handler(requestFor("203.0.113.8", { name: "A" }));
    expect(response.status).toBe(400);
    expect(acquire).not.toHaveBeenCalled();
  });

  it("returns only a local concurrency 429 before constructing providers", async () => {
    const providerFactory = vi.fn(() => {
      throw new Error("provider must not be constructed");
    });
    const handler = createResearchPostHandler({
      requestGuard: {
        acquire: async () => ({
          admitted: false,
          code: "server_busy",
          retryAfterSeconds: 1,
        }),
      },
      providerFactory,
      sourceVerifierFactory: vi.fn(() => {
        throw new Error("verifier must not be constructed");
      }),
      logger: { info: () => undefined },
    });

    const response = await handler(requestFor("203.0.113.9"));
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("1");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "server_busy",
        message: "Deux recherches sont déjà en cours. Réessayez dans un instant.",
      },
    });
    expect(providerFactory).not.toHaveBeenCalled();
  });

  it("represents an edge WAF rejection as zero application and provider calls", async () => {
    const providerFactory = vi.fn();
    const applicationHandler = vi.fn(async () => {
      providerFactory();
      return new Response(null, { status: 200 });
    });
    const dispatchThroughWaf = async (): Promise<Response> =>
      new Response(null, { status: 429 });

    const response = await dispatchThroughWaf();

    expect(response.status).toBe(429);
    expect(applicationHandler).not.toHaveBeenCalled();
    expect(providerFactory).not.toHaveBeenCalled();
  });

  it("releases admission immediately when the response stream is cancelled", async () => {
    const release = vi.fn();
    const handler = createResearchPostHandler({
      requestGuard: {
        acquire: async () => ({ admitted: true, release }),
      },
      providerFactory: () => ({
        research: (_input, signal) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          }),
      }),
      sourceVerifierFactory: () => ({
        verify: () => new Promise<never>(() => undefined),
      }),
      logger: { info: () => undefined },
    });

    const response = await handler(requestFor("203.0.113.10"));
    expect(response.status).toBe(200);
    await response.body?.cancel();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("releases admission when research reaches a terminal event", async () => {
    const release = vi.fn();
    const handler = createResearchPostHandler({
      requestGuard: {
        acquire: async () => ({ admitted: true, release }),
      },
      providerFactory: () => ({
        research: async () => {
          throw new Error("provider unavailable");
        },
      }),
      sourceVerifierFactory: () => ({
        verify: () => new Promise<never>(() => undefined),
      }),
      logger: { info: () => undefined },
    });

    const response = await handler(requestFor("203.0.113.12"));
    expect(await response.text()).toContain("event: failed");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("does not apply the production limiter to dependency-injected handlers", async () => {
    const handler = createResearchPostHandler({
      providerFactory: () => ({
        research: (_input, signal) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          }),
      }),
      sourceVerifierFactory: () => ({
        verify: () => new Promise<never>(() => undefined),
      }),
      logger: { info: () => undefined },
    });

    for (let index = 0; index < 4; index += 1) {
      const response = await handler(requestFor("203.0.113.11"));
      expect(response.status).toBe(200);
      await response.body?.cancel();
    }
  });
});
