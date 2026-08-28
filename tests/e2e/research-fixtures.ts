import { createHash } from "node:crypto";

import type { ResearchDossier } from "../../src/domain/research-dossier";

const startedAt = "2026-08-27T12:00:00.000Z";
const completedAt = "2026-08-27T12:00:00.050Z";
const subjectId = "subject-acme-group";

function period(
  label: string | null = null,
  asOf: string | null = null,
): ResearchDossier["claims"][number]["fact_period"] {
  return label === null && asOf === null
    ? { status: "unknown", start: null, end: null, as_of: null, label: null }
    : { status: "stated", start: null, end: null, as_of: asOf, label };
}

function scope(type: "company" | "group" | "person" = "group", label = "Acme Group") {
  return { type, label } as const;
}

function source(
  id: string,
  url: string,
  title: string,
  entityId = subjectId,
  sourceScope: ResearchDossier["sources"][number]["assumed_scope"] = scope(),
): ResearchDossier["sources"][number] {
  return {
    source_id: id,
    provider_url: url,
    resolved_url: url,
    canonical_url: url,
    title,
    publisher: new URL(url).hostname,
    source_type: "search_result",
    published_at: null,
    accessed_at: startedAt,
    collection_method: "direct_access",
    collection_compliance: "not_verified",
    accessibility_status: "accessible",
    assumed_entity_id: entityId,
    assumed_scope: sourceScope,
  };
}

function locator(url: string, excerpt: string): string {
  return JSON.stringify({
    exact: excerpt,
    matchMode: "exact",
    prefix: "",
    suffix: "",
    occurrenceIndex: 0,
    finalUrl: url,
    citationUrl: url,
    retrievedAt: startedAt,
    normalizedTextSha256: createHash("sha256")
      .update(`${url}\n${excerpt}`, "utf8")
      .digest("hex"),
    contentType: "text/html; charset=utf-8",
    bytesRead: excerpt.length,
    redirectCount: 0,
  });
}

function executionSteps(): ResearchDossier["execution_steps"] {
  return [
    ["identity_resolution", 0, 20],
    ["verification", 20, 35],
    ["composition", 35, 43],
    ["reconciliation", 43, 50],
  ].map(([operation, start, end], index) => ({
    step_id: `step-${index + 1}`,
    invocation_id: `invocation-${index + 1}`,
    operation: operation as ResearchDossier["execution_steps"][number]["operation"],
    status: "completed",
    attempt: 1,
    retry_of: null,
    started_at: new Date(Date.parse(startedAt) + Number(start)).toISOString(),
    ended_at: new Date(Date.parse(startedAt) + Number(end)).toISOString(),
    duration_ms: Number(end) - Number(start),
    error_code: null,
  }));
}

function receipt(stopReason: string): ResearchDossier["receipt"] {
  return {
    run_id: "run-browser-fixture",
    started_at: startedAt,
    completed_at: completedAt,
    total_duration_ms: 50,
    latency_ms: 50,
    provider_calls: 1,
    usage: { input_tokens: 1_000, output_tokens: 200, total_tokens: 1_200 },
    cost: {
      amount_usd: 0.01044,
      status: "estimated",
      assumptions: ["Fixture navigateur synthétique sans appel fournisseur."],
    },
    search_scope: {
      categories: ["activity, geography, event"],
      stop_reason: stopReason,
    },
    resumed_from_run_id: null,
  };
}

