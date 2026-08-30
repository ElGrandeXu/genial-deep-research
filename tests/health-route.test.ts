import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "../src/app/api/health/route";

describe("GET /api/health", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns only a non-sensitive technical status", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("exposes only a valid public Git commit fingerprint when Vercel provides one", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "ABCDEF0123456789ABCDEF0123456789ABCDEF01");
    const response = GET();

    await expect(response.json()).resolves.toEqual({
      status: "ok",
      commit: "abcdef0123456789abcdef0123456789abcdef01",
    });
  });
});
