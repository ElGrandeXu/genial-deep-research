"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  canonicalConflictText,
  conflictLocatorDocumentIdentity,
  conflictMetricObservation,
  conflictMetricPredicate,
  conflictPeriodKey,
  conflictPeriodSupportsKey,
  conflictScopeKey,
  conflictScopeMatchesExcerpt,
  conflictSourcePageKey,
  conflictUnitCurrencyKey,
  conflictValueKey,
  conflictVersionUnitMatchesExcerpt,
} from "../domain/conflict-comparison";
import { publisherDomainForUrl } from "../domain/publisher-domain";
import type { ResearchDossier } from "../domain/research-dossier";

type EntityType = "auto" | "person" | "company";
type UiStatus = "idle" | "running" | "completed" | "failed" | "cancelled";
type ProgressState =
  | "accepted"
  | "researching_and_resolving"
  | "source_verifying"
  | "building"
  | "validating"
  | "completed"
  | "failed";

type DossierClaim = ResearchDossier["claims"][number];
type DossierSource = ResearchDossier["sources"][number];

interface ClarificationSelection {
  readonly name: string;
  readonly entityType: "person" | "company";
  readonly sourceUrl: string;
}

interface ProgressEventBase {
  readonly state: ProgressState;
  readonly executionId: string;
  readonly elapsedMs: number;
}

interface CompletedEvent extends ProgressEventBase {
  readonly state: "completed";
  readonly dossier: ResearchDossier;
  readonly receipt: Readonly<Record<string, unknown>>;
}

interface FailedEvent extends ProgressEventBase {
  readonly state: "failed";
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
  readonly receipt: Readonly<Record<string, unknown>>;
}

type ResearchEvent = ProgressEventBase | CompletedEvent | FailedEvent;

const PROGRESS_STATES: readonly ProgressState[] = [
  "accepted",
  "researching_and_resolving",
  "source_verifying",
  "building",
  "validating",
  "completed",
  "failed",
];

const STEP_LABELS: Readonly<Record<ProgressState, string>> = {
  accepted: "Demande admise",
  researching_and_resolving: "Recherche Web et résolution",
  source_verifying: "Lecture et vérification des sources",
  building: "Construction du dossier",
  validating: "Contrôle final des preuves",
  completed: "Dossier prêt",
  failed: "Recherche interrompue",
};

const CLARIFICATION_LABELS: Readonly<Record<string, string>> = {
  city: "ville",
  country: "pays",
  industry: "secteur",
  employer: "employeur",
  official_site: "site officiel",
  discriminating_hint: "autre indice distinctif",
};

const CATEGORY_ORDER = [
  "Activité",
  "Rôles et responsabilités",
  "Présence géographique",
  "Chiffres clés",
  "Événements et signaux récents",
  "Autres faits",
] as const;

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isFactPeriod(value: unknown): boolean {
  return (
    isRecord(value) &&
    ["stated", "derived", "unknown"].includes(String(value.status)) &&
    isNullableString(value.start) &&
    isNullableString(value.end) &&
    isNullableString(value.as_of) &&
    isNullableString(value.label)
  );
}

function isContradictionClassification(value: unknown): boolean {
  return value === "confirmation" ||
    value === "explainable_difference" ||
    value === "contradiction" ||
    value === "indetermination";
}

function sourceAttribution(source: DossierSource): string {
  const domain = sourceDomain(source);
  const publisher = source.publisher.trim();
  const normalizedPublisher = publisher.toLocaleLowerCase("fr").replace(/^www\./, "");
  return normalizedPublisher === domain.toLocaleLowerCase("fr")
    ? domain
    : `${publisher} · ${domain}`;
}

function isDossier(value: unknown): value is ResearchDossier {
  if (!isRecord(value)) return false;
  const request = value.request;
  const identity = value.identity;
  const receipt = value.receipt;
  const presentation = value.presentation;
  if (!isRecord(request) || typeof request.name !== "string") return false;
  if (
    !isRecord(identity) ||
    !["resolved", "ambiguous", "insufficient_context", "not_found_within_scope"].includes(
      String(identity.status),
    ) ||
    !isNullableString(identity.selected_subject_id) ||
    !Array.isArray(identity.candidates) ||
    !isStringArray(identity.clarification_fields) ||
    !identity.candidates.every(
      (candidate) =>
        isRecord(candidate) &&
        typeof candidate.subject_id === "string" &&
        typeof candidate.display_name === "string" &&
        isRecord(candidate.discriminators) &&
        Object.values(candidate.discriminators).every((item) => typeof item === "string"),
    )
  ) {
    return false;
  }
  if (
    !isRecord(presentation) ||
    !Array.isArray(presentation.summary_items) ||
    !presentation.summary_items.every(
      (item) =>
        isRecord(item) &&
        (item.kind === "claim" || item.kind === "inference") &&
        typeof item.ref_id === "string",
    ) ||
    !isStringArray(presentation.key_fact_claim_ids) ||
    !isStringArray(presentation.recent_signal_claim_ids) ||
    !isStringArray(presentation.ambiguity_claim_ids) ||
    !isStringArray(presentation.contradiction_ids) ||
    !isStringArray(presentation.unknown_ids) ||
    !isStringArray(presentation.source_ids)
  ) {
    return false;
  }
  if (
    !isRecord(receipt) ||
    typeof receipt.total_duration_ms !== "number" ||
    typeof receipt.provider_calls !== "number" ||
    !isRecord(receipt.cost) ||
    typeof receipt.cost.status !== "string" ||
    typeof receipt.cost.amount_usd !== "number" ||
    !isRecord(receipt.search_scope) ||
    !isStringArray(receipt.search_scope.categories) ||
    typeof receipt.search_scope.stop_reason !== "string"
  ) {
    return false;
  }
  if (
    !Array.isArray(value.sources) ||
    !value.sources.every(
      (source) =>
        isRecord(source) &&
        typeof source.source_id === "string" &&
        typeof source.provider_url === "string" &&
        isNullableString(source.resolved_url) &&
        isNullableString(source.canonical_url) &&
        typeof source.title === "string" &&
        typeof source.publisher === "string" &&
        isNullableString(source.published_at) &&
        typeof source.accessed_at === "string" &&
        typeof source.assumed_entity_id === "string",
    )
  ) {
    return false;
  }
  if (
    !Array.isArray(value.evidence) ||
    !value.evidence.every(
      (evidence) =>
        isRecord(evidence) &&
        typeof evidence.evidence_id === "string" &&
        typeof evidence.source_id === "string" &&
        typeof evidence.claim_id === "string" &&
        typeof evidence.entity_id === "string" &&
        typeof evidence.excerpt === "string" &&
        typeof evidence.locator === "string" &&
        typeof evidence.relation === "string" &&
        isRecord(evidence.scope) &&
        typeof evidence.scope.type === "string" &&
        isNullableString(evidence.scope.label) &&
        isFactPeriod(evidence.fact_period),
    )
  ) {
    return false;
  }
  if (
    !Array.isArray(value.claims) ||
    !value.claims.every(
      (claim) =>
        isRecord(claim) &&
        typeof claim.claim_id === "string" &&
        typeof claim.subject_id === "string" &&
        typeof claim.statement === "string" &&
        typeof claim.predicate === "string" &&
        typeof claim.temporal_status === "string" &&
        typeof claim.presentation_decision === "string" &&
        isStringArray(claim.evidence_ids) &&
        isRecord(claim.scope) &&
        typeof claim.scope.type === "string" &&
        isNullableString(claim.scope.label) &&
        isFactPeriod(claim.fact_period),
    )
  ) {
    return false;
  }
  if (
    !Array.isArray(value.contradictions) ||
    !value.contradictions.every(
      (contradiction) =>
        isRecord(contradiction) &&
        typeof contradiction.contradiction_id === "string" &&
        typeof contradiction.predicate === "string" &&
        typeof contradiction.metric_definition === "string" &&
        typeof contradiction.explanation === "string" &&
        typeof contradiction.published_or_estimated_checked === "boolean" &&
        isContradictionClassification(contradiction.classification) &&
        typeof contradiction.visible === "boolean" &&
        isFactPeriod(contradiction.period) &&
        isRecord(contradiction.scope) &&
        typeof contradiction.scope.type === "string" &&
        isNullableString(contradiction.scope.label) &&
        Array.isArray(contradiction.versions) &&
        contradiction.versions.every(
          (version) =>
            isRecord(version) &&
            typeof version.claim_id === "string" &&
            isStringArray(version.evidence_ids) &&
            (typeof version.normalized_value === "string" ||
              typeof version.normalized_value === "number") &&
            isNullableString(version.unit) &&
            isNullableString(version.currency),
        ),
    )
  ) {
    return false;
  }
  if (
    !Array.isArray(value.execution_steps) ||
    !value.execution_steps.every(
      (step) =>
        isRecord(step) &&
        typeof step.step_id === "string" &&
        typeof step.invocation_id === "string" &&
        typeof step.operation === "string" &&
        typeof step.status === "string" &&
        typeof step.attempt === "number" &&
        isNullableString(step.retry_of) &&
        isNullableString(step.started_at) &&
        isNullableString(step.ended_at) &&
        (step.duration_ms === null || typeof step.duration_ms === "number") &&
        isNullableString(step.error_code),
    )
  ) {
    return false;
  }
  if (
    !Array.isArray(value.unknowns) ||
    !value.unknowns.every(
      (unknown) =>
        isRecord(unknown) &&
        typeof unknown.unknown_id === "string" &&
        typeof unknown.description === "string" &&
        typeof unknown.stop_reason === "string" &&
        isStringArray(unknown.retry_context),
    ) ||
    !isStringArray(value.limitations)
  ) {
    return false;
  }
  return (
    typeof value.schema_version === "string" &&
    [
      "complete_within_scope",
      "partial",
      "needs_clarification",
      "insufficient_evidence",
      "technical_failure",
    ].includes(String(value.global_status)) &&
    ["standard", "silence", "technical_error"].includes(String(value.result_mode)) &&
    (value.error === null || (isRecord(value.error) && typeof value.error.message === "string"))
  );
}

