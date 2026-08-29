import { createHash, randomUUID } from "node:crypto";

import { validateResearchDossier } from "../../domain/contract-validator";
import {
  canonicalConflictText,
  conflictPeriodKey,
  conflictScopeKey,
  conflictSourcePageKey,
  type ConflictMetricObservation,
} from "../../domain/conflict-comparison";
import type { ResearchDossier } from "../../domain/research-dossier";
import { validateRuntimeInvariants } from "../../domain/runtime-invariants";
import { publisherDomainForUrl } from "../../domain/publisher-domain";
import { PRIMARY_RESEARCH_MODEL } from "../ai/providers";
import {
  deduplicateVerifiedFacts,
  evaluateClaimQuality,
  type DeduplicatedBusinessFact,
} from "./claim-quality";
import { evaluateCompleteness } from "./completeness";
import { ResearchPipelineError } from "./errors";
import {
  assembleVerifiedIdentityCandidates,
  isTraceableSingleSourcePersonRoleProof,
  resolveIdentity,
} from "./identity-resolution";
import {
  buildFailureReceipt,
  persistFailureReceipt,
  publicFailureMessage,
} from "./failure-receipt";
import { bindProviderSource } from "./provider-metadata";
import {
  classifyNumericClaims,
  metricComparisonSignature,
  parseMetricValue,
  type NumericRelationship,
} from "./numeric-normalization";
import { evaluateFactAttribution } from "./scope-policy";
import {
  normalizeVisibleText,
  reverifyExcerptWithinProof,
  serializeSourceLocator,
} from "./source-content";
import { classifyTemporalStatus, deriveFactPeriod } from "./temporal-policy";
import type {
  FactCategory,
  FailureReceipt,
  FailureStage,
  ProviderClaimCandidate,
  ProviderFactCandidate,
  ProviderIdentityCandidate,
  ProviderResearchResult,
  ProviderSourceBinding,
  PublicReceipt,
  RetrievedSourceDocument,
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
  readonly grounded: readonly VerifiedCandidate<T>[];
  readonly documents: readonly {
    readonly candidate: T;
    readonly document: RetrievedSourceDocument;
  }[];
  readonly rejectedCount: number;
  readonly sourceFetchCount: number;
  readonly excerptVerificationCount: number;
}

interface DossierBuildDiagnostics {
  attributionRejections: Record<string, number>;
  qualityRejections: Record<string, number>;
  identityStatus: string;
  identityReasonCodes: readonly string[];
}

function proofVerificationMethod(
  proof: VerifiedSourceProof,
): "source_content" | "provider_annotation" | "search_snippet" {
  return proof.verificationMethod ?? "source_content";
}

function canRetainProviderGrounding(
  citation: ProviderSourceBinding,
  document: RetrievedSourceDocument | undefined,
): boolean {
  return !("bindingType" in citation && citation.bindingType === "structured_output_url") ||
    document !== undefined;
}

function providerGroundedProof(options: {
  readonly result: ProviderResearchResult;
  readonly candidate: ProviderClaimCandidate;
  readonly citation: ProviderSourceBinding;
  readonly document?: RetrievedSourceDocument;
}): VerifiedSourceProof | null {
  if (!canRetainProviderGrounding(options.citation, options.document)) return null;
  const url = options.document?.finalUrl ?? options.citation.url;
  let title = "Source Web Search";
  if ("title" in options.citation && typeof options.citation.title === "string") {
    title = options.citation.title;
  } else {
    title = options.result.sources.find(({ url: sourceUrl }) => sourceUrl === options.citation.url)
      ?.title ?? new URL(url).hostname;
  }
  const retrievedAt = options.document?.retrievedAt ?? new Date().toISOString();
  const fingerprint = createHash("sha256")
    .update(`provider-grounded\n${url}\n${options.candidate.excerpt}`, "utf8")
    .digest("hex");
  const verificationMethod = "bindingType" in options.citation &&
      (options.citation.bindingType === "web_search_source" ||
        options.citation.bindingType === "structured_output_url")
    ? "search_snippet" as const
    : "provider_annotation" as const;
  return {
    citation: options.citation,
    citationUrl: options.citation.url,
    finalUrl: url,
    title,
    verifiedExcerpt: options.candidate.excerpt,
    documentText: options.document?.documentText ?? options.candidate.excerpt,
    locator: {
      exact: options.candidate.excerpt,
      prefix: "",
      suffix: "",
      occurrenceIndex: 0,
      finalUrl: url,
      citationUrl: options.citation.url,
      retrievedAt,
      normalizedTextSha256: fingerprint,
      contentType: options.document?.contentType ?? "application/x-provider-citation",
      bytesRead: options.document?.bytesRead ?? 0,
      redirectCount: options.document?.redirectCount ?? 0,
    },
    sourceFetchCount: options.document?.sourceFetchCount ?? 0,
    sourceVerificationMs: options.document?.sourceVerificationMs ?? 0,
    verificationMethod,
    retrievalStatus: options.document === undefined ? "unavailable" : "retrieved",
  };
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
  readonly pipelineCounts?: PublicReceipt["pipelineCounts"];
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
    ...(options.pipelineCounts === undefined ? {} : { pipelineCounts: options.pipelineCounts }),
  };
}

