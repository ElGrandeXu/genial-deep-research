import { describe, expect, it } from "vitest";

import { evaluateFactAttribution } from "../src/server/research/scope-policy";
import type {
  ProviderFactCandidate,
  ProviderIdentityCandidate,
  VerifiedSourceProof,
} from "../src/server/research/types";

const identity = {
  candidateKey: "airbus-sas",
  displayName: "Airbus SAS",
  entityType: "company",
  entityScope: "subsidiary",
  discriminators: {
    city: "Toulouse",
    country: "France",
    industry: "aéronautique",
    employer: null,
    officialSite: "airbus.com",
    legalIdentifier: null,
    year: null,
  },
  statement: "Airbus SAS est une filiale française du groupe Airbus.",
  structuredUrl: "https://www.airbus.com/en/airbus-in-france",
  excerpt: "Airbus SAS est une filiale française du groupe Airbus.",
  prefix: null,
  suffix: null,
} as ProviderIdentityCandidate;

function fact(overrides: Record<string, unknown> = {}): ProviderFactCandidate {
  const excerpt = "Airbus SAS exploite un établissement aéronautique à Toulouse.";
  return {
    subjectKey: "airbus-sas",
    category: "geography",
    entityType: "company",
    statement: excerpt,
    predicate: "location",
    scopeType: "subsidiary",
    scopeLabel: "Airbus SAS",
    factPeriodLabel: null,
    factDate: null,
    normalizedValue: null,
    unit: null,
    currency: null,
    contradictionKey: null,
    structuredUrl: "https://www.airbus.com/en/airbus-in-france",
    excerpt,
    prefix: null,
    suffix: null,
    ...overrides,
  } as ProviderFactCandidate;
}

function proof(
  candidate: ProviderIdentityCandidate | ProviderFactCandidate,
  overrides: Partial<VerifiedSourceProof> = {},
): VerifiedSourceProof {
  const url = candidate.structuredUrl;
  return {
    citation: {
      provider: "openai",
      bindingType: "structured_output_url",
      url,
    },
    citationUrl: url,
    finalUrl: url,
    title: "Airbus SAS en France | Airbus",
    verifiedExcerpt: candidate.excerpt,
    documentText: `Airbus SAS en France\n${candidate.excerpt}\nAirbus SE publie aussi des données consolidées.`,
    locator: {
      exact: candidate.excerpt,
      matchMode: "exact",
      prefix: "",
      suffix: "",
      occurrenceIndex: 0,
      finalUrl: url,
      citationUrl: url,
      retrievedAt: "2026-08-27T12:00:00.000Z",
      normalizedTextSha256: "b".repeat(64),
      contentType: "text/html; charset=utf-8",
      bytesRead: 512,
      redirectCount: 0,
    },
    sourceFetchCount: 1,
    sourceVerificationMs: 4,
    ...overrides,
  } as VerifiedSourceProof;
}

const selected = { candidate: identity, proof: proof(identity) };

