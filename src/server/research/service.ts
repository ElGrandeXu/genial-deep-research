import { randomUUID } from "node:crypto";

import { validateResearchDossier } from "../../domain/contract-validator";
import type { ResearchDossier } from "../../domain/research-dossier";
import { PRIMARY_RESEARCH_MODEL } from "../ai/providers";
import { ResearchPipelineError } from "./errors";
import {
  buildFailureReceipt,
  persistFailureReceipt,
  publicFailureMessage,
} from "./failure-receipt";
import {
  bindProviderSource,
  parseProviderCandidate,
} from "./provider-metadata";
import { serializeSourceLocator } from "./source-content";
import type {
  FailureReceipt,
  FailureStage,
  ProviderResearchResult,
  PublicReceipt,
  ResearchInput,
  ResearchProgressEvent,
  ResearchProvider,
  SafeLogger,
  SourceVerifier,
  VerifiedSourceProof,
} from "./types";

const PRICING = Object.freeze({
  date: "2026-08-26" as const,
  inputUsdPerMillion: 0.2 as const,
  cachedInputUsdPerMillion: 0.02 as const,
  outputUsdPerMillion: 1.2 as const,
  webSearchUsdPerCall: 0.01 as const,
});

function numberOrNull(value: number | undefined): number | null {
  return value === undefined || !Number.isFinite(value) ? null : Math.max(0, value);
}

function estimateCost(result: ProviderResearchResult): {
  readonly amount: number | null;
  readonly limitations: readonly string[];
} {
  const input = numberOrNull(result.usage.inputTokens);
  const cached = numberOrNull(result.usage.cachedInputTokens);
  const output = numberOrNull(result.usage.outputTokens);
  const limitations = [
    "Estimation fondée sur les tokens exposés par le fournisseur et le tarif public daté.",
    "Les taxes, remises, paliers de service et frais non exposés ne sont pas inclus.",
  ];
  if (input === null || cached === null || output === null) {
    return {
      amount: null,
      limitations: [...limitations, "Usage token incomplet : coût total inconnu."],
    };
  }
  const cachedTokens = Math.min(cached, input);
  const uncachedTokens = input - cachedTokens;
  const amount =
    (uncachedTokens * PRICING.inputUsdPerMillion) / 1_000_000 +
    (cachedTokens * PRICING.cachedInputUsdPerMillion) / 1_000_000 +
    (output * PRICING.outputUsdPerMillion) / 1_000_000 +
    result.toolCalls * PRICING.webSearchUsdPerCall;
  return { amount: Number(amount.toFixed(8)), limitations };
}

function assertWebSearchAdmission(result: ProviderResearchResult): void {
  if (
    result.webSearchQueryCount > 1 ||
    result.webSearchActionPolicyCode === "web_search_not_unique"
  ) {
    throw new ResearchPipelineError(
      "web_search_not_unique",
      "Web Search a exécuté plus d’une requête de recherche.",
    );
  }
  if (
    result.webSearchActionPolicyCode === "inspection_url_ambiguous" ||
    (result.webSearchQueryCount === 1 && result.webSearchInspectionCount > 1)
  ) {
    throw new ResearchPipelineError(
      "inspection_url_ambiguous",
      "Plusieurs actions d’inspection concurrentes sont présentes.",
    );
  }
  const counts = [
    result.webSearchActionCount,
    result.webSearchQueryCount,
    result.webSearchInspectionCount,
    result.webSearchUniqueCallCount,
    result.toolCalls,
  ];
  const actions = result.webSearchActions ?? [];
  const actionQueryCount = actions.filter(
    ({ actionType }) => actionType === "search",
  ).length;
  const actionInspectionCount = actions.filter(
    ({ actionType }) =>
      actionType === "open_page" || actionType === "find_in_page",
  ).length;
  const coherent =
    counts.every((count) => Number.isSafeInteger(count) && count >= 0) &&
    result.webSearchActionPolicyStatus === "supported" &&
    result.webSearchActionPolicyCode === null &&
    result.webSearchQueryCount === 1 &&
    (result.webSearchInspectionCount === 0 ||
      result.webSearchInspectionCount === 1) &&
    result.webSearchActionCount ===
      result.webSearchQueryCount + result.webSearchInspectionCount &&
    (result.webSearchActionCount === 1 || result.webSearchActionCount === 2) &&
    result.webSearchUniqueCallCount === result.webSearchActionCount &&
    result.toolCalls === result.webSearchActionCount &&
    actions.length === result.webSearchActionCount &&
    actionQueryCount === result.webSearchQueryCount &&
    actionInspectionCount === result.webSearchInspectionCount &&
    new Set(actions.map(({ toolCallId }) => toolCallId)).size ===
      result.webSearchUniqueCallCount;
  if (!coherent) {
    throw new ResearchPipelineError(
      "web_search_action_invalid",
      "La comptabilité des actions Web Search est incohérente ou inadmissible.",
    );
  }
}

