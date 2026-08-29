import { createHash } from "node:crypto";

import {
  APICallError,
  LoadAPIKeyError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  RetryError,
} from "ai";

import {
  PRIMARY_RESEARCH_MODEL,
  ProviderInvocationError,
} from "../ai/providers";
import {
  CONTENT_TYPE_REJECTION_REASON_CODES,
  ResearchPipelineError,
  SOURCE_MEDIA_TYPE_CLASSES,
  type ContentTypeRejectionReasonCode,
  type SourceMediaTypeClass,
} from "./errors";
import {
  FAILURE_REASON_CODES,
  type FailureCategory,
  type FailureReasonCode,
  type FailureReceipt,
  type FailureStage,
  type ProviderResearchResult,
  type ProviderUsage,
} from "./types";

interface FailureContext {
  readonly attemptId: string;
  readonly failedStage: FailureStage;
  readonly result?: ProviderResearchResult | null;
  readonly validationCode?: string;
  readonly durationMs?: number | null;
  readonly sourceFetchCount?: number | null;
  readonly sourceVerificationMs?: number | null;
  readonly observedAt?: Date;
  readonly receiptPersistence?: "memory" | "file";
}

interface Classification {
  readonly category: FailureCategory;
  readonly publicCode: string;
  readonly retryable: boolean;
  readonly failedStage?: FailureStage;
  readonly httpStatus?: number | null;
}

function finiteOrNull(value: number | undefined | null): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : null;
}

function safeReasonCode(code: string | undefined): FailureReasonCode | null {
  return code !== undefined && FAILURE_REASON_CODES.includes(code as FailureReasonCode)
    ? (code as FailureReasonCode)
    : null;
}

function safeContentTypeDiagnostics(error: unknown): {
  readonly reasonCode: ContentTypeRejectionReasonCode;
  readonly sourceMediaTypeClass: SourceMediaTypeClass | null;
} | null {
  if (
    !(error instanceof ResearchPipelineError) ||
    error.code !== "source_content_type_rejected"
  ) return null;
  const diagnostics = error.contentTypeDiagnostics;
  if (
    diagnostics === undefined ||
    !CONTENT_TYPE_REJECTION_REASON_CODES.includes(diagnostics.reasonCode)
  ) return null;
  if (diagnostics.reasonCode !== "media_type_unsupported") {
    return { reasonCode: diagnostics.reasonCode, sourceMediaTypeClass: null };
  }
  return SOURCE_MEDIA_TYPE_CLASSES.includes(diagnostics.sourceMediaTypeClass)
    ? {
        reasonCode: diagnostics.reasonCode,
        sourceMediaTypeClass: diagnostics.sourceMediaTypeClass,
      }
    : null;
}

function outputShape(text: string | undefined): {
  readonly outputPresent: boolean | null;
  readonly outputCharacterCount: number | null;
  readonly outputLineCount: number | null;
  readonly terminalLineBreakCount: number | null;
} {
  if (text === undefined) {
    return {
      outputPresent: null,
      outputCharacterCount: null,
      outputLineCount: null,
      terminalLineBreakCount: null,
    };
  }
  const terminalLineBreaks = text.match(/(?:(?:\r\n)|\n)+$/u)?.[0] ?? "";
  const terminalLineBreakCount = terminalLineBreaks.match(/\r\n|\n/gu)?.length ?? 0;
  const envelope = text.slice(0, text.length - terminalLineBreaks.length);
  return {
    outputPresent: text.length > 0,
    outputCharacterCount: Array.from(text).length,
    outputLineCount: envelope.length === 0 ? 0 : envelope.split(/\r?\n/u).length,
    terminalLineBreakCount,
  };
}

function safeUsage(usage: ProviderUsage | undefined): FailureReceipt["usage"] {
  if (usage === undefined) return null;
  return {
    inputTokens: finiteOrNull(usage.inputTokens),
    cachedInputTokens: finiteOrNull(usage.cachedInputTokens),
    outputTokens: finiteOrNull(usage.outputTokens),
    reasoningTokens: finiteOrNull(usage.reasoningTokens),
    totalTokens: finiteOrNull(usage.totalTokens),
  };
}