describe("fact subject and scope policy", () => {
  it("ID-03 rejects a claim whose subject key points to another candidate", () => {
    expect(evaluateFactAttribution({
      selected,
      fact: { candidate: fact({ subjectKey: "airbus-se" }), proof: proof(fact()) },
      requestedName: "Airbus SAS",
    })).toEqual({ accepted: false, reasonCode: "subject_key_mismatch" });
  });

  it("SC-01 rejects an Airbus SE group metric attributed to Airbus SAS", () => {
    const groupMetric = fact({
      category: "metric",
      predicate: "revenue",
      scopeType: "group",
      scopeLabel: "Airbus SE",
      factPeriodLabel: "2025",
      factDate: "2025",
      normalizedValue: "69000000000",
      unit: "revenue",
      currency: "EUR",
      excerpt: "Airbus SE a publié un chiffre d’affaires consolidé de 69 milliards EUR en 2025.",
      statement: "Airbus SE a publié un chiffre d’affaires consolidé de 69 milliards EUR en 2025.",
    });

    expect(evaluateFactAttribution({
      selected,
      fact: { candidate: groupMetric, proof: proof(groupMetric) },
      requestedName: "Airbus SAS",
    })).toEqual({ accepted: false, reasonCode: "scope_incompatible" });
  });

  it("ID-04 rejects a multi-entity metric without a compatible scope label", () => {
    const unlabeledMetric = fact({
      category: "metric",
      predicate: "workforce",
      scopeType: "subsidiary",
      scopeLabel: null,
      factPeriodLabel: "2025",
      factDate: "2025",
      normalizedValue: "12000",
      unit: "employees",
      excerpt: "Le site présente Airbus SAS et Airbus SE ; 12 000 salariés sont indiqués pour 2025.",
      statement: "Le site présente Airbus SAS et Airbus SE ; 12 000 salariés sont indiqués pour 2025.",
    });

    expect(evaluateFactAttribution({
      selected,
      fact: { candidate: unlabeledMetric, proof: proof(unlabeledMetric) },
      requestedName: "Airbus SAS",
    })).toEqual({ accepted: false, reasonCode: "scope_label_required" });
  });

  it("accepts a subject-bound subsidiary fact on an anchored official page", () => {
    const attributed = fact();
    expect(evaluateFactAttribution({
      selected,
      fact: { candidate: attributed, proof: proof(attributed) },
      requestedName: "Airbus SAS",
    })).toMatchObject({ accepted: true });
  });

  it("keeps a non-metric person relation that explicitly names the selected person", () => {
    const personIdentity = {
      ...identity,
      candidateKey: "camille-durand",
      displayName: "Camille Durand",
      entityType: "person" as const,
      entityScope: "person" as const,
      excerpt: "Camille Durand dirige Atelier Nord.",
      statement: "Camille Durand dirige Atelier Nord.",
    };
    const relationalRole = fact({
      subjectKey: "camille-durand",
      entityType: "person",
      category: "role",
      scopeType: "company",
      scopeLabel: "Atelier Nord",
      excerpt: "Camille Durand est directrice d’Atelier Nord.",
      statement: "Camille Durand est directrice d’Atelier Nord.",
    });

    expect(evaluateFactAttribution({
      selected: { candidate: personIdentity, proof: proof(personIdentity) },
      fact: { candidate: relationalRole, proof: proof(relationalRole) },
      requestedName: "Camille Durand",
    })).toMatchObject({ accepted: true });
  });

  it("still rejects an organization metric even when it names a selected person", () => {
    const personIdentity = {
      ...identity,
      candidateKey: "camille-durand",
      displayName: "Camille Durand",
      entityType: "person" as const,
      entityScope: "person" as const,
      excerpt: "Camille Durand dirige Atelier Nord.",
      statement: "Camille Durand dirige Atelier Nord.",
    };
    const companyMetric = fact({
      subjectKey: "camille-durand",
      entityType: "person",
      category: "metric",
      scopeType: "company",
      scopeLabel: "Atelier Nord",
      excerpt: "L’entreprise dirigée par Camille Durand publie un chiffre d’affaires de 2 M€.",
      statement: "L’entreprise dirigée par Camille Durand publie un chiffre d’affaires de 2 M€.",
    });

    expect(evaluateFactAttribution({
      selected: { candidate: personIdentity, proof: proof(personIdentity) },
      fact: { candidate: companyMetric, proof: proof(companyMetric) },
      requestedName: "Camille Durand",
    })).toEqual({ accepted: false, reasonCode: "scope_incompatible" });
  });

  it("rejects a same-type fact from a page with no selected-subject anchor", () => {
    const other = fact({
      structuredUrl: "https://registry.example.org/company",
      excerpt: "Une société aéronautique exploite un établissement à Toulouse.",
      statement: "Une société aéronautique exploite un établissement à Toulouse.",
    });
    expect(evaluateFactAttribution({
      selected,
      fact: {
        candidate: other,
        proof: proof(other, {
          finalUrl: "https://registry.example.org/company",
          title: "Registre des entreprises",
          documentText: other.excerpt,
        }),
      },
      requestedName: "Airbus SAS",
    })).toEqual({ accepted: false, reasonCode: "page_identity_anchor_missing" });
  });

  it("accepts a provider-grounded person fact when the exact name is anchored in the URL", () => {
    const personIdentity = {
      ...identity,
      candidateKey: "camille-durand",
      displayName: "Camille Durand",
      entityType: "person" as const,
      entityScope: "person" as const,
    };
    const providerFact = fact({
      subjectKey: "camille-durand",
      entityType: "person",
      scopeType: "person",
      scopeLabel: "Camille Durand",
      excerpt: "Elle accompagne des entreprises dans leur transformation numérique.",
      statement: "Elle accompagne des entreprises dans leur transformation numérique.",
      structuredUrl: "https://profiles.example.org/camille-durand",
    });
    expect(evaluateFactAttribution({
      selected: { candidate: personIdentity, proof: proof(personIdentity) },
      fact: {
        candidate: providerFact,
        proof: proof(providerFact, {
          finalUrl: providerFact.structuredUrl,
          citationUrl: providerFact.structuredUrl,
          title: "Profil public",
          documentText: providerFact.excerpt,
          verificationMethod: "search_snippet",
          retrievalStatus: "unavailable",
        }),
      },
      requestedName: "Camille Durand",
    })).toEqual({ accepted: true, anchor: "url" });
  });

  it.each(["Joann Lee", "Jo Ann Lee", "jo Ann Lee", "Jo-Ann Lee", "jo-Ann Lee"])(
    "does not use the longer person name %s as the requested-name page anchor",
    (longerName) => {
    const annIdentity = {
      ...identity,
      candidateKey: "ann-lee",
      displayName: "Ann Lee",
      entityType: "person" as const,
      entityScope: "person" as const,
      excerpt: "Ann Lee dirige Atelier Nord.",
      statement: "Ann Lee dirige Atelier Nord.",
    };
    const joannFact = fact({
      subjectKey: "ann-lee",
      entityType: "person",
      scopeType: "person",
      scopeLabel: "Ann Lee",
      category: "activity",
      excerpt: `${longerName} conçoit des outils numériques.`,
      statement: `${longerName} conçoit des outils numériques.`,
      structuredUrl: "https://registry.example.org/joann-lee",
    });
    const joannProof = proof(joannFact, {
      finalUrl: joannFact.structuredUrl,
      title: `Profil de ${longerName}`,
      documentText: `Profil de ${longerName}. ${longerName} conçoit des outils numériques.`,
    });

    expect(evaluateFactAttribution({
      selected: { candidate: annIdentity, proof: proof(annIdentity) },
      fact: { candidate: joannFact, proof: joannProof },
      requestedName: "Ann Lee",
    })).toEqual({ accepted: false, reasonCode: "page_identity_anchor_missing" });
    },
  );

  it("does not trust an official-site discriminator that identity evidence did not prove", () => {
    const unprovedOfficialSite = {
      candidate: identity,
      proof: proof(identity, {
        finalUrl: "https://registry.example.org/airbus-sas",
        title: "Registre — Airbus SAS",
      }),
    };
    const genericOfficialPageFact = fact({
      excerpt: "Une société exploite un établissement aéronautique à Toulouse.",
      statement: "Une société exploite un établissement aéronautique à Toulouse.",
    });
    expect(evaluateFactAttribution({
      selected: unprovedOfficialSite,
      verifiedOfficialSite: undefined,
      fact: {
        candidate: genericOfficialPageFact,
        proof: proof(genericOfficialPageFact, {
          title: "Activités en France",
          documentText: genericOfficialPageFact.excerpt,
        }),
      },
      requestedName: "Airbus SAS",
    })).toEqual({ accepted: false, reasonCode: "page_identity_anchor_missing" });
  });

  it("SC-02 keeps a brand distinct from its owner company", () => {
    const brand = {
      ...identity,
      candidateKey: "orange-brand",
      displayName: "Orange",
      entityScope: "brand" as const,
      discriminators: {
        ...identity.discriminators,
        officialSite: "orange.com",
      },
      excerpt: "Orange est une marque de services de télécommunications.",
      statement: "Orange est une marque de services de télécommunications.",
      structuredUrl: "https://www.orange.com/fr/marque-orange",
    };
    const ownerMetric = fact({
      subjectKey: "orange-brand",
      scopeType: "company",
      scopeLabel: "Orange SA",
      category: "metric",
      predicate: "revenue",
      factPeriodLabel: "2025",
      factDate: "2025",
      normalizedValue: "40000000000",
      unit: "revenue",
      currency: "EUR",
      excerpt: "Orange SA a publié un chiffre d’affaires de 40 milliards EUR en 2025.",
      statement: "Orange SA a publié un chiffre d’affaires de 40 milliards EUR en 2025.",
    });

    expect(evaluateFactAttribution({
      selected: { candidate: brand, proof: proof(brand) },
      fact: { candidate: ownerMetric, proof: proof(ownerMetric) },
      requestedName: "Orange",
    })).toEqual({ accepted: false, reasonCode: "scope_incompatible" });
  });
});