function buildReceipt(
  executionId: string,
  result: ProviderResearchResult | null,
  acceptedMs: number,
  searchingMs: number,
  sourceFetchCount: number,
  sourceVerifyingMs: number,
  validatingMs: number,
  totalMs: number,
  finalStatus: "completed" | "failed",
  timedOutOrCancelled: boolean,
): PublicReceipt {
  const cost =
    result === null
      ? { amount: null, limitations: ["Aucun usage facturable observé."] }
      : estimateCost(result);
  return {
    executionId,
    provider: "OpenAI",
    model: PRIMARY_RESEARCH_MODEL,
    purpose: "single_sourced_public_identity_fact",
    providerHttpCalls: result?.providerHttpCalls ?? 0,
    toolCalls: result?.toolCalls ?? 0,
    webSearchQueryCount: result?.webSearchQueryCount ?? 0,
    webSearchInspectionCount: result?.webSearchInspectionCount ?? 0,
    sourceFetchCount,
    inputTokens: numberOrNull(result?.usage.inputTokens),
    cachedInputTokens: numberOrNull(result?.usage.cachedInputTokens),
    outputTokens: numberOrNull(result?.usage.outputTokens),
    reasoningTokens: numberOrNull(result?.usage.reasoningTokens),
    totalTokens: numberOrNull(result?.usage.totalTokens),
    sourceCount:
      result === null
        ? 0
        : sourceFetchCount > 0
          ? 1
          : new Set(
            result.citations.length > 0
              ? result.citations.map(({ url }) => url)
              : (result.webSearchCalls ?? []).flatMap(({ sources }) =>
                  sources === null ? [] : sources.map(({ url }) => url),
                ),
            ).size,
    durations: {
      acceptedMs,
      searchingMs,
      sourceVerifyingMs,
      validatingMs,
      totalMs,
    },
    timedOutOrCancelled,
    finalStatus,
    pricing: PRICING,
    estimatedCostUsd: cost.amount,
    costLimitations: cost.limitations,
  };
}

