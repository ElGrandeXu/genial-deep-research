import { describe, expect, it } from "vitest";

import fixtures from "../docs/contracts/contract-fixtures.json";
import { validateRuntimeDossier } from "../src/domain/runtime-invariants";
import type { ResearchDossier } from "../src/domain/research-dossier";

function makeValidDossier(): ResearchDossier {
  const dossier = structuredClone(
    fixtures.fixtures[0]!.dossier,
  ) as unknown as ResearchDossier;
  const sourceTemplate = dossier.sources[0]!;
  const evidenceTemplate = dossier.evidence[0]!;
  const claimTemplate = dossier.claims[0]!;
  const subjectId = dossier.identity.selected_subject_id!;

  dossier.origin = "runtime";
  dossier.sources = [
    {
      ...sourceTemplate,
      source_id: "source-a",
      title: "Source A",
      provider_url: "https://example.com/a",
      resolved_url: "https://example.com/a",
      canonical_url: "https://example.com/a",
    },
    {
      ...sourceTemplate,
      source_id: "source-b",
      title: "Source B",
      provider_url: "https://independent.example/b",
      resolved_url: "https://independent.example/b",
      canonical_url: "https://independent.example/b",
    },
  ];
  dossier.claims = [
    {
      ...claimTemplate,
      claim_id: "claim-a",
      statement: "Aster exerce une activité de conseil.",
      predicate: "activity.consulting",
      evidence_ids: ["evidence-a"],
    },
    {
      ...claimTemplate,
      claim_id: "claim-b",
      statement: "Aster est établie à Paris.",
      predicate: "geography.headquarters",
      evidence_ids: ["evidence-b"],
    },
    {
      ...claimTemplate,
      claim_id: "claim-c",
      statement: "Aster a publié une annonce le 20 août 2026.",
      predicate: "recent_signal.announcement",
      evidence_ids: ["evidence-c"],
    },
  ];
  dossier.evidence = [
    {
      ...evidenceTemplate,
      evidence_id: "evidence-a",
      source_id: "source-a",
      claim_id: "claim-a",
      excerpt: "Ａster   exerce une activité de conseil.",
      entity_id: subjectId,
      relation: "supports",
      verification_method: "source_content",
    },
    {
      ...evidenceTemplate,
      evidence_id: "evidence-b",
      source_id: "source-a",
      claim_id: "claim-b",
      excerpt: "Aster est établie à Paris.",
      entity_id: subjectId,
      relation: "supports",
      verification_method: "source_content",
    },
    {
      ...evidenceTemplate,
      evidence_id: "evidence-c",
      source_id: "source-b",
      claim_id: "claim-c",
      excerpt: "Aster a publié une annonce le 20 août 2026.",
      entity_id: subjectId,
      relation: "supports",
      verification_method: "source_content",
    },
  ];
  dossier.presentation = {
    summary_items: [{ kind: "claim", ref_id: "claim-a" }],
    key_fact_claim_ids: ["claim-a", "claim-b"],
    recent_signal_claim_ids: ["claim-c"],
    ambiguity_claim_ids: [],
    contradiction_ids: [],
    unknown_ids: [],
    source_ids: ["source-a", "source-b"],
  };
  dossier.contradictions = [];
  dossier.global_status = "complete_within_scope";
  dossier.result_mode = "standard";
  return dossier;
}

function expectRuntimeError(dossier: unknown, expected: string): void {
  const result = validateRuntimeDossier(dossier);
  expect(result).toMatchObject({ ok: false });
  if (!result.ok) {
    expect(result.errors.some((error) => error.includes(expected))).toBe(true);
  }
}

