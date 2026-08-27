import { randomUUID } from "node:crypto";

import { validateResearchDossier } from "../../domain/contract-validator";
import type { ResearchDossier } from "../../domain/research-dossier";
import { validateRuntimeInvariants } from "../../domain/runtime-invariants";
import { PRIMARY_RESEARCH_MODEL } from "../ai/providers";
import {
  deduplicateVerifiedFacts,
  evaluateClaimQuality,
  type DeduplicatedBusinessFact,
} from "./claim-quality";
import { evaluateCompleteness } from "./completeness";
import { ResearchPipelineError } from "./errors";
import {
  resolveIdentity,
  type VerifiedIdentityCandidate,
} from "./identity-resolution";
import {
  buildFailureReceipt,
  persistFailureReceipt,
  publicFailureMessage,
} from "./failure-receipt";
import { bindProviderSource } from "./provider-metadata";
import { classifyNumericClaims, parseMetricValue } from "./numeric-normalization";
import { evaluateFactAttribution } from "./scope-policy";
import { serializeSourceLocator } from "./source-content";
import { classifyTemporalStatus, deriveFactPeriod } from "./temporal-policy";
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
  readonly excerptVerificationCount: number;
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
  readonly buildingMs: number;
  readonly excerptVerificationCount: number;
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
    excerptVerificationCount: options.excerptVerificationCount,
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
      buildingMs: options.buildingMs,
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

function scopeFor(candidate: ProviderFactCandidate): DossierScope {
  return { type: candidate.scopeType, label: candidate.scopeLabel };
}