function usageFromNoObject(error: NoObjectGeneratedError): FailureReceipt["usage"] {
  const usage = error.usage;
  if (usage === undefined) return null;
  return {
    inputTokens: finiteOrNull(usage.inputTokens),
    cachedInputTokens: finiteOrNull(usage.inputTokenDetails.cacheReadTokens),
    outputTokens: finiteOrNull(usage.outputTokens),
    reasoningTokens: finiteOrNull(usage.outputTokenDetails.reasoningTokens),
    totalTokens: finiteOrNull(usage.totalTokens),
  };
}

function headerValue(
  headers: Readonly<Record<string, string>> | undefined,
  names: readonly string[],
): string | null {
  if (headers === undefined) return null;
  for (const [key, value] of Object.entries(headers)) {
    if (names.includes(key.toLowerCase()) && value.length > 0) return value;
  }
  return null;
}

function requestIdFromError(error: unknown): string | null {
  if (APICallError.isInstance(error)) {
    return headerValue(error.responseHeaders, [
      "x-request-id",
      "request-id",
      "openai-request-id",
    ]);
  }
  if (NoObjectGeneratedError.isInstance(error)) {
    return headerValue(error.response?.headers, [
      "x-request-id",
      "request-id",
      "openai-request-id",
    ]);
  }
  if (RetryError.isInstance(error)) return requestIdFromError(error.lastError);
  return null;
}

export function digestProviderRequestId(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

function errorName(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("name" in error)) return null;
  return typeof (error as { readonly name?: unknown }).name === "string"
    ? (error as { readonly name: string }).name
    : null;
}

function validationClassification(code: string): Classification {
  if (
    code === "web_search_action_invalid" || code === "web_search_not_unique"
  ) {
    return {
      category: "provider_request",
      publicCode: code,
      retryable: false,
      failedStage: "metadata_extraction",
    };
  }
  if (
    [
      "invalid_provider_shape",
      "invalid_claim_length",
      "non_atomic_claim",
    ].includes(code)
  ) {
    return {
      category: "structured_output_invalid",
      publicCode: "structured_output_invalid",
      retryable: false,
      failedStage: "truth_validation",
    };
  }
  if (
    [
      "ambiguous_source_relation",
      "missing_source_title",
      "source_not_in_provider_metadata",
      "source_excerpt_missing",
      "invalid_source_url",
      "provider_citation_missing",
      "provider_citation_unbound",
      "provider_source_url_missing",
      "source_url_rejected",
      "source_dns_rejected",
      "source_redirect_rejected",
      "source_body_too_large",
      "source_content_type_rejected",
      "source_http_error",
      "source_charset_rejected",
      "source_empty",
      "source_parse_failed",
      "source_excerpt_ambiguous",
      "source_metadata_missing",
      "inspection_url_missing",
      "inspection_url_invalid",
      "inspection_url_ambiguous",
      "inspection_url_mismatch",
    ].includes(code)
  ) {
    return {
      category: "source_metadata_missing",
      publicCode: code,
      retryable: false,
      failedStage:
        code.startsWith("provider_") ||
        code === "source_metadata_missing" ||
        code.startsWith("inspection_url_")
          ? "metadata_extraction"
          : "source_verification",
    };
  }
  if (code === "source_timeout") {
    return {
      category: "timeout",
      publicCode: code,
      retryable: true,
      failedStage: "source_verification",
    };
  }
  if (code === "source_transport_error") {
    return {
      category: "network",
      publicCode: code,
      retryable: true,
      failedStage: "source_verification",
    };
  }
  if (
    [
      "m2_contract_invalid",
      "m2_receipt_usage_missing",
      "runtime_invariants_invalid",
      "cost_limit_exceeded",
    ].includes(code)
  ) {
    return {
      category: "truth_contract_rejected",
      publicCode: "truth_contract_rejected",
      retryable: false,
      failedStage: "truth_validation",
    };
  }
  return {
    category: "internal_unknown",
    publicCode: "internal_failure",
    retryable: false,
  };
}