function buildDossier(
  input: ResearchInput,
  result: ProviderResearchResult,
  claim: ReturnType<typeof parseProviderCandidate>,
  proof: VerifiedSourceProof,
  executionId: string,
  startedAt: Date,
  completedAt: Date,
  totalMs: number,
  estimatedCostUsd: number | null,
): ResearchDossier {
  const subjectId = `subject-${randomUUID()}`;
  const claimId = `claim-${randomUUID()}`;
  const sourceId = `source-${randomUUID()}`;
  const evidenceId = `evidence-${randomUUID()}`;
  const scopeType = claim.entityType === "person" ? "person" : "company";
  const measuredInput = result.usage.inputTokens;
  const measuredOutput = result.usage.outputTokens;
  const measuredTotal = result.usage.totalTokens;
  if (
    measuredInput === undefined ||
    measuredOutput === undefined ||
    measuredTotal === undefined ||
    estimatedCostUsd === null
  ) {
    throw new ResearchPipelineError(
      "m2_receipt_usage_missing",
      "Le reçu M2 ne peut pas représenter honnêtement un usage ou un coût inconnu.",
    );
  }

  return {
    schema_version: "1.0.0",
    dossier_id: `dossier-${randomUUID()}`,
    origin: "runtime",
    request: {
      request_id: `request-${randomUUID()}`,
      submitted_at: startedAt.toISOString(),
      name: input.name,
      suggested_type: claim.entityType,
      context: input.context === undefined ? {} : { discriminating_hint: input.context },
      total_character_count: Array.from(input.name + (input.context ?? "")).length,
    },
    identity: {
      status: "resolved",
      selected_subject_id: subjectId,
      candidates: [
        {
          subject_id: subjectId,
          entity_type: claim.entityType,
          display_name: input.name,
          discriminators: {},
          match_rationale: "Le résultat fournisseur a été produit pour l’entité et le contexte soumis.",
        },
      ],
      resolution_reason: "Une seule entité est retenue dans cette tranche verticale bornée.",
      clarification_fields: [],
    },
    sources: [
      {
        source_id: sourceId,
        provider_url: proof.citationUrl,
        resolved_url: proof.finalUrl,
        canonical_url: null,
        title: proof.title,
        publisher: new URL(proof.finalUrl).hostname,
        source_type: "search_result",
        published_at: null,
        accessed_at: completedAt.toISOString(),
        collection_method: "direct_access",
        collection_compliance: "not_verified",
        accessibility_status: "accessible",
        assumed_entity_id: subjectId,
        assumed_scope: { type: scopeType, label: input.name },
      },
    ],
    evidence: [
      {
        evidence_id: evidenceId,
        source_id: sourceId,
        claim_id: claimId,
        excerpt: proof.verifiedExcerpt,
        locator: serializeSourceLocator(proof.locator),
        entity_id: subjectId,
        fact_period: {
          status: "unknown",
          start: null,
          end: null,
          as_of: null,
          label: null,
        },
        scope: { type: scopeType, label: input.name },
        relation: "supports",
        verification_method: "source_content",
        verified_at: completedAt.toISOString(),
      },
    ],
    claims: [
      {
        claim_id: claimId,
        subject_id: subjectId,
        statement: claim.statement,
        predicate: "public_identity_fact",
        structured_value: null,
        unit: null,
        fact_period: {
          status: "unknown",
          start: null,
          end: null,
          as_of: null,
          label: null,
        },
        scope: { type: scopeType, label: input.name },
        temporal_status: "unknown",
        evidence_ids: [evidenceId],
        claim_state: "supported",
        reconciliation_state: "confirmation",
        presentation_decision: "display_fact",
        presentation_reason: "Une liaison fournisseur vérifiée et un extrait source exact ont franchi les contrôles de provenance.",
      },
    ],
    inferences: [],
    contradictions: [],
    unknowns: [],
    execution_steps: [
      {
        step_id: `step-${randomUUID()}`,
        invocation_id: `invocation-${randomUUID()}`,
        operation: "collection",
        status: "completed",
        attempt: 1,
        retry_of: null,
        started_at: startedAt.toISOString(),
        ended_at: completedAt.toISOString(),
        duration_ms: result.providerDurationMs,
        error_code: null,
      },
      {
        step_id: `step-${randomUUID()}`,
        invocation_id: `invocation-${randomUUID()}`,
        operation: "verification",
        status: "completed",
        attempt: 1,
        retry_of: null,
        started_at: startedAt.toISOString(),
        ended_at: completedAt.toISOString(),
        duration_ms: proof.sourceVerificationMs,
        error_code: null,
      },
    ],
    presentation: {
      summary_items: [{ kind: "claim", ref_id: claimId }],
      key_fact_claim_ids: [claimId],
      recent_signal_claim_ids: [],
      ambiguity_claim_ids: [],
      contradiction_ids: [],
      unknown_ids: [],
      source_ids: [sourceId],
    },
    receipt: {
      run_id: executionId,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      total_duration_ms: totalMs,
      latency_ms: totalMs,
      provider_calls: result.providerHttpCalls,
      usage: {
        input_tokens: Math.max(0, measuredInput),
        output_tokens: Math.max(0, measuredOutput),
        total_tokens: Math.max(0, measuredTotal),
      },
      cost: {
        amount_usd: estimatedCostUsd,
        status: "estimated",
        assumptions: [
          "Tarif OpenAI public daté du 26 août 2026.",
          "Web Search facturé conservativement 0,01 USD par action observée ; taxes et remises exclues.",
        ],
      },
      search_scope: {
        categories: ["Web Search OpenAI ; une source URL maximale pour l’affichage"],
        stop_reason: "Une affirmation atomique reliée à une source fournisseur a été obtenue.",
      },
      resumed_from_run_id: null,
    },
    result_mode: "standard",
    global_status: "complete_within_scope",
    error: null,
    limitations: [
      "Tranche M5 : une seule affirmation, pas un dossier complet.",
      "La date de publication et la fraîcheur restent inconnues.",
      "La visibilité est approximée par parse5 sans CSS externe, layout, JavaScript, shadow DOM ni calcul navigateur.",
      "La provenance et la présence exacte sont automatisées ; l’entaillement sémantique indépendant reste à auditer.",
    ],
  };
}