export function completeDossier(): ResearchDossier {
  const identityText = "Acme Group est un groupe industriel européen.";
  const activityText = "Acme Group conçoit des logiciels de planification industrielle.";
  const geographyText = "Acme Group a son siège social à Bordeaux.";
  const eventText = "Acme Group a annoncé un partenariat le 20 août 2026.";
  const sources = [
    source("source-official", "https://official.public.org/acme", "Acme Group — Site officiel"),
    source("source-registry", "https://registry.public.net/acme", "Registre public — Acme Group"),
    source("source-news", "https://news.public.com/acme-partnership", "Acme Group annonce un partenariat"),
  ];
  const claims: ResearchDossier["claims"] = [
    {
      claim_id: "claim-identity",
      subject_id: subjectId,
      statement: identityText,
      predicate: "identity.proof",
      structured_value: null,
      unit: null,
      fact_period: period(),
      scope: scope(),
      temporal_status: "unknown",
      evidence_ids: ["evidence-identity"],
      claim_state: "supported",
      reconciliation_state: "confirmation",
      presentation_decision: "display_fact",
      presentation_reason: "Preuve d’identité séparée des faits métier.",
    },
    {
      claim_id: "claim-activity",
      subject_id: subjectId,
      statement: activityText,
      predicate: "activity.software_design",
      structured_value: null,
      unit: null,
      fact_period: period(),
      scope: scope(),
      temporal_status: "unknown",
      evidence_ids: ["evidence-activity"],
      claim_state: "supported",
      reconciliation_state: "confirmation",
      presentation_decision: "display_fact",
      presentation_reason: "Extrait exact retrouvé.",
    },
    {
      claim_id: "claim-geography",
      subject_id: subjectId,
      statement: geographyText,
      predicate: "geography.headquarters",
      structured_value: null,
      unit: null,
      fact_period: period(),
      scope: scope(),
      temporal_status: "unknown",
      evidence_ids: ["evidence-geography"],
      claim_state: "supported",
      reconciliation_state: "confirmation",
      presentation_decision: "display_fact",
      presentation_reason: "Extrait exact retrouvé.",
    },
    {
      claim_id: "claim-event",
      subject_id: subjectId,
      statement: eventText,
      predicate: "recent_signal.partnership",
      structured_value: null,
      unit: null,
      fact_period: period("20 août 2026", "2026-08-20T00:00:00.000Z"),
      scope: scope(),
      temporal_status: "historical",
      evidence_ids: ["evidence-event"],
      claim_state: "historical",
      reconciliation_state: "confirmation",
      presentation_decision: "display_fact",
      presentation_reason: "Extrait exact retrouvé.",
    },
  ];
  const evidence: ResearchDossier["evidence"] = [
    ["evidence-identity", "source-official", "claim-identity", identityText, period()],
    ["evidence-activity", "source-official", "claim-activity", activityText, period()],
    ["evidence-geography", "source-registry", "claim-geography", geographyText, period()],
    ["evidence-event", "source-news", "claim-event", eventText, period("20 août 2026", "2026-08-20T00:00:00.000Z")],
  ].map(([evidenceId, sourceId, claimId, excerpt, factPeriod]) => {
    const linkedSource = sources.find((item) => item.source_id === sourceId);
    if (linkedSource === undefined) throw new Error("Synthetic source missing.");
    return {
      evidence_id: String(evidenceId),
      source_id: String(sourceId),
      claim_id: String(claimId),
      excerpt: String(excerpt),
      locator: locator(linkedSource.provider_url, String(excerpt)),
      entity_id: subjectId,
      fact_period: factPeriod as ResearchDossier["evidence"][number]["fact_period"],
      scope: scope(),
      relation: "supports" as const,
      verification_method: "source_content" as const,
      verified_at: startedAt,
    };
  });

  return {
    schema_version: "1.0.0",
    dossier_id: "dossier-browser-complete",
    origin: "runtime",
    request: {
      request_id: "request-browser",
      submitted_at: startedAt,
      name: "Acme Group",
      suggested_type: "company",
      context: { official_site: "https://official.public.org" },
      total_character_count: 44,
    },
    identity: {
      status: "resolved",
      selected_subject_id: subjectId,
      candidates: [{
        subject_id: subjectId,
        entity_type: "company",
        display_name: "Acme Group",
        discriminators: { official_site: "https://official.public.org" },
        match_rationale: "Un domaine source explicitement choisi a été revérifié.",
      }],
      resolution_reason: "Un domaine source explicitement choisi a été revérifié.",
      clarification_fields: [],
    },
    sources,
    evidence,
    claims,
    inferences: [],
    contradictions: [],
    unknowns: [],
    execution_steps: executionSteps(),
    presentation: {
      summary_items: [
        { kind: "claim", ref_id: "claim-activity" },
        { kind: "claim", ref_id: "claim-geography" },
        { kind: "claim", ref_id: "claim-event" },
      ],
      key_fact_claim_ids: ["claim-identity", "claim-activity", "claim-geography"],
      recent_signal_claim_ids: ["claim-event"],
      ambiguity_claim_ids: [],
      contradiction_ids: [],
      unknown_ids: [],
      source_ids: sources.map(({ source_id }) => source_id),
    },
    receipt: receipt("faits uniques: 3/3 minimum ; catégories: 3/2 minimum ; pages: 3/2 minimum ; éditeurs: 3/2 minimum"),
    result_mode: "standard",
    global_status: "complete_within_scope",
    error: null,
    limitations: ["Fixture navigateur : aucune donnée réelle ni aucun appel payant."],
  };
}

