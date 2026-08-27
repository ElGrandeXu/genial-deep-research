"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import type {
  PublicReceipt,
  ResearchProgressEvent,
} from "../server/research/types";

type UiStatus = "idle" | "running" | "completed" | "failed" | "cancelled";

const STEP_LABELS = {
  accepted: "Demande acceptée",
  searching: "Recherche Web OpenAI en cours",
  source_verifying: "Récupération et vérification de la source",
  validating: "Validation du contrat M2",
  completed: "Résultat validé",
  failed: "Recherche arrêtée",
} as const;

function formatDuration(milliseconds: number): string {
  return `${(milliseconds / 1_000).toFixed(1)} s`;
}

function formatToken(value: number | null): string {
  return value === null ? "non exposé" : value.toLocaleString("fr-FR");
}

function Receipt({ receipt }: Readonly<{ receipt: PublicReceipt }>) {
  return (
    <section className="receipt" aria-labelledby="receipt-title">
      <div className="section-heading">
        <p className="eyebrow">Reçu d’exécution</p>
        <h3 id="receipt-title">Usage mesuré</h3>
      </div>
      <dl className="metrics">
        <div><dt>Modèle</dt><dd>{receipt.model}</dd></div>
        <div><dt>Appels OpenAI</dt><dd>{receipt.providerHttpCalls}</dd></div>
        <div><dt>Web Search</dt><dd>{receipt.toolCalls}</dd></div>
        <div><dt>Récupérations source</dt><dd>{receipt.sourceFetchCount}</dd></div>
        <div><dt>Entrée</dt><dd>{formatToken(receipt.inputTokens)} tokens</dd></div>
        <div><dt>Cache</dt><dd>{formatToken(receipt.cachedInputTokens)} tokens</dd></div>
        <div><dt>Sortie</dt><dd>{formatToken(receipt.outputTokens)} tokens</dd></div>
        <div><dt>Raisonnement</dt><dd>{formatToken(receipt.reasoningTokens)} tokens</dd></div>
        <div><dt>Total</dt><dd>{formatToken(receipt.totalTokens)} tokens</dd></div>
        <div><dt>Latence</dt><dd>{formatDuration(receipt.durations.totalMs)}</dd></div>
        <div>
          <dt>Coût estimé</dt>
          <dd>
            {receipt.estimatedCostUsd === null
              ? "inconnu"
              : `${receipt.estimatedCostUsd.toFixed(5)} USD`}
          </dd>
        </div>
      </dl>
      <p className="fine-print">
        Tarif public daté du {receipt.pricing.date}. Estimation hors taxes, remises
        et frais non exposés.
      </p>
    </section>
  );
}

export function ResearchForm() {
  const [name, setName] = useState("");
  const [context, setContext] = useState("");
  const [status, setStatus] = useState<UiStatus>("idle");
  const [events, setEvents] = useState<ResearchProgressEvent[]>([]);
  const [completed, setCompleted] = useState<
    Extract<ResearchProgressEvent, { state: "completed" }> | undefined
  >();
  const [failure, setFailure] = useState<
    Extract<ResearchProgressEvent, { state: "failed" }> | undefined
  >();
  const [requestError, setRequestError] = useState<string>();
  const [elapsedMs, setElapsedMs] = useState(0);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (status !== "running") return;
    const interval = window.setInterval(() => {
      setElapsedMs(performance.now() - startedAtRef.current);
    }, 200);
    return () => window.clearInterval(interval);
  }, [status]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  function handleEvent(event: ResearchProgressEvent) {
    setEvents((current) => [...current, event]);
    if (event.state === "completed") {
      setCompleted(event);
      setElapsedMs(event.elapsedMs);
      setStatus("completed");
    } else if (event.state === "failed") {
      setFailure(event);
      setElapsedMs(event.elapsedMs);
      setStatus("failed");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        body: JSON.stringify({ name, ...(context.trim() ? { context } : {}) }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? "La demande a été refusée.");
      }
      if (response.body === null) throw new Error("Le flux de progression est absent.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/u);
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const data = block
            .split(/\r?\n/u)
            .filter((line) => line.startsWith("data: "))
            .map((line) => line.slice(6))
            .join("\n");
          if (data.length > 0) handleEvent(JSON.parse(data) as ResearchProgressEvent);
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setStatus("cancelled");
      } else {
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

  const dossier = completed?.dossier;
  const claim = dossier?.claims[0];
  const source = dossier?.sources[0];

  return (
    <section className="workspace" aria-labelledby="research-title">
      <form onSubmit={submit} className="search-form">
        <div className="section-heading">
          <p className="eyebrow">Recherche publique</p>
          <h2 id="research-title">Entité à vérifier</h2>
        </div>
        <label>
          Nom de la personne ou organisation
          <input
            name="name"
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex. Nom d’une entité publique"
            autoComplete="off"
          />
        </label>
        <label>
          Contexte de désambiguïsation <span>optionnel</span>
          <textarea
            name="context"
            maxLength={300}
            rows={3}
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder="Pays, secteur ou autre indice public"
          />
        </label>
        <p className="privacy-note">
          Saisissez uniquement une personne publique ou une organisation publique.
          N’ajoutez aucune donnée privée ou sensible.
        </p>
        <div className="actions">
          <button type="submit" disabled={status === "running"}>
            {status === "running" ? "Recherche en cours" : "Lancer la recherche"}
          </button>
          {status === "running" ? (
            <button type="button" className="secondary" onClick={cancel}>
              Annuler l’attente
            </button>
          ) : null}
        </div>
      </form>

      <section className="live-panel" aria-live="polite" aria-busy={status === "running"}>
        <div className="live-heading">
          <div>
            <p className="eyebrow">Progression réelle</p>
            <h2>{status === "idle" ? "Prêt" : formatDuration(elapsedMs)}</h2>
          </div>
          <span className={`status-dot status-${status}`} aria-hidden="true" />
        </div>
        {events.length === 0 ? (
          <p className="empty-state">Les étapes du serveur apparaîtront ici, sans faux pourcentage.</p>
        ) : (
          <ol className="timeline">
            {events.map((progressEvent, index) => (
              <li key={`${progressEvent.state}-${index}`}>
                <span>{STEP_LABELS[progressEvent.state]}</span>
                <time>{formatDuration(progressEvent.elapsedMs)}</time>
              </li>
            ))}
          </ol>
        )}
        {status === "cancelled" ? (
          <p className="error-box">Attente annulée localement. Le résultat n’est pas affiché.</p>
        ) : null}
        {requestError ? <p className="error-box">{requestError}</p> : null}
        {failure ? <p className="error-box">{failure.error.message}</p> : null}
      </section>

      {claim && source && completed ? (
        <article className="result-card" aria-labelledby="result-title">
          <div className="section-heading">
            <p className="eyebrow">Résultat unique</p>
            <h2 id="result-title">Affirmation atomique</h2>
          </div>
          <blockquote>{claim.statement}</blockquote>
          <a className="source-link" href={source.resolved_url ?? source.provider_url} target="_blank" rel="noreferrer">
            <span>{source.title}</span>
            <strong>{source.publisher} ↗</strong>
          </a>
          <p className="freshness">Date de publication : inconnue · Fraîcheur : inconnue</p>
          <p className="fine-print">
            Citation fournisseur reliée, page récupérée et extrait exact vérifié.
            L’entaillement sémantique indépendant reste à auditer.
          </p>
          <Receipt receipt={completed.receipt} />
        </article>
      ) : null}
    </section>
  );
}