function classify(error: unknown, validationCode?: string): Classification {
  if (validationCode !== undefined) return validationClassification(validationCode);

  if (LoadAPIKeyError.isInstance(error)) {
    return {
      category: "configuration",
      publicCode: "configuration_unavailable",
      retryable: false,
      failedStage: "configuration",
    };
  }

  if (RetryError.isInstance(error)) {
    return classify(error.lastError);
  }

  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? null;
    if (status === 401) {
      return {
        category: "authentication",
        publicCode: "provider_authentication_failed",
        retryable: false,
        failedStage: "provider_request",
        httpStatus: status,
      };
    }
    if (status === 403) {
      return {
        category: "permission",
        publicCode: "provider_permission_denied",
        retryable: false,
        failedStage: "provider_request",
        httpStatus: status,
      };
    }
    if (status === 429) {
      return {
        category: "rate_limit",
        publicCode: "provider_rate_limited",
        retryable: error.isRetryable,
        failedStage: "provider_request",
        httpStatus: status,
      };
    }
    if (status !== null && status >= 500) {
      return {
        category: "provider_unavailable",
        publicCode: "provider_unavailable",
        retryable: error.isRetryable,
        failedStage: "provider_request",
        httpStatus: status,
      };
    }
    if (status === 408) {
      return {
        category: "timeout",
        publicCode: "provider_timeout",
        retryable: error.isRetryable,
        failedStage: "provider_request",
        httpStatus: status,
      };
    }
    if (status === null) {
      return {
        category: "network",
        publicCode: "provider_network_failed",
        retryable: error.isRetryable,
        failedStage: "provider_request",
        httpStatus: null,
      };
    }
    return {
      category: "provider_request",
      publicCode: "provider_request_failed",
      retryable: error.isRetryable,
      failedStage: "provider_request",
      httpStatus: status,
    };
  }

  if (NoObjectGeneratedError.isInstance(error)) {
    return {
      category: "structured_output_invalid",
      publicCode: "structured_output_invalid",
      retryable: false,
      failedStage: "generation",
    };
  }

  if (NoOutputGeneratedError.isInstance(error)) {
    return {
      category: "no_output",
      publicCode: "provider_no_output",
      retryable: false,
      failedStage: "generation",
    };
  }

  const name = errorName(error);
  if (name === "TimeoutError" || name === "AbortError") {
    return {
      category: "timeout",
      publicCode: "provider_timeout",
      retryable: true,
      failedStage: "provider_request",
    };
  }

  return {
    category: "internal_unknown",
    publicCode: "internal_failure",
    retryable: false,
  };
}

function unwrapProviderError(error: unknown): {
  readonly raw: unknown;
  readonly callsAttempted: number | null;
  readonly durationMs: number | null;
  readonly abortReasonName: string | null;
} {
  if (!(error instanceof ProviderInvocationError)) {
    return { raw: error, callsAttempted: null, durationMs: null, abortReasonName: null };
  }
  return {
    raw: error.getSdkError(),
    callsAttempted: error.diagnostics.callsAttempted,
    durationMs: error.diagnostics.durationMs,
    abortReasonName: error.diagnostics.abortReasonName,
  };
}

function stableObservedAt(value: Date | undefined): string {
  const candidate = value ?? new Date();
  return Number.isFinite(candidate.getTime())
    ? candidate.toISOString()
    : "1970-01-01T00:00:00.000Z";
}