export function partialDossier(): ResearchDossier {
  const dossier = completeDossier();
  dossier.dossier_id = "dossier-browser-partial";
  dossier.global_status = "partial";
  dossier.claims = dossier.claims.filter(({ claim_id }) => claim_id !== "claim-event");
  dossier.evidence = dossier.evidence.filter(({ claim_id }) => claim_id !== "claim-event");
  dossier.sources = dossier.sources.filter(({ source_id }) => source_id !== "source-news");
  dossier.presentation.summary_items = dossier.presentation.summary_items.filter(
    ({ ref_id }) => ref_id !== "claim-event",
  );
  dossier.presentation.recent_signal_claim_ids = [];
  dossier.presentation.source_ids = dossier.sources.map(({ source_id }) => source_id);
  dossier.receipt.search_scope.stop_reason = "faits uniques: 2/3 minimum -> partial";
  dossier.limitations.push("Deux faits métier seulement : le dossier reste partiel.");
  return dossier;
}

export function conflictDossier(): ResearchDossier {
  const dossier = completeDossier();
  const conflictScope = scope("company", "Entreprise Synthétique Borée");
  const conflictPeriod: ResearchDossier["claims"][number]["fact_period"] = {
    status: "stated",
    start: "2025-01-01T00:00:00.000Z",
    end: "2025-12-31T23:59:59.999Z",
    as_of: null,
    label: "exercice 2025",
  };
  const identityText = "Entreprise Synthétique Borée est une société identifiée par SYN-BOREE-001.";
  const versionA = "Entreprise Synthétique Borée publie un chiffre d’affaires de 10 millions d’euros pour l’exercice 2025.";
  const versionB = "Entreprise Synthétique Borée publie un chiffre d’affaires de 12 millions d’euros pour l’exercice 2025.";
  const sources = [
    source(
      "source-conflict-identity",
      "https://registry.example.invalid/boree",
      "Registre synthétique — Borée",
      subjectId,
      conflictScope,
    ),
    source(
      "source-conflict-official",
      "https://official.example.invalid/boree-2025",
      "Rapport synthétique Borée 2025",
      subjectId,
      conflictScope,
    ),
    source(
      "source-conflict-specialized",
      "https://specialized.example.invalid/boree-2025",
      "Analyse synthétique Borée 2025",
      subjectId,
      conflictScope,
    ),
  ];
  const claims: ResearchDossier["claims"] = [
    {
      ...dossier.claims[0]!,
      statement: identityText,
      scope: conflictScope,
      evidence_ids: ["evidence-conflict-identity"],
    },
    {
      ...dossier.claims[1]!,
      claim_id: "claim-conflict-value-a",
      statement: versionA,
      predicate: "metric.revenue",
      structured_value: { value: 10_000_000, value_type: "number" },
      unit: "million",
      fact_period: conflictPeriod,
      scope: conflictScope,
      temporal_status: "historical",
      evidence_ids: ["evidence-conflict-value-a"],
      claim_state: "contested",
      reconciliation_state: "contradiction",
      presentation_reason: "Version A conservée avec sa preuve concurrente.",
    },
    {
      ...dossier.claims[1]!,
      claim_id: "claim-conflict-value-b",
      statement: versionB,
      predicate: "metric.revenue",
      structured_value: { value: 12_000_000, value_type: "number" },
      unit: "million",
      fact_period: conflictPeriod,
      scope: conflictScope,
      temporal_status: "historical",
      evidence_ids: ["evidence-conflict-value-b"],
      claim_state: "contested",
      reconciliation_state: "contradiction",
      presentation_reason: "Version B conservée avec sa preuve concurrente.",
    },
  ];
  const evidence: ResearchDossier["evidence"] = [
    ["evidence-conflict-identity", "source-conflict-identity", "claim-identity", identityText, period()],
    ["evidence-conflict-value-a", "source-conflict-official", "claim-conflict-value-a", versionA, conflictPeriod],
    ["evidence-conflict-value-b", "source-conflict-specialized", "claim-conflict-value-b", versionB, conflictPeriod],
  ].map(([evidenceId, sourceId, claimId, excerpt, factPeriod]) => {
    const linkedSource = sources.find((item) => item.source_id === sourceId);
    if (linkedSource === undefined) throw new Error("Synthetic conflict source missing.");
    return {
      evidence_id: String(evidenceId),
      source_id: String(sourceId),
      claim_id: String(claimId),
      excerpt: String(excerpt),
      locator: locator(linkedSource.provider_url, String(excerpt)),
      entity_id: subjectId,
      fact_period: factPeriod as ResearchDossier["evidence"][number]["fact_period"],
      scope: conflictScope,
      relation: "supports" as const,
      verification_method: "source_content" as const,
      verified_at: startedAt,
    };
  });

  return {
    ...dossier,
    dossier_id: "dossier-browser-conflict",
    request: {
      ...dossier.request,
      request_id: "request-browser-conflict",
      name: "Entreprise Synthétique Borée",
      context: { country: "Pays Synthétique" },
    },
    identity: {
      status: "resolved",
      selected_subject_id: subjectId,
      candidates: [{
        subject_id: subjectId,
        entity_type: "company",
        display_name: "Entreprise Synthétique Borée",
        discriminators: { legal_identifier: "SYN-BOREE-001" },
        match_rationale: "L’identifiant synthétique est explicite dans la preuve d’identité.",
      }],
      resolution_reason: "L’identité est résolue ; la métrique reste contestée.",
      clarification_fields: [],
    },
    sources,
    evidence,
    claims,
    contradictions: [{
      contradiction_id: "contradiction-revenue-2025",
      predicate: "metric.revenue",
      period: conflictPeriod,
      scope: conflictScope,
      metric_definition: "Chiffre d’affaires publié en EUR",
      published_or_estimated_checked: true,
      classification: "contradiction",
      versions: [
        {
          claim_id: "claim-conflict-value-a",
          evidence_ids: ["evidence-conflict-value-a"],
          normalized_value: 10_000_000,
          unit: "million",
          currency: "EUR",
        },
        {
          claim_id: "claim-conflict-value-b",
          evidence_ids: ["evidence-conflict-value-b"],
          normalized_value: 12_000_000,
          unit: "million",
          currency: "EUR",
        },
      ],
      explanation: "Même entité, même métrique, même période, même périmètre, même unité et même devise : aucune valeur n’est retenue comme gagnante.",
      visible: true,
    }],
    presentation: {
      summary_items: [],
      key_fact_claim_ids: ["claim-identity"],
      recent_signal_claim_ids: [],
      ambiguity_claim_ids: [],
      contradiction_ids: ["contradiction-revenue-2025"],
      unknown_ids: [],
      source_ids: sources.map(({ source_id }) => source_id),
    },
    receipt: {
      ...receipt("Conflit déterministe conservé sans arbitrage silencieux."),
      provider_calls: 0,
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      cost: {
        amount_usd: 0,
        status: "exact",
        assumptions: ["Scénario navigateur déterministe sans appel fournisseur."],
      },
    },
    global_status: "partial",
    limitations: [
      "Scénario de test déterministe : données synthétiques, aucun appel fournisseur et aucun coût.",
    ],
  };
}

