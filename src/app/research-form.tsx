"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import type { ResearchDossier } from "../domain/research-dossier";

type EntityType = "auto" | "person" | "company";
type UiStatus = "idle" | "running" | "completed" | "failed" | "cancelled";
type ProgressState =
  | "accepted"
  | "resolving_identity"
  | "searching"
  | "source_verifying"
  | "building"
  | "validating"
  | "completed"
  | "failed";

type DossierClaim = ResearchDossier["claims"][number];
type DossierSource = ResearchDossier["sources"][number];

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
  "resolving_identity",
  "searching",
  "source_verifying",
  "building",
  "validating",
  "completed",
  "failed",
];

const STEP_LABELS: Readonly<Record<ProgressState, string>> = {
  accepted: "Demande reçue",
  resolving_identity: "Résolution de l’identité",
  searching: "Recherche de pages publiques",
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

const EVIDENCE_RELATION_LABELS: Readonly<
  Record<ResearchDossier["evidence"][number]["relation"], string>
> = {
  supports: "Étaye",
  contradicts: "Contredit",
  context_only: "Contexte seulement",
  entity_mismatch: "Entité différente",
  insufficient: "Insuffisant",
};

const CATEGORY_ORDER = [
  "Identité",
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
    typeof value.status === "string" &&
    isNullableString(value.start) &&
    isNullableString(value.end) &&
    isNullableString(value.as_of) &&
    isNullableString(value.label)
  );
}

