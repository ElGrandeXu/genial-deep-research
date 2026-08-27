import { randomUUID } from "node:crypto";

import { validateResearchDossier } from "../../domain/contract-validator";
import type { ResearchDossier } from "../../domain/research-dossier";
import { validateRuntimeInvariants } from "../../domain/runtime-invariants";
import { PRIMARY_RESEARCH_MODEL } from "../ai/providers";
import { ResearchPipelineError } from "./errors";
import {
  buildFailureReceipt,
  persistFailureReceipt,
  publicFailureMessage,
} from "./failure-receipt";
import { bindProviderSource } from "./provider-metadata";
import { normalizeVisibleText, serializeSourceLocator } from "./source-content";
import type {
  FactCategory,
  FailureReceipt,
  FailureStage,
  ProviderClaimCandidate,
  ProviderFactCandidate,
  ProviderIdentityCandidate,
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
  date: "2026-08-27" as const,
  inputUsdPerMillion: 0.2 as const,
  cachedInputUsdPerMillion: 0.02 as const,
  outputUsdPerMillion: 1.2 as const,
  webSearchUsdPerCall: 0.01 as const,
});
const MAX_ESTIMATED_COST_USD = 0.1;
const FRESHNESS_WINDOW_MS = 548 * 24 * 60 * 60 * 1_000;
const FACT_CATEGORY_LABELS: Readonly<Record<FactCategory, string>> = {
  identity: "identité",
  activity: "activité",
  role: "rôle",
  geography: "présence géographique",
  metric: "chiffres clés",
  event: "événements",
  recent_signal: "signaux récents",
  other: "autres informations",
};

type DossierClaim = ResearchDossier["claims"][number];
type DossierFactPeriod = DossierClaim["fact_period"];
type DossierScope = DossierClaim["scope"];

interface VerifiedCandidate<T extends ProviderClaimCandidate> {
  readonly candidate: T;
  readonly proof: VerifiedSourceProof;
}

interface VerificationBatch<T extends ProviderClaimCandidate> {
  readonly verified: readonly VerifiedCandidate<T>[];
  readonly rejectedCount: number;
  readonly sourceFetchCount: number;
}

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
    "Estimation fondée sur les jetons exposés et les tarifs publics datés du 27 août 2026.",
    "Web Search est compté conservativement par action observée ; taxes, remises et paliers sont exclus.",
  ];
  if (input === null || cached === null || output === null) {
    return {
      amount: null,
      limitations: [...limitations, "Usage incomplet : coût total inconnu."],
    };
  }
  const cachedTokens = Math.min(cached, input);
  const amount =
    ((input - cachedTokens) * PRICING.inputUsdPerMillion) / 1_000_000 +
    (cachedTokens * PRICING.cachedInputUsdPerMillion) / 1_000_000 +
    (output * PRICING.outputUsdPerMillion) / 1_000_000 +
    result.toolCalls * PRICING.webSearchUsdPerCall;
  return { amount: Number(amount.toFixed(8)), limitations };
}

function assertProviderAdmission(result: ProviderResearchResult): void {
  const counts = [
    result.webSearchActionCount,
    result.webSearchQueryCount,
    result.webSearchInspectionCount,
    result.webSearchUniqueCallCount,
    result.toolCalls,
  ];
  const actions = result.webSearchActions ?? [];
  const actionQueryCount = actions.filter(({ actionType }) => actionType === "search").length;
  const actionInspectionCount = actions.filter(
    ({ actionType }) => actionType === "open_page" || actionType === "find_in_page",
  ).length;
  const coherent =
    result.providerHttpCalls === 1 &&
    result.providerMetadataStatus === "supported" &&
    result.webSearchActionPolicyStatus === "supported" &&
    result.webSearchActionPolicyCode === null &&
    counts.every((count) => Number.isSafeInteger(count) && count >= 0) &&
    result.webSearchQueryCount >= 1 &&
    result.webSearchActionCount >= 1 &&
    result.webSearchActionCount <= 4 &&
    result.webSearchUniqueCallCount === result.webSearchActionCount &&
    result.toolCalls === result.webSearchActionCount &&
    actions.length === result.webSearchActionCount &&
    actionQueryCount === result.webSearchQueryCount &&
    actionInspectionCount === result.webSearchInspectionCount &&
    result.webSearchActionCount ===
      result.webSearchQueryCount + result.webSearchInspectionCount;
  if (!coherent) {
    throw new ResearchPipelineError(
      "web_search_action_invalid",
      "La comptabilité des actions Web Search est incohérente ou dépasse la limite.",
    );
  }
}