function safeLog(logger: SafeLogger, receipt: PublicReceipt, errorCode?: string): void {
  try {
    logger.info({
      event: "research_receipt",
      executionId: receipt.executionId,
      provider: receipt.provider,
      model: receipt.model,
      purpose: receipt.purpose,
      providerHttpCalls: receipt.providerHttpCalls,
      toolCalls: receipt.toolCalls,
      webSearchQueryCount: receipt.webSearchQueryCount,
      webSearchInspectionCount: receipt.webSearchInspectionCount,
      usage: {
        inputTokens: receipt.inputTokens === null ? null : receipt.inputTokens,
        cachedInputTokens:
          receipt.cachedInputTokens === null ? null : receipt.cachedInputTokens,
        outputTokens: receipt.outputTokens === null ? null : receipt.outputTokens,
        reasoningTokens:
          receipt.reasoningTokens === null ? null : receipt.reasoningTokens,
        totalTokens: receipt.totalTokens === null ? null : receipt.totalTokens,
      },
      sourceCount: receipt.sourceCount,
      sourceFetchCount: receipt.sourceFetchCount,
      durations: receipt.durations,
      timedOutOrCancelled: receipt.timedOutOrCancelled,
      finalStatus: receipt.finalStatus,
      estimatedCostUsd: receipt.estimatedCostUsd,
      ...(errorCode === undefined ? {} : { errorCode }),
    });
  } catch {
    // Logging cannot suppress the terminal event.
  }
}

function safeLogFailure(logger: SafeLogger, receipt: FailureReceipt): void {
  try {
    logger.info({ event: "research_failure_receipt", ...receipt });
  } catch {
    // The in-memory receipt remains authoritative if logging fails.
  }
}