function scopeFor(candidate: ProviderFactCandidate): DossierScope {
  return { type: candidate.scopeType, label: candidate.scopeLabel };
}

function metricDefinitionFor(
  signature: ConflictMetricObservation,
): string {
  const known = signature.metric === "revenue" ? "Chiffre d’affaires" : "Effectif";
  const nature = signature.valueNature === "estimated" ? "estimée" : "publiée";
  const qualifier = signature.definition === "adjusted"
    ? " ajusté"
    : signature.definition === "organic"
      ? " organique"
      : signature.definition === "gross"
        ? " brut"
        : signature.definition === "net"
          ? " net"
          : signature.definition === "fte"
            ? " ETP"
            : signature.definition === "headcount_year_end"
              ? " de fin d’année"
              : signature.definition === "headcount_average"
                ? " moyen"
                : signature.definition === "fte_year_end"
                  ? " ETP de fin d’année"
                  : signature.definition === "fte_average"
                    ? " ETP moyen"
            : "";
  const adjective = nature === "estimée" ? "estimé" : "publié";
  return `${known}${qualifier} ${adjective}`;
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
  readonly attributedDisplayNames?: (candidate: T) => readonly string[] | undefined;
}): Promise<VerificationBatch<T>> {
  const settled = await Promise.all(
    options.candidates.map(async (candidate) => {
      let citation: ProviderSourceBinding;
      try {
        citation = bindProviderSource(options.result, candidate);
      } catch (error) {
        return { status: "rejected" as const, error, candidate };
      }
      const attributedDisplayNames = options.attributedDisplayNames?.(candidate);
      if (
        options.sourceVerifier.inspect !== undefined &&
        options.sourceVerifier.verifyDocument !== undefined
      ) {
        let document: RetrievedSourceDocument;
        try {
          document = await options.sourceVerifier.inspect({
            candidate,
            citation,
            signal: options.signal,
          });
        } catch (error) {
          return {
            status: "rejected" as const,
            error,
            candidate,
            grounded: providerGroundedProof({
              result: options.result,
              candidate,
              citation,
            }),
          };
        }
        try {
          const proof = await options.sourceVerifier.verifyDocument({
            document,
            candidate,
            ...(attributedDisplayNames === undefined ? {} : { attributedDisplayNames }),
          });
          return { status: "verified" as const, candidate, proof, document };
        } catch (error) {
          return {
            status: "rejected" as const,
            error,
            candidate,
            document,
            grounded: providerGroundedProof({
              result: options.result,
              candidate,
              citation,
              document,
            }),
          };
        }
      }
      try {
        const proof = await options.sourceVerifier.verify({
          candidate,
          ...(attributedDisplayNames === undefined ? {} : { attributedDisplayNames }),
          citation,
          signal: options.signal,
        });
        return { status: "verified" as const, candidate, proof };
      } catch (error) {
        return {
          status: "rejected" as const,
          error,
          candidate,
          grounded: providerGroundedProof({ result: options.result, candidate, citation }),
        };
      }
    }),
  );
  const verified: VerifiedCandidate<T>[] = [];
  const grounded: VerifiedCandidate<T>[] = [];
  const documents: Array<{ candidate: T; document: RetrievedSourceDocument }> = [];
  let rejectedCount = 0;
  let sourceFetchCount = 0;
  for (const item of settled) {
    if (item.status === "verified") {
      verified.push({ candidate: item.candidate, proof: item.proof });
      sourceFetchCount += item.proof.sourceFetchCount;
      if (item.document !== undefined) documents.push({ candidate: item.candidate, document: item.document });
    } else {
      rejectedCount += 1;
      if (item.error instanceof ResearchPipelineError) {
        sourceFetchCount += item.error.sourceDiagnostics?.sourceFetchCount ?? 0;
      }
      if (item.candidate !== undefined && item.document !== undefined) {
        documents.push({ candidate: item.candidate, document: item.document });
        sourceFetchCount += item.document.sourceFetchCount;
      }
      if (item.candidate !== undefined && item.grounded !== null && item.grounded !== undefined) {
        grounded.push({ candidate: item.candidate, proof: item.grounded });
      }
    }
  }
  return {
    verified,
    grounded,
    documents,
    rejectedCount,
    sourceFetchCount,
    excerptVerificationCount: options.candidates.length,
  };
}

function normalizeIdentityLabel(value: string): string {
  return normalizeVisibleText(value).toLocaleLowerCase("fr");
}

function withSelectedIdentitySource(
  result: ProviderResearchResult,
  input: ResearchInput,
): ProviderResearchResult {
  if (
    input.identitySourceUrl === undefined ||
    input.entityType === undefined ||
    input.entityType === "auto"
  ) return result;
  const matchingCandidate = result.document.candidates.find((candidate) =>
    candidate.entityType === input.entityType &&
    normalizeIdentityLabel(candidate.displayName) === normalizeIdentityLabel(input.name)
  );
  const occupiedKeys = new Set(result.document.candidates.map(({ candidateKey }) => candidateKey));
  let candidateKey = matchingCandidate?.candidateKey ?? "selected-source";
  let suffix = 2;
  while (matchingCandidate === undefined && occupiedKeys.has(candidateKey)) {
    candidateKey = `selected-source-${suffix}`;
    suffix += 1;
  }
  const anchorCandidate: ProviderIdentityCandidate = {
    candidateKey,
    displayName: input.name,
    entityType: input.entityType,
    entityScope: input.entityType === "person" ? "person" : "company",
    discriminators: {
      city: null,
      country: null,
      industry: null,
      employer: null,
      officialSite: null,
      legalIdentifier: null,
      year: null,
    },
    statement: input.name,
    structuredUrl: input.identitySourceUrl,
    excerpt: input.name,
    prefix: null,
    suffix: null,
  };
  return {
    ...result,
    document: {
      ...result.document,
      entityType: input.entityType,
      candidates: [anchorCandidate],
      claims: result.document.claims.filter(({ subjectKey }) => subjectKey === candidateKey),
    },
  };
}

