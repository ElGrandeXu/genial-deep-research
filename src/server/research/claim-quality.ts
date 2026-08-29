import {
  containsEntityNameInText,
  normalizeVisibleText,
  textsAreMechanicallyEquivalent,
} from "./source-content";
import { parseMetricValue } from "./numeric-normalization";
import { deriveFactPeriod } from "./temporal-policy";
import type {
  ProviderFactCandidate,
  VerifiedSourceProof,
} from "./types";

export type ClaimQualityRejectionCode =
  | "identity_not_business_fact"
  | "weak_fragment"
  | "non_atomic_claim"
  | "non_declarative_claim"
  | "subject_not_stated"
  | "structured_value_not_in_excerpt"
  | "metric_scope_or_period_missing"
  | "role_relation_missing"
  | "dated_event_date_missing";

export type ClaimQualityDecision =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly reasonCode: ClaimQualityRejectionCode };

export interface VerifiedBusinessFact {
  readonly candidate: ProviderFactCandidate;
  readonly proof: VerifiedSourceProof;
}

export interface DeduplicatedBusinessFact {
  readonly candidate: ProviderFactCandidate;
  readonly proofs: readonly VerifiedSourceProof[];
}

export interface DeduplicationResult {
  readonly facts: readonly DeduplicatedBusinessFact[];
  readonly duplicateCount: number;
  readonly truncatedCount: number;
  readonly duplicateFacts: readonly {
    readonly candidate: ProviderFactCandidate;
    readonly representative: ProviderFactCandidate;
  }[];
  readonly truncatedFacts: readonly ProviderFactCandidate[];
}

const LEGAL_SUFFIX = /\s+(?:AG|Corp(?:oration)?|GmbH|Group|Groupe|Inc|LLC|Ltd|PLC|SA|SAS|SASU|SE)\.?$/iu;
const NAVIGATION_WORDS = /\b(?:accueil|about|contact|home|menu|navigation|privacy|mentions légales)\b/giu;
const DIRECTORY_PATH_PARTS = new Set([
  "a propos",
  "about",
  "about us",
  "comite de direction",
  "direction",
  "direction generale",
  "dirigeants",
  "equipe",
  "equipe de direction",
  "equipe dirigeante",
  "executive team",
  "governance",
  "gouvernance",
  "leadership",
  "la direction",
  "management",
  "management team",
  "notre equipe",
  "nos dirigeants",
  "our team",
  "people",
  "team",
  "qui sommes nous",
  "who we are",
]);
const DIRECTORY_TITLE_PARTS = new Set([
  ...DIRECTORY_PATH_PARTS,
  "a propos de nous",
  "meet the team",
  "notre direction",
  "the team",
]);
const DIRECTORY_NAME_TOKENS = new Set([
  "direction",
  "dirigeants",
  "equipe",
  "governance",
  "gouvernance",
  "leadership",
  "management",
  "people",
  "team",
]);
const EXCLUDED_DIRECTORY_PARTS = new Set([
  "accueil",
  "actualites",
  "article",
  "articles",
  "blog",
  "conditions generales",
  "confidentialite",
  "contact",
  "contact us",
  "contactez nous",
  "contacts",
  "home",
  "homepage",
  "legal",
  "legal notice",
  "login",
  "menu",
  "mentions legales",
  "navigation",
  "news",
  "politique de confidentialite",
  "press",
  "presse",
  "privacy",
  "privacy policy",
  "recherche",
  "resources",
  "ressources",
  "search",
  "signin",
  "terms",
  "terms and conditions",
]);
const DIRECTORY_ROLE_PATTERNS = [
  /^(?:ceo|cfo|chro|cio|cmo|coo|cpo|cro|cso|cto)$/u,
  /^chief (?:executive|financial|human resources|information|marketing|operating|people|product|revenue|strategy|technology) officer$/u,
  /^(?:co[- ]?)?founder$/u,
  /^(?:co[- ]?)?fondateur$/u,
  /^(?:co[- ]?)?fondatrice$/u,
  /^(?:chairman|chairperson|chairwoman|managing director|partner)$/u,
  /^(?:president|président|présidente|vice[- ]president|vice[- ]président|vice[- ]présidente)$/u,
  /^(?:directeur|directrice)(?: général| générale)?$/u,
  /^(?:gérant|gérante|associé|associée)$/u,
] as const;

