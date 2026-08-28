import {
  containsEntityNameInText,
  normalizeVisibleText,
} from "./source-content";
import type { VerifiedIdentityCandidate } from "./identity-resolution";
import type {
  EntityScope,
  ProviderFactCandidate,
  VerifiedSourceProof,
} from "./types";

export type FactAttributionRejectionCode =
  | "subject_key_mismatch"
  | "entity_type_mismatch"
  | "scope_incompatible"
  | "scope_label_required"
  | "scope_label_mismatch"
  | "page_identity_anchor_missing"
  | "identity_evidence_mismatch";

export type FactAttributionDecision =
  | { readonly accepted: true; readonly anchor: "official_domain" | "excerpt" | "title" | "page" }
  | { readonly accepted: false; readonly reasonCode: FactAttributionRejectionCode };

function normalized(value: string): string {
  return normalizeVisibleText(value).toLocaleLowerCase("fr");
}

function normalizeDomain(value: string): string | null {
  try {
    const raw = value.includes("://") ? value : `https://${value}`;
    return new URL(raw).hostname.toLocaleLowerCase("en-US").replace(/^www\./u, "");
  } catch {
    return null;
  }
}

function sameDomain(left: string, right: string): boolean {
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

function scopeCompatible(selected: EntityScope, fact: ProviderFactCandidate): boolean {
  if (selected === "person") return fact.scopeType === "person";
  if (selected === "subsidiary") {
    return fact.scopeType === "subsidiary" || fact.scopeType === "company";
  }
  if (selected === "group") return fact.scopeType === "group" || fact.scopeType === "company";
  if (selected === "brand") return fact.scopeType === "brand";
  return fact.scopeType === "company";
}

function labelsCompatible(selected: string, label: string): boolean {
  return identityLabels(selected, selected).some((candidateLabel) =>
    normalized(candidateLabel) === normalized(label),
  );
}

function identityLabels(displayName: string, requestedName: string): string[] {
  const labels = new Set([displayName, requestedName]);
  if (displayName.split(/\s+/u).length > 1) {
    const withoutLegalSuffix = displayName.replace(
      /\s+(?:AG|Corp(?:oration)?|GmbH|Group|Groupe|Inc|LLC|Ltd|PLC|SA|SAS|SASU|SE)\.?$/iu,
      "",
    ).trim();
    if (withoutLegalSuffix.length >= 3) labels.add(withoutLegalSuffix);
  }
  return [...labels];
}

function pageAnchor(
  selected: VerifiedIdentityCandidate,
  proof: VerifiedSourceProof,
  requestedName: string,
  verifiedOfficialSite: string | undefined,
): "official_domain" | "excerpt" | "title" | "page" | null {
  const officialDomain = verifiedOfficialSite === undefined
    ? null
    : normalizeDomain(verifiedOfficialSite);
  const factDomain = normalizeDomain(proof.finalUrl);
  if (
    officialDomain !== null &&
    factDomain !== null &&
    sameDomain(officialDomain, factDomain)
  ) return "official_domain";
  const labels = identityLabels(selected.candidate.displayName, requestedName);
  const containsSelectedName = (value: string, label: string): boolean =>
    containsEntityNameInText(value, label, selected.candidate.entityType);
  if (labels.some((label) => containsSelectedName(proof.verifiedExcerpt, label))) return "excerpt";
  if (labels.some((label) => containsSelectedName(proof.title, label))) return "title";
  if (labels.some((label) => containsSelectedName(proof.documentText, label))) return "page";
  return null;
}

const SCOPE_LABEL_REQUIRED = new Set<ProviderFactCandidate["category"]>([
  "metric",
  "role",
  "event",
  "recent_signal",
]);

export function evaluateFactAttribution(options: {
  readonly selected: VerifiedIdentityCandidate;
  readonly fact: {
    readonly candidate: ProviderFactCandidate;
    readonly proof: VerifiedSourceProof;
  };
  readonly requestedName: string;
  readonly verifiedOfficialSite?: string | undefined;
}): FactAttributionDecision {
  const candidate = options.fact.candidate;
  if (candidate.subjectKey !== options.selected.candidate.candidateKey) {
    return { accepted: false, reasonCode: "subject_key_mismatch" };
  }
  if (candidate.entityType !== options.selected.candidate.entityType) {
    return { accepted: false, reasonCode: "entity_type_mismatch" };
  }
  if (!scopeCompatible(options.selected.candidate.entityScope, candidate)) {
    return { accepted: false, reasonCode: "scope_incompatible" };
  }
  if (SCOPE_LABEL_REQUIRED.has(candidate.category) && candidate.scopeLabel === null) {
    return { accepted: false, reasonCode: "scope_label_required" };
  }
  if (
    candidate.scopeLabel !== null &&
    !labelsCompatible(options.selected.candidate.displayName, candidate.scopeLabel)
  ) {
    return { accepted: false, reasonCode: "scope_label_mismatch" };
  }
  const anchor = pageAnchor(
    options.selected,
    options.fact.proof,
    options.requestedName,
    options.verifiedOfficialSite,
  );
  if (anchor === null) {
    return { accepted: false, reasonCode: "page_identity_anchor_missing" };
  }
  return { accepted: true, anchor };
}