export function buildFailureReceipt(
  error: unknown,
  context: FailureContext,
): FailureReceipt {
  const provider = unwrapProviderError(error);
  let classification = classify(provider.raw, context.validationCode);
  if (context.failedStage === "serialization") {
    classification = {
      category: "serialization",
      publicCode: "terminal_serialization_failed",
      retryable: false,
      failedStage: "serialization",
    };
  } else if (context.failedStage === "persistence") {
    classification = {
      category: "internal_unknown",
      publicCode: "receipt_persistence_failed",
      retryable: false,
      failedStage: "persistence",
    };
  }
  if (provider.abortReasonName === "TimeoutError") {
    classification = {
      category: "timeout",
      publicCode: "provider_timeout",
      retryable: true,
      failedStage: "provider_request",
    };
  }

  const noObject = NoObjectGeneratedError.isInstance(provider.raw)
    ? provider.raw
    : RetryError.isInstance(provider.raw) &&
        NoObjectGeneratedError.isInstance(provider.raw.lastError)
      ? provider.raw.lastError
      : null;
  const result = context.result ?? null;
  const clearRequestId =
    requestIdFromError(provider.raw) ?? result?.requestId ?? null;
  const durationMs = finiteOrNull(
    context.durationMs ?? provider.durationMs ?? result?.providerDurationMs,
  );
  const shape = outputShape(result?.text);
  const contentTypeDiagnostics = safeContentTypeDiagnostics(provider.raw);

  return {
    attemptId: context.attemptId,
    terminalStatus: "failed",
    failedStage: classification.failedStage ?? context.failedStage,
    category: classification.category,
    publicCode: classification.publicCode,
    reasonCode:
      contentTypeDiagnostics?.reasonCode ?? safeReasonCode(context.validationCode),
    sourceMediaTypeClass:
      contentTypeDiagnostics?.sourceMediaTypeClass ?? null,
    retryable: classification.retryable,
    provider: "OpenAI",
    model: PRIMARY_RESEARCH_MODEL,
    callsAttempted:
      result?.providerHttpCalls ?? provider.callsAttempted ?? null,
    httpStatus: classification.httpStatus ?? null,
    finishReason: noObject?.finishReason ?? result?.finishReason ?? null,
    usage: noObject === null ? safeUsage(result?.usage) : usageFromNoObject(noObject),
    toolCallCount: result?.toolCalls ?? null,
    webSearchQueryCount: result?.webSearchQueryCount ?? null,
    webSearchInspectionCount: result?.webSearchInspectionCount ?? null,
    sourceCount:
      result === null
        ? null
        : new Set(result.sources.map(({ url }) => url)).size,
    sourceFetchCount: finiteOrNull(context.sourceFetchCount),
    sourceVerificationMs: finiteOrNull(context.sourceVerificationMs),
    ...shape,
    durationMs,
    estimatedCostUsd: null,
    requestIdPresent: clearRequestId !== null,
    requestIdDigest:
      clearRequestId === null ? null : digestProviderRequestId(clearRequestId),
    receiptPersistence: context.receiptPersistence ?? "memory",
    observedAt: stableObservedAt(context.observedAt),
  };
}

export function publicFailureMessage(category: FailureCategory): string {
  if (
    category === "structured_output_invalid" ||
    category === "source_metadata_missing" ||
    category === "truth_contract_rejected" ||
    category === "no_output"
  ) {
    return "La recherche n’a pas produit de preuve suffisante pour afficher un résultat.";
  }
  if (category === "timeout") {
    return "La recherche a expiré avant de produire un résultat vérifiable.";
  }
  return "La recherche est indisponible sans exposer de données de requête.";
}

export async function persistFailureReceipt(
  receipt: FailureReceipt,
  persist?: (receipt: FailureReceipt) => void | Promise<void>,
): Promise<FailureReceipt> {
  if (persist === undefined) return receipt;
  const fileReceipt: FailureReceipt = { ...receipt, receiptPersistence: "file" };
  try {
    await persist(fileReceipt);
    return fileReceipt;
  } catch {
    return { ...receipt, receiptPersistence: "memory" };
  }
}
