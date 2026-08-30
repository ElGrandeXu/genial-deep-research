import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import fixtures from "../docs/contracts/contract-fixtures.json";
import syntheticProviderFixture from "./fixtures/m5-r2b-synthetic-provider.json";
import { validateResearchDossier } from "../src/domain/contract-validator";
import { ResearchPipelineError } from "../src/server/research/errors";
import {
  bindProviderSource,
  normalizeOpenAIProviderMetadata,
  parseProviderCandidate,
  type OpenAIWebSearchToolResult,
} from "../src/server/research/provider-metadata";
import { executeResearch } from "../src/server/research/service";
import {
  createSourceVerifier,
  containsEntityNameInText,
  extractVisibleText,
  locateVerifiedExcerpt,
  normalizeVisibleText,
} from "../src/server/research/source-content";
import {
  getNodeDnsResolutionCount,
  isPublicDnsAddress,
  resolveAndPinPublicAddress,
  validateCitationAndStructuredUrl,
  validateSourceUrl,
  type DnsAddress,
  type DnsResolver,
} from "../src/server/research/source-security";
import {
  buildPinnedHttpsRequestOptions,
  fetchSourceWithPinning,
  getNodeHttpsRequestCount,
  NodePinnedHttpsTransport,
  SOURCE_MAX_BYTES,
  type PinnedSourceRequest,
  type SourceTransport,
  type SourceTransportResponse,
} from "../src/server/research/source-transport";
import {
  FAILURE_CATEGORIES,
  type ProviderClaimCandidate,
  type ProviderFactCandidate,
  type ProviderResearchResult,
  type ResearchProgressEvent,
  type SourceVerifier,
} from "../src/server/research/types";

const claim = "Airbus SE est une société européenne.";
const sourceUrl = "https://research.public.org/airbus";
const sensitiveMarker = "SECRET_MARKER";
const retrievedAt = new Date("2026-08-26T12:00:00.000Z");
const publicAddress: DnsAddress = { address: "93.184.216.34", family: 4 };

function providerText(options: {
  readonly statement?: string;
  readonly url?: string;
  readonly excerpt?: string;
  readonly prefix?: string;
  readonly suffix?: string;
} = {}): string {
  return [
    "STATUS: evidence",
    "ENTITY_TYPE: company",
    `CLAIM: ${options.statement ?? claim}`,
    `SOURCE_URL: ${options.url ?? sourceUrl}`,
    `EXCERPT: ${options.excerpt ?? claim}`,
    `PREFIX: ${options.prefix ?? "NONE"}`,
    `SUFFIX: ${options.suffix ?? "NONE"}`,
  ].join("\n");
}

function normalizedMetadata(options: {
  readonly text?: string;
  readonly start?: number;
  readonly end?: number;
  readonly url?: string;
  readonly title?: string;
  readonly annotations?: readonly unknown[];
  readonly metadata?: unknown;
} = {}) {
  const text = options.text ?? providerText();
  const start = options.start ?? text.indexOf(claim);
  const annotations = options.annotations ?? [
    {
      type: "url_citation",
      start_index: start,
      end_index: options.end ?? start + claim.length,
      url: options.url ?? sourceUrl,
      title: options.title ?? "Synthetic source",
    },
  ];
  return normalizeOpenAIProviderMetadata({
    generatedText: text,
    content: [
      {
        type: "text",
        text,
        providerMetadata:
          options.metadata ??
          ({
            openai: {
              itemId: "item-synthetic",
              annotations,
            },
          } as const),
      },
    ],
    sources: [
      {
        sourceType: "url",
        id: "source-synthetic",
        url: options.url ?? sourceUrl,
        title: options.title ?? "Synthetic source",
      },
    ],
    toolCalls: [{ toolName: "web_search", toolCallId: "tool-synthetic" }],
    toolResults: [{
      toolName: "web_search",
      toolCallId: "tool-synthetic",
      output: {
        action: { type: "search", queries: ["synthetic query"] },
        sources: [{ type: "url", url: options.url ?? sourceUrl }],
      },
    }],
  });
}

function webSearchToolResult(
  toolCallId: string,
  actionType: "search" | "openPage" | "findInPage",
  options: {
    readonly sourceUrls?: readonly string[] | null;
    readonly inspectionUrl?: string | null;
    readonly omitInspectionUrl?: boolean;
  } = {},
): OpenAIWebSearchToolResult {
  if (actionType === "search") {
    return {
      toolName: "web_search",
      toolCallId,
      output: {
        action: { type: "search", queries: ["SYNTHETIC_QUERY_NOT_RETAINED"] },
        ...(options.sourceUrls === null
          ? {}
          : {
              sources: (options.sourceUrls ?? [sourceUrl]).map((url) => ({
                type: "url" as const,
                url,
              })),
            }),
      },
    };
  }
  const inspectionUrl =
    "inspectionUrl" in options
      ? options.inspectionUrl ?? null
      : actionType === "openPage"
        ? "https://ignored.invalid/open"
        : "https://ignored.invalid/find";
  if (actionType === "openPage") {
    return {
      toolName: "web_search",
      toolCallId,
      output: {
        action: {
          type: "openPage",
          ...(options.omitInspectionUrl ? {} : { url: inspectionUrl }),
        },
        ...(options.sourceUrls === null
          ? {}
          : {
              sources: (options.sourceUrls ?? []).map((url) => ({
                type: "url" as const,
                url,
              })),
            }),
      },
    };
  }
  return {
    toolName: "web_search",
    toolCallId,
    output: {
      action: {
        type: "findInPage",
        ...(options.omitInspectionUrl ? {} : { url: inspectionUrl }),
        pattern: "SYNTHETIC_PATTERN_NOT_RETAINED",
      },
      ...(options.sourceUrls === null
        ? {}
        : {
            sources: (options.sourceUrls ?? []).map((url) => ({
              type: "url" as const,
              url,
            })),
          }),
    },
  };
}

function normalizeWebSearchActions(options: {
  readonly results: readonly OpenAIWebSearchToolResult[];
  readonly duplicateResults?: readonly OpenAIWebSearchToolResult[];
  readonly callIds?: readonly string[];
}) {
  const text = providerText();
  const callIds =
    options.callIds ?? [...new Set(options.results.map(({ toolCallId }) => toolCallId))];
  return normalizeOpenAIProviderMetadata({
    generatedText: text,
    content: [{
      type: "text",
      text,
      providerMetadata: { openai: { itemId: "item-actions", annotations: [] } },
    }],
    sources: [],
    toolCalls: callIds.map((toolCallId) => ({
      toolName: "web_search" as const,
      toolCallId,
    })),
    toolResults: options.results,
    duplicateToolResults: options.duplicateResults ?? [],
  });
}

function providerResult(overrides: Partial<ProviderResearchResult> = {}): ProviderResearchResult {
  const text = providerText();
  const metadata = normalizedMetadata({ text });
  return {
    text,
    document: {
      identityStatus: "resolved",
      entityType: "company",
      candidates: [{
        candidateKey: "airbus-se",
        displayName: "Airbus SE",
        entityType: "company",
        entityScope: "group",
        discriminators: {
          city: null,
          country: null,
          industry: null,
          employer: null,
          officialSite: "research.public.org",
          legalIdentifier: null,
          year: null,
        },
        statement: claim,
        structuredUrl: sourceUrl,
        excerpt: claim,
        prefix: null,
        suffix: null,
      }],
      claims: [{
        subjectKey: "airbus-se",
        category: "identity",
        entityType: "company",
        statement: claim,
        predicate: "identity",
        scopeType: "company",
        scopeLabel: "Airbus SE",
        factPeriodLabel: null,
        factDate: null,
        normalizedValue: null,
        unit: null,
        currency: null,
        contradictionKey: null,
        structuredUrl: sourceUrl,
        excerpt: claim,
        prefix: null,
        suffix: null,
      }],
      missingCategories: [],
    },
    citations: metadata.citations,
    sources: metadata.sources,
    webSearchCalls: metadata.webSearchCalls,
    webSearchActions: metadata.webSearchActions,
    webSearchInspections: metadata.webSearchInspections,
    webSearchActionCount: metadata.webSearchActionCount,
    webSearchQueryCount: metadata.webSearchQueryCount,
    webSearchInspectionCount: metadata.webSearchInspectionCount,
    webSearchUniqueCallCount: metadata.webSearchUniqueCallCount,
    webSearchActionPolicyStatus: metadata.webSearchActionPolicyStatus,
    webSearchActionPolicyCode: metadata.webSearchActionPolicyCode,
    providerMetadataStatus: metadata.status,
    providerHttpCalls: 1,
    toolCalls: 1,
    usage: {
      inputTokens: 1_000,
      cachedInputTokens: 100,
      outputTokens: 100,
      reasoningTokens: 20,
      totalTokens: 1_100,
    },
    providerDurationMs: 40,
    finishReason: "stop",
    requestId: "request-synthetic",
    ...overrides,
  };
}

function providerResultFromActionMetadata(
  metadata: ReturnType<typeof normalizeWebSearchActions>,
  overrides: Partial<ProviderResearchResult> = {},
): ProviderResearchResult {
  return providerResult({
    citations: metadata.citations,
    sources: metadata.sources,
    webSearchCalls: metadata.webSearchCalls,
    webSearchActions: metadata.webSearchActions,
    webSearchInspections: metadata.webSearchInspections,
    webSearchActionCount: metadata.webSearchActionCount,
    webSearchQueryCount: metadata.webSearchQueryCount,
    webSearchInspectionCount: metadata.webSearchInspectionCount,
    webSearchUniqueCallCount: metadata.webSearchUniqueCallCount,
    webSearchActionPolicyStatus: metadata.webSearchActionPolicyStatus,
    webSearchActionPolicyCode: metadata.webSearchActionPolicyCode,
    providerMetadataStatus: metadata.status,
    toolCalls: metadata.webSearchActionCount,
    ...overrides,
  });
}

function inspectionFallbackResult(
  actionType: "openPage" | "findInPage",
  options: {
    readonly inspectionUrl?: string | null;
    readonly omitInspectionUrl?: boolean;
    readonly inspectionSourceUrls?: readonly string[] | null;
    readonly duplicateResults?: readonly OpenAIWebSearchToolResult[];
    readonly text?: string;
  } = {},
): ProviderResearchResult {
  const metadata = normalizeWebSearchActions({
    results: [
      webSearchToolResult("search-1", "search", { sourceUrls: null }),
      webSearchToolResult("inspect-1", actionType, {
        ...(options.omitInspectionUrl
          ? { omitInspectionUrl: true }
          : {
              inspectionUrl:
                "inspectionUrl" in options
                  ? options.inspectionUrl ?? null
                  : sourceUrl,
            }),
        sourceUrls: options.inspectionSourceUrls ?? null,
      }),
    ],
    duplicateResults: options.duplicateResults ?? [],
  });
  return providerResultFromActionMetadata(metadata, {
    citations: [],
    sources: [],
    ...(options.text === undefined ? {} : { text: options.text }),
  });
}

function expectPipelineCode(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error("EXPECTED_PIPELINE_ERROR");
  } catch (error) {
    expect(error).toBeInstanceOf(ResearchPipelineError);
    expect((error as ResearchPipelineError).code).toBe(code);
  }
}

function expectSafeQueryRejection(url: string): void {
  let returned: ReturnType<typeof validateSourceUrl> | undefined;
  let captured: unknown;
  try {
    returned = validateSourceUrl(url, "citation");
  } catch (error) {
    captured = error;
  }
  expect(returned).toBeUndefined();
  expect(captured).toBeInstanceOf(ResearchPipelineError);
  const error = captured as ResearchPipelineError;
  expect(error.code).toBe("source_url_rejected");
  expect(error.message).toBe("Les paramètres de cette URL ne sont pas admissibles.");
  const serializedError = JSON.stringify(error) ?? "";
  const persistableOutput = JSON.stringify({
    returned,
    error: { name: error.name, code: error.code, message: error.message },
  });
  for (const output of [error.message, String(error), serializedError, persistableOutput]) {
    expect(output).not.toContain(sensitiveMarker);
    expect(output).not.toContain(url);
  }
}

function percentEncode(value: string, passes: number): string {
  let encoded = value;
  for (let pass = 0; pass < passes; pass += 1) {
    encoded = encodeURIComponent(encoded);
  }
  return encoded;
}

async function expectPipelineCodeAsync(
  action: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await action();
    throw new Error("EXPECTED_PIPELINE_ERROR");
  } catch (error) {
    expect(error).toBeInstanceOf(ResearchPipelineError);
    expect((error as ResearchPipelineError).code).toBe(code);
  }
}

class SyntheticResolver implements DnsResolver {
  readonly calls: string[] = [];

  constructor(
    private readonly answers:
      | readonly DnsAddress[]
      | Readonly<Record<string, readonly DnsAddress[]>> = [publicAddress],
  ) {}

  async resolve(hostname: string): Promise<readonly DnsAddress[]> {
    this.calls.push(hostname);
    if (Array.isArray(this.answers)) return this.answers;
    const byHostname = this.answers as Readonly<
      Record<string, readonly DnsAddress[]>
    >;
    return byHostname[hostname] ?? [publicAddress];
  }
}

function syntheticResponse(
  statusCode: number,
  headers: Record<string, string | string[]>,
  chunks: readonly Uint8Array[] = [],
  metadata: {
    readonly rawHeaders?: readonly string[];
    readonly headersDistinct?: Readonly<
      Record<string, readonly string[] | undefined>
    >;
  } = {},
): SourceTransportResponse & {
  readonly destroyed: () => boolean;
  readonly chunksRead: () => number;
} {
  let wasDestroyed = false;
  let readCount = 0;
  const rawHeaders =
    metadata.rawHeaders ??
    Object.entries(headers).flatMap(([name, value]) =>
      (Array.isArray(value) ? value : [value]).flatMap((entry) => [name, entry]),
    );
  const headersDistinct =
    metadata.headersDistinct ??
    Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [
        name.toLowerCase(),
        Array.isArray(value) ? value : [value],
      ]),
    );
  return {
    statusCode,
    headers,
    rawHeaders,
    headersDistinct,
    body: {
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) {
          readCount += 1;
          yield chunk;
        }
      },
    },
    destroy() {
      wasDestroyed = true;
    },
    destroyed: () => wasDestroyed,
    chunksRead: () => readCount,
  };
}

class SyntheticTransport implements SourceTransport {
  readonly requests: PinnedSourceRequest[] = [];

  constructor(
    private readonly queue: Array<SourceTransportResponse | Error>,
  ) {}

  async request(request: PinnedSourceRequest): Promise<SourceTransportResponse> {
    this.requests.push(request);
    const next = this.queue.shift();
    if (next instanceof Error) throw next;
    if (next === undefined) throw new Error("SYNTHETIC_TRANSPORT_QUEUE_EMPTY");
    return next;
  }
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function okHtml(value = `<html><body><p>${claim}</p></body></html>`): SourceTransportResponse {
  const body = bytes(value);
  return syntheticResponse(
    200,
    { "content-type": "text/html; charset=utf-8", "content-length": String(body.length) },
    [body],
  );
}

function okText(value = claim): SourceTransportResponse {
  const body = bytes(value);
  return syntheticResponse(
    200,
    { "content-type": "text/plain; charset=utf-8", "content-length": String(body.length) },
    [body],
  );
}

async function fetchedWith(options: {
  readonly transport: SourceTransport;
  readonly resolver?: DnsResolver;
  readonly url?: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}) {
  return fetchSourceWithPinning({
    initialUrl: validateSourceUrl(options.url ?? sourceUrl, "citation"),
    resolver: options.resolver ?? new SyntheticResolver(),
    transport: options.transport,
    signal: options.signal ?? new AbortController().signal,
    timeoutMs: options.timeoutMs ?? 1_000,
  });
}

async function expectPreBodyContentTypeRejection(
  response: ReturnType<typeof syntheticResponse>,
  code: "source_content_type_rejected" | "source_charset_rejected" =
    "source_content_type_rejected",
): Promise<void> {
  const transport = new SyntheticTransport([response, okHtml()]);
  let terminals = 0;
  let returnedBody: string | undefined;
  const fetchPromise = fetchedWith({ transport }).then(
    (value) => {
      terminals += 1;
      returnedBody = value.body;
      return value;
    },
    (error: unknown) => {
      terminals += 1;
      throw error;
    },
  );
  await expectPipelineCodeAsync(() => fetchPromise, code);
  await flushMicrotasks();
  expect(response.chunksRead()).toBe(0);
  expect(response.destroyed()).toBe(true);
  expect(transport.requests).toHaveLength(1);
  expect(returnedBody).toBeUndefined();
  expect(terminals).toBe(1);
}

async function expectBodyDecodingRejection(
  contentType: string,
  body: Uint8Array,
): Promise<void> {
  const response = syntheticResponse(
    200,
    { "content-type": contentType },
    [body],
  );
  const transport = new SyntheticTransport([response, okHtml()]);
  let returnedBody: string | undefined;
  await expectPipelineCodeAsync(
    () =>
      fetchedWith({ transport }).then((value) => {
        returnedBody = value.body;
        return value;
      }),
    "source_charset_rejected",
  );
  expect(response.chunksRead()).toBe(1);
  expect(transport.requests).toHaveLength(1);
  expect(returnedBody).toBeUndefined();
  const persistableOutput = JSON.stringify({ returnedBody });
  expect(persistableOutput).not.toContain("\uFFFD");
  expect(persistableOutput).not.toContain("€");
  expect(persistableOutput).not.toContain("ÿ");
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

class ControlledSourceResponse implements SourceTransportResponse {
  readonly statusCode = 200;
  readonly headers = { "content-type": "text/plain; charset=utf-8" };
  readonly rawHeaders = ["content-type", "text/plain; charset=utf-8"];
  readonly headersDistinct = {
    "content-type": ["text/plain; charset=utf-8"],
  };
  readonly body: AsyncIterable<Uint8Array>;
  destroyCalls = 0;
  nextCalls = 0;
  private readonly waiting: Array<{
    readonly resolve: (value: IteratorResult<Uint8Array>) => void;
    readonly reject: (error: unknown) => void;
  }> = [];
  private readonly queued: Uint8Array[] = [];
  private ended = false;

  constructor(private readonly rejectPendingOnDestroy = true) {
    this.body = {
      [Symbol.asyncIterator]: () => ({ next: () => this.next() }),
    };
  }

  push(chunk: Uint8Array): void {
    const waiter = this.waiting.shift();
    if (waiter !== undefined) {
      waiter.resolve({ done: false, value: chunk });
      return;
    }
    this.queued.push(chunk);
  }

  end(): void {
    this.ended = true;
    for (const waiter of this.waiting.splice(0)) {
      waiter.resolve({ done: true, value: undefined });
    }
  }

  destroy(error?: Error): void {
    this.destroyCalls += 1;
    this.queued.length = 0;
    if (!this.rejectPendingOnDestroy) return;
    for (const waiter of this.waiting.splice(0)) {
      waiter.reject(error ?? new Error("SYNTHETIC_RESPONSE_DESTROYED"));
    }
  }

  private next(): Promise<IteratorResult<Uint8Array>> {
    this.nextCalls += 1;
    const chunk = this.queued.shift();
    if (chunk !== undefined) {
      return Promise.resolve({ done: false, value: chunk });
    }
    if (this.ended) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve, reject) => {
      this.waiting.push({ resolve, reject });
    });
  }
}

class PendingSourceTransport implements SourceTransport {
  readonly requests: PinnedSourceRequest[] = [];
  destroyedRequests = 0;

  request(request: PinnedSourceRequest): Promise<SourceTransportResponse> {
    this.requests.push(request);
    return new Promise((_resolve, reject) => {
      request.signal.addEventListener(
        "abort",
        () => {
          this.destroyedRequests += 1;
          reject(new Error("SYNTHETIC_SECONDARY_REQUEST_ERROR"));
        },
        { once: true },
      );
    });
  }
}

class LifecycleClientRequest extends EventEmitter {
  destroyed = false;
  destroyCalls = 0;
  endCalls = 0;
  timeoutCalls: number[] = [];

  constructor(
    private readonly throwOnTimeout = false,
    private readonly throwOnEnd = false,
  ) {
    super();
  }