function publicDiscriminators(
  values: Partial<ProviderIdentityCandidate["discriminators"]>,
): ResearchDossier["identity"]["candidates"][number]["discriminators"] {
  const officialSite = values.officialSite;
  return {
    ...(values.city === undefined || values.city === null ? {} : { city: values.city }),
    ...(values.country === undefined || values.country === null ? {} : { country: values.country }),
    ...(values.industry === undefined || values.industry === null ? {} : { industry: values.industry }),
    ...(values.employer === undefined || values.employer === null ? {} : { employer: values.employer }),
    ...(officialSite === undefined || officialSite === null
      ? {}
      : { official_site: officialSite.includes("://") ? officialSite : `https://${officialSite}` }),
    ...(values.legalIdentifier === undefined || values.legalIdentifier === null
      ? {}
      : { legal_identifier: values.legalIdentifier }),
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
  return {
    verified,
    rejectedCount,
    sourceFetchCount,
    excerptVerificationCount: options.candidates.length,
  };
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
  const identityDecision = resolveIdentity({
    input: options.input,
    providerStatus: options.result.document.identityStatus,
    candidates: options.verifiedIdentityCandidates as readonly VerifiedIdentityCandidate[],
  });
  const selected = identityDecision.selected;
  const attributionDecisions = selected === null
    ? []
    : options.verifiedFacts.map((fact) => ({
        fact,
        decision: evaluateFactAttribution({
          selected,
          fact,
          requestedName: options.input.name,
          verifiedOfficialSite: identityDecision.verifiedDiscriminators.officialSite,
        }),
      }));
  const eligibleFacts = attributionDecisions.flatMap(({ fact, decision }) =>
    decision.accepted ? [fact] : [],
  );
  const attributionRejectedCount = attributionDecisions.length - eligibleFacts.length;
  const qualityDecisions = selected === null
    ? []
    : eligibleFacts.map((fact) => ({
        fact,
        decision: evaluateClaimQuality({
          candidate: fact.candidate,
          proof: fact.proof,
          selectedDisplayName: selected.candidate.displayName,
        }),
      }));
  const qualityAcceptedFacts = qualityDecisions.flatMap(({ fact, decision }) =>
    decision.accepted ? [fact] : [],
  );
  const qualityRejectedCount = qualityDecisions.length - qualityAcceptedFacts.length;
  const deduplication = deduplicateVerifiedFacts(qualityAcceptedFacts);
  const businessFacts = deduplication.facts;
  const resolved = identityDecision.status === "resolved" && selected !== null;

  const sources: ResearchDossier["sources"] = [];
  const evidence: ResearchDossier["evidence"] = [];
  const claims: ResearchDossier["claims"] = [];
  const candidates: ResearchDossier["identity"]["candidates"] = [];
  const sourceBySubjectAndUrl = new Map<string, string>();
  const factRecordByFact = new Map<DeduplicatedBusinessFact, {
    readonly claimId: string;
    readonly evidenceIds: readonly string[];
    readonly period: DossierFactPeriod;
    readonly normalizedValue: number | string | null;
  }>();

  const resolvedSubjectId = `subject-${randomUUID()}`;
  if (resolved && selected !== null) {
    candidates.push({
      subject_id: resolvedSubjectId,
      entity_type: selected.candidate.entityType,
      display_name: selected.candidate.displayName,
      discriminators: publicDiscriminators(identityDecision.verifiedDiscriminators),
      match_rationale: identityDecision.rationale,
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

  let identityClaimId: string | null = null;
  if (resolved && selected !== null) {
    identityClaimId = `claim-${randomUUID()}`;
    const identityEvidenceId = `evidence-${randomUUID()}`;
    const identityScope: DossierScope = {
      type: selected.candidate.entityScope,
      label: selected.candidate.displayName,
    };
    const identitySourceId = ensureSource(resolvedSubjectId, identityScope, selected.proof);
    const unknownPeriod: DossierFactPeriod = {
      status: "unknown",
      start: null,
      end: null,
      as_of: null,
      label: null,
    };
    evidence.push({
      evidence_id: identityEvidenceId,
      source_id: identitySourceId,
      claim_id: identityClaimId,
      excerpt: selected.proof.verifiedExcerpt,
      locator: serializeSourceLocator(selected.proof.locator),
      entity_id: resolvedSubjectId,
      fact_period: unknownPeriod,
      scope: identityScope,
      relation: "supports",
      verification_method: "source_content",
      verified_at: selected.proof.locator.retrievedAt,
    });
    claims.push({
      claim_id: identityClaimId,
      subject_id: resolvedSubjectId,
      statement: selected.proof.verifiedExcerpt,
      predicate: "identity.proof",
      structured_value: null,
      unit: null,
      fact_period: unknownPeriod,
      scope: identityScope,
      temporal_status: "unknown",
      evidence_ids: [identityEvidenceId],
      claim_state: "supported",
      reconciliation_state: "confirmation",
      presentation_decision: "display_fact",
      presentation_reason: "Preuve d’identité séparée des faits métier ; l’extrait exact retrouvé est conservé.",
    });
  }

  const conflictGroups = new Map<string, DeduplicatedBusinessFact[]>();
  if (resolved) {
    for (const fact of businessFacts) {
      if (fact.candidate.category !== "metric") continue;
      const normalizedField = (value: string | null): string =>
        (value ?? "").normalize("NFKC").toLocaleLowerCase("fr").trim();
      const key = [
        normalizedField(fact.candidate.predicate),
        fact.candidate.scopeType,
        normalizedField(fact.candidate.scopeLabel),
        normalizedField(fact.candidate.factDate ?? fact.candidate.factPeriodLabel),
        normalizedField(fact.candidate.unit),
        normalizedField(fact.candidate.currency),
        normalizedField(fact.candidate.contradictionKey),
      ].join("|");
      const group = conflictGroups.get(key) ?? [];
      group.push(fact);
      conflictGroups.set(key, group);
    }
    for (const [key, group] of conflictGroups) {
      const values = new Set(group.flatMap(({ candidate }) => {
        const value = parseMetricValue(candidate.excerpt);
        return value === null ? [] : [value];
      }));
      const pages = new Set(group.flatMap(({ proofs }) => proofs.map(({ finalUrl }) => finalUrl)));
      const hasContradiction = group.some((left, index) =>
        group.slice(index + 1).some((right) =>
          classifyNumericClaims(left.candidate, right.candidate) === "contradiction",
        ),
      );
      if (values.size < 2 || pages.size < 2 || !hasContradiction) conflictGroups.delete(key);
    }
  }
  const conflictingFacts = new Set([...conflictGroups.values()].flat());

  if (resolved) {
    for (const item of businessFacts) {
      const claimId = `claim-${randomUUID()}`;
      const scope = scopeFor(item.candidate);
      const period = deriveFactPeriod(item.candidate);
      const temporalStatus = classifyTemporalStatus({
        candidate: item.candidate,
        period,
        observedAt: options.completedAt,
      });
      const contested = conflictingFacts.has(item);
      const evidenceIds = item.proofs.map((proof) => {
        const evidenceId = `evidence-${randomUUID()}`;
        const sourceId = ensureSource(resolvedSubjectId, scope, proof);
        evidence.push({
          evidence_id: evidenceId,
          source_id: sourceId,
          claim_id: claimId,
          excerpt: proof.verifiedExcerpt,
          locator: serializeSourceLocator(proof.locator),
          entity_id: resolvedSubjectId,
          fact_period: period,
          scope,
          relation: "supports",
          verification_method: "source_content",
          verified_at: proof.locator.retrievedAt,
        });
        return evidenceId;
      });
      const normalizedValue = item.candidate.category === "metric"
        ? parseMetricValue(item.candidate.excerpt)
        : item.candidate.normalizedValue;
      claims.push({
        claim_id: claimId,
        subject_id: resolvedSubjectId,
        statement: item.candidate.excerpt,
        predicate: `${item.candidate.category}.${item.candidate.predicate}`,
        structured_value: normalizedValue === null
          ? null
          : {
              value: normalizedValue,
              value_type: typeof normalizedValue === "number" ? "number" : "text",
            },
        unit: item.candidate.unit,
        fact_period: period,
        scope,
        temporal_status: temporalStatus,
        evidence_ids: evidenceIds,
        claim_state: contested
          ? "contested"
          : temporalStatus === "historical"
            ? "historical"
            : "supported",
        reconciliation_state: contested ? "contradiction" : "confirmation",
        presentation_decision: "display_fact",
        presentation_reason: "Le texte affiché est l’extrait exact retrouvé dans la page source consultée.",
      });
      factRecordByFact.set(item, { claimId, evidenceIds, period, normalizedValue });
    }
  } else if (
    identityDecision.status === "ambiguous" ||
    identityDecision.status === "insufficient_context"
  ) {
    for (const item of identityDecision.candidates) {
      const subjectId = `subject-${randomUUID()}`;
      const claimId = `claim-${randomUUID()}`;
      const evidenceId = `evidence-${randomUUID()}`;
      const scope: DossierScope = { type: item.candidate.entityScope, label: item.candidate.displayName };
      const sourceId = ensureSource(subjectId, scope, item.proof);
      candidates.push({
        subject_id: subjectId,
        entity_type: item.candidate.entityType,
        display_name: item.candidate.displayName,
        discriminators: {},
        match_rationale: "Candidat distinct retrouvé dans une source directement vérifiée, sans sélection serveur.",
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
      const records = group.flatMap((fact) => {
        const record = factRecordByFact.get(fact);
        return record === undefined || record.normalizedValue === null
          ? []
          : [{ candidate: fact.candidate, ...record }];
      });
      if (records.length < 2) continue;
      const first = records[0];
      if (first === undefined) continue;
      const versions = records.flatMap(({ candidate, claimId, evidenceIds, normalizedValue }) => {
        const firstEvidenceId = evidenceIds[0];
        if (firstEvidenceId === undefined || normalizedValue === null) return [];
        return [{
          claim_id: claimId,
          evidence_ids: [firstEvidenceId, ...evidenceIds.slice(1)] as [string, ...string[]],
          normalized_value: normalizedValue,
          unit: candidate.unit,
          currency: candidate.currency,
        }];
      });
      const firstVersion = versions[0];
      const secondVersion = versions[1];
      if (firstVersion === undefined || secondVersion === undefined) continue;
      contradictions.push({
        contradiction_id: `contradiction-${randomUUID()}`,
        predicate: `${first.candidate.category}.${first.candidate.predicate}`,
        period: first.period,
        scope: scopeFor(first.candidate),
        metric_definition: first.candidate.contradictionKey ?? first.candidate.predicate,
        published_or_estimated_checked: false,
        classification: "contradiction",
        versions: [firstVersion, secondVersion, ...versions.slice(2)],
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
  if (attributionRejectedCount > 0) {
    addUnknown(
      "out_of_scope",
      `${attributionRejectedCount} fait(s) vérifié(s) ont été écartés car leur sujet ou leur portée ne correspondait pas à l’identité retenue.`,
      "Un lien de sujet, une portée compatible et un ancrage de page sont exigés avant attribution.",
    );
  }
  if (qualityRejectedCount > 0) {
    addUnknown(
      "not_verified",
      `${qualityRejectedCount} fait(s) ont été écartés par le contrôle d’atomicité et de qualité.`,
      "Un fait métier doit être autonome, lié au sujet et contenir sa période, sa valeur et sa portée lorsqu’elles sont requises.",
    );
  }

  const completeness = evaluateCompleteness({
    identityResolved: resolved,
    businessClaims: businessFacts.map(({ candidate, proofs }) => ({
      category: candidate.category,
      pageUrls: proofs.map(({ finalUrl }) => finalUrl),
    })),
    visibleContradictionCount: contradictions.filter(({ visible }) => visible).length,
    subjectScopeViolationCount: 0,
    criticalUnknownCount: 0,
  });

  let identityStatus: ResearchDossier["identity"]["status"];
  let globalStatus: ResearchDossier["global_status"];
  let resultMode: ResearchDossier["result_mode"];
  if (resolved) {
    identityStatus = "resolved";
    globalStatus = completeness.status;
    resultMode = "standard";
  } else if (
    identityDecision.status === "ambiguous" ||
    identityDecision.status === "insufficient_context"
  ) {
    identityStatus = identityDecision.status;
    globalStatus = "needs_clarification";
    resultMode = "standard";
    addUnknown(
      "identity_ambiguity",
      "Le nom, le type et les indices démontrés ne permettent pas de sélectionner une identité unique.",
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

  const visibleBusinessClaims = claims.filter(
    ({ presentation_decision, predicate }) =>
      presentation_decision === "display_fact" && !predicate.startsWith("identity."),
  );
  const ambiguityClaims = claims.filter(
    ({ presentation_decision }) => presentation_decision === "display_ambiguity",
  );
  const recentClaimIds = visibleBusinessClaims.filter(({ predicate }) =>
    predicate.startsWith("recent_signal.") || predicate.startsWith("event."),
  ).map(({ claim_id }) => claim_id);
  const keyClaimIds = [
    ...(identityClaimId === null ? [] : [identityClaimId]),
    ...visibleBusinessClaims.filter(
    ({ claim_id }) => !recentClaimIds.includes(claim_id),
    ).map(({ claim_id }) => claim_id),
  ];
  const summaryClaims: DossierClaim[] = [];
  const summaryCategories = new Set<string>();
  for (const claim of visibleBusinessClaims) {
    const category = claim.predicate.split(".", 1)[0] ?? "other";
    if (summaryCategories.has(category)) continue;
    summaryClaims.push(claim);
    summaryCategories.add(category);
    if (summaryClaims.length === 3) break;
  }
  for (const claim of visibleBusinessClaims) {
    if (summaryClaims.length === 3) break;
    if (!summaryClaims.includes(claim)) summaryClaims.push(claim);
  }
  const searchedCategories = [...new Set(
    businessFacts.map(({ candidate }) => candidate.category),
  )] as FactCategory[];

  const inputTokens = options.result.usage.inputTokens;
  const outputTokens = options.result.usage.outputTokens;
  const totalTokens = options.result.usage.totalTokens;
  if (inputTokens === undefined || outputTokens === undefined || totalTokens === undefined) {
    throw new ResearchPipelineError("m2_receipt_usage_missing", "L’usage fournisseur est incomplet.");
  }

  const identityReason = identityDecision.rationale;
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
        ended_at: options.startedAt.toISOString(),
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
        ended_at: options.startedAt.toISOString(),
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
        ended_at: options.startedAt.toISOString(),
        duration_ms: 0,
        error_code: null,
      },
    ],
    presentation: {
      summary_items: summaryClaims.map(({ claim_id }) => ({
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
        stop_reason: globalStatus === "complete_within_scope" || globalStatus === "partial"
          ? completeness.stopReason
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
      "Une date récente établit un événement daté, jamais à elle seule un état actuel.",
      "La visibilité est vérifiée dans le HTML rendu côté serveur, sans exécuter le JavaScript ni les feuilles de style externes.",
      ...(resolved && completeness.criteria.publisherDomains < 2
        ? ["Les sources sont concentrées sur un seul éditeur ; le dossier reste partiel."]
        : []),
      ...(deduplication.duplicateCount > 0
        ? [`${deduplication.duplicateCount} doublon(s) ont été fusionnés sans augmenter le nombre de faits métier.`]
        : []),
      ...(deduplication.truncatedCount > 0
        ? [`${deduplication.truncatedCount} fait(s) au-delà de la limite de six n’ont pas été présentés.`]
        : []),
      ...(contradictions.length > 0
        ? ["Une contradiction reste ouverte : aucune valeur n’est privilégiée."]
        : []),
    ],
  };
}

function finalizeDossierTimings(options: {
  readonly dossier: ResearchDossier;
  readonly startedAt: Date;
  readonly searchingStartMs: number;
  readonly searchingMs: number;
  readonly sourceVerifyingStartMs: number;
  readonly sourceVerifyingMs: number;
  readonly buildingStartMs: number;
  readonly buildingMs: number;
  readonly validatingStartMs: number;
  readonly validatingMs: number;
  readonly totalMs: number;
}): void {
  const phase = (
    operation: ResearchDossier["execution_steps"][number]["operation"],
    startOffsetMs: number,
    durationMs: number,
  ): ResearchDossier["execution_steps"][number] => {
    const boundedStartOffset = Math.max(0, Math.round(startOffsetMs));
    const boundedDuration = Math.max(0, Math.round(durationMs));
    const startedAtMs = options.startedAt.getTime() + boundedStartOffset;
    return {
      step_id: `step-${randomUUID()}`,
      invocation_id: `invocation-${randomUUID()}`,
      operation,
      status: "completed",
      attempt: 1,
      retry_of: null,
      started_at: new Date(startedAtMs).toISOString(),
      ended_at: new Date(startedAtMs + boundedDuration).toISOString(),
      duration_ms: boundedDuration,
      error_code: null,
    };
  };
  options.dossier.execution_steps = [
    phase("identity_resolution", options.searchingStartMs, options.searchingMs),
    phase("verification", options.sourceVerifyingStartMs, options.sourceVerifyingMs),
    phase("composition", options.buildingStartMs, options.buildingMs),
    phase("reconciliation", options.validatingStartMs, options.validatingMs),
  ];
  const completedAt = new Date(
    options.startedAt.getTime() + Math.max(0, Math.round(options.totalMs)),
  ).toISOString();
  options.dossier.receipt.started_at = options.startedAt.toISOString();
  options.dossier.receipt.completed_at = completedAt;
  options.dossier.receipt.total_duration_ms = Math.max(0, Math.round(options.totalMs));
  options.dossier.receipt.latency_ms = Math.max(0, Math.round(options.totalMs));
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
  let searchingStartMs = 0;
  let searchingMs = 0;
  let sourceVerifyingStartMs = 0;
  let sourceVerifyingMs = 0;
  let sourceFetchCount = 0;
  let excerptVerificationCount = 0;
  let buildingStartMs = 0;
  let buildingMs = 0;
  let validatingStartMs = 0;
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
    options.emit({
      state: "researching_and_resolving",
      executionId,
      elapsedMs: options.acceptedMs,
    });
    const searchStart = monotonicNow();
    searchingStartMs = Math.max(0, Math.round(searchStart - totalStart));
    result = await options.provider.research(options.input, options.signal);
    searchingMs = Math.max(
      0,
      Math.round(monotonicNow() - totalStart) - searchingStartMs,
    );
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
    sourceVerifyingStartMs = Math.max(
      0,
      Math.round(verificationStart - totalStart),
    );
    const [candidateBatch, factBatch] = await Promise.all([
      verifyBatch({
        candidates: result.document.candidates,
        result,
        sourceVerifier: options.sourceVerifier,
        signal: options.signal,
      }),
      verifyBatch({
        candidates: result.document.claims,
        result,
        sourceVerifier: options.sourceVerifier,
        signal: options.signal,
      }),
    ]);
    sourceVerifyingMs = Math.max(
      0,
      Math.round(monotonicNow() - totalStart) - sourceVerifyingStartMs,
    );
    sourceFetchCount = candidateBatch.sourceFetchCount + factBatch.sourceFetchCount;
    excerptVerificationCount =
      candidateBatch.excerptVerificationCount + factBatch.excerptVerificationCount;

    options.emit({
      state: "building",
      executionId,
      elapsedMs: Math.max(0, Math.round(monotonicNow() - totalStart)),
    });
    const buildingStart = monotonicNow();
    buildingStartMs = Math.max(0, Math.round(buildingStart - totalStart));
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
    buildingMs = Math.max(
      0,
      Math.round(monotonicNow() - totalStart) - buildingStartMs,
    );
    const beforeValidationMs = Math.max(0, Math.round(monotonicNow() - totalStart));
    validatingStartMs = beforeValidationMs;
    finalizeDossierTimings({
      dossier,
      startedAt,
      searchingStartMs,
      searchingMs,
      sourceVerifyingStartMs,
      sourceVerifyingMs,
      buildingStartMs,
      buildingMs,
      validatingStartMs,
      validatingMs: 0,
      totalMs: beforeValidationMs,
    });

    options.emit({
      state: "validating",
      executionId,
      elapsedMs: Math.max(0, Math.round(monotonicNow() - totalStart)),
    });
    const validationStart = monotonicNow();
    validatingStartMs = Math.max(0, Math.round(validationStart - totalStart));
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
    validatingMs = Math.max(
      0,
      Math.round(monotonicNow() - totalStart) - validatingStartMs,
    );
    const totalMs = Math.max(0, Math.round(monotonicNow() - totalStart));
    finalizeDossierTimings({
      dossier,
      startedAt,
      searchingStartMs,
      searchingMs,
      sourceVerifyingStartMs,
      sourceVerifyingMs,
      buildingStartMs,
      buildingMs,
      validatingStartMs,
      validatingMs,
      totalMs,
    });
    const finalizedContract = validateResearchDossier(dossier);
    const finalizedInvariants = validateRuntimeInvariants(dossier);
    if (!finalizedContract.ok || !finalizedInvariants.ok) {
      throw new ResearchPipelineError(
        "runtime_invariants_invalid",
        "Le reçu final ne satisfait pas les invariants de vérité.",
      );
    }
    const receipt = buildReceipt({
      executionId,
      result,
      acceptedMs: options.acceptedMs,
      searchingMs,
      sourceFetchCount,
      excerptVerificationCount,
      sourceCount: dossier.sources.length,
      sourceVerifyingMs,
      buildingMs,
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
