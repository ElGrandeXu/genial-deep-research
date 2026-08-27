import { afterEach, beforeAll, expect, vi } from "vitest";

import { getNodeDnsResolutionCount } from "../src/server/research/source-security";
import { getNodeHttpsRequestCount } from "../src/server/research/source-transport";

let dnsBaseline = 0;
let httpsBaseline = 0;

beforeAll(() => {
  dnsBaseline = getNodeDnsResolutionCount();
  httpsBaseline = getNodeHttpsRequestCount();
  vi.stubGlobal("fetch", vi.fn(() => {
    throw new Error("REAL_NETWORK_GUARD: global fetch invoked during offline tests");
  }));
});

afterEach(() => {
  expect(getNodeDnsResolutionCount(), "REAL_NETWORK_GUARD: DNS").toBe(dnsBaseline);
  expect(getNodeHttpsRequestCount(), "REAL_NETWORK_GUARD: HTTPS").toBe(httpsBaseline);
});