function parseProgressEvent(value: unknown): ResearchEvent {
  if (!isRecord(value)) throw new Error("Événement de progression invalide.");

  const state = value.state;
  if (typeof state !== "string" || !PROGRESS_STATES.includes(state as ProgressState)) {
    throw new Error("Étape de progression inconnue.");
  }
  if (
    typeof value.executionId !== "string" ||
    value.executionId.length === 0 ||
    typeof value.elapsedMs !== "number" ||
    !Number.isFinite(value.elapsedMs) ||
    value.elapsedMs < 0
  ) {
    throw new Error("Événement de progression incomplet.");
  }

  if (state === "completed") {
    if (!isDossier(value.dossier) || !isRecord(value.receipt)) {
      throw new Error("Le dossier final est incomplet.");
    }
    return value as unknown as CompletedEvent;
  }

  if (state === "failed") {
    if (
      !isRecord(value.error) ||
      typeof value.error.code !== "string" ||
      typeof value.error.message !== "string" ||
      typeof value.error.retryable !== "boolean" ||
      !isRecord(value.receipt)
    ) {
      throw new Error("L’échec transmis par le serveur est incomplet.");
    }
    return value as unknown as FailedEvent;
  }

  return value as unknown as ProgressEventBase;
}

export function decodeSseBlock(block: string): ResearchEvent | undefined {
  const dataLines: string[] = [];
  let eventName: string | undefined;

  for (const rawLine of block.split(/\r?\n/u)) {
    if (rawLine.length === 0 || rawLine.startsWith(":")) continue;
    const colon = rawLine.indexOf(":");
    const field = colon === -1 ? rawLine : rawLine.slice(0, colon);
    let fieldValue = colon === -1 ? "" : rawLine.slice(colon + 1);
    if (fieldValue.startsWith(" ")) fieldValue = fieldValue.slice(1);

    if (field === "data") dataLines.push(fieldValue);
    else if (field === "event") eventName = fieldValue;
    else if (field !== "id" && field !== "retry") {
      throw new Error("Le flux contient un champ de progression invalide.");
    }
  }

  if (dataLines.length === 0) {
    if (eventName === undefined) return undefined;
    throw new Error("Le flux contient un événement sans données.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(dataLines.join("\n")) as unknown;
  } catch {
    throw new Error("Le flux contient un événement illisible.");
  }

  const event = parseProgressEvent(parsed);
  if (eventName !== undefined && eventName !== event.state) {
    throw new Error("Le nom et le contenu d’un événement ne correspondent pas.");
  }
  return event;
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${String(seconds % 60).padStart(2, "0")} s`;
}

function formatDate(value: string | null): string {
  if (value === null) return "inconnue";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "inconnue" : dateFormatter.format(date);
}

function formatCost(value: number | null): string {
  return value === null ? "non déterminé" : `${value.toFixed(5)} USD`;
}

function readFiniteNumber(record: Readonly<Record<string, unknown>>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sourceUrl(source: DossierSource): string | undefined {
  const candidate = source.canonical_url ?? source.resolved_url ?? source.provider_url;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function sourceDomain(source: DossierSource): string {
  const url = sourceUrl(source);
  if (url === undefined) return "domaine inconnu";
  return new URL(url).hostname.replace(/^www\./u, "");
}

function sourcePublisherDomain(source: DossierSource): string {
  const url = sourceUrl(source);
  return url === undefined ? "domaine inconnu" : publisherDomainForUrl(url) ?? "domaine inconnu";
}

function formatPeriod(period: DossierClaim["fact_period"]): string {
  if (period.label !== null) return period.label;
  if (period.as_of !== null) return `au ${formatDate(period.as_of)}`;
  if (period.start !== null && period.end !== null) {
    return `du ${formatDate(period.start)} au ${formatDate(period.end)}`;
  }
  if (period.start !== null) return `depuis le ${formatDate(period.start)}`;
  if (period.end !== null) return `jusqu’au ${formatDate(period.end)}`;
  return "période inconnue";
}

const SCOPE_TYPE_LABELS: Readonly<Record<DossierClaim["scope"]["type"], string>> = {
  person: "personne",
  company: "société",
  group: "groupe",
  subsidiary: "filiale",
  brand: "marque",
  country: "pays",
  establishment: "établissement",
  undetermined: "indéterminée",
};

function formatScope(scope: DossierClaim["scope"]): string {
  const type = SCOPE_TYPE_LABELS[scope.type];
  return scope.label === null ? type : `${scope.label} — ${type}`;
}

function formatContradictionValue(
  version: ResearchDossier["contradictions"][number]["versions"][number],
): string {
  const unit = version.unit?.trim() ?? "";
  const currency = version.currency?.trim() ?? "";
  if (typeof version.normalized_value === "number") {
    const explicitScale = /^(?:k|thousand(?:s)?|millier(?:s)?)$/iu.test(unit)
      ? { divisor: 1_000, label: "millier" }
      : /^million(?:s)?$/iu.test(unit)
        ? { divisor: 1_000_000, label: "million" }
        : /^(?:milliard(?:s)?|billion(?:s)?|bn)$/iu.test(unit)
          ? { divisor: 1_000_000_000, label: "milliard" }
          : null;
    const automaticScale = unit.length === 0 && currency.length > 0
      ? Math.abs(version.normalized_value) >= 1_000_000_000
        ? { divisor: 1_000_000_000, label: "milliard" }
        : Math.abs(version.normalized_value) >= 1_000_000
          ? { divisor: 1_000_000, label: "million" }
          : null
      : null;
    const scale = explicitScale ?? automaticScale;
    if (scale !== null) {
      const scaled = version.normalized_value / scale.divisor;
      const numeric = new Intl.NumberFormat("fr-FR", { maximumSignificantDigits: 21 }).format(scaled);
      const plural = Math.abs(scaled) === 1 ? "" : "s";
      return `${numeric} ${scale.label}${plural}${currency ? ` ${currency}` : ""}`;
    }
  }
  const numeric = typeof version.normalized_value === "number"
    ? new Intl.NumberFormat("fr-FR", { maximumSignificantDigits: 21 }).format(
        version.normalized_value,
      )
    : version.normalized_value;
  return [numeric, unit, currency].filter((item) => item.length > 0).join(" ");
}

function requiresVisibleScope(claim: DossierClaim): boolean {
  const prefix = claim.predicate.split(".", 1)[0];
  return prefix === "metric" || prefix === "role" || prefix === "event" || prefix === "recent_signal";
}

function formatLocator(
  value: string,
  verificationMethod?: ResearchDossier["evidence"][number]["verification_method"],
): string {
  if (verificationMethod === "provider_annotation") return "Citation fournisseur reliée à cette URL";
  if (verificationMethod === "search_snippet") return "Extrait du résultat Web Search";
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) return "Extrait retrouvé dans la page";
    const occurrence = parsed.occurrenceIndex;
    const occurrenceLabel = typeof occurrence === "number" && Number.isSafeInteger(occurrence)
      ? `occurrence ${occurrence + 1}`
      : "occurrence vérifiée";
    if (parsed.matchMode === "mechanical_equivalence") {
      return `Équivalence mécanique · ${occurrenceLabel}`;
    }
    if (parsed.matchMode === "exact") {
      return `Correspondance exacte · ${occurrenceLabel}`;
    }
    return `Extrait source vérifié · ${occurrenceLabel}`;
  } catch {
    return "Extrait retrouvé dans la page";
  }
}

function freshnessLabel(claim: DossierClaim): string {
  if (claim.temporal_status === "historical") {
    return "Fait daté · validité actuelle non établie";
  }
  if (claim.temporal_status === "current") {
    return "État explicitement observé à la date indiquée";
  }
  return "Validité actuelle non établie";
}

export type ClaimConfidence = {
  readonly level: "confirmed" | "supported" | "lead";
  readonly label: "Confirmé" | "Étayé" | "Piste à vérifier";
  readonly score: number;
  readonly explanation: string;
};

export function confidenceForClaim(
  dossier: ResearchDossier,
  claim: DossierClaim,
): ClaimConfidence {
  const evidenceById = new Map(dossier.evidence.map((item) => [item.evidence_id, item]));
  const sourceById = new Map(dossier.sources.map((item) => [item.source_id, item]));
  const records = claim.evidence_ids.flatMap((evidenceId) => {
    const evidence = evidenceById.get(evidenceId);
    if (evidence === undefined) return [];
    const source = sourceById.get(evidence.source_id);
    return source === undefined ? [] : [{ evidence, source }];
  });
  if (claim.claim_state === "contested" || claim.reconciliation_state === "contradiction") {
    return {
      level: "lead",
      label: "Piste à vérifier",
      score: 50,
      explanation: "Une contradiction ouverte limite la confiance.",
    };
  }
  const direct = records.filter(({ evidence, source }) =>
    evidence.verification_method === "source_content" &&
    source.accessibility_status === "accessible"
  );
  const directDomains = new Set(direct.map(({ source }) => sourcePublisherDomain(source)));
  const authoritative = direct.some(({ source }) =>
    source.source_type === "official_publication" ||
    source.source_type === "institutional_registry"
  );
  if (direct.length > 0 && (authoritative || directDomains.size >= 2)) {
    return {
      level: "confirmed",
      label: "Confirmé",
      score: authoritative && directDomains.size >= 2 ? 97 : 93,
      explanation: "Extrait retrouvé dans une page directement consultée et source forte.",
    };
  }
  if (
    direct.length > 0 ||
    records.some(({ evidence }) => evidence.verification_method === "provider_annotation")
  ) {
    return {
      level: "supported",
      label: "Étayé",
      score: direct.length > 0 ? 84 : 74,
      explanation: direct.length > 0
        ? "Extrait retrouvé dans une page consultée, avec corroboration limitée."
        : "Citation Web Search attribuable ; vérification directe incomplète.",
    };
  }
  return {
    level: "lead",
    label: "Piste à vérifier",
    score: 55,
    explanation: "Résultat Web Search attribuable, à confirmer avant utilisation comme fait établi.",
  };
}

function evidenceVerificationLabel(
  method: ResearchDossier["evidence"][number]["verification_method"],
): string {
  if (method === "source_content") return "Vérifié dans la page";
  if (method === "provider_annotation") return "Citation Web Search attribuée";
  if (method === "search_snippet") return "Extrait de recherche à vérifier";
  return "Vérification complémentaire";
}

const CATEGORY_BY_PREFIX: Readonly<Record<string, (typeof CATEGORY_ORDER)[number]>> = {
  activity: "Activité",
  role: "Rôles et responsabilités",
  geography: "Présence géographique",
  metric: "Chiffres clés",
  event: "Événements et signaux récents",
  recent_signal: "Événements et signaux récents",
  other: "Autres faits",
};

export function categoryForClaim(claim: DossierClaim): (typeof CATEGORY_ORDER)[number] {
  const prefix = claim.predicate.split(".", 1)[0]?.toLocaleLowerCase("fr-FR") ?? "";
  return CATEGORY_BY_PREFIX[prefix] ?? "Autres faits";
}

function normalizedProofText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function shouldDisplayEvidenceExcerpt(statement: string, excerpt: string): boolean {
  return normalizedProofText(statement) !== normalizedProofText(excerpt);
}

export function dossierDisplayIssue(dossier: ResearchDossier): string | undefined {
  const evidenceById = new Map(dossier.evidence.map((item) => [item.evidence_id, item]));
  const sourceById = new Map(dossier.sources.map((item) => [item.source_id, item]));
  const claimById = new Map(dossier.claims.map((item) => [item.claim_id, item]));
  const displayFacts = dossier.claims.filter(
    (claim) => claim.presentation_decision === "display_fact",
  );
  const businessFacts = displayFacts.filter((claim) => !claim.predicate.startsWith("identity."));
  const selectedCandidate = dossier.identity.candidates.find(
    ({ subject_id }) => subject_id === dossier.identity.selected_subject_id,
  );

  if (dossier.identity.status !== "resolved" && displayFacts.length > 0) {
    return "Des faits ont été attribués alors que l’identité n’est pas résolue.";
  }
  if (dossier.result_mode !== "standard" && displayFacts.length > 0) {
    return "Des faits sont présents dans un résultat qui ne permet pas de les afficher.";
  }
  if (dossier.global_status === "complete_within_scope" && displayFacts.length === 0) {
    return "Le dossier est déclaré complet sans fait vérifiable.";
  }
  if (
    dossier.identity.status === "resolved" &&
    (dossier.identity.candidates.length !== 1 ||
      dossier.identity.selected_subject_id !== dossier.identity.candidates[0]?.subject_id)
  ) {
    return "L’identité résolue ne désigne pas exactement un candidat vérifié.";
  }
  if (
    dossier.global_status === "complete_within_scope" &&
    (businessFacts.length < 3 || businessFacts.length > 6)
  ) {
    return "Le dossier complet ne contient pas entre trois et six faits métier.";
  }
  if (
    dossier.global_status === "complete_within_scope" &&
    new Set(businessFacts.map((claim) => claim.predicate.split(".", 1)[0])).size < 2
  ) {
    return "Le dossier complet ne couvre pas deux catégories métier.";
  }
  if (dossier.presentation.summary_items.length > 3) {
    return "La lecture rapide dépasse trois références.";
  }
  for (const item of dossier.presentation.summary_items) {
    const claim = item.kind === "claim" ? claimById.get(item.ref_id) : undefined;
    if (
      claim === undefined ||
      claim.presentation_decision !== "display_fact" ||
      claim.predicate.startsWith("identity.")
    ) {
      return "La lecture rapide pointe vers un fait métier non vérifiable.";
    }
    if (
      claim.claim_state === "contested" ||
      claim.reconciliation_state === "indetermination"
    ) {
      return "Une version non réconciliée ne peut pas devenir un résumé implicite.";
    }
  }
  for (const claimId of [
    ...dossier.presentation.key_fact_claim_ids,
    ...dossier.presentation.recent_signal_claim_ids,
  ]) {
    const claim = claimById.get(claimId);
    if (
      claim === undefined ||
      claim.presentation_decision !== "display_fact" ||
      claim.claim_state === "contested" ||
      claim.reconciliation_state === "indetermination"
    ) {
      return "Une version non réconciliée est annoncée comme fait clé.";
    }
  }

  const evidenceIds = new Set<string>();
  for (const claim of dossier.claims) {
    if (
      claim.presentation_decision !== "display_fact" &&
      claim.presentation_decision !== "display_ambiguity"
    ) {
      continue;
    }
    if (claim.presentation_decision === "display_fact" && claim.evidence_ids.length === 0) {
      return "Une affirmation affichable ne possède aucune preuve liée.";
    }
    let hasSupportingEvidence = false;
    let hasExactSupportingEvidence = false;
    for (const evidenceId of claim.evidence_ids) {
      const evidence = evidenceById.get(evidenceId);
      if (
        evidence === undefined ||
        evidence.claim_id !== claim.claim_id ||
        evidence.entity_id !== claim.subject_id ||
        !["source_content", "provider_annotation", "search_snippet"].includes(
          evidence.verification_method,
        )
      ) {
        return "Une affirmation pointe vers une preuve source incohérente.";
      }
      if (evidence.relation === "supports") {
        hasSupportingEvidence = true;
        if (!shouldDisplayEvidenceExcerpt(claim.statement, evidence.excerpt)) {
          hasExactSupportingEvidence = true;
        }
      }
      evidenceIds.add(evidenceId);
    }
    if (claim.presentation_decision === "display_fact" && !hasSupportingEvidence) {
      return "Une affirmation affichable ne possède aucune preuve qui l’étaye.";
    }
    if (claim.presentation_decision === "display_fact" && !hasExactSupportingEvidence) {
      return "Une affirmation n’est identique à aucune citation attribuable.";
    }
    if (
      claim.presentation_decision === "display_fact" &&
      claim.predicate.startsWith("metric.") &&
      (claim.fact_period.status === "unknown" ||
        claim.scope.type === "undetermined" ||
        claim.scope.label === null)
    ) {
      return "Une métrique affichée ne possède pas de période et de portée exploitables.";
    }
  }

  for (const contradiction of dossier.contradictions.filter((item) => item.visible)) {
    if (
      contradiction.classification !== "contradiction" ||
      !contradiction.published_or_estimated_checked ||
      !dossier.presentation.contradiction_ids.includes(contradiction.contradiction_id) ||
      contradiction.versions.length < 2 ||
      new Set(contradiction.versions.map(({ claim_id }) => claim_id)).size < 2 ||
      contradiction.versions.some(({ normalized_value }) =>
        typeof normalized_value !== "number" || !Number.isFinite(normalized_value)) ||
      new Set(
        contradiction.versions.map(({ normalized_value }) => conflictValueKey(normalized_value)),
      ).size < 2 ||
      new Set(
        contradiction.versions.map(({ unit, currency }) =>
          conflictUnitCurrencyKey(unit, currency)
        ),
      ).size !== 1
    ) {
      return "Un conflit affiché ne conserve pas deux versions comparables et contrôlées.";
    }
    const conflictSubjects = new Set<string>();
    const conflictSourceIds = new Set<string>();
    const conflictPages = new Set<string>();
    const conflictDocumentDigests = new Set<string>();
    const versionDocumentIdentities: Array<Set<string>> = [];
    const conflictMetricSignatures = new Set<string>();
    const conflictPeriods = new Set<string>();
    const conflictValueNatures = new Set<string>();
    for (const version of contradiction.versions) {
      const claim = claimById.get(version.claim_id);
      const versionQualifyingPages = new Set<string>();
      const versionQualifyingDocuments = new Set<string>();
      if (
        claim === undefined ||
        claim.claim_state !== "contested" ||
        claim.reconciliation_state !== "contradiction" ||
        canonicalConflictText(claim.predicate) !== canonicalConflictText(contradiction.predicate) ||
        canonicalConflictText(claim.unit) !== canonicalConflictText(version.unit) ||
        claim.structured_value === null ||
        conflictValueKey(claim.structured_value.value) !== conflictValueKey(version.normalized_value) ||
        conflictPeriodKey(claim.fact_period) !== conflictPeriodKey(contradiction.period) ||
        conflictScopeKey(claim.scope) !== conflictScopeKey(contradiction.scope) ||
        version.evidence_ids.length === 0
      ) {
        return "Une version contradictoire ne possède pas de preuve exploitable.";
      }
      const metricSignature =
        claim.scope.label !== null &&
        selectedCandidate !== undefined &&
        canonicalConflictText(claim.scope.label) === canonicalConflictText(selectedCandidate.display_name)
          ? conflictMetricObservation(claim.statement, selectedCandidate.display_name)
          : null;
      const periodEvidence = metricSignature?.periodKey ?? null;
      const valueNature = metricSignature?.valueNature ?? "unknown";
      if (
        metricSignature === null ||
        conflictMetricPredicate(claim.predicate) !== metricSignature.metric ||
        canonicalConflictText(version.currency) !== canonicalConflictText(metricSignature.currency) ||
        !conflictVersionUnitMatchesExcerpt(version.unit, metricSignature) ||
        !conflictScopeMatchesExcerpt(claim.scope, metricSignature) ||
        !conflictScopeMatchesExcerpt(contradiction.scope, metricSignature)
      ) {
        return "La métrique, l’unité ou la devise d’un conflit n’est pas établie par son extrait.";
      }
      if (
        periodEvidence === null ||
        !conflictPeriodSupportsKey(contradiction.period, periodEvidence)
      ) {
        return "La période d’un conflit n’est pas établie par son extrait.";
      }
      if (valueNature === "unknown") {
        return "La nature publiée ou estimée d’un conflit n’est pas établie par son extrait.";
      }
      if (
        typeof version.normalized_value !== "number" ||
        !Number.isFinite(version.normalized_value) ||
        metricSignature === null ||
        metricSignature.value !== version.normalized_value
      ) {
        return "La valeur normalisée d’un conflit ne correspond pas à son extrait.";
      }
      conflictMetricSignatures.add(JSON.stringify([
        metricSignature.metric,
        metricSignature.definition,
        metricSignature.semanticUnit,
        metricSignature.currency,
        metricSignature.scopeKind,
      ]));
      conflictPeriods.add(periodEvidence);
      conflictValueNatures.add(valueNature);
      conflictSubjects.add(claim.subject_id);
      for (const evidenceId of version.evidence_ids) {
        const evidence = evidenceById.get(evidenceId);
        if (
          evidence === undefined ||
          evidence.claim_id !== claim.claim_id ||
          evidence.entity_id !== claim.subject_id
        ) {
          return "Une version contradictoire pointe vers une preuve mal attribuée.";
        }
        if (
          conflictPeriodKey(evidence.fact_period) !== conflictPeriodKey(contradiction.period) ||
          conflictScopeKey(evidence.scope) !== conflictScopeKey(contradiction.scope)
        ) {
          return "Une version contradictoire mélange des périodes ou des périmètres différents.";
        }
        const source = sourceById.get(evidence.source_id);
        const page = source === undefined ? undefined : sourceUrl(source);
        if (source === undefined || page === undefined) {
          return "Une version contradictoire ne mène pas vers une page source ouvrable.";
        }
        if (conflictScopeKey(source.assumed_scope) !== conflictScopeKey(contradiction.scope)) {
          return "Une source contradictoire ne porte pas sur le périmètre affiché.";
        }
        if (
          source.accessibility_status !== "accessible" ||
          evidence.relation !== "supports" ||
          evidence.verification_method !== "source_content" ||
          evidence.entity_id !== claim.subject_id ||
          source.assumed_entity_id !== claim.subject_id ||
          normalizedProofText(evidence.excerpt) !== normalizedProofText(claim.statement)
        ) {
          return "Une version contradictoire ne possède pas de page source qualifiante.";
        }
        const pageKey = conflictSourcePageKey(page);
        const locatorIdentity = conflictLocatorDocumentIdentity(evidence.locator);
        if (
          pageKey === null ||
          locatorIdentity === null ||
          locatorIdentity.pageKey !== pageKey
        ) {
          return "Une version contradictoire ne possède pas une identité de document vérifiable.";
        }
        conflictSourceIds.add(source.source_id);
        conflictPages.add(pageKey);
        conflictDocumentDigests.add(locatorIdentity.digest);
        versionQualifyingPages.add(pageKey);
        versionQualifyingDocuments.add(JSON.stringify([pageKey, locatorIdentity.digest]));
        evidenceIds.add(evidenceId);
      }
      if (versionQualifyingPages.size === 0) {
        return "Une version contradictoire ne possède pas de page source qualifiante.";
      }
      versionDocumentIdentities.push(versionQualifyingDocuments);
    }
    const hasIndependentVersionPair = versionDocumentIdentities.some((left, index) =>
      versionDocumentIdentities.slice(index + 1).some((right) =>
        [...left].some((leftIdentity) => {
          const [leftPage, leftDigest] = JSON.parse(leftIdentity) as [string, string];
          return [...right].some((rightIdentity) => {
            const [rightPage, rightDigest] = JSON.parse(rightIdentity) as [string, string];
            return leftPage !== rightPage && leftDigest !== rightDigest;
          });
        }),
      ),
    );
    if (
      conflictSubjects.size !== 1 ||
      !conflictSubjects.has(dossier.identity.selected_subject_id ?? "") ||
      conflictSourceIds.size < 2 ||
      conflictPages.size < 2 ||
      conflictDocumentDigests.size < 2 ||
      !hasIndependentVersionPair ||
      conflictMetricSignatures.size !== 1 ||
      conflictPeriods.size !== 1 ||
      conflictValueNatures.size !== 1
    ) {
      return "Un conflit affiché ne porte pas sur la même entité avec deux documents sources distincts.";
    }
  }

  for (const evidenceId of evidenceIds) {
    const evidence = evidenceById.get(evidenceId);
    if (evidence === undefined || evidence.excerpt.trim().length === 0) {
      return "Une preuve liée est absente ou vide.";
    }
    const source = sourceById.get(evidence.source_id);
    if (
      source === undefined ||
      source.assumed_entity_id !== evidence.entity_id ||
      source.title.trim().length === 0 ||
      sourceUrl(source) === undefined
    ) {
      return "Une preuve ne mène pas vers une page source ouvrable.";
    }
  }
  if (dossier.global_status === "complete_within_scope") {
    const businessSourceIds = new Set(
      businessFacts.flatMap(({ evidence_ids }) => evidence_ids).flatMap((evidenceId) => {
        const item = evidenceById.get(evidenceId);
        return item === undefined ? [] : [item.source_id];
      }),
    );
    const businessSources = [...businessSourceIds].flatMap((sourceId) => {
      const source = sourceById.get(sourceId);
      return source === undefined ? [] : [source];
    });
    if (new Set(businessSources.map(sourceUrl)).size < 2) {
      return "Le dossier complet ne possède pas deux pages métier ouvrables.";
    }
    if (new Set(businessSources.map(sourcePublisherDomain)).size < 2) {
      return "Le dossier complet ne possède pas deux éditeurs distincts.";
    }
    if (dossier.contradictions.some(({ visible }) => visible)) {
      return "Un dossier complet ne peut pas masquer une contradiction visible.";
    }
  }
  return undefined;
}

function EvidenceList({
  dossier,
  evidenceIds,
  statement,
}: Readonly<{
  dossier: ResearchDossier;
  evidenceIds: readonly string[];
  statement: string;
}>) {
  const evidenceById = new Map(dossier.evidence.map((item) => [item.evidence_id, item]));
  const sourceById = new Map(dossier.sources.map((item) => [item.source_id, item]));
  const records = evidenceIds.flatMap((evidenceId) => {
    const evidence = evidenceById.get(evidenceId);
    if (evidence === undefined) return [];
    const source = sourceById.get(evidence.source_id);
    if (source === undefined) return [];
    const href = sourceUrl(source);
    return href === undefined ? [] : [{ evidence, source, href }];
  });

  function card(
    record: (typeof records)[number],
    index: number,
  ) {
    const { evidence, source, href } = record;
    return (
      <aside className="evidence-card" key={evidence.evidence_id}>
        <div className="evidence-heading">
          <span>Preuve {index + 1}</span>
          <span>{evidenceVerificationLabel(evidence.verification_method)}</span>
        </div>
        {shouldDisplayEvidenceExcerpt(statement, evidence.excerpt) ? (
          <blockquote className="evidence-excerpt">{evidence.excerpt}</blockquote>
        ) : null}
        <a className="source-link" href={href} target="_blank" rel="noopener noreferrer">
          <span className="source-title">{source.title}</span>
          <span className="source-publisher">
            {sourceAttribution(source)} <span aria-hidden="true">↗</span>
          </span>
          <span className="sr-only">Ouvrir la source dans un nouvel onglet</span>
        </a>
        <dl className="source-meta">
          <div><dt>Publication</dt><dd>{formatDate(source.published_at)}</dd></div>
          <div><dt>Consultation</dt><dd>{formatDate(source.accessed_at)}</dd></div>
          <div><dt>Période du fait</dt><dd>{formatPeriod(evidence.fact_period)}</dd></div>
          <div><dt>Portée</dt><dd>{formatScope(evidence.scope)}</dd></div>
          <div><dt>Vérification</dt><dd>{evidenceVerificationLabel(evidence.verification_method)}</dd></div>
          <div><dt>Repère</dt><dd>{formatLocator(evidence.locator, evidence.verification_method)}</dd></div>
        </dl>
      </aside>
    );
  }

  const primary = records[0];
  const additional = records.slice(1);

  return (
    <div className="evidence-list">
      {primary === undefined ? null : card(primary, 0)}
      {additional.length > 0 ? (
        <details className="additional-evidence">
          <summary>{additional.length} preuve{additional.length > 1 ? "s" : ""} complémentaire{additional.length > 1 ? "s" : ""}</summary>
          {additional.map((record, index) => card(record, index + 1))}
        </details>
      ) : null}
    </div>
  );
}

function ClaimCard({
  dossier,
  claim,
  ambiguous = false,
}: Readonly<{ dossier: ResearchDossier; claim: DossierClaim; ambiguous?: boolean }>) {
  const confidence = confidenceForClaim(dossier, claim);
  return (
    <article className={`claim-card${ambiguous ? " claim-card-ambiguous" : ""}`}>
      <div className="claim-heading">
        <div className={`confidence-badge confidence-${confidence.level}`} title={confidence.explanation}>
          <span>{confidence.label}</span>
          <span>{confidence.score} %</span>
        </div>
        <p className="claim-statement">{claim.statement}</p>
        <div className="claim-context" aria-label="Temporalité de l’affirmation">
          <span>{formatPeriod(claim.fact_period)}</span>
          <span>{freshnessLabel(claim)}</span>
          {requiresVisibleScope(claim) ? <span>Portée : {formatScope(claim.scope)}</span> : null}
        </div>
      </div>
      <EvidenceList dossier={dossier} evidenceIds={claim.evidence_ids} statement={claim.statement} />
    </article>
  );
}

function IdentityPanel({ dossier }: Readonly<{ dossier: ResearchDossier }>) {
  const selected = dossier.identity.candidates.find(
    (candidate) => candidate.subject_id === dossier.identity.selected_subject_id,
  );
  const identityProof = dossier.claims.find(
    (claim) =>
      claim.subject_id === dossier.identity.selected_subject_id &&
      claim.predicate.startsWith("identity.") &&
      claim.presentation_decision === "display_fact",
  );

  return (
    <section className="identity-panel" aria-labelledby="identity-title">
      <div>
        <p className="section-kicker">Identité</p>
        <h3 id="identity-title">{selected?.display_name ?? dossier.request.name}</h3>
      </div>
      <p className="identity-copy">
        {dossier.identity.resolution_reason}
      </p>
      {identityProof === undefined ? null : (
        <div className="identity-proof">
          <strong>Identité {confidenceForClaim(dossier, identityProof).label.toLocaleLowerCase("fr")}</strong>
          <p>{identityProof.statement}</p>
          <EvidenceList
            dossier={dossier}
            evidenceIds={identityProof.evidence_ids}
            statement={identityProof.statement}
          />
        </div>
      )}
    </section>
  );
}

function QuickRead({ dossier }: Readonly<{ dossier: ResearchDossier }>) {
  const claimById = new Map(dossier.claims.map((claim) => [claim.claim_id, claim]));
  const evidenceById = new Map(dossier.evidence.map((item) => [item.evidence_id, item]));
  const sourceById = new Map(dossier.sources.map((source) => [source.source_id, source]));
  const items = dossier.presentation.summary_items.flatMap((item) => {
    if (item.kind !== "claim") return [];
    const claim = claimById.get(item.ref_id);
    if (claim === undefined || claim.predicate.startsWith("identity.")) return [];
    const primaryEvidence = claim.evidence_ids.flatMap((evidenceId) => {
      const evidence = evidenceById.get(evidenceId);
      return evidence === undefined ? [] : [evidence];
    })[0];
    const source = primaryEvidence === undefined ? undefined : sourceById.get(primaryEvidence.source_id);
    const href = source === undefined ? undefined : sourceUrl(source);
    return [{ claim, source, href }];
  });
  if (items.length === 0) return null;

  return (
    <section className="result-section quick-read" aria-labelledby="quick-read-title">
      <div className="section-intro">
        <p className="section-kicker">Résumé extractif</p>
        <h3 id="quick-read-title">Lecture rapide — informations sourcées</h3>
      </div>
      <ol>
        {items.map(({ claim, source, href }) => (
          <li key={claim.claim_id}>
            <span className={`confidence-badge confidence-${confidenceForClaim(dossier, claim).level}`}>
              {confidenceForClaim(dossier, claim).label}
            </span>
            <p>{claim.statement}</p>
            {source !== undefined && href !== undefined ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {sourceAttribution(source)} <span aria-hidden="true">↗</span>
                <span className="sr-only">Ouvrir la source dans un nouvel onglet</span>
              </a>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ConfidenceLegend() {
  return (
    <section className="confidence-legend" aria-label="Niveaux de confiance">
      <p><strong>Confirmé</strong> : page consultée, extrait retrouvé, source forte.</p>
      <p><strong>Étayé</strong> : source attribuable, mais corroboration ou inspection limitée.</p>
      <p><strong>Piste à vérifier</strong> : signal public utile à confirmer avant de l’affirmer.</p>
    </section>
  );
}

function AmbiguityPanel({
  dossier,
  onClarify,
}: Readonly<{
  dossier: ResearchDossier;
  onClarify: (selection: ClarificationSelection) => void;
}>) {
  const ambiguousClaims = dossier.claims.filter(
    (claim) =>
      claim.presentation_decision === "display_ambiguity" &&
      claim.evidence_ids.length > 0,
  );
  const assignedClaimIds = new Set<string>();
  const hasCandidates = dossier.identity.candidates.length > 0;
  const hasSingleCandidate = dossier.identity.candidates.length === 1;

  return (
    <section className="ambiguity-panel" aria-labelledby="ambiguity-title">
      <div className="section-intro">
        <p className="section-kicker">Identité non résolue</p>
        <h3 id="ambiguity-title">
          {hasSingleCandidate
            ? "Un candidat reste à confirmer"
            : hasCandidates
              ? "Plusieurs candidats restent possibles"
              : "Le contexte ne suffit pas"}
        </h3>
        <p>
          {hasSingleCandidate
            ? "Ce candidat est plausible, mais un indice distinctif manque encore pour lui attribuer un dossier confiant."
            : hasCandidates
              ? "Aucun candidat n’est retenu comme la bonne personne ou entreprise. Les éléments ci-dessous restent des hypothèses distinctes."
              : "Aucune identité ne peut être retenue de façon sûre avec les indices fournis."}
        </p>
      </div>

      {hasCandidates ? <div className="candidate-grid">
        {dossier.identity.candidates.map((candidate, index) => {
          const candidateClaims = ambiguousClaims.filter(
            (claim) => claim.subject_id === candidate.subject_id,
          );
          for (const claim of candidateClaims) assignedClaimIds.add(claim.claim_id);
          const discriminators = Object.entries(candidate.discriminators);
          const anchorEvidence = candidateClaims.flatMap(({ evidence_ids }) => evidence_ids).flatMap(
            (evidenceId) => {
              const item = dossier.evidence.find(({ evidence_id }) => evidence_id === evidenceId);
              return item === undefined ? [] : [item];
            },
          )[0];
          const anchorSource = anchorEvidence === undefined
            ? undefined
            : dossier.sources.find(({ source_id }) => source_id === anchorEvidence.source_id);
          const anchorUrl = anchorSource === undefined ? undefined : sourceUrl(anchorSource);

          return (
            <article className="candidate-card" key={candidate.subject_id}>
              <p className="candidate-index">
                {hasSingleCandidate ? "Candidat à confirmer" : `Candidat possible ${index + 1}`}
              </p>
              <h4>{candidate.display_name}</h4>
              {discriminators.length > 0 ? (
                <dl className="candidate-hints">
                  {discriminators.map(([key, value]) => (
                    <div key={key}>
                      <dt>{CLARIFICATION_LABELS[key] ?? key.replaceAll("_", " ")}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <p className="candidate-warning">Indices de recherche à confirmer, pas des faits retenus.</p>
              {candidateClaims.length > 0 ? (
                <div className="candidate-claims">
                  {candidateClaims.map((claim) => (
                    <ClaimCard key={claim.claim_id} dossier={dossier} claim={claim} ambiguous />
                  ))}
                </div>
              ) : (
                <p className="candidate-empty">
                  Aucune affirmation prouvée n’est attribuable à ce candidat.
                </p>
              )}
              {anchorUrl === undefined ? null : (
                <button
                  type="button"
                  className="candidate-action"
                  aria-label={`Préremplir avec ${candidate.display_name}, candidat ${index + 1}`}
                  onClick={() => onClarify({
                    name: candidate.display_name,
                    entityType: candidate.entity_type,
                    sourceUrl: anchorUrl,
                  })}
                >
                  Préremplir avec ce candidat
                </button>
              )}
            </article>
          );
        })}
      </div> : null}

      {ambiguousClaims.some((claim) => !assignedClaimIds.has(claim.claim_id)) ? (
        <div className="unassigned-claims">
          <h4>Éléments non attribués</h4>
          {ambiguousClaims
            .filter((claim) => !assignedClaimIds.has(claim.claim_id))
            .map((claim) => (
              <ClaimCard key={claim.claim_id} dossier={dossier} claim={claim} ambiguous />
            ))}
        </div>
      ) : null}

      {dossier.identity.clarification_fields.length > 0 ? (
        <div className="clarification-box">
          <h4>Pour relancer la recherche</h4>
          <p>Ajoutez au contexte au moins un indice qui sépare réellement les candidats :</p>
          <ul className="clarification-list">
            {dossier.identity.clarification_fields.map((field) => (
              <li key={field}>{CLARIFICATION_LABELS[field] ?? field}</li>
            ))}
          </ul>
          <p>Le candidat choisi et sa page source seront revérifiés lors d’une nouvelle soumission. Le clic ne lance aucun appel.</p>
        </div>
      ) : null}
    </section>
  );
}

function Contradictions({ dossier }: Readonly<{ dossier: ResearchDossier }>) {
  const visible = dossier.contradictions.filter((item) => item.visible);
  if (visible.length === 0) return null;
  const claimById = new Map(dossier.claims.map((claim) => [claim.claim_id, claim]));

  return (
    <section className="result-section contradictions" aria-labelledby="contradictions-title">
      <div className="section-intro">
        <p className="section-kicker">Désaccords entre sources</p>
        <h3 id="contradictions-title">Versions conservées sans choix silencieux</h3>
      </div>
      {visible.map((contradiction, contradictionIndex) => {
        const titleId = `contradiction-title-${contradictionIndex}`;
        return (
          <article
            className="contradiction-card"
            key={contradiction.contradiction_id}
            aria-labelledby={titleId}
          >
            <div className="contradiction-heading">
              <div>
                <p className="conflict-state">Conflit confirmé</p>
                <h4 id={titleId}>{contradiction.metric_definition}</h4>
              </div>
              <dl className="conflict-dimensions" aria-label="Dimensions comparées">
                <div><dt>Période</dt><dd>{formatPeriod(contradiction.period)}</dd></div>
                <div><dt>Périmètre</dt><dd>{formatScope(contradiction.scope)}</dd></div>
              </dl>
            </div>
            <div className="version-grid">
              {contradiction.versions.map((version, index) => {
                const claim = claimById.get(version.claim_id);
                if (claim === undefined) return null;
                return (
                  <section
                    className="version-card"
                    key={`${version.claim_id}-${index}`}
                    aria-labelledby={`${titleId}-version-${index}`}
                  >
                    <p className="version-label">Version {index + 1}</p>
                    <h5 className="version-value" id={`${titleId}-version-${index}`}>
                      {formatContradictionValue(version)}
                    </h5>
                    <p className="version-statement">{claim.statement}</p>
                    <EvidenceList
                      dossier={dossier}
                      evidenceIds={version.evidence_ids}
                      statement={claim.statement}
                    />
                  </section>
                );
              })}
            </div>
            <div className="arbitration-note">
              <strong>Décision de sécurité</strong>
              <p>{contradiction.explanation}</p>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function UnknownsAndLimits({ dossier }: Readonly<{ dossier: ResearchDossier }>) {
  if (dossier.unknowns.length === 0 && dossier.limitations.length === 0) return null;

  return (
    <section className="result-section limits-section" aria-labelledby="limits-title">
      <div className="section-intro">
        <p className="section-kicker">Ce que le dossier ne permet pas d’affirmer</p>
        <h3 id="limits-title">Inconnues et limites</h3>
      </div>
      <div className="limits-grid">
        {dossier.unknowns.map((unknown) => (
          <article className="unknown-card" key={unknown.unknown_id}>
            <h4>{unknown.description}</h4>
            <p><strong>Arrêt :</strong> {unknown.stop_reason}</p>
            {unknown.retry_context.length > 0 ? (
              <p><strong>Pour aller plus loin :</strong> {unknown.retry_context.join(" · ")}</p>
            ) : null}
          </article>
        ))}
        {dossier.limitations.length > 0 ? (
          <article className="unknown-card">
            <h4>Limites de cette recherche</h4>
            <ul>
              {dossier.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
            </ul>
          </article>
        ) : null}
      </div>
    </section>
  );
}

function ReceiptDetails({
  dossier,
  receipt,
  elapsedMs,
}: Readonly<{
  dossier: ResearchDossier;
  receipt: Readonly<Record<string, unknown>>;
  elapsedMs: number;
}>) {
  const publicCost = readFiniteNumber(receipt, "estimatedCostUsd");
  const cost =
    publicCost ??
    (dossier.receipt.cost.status === "unknown" ? null : dossier.receipt.cost.amount_usd);
  const sourceFetchCount = readFiniteNumber(receipt, "sourceFetchCount");
  const searchCount = readFiniteNumber(receipt, "webSearchQueryCount");
  const pipelineCounts = isRecord(receipt.pipelineCounts) ? receipt.pipelineCounts : null;

  return (
    <details className="receipt-details">
      <summary>Détails d’exécution</summary>
      <dl className="receipt-grid">
        <div><dt>Durée totale</dt><dd>{formatDuration(dossier.receipt.total_duration_ms || elapsedMs)}</dd></div>
        <div>
          <dt>
            Coût{dossier.receipt.cost.status === "exact" ? " mesuré" : dossier.receipt.cost.status === "estimated" ? " estimé" : ""}
          </dt>
          <dd>{formatCost(cost)}</dd>
        </div>
        <div><dt>Pages sources retenues</dt><dd>{dossier.sources.length}</dd></div>
        <div><dt>Requêtes de pages</dt><dd>{sourceFetchCount ?? "non déterminé"}</dd></div>
        <div><dt>Recherches lancées</dt><dd>{searchCount ?? "non déterminé"}</dd></div>
        <div><dt>Appels externes</dt><dd>{dossier.receipt.provider_calls}</dd></div>
      </dl>
      <div className="receipt-scope">
        <strong>Périmètre consulté</strong>
        <p>{dossier.receipt.search_scope.categories.join(" · ") || "non documenté"}</p>
        <strong>Critère d’arrêt</strong>
        <p>{dossier.receipt.search_scope.stop_reason}</p>
        {pipelineCounts === null ? null : (
          <>
            <p className="pipeline-counts">
              Pipeline — candidats {readFiniteNumber(pipelineCounts, "providerIdentityCandidates") ?? 0} ·
              faits proposés {readFiniteNumber(pipelineCounts, "providerFactCandidates") ?? 0} ·
              documents {(
                (readFiniteNumber(pipelineCounts, "retrievedIdentityDocuments") ?? 0) +
                (readFiniteNumber(pipelineCounts, "retrievedFactDocuments") ?? 0)
              )} · faits affichés {readFiniteNumber(pipelineCounts, "displayedBusinessFacts") ?? 0}
            </p>
            {typeof pipelineCounts.identityStatus === "string" ? (
              <p className="pipeline-counts">
                Identité — {pipelineCounts.identityStatus} · {Array.isArray(pipelineCounts.identityReasonCodes)
                  ? pipelineCounts.identityReasonCodes.join(" · ")
                  : "raison non documentée"}
              </p>
            ) : null}
            {isRecord(pipelineCounts.attributionRejections) ? (
              <p className="pipeline-counts">
                Filtres d’attribution — {Object.entries(pipelineCounts.attributionRejections)
                  .map(([code, count]) => `${code}: ${String(count)}`).join(" · ") || "aucun"}
              </p>
            ) : null}
          </>
        )}
      </div>
    </details>
  );
}

function FailureReceiptDetails({ failure }: Readonly<{ failure: FailedEvent }>) {
  const duration = readFiniteNumber(failure.receipt, "durationMs") ?? failure.elapsedMs;
  const calls = readFiniteNumber(failure.receipt, "callsAttempted");
  const pages = readFiniteNumber(failure.receipt, "sourceFetchCount");
  return (
    <details className="receipt-details failure-receipt">
      <summary>Détails de la tentative</summary>
      <dl className="receipt-grid">
        <div><dt>Durée</dt><dd>{formatDuration(duration)}</dd></div>
        <div><dt>Appels externes</dt><dd>{calls ?? "non déterminé"}</dd></div>
        <div><dt>Requêtes de pages</dt><dd>{pages ?? "non déterminé"}</dd></div>
        <div><dt>Nouvel essai possible</dt><dd>{failure.error.retryable ? "oui" : "non"}</dd></div>
      </dl>
    </details>
  );
}

function DossierResult({
  completed,
  onClarify,
}: Readonly<{
  completed: CompletedEvent;
  onClarify: (selection: ClarificationSelection) => void;
}>) {
  const { dossier } = completed;
  const issue = dossierDisplayIssue(dossier);
  const displayFacts = dossier.claims.filter(
    (claim) =>
      claim.presentation_decision === "display_fact" &&
      claim.claim_state !== "contested" &&
      !claim.predicate.startsWith("identity."),
  ).sort((left, right) => {
    const rank = { confirmed: 0, supported: 1, lead: 2 } as const;
    return rank[confidenceForClaim(dossier, left).level] -
      rank[confidenceForClaim(dossier, right).level];
  });
  const visibleConflictCount = dossier.contradictions.filter(({ visible }) => visible).length;
  const groupedFacts = new Map<string, DossierClaim[]>();
  for (const category of CATEGORY_ORDER) groupedFacts.set(category, []);
  for (const claim of displayFacts) groupedFacts.get(categoryForClaim(claim))?.push(claim);

  const isAmbiguous =
    dossier.global_status === "needs_clarification" ||
    dossier.identity.status === "ambiguous" ||
    dossier.identity.status === "insufficient_context";
  const isSilence =
    dossier.result_mode === "silence" ||
    dossier.global_status === "insufficient_evidence" ||
    dossier.identity.status === "not_found_within_scope";
  const isTechnical =
    dossier.result_mode === "technical_error" || dossier.global_status === "technical_failure";
  const isPartial = dossier.global_status === "partial";

  let statusLabel = "Dossier étayé";
  let statusTitle = "Faits publics sourcés";
  let statusDescription = "Chaque information conserve sa source et un niveau de confiance explicite.";
  let statusTone = "success";
  if (isPartial) {
    statusLabel = "Résultat limité";
    statusTitle = "Dossier partiel";
    statusDescription = "Les informations attribuables sont affichées ; leur niveau de preuve, les manques et les désaccords restent visibles.";
    statusTone = "limited";
  }
  if (isAmbiguous) {
    statusLabel = "Clarification requise";
    statusTitle = "Identité ambiguë";
    statusDescription = "Aucun dossier confiant n’est produit tant que les candidats ne sont pas distingués.";
    statusTone = "warning";
    if (dossier.identity.status === "insufficient_context") {
      statusTitle = "Contexte insuffisant";
      statusDescription = "Ajoutez un indice distinctif avant de demander un dossier confiant.";
    }
  }
  if (isSilence) {
    statusLabel = "Preuves insuffisantes";
    statusTitle = "Données publiques insuffisantes";
    statusDescription = "Aucun fait n’est inventé pour combler ce que la recherche n’a pas pu établir.";
    statusTone = "quiet";
  }
  if (isTechnical) {
    statusLabel = "Échec technique";
    statusTitle = "La recherche n’a pas abouti";
    statusDescription = "Cet échec ne permet aucune conclusion sur l’entité ou la disponibilité des preuves.";
    statusTone = "danger";
  }
  if (issue !== undefined) {
    statusLabel = "Résultat non affichable";
    statusTitle = "Contrôle de traçabilité échoué";
    statusDescription = "Le serveur a renvoyé un dossier dont les preuves ne permettent pas un affichage sûr.";
    statusTone = "danger";
  }

  return (
    <article className="result-card" aria-labelledby="result-title">
      <header className="result-header">
        <div>
          <p className="section-kicker">Résultat pour {dossier.request.name}</p>
          <h2 id="result-title">{statusTitle}</h2>
          <p>{statusDescription}</p>
          {issue === undefined ? (
            <ul className="result-overview" aria-label="Vue d’ensemble du dossier">
              <li>{dossier.identity.status === "resolved" ? "Identité résolue" : "Identité non résolue"}</li>
              <li>
                {displayFacts.length}{" "}
                {visibleConflictCount > 0
                  ? displayFacts.length === 1
                    ? "fait non contesté"
                    : "faits non contestés"
                  : displayFacts.length === 1
                    ? "fait étayé"
                    : "faits étayés"}
              </li>
              <li>{dossier.sources.length} {dossier.sources.length === 1 ? "page source" : "pages sources"}</li>
              <li>{visibleConflictCount} {visibleConflictCount === 1 ? "conflit ouvert" : "conflits ouverts"}</li>
            </ul>
          ) : null}
        </div>
        <span className={`result-status status-${statusTone}`}>{statusLabel}</span>
      </header>

      {issue !== undefined ? (
        <section className="terminal-message terminal-danger" role="alert">
          <h3>Dossier masqué par sécurité</h3>
          <p>{issue} Aucun fait n’a été affiché.</p>
        </section>
      ) : (
        <>
          {isTechnical ? (
            <section className="terminal-message terminal-danger">
              <h3>Recherche techniquement échouée</h3>
              <p>{dossier.error?.message ?? "La collecte ou la vérification n’a pas pu se terminer."}</p>
            </section>
          ) : null}

          {isAmbiguous ? <AmbiguityPanel dossier={dossier} onClarify={onClarify} /> : null}

          {isSilence && !isAmbiguous ? (
            <section className="terminal-message terminal-quiet">
              <h3>Aucun fait suffisamment attribuable</h3>
              <p>
                Le périmètre consulté n’a pas fourni de preuve assez solide pour
                construire un dossier factuel.
              </p>
            </section>
          ) : null}

          {!isAmbiguous && !isTechnical && dossier.identity.status === "resolved" ? (
            <IdentityPanel dossier={dossier} />
          ) : null}

          {!isTechnical ? <Contradictions dossier={dossier} /> : null}

          {!isAmbiguous && !isTechnical && displayFacts.length > 0 ? <ConfidenceLegend /> : null}

          {!isAmbiguous && !isTechnical ? <QuickRead dossier={dossier} /> : null}

          {!isAmbiguous && !isTechnical && displayFacts.length > 0 ? (
            <section className="facts-section" aria-labelledby="facts-title">
              <div className="section-intro facts-intro">
                <p className="section-kicker">Dossier factuel</p>
                <h3 id="facts-title">
                  {displayFacts.length} {displayFacts.length > 1 ? "faits métier étayés" : "fait métier étayé"}
                </h3>
              </div>
              {[...groupedFacts.entries()].map(([category, claims], categoryIndex) =>
                claims.length > 0 ? (
                  <section className="fact-group" key={category} aria-labelledby={`fact-category-${categoryIndex}`}>
                    <h4 id={`fact-category-${categoryIndex}`}>{category}</h4>
                    <div className="claims-list">
                      {claims.map((claim) => (
                        <ClaimCard key={claim.claim_id} dossier={dossier} claim={claim} />
                      ))}
                    </div>
                  </section>
                ) : null,
              )}
            </section>
          ) : null}

          <UnknownsAndLimits dossier={dossier} />
        </>
      )}

      <ReceiptDetails dossier={dossier} receipt={completed.receipt} elapsedMs={completed.elapsedMs} />
    </article>
  );
}

export function ResearchForm() {
  const [name, setName] = useState("");
  const [context, setContext] = useState("");
  const [entityType, setEntityType] = useState<EntityType>("auto");
  const [identitySourceUrl, setIdentitySourceUrl] = useState<string>();
  const [status, setStatus] = useState<UiStatus>("idle");
  const [events, setEvents] = useState<ResearchEvent[]>([]);
  const [completed, setCompleted] = useState<CompletedEvent>();
  const [failure, setFailure] = useState<FailedEvent>();
  const [requestError, setRequestError] = useState<string>();
  const [nameError, setNameError] = useState<string>();
  const [clarificationNotice, setClarificationNotice] = useState<string>();
  const [elapsedMs, setElapsedMs] = useState(0);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const startedAtRef = useRef(0);
  const resultRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status !== "running") return;
    const interval = window.setInterval(() => {
      setElapsedMs(performance.now() - startedAtRef.current);
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [status]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    if (status === "completed") {
      resultRef.current?.focus({ preventScroll: true });
      resultRef.current?.scrollIntoView({ block: "start" });
    } else if (status === "failed" || status === "cancelled") {
      errorRef.current?.focus({ preventScroll: true });
      errorRef.current?.scrollIntoView({ block: "center" });
    }
  }, [status]);

  const latestEvent = events.at(-1);
  const currentStep =
    status === "cancelled"
      ? "Recherche annulée"
      : status === "failed"
        ? "Recherche interrompue"
        : latestEvent !== undefined
          ? STEP_LABELS[latestEvent.state]
          : status === "running"
            ? "Connexion au service de recherche"
            : "Prêt à rechercher";

  function handleEvent(event: ResearchEvent) {
    setEvents((current) => [...current, event]);
    setElapsedMs(event.elapsedMs);
    if (event.state === "completed") {
      setCompleted(event as CompletedEvent);
      setStatus("completed");
    } else if (event.state === "failed") {
      setFailure(event as FailedEvent);
      setStatus("failed");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = name.trim();
    if (normalizedName.length < 2) {
      setNameError("Saisissez au moins deux caractères autres que des espaces.");
      nameInputRef.current?.focus();
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    startedAtRef.current = performance.now();
    setElapsedMs(0);
    setEvents([]);
    setCompleted(undefined);
    setFailure(undefined);
    setRequestError(undefined);
    setNameError(undefined);
    setClarificationNotice(undefined);
    setStatus("running");

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: normalizedName,
          entityType,
          ...(context.trim() ? { context: context.trim() } : {}),
          ...(identitySourceUrl === undefined ? {} : { identitySourceUrl }),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let message = "La demande a été refusée.";
        try {
          const payload = (await response.json()) as unknown;
          if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
            message = payload.error.message;
          }
        } catch {
          // Le message public générique reste préférable à une réponse serveur brute.
        }
        throw new Error(message);
      }

      const contentType = response.headers.get("content-type")?.toLocaleLowerCase("en-US");
      if (contentType?.startsWith("text/event-stream") !== true || response.body === null) {
        throw new Error("Le serveur n’a pas fourni le flux de recherche attendu.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let terminalSeen = false;
      let executionId: string | undefined;
      let eventCount = 0;

      function consumeBlock(block: string) {
        const progressEvent = decodeSseBlock(block);
        if (progressEvent === undefined) return;
        if (terminalSeen) throw new Error("Le flux a continué après son résultat final.");
        if (executionId !== undefined && executionId !== progressEvent.executionId) {
          throw new Error("Le flux mélange plusieurs recherches.");
        }
        if (eventCount === 0 && progressEvent.state !== "accepted") {
          throw new Error("Le flux de recherche ne commence pas par une acceptation.");
        }
        executionId = progressEvent.executionId;
        eventCount += 1;
        handleEvent(progressEvent);
        if (progressEvent.state === "completed" || progressEvent.state === "failed") {
          terminalSeen = true;
        }
      }

      function drainBuffer(final: boolean) {
        const blocks = buffer.split(/\r?\n\r?\n/u);
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          if (block.trim().length > 0) consumeBlock(block);
        }
        if (final && buffer.trim().length > 0) {
          const finalBlock = buffer;
          buffer = "";
          consumeBlock(finalBlock);
        }
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        drainBuffer(false);
      }
      buffer += decoder.decode();
      drainBuffer(true);

      if (!terminalSeen) {
        throw new Error("Le flux s’est fermé sans résultat final. Aucun dossier n’a été produit.");
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setCompleted(undefined);
        setFailure(undefined);
        setRequestError(undefined);
        setStatus("cancelled");
      } else {
        setCompleted(undefined);
        setFailure(undefined);
        setRequestError(error instanceof Error ? error.message : "La recherche a échoué.");
        setStatus("failed");
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = undefined;
    }
  }

  function cancel() {
    controllerRef.current?.abort();
  }

  function prepareClarification(selection: ClarificationSelection) {
    setName(selection.name);
    setEntityType(selection.entityType);
    setIdentitySourceUrl(selection.sourceUrl);
    setNameError(undefined);
    setClarificationNotice(
      `Formulaire prérempli pour ${selection.name}. Vérifiez le contexte puis relancez manuellement la recherche.`,
    );
    window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      formRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      nameInputRef.current?.focus();
    });
  }

  const terminalMessage =
    status === "cancelled"
      ? "Recherche annulée. Aucun dossier n’a été produit."
      : requestError ?? failure?.error.message;

  return (
    <section className="workspace" aria-labelledby="research-title">
      <form
        ref={formRef}
        onSubmit={submit}
        className="search-form"
        aria-busy={status === "running"}
        noValidate
      >
          <div className="section-heading">
            <p className="section-kicker">Nouvelle recherche</p>
            <h2 id="research-title">Qui voulez-vous examiner&nbsp;?</h2>
            <p>Un contexte précis évite de confondre deux personnes ou deux organisations.</p>
          </div>

          <label className="field-label" htmlFor="entity-type">Type d’entité</label>
          <select
            id="entity-type"
            name="entityType"
            value={entityType}
            onChange={(event) => {
              setEntityType(event.target.value as EntityType);
              setIdentitySourceUrl(undefined);
            }}
            disabled={status === "running"}
          >
            <option value="auto">À déterminer</option>
            <option value="person">Personne</option>
            <option value="company">Entreprise ou organisation</option>
          </select>

          <label className="field-label" htmlFor="entity-name">Nom</label>
          <input
            ref={nameInputRef}
            id="entity-name"
            name="name"
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setIdentitySourceUrl(undefined);
              if (event.target.value.trim().length >= 2) setNameError(undefined);
            }}
            placeholder="Ex. Thomas Pesquet ou Airbus"
            autoComplete="off"
            aria-invalid={nameError === undefined ? undefined : true}
            aria-describedby={nameError === undefined ? undefined : "name-error"}
            disabled={status === "running"}
          />
          {nameError === undefined ? null : (
            <p id="name-error" className="field-error" role="alert">{nameError}</p>
          )}

          <label className="field-label" htmlFor="entity-context">
            Contexte <span>facultatif, recommandé</span>
          </label>
          <textarea
            id="entity-context"
            name="context"
            maxLength={300}
            rows={4}
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder="Ville, secteur, employeur, pays, site officiel ou autre indice distinctif"
            aria-describedby="context-help privacy-note"
            disabled={status === "running"}
          />
          <p id="context-help" className="field-help">Le contexte sert réellement à distinguer l’entité recherchée.</p>
          <p id="privacy-note" className="privacy-note">
            Utilisez seulement des informations publiques. N’ajoutez aucune donnée privée ou sensible.
          </p>
          {clarificationNotice === undefined ? null : (
            <p className="clarification-notice" role="status">{clarificationNotice}</p>
          )}

          <div className="actions">
            <button type="submit" disabled={status === "running"}>
              {status === "running" ? "Recherche en cours…" : "Construire le dossier"}
            </button>
            {status === "running" ? (
              <button type="button" className="secondary" onClick={cancel}>Annuler</button>
            ) : null}
          </div>
      </form>

      <section className={`live-panel live-panel-${status}`} aria-live="polite">
        <div className="live-heading">
          <div>
            <p className="section-kicker">Progression</p>
            <h2>{currentStep}</h2>
          </div>
          <span className={`status-dot status-${status}`} aria-hidden="true" />
        </div>

        {status === "running" || events.length > 0 ? (
          <p className="elapsed" aria-hidden="true">{formatDuration(elapsedMs)}</p>
        ) : null}

        {events.length === 0 ? (
          <div className="empty-state">
            <span aria-hidden="true">01</span>
            <p>Les étapes réellement franchies apparaîtront ici. Aucun pourcentage simulé.</p>
          </div>
        ) : (
          <ol className="timeline">
            {events.map((progressEvent, index) => (
              <li
                key={`${progressEvent.executionId}-${progressEvent.state}-${index}`}
                aria-current={index === events.length - 1 && status === "running" ? "step" : undefined}
              >
                <span className="timeline-marker" aria-hidden="true" />
                <span className="timeline-label">{STEP_LABELS[progressEvent.state]}</span>
                <time>{formatDuration(progressEvent.elapsedMs)}</time>
              </li>
            ))}
          </ol>
        )}

        {terminalMessage !== undefined ? (
          <div className="error-box" role="alert" tabIndex={-1} ref={errorRef}>
            <h3>{status === "cancelled" ? "Recherche annulée" : "Aucun dossier produit"}</h3>
            <p>{terminalMessage}</p>
            {failure !== undefined ? <FailureReceiptDetails failure={failure} /> : null}
          </div>
        ) : null}
      </section>

      <section className="method-note" aria-labelledby="method-title">
        <p className="section-kicker">Règle d’affichage</p>
        <h3 id="method-title">La preuve reste à côté du fait.</h3>
        <p>
          Si l’identité, la source ou la fraîcheur ne peuvent pas être établies,
          le dossier le dit au lieu de compléter les blancs.
        </p>
      </section>

      {completed !== undefined ? (
        <div
          className="result-focus"
          ref={resultRef}
          tabIndex={-1}
          role="region"
          aria-labelledby="result-title"
        >
          <DossierResult completed={completed} onClarify={prepareClarification} />
        </div>
      ) : null}
    </section>
  );
}