function sourceFirstRoleExcerptCandidates(
  proof: VerifiedSourceProof,
  displayName: string,
): readonly string[] {
  const values = new Set<string>([proof.verifiedExcerpt]);
  const documentText = proof.documentText;
  const normalizedDocument = documentText.toLocaleLowerCase("fr");
  const normalizedName = normalizeVisibleText(displayName).toLocaleLowerCase("fr");
  let searchFrom = 0;
  while (searchFrom < normalizedDocument.length) {
    const nameStart = normalizedDocument.indexOf(normalizedName, searchFrom);
    if (nameStart < 0) break;
    const lineStart = documentText.lastIndexOf("\n", nameStart - 1) + 1;
    const currentBreak = documentText.indexOf("\n", nameStart + normalizedName.length);
    const lineEnd = currentBreak < 0 ? documentText.length : currentBreak;
    const currentLine = documentText.slice(lineStart, lineEnd).trim();
    if (currentLine.length > 0 && Array.from(currentLine).length <= 500) {
      values.add(currentLine);
    }
    if (currentBreak >= 0) {
      const nextBreak = documentText.indexOf("\n", currentBreak + 1);
      const combinedEnd = nextBreak < 0 ? documentText.length : nextBreak;
      const combined = documentText.slice(lineStart, combinedEnd).trim();
      if (combined.length > 0 && Array.from(combined).length <= 500) {
        values.add(combined);
      }
    }
    searchFrom = nameStart + normalizedName.length;
  }
  return [...values].sort((left, right) => left.length - right.length);
}

function deriveSourceFirstRoleFacts(
  candidates: readonly VerifiedCandidate<ProviderIdentityCandidate>[],
): readonly VerifiedCandidate<ProviderFactCandidate>[] {
  return candidates.flatMap((item) => {
    if (item.candidate.entityType !== "person") return [];
    for (const excerpt of sourceFirstRoleExcerptCandidates(
      item.proof,
      item.candidate.displayName,
    )) {
      const candidate: ProviderFactCandidate = {
        subjectKey: item.candidate.candidateKey,
        entityType: "person",
        category: "role",
        predicate: "professional_role",
        scopeType: "person",
        scopeLabel: item.candidate.displayName,
        factPeriodLabel: null,
        factDate: null,
        normalizedValue: null,
        unit: null,
        currency: null,
        contradictionKey: null,
        statement: excerpt,
        structuredUrl: item.proof.finalUrl,
        excerpt,
        prefix: null,
        suffix: null,
      };
      try {
        const proof = excerpt === item.proof.verifiedExcerpt
          ? item.proof
          : reverifyExcerptWithinProof({
              proof: item.proof,
              candidate,
              attributedDisplayNames: [item.candidate.displayName],
            });
        if (isTraceableSingleSourcePersonRoleProof(item.candidate, proof)) {
          return [{ candidate, proof }];
        }
      } catch {
        // A non-atomic or ambiguous nearby block is not source-first evidence.
      }
    }
    return [];
  });
}

async function reconstructIdentityFromDocuments(options: {
  readonly documents: readonly {
    readonly candidate: ProviderIdentityCandidate;
    readonly document: RetrievedSourceDocument;
  }[];
  readonly alreadyVerified: readonly VerifiedCandidate<ProviderIdentityCandidate>[];
  readonly sourceVerifier: SourceVerifier;
}): Promise<readonly VerifiedCandidate<ProviderIdentityCandidate>[]> {
  if (options.sourceVerifier.verifyDocument === undefined) return [];
  const existing = new Set(options.alreadyVerified.map(({ candidate }) => candidate.candidateKey));
  const reconstructed: VerifiedCandidate<ProviderIdentityCandidate>[] = [];
  for (const item of options.documents) {
    if (existing.has(item.candidate.candidateKey)) continue;
    const candidate: ProviderIdentityCandidate = {
      ...item.candidate,
      statement: item.candidate.displayName,
      excerpt: item.candidate.displayName,
      prefix: null,
      suffix: null,
      structuredUrl: item.document.citationUrl,
    };
    try {
      const proof = await options.sourceVerifier.verifyDocument({
        document: item.document,
        candidate,
        attributedDisplayNames: [candidate.displayName],
      });
      reconstructed.push({ candidate, proof });
      existing.add(candidate.candidateKey);
    } catch {
      // The fetched document remains available as a candidate source, but does
      // not become identity evidence when the requested name is absent.
    }
  }
  return reconstructed;
}

