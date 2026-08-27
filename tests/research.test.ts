import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildPrompt,
  createOpenAIResearchProvider,
  ProviderInvocationError,
} from "../src/server/ai/providers";
import { validateResearchDossier } from "../src/domain/contract-validator";
import { validateRuntimeInvariants } from "../src/domain/runtime-invariants";
import { parseResearchRequest } from "../src/server/research/request";
import { executeResearch } from "../src/server/research/service";
import { ResearchPipelineError } from "../src/server/research/errors";
import type {
  ProviderFactCandidate,
  ProviderIdentityCandidate,
  ProviderResearchDocument,
  ProviderResearchResult,
  ResearchInput,
  ResearchProgressEvent,
  ResearchProvider,
  SourceVerifier,
} from "../src/server/research/types";

const sourceA = "https://example.public.org/about";
const sourceB = "https://registry.public.org/airbus";
const sourceC = "https://news.public.org/airbus-2025";
const consultedAt = "2026-08-27T12:00:00.000Z";

const identityCandidate: ProviderIdentityCandidate = {
  displayName: "Airbus SE",
  entityType: "company",
  statement: "Airbus SE is a European aerospace company.",
  structuredUrl: sourceA,
  excerpt: "Airbus SE is a European aerospace company.",
  prefix: null,
  suffix: null,
};

function fact(
  excerpt: string,
  url: string,
  overrides: Partial<ProviderFactCandidate> = {},
): ProviderFactCandidate {
  return {
    category: "activity",
    entityType: "company",
    statement: excerpt,
    predicate: "activity",
    scopeType: "company",
    scopeLabel: "Airbus SE",
    factPeriodLabel: null,
    factDate: null,
    normalizedValue: null,
    unit: null,
    currency: null,
    contradictionKey: null,
    structuredUrl: url,
    excerpt,
    prefix: null,
    suffix: null,
    ...overrides,
  };
}

function resolvedDocument(
  overrides: Partial<ProviderResearchDocument> = {},
): ProviderResearchDocument {
  return {
    identityStatus: "resolved",
    entityType: "company",
    candidates: [identityCandidate],
    claims: [
      fact("Airbus designs and manufactures commercial aircraft.", sourceA),
      fact("Airbus SE has its registered office in Leiden.", sourceB, {
        category: "geography",
        predicate: "registered_office",
      }),
      fact("In 2025, Airbus delivered 793 commercial aircraft.", sourceC, {
        category: "metric",
        predicate: "aircraft_deliveries",
        factPeriodLabel: "2025",
        factDate: "2025",
        normalizedValue: "793",
        unit: "aircraft",
      }),
    ],
    missingCategories: [],
    ...overrides,
  };
}

function providerResult(
  document: ProviderResearchDocument = resolvedDocument(),
  overrides: Partial<ProviderResearchResult> = {},
): ProviderResearchResult {
  const urls = [...new Set([
    ...document.candidates.map(({ structuredUrl }) => structuredUrl),
    ...document.claims.map(({ structuredUrl }) => structuredUrl),
  ])];
  return {
    text: "STRUCTURED_OUTPUT_REDACTED_FROM_PUBLIC_RESULT",
    document,
    citations: [],
    sources: urls.map((url, index) => ({
      sourceId: `source-${index + 1}`,
      url,
      title: `Provider title ${index + 1}`,
    })),
    webSearchCalls: [{
      toolCallId: "tool-search",
      sources: urls.map((url) => ({ url })),
    }],
    webSearchActions: [{ toolCallId: "tool-search", actionType: "search" }],
    webSearchInspections: [],
    webSearchActionCount: 1,
    webSearchQueryCount: 1,
    webSearchInspectionCount: 0,
    webSearchUniqueCallCount: 1,
    webSearchActionPolicyStatus: "supported",
    webSearchActionPolicyCode: null,
    providerMetadataStatus: "supported",
    providerHttpCalls: 1,
    toolCalls: 1,
    usage: {
      inputTokens: 2_000,
      cachedInputTokens: 200,
      outputTokens: 500,
      reasoningTokens: 100,
      totalTokens: 2_500,
    },
    providerDurationMs: 800,
    finishReason: "stop",
    requestId: "request-synthetic",
    ...overrides,
  };
}