function requireMeasuredCost(result: ProviderResearchResult): number {
  const cost = estimateCost(result).amount;
  if (
    result.usage.inputTokens === undefined ||
    result.usage.outputTokens === undefined ||
    result.usage.totalTokens === undefined ||
    cost === null
  ) {
    throw new ResearchPipelineError(
      "m2_receipt_usage_missing",
      "Le reçu ne peut pas représenter honnêtement un usage inconnu.",
    );
  }
  if (cost > MAX_ESTIMATED_COST_USD) {
    throw new ResearchPipelineError(
      "cost_limit_exceeded",
      "Le coût estimé dépasse le plafond autorisé par dossier.",
    );
  }
  return cost;
}

function buildReceipt(options: {
  readonly executionId: string;
  readonly result: ProviderResearchResult | null;
  readonly acceptedMs: number;
  readonly searchingMs: number;
  readonly sourceFetchCount: number;
  readonly sourceCount: number;
  readonly sourceVerifyingMs: number;
  readonly validatingMs: number;
  readonly totalMs: number;
  readonly finalStatus: "completed" | "failed";
  readonly timedOutOrCancelled: boolean;
}): PublicReceipt {
  const cost = options.result === null
    ? { amount: null, limitations: ["Aucun usage facturable observé."] }
    : estimateCost(options.result);
  return {
    executionId: options.executionId,
    provider: "OpenAI",
    model: PRIMARY_RESEARCH_MODEL,
    purpose: "verified_public_dossier",
    providerHttpCalls: options.result?.providerHttpCalls ?? 0,
    toolCalls: options.result?.toolCalls ?? 0,
    webSearchQueryCount: options.result?.webSearchQueryCount ?? 0,
    webSearchInspectionCount: options.result?.webSearchInspectionCount ?? 0,
    sourceFetchCount: options.sourceFetchCount,
    inputTokens: numberOrNull(options.result?.usage.inputTokens),
    cachedInputTokens: numberOrNull(options.result?.usage.cachedInputTokens),
    outputTokens: numberOrNull(options.result?.usage.outputTokens),
    reasoningTokens: numberOrNull(options.result?.usage.reasoningTokens),
    totalTokens: numberOrNull(options.result?.usage.totalTokens),
    sourceCount: options.sourceCount,
    durations: {
      acceptedMs: options.acceptedMs,
      searchingMs: options.searchingMs,
      sourceVerifyingMs: options.sourceVerifyingMs,
      validatingMs: options.validatingMs,
      totalMs: options.totalMs,
    },
    timedOutOrCancelled: options.timedOutOrCancelled,
    finalStatus: options.finalStatus,
    pricing: PRICING,
    estimatedCostUsd: cost.amount,
    costLimitations: cost.limitations,
  };
}

function normalizeForComparison(value: string): string {
  return normalizeVisibleText(value).toLocaleLowerCase("fr");
}

function textContains(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizeForComparison(needle);
  return normalizedNeedle.length > 0 &&
    normalizeForComparison(haystack).includes(normalizedNeedle);
}

function scopeFor(candidate: ProviderFactCandidate): DossierScope {
  return { type: candidate.scopeType, label: candidate.scopeLabel };
}

