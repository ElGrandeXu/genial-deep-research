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
    "Camille Durand / CEO",
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

  it.each([
    ["metric", "metric_scope_or_period_missing"],
    ["event", "dated_event_date_missing"],
    ["recent_signal", "dated_event_date_missing"],
  ] as const)(
    "rejects a %s whose declared period is absent from the verified excerpt",
    (category, reasonCode) => {
      const excerpt = category === "metric"
        ? "Acme SAS emploie désormais 250 personnes."
        : "Acme SAS annonce un partenariat stratégique majeur.";
      const candidate = fact({
        category,
        predicate: category === "metric" ? "workforce" : "partnership_announcement",
        excerpt,
        statement: excerpt,
        factPeriodLabel: "2025",
        factDate: "2025",
        ...(category === "metric"
          ? { normalizedValue: "250", unit: "employees" }
          : {}),
      });

      expect(evaluateClaimQuality({
        candidate,
        proof: proof(candidate),
        selectedDisplayName: "Acme SAS",
      })).toEqual({ accepted: false, reasonCode });
    },
  );

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

  it("rejects an interrogative excerpt as a business fact", () => {
    const excerpt = "Acme SAS dirige-t-elle le marché industriel ?";
    const candidate = fact({ excerpt, statement: excerpt });
    expect(evaluateClaimQuality({
      candidate,
      proof: proof(candidate),
      selectedDisplayName: "Acme SAS",
    })).toEqual({ accepted: false, reasonCode: "non_declarative_claim" });
  });

  it.each(["Joann Lee", "Jo Ann Lee", "jo Ann Lee", "Jo-Ann Lee", "jo-Ann Lee"])(
    "does not accept a subject name embedded in the longer name %s",
    (longerName) => {
    const excerpt = `${longerName} conçoit des logiciels de planification industrielle.`;
    const candidate = fact({
      entityType: "person",
      scopeType: "person",
      scopeLabel: "Ann Lee",
      excerpt,
      statement: excerpt,
    });
    expect(evaluateClaimQuality({
      candidate,
      proof: proof(candidate),
      selectedDisplayName: "Ann Lee",
    })).toEqual({ accepted: false, reasonCode: "subject_not_stated" });
    },
  );

  it.each([
    ["line break", "Claire Dupont\nCEO", "https://public.example/a-propos", "Organisation — Présentation"],
    ["directory separator", "Claire Dupont / CTO", "https://public.example/fr/notre-equipe", "Organisation"],
    ["verified title", "Claire Dupont — Directrice générale", "https://public.example/company", "Équipe dirigeante - Organisation"],
  ])("accepts a compact explicit role on a bounded directory page: %s", (
    _case,
    excerpt,
    structuredUrl,
    title,
  ) => {
    const candidate = fact({
      category: "role",
      entityType: "person",
      predicate: "professional_role",
      scopeType: "person",
      scopeLabel: "Claire Dupont",
      excerpt,
      statement: excerpt,
      structuredUrl,
    });
    expect(evaluateClaimQuality({
      candidate,
      proof: proof(candidate, { title }),
      selectedDisplayName: "Claire Dupont",
    })).toEqual({ accepted: true });
  });

  it.each([
    [
      "contact path",
      "Claire Dupont\nCEO",
      "Claire Dupont",
      "https://public.example/contact-us",
      "Notre équipe | Organisation",
    ],
    [
      "navigation title",
      "Claire Dupont\nCEO",
      "Claire Dupont",
      "https://public.example/team",
      "Contactez-nous | Organisation",
    ],
    [
      "non-role label",
      "Claire Dupont\nContact",
      "Claire Dupont",
      "https://public.example/team",
      "Notre équipe | Organisation",
    ],
    [
      "wrong person",
      "Camille Martin\nCEO",
      "Claire Dupont",
      "https://public.example/team",
      "Notre équipe | Organisation",
    ],
    [
      "unrelated page",
      "Claire Dupont\nCEO",
      "Claire Dupont",
      "https://public.example/actualites/nomination",
      "Équipe dirigeante | Nomination de Claire Dupont",
    ],
    [
      "compound text",
      "Claire Dupont est CEO de l’organisation. Claire Dupont dirige aussi les ventes.",
      "Claire Dupont",
      "https://public.example/team",
      "Notre équipe | Organisation",
    ],
    [
      "navigation-like person name",
      "Meet The Team\nCEO",
      "Meet The Team",
      "https://public.example/team",
      "Our team | Organisation",
    ],
    [
      "navigation-like person name variant",
      "Meet Our Team\nCEO",
      "Meet Our Team",
      "https://public.example/team",
      "Our people | Organisation",
    ],
  ])("rejects an unsafe compact directory-role variant: %s", (
    _case,
    excerpt,
    selectedDisplayName,
    structuredUrl,
    title,
  ) => {
    const candidate = fact({
      category: "role",
      entityType: "person",
      predicate: "professional_role",
      scopeType: "person",
      scopeLabel: selectedDisplayName,
      excerpt,
      statement: excerpt,
      structuredUrl,
    });
    expect(evaluateClaimQuality({
      candidate,
      proof: proof(candidate, { title }),
      selectedDisplayName,
    })).toMatchObject({ accepted: false });
  });

  it("requires person-bound candidate metadata for the directory exception", () => {
    const excerpt = "Claire Dupont\nCEO";
    const candidate = fact({
      category: "role",
      entityType: "company",
      predicate: "professional_role",
      scopeType: "company",
      scopeLabel: "Claire Dupont",
      excerpt,
      statement: excerpt,
      structuredUrl: "https://public.example/team",
    });
    expect(evaluateClaimQuality({
      candidate,
      proof: proof(candidate, { title: "Notre équipe | Organisation" }),
      selectedDisplayName: "Claire Dupont",
    })).toMatchObject({ accepted: false });
  });

  it("preserves the ordinary relation rule outside directory pages", () => {
    const excerpt = "Claire Dupont est CEO de l’organisation Acme SAS.";
    const candidate = fact({
      category: "role",
      entityType: "person",
      predicate: "professional_role",
      scopeType: "person",
      scopeLabel: "Claire Dupont",
      excerpt,
      statement: excerpt,
      structuredUrl: "https://public.example/actualites/nomination",
    });
    expect(evaluateClaimQuality({
      candidate,
      proof: proof(candidate, { title: "Nomination de Claire Dupont" }),
      selectedDisplayName: "Claire Dupont",
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

  it("counts one exact statement only once across provider categories", () => {
    const excerpt = "Acme SAS conçoit des logiciels de planification industrielle.";
    const activity = fact({
      category: "activity",
      predicate: "software_design",
      excerpt,
      statement: excerpt,
      structuredUrl: "https://acme.example/about",
    });
    const geography = fact({
      category: "geography",
      predicate: "industrial_presence",
      excerpt,
      statement: excerpt,
      structuredUrl: "https://registry.example/acme",
    });
    const other = fact({
      category: "other",
      predicate: "company_profile",
      excerpt,
      statement: excerpt,
      structuredUrl: "https://press.example/acme-profile",
    });

    const result = deduplicateVerifiedFacts([
      { candidate: activity, proof: proof(activity) },
      { candidate: geography, proof: proof(geography) },
      { candidate: other, proof: proof(other) },
    ]);

    expect(result.facts).toHaveLength(1);
    expect(result.duplicateCount).toBe(2);
    expect(result.facts[0]?.proofs).toHaveLength(3);
  });

  it("keeps the selected candidate bound to its representative proof", () => {
    const firstExcerpt = "Acme SAS publie le catalogue annuel complet de référence industrielle.";
    const secondExcerpt = "ACME SAS publie le catalogue annuel complet de référence industrielle";
    const first = fact({
      excerpt: firstExcerpt,
      statement: firstExcerpt,
    });
    const second = fact({
      excerpt: secondExcerpt,
      statement: secondExcerpt,
      structuredUrl: "https://press.example/acme-profile",
    });

    const result = deduplicateVerifiedFacts([
      { candidate: first, proof: proof(first) },
      { candidate: second, proof: proof(second) },
    ]);

    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]?.candidate.structuredUrl).toBe("https://press.example/acme-profile");
    expect(result.facts[0]?.proofs.map(({ verifiedExcerpt }) => verifiedExcerpt)).toEqual([
      secondExcerpt,
      firstExcerpt,
    ]);
  });

  it("does not merge similar facts with contradictory structured values", () => {
    const firstExcerpt = "Acme SAS publie le catalogue annuel complet de référence industrielle pour ses clients européens avec les données validées du service en 2024.";
    const secondExcerpt = "Acme SAS publie le catalogue annuel complet de référence industrielle pour ses clients européens avec les données validées du service en 2025.";
    const first = fact({
      excerpt: firstExcerpt,
      statement: firstExcerpt,
      normalizedValue: "2024",
    });
    const second = fact({
      excerpt: secondExcerpt,
      statement: secondExcerpt,
      normalizedValue: "2025",
      structuredUrl: "https://press.example/acme-profile",
    });

    const result = deduplicateVerifiedFacts([
      { candidate: first, proof: proof(first) },
      { candidate: second, proof: proof(second) },
    ]);

    expect(result.facts).toHaveLength(2);
    expect(result.duplicateCount).toBe(0);
  });

  it("does not merge a material number change when normalized values are absent", () => {
    const firstExcerpt = "Acme SAS publie le catalogue annuel complet de référence industrielle pour ses clients européens avec les données validées du service en 2024.";
    const secondExcerpt = "Acme SAS publie le catalogue annuel complet de référence industrielle pour ses clients européens avec les données validées du service en 2025.";
    const first = fact({ excerpt: firstExcerpt, statement: firstExcerpt });
    const second = fact({
      excerpt: secondExcerpt,
      statement: secondExcerpt,
      structuredUrl: "https://press.example/acme-profile",
    });

    const result = deduplicateVerifiedFacts([
      { candidate: first, proof: proof(first) },
      { candidate: second, proof: proof(second) },
    ]);

    expect(result.facts).toHaveLength(2);
    expect(result.duplicateCount).toBe(0);
  });

  it("does not merge wording whose internal hyphen changes the meaning", () => {
    const firstExcerpt = "Ann Lee will resign the contract.";
    const secondExcerpt = "Ann Lee will re-sign the contract.";
    const first = fact({
      entityType: "person",
      scopeType: "person",
      scopeLabel: "Ann Lee",
      excerpt: firstExcerpt,
      statement: firstExcerpt,
    });
    const second = fact({
      entityType: "person",
      scopeType: "person",
      scopeLabel: "Ann Lee",
      excerpt: secondExcerpt,
      statement: secondExcerpt,
      structuredUrl: "https://press.example/ann-lee",
    });

    const result = deduplicateVerifiedFacts([
      { candidate: first, proof: proof(first) },
      { candidate: second, proof: proof(second) },
    ]);

    expect(result.facts).toHaveLength(2);
    expect(result.duplicateCount).toBe(0);
  });

  it("does not merge an interrogative with an affirmative statement", () => {
    const question = fact({
      excerpt: "Ann Lee est CEO de Nova?",
      statement: "Ann Lee est CEO de Nova?",
      entityType: "person",
      scopeType: "person",
      scopeLabel: "Ann Lee",
    });
    const statement = fact({
      excerpt: "Ann Lee est CEO de Nova.",
      statement: "Ann Lee est CEO de Nova.",
      entityType: "person",
      scopeType: "person",
      scopeLabel: "Ann Lee",
      structuredUrl: "https://press.example/ann-lee",
    });
    expect(deduplicateVerifiedFacts([
      { candidate: question, proof: proof(question) },
      { candidate: statement, proof: proof(statement) },
    ]).facts).toHaveLength(2);
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

  it("keeps at most twelve unique business facts", () => {
    const inputs = Array.from({ length: 13 }, (_, index) => {
      const excerpt = `Acme SAS exerce une activité autonome numéro ${index + 1} dans son secteur.`;
      const candidate = fact({
        predicate: `activity_${index + 1}`,
        excerpt,
        statement: excerpt,
        structuredUrl: `https://source${index + 1}.example/acme`,
      });
      return { candidate, proof: proof(candidate) };
    });
    expect(deduplicateVerifiedFacts(inputs).facts).toHaveLength(12);
  });
});
