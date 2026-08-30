import type { ResearchDossier } from "../../domain/research-dossier";
import type { SourceMediaTypeClass } from "./errors";

export interface ResearchInput {
  readonly name: string;
  readonly context?: string;
  readonly entityType?: "auto" | "person" | "company";
  readonly identitySourceUrl?: string;
  readonly hints?: ResearchHints;
}

export interface ResearchHints {
  readonly city?: string;
  readonly organization?: string;
  readonly role?: string;
  readonly industry?: string;
  readonly sourceUrl?: string;
}

export const MAX_PROVIDER_HTTP_CALLS = 2;
export const MAX_PROVIDER_WEB_SEARCH_TOOL_CALLS = 4;
export const MAX_WEB_SEARCH_ACTIONS = 6;

export interface ProviderAttemptAccounting {
  readonly webSearchActionCount: number;
  readonly webSearchQueryCount: number;
  readonly webSearchInspectionCount: number;
}

export type ProviderSecondCallReason =
  | "structural_repair"
  | "recall_supplement";

export type ProviderSecondCallOutcome =
  | "succeeded"
  | "failed"
  | "rejected";

export interface ProviderOrchestrationDiagnostics {
  readonly primaryOutcome: "succeeded" | "recovered";
  readonly primaryAccounting: ProviderAttemptAccounting;
  readonly secondCall: null | {
    readonly reason: ProviderSecondCallReason;
    readonly outcome: ProviderSecondCallOutcome;
    readonly accounting: ProviderAttemptAccounting;
  };
}

export interface ProviderCitation {
  readonly provider: "openai";
  readonly metadataType: "url_citation";
  readonly sourceId: string | null;
  readonly url: string;
  readonly title: string | null;
  readonly generatedTextStart: number;
  readonly generatedTextEnd: number;
  readonly textPartId: string;
  readonly toolCallId: string | null;
}

export interface ProviderWebSearchSourceBinding {
  readonly provider: "openai";
  readonly bindingType: "web_search_source";
  readonly url: string;
  readonly title?: never;
  readonly toolCallId: string;
}

export interface ProviderDirectSourceBinding {
  readonly provider: "openai";
  readonly bindingType: "provider_source";
  readonly url: string;
  readonly sourceId: string;
  readonly title?: never;
}

export interface ProviderInspectionActionUrlBinding {
  readonly provider: "openai";
  readonly bindingType: "inspection_action_url";
  readonly url: string;
  readonly title?: never;
  readonly toolCallId: string;
  readonly actionType: "open_page" | "find_in_page";
}

export interface ProviderStructuredOutputUrlBinding {
  readonly provider: "openai";
  readonly bindingType: "structured_output_url";
  readonly url: string;
  readonly title?: never;
}

export type ProviderSourceBinding =
  | ProviderCitation
  | ProviderDirectSourceBinding
  | ProviderWebSearchSourceBinding
  | ProviderInspectionActionUrlBinding
  | ProviderStructuredOutputUrlBinding;

export interface ProviderSource {
  readonly sourceId: string;
  readonly url: string;
  readonly title?: string;
}

export interface ProviderWebSearchCall {
  readonly toolCallId: string;
  readonly sources: readonly { readonly url: string }[] | null;
}

export interface ProviderWebSearchAction {
  readonly toolCallId: string;
  readonly actionType: "search" | "open_page" | "find_in_page";
  readonly queries?: readonly string[];
}

interface ProviderWebSearchInspectionBase {
  readonly toolCallId: string;
  readonly actionType: "open_page" | "find_in_page";
}

export type ProviderWebSearchInspection =
  | (ProviderWebSearchInspectionBase & {
      readonly urlStatus: "present";
      readonly url: string;
    })
  | (ProviderWebSearchInspectionBase & {
      readonly urlStatus: "missing" | "invalid" | "ambiguous";
      readonly url?: never;
    });

export type WebSearchActionPolicyCode =
  | "web_search_not_unique"
  | "web_search_action_invalid"
  | "inspection_url_ambiguous";

