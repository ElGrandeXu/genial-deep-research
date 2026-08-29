import type { FactCategory } from "./types";
import { publisherDomainForUrl } from "../../domain/publisher-domain";

export type CompletenessReasonCode =
  | "identity_unresolved"
  | "business_claim_count_out_of_range"
  | "business_category_diversity_missing"
  | "canonical_page_diversity_missing"
  | "publisher_domain_diversity_missing"
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
  if (criteria.uniqueBusinessClaims < 3 || criteria.uniqueBusinessClaims > 12) {
    reasonCodes.push("business_claim_count_out_of_range");
  }
  if (criteria.coveredBusinessCategories < 2) {
    reasonCodes.push("business_category_diversity_missing");
  }
  if (criteria.canonicalSourcePages < 2) {
    reasonCodes.push("canonical_page_diversity_missing");
  }
  if (criteria.publisherDomains < 2) {
    reasonCodes.push("publisher_domain_diversity_missing");
  }
  if (criteria.visibleContradictions > 0) reasonCodes.push("visible_contradiction");
  if (criteria.subjectScopeViolations > 0) reasonCodes.push("subject_scope_violation");
  if (criteria.criticalUnknowns > 0) reasonCodes.push("critical_unknown");

  const stopReason = [
    `faits uniques: ${criteria.uniqueBusinessClaims}/3 minimum (12 maximum ; cible 8 à 12 lorsque les preuves existent)`,
    `catégories: ${criteria.coveredBusinessCategories}/2 minimum`,
    `pages: ${criteria.canonicalSourcePages}/2 minimum`,
    `éditeurs: ${criteria.publisherDomains}/2 minimum`,
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