describe("runtime dossier invariants", () => {
  it("accepts a normalized, three-fact dossier backed by two accessible sources", () => {
    expect(validateRuntimeDossier(makeValidDossier())).toEqual({ ok: true });
  });

  it("rejects an orphaned evidence reference", () => {
    const dossier = makeValidDossier();
    dossier.claims[0]!.evidence_ids = ["missing-evidence"];

    expectRuntimeError(dossier, "claim_missing_evidence:claim-a:missing-evidence");
  });

  it("rejects a resolved identity containing more than one candidate", () => {
    const dossier = makeValidDossier();
    dossier.identity.candidates.push({
      ...dossier.identity.candidates[0]!,
      subject_id: "subject-second",
      display_name: "Aster Groupe",
    });

    expectRuntimeError(dossier, "maxItems");
  });

  it("rejects an unproven summary item", () => {
    const dossier = makeValidDossier();
    dossier.claims[0]!.presentation_decision = "reject";
    dossier.claims[0]!.claim_state = "rejected";

    expectRuntimeError(dossier, "summary_requires_displayed_fact:claim:claim-a");
  });

  it("rejects a false complete status with fewer than three visible facts", () => {
    const dossier = makeValidDossier();
    dossier.claims = dossier.claims.slice(0, 2);
    dossier.evidence = dossier.evidence.slice(0, 2);
    dossier.presentation.recent_signal_claim_ids = [];

    expectRuntimeError(dossier, "complete_requires_three_visible_facts");
  });

  it("does not count an identity proof among the three business facts", () => {
    const dossier = makeValidDossier();
    dossier.claims[2]!.predicate = "identity.proof";

    expectRuntimeError(dossier, "complete_requires_three_business_facts");
  });

  it("rejects complete with more than six business facts", () => {
    const dossier = makeValidDossier();
    for (let index = 3; index < 7; index += 1) {
      const claimId = `claim-${index}`;
      const evidenceId = `evidence-${index}`;
      dossier.claims.push({
        ...dossier.claims[0]!,
        claim_id: claimId,
        predicate: `activity.fact_${index}`,
        statement: `Aster exerce l’activité autonome ${index}.`,
        evidence_ids: [evidenceId],
      });
      dossier.evidence.push({
        ...dossier.evidence[0]!,
        evidence_id: evidenceId,
        claim_id: claimId,
        excerpt: `Aster exerce l’activité autonome ${index}.`,
      });
      dossier.presentation.key_fact_claim_ids.push(claimId);
    }

    expectRuntimeError(dossier, "complete_allows_at_most_six_business_facts");
  });

  it("rejects complete when source pages share one publisher domain", () => {
    const dossier = makeValidDossier();
    dossier.sources[1]!.provider_url = "https://example.com/b";
    dossier.sources[1]!.resolved_url = "https://example.com/b";
    dossier.sources[1]!.canonical_url = "https://example.com/b";

    expectRuntimeError(dossier, "complete_requires_two_publisher_domains");
  });

  it("rejects complete when business facts cover one category", () => {
    const dossier = makeValidDossier();
    for (const claim of dossier.claims) claim.predicate = "activity.single_category";

    expectRuntimeError(dossier, "complete_requires_two_business_categories");
  });

  it("rejects a clarification response that contains supported facts", () => {
    const dossier = makeValidDossier();
    dossier.identity.status = "insufficient_context";
    dossier.identity.selected_subject_id = null;
    dossier.global_status = "needs_clarification";

    expectRuntimeError(dossier, "needs_clarification_forbids_supported_facts");
  });

  it("rejects silence that contains supported facts", () => {
    const dossier = makeValidDossier();
    dossier.identity.status = "not_found_within_scope";
    dossier.identity.selected_subject_id = null;
    dossier.global_status = "insufficient_evidence";
    dossier.result_mode = "silence";

    expectRuntimeError(dossier, "silence_forbids_supported_facts");
  });

  it("rejects a contradiction whose normalized versions collapse", () => {
    const dossier = makeValidDossier();
    for (const claim of dossier.claims.slice(0, 2)) {
      claim.claim_state = "contested";
      claim.reconciliation_state = "contradiction";
    }
    dossier.global_status = "partial";
    dossier.contradictions = [
      {
        contradiction_id: "contradiction-a",
        predicate: "activity",
        period: dossier.claims[0]!.fact_period,
        scope: dossier.claims[0]!.scope,
        metric_definition: "Deux versions contrôlées du même fait.",
        published_or_estimated_checked: true,
        classification: "contradiction",
        versions: [
          {
            claim_id: "claim-a",
            evidence_ids: ["evidence-a"],
            normalized_value: "identique",
            unit: null,
            currency: null,
          },
          {
            claim_id: "claim-b",
            evidence_ids: ["evidence-b"],
            normalized_value: "identique",
            unit: null,
            currency: null,
          },
        ],
        explanation: "Les versions doivent rester distinctes après normalisation.",
        visible: true,
      },
    ];
    dossier.presentation.contradiction_ids = ["contradiction-a"];

    expectRuntimeError(dossier, "visible_contradiction_needs_distinct_values");
  });

  it("rejects a current claim without a dated fact period", () => {
    const dossier = makeValidDossier();
    dossier.claims[0]!.fact_period = {
      status: "stated",
      start: null,
      end: null,
      as_of: null,
      label: "actuellement",
    };

    expectRuntimeError(dossier, "current_claim_without_dated_fact_period:claim-a");
  });

  it("rejects a displayed metric without a usable period and scope", () => {
    const dossier = makeValidDossier();
    dossier.claims[0]!.predicate = "metric.workforce";
    dossier.claims[0]!.fact_period = {
      status: "unknown",
      start: null,
      end: null,
      as_of: null,
      label: null,
    };
    dossier.claims[0]!.scope = { type: "undetermined", label: null };
    dossier.claims[0]!.temporal_status = "unknown";

    expectRuntimeError(dossier, "displayed_metric_requires_period_and_scope:claim-a");
  });

  it("rejects a non-monotonic or mismeasured execution step", () => {
    const dossier = makeValidDossier();
    dossier.execution_steps[0]!.ended_at = "2026-08-26T09:59:59Z";
    dossier.execution_steps[0]!.duration_ms = 1;

    expectRuntimeError(dossier, "execution_step_invalid_timing");
  });

  it("rejects an execution step outside the measured receipt interval", () => {
    const dossier = makeValidDossier();
    dossier.execution_steps[0]!.started_at = "2026-08-26T10:00:05Z";
    dossier.execution_steps[0]!.ended_at = "2026-08-26T10:00:06Z";

    expectRuntimeError(dossier, "execution_step_outside_receipt");
  });
});
