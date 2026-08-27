import { describe, expect, it, vi } from "vitest";

import {
  createResearchPostHandler,
  maxDuration,
} from "../src/app/api/research/route";
import {
  createResearchRequestGuard,
  type ResearchRequestGuard,
} from "../src/server/research/request-guard";

const routeUrl = "https://genial.test/api/research";

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
  it("admits three requests per hashed address in ten minutes", () => {
    let currentTime = 1_000;
    const guard = createResearchRequestGuard({
      now: () => currentTime,
      hashSalt: new Uint8Array(32).fill(7),
    });

    for (let admissionNumber = 0; admissionNumber < 3; admissionNumber += 1) {
      const admission = guard.acquire(requestFor("203.0.113.7"));
      expect(admission.admitted).toBe(true);
      if (admission.admitted) admission.release();
    }

    const rejected = guard.acquire(requestFor("203.0.113.7"));
    expect(rejected).toEqual({
      admitted: false,
      code: "rate_limited",
      retryAfterSeconds: 600,
    });

    currentTime += 10 * 60 * 1_000 + 1;
    const admittedAfterWindow = guard.acquire(requestFor("203.0.113.7"));
    expect(admittedAfterWindow.admitted).toBe(true);
    if (admittedAfterWindow.admitted) admittedAfterWindow.release();
  });

  it("limits global concurrency to two and releases leases idempotently", () => {
    const guard = createResearchRequestGuard({
      now: () => 1_000,
      hashSalt: new Uint8Array(32).fill(9),
    });
    const first = guard.acquire(requestFor("203.0.113.1"));
    const second = guard.acquire(requestFor("203.0.113.2"));
    const busy = guard.acquire(requestFor("203.0.113.3"));

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
    const third = guard.acquire(requestFor("203.0.113.3"));
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

  it("returns a no-store 429 with Retry-After before constructing providers", async () => {
    const providerFactory = vi.fn(() => {
      throw new Error("provider must not be constructed");
    });
    const handler = createResearchPostHandler({
      requestGuard: {
        acquire: () => ({
          admitted: false,
          code: "rate_limited",
          retryAfterSeconds: 42,
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
    expect(response.headers.get("retry-after")).toBe("42");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "rate_limited",
        message: "Trop de recherches ont été demandées. Réessayez plus tard.",
      },
    });
    expect(providerFactory).not.toHaveBeenCalled();
  });

  it("releases admission immediately when the response stream is cancelled", async () => {
    const release = vi.fn();
    const handler = createResearchPostHandler({
      requestGuard: {
        acquire: () => ({ admitted: true, release }),
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
        acquire: () => ({ admitted: true, release }),
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