export interface ProviderClaimCandidate {
  readonly entityType: "person" | "company";
  readonly statement: string;
  readonly claimStart?: number;
  readonly claimEnd?: number;
  readonly structuredUrl: string;
  readonly excerpt: string;
  readonly prefix: string | null;
  readonly suffix: string | null;
}

export type CandidateKey = string;

export const ENTITY_SCOPES = [
  "person",
  "company",
  "group",
  "subsidiary",
  "brand",
] as const;

export type EntityScope = (typeof ENTITY_SCOPES)[number];

export interface ProviderCandidateDiscriminators {
  readonly city: string | null;
  readonly country: string | null;
  readonly industry: string | null;
  readonly employer: string | null;
  readonly officialSite: string | null;
  readonly legalIdentifier: string | null;
  readonly year: string | null;
}

export const FACT_CATEGORIES = [
  "identity",
  "activity",
  "role",
  "geography",
  "metric",
  "event",
  "recent_signal",
  "other",
] as const;

export type FactCategory = (typeof FACT_CATEGORIES)[number];

export interface ProviderIdentityCandidate extends ProviderClaimCandidate {
  readonly candidateKey: CandidateKey;
  readonly displayName: string;
  readonly entityScope: EntityScope;
  readonly discriminators: ProviderCandidateDiscriminators;
}

export interface ProviderFactCandidate extends ProviderClaimCandidate {
  readonly subjectKey: CandidateKey;
  readonly category: FactCategory;
  readonly predicate: string;
  readonly scopeType:
    | "person"
    | "company"
    | "group"
    | "subsidiary"
    | "brand"
    | "country"
    | "establishment"
    | "undetermined";
  readonly scopeLabel: string | null;
  readonly factPeriodLabel: string | null;
  readonly factDate: string | null;
  readonly normalizedValue: string | null;
  readonly unit: string | null;
  readonly currency: string | null;
  readonly contradictionKey: string | null;
}

export interface ProviderResearchDocument {
  readonly identityStatus:
    | "resolved"
    | "ambiguous"
    | "insufficient_context"
    | "not_found";
  readonly entityType: "person" | "company" | null;
  readonly candidates: readonly ProviderIdentityCandidate[];
  readonly claims: readonly ProviderFactCandidate[];
  readonly missingCategories: readonly FactCategory[];
}

export interface SourceLocator {
  readonly exact: string;
  readonly matchMode?: "exact" | "mechanical_equivalence";
  readonly prefix: string;
  readonly suffix: string;
  readonly occurrenceIndex: number;
  readonly finalUrl: string;
  readonly citationUrl: string;
  readonly retrievedAt: string;
  readonly normalizedTextSha256: string;
  readonly contentType: string;
  readonly bytesRead: number;
  readonly redirectCount: number;
}

export interface VerifiedSourceProof {
  readonly citation: ProviderSourceBinding;
  readonly citationUrl: string;
  readonly finalUrl: string;
  readonly title: string;
  readonly verifiedExcerpt: string;
  /** Normalized server-rendered page text, retained only for this execution. */
  readonly documentText: string;
  readonly locator: SourceLocator;
  readonly sourceFetchCount: number;
  readonly sourceVerificationMs: number;
  /** Defaults to source_content for legacy/test proofs. */
  readonly verificationMethod?: "source_content" | "provider_annotation" | "search_snippet";
  /** Whether the public page itself was available to the server. */
  readonly retrievalStatus?: "retrieved" | "unavailable";
}

export interface RetrievedSourceDocument {
  readonly citation: ProviderSourceBinding;
  readonly citationUrl: string;
  readonly finalUrl: string;
  readonly title: string;
  readonly documentText: string;
  readonly retrievedAt: string;
  readonly contentType: string;
  readonly bytesRead: number;
  readonly redirectCount: number;
  readonly sourceFetchCount: number;
  readonly sourceVerificationMs: number;
}

