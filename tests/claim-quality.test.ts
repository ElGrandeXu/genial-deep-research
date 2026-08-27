import { describe, expect, it } from "vitest";

import {
  deduplicateVerifiedFacts,
  evaluateClaimQuality,
} from "../src/server/research/claim-quality";
import type {
  ProviderFactCandidate,
  VerifiedSourceProof,
} from "../src/server/research/types";

const retrievedAt = "2026-08-27T12:00:00.000Z";

function fact(overrides: Partial<ProviderFactCandidate> = {}): ProviderFactCandidate {
  const excerpt = overrides.excerpt ?? "Acme SAS conçoit des logiciels de planification industrielle.";
  return {
    subjectKey: "acme-sas",
    category: "activity",
    entityType: "company",
    statement: excerpt,
    predicate: "software_design",
    scopeType: "company",
    scopeLabel: "Acme SAS",
    factPeriodLabel: null,
    factDate: null,
    normalizedValue: null,
    unit: null,
    currency: null,
    contradictionKey: null,
    structuredUrl: "https://acme.example/about",
    excerpt,
    prefix: null,
    suffix: null,
    ...overrides,
  };
}

function proof(
  candidate: ProviderFactCandidate,
  overrides: Partial<VerifiedSourceProof> = {},
): VerifiedSourceProof {
  return {
    citation: {
      provider: "openai",
      bindingType: "structured_output_url",
      url: candidate.structuredUrl,
    },
    citationUrl: candidate.structuredUrl,
    finalUrl: candidate.structuredUrl,
    title: "Acme SAS — Présentation",
    verifiedExcerpt: candidate.excerpt,
    documentText: `Acme SAS\n${candidate.excerpt}`,
    locator: {
      exact: candidate.excerpt,
      matchMode: "exact",
      prefix: "",
      suffix: "",
      occurrenceIndex: 0,
      finalUrl: candidate.structuredUrl,
      citationUrl: candidate.structuredUrl,
      retrievedAt,
      normalizedTextSha256: "c".repeat(64),
      contentType: "text/html; charset=utf-8",
      bytesRead: 512,
      redirectCount: 0,
    },
    sourceFetchCount: 1,
    sourceVerificationMs: 4,
    ...overrides,
  };
}

describe("business claim quality", () => {
  it.each([
    "+250 / Solutions déployées",
    "Erwan Simon / CEO",
    "Accueil | À propos | Contact",
  ])("CQ-01 rejects weak standalone fragment: %s", (excerpt) => {
    const candidate = fact({ excerpt, statement: excerpt });
    expect(evaluateClaimQuality({
      candidate,
      proof: proof(candidate),
      selectedDisplayName: "Acme SAS",
    })).toMatchObject({ accepted: false });
  });

  it("rejects a compound excerpt instead of counting two facts", () => {
    const excerpt = "Acme SAS conçoit des logiciels. Acme SAS emploie 250 personnes.";
    const candidate = fact({ excerpt, statement: excerpt });
    expect(evaluateClaimQuality({
      candidate,
      proof: proof(candidate),
      selectedDisplayName: "Acme SAS",
    })).toEqual({ accepted: false, reasonCode: "non_atomic_claim" });
  });

  it("rejects a metric whose period or scope is absent", () => {
    const excerpt = "Acme SAS emploie 250 personnes.";
    const candidate = fact({
      category: "metric",
      predicate: "workforce",
      excerpt,
      statement: excerpt,
      normalizedValue: "250",
      unit: "employees",
      scopeLabel: null,
    });
    expect(evaluateClaimQuality({
      candidate,
      proof: proof(candidate),
      selectedDisplayName: "Acme SAS",
    })).toMatchObject({ accepted: false, reasonCode: "metric_scope_or_period_missing" });
  });

  it("accepts a safely recalculated metric even when the provider used expanded digits", () => {
    const excerpt = "Acme SAS a publié un chiffre d’affaires de 1 milliard EUR en 2025.";
    const candidate = fact({
      category: "metric",
      predicate: "revenue",
      excerpt,
      statement: excerpt,
      normalizedValue: "1000000000",
      unit: "revenue",
      currency: "EUR",
      factPeriodLabel: "2025",
      factDate: "2025",
    });
    expect(evaluateClaimQuality({
      candidate,
      proof: proof(candidate),
      selectedDisplayName: "Acme SAS",
    })).toEqual({ accepted: true });
  });

  it("accepts one autonomous, subject-bound activity fact", () => {
    const candidate = fact();
    expect(evaluateClaimQuality({
      candidate,
      proof: proof(candidate),
      selectedDisplayName: "Acme SAS",
    })).toEqual({ accepted: true });
  });
});

describe("business claim deduplication", () => {
  it("merges the same fact from two pages into one claim with two proofs", () => {
    const first = fact();
    const second = fact({ structuredUrl: "https://press.example/acme-profile" });
    const result = deduplicateVerifiedFacts([
      { candidate: first, proof: proof(first) },
      { candidate: second, proof: proof(second) },
    ]);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]?.proofs).toHaveLength(2);
  });

  it("merges the same wording even when provider predicate labels drift", () => {
    const first = fact({ predicate: "software_design" });
    const second = fact({
      predicate: "industrial_planning_software",
      structuredUrl: "https://press.example/acme-profile",
    });
    const result = deduplicateVerifiedFacts([
      { candidate: first, proof: proof(first) },
      { candidate: second, proof: proof(second) },
    ]);

    expect(result.facts).toHaveLength(1);
    expect(result.duplicateCount).toBe(1);
    expect(result.facts[0]?.proofs).toHaveLength(2);
  });

  it("CQ-02 retains one atomic fact when the same fact also appears in a compound claim", () => {
    const atomic = fact();
    const compound = fact({
      excerpt: "Acme SAS conçoit des logiciels de planification industrielle. Acme SAS emploie 250 personnes.",
      statement: "Acme SAS conçoit des logiciels de planification industrielle. Acme SAS emploie 250 personnes.",
      structuredUrl: "https://press.example/acme-profile",
    });
    const verified = [atomic, compound]
      .map((candidate) => ({ candidate, proof: proof(candidate) }))
      .filter(({ candidate, proof: sourceProof }) =>
        evaluateClaimQuality({
          candidate,
          proof: sourceProof,
          selectedDisplayName: "Acme SAS",
        }).accepted,
      );

    expect(deduplicateVerifiedFacts(verified).facts).toHaveLength(1);
  });

  it("keeps at most six unique business facts", () => {
    const inputs = Array.from({ length: 7 }, (_, index) => {
      const excerpt = `Acme SAS exerce une activité autonome numéro ${index + 1} dans son secteur.`;
      const candidate = fact({
        predicate: `activity_${index + 1}`,
        excerpt,
        statement: excerpt,
        structuredUrl: `https://source${index + 1}.example/acme`,
      });
      return { candidate, proof: proof(candidate) };
    });
    expect(deduplicateVerifiedFacts(inputs).facts).toHaveLength(6);
  });
});
