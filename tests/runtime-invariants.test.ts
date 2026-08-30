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

function makeConflictDossier(): ResearchDossier {
  const fixture = fixtures.fixtures.find(
    ({ fixture_id }) => fixture_id === "fixture-conflict-two-versions",
  );
  if (fixture === undefined) throw new Error("Conflict fixture missing.");
  const dossier = structuredClone(fixture.dossier) as unknown as ResearchDossier;
  dossier.origin = "runtime";
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

  it("accepts two incompatible versions only when every conflict dimension is aligned", () => {
    expect(validateRuntimeDossier(makeConflictDossier())).toEqual({ ok: true });
  });

  it("compares harmless conflict casing and spacing variants canonically", () => {
    const dossier = makeConflictDossier();
    const conflict = dossier.contradictions[0]!;
    conflict.predicate = "METRIC.REVENUE";
    conflict.period.label = "EXERCICE   2025";
    conflict.scope.label = "ENTREPRISE SYNTHÉTIQUE BORÉE";
    for (const version of conflict.versions) {
      version.unit = "MILLION";
      version.currency = "eur";
    }
    expect(validateRuntimeDossier(dossier)).toEqual({ ok: true });
  });

  it.each([
    ["value nature", (dossier: ResearchDossier) => {
      dossier.contradictions[0]!.published_or_estimated_checked = false;
    }, "visible_contradiction_requires_value_nature_check"],
    ["second version", (dossier: ResearchDossier) => {
      const conflict = dossier.contradictions[0]!;
      (conflict as unknown as { versions: typeof conflict.versions[number][] }).versions = [
        conflict.versions[0]!,
      ];
    }, "minItems"],
    ["predicate", (dossier: ResearchDossier) => {
      dossier.claims[1]!.predicate = "metric.adjusted_revenue";
    }, "visible_contradiction_predicate_mismatch"],
    ["period", (dossier: ResearchDossier) => {
      dossier.claims[1]!.fact_period.label = "exercice 2024";
    }, "visible_contradiction_period_mismatch"],
    ["scope", (dossier: ResearchDossier) => {
      dossier.claims[1]!.scope = { type: "subsidiary", label: "Borée France" };
    }, "visible_contradiction_scope_mismatch"],
    ["source scope", (dossier: ResearchDossier) => {
      dossier.sources[1]!.assumed_scope = { type: "subsidiary", label: "Borée France" };
    }, "visible_contradiction_source_scope_mismatch"],
    ["non-qualifying evidence", (dossier: ResearchDossier) => {
      dossier.evidence[1]!.relation = "context_only";
    }, "visible_contradiction_version_requires_qualifying_page"],
    ["inaccessible source", (dossier: ResearchDossier) => {
      dossier.sources[1]!.accessibility_status = "inaccessible";
    }, "visible_contradiction_version_requires_qualifying_page"],
    ["unit and currency", (dossier: ResearchDossier) => {
      dossier.contradictions[0]!.versions[1]!.currency = "USD";
    }, "visible_contradiction_requires_same_unit_currency"],
    ["finite numeric value", (dossier: ResearchDossier) => {
      dossier.contradictions[0]!.versions[1]!.normalized_value = "12000000";
    }, "visible_contradiction_requires_finite_numeric_values"],
    ["excerpt-grounded metric", (dossier: ResearchDossier) => {
      const statement = "Entreprise Synthétique Borée publie un effectif de 12 salariés pour l’exercice 2025.";
      dossier.claims[1]!.statement = statement;
      dossier.claims[1]!.structured_value = { value: 12, value_type: "number" };
      dossier.evidence[1]!.excerpt = statement;
      dossier.contradictions[0]!.versions[1]!.normalized_value = 12;
    }, "visible_contradiction_metric_not_grounded"],
    ["excerpt-grounded value nature", (dossier: ResearchDossier) => {
      const statement = "Entreprise Synthétique Borée n’a jamais publié de chiffre d’affaires de 12 millions d’euros pour l’exercice 2025.";
      dossier.claims[1]!.statement = statement;
      dossier.evidence[1]!.excerpt = statement;
    }, "visible_contradiction_value_nature_not_grounded"],
    ["same-clause metric/value relation", (dossier: ResearchDossier) => {
      const statement = "Entreprise Synthétique Borée publie que son chiffre d’affaires reste inconnu. Son amende est de 12 millions d’euros pour l’exercice 2025.";
      dossier.claims[1]!.statement = statement;
      dossier.evidence[1]!.excerpt = statement;
    }, "visible_contradiction_metric_not_grounded"],
    ["excerpt subject", (dossier: ResearchDossier) => {
      const statement = "Entreprise Synthétique Borée acquiert Beta. Beta publie un chiffre d’affaires de 12 millions d’euros pour l’exercice 2025.";
      dossier.claims[1]!.statement = statement;
      dossier.evidence[1]!.excerpt = statement;
    }, "visible_contradiction_metric_not_grounded"],
    ["subannual excerpt", (dossier: ResearchDossier) => {
      const statement = "Entreprise Synthétique Borée publie un chiffre d’affaires de 12 millions d’euros pour le premier semestre 2025.";
      dossier.claims[1]!.statement = statement;
      dossier.evidence[1]!.excerpt = statement;
    }, "visible_contradiction_period_not_grounded"],
    ["guidance qualifier", (dossier: ResearchDossier) => {
      const statement = "Entreprise Synthétique Borée publie un chiffre d’affaires attendu de 12 millions d’euros pour l’exercice 2025.";
      dossier.claims[1]!.statement = statement;
      dossier.evidence[1]!.excerpt = statement;
    }, "visible_contradiction_value_nature_not_grounded"],
    ["ambiguous scaled decimal", (dossier: ResearchDossier) => {
      const statement = "Entreprise Synthétique Borée publie un chiffre d’affaires de 1.234 million d’euros pour l’exercice 2025.";
      dossier.claims[1]!.statement = statement;
      dossier.evidence[1]!.excerpt = statement;
      dossier.claims[1]!.structured_value = { value: 1_234_000_000, value_type: "number" };
      dossier.contradictions[0]!.versions[1]!.normalized_value = 1_234_000_000;
    }, "visible_contradiction_metric_not_grounded"],
    ["bare annual label", (dossier: ResearchDossier) => {
      const statement = "Entreprise Synthétique Borée publie un chiffre d’affaires de 12 millions d’euros en 2025.";
      dossier.claims[1]!.statement = statement;
      dossier.evidence[1]!.excerpt = statement;
    }, "visible_contradiction_metric_not_grounded"],
    ["unrelated update year", (dossier: ResearchDossier) => {
      const statement = "Entreprise Synthétique Borée publie un chiffre d’affaires de 12 millions d’euros. La page est mise à jour pendant l’année civile 2025.";
      dossier.claims[1]!.statement = statement;
      dossier.evidence[1]!.excerpt = statement;
    }, "visible_contradiction_metric_not_grounded"],
    ["unsupported segment definition", (dossier: ResearchDossier) => {
      const statement = "Entreprise Synthétique Borée publie un chiffre d’affaires du segment européen de 12 millions d’euros pour l’exercice 2025.";
      dossier.claims[1]!.statement = statement;
      dossier.evidence[1]!.excerpt = statement;
    }, "visible_contradiction_metric_not_grounded"],
    ["approximate value", (dossier: ResearchDossier) => {
      const statement = "Entreprise Synthétique Borée publie un chiffre d’affaires d’environ 12 millions d’euros pour l’exercice 2025.";
      dossier.claims[1]!.statement = statement;
      dossier.evidence[1]!.excerpt = statement;
    }, "visible_contradiction_metric_not_grounded"],
    ["distinct pages", (dossier: ResearchDossier) => {
      dossier.evidence[1]!.source_id = dossier.evidence[0]!.source_id;
    }, "visible_contradiction_requires_two_source_pages"],
    ["query variants of one page", (dossier: ResearchDossier) => {
      const firstSource = dossier.sources[0]!;
      const secondSource = dossier.sources[1]!;
      const alias = `${firstSource.canonical_url ?? firstSource.resolved_url ?? firstSource.provider_url}?view=second`;
      secondSource.provider_url = alias;
      secondSource.resolved_url = alias;
      secondSource.canonical_url = alias;
      const locator = JSON.parse(dossier.evidence[1]!.locator) as Record<string, unknown>;
      locator.finalUrl = alias;
      dossier.evidence[1]!.locator = JSON.stringify(locator);
    }, "visible_contradiction_requires_two_source_pages"],
    ["identical fetched document", (dossier: ResearchDossier) => {
      const firstLocator = JSON.parse(dossier.evidence[0]!.locator) as Record<string, unknown>;
      const secondLocator = JSON.parse(dossier.evidence[1]!.locator) as Record<string, unknown>;
      secondLocator.normalizedTextSha256 = firstLocator.normalizedTextSha256;
      dossier.evidence[1]!.locator = JSON.stringify(secondLocator);
    }, "visible_contradiction_requires_two_source_documents"],
    ["summary exclusion", (dossier: ResearchDossier) => {
      dossier.presentation.summary_items = [{ kind: "claim", ref_id: dossier.claims[0]!.claim_id }];
    }, "summary_forbids_unresolved_fact"],
    ["key-fact exclusion", (dossier: ResearchDossier) => {
      dossier.presentation.key_fact_claim_ids.push(dossier.claims[0]!.claim_id);
    }, "presentation_key_fact_forbids_unresolved"],
  ] as const)("rejects a conflict with a mismatched %s", (_label, mutate, expected) => {
    const dossier = makeConflictDossier();
    mutate(dossier);
    expectRuntimeError(dossier, expected);
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

  it("accepts complete with one sourced business fact", () => {
    const dossier = makeValidDossier();
    dossier.claims = dossier.claims.slice(0, 1);
    dossier.evidence = dossier.evidence.slice(0, 1);
    dossier.presentation.summary_items = [{ kind: "claim", ref_id: "claim-a" }];
    dossier.presentation.key_fact_claim_ids = ["claim-a"];
    dossier.presentation.recent_signal_claim_ids = [];

    expect(validateRuntimeDossier(dossier)).toEqual({ ok: true });
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