function groundedFactHasMinimumQuality(
  item: VerifiedCandidate<ProviderFactCandidate>,
): boolean {
  const excerpt = normalizeVisibleText(item.proof.verifiedExcerpt);
  if (item.candidate.category === "identity" || excerpt.length < 8 || /[?？]\s*$/u.test(excerpt)) {
    return false;
  }
  if (item.candidate.category === "metric") {
    return item.candidate.scopeLabel !== null &&
      item.candidate.factPeriodLabel !== null &&
      item.candidate.normalizedValue !== null &&
      item.candidate.unit !== null &&
      deriveFactPeriod(item.candidate).status === "stated";
  }
  return true;
}

const IDENTITY_ANCHOR_STOPWORDS = new Set([
  "avec", "chez", "dans", "des", "elle", "est", "for", "from", "les", "pour", "that",
  "the", "une", "with",
]);

function identityAnchorTokens(value: string, displayName: string): Set<string> {
  const nameTokens = new Set(
    normalizeVisibleText(displayName).toLocaleLowerCase("fr").match(/[\p{L}\p{N}]+/gu) ?? [],
  );
  return new Set(
    (normalizeVisibleText(value).toLocaleLowerCase("fr").match(/[\p{L}\p{N}]+/gu) ?? [])
      .filter((token) => token.length >= 4 && !nameTokens.has(token) && !IDENTITY_ANCHOR_STOPWORDS.has(token)),
  );
}