export function ambiguousDossier(): ResearchDossier {
  const candidates = [
    { id: "subject-thomas-studio", employer: "Studio Public", domain: "studio.public.org" },
    { id: "subject-thomas-lab", employer: "Laboratoire Public", domain: "lab.public.net" },
  ];
  const sources = candidates.map(({ id, domain, employer }, index) => source(
    `source-candidate-${index + 1}`,
    `https://${domain}/thomas-martin`,
    `Thomas Martin — ${employer}`,
    id,
    scope("person", "Thomas Martin"),
  ));
  const claims = candidates.map(({ id, employer }, index) => {
    const statement = `Thomas Martin travaille pour ${employer}.`;
    return {
      claim_id: `claim-candidate-${index + 1}`,
      subject_id: id,
      statement,
      predicate: "identity.candidate",
      structured_value: null,
      unit: null,
      fact_period: period(),
      scope: scope("person", "Thomas Martin"),
      temporal_status: "unknown" as const,
      evidence_ids: [`evidence-candidate-${index + 1}`],
      claim_state: "ambiguous" as const,
      reconciliation_state: "indetermination" as const,
      presentation_decision: "display_ambiguity" as const,
      presentation_reason: "Candidat distinct non sélectionné.",
    };
  });
  const evidence = claims.map((claim, index) => ({
    evidence_id: `evidence-candidate-${index + 1}`,
    source_id: `source-candidate-${index + 1}`,
    claim_id: claim.claim_id,
    excerpt: claim.statement,
    locator: locator(sources[index]!.provider_url, claim.statement),
    entity_id: claim.subject_id,
    fact_period: period(),
    scope: scope("person", "Thomas Martin"),
    relation: "supports" as const,
    verification_method: "source_content" as const,
    verified_at: startedAt,
  }));
  const unknownId = "unknown-identity";
  return {
    ...completeDossier(),
    dossier_id: "dossier-browser-ambiguous",
    request: {
      request_id: "request-browser-ambiguous",
      submitted_at: startedAt,
      name: "Thomas Martin",
      suggested_type: "person",
      context: {},
      total_character_count: 13,
    },
    identity: {
      status: "ambiguous",
      selected_subject_id: null,
      candidates: candidates.map(({ id, employer }) => ({
        subject_id: id,
        entity_type: "person",
        display_name: "Thomas Martin",
        discriminators: { employer },
        match_rationale: "Candidat distinct retrouvé dans une source vérifiée.",
      })),
      resolution_reason: "Deux candidats vérifiés restent compatibles.",
      clarification_fields: ["employer", "official_site"],
    },
    sources,
    evidence,
    claims,
    unknowns: [{
      unknown_id: unknownId,
      category: "identity_ambiguity",
      description: "Deux candidats distincts restent possibles.",
      explored_scope: ["Pages publiques vérifiées"],
      source_categories: ["search_result"],
      stop_reason: "Aucun candidat n’est choisi silencieusement.",
      retry_context: ["Choisir une page source à revérifier"],
    }],
    presentation: {
      summary_items: [],
      key_fact_claim_ids: [],
      recent_signal_claim_ids: [],
      ambiguity_claim_ids: claims.map(({ claim_id }) => claim_id),
      contradiction_ids: [],
      unknown_ids: [unknownId],
      source_ids: sources.map(({ source_id }) => source_id),
    },
    receipt: receipt("La résolution d’identité exige une clarification."),
    result_mode: "standard",
    global_status: "needs_clarification",
  };
}