  setTimeout(timeoutMs: number): this {
    this.timeoutCalls.push(timeoutMs);
    if (this.throwOnTimeout) throw new Error("SYNTHETIC_TIMEOUT_CONFIGURATION");
    return this;
  }

  end(): this {
    this.endCalls += 1;
    if (this.throwOnEnd) throw new Error("SYNTHETIC_END");
    return this;
  }

  destroy(): this {
    if (this.destroyed) return this;
    this.destroyed = true;
    this.destroyCalls += 1;
    return this;
  }
}

class LifecycleIncomingResponse extends EventEmitter {
  readonly statusCode = 200;
  readonly headers: Record<string, string | string[]>;
  readonly rawHeaders: readonly string[];
  readonly headersDistinct: Readonly<
    Record<string, readonly string[] | undefined>
  >;
  destroyed = false;
  destroyCalls = 0;
  nextCalls = 0;
  private ended = false;
  private queuedError: unknown;
  private readonly chunks: Uint8Array[] = [];
  private readonly waiters: Array<{
    readonly resolve: (value: IteratorResult<Uint8Array>) => void;
    readonly reject: (error: unknown) => void;
  }> = [];

  constructor(headers: Record<string, string | string[]> = {
    "content-type": "text/plain; charset=utf-8",
  }) {
    super();
    this.headers = headers;
    this.rawHeaders = Object.entries(headers).flatMap(([name, value]) =>
      (Array.isArray(value) ? value : [value]).flatMap((entry) => [name, entry]),
    );
    this.headersDistinct = Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [
        name.toLowerCase(),
        Array.isArray(value) ? value : [value],
      ]),
    );
  }

  [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    return { next: () => this.next() };
  }

  push(chunk: Uint8Array): void {
    const waiter = this.waiters.shift();
    if (waiter !== undefined) {
      waiter.resolve({ done: false, value: chunk });
      return;
    }
    this.chunks.push(chunk);
  }

  finish(): void {
    this.ended = true;
    this.emit("end");
    for (const waiter of this.waiters.splice(0)) {
      waiter.resolve({ done: true, value: undefined });
    }
  }

  rejectIterator(error: unknown): void {
    const waiter = this.waiters.shift();
    if (waiter !== undefined) {
      waiter.reject(error);
      return;
    }
    this.queuedError = error;
  }

  destroy(error?: Error): this {
    if (this.destroyed) return this;
    this.destroyed = true;
    this.destroyCalls += 1;
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(error ?? new Error("SYNTHETIC_RESPONSE_DESTROYED"));
    }
    return this;
  }

  private next(): Promise<IteratorResult<Uint8Array>> {
    this.nextCalls += 1;
    if (this.queuedError !== undefined) {
      const error = this.queuedError;
      this.queuedError = undefined;
      return Promise.reject(error);
    }
    const chunk = this.chunks.shift();
    if (chunk !== undefined) {
      return Promise.resolve({ done: false, value: chunk });
    }
    if (this.ended) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }
}