export interface SourceVerifier {
  verify(
    request: {
      readonly candidate: ProviderClaimCandidate;
      readonly attributedDisplayNames?: readonly string[];
      readonly citation: ProviderSourceBinding;
      readonly signal: AbortSignal;
    },
  ): Promise<VerifiedSourceProof>;
  inspect?(
    request: {
      readonly candidate: ProviderClaimCandidate;
      readonly citation: ProviderSourceBinding;
      readonly signal: AbortSignal;
    },
  ): Promise<RetrievedSourceDocument>;
  verifyDocument?(
    request: {
      readonly document: RetrievedSourceDocument;
      readonly candidate: ProviderClaimCandidate;
      readonly attributedDisplayNames?: readonly string[];
    },
  ): Promise<VerifiedSourceProof>;
}

export interface ProviderUsage {
  readonly inputTokens: number | undefined;
  readonly cachedInputTokens: number | undefined;
  readonly outputTokens: number | undefined;
  readonly reasoningTokens: number | undefined;
  readonly totalTokens: number | undefined;
}

export interface ProviderResearchResult {
  readonly text: string;
  readonly document: ProviderResearchDocument;
  readonly citations: readonly ProviderCitation[];
  readonly sources: readonly ProviderSource[];
  readonly webSearchCalls?: readonly ProviderWebSearchCall[];
  readonly webSearchActions?: readonly ProviderWebSearchAction[];
  readonly webSearchInspections: readonly ProviderWebSearchInspection[];
  readonly webSearchActionCount: number;
  readonly webSearchQueryCount: number;
  readonly webSearchInspectionCount: number;
  readonly webSearchUniqueCallCount: number;
  readonly webSearchActionPolicyStatus: "supported" | "rejected";
  readonly webSearchActionPolicyCode: WebSearchActionPolicyCode | null;
  readonly providerMetadataStatus: "supported" | "unknown";
  readonly providerHttpCalls: number;
  readonly toolCalls: number;
  readonly usage: ProviderUsage;
  readonly providerDurationMs: number;
  readonly finishReason: string | null;
  readonly requestId: string | null;
  readonly queryPlan?: readonly string[];
  readonly executedQueries?: readonly string[];
  readonly orchestration?: ProviderOrchestrationDiagnostics;
}

export interface ResearchProvider {
  research(
    input: ResearchInput,
    signal: AbortSignal,
  ): Promise<ProviderResearchResult>;
}

export interface StageDurations {
  readonly acceptedMs: number;
  readonly searchingMs: number;
  readonly sourceVerifyingMs: number;
  readonly buildingMs: number;
  readonly validatingMs: number;
  readonly totalMs: number;
}

export interface PublicReceipt {
  readonly executionId: string;
  readonly provider: "OpenAI";
  readonly model: "gpt-5.6-luna";
  readonly purpose: "verified_public_dossier";
  readonly providerHttpCalls: number;
  readonly toolCalls: number;
  readonly webSearchQueryCount: number;
  readonly webSearchInspectionCount: number;
  readonly sourceFetchCount: number;
  readonly excerptVerificationCount: number;
  readonly inputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly outputTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly totalTokens: number | null;
  readonly sourceCount: number;
  readonly durations: StageDurations;
  readonly timedOutOrCancelled: boolean;
  readonly finalStatus: "completed" | "failed";
  readonly pricing: {
    readonly date: "2026-08-27";
    readonly inputUsdPerMillion: 0.2;
    readonly cachedInputUsdPerMillion: 0.02;
    readonly outputUsdPerMillion: 1.2;
    readonly webSearchUsdPerCall: 0.01;
  };
  readonly estimatedCostUsd: number | null;
  readonly costLimitations: readonly string[];
  readonly pipelineCounts?: {
    readonly providerIdentityCandidates: number;
    readonly providerFactCandidates: number;
    readonly retrievedIdentityDocuments: number;
    readonly retrievedFactDocuments: number;
    readonly directIdentityProofs: number;
    readonly reconstructedIdentityProofs: number;
    readonly directFactProofs: number;
    readonly sourceFirstFacts: number;
    readonly retainedGroundedIdentityProofs: number;
    readonly retainedGroundedFactProofs: number;
    readonly discardedProofs: number;
    readonly displayedBusinessFacts: number;
    readonly attributionRejections: Readonly<Record<string, number>>;
    readonly qualityRejections: Readonly<Record<string, number>>;
    readonly identityStatus: string;
    readonly identityReasonCodes: readonly string[];
  };
}

