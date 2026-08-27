import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  APICallError,
  LoadAPIKeyError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  RetryError,
} from "ai";
import { describe, expect, it } from "vitest";

import m1Replay from "./fixtures/m1-provider-transport-replay.json";
import { serializeResearchEvent } from "../src/app/api/research/route";
import { ProviderInvocationError } from "../src/server/ai/providers";
import {
  ResearchPipelineError,
  type ContentTypeRejectionDiagnostics,
} from "../src/server/research/errors";
import { normalizeOpenAIProviderMetadata } from "../src/server/research/provider-metadata";
import {
  buildFailureReceipt,
  digestProviderRequestId,
} from "../src/server/research/failure-receipt";
import { executeResearch } from "../src/server/research/service";
import type {
  FailureReceipt,
  ProviderResearchResult,
  ResearchProgressEvent,
  ResearchProvider,
  SourceVerifier,
} from "../src/server/research/types";

const claim = "Airbus SE est une société européenne.";
const sourceUrl = "https://research.public.org/airbus";
const text = [
  "STATUS: evidence",
  "ENTITY_TYPE: company",
  `CLAIM: ${claim}`,
  `SOURCE_URL: ${sourceUrl}`,
  `EXCERPT: ${claim}`,
  "PREFIX: NONE",
  "SUFFIX: NONE",
].join("\n");
const claimStart = text.indexOf(claim);

function apiCallError(
  statusCode: number | undefined,
  isRetryable: boolean,
): APICallError {
  return new APICallError({
    message: "RAW_PROVIDER_MESSAGE_FORBIDDEN",
    url: "https://api.openai.com/v1/responses",
    requestBodyValues: {
      prompt: "RAW_PROMPT_FORBIDDEN",
      name: "PRIVATE_NAME_FORBIDDEN",
      context: "PRIVATE_CONTEXT_FORBIDDEN",
    },
    ...(statusCode === undefined ? {} : { statusCode }),
    responseHeaders: {
      authorization: "Bearer SECRET_FORBIDDEN",
      "x-request-id": "req-private-123",
    },
    responseBody: "RAW_RESPONSE_BODY_FORBIDDEN",
    cause: new TypeError("RAW_CAUSE_FORBIDDEN"),
    isRetryable,
  });
}

function wrapped(error: unknown, callsAttempted = 1): ProviderInvocationError {
  return new ProviderInvocationError(error, {
    callsAttempted,
    durationMs: 42,
    abortReasonName: null,
  });
}

function classify(error: unknown): FailureReceipt {
  return buildFailureReceipt(error, {
    attemptId: "attempt-synthetic",
    failedStage: "generation",
    observedAt: new Date("2026-08-26T00:00:00.000Z"),
  });
}

