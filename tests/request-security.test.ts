import { describe, expect, it } from "vitest";

import {
  MAX_REQUEST_BYTES,
  parseResearchRequest,
} from "../src/server/research/request";

const endpoint = "https://genial.test/api/research";

function request(
  body: BodyInit | null,
  headers: Record<string, string> = {},
): Request {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      origin: "https://genial.test",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body,
  });
}

function json(value: unknown, headers: Record<string, string> = {}): Request {
  return request(JSON.stringify(value), headers);
}

describe("bounded same-origin research input", () => {
  it("normalizes Unicode while retaining a public source URL", async () => {
    await expect(parseResearchRequest(json({
      name: "  Ａcme   SAS  ",
      entityType: "company",
      context: "  Toulouse   —   https://www.acme.example/equipe  ",
    }))).resolves.toEqual({
      name: "Acme SAS",
      entityType: "company",
      context: "Toulouse — https://www.acme.example/equipe",
    });
  });

  it("rejects a 301-character context", async () => {
    await expect(parseResearchRequest(json({
      name: "Acme SAS",
      context: "x".repeat(301),
    }))).rejects.toMatchObject({ status: 400, code: "invalid_context_length" });
  });

  it("accepts a structured identity source only with a fixed entity type", async () => {
    await expect(parseResearchRequest(json({
      name: "Camille Durand",
      entityType: "person",
      context: "Rennes, design",
      identitySourceUrl: "https://official.public.org/team/camille-durand",
    }))).resolves.toEqual({
      name: "Camille Durand",
      entityType: "person",
      context: "Rennes, design",
      identitySourceUrl: "https://official.public.org/team/camille-durand",
    });
    await expect(parseResearchRequest(json({
      name: "Camille Durand",
      entityType: "auto",
      identitySourceUrl: "https://official.public.org/team/camille-durand",
    }))).rejects.toMatchObject({ status: 400, code: "identity_source_type_required" });
    await expect(parseResearchRequest(json({
      name: "Camille Durand",
      entityType: "person",
      identitySourceUrl: "http://127.0.0.1/private",
    }))).rejects.toMatchObject({ status: 400, code: "invalid_identity_source_url" });
  });

  it("normalizes structured positive hints and rejects conflicting source URLs", async () => {
    await expect(parseResearchRequest(json({
      name: "Ariane Veldor",
      entityType: "person",
      context: "  autre indice  ",
      hints: {
        city: "  Val-sur-Nacre ",
        organization: " Atelier   Orbe Zéro ",
        role: " Responsable Rayonnement Numérique ",
      },
    }))).resolves.toMatchObject({
      context: "autre indice",
      hints: {
        city: "Val-sur-Nacre",
        organization: "Atelier Orbe Zéro",
        role: "Responsable Rayonnement Numérique",
      },
    });
    await expect(parseResearchRequest(json({
      name: "Ariane Veldor",
      entityType: "person",
      identitySourceUrl: "https://official.public.org/a",
      hints: { sourceUrl: "https://official.public.org/b" },
    }))).rejects.toMatchObject({ status: 400, code: "conflicting_source_url" });
  });

  it("rejects unknown fields, malformed JSON and a non-JSON MIME type", async () => {
    await expect(parseResearchRequest(json({
      name: "Acme SAS",
      candidateKey: "forced-selection",
    }))).rejects.toMatchObject({ status: 400, code: "unknown_field" });
    await expect(parseResearchRequest(request("{not-json"))).rejects.toMatchObject({
      status: 400,
      code: "invalid_json",
    });
    await expect(parseResearchRequest(request("{}", {
      "content-type": "text/plain",
    }))).rejects.toMatchObject({ status: 415, code: "content_type_required" });
  });

  it("rejects a foreign origin even when Sec-Fetch-Site is forged", async () => {
    await expect(parseResearchRequest(json({ name: "Acme SAS" }, {
      origin: "https://attacker.example",
      "sec-fetch-site": "same-origin",
    }))).rejects.toMatchObject({ status: 403, code: "origin_rejected" });
  });

  it("rejects declared and streamed bodies above the byte ceiling", async () => {
    await expect(parseResearchRequest(json({ name: "Acme SAS" }, {
      "content-length": String(MAX_REQUEST_BYTES + 1),
    }))).rejects.toMatchObject({ status: 413, code: "body_too_large" });
    await expect(parseResearchRequest(request("x".repeat(MAX_REQUEST_BYTES + 1))))
      .rejects.toMatchObject({ status: 413, code: "body_too_large" });
  });
});