function parseProvenDate(literal: string | null, excerpt: string): string | null {
  if (literal === null || !textContains(excerpt, literal)) return null;
  if (/^\d{4}$/u.test(literal)) {
    const year = Number(literal);
    return year >= 1900 && year <= 2100
      ? `${literal}-12-31T23:59:59.000Z`
      : null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/u.test(literal)) {
    const date = new Date(`${literal}T00:00:00.000Z`);
    return Number.isNaN(date.valueOf()) ? null : date.toISOString();
  }
  const date = new Date(literal);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function factPeriodFor(
  candidate: ProviderFactCandidate,
  proof: VerifiedSourceProof,
): DossierFactPeriod {
  const label = candidate.factPeriodLabel !== null &&
    textContains(proof.verifiedExcerpt, candidate.factPeriodLabel)
    ? candidate.factPeriodLabel
    : null;
  const asOf = parseProvenDate(candidate.factDate, proof.verifiedExcerpt);
  return {
    status: label === null && asOf === null ? "unknown" : "stated",
    start: null,
    end: null,
    as_of: asOf,
    label,
  };
}

function temporalStatusFor(
  period: DossierFactPeriod,
  completedAt: Date,
): DossierClaim["temporal_status"] {
  if (period.as_of === null) return "unknown";
  const time = new Date(period.as_of).valueOf();
  const age = completedAt.valueOf() - time;
  if (!Number.isFinite(time) || age < -31 * 24 * 60 * 60 * 1_000) return "unknown";
  return age <= FRESHNESS_WINDOW_MS ? "current" : "historical";
}

function contradictionGroupKey(candidate: ProviderFactCandidate): string | null {
  if (candidate.contradictionKey === null || candidate.normalizedValue === null) {
    return null;
  }
  return [
    normalizeForComparison(candidate.contradictionKey),
    candidate.scopeType,
    normalizeForComparison(candidate.scopeLabel ?? ""),
    normalizeForComparison(candidate.factPeriodLabel ?? ""),
    normalizeForComparison(candidate.unit ?? ""),
    normalizeForComparison(candidate.currency ?? ""),
  ].join("|");
}

function resolvedCandidateAsFact(
  candidate: ProviderIdentityCandidate,
): ProviderFactCandidate {
  return {
    ...candidate,
    category: "identity",
    predicate: "identity",
    scopeType: candidate.entityType,
    scopeLabel: candidate.displayName,
    factPeriodLabel: null,
    factDate: null,
    normalizedValue: null,
    unit: null,
    currency: null,
    contradictionKey: null,
  };
}

async function verifyBatch<T extends ProviderClaimCandidate>(options: {
  readonly candidates: readonly T[];
  readonly result: ProviderResearchResult;
  readonly sourceVerifier: SourceVerifier;
  readonly signal: AbortSignal;
}): Promise<VerificationBatch<T>> {
  const settled = await Promise.allSettled(
    options.candidates.map(async (candidate) => {
      const citation = bindProviderSource(options.result, candidate);
      const proof = await options.sourceVerifier.verify({ candidate, citation, signal: options.signal });
      return { candidate, proof };
    }),
  );
  const verified: VerifiedCandidate<T>[] = [];
  let rejectedCount = 0;
  let sourceFetchCount = 0;
  for (const item of settled) {
    if (item.status === "fulfilled") {
      verified.push(item.value);
      sourceFetchCount += item.value.proof.sourceFetchCount;
    } else {
      rejectedCount += 1;
      if (item.reason instanceof ResearchPipelineError) {
        sourceFetchCount += item.reason.sourceDiagnostics?.sourceFetchCount ?? 0;
      }
    }
  }
  return { verified, rejectedCount, sourceFetchCount };
}

function buildDossier(options: {
  readonly input: ResearchInput;
  readonly result: ProviderResearchResult;
  readonly verifiedIdentityCandidates: readonly VerifiedCandidate<ProviderIdentityCandidate>[];
  readonly verifiedFacts: readonly VerifiedCandidate<ProviderFactCandidate>[];
  readonly rejectedProofCount: number;
  readonly executionId: string;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly totalMs: number;
  readonly searchingMs: number;
  readonly sourceVerifyingMs: number;
  readonly estimatedCostUsd: number;
}): ResearchDossier {
  const requestedType = options.input.entityType ?? "auto";
  const requestedTypeMismatch =
    requestedType !== "auto" &&
    options.result.document.entityType !== requestedType;
  const providerResolved =
    options.result.document.identityStatus === "resolved" &&
    options.result.document.entityType !== null &&
    !requestedTypeMismatch;
  const eligibleIdentityCandidates = options.verifiedIdentityCandidates.filter(
    ({ candidate, proof }) =>
      textContains(proof.verifiedExcerpt, candidate.displayName) &&
      (requestedType === "auto" || candidate.entityType === requestedType),
  );
  const eligibleFacts = options.verifiedFacts.filter(
    ({ candidate }) =>
      options.result.document.entityType !== null &&
      candidate.entityType === options.result.document.entityType,
  );

  const resolvedCandidateFacts = providerResolved
    ? eligibleIdentityCandidates.map(({ candidate, proof }) => ({
        candidate: resolvedCandidateAsFact(candidate),
        proof,
      }))
    : [];
  const deduplicatedFacts = new Map<string, VerifiedCandidate<ProviderFactCandidate>>();
  for (const fact of [...resolvedCandidateFacts, ...eligibleFacts]) {
    const key = `${fact.proof.finalUrl}|${normalizeForComparison(fact.proof.verifiedExcerpt)}`;
    if (!deduplicatedFacts.has(key)) deduplicatedFacts.set(key, fact);
  }
  const facts = [...deduplicatedFacts.values()];
  const identityLabels = [
    options.input.name,
    ...eligibleIdentityCandidates.map(({ candidate }) => candidate.displayName),
  ];
  const identityProven = facts.some(({ proof }) =>
    identityLabels.some((label) => textContains(proof.verifiedExcerpt, label)),
  );
  const resolved = providerResolved && identityProven && facts.length > 0;

  const sources: ResearchDossier["sources"] = [];
  const evidence: ResearchDossier["evidence"] = [];
  const claims: ResearchDossier["claims"] = [];
  const candidates: ResearchDossier["identity"]["candidates"] = [];
  const sourceBySubjectAndUrl = new Map<string, string>();
  const factRecordByCandidate = new Map<ProviderFactCandidate, {
    readonly claimId: string;
    readonly evidenceId: string;
    readonly period: DossierFactPeriod;
  }>();

  const resolvedSubjectId = `subject-${randomUUID()}`;
  if (resolved) {
    const displayName = eligibleIdentityCandidates[0]?.candidate.displayName ?? options.input.name;
    candidates.push({
      subject_id: resolvedSubjectId,
      entity_type: options.result.document.entityType ?? "company",
      display_name: displayName,
      discriminators: {},
      match_rationale: "Le type, le contexte soumis et les extraits vérifiés convergent vers cette entité.",
    });
  }

  function ensureSource(subjectId: string, scope: DossierScope, proof: VerifiedSourceProof): string {
    const key = `${subjectId}|${proof.finalUrl}`;
    const existing = sourceBySubjectAndUrl.get(key);
    if (existing !== undefined) return existing;
    const sourceId = `source-${randomUUID()}`;
    sources.push({
      source_id: sourceId,
      provider_url: proof.citationUrl,
      resolved_url: proof.finalUrl,
      canonical_url: null,
      title: proof.title,
      publisher: new URL(proof.finalUrl).hostname,
      source_type: "search_result",
      published_at: null,
      accessed_at: proof.locator.retrievedAt,
      collection_method: "direct_access",
      collection_compliance: "not_verified",
      accessibility_status: "accessible",
      assumed_entity_id: subjectId,
      assumed_scope: scope,
    });
    sourceBySubjectAndUrl.set(key, sourceId);
    return sourceId;
  }

  const conflictGroups = new Map<string, VerifiedCandidate<ProviderFactCandidate>[]>();
  if (resolved) {
    for (const fact of facts) {
      const key = contradictionGroupKey(fact.candidate);
      if (key === null) continue;
      const group = conflictGroups.get(key) ?? [];
      group.push(fact);
      conflictGroups.set(key, group);
    }
    for (const [key, group] of conflictGroups) {
      const values = new Set(group.map(({ candidate }) => candidate.normalizedValue));
      const pages = new Set(group.map(({ proof }) => proof.finalUrl));
      if (values.size < 2 || pages.size < 2) conflictGroups.delete(key);
    }
  }
  const conflictingFacts = new Set([...conflictGroups.values()].flat());

  if (resolved) {
    for (const item of facts) {
      const claimId = `claim-${randomUUID()}`;
      const evidenceId = `evidence-${randomUUID()}`;
      const scope = scopeFor(item.candidate);
      const sourceId = ensureSource(resolvedSubjectId, scope, item.proof);
      const period = factPeriodFor(item.candidate, item.proof);
      const temporalStatus = temporalStatusFor(period, options.completedAt);
      const contested = conflictingFacts.has(item);
      evidence.push({
        evidence_id: evidenceId,
        source_id: sourceId,
        claim_id: claimId,
        excerpt: item.proof.verifiedExcerpt,
        locator: serializeSourceLocator(item.proof.locator),
        entity_id: resolvedSubjectId,
        fact_period: period,
        scope,
        relation: "supports",
        verification_method: "source_content",
        verified_at: item.proof.locator.retrievedAt,
      });
      claims.push({
        claim_id: claimId,
        subject_id: resolvedSubjectId,
        statement: item.proof.verifiedExcerpt,
        predicate: `${item.candidate.category}.${item.candidate.predicate}`,
        structured_value: item.candidate.normalizedValue === null
          ? null
          : { value: item.candidate.normalizedValue, value_type: "text" },
        unit: item.candidate.unit,
        fact_period: period,
        scope,
        temporal_status: temporalStatus,
        evidence_ids: [evidenceId],
        claim_state: contested
          ? "contested"
          : temporalStatus === "historical"
            ? "historical"
            : "supported",
        reconciliation_state: contested ? "contradiction" : "confirmation",
        presentation_decision: "display_fact",
        presentation_reason: "Le texte affiché est l’extrait exact retrouvé dans la page source consultée.",
      });
      factRecordByCandidate.set(item.candidate, { claimId, evidenceId, period });
    }
  } else if (
    options.result.document.identityStatus === "ambiguous" ||
    options.result.document.identityStatus === "insufficient_context" ||
    requestedTypeMismatch
  ) {
    for (const item of eligibleIdentityCandidates) {
      const subjectId = `subject-${randomUUID()}`;
      const claimId = `claim-${randomUUID()}`;
      const evidenceId = `evidence-${randomUUID()}`;
      const scope: DossierScope = { type: item.candidate.entityType, label: item.candidate.displayName };
      const sourceId = ensureSource(subjectId, scope, item.proof);
      candidates.push({
        subject_id: subjectId,
        entity_type: item.candidate.entityType,
        display_name: item.candidate.displayName,
        discriminators: {},
        match_rationale: "Candidat distinct retrouvé dans une source directement vérifiée.",
      });
      evidence.push({
        evidence_id: evidenceId,
        source_id: sourceId,
        claim_id: claimId,
        excerpt: item.proof.verifiedExcerpt,
        locator: serializeSourceLocator(item.proof.locator),
        entity_id: subjectId,
        fact_period: { status: "unknown", start: null, end: null, as_of: null, label: null },
        scope,
        relation: "supports",
        verification_method: "source_content",
        verified_at: item.proof.locator.retrievedAt,
      });
      claims.push({
        claim_id: claimId,
        subject_id: subjectId,
        statement: item.proof.verifiedExcerpt,
        predicate: "identity.candidate",
        structured_value: null,
        unit: null,
        fact_period: { status: "unknown", start: null, end: null, as_of: null, label: null },
        scope,
        temporal_status: "unknown",
        evidence_ids: [evidenceId],
        claim_state: "ambiguous",
        reconciliation_state: "indetermination",
        presentation_decision: "display_ambiguity",
        presentation_reason: "Ce candidat reste séparé tant qu’un indice discriminant n’est pas fourni.",
      });
    }
  }

  const contradictions: ResearchDossier["contradictions"] = [];
  if (resolved) {
    for (const group of conflictGroups.values()) {
      const records = group.flatMap(({ candidate }) => {
        const record = factRecordByCandidate.get(candidate);
        return record === undefined || candidate.normalizedValue === null
          ? []
          : [{ candidate, ...record }];
      });
      if (records.length < 2) continue;
      const first = records[0];
      if (first === undefined) continue;
      contradictions.push({
        contradiction_id: `contradiction-${randomUUID()}`,
        predicate: `${first.candidate.category}.${first.candidate.predicate}`,
        period: first.period,
        scope: scopeFor(first.candidate),
        metric_definition: first.candidate.contradictionKey ?? first.candidate.predicate,
        published_or_estimated_checked: false,
        classification: "contradiction",
        versions: records.map(({ candidate, claimId, evidenceId }) => ({
          claim_id: claimId,
          evidence_ids: [evidenceId],
          normalized_value: candidate.normalizedValue ?? "inconnue",
          unit: candidate.unit,
          currency: candidate.currency,
        })) as unknown as ResearchDossier["contradictions"][number]["versions"],
        explanation: "Les pages vérifiées donnent des valeurs incompatibles ; aucune version n’est choisie silencieusement.",
        visible: true,
      });
    }
  }

  const unknowns: ResearchDossier["unknowns"] = [];
  function addUnknown(
    category: ResearchDossier["unknowns"][number]["category"],
    description: string,
    stopReason: string,
    retryContext: string[] = [],
  ): void {
    unknowns.push({
      unknown_id: `unknown-${randomUUID()}`,
      category,
      description,
      explored_scope: ["Recherche Web publique et accès direct aux pages proposées"],
      source_categories: ["search_result"],
      stop_reason: stopReason,
      retry_context: retryContext,
    });
  }

  const missing = [...new Set(options.result.document.missingCategories)];
  if (missing.length > 0) {
    addUnknown(
      "not_verified",
      `Catégories recherchées sans preuve affichable : ${missing
        .map((category) => FACT_CATEGORY_LABELS[category])
        .join(", ")}.`,
      "Aucun extrait direct suffisamment fiable n’a franchi la vérification.",
    );
  }
  if (options.rejectedProofCount > 0) {
    addUnknown(
      "source_inaccessible",
      `${options.rejectedProofCount} preuve(s) proposée(s) ont été écartées avant affichage.`,
      "URL non reliée, page inaccessible, format refusé ou extrait exact introuvable.",
    );
  }

  let identityStatus: ResearchDossier["identity"]["status"];
  let globalStatus: ResearchDossier["global_status"];
  let resultMode: ResearchDossier["result_mode"];
  if (resolved) {
    identityStatus = "resolved";
    const visibleSourceCount = new Set(sources.map(({ source_id }) => source_id)).size;
    const isComplete = claims.length >= 3 && visibleSourceCount >= 2 && contradictions.length === 0;
    globalStatus = isComplete ? "complete_within_scope" : "partial";
    resultMode = "standard";
  } else if (
    options.result.document.identityStatus === "ambiguous" ||
    options.result.document.identityStatus === "insufficient_context" ||
    requestedTypeMismatch
  ) {
    identityStatus = candidates.length >= 2 ? "ambiguous" : "insufficient_context";
    globalStatus = "needs_clarification";
    resultMode = "standard";
    addUnknown(
      "identity_ambiguity",
      requestedTypeMismatch
        ? "Le type trouvé ne correspond pas au type explicitement demandé."
        : "Le nom et le contexte ne permettent pas de sélectionner une identité avec confiance.",
      "La recherche s’arrête avant tout dossier factuel afin de ne pas fusionner des entités.",
      ["Ajouter une ville, un secteur, un employeur ou un site officiel"],
    );
  } else {
    identityStatus = "not_found_within_scope";
    globalStatus = "insufficient_evidence";
    resultMode = "silence";
    if (unknowns.length === 0) {
      addUnknown(
        "no_reliable_source",
        "Aucune information publique directement vérifiable n’a été trouvée dans le périmètre.",
        "Le produit refuse de transformer l’absence de preuve en dossier confiant.",
        ["Ajouter un indice discriminant ou réessayer plus tard"],
      );
    }
  }

  const visibleFactClaims = claims.filter(
    ({ presentation_decision }) => presentation_decision === "display_fact",
  );
  const ambiguityClaims = claims.filter(
    ({ presentation_decision }) => presentation_decision === "display_ambiguity",
  );
  const recentClaimIds = visibleFactClaims.filter(({ predicate }) =>
    predicate.startsWith("recent_signal.") || predicate.startsWith("event."),
  ).map(({ claim_id }) => claim_id);
  const keyClaimIds = visibleFactClaims.filter(
    ({ claim_id }) => !recentClaimIds.includes(claim_id),
  ).map(({ claim_id }) => claim_id);
  const searchedCategories = [...new Set(
    facts.map(({ candidate }) => candidate.category),
  )] as FactCategory[];

  const inputTokens = options.result.usage.inputTokens;
  const outputTokens = options.result.usage.outputTokens;
  const totalTokens = options.result.usage.totalTokens;
  if (inputTokens === undefined || outputTokens === undefined || totalTokens === undefined) {
    throw new ResearchPipelineError("m2_receipt_usage_missing", "L’usage fournisseur est incomplet.");
  }

  const identityReason = identityStatus === "resolved"
    ? "L’identité est retenue seulement après concordance du type, du contexte et d’au moins un extrait direct."
    : identityStatus === "ambiguous" || identityStatus === "insufficient_context"
      ? "Aucune identité n’est sélectionnée tant qu’un indice discriminant manque."
      : "Aucune identité suffisamment prouvée n’est retenue dans ce périmètre.";
  const clarificationFields: ResearchDossier["identity"]["clarification_fields"] =
    identityStatus === "resolved" || identityStatus === "not_found_within_scope"
      ? []
      : options.input.context === undefined
        ? ["city", "industry", "employer", "discriminating_hint"]
        : ["official_site", "discriminating_hint"];
  const scopeDescription = searchedCategories.length > 0
    ? searchedCategories.join(", ")
    : "identité et présence publique";

  return {
    schema_version: "1.0.0",
    dossier_id: `dossier-${randomUUID()}`,
    origin: "runtime",
    request: {
      request_id: `request-${randomUUID()}`,
      submitted_at: options.startedAt.toISOString(),
      name: options.input.name,
      suggested_type: requestedType === "auto" ? "unknown" : requestedType,
      context: options.input.context === undefined ? {} : { discriminating_hint: options.input.context },
      total_character_count: Array.from(options.input.name + (options.input.context ?? "")).length,
    },
    identity: {
      status: identityStatus,
      selected_subject_id: identityStatus === "resolved" ? resolvedSubjectId : null,
      candidates,
      resolution_reason: identityReason,
      clarification_fields: clarificationFields,
    },
    sources,
    evidence,
    claims,
    inferences: [],
    contradictions,
    unknowns,
    execution_steps: [
      {
        step_id: `step-${randomUUID()}`,
        invocation_id: `invocation-${randomUUID()}`,
        operation: "identity_resolution",
        status: "completed",
        attempt: 1,
        retry_of: null,
        started_at: options.startedAt.toISOString(),
        ended_at: options.completedAt.toISOString(),
        duration_ms: options.searchingMs,
        error_code: null,
      },
      {
        step_id: `step-${randomUUID()}`,
        invocation_id: `invocation-${randomUUID()}`,
        operation: "verification",
        status: "completed",
        attempt: 1,
        retry_of: null,
        started_at: options.startedAt.toISOString(),
        ended_at: options.completedAt.toISOString(),
        duration_ms: options.sourceVerifyingMs,
        error_code: null,
      },
      {
        step_id: `step-${randomUUID()}`,
        invocation_id: `invocation-${randomUUID()}`,
        operation: "composition",
        status: "completed",
        attempt: 1,
        retry_of: null,
        started_at: options.startedAt.toISOString(),
        ended_at: options.completedAt.toISOString(),
        duration_ms: Math.max(0, options.totalMs - options.searchingMs - options.sourceVerifyingMs),
        error_code: null,
      },
    ],
    presentation: {
      summary_items: visibleFactClaims.slice(0, 3).map(({ claim_id }) => ({
        kind: "claim" as const,
        ref_id: claim_id,
      })),
      key_fact_claim_ids: keyClaimIds,
      recent_signal_claim_ids: recentClaimIds,
      ambiguity_claim_ids: ambiguityClaims.map(({ claim_id }) => claim_id),
      contradiction_ids: contradictions.map(({ contradiction_id }) => contradiction_id),
      unknown_ids: unknowns.map(({ unknown_id }) => unknown_id),
      source_ids: sources.map(({ source_id }) => source_id),
    },
    receipt: {
      run_id: options.executionId,
      started_at: options.startedAt.toISOString(),
      completed_at: options.completedAt.toISOString(),
      total_duration_ms: options.totalMs,
      latency_ms: options.totalMs,
      provider_calls: options.result.providerHttpCalls,
      usage: {
        input_tokens: Math.max(0, inputTokens),
        output_tokens: Math.max(0, outputTokens),
        total_tokens: Math.max(0, totalTokens),
      },
      cost: {
        amount_usd: options.estimatedCostUsd,
        status: "estimated",
        assumptions: [
          "Tarifs publics OpenAI datés du 27 août 2026.",
          "Web Search compté conservativement à 0,01 USD par action observée ; taxes et remises exclues.",
        ],
      },
      search_scope: {
        categories: [scopeDescription],
        stop_reason: globalStatus === "complete_within_scope"
          ? "Au moins trois faits et deux pages vérifiées ont été obtenus."
          : globalStatus === "partial"
            ? "Seules les preuves directement vérifiables sont conservées."
            : globalStatus === "needs_clarification"
              ? "La résolution d’identité est insuffisante ; aucun dossier confiant n’est produit."
              : "Les preuves publiques vérifiables sont insuffisantes.",
      },
      resumed_from_run_id: null,
    },
    result_mode: resultMode,
    global_status: globalStatus,
    error: null,
    limitations: [
      "Le dossier couvre uniquement des pages Web publiques accessibles pendant cette exécution.",
      "Les faits affichés reprennent des extraits directs ; aucune inférence n’est ajoutée.",
      "La fraîcheur reste inconnue lorsqu’aucune date explicite n’apparaît dans l’extrait.",
      "La visibilité est vérifiée dans le HTML rendu côté serveur, sans exécuter le JavaScript ni les feuilles de style externes.",
      ...(contradictions.length > 0
        ? ["Une contradiction reste ouverte : aucune valeur n’est privilégiée."]
        : []),
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
        inputTokens: receipt.inputTokens,
        cachedInputTokens: receipt.cachedInputTokens,
        outputTokens: receipt.outputTokens,
        reasoningTokens: receipt.reasoningTokens,
        totalTokens: receipt.totalTokens,
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
    if (terminalRecorded || (event.state !== "completed" && event.state !== "failed")) return;
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
    options.emit({ state: "resolving_identity", executionId, elapsedMs: options.acceptedMs });
    const searchStart = monotonicNow();
    result = await options.provider.research(options.input, options.signal);
    searchingMs = Math.max(0, Math.round(monotonicNow() - searchStart));
    failedStage = "metadata_extraction";
    assertProviderAdmission(result);
    const estimatedCostUsd = requireMeasuredCost(result);

    options.emit({
      state: "source_verifying",
      executionId,
      elapsedMs: Math.max(0, Math.round(monotonicNow() - totalStart)),
    });
    failedStage = "source_verification";
    const verificationStart = monotonicNow();
    const shouldVerifyCandidates = result.document.identityStatus !== "not_found";
    const shouldVerifyFacts = result.document.identityStatus === "resolved";
    const [candidateBatch, factBatch] = await Promise.all([
      verifyBatch({
        candidates: shouldVerifyCandidates ? result.document.candidates : [],
        result,
        sourceVerifier: options.sourceVerifier,
        signal: options.signal,
      }),
      verifyBatch({
        candidates: shouldVerifyFacts ? result.document.claims : [],
        result,
        sourceVerifier: options.sourceVerifier,
        signal: options.signal,
      }),
    ]);
    sourceVerifyingMs = Math.max(0, Math.round(monotonicNow() - verificationStart));
    sourceFetchCount = candidateBatch.sourceFetchCount + factBatch.sourceFetchCount;

    options.emit({
      state: "building",
      executionId,
      elapsedMs: Math.max(0, Math.round(monotonicNow() - totalStart)),
    });
    const completedAt = now();
    const interimTotalMs = Math.max(0, Math.round(monotonicNow() - totalStart));
    failedStage = "receipt_construction";
    const dossier = buildDossier({
      input: options.input,
      result,
      verifiedIdentityCandidates: candidateBatch.verified,
      verifiedFacts: factBatch.verified,
      rejectedProofCount: candidateBatch.rejectedCount + factBatch.rejectedCount,
      executionId,
      startedAt,
      completedAt,
      totalMs: interimTotalMs,
      searchingMs,
      sourceVerifyingMs,
      estimatedCostUsd,
    });

    options.emit({
      state: "validating",
      executionId,
      elapsedMs: Math.max(0, Math.round(monotonicNow() - totalStart)),
    });
    const validationStart = monotonicNow();
    failedStage = "truth_validation";
    const contract = (options.validateDossier ?? validateResearchDossier)(dossier);
    if (!contract.ok) {
      throw new ResearchPipelineError("m2_contract_invalid", "Le résultat ne satisfait pas le contrat structurel.");
    }
    const invariants = validateRuntimeInvariants(dossier);
    if (!invariants.ok) {
      throw new ResearchPipelineError(
        "runtime_invariants_invalid",
        "Le résultat ne satisfait pas les invariants de vérité.",
      );
    }
    validatingMs = Math.max(0, Math.round(monotonicNow() - validationStart));
    const totalMs = Math.max(0, Math.round(monotonicNow() - totalStart));
    dossier.receipt.total_duration_ms = totalMs;
    dossier.receipt.latency_ms = totalMs;
    dossier.receipt.completed_at = now().toISOString();
    const receipt = buildReceipt({
      executionId,
      result,
      acceptedMs: options.acceptedMs,
      searchingMs,
      sourceFetchCount,
      sourceCount: dossier.sources.length,
      sourceVerifyingMs,
      validatingMs,
      totalMs,
      finalStatus: "completed",
      timedOutOrCancelled: false,
    });
    await deliverTerminal({ state: "completed", executionId, elapsedMs: totalMs, dossier, receipt });
  } catch (error) {
    if (terminalRecorded) return;
    const totalMs = Math.max(0, Math.round(monotonicNow() - totalStart));
    const receipt = buildFailureReceipt(error, {
      attemptId: executionId,
      failedStage,
      result,
      ...(error instanceof ResearchPipelineError ? { validationCode: error.code } : {}),
      sourceFetchCount: error instanceof ResearchPipelineError
        ? error.sourceDiagnostics?.sourceFetchCount ?? sourceFetchCount
        : sourceFetchCount,
      sourceVerificationMs: error instanceof ResearchPipelineError
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
