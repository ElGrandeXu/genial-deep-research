import { describe, expect, it } from "vitest";

import fixtures from "../docs/contracts/contract-fixtures.json";
import {
  categoryForClaim,
  confidenceForClaim,
  decodeSseBlock,
  dossierDisplayIssue,
  shouldDisplayEvidenceExcerpt,
} from "../src/app/research-form";
import type { ResearchDossier } from "../src/domain/research-dossier";
import { validateRuntimeDossier } from "../src/domain/runtime-invariants";
import {
  ambiguousDossier,
  completeDossier,
  conflictDossier,
  partialDossier,
  silenceDossier,
  singleCandidateDossier,
} from "./e2e/research-fixtures";

function claim(predicate: string): ResearchDossier["claims"][number] {
  return {
    claim_id: "claim-ui",
    subject_id: "subject-ui",
    statement: "Acme SAS a annoncé sa création en 2023.",
    predicate,
    structured_value: null,
    unit: null,
    fact_period: {
      status: "stated",
      start: "2023-01-01T00:00:00.000Z",
      end: "2023-12-31T23:59:59.999Z",
      as_of: null,
      label: "2023",
    },
    scope: { type: "company", label: "Acme SAS" },
    temporal_status: "historical",
    evidence_ids: ["evidence-ui"],
    claim_state: "historical",
    reconciliation_state: "confirmation",
    presentation_decision: "display_fact",
    presentation_reason: "Extrait exact.",
  };
}