function buildDossier(options: {
  readonly input: ResearchInput;
  readonly result: ProviderResearchResult;
  readonly verifiedIdentityCandidates: readonly VerifiedCandidate<ProviderIdentityCandidate>[];
  readonly verifiedFacts: readonly VerifiedCandidate<ProviderFactCandidate>[];
  readonly rejectedProofCount: number;
  readonly retainedGroundedCount: number;
  readonly executionId: string;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly totalMs: number;
  readonly searchingMs: number;
  readonly sourceVerifyingMs: number;
  readonly estimatedCostUsd: number;
  readonly diagnostics: DossierBuildDiagnostics;
}): ResearchDossier {
  const requestedType = options.input.entityType ?? "auto";
  const verifiedIdentityCandidates = assembleVerifiedIdentityCandidates({
    candidates: options.result.document.candidates,
    verifiedCandidates: options.verifiedIdentityCandidates,
    verifiedFacts: options.verifiedFacts,
  });
  const identityDecision = resolveIdentity({
    input: options.input,
    providerStatus: options.result.document.identityStatus,
    candidates: verifiedIdentityCandidates,
  });
  options.diagnostics.identityStatus = identityDecision.status;
  options.diagnostics.identityReasonCodes = identityDecision.reasonCodes;
  const selected = identityDecision.selected;
  const identityPublisherDomains = selected === null
    ? new Set<string>()
    : new Set(
        [selected.proof, ...(selected.corroboratingProofs ?? [])].flatMap((proof) => {
          const domain = publisherDomainForUrl(proof.finalUrl);
          return domain === null ? [] : [domain];
        }),
      );
  const attributionDecisions = selected === null
    ? []
    : options.verifiedFacts.map((fact) => {
        const supportingFacts = new Set(selected.corroboratingFacts ?? []);
        const factDomain = publisherDomainForUrl(fact.proof.finalUrl);
        const selectedTexts = [selected.proof, ...(selected.corroboratingProofs ?? [])]
          .map(({ verifiedExcerpt }) => verifiedExcerpt)
          .join(" ");
        const selectedAnchors = identityAnchorTokens(selectedTexts, selected.candidate.displayName);
        const factAnchors = identityAnchorTokens(
          fact.proof.verifiedExcerpt,
          selected.candidate.displayName,
        );
        const requiresAnchorContinuity = options.input.context !== undefined &&
          selected.proofBasis === "verified_facts" &&
          !supportingFacts.has(fact) &&
          !identityPublisherDomains.has(factDomain ?? "");
        const anchorContinuous = !requiresAnchorContinuity ||
          [...factAnchors].some((token) => selectedAnchors.has(token));
        return {
          fact,
          decision: anchorContinuous
            ? evaluateFactAttribution({
                selected,
                fact,
                requestedName: options.input.name,
                verifiedOfficialSite: identityDecision.verifiedDiscriminators.officialSite,
              })
            : { accepted: false as const, reasonCode: "identity_evidence_mismatch" as const },
        };
      });
  const eligibleFacts = attributionDecisions.flatMap(({ fact, decision }) =>
    decision.accepted ? [fact] : [],
  );
  const attributionRejectedCount = attributionDecisions.length - eligibleFacts.length;
  for (const { decision } of attributionDecisions) {
    if (!decision.accepted) {
      options.diagnostics.attributionRejections[decision.reasonCode] =
        (options.diagnostics.attributionRejections[decision.reasonCode] ?? 0) + 1;
    }
  }
  const qualityDecisions = selected === null
    ? []
    : eligibleFacts.map((fact) => ({
        fact,
        decision: proofVerificationMethod(fact.proof) === "source_content"
          ? evaluateClaimQuality({
              candidate: fact.candidate,
              proof: fact.proof,
              selectedDisplayName: selected.candidate.displayName,
            })
          : groundedFactHasMinimumQuality(fact)
            ? { accepted: true as const }
            : { accepted: false as const, reasonCode: "weak_fragment" as const },
      }));
  const qualityAcceptedFacts = qualityDecisions.flatMap(({ fact, decision }) =>
    decision.accepted ? [fact] : [],
  );
  const qualityRejectedCount = qualityDecisions.length - qualityAcceptedFacts.length;
  for (const { decision } of qualityDecisions) {
    if (!decision.accepted) {
      options.diagnostics.qualityRejections[decision.reasonCode] =
        (options.diagnostics.qualityRejections[decision.reasonCode] ?? 0) + 1;
    }
  }
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
    const key = `${subjectId}|${conflictScopeKey(scope)}|${proof.finalUrl}`;
    const existing = sourceBySubjectAndUrl.get(key);
    if (existing !== undefined) return existing;
    const sourceId = `source-${randomUUID()}`;
    const verificationMethod = proofVerificationMethod(proof);
    const directlyRetrieved = proof.retrievalStatus !== "unavailable";
    const publisherDomain = publisherDomainForUrl(proof.finalUrl);
    const sameAsIdentityPublisher = publisherDomain !== null && identityPublisherDomains.has(publisherDomain);
    sources.push({
      source_id: sourceId,
      provider_url: proof.citationUrl,
      resolved_url: directlyRetrieved ? proof.finalUrl : null,
      canonical_url: null,
      title: proof.title,
      publisher: new URL(proof.finalUrl).hostname,
      source_type: verificationMethod === "source_content" && sameAsIdentityPublisher
        ? "official_publication"
        : "search_result",
      published_at: null,
      accessed_at: proof.locator.retrievedAt,
      collection_method: verificationMethod === "source_content" ? "direct_access" : "provider_search",
      collection_compliance: "not_verified",
      accessibility_status: directlyRetrieved ? "accessible" : "unknown",
      assumed_entity_id: subjectId,
      assumed_scope: scope,
    });
    sourceBySubjectAndUrl.set(key, sourceId);
    return sourceId;
  }

  let identityClaimId: string | null = null;
  if (resolved && selected !== null) {
    const resolvedIdentityClaimId = `claim-${randomUUID()}`;
    identityClaimId = resolvedIdentityClaimId;
    const identityScope: DossierScope = {
      type: selected.candidate.entityScope,
      label: selected.candidate.displayName,
    };
    const unknownPeriod: DossierFactPeriod = {
      status: "unknown",
      start: null,
      end: null,
      as_of: null,
      label: null,
    };
    const identityProofs = [selected.proof, ...(selected.corroboratingProofs ?? [])];
    const identityEvidenceIds = identityProofs.map((proof, proofIndex) => {
      const evidenceId = `evidence-${randomUUID()}`;
      const sourceId = ensureSource(resolvedSubjectId, identityScope, proof);
      evidence.push({
        evidence_id: evidenceId,
        source_id: sourceId,
        claim_id: resolvedIdentityClaimId,
        excerpt: proof.verifiedExcerpt,
        locator: serializeSourceLocator(proof.locator),
        entity_id: resolvedSubjectId,
        fact_period: unknownPeriod,
        scope: identityScope,
        relation: proofIndex === 0 ? "supports" : "context_only",
        verification_method: proofVerificationMethod(proof),
        verified_at: proof.locator.retrievedAt,
      });
      return evidenceId;
    });
    claims.push({
      claim_id: resolvedIdentityClaimId,
      subject_id: resolvedSubjectId,
      statement: selected.proof.verifiedExcerpt,
      predicate: "identity.proof",
      structured_value: null,
      unit: null,
      fact_period: unknownPeriod,
      scope: identityScope,
      temporal_status: "unknown",
      evidence_ids: identityEvidenceIds,
      claim_state: "supported",
      reconciliation_state: "confirmation",
      presentation_decision: "display_fact",
      presentation_reason: selected.proofBasis === "verified_facts"
        ? "Identité établie par corroboration factuelle vérifiée ; chaque extrait utilisé reste relié à sa source."
        : "Preuve d’identité dédiée, distincte des faits métier ; l’extrait exact retrouvé est conservé.",
    });
  }

  const conflictGroups = new Map<string, DeduplicatedBusinessFact[]>();
  const conflictUnitByFact = new Map<DeduplicatedBusinessFact, string | null>();
  const conflictSignatureByFact = new Map<DeduplicatedBusinessFact, ConflictMetricObservation>();
  const reconciliationByFact = new Map<DeduplicatedBusinessFact, NumericRelationship>();
  const reconciliationRank: Readonly<Record<NumericRelationship, number>> = {
    confirmation: 0,
    explainable_difference: 1,
    indetermination: 2,
    contradiction: 3,
  };
  function recordReconciliation(
    fact: DeduplicatedBusinessFact,
    relationship: NumericRelationship,
  ): void {
    const previous = reconciliationByFact.get(fact) ?? "confirmation";
    if (reconciliationRank[relationship] > reconciliationRank[previous]) {
      reconciliationByFact.set(fact, relationship);
    }
  }
  function hasIndependentConflictProofs(
    left: DeduplicatedBusinessFact,
    right: DeduplicatedBusinessFact,
  ): boolean {
    return left.proofs.some((leftProof) => {
      const leftPage = conflictSourcePageKey(leftProof.finalUrl);
      const leftDigest = leftProof.locator.normalizedTextSha256.toLowerCase();
      if (leftPage === null || !/^[0-9a-f]{64}$/u.test(leftDigest)) return false;
      return right.proofs.some((rightProof) => {
        const rightPage = conflictSourcePageKey(rightProof.finalUrl);
        const rightDigest = rightProof.locator.normalizedTextSha256.toLowerCase();
        return rightPage !== null &&
          /^[0-9a-f]{64}$/u.test(rightDigest) &&
          leftPage !== rightPage &&
          leftDigest !== rightDigest;
      });
    });
  }
  if (resolved) {
    const metrics = businessFacts.filter(({ candidate, proofs }) =>
      candidate.category === "metric" &&
      proofs.every((proof) => proofVerificationMethod(proof) === "source_content")
    );
    for (const [index, left] of metrics.entries()) {
      for (const right of metrics.slice(index + 1)) {
        const leftSignature = metricComparisonSignature(left.candidate);
        const rightSignature = metricComparisonSignature(right.candidate);
        const leftDefinition = canonicalConflictText(left.candidate.contradictionKey);
        const rightDefinition = canonicalConflictText(right.candidate.contradictionKey);
        const sameDerivedMetric = leftSignature !== null &&
          rightSignature !== null &&
          leftSignature.metric === rightSignature.metric;
        const sameDeclaredMetric = canonicalConflictText(left.candidate.predicate) ===
            canonicalConflictText(right.candidate.predicate) &&
          leftDefinition.length > 0 &&
          leftDefinition === rightDefinition;
        if (
          canonicalConflictText(left.candidate.subjectKey) !==
            canonicalConflictText(right.candidate.subjectKey) ||
          (!sameDerivedMetric && !sameDeclaredMetric)
        ) {
          continue;
        }
        const classifiedRelationship = classifyNumericClaims(left.candidate, right.candidate);
        const relationship = classifiedRelationship === "contradiction" &&
            !hasIndependentConflictProofs(left, right)
          ? "indetermination"
          : classifiedRelationship;
        recordReconciliation(left, relationship);
        recordReconciliation(right, relationship);
      }
    }
    for (const fact of businessFacts) {
      if (fact.candidate.category !== "metric") continue;
      const signature = metricComparisonSignature(fact.candidate);
      if (signature === null) continue;
      const key = [
        signature.metric,
        signature.definition,
        signature.semanticUnit,
        signature.currency ?? "",
        signature.scopeKind,
        conflictScopeKey(scopeFor(fact.candidate)),
        conflictPeriodKey(deriveFactPeriod(fact.candidate)),
        signature.periodKey,
        canonicalConflictText(fact.candidate.contradictionKey),
        signature.valueNature,
      ].join("|");
      const group = conflictGroups.get(key) ?? [];
      group.push(fact);
      conflictGroups.set(key, group);
    }
    for (const [key, group] of conflictGroups) {
      const values = new Set(group.flatMap(({ candidate }) => {
        const signature = metricComparisonSignature(candidate);
        return signature === null ? [] : [signature.value];
      }));
      const pages = new Set(group.flatMap(({ proofs }) => proofs.flatMap(({ finalUrl }) => {
        const page = conflictSourcePageKey(finalUrl);
        return page === null ? [] : [page];
      })));
      const documentDigests = new Set(group.flatMap(({ proofs }) => proofs.flatMap(({ locator }) => {
        const digest = locator.normalizedTextSha256.toLowerCase();
        return /^[0-9a-f]{64}$/u.test(digest) ? [digest] : [];
      })));
      const hasContradiction = group.some((left, index) =>
        group.slice(index + 1).some((right) =>
          classifyNumericClaims(left.candidate, right.candidate) === "contradiction" &&
          hasIndependentConflictProofs(left, right),
        ),
      );
      if (
        values.size < 2 ||
        pages.size < 2 ||
        documentDigests.size < 2 ||
        !hasContradiction
      ) {
        conflictGroups.delete(key);
        continue;
      }
      const signatures = group.flatMap(({ candidate }) => {
        const signature = metricComparisonSignature(candidate);
        return signature === null ? [] : [signature];
      });
      if (signatures.length !== group.length) {
        conflictGroups.delete(key);
        continue;
      }
      const firstSignature = signatures[0];
      if (firstSignature === undefined) {
        conflictGroups.delete(key);
        continue;
      }
      const scales = new Set(signatures.map(({ scaleUnit }) => scaleUnit));
      const displayUnit = firstSignature.semanticUnit === "employees"
        ? firstSignature.definition.startsWith("fte_") ? "FTE" : "employees"
        : scales.size === 1 ? firstSignature.scaleUnit : null;
      group.forEach((fact, index) => {
        conflictUnitByFact.set(fact, displayUnit);
        const signature = signatures[index];
        if (signature !== undefined) conflictSignatureByFact.set(fact, signature);
      });
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
      const conflictSignature = contested ? conflictSignatureByFact.get(item) : undefined;
      const claimUnit = contested ? conflictUnitByFact.get(item) ?? null : item.candidate.unit;
      const reconciliationState = contested
        ? "contradiction"
        : reconciliationByFact.get(item) ?? "confirmation";
      const indeterminate = reconciliationState === "indetermination";
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
          verification_method: proofVerificationMethod(proof),
          verified_at: proof.locator.retrievedAt,
        });
        return evidenceId;
      });
      const normalizedValue = item.candidate.category === "metric"
        ? conflictSignature?.value ?? parseMetricValue(item.candidate.excerpt)
        : item.candidate.normalizedValue;
      claims.push({
        claim_id: claimId,
        subject_id: resolvedSubjectId,
        statement: item.proofs[0]?.verifiedExcerpt ?? item.candidate.excerpt,
        predicate: conflictSignature === undefined
          ? `${item.candidate.category}.${item.candidate.predicate}`
          : `metric.${conflictSignature.metric}`,
        structured_value: normalizedValue === null
          ? null
          : {
              value: normalizedValue,
              value_type: typeof normalizedValue === "number" ? "number" : "text",
            },
        unit: claimUnit,
        fact_period: period,
        scope,
        temporal_status: temporalStatus,
        evidence_ids: evidenceIds,
        claim_state: indeterminate
          ? "rejected"
          : contested
          ? "contested"
          : temporalStatus === "historical"
            ? "historical"
            : "supported",
        reconciliation_state: reconciliationState,
        presentation_decision: indeterminate ? "reject" : "display_fact",
        presentation_reason: indeterminate
          ? "La valeur reste conservée dans le dossier mais n’est pas affichée comme un fait faute de dimensions de comparaison suffisantes."
          : item.proofs.some((proof) => proofVerificationMethod(proof) === "source_content")
            ? "Le texte affiché est l’extrait retrouvé dans une page source consultée."
            : "Le texte affiché reste attribué à une citation Web Search ; la page n’a pas confirmé littéralement cet extrait.",
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
        verification_method: proofVerificationMethod(item.proof),
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
        const signature = conflictSignatureByFact.get(fact);
        return record === undefined || record.normalizedValue === null || signature === undefined
          ? []
          : [{
              candidate: fact.candidate,
              signature,
              conflictUnit: conflictUnitByFact.get(fact) ?? null,
              ...record,
            }];
      });
      if (records.length < 2) continue;
      const first = records[0];
      if (first === undefined) continue;
      const versions = records.flatMap(({
        signature,
        conflictUnit,
        claimId,
        evidenceIds,
        normalizedValue,
      }) => {
        const firstEvidenceId = evidenceIds[0];
        if (
          firstEvidenceId === undefined ||
          typeof normalizedValue !== "number" ||
          !Number.isFinite(normalizedValue)
        ) return [];
        return [{
          claim_id: claimId,
          evidence_ids: [firstEvidenceId, ...evidenceIds.slice(1)] as [string, ...string[]],
          normalized_value: normalizedValue,
          unit: conflictUnit,
          currency: signature.currency,
        }];
      });
      const firstVersion = versions[0];
      const secondVersion = versions[1];
      if (firstVersion === undefined || secondVersion === undefined) continue;
      contradictions.push({
        contradiction_id: `contradiction-${randomUUID()}`,
        predicate: `metric.${first.signature.metric}`,
        period: first.period,
        scope: scopeFor(first.candidate),
        metric_definition: metricDefinitionFor(first.signature),
        published_or_estimated_checked: true,
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
      "URL non reliée, page inaccessible, format refusé ou extrait source vérifiable introuvable.",
    );
  }
  if (options.retainedGroundedCount > 0) {
    addUnknown(
      "not_verified",
      `${options.retainedGroundedCount} information(s) restent affichées avec une confiance dégradée.`,
      "La citation Web Search est attribuable, mais l’extrait n’a pas été confirmé directement dans la page.",
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
  const indeterminateMetricCount = [...reconciliationByFact.values()].filter(
    (relationship) => relationship === "indetermination",
  ).length;
  if (indeterminateMetricCount > 0) {
    addUnknown(
      "not_verified",
      `${indeterminateMetricCount} valeur(s) quantitative(s) restent non comparables sans arbitrage.`,
      "La nature publiée ou estimée, la devise ou une autre dimension de comparaison n’est pas établie de façon suffisante.",
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
    criticalUnknownCount: indeterminateMetricCount,
  });

  let identityStatus: ResearchDossier["identity"]["status"];
  let globalStatus: ResearchDossier["global_status"];
  let resultMode: ResearchDossier["result_mode"];
  if (resolved) {
    identityStatus = "resolved";
    globalStatus = options.retainedGroundedCount > 0 ? "partial" : completeness.status;
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
  const reconciledBusinessClaims = visibleBusinessClaims.filter(
    ({ claim_state, reconciliation_state }) =>
      claim_state !== "contested" && reconciliation_state !== "indetermination",
  );
  const ambiguityClaims = claims.filter(
    ({ presentation_decision }) => presentation_decision === "display_ambiguity",
  );
  const recentClaimIds = reconciledBusinessClaims.filter(({ predicate }) =>
    predicate.startsWith("recent_signal.") || predicate.startsWith("event."),
  ).map(({ claim_id }) => claim_id);
  const keyClaimIds = [
    ...(identityClaimId === null ? [] : [identityClaimId]),
    ...reconciledBusinessClaims.filter(
    ({ claim_id }) => !recentClaimIds.includes(claim_id),
    ).map(({ claim_id }) => claim_id),
  ];
  const summaryClaims: DossierClaim[] = [];
  const summaryCategories = new Set<string>();
  for (const claim of reconciledBusinessClaims) {
    const category = claim.predicate.split(".", 1)[0] ?? "other";
    if (summaryCategories.has(category)) continue;
    summaryClaims.push(claim);
    summaryCategories.add(category);
    if (summaryClaims.length === 3) break;
  }
  for (const claim of reconciledBusinessClaims) {
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
      "Le dossier couvre uniquement des pages et citations Web publiques attribuables pendant cette exécution.",
      "Chaque fait affiché conserve son URL et indique si l’extrait a été confirmé dans la page ou seulement fourni par Web Search.",
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
      pipelineCounts: receipt.pipelineCounts,
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
  let pipelineCounts: PublicReceipt["pipelineCounts"] | undefined;

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
    result = withSelectedIdentitySource(result, options.input);

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
    const providerCandidates = result.document.candidates;
    const displayNamesByCandidateKey = new Map(
      providerCandidates.map((candidate) => [
        candidate.candidateKey,
        providerCandidates.filter(
          (other) => other.candidateKey === candidate.candidateKey,
        ).length === 1
          ? [...new Set([
              candidate.displayName,
              ...(candidate.entityType === "company"
                ? [candidate.displayName.replace(
                    /\s+(?:AG|Corp(?:oration)?|GmbH|Group|Groupe|Inc|LLC|Ltd|PLC|SA|SAS|SASU|SE)\.?$/iu,
                    "",
                  ).trim()]
                : []),
            ].filter((label) => label.length > 0))]
          : undefined,
      ] as const),
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
        attributedDisplayNames: (fact) =>
          displayNamesByCandidateKey.get(fact.subjectKey) ?? [],
      }),
    ]);
    const reconstructedIdentityCandidates = await reconstructIdentityFromDocuments({
      documents: candidateBatch.documents,
      alreadyVerified: candidateBatch.verified,
      sourceVerifier: options.sourceVerifier,
    });
    const directlyVerifiedIdentityCandidates = [
      ...candidateBatch.verified,
      ...reconstructedIdentityCandidates,
    ];
    const sourceFirstFacts = deriveSourceFirstRoleFacts(directlyVerifiedIdentityCandidates);
    const verifiedIdentityCandidates = [
      ...directlyVerifiedIdentityCandidates,
      ...candidateBatch.grounded.filter(({ candidate }) =>
        !directlyVerifiedIdentityCandidates.some(
          (verified) => verified.candidate.candidateKey === candidate.candidateKey,
        )
      ),
    ];
    const verifiedFacts = [...factBatch.verified, ...sourceFirstFacts, ...factBatch.grounded];
    sourceVerifyingMs = Math.max(
      0,
      Math.round(monotonicNow() - totalStart) - sourceVerifyingStartMs,
    );
    sourceFetchCount = candidateBatch.sourceFetchCount + factBatch.sourceFetchCount;
    excerptVerificationCount =
      candidateBatch.excerptVerificationCount + factBatch.excerptVerificationCount +
      reconstructedIdentityCandidates.length + sourceFirstFacts.length;

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
    const dossierDiagnostics: DossierBuildDiagnostics = {
      attributionRejections: {},
      qualityRejections: {},
      identityStatus: "pending",
      identityReasonCodes: [],
    };
    const dossier = buildDossier({
      input: options.input,
      result,
      verifiedIdentityCandidates,
      verifiedFacts,
      rejectedProofCount:
        candidateBatch.rejectedCount + factBatch.rejectedCount -
        candidateBatch.grounded.length - factBatch.grounded.length,
      retainedGroundedCount: candidateBatch.grounded.length + factBatch.grounded.length,
      executionId,
      startedAt,
      completedAt,
      totalMs: interimTotalMs,
      searchingMs,
      sourceVerifyingMs,
      estimatedCostUsd,
      diagnostics: dossierDiagnostics,
    });
    pipelineCounts = {
      providerIdentityCandidates: result.document.candidates.length,
      providerFactCandidates: result.document.claims.length,
      retrievedIdentityDocuments: candidateBatch.documents.length,
      retrievedFactDocuments: factBatch.documents.length,
      directIdentityProofs: candidateBatch.verified.length,
      reconstructedIdentityProofs: reconstructedIdentityCandidates.length,
      directFactProofs: factBatch.verified.length,
      sourceFirstFacts: sourceFirstFacts.length,
      retainedGroundedIdentityProofs: candidateBatch.grounded.length,
      retainedGroundedFactProofs: factBatch.grounded.length,
      discardedProofs:
        candidateBatch.rejectedCount + factBatch.rejectedCount -
        candidateBatch.grounded.length - factBatch.grounded.length,
      displayedBusinessFacts: dossier.claims.filter(({ predicate, presentation_decision }) =>
        presentation_decision === "display_fact" && !predicate.startsWith("identity.")
      ).length,
      attributionRejections: dossierDiagnostics.attributionRejections,
      qualityRejections: dossierDiagnostics.qualityRejections,
      identityStatus: dossierDiagnostics.identityStatus,
      identityReasonCodes: dossierDiagnostics.identityReasonCodes,
    };
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
      ...(pipelineCounts === undefined ? {} : { pipelineCounts }),
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
