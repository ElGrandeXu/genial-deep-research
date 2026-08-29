/*
 * Fichier généré depuis docs/contracts/research-dossier.schema.json.
 * Ne pas modifier directement : le JSON Schema M2 reste canonique.
 */

/**
 * Stack-independent M2 product and truth contract for one research dossier.
 */
export type GenialResearchDossierContract = {
  [k: string]: unknown;
} & {
  schema_version: "1.0.0" | "1.1.0";
  dossier_id: Id;
  origin: "runtime" | "synthetic_contract_fixture";
  request: Request;
  identity: Identity;
  related_subjects?: Candidate[];
  relations?: Relation[];
  sources: Source[];
  evidence: Evidence[];
  claims: Claim[];
  inferences: Inference[];
  contradictions: Contradiction[];
  unknowns: Unknown[];
  execution_steps: ExecutionStep[];
  presentation: Presentation;
  receipt: Receipt;
  result_mode: "standard" | "silence" | "technical_error";
  global_status:
    "complete_within_scope" | "partial" | "needs_clarification" | "insufficient_evidence" | "technical_failure";
  error: null | TechnicalError;
  limitations: NonBlankText[];
};
export type Id = string;
export type HttpUrl = string;
export type Identity = {
  [k: string]: unknown;
} & {
  status: "resolved" | "ambiguous" | "insufficient_context" | "not_found_within_scope";
  resolution_level?: "confirmed" | "supported" | "lead" | null;
  selected_subject_id: null | Id;
  candidates: Candidate[];
  resolution_reason: NonBlankText;
  clarification_fields: ("city" | "country" | "industry" | "employer" | "official_site" | "discriminating_hint")[];
};
export type NonBlankText = string;
export type NullableHttpUrl = null | HttpUrl;
export type NullableDateTime = null | string;
export type NullableText = null | NonBlankText;
export type Claim = {
  [k: string]: unknown;
} & {
  claim_id: Id;
  subject_id: Id;
  statement: NonBlankText;
  predicate: NonBlankText;
  structured_value: StructuredValue;
  unit: NullableText;
  fact_period: FactPeriod;
  scope: Scope;
  temporal_status: "current" | "historical" | "unknown";
  evidence_ids: Id[];
  claim_state: "supported" | "contested" | "historical" | "ambiguous" | "rejected";
  reconciliation_state:
    "confirmation" | "explainable_difference" | "contradiction" | "indetermination" | "not_applicable";
  presentation_decision: "display_fact" | "display_ambiguity" | "reject";
  presentation_reason: NonBlankText;
};
export type StructuredValue = null | {
  value: string | number | boolean;
  value_type: "text" | "number" | "boolean";
};