describe("research UI truth mapping", () => {
  it("accepts the combined real research/resolution progress state", () => {
    expect(decodeSseBlock([
      "event: researching_and_resolving",
      'data: {"state":"researching_and_resolving","executionId":"run-ui","elapsedMs":12}',
    ].join("\n"))).toMatchObject({ state: "researching_and_resolving" });
  });

  it("rejects obsolete simulated search phases", () => {
    expect(() => decodeSseBlock([
      "event: searching",
      'data: {"state":"searching","executionId":"run-ui","elapsedMs":12}',
    ].join("\n"))).toThrow("Étape de progression inconnue");
  });

  it("maps categories only from the canonical predicate prefix", () => {
    expect(categoryForClaim(claim("event.foundation"))).toBe("Événements et signaux récents");
    expect(categoryForClaim(claim("activity.employee_experience"))).toBe("Activité");
    expect(categoryForClaim(claim("unknown.role_in_name_only"))).toBe("Autres faits");
  });

  it("does not repeat an excerpt already displayed as the claim", () => {
    expect(shouldDisplayEvidenceExcerpt(
      "Acme SAS conçoit des logiciels.",
      "Acme  SAS conçoit des logiciels.",
    )).toBe(false);
    expect(shouldDisplayEvidenceExcerpt(
      "Acme SAS conçoit des logiciels.",
      "Une autre page confirme l’activité logicielle d’Acme SAS.",
    )).toBe(true);
  });

  it("derives graduated confidence from observable source verification", () => {
    const confirmed = partialDossier();
    const confirmedClaim = confirmed.claims.find((item) => !item.predicate.startsWith("identity."))!;
    confirmed.sources[0]!.source_type = "official_publication";
    expect(confidenceForClaim(confirmed, confirmedClaim)).toMatchObject({
      level: "confirmed",
      label: "Confirmé",
    });

    const supported = partialDossier();
    const supportedClaim = supported.claims.find((item) => !item.predicate.startsWith("identity."))!;
    supported.evidence.find(({ claim_id }) => claim_id === supportedClaim.claim_id)!.verification_method =
      "provider_annotation";
    supported.sources[0]!.accessibility_status = "unknown";
    expect(confidenceForClaim(supported, supportedClaim)).toMatchObject({
      level: "supported",
      label: "Étayé",
    });

    const lead = partialDossier();
    const leadClaim = lead.claims.find((item) => !item.predicate.startsWith("identity."))!;
    lead.evidence.find(({ claim_id }) => claim_id === leadClaim.claim_id)!.verification_method =
      "search_snippet";
    lead.sources[0]!.accessibility_status = "unknown";
    lead.sources[0]!.title = "Résultat de recherche générique";
    expect(confidenceForClaim(lead, leadClaim)).toMatchObject({
      level: "lead",
      label: "Piste à vérifier",
    });

    const titledSnippet = partialDossier();
    const titledClaim = titledSnippet.claims.find((item) => !item.predicate.startsWith("identity."))!;
    titledSnippet.evidence.find(({ claim_id }) => claim_id === titledClaim.claim_id)!.verification_method =
      "search_snippet";
    titledSnippet.sources[0]!.accessibility_status = "unknown";
    expect(confidenceForClaim(titledSnippet, titledClaim)).toMatchObject({
      level: "supported",
      label: "Étayé",
    });
    expect(confidenceForClaim(titledSnippet, titledClaim)).not.toHaveProperty("score");

    const urlAnchoredSnippet = partialDossier();
    const urlAnchoredClaim = urlAnchoredSnippet.claims.find((item) =>
      !item.predicate.startsWith("identity."))!;
    const urlAnchoredEvidence = urlAnchoredSnippet.evidence.find(
      ({ claim_id }) => claim_id === urlAnchoredClaim.claim_id,
    )!;
    urlAnchoredEvidence.verification_method = "search_snippet";
    const urlAnchoredSource = urlAnchoredSnippet.sources.find(
      ({ source_id }) => source_id === urlAnchoredEvidence.source_id,
    )!;
    urlAnchoredSource.title = "Profil public";
    urlAnchoredSource.provider_url = "https://profiles.example.org/acme-group";
    urlAnchoredSource.resolved_url = null;
    urlAnchoredSource.canonical_url = null;
    urlAnchoredSource.accessibility_status = "unknown";
    expect(confidenceForClaim(urlAnchoredSnippet, urlAnchoredClaim)).toMatchObject({
      level: "supported",
      label: "Étayé",
    });
  });

  it("fails closed when a completed dossier omits its presentation graph", () => {
    const dossier = structuredClone(fixtures.fixtures[0]!.dossier) as Record<string, unknown>;
    delete dossier.presentation;
    expect(() => decodeSseBlock([
      "event: completed",
      `data: ${JSON.stringify({
        state: "completed",
        executionId: "run-ui",
        elapsedMs: 12,
        dossier,
        receipt: {},
      })}`,
    ].join("\n"))).toThrow("Le dossier final est incomplet");
  });

  it("fails closed when a displayed proof points to a non-HTTPS page", () => {
    const dossier = partialDossier();
    const firstSource = dossier.sources[0];
    if (firstSource === undefined) throw new Error("Fixture source missing");
    firstSource.provider_url = "http://unsafe.example/source";
    firstSource.resolved_url = "http://unsafe.example/source";
    firstSource.canonical_url = null;

    expect(dossierDisplayIssue(dossier)).toBe(
      "Une preuve ne mène pas vers une page source ouvrable.",
    );
  });

  it("accepts the complete deterministic conflict chain", () => {
    expect(dossierDisplayIssue(conflictDossier())).toBeUndefined();
  });

  it.each([
    ["complete", completeDossier],
    ["partial", partialDossier],
    ["ambiguity", ambiguousDossier],
    ["single candidate", singleCandidateDossier],
    ["conflict", conflictDossier],
    ["silence", silenceDossier],
  ] as const)("keeps the %s browser fixture valid at the runtime boundary", (_label, factory) => {
    expect(validateRuntimeDossier(factory())).toEqual({ ok: true });
  });

  it("accepts harmless casing variants across conflict dimensions", () => {
    const dossier = conflictDossier();
    const conflict = dossier.contradictions[0]!;
    conflict.predicate = "METRIC.REVENUE";
    conflict.period.label = "EXERCICE 2025";
    conflict.scope.label = "ENTREPRISE SYNTHÉTIQUE BORÉE";
    for (const version of conflict.versions) {
      version.unit = "MILLION";
      version.currency = "eur";
    }
    expect(dossierDisplayIssue(dossier)).toBeUndefined();
    expect(validateRuntimeDossier(dossier)).toEqual({ ok: true });
  });

  it("accepts non-visible non-conflict classifications at the transport boundary", () => {
    const dossier = conflictDossier();
    dossier.contradictions[0]!.visible = false;
    dossier.contradictions[0]!.classification = "indetermination";
    dossier.presentation.contradiction_ids = [];
    for (const claim of dossier.claims.filter(({ claim_state }) => claim_state === "contested")) {
      claim.presentation_decision = "reject";
    }
    expect(() => decodeSseBlock([
      "event: completed",
      `data: ${JSON.stringify({
        state: "completed",
        executionId: "run-ui",
        elapsedMs: 12,
        dossier,
        receipt: {},
      })}`,
    ].join("\n"))).not.toThrow();
  });

  it("masks a conflict if a version or its source disappears", () => {
    const missingVersion = conflictDossier();
    const conflict = missingVersion.contradictions[0]!;
    (conflict as unknown as { versions: typeof conflict.versions[number][] }).versions = [
      conflict.versions[0]!,
    ];
    expect(dossierDisplayIssue(missingVersion)).toContain("deux versions comparables");

    const missingSource = conflictDossier();
    missingSource.sources = missingSource.sources.filter(
      ({ source_id }) => source_id !== "source-conflict-specialized",
    );
    expect(dossierDisplayIssue(missingSource)).toContain("page source ouvrable");

    const mismatchedScope = conflictDossier();
    mismatchedScope.sources[1]!.assumed_scope = { type: "subsidiary", label: "Borée France" };
    expect(dossierDisplayIssue(mismatchedScope)).toContain("périmètre affiché");

    const nonQualifyingEvidence = conflictDossier();
    nonQualifyingEvidence.evidence[1]!.relation = "context_only";
    expect(dossierDisplayIssue(nonQualifyingEvidence)).toContain("preuve qui l’étaye");

    const implicitKeyFact = conflictDossier();
    implicitKeyFact.presentation.key_fact_claim_ids.push("claim-conflict-value-a");
    expect(dossierDisplayIssue(implicitKeyFact)).toContain("fait clé");

    const stringValue = conflictDossier();
    stringValue.contradictions[0]!.versions[1]!.normalized_value = "12000000";
    expect(dossierDisplayIssue(stringValue)).toContain("deux versions comparables");

    const ungroundedMetric = conflictDossier();
    const workforceStatement = "Entreprise Synthétique Borée publie un effectif de 12 salariés pour l’exercice 2025.";
    ungroundedMetric.claims[2]!.statement = workforceStatement;
    ungroundedMetric.claims[2]!.structured_value = { value: 12, value_type: "number" };
    ungroundedMetric.evidence[2]!.excerpt = workforceStatement;
    ungroundedMetric.contradictions[0]!.versions[1]!.normalized_value = 12;
    expect(dossierDisplayIssue(ungroundedMetric)).toContain("métrique");

    const wrongSubject = conflictDossier();
    const wrongSubjectStatement = "Entreprise Synthétique Borée acquiert Beta. Beta publie un chiffre d’affaires de 12 millions d’euros pour l’exercice 2025.";
    wrongSubject.claims[2]!.statement = wrongSubjectStatement;
    wrongSubject.evidence[2]!.excerpt = wrongSubjectStatement;
    expect(dossierDisplayIssue(wrongSubject)).toContain("métrique");
  });

  it("masks a conflict backed by URL aliases or one fetched document", () => {
    const aliasedPage = conflictDossier();
    const firstSource = aliasedPage.sources.find(({ source_id }) =>
      source_id === "source-conflict-official"
    )!;
    const secondSource = aliasedPage.sources.find(({ source_id }) =>
      source_id === "source-conflict-specialized"
    )!;
    const firstPage = firstSource.canonical_url ?? firstSource.resolved_url ?? firstSource.provider_url;
    const alias = `${firstPage}?view=second`;
    secondSource.provider_url = alias;
    secondSource.resolved_url = alias;
    secondSource.canonical_url = alias;
    const secondEvidence = aliasedPage.evidence.find(({ evidence_id }) =>
      evidence_id === "evidence-conflict-value-b"
    )!;
    const aliasLocator = JSON.parse(secondEvidence.locator) as Record<string, unknown>;
    aliasLocator.finalUrl = alias;
    secondEvidence.locator = JSON.stringify(aliasLocator);
    expect(dossierDisplayIssue(aliasedPage)).toContain("deux documents sources distincts");

    const duplicateDocument = conflictDossier();
    const firstEvidence = duplicateDocument.evidence.find(({ evidence_id }) =>
      evidence_id === "evidence-conflict-value-a"
    )!;
    const duplicateSecondEvidence = duplicateDocument.evidence.find(({ evidence_id }) =>
      evidence_id === "evidence-conflict-value-b"
    )!;
    const firstLocator = JSON.parse(firstEvidence.locator) as Record<string, unknown>;
    const duplicateLocator = JSON.parse(duplicateSecondEvidence.locator) as Record<string, unknown>;
    duplicateLocator.normalizedTextSha256 = firstLocator.normalizedTextSha256;
    duplicateSecondEvidence.locator = JSON.stringify(duplicateLocator);
    expect(dossierDisplayIssue(duplicateDocument)).toContain("deux documents sources distincts");
  });
});