export function singleCandidateDossier(): ResearchDossier {
  const dossier = ambiguousDossier();
  dossier.dossier_id = "dossier-browser-single-candidate";
  dossier.identity.status = "insufficient_context";
  dossier.identity.candidates = dossier.identity.candidates.slice(0, 1);
  dossier.identity.resolution_reason = "Un candidat est plausible, mais le contexte reste insuffisant.";
  dossier.sources = dossier.sources.slice(0, 1);
  dossier.evidence = dossier.evidence.slice(0, 1);
  dossier.claims = dossier.claims.slice(0, 1);
  dossier.unknowns[0]!.description = "Un candidat plausible reste à confirmer.";
  dossier.presentation.ambiguity_claim_ids = dossier.claims.map(({ claim_id }) => claim_id);
  dossier.presentation.source_ids = dossier.sources.map(({ source_id }) => source_id);
  return dossier;
}

export function silenceDossier(): ResearchDossier {
  const unknownId = "unknown-silence";
  return {
    ...completeDossier(),
    dossier_id: "dossier-browser-silence",
    identity: {
      status: "not_found_within_scope",
      selected_subject_id: null,
      candidates: [],
      resolution_reason: "Aucun candidat directement vérifiable dans le périmètre.",
      clarification_fields: [],
    },
    sources: [],
    evidence: [],
    claims: [],
    unknowns: [{
      unknown_id: unknownId,
      category: "no_reliable_source",
      description: "Aucune source suffisamment fiable n’a été trouvée dans le périmètre de cette recherche.",
      explored_scope: ["Recherche Web publique"],
      source_categories: ["search_result"],
      stop_reason: "Les preuves vérifiables sont insuffisantes.",
      retry_context: ["Ajouter un indice discriminant"],
    }],
    presentation: {
      summary_items: [],
      key_fact_claim_ids: [],
      recent_signal_claim_ids: [],
      ambiguity_claim_ids: [],
      contradiction_ids: [],
      unknown_ids: [unknownId],
      source_ids: [],
    },
    receipt: receipt("Les preuves publiques vérifiables sont insuffisantes."),
    result_mode: "silence",
    global_status: "insufficient_evidence",
  };
}

