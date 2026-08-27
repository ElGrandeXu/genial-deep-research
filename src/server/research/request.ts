import type { ResearchInput } from "./types";

export const MAX_REQUEST_BYTES = 1_024;

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
  if (keys.some((key) => key !== "name" && key !== "context")) {
    throw new ResearchRequestError(
      400,
      "unknown_field",
      "Le corps contient un champ non autorisé.",
    );
  }
  if (typeof record.name !== "string") {
    throw new ResearchRequestError(400, "name_required", "Le nom est requis.");
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

  return context === undefined || context.length === 0 ? { name } : { name, context };
}
