import { normalizeVisibleText } from "./source-content";
import { parseMetricValue } from "./numeric-normalization";
import type {
  ProviderFactCandidate,
  VerifiedSourceProof,
} from "./types";

export type ClaimQualityRejectionCode =
  | "identity_not_business_fact"
  | "weak_fragment"
  | "non_atomic_claim"
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
}

const LEGAL_SUFFIX = /\s+(?:AG|Corp(?:oration)?|GmbH|Group|Groupe|Inc|LLC|Ltd|PLC|SA|SAS|SASU|SE)\.?$/iu;
const NAVIGATION_WORDS = /\b(?:accueil|about|contact|home|menu|navigation|privacy|mentions légales)\b/giu;

function normalized(value: string): string {
  return normalizeVisibleText(value)
    .normalize("NFKC")
    .toLocaleLowerCase("fr")
    .replace(/[’']/gu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

function compact(value: string): string {
  return normalized(value).replace(/[^\p{L}\p{N}]+/gu, "");
}

function subjectLabels(displayName: string): string[] {
  const labels = new Set([normalized(displayName)]);
  const alias = normalized(displayName.replace(LEGAL_SUFFIX, ""));
  if (alias.length >= 3) labels.add(alias);
  return [...labels];
}

function containsSubject(excerpt: string, displayName: string): boolean {
  const text = normalized(excerpt);
  return subjectLabels(displayName).some((label) => text.includes(label));
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

export function evaluateClaimQuality(options: {
  readonly candidate: ProviderFactCandidate;
  readonly proof: VerifiedSourceProof;
  readonly selectedDisplayName: string;
}): ClaimQualityDecision {
  const { candidate, proof } = options;
  if (candidate.category === "identity") {
    return { accepted: false, reasonCode: "identity_not_business_fact" };
  }
  if (isWeakFragment(proof.verifiedExcerpt)) {
    return { accepted: false, reasonCode: "weak_fragment" };
  }
  if (isCompound(proof.verifiedExcerpt)) {
    return { accepted: false, reasonCode: "non_atomic_claim" };
  }
  if (!containsSubject(proof.verifiedExcerpt, options.selectedDisplayName)) {
    return { accepted: false, reasonCode: "subject_not_stated" };
  }
  if (candidate.category === "metric") {
    if (
      candidate.scopeLabel === null ||
      candidate.factPeriodLabel === null ||
      candidate.normalizedValue === null ||
      candidate.unit === null ||
      parseMetricValue(candidate.excerpt) === null
    ) {
      return { accepted: false, reasonCode: "metric_scope_or_period_missing" };
    }
  }
  if (candidate.category !== "metric" && !literalAppears(candidate)) {
    return { accepted: false, reasonCode: "structured_value_not_in_excerpt" };
  }
  if (candidate.category === "role") {
    const hasPersonLikeName = /\b\p{Lu}[\p{L}'’-]+\s+\p{Lu}[\p{L}'’-]+\b/u.test(proof.verifiedExcerpt);
    const hasRelation = /\b(?:chez|de|d['’]|du|of|at|pour|for)\b/iu.test(proof.verifiedExcerpt);
    if (!hasPersonLikeName || !hasRelation) {
      return { accepted: false, reasonCode: "role_relation_missing" };
    }
  }
  if (
    (candidate.category === "event" || candidate.category === "recent_signal") &&
    (candidate.factDate === null || candidate.factPeriodLabel === null)
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

function tokenSet(value: string): Set<string> {
  return new Set(normalized(value).match(/[\p{L}\p{N}]+/gu) ?? []);
}

function lexicalSimilarity(left: string, right: string): number {
  const a = tokenSet(left);
  const b = tokenSet(right);
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / union.size;
}

function sameFact(left: ProviderFactCandidate, right: ProviderFactCandidate): boolean {
  if (left.category !== right.category) return false;
  if (
    left.scopeType !== right.scopeType ||
    normalized(left.scopeLabel ?? "") !== normalized(right.scopeLabel ?? "") ||
    normalized(left.factPeriodLabel ?? left.factDate ?? "") !==
      normalized(right.factPeriodLabel ?? right.factDate ?? "")
  ) return false;
  if (left.category === "metric" && right.category === "metric") {
    return metadataKey(left) === metadataKey(right);
  }
  const a = compact(left.excerpt);
  const b = compact(right.excerpt);
  const wordingMatches = a === b || a.includes(b) || b.includes(a) ||
    lexicalSimilarity(left.excerpt, right.excerpt) >= 0.86;
  return wordingMatches && (
    normalized(left.predicate) === normalized(right.predicate) ||
    a === b ||
    a.includes(b) ||
    b.includes(a)
  );
}

function proofKey(proof: VerifiedSourceProof): string {
  return `${proof.finalUrl}|${normalized(proof.verifiedExcerpt)}`;
}

export function deduplicateVerifiedFacts(
  input: readonly VerifiedBusinessFact[],
  maxFacts = 6,
): DeduplicationResult {
  const groups: Array<{
    candidate: ProviderFactCandidate;
    proofs: VerifiedSourceProof[];
  }> = [];
  let duplicateCount = 0;

  for (const item of input) {
    const existing = groups.find((group) => sameFact(group.candidate, item.candidate));
    if (existing === undefined) {
      groups.push({ candidate: item.candidate, proofs: [item.proof] });
      continue;
    }
    duplicateCount += 1;
    if (!existing.proofs.some((proof) => proofKey(proof) === proofKey(item.proof))) {
      existing.proofs.push(item.proof);
    }
    if (normalizeVisibleText(item.proof.verifiedExcerpt).length < normalizeVisibleText(existing.candidate.excerpt).length) {
      existing.candidate = item.candidate;
    }
  }

  const bounded = groups.slice(0, Math.max(0, maxFacts));
  return {
    facts: bounded.map(({ candidate, proofs }) => ({ candidate, proofs })),
    duplicateCount,
    truncatedCount: Math.max(0, groups.length - bounded.length),
  };
}