export async function executeResearch(options: {
  readonly input: ResearchInput;
  readonly provider: ResearchProvider;
  readonly sourceVerifier: SourceVerifier;
  readonly signal: AbortSignal;
  readonly acceptedMs: number;
  readonly emit: (event: ResearchProgressEvent) => void;
  readonly logger: SafeLogger;
  readonly now?: () => Date;
  readonly monotonicNow?: () => number;
  readonly validateDossier?: typeof validateResearchDossier;
  readonly persistFailure?: (receipt: FailureReceipt) => void | Promise<void>;
  readonly onTerminal?: (event: ResearchProgressEvent) => void;
}): Promise<void> {
  const now = options.now ?? (() => new Date());
  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  const executionId = randomUUID();
  const startedAt = now();
  const totalStart = monotonicNow();
  let result: ProviderResearchResult | null = null;
  let searchingMs = 0;
  let sourceVerifyingMs = 0;
  let sourceFetchCount = 0;
  let validatingMs = 0;
  let failedStage: FailureStage = "generation";
  let terminalRecorded = false;

  async function deliverTerminal(event: ResearchProgressEvent): Promise<void> {
    if (terminalRecorded || (event.state !== "completed" && event.state !== "failed")) {
      return;
    }
    terminalRecorded = true;
    let terminal = event;
    if (event.state === "failed") {
      const receipt = await persistFailureReceipt(event.receipt, options.persistFailure);
      terminal = { ...event, receipt };
      safeLogFailure(options.logger, receipt);
    } else {
      safeLog(options.logger, event.receipt);
    }
    try {
      options.onTerminal?.(terminal);
    } catch {
      // A terminal sink cannot create a second terminal event.
    }
    try {
      options.emit(terminal);
    } catch {
      // Client abandonment cannot erase the in-memory terminal receipt.
    }
  }

  try {
    options.emit({ state: "accepted", executionId, elapsedMs: options.acceptedMs });
    options.emit({ state: "searching", executionId, elapsedMs: options.acceptedMs });
    const searchStart = monotonicNow();
    result = await options.provider.research(options.input, options.signal);
    searchingMs = Math.max(0, Math.round(monotonicNow() - searchStart));
    if (result.providerHttpCalls !== 1) {
      throw new ResearchPipelineError(
        "provider_call_count",
        "Le nombre d’appels fournisseur diffère de la limite M5.",
      );
    }
    assertWebSearchAdmission(result);
    failedStage = "truth_validation";
    const claim = parseProviderCandidate(result.text);
    failedStage = "metadata_extraction";
    const providerBinding = bindProviderSource(result, claim);
    options.emit({
      state: "source_verifying",
      executionId,
      elapsedMs: Math.max(0, Math.round(monotonicNow() - totalStart)),
    });
    failedStage = "source_verification";
    const proof = await options.sourceVerifier.verify({
      candidate: claim,
      citation: providerBinding,
      signal: options.signal,
    });
    sourceVerifyingMs = proof.sourceVerificationMs;
    sourceFetchCount = proof.sourceFetchCount;
    options.emit({
      state: "validating",
      executionId,
      elapsedMs: Math.max(0, Math.round(monotonicNow() - totalStart)),
    });

    const validationStart = monotonicNow();
    failedStage = "receipt_construction";
    const interimTotalMs = Math.max(0, Math.round(monotonicNow() - totalStart));
    const interimCost = estimateCost(result).amount;
    const completedAt = now();
    const dossier = buildDossier(
      options.input,
      result,
      claim,
      proof,
      executionId,
      startedAt,
      completedAt,
      interimTotalMs,
      interimCost,
    );
    failedStage = "truth_validation";
    const contract = (options.validateDossier ?? validateResearchDossier)(dossier);
    if (!contract.ok) {
      throw new ResearchPipelineError(
        "m2_contract_invalid",
        "Le résultat ne satisfait pas le JSON Schema M2.",
      );
    }
    validatingMs = Math.max(0, Math.round(monotonicNow() - validationStart));
    const totalMs = Math.max(0, Math.round(monotonicNow() - totalStart));
    const receipt = buildReceipt(
      executionId,
      result,
      options.acceptedMs,
      searchingMs,
      sourceFetchCount,
      sourceVerifyingMs,
      validatingMs,
      totalMs,
      "completed",
      false,
    );
    dossier.receipt.total_duration_ms = totalMs;
    dossier.receipt.latency_ms = totalMs;
    dossier.receipt.completed_at = now().toISOString();
    await deliverTerminal({
      state: "completed",
      executionId,
      elapsedMs: totalMs,
      dossier,
      receipt,
    });
  } catch (error) {
    if (terminalRecorded) return;
    const totalMs = Math.max(0, Math.round(monotonicNow() - totalStart));
    const receipt = buildFailureReceipt(error, {
      attemptId: executionId,
      failedStage,
      result,
      ...(error instanceof ResearchPipelineError
        ? { validationCode: error.code }
        : {}),
      sourceFetchCount:
        error instanceof ResearchPipelineError
          ? error.sourceDiagnostics?.sourceFetchCount ?? sourceFetchCount
          : sourceFetchCount,
      sourceVerificationMs:
        error instanceof ResearchPipelineError
          ? error.sourceDiagnostics?.sourceVerificationMs ?? sourceVerifyingMs
          : sourceVerifyingMs,
      durationMs: totalMs,
      observedAt: now(),
    });
    await deliverTerminal({
      state: "failed",
      executionId,
      elapsedMs: totalMs,
      error: {
        code: receipt.publicCode,
        message: publicFailureMessage(receipt.category),
        retryable: receipt.retryable,
      },
      receipt,
    });
  }
}
