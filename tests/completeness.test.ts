import { describe, expect, it } from "vitest";

import {
  decideDossierAdmission,
  evaluateCompleteness,
} from "../src/server/research/completeness";

function claims(domains = ["official.example", "press.example"]) {
  return [
    { category: "activity" as const, pageUrl: `https://${domains[0]}/about` },
    { category: "geography" as const, pageUrl: `https://${domains[0]}/locations` },
    { category: "metric" as const, pageUrl: `https://${domains[1]}/results` },
  ];
}

describe("server completeness decision", () => {
  it("CP-02 marks three unique facts, two categories, pages and domains complete", () => {
    const result = evaluateCompleteness({
      identityResolved: true,
      businessClaims: claims(),
      visibleContradictionCount: 0,
      subjectScopeViolationCount: 0,
      criticalUnknownCount: 0,
    });
    expect(result.status).toBe("complete_within_scope");
    expect(result.criteria).toMatchObject({
      uniqueBusinessClaims: 3,
      coveredBusinessCategories: 3,
      canonicalSourcePages: 3,
      publisherDomains: 2,
    });
  });

  it("admits one sourced business fact without publisher or category minima", () => {
    const result = evaluateCompleteness({
      identityResolved: true,
      businessClaims: claims(["official.example", "official.example"]).slice(0, 1),
      visibleContradictionCount: 0,
      subjectScopeViolationCount: 0,
      criticalUnknownCount: 0,
    });
    expect(result.status).toBe("complete_within_scope");
    expect(result.reasonCodes).toEqual([]);
    expect(result.stopReason).toContain("faits admissibles: 1");
  });

  it("treats subdomains of one registrable family as one publisher", () => {
    const result = evaluateCompleteness({
      identityResolved: true,
      businessClaims: claims(["www.example.org", "press.example.org"]),
      visibleContradictionCount: 0,
      subjectScopeViolationCount: 0,
      criticalUnknownCount: 0,
    });
    expect(result.status).toBe("complete_within_scope");
    expect(result.criteria.publisherDomains).toBe(1);
  });

  it("does not count identity evidence as a business fact", () => {
    const result = evaluateCompleteness({
      identityResolved: true,
      businessClaims: [
        { category: "identity", pageUrl: "https://official.example/legal" },
        ...claims().slice(0, 2),
      ],
      visibleContradictionCount: 0,
      subjectScopeViolationCount: 0,
      criticalUnknownCount: 0,
    });
    expect(result.criteria.uniqueBusinessClaims).toBe(2);
    expect(result.status).toBe("complete_within_scope");
  });

  it("turns a successful search without an admissible fact into business silence", () => {
    const completeness = evaluateCompleteness({
      identityResolved: true,
      businessClaims: [],
      visibleContradictionCount: 0,
      subjectScopeViolationCount: 0,
      criticalUnknownCount: 0,
    });
    expect(completeness.reasonCodes).toContain("no_admissible_business_fact");
    expect(decideDossierAdmission({
      identityStatus: "resolved",
      admissibleBusinessFactCount: 0,
      completenessStatus: completeness.status,
      forcePartial: false,
    })).toEqual({
      globalStatus: "insufficient_evidence",
      resultMode: "silence",
    });
  });

  it.each([
    ["visible contradiction", { visibleContradictionCount: 1 }],
    ["scope violation", { subjectScopeViolationCount: 1 }],
    ["critical unknown", { criticalUnknownCount: 1 }],
  ])("refuses complete with %s", (_label, override) => {
    const result = evaluateCompleteness({
      identityResolved: true,
      businessClaims: claims(),
      visibleContradictionCount: 0,
      subjectScopeViolationCount: 0,
      criticalUnknownCount: 0,
      ...override,
    });
    expect(result.status).toBe("partial");
  });
});
