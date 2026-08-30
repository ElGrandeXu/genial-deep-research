import type { FactCategory } from "./types";
import { publisherDomainForUrl } from "../../domain/publisher-domain";

export type CompletenessReasonCode =
  | "identity_unresolved"
  | "no_admissible_business_fact"
  | "insufficient_business_facts"
  | "insufficient_category_diversity"
  | "insufficient_source_pages"
  | "insufficient_publisher_diversity"
  | "visible_contradiction"
  | "subject_scope_violation"
  | "critical_unknown";

export interface CompletenessClaim {
  readonly category: FactCategory;
  readonly pageUrl?: string;
  readonly pageUrls?: readonly string[];
}

export interface CompletenessCriteria {
  readonly identityResolved: boolean;
  readonly uniqueBusinessClaims: number;
  readonly coveredBusinessCategories: number;
  readonly canonicalSourcePages: number;
  readonly publisherDomains: number;
  readonly visibleContradictions: number;
  readonly subjectScopeViolations: number;
  readonly criticalUnknowns: number;
}

export interface CompletenessDecision {
  readonly status: "complete_within_scope" | "partial";
  readonly criteria: CompletenessCriteria;
  readonly reasonCodes: readonly CompletenessReasonCode[];
  readonly stopReason: string;
}

export interface DossierAdmissionDecision {
  readonly globalStatus:
    | "complete_within_scope"
    | "partial"
    | "needs_clarification"
    | "insufficient_evidence";
  readonly resultMode: "standard" | "silence";
}

function canonicalPage(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid$|gclid$)/iu.test(key)) url.searchParams.delete(key);
    }
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/u, "");
    return url.toString();
  } catch {
    return value;
  }
}

export function evaluateCompleteness(options: {
  readonly identityResolved: boolean;
  readonly businessClaims: readonly CompletenessClaim[];
  readonly visibleContradictionCount: number;
  readonly subjectScopeViolationCount: number;
  readonly criticalUnknownCount: number;
}): CompletenessDecision {
  const businessClaims = options.businessClaims.filter(({ category }) => category !== "identity");
  const pages = new Set(businessClaims.flatMap(({ pageUrl, pageUrls }) =>
    (pageUrls ?? (pageUrl === undefined ? [] : [pageUrl])).map(canonicalPage),
  ));
  const domains = new Set(
    [...pages].flatMap((page) => {
      const domain = publisherDomainForUrl(page);
      return domain === null ? [] : [domain];
    }),
  );
  const categories = new Set(businessClaims.map(({ category }) => category));
  const criteria: CompletenessCriteria = {
    identityResolved: options.identityResolved,
    uniqueBusinessClaims: businessClaims.length,
    coveredBusinessCategories: categories.size,
    canonicalSourcePages: pages.size,
    publisherDomains: domains.size,
    visibleContradictions: options.visibleContradictionCount,
    subjectScopeViolations: options.subjectScopeViolationCount,
    criticalUnknowns: options.criticalUnknownCount,
  };
  const reasonCodes: CompletenessReasonCode[] = [];
  if (!criteria.identityResolved) reasonCodes.push("identity_unresolved");
  if (criteria.uniqueBusinessClaims === 0) reasonCodes.push("no_admissible_business_fact");
  else if (criteria.uniqueBusinessClaims < 3) reasonCodes.push("insufficient_business_facts");
  if (criteria.coveredBusinessCategories < 2) reasonCodes.push("insufficient_category_diversity");
  if (criteria.canonicalSourcePages < 2) reasonCodes.push("insufficient_source_pages");
  if (criteria.publisherDomains < 2) reasonCodes.push("insufficient_publisher_diversity");
  if (criteria.visibleContradictions > 0) reasonCodes.push("visible_contradiction");
  if (criteria.subjectScopeViolations > 0) reasonCodes.push("subject_scope_violation");
  if (criteria.criticalUnknowns > 0) reasonCodes.push("critical_unknown");

  const stopReason = [
    `faits admissibles: ${criteria.uniqueBusinessClaims}`,
    `catégories couvertes: ${criteria.coveredBusinessCategories}`,
    `pages sources: ${criteria.canonicalSourcePages}`,
    `domaines éditeurs: ${criteria.publisherDomains}`,
    `identité: ${criteria.identityResolved ? "resolved" : "unresolved"}`,
    `contradiction: ${criteria.visibleContradictions === 0 ? "aucune" : criteria.visibleContradictions}`,
    `violations sujet/portée: ${criteria.subjectScopeViolations}`,
    `manques critiques: ${criteria.criticalUnknowns}`,
  ].join(" ; ");

  return {
    status: reasonCodes.length === 0 ? "complete_within_scope" : "partial",
    criteria,
    reasonCodes,
    stopReason,
  };
}

export function decideDossierAdmission(options: {
  readonly identityStatus:
    | "resolved"
    | "ambiguous"
    | "insufficient_context"
    | "not_found_within_scope";
  readonly admissibleBusinessFactCount: number;
  readonly completenessStatus: CompletenessDecision["status"];
  readonly forcePartial: boolean;
}): DossierAdmissionDecision {
  if (options.identityStatus === "ambiguous" || options.identityStatus === "insufficient_context") {
    return { globalStatus: "needs_clarification", resultMode: "standard" };
  }
  if (
    options.identityStatus !== "resolved" ||
    options.admissibleBusinessFactCount === 0
  ) {
    return { globalStatus: "insufficient_evidence", resultMode: "silence" };
  }
  return {
    globalStatus: options.forcePartial ? "partial" : options.completenessStatus,
    resultMode: "standard",
  };
}