function exactSourceVerifier(options: {
  readonly rejectExcerpt?: string;
} = {}): SourceVerifier {
  return {
    async verify(request) {
      if (request.candidate.excerpt === options.rejectExcerpt) {
        throw new ResearchPipelineError(
          "source_excerpt_missing",
          "Synthetic exact excerpt miss.",
          { sourceFetchCount: 1, sourceVerificationMs: 4 },
        );
      }
      const url = request.candidate.structuredUrl;
      return {
        citation: request.citation,
        citationUrl: url,
        finalUrl: url,
        title: `Verified title — ${new URL(url).hostname}`,
        verifiedExcerpt: request.candidate.excerpt,
        locator: {
          exact: request.candidate.excerpt,
          matchMode: "exact",
          prefix: request.candidate.prefix ?? "",
          suffix: request.candidate.suffix ?? "",
          occurrenceIndex: 0,
          finalUrl: url,
          citationUrl: url,
          retrievedAt: consultedAt,
          normalizedTextSha256: "a".repeat(64),
          contentType: "text/html; charset=utf-8",
          bytesRead: 512,
          redirectCount: 0,
        },
        sourceFetchCount: 1,
        sourceVerificationMs: 4,
      };
    },
  };
}

function makeProvider(result: ProviderResearchResult | Error): ResearchProvider {
  return {
    async research() {
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

async function executeWith(options: {
  readonly result?: ProviderResearchResult | Error;
  readonly input?: ResearchInput;
  readonly sourceVerifier?: SourceVerifier;
} = {}): Promise<ResearchProgressEvent[]> {
  const events: ResearchProgressEvent[] = [];
  await executeResearch({
    input: options.input ?? {
      name: "Airbus SE",
      entityType: "company",
      context: "Groupe aéronautique européen",
    },
    provider: makeProvider(options.result ?? providerResult()),
    sourceVerifier: options.sourceVerifier ?? exactSourceVerifier(),
    signal: new AbortController().signal,
    acceptedMs: 2,
    emit: (event) => events.push(event),
    logger: { info: () => undefined },
    now: () => new Date(consultedAt),
  });
  return events;
}

function completed(events: readonly ResearchProgressEvent[]) {
  const event = events.at(-1);
  if (event?.state !== "completed") {
    throw new Error(`Expected completion, received ${event?.state ?? "nothing"}.`);
  }
  return event;
}

function request(body: unknown): Request {
  return new Request("https://genial.test/api/research", {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      origin: "https://genial.test",
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("provider multi-fact contract", () => {
  it("asks for useful facts, direct proof, identity restraint and honest silence", () => {
    const prompt = buildPrompt({
      name: "Airbus SE",
      entityType: "company",
      context: "Corporate parent, not a subsidiary",
    });
    for (const requirement of [
      "3 à 6 faits utiles",
      "au moins deux pages distinctes",
      "extrait exact, contigu et visible",
      "Ne fusionne jamais des homonymes",
      "identityStatus=ambiguous",
      "identityStatus=not_found",
      "aucune claim",
      "jusqu’à quatre actions Web Search",
      "Type demandé : company",
      "Corporate parent, not a subsidiary",
    ]) {
      expect(prompt).toContain(requirement);
    }
    expect(prompt).not.toContain("exactement une seule requête");
    expect(prompt).not.toContain("exactement sept lignes");
  });

  it("serializes the structured-output schema, four-action budget and privacy options", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = ["unit", "test", "placeholder"].join("-");
    let requestBody: Record<string, unknown> | undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        const raw = typeof init?.body === "string"
          ? init.body
          : input instanceof Request
            ? await input.clone().text()
            : "";
        requestBody = JSON.parse(raw) as Record<string, unknown>;
        throw new Error("synthetic transport stop");
      },
    );

    try {
      await expect(
        createOpenAIResearchProvider().research(
          { name: "Airbus SE", entityType: "company" },
          new AbortController().signal,
        ),
      ).rejects.toBeInstanceOf(ProviderInvocationError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(requestBody).toMatchObject({
        max_tool_calls: 4,
        parallel_tool_calls: false,
        store: false,
        reasoning: { effort: "low" },
        text: {
          verbosity: "medium",
          format: {
            type: "json_schema",
            name: "verified_public_dossier",
            strict: true,
          },
        },
      });
      expect(JSON.stringify(requestBody)).toContain("identityStatus");
      expect(JSON.stringify(requestBody)).toContain("contradictionKey");
      expect(JSON.stringify(requestBody)).toContain("missingCategories");
      const serializedRequest = JSON.stringify(requestBody);
      expect(serializedRequest).not.toContain('"format":"uri"');
      expect(serializedRequest).not.toContain('"minLength"');
      expect(serializedRequest).not.toContain('"maxLength"');
      expect(serializedRequest).not.toContain('"maxItems"');
    } finally {
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
    }
  });
});

describe("research request", () => {
  it.each(["auto", "person", "company"] as const)(
    "accepts and preserves entityType=%s",
    async (entityType) => {
      await expect(parseResearchRequest(request({
        name: "  Airbus   SE  ",
        entityType,
        context: "  Toulouse   aéronautique ",
      }))).resolves.toEqual({
        name: "Airbus SE",
        entityType,
        context: "Toulouse aéronautique",
      });
    },
  );

  it("defaults a legacy request to auto and rejects an unknown type", async () => {
    await expect(parseResearchRequest(request({ name: "Airbus SE" })))
      .resolves.toEqual({ name: "Airbus SE", entityType: "auto" });
    await expect(parseResearchRequest(request({
      name: "Airbus SE",
      entityType: "organisation",
    }))).rejects.toMatchObject({
      status: 400,
      code: "invalid_entity_type",
    });
  });
});

describe("verified dossier service", () => {
  it("builds a complete dossier with multiple exact facts and distinct pages", async () => {
    const events = await executeWith();
    expect(events.map(({ state }) => state)).toEqual([
      "accepted",
      "resolving_identity",
      "source_verifying",
      "building",
      "validating",
      "completed",
    ]);
    const terminal = completed(events);
    expect(terminal.dossier.global_status).toBe("complete_within_scope");
    expect(terminal.dossier.identity.status).toBe("resolved");
    expect(terminal.dossier.claims.length).toBeGreaterThanOrEqual(3);
    expect(new Set(terminal.dossier.sources.map(({ resolved_url }) => resolved_url)).size)
      .toBeGreaterThanOrEqual(2);
    for (const claim of terminal.dossier.claims) {
      const proofs = terminal.dossier.evidence.filter(({ evidence_id }) =>
        claim.evidence_ids.includes(evidence_id));
      expect(proofs).toHaveLength(1);
      expect(claim.statement).toBe(proofs[0]?.excerpt);
      const source = terminal.dossier.sources.find(
        ({ source_id }) => source_id === proofs[0]?.source_id,
      );
      expect(source?.title).toMatch(/^Verified title/u);
      expect(source?.resolved_url).toMatch(/^https:\/\//u);
      expect(source?.accessed_at).toBe(consultedAt);
    }
    expect(validateResearchDossier(terminal.dossier)).toMatchObject({ ok: true });
    expect(validateRuntimeInvariants(terminal.dossier)).toEqual({ ok: true });
    expect(terminal.receipt.estimatedCostUsd).not.toBeNull();
    expect(terminal.receipt.estimatedCostUsd ?? 1).toBeLessThan(0.1);
  });

  it("keeps ambiguous identities separate and emits no displayed fact", async () => {
    const candidateOne: ProviderIdentityCandidate = {
      ...identityCandidate,
      displayName: "Alex Martin",
      entityType: "person",
      statement: "Alex Martin is the founder of Alpine Systems.",
      excerpt: "Alex Martin is the founder of Alpine Systems.",
      structuredUrl: sourceA,
    };
    const candidateTwo: ProviderIdentityCandidate = {
      ...identityCandidate,
      displayName: "Alex Martin",
      entityType: "person",
      statement: "Alex Martin joined the University of Lyon in 2024.",
      excerpt: "Alex Martin joined the University of Lyon in 2024.",
      structuredUrl: sourceB,
    };
    const document: ProviderResearchDocument = {
      identityStatus: "ambiguous",
      entityType: null,
      candidates: [candidateOne, candidateTwo],
      claims: [],
      missingCategories: [],
    };
    const terminal = completed(await executeWith({
      result: providerResult(document),
      input: { name: "Alex Martin", entityType: "auto" },
    }));
    expect(terminal.dossier).toMatchObject({
      global_status: "needs_clarification",
      identity: { status: "ambiguous", selected_subject_id: null },
    });
    expect(terminal.dossier.identity.candidates).toHaveLength(2);
    expect(terminal.dossier.claims.filter(
      ({ presentation_decision }) => presentation_decision === "display_fact",
    )).toHaveLength(0);
    expect(terminal.dossier.presentation.ambiguity_claim_ids).toHaveLength(2);
    expect(validateRuntimeInvariants(terminal.dossier)).toEqual({ ok: true });
  });

  it("returns honest silence when public evidence is insufficient", async () => {
    const verify = vi.fn<SourceVerifier["verify"]>();
    const terminal = completed(await executeWith({
      result: providerResult({
        identityStatus: "not_found",
        entityType: null,
        candidates: [],
        claims: [],
        missingCategories: ["identity", "activity"],
      }),
      input: { name: "Entité synthétique introuvable", entityType: "auto" },
      sourceVerifier: { verify },
    }));
    expect(verify).not.toHaveBeenCalled();
    expect(terminal.dossier).toMatchObject({
      result_mode: "silence",
      global_status: "insufficient_evidence",
      identity: { status: "not_found_within_scope" },
      claims: [],
      evidence: [],
      sources: [],
    });
    expect(terminal.dossier.unknowns.length).toBeGreaterThan(0);
    expect(validateRuntimeInvariants(terminal.dossier)).toEqual({ ok: true });
  });

  it("shows contradictory values and never selects one silently", async () => {
    const document = resolvedDocument({
      claims: [
        fact("The 2024 workforce was 150,000 employees.", sourceB, {
          category: "metric",
          predicate: "workforce",
          factPeriodLabel: "2024",
          factDate: "2024",
          normalizedValue: "150000",
          unit: "employees",
          contradictionKey: "workforce-2024",
        }),
        fact("The 2024 workforce was 157,894 employees.", sourceC, {
          category: "metric",
          predicate: "workforce",
          factPeriodLabel: "2024",
          factDate: "2024",
          normalizedValue: "157894",
          unit: "employees",
          contradictionKey: "workforce-2024",
        }),
      ],
    });
    const terminal = completed(await executeWith({ result: providerResult(document) }));
    expect(terminal.dossier.global_status).toBe("partial");
    expect(terminal.dossier.contradictions).toHaveLength(1);
    expect(terminal.dossier.contradictions[0]).toMatchObject({
      classification: "contradiction",
      visible: true,
      versions: expect.arrayContaining([
        expect.objectContaining({ normalized_value: "150000" }),
        expect.objectContaining({ normalized_value: "157894" }),
      ]),
    });
    expect(terminal.dossier.contradictions[0]?.explanation).toContain(
      "aucune version n’est choisie",
    );
    expect(validateRuntimeInvariants(terminal.dossier)).toEqual({ ok: true });
  });

  it("marks a proven old fact as historical and an undated fact as unknown", async () => {
    const document = resolvedDocument({
      claims: [
        fact("In 2023, Airbus employed 147,893 people.", sourceB, {
          category: "metric",
          predicate: "workforce",
          factPeriodLabel: "2023",
          factDate: "2023",
          normalizedValue: "147893",
          unit: "people",
        }),
        fact("Airbus manufactures commercial aircraft.", sourceA),
      ],
    });
    const terminal = completed(await executeWith({ result: providerResult(document) }));
    const oldFact = terminal.dossier.claims.find(({ statement }) =>
      statement.includes("2023"));
    const undated = terminal.dossier.claims.find(({ statement }) =>
      statement.includes("manufactures"));
    expect(oldFact).toMatchObject({
      temporal_status: "historical",
      claim_state: "historical",
      fact_period: { status: "stated", label: "2023" },
    });
    expect(undated).toMatchObject({
      temporal_status: "unknown",
      fact_period: { status: "unknown", as_of: null },
    });
  });

  it("discards a rejected proof, exposes the gap and never leaks its statement", async () => {
    const rejected = "Airbus has a synthetic unsupported secret fact.";
    const document = resolvedDocument({
      claims: [
        ...resolvedDocument().claims,
        fact(rejected, "https://bad.public.org/unavailable", {
          category: "other",
          predicate: "unsupported",
        }),
      ],
    });
    const terminal = completed(await executeWith({
      result: providerResult(document),
      sourceVerifier: exactSourceVerifier({ rejectExcerpt: rejected }),
    }));
    expect(JSON.stringify(terminal.dossier)).not.toContain(rejected);
    expect(terminal.dossier.unknowns).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "source_inaccessible" }),
    ]));
    expect(terminal.dossier.claims.length).toBeGreaterThanOrEqual(3);
    expect(validateRuntimeInvariants(terminal.dossier)).toEqual({ ok: true });
  });

  it("fails technically when provider accounting exceeds the action ceiling", async () => {
    const result = providerResult(resolvedDocument(), {
      webSearchCalls: Array.from({ length: 5 }, (_, index) => ({
        toolCallId: `search-${index}`,
        sources: [{ url: sourceA }],
      })),
      webSearchActions: Array.from({ length: 5 }, (_, index) => ({
        toolCallId: `search-${index}`,
        actionType: "search" as const,
      })),
      webSearchActionCount: 5,
      webSearchQueryCount: 5,
      webSearchUniqueCallCount: 5,
      toolCalls: 5,
    });
    const events = await executeWith({ result });
    expect(events.map(({ state }) => state)).toEqual([
      "accepted",
      "resolving_identity",
      "failed",
    ]);
    expect(events.at(-1)).toMatchObject({ state: "failed" });
  });
});
