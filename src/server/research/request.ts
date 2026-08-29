import { validateSourceUrl } from "./source-security";
import type { ResearchInput } from "./types";

export const MAX_REQUEST_BYTES = 4_096;

export class ResearchRequestError extends Error {
  constructor(
    readonly status: 400 | 403 | 413 | 415,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ResearchRequestError";
  }
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function characterCount(value: string): number {
  return Array.from(value).length;
}

async function readBoundedBody(request: Request): Promise<string> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsed = Number.parseInt(declaredLength, 10);
    if (Number.isFinite(parsed) && parsed > MAX_REQUEST_BYTES) {
      throw new ResearchRequestError(
        413,
        "body_too_large",
        "Le corps de la requête dépasse la limite autorisée.",
      );
    }
  }

  if (request.body === null) {
    throw new ResearchRequestError(400, "empty_body", "Le corps JSON est requis.");
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteCount = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new ResearchRequestError(
          413,
          "body_too_large",
          "Le corps de la requête dépasse la limite autorisée.",
        );
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } catch (error) {
    if (error instanceof ResearchRequestError) throw error;
    throw new ResearchRequestError(400, "invalid_encoding", "Le corps JSON est invalide.");
  }

  return body;
}

function enforceSameOrigin(request: Request): void {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin === null || origin !== requestOrigin || fetchSite === "cross-site") {
    throw new ResearchRequestError(
      403,
      "origin_rejected",
      "Cette requête doit provenir de l’interface Génial.",
    );
  }
}

export async function parseResearchRequest(request: Request): Promise<ResearchInput> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType?.toLowerCase() !== "application/json") {
    throw new ResearchRequestError(
      415,
      "content_type_required",
      "Content-Type application/json est requis.",
    );
  }
  enforceSameOrigin(request);

  const body = await readBoundedBody(request);
  let value: unknown;
  try {
    value = JSON.parse(body) as unknown;
  } catch {
    throw new ResearchRequestError(400, "invalid_json", "Le corps JSON est invalide.");
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ResearchRequestError(400, "invalid_body", "Le corps JSON est invalide.");
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.some(
      (key) => key !== "name" && key !== "context" && key !== "entityType" &&
        key !== "identitySourceUrl" && key !== "hints",
    )
  ) {
    throw new ResearchRequestError(
      400,
      "unknown_field",
      "Le corps contient un champ non autorisé.",
    );
  }
  if (typeof record.name !== "string") {
    throw new ResearchRequestError(400, "name_required", "Le nom est requis.");
  }

  const entityType = record.entityType ?? "auto";
  if (
    entityType !== "auto" &&
    entityType !== "person" &&
    entityType !== "company"
  ) {
    throw new ResearchRequestError(
      400,
      "invalid_entity_type",
      "Le type doit être auto, person ou company.",
    );
  }

  const name = normalizeText(record.name);
  const nameLength = characterCount(name);
  if (nameLength < 2 || nameLength > 120) {
    throw new ResearchRequestError(
      400,
      "invalid_name_length",
      "Le nom doit contenir entre 2 et 120 caractères.",
    );
  }

  if (record.context !== undefined && typeof record.context !== "string") {
    throw new ResearchRequestError(
      400,
      "invalid_context",
      "Le contexte doit être une chaîne de caractères.",
    );
  }
  const context =
    typeof record.context === "string" ? normalizeText(record.context) : undefined;
  if (context !== undefined && characterCount(context) > 300) {
    throw new ResearchRequestError(
      400,
      "invalid_context_length",
      "Le contexte ne peut pas dépasser 300 caractères.",
    );
  }

  if (record.hints !== undefined && (
    typeof record.hints !== "object" || record.hints === null || Array.isArray(record.hints)
  )) {
    throw new ResearchRequestError(400, "invalid_hints", "Les indices structurés sont invalides.");
  }
  const rawHints = (record.hints ?? {}) as Record<string, unknown>;
  if (Object.keys(rawHints).some((key) =>
    !["city", "organization", "role", "industry", "sourceUrl"].includes(key)
  )) {
    throw new ResearchRequestError(400, "unknown_hint", "Un indice structuré n’est pas autorisé.");
  }
  const hintLimits = { city: 100, organization: 160, role: 160, industry: 160 } as const;
  const textHints: Partial<Record<keyof typeof hintLimits, string>> = {};
  for (const [key, maximum] of Object.entries(hintLimits) as [keyof typeof hintLimits, number][]) {
    const raw = rawHints[key];
    if (raw === undefined) continue;
    if (typeof raw !== "string") {
      throw new ResearchRequestError(400, "invalid_hint", `L’indice ${key} doit être du texte.`);
    }
    const normalized = normalizeText(raw);
    if (normalized.length === 0 || characterCount(normalized) > maximum) {
      throw new ResearchRequestError(400, "invalid_hint_length", `L’indice ${key} est vide ou trop long.`);
    }
    textHints[key] = normalized;
  }

  if (
    record.identitySourceUrl !== undefined &&
    typeof record.identitySourceUrl !== "string"
  ) {
    throw new ResearchRequestError(
      400,
      "invalid_identity_source_url",
      "La source d’identité doit être une URL publique HTTPS.",
    );
  }
  let identitySourceUrl: string | undefined;
  if (typeof record.identitySourceUrl === "string") {
    if (entityType === "auto") {
      throw new ResearchRequestError(
        400,
        "identity_source_type_required",
        "Le type de l’entité doit être fixé pour utiliser une source d’identité.",
      );
    }
    try {
      identitySourceUrl = validateSourceUrl(
        record.identitySourceUrl,
        "citation",
      ).safeHref;
    } catch {
      throw new ResearchRequestError(
        400,
        "invalid_identity_source_url",
        "La source d’identité doit être une URL publique HTTPS.",
      );
    }
  }

  let hintedSourceUrl: string | undefined;
  if (rawHints.sourceUrl !== undefined) {
    if (typeof rawHints.sourceUrl !== "string" || entityType === "auto") {
      throw new ResearchRequestError(
        400,
        "invalid_source_url",
        "Une URL source publique exige un type d’entité fixé.",
      );
    }
    try {
      hintedSourceUrl = validateSourceUrl(rawHints.sourceUrl, "citation").safeHref;
    } catch {
      throw new ResearchRequestError(400, "invalid_source_url", "La source doit être une URL publique HTTPS.");
    }
  }
  if (
    hintedSourceUrl !== undefined && identitySourceUrl !== undefined &&
    hintedSourceUrl !== identitySourceUrl
  ) {
    throw new ResearchRequestError(
      400,
      "conflicting_source_url",
      "Les deux URL source fournies ne désignent pas la même page.",
    );
  }
  const sourceUrl = hintedSourceUrl ?? identitySourceUrl;
  const hints = {
    ...textHints,
    ...(hintedSourceUrl === undefined ? {} : { sourceUrl: hintedSourceUrl }),
  };

  return {
    name,
    entityType,
    ...(context === undefined || context.length === 0 ? {} : { context }),
    ...(sourceUrl === undefined ? {} : { identitySourceUrl: sourceUrl }),
    ...(Object.keys(hints).length === 0 ? {} : { hints }),
  };
}