function providerResult(
  overrides: Partial<ProviderResearchResult> = {},
): ProviderResearchResult {
  return {
    text,
    document: {
      identityStatus: "resolved",
      entityType: "company",
      candidates: [{
        displayName: "Airbus SE",
        entityType: "company",
        statement: claim,
        structuredUrl: sourceUrl,
        excerpt: claim,
        prefix: null,
        suffix: null,
      }],
      claims: [{
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
    citations: [
      {
        provider: "openai",
        metadataType: "url_citation",
        sourceId: "source-synthetic",
        url: sourceUrl,
        title: "Our history | Airbus",
        generatedTextStart: claimStart,
        generatedTextEnd: claimStart + claim.length,
        textPartId: "item-synthetic",
        toolCallId: "tool-synthetic",
      },
    ],
    sources: [
      {
        sourceId: "source-synthetic",
        url: sourceUrl,
        title: "Our history | Airbus",
      },
    ],
    webSearchCalls: [
      {
        toolCallId: "tool-synthetic",
        sources: [{ url: sourceUrl }],
      },
    ],
    webSearchActions: [{ toolCallId: "tool-synthetic", actionType: "search" }],
    webSearchInspections: [],
    webSearchActionCount: 1,
    webSearchQueryCount: 1,
    webSearchInspectionCount: 0,
    webSearchUniqueCallCount: 1,
    webSearchActionPolicyStatus: "supported",
    webSearchActionPolicyCode: null,
    providerMetadataStatus: "supported",
    providerHttpCalls: 1,
    toolCalls: 1,
    usage: {
      inputTokens: 100,
      cachedInputTokens: 0,
      outputTokens: 20,
      reasoningTokens: 0,
      totalTokens: 120,
    },
    providerDurationMs: 40,
    finishReason: "stop",
    requestId: "req-result-private",
    ...overrides,
  };
}

function successfulSourceVerifier(): SourceVerifier {
  return {
    async verify(request) {
      return {
        citation: request.citation,
        citationUrl: sourceUrl,
        finalUrl: sourceUrl,
        title: request.citation.title ?? "Synthetic title",
        verifiedExcerpt: claim,
        locator: {
          exact: claim,
          prefix: "",
          suffix: "",
          occurrenceIndex: 0,
          finalUrl: sourceUrl,
          citationUrl: sourceUrl,
          retrievedAt: "2026-08-26T00:00:00.000Z",
          normalizedTextSha256: "0".repeat(64),
          contentType: "text/html; charset=utf-8",
          bytesRead: 64,
          redirectCount: 0,
        },
        sourceFetchCount: 1,
        sourceVerificationMs: 10,
      };
    },
  };
}

function providerFor(result: ProviderResearchResult | Error): ResearchProvider {
  return {
    async research() {
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

async function executeWith(options: {
  readonly result: ProviderResearchResult | Error;
  readonly sourceVerifier?: SourceVerifier;
  readonly persistFailure?: (receipt: FailureReceipt) => void | Promise<void>;
  readonly onTerminal?: (event: ResearchProgressEvent) => void;
  readonly validateDossier?: () => { readonly ok: false; readonly errors: [] };
  readonly logger?: (record: Readonly<Record<string, unknown>>) => void;
}): Promise<ResearchProgressEvent[]> {
  const events: ResearchProgressEvent[] = [];
  await executeResearch({
    input: { name: "Airbus SE", context: "Synthetic public context" },
    provider: providerFor(options.result),
    sourceVerifier: options.sourceVerifier ?? successfulSourceVerifier(),
    signal: new AbortController().signal,
    acceptedMs: 1,
    emit: (event) => events.push(event),
    logger: { info: options.logger ?? (() => undefined) },
    ...(options.persistFailure === undefined
      ? {}
      : { persistFailure: options.persistFailure }),
    ...(options.onTerminal === undefined ? {} : { onTerminal: options.onTerminal }),
    ...(options.validateDossier === undefined
      ? {}
      : { validateDossier: options.validateDossier }),
  });
  return events;
}

function parseSerialized(bytes: Uint8Array): ResearchProgressEvent {
  const body = new TextDecoder().decode(bytes);
  const data = body
    .split(/\r?\n/u)
    .find((line) => line.startsWith("data: "))
    ?.slice(6);
  if (data === undefined) throw new Error("Synthetic SSE payload missing");
  return JSON.parse(data) as ResearchProgressEvent;
}

describe("safe failure classification with installed AI SDK errors", () => {
  it.each([
    ["content_type_missing", null],
    ["content_type_multiple", null],
    ["content_type_conflicting", null],
    ["content_type_syntax_invalid", null],
    ["media_type_unsupported", "application_pdf"],
  ] as const)(
    "keeps safe Content-Type diagnostic %s in a failure receipt",
    (reasonCode, sourceMediaTypeClass) => {
      const diagnostics = {
        reasonCode,
        sourceMediaTypeClass,
      } as ContentTypeRejectionDiagnostics;
      const receipt = buildFailureReceipt(
        new ResearchPipelineError(
          "source_content_type_rejected",
          "secret=SHOULD_NOT_LEAK Authorization sk-test-marker\r\n" +
            "long-private-header".repeat(512),
          { sourceFetchCount: 1, sourceVerificationMs: 7 },
          diagnostics,
        ),
        {
          attemptId: "attempt-content-type",
          failedStage: "source_verification",
          validationCode: "source_content_type_rejected",
          result: providerResult(),
          sourceFetchCount: 1,
          sourceVerificationMs: 7,
          observedAt: new Date("2026-08-27T00:00:00.000Z"),
        },
      );
      expect(receipt).toMatchObject({
        publicCode: "source_content_type_rejected",
        failedStage: "source_verification",
        category: "source_metadata_missing",
        reasonCode,
        sourceMediaTypeClass,
        retryable: false,
        sourceFetchCount: 1,
      });
      const serialized = JSON.stringify(receipt);
      for (const forbidden of [
        "SHOULD_NOT_LEAK",
        "Authorization",
        "sk-test-marker",
        "long-private-header",
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    },
  );

  it("treats rejected individual source proofs as dossier gaps, not leaked failures", async () => {
    const marker = "PRIVATE_SOURCE_REJECTION_MARKER";
    const events = await executeWith({
        result: providerResult(),
        sourceVerifier: {
          async verify() {
            throw new ResearchPipelineError(
              "source_content_type_rejected",
              marker,
              { sourceFetchCount: 1, sourceVerificationMs: 7 },
            );
          },
        },
      });
    expect(events.at(-1)).toMatchObject({
      state: "completed",
      dossier: {
        result_mode: "silence",
        global_status: "insufficient_evidence",
        claims: [],
        unknowns: [
          expect.objectContaining({ category: "source_inaccessible" }),
        ],
      },
    });
    expect(JSON.stringify(events)).not.toContain(marker);
  });

  it("drops non-allowlisted Content-Type diagnostics at runtime", () => {
    const receipt = buildFailureReceipt(
      new ResearchPipelineError(
        "source_content_type_rejected",
        "RAW_CONTENT_TYPE_MESSAGE_FORBIDDEN",
        { sourceFetchCount: 1, sourceVerificationMs: 7 },
        {
          reasonCode: "media_type_unsupported",
          sourceMediaTypeClass: "application/pdf; secret=SHOULD_NOT_LEAK",
        } as unknown as ContentTypeRejectionDiagnostics,
      ),
      {
        attemptId: "attempt-synthetic",
        failedStage: "source_verification",
        validationCode: "source_content_type_rejected",
        result: providerResult(),
        sourceFetchCount: 1,
        sourceVerificationMs: 7,
      },
    );
    expect(receipt).toMatchObject({
      publicCode: "source_content_type_rejected",
      reasonCode: null,
      sourceMediaTypeClass: null,
      retryable: false,
    });
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain("application/pdf");
    expect(serialized).not.toContain("SHOULD_NOT_LEAK");
    expect(serialized).not.toContain("RAW_CONTENT_TYPE_MESSAGE_FORBIDDEN");
  });

  it.each([
    "invalid_provider_shape",
    "invalid_claim_length",
    "non_atomic_claim",
    "source_metadata_missing",
    "inspection_url_missing",
    "inspection_url_invalid",
    "inspection_url_ambiguous",
    "inspection_url_mismatch",
  ])("preserves allowlisted reason code %s", (reasonCode) => {
    const receipt = buildFailureReceipt(
      new ResearchPipelineError(reasonCode, "RAW_VALIDATION_MESSAGE_FORBIDDEN"),
      {
        attemptId: "attempt-synthetic",
        failedStage: "truth_validation",
        validationCode: reasonCode,
        result: providerResult(),
        observedAt: new Date("2026-08-26T00:00:00.000Z"),
      },
    );
    expect(receipt.reasonCode).toBe(reasonCode);
    expect(JSON.stringify(receipt)).not.toContain("RAW_VALIDATION_MESSAGE_FORBIDDEN");
  });

  it("replaces an unknown validation reason with null", () => {
    const receipt = buildFailureReceipt(
      new ResearchPipelineError("future_unknown_code", "RAW_UNKNOWN_MESSAGE_FORBIDDEN"),
      {
        attemptId: "attempt-synthetic",
        failedStage: "truth_validation",
        validationCode: "future_unknown_code",
        result: providerResult(),
      },
    );
    expect(receipt.reasonCode).toBeNull();
    expect(JSON.stringify(receipt)).not.toContain("future_unknown_code");
    expect(JSON.stringify(receipt)).not.toContain("RAW_UNKNOWN_MESSAGE_FORBIDDEN");
  });

  it("records exact output shape metrics without output content", () => {
    const marker = "SENSITIVE_PROVIDER_OUTPUT_MARKER_FORBIDDEN";
    const output = `${marker}🙂\nsecond line\r\n\r\n`;
    const receipt = buildFailureReceipt(
      new ResearchPipelineError("invalid_provider_shape", "Synthetic invalid shape"),
      {
        attemptId: "attempt-synthetic",
        failedStage: "truth_validation",
        validationCode: "invalid_provider_shape",
        result: providerResult({ text: output }),
      },
    );
    expect(receipt).toMatchObject({
      outputPresent: true,
      outputCharacterCount: Array.from(output).length,
      outputLineCount: 2,
      terminalLineBreakCount: 2,
    });
    expect(JSON.stringify(receipt)).not.toContain(marker);
  });

  it("maps APICallError 401 to authentication and non-retryable", () => {
    expect(classify(wrapped(apiCallError(401, false)))).toMatchObject({
      category: "authentication",
      retryable: false,
      httpStatus: 401,
      callsAttempted: 1,
    });
  });

  it("maps APICallError 429 using the installed retryability field", () => {
    expect(classify(wrapped(apiCallError(429, true)))).toMatchObject({
      category: "rate_limit",
      retryable: true,
      httpStatus: 429,
    });
  });

  it("maps APICallError 5xx to provider_unavailable", () => {
    expect(classify(wrapped(apiCallError(503, true)))).toMatchObject({
      category: "provider_unavailable",
      retryable: true,
      httpStatus: 503,
    });
  });

  it("maps APICallError 403 to permission", () => {
    expect(classify(wrapped(apiCallError(403, false)))).toMatchObject({
      category: "permission",
      retryable: false,
      httpStatus: 403,
    });
  });

  it("maps other APICallError statuses to provider_request", () => {
    expect(classify(wrapped(apiCallError(400, false)))).toMatchObject({
      category: "provider_request",
      retryable: false,
      httpStatus: 400,
    });
  });

  it("maps an APICallError without status to network", () => {
    expect(classify(wrapped(apiCallError(undefined, true)))).toMatchObject({
      category: "network",
      retryable: true,
      httpStatus: null,
    });
  });

  it("maps a native timeout without guessing from a message", () => {
    const error = new ProviderInvocationError(
      new DOMException("Synthetic timeout", "TimeoutError"),
      { callsAttempted: 1, durationMs: 120_000, abortReasonName: "TimeoutError" },
    );
    expect(classify(error)).toMatchObject({
      category: "timeout",
      publicCode: "provider_timeout",
      retryable: true,
    });
  });

  it("retains allowlisted NoObjectGeneratedError usage and finish reason only", () => {
    const error = new NoObjectGeneratedError({
      text: "RAW_GENERATED_TEXT_FORBIDDEN",
      response: {
        id: "req-no-object-private",
        timestamp: new Date("2026-08-26T00:00:00.000Z"),
        modelId: "gpt-5.6-luna",
        headers: { "x-request-id": "req-no-object-private" },
        body: { output: "RAW_PROVIDER_BODY_FORBIDDEN" },
      },
      usage: {
        inputTokens: 12,
        inputTokenDetails: {
          noCacheTokens: 12,
          cacheReadTokens: 0,
          cacheWriteTokens: void 0,
        },
        outputTokens: 3,
        outputTokenDetails: { textTokens: 3, reasoningTokens: 0 },
        totalTokens: 15,
      },
      finishReason: "length",
    });
    const receipt = classify(wrapped(error));
    expect(receipt).toMatchObject({
      category: "structured_output_invalid",
      finishReason: "length",
      usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 },
      requestIdPresent: true,
    });
    expect(JSON.stringify(receipt)).not.toContain("RAW_");
    expect(JSON.stringify(receipt)).not.toContain("req-no-object-private");
  });

  it("maps the installed NoOutputGeneratedError guard", () => {
    const receipt = classify(wrapped(new NoOutputGeneratedError()));
    expect(receipt).toMatchObject({
      category: "no_output",
      publicCode: "provider_no_output",
    });
  });

  it("maps the installed LoadAPIKeyError guard to configuration", () => {
    const receipt = classify(
      wrapped(new LoadAPIKeyError({ message: "Synthetic missing key" }), 0),
    );
    expect(receipt).toMatchObject({
      category: "configuration",
      failedStage: "configuration",
      callsAttempted: 0,
    });
  });

  it("unwraps the installed RetryError without serializing its error chain", () => {
    const apiError = apiCallError(429, true);
    const retryError = new RetryError({
      message: "RAW_RETRY_MESSAGE_FORBIDDEN",
      reason: "maxRetriesExceeded",
      errors: [apiError],
    });
    const receipt = classify(wrapped(retryError));
    expect(receipt).toMatchObject({ category: "rate_limit", retryable: true });
    expect(JSON.stringify(receipt)).not.toContain("RAW_RETRY_MESSAGE_FORBIDDEN");
  });

  it("keeps unknown usage and cost null rather than zero", () => {
    const receipt = classify(wrapped(new NoOutputGeneratedError()));
    expect(receipt.usage).toBeNull();
    expect(receipt.estimatedCostUsd).toBeNull();
    expect(receipt.toolCallCount).toBeNull();
    expect(receipt.sourceCount).toBeNull();
  });

  it("drops provider bodies, prompts, names, contexts, headers, causes and secrets", () => {
    const receipt = classify(wrapped(apiCallError(401, false)));
    const serialized = JSON.stringify(receipt);
    for (const forbidden of [
      "RAW_PROVIDER_MESSAGE_FORBIDDEN",
      "RAW_PROMPT_FORBIDDEN",
      "PRIVATE_NAME_FORBIDDEN",
      "PRIVATE_CONTEXT_FORBIDDEN",
      "RAW_RESPONSE_BODY_FORBIDDEN",
      "Bearer SECRET_FORBIDDEN",
      "RAW_CAUSE_FORBIDDEN",
      "req-private-123",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("stores a deterministic request ID digest and never the clear value", () => {
    const receipt = classify(wrapped(apiCallError(401, false)));
    expect(receipt.requestIdDigest).toBe(digestProviderRequestId("req-private-123"));
    expect(JSON.stringify(receipt)).not.toContain("req-private-123");
  });
});

describe("terminal failure guarantees", () => {
  it("keeps sensitive provider output out of receipts, logs and events", async () => {
    const marker = "SENSITIVE_PROVIDER_OUTPUT_MARKER_FORBIDDEN";
    const logs: Readonly<Record<string, unknown>>[] = [];
    const events = await executeWith({
      result: providerResult({ text: `${marker}\nINVALID` }),
      logger: (record) => logs.push(record),
    });
    const serialized = JSON.stringify({ events, logs });
    expect(serialized).not.toContain(marker);
    expect(events.at(-1)).toMatchObject({ state: "completed" });
  });

  it("classifies a truth-contract rejection after provider completion", async () => {
    const events = await executeWith({
      result: providerResult(),
      validateDossier: () => ({ ok: false, errors: [] }),
    });
    expect(events.at(-1)).toMatchObject({
      state: "failed",
      receipt: {
        category: "truth_contract_rejected",
        failedStage: "truth_validation",
        callsAttempted: 1,
      },
    });
  });

  it("discards every unverifiable excerpt and returns honest insufficiency", async () => {
    const events: ResearchProgressEvent[] = [];
    await executeResearch({
      input: { name: "Airbus SE" },
      provider: providerFor(providerResult()),
      sourceVerifier: {
        async verify() {
          throw new ResearchPipelineError("source_excerpt_missing", "Synthetic miss", {
            sourceFetchCount: 1,
            sourceVerificationMs: 10,
          });
        },
      },
      signal: new AbortController().signal,
      acceptedMs: 1,
      emit: (event) => events.push(event),
      logger: { info: () => undefined },
    });
    expect(events.at(-1)).toMatchObject({
      state: "completed",
      dossier: {
        result_mode: "silence",
        global_status: "insufficient_evidence",
        claims: [],
        evidence: [],
        sources: [],
        unknowns: [expect.objectContaining({ category: "source_inaccessible" })],
      },
      receipt: { sourceFetchCount: 2 },
    });
  });

  it("turns terminal serialization failure into one safe failed event", () => {
    const source = classify(wrapped(new NoOutputGeneratedError()));
    const event: ResearchProgressEvent = {
      state: "failed",
      executionId: source.attemptId,
      elapsedMs: 42,
      error: { code: source.publicCode, message: "Generic", retryable: false },
      receipt: source,
    };
    const serialized = serializeResearchEvent(event, () => {
      throw new TypeError("Synthetic serializer failure");
    });
    const decoded = parseSerialized(serialized.bytes);
    expect(decoded).toMatchObject({
      state: "failed",
      receipt: { category: "serialization", failedStage: "serialization" },
    });
    expect(new TextDecoder().decode(serialized.bytes).match(/event: failed/gu)).toHaveLength(1);
  });

  it("keeps a minimal in-memory receipt when persistence fails", async () => {
    const persisted: FailureReceipt[] = [];
    const events = await executeWith({
      result: wrapped(new NoOutputGeneratedError()),
      persistFailure(receipt) {
        persisted.push(receipt);
        throw new Error("Synthetic persistence failure");
      },
    });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.receiptPersistence).toBe("file");
    expect(events.at(-1)).toMatchObject({
      state: "failed",
      receipt: { receiptPersistence: "memory" },
    });
  });

  it("records exactly one terminal event even when terminal delivery throws", async () => {
    const terminal: ResearchProgressEvent[] = [];
    const emitted: ResearchProgressEvent[] = [];
    await executeResearch({
      input: { name: "Airbus SE" },
      provider: providerFor(wrapped(new NoOutputGeneratedError())),
      sourceVerifier: successfulSourceVerifier(),
      signal: new AbortController().signal,
      acceptedMs: 1,
      emit(event) {
        if (event.state === "failed" || event.state === "completed") {
          throw new Error("Synthetic abandoned client");
        }
        emitted.push(event);
      },
      onTerminal: (event) => terminal.push(event),
      logger: { info: () => undefined },
    });
    expect(terminal).toHaveLength(1);
    expect(terminal[0]?.state).toBe("failed");
    expect(emitted.filter(({ state }) => state === "failed" || state === "completed")).toHaveLength(0);
  });

  it("exposes a structured URL only after direct excerpt verification", async () => {
    const events = await executeWith({
      result: providerResult({
        text,
        citations: [],
        sources: [],
        webSearchCalls: [{
          toolCallId: "tool-synthetic",
          sources: [],
        }],
      }),
    });
    expect(events.at(-1)).toMatchObject({
      state: "completed",
      dossier: {
        result_mode: "standard",
        global_status: "partial",
        claims: [{ statement: claim, claim_state: "supported" }],
        evidence: [{ excerpt: claim, verification_method: "source_content" }],
        sources: [{ provider_url: sourceUrl, accessibility_status: "accessible" }],
      },
    });
  });
});

function requireProbeInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function literalCount(value: string, literal: string): number {
  return value.split(literal).length - 1;
}

function validateActiveProbeTarget(probe: string): string {
  const declarations = [
    ...probe.matchAll(/^\$missionAttempt = 'attempt-(\d{3})'\r?$/gmu),
  ];
  requireProbeInvariant(declarations.length === 1, "strict attempt target");
  const target = declarations[0]?.[1];
  requireProbeInvariant(target !== undefined, "attempt target digits");

  requireProbeInvariant(
    [...probe.matchAll(/^\s*\[string\]\$OutputPath\s*=/gmu)].length === 1,
    "single output target",
  );
  const proofTargets = [
    ...probe.matchAll(
      /'docs\\evidence\\m5-attempt-(\d{3})-live-result\.json'/gu,
    ),
  ];
  requireProbeInvariant(proofTargets.length === 1, "canonical evidence target");
  requireProbeInvariant(proofTargets[0]?.[1] === target, "attempt/evidence target mismatch");

  const attemptLiterals = [...probe.matchAll(/attempt-(\d+)/gu)];
  const statusLiterals = [...probe.matchAll(/M5_R3_LIVE_ATTEMPT_(\d+)_/gu)];
  requireProbeInvariant(attemptLiterals.length === 2, "active attempt literal count");
  requireProbeInvariant(statusLiterals.length > 0, "attempt status linkage");
  requireProbeInvariant(
    [...attemptLiterals, ...statusLiterals].every(
      (match) => match[1]?.length === 3 && match[1] === target,
    ),
    "inconsistent internal attempt target",
  );
  requireProbeInvariant(
    literalCount(probe, "attempt = $missionAttempt") === 3 &&
      literalCount(probe, "$Value.attempt -ceq $missionAttempt") === 1,
    "attempt variable linkage",
  );

  requireProbeInvariant(
    literalCount(
      probe,
      "Assert-Probe (-not (Test-Path -LiteralPath $OutputPath)) 'output already exists'",
    ) === 1 &&
      literalCount(
        probe,
        "Assert-Probe (-not (Test-Path -LiteralPath $resolvedOutput)) 'output already exists'",
      ) === 1 &&
      literalCount(
        probe,
        "[System.IO.File]::Move($temporary, $resolvedOutput, $false)",
      ) === 1,
    "non-overwriting evidence persistence",
  );
  requireProbeInvariant(
    probe.includes("output must stay inside the repository") &&
      probe.includes("output directory is unavailable"),
    "canonical evidence directory boundary",
  );
  requireProbeInvariant(
    literalCount(probe, "name = 'Airbus SE'") === 1 &&
      literalCount(
        probe,
        "context = 'Corporate parent entity; not an aircraft model or a local subsidiary.'",
      ) === 1 &&
      literalCount(probe, "$costCeilingUsd = 0.05") === 1 &&
      literalCount(probe, "input = $probeInput") === 3,
    "probe mission invariants",
  );
  return target;
}

describe("M1 transport replay", () => {
  it("keeps attempts 001 through 008 immutable and validates a version-agnostic probe target", () => {
    const root = process.cwd();
    const immutableAttempts = [
      ["m5-attempt-001-failure.json", "7f4ef1c935290225c834254005d41e439ccfa9260ae51358ab94cfc6dc663d2a"],
      ["m5-attempt-002-live-result.json", "5a41d8bad3f55a9e82c1c5375c384da0412d5ee7d7fcf18c2ba83b39fc4bfb2d"],
      ["m5-attempt-003-live-result.json", "ae63d79465ffd3c087144999656b04957c4005fca49b474cee99c486c707aa71"],
      ["m5-attempt-004-live-result.json", "21341a013b006a4f7c6b341c2832720edbff2355ffad66d6bac0094fa34dcef6"],
      ["m5-attempt-005-live-result.json", "0a5940ee8f8e9e01217a12293a774ff574c71e5611c5a4a14aef8d256e761fff"],
      ["m5-attempt-006-live-result.json", "83decc2cc731a86eccf7b0aff7b5ebd66e11718dbb2a9dcaf2c87353ac606c3b"],
      ["m5-attempt-007-live-result.json", "4e80bd3f3836ce8f84e7318ed4f543fdec9b2fa993812c2d6bf9e602b830b526"],
      ["m5-attempt-008-live-result.json", "0ff878a52ab37215088129825b1b3f64ab08f0a94d282792f8cae97f6727756a"],
    ] as const;
    for (const [file, expectedHash] of immutableAttempts) {
      const evidence = readFileSync(join(root, "docs/evidence", file));
      expect(createHash("sha256").update(evidence).digest("hex"), file).toBe(
        expectedHash,
      );
    }

    const probe = readFileSync(
      join(root, "tools/probes/m5-vertical-slice.ps1"),
      "utf8",
    );
    const target = validateActiveProbeTarget(probe);
    const nextTarget = String(Number(target) + 1).padStart(3, "0");
    const advancedProbe = probe
      .replaceAll(`attempt-${target}`, `attempt-${nextTarget}`)
      .replaceAll(`ATTEMPT_${target}`, `ATTEMPT_${nextTarget}`);
    expect(validateActiveProbeTarget(advancedProbe)).toBe(nextTarget);

    const outputTarget = `docs\\evidence\\m5-attempt-${target}-live-result.json`;
    const outputRefusal =
      "Assert-Probe (-not (Test-Path -LiteralPath $OutputPath)) 'output already exists'";
    const resolvedOutputRefusal =
      "Assert-Probe (-not (Test-Path -LiteralPath $resolvedOutput)) 'output already exists'";
    const invalidProbes = [
      [
        "identifier/evidence mismatch",
        probe.replace(outputTarget, `docs\\evidence\\m5-attempt-${nextTarget}-live-result.json`),
      ],
      [
        "non-three-digit target",
        probe
          .replaceAll(`attempt-${target}`, `attempt-${target.slice(1)}`)
          .replaceAll(`ATTEMPT_${target}`, `ATTEMPT_${target.slice(1)}`),
      ],
      [
        "multiple active targets",
        `${probe}\n$missionAttempt = 'attempt-${nextTarget}'\n`,
      ],
      [
        "evidence outside canonical directory",
        probe.replace(outputTarget, `tmp\\m5-attempt-${target}-live-result.json`),
      ],
      [
        "overwrite refusal removed",
        probe.replace(outputRefusal, "").replace(resolvedOutputRefusal, ""),
      ],
      [
        "non-canonical evidence name",
        probe.replace(
          `m5-attempt-${target}-live-result.json`,
          `m5-attempt-${target}-result.json`,
        ),
      ],
      [
        "internal status target mismatch",
        probe.replace(
          `M5_R3_LIVE_ATTEMPT_${target}_FAILED`,
          `M5_R3_LIVE_ATTEMPT_${nextTarget}_FAILED`,
        ),
      ],
    ] as const;
    for (const [name, invalidProbe] of invalidProbes) {
      expect(() => validateActiveProbeTarget(invalidProbe), name).toThrow();
    }
  });

  it("reads the retained M1 source, citation, usage and tool-call shape without treating it as product output", () => {
    expect(m1Replay.marker).toBe("PROVIDER_TRANSPORT_REPLAY — NOT PRODUCT OUTPUT");
    const message = m1Replay.output.find(({ type }) => type === "message");
    const webSearch = m1Replay.output.find(({ type }) => type === "web_search_call");
    const normalized = normalizeOpenAIProviderMetadata({
      generatedText: "NOT_RETAINED",
      content: message?.content ?? [],
      sources: [],
      toolCalls: [],
    });
    expect(webSearch?.status).toBe("completed");
    expect(webSearch?.source_urls_not_separately_retained).toBe(true);
    expect(m1Replay.retained_url_union).toHaveLength(17);
    expect(normalized).toMatchObject({ status: "unknown", citations: [] });
    expect(m1Replay.usage).toEqual({
      input_tokens: 8593,
      cached_input_tokens: 0,
      output_tokens: 72,
      reasoning_output_tokens: 36,
      total_tokens: 8665,
    });
    expect(m1Replay.not_retained).toContain("source_excerpt");
  });

  it("reads the flat annotation form exported by the installed OpenAI adapter", () => {
    expect(
      normalizeOpenAIProviderMetadata({
        generatedText: "Synthetic claim",
        content: [
        {
          type: "text",
          text: "Synthetic claim",
          providerMetadata: {
            openai: {
              itemId: "item-synthetic",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://source.public.org/document",
                  title: "Synthetic source",
                  start_index: 0,
                  end_index: 15,
                },
              ],
            },
          },
        },
        ],
        sources: [{
          sourceType: "url",
          id: "source-synthetic",
          url: "https://source.public.org/document",
          title: "Synthetic source",
        }],
        toolCalls: [{ toolName: "web_search", toolCallId: "tool-synthetic" }],
      }),
    ).toMatchObject({
      status: "supported",
      citations: [{
        url: "https://source.public.org/document",
        generatedTextStart: 0,
        generatedTextEnd: 15,
      }],
    });
  });
});