export interface Request {
  request_id: Id;
  submitted_at: string;
  name: string;
  suggested_type: "person" | "company" | "unknown";
  context: {
    city?: string;
    country?: string;
    industry?: string;
    role?: string;
    employer?: string;
    official_site?: HttpUrl;
    discriminating_hint?: string;
  };
  total_character_count: number;
}
export interface Candidate {
  subject_id: Id;
  entity_type: "person" | "company";
  display_name: NonBlankText;
  discriminators: {
    city?: NonBlankText;
    country?: NonBlankText;
    industry?: NonBlankText;
    employer?: NonBlankText;
    official_site?: HttpUrl;
    legal_identifier?: NonBlankText;
  };
  match_rationale: NonBlankText;
}
export interface Relation {
  relation_id: Id;
  from_subject_id: Id;
  to_subject_id: Id;
  relation_type: "employed_by" | "leads" | "founded" | "created" | "member_of" | "affiliated_with";
  /**
   * @minItems 1
   */
  evidence_ids: [Id, ...Id[]];
}
export interface Source {
  source_id: Id;
  provider_url: HttpUrl;
  resolved_url: NullableHttpUrl;
  canonical_url: NullableHttpUrl;
  title: NonBlankText;
  publisher: NonBlankText;
  source_type:
    | "institutional_registry"
    | "official_publication"
    | "independent_press"
    | "specialized_source"
    | "aggregator"
    | "search_result";
  published_at: NullableDateTime;
  accessed_at: string;
  collection_method: "institutional_api" | "provider_search" | "direct_access" | "manual_verification";
  collection_compliance: "permitted" | "not_verified";
  accessibility_status: "accessible" | "redirect_only" | "inaccessible" | "paywalled" | "unknown";
  assumed_entity_id: Id;
  assumed_scope: Scope;
}
export interface Scope {
  type: "person" | "company" | "group" | "subsidiary" | "brand" | "country" | "establishment" | "undetermined";
  label: NullableText;
}
export interface Evidence {
  evidence_id: Id;
  source_id: Id;
  claim_id: Id;
  excerpt: string;
  locator: NonBlankText;
  entity_id: Id;
  fact_period: FactPeriod;
  scope: Scope;
  relation: "supports" | "contradicts" | "context_only" | "entity_mismatch" | "insufficient";
  verification_method:
    "source_content" | "institutional_record" | "manual_verification" | "provider_annotation" | "search_snippet";
  verified_at: string;
}
export interface FactPeriod {
  status: "stated" | "derived" | "unknown";
  start: NullableDateTime;
  end: NullableDateTime;
  as_of: NullableDateTime;
  label: NullableText;
}
export interface Inference {
  inference_id: Id;
  label: "inference";
  statement: NonBlankText;
  /**
   * @minItems 1
   */
  based_on_claim_ids: [Id, ...Id[]];
  presentation_style: "derived_not_directly_sourced";
}
export interface Contradiction {
  contradiction_id: Id;
  predicate: NonBlankText;
  period: FactPeriod;
  scope: Scope;
  metric_definition: NonBlankText;
  published_or_estimated_checked: boolean;
  classification: "confirmation" | "explainable_difference" | "contradiction" | "indetermination";
  /**
   * @minItems 2
   */
  versions: [ContradictionVersion, ContradictionVersion, ...ContradictionVersion[]];
  explanation: NonBlankText;
  visible: boolean;
}
export interface ContradictionVersion {
  claim_id: Id;
  /**
   * @minItems 1
   */
  evidence_ids: [Id, ...Id[]];
  normalized_value: string | number;
  unit: NullableText;
  currency: NullableText;
}
export interface Unknown {
  unknown_id: Id;
  category:
    "no_reliable_source" | "not_verified" | "out_of_scope" | "identity_ambiguity" | "source_inaccessible" | "other";
  description: NonBlankText;
  explored_scope: NonBlankText[];
  source_categories: (
    | "institutional_registry"
    | "official_publication"
    | "independent_press"
    | "specialized_source"
    | "aggregator"
    | "search_result"
  )[];
  stop_reason: NonBlankText;
  retry_context: NonBlankText[];
}
export interface ExecutionStep {
  step_id: Id;
  invocation_id: Id;
  operation:
    | "interpretation"
    | "candidate_search"
    | "identity_resolution"
    | "collection"
    | "extraction"
    | "reconciliation"
    | "verification"
    | "composition";
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  attempt: number;
  retry_of: null | Id;
  started_at: NullableDateTime;
  ended_at: NullableDateTime;
  duration_ms: null | number;
  error_code: NullableText;
}
export interface Presentation {
  summary_items: PresentationRef[];
  key_fact_claim_ids: Id[];
  recent_signal_claim_ids: Id[];
  ambiguity_claim_ids: Id[];
  contradiction_ids: Id[];
  unknown_ids: Id[];
  source_ids: Id[];
}
export interface PresentationRef {
  kind: "claim" | "inference";
  ref_id: Id;
}
export interface Receipt {
  run_id: Id;
  started_at: string;
  completed_at: NullableDateTime;
  total_duration_ms: number;
  latency_ms: number;
  provider_calls: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  cost: {
    amount_usd: number;
    status: "exact" | "estimated" | "unknown";
    assumptions: NonBlankText[];
  };
  search_scope: {
    categories: NonBlankText[];
    stop_reason: NonBlankText;
  };
  resumed_from_run_id: null | Id;
}
export interface TechnicalError {
  kind:
    "timeout" | "provider_error" | "quota_exceeded" | "invalid_response" | "source_access_failure" | "internal_failure";
  code: NonBlankText;
  message: NonBlankText;
  retryable: boolean;
}