function normalized(value: string): string {
  return normalizeVisibleText(value)
    .normalize("NFKC")
    .toLocaleLowerCase("fr")
    .replace(/[’']/gu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

function semanticPart(value: string): string {
  return normalized(value)
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function decodedPathPart(value: string): string {
  try {
    return semanticPart(decodeURIComponent(value));
  } catch {
    return "";
  }
}

function isDirectoryPage(proof: VerifiedSourceProof): boolean {
  let pathParts: string[];
  try {
    pathParts = new URL(proof.finalUrl).pathname
      .split("/")
      .filter(Boolean)
      .map(decodedPathPart)
      .filter(Boolean);
  } catch {
    return false;
  }
  if (pathParts.length > 6 || pathParts.some((part) => EXCLUDED_DIRECTORY_PARTS.has(part))) {
    return false;
  }

  const title = normalized(proof.title);
  if (title.length === 0 || title.length > 180 || wordCount(title) > 18) return false;
  const titleParts = proof.title
    .split(/\s*(?:[|•·:–—]|\s+-\s+)\s*/gu)
    .map(semanticPart)
    .filter(Boolean);
  if (titleParts.some((part) => EXCLUDED_DIRECTORY_PARTS.has(part))) return false;

  return pathParts.some((part) => DIRECTORY_PATH_PARTS.has(part)) ||
    titleParts.some((part) => DIRECTORY_TITLE_PARTS.has(part));
}

function explicitDirectoryRole(value: string): boolean {
  const role = normalized(value);
  return role.length > 0 &&
    role.length <= 64 &&
    wordCount(role) <= 6 &&
    DIRECTORY_ROLE_PATTERNS.some((pattern) => pattern.test(role));
}

function isDirectoryRoleEvidence(options: {
  readonly candidate: ProviderFactCandidate;
  readonly proof: VerifiedSourceProof;
  readonly selectedDisplayName: string;
}): boolean {
  const { candidate, proof } = options;
  const selectedName = normalized(options.selectedDisplayName);
  const selectedSemanticName = semanticPart(options.selectedDisplayName);
  const selectedNameTokens = selectedSemanticName.split(" ").filter(Boolean);
  if (
    candidate.category !== "role" ||
    candidate.entityType !== "person" ||
    candidate.scopeType !== "person" ||
    candidate.scopeLabel === null ||
    normalized(candidate.scopeLabel) !== selectedName ||
    wordCount(selectedName) < 2 ||
    wordCount(selectedName) > 5 ||
    DIRECTORY_PATH_PARTS.has(selectedSemanticName) ||
    DIRECTORY_TITLE_PARTS.has(selectedSemanticName) ||
    selectedNameTokens.some((token) => DIRECTORY_NAME_TOKENS.has(token)) ||
    !isDirectoryPage(proof)
  ) {
    return false;
  }

  const excerpt = normalized(proof.verifiedExcerpt);
  if (!excerpt.startsWith(selectedName)) return false;
  const remainder = excerpt.slice(selectedName.length);
  if (!/^[\s/|•·,:–—-]/u.test(remainder)) return false;
  const role = remainder.replace(/^\s*(?:[/|•·,:–—-]\s*)?/u, "").trim();
  return explicitDirectoryRole(role);
}

function subjectLabels(displayName: string): string[] {
  const labels = new Set([displayName]);
  const alias = displayName.replace(LEGAL_SUFFIX, "").trim();
  if (alias.length >= 3) labels.add(alias);
  return [...labels];
}

function containsSubject(
  excerpt: string,
  displayName: string,
  entityType: ProviderFactCandidate["entityType"],
): boolean {
  return subjectLabels(displayName).some((label) =>
    containsEntityNameInText(excerpt, label, entityType)
  );
}

function wordCount(value: string): number {
  return normalized(value).match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
}

function isWeakFragment(value: string): boolean {
  const text = normalizeVisibleText(value);
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const separators = text.match(/[|/•·:;+_-]/gu)?.length ?? 0;
  const navWords = text.match(NAVIGATION_WORDS)?.length ?? 0;
  return text.length < 24 || wordCount(text) < 4 || letters < 12 || separators >= 2 || navWords >= 2;
}

function isCompound(value: string): boolean {
  const text = normalizeVisibleText(value);
  const sentenceCount = text
    .split(/(?<=[.!?])\s+(?=[\p{Lu}\d])/gu)
    .map((part) => part.trim())
    .filter(Boolean).length;
  if (sentenceCount > 1) return true;
  const clauses = text.split(/\s*[;•]\s*/gu).filter((part) => wordCount(part) >= 4);
  return clauses.length > 1;
}

function literalAppears(candidate: ProviderFactCandidate): boolean {
  if (candidate.normalizedValue === null) return true;
  const excerptDigits = normalized(candidate.excerpt).replace(/[^\d]/gu, "");
  const valueDigits = normalized(candidate.normalizedValue).replace(/[^\d]/gu, "");
  if (valueDigits.length > 0 && excerptDigits.includes(valueDigits)) return true;
  const value = normalized(candidate.normalizedValue);
  return value.length >= 2 && normalized(candidate.excerpt).includes(value);
}

function hasVerifiedFactPeriod(
  candidate: ProviderFactCandidate,
  proof: VerifiedSourceProof,
): boolean {
  return deriveFactPeriod({
    ...candidate,
    statement: proof.verifiedExcerpt,
    excerpt: proof.verifiedExcerpt,
  }).status === "stated";
}

export function evaluateClaimQuality(options: {
  readonly candidate: ProviderFactCandidate;
  readonly proof: VerifiedSourceProof;
  readonly selectedDisplayName: string;
}): ClaimQualityDecision {
  const { candidate, proof } = options;
  if (candidate.category === "identity") {
    return { accepted: false, reasonCode: "identity_not_business_fact" };
  }
  if (/[?？]\s*$/u.test(proof.verifiedExcerpt)) {
    return { accepted: false, reasonCode: "non_declarative_claim" };
  }
  const directoryRole = isDirectoryRoleEvidence(options);
  if (isWeakFragment(proof.verifiedExcerpt) && !directoryRole) {
    return { accepted: false, reasonCode: "weak_fragment" };
  }
  if (isCompound(proof.verifiedExcerpt)) {
    return { accepted: false, reasonCode: "non_atomic_claim" };
  }
  if (!containsSubject(
    proof.verifiedExcerpt,
    options.selectedDisplayName,
    candidate.entityType,
  )) {
    return { accepted: false, reasonCode: "subject_not_stated" };
  }
  if (candidate.category === "metric") {
    if (
      candidate.scopeLabel === null ||
      candidate.factPeriodLabel === null ||
      candidate.normalizedValue === null ||
      candidate.unit === null ||
      parseMetricValue(candidate.excerpt) === null ||
      !hasVerifiedFactPeriod(candidate, proof)
    ) {
      return { accepted: false, reasonCode: "metric_scope_or_period_missing" };
    }
  }
  if (candidate.category !== "metric" && !literalAppears(candidate)) {
    return { accepted: false, reasonCode: "structured_value_not_in_excerpt" };
  }
  if (candidate.category === "role") {
    const hasPersonLikeName = /\b\p{Lu}[\p{L}'’-]+\s+\p{Lu}[\p{L}'’-]+\b/u.test(proof.verifiedExcerpt);
    if (!directoryRole && !hasPersonLikeName) {
      return { accepted: false, reasonCode: "role_relation_missing" };
    }
  }
  if (
    (candidate.category === "event" || candidate.category === "recent_signal") &&
    (
      candidate.factDate === null ||
      candidate.factPeriodLabel === null ||
      !hasVerifiedFactPeriod(candidate, proof)
    )
  ) {
    return { accepted: false, reasonCode: "dated_event_date_missing" };
  }
  return { accepted: true };
}

function metadataKey(candidate: ProviderFactCandidate): string {
  const structuredValue = candidate.category === "metric"
    ? parseMetricValue(candidate.excerpt)?.toString() ?? "unparseable"
    : normalized(candidate.normalizedValue ?? "");
  return [
    candidate.category,
    normalized(candidate.predicate),
    candidate.scopeType,
    normalized(candidate.scopeLabel ?? ""),
    normalized(candidate.factPeriodLabel ?? candidate.factDate ?? ""),
    structuredValue,
    normalized(candidate.unit ?? ""),
    normalized(candidate.currency ?? ""),
  ].join("|");
}

function sameFact(left: ProviderFactCandidate, right: ProviderFactCandidate): boolean {
  if (left.category !== right.category) {
    return textsAreMechanicallyEquivalent(left.excerpt, right.excerpt);
  }
  if (
    left.scopeType !== right.scopeType ||
    normalized(left.scopeLabel ?? "") !== normalized(right.scopeLabel ?? "") ||
    normalized(left.factPeriodLabel ?? left.factDate ?? "") !==
      normalized(right.factPeriodLabel ?? right.factDate ?? "")
  ) return false;
  if (left.category === "metric" && right.category === "metric") {
    return metadataKey(left) === metadataKey(right);
  }
  if (normalized(left.normalizedValue ?? "") !== normalized(right.normalizedValue ?? "")) {
    return false;
  }
  return textsAreMechanicallyEquivalent(left.excerpt, right.excerpt);
}

function proofKey(proof: VerifiedSourceProof): string {
  let canonicalUrl = proof.finalUrl;
  try {
    const url = new URL(proof.finalUrl);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|fbclid|gclid)$/iu.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/u, "");
    canonicalUrl = url.toString();
  } catch {
    // Source URL validation already happened before fact deduplication.
  }
  return [
    canonicalUrl,
    proof.locator.normalizedTextSha256,
    normalized(proof.verifiedExcerpt),
  ].join("|");
}

export function deduplicateVerifiedFacts(
  input: readonly VerifiedBusinessFact[],
  maxFacts = 12,
): DeduplicationResult {
  const groups: Array<{
    candidate: ProviderFactCandidate;
    proofs: VerifiedSourceProof[];
  }> = [];
  let duplicateCount = 0;
  const duplicateFacts: Array<{
    candidate: ProviderFactCandidate;
    representative: ProviderFactCandidate;
  }> = [];

  for (const item of input) {
    const existing = groups.find((group) => sameFact(group.candidate, item.candidate));
    if (existing === undefined) {
      groups.push({ candidate: item.candidate, proofs: [item.proof] });
      continue;
    }
    duplicateCount += 1;
    duplicateFacts.push({ candidate: item.candidate, representative: existing.candidate });
    const itemProofKey = proofKey(item.proof);
    let representativeIndex = existing.proofs.findIndex(
      (proof) => proofKey(proof) === itemProofKey,
    );
    if (representativeIndex < 0) {
      existing.proofs.push(item.proof);
      representativeIndex = existing.proofs.length - 1;
    }
    const currentRepresentative = existing.proofs[0];
    if (
      currentRepresentative !== undefined &&
      normalizeVisibleText(item.proof.verifiedExcerpt).length <
        normalizeVisibleText(currentRepresentative.verifiedExcerpt).length
    ) {
      existing.candidate = item.candidate;
      if (representativeIndex > 0) {
        const [representativeProof] = existing.proofs.splice(representativeIndex, 1);
        if (representativeProof !== undefined) existing.proofs.unshift(representativeProof);
      }
    }
  }

  const limit = Math.max(0, maxFacts);
  const bounded = groups.length <= limit
    ? groups
    : (() => {
        const remaining = [...groups];
        const selected: typeof groups = [];
        const categories = new Set<string>();
        const sourceUrls = new Set<string>();
        while (selected.length < limit && remaining.length > 0) {
          let bestIndex = 0;
          let bestScore = Number.NEGATIVE_INFINITY;
          for (const [index, group] of remaining.entries()) {
            const strongestProof = group.proofs.reduce((strength, proof) => {
              const method = proof.verificationMethod ?? "source_content";
              return Math.max(
                strength,
                method === "source_content" && proof.retrievalStatus !== "unavailable"
                  ? 3
                  : method === "provider_annotation"
                    ? 2
                    : 1,
              );
            }, 0);
            const newCategory = categories.has(group.candidate.category) ? 0 : 1;
            const newSource = group.proofs.some(({ finalUrl }) => !sourceUrls.has(finalUrl)) ? 1 : 0;
            const recent = group.candidate.category === "recent_signal" ||
              group.candidate.category === "event" ? 1 : 0;
            const score = strongestProof * 100 + newCategory * 20 + newSource * 10 + recent;
            if (score > bestScore) {
              bestIndex = index;
              bestScore = score;
            }
          }
          const [next] = remaining.splice(bestIndex, 1);
          if (next === undefined) break;
          selected.push(next);
          categories.add(next.candidate.category);
          for (const proof of next.proofs) sourceUrls.add(proof.finalUrl);
        }
        return selected;
      })();
  return {
    facts: bounded.map(({ candidate, proofs }) => ({ candidate, proofs })),
    duplicateCount,
    truncatedCount: Math.max(0, groups.length - bounded.length),
    duplicateFacts,
    truncatedFacts: groups
      .filter((group) => !bounded.includes(group))
      .map(({ candidate }) => candidate),
  };
}
