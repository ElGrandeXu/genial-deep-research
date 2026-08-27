import { validateResearchDossier } from "./contract-validator";
import type { ResearchDossier } from "./research-dossier";

type Claim = ResearchDossier["claims"][number];
type Evidence = ResearchDossier["evidence"][number];
type Source = ResearchDossier["sources"][number];
type Contradiction = ResearchDossier["contradictions"][number];

export type RuntimeDossierValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

export type RuntimeInvariantValidationResult =
  | { ok: true }
  | { ok: false; errors: readonly string[] };

const FACTUAL_STATES = new Set<Claim["claim_state"]>([
  "supported",
  "contested",
  "historical",
]);

function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function addUniqueErrors(errors: string[]): string[] {
  return [...new Set(errors)];
}

function isFactualClaim(claim: Claim): boolean {
  return FACTUAL_STATES.has(claim.claim_state);
}

function hasDatedFactPeriod(claim: Claim): boolean {
  const period = claim.fact_period;
  return (
    period.status !== "unknown" &&
    (period.start !== null || period.end !== null || period.as_of !== null)
  );
}

function versionValueKey(version: Contradiction["versions"][number]): string {
  return `${typeof version.normalized_value}:${JSON.stringify(version.normalized_value)}`;
}

export function validateRuntimeDossier(
  dossier: unknown,
): RuntimeDossierValidationResult {
  const structural = validateResearchDossier(dossier);
  if (!structural.ok) {
    return {
      ok: false,
      errors: structural.errors.map(
        (error) =>
          `schema:${error.instancePath || "/"}:${error.keyword}:${error.message}`,
      ),
    };
  }

  const value: ResearchDossier = structural.value;
  const errors: string[] = [];
  const candidates = new Map(
    value.identity.candidates.map((candidate) => [candidate.subject_id, candidate]),
  );
  const sources = new Map(value.sources.map((source) => [source.source_id, source]));
  const evidence = new Map(
    value.evidence.map((item) => [item.evidence_id, item]),
  );
  const claims = new Map(value.claims.map((claim) => [claim.claim_id, claim]));
  const contradictions = new Map(
    value.contradictions.map((item) => [item.contradiction_id, item]),
  );
  const unknowns = new Map(
    value.unknowns.map((unknown) => [unknown.unknown_id, unknown]),
  );
  const invocations = new Map(
    value.execution_steps.map((step) => [step.invocation_id, step]),
  );

  const registeredIds: Array<readonly [kind: string, id: string]> = [
    ["dossier", value.dossier_id],
    ["request", value.request.request_id],
    ["run", value.receipt.run_id],
    ...value.identity.candidates.map(
      (candidate) => ["subject", candidate.subject_id] as const,
    ),
    ...value.sources.map((source) => ["source", source.source_id] as const),
    ...value.evidence.map((item) => ["evidence", item.evidence_id] as const),
    ...value.claims.map((claim) => ["claim", claim.claim_id] as const),
    ...value.inferences.map(
      (inference) => ["inference", inference.inference_id] as const,
    ),
    ...value.contradictions.map(
      (item) => ["contradiction", item.contradiction_id] as const,
    ),
    ...value.unknowns.map((unknown) => ["unknown", unknown.unknown_id] as const),
    ...value.execution_steps.flatMap((step) => [
      ["step", step.step_id] as const,
      ["invocation", step.invocation_id] as const,
    ]),
  ];
  const seenIds = new Set<string>();
  for (const [kind, id] of registeredIds) {
    if (seenIds.has(id)) {
      errors.push(`duplicate_id:${kind}:${id}`);
    }
    seenIds.add(id);
  }

  function requireUniqueReferences(label: string, ids: readonly string[]): void {
    if (new Set(ids).size !== ids.length) {
      errors.push(`duplicate_reference:${label}`);
    }
  }

  requireUniqueReferences(
    "presentation.key_fact_claim_ids",
    value.presentation.key_fact_claim_ids,
  );
  requireUniqueReferences(
    "presentation.recent_signal_claim_ids",
    value.presentation.recent_signal_claim_ids,
  );
  requireUniqueReferences(
    "presentation.ambiguity_claim_ids",
    value.presentation.ambiguity_claim_ids,
  );
  requireUniqueReferences(
    "presentation.contradiction_ids",
    value.presentation.contradiction_ids,
  );
  requireUniqueReferences(
    "presentation.unknown_ids",
    value.presentation.unknown_ids,
  );
  requireUniqueReferences(
    "presentation.source_ids",
    value.presentation.source_ids,
  );
  const summaryReferenceKeys = value.presentation.summary_items.map(
    (item) => `${item.kind}:${item.ref_id}`,
  );
  requireUniqueReferences("presentation.summary_items", summaryReferenceKeys);

  if (value.identity.status === "resolved") {
    if (
      value.identity.selected_subject_id === null ||
      !candidates.has(value.identity.selected_subject_id)
    ) {
      errors.push("resolved_identity_missing_selected_candidate");
    }
  } else if (value.identity.selected_subject_id !== null) {
    errors.push("unresolved_identity_has_selected_candidate");
  }

  for (const source of value.sources) {
    if (!candidates.has(source.assumed_entity_id)) {
      errors.push(`source_missing_entity:${source.source_id}`);
    }
  }

  for (const item of value.evidence) {
    if (!sources.has(item.source_id)) {
      errors.push(`evidence_missing_source:${item.evidence_id}:${item.source_id}`);
    }
    const claim = claims.get(item.claim_id);
    if (claim === undefined) {
      errors.push(`evidence_missing_claim:${item.evidence_id}:${item.claim_id}`);
    } else if (!claim.evidence_ids.includes(item.evidence_id)) {
      errors.push(`evidence_not_referenced_by_claim:${item.evidence_id}:${item.claim_id}`);
    }
    if (!candidates.has(item.entity_id)) {
      errors.push(`evidence_missing_entity:${item.evidence_id}:${item.entity_id}`);
    }
  }

  const explicitlyPresentedClaimIds = new Set<string>([
    ...value.presentation.key_fact_claim_ids,
    ...value.presentation.recent_signal_claim_ids,
    ...value.presentation.summary_items
      .filter((item) => item.kind === "claim")
      .map((item) => item.ref_id),
  ]);
  const presentedSourceIds = new Set(value.presentation.source_ids);
  const visibleProofSources = new Set<string>();
  const visibleFactualClaims: Claim[] = [];

  for (const claim of value.claims) {
    requireUniqueReferences(`claim.${claim.claim_id}.evidence_ids`, claim.evidence_ids);

    if (!candidates.has(claim.subject_id)) {
      errors.push(`claim_missing_subject:${claim.claim_id}:${claim.subject_id}`);
    }
    for (const evidenceId of claim.evidence_ids) {
      const item = evidence.get(evidenceId);
      if (item === undefined) {
        errors.push(`claim_missing_evidence:${claim.claim_id}:${evidenceId}`);
      } else if (item.claim_id !== claim.claim_id) {
        errors.push(`claim_evidence_backlink_mismatch:${claim.claim_id}:${evidenceId}`);
      }
    }

    if (claim.temporal_status === "current" && !hasDatedFactPeriod(claim)) {
      errors.push(`current_claim_without_dated_fact_period:${claim.claim_id}`);
    }

    if (claim.presentation_decision !== "display_fact") {
      continue;
    }
    if (!isFactualClaim(claim)) {
      errors.push(`displayed_claim_has_non_factual_state:${claim.claim_id}`);
      continue;
    }

    visibleFactualClaims.push(claim);
    if (value.identity.status !== "resolved") {
      errors.push(`displayed_claim_requires_resolved_identity:${claim.claim_id}`);
    }

    const displayedByContradiction = value.contradictions.some(
      (item) =>
        item.visible &&
        value.presentation.contradiction_ids.includes(item.contradiction_id) &&
        item.versions.some((version) => version.claim_id === claim.claim_id),
    );
    if (!explicitlyPresentedClaimIds.has(claim.claim_id) && !displayedByContradiction) {
      errors.push(`displayed_claim_not_presented:${claim.claim_id}`);
    }

    const qualifyingSources: Source[] = [];
    for (const evidenceId of claim.evidence_ids) {
      const item: Evidence | undefined = evidence.get(evidenceId);
      if (item === undefined || item.claim_id !== claim.claim_id) {
        continue;
      }
      const source = sources.get(item.source_id);
      if (
        source !== undefined &&
        source.accessibility_status === "accessible" &&
        item.relation === "supports" &&
        item.verification_method === "source_content" &&
        item.entity_id === claim.subject_id &&
        source.assumed_entity_id === claim.subject_id &&
        normalizeText(item.excerpt) === normalizeText(claim.statement)
      ) {
        qualifyingSources.push(source);
      }
    }

    if (qualifyingSources.length === 0) {
      errors.push(`displayed_claim_without_exact_source_content:${claim.claim_id}`);
      continue;
    }

    const visibleSources = qualifyingSources.filter((source) =>
      presentedSourceIds.has(source.source_id),
    );
    if (visibleSources.length === 0) {
      errors.push(`displayed_claim_source_not_presented:${claim.claim_id}`);
    }
    for (const source of visibleSources) {
      visibleProofSources.add(source.source_id);
    }
  }

  for (const inference of value.inferences) {
    requireUniqueReferences(
      `inference.${inference.inference_id}.based_on_claim_ids`,
      inference.based_on_claim_ids,
    );
    for (const claimId of inference.based_on_claim_ids) {
      if (!claims.has(claimId)) {
        errors.push(`inference_missing_claim:${inference.inference_id}:${claimId}`);
      }
    }
  }

  for (const item of value.contradictions) {
    const versionClaimIds = item.versions.map((version) => version.claim_id);
    requireUniqueReferences(
      `contradiction.${item.contradiction_id}.versions`,
      versionClaimIds,
    );

    for (const version of item.versions) {
      requireUniqueReferences(
        `contradiction.${item.contradiction_id}.${version.claim_id}.evidence_ids`,
        version.evidence_ids,
      );
      const claim = claims.get(version.claim_id);
      if (claim === undefined) {
        errors.push(
          `contradiction_missing_claim:${item.contradiction_id}:${version.claim_id}`,
        );
      }
      for (const evidenceId of version.evidence_ids) {
        const itemEvidence = evidence.get(evidenceId);
        if (itemEvidence === undefined) {
          errors.push(
            `contradiction_missing_evidence:${item.contradiction_id}:${evidenceId}`,
          );
        } else if (itemEvidence.claim_id !== version.claim_id) {
          errors.push(
            `contradiction_evidence_claim_mismatch:${item.contradiction_id}:${evidenceId}`,
          );
        }
      }
    }

    if (!item.visible) {
      continue;
    }
    if (!value.presentation.contradiction_ids.includes(item.contradiction_id)) {
      errors.push(`visible_contradiction_not_presented:${item.contradiction_id}`);
    }
    if (item.classification !== "contradiction") {
      errors.push(`visible_contradiction_wrong_classification:${item.contradiction_id}`);
    }
    if (item.versions.length < 2) {
      errors.push(`visible_contradiction_needs_two_versions:${item.contradiction_id}`);
    }
    if (new Set(versionClaimIds).size < 2) {
      errors.push(`visible_contradiction_needs_distinct_claims:${item.contradiction_id}`);
    }
    if (new Set(item.versions.map(versionValueKey)).size < 2) {
      errors.push(`visible_contradiction_needs_distinct_values:${item.contradiction_id}`);
    }
    for (const version of item.versions) {
      const claim = claims.get(version.claim_id);
      if (
        claim === undefined ||
        claim.claim_state !== "contested" ||
        claim.reconciliation_state !== "contradiction" ||
        claim.presentation_decision !== "display_fact"
      ) {
        errors.push(
          `visible_contradiction_requires_contested_claim:${item.contradiction_id}:${version.claim_id}`,
        );
      }
      for (const evidenceId of version.evidence_ids) {
        const itemEvidence = evidence.get(evidenceId);
        if (
          itemEvidence !== undefined &&
          (itemEvidence.claim_id !== version.claim_id ||
            claim === undefined ||
            !claim.evidence_ids.includes(evidenceId))
        ) {
          errors.push(
            `visible_contradiction_invalid_evidence:${item.contradiction_id}:${evidenceId}`,
          );
        }
      }
    }
  }

  for (const claimId of value.presentation.key_fact_claim_ids) {
    const claim = claims.get(claimId);
    if (
      claim === undefined ||
      !isFactualClaim(claim) ||
      claim.presentation_decision !== "display_fact"
    ) {
      errors.push(`presentation_invalid_key_fact:${claimId}`);
    }
  }
  for (const claimId of value.presentation.recent_signal_claim_ids) {
    const claim = claims.get(claimId);
    if (
      claim === undefined ||
      !isFactualClaim(claim) ||
      claim.presentation_decision !== "display_fact"
    ) {
      errors.push(`presentation_invalid_recent_signal:${claimId}`);
    }
  }
  for (const claimId of value.presentation.ambiguity_claim_ids) {
    const claim = claims.get(claimId);
    if (
      claim === undefined ||
      claim.claim_state !== "ambiguous" ||
      claim.presentation_decision !== "display_ambiguity"
    ) {
      errors.push(`presentation_invalid_ambiguity:${claimId}`);
    }
  }
  for (const item of value.presentation.summary_items) {
    const claim = item.kind === "claim" ? claims.get(item.ref_id) : undefined;
    if (
      claim === undefined ||
      !isFactualClaim(claim) ||
      claim.presentation_decision !== "display_fact"
    ) {
      errors.push(`summary_requires_displayed_fact:${item.kind}:${item.ref_id}`);
    }
  }
  for (const contradictionId of value.presentation.contradiction_ids) {
    const contradiction = contradictions.get(contradictionId);
    if (contradiction === undefined) {
      errors.push(`presentation_missing_contradiction:${contradictionId}`);
    } else if (!contradiction.visible) {
      errors.push(`presentation_hidden_contradiction:${contradictionId}`);
    }
  }
  for (const unknownId of value.presentation.unknown_ids) {
    if (!unknowns.has(unknownId)) {
      errors.push(`presentation_missing_unknown:${unknownId}`);
    }
  }
  for (const sourceId of value.presentation.source_ids) {
    if (!sources.has(sourceId)) {
      errors.push(`presentation_missing_source:${sourceId}`);
    }
  }

  for (const step of value.execution_steps) {
    if (step.retry_of !== null && !invocations.has(step.retry_of)) {
      errors.push(`execution_step_missing_retry_target:${step.step_id}:${step.retry_of}`);
    }
  }

  const supportedFacts = value.claims.filter(isFactualClaim);
  if (value.global_status === "complete_within_scope") {
    if (value.identity.status !== "resolved") {
      errors.push("complete_requires_resolved_identity");
    }
    if (visibleFactualClaims.length < 3) {
      errors.push("complete_requires_three_visible_facts");
    }
    if (visibleProofSources.size < 2) {
      errors.push("complete_requires_two_visible_sources");
    }
    if (value.contradictions.some((item) => item.visible)) {
      errors.push("complete_forbids_visible_contradiction");
    }
  }
  if (value.global_status === "partial" && value.identity.status !== "resolved") {
    errors.push("partial_requires_resolved_identity");
  }
  if (value.global_status === "needs_clarification") {
    if (value.identity.status === "resolved") {
      errors.push("needs_clarification_requires_unresolved_identity");
    }
    if (supportedFacts.length > 0) {
      errors.push("needs_clarification_forbids_supported_facts");
    }
  }
  if (
    value.global_status === "insufficient_evidence" &&
    supportedFacts.length > 0
  ) {
    errors.push("insufficient_evidence_forbids_supported_facts");
  }
  if (value.result_mode === "silence" && supportedFacts.length > 0) {
    errors.push("silence_forbids_supported_facts");
  }

  const uniqueErrors = addUniqueErrors(errors);
  return uniqueErrors.length === 0
    ? { ok: true }
    : { ok: false, errors: uniqueErrors };
}

export function validateRuntimeInvariants(
  dossier: ResearchDossier,
): RuntimeInvariantValidationResult {
  return validateRuntimeDossier(dossier);
}