export const FAILURE_CATEGORIES = [
  "configuration",
  "authentication",
  "permission",
  "rate_limit",
  "provider_request",
  "provider_unavailable",
  "network",
  "timeout",
  "no_output",
  "structured_output_invalid",
  "source_metadata_missing",
  "truth_contract_rejected",
  "serialization",
  "internal_unknown",
] as const;

export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

export const FAILURE_REASON_CODES = [
  "invalid_provider_shape",
  "invalid_claim_length",
  "non_atomic_claim",
  "source_metadata_missing",
  "inspection_url_missing",
  "inspection_url_invalid",
  "inspection_url_ambiguous",
  "inspection_url_mismatch",
  "content_type_missing",
  "content_type_multiple",
  "content_type_conflicting",
  "content_type_syntax_invalid",
  "media_type_unsupported",
] as const;

export type FailureReasonCode = (typeof FAILURE_REASON_CODES)[number];

export type FailureStage =
  | "configuration"
  | "provider_request"
  | "generation"
  | "metadata_extraction"
  | "source_verification"
  | "truth_validation"
  | "receipt_construction"
  | "serialization"
  | "persistence"
  | "stream_consumption"
  | "internal_unknown";

export interface FailureReceipt {
  readonly attemptId: string;
  readonly terminalStatus: "failed";
  readonly failedStage: FailureStage;
  readonly category: FailureCategory;
  readonly publicCode: string;
  readonly reasonCode: FailureReasonCode | null;
  readonly sourceMediaTypeClass: SourceMediaTypeClass | null;
  readonly retryable: boolean;
  readonly provider: "OpenAI";
  readonly model: "gpt-5.6-luna";
  readonly callsAttempted: number | null;
  readonly httpStatus: number | null;
  readonly finishReason: string | null;
  readonly usage: {
    readonly inputTokens: number | null;
    readonly cachedInputTokens: number | null;
    readonly outputTokens: number | null;
    readonly reasoningTokens: number | null;
    readonly totalTokens: number | null;
  } | null;
  readonly toolCallCount: number | null;
  readonly webSearchQueryCount: number | null;
  readonly webSearchInspectionCount: number | null;
  readonly sourceCount: number | null;
  readonly sourceFetchCount: number | null;
  readonly sourceVerificationMs: number | null;
  readonly outputPresent: boolean | null;
  readonly outputCharacterCount: number | null;
  readonly outputLineCount: number | null;
  readonly terminalLineBreakCount: number | null;
  readonly durationMs: number | null;
  readonly estimatedCostUsd: null;
  readonly requestIdPresent: boolean;
  readonly requestIdDigest: string | null;
  readonly receiptPersistence: "memory" | "file";
  readonly observedAt: string;
}

export type ResearchProgressEvent =
  | {
      readonly state:
        | "accepted"
        | "researching_and_resolving"
        | "source_verifying"
        | "building"
        | "validating";
      readonly executionId: string;
      readonly elapsedMs: number;
    }
  | {
      readonly state: "completed";
      readonly executionId: string;
      readonly elapsedMs: number;
      readonly dossier: ResearchDossier;
      readonly receipt: PublicReceipt;
    }
  | {
      readonly state: "failed";
      readonly executionId: string;
      readonly elapsedMs: number;
      readonly error: {
        readonly code: string;
        readonly message: string;
        readonly retryable: boolean;
      };
      readonly receipt: FailureReceipt;
    };

export interface SafeLogger {
  info(record: Readonly<Record<string, unknown>>): void;
}