export function completedSse(dossier: ResearchDossier): string {
  const executionId = dossier.receipt.run_id;
  const progress = [
    ["accepted", 1],
    ["researching_and_resolving", 10],
    ["source_verifying", 25],
    ["building", 36],
    ["validating", 44],
  ].map(([state, elapsedMs]) => ({ state, executionId, elapsedMs }));
  const terminal = {
    state: "completed",
    executionId,
    elapsedMs: 50,
    dossier,
    receipt: {
      estimatedCostUsd: dossier.receipt.cost.amount_usd,
      sourceFetchCount: dossier.sources.length,
      excerptVerificationCount: dossier.evidence.length,
      webSearchQueryCount: 1,
    },
  };
  return [...progress, terminal]
    .map((event) => `event: ${event.state}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
}

export function failureSse(): string {
  const events = [
    { state: "accepted", executionId: "run-browser-failure", elapsedMs: 1 },
    { state: "researching_and_resolving", executionId: "run-browser-failure", elapsedMs: 8 },
    {
      state: "failed",
      executionId: "run-browser-failure",
      elapsedMs: 25,
      error: {
        code: "provider_unavailable",
        message: "Le fournisseur de recherche est temporairement indisponible.",
        retryable: true,
      },
      receipt: {
        durationMs: 25,
        callsAttempted: 1,
        sourceFetchCount: 0,
      },
    },
  ];
  return events.map((event) =>
    `event: ${event.state}\ndata: ${JSON.stringify(event)}\n\n`,
  ).join("");
}