function lifecycleHarness(options: {
  readonly throwOnTimeout?: boolean;
  readonly throwOnEnd?: boolean;
} = {}): {
  readonly client: LifecycleClientRequest;
  readonly transport: NodePinnedHttpsTransport;
  readonly respond: (response: LifecycleIncomingResponse) => void;
} {
  const client = new LifecycleClientRequest(
    options.throwOnTimeout,
    options.throwOnEnd,
  );
  let responseCallback: ((response: IncomingMessage) => void) | undefined;
  const transport = new NodePinnedHttpsTransport((_requestOptions, callback) => {
    responseCallback = callback;
    return client as never;
  });
  return {
    client,
    transport,
    respond(response) {
      if (responseCallback === undefined) {
        throw new Error("SYNTHETIC_RESPONSE_CALLBACK_MISSING");
      }
      responseCallback(response as unknown as IncomingMessage);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function candidate(overrides: Partial<ProviderClaimCandidate> = {}): ProviderClaimCandidate {
  const text = providerText();
  const claimStart = text.indexOf(claim);
  return {
    entityType: "company",
    statement: claim,
    claimStart,
    claimEnd: claimStart + claim.length,
    structuredUrl: sourceUrl,
    excerpt: claim,
    prefix: null,
    suffix: null,
    ...overrides,
  };
}

function locatorInput(
  visibleText: string,
  candidateValue: ProviderClaimCandidate = candidate(),
) {
  return {
    visibleText,
    candidate: candidateValue,
    fetched: {
      mediaType: "text/html" as const,
      contentType: "text/html; charset=utf-8",
      bytesRead: 321,
      finalUrl: "https://final.public.org/document",
      citationUrl: sourceUrl,
      redirectCount: 1,
      requestCount: 2,
    },
    retrievedAt,
  };
}

function realSyntheticVerifier(body = `<html><body><p>${claim}</p></body></html>`) {
  const transport = new SyntheticTransport([okHtml(body)]);
  const resolver = new SyntheticResolver();
  const verifier = createSourceVerifier({
    resolver,
    transport,
    now: () => retrievedAt,
    monotonicNow: (() => {
      const values = [100, 125];
      return () => values.shift() ?? 125;
    })(),
  });
  return { verifier, transport, resolver };
}

async function runPipeline(options: {
  readonly result?: ProviderResearchResult;
  readonly verifier?: SourceVerifier;
  readonly logger?: (record: Readonly<Record<string, unknown>>) => void;
} = {}): Promise<ResearchProgressEvent[]> {
  const events: ResearchProgressEvent[] = [];
  const source = realSyntheticVerifier();
  await executeResearch({
    input: { name: "Airbus SE", context: `Source choisie ${sourceUrl}` },
    provider: {
      async research() {
        return options.result ?? providerResult();
      },
    },
    sourceVerifier: options.verifier ?? source.verifier,
    signal: new AbortController().signal,
    acceptedMs: 1,
    emit: (event) => events.push(event),
    logger: { info: options.logger ?? (() => undefined) },
    now: () => retrievedAt,
  });
  return events;
}

describe("M5-R2B provider metadata boundary", () => {
  it("[1] accepts a bound citation whose URL matches", () => {
    const text = providerText();
    const metadata = normalizedMetadata({ text });
    const citation = bindProviderSource(
      { text, ...metadata, providerMetadataStatus: metadata.status },
      parseProviderCandidate(text),
    );
    expect(citation.url).toBe(sourceUrl);
  });

  it("[2] rejects an URL present only in model text", () => {
    const text = providerText();
    expectPipelineCode(
      () =>
        bindProviderSource(
          { text, citations: [], sources: [], providerMetadataStatus: "supported" },
          parseProviderCandidate(text),
        ),
      "inspection_url_missing",
    );
  });

  it("[3] treats a general source list as insufficient", () => {
    const text = providerText();
    expectPipelineCode(
      () =>
        bindProviderSource(
          {
            text,
            citations: [],
            sources: [{ sourceId: "source-synthetic", url: sourceUrl }],
            providerMetadataStatus: "supported",
          },
          parseProviderCandidate(text),
        ),
      "inspection_url_missing",
    );
  });

  it("[4] rejects a structured URL absent from citations", () => {
    const text = providerText({ url: "https://other.public.org/source" });
    expectPipelineCode(
      () =>
        bindProviderSource(
          { text, citations: [], sources: [], providerMetadataStatus: "supported" },
          parseProviderCandidate(text),
        ),
      "inspection_url_missing",
    );
  });

  it("[5] rejects a structured URL different from the citation", () => {
    expectPipelineCode(
      () => validateCitationAndStructuredUrl(sourceUrl, "https://other.public.org/source"),
      "source_url_rejected",
    );
  });

  it("[6] rejects out-of-bounds provider offsets", () => {
    const text = providerText();
    const metadata = normalizedMetadata({ text, start: -1, end: text.length + 2 });
    expectPipelineCode(
      () => bindProviderSource({ text, ...metadata, providerMetadataStatus: metadata.status }, parseProviderCandidate(text)),
      "provider_citation_unbound",
    );
  });

  it("[7] rejects offsets that do not cover the claim", () => {
    const text = providerText();
    const metadata = normalizedMetadata({ text, start: 0, end: 10 });
    expectPipelineCode(
      () => bindProviderSource({ text, ...metadata, providerMetadataStatus: metadata.status }, parseProviderCandidate(text)),
      "provider_citation_unbound",
    );
  });

  it("[8] rejects an unknown metadata shape", () => {
    const text = providerText();
    expect(
      normalizedMetadata({ text, metadata: { openai: { itemId: "item", mystery: [] } } }),
    ).toMatchObject({ status: "unknown", citations: [] });
  });

  it("[9] retains a valid citation when only its display title is missing", () => {
    const text = providerText();
    const metadata = normalizedMetadata({ text });
    const citation = metadata.citations[0];
    if (citation === undefined) throw new Error("synthetic citation missing");
    expect(bindProviderSource(
      { text, citations: [{ ...citation, title: null }], sources: metadata.sources, providerMetadataStatus: "supported" },
      parseProviderCandidate(text),
    )).toMatchObject({ url: citation.url, title: null });
  });

  it("[10] marks provider fixtures as synthetic and non-real", () => {
    expect(syntheticProviderFixture.marker).toBe("M5_R2B_SYNTHETIC_FIXTURE_NOT_PROVIDER_OUTPUT");
    expect(syntheticProviderFixture.metadata_note).toContain("Synthetic");
  });

  it("binds a structured-output URL only for direct source verification", () => {
    const text = providerText();
    const parsed = parseProviderCandidate(text);
    const { claimStart: _claimStart, claimEnd: _claimEnd, ...candidate } = parsed;
    void _claimStart;
    void _claimEnd;
    expect(bindProviderSource({
      text,
      citations: [],
      sources: [],
      webSearchCalls: [],
      webSearchInspections: [],
      providerMetadataStatus: "supported",
    }, candidate)).toEqual({
      provider: "openai",
      bindingType: "structured_output_url",
      url: sourceUrl,
    });
  });

  it("rejects an unsafe structured-output URL before direct verification", () => {
    const text = providerText();
    const parsed = parseProviderCandidate(text);
    const { claimStart: _claimStart, claimEnd: _claimEnd, ...withoutOffsets } = parsed;
    void _claimStart;
    void _claimEnd;
    const candidate = {
      ...withoutOffsets,
      structuredUrl: "http://127.0.0.1/private",
    };
    expectPipelineCode(
      () => bindProviderSource({
        text,
        citations: [],
        sources: [],
        providerMetadataStatus: "supported",
      }, candidate),
      "source_url_rejected",
    );
  });
});

describe("M5-R3 action-aware Web Search accounting", () => {
  it("pins the public Web Search adapter contract to @ai-sdk/openai 4.0.47", () => {
    const installed = JSON.parse(
      readFileSync(
        join(process.cwd(), "node_modules", "@ai-sdk", "openai", "package.json"),
        "utf8",
      ),
    ) as { readonly version?: unknown };
    expect(installed.version).toBe("4.0.47");
  });

  it.each([
    ["search only", [webSearchToolResult("search-1", "search")], 1, 0, 1],
    [
      "search plus open_page",
      [
        webSearchToolResult("search-1", "search"),
        webSearchToolResult("inspect-1", "openPage"),
      ],
      1,
      1,
      2,
    ],
    [
      "search plus find_in_page",
      [
        webSearchToolResult("search-1", "search"),
        webSearchToolResult("inspect-1", "findInPage"),
      ],
      1,
      1,
      2,
    ],
  ] as const)("accepts %s", (_case, results, queries, inspections, actions) => {
    const normalized = normalizeWebSearchActions({ results });
    expect(normalized).toMatchObject({
      webSearchActionPolicyStatus: "supported",
      webSearchActionPolicyCode: null,
      webSearchQueryCount: queries,
      webSearchInspectionCount: inspections,
      webSearchActionCount: actions,
      webSearchUniqueCallCount: actions,
    });
  });

  it.each([
    ["open_page", "openPage"],
    ["find_in_page", "findInPage"],
  ] as const)(
    "keeps the %s URL exposed by the installed public adapter type",
    (expectedActionType, publicActionType) => {
      const publicToolResult: OpenAIWebSearchToolResult =
        webSearchToolResult("inspect-1", publicActionType, {
          inspectionUrl: sourceUrl,
          sourceUrls: null,
        });
      const normalized = normalizeWebSearchActions({
        results: [
          webSearchToolResult("search-1", "search", { sourceUrls: null }),
          publicToolResult,
        ],
      });
      expect(normalized.webSearchInspections).toEqual([{
        toolCallId: "inspect-1",
        actionType: expectedActionType,
        urlStatus: "present",
        url: sourceUrl,
      }]);
    },
  );

  it("accepts several distinct searches within the four-action budget", () => {
    const normalized = normalizeWebSearchActions({
      results: [
        webSearchToolResult("search-1", "search"),
        webSearchToolResult("search-2", "search"),
      ],
    });
    expect(normalized).toMatchObject({
      webSearchActionPolicyStatus: "supported",
      webSearchActionPolicyCode: null,
      webSearchQueryCount: 2,
      webSearchActionCount: 2,
    });
  });

  it.each([
    [
      "two inspections",
      [
        webSearchToolResult("search-1", "search"),
        webSearchToolResult("inspect-1", "openPage"),
        webSearchToolResult("inspect-2", "findInPage"),
      ],
    ],
    ["inspection without search", [webSearchToolResult("inspect-1", "openPage")]],
  ] as const)("classifies %s", (_case, results) => {
    expect(normalizeWebSearchActions({ results })).toMatchObject({
      webSearchActionPolicyStatus:
        _case === "two inspections" ? "supported" : "rejected",
      webSearchActionPolicyCode:
        _case === "two inspections"
          ? null
          : "web_search_action_invalid",
    });
  });

  it("rejects more than eight observed actions", () => {
    const normalized = normalizeWebSearchActions({
      results: [
        webSearchToolResult("search-1", "search"),
        webSearchToolResult("search-2", "search"),
        webSearchToolResult("search-3", "search"),
        webSearchToolResult("search-4", "search"),
        webSearchToolResult("search-5", "search"),
        webSearchToolResult("search-6", "search"),
        webSearchToolResult("search-7", "search"),
        webSearchToolResult("search-8", "search"),
        webSearchToolResult("search-9", "search"),
      ],
    });
    expect(normalized).toMatchObject({
      webSearchActionPolicyStatus: "rejected",
      webSearchActionPolicyCode: "web_search_action_invalid",
      webSearchActionCount: 9,
    });
  });

  it("rejects an unknown action and an absent identifier", () => {
    const unknown: OpenAIWebSearchToolResult = {
      toolName: "web_search",
      toolCallId: "unknown-1",
      output: {
        action: { type: "unknown" },
      } as unknown as OpenAIWebSearchToolResult["output"],
    };
    expect(normalizeWebSearchActions({ results: [unknown] })).toMatchObject({
      webSearchActionPolicyStatus: "rejected",
      webSearchActionPolicyCode: "web_search_action_invalid",
    });
    const missingId = {
      toolName: "web_search",
      output: { action: { type: "search" }, sources: [] },
    } as unknown as OpenAIWebSearchToolResult;
    expect(normalizeWebSearchActions({ results: [missingId], callIds: [] })).toMatchObject({
      webSearchActionPolicyStatus: "rejected",
      webSearchActionPolicyCode: "web_search_action_invalid",
    });
  });

  it("deduplicates the same public ID/action across result views", () => {
    const search = webSearchToolResult("search-1", "search");
    expect(
      normalizeWebSearchActions({ results: [search], duplicateResults: [search] }),
    ).toMatchObject({
      webSearchActionPolicyStatus: "supported",
      webSearchActionCount: 1,
      webSearchQueryCount: 1,
      webSearchUniqueCallCount: 1,
    });
  });

  it("retains only the normalized query needed for private diagnostics", () => {
    const normalized = normalizeWebSearchActions({
      results: [
        webSearchToolResult("search-1", "search"),
        webSearchToolResult("inspect-1", "findInPage"),
      ],
    });
    expect(normalized.webSearchActions).toEqual([
      { toolCallId: "search-1", actionType: "search", queries: ["SYNTHETIC_QUERY_NOT_RETAINED"] },
      { toolCallId: "inspect-1", actionType: "find_in_page" },
    ]);
    const actions = JSON.stringify(normalized.webSearchActions);
    expect(actions).toContain("SYNTHETIC_QUERY_NOT_RETAINED");
    expect(actions).not.toContain("SYNTHETIC_PATTERN_NOT_RETAINED");
    expect(actions).not.toContain("https://");
    expect(actions).not.toContain("output");
  });

  it("rejects contradictory actions attached to the same identifier", () => {
    expect(
      normalizeWebSearchActions({
        results: [webSearchToolResult("shared-1", "search")],
        duplicateResults: [webSearchToolResult("shared-1", "openPage")],
      }),
    ).toMatchObject({
      webSearchActionPolicyStatus: "rejected",
      webSearchActionPolicyCode: "inspection_url_ambiguous",
      webSearchActionCount: 2,
      webSearchUniqueCallCount: 1,
    });
  });

  it("binds sources only from the unique search action", () => {
    const text = providerText();
    const normalized = normalizeWebSearchActions({
      results: [
        webSearchToolResult("search-1", "search", { sourceUrls: [sourceUrl] }),
        webSearchToolResult("inspect-1", "openPage", {
          sourceUrls: ["https://ignored.public.org/inspection"],
        }),
      ],
    });
    expect(
      bindProviderSource(
        { text, ...normalized, providerMetadataStatus: normalized.status },
        parseProviderCandidate(text),
      ),
    ).toEqual({
      provider: "openai",
      bindingType: "web_search_source",
      url: sourceUrl,
      toolCallId: "search-1",
    });
  });
});

describe("G3-R3 inspection action URL binding", () => {
  it.each([
    ["open_page", "openPage"],
    ["find_in_page", "findInPage"],
  ] as const)(
    "binds one search plus one %s directly to its public typed URL",
    (expectedActionType, publicActionType) => {
      const result = inspectionFallbackResult(publicActionType);
      expect(bindProviderSource(result, parseProviderCandidate(result.text))).toEqual({
        provider: "openai",
        bindingType: "inspection_action_url",
        url: sourceUrl,
        toolCallId: "inspect-1",
        actionType: expectedActionType,
      });
      expect(result).toMatchObject({
        webSearchQueryCount: 1,
        webSearchInspectionCount: 1,
        webSearchActionCount: 2,
        webSearchUniqueCallCount: 2,
        toolCalls: 2,
      });
    },
  );

  it("retains the inspected representation while matching the textual URL canonically", () => {
    const inspectedUrl =
      "https://RESEARCH.PUBLIC.ORG./airbus?utm_source=synthetic#fragment";
    const result = inspectionFallbackResult("openPage", {
      inspectionUrl: inspectedUrl,
    });
    expect(bindProviderSource(result, parseProviderCandidate(result.text))).toMatchObject({
      bindingType: "inspection_action_url",
      url: inspectedUrl,
    });
  });

  it("preserves url_citation priority over an unusable inspection URL", () => {
    const result = providerResult({
      webSearchActions: [
        { toolCallId: "search-1", actionType: "search" },
        { toolCallId: "inspect-1", actionType: "open_page" },
      ],
      webSearchInspections: [{
        toolCallId: "inspect-1",
        actionType: "open_page",
        urlStatus: "invalid",
      }],
      webSearchActionCount: 2,
      webSearchQueryCount: 1,
      webSearchInspectionCount: 1,
      webSearchUniqueCallCount: 2,
      toolCalls: 2,
    });
    expect(bindProviderSource(result, parseProviderCandidate(result.text))).toMatchObject({
      metadataType: "url_citation",
      url: sourceUrl,
    });
  });

  it("preserves web_search_source priority over a contradictory inspection URL", () => {
    const metadata = normalizeWebSearchActions({
      results: [
        webSearchToolResult("search-1", "search", { sourceUrls: [sourceUrl] }),
        webSearchToolResult("inspect-1", "findInPage", {
          inspectionUrl: "https://other.public.org/document",
          sourceUrls: null,
        }),
      ],
    });
    const result = providerResultFromActionMetadata(metadata, {
      citations: [],
      sources: [],
    });
    expect(bindProviderSource(result, parseProviderCandidate(result.text))).toEqual({
      provider: "openai",
      bindingType: "web_search_source",
      url: sourceUrl,
      toolCallId: "search-1",
    });
  });

  it.each([
    ["open_page", "openPage"],
    ["find_in_page", "findInPage"],
  ] as const)(
    "fetches HTML and verifies title, excerpt and 1/1/2 counters for %s",
    async (_expectedActionType, publicActionType) => {
      const source = realSyntheticVerifier(
        `<html><head><title>  Airbus&nbsp;&amp; Space  </title></head><body><p>${claim}</p></body></html>`,
      );
      const events = await runPipeline({
        result: inspectionFallbackResult(publicActionType),
        verifier: source.verifier,
      });
      expect(events.map(({ state }) => state)).toEqual([
        "accepted",
        "researching_and_resolving",
        "source_verifying",
        "building",
        "validating",
        "completed",
      ]);
      const completed = events.at(-1);
      if (completed?.state !== "completed") {
        throw new Error("inspection fallback completion missing");
      }
      expect(completed.dossier.sources[0]).toMatchObject({
        provider_url: sourceUrl,
        resolved_url: sourceUrl,
        title: "Airbus & Space",
      });
      expect(completed.dossier.evidence[0]?.excerpt).toBe(claim);
      expect(completed.receipt).toMatchObject({
        toolCalls: 2,
        webSearchQueryCount: 1,
        webSearchInspectionCount: 1,
        sourceCount: 1,
      });
      expect(completed.receipt.sourceFetchCount).toBeGreaterThanOrEqual(1);
      expect(source.transport.requests.length).toBeGreaterThanOrEqual(1);
      expect(source.transport.requests.length).toBeLessThanOrEqual(2);
    },
  );

  it.each([
    [
      "inspection metadata absent",
      () => ({
        ...inspectionFallbackResult("openPage"),
        webSearchInspections: [],
      }),
      "inspection_url_missing",
    ],
    [
      "inspection URL omitted",
      () => inspectionFallbackResult("openPage", { omitInspectionUrl: true }),
      "inspection_url_missing",
    ],
    [
      "inspection URL null",
      () => inspectionFallbackResult("findInPage", { inspectionUrl: null }),
      "inspection_url_missing",
    ],
    [
      "inspection URL non-HTTPS",
      () => inspectionFallbackResult("openPage", {
        inspectionUrl: "http://research.public.org/airbus",
      }),
      "inspection_url_invalid",
    ],
    [
      "inspection URL with userinfo",
      () => inspectionFallbackResult("findInPage", {
        inspectionUrl: "https://user:password@research.public.org/airbus",
      }),
      "inspection_url_invalid",
    ],
    [
      "textual URL contradiction",
      () => inspectionFallbackResult("openPage", {
        text: providerText({ url: "https://other.public.org/document" }),
      }),
      "inspection_url_mismatch",
    ],
    [
      "competing inspection output URL",
      () => inspectionFallbackResult("openPage", {
        inspectionSourceUrls: ["https://other.public.org/document"],
      }),
      "inspection_url_ambiguous",
    ],
    [
      "contradictory duplicate inspection URL",
      () => inspectionFallbackResult("findInPage", {
        duplicateResults: [
          webSearchToolResult("inspect-1", "findInPage", {
            inspectionUrl: "https://other.public.org/document",
            sourceUrls: null,
          }),
        ],
      }),
      "inspection_url_ambiguous",
    ],
  ] as const)("rejects %s fail-closed", (_case, makeResult, code) => {
    const result = makeResult();
    expectPipelineCode(
      () => bindProviderSource(result, parseProviderCandidate(result.text)),
      code,
    );
  });

  it.each([
    [
      "two open_page inspections",
      [
        webSearchToolResult("search-1", "search", { sourceUrls: null }),
        webSearchToolResult("inspect-1", "openPage", {
          inspectionUrl: sourceUrl,
          sourceUrls: null,
        }),
        webSearchToolResult("inspect-2", "openPage", {
          inspectionUrl: sourceUrl,
          sourceUrls: null,
        }),
      ],
    ],
    [
      "concurrent open_page and find_in_page",
      [
        webSearchToolResult("search-1", "search", { sourceUrls: null }),
        webSearchToolResult("inspect-1", "openPage", {
          inspectionUrl: sourceUrl,
          sourceUrls: null,
        }),
        webSearchToolResult("inspect-2", "findInPage", {
          inspectionUrl: sourceUrl,
          sourceUrls: null,
        }),
      ],
    ],
  ] as const)("allows bounded %s accounting and retains attributable provider evidence", async (_case, results) => {
    const metadata = normalizeWebSearchActions({ results });
    let verificationCalls = 0;
    const events = await runPipeline({
      result: providerResultFromActionMetadata(metadata, {
        citations: [],
        sources: [],
      }),
      verifier: {
        async verify() {
          verificationCalls += 1;
          throw new Error("synthetic unavailable proof");
        },
      },
    });
    expect(events.map(({ state }) => state)).toEqual([
      "accepted",
      "researching_and_resolving",
      "source_verifying",
      "building",
      "validating",
      "completed",
    ]);
    expect(events.at(-1)).toMatchObject({
      state: "completed",
      dossier: {
        global_status: "insufficient_evidence",
        claims: expect.arrayContaining([expect.objectContaining({ predicate: "identity.proof" })]),
      },
      receipt: {
        webSearchQueryCount: 1,
        webSearchInspectionCount: 2,
      },
    });
    expect(verificationCalls).toBeGreaterThan(0);
  });

  it("rejects search alone as inspection_url_missing", () => {
    const metadata = normalizeWebSearchActions({
      results: [webSearchToolResult("search-1", "search", { sourceUrls: null })],
    });
    const result = providerResultFromActionMetadata(metadata, {
      citations: [],
      sources: [],
    });
    expectPipelineCode(
      () => bindProviderSource(result, parseProviderCandidate(result.text)),
      "inspection_url_missing",
    );
  });

  it.each([
    [
      "source fetch",
      syntheticResponse(503, { "content-type": "text/html" }),
      "source_http_error",
    ],
    [
      "invalid excerpt",
      okHtml("<html><head><title>Airbus</title></head><body><p>Different text.</p></body></html>"),
      "source_excerpt_missing",
    ],
  ] as const)("retains provider-grounded identity without retry after %s rejection", async (
    _case,
    response,
    expectedCode,
  ) => {
    const transport = new SyntheticTransport([response]);
    const verifier = createSourceVerifier({
      resolver: new SyntheticResolver(),
      transport,
      now: () => retrievedAt,
    });
    const events = await runPipeline({
      result: inspectionFallbackResult("openPage"),
      verifier,
    });
    expect(events.map(({ state }) => state)).toEqual([
      "accepted",
      "researching_and_resolving",
      "source_verifying",
      "building",
      "validating",
      "completed",
    ]);
    expect(events.filter(({ state }) => state === "completed")).toHaveLength(1);
    expect(events.some(({ state }) => state === "failed")).toBe(false);
    expect(transport.requests.length).toBeGreaterThanOrEqual(1);
    expect(transport.requests.length).toBeLessThanOrEqual(2);
    expect(events.at(-1)).toMatchObject({
      state: "completed",
      dossier: {
        global_status: "insufficient_evidence",
        result_mode: "silence",
        claims: expect.arrayContaining([expect.objectContaining({ predicate: "identity.proof" })]),
      },
      receipt: {
        webSearchQueryCount: 1,
        webSearchInspectionCount: 1,
      },
    });
    expect(JSON.stringify(events)).not.toContain(expectedCode);
  });

  it("rejects inconsistent legacy inspection metadata without exposing private values", () => {
    const rawUrl = "https://user:password@private.invalid/secret";
    const rawToolCallId = "PRIVATE_INSPECTION_TOOL_CALL_ID";
    const baseResult = inspectionFallbackResult("openPage", {
      inspectionUrl: rawUrl,
    });
    const result: ProviderResearchResult = {
      ...baseResult,
      webSearchActions: [
        { toolCallId: "search-1", actionType: "search" },
        { toolCallId: rawToolCallId, actionType: "open_page" },
      ],
    };
    expectPipelineCode(
      () => bindProviderSource(result, parseProviderCandidate(result.text)),
      "inspection_url_ambiguous",
    );
    let exposedMessage = "";
    try {
      bindProviderSource(result, parseProviderCandidate(result.text));
    } catch (error) {
      exposedMessage = error instanceof Error ? error.message : String(error);
    }
    for (const forbidden of [
      rawUrl,
      "user:password",
      "private.invalid",
      rawToolCallId,
      "SYNTHETIC_QUERY_NOT_RETAINED",
      "SYNTHETIC_PATTERN_NOT_RETAINED",
      claim,
      "stack",
    ]) {
      expect(exposedMessage).not.toContain(forbidden);
    }
  });
});

describe("M5-R3 verified document title binding", () => {
  function webSearchResult(options: {
    readonly sourceUrls?: readonly string[] | null;
    readonly webSearchCalls?: number;
  } = {}): ProviderResearchResult {
    const callCount = options.webSearchCalls ?? 1;
    return providerResult({
      citations: [],
      sources: [],
      webSearchCalls: Array.from({ length: callCount }, (_, index) => ({
        toolCallId: `tool-web-${index}`,
        sources:
          options.sourceUrls === null
            ? null
            : (options.sourceUrls ?? [sourceUrl]).map((url) => ({ url })),
      })),
      webSearchActions: Array.from({ length: callCount }, (_, index) => ({
        toolCallId: `tool-web-${index}`,
        actionType: "search" as const,
      })),
      webSearchActionCount: callCount,
      webSearchQueryCount: callCount,
      webSearchInspectionCount: 0,
      webSearchUniqueCallCount: callCount,
      webSearchActionPolicyStatus: callCount === 1 ? "supported" : "rejected",
      webSearchActionPolicyCode:
        callCount === 1 ? null : "web_search_not_unique",
      toolCalls: callCount,
    });
  }

  function webSearchBinding(result = webSearchResult()) {
    return bindProviderSource(result, parseProviderCandidate(result.text));
  }

  function verifierFor(response: SourceTransportResponse) {
    const transport = new SyntheticTransport([response]);
    return {
      transport,
      verifier: createSourceVerifier({
        resolver: new SyntheticResolver(),
        transport,
        now: () => retrievedAt,
      }),
    };
  }

  it("normalizes only public URL sources from the matching tool result", () => {
    const text = providerText();
    const normalized = normalizeOpenAIProviderMetadata({
      generatedText: text,
      content: [{
        type: "text",
        text,
        providerMetadata: { openai: { itemId: "item-web", annotations: [] } },
      }],
      sources: [],
      toolCalls: [{ toolName: "web_search", toolCallId: "tool-web" }],
      toolResults: [{
        toolName: "web_search",
        toolCallId: "tool-web",
        output: {
          action: { type: "search", queries: ["synthetic"] },
          sources: [
            { type: "api", name: "ignored-public-api-source" },
            { type: "url", url: sourceUrl },
          ],
        },
      }],
    });
    expect(normalized).toMatchObject({
      status: "supported",
      citations: [],
      webSearchCalls: [{
        toolCallId: "tool-web",
        sources: [{ url: sourceUrl }],
      }],
    });
  });

  it("preserves url_citation priority and real provider fields", () => {
    const text = providerText();
    const metadata = normalizedMetadata({ text });
    const binding = bindProviderSource(
      {
        text,
        ...metadata,
        webSearchCalls: [
          {
            toolCallId: "tool-a",
            sources: [{ url: "https://other.public.org/a" }],
          },
          {
            toolCallId: "tool-b",
            sources: [{ url: sourceUrl }],
          },
        ],
        providerMetadataStatus: metadata.status,
      },
      parseProviderCandidate(text),
    );
    expect(binding).toMatchObject({
      metadataType: "url_citation",
      title: "Synthetic source",
      generatedTextStart: text.indexOf(claim),
      generatedTextEnd: text.indexOf(claim) + claim.length,
      textPartId: "item-synthetic",
    });
  });

  it("rejects an invalid annotation without Web Search fallback", () => {
    const text = providerText();
    const metadata = normalizedMetadata({ text, start: -1, end: text.length + 1 });
    expectPipelineCode(
      () =>
        bindProviderSource(
          { text, ...metadata, providerMetadataStatus: metadata.status },
          parseProviderCandidate(text),
        ),
      "provider_citation_unbound",
    );
  });

  it("creates no false citation fields for a unique Web Search URL", () => {
    expect(webSearchBinding()).toEqual({
      provider: "openai",
      bindingType: "web_search_source",
      url: sourceUrl,
      toolCallId: "tool-web-0",
    });
  });

  it.each([
    ["missing URL", webSearchResult({ sourceUrls: [] }), "inspection_url_missing"],
    [
      "different URL",
      webSearchResult({ sourceUrls: ["https://other.public.org/source"] }),
      "source_metadata_missing",
    ],
    [
      "duplicated URL",
      webSearchResult({ sourceUrls: [sourceUrl, sourceUrl] }),
      "source_metadata_missing",
    ],
    ["multiple calls", webSearchResult({ webSearchCalls: 2 }), "web_search_not_unique"],
  ])("rejects %s before fetch", (_case, result, code) => {
    expectPipelineCode(
      () => bindProviderSource(result, parseProviderCandidate(result.text)),
      code,
    );
  });

  it("completes with one fetched HTML title and exact excerpt", async () => {
    const source = realSyntheticVerifier(
      `<html><head><title>  Airbus&nbsp;&amp;\n  Space  </title></head><body><p>${claim}</p></body></html>`,
    );
    const events = await runPipeline({
      result: webSearchResult(),
      verifier: source.verifier,
    });
    expect(events.map(({ state }) => state)).toEqual([
      "accepted",
      "researching_and_resolving",
      "source_verifying",
      "building",
      "validating",
      "completed",
    ]);
    const completed = events.at(-1);
    if (completed?.state !== "completed") throw new Error("fallback completion missing");
    expect(completed.dossier.sources[0]).toMatchObject({
      provider_url: sourceUrl,
      resolved_url: sourceUrl,
      title: "Airbus & Space",
    });
    expect(completed.dossier.evidence[0]?.excerpt).toBe(claim);
    expect(completed.receipt.sourceCount).toBe(1);
    expect(completed.receipt.sourceFetchCount).toBe(1);
    expect(completed.receipt.excerptVerificationCount).toBe(2);
    expect(completed.dossier.claims[0]?.presentation_reason).toContain(
      "extrait exact retrouvé",
    );
    expect(validateResearchDossier(completed.dossier)).toMatchObject({ ok: true });
    expect(source.transport.requests).toHaveLength(1);
  });

  it.each([
    ["absent", `<html><head></head><body><p>${claim}</p></body></html>`],
    ["empty", `<html><head><title> \n </title></head><body><p>${claim}</p></body></html>`],
    [
      "multiple",
      `<html><head><title>One</title><title>Two</title></head><body><p>${claim}</p></body></html>`,
    ],
    [
      "body and SVG only",
      `<html><head></head><body><title>Body</title><svg><title>SVG</title></svg><p>${claim}</p></body></html>`,
    ],
    [
      "control",
      `<html><head><title>Bad\u0001Title</title></head><body><p>${claim}</p></body></html>`,
    ],
    [
      "over 300 Unicode characters",
      `<html><head><title>${"A".repeat(301)}</title></head><body><p>${claim}</p></body></html>`,
    ],
  ])("rejects an HTML title that is %s after one request", async (_case, body) => {
    const source = verifierFor(okHtml(body));
    await expectPipelineCodeAsync(
      () =>
        source.verifier.verify({
          candidate: parseProviderCandidate(providerText()),
          citation: webSearchBinding(),
          signal: new AbortController().signal,
        }),
      "source_metadata_missing",
    );
    expect(source.transport.requests.length).toBeGreaterThanOrEqual(1);
    expect(source.transport.requests.length).toBeLessThanOrEqual(2);
  });

  it("rejects text/plain without a provider title after one request", async () => {
    const source = verifierFor(okText());
    await expectPipelineCodeAsync(
      () =>
        source.verifier.verify({
          candidate: parseProviderCandidate(providerText()),
          citation: webSearchBinding(),
          signal: new AbortController().signal,
        }),
      "source_metadata_missing",
    );
    expect(source.transport.requests).toHaveLength(1);
  });

  it("rejects text/plain even when a provider citation supplies a title", async () => {
    const source = verifierFor(okText());
    const citation = providerResult().citations[0];
    if (citation === undefined) throw new Error("synthetic citation missing");
    await expectPipelineCodeAsync(
      () => source.verifier.verify({
        candidate: parseProviderCandidate(providerText()),
        citation,
        signal: new AbortController().signal,
      }),
      "source_metadata_missing",
    );
    expect(source.transport.requests).toHaveLength(1);
  });

  it("retains provider-grounded identity when direct title validation fails", async () => {
    const source = realSyntheticVerifier(
      `<html><head></head><body><p>${claim}</p></body></html>`,
    );
    const events = await runPipeline({
      result: webSearchResult(),
      verifier: source.verifier,
    });
    expect(events.map(({ state }) => state)).toEqual([
      "accepted",
      "researching_and_resolving",
      "source_verifying",
      "building",
      "validating",
      "completed",
    ]);
    expect(events.filter(({ state }) => state === "completed")).toHaveLength(1);
    expect(events.some(({ state }) => state === "failed")).toBe(false);
    expect(events.at(-1)).toMatchObject({
      state: "completed",
      dossier: {
        global_status: "insufficient_evidence",
        result_mode: "silence",
        claims: expect.arrayContaining([expect.objectContaining({ predicate: "identity.proof" })]),
      },
    });
    expect(source.transport.requests.length).toBeGreaterThanOrEqual(1);
    expect(source.transport.requests.length).toBeLessThanOrEqual(2);
  });
});

describe("M5-R2B URL and SSRF policy", () => {
  it("[11] accepts a standard public HTTPS URL", () => {
    expect(validateSourceUrl(sourceUrl, "citation").safeHref).toBe(sourceUrl);
  });

  it("[11a] canonicalizes hostname case and one trailing DNS dot", () => {
    const canonical = validateSourceUrl(
      "https://EXAMPLE.ORG./page?keep=1#fragment",
      "citation",
    );
    expect(canonical.url.hostname).toBe("example.org");
    expect(canonical.safeHref).toBe("https://example.org/page?keep=1");
  });

  it("[11b] rejects more than one trailing DNS dot", () => {
    expectPipelineCode(
      () => validateSourceUrl("https://example.org../page", "citation"),
      "source_url_rejected",
    );
  });

  it("[12] rejects HTTP and other schemes", () => {
    for (const url of ["http://public.org/", "ftp://public.org/", "file:///tmp/x", "data:text/plain,x", "javascript:alert(1)"]) {
      expectPipelineCode(() => validateSourceUrl(url, "citation"), "source_url_rejected");
    }
  });

  it("[13] rejects URL credentials", () => {
    expectPipelineCode(() => validateSourceUrl("https://user:pass@public.org/", "citation"), "source_url_rejected");
  });

  it("[14] rejects non-443 ports", () => {
    expectPipelineCode(() => validateSourceUrl("https://public.org:8443/", "citation"), "source_url_rejected");
  });

  it("[15] rejects literal and atypically encoded IP hosts", () => {
    for (const url of ["https://127.0.0.1/", "https://[::1]/", "https://2130706433/", "https://0x7f000001/"]) {
      expectPipelineCode(() => validateSourceUrl(url, "citation"), "source_url_rejected");
    }
  });

  it("[16] rejects localhost, internal suffixes and dotless names", () => {
    for (const host of ["localhost", "host", "a.local", "a.internal", "a.home", "a.lan", "a.test", "a.invalid", "a.example"]) {
      expectPipelineCode(() => validateSourceUrl(`https://${host}/`, "citation"), "source_url_rejected");
    }
  });

  it("[17] rejects normalized, segmented and encoded sensitive query names safely", () => {
    for (const query of [
      `token=${sensitiveMarker}`,
      `access_token=${sensitiveMarker}`,
      `ACCESS_TOKEN=${sensitiveMarker}`,
      `access-token=${sensitiveMarker}`,
      `accessToken=${sensitiveMarker}`,
      `accesstoken=${sensitiveMarker}`,
      `api_key=${sensitiveMarker}`,
      `key=${sensitiveMarker}`,
      `auth=${sensitiveMarker}`,
      `authorization=${sensitiveMarker}`,
      `signature=${sensitiveMarker}`,
      `sig=${sensitiveMarker}`,
      "expires=123",
      `credential=${sensitiveMarker}`,
      `password=${sensitiveMarker}`,
      `client_secret=${sensitiveMarker}`,
      `clientSecret=${sensitiveMarker}`,
      `client-secret-value=${sensitiveMarker}`,
      `secret=${sensitiveMarker}`,
      `session=${sensitiveMarker}`,
      `session_id=${sensitiveMarker}`,
      `jwt=${sensitiveMarker}`,
      `bearer=${sensitiveMarker}`,
      `id_token=${sensitiveMarker}`,
      `refresh_token=${sensitiveMarker}`,
      `X-Amz-Credential=${sensitiveMarker}`,
      `x-amz-signature=${sensitiveMarker}`,
      `oauth_token=${sensitiveMarker}`,
      `user.session=${sensitiveMarker}`,
      `client secret=${sensitiveMarker}`,
      `ａｃｃｅｓｓ‐ｔｏｋｅｎ=${sensitiveMarker}`,
      `%74oken=${sensitiveMarker}`,
      `%2574oken=${sensitiveMarker}`,
      `%252574oken=${sensitiveMarker}`,
      `client%255Fsecret=${sensitiveMarker}`,
      `page=1&token=${sensitiveMarker}&token=${sensitiveMarker}`,
      `utm_source=test&token=${sensitiveMarker}`,
    ]) {
      expectSafeQueryRejection(`${sourceUrl}?${query}`);
    }
  });

  it("[17a] rejects malformed or still-encoded query names after four additional passes", () => {
    expectSafeQueryRejection(`${sourceUrl}?%25ZZ=${sensitiveMarker}`);
    expectSafeQueryRejection(
      `${sourceUrl}?${percentEncode("%70age", 5)}=${sensitiveMarker}`,
    );
  });

  it("[17b] accepts benign names and values without substring false positives", () => {
    for (const query of [
      "q=token",
      "page=1",
      "lang=fr",
      "monkey=value",
      "hockey=value",
      "keyboard=value",
      `${percentEncode("%70age", 4)}=1`,
    ]) {
      expect(validateSourceUrl(`${sourceUrl}?${query}`, "citation").safeHref).toBe(
        `${sourceUrl}?${query}`,
      );
    }
  });

  it("[17c] rejects before DNS resolution or source transport", async () => {
    const resolver = new SyntheticResolver();
    const transport = new SyntheticTransport([okHtml()]);
    await expectPipelineCodeAsync(
      () =>
        fetchedWith({
          url: `${sourceUrl}?utm_source=test&token=${sensitiveMarker}`,
          resolver,
          transport,
        }),
      "source_url_rejected",
    );
    expect(resolver.calls).toEqual([]);
    expect(transport.requests).toEqual([]);
  });

  it("[18] removes fragments and declared tracking parameters only", () => {
    const result = validateSourceUrl(`${sourceUrl}?keep=1&utm_source=x&gclid=y&fbclid=z#fragment`, "citation");
    expect(result.safeHref).toBe(`${sourceUrl}?keep=1`);
    expect(result.removedTrackingParameterCount).toBe(3);
  });

  it("[19] rejects principal private and reserved IPv4 ranges", () => {
    for (const address of ["0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.1.1", "172.16.0.1", "192.168.1.1", "192.0.2.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255"]) {
      expect(isPublicDnsAddress({ address, family: 4 }), address).toBe(false);
    }
  });

  it("[20] rejects principal private and reserved IPv6 ranges", () => {
    for (const address of [
      "::",
      "::1",
      "fe00::1",
      "4000::1",
      "100:0:0:1::1",
      "::ffff:0:127.0.0.1",
      "2001:100::1",
      "2001:30::1",
      "2001:2::1",
      "2001:20::1",
      "2001:db8::1",
      "2002:7f00:1::1",
      "fc00::1",
      "fe80::1",
      "ff02::1",
      "3fff::1",
    ]) {
      expect(isPublicDnsAddress({ address, family: 6 }), address).toBe(false);
    }
  });

  it("[20a] accepts explicitly admissible global unicast IPv6 addresses", () => {
    for (const address of [
      "2606:4700:4700::1111",
      "2001:4860:4860::8888",
      "2a00:1450:4007:80d::200e",
    ]) {
      expect(isPublicDnsAddress({ address, family: 6 }), address).toBe(true);
    }
  });

  it("[21] rejects IPv4-mapped IPv6", () => {
    expect(isPublicDnsAddress({ address: "::ffff:192.168.1.1", family: 6 })).toBe(false);
  });

  it("[22] rejects mixed public and private DNS answers", async () => {
    for (const answers of [
      [publicAddress, { address: "10.0.0.1", family: 4 } as const],
      [publicAddress, { address: "fe00::1", family: 6 } as const],
      [
        { address: "2606:4700:4700::1111", family: 6 } as const,
        { address: "fe00::1", family: 6 } as const,
      ],
    ]) {
      await expectPipelineCodeAsync(
        () =>
          resolveAndPinPublicAddress(
            "source.public.org",
            new SyntheticResolver(answers),
          ),
        "source_dns_rejected",
      );
    }
  });

  it("[23] accepts all-public DNS answers deterministically", async () => {
    const selected = await resolveAndPinPublicAddress("source.public.org", new SyntheticResolver([
      { address: "2606:4700:4700::1111", family: 6 },
      { address: "8.8.8.8", family: 4 },
      publicAddress,
    ]));
    expect(selected).toEqual({ address: "8.8.8.8", family: 4 });
  });

  it("[23a] accepts only-public IPv6 answers deterministically", async () => {
    const selected = await resolveAndPinPublicAddress(
      "source.public.org",
      new SyntheticResolver([
        { address: "2a00:1450:4007:80d::200e", family: 6 },
        { address: "2606:4700:4700::1111", family: 6 },
        { address: "2001:4860:4860::8888", family: 6 },
      ]),
    );
    expect(selected).toEqual({ address: "2001:4860:4860::8888", family: 6 });
  });

  it("[23b] canonicalizes and deduplicates equivalent IPv6 answers", async () => {
    const compressed = { address: "2606:4700:4700::1111", family: 6 } as const;
    const expanded = {
      address: "2606:4700:4700:0:0:0:0:1111",
      family: 6,
    } as const;
    const selected = await Promise.all([
      resolveAndPinPublicAddress(
        "source.public.org",
        new SyntheticResolver([compressed, expanded]),
      ),
      resolveAndPinPublicAddress(
        "source.public.org",
        new SyntheticResolver([expanded, compressed]),
      ),
    ]);
    expect(selected).toEqual([compressed, compressed]);
  });

  it("[23c] keeps an empty DNS answer rejected", async () => {
    await expectPipelineCodeAsync(
      () =>
        resolveAndPinPublicAddress(
          "source.public.org",
          new SyntheticResolver([]),
        ),
      "source_dns_rejected",
    );
  });

  it("[24] returns only the pinned IPv4 or IPv6 address in scalar lookup mode", async () => {
    const addresses: readonly DnsAddress[] = [
      publicAddress,
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ];
    for (const address of addresses) {
      const lookup = buildPinnedHttpsRequestOptions({
        url: new URL(sourceUrl),
        address,
        timeoutMs: 1_000,
      }).lookup;
      if (lookup === undefined) throw new Error("PINNED_LOOKUP_MISSING");
      for (const lookupOptions of [{}, { all: false }] as const) {
        const answer = await new Promise<{ address: string; family: number }>(
          (resolve, reject) => {
            lookup(
              "research.public.org",
              lookupOptions,
              (error, addressOrAddresses, family) => {
                if (error) {
                  reject(error);
                  return;
                }
                if (
                  typeof addressOrAddresses !== "string" ||
                  (family !== 4 && family !== 6)
                ) {
                  reject(new Error("PINNED_LOOKUP_SCALAR_SHAPE_INVALID"));
                  return;
                }
                resolve({ address: addressOrAddresses, family });
              },
            );
          },
        );
        expect(answer).toEqual(address);
      }
    }
  });

  it("[24b] returns only the pinned IPv4 or IPv6 address when all is true", async () => {
    const addresses: readonly DnsAddress[] = [
      publicAddress,
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ];
    for (const address of addresses) {
      const lookup = buildPinnedHttpsRequestOptions({
        url: new URL(sourceUrl),
        address,
        timeoutMs: 1_000,
      }).lookup;
      if (lookup === undefined) throw new Error("PINNED_LOOKUP_MISSING");
      const answer = await new Promise<readonly { address: string; family: number }[]>(
        (resolve, reject) => {
          lookup(
            "research.public.org",
            { all: true },
            (error, addressOrAddresses) => {
              if (error) {
                reject(error);
                return;
              }
              if (!Array.isArray(addressOrAddresses)) {
                reject(new Error("PINNED_LOOKUP_ALL_SHAPE_INVALID"));
                return;
              }
              resolve(addressOrAddresses);
            },
          );
        },
      );
      expect(answer).toEqual([address]);
    }
  });

  it("[24c] rejects a hostname mismatch without returning a pinned candidate", async () => {
    const lookup = buildPinnedHttpsRequestOptions({
      url: new URL(sourceUrl),
      address: publicAddress,
      timeoutMs: 1_000,
    }).lookup;
    if (lookup === undefined) throw new Error("PINNED_LOOKUP_MISSING");
    const result = await new Promise<{
      readonly error: Error | null;
      readonly addresses: string | readonly { address: string; family: number }[];
    }>((resolve) => {
      lookup("other.public.org", { all: true }, (error, addressOrAddresses) => {
        resolve({ error, addresses: addressOrAddresses });
      });
    });
    expect(result.error?.message).toBe("PINNED_LOOKUP_HOSTNAME_MISMATCH");
    expect(result.addresses).toEqual([]);
  });

  it("[25] preserves original Host and TLS servername", () => {
    const options = buildPinnedHttpsRequestOptions({ url: new URL(sourceUrl), address: publicAddress, timeoutMs: 1_000 });
    expect(options.hostname).toBe("research.public.org");
    expect(options.servername).toBe("research.public.org");
    expect((options.headers as Record<string, string>).Host).toBe("research.public.org");
  });

  it("[25a] uses the canonical hostname for Host and TLS servername", () => {
    const canonical = validateSourceUrl(
      "https://RESEARCH.PUBLIC.ORG./airbus",
      "citation",
    );
    const options = buildPinnedHttpsRequestOptions({
      url: canonical.url,
      address: publicAddress,
      timeoutMs: 1_000,
    });
    expect(options.hostname).toBe("research.public.org");
    expect(options.servername).toBe("research.public.org");
    expect((options.headers as Record<string, string>).Host).toBe("research.public.org");
  });
});

describe("M5-R2B HTTPS transport", () => {
  it("[26] accepts a successful HTML response", async () => {
    await expect(fetchedWith({ transport: new SyntheticTransport([okHtml()]) })).resolves.toMatchObject({ mediaType: "text/html", requestCount: 1 });
  });

  it("[27] accepts a successful text/plain response", async () => {
    const transport = new SyntheticTransport([syntheticResponse(200, { "content-type": "text/plain" }, [bytes(claim)])]);
    await expect(fetchedWith({ transport })).resolves.toMatchObject({ mediaType: "text/plain", body: claim });
  });

  it("[28] revalidates a public redirect", async () => {
    const transport = new SyntheticTransport([
      syntheticResponse(302, { location: "https://final.public.org/document" }),
      okHtml(),
    ]);
    const result = await fetchedWith({ transport });
    expect(result).toMatchObject({ finalUrl: "https://final.public.org/document", redirectCount: 1, requestCount: 2 });
  });

  it("[28a] resolves and pins only the canonical hostname", async () => {
    const resolver = new SyntheticResolver();
    const transport = new SyntheticTransport([okHtml()]);
    await expect(
      fetchedWith({
        url: "https://RESEARCH.PUBLIC.ORG./airbus",
        resolver,
        transport,
      }),
    ).resolves.toMatchObject({ finalUrl: sourceUrl, requestCount: 1 });
    expect(resolver.calls).toEqual(["research.public.org"]);
    expect(transport.requests[0]?.url.hostname).toBe("research.public.org");
  });

  it("[29] rejects an HTTP redirect downgrade", async () => {
    await expectPipelineCodeAsync(
      () => fetchedWith({ transport: new SyntheticTransport([syntheticResponse(302, { location: "http://final.public.org/" })]) }),
      "source_redirect_rejected",
    );
  });

  it("[30] rejects a redirect resolving to a private address", async () => {
    const resolver = new SyntheticResolver({
      "research.public.org": [publicAddress],
      "private.public.org": [{ address: "10.0.0.1", family: 4 }],
    });
    await expectPipelineCodeAsync(
      () => fetchedWith({ resolver, transport: new SyntheticTransport([syntheticResponse(302, { location: "https://private.public.org/" })]) }),
      "source_redirect_rejected",
    );
  });

  it("[31] rejects a signed redirect", async () => {
    await expectPipelineCodeAsync(
      () => fetchedWith({ transport: new SyntheticTransport([syntheticResponse(302, { location: "https://final.public.org/?signature=secret" })]) }),
      "source_url_rejected",
    );
  });

  it("[32] rejects a redirect loop", async () => {
    const transport = new SyntheticTransport([syntheticResponse(302, { location: sourceUrl })]);
    await expectPipelineCodeAsync(() => fetchedWith({ transport }), "source_redirect_rejected");
    expect(transport.requests).toHaveLength(1);
  });

  it("[32a] rejects redirect loops differing only by hostname case or trailing dot", async () => {
    for (const location of [
      "https://RESEARCH.PUBLIC.ORG/airbus",
      "https://research.public.org./airbus",
    ]) {
      const resolver = new SyntheticResolver();
      const transport = new SyntheticTransport([
        syntheticResponse(302, { location }),
      ]);
      await expectPipelineCodeAsync(
        () => fetchedWith({ resolver, transport }),
        "source_redirect_rejected",
      );
      expect(resolver.calls).toEqual(["research.public.org"]);
      expect(transport.requests).toHaveLength(1);
    }
  });

  it("[33] rejects more than two redirects", async () => {
    const transport = new SyntheticTransport([
      syntheticResponse(302, { location: "https://one.public.org/" }),
      syntheticResponse(302, { location: "https://two.public.org/" }),
      syntheticResponse(302, { location: "https://three.public.org/" }),
    ]);
    await expectPipelineCodeAsync(() => fetchedWith({ transport }), "source_redirect_rejected");
    expect(transport.requests).toHaveLength(3);
  });

  it("[34] classifies a transport timeout", async () => {
    await expectPipelineCodeAsync(
      () => fetchedWith({ transport: new SyntheticTransport([new DOMException("Synthetic", "TimeoutError")]) }),
      "source_timeout",
    );
  });

  it("[35] classifies a transport error", async () => {
    await expectPipelineCodeAsync(
      () => fetchedWith({ transport: new SyntheticTransport([new Error("RAW_TRANSPORT")]) }),
      "source_transport_error",
    );
  });

  it("[36] rejects non-success HTTP statuses", async () => {
    await expectPipelineCodeAsync(
      () => fetchedWith({ transport: new SyntheticTransport([syntheticResponse(503, { "content-type": "text/html" })]) }),
      "source_http_error",
    );
  });

  it("[37] rejects oversized Content-Length before reading", async () => {
    const response = syntheticResponse(200, { "content-type": "text/html", "content-length": String(SOURCE_MAX_BYTES + 1) }, [bytes("unused")]);
    await expectPipelineCodeAsync(() => fetchedWith({ transport: new SyntheticTransport([response]) }), "source_body_too_large");
    expect(response.destroyed()).toBe(true);
  });

  it("[38] stops a stream exceeding 512 KiB", async () => {
    const response = syntheticResponse(200, { "content-type": "text/html" }, [new Uint8Array(SOURCE_MAX_BYTES), new Uint8Array(1)]);
    await expectPipelineCodeAsync(() => fetchedWith({ transport: new SyntheticTransport([response]) }), "source_body_too_large");
    expect(response.destroyed()).toBe(true);
  });

  it("[39] rejects absent and forbidden Content-Type values", async () => {
    for (const headers of [{}, { "content-type": "application/pdf" }, { "content-type": "application/json" }]) {
      await expectPipelineCodeAsync(
        () => fetchedWith({ transport: new SyntheticTransport([syntheticResponse(200, headers, [bytes("x")])]) }),
        "source_content_type_rejected",
      );
    }
  });

  it("[40] rejects unsupported charsets", async () => {
    await expectPipelineCodeAsync(
      () => fetchedWith({ transport: new SyntheticTransport([syntheticResponse(200, { "content-type": "text/html; charset=iso-8859-1" }, [bytes("x")])]) }),
      "source_charset_rejected",
    );
  });

  it("[41] rejects an empty body", async () => {
    await expectPipelineCodeAsync(
      () => fetchedWith({ transport: new SyntheticTransport([syntheticResponse(200, { "content-type": "text/html" }, [])]) }),
      "source_empty",
    );
  });

  it("[42] performs no automatic retry", async () => {
    const transport = new SyntheticTransport([new Error("Synthetic failure"), okHtml()]);
    await expectPipelineCodeAsync(() => fetchedWith({ transport }), "source_transport_error");
    expect(transport.requests).toHaveLength(1);
  });

  it("[43] respects the maximum of three HTTPS requests", async () => {
    const transport = new SyntheticTransport([
      syntheticResponse(302, { location: "https://one.public.org/" }),
      syntheticResponse(302, { location: "https://two.public.org/" }),
      okHtml(),
    ]);
    await expect(fetchedWith({ transport })).resolves.toMatchObject({ requestCount: 3, redirectCount: 2 });
    expect(transport.requests).toHaveLength(3);
  });
});

describe("M5-R2B total timeout semantics", () => {
  it("[T1] creates one owned, unrefed total timer", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    await expect(
      fetchedWith({ transport: new SyntheticTransport([okHtml()]) }),
    ).resolves.toMatchObject({ requestCount: 1 });
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    const timer = setTimeoutSpy.mock.results[0]?.value;
    expect(timer).toBeDefined();
    if (typeof timer === "object" && timer !== null && "hasRef" in timer) {
      expect((timer as { hasRef(): boolean }).hasRef()).toBe(false);
    }
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
  });

  it("[T2] creates the timer before invoking the resolver", async () => {
    vi.useFakeTimers();
    const timerCounts: number[] = [];
    const resolver: DnsResolver = {
      async resolve() {
        timerCounts.push(vi.getTimerCount());
        return [publicAddress];
      },
    };
    await fetchedWith({ resolver, transport: new SyntheticTransport([okHtml()]) });
    expect(timerCounts).toEqual([1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("[T3] times out when the resolver never settles", async () => {
    vi.useFakeTimers();
    const resolver: DnsResolver = {
      resolve: () => new Promise(() => undefined),
    };
    const result = expectPipelineCodeAsync(
      () => fetchedWith({ resolver, transport: new SyntheticTransport([]) }),
      "source_timeout",
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await result;
  });

  it("[T4] ignores a resolver result arriving after timeout", async () => {
    vi.useFakeTimers();
    const resolution = deferred<readonly DnsAddress[]>();
    const resolver: DnsResolver = { resolve: () => resolution.promise };
    const transport = new SyntheticTransport([okHtml()]);
    const result = expectPipelineCodeAsync(
      () => fetchedWith({ resolver, transport }),
      "source_timeout",
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await result;
    resolution.resolve([publicAddress]);
    await flushMicrotasks();
    expect(transport.requests).toEqual([]);
  });

  it("[T5] returns source_timeout before headers", async () => {
    vi.useFakeTimers();
    const transport = new PendingSourceTransport();
    const result = expectPipelineCodeAsync(
      () => fetchedWith({ transport }),
      "source_timeout",
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await result;
    expect(transport.requests).toHaveLength(1);
  });

  it("[T6] returns source_timeout after headers while the body is blocked", async () => {
    vi.useFakeTimers();
    const response = new ControlledSourceResponse();
    const result = expectPipelineCodeAsync(
      () => fetchedWith({ transport: new SyntheticTransport([response]) }),
      "source_timeout",
    );
    await flushMicrotasks();
    expect(response.nextCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    await result;
  });

  it("[T7] keeps the original deadline during a slow chunk stream", async () => {
    vi.useFakeTimers();
    const response = new ControlledSourceResponse();
    const result = expectPipelineCodeAsync(
      () => fetchedWith({ transport: new SyntheticTransport([response]) }),
      "source_timeout",
    );
    await flushMicrotasks();
    for (let elapsed = 200; elapsed <= 800; elapsed += 200) {
      await vi.advanceTimersByTimeAsync(200);
      response.push(bytes(String(elapsed)));
      await flushMicrotasks();
    }
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(200);
    await result;
    expect(response.destroyCalls).toBeGreaterThan(0);
  });

  it("[T8] preserves the initial budget after a redirect", async () => {
    vi.useFakeTimers();
    const secondResolution = deferred<readonly DnsAddress[]>();
    let resolverCalls = 0;
    const resolver: DnsResolver = {
      resolve() {
        resolverCalls += 1;
        return resolverCalls === 1
          ? Promise.resolve([publicAddress])
          : secondResolution.promise;
      },
    };
    const requests: PinnedSourceRequest[] = [];
    const transport: SourceTransport = {
      request(request) {
        requests.push(request);
        if (requests.length === 1) {
          return Promise.resolve(
            syntheticResponse(302, { location: "https://final.public.org/" }),
          );
        }
        return new Promise((_resolve, reject) => {
          request.signal.addEventListener(
            "abort",
            () => reject(new Error("SYNTHETIC_SECONDARY_REQUEST_ERROR")),
            { once: true },
          );
        });
      },
    };
    const result = expectPipelineCodeAsync(
      () => fetchedWith({ resolver, transport }),
      "source_timeout",
    );
    await flushMicrotasks();
    expect(resolverCalls).toBe(2);
    await vi.advanceTimersByTimeAsync(400);
    secondResolution.resolve([publicAddress]);
    await flushMicrotasks();
    expect(requests).toHaveLength(2);
    expect(requests[1]?.timeoutMs).toBeLessThanOrEqual(600);
    await vi.advanceTimersByTimeAsync(600);
    await result;
  });

  it("[T9] does not create new deadlines across two redirects", async () => {
    vi.useFakeTimers();
    const timerCounts: number[] = [];
    const resolver: DnsResolver = {
      async resolve() {
        timerCounts.push(vi.getTimerCount());
        return [publicAddress];
      },
    };
    const transport = new SyntheticTransport([
      syntheticResponse(302, { location: "https://one.public.org/" }),
      syntheticResponse(302, { location: "https://two.public.org/" }),
      okHtml(),
    ]);
    await expect(fetchedWith({ resolver, transport })).resolves.toMatchObject({
      redirectCount: 2,
      requestCount: 3,
    });
    expect(timerCounts).toEqual([1, 1, 1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("[T10] destroys the active request at timeout", async () => {
    vi.useFakeTimers();
    const transport = new PendingSourceTransport();
    const result = expectPipelineCodeAsync(
      () => fetchedWith({ transport }),
      "source_timeout",
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await result;
    expect(transport.destroyedRequests).toBe(1);
    expect(transport.requests).toHaveLength(1);
  });

  it("[T11] destroys the active response at timeout", async () => {
    vi.useFakeTimers();
    const response = new ControlledSourceResponse();
    const result = expectPipelineCodeAsync(
      () => fetchedWith({ transport: new SyntheticTransport([response]) }),
      "source_timeout",
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await result;
    expect(response.destroyCalls).toBe(1);
  });

  it("[T12] ignores chunks delivered after timeout", async () => {
    vi.useFakeTimers();
    const response = new ControlledSourceResponse(false);
    const result = expectPipelineCodeAsync(
      () => fetchedWith({ transport: new SyntheticTransport([response]) }),
      "source_timeout",
    );
    await flushMicrotasks();
    response.push(bytes("before"));
    await flushMicrotasks();
    expect(response.nextCalls).toBe(2);
    await vi.advanceTimersByTimeAsync(1_000);
    await result;
    response.push(bytes("after"));
    await flushMicrotasks();
    expect(response.nextCalls).toBe(2);
  });

  it("[T13] never returns a partial body", async () => {
    vi.useFakeTimers();
    const response = new ControlledSourceResponse();
    let returnedBody: string | undefined;
    const fetchPromise = fetchedWith({
      transport: new SyntheticTransport([response]),
    }).then((value) => {
      returnedBody = value.body;
      return value;
    });
    const result = expectPipelineCodeAsync(() => fetchPromise, "source_timeout");
    await flushMicrotasks();
    response.push(bytes("partial"));
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(1_000);
    await result;
    expect(returnedBody).toBeUndefined();
  });

  it("[T14] starts no retry after timeout", async () => {
    vi.useFakeTimers();
    const transport = new PendingSourceTransport();
    const result = expectPipelineCodeAsync(
      () => fetchedWith({ transport }),
      "source_timeout",
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await result;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(transport.requests).toHaveLength(1);
  });

  it("[T15] clears the total timer after success", async () => {
    vi.useFakeTimers();
    await fetchedWith({ transport: new SyntheticTransport([okHtml()]) });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("[T16] clears the total timer after an early transport error", async () => {
    vi.useFakeTimers();
    await expectPipelineCodeAsync(
      () => fetchedWith({ transport: new SyntheticTransport([new Error("RAW")]) }),
      "source_transport_error",
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("[T17] keeps source_timeout after a secondary body error", async () => {
    vi.useFakeTimers();
    const response = new ControlledSourceResponse();
    const result = expectPipelineCodeAsync(
      () => fetchedWith({ transport: new SyntheticTransport([response]) }),
      "source_timeout",
    );
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(1_000);
    await result;
    expect(response.destroyCalls).toBe(1);
  });

  it("[T18] exposes one terminal when end races the deadline", async () => {
    vi.useFakeTimers();
    let settlements = 0;
    const response: SourceTransportResponse = {
      statusCode: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
      rawHeaders: ["content-type", "text/plain; charset=utf-8"],
      headersDistinct: {
        "content-type": ["text/plain; charset=utf-8"],
      },
      body: {
        async *[Symbol.asyncIterator]() {
          yield bytes("complete");
          await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
        },
      },
      destroy() {},
    };
    const fetchPromise = fetchedWith({
      transport: new SyntheticTransport([response]),
    });
    void fetchPromise.then(
      () => {
        settlements += 1;
      },
      () => {
        settlements += 1;
      },
    );
    const result = expectPipelineCodeAsync(() => fetchPromise, "source_timeout");
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(1_000);
    await result;
    await flushMicrotasks();
    expect(settlements).toBe(1);
  });

  it("[T19] observes a late DNS rejection after terminal timeout", async () => {
    vi.useFakeTimers();
    const resolution = deferred<readonly DnsAddress[]>();
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", listener);
    try {
      const result = expectPipelineCodeAsync(
        () =>
          fetchedWith({
            resolver: { resolve: () => resolution.promise },
            transport: new SyntheticTransport([]),
          }),
        "source_timeout",
      );
      await vi.advanceTimersByTimeAsync(1_000);
      await result;
      resolution.reject(new Error("LATE_DNS_REJECTION"));
      await flushMicrotasks();
      expect(unhandled).toEqual([]);
    } finally {
      process.removeListener("unhandledRejection", listener);
    }
  });

  it("[T20] preserves scalar and all:true pinned lookup shapes", async () => {
    const lookup = buildPinnedHttpsRequestOptions({
      url: new URL(sourceUrl),
      address: publicAddress,
      timeoutMs: 1_000,
    }).lookup;
    if (lookup === undefined) throw new Error("PINNED_LOOKUP_MISSING");
    const scalar = await new Promise<{ address: string; family: number }>(
      (resolve, reject) => {
        lookup(sourceUrl.split("/")[2] ?? "", {}, (error, address, family) => {
          if (error || typeof address !== "string") {
            reject(error ?? new Error("PINNED_LOOKUP_SCALAR_SHAPE_INVALID"));
            return;
          }
          if (family !== 4 && family !== 6) {
            reject(new Error("PINNED_LOOKUP_SCALAR_FAMILY_INVALID"));
            return;
          }
          resolve({ address, family });
        });
      },
    );
    const all = await new Promise<readonly { address: string; family: number }[]>(
      (resolve, reject) => {
        lookup("research.public.org", { all: true }, (error, addresses) => {
          if (error || !Array.isArray(addresses)) {
            reject(error ?? new Error("PINNED_LOOKUP_ALL_SHAPE_INVALID"));
            return;
          }
          resolve(addresses);
        });
      },
    );
    expect(scalar).toEqual(publicAddress);
    expect(all).toEqual([publicAddress]);
  });

  it("[T21] preserves redirect revalidation and final DNS pinning", async () => {
    const resolver = new SyntheticResolver({
      "research.public.org": [publicAddress],
      "final.public.org": [{ address: "142.250.72.14", family: 4 }],
    });
    const transport = new SyntheticTransport([
      syntheticResponse(302, { location: "https://final.public.org/document" }),
      okHtml(),
    ]);
    const result = await fetchedWith({ resolver, transport });
    expect(resolver.calls).toEqual(["research.public.org", "final.public.org"]);
    expect(transport.requests[1]?.address).toEqual({
      address: "142.250.72.14",
      family: 4,
    });
    expect(result.finalUrl).toBe("https://final.public.org/document");
  });

  it("[T22] preserves the existing 512 KiB streamed-body limit", async () => {
    const response = syntheticResponse(
      200,
      { "content-type": "text/html" },
      [new Uint8Array(SOURCE_MAX_BYTES), new Uint8Array(1)],
    );
    await expectPipelineCodeAsync(
      () => fetchedWith({ transport: new SyntheticTransport([response]) }),
      "source_body_too_large",
    );
    expect(response.destroyed()).toBe(true);
  });
});

describe("M5-R2B fail-closed Content-Length", () => {
  const contentTypeHeaders = { "content-type": "text/plain; charset=utf-8" };

  async function expectLengthRejection(
    response: ReturnType<typeof syntheticResponse>,
    code: "source_body_too_large" | "source_transport_error",
  ): Promise<void> {
    const transport = new SyntheticTransport([response, okHtml()]);
    let terminals = 0;
    let returnedBody: string | undefined;
    const fetchPromise = fetchedWith({ transport }).then(
      (value) => {
        terminals += 1;
        returnedBody = value.body;
        return value;
      },
      (error: unknown) => {
        terminals += 1;
        throw error;
      },
    );
    await expectPipelineCodeAsync(() => fetchPromise, code);
    await flushMicrotasks();
    expect(response.chunksRead()).toBe(0);
    expect(response.destroyed()).toBe(true);
    expect(returnedBody).toBeUndefined();
    expect(transport.requests).toHaveLength(1);
    expect(terminals).toBe(1);
  }

  it.each([
    ["[CL1] accepts an absent header", undefined, undefined],
    ["[CL2] accepts zero", "0", undefined],
    ["[CL3] accepts one", "1", undefined],
    ["[CL4] accepts 524287", "524287", undefined],
    ["[CL5] accepts 524288", "524288", undefined],
    [
      "[CL6] accepts bounded outer HTTP whitespace",
      "1",
      {
        rawHeaders: [
          "content-type",
          "text/plain; charset=utf-8",
          "Content-Length",
          " \t1\t ",
        ],
        headersDistinct: {
          "content-type": ["text/plain; charset=utf-8"],
          "content-length": ["1"],
        },
      },
    ],
  ] as const)("%s", async (_name, contentLength, metadata) => {
    const headers: Record<string, string> = { ...contentTypeHeaders };
    if (contentLength !== undefined) headers["content-length"] = contentLength;
    const response = syntheticResponse(200, headers, [bytes("x")], metadata);
    await expect(fetchedWith({ transport: new SyntheticTransport([response]) })).resolves.toMatchObject({
      body: "x",
      bytesRead: 1,
    });
  });

  it.each([
    ["[CL7] rejects 524289", "524289"],
    ["[CL8] rejects an integer beyond Number.MAX_SAFE_INTEGER", "9007199254740992"],
    ["[CL9] rejects an extremely large bounded numeric header", "9".repeat(4_096)],
  ])("%s", async (_name, contentLength) => {
    const response = syntheticResponse(
      200,
      { ...contentTypeHeaders, "content-length": contentLength },
      [bytes("must-not-be-read")],
    );
    await expectLengthRejection(response, "source_body_too_large");
  });

  it.each([
    ["[CL10] rejects an empty value", ""],
    ["[CL11] rejects whitespace only", " \t "],
    ["[CL12] rejects a negative value", "-1"],
    ["[CL13] rejects a leading plus sign", "+1"],
    ["[CL14] rejects a decimal", "524288.5"],
    ["[CL15] rejects exponent notation", "1e3"],
    ["[CL16] rejects hexadecimal notation", "0x10"],
    ["[CL17] rejects NaN", "NaN"],
    ["[CL18] rejects Unicode digits", "١"],
    ["[CL19] rejects a comma-separated value", "1,1"],
  ])("%s", async (_name, contentLength) => {
    const response = syntheticResponse(
      200,
      { ...contentTypeHeaders, "content-length": contentLength },
      [bytes("must-not-be-read")],
    );
    await expectLengthRejection(response, "source_transport_error");
  });

  it("[CL20] rejects two identical occurrences", async () => {
    const response = syntheticResponse(
      200,
      { ...contentTypeHeaders, "content-length": "1" },
      [bytes("must-not-be-read")],
      {
        rawHeaders: [
          "content-type",
          "text/plain; charset=utf-8",
          "Content-Length",
          "1",
          "content-length",
          "1",
        ],
        headersDistinct: {
          "content-type": ["text/plain; charset=utf-8"],
          "content-length": ["1", "1"],
        },
      },
    );
    await expectLengthRejection(response, "source_transport_error");
  });

  it("[CL21] rejects two contradictory occurrences", async () => {
    const response = syntheticResponse(
      200,
      { ...contentTypeHeaders, "content-length": "1" },
      [bytes("must-not-be-read")],
      {
        rawHeaders: [
          "content-type",
          "text/plain; charset=utf-8",
          "Content-Length",
          "1",
          "Content-Length",
          "2",
        ],
        headersDistinct: {
          "content-type": ["text/plain; charset=utf-8"],
          "content-length": ["1", "2"],
        },
      },
    );
    await expectLengthRejection(response, "source_transport_error");
  });

  it("[CL22] rejects an array in normalized headers", async () => {
    const response = syntheticResponse(
      200,
      { ...contentTypeHeaders, "content-length": ["1"] },
      [bytes("must-not-be-read")],
    );
    await expectLengthRejection(response, "source_transport_error");
  });

  it("[CL23] rejects a non-array Content-Length in headersDistinct", async () => {
    const response = syntheticResponse(
      200,
      { ...contentTypeHeaders, "content-length": "1" },
      [bytes("must-not-be-read")],
      {
        rawHeaders: [
          "content-type",
          "text/plain; charset=utf-8",
          "Content-Length",
          "1",
        ],
        headersDistinct: {
          "content-type": ["text/plain; charset=utf-8"],
          "content-length": "1" as unknown as readonly string[],
        },
      },
    );
    await expectLengthRejection(response, "source_transport_error");
  });

  it("[CL24] rejects Content-Length with Transfer-Encoding", async () => {
    const response = syntheticResponse(
      200,
      {
        ...contentTypeHeaders,
        "content-length": "1",
        "transfer-encoding": "chunked",
      },
      [bytes("must-not-be-read")],
    );
    await expectLengthRejection(response, "source_transport_error");
  });

  it("[CL25] rejects disagreement between normalized and raw headers", async () => {
    const response = syntheticResponse(
      200,
      { ...contentTypeHeaders, "content-length": "2" },
      [bytes("must-not-be-read")],
      {
        rawHeaders: [
          "content-type",
          "text/plain; charset=utf-8",
          "Content-Length",
          "1",
        ],
        headersDistinct: {
          "content-type": ["text/plain; charset=utf-8"],
          "content-length": ["1"],
        },
      },
    );
    await expectLengthRejection(response, "source_transport_error");
  });

  it("[CL26] accepts exactly 524288 streamed bytes without Content-Length", async () => {
    const response = syntheticResponse(
      200,
      contentTypeHeaders,
      [new Uint8Array(SOURCE_MAX_BYTES).fill(65)],
    );
    await expect(
      fetchedWith({ transport: new SyntheticTransport([response]) }),
    ).resolves.toMatchObject({ bytesRead: SOURCE_MAX_BYTES });
  });

  it("[CL27] rejects 524289 streamed bytes without Content-Length", async () => {
    const response = syntheticResponse(
      200,
      contentTypeHeaders,
      [new Uint8Array(SOURCE_MAX_BYTES), new Uint8Array(1)],
    );
    await expectPipelineCodeAsync(
      () => fetchedWith({ transport: new SyntheticTransport([response]) }),
      "source_body_too_large",
    );
    expect(response.destroyed()).toBe(true);
  });

  it("[CL28] preserves the total asynchronous deadline", async () => {
    vi.useFakeTimers();
    const response = new ControlledSourceResponse();
    let terminals = 0;
    const fetchPromise = fetchedWith({
      transport: new SyntheticTransport([response]),
    });
    void fetchPromise.then(
      () => {
        terminals += 1;
      },
      () => {
        terminals += 1;
      },
    );
    const result = expectPipelineCodeAsync(() => fetchPromise, "source_timeout");
    await vi.advanceTimersByTimeAsync(999);
    expect(terminals).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(terminals).toBe(1);
  });

  it("[CL29] preserves scalar and all:true pinned lookup", async () => {
    const lookup = buildPinnedHttpsRequestOptions({
      url: new URL(sourceUrl),
      address: publicAddress,
      timeoutMs: 1_000,
    }).lookup;
    if (lookup === undefined) throw new Error("PINNED_LOOKUP_MISSING");
    const scalar = await new Promise<string>((resolve, reject) => {
      lookup("research.public.org", {}, (error, address) => {
        if (error || typeof address !== "string") {
          reject(error ?? new Error("PINNED_LOOKUP_SCALAR_SHAPE_INVALID"));
          return;
        }
        resolve(address);
      });
    });
    const all = await new Promise<readonly { address: string; family: number }[]>(
      (resolve, reject) => {
        lookup("research.public.org", { all: true }, (error, addresses) => {
          if (error || !Array.isArray(addresses)) {
            reject(error ?? new Error("PINNED_LOOKUP_ALL_SHAPE_INVALID"));
            return;
          }
          resolve(addresses);
        });
      },
    );
    expect(scalar).toBe(publicAddress.address);
    expect(all).toEqual([publicAddress]);
  });

  it("[CL30] preserves redirect canonicalization and final DNS", async () => {
    const resolver = new SyntheticResolver();
    const transport = new SyntheticTransport([
      syntheticResponse(302, {
        location: "https://FINAL.PUBLIC.ORG./document",
      }),
      okHtml(),
    ]);
    const result = await fetchedWith({
      url: "https://RESEARCH.PUBLIC.ORG./airbus",
      resolver,
      transport,
    });
    expect(resolver.calls).toEqual(["research.public.org", "final.public.org"]);
    expect(result.finalUrl).toBe("https://final.public.org/document");
  });
});

describe("M5-R2B generic stream cleanup", () => {
  function observeTerminal(promise: Promise<unknown>): () => number {
    let terminals = 0;
    void promise.then(
      () => {
        terminals += 1;
      },
      () => {
        terminals += 1;
      },
    );
    return () => terminals;
  }

  it("[GC1] cleans a request error before headers", async () => {
    const harness = lifecycleHarness();
    const fetchPromise = fetchedWith({ transport: harness.transport });
    const result = expectPipelineCodeAsync(
      () => fetchPromise,
      "source_transport_error",
    );
    await flushMicrotasks();
    harness.client.emit("error", new Error("SYNTHETIC_REQUEST_ERROR"));
    await result;
    expect(harness.client.destroyCalls).toBe(1);
  });

  it("[GC2] cleans a request error after response creation", async () => {
    const harness = lifecycleHarness();
    const response = new LifecycleIncomingResponse();
    const fetchPromise = fetchedWith({ transport: harness.transport });
    const result = expectPipelineCodeAsync(
      () => fetchPromise,
      "source_transport_error",
    );
    await flushMicrotasks();
    harness.respond(response);
    await flushMicrotasks();
    harness.client.emit("error", new Error("SYNTHETIC_LATE_REQUEST_ERROR"));
    await result;
    expect(harness.client.destroyCalls).toBe(1);
    expect(response.destroyCalls).toBe(1);
  });

  it("[GC3] cleans an iterator rejection", async () => {
    const harness = lifecycleHarness();
    const response = new LifecycleIncomingResponse();
    const fetchPromise = fetchedWith({ transport: harness.transport });
    const result = expectPipelineCodeAsync(
      () => fetchPromise,
      "source_transport_error",
    );
    await flushMicrotasks();
    harness.respond(response);
    await flushMicrotasks();
    response.rejectIterator(new Error("SYNTHETIC_ITERATOR_ERROR"));
    await result;
    expect(harness.client.destroyCalls).toBe(1);
    expect(response.destroyCalls).toBe(1);
  });

  it("[GC4] cleans a response error during the body", async () => {
    const harness = lifecycleHarness();
    const response = new LifecycleIncomingResponse();
    const fetchPromise = fetchedWith({ transport: harness.transport });
    const result = expectPipelineCodeAsync(
      () => fetchPromise,
      "source_transport_error",
    );
    await flushMicrotasks();
    harness.respond(response);
    await flushMicrotasks();
    response.emit("error", new Error("SYNTHETIC_RESPONSE_ERROR"));
    await result;
    expect(harness.client.destroyCalls).toBe(1);
    expect(response.destroyCalls).toBe(1);
  });

  it("[GC5] cleans a response close before end", async () => {
    const harness = lifecycleHarness();
    const response = new LifecycleIncomingResponse();
    const fetchPromise = fetchedWith({ transport: harness.transport });
    const result = expectPipelineCodeAsync(
      () => fetchPromise,
      "source_transport_error",
    );
    await flushMicrotasks();
    harness.respond(response);
    await flushMicrotasks();
    response.emit("close");
    await result;
    expect(harness.client.destroyCalls).toBe(1);
    expect(response.destroyCalls).toBe(1);
  });

  it("[GC6] cleans a synchronous socket-timeout configuration exception", async () => {
    const harness = lifecycleHarness({ throwOnTimeout: true });
    await expectPipelineCodeAsync(
      () => fetchedWith({ transport: harness.transport }),
      "source_transport_error",
    );
    expect(harness.client.timeoutCalls).toEqual([0]);
    expect(harness.client.endCalls).toBe(0);
    expect(harness.client.destroyCalls).toBe(1);
  });

  it("[GC7] cleans a synchronous end exception", async () => {
    const harness = lifecycleHarness({ throwOnEnd: true });
    await expectPipelineCodeAsync(
      () => fetchedWith({ transport: harness.transport }),
      "source_transport_error",
    );
    expect(harness.client.endCalls).toBe(1);
    expect(harness.client.destroyCalls).toBe(1);
  });

  it("[GC8] cleans a synchronous response-adaptation exception", async () => {
    const harness = lifecycleHarness();
    const response = new LifecycleIncomingResponse();
    Object.defineProperty(response, "headers", {
      configurable: true,
      get() {
        throw new Error("SYNTHETIC_RESPONSE_ADAPTATION");
      },
    });
    const fetchPromise = fetchedWith({ transport: harness.transport });
    const result = expectPipelineCodeAsync(
      () => fetchPromise,
      "source_transport_error",
    );
    await flushMicrotasks();
    harness.respond(response);
    await result;
    expect(harness.client.destroyCalls).toBe(1);
    expect(response.destroyCalls).toBe(1);
  });

  it("[GC9] destroys a failed request idempotently", async () => {
    const controller = new AbortController();
    const harness = lifecycleHarness();
    const fetchPromise = fetchedWith({
      transport: harness.transport,
      signal: controller.signal,
    });
    const result = expectPipelineCodeAsync(
      () => fetchPromise,
      "source_transport_error",
    );
    await flushMicrotasks();
    harness.client.emit("error", new Error("FIRST"));
    await result;
    controller.abort();
    harness.client.emit("error", new Error("LATE"));
    harness.client.emit("close");
    expect(harness.client.destroyCalls).toBe(1);
  });

  it("[GC10] destroys a failed response idempotently", async () => {
    const controller = new AbortController();
    const harness = lifecycleHarness();
    const response = new LifecycleIncomingResponse();
    const fetchPromise = fetchedWith({
      transport: harness.transport,
      signal: controller.signal,
    });
    const result = expectPipelineCodeAsync(
      () => fetchPromise,
      "source_transport_error",
    );
    await flushMicrotasks();
    harness.respond(response);
    await flushMicrotasks();
    response.emit("error", new Error("FIRST"));
    await result;
    controller.abort();
    response.emit("error", new Error("LATE"));
    response.emit("close");
    expect(response.destroyCalls).toBe(1);
  });

  it("[GC11] returns no partial body after a generic failure", async () => {
    const harness = lifecycleHarness();
    const response = new LifecycleIncomingResponse();
    let returnedBody: string | undefined;
    const fetchPromise = fetchedWith({ transport: harness.transport }).then(
      (value) => {
        returnedBody = value.body;
        return value;
      },
    );
    const result = expectPipelineCodeAsync(
      () => fetchPromise,
      "source_transport_error",
    );
    await flushMicrotasks();
    harness.respond(response);
    response.push(bytes("partial"));
    await flushMicrotasks();
    response.rejectIterator(new Error("SYNTHETIC_ITERATOR_ERROR"));
    await result;
    expect(returnedBody).toBeUndefined();
  });

  it("[GC12] performs no retry after generic failure", async () => {
    const harness = lifecycleHarness();
    const fetchPromise = fetchedWith({ transport: harness.transport });
    const result = expectPipelineCodeAsync(
      () => fetchPromise,
      "source_transport_error",
    );
    await flushMicrotasks();
    harness.client.emit("error", new Error("SYNTHETIC_REQUEST_ERROR"));
    await result;
    expect(harness.client.endCalls).toBe(1);
    expect(harness.client.timeoutCalls).toEqual([0]);
  });

  it("[GC13] exposes one terminal across racing generic events", async () => {
    const harness = lifecycleHarness();
    const response = new LifecycleIncomingResponse();
    const fetchPromise = fetchedWith({ transport: harness.transport });
    const terminalCount = observeTerminal(fetchPromise);
    const result = expectPipelineCodeAsync(
      () => fetchPromise,
      "source_transport_error",
    );
    await flushMicrotasks();
    harness.respond(response);
    await flushMicrotasks();
    response.emit("error", new Error("FIRST"));
    response.emit("close");
    harness.client.emit("error", new Error("LATE"));
    await result;
    await flushMicrotasks();
    expect(terminalCount()).toBe(1);
  });

  it("[GC14] swallows a late error after destroy", async () => {
    const harness = lifecycleHarness();
    const response = new LifecycleIncomingResponse();
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", listener);
    try {
      const fetchPromise = fetchedWith({ transport: harness.transport });
      const result = expectPipelineCodeAsync(
        () => fetchPromise,
        "source_transport_error",
      );
      await flushMicrotasks();
      harness.respond(response);
      await flushMicrotasks();
      response.emit("error", new Error("FIRST"));
      await result;
      expect(() => response.emit("error", new Error("LATE_RESPONSE"))).not.toThrow();
      expect(() => harness.client.emit("error", new Error("LATE_REQUEST"))).not.toThrow();
      await flushMicrotasks();
      expect(unhandled).toEqual([]);
    } finally {
      process.removeListener("unhandledRejection", listener);
    }
  });

  it("[GC15] ignores a late close after terminal", async () => {
    const harness = lifecycleHarness();
    const response = new LifecycleIncomingResponse();
    const fetchPromise = fetchedWith({ transport: harness.transport });
    const terminalCount = observeTerminal(fetchPromise);
    const result = expectPipelineCodeAsync(
      () => fetchPromise,
      "source_transport_error",
    );
    await flushMicrotasks();
    harness.respond(response);
    await flushMicrotasks();
    response.emit("error", new Error("FIRST"));
    await result;
    response.emit("close");
    harness.client.emit("close");
    await flushMicrotasks();
    expect(terminalCount()).toBe(1);
  });

  it("[GC16] ignores a late abort after successful consumption", async () => {
    const controller = new AbortController();
    const harness = lifecycleHarness();
    const response = new LifecycleIncomingResponse();
    const fetchPromise = fetchedWith({
      transport: harness.transport,
      signal: controller.signal,
    });
    await flushMicrotasks();
    harness.respond(response);
    response.push(bytes("complete"));
    response.finish();
    await expect(fetchPromise).resolves.toMatchObject({ body: "complete" });
    controller.abort();
    await flushMicrotasks();
    expect(harness.client.destroyCalls).toBe(0);
    expect(response.destroyCalls).toBe(0);
  });

  it("[GC17] observes a late DNS rejection without unhandled rejection", async () => {
    vi.useFakeTimers();
    const resolution = deferred<readonly DnsAddress[]>();
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", listener);
    try {
      const result = expectPipelineCodeAsync(
        () =>
          fetchedWith({
            resolver: { resolve: () => resolution.promise },
            transport: new SyntheticTransport([]),
          }),
        "source_timeout",
      );
      await vi.advanceTimersByTimeAsync(1_000);
      await result;
      resolution.reject(new Error("LATE_DNS_ERROR"));
      await flushMicrotasks();
      expect(unhandled).toEqual([]);
    } finally {
      process.removeListener("unhandledRejection", listener);
    }
  });

  it("[GC18] preserves source_timeout while cleaning a blocked body", async () => {
    vi.useFakeTimers();
    const harness = lifecycleHarness();
    const response = new LifecycleIncomingResponse();
    const fetchPromise = fetchedWith({ transport: harness.transport });
    const result = expectPipelineCodeAsync(() => fetchPromise, "source_timeout");
    await flushMicrotasks();
    harness.respond(response);
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(1_000);
    await result;
    expect(harness.client.destroyCalls).toBe(1);
    expect(response.destroyCalls).toBe(1);
  });

  it("[GC19] preserves source_transport_error for an independent failure", async () => {
    const harness = lifecycleHarness();
    const response = new LifecycleIncomingResponse();
    const fetchPromise = fetchedWith({ transport: harness.transport });
    const result = expectPipelineCodeAsync(
      () => fetchPromise,
      "source_transport_error",
    );
    await flushMicrotasks();
    harness.respond(response);
    await flushMicrotasks();
    response.rejectIterator(new Error("INDEPENDENT"));
    await result;
  });

  it("[GC20] preserves source_body_too_large for Content-Length", async () => {
    const harness = lifecycleHarness();
    const response = new LifecycleIncomingResponse({
      "content-type": "text/plain; charset=utf-8",
      "content-length": String(SOURCE_MAX_BYTES + 1),
    });
    const fetchPromise = fetchedWith({ transport: harness.transport });
    const result = expectPipelineCodeAsync(
      () => fetchPromise,
      "source_body_too_large",
    );
    await flushMicrotasks();
    harness.respond(response);
    await result;
    expect(response.nextCalls).toBe(0);
    expect(harness.client.destroyCalls).toBe(1);
    expect(response.destroyCalls).toBe(1);
  });

  it("[GC21] preserves source_body_too_large for streamed overflow", async () => {
    const harness = lifecycleHarness();
    const response = new LifecycleIncomingResponse();
    const fetchPromise = fetchedWith({ transport: harness.transport });
    const result = expectPipelineCodeAsync(
      () => fetchPromise,
      "source_body_too_large",
    );
    await flushMicrotasks();
    harness.respond(response);
    response.push(new Uint8Array(SOURCE_MAX_BYTES));
    await flushMicrotasks();
    response.push(new Uint8Array(1));
    await result;
    expect(harness.client.destroyCalls).toBe(1);
    expect(response.destroyCalls).toBe(1);
  });

  it("[GC22] destroys a redirect response before the next hop", async () => {
    const redirect = syntheticResponse(302, {
      location: "https://final.public.org/document",
    });
    const final = okHtml();
    const requests: PinnedSourceRequest[] = [];
    const transport: SourceTransport = {
      async request(request) {
        requests.push(request);
        if (requests.length === 1) return redirect;
        expect(redirect.destroyed()).toBe(true);
        return final;
      },
    };
    await expect(fetchedWith({ transport })).resolves.toMatchObject({
      redirectCount: 1,
      requestCount: 2,
    });
    expect(redirect.destroyed()).toBe(true);
  });

  it("[GC23] removes temporary listeners after success", async () => {
    const harness = lifecycleHarness();
    const response = new LifecycleIncomingResponse();
    const fetchPromise = fetchedWith({ transport: harness.transport });
    await flushMicrotasks();
    harness.respond(response);
    response.push(bytes("complete"));
    response.finish();
    await fetchPromise;
    expect(harness.client.listenerCount("close")).toBe(0);
    expect(response.listenerCount("end")).toBe(0);
    expect(response.listenerCount("close")).toBe(0);
    expect(harness.client.listenerCount("error")).toBe(1);
    expect(response.listenerCount("error")).toBe(1);
  });

  it("[GC24] does not accumulate owned listeners across requests", async () => {
    const client = new LifecycleClientRequest();
    const callbacks: Array<(response: IncomingMessage) => void> = [];
    const transport = new NodePinnedHttpsTransport((_options, callback) => {
      callbacks.push(callback);
      return client as never;
    });
    for (let index = 0; index < 3; index += 1) {
      const response = new LifecycleIncomingResponse();
      const fetchPromise = fetchedWith({ transport });
      await flushMicrotasks();
      callbacks[index]?.(response as unknown as IncomingMessage);
      response.push(bytes(`complete-${index}`));
      response.finish();
      await fetchPromise;
      expect(client.listenerCount("error")).toBe(1);
      expect(client.listenerCount("close")).toBe(0);
      expect(response.listenerCount("error")).toBe(1);
      expect(response.listenerCount("end")).toBe(0);
      expect(response.listenerCount("close")).toBe(0);
    }
  });

  it("[GC25] preserves lookup, TLS, redirects, deadline and length policy", async () => {
    const requestOptions = buildPinnedHttpsRequestOptions({
      url: new URL(sourceUrl),
      address: publicAddress,
      timeoutMs: 1_000,
    });
    expect(requestOptions.agent).toBe(false);
    expect(requestOptions.rejectUnauthorized).toBe(true);
    const lookup = requestOptions.lookup;
    if (lookup === undefined) throw new Error("PINNED_LOOKUP_MISSING");
    const all = await new Promise<readonly { address: string; family: number }[]>(
      (resolve, reject) => {
        lookup("research.public.org", { all: true }, (error, addresses) => {
          if (error || !Array.isArray(addresses)) {
            reject(error ?? new Error("PINNED_LOOKUP_ALL_SHAPE_INVALID"));
            return;
          }
          resolve(addresses);
        });
      },
    );
    expect(all).toEqual([publicAddress]);
    const transport = new SyntheticTransport([
      syntheticResponse(302, { location: "https://final.public.org/" }),
      syntheticResponse(
        200,
        {
          "content-type": "text/plain; charset=utf-8",
          "content-length": "1",
        },
        [bytes("x")],
      ),
    ]);
    await expect(fetchedWith({ transport })).resolves.toMatchObject({
      body: "x",
      finalUrl: "https://final.public.org/",
      redirectCount: 1,
    });
  });
});

describe("M5-R2B Content-Type singleton consensus", () => {
  async function expectContentTypeRejection(
    response: ReturnType<typeof syntheticResponse>,
  ): Promise<void> {
    await expectPreBodyContentTypeRejection(response);
  }

  it("[CT1] accepts one consensual occurrence after outer SP and HTAB removal", async () => {
    const response = syntheticResponse(
      200,
      { "content-type": "text/plain; charset=utf-8" },
      [bytes("x")],
      {
        rawHeaders: ["content-type", " \ttext/plain; charset=utf-8\t "],
        headersDistinct: {
          "content-type": ["\ttext/plain; charset=utf-8 "],
        },
      },
    );
    await expect(
      fetchedWith({ transport: new SyntheticTransport([response]) }),
    ).resolves.toMatchObject({
      body: "x",
      contentType: "text/plain; charset=utf-8",
      requestCount: 1,
    });
  });

  it("[CT2] accepts case variants of the Content-Type name", async () => {
    const response = syntheticResponse(
      200,
      { "CONTENT-Type": "text/plain; charset=utf-8" },
      [bytes("x")],
      {
        rawHeaders: ["Content-TYPE", "text/plain; charset=utf-8"],
        headersDistinct: {
          "cOnTeNt-TyPe": ["text/plain; charset=utf-8"],
        },
      },
    );
    await expect(
      fetchedWith({ transport: new SyntheticTransport([response]) }),
    ).resolves.toMatchObject({ body: "x", requestCount: 1 });
  });

  it("[CT3] rejects two identical raw occurrences", async () => {
    await expectContentTypeRejection(
      syntheticResponse(
        200,
        { "content-type": "text/plain; charset=utf-8" },
        [bytes("must-not-be-read")],
        {
          rawHeaders: [
            "Content-Type",
            "text/plain; charset=utf-8",
            "content-type",
            "text/plain; charset=utf-8",
          ],
          headersDistinct: {
            "content-type": ["text/plain; charset=utf-8"],
          },
        },
      ),
    );
  });

  it("[CT4] rejects two contradictory raw occurrences", async () => {
    await expectContentTypeRejection(
      syntheticResponse(
        200,
        { "content-type": "text/plain; charset=utf-8" },
        [bytes("must-not-be-read")],
        {
          rawHeaders: [
            "content-type",
            "text/plain; charset=utf-8",
            "Content-Type",
            "text/html; charset=utf-8",
          ],
          headersDistinct: {
            "content-type": ["text/plain; charset=utf-8"],
          },
        },
      ),
    );
  });

  it("[CT5] rejects disagreement between headers and rawHeaders", async () => {
    await expectContentTypeRejection(
      syntheticResponse(
        200,
        { "content-type": "text/plain; charset=utf-8" },
        [bytes("must-not-be-read")],
        {
          rawHeaders: ["content-type", "text/html; charset=utf-8"],
          headersDistinct: {
            "content-type": ["text/plain; charset=utf-8"],
          },
        },
      ),
    );
  });

  it("[CT6] rejects disagreement between headers and headersDistinct", async () => {
    await expectContentTypeRejection(
      syntheticResponse(
        200,
        { "content-type": "text/plain; charset=utf-8" },
        [bytes("must-not-be-read")],
        {
          rawHeaders: ["content-type", "text/plain; charset=utf-8"],
          headersDistinct: {
            "content-type": ["text/html; charset=utf-8"],
          },
        },
      ),
    );
  });

  it("[CT7] rejects two values in headersDistinct", async () => {
    await expectContentTypeRejection(
      syntheticResponse(
        200,
        { "content-type": "text/plain; charset=utf-8" },
        [bytes("must-not-be-read")],
        {
          rawHeaders: ["content-type", "text/plain; charset=utf-8"],
          headersDistinct: {
           "content-type": [
             "text/plain; charset=utf-8",
              "text/html; charset=utf-8",
           ],
          },
        },
      ),
    );
  });

  it("[CT8] rejects an array value in headers", async () => {
    await expectContentTypeRejection(
      syntheticResponse(
        200,
        { "content-type": ["text/plain; charset=utf-8"] },
        [bytes("must-not-be-read")],
        {
          rawHeaders: ["content-type", "text/plain; charset=utf-8"],
          headersDistinct: {
            "content-type": ["text/plain; charset=utf-8"],
          },
        },
      ),
    );
  });

  it.each([
    [
      "[CT9] rejects Content-Type absent from rawHeaders",
      syntheticResponse(
        200,
        { "content-type": "text/plain; charset=utf-8" },
        [bytes("must-not-be-read")],
        { rawHeaders: [] },
      ),
    ],
    [
      "[CT10] rejects Content-Type absent from headers",
      syntheticResponse(200, {}, [bytes("must-not-be-read")], {
        rawHeaders: ["content-type", "text/plain; charset=utf-8"],
        headersDistinct: {
          "content-type": ["text/plain; charset=utf-8"],
        },
      }),
    ],
    [
      "[CT11] rejects Content-Type absent from headersDistinct",
      syntheticResponse(
        200,
        { "content-type": "text/plain; charset=utf-8" },
        [bytes("must-not-be-read")],
        { headersDistinct: {} },
      ),
    ],
  ])("%s", async (_name, response) => {
    await expectContentTypeRejection(response);
  });

  it("[CT12] rejects an odd rawHeaders structure", async () => {
    await expectContentTypeRejection(
      syntheticResponse(
        200,
        { "content-type": "text/plain; charset=utf-8" },
        [bytes("must-not-be-read")],
        {
          rawHeaders: [
            "content-type",
            "text/plain; charset=utf-8",
            "x-unpaired",
          ],
        },
      ),
    );
  });

  it("[CT13] rejects consensus that would require MIME case normalization", async () => {
    await expectContentTypeRejection(
      syntheticResponse(
        200,
        { "content-type": "text/plain; charset=utf-8" },
        [bytes("must-not-be-read")],
        {
          rawHeaders: ["content-type", "Text/Plain; charset=utf-8"],
          headersDistinct: {
            "content-type": ["text/plain; charset=utf-8"],
          },
        },
      ),
    );
  });

  it("[CT14] rejects two case-insensitive entries in headers", async () => {
    await expectContentTypeRejection(
      syntheticResponse(
        200,
        {
          "content-type": "text/plain; charset=utf-8",
          "Content-Type": "text/html; charset=utf-8",
        },
        [bytes("must-not-be-read")],
        {
          rawHeaders: ["content-type", "text/plain; charset=utf-8"],
          headersDistinct: {
            "content-type": ["text/plain; charset=utf-8"],
          },
        },
      ),
    );
  });

  it.each(["rawHeaders", "headers", "headersDistinct"] as const)(
    "[CT15] rejects a missing %s surface",
    async (surface) => {
      const base = syntheticResponse(
        200,
        { "content-type": "text/plain; charset=utf-8" },
        [bytes("must-not-be-read")],
      );
      const response = {
        ...base,
        [surface]: undefined,
      } as unknown as ReturnType<typeof syntheticResponse>;
      await expectContentTypeRejection(response);
    },
  );
});

describe("M5-R2B-FIX-03B2 strict MIME parsing", () => {
  it.each([
    ["text/html", "text/html; charset=utf-8"],
    ["application/xhtml+xml", "application/xhtml+xml; charset=utf-8"],
    ["text/plain", "text/plain; charset=utf-8"],
    [
      'Text/Plain \t; \tCharset="UTF-8"\t; Foo=bar',
      "text/plain; charset=utf-8",
    ],
    ["text/plain; charset=utf8", "text/plain; charset=utf-8"],
    ['text/plain; charset="us-ascii"', "text/plain; charset=us-ascii"],
    ['text/plain; charset="utf\\-8"', "text/plain; charset=utf-8"],
    ["text/plain; unknown=valid-token", "text/plain; charset=utf-8"],
    [
      'text/plain; unknown="semicolon; comma,"',
      "text/plain; charset=utf-8",
    ],
    [
      'text/plain; unknown="escaped\\; escaped\\,"; charset=utf-8',
      "text/plain; charset=utf-8",
    ],
  ])("accepts %s", async (contentType, normalized) => {
    const response = syntheticResponse(
      200,
      { "content-type": contentType },
      [bytes("x")],
    );
    await expect(
      fetchedWith({ transport: new SyntheticTransport([response]) }),
    ).resolves.toMatchObject({
      body: "x",
      contentType: normalized,
      requestCount: 1,
    });
  });

  it.each([
    "text",
    "text/",
    "/plain",
    "te xt/plain",
    "text/pl ain",
    "text /plain",
    "text/ plain",
    "text/plain junk",
    "text/plain, application/json",
    "text/plain;",
    "text/plain;; foo=x",
    "text/plain; ; foo=x",
    "text/plain; =x",
    "text/plain; foo",
    "text/plain; foo=",
    "text/plain; foo =x",
    "text/plain; foo= x",
    "text/plain; foo=x junk",
    "text/plain; foo=x, application/json",
    'text/plain; foo="unterminated',
    'text/plain; foo="dangling\\',
    'text/plain; foo="closed"junk',
    "text/plain; foo=one; FOO=two",
    "text/plain; charset=utf-8; CHARSET=utf8",
    "text/plain; foo=ok\r",
    "text/plain; foo=ok\u007f",
  ])("rejects malformed or ambiguous syntax: %s", async (contentType) => {
    await expectPreBodyContentTypeRejection(
      syntheticResponse(
        200,
        { "content-type": contentType },
        [bytes("must-not-be-read")],
      ),
    );
  });

  it.each([
    ['text/plain; charset=""', "empty quoted charset"],
    ["text/plain; charset=iso-8859-1", "unsupported charset"],
  ])("rejects %s as charset policy", async (contentType) => {
    await expectPreBodyContentTypeRejection(
      syntheticResponse(
        200,
        { "content-type": contentType },
        [bytes("must-not-be-read")],
      ),
      "source_charset_rejected",
    );
  });
});

describe("M5-R3-FIX-05A safe Content-Type rejection diagnostics", () => {
  const forbiddenHeaderFragments = [
    "SHOULD_NOT_LEAK",
    "Authorization",
    "sk-test-marker",
    "BODY_SHOULD_NOT_LEAK",
  ] as const;
  const hostileParameter =
    'secret=SHOULD_NOT_LEAK; note="Authorization sk-test-marker ' +
    "x".repeat(2_048) +
    '"';

  function contentTypeDiagnosticVerifier(
    response: ReturnType<typeof syntheticResponse>,
  ) {
    const transport = new SyntheticTransport([response, okHtml()]);
    const verifier = createSourceVerifier({
      resolver: new SyntheticResolver(),
      transport,
      now: () => retrievedAt,
    });
    return { verifier, transport };
  }

  it.each([
    {
      name: "missing",
      response: () =>
        syntheticResponse(
          200,
          { "x-adversarial": "secret=SHOULD_NOT_LEAK Authorization sk-test-marker" },
          [bytes("BODY_SHOULD_NOT_LEAK")],
        ),
      reasonCode: "content_type_missing",
      sourceMediaTypeClass: null,
    },
    {
      name: "multiple",
      response: () =>
        syntheticResponse(
          200,
          { "content-type": `text/plain; ${hostileParameter}` },
          [bytes("BODY_SHOULD_NOT_LEAK")],
          {
            rawHeaders: [
              "content-type",
              `text/plain; ${hostileParameter}`,
              "Content-Type",
              `text/plain; ${hostileParameter}`,
            ],
            headersDistinct: {
              "content-type": [`text/plain; ${hostileParameter}`],
            },
          },
        ),
      reasonCode: "content_type_multiple",
      sourceMediaTypeClass: null,
    },
    {
      name: "conflicting",
      response: () =>
        syntheticResponse(
          200,
          { "content-type": `text/plain; ${hostileParameter}` },
          [bytes("BODY_SHOULD_NOT_LEAK")],
          {
            rawHeaders: [
              "content-type",
              `text/html; ${hostileParameter}`,
            ],
            headersDistinct: {
              "content-type": [`text/plain; ${hostileParameter}`],
            },
          },
        ),
      reasonCode: "content_type_conflicting",
      sourceMediaTypeClass: null,
    },
    {
      name: "syntax invalid",
      response: () => {
        const hostile =
          `text/plain; ${hostileParameter}\r\nAuthorization: sk-test-marker ` +
          "z".repeat(4_096);
        return syntheticResponse(
          200,
          { "content-type": hostile },
          [bytes("BODY_SHOULD_NOT_LEAK")],
        );
      },
      reasonCode: "content_type_syntax_invalid",
      sourceMediaTypeClass: null,
    },
    {
      name: "unsupported media type",
      response: () =>
        syntheticResponse(
          200,
          { "content-type": `application/pdf; ${hostileParameter}` },
          [bytes("BODY_SHOULD_NOT_LEAK")],
        ),
      reasonCode: "media_type_unsupported",
      sourceMediaTypeClass: "application_pdf",
    },
  ] as const)(
    "degrades $name proof to provider grounding without retaining raw header data",
    async ({ response: createResponse, reasonCode, sourceMediaTypeClass }) => {
      const response = createResponse();
      const source = contentTypeDiagnosticVerifier(response);
      const logs: Readonly<Record<string, unknown>>[] = [];
      const events = await runPipeline({
        verifier: source.verifier,
        logger: (record) => logs.push(record),
      });
      const terminal = events.at(-1);
      expect(terminal).toMatchObject({
        state: "completed",
        dossier: {
          global_status: "insufficient_evidence",
          result_mode: "silence",
          claims: expect.arrayContaining([expect.objectContaining({ predicate: "identity.proof" })]),
          unknowns: expect.arrayContaining([
            expect.objectContaining({ category: "not_verified" }),
          ]),
        },
      });
      expect(source.transport.requests.length).toBeGreaterThanOrEqual(1);
      expect(source.transport.requests.length).toBeLessThanOrEqual(2);
      expect(response.chunksRead()).toBe(0);
      expect(response.destroyed()).toBe(true);
      expect(events.filter(({ state }) => state === "completed" || state === "failed"))
        .toHaveLength(1);
      const serialized = JSON.stringify({ events, logs });
      for (const forbidden of forbiddenHeaderFragments) {
        expect(serialized).not.toContain(forbidden);
      }
      expect(serialized).not.toContain(reasonCode);
      expect(serialized).not.toContain(sourceMediaTypeClass ?? "never-present-null-marker");
    },
  );

  it.each([
    ["application/pdf", "application_pdf"],
    ["application/json", "application_json"],
    ["application/octet-stream", "application_octet_stream"],
    ["image/png", "image"],
    ["audio/mpeg", "audio"],
    ["video/mp4", "video"],
    ["text/csv", "text_other"],
    ["font/woff2", "other"],
  ] as const)("classifies unsupported %s as %s", async (contentType, expectedClass) => {
    const response = syntheticResponse(
      200,
      { "content-type": contentType },
      [bytes("must-not-be-read")],
    );
    const transport = new SyntheticTransport([response, okHtml()]);
    let captured: unknown;
    try {
      await fetchedWith({ transport });
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(ResearchPipelineError);
    expect((captured as ResearchPipelineError).code).toBe(
      "source_content_type_rejected",
    );
    expect((captured as ResearchPipelineError).contentTypeDiagnostics).toEqual({
      reasonCode: "media_type_unsupported",
      sourceMediaTypeClass: expectedClass,
    });
    expect(transport.requests).toHaveLength(1);
    expect(response.chunksRead()).toBe(0);
    expect(response.destroyed()).toBe(true);
  });
});

describe("M5-R2B-FIX-03B2 strict body decoding", () => {
  it("accepts valid UTF-8", async () => {
    await expect(
      fetchedWith({
        transport: new SyntheticTransport([
          syntheticResponse(
            200,
            { "content-type": "text/plain; charset=utf-8" },
            [bytes("Résumé")],
          ),
        ]),
      }),
    ).resolves.toMatchObject({ body: "Résumé" });
  });

  it.each([
    ["invalid", new Uint8Array([0xc3, 0x28])],
    ["truncated", new Uint8Array([0xe2, 0x82])],
    ["overlong", new Uint8Array([0xc0, 0xaf])],
  ])("rejects %s UTF-8 without partial output", async (_name, body) => {
    await expectBodyDecodingRejection("text/plain; charset=utf-8", body);
  });

  it("preserves the initial UTF-8 BOM policy", async () => {
    const response = syntheticResponse(
      200,
      { "content-type": "text/plain; charset=utf-8" },
      [new Uint8Array([0xef, 0xbb, 0xbf, 0x78])],
    );
    await expect(
      fetchedWith({ transport: new SyntheticTransport([response]) }),
    ).resolves.toMatchObject({ body: "x" });
  });

  it("accepts pure US-ASCII deterministically", async () => {
    const response = syntheticResponse(
      200,
      { "content-type": "text/plain; charset=us-ascii" },
      [new Uint8Array([0x41, 0x53, 0x43, 0x49, 0x49])],
    );
    await expect(
      fetchedWith({ transport: new SyntheticTransport([response]) }),
    ).resolves.toMatchObject({
      body: "ASCII",
      contentType: "text/plain; charset=us-ascii",
    });
  });

  it.each([0x80, 0xff])(
    "rejects byte 0x%s under US-ASCII",
    async (highByte) => {
      await expectBodyDecodingRejection(
        "text/plain; charset=us-ascii",
        new Uint8Array([0x41, highByte, 0x42]),
      );
    },
  );

  it("rejects elevated bytes in US-ASCII HTML", async () => {
    await expectBodyDecodingRejection(
      "text/html; charset=us-ascii",
      new Uint8Array([
        ...bytes("<html><body>"),
        0x80,
        ...bytes("</body></html>"),
      ]),
    );
  });
});

describe("M5-R2B parsing and normalization", () => {
  it("[44] decodes HTML entities through parse5", () => {
    expect(extractVisibleText("<html><body><p>A &amp; B</p></body></html>", "text/html")).toBe("A & B");
  });

  it("[45] applies Unicode NFKC", () => {
    expect(normalizeVisibleText("ＡＢＣ ①")).toBe("ABC 1");
  });

  it("[46] normalizes spaces and block boundaries", () => {
    expect(extractVisibleText("<html><body><p> A\t B </p><div>C</div></body></html>", "text/html")).toBe("A B\nC");
  });

  it("[47] preserves punctuation", () => {
    expect(normalizeVisibleText("Bonjour : oui ! — vraiment ?")).toBe("Bonjour : oui ! — vraiment ?");
  });

  it("[48] excludes script style noscript template and head", () => {
    const text = extractVisibleText("<html><head><title>HEAD</title></head><body><script>SCRIPT</script><style>STYLE</style><noscript>NO</noscript><template>TEMPLATE</template><p>VISIBLE</p></body></html>", "text/html");
    expect(text).toBe("VISIBLE");
  });

  it("[49] excludes hidden aria-hidden and hidden inputs", () => {
    const text = extractVisibleText("<html><body><p hidden>H1</p><p aria-hidden='true'>H2</p><input type='hidden' value='H3'><p>VISIBLE</p></body></html>", "text/html");
    expect(text).toBe("VISIBLE");
  });

  it("[50] recognizes only direct hidden inline declarations", () => {
    const text = extractVisibleText("<html><body><p style='display:none'>A</p><p style='visibility: hidden !important'>B</p><p style='content-visibility:hidden'>C</p><p style='color:red'>VISIBLE</p></body></html>", "text/html");
    expect(text).toBe("VISIBLE");
  });

  it("[51] retains visible content in source order", () => {
    expect(extractVisibleText("<html><body><h1>First</h1><p>Second <strong>third</strong>.</p></body></html>", "text/html")).toBe("First\nSecond third.");
  });

  it("[52] normalizes text/plain directly", () => {
    expect(extractVisibleText(" Ａ\t B\r\n\r\nC ", "text/plain")).toBe("A B\nC");
  });

  it("[53] uses public parse5 rather than an HTML-removal regex", () => {
    const source = readFileSync(join(process.cwd(), "src/server/research/source-content.ts"), "utf8");
    expect(source).toContain('from "parse5"');
    expect(source).not.toMatch(/replace\s*\(\s*\/?<\[/u);
  });

  it("[54] produces reproducible normalized text and digest", () => {
    const text1 = extractVisibleText("<html><body><p>Ａ &amp; B</p></body></html>", "text/html");
    const text2 = extractVisibleText("<html><body><p>Ａ &amp; B</p></body></html>", "text/html");
    const first = locateVerifiedExcerpt(locatorInput(text1, candidate({ excerpt: "A & B" }))).locator;
    const second = locateVerifiedExcerpt(locatorInput(text2, candidate({ excerpt: "A & B" }))).locator;
    expect(first.normalizedTextSha256).toBe(second.normalizedTextSha256);
  });

  it("matches one excerpt across HTML block boundaries and keeps the source slice", () => {
    const visibleText = extractVisibleText(
      "<html><body><div>Alex Martin</div><div>CEO de Nova Labs</div></body></html>",
      "text/html",
    );
    const located = locateVerifiedExcerpt(
      locatorInput(
        visibleText,
        candidate({ excerpt: "Alex Martin CEO de NOVA LABS" }),
      ),
    );
    expect(located).toMatchObject({
      excerpt: "Alex Martin\nCEO de Nova Labs",
      locator: {
        exact: "Alex Martin\nCEO de Nova Labs",
        matchMode: "mechanical_equivalence",
      },
    });
  });
});

describe("M5-R2B exact excerpt and locator", () => {
  it("[55] accepts one exact occurrence", () => {
    expect(locateVerifiedExcerpt(locatorInput(`Introduction\n${claim}\nFin`))).toMatchObject({
      excerpt: claim,
      locator: { exact: claim, matchMode: "exact" },
    });
  });

  it("[56] rejects a missing excerpt", () => {
    expectPipelineCode(() => locateVerifiedExcerpt(locatorInput("Unrelated visible text")), "source_excerpt_missing");
  });

  it("[57] rejects an empty excerpt", () => {
    expectPipelineCode(() => locateVerifiedExcerpt(locatorInput(claim, candidate({ excerpt: "   " }))), "source_excerpt_missing");
  });

  it("[58] rejects an excerpt beyond the 500-character bound", () => {
    const oversized = "A".repeat(501);
    expectPipelineCode(() => locateVerifiedExcerpt(locatorInput(oversized, candidate({ excerpt: oversized }))), "source_excerpt_missing");
  });

  it("rejects a mechanically remapped source slice beyond the 500-character bound", () => {
    const inflatedSource = `Air${"\u00ad".repeat(600)}bus`;
    expectPipelineCode(
      () => locateVerifiedExcerpt(locatorInput(
        inflatedSource,
        candidate({ statement: "Airbus", excerpt: "Airbus" }),
      )),
      "source_excerpt_missing",
    );
  });

  it("[59] rejects repeated text without context", () => {
    expectPipelineCode(() => locateVerifiedExcerpt(locatorInput(`${claim}\n${claim}`)), "source_excerpt_ambiguous");
  });

  it("[60] uses exact prefix and suffix to disambiguate", () => {
    const located = locateVerifiedExcerpt(locatorInput(`First ${claim} middle. Second ${claim} end.`, candidate({ prefix: "Second ", suffix: " end." })));
    expect(located.locator.occurrenceIndex).toBe(1);
  });

  it("[61] rejects incorrect prefix or suffix", () => {
    expectPipelineCode(
      () => locateVerifiedExcerpt(locatorInput(`${claim} first. ${claim} second.`, candidate({ prefix: "WRONG", suffix: " second." }))),
      "source_excerpt_ambiguous",
    );
  });

  it("[62] keeps the locator stable with an injected clock", () => {
    const first = locateVerifiedExcerpt(locatorInput(claim)).locator;
    const second = locateVerifiedExcerpt(locatorInput(claim)).locator;
    expect(first).toEqual(second);
    expect(first.retrievedAt).toBe(retrievedAt.toISOString());
  });

  it("[63] records exact URL digest size and redirect metadata", () => {
    expect(locateVerifiedExcerpt(locatorInput(claim)).locator).toMatchObject({
      exact: claim,
      matchMode: "exact",
      finalUrl: "https://final.public.org/document",
      citationUrl: sourceUrl,
      bytesRead: 321,
      redirectCount: 1,
      normalizedTextSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
  });

  it("[64] never includes the complete page body in the locator", () => {
    const marker = "SYNTHETIC_FULL_PAGE_BODY_FORBIDDEN";
    const locator = locateVerifiedExcerpt(locatorInput(`${claim}\n${marker}`)).locator;
    expect(JSON.stringify(locator)).not.toContain(marker);
  });

  it.each([
    ["straight to typographic double quotes", 'Airbus "SE"', "Airbus \u201cSE\u201d", "mechanical_equivalence"],
    ["typographic to straight double quotes", "Airbus \u201cSE\u201d", 'Airbus "SE"', "mechanical_equivalence"],
    ["straight to typographic apostrophe", "l'Airbus", "l\u2019Airbus", "mechanical_equivalence"],
    ["typographic to straight apostrophe", "l\u2019Airbus", "l'Airbus", "mechanical_equivalence"],
    ["ASCII to typographic dash", "Airbus - Europe", "Airbus \u2014 Europe", "mechanical_equivalence"],
    ["typographic to ASCII dash", "Airbus \u2013 Europe", "Airbus - Europe", "mechanical_equivalence"],
    ["three dots to ellipsis", "Airbus...", "Airbus\u2026", "mechanical_equivalence"],
    ["ellipsis to three dots", "Airbus\u2026", "Airbus...", "exact"],
    ["soft hyphen in source", "Airbus", "Air\u00adbus", "mechanical_equivalence"],
    ["soft hyphen in candidate", "Air\u00adbus", "Airbus", "mechanical_equivalence"],
    ["block newline in source", "Alex Martin CEO", "Alex Martin\nCEO", "mechanical_equivalence"],
    ["block newline in candidate", "Alex Martin\nCEO", "Alex Martin CEO", "mechanical_equivalence"],
    ["case difference", "Alex Martin, CEO de NOVA LABS.", "Alex Martin, CEO de Nova Labs.", "mechanical_equivalence"],
    ["standalone Webflow joiner", "Acme, Generative AI Lab", "Acme,\n\u200dGenerative AI Lab", "mechanical_equivalence"],
    ["punctuation-boundary Webflow joiner", "Acme,Generative AI Lab", "Acme,\u200dGenerative AI Lab", "mechanical_equivalence"],
    ["boundary zero-width space", "Airbus Europe", "Airbus\u200b Europe", "mechanical_equivalence"],
    [
      "combined authorized equivalences",
      '"L\'Airbus - cooperator..."',
      "\u201cL\u2019Airbus \u2014 co\u00adoperator\u2026\u201d",
      "mechanical_equivalence",
    ],
  ])("accepts %s and returns source text", (_case, candidateExcerpt, sourceExcerpt, matchMode) => {
    const visibleText = `Before ${sourceExcerpt} After`;
    const located = locateVerifiedExcerpt(
      locatorInput(visibleText, candidate({ excerpt: candidateExcerpt })),
    );
    expect(located).toMatchObject({
      excerpt: sourceExcerpt,
      locator: {
        exact: sourceExcerpt,
        matchMode,
        prefix: "Before ",
        suffix: " After",
        finalUrl: "https://final.public.org/document",
        citationUrl: sourceUrl,
        normalizedTextSha256: createHash("sha256")
          .update(visibleText, "utf8")
          .digest("hex"),
      },
    });
    expect(visibleText).toContain(located.excerpt);
    expect(located.excerpt).not.toBe(candidateExcerpt);
  });

  it.each([
    ["added word", "Airbus SE", "Airbus Group SE"],
    ["absent word", "Airbus European SE", "Airbus SE"],
    ["modified word", "Airbus société", "Airbus entreprise"],
    ["different number", "Airbus 2026", "Airbus 2025"],
    ["removed comma", "Airbus, SE", "Airbus SE"],
    ["removed period", "Airbus.SE", "AirbusSE"],
    ["different order", "Airbus SE Europe", "Europe Airbus SE"],
    ["paraphrase", "Airbus est une société", "Airbus constitue une entreprise"],
    ["generic invisible removal", "Air\u200bbus", "Airbus"],
    ["intra-word zero-width joiner", "Air\u200dbus", "Airbus"],
    ["intra-word zero-width non-joiner", "Air\u200cbus", "Airbus"],
    ["exact substring inside a name", "Joann Lee travaille à Paris.", "Ann Lee travaille à Paris."],
    ["case-folded substring inside a name", "Joann Lee travaille à Paris.", "ANN LEE travaille à Paris."],
    ["hyphenated word prefix", "Non-Acme SAS conçoit des logiciels industriels.", "Acme SAS conçoit des logiciels industriels."],
    ["apostrophe word prefix", "L'Acme SAS conçoit des logiciels industriels.", "Acme SAS conçoit des logiciels industriels."],
    ["partial ellipsis expansion", "A\u2026", "A.."],
    ["partial Unicode case expansion", "\u0130STANBUL accueille le congrès.", "\u0307stanbul accueille le congrès."],
    [
      "complete claim after an intra-name joiner",
      "Jo\u200dAnn Lee travaille comme ingénieure à Paris.",
      "Ann Lee travaille comme ingénieure à Paris.",
    ],
    [
      "complete claim after an intra-name soft hyphen",
      "Jo\u00adAnn Lee travaille comme ingénieure à Paris.",
      "Ann Lee travaille comme ingénieure à Paris.",
    ],
    [
      "complete claim after an intra-name control character",
      "Jo\u0000Ann Lee travaille comme ingénieure à Paris.",
      "Ann Lee travaille comme ingénieure à Paris.",
    ],
  ])("rejects %s", (_case, sourceExcerpt, candidateExcerpt) => {
    expectPipelineCode(
      () =>
        locateVerifiedExcerpt(
          locatorInput(sourceExcerpt, candidate({ excerpt: candidateExcerpt })),
        ),
      "source_excerpt_missing",
    );
  });

  it("accepts an exact excerpt at punctuation boundaries", () => {
    expect(
      locateVerifiedExcerpt(
        locatorInput("Profil : Ann Lee, CEO.", candidate({ excerpt: "Ann Lee" })),
      ),
    ).toMatchObject({
      excerpt: "Ann Lee",
      locator: { matchMode: "exact" },
    });
  });

  it.each([
    ["Jo Ann Lee", "Ann Lee", "Ann Lee travaille à Paris."],
    ["jo Ann Lee", "Ann Lee", "Ann Lee travaille à Paris."],
    ["Non-Acme SAS", "Acme SAS", "Acme SAS travaille à Paris."],
  ])(
    "rejects a fact truncated from the longer name %s",
    (longerName, attributedDisplayName, excerpt) => {
      const personFact: ProviderFactCandidate = {
        ...candidate({
          entityType: attributedDisplayName === "Ann Lee" ? "person" : "company",
          statement: excerpt,
          excerpt,
        }),
        subjectKey: "ann-lee",
        category: "activity",
        predicate: "works",
        scopeType: attributedDisplayName === "Ann Lee" ? "person" : "company",
        scopeLabel: null,
        factPeriodLabel: null,
        factDate: null,
        normalizedValue: null,
        unit: null,
        currency: null,
        contradictionKey: null,
      };
      expectPipelineCode(
        () => locateVerifiedExcerpt({
          ...locatorInput(`${longerName} travaille à Paris.`, personFact),
          attributedDisplayNames: [attributedDisplayName],
        }),
        "source_excerpt_missing",
      );
    },
  );

  it("keeps significant entity-name punctuation and rejects longer company names", () => {
    expect(containsEntityNameInText("C Corp develops tools.", "C++", "company")).toBe(false);
    expect(containsEntityNameInText("Yahoo! développe des services.", "Yahoo!", "company")).toBe(true);
    expect(containsEntityNameInText("Acme Inc. développe des services.", "Acme Inc.", "company")).toBe(true);
    expect(containsEntityNameInText(".NET Foundation publie.", ".NET Foundation", "company")).toBe(true);
    expect(
      containsEntityNameInText("Mega Acme SAS développe des outils.", "Acme SAS", "company"),
    ).toBe(false);
    expect(
      containsEntityNameInText("Mega Group Acme SAS développe des outils.", "Acme SAS", "company"),
    ).toBe(false);
    expect(
      containsEntityNameInText("Mega The Group Acme SAS développe.", "Acme SAS", "company"),
    ).toBe(false);
    expect(containsEntityNameInText("The Group Acme SAS développe.", "Acme SAS", "company")).toBe(true);
  });

  it("requires a closed company suffix when matching an attributed alias", () => {
    expect(containsEntityNameInText("Acme", "Acme", "company")).toBe(true);
    expect(containsEntityNameInText("Acme publie ses résultats.", "Acme", "company")).toBe(true);
    expect(containsEntityNameInText("Acme Logistics publie.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("Acme Solutions SAS publie.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("Acme SAS publie.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("Acme Inc. publie.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("Acme SAS Solutions publie.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("Acme & Logistics SAS publie.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("Acme + logistics SAS publie.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("Acme / Logistics publie.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("acme logistics sas publie.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("Acme solutions SAS publie.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("Acme et Fils SAS publie.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("Acme and Logistics SAS publishes.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("acme logistics", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("acme logistics publie.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("acme works employs 100 people.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("aCME works employs 100 people.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("Acme works employs 100 people.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("nova labs works employs 100 people.", "Nova Labs", "company")).toBe(false);
    expect(containsEntityNameInText("Acme works Ltd employs 100 people.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("Acme designs SAS manufactures aircraft.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("Acme works & Sons Ltd employs people.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("Acme works and Sons Ltd employs people.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("Acme works-global Systems Ltd employs people.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("Acme works global advanced integrated systems Ltd employs people.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("Acme works group employs people.", "Acme", "company")).toBe(false);
    expect(containsEntityNameInText("Nova Labs works global advanced integrated systems Ltd employs people.", "Nova Labs", "company")).toBe(false);
    expect(containsEntityNameInText("Acme développe des logiciels.", "Acme", "company")).toBe(true);
    expect(containsEntityNameInText("Acme publishes its results.", "Acme", "company")).toBe(true);
    expect(containsEntityNameInText("Acme est un groupe industriel.", "Acme", "company")).toBe(true);
    expect(containsEntityNameInText("Acme a publié ses résultats.", "Acme", "company")).toBe(true);
    expect(containsEntityNameInText("Acme exploite un établissement.", "Acme", "company")).toBe(true);
    expect(containsEntityNameInText("Acme designs aircraft.", "Acme", "company")).toBe(true);
    expect(containsEntityNameInText("Acme manufactures equipment.", "Acme", "company")).toBe(true);
    expect(containsEntityNameInText("Acme delivered aircraft.", "Acme", "company")).toBe(true);
    expect(containsEntityNameInText("Acme employed 250 people.", "Acme", "company")).toBe(true);
    expect(containsEntityNameInText("Acme exerce une activité industrielle.", "Acme", "company")).toBe(true);
    expect(containsEntityNameInText("Acme indicates its registered office.", "Acme", "company")).toBe(true);
    expect(containsEntityNameInText("Acme confirms its annual results.", "Acme", "company")).toBe(true);
    expect(containsEntityNameInText("Acme consolide sa présence en Europe.", "Acme", "company")).toBe(true);
    expect(containsEntityNameInText("Acme designs research & development tools.", "Acme", "company")).toBe(true);
    expect(containsEntityNameInText("Acme develops AI + analytics tools.", "Acme", "company")).toBe(true);
    expect(containsEntityNameInText("Acme has operations in SE Asia.", "Acme", "company")).toBe(true);
    expect(containsEntityNameInText("Acme designs Group A software.", "Acme", "company")).toBe(true);
    expect(containsEntityNameInText("Acme SAS designs aircraft.", "Acme SAS", "company")).toBe(true);
    expect(containsEntityNameInText("Acme SAS manufactures equipment.", "Acme SAS", "company")).toBe(true);
    expect(containsEntityNameInText("Acme SAS delivered aircraft.", "Acme SAS", "company")).toBe(true);
    expect(containsEntityNameInText("Airbus SE Reports Full-Year Results.", "Airbus SE", "company")).toBe(true);
    expect(containsEntityNameInText("AIRBUS SE MANUFACTURES AIRCRAFT.", "Airbus SE", "company")).toBe(true);
  });

  it("applies the closed company-suffix guard to explicitly attributed aliases", () => {
    const acceptedExcerpt = "Acme SAS publie ses résultats.";
    expect(locateVerifiedExcerpt({
      ...locatorInput(
        acceptedExcerpt,
        candidate({ statement: acceptedExcerpt, excerpt: acceptedExcerpt }),
      ),
      attributedDisplayNames: ["Acme SAS", "Acme"],
    })).toMatchObject({ excerpt: acceptedExcerpt });

    const rejectedExcerpt = "Acme Logistics publie ses résultats.";
    expectPipelineCode(
      () => locateVerifiedExcerpt({
        ...locatorInput(
          rejectedExcerpt,
          candidate({ statement: rejectedExcerpt, excerpt: rejectedExcerpt }),
        ),
        attributedDisplayNames: ["Acme"],
      }),
      "source_excerpt_missing",
    );

    for (const rejectedExcerpt of [
      "Acme & Logistics SAS publie ses résultats.",
      "Acme et Fils SAS publie ses résultats.",
      "acme logistics sas publie ses résultats.",
      "acme logistics publie ses résultats.",
      "Acme works & Sons Ltd employs 100 people.",
      "Acme designs SAS manufactures aircraft.",
    ]) {
      expectPipelineCode(
        () => locateVerifiedExcerpt({
          ...locatorInput(
            rejectedExcerpt,
            candidate({ statement: rejectedExcerpt, excerpt: rejectedExcerpt }),
          ),
          attributedDisplayNames: ["Acme"],
        }),
        "source_excerpt_missing",
      );
    }
  });

  it("keeps a soft hyphen mechanically transparent during company attribution", () => {
    const sourceExcerpt = "Air\u00adbus SE manufactures aircraft.";
    const candidateExcerpt = "Airbus SE manufactures aircraft.";
    expect(locateVerifiedExcerpt({
      ...locatorInput(
        sourceExcerpt,
        candidate({ statement: candidateExcerpt, excerpt: candidateExcerpt }),
      ),
      attributedDisplayNames: ["Airbus SE", "Airbus"],
    })).toMatchObject({
      excerpt: sourceExcerpt,
      locator: { matchMode: "mechanical_equivalence" },
    });
  });

  it.each([
    ["zero-width joiner", "Jo\u200dAnn Lee", "Ann Lee", "person"],
    ["zero-width space", "Jo\u200bAnn Lee", "Ann Lee", "person"],
    ["soft hyphen", "Jo\u00adAnn Lee", "Ann Lee", "person"],
    ["control character", "Jo\u0000Ann Lee", "Ann Lee", "person"],
    ["company zero-width joiner", "Non\u200dAcme SAS", "Acme SAS", "company"],
  ] as const)(
    "rejects an attributed name truncated after an intra-component %s",
    (_case, longerName, attributedDisplayName, entityType) => {
      const excerpt = `${longerName} publie.`;
      expect(containsEntityNameInText(
        excerpt,
        attributedDisplayName,
        entityType,
      )).toBe(false);
      expectPipelineCode(
        () => locateVerifiedExcerpt({
          ...locatorInput(
            excerpt,
            candidate({ entityType, statement: excerpt, excerpt }),
          ),
          attributedDisplayNames: [attributedDisplayName],
        }),
        "source_excerpt_missing",
      );
    },
  );

  it("fails closed when explicit attribution contains no display name", () => {
    expectPipelineCode(
      () => locateVerifiedExcerpt({
        ...locatorInput(claim),
        attributedDisplayNames: [],
      }),
      "source_excerpt_missing",
    );
  });

  it("allows bounded person-name possessives and directory titles", () => {
    expect(containsEntityNameInText("Ann Lee's company builds tools.", "Ann Lee", "person")).toBe(true);
    expect(containsEntityNameInText("Camille Durand—CEO", "Camille Durand", "person")).toBe(true);
    expect(containsEntityNameInText("Contact Camille Durand", "Camille Durand", "person")).toBe(true);
    expect(containsEntityNameInText("Selon Camille Durand, le projet avance.", "Camille Durand", "person")).toBe(true);
    expect(containsEntityNameInText("Le CEO Camille Durand publie.", "Camille Durand", "person")).toBe(true);
    expect(containsEntityNameInText("Notre CEO Camille Durand publie.", "Camille Durand", "person")).toBe(true);
    expect(containsEntityNameInText("Selon le CEO Camille Durand, le projet avance.", "Camille Durand", "person")).toBe(true);
    expect(containsEntityNameInText("Dr. Ann Lee publie.", "Ann Lee", "person")).toBe(true);
    expect(containsEntityNameInText("Alex Martin Mis à jour le 22/07/2025 Expert en IA.", "Alex Martin", "person")).toBe(true);
    expect(containsEntityNameInText("Alex Martin Last updated on 2025-07-22 AI expert.", "Alex Martin", "person")).toBe(true);
  });

  it("rejects a person-name suffix after an ambiguous connector", () => {
    expect(containsEntityNameInText("Juan de Ann Lee publie.", "Ann Lee", "person")).toBe(false);
    expect(containsEntityNameInText("Jean Dr Ann Lee publie.", "Ann Lee", "person")).toBe(false);
    expect(containsEntityNameInText("Jean Mr. Dr. Ann Lee publie.", "Ann Lee", "person")).toBe(false);
    expect(containsEntityNameInText("Jean le Dr Ann Lee publie.", "Ann Lee", "person")).toBe(false);
    expect(containsEntityNameInText("Jean notre CEO Ann Lee publie.", "Ann Lee", "person")).toBe(false);
    expect(containsEntityNameInText("Son Ann Lee publie.", "Ann Lee", "person")).toBe(false);
    expect(containsEntityNameInText("Her Ann Lee publishes.", "Ann Lee", "person")).toBe(false);
  });

  it("rejects two canonical occurrences", () => {
    expectPipelineCode(
      () =>
        locateVerifiedExcerpt(
          locatorInput(
            "\u201cAirbus\u201d puis \u00abAirbus\u00bb",
            candidate({ excerpt: '"Airbus"' }),
          ),
        ),
      "source_excerpt_ambiguous",
    );
  });

  it("rejects a collision created by canonicalization", () => {
    expectPipelineCode(
      () =>
        locateVerifiedExcerpt(
          locatorInput(
            "Air-bus puis Air\u2014bus",
            candidate({ excerpt: "Air\u2013bus" }),
          ),
        ),
      "source_excerpt_ambiguous",
    );
  });

  it("rejects a collision created by whitespace and case equivalence", () => {
    expectPipelineCode(
      () =>
        locateVerifiedExcerpt(
          locatorInput(
            "Airbus\nSE puis AIRBUS SE",
            candidate({ excerpt: "Airbus SE" }),
          ),
        ),
      "source_excerpt_ambiguous",
    );
  });
});

describe("offline source-pipeline regression sentinels", () => {
  it("[75] keeps all six existing M2 fixtures accepted", () => {
    expect(fixtures.fixtures).toHaveLength(6);
    for (const fixture of fixtures.fixtures) expect(validateResearchDossier(fixture.dossier), fixture.fixture_id).toMatchObject({ ok: true });
  });

  it("[76] keeps all five canonical M2 mutations rejected", () => {
    const result = spawnSync("pwsh", ["-NoProfile", "-File", join(process.cwd(), "tools/verify-m2-contract.ps1")], { cwd: process.cwd(), encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout.match(/M2_NEGATIVE_MUTATION_REJECTED:/gu)).toHaveLength(5);
  });

  it("[77] preserves the fourteen R1 failure categories", () => {
    expect(FAILURE_CATEGORIES).toHaveLength(14);
    expect(new Set(FAILURE_CATEGORIES).size).toBe(14);
  });

  it("[78] guards the suite against real resolver or transport invocation", () => {
    expect(getNodeDnsResolutionCount()).toBe(0);
    expect(getNodeHttpsRequestCount()).toBe(0);
    const resolver = new SyntheticResolver();
    const transport = new SyntheticTransport([]);
    expectPipelineCode(() => validateSourceUrl("http://source.public.org/", "citation"), "source_url_rejected");
    expect(resolver.calls).toHaveLength(0);
    expect(transport.requests).toHaveLength(0);
  });

  it("[79] performs zero network calls throughout the offline suite", () => {
    expect(getNodeDnsResolutionCount()).toBe(0);
    expect(getNodeHttpsRequestCount()).toBe(0);
    expect(vi.isMockFunction(globalThis.fetch)).toBe(true);
  });

  it("[80] keeps the production route wired to the complete source verifier", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/research/route.ts"), "utf8");
    const service = readFileSync(join(process.cwd(), "src/server/research/service.ts"), "utf8");
    expect(route).toContain("createProductionSourceTransportDependencies");
    expect(route).toContain("createSourceVerifier");
    expect(service).toContain("options.sourceVerifier.verify");
    expect(service).toContain('state: "source_verifying"');
  });
});