function isDossier(value: unknown): value is ResearchDossier {
  if (!isRecord(value)) return false;
  const request = value.request;
  const identity = value.identity;
  const receipt = value.receipt;
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
        typeof contradiction.metric_definition === "string" &&
        typeof contradiction.explanation === "string" &&
        typeof contradiction.visible === "boolean" &&
        isFactPeriod(contradiction.period) &&
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

function decodeSseBlock(block: string): ResearchEvent | undefined {
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
  const candidate = source.resolved_url ?? source.canonical_url ?? source.provider_url;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function sourceDomain(source: DossierSource): string {
  const url = sourceUrl(source);
  if (url === undefined) return "domaine inconnu";
  return new URL(url).hostname.replace(/^www\./u, "");
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

function formatLocator(value: string): string {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) return "Extrait retrouvé dans la page";
    const occurrence = parsed.occurrenceIndex;
    const occurrenceLabel = typeof occurrence === "number" && Number.isSafeInteger(occurrence)
      ? `occurrence ${occurrence + 1}`
      : "occurrence vérifiée";
    return parsed.matchMode === "typographic_equivalence"
      ? `Équivalence typographique · ${occurrenceLabel}`
      : `Correspondance exacte · ${occurrenceLabel}`;
  } catch {
    return "Extrait retrouvé dans la page";
  }
}

function freshnessLabel(claim: DossierClaim): string {
  if (claim.temporal_status === "historical") return "Information historique";
  if (claim.temporal_status === "current") return "Fraîcheur connue";
  return "Fraîcheur inconnue";
}

function categoryForClaim(claim: DossierClaim): (typeof CATEGORY_ORDER)[number] {
  const predicate = claim.predicate.toLocaleLowerCase("fr-FR");
  if (/ident|legal|founded|creation|name|status/u.test(predicate)) return "Identité";
  if (/activ|industry|sector|business|product|service|mission/u.test(predicate)) return "Activité";
  if (/role|position|leader|executive|director|founder|employ/u.test(predicate)) {
    return "Rôles et responsabilités";
  }
  if (/geograph|location|address|city|country|headquarter|presence/u.test(predicate)) {
    return "Présence géographique";
  }
  if (/revenue|turnover|employee|workforce|funding|valuation|metric|amount|number/u.test(predicate)) {
    return "Chiffres clés";
  }
  if (/event|recent|launch|announce|acquisition|signal|news|date/u.test(predicate)) {
    return "Événements et signaux récents";
  }
  return "Autres faits";
}

function dossierDisplayIssue(dossier: ResearchDossier): string | undefined {
  const evidenceById = new Map(dossier.evidence.map((item) => [item.evidence_id, item]));
  const sourceById = new Map(dossier.sources.map((item) => [item.source_id, item]));
  const claimById = new Map(dossier.claims.map((item) => [item.claim_id, item]));
  const displayFacts = dossier.claims.filter(
    (claim) => claim.presentation_decision === "display_fact",
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
    for (const evidenceId of claim.evidence_ids) {
      const evidence = evidenceById.get(evidenceId);
      if (
        evidence === undefined ||
        evidence.claim_id !== claim.claim_id ||
        evidence.entity_id !== claim.subject_id ||
        evidence.verification_method !== "source_content" ||
        evidence.excerpt.normalize("NFKC").replace(/\s+/gu, " ").trim() !==
          claim.statement.normalize("NFKC").replace(/\s+/gu, " ").trim()
      ) {
        return "Une affirmation n’est pas identique à sa preuve source vérifiée.";
      }
      if (evidence.relation === "supports") hasSupportingEvidence = true;
      evidenceIds.add(evidenceId);
    }
    if (claim.presentation_decision === "display_fact" && !hasSupportingEvidence) {
      return "Une affirmation affichable ne possède aucune preuve qui l’étaye.";
    }
  }

  for (const contradiction of dossier.contradictions.filter((item) => item.visible)) {
    for (const version of contradiction.versions) {
      const claim = claimById.get(version.claim_id);
      if (claim === undefined || version.evidence_ids.length === 0) {
        return "Une version contradictoire ne possède pas de preuve exploitable.";
      }
      for (const evidenceId of version.evidence_ids) {
        const evidence = evidenceById.get(evidenceId);
        if (
          evidence === undefined ||
          evidence.claim_id !== claim.claim_id ||
          evidence.entity_id !== claim.subject_id
        ) {
          return "Une version contradictoire pointe vers une preuve mal attribuée.";
        }
        evidenceIds.add(evidenceId);
      }
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
  return undefined;
}

function EvidenceList({
  dossier,
  evidenceIds,
}: Readonly<{ dossier: ResearchDossier; evidenceIds: readonly string[] }>) {
  const evidenceById = new Map(dossier.evidence.map((item) => [item.evidence_id, item]));
  const sourceById = new Map(dossier.sources.map((item) => [item.source_id, item]));

  return (
    <div className="evidence-list">
      {evidenceIds.map((evidenceId, index) => {
        const evidence = evidenceById.get(evidenceId);
        if (evidence === undefined) return null;
        const source = sourceById.get(evidence.source_id);
        if (source === undefined) return null;
        const href = sourceUrl(source);
        if (href === undefined) return null;
        return (
          <aside className="evidence-card" key={evidence.evidence_id}>
            <div className="evidence-heading">
              <span>Preuve {index + 1}</span>
              <span>{EVIDENCE_RELATION_LABELS[evidence.relation]}</span>
            </div>
            <blockquote className="evidence-excerpt">{evidence.excerpt}</blockquote>
            <a className="source-link" href={href} target="_blank" rel="noopener noreferrer">
              <span className="source-title">{source.title}</span>
              <span className="source-publisher">
                {source.publisher} · {sourceDomain(source)} <span aria-hidden="true">↗</span>
              </span>
              <span className="sr-only">Ouvrir la source dans un nouvel onglet</span>
            </a>
            <dl className="source-meta">
              <div><dt>Publication</dt><dd>{formatDate(source.published_at)}</dd></div>
              <div><dt>Consultation</dt><dd>{formatDate(source.accessed_at)}</dd></div>
              <div><dt>Période du fait</dt><dd>{formatPeriod(evidence.fact_period)}</dd></div>
              <div><dt>Repère</dt><dd>{formatLocator(evidence.locator)}</dd></div>
            </dl>
          </aside>
        );
      })}
    </div>
  );
}

function ClaimCard({
  dossier,
  claim,
  ambiguous = false,
}: Readonly<{ dossier: ResearchDossier; claim: DossierClaim; ambiguous?: boolean }>) {
  return (
    <article className={`claim-card${ambiguous ? " claim-card-ambiguous" : ""}`}>
      <div className="claim-heading">
        <p className="claim-statement">{claim.statement}</p>
        <div className="claim-context" aria-label="Temporalité de l’affirmation">
          <span>{formatPeriod(claim.fact_period)}</span>
          <span>{freshnessLabel(claim)}</span>
        </div>
      </div>
      <EvidenceList dossier={dossier} evidenceIds={claim.evidence_ids} />
    </article>
  );
}

function IdentityPanel({ dossier }: Readonly<{ dossier: ResearchDossier }>) {
  const selected = dossier.identity.candidates.find(
    (candidate) => candidate.subject_id === dossier.identity.selected_subject_id,
  );

  return (
    <section className="identity-panel" aria-labelledby="identity-title">
      <div>
        <p className="section-kicker">Identité</p>
        <h3 id="identity-title">{selected?.display_name ?? dossier.request.name}</h3>
      </div>
      <p className="identity-copy">
        Entité distinguée pour ce dossier. Les faits attribués et leurs preuves sont
        présentés ensemble ci-dessous.
      </p>
    </section>
  );
}

function AmbiguityPanel({ dossier }: Readonly<{ dossier: ResearchDossier }>) {
  const ambiguousClaims = dossier.claims.filter(
    (claim) =>
      claim.presentation_decision === "display_ambiguity" &&
      claim.evidence_ids.length > 0,
  );
  const assignedClaimIds = new Set<string>();
  const hasCandidates = dossier.identity.candidates.length > 0;

  return (
    <section className="ambiguity-panel" aria-labelledby="ambiguity-title">
      <div className="section-intro">
        <p className="section-kicker">Identité non résolue</p>
        <h3 id="ambiguity-title">
          {hasCandidates ? "Plusieurs candidats restent possibles" : "Le contexte ne suffit pas"}
        </h3>
        <p>
          {hasCandidates
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

          return (
            <article className="candidate-card" key={candidate.subject_id}>
              <p className="candidate-index">Candidat possible {index + 1}</p>
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
      {visible.map((contradiction) => (
        <article className="contradiction-card" key={contradiction.contradiction_id}>
          <div className="contradiction-heading">
            <h4>{contradiction.metric_definition}</h4>
            <span>{formatPeriod(contradiction.period)}</span>
          </div>
          <div className="version-grid">
            {contradiction.versions.map((version, index) => {
              const claim = claimById.get(version.claim_id);
              if (claim === undefined) return null;
              return (
                <section className="version-card" key={`${version.claim_id}-${index}`}>
                  <p className="version-label">Version {index + 1}</p>
                  <p className="version-value">
                    {String(version.normalized_value)}
                    {version.unit === null ? "" : ` ${version.unit}`}
                    {version.currency === null ? "" : ` ${version.currency}`}
                  </p>
                  <p className="version-statement">{claim.statement}</p>
                  <EvidenceList dossier={dossier} evidenceIds={version.evidence_ids} />
                </section>
              );
            })}
          </div>
          <div className="arbitration-note">
            <strong>Arbitrage</strong>
            <p>{contradiction.explanation}</p>
          </div>
        </article>
      ))}
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

function DossierResult({ completed }: Readonly<{ completed: CompletedEvent }>) {
  const { dossier } = completed;
  const issue = dossierDisplayIssue(dossier);
  const displayFacts = dossier.claims.filter(
    (claim) => claim.presentation_decision === "display_fact",
  );
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
  let statusTitle = "Faits publics vérifiés";
  let statusDescription = "Chaque fait affiché reste au contact de l’extrait et de la page qui l’étayent.";
  let statusTone = "success";
  if (isPartial) {
    statusLabel = "Résultat limité";
    statusTitle = "Dossier partiel";
    statusDescription = "Les faits vérifiables sont affichés ; les manques et désaccords restent visibles.";
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

          {isAmbiguous ? <AmbiguityPanel dossier={dossier} /> : null}

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

          {!isAmbiguous && !isTechnical && displayFacts.length > 0 ? (
            <section className="facts-section" aria-labelledby="facts-title">
              <div className="section-intro facts-intro">
                <p className="section-kicker">Dossier factuel</p>
                <h3 id="facts-title">
                  {displayFacts.length} {displayFacts.length > 1 ? "faits étayés" : "fait étayé"}
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

          {!isTechnical ? <Contradictions dossier={dossier} /> : null}
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
  const [status, setStatus] = useState<UiStatus>("idle");
  const [events, setEvents] = useState<ResearchEvent[]>([]);
  const [completed, setCompleted] = useState<CompletedEvent>();
  const [failure, setFailure] = useState<FailedEvent>();
  const [requestError, setRequestError] = useState<string>();
  const [elapsedMs, setElapsedMs] = useState(0);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const startedAtRef = useRef(0);
  const resultRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status !== "running") return;
    const interval = window.setInterval(() => {
      setElapsedMs(performance.now() - startedAtRef.current);
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [status]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    if (status === "completed") resultRef.current?.focus();
    else if (status === "failed" || status === "cancelled") errorRef.current?.focus();
  }, [status]);

  const latestEvent = events.at(-1);
  const currentStep =
    latestEvent !== undefined
      ? STEP_LABELS[latestEvent.state]
      : status === "running"
        ? "Connexion au service de recherche"
        : status === "cancelled"
          ? "Recherche annulée"
          : status === "failed"
            ? "Recherche interrompue"
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
    if (normalizedName.length < 2) return;

    const controller = new AbortController();
    controllerRef.current = controller;
    startedAtRef.current = performance.now();
    setElapsedMs(0);
    setEvents([]);
    setCompleted(undefined);
    setFailure(undefined);
    setRequestError(undefined);
    setStatus("running");

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: normalizedName,
          entityType,
          ...(context.trim() ? { context: context.trim() } : {}),
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

  const terminalMessage =
    status === "cancelled"
      ? "Recherche annulée. Aucun dossier n’a été produit."
      : requestError ?? failure?.error.message;

  return (
    <section className="workspace" aria-labelledby="research-title">
      <div className="search-column">
        <form onSubmit={submit} className="search-form" aria-busy={status === "running"}>
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
            onChange={(event) => setEntityType(event.target.value as EntityType)}
            disabled={status === "running"}
          >
            <option value="auto">À déterminer</option>
            <option value="person">Personne</option>
            <option value="company">Entreprise ou organisation</option>
          </select>

          <label className="field-label" htmlFor="entity-name">Nom</label>
          <input
            id="entity-name"
            name="name"
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex. Thomas Pesquet ou Airbus"
            autoComplete="off"
            disabled={status === "running"}
          />

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

          <div className="actions">
            <button type="submit" disabled={status === "running"}>
              {status === "running" ? "Recherche en cours…" : "Construire le dossier"}
            </button>
            {status === "running" ? (
              <button type="button" className="secondary" onClick={cancel}>Annuler</button>
            ) : null}
          </div>
        </form>

        <section className="method-note" aria-labelledby="method-title">
          <p className="section-kicker">Règle d’affichage</p>
          <h3 id="method-title">La preuve reste à côté du fait.</h3>
          <p>
            Si l’identité, la source ou la fraîcheur ne peuvent pas être établies,
            le dossier le dit au lieu de compléter les blancs.
          </p>
        </section>
      </div>

      <section className="live-panel" aria-live="polite">
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

      {completed !== undefined ? (
        <div className="result-focus" ref={resultRef} tabIndex={-1}>
          <DossierResult completed={completed} />
        </div>
      ) : null}
    </section>
  );
}
