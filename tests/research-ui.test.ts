import { describe, expect, it } from "vitest";

import fixtures from "../docs/contracts/contract-fixtures.json";
import {
  categoryForClaim,
  decodeSseBlock,
  dossierDisplayIssue,
  shouldDisplayEvidenceExcerpt,
} from "../src/app/research-form";
import type { ResearchDossier } from "../src/domain/research-dossier";
import { partialDossier } from "./e2e/research-fixtures";

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
});
