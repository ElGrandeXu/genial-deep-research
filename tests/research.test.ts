import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildPrompt,
  createOpenAIResearchProvider,
  ProviderInvocationError,
} from "../src/server/ai/providers";
import { createResearchPostHandler } from "../src/app/api/research/route";
import { validateResearchDossier } from "../src/domain/contract-validator";
import { executeResearch } from "../src/server/research/service";
import type {
  ProviderResearchResult,
  ResearchProgressEvent,
  ResearchProvider,
  SourceVerifier,
} from "../src/server/research/types";

const requestUrl = "https://genial.test/api/research";
const claim = "Airbus SE est une société européenne.";
const sourceUrl = "https://research.public.org/airbus";
const providerText = [
  "STATUS: evidence",
  "ENTITY_TYPE: company",
  `CLAIM: ${claim}`,
  `SOURCE_URL: ${sourceUrl}`,
  `EXCERPT: ${claim}`,
  "PREFIX: NONE",
  "SUFFIX: NONE",
].join("\n");
const claimStart = providerText.indexOf(claim);

function providerResult(
  overrides: Partial<ProviderResearchResult> = {},
): ProviderResearchResult {
  return {
    text: providerText,
    citations: [
      {
        provider: "openai",
        metadataType: "url_citation",
        sourceId: "source-synthetic",
        url: sourceUrl,
        title: "Our history | Airbus",
        generatedTextStart: claimStart,
        generatedTextEnd: claimStart + claim.length,
        textPartId: "item-synthetic",
        toolCallId: "tool-synthetic",
      },
    ],
    sources: [
      {
        sourceId: "source-synthetic",
        url: sourceUrl,
        title: "Our history | Airbus",
      },
    ],
    webSearchCalls: [
      {
        toolCallId: "tool-synthetic",
        sources: [{ url: sourceUrl }],
      },
    ],
    webSearchActions: [{ toolCallId: "tool-synthetic", actionType: "search" }],
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
      inputTokens: 1_000,
      cachedInputTokens: 100,
      outputTokens: 100,
      reasoningTokens: 20,
      totalTokens: 1_100,
    },
    providerDurationMs: 900,
    finishReason: "stop",
    requestId: "req-synthetic-test",
    ...overrides,
  };
}

function actionAwareProviderResult(
  inspection: "open_page" | "find_in_page" | null,
): ProviderResearchResult {
  const actions = [
    {
      toolCallId: "tool-search",
      actionType: "search" as const,
    },
    ...(inspection === null
      ? []
      : [{
          toolCallId: "tool-inspection",
          actionType: inspection,
        }]),
  ];
  return providerResult({
    webSearchCalls: [{ toolCallId: "tool-search", sources: [{ url: sourceUrl }] }],
    webSearchActions: actions,
    webSearchInspections:
      inspection === null
        ? []
        : [{
            toolCallId: "tool-inspection",
            actionType: inspection,
            urlStatus: "present",
            url: sourceUrl,
          }],
    webSearchActionCount: actions.length,
    webSearchQueryCount: 1,
    webSearchInspectionCount: inspection === null ? 0 : 1,
    webSearchUniqueCallCount: actions.length,
    webSearchActionPolicyStatus: "supported",
    webSearchActionPolicyCode: null,
    toolCalls: actions.length,
  });
}

function sourceVerifier(
  overrides: Partial<Awaited<ReturnType<SourceVerifier["verify"]>>> = {},
): SourceVerifier {
  return {
    async verify(request) {
      return {
        citation: request.citation,
        citationUrl: sourceUrl,
        finalUrl: sourceUrl,
        title: request.citation.title ?? "Synthetic title",
        verifiedExcerpt: claim,
        locator: {
          exact: claim,
          prefix: "",
          suffix: "",
          occurrenceIndex: 0,
          finalUrl: sourceUrl,
          citationUrl: sourceUrl,
          retrievedAt: "2026-08-26T00:00:00.000Z",
          normalizedTextSha256: "0".repeat(64),
          contentType: "text/html; charset=utf-8",
          bytesRead: 64,
          redirectCount: 0,
        },
        sourceFetchCount: 1,
        sourceVerificationMs: 30,
        ...overrides,
      };
    },
  };
}

function makeProvider(
  result: ProviderResearchResult | Error,
  onCall?: () => void,
): ResearchProvider {
  return {
    async research() {
      onCall?.();
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(requestUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://genial.test",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function parseSse(body: string): ResearchProgressEvent[] {
  return body
    .trim()
    .split(/\r?\n\r?\n/u)
    .map((block) => {
      const data = block
        .split(/\r?\n/u)
        .find((line) => line.startsWith("data: "))
        ?.slice(6);
      if (data === undefined) throw new Error("SSE data missing");
      return JSON.parse(data) as ResearchProgressEvent;
    });
}

async function executeWith(
  result: ProviderResearchResult | Error,
  options: {
    validateDossier?: typeof validateResearchDossier;
    logger?: (record: Readonly<Record<string, unknown>>) => void;
    sourceVerifier?: SourceVerifier;
  } = {},
): Promise<ResearchProgressEvent[]> {
  const events: ResearchProgressEvent[] = [];
  await executeResearch({
    input: { name: "Airbus SE", context: "Groupe aéronautique européen" },
    provider: makeProvider(result),
    sourceVerifier: options.sourceVerifier ?? sourceVerifier(),
    signal: new AbortController().signal,
    acceptedMs: 2,
    emit: (event) => events.push(event),
    logger: { info: options.logger ?? (() => undefined) },
    ...(options.validateDossier === undefined
      ? {}
      : { validateDossier: options.validateDossier }),
  });
  return events;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("M5 sourced research service", () => {
  it("makes the provider envelope and silence fallback explicit", () => {
    const prompt = buildPrompt({
      name: "Airbus SE",
      context: "Corporate parent entity; not an aircraft model or a local subsidiary.",
    });
    for (const required of [
      "exactement sept lignes",
      "sans Markdown, fence, préambule, liste, commentaire ni ligne vide interne",
      "Chaque valeur doit tenir sur une seule ligne",
      "10 à 200 caractères",
      "sans point-virgule, deux-points, saut de ligne",
      "doit couvrir intégralement la valeur de CLAIM",
      "SOURCE_URL doit répéter exactement l’URL de cette citation",
      "URL HTTPS publique directe vers une page web normale",
      "text/html ou application/xhtml+xml",
      "sans exiger connexion, authentification, cookie, formulaire, pièce jointe, téléchargement ni document viewer",
      "doit posséder un titre de document",
      "aucun PDF, même sans extension .pdf",
      "pathname se termine par .pdf sans distinction de casse",
      "aucun fichier, pièce jointe, téléchargement, document viewer, JSON, endpoint API, image, contenu audio ou vidéo",
      "page nécessitant une authentification",
      "exact, contigu, visible, sur une seule ligne et long de 1 à 500 caractères",
      "texte visible réel de la page",
      "snippet de résultats de recherche est insuffisant",
      "au maximum 16 caractères exacts ou la valeur NONE",
      "exactement une seule requête de recherche Web Search",
      "Sélectionne un résultat HTML parmi les résultats de cette unique recherche",
      "Une seule inspection du résultat sélectionné, open_page ou find_in_page, est autorisée si nécessaire",
      "aucune source HTML admissible n’est trouvée dans les résultats de l’unique recherche",
      "N’effectue aucune seconde recherche",
      "Ne transforme jamais une URL PDF en URL supposée",
      "n’invente jamais SOURCE_URL, EXCERPT, PREFIX ni SUFFIX",
      "exactement une ligne : STATUS: silence",
    ]) {
      expect(prompt).toContain(required);
    }
    expect(prompt.endsWith([
      "STATUS: evidence",
      "ENTITY_TYPE: person|company",
      "CLAIM: proposition simple de 10 à 200 caractères",
      "SOURCE_URL: URL exacte de la citation",
      "EXCERPT: extrait exact contigu de 1 à 500 caractères",
      "PREFIX: 16 caractères maximum ou NONE",
      "SUFFIX: 16 caractères maximum ou NONE",
    ].join("\n"))).toBe(true);
    expect(prompt).not.toContain("cherche une autre source");
  });

  it("serializes the typed OpenAI tool budget with the existing provider options", async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = ["unit", "test", "value"].join("-");
    let requestBody: Record<string, unknown> | undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        const serialized =
          typeof init?.body === "string"
            ? init.body
            : input instanceof Request
              ? await input.clone().text()
              : "";
        requestBody = JSON.parse(serialized) as Record<string, unknown>;
        throw new Error("synthetic transport stop");
      },
    );

    try {
      await expect(
        createOpenAIResearchProvider().research(
          { name: "Airbus SE" },
          new AbortController().signal,
        ),
      ).rejects.toBeInstanceOf(ProviderInvocationError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(requestBody).toMatchObject({
        max_tool_calls: 2,
        parallel_tool_calls: false,
        store: false,
        reasoning: { effort: "low" },
        text: { verbosity: "low" },
      });
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  });

  it("completes with one atomic claim, one provider source and an M2-valid dossier", async () => {
    const events = await executeWith(providerResult());
    const completed = events.at(-1);

    expect(events.map(({ state }) => state)).toEqual([
      "accepted",
      "searching",
      "source_verifying",
      "validating",
      "completed",
    ]);
    expect(completed?.state).toBe("completed");
    if (completed?.state !== "completed") throw new Error("completion missing");
    expect(completed.dossier.claims).toHaveLength(1);
    expect(completed.dossier.sources).toHaveLength(1);
    expect(completed.dossier.claims[0]?.statement).toBe(claim);
    expect(completed.dossier.sources[0]?.provider_url).toMatch(/^https:\/\//u);
    expect(validateResearchDossier(completed.dossier)).toMatchObject({ ok: true });
  });

  it("fails closed when no citation annotation is present", async () => {
    const events = await executeWith(providerResult({
      citations: [],
      webSearchCalls: [{
        toolCallId: "tool-synthetic",
        sources: null,
      }],
    }));
    expect(events.at(-1)).toMatchObject({
      state: "failed",
      error: { code: "inspection_url_missing" },
    });
  });

  it("rejects an URL present only in generated text", async () => {
    const text = providerText.replace(claim, "Airbus SE figure sur research.public.org.");
    const events = await executeWith(
      providerResult({
        text,
        citations: [],
        sources: [],
        webSearchCalls: [{
          toolCallId: "tool-synthetic",
          sources: [],
        }],
      }),
    );
    expect(events.at(-1)).toMatchObject({
      state: "failed",
      error: { code: "inspection_url_missing" },
    });
  });

  it("rejects a response containing multiple independent facts", async () => {
    const statement = "Airbus SE est européenne et Airbus SE fabrique des avions.";
    const text = [
      "STATUS: evidence",
      "ENTITY_TYPE: company",
      `CLAIM: ${statement}`,
      `SOURCE_URL: ${sourceUrl}`,
      `EXCERPT: ${claim}`,
      "PREFIX: NONE",
      "SUFFIX: NONE",
    ].join("\n");
    const start = text.indexOf(statement);
    const events = await executeWith(
      providerResult({
        text,
        citations: [
          {
            provider: "openai",
            metadataType: "url_citation",
            sourceId: "source-synthetic",
            url: sourceUrl,
            title: "About Airbus",
            generatedTextStart: start,
            generatedTextEnd: start + statement.length,
            textPartId: "item-synthetic",
            toolCallId: "tool-synthetic",
          },
        ],
        sources: [{ sourceId: "source-synthetic", url: sourceUrl, title: "About Airbus" }],
      }),
    );
    expect(events.at(-1)).toMatchObject({
      state: "failed",
      error: { code: "structured_output_invalid" },
    });
  });

  it("rejects a result when the canonical M2 validator rejects it", async () => {
    const events = await executeWith(providerResult(), {
      validateDossier: () => ({
        ok: false,
        errors: [{ instancePath: "/claims", keyword: "test", message: "invalid" }],
      }),
    });
    expect(events.at(-1)).toMatchObject({
      state: "failed",
      error: { code: "truth_contract_rejected" },
    });
  });

  it("reports provider timeout without leaking request data", async () => {
    const events = await executeWith(
      new ProviderInvocationError(
        new DOMException("Synthetic timeout", "TimeoutError"),
        {
          callsAttempted: 1,
          durationMs: 120_000,
          abortReasonName: "TimeoutError",
        },
      ),
    );
    expect(events.at(-1)).toMatchObject({
      state: "failed",
      error: { code: "provider_timeout", retryable: true },
      receipt: { category: "timeout", callsAttempted: 1 },
    });
    expect(JSON.stringify(events.at(-1))).not.toContain("Groupe aéronautique européen");
  });

  it("measures usage, web-search cost and latency", async () => {
    const events = await executeWith(providerResult());
    const completed = events.at(-1);
    if (completed?.state !== "completed") throw new Error("completion missing");
    expect(completed.receipt).toMatchObject({
      providerHttpCalls: 1,
      toolCalls: 1,
      webSearchQueryCount: 1,
      webSearchInspectionCount: 0,
      inputTokens: 1_000,
      cachedInputTokens: 100,
      outputTokens: 100,
      reasoningTokens: 20,
      totalTokens: 1_100,
      estimatedCostUsd: 0.010302,
    });
    expect(completed.receipt.durations.totalMs).toBeGreaterThanOrEqual(0);
  });

  it.each([
    ["search only", null, 1, 0.010302],
    ["search plus open_page", "open_page", 2, 0.020302],
    ["search plus find_in_page", "find_in_page", 2, 0.020302],
  ] as const)(
    "admits and conservatively bills %s",
    async (_case, inspection, actions, expectedCost) => {
      const events = await executeWith(actionAwareProviderResult(inspection));
      expect(events.map(({ state }) => state)).toEqual([
        "accepted",
        "searching",
        "source_verifying",
        "validating",
        "completed",
      ]);
      const completed = events.at(-1);
      if (completed?.state !== "completed") throw new Error("completion missing");
      expect(completed.receipt).toMatchObject({
        toolCalls: actions,
        webSearchQueryCount: 1,
        webSearchInspectionCount: inspection === null ? 0 : 1,
        estimatedCostUsd: expectedCost,
      });
    },
  );

  it.each([
    [
      "two searches",
      providerResult({
        webSearchCalls: [
          { toolCallId: "search-1", sources: [{ url: sourceUrl }] },
          { toolCallId: "search-2", sources: [{ url: sourceUrl }] },
        ],
        webSearchActions: [
          { toolCallId: "search-1", actionType: "search" },
          { toolCallId: "search-2", actionType: "search" },
        ],
        webSearchActionCount: 2,
        webSearchQueryCount: 2,
        webSearchInspectionCount: 0,
        webSearchUniqueCallCount: 2,
        webSearchActionPolicyStatus: "rejected",
        webSearchActionPolicyCode: "web_search_not_unique",
        toolCalls: 2,
      }),
      "web_search_not_unique",
    ],
    [
      "inspection without search",
      providerResult({
        webSearchCalls: [],
        webSearchActions: [{
          toolCallId: "inspection-1",
          actionType: "open_page",
        }],
        webSearchActionCount: 1,
        webSearchQueryCount: 0,
        webSearchInspectionCount: 1,
        webSearchUniqueCallCount: 1,
        webSearchActionPolicyStatus: "rejected",
        webSearchActionPolicyCode: "web_search_action_invalid",
      }),
      "web_search_action_invalid",
    ],
    [
      "two inspections",
      providerResult({
        webSearchCalls: [{ toolCallId: "search-1", sources: [{ url: sourceUrl }] }],
        webSearchActions: [
          { toolCallId: "search-1", actionType: "search" },
          { toolCallId: "inspection-1", actionType: "open_page" },
          { toolCallId: "inspection-2", actionType: "find_in_page" },
        ],
        webSearchActionCount: 3,
        webSearchQueryCount: 1,
        webSearchInspectionCount: 2,
        webSearchUniqueCallCount: 3,
        webSearchActionPolicyStatus: "rejected",
        webSearchActionPolicyCode: "inspection_url_ambiguous",
        toolCalls: 3,
      }),
      "inspection_url_ambiguous",
    ],
    [
      "counter incoherence",
      actionAwareProviderResult("open_page"),
      "web_search_action_invalid",
    ],
  ] as const)("rejects %s before source verification", async (_case, rawResult, code) => {
    const result =
      _case === "counter incoherence"
        ? { ...rawResult, webSearchActionCount: 1 }
        : rawResult;
    let verificationCalls = 0;
    const verifier = sourceVerifier();
    const events = await executeWith(result, {
      sourceVerifier: {
        async verify(request) {
          verificationCalls += 1;
          return verifier.verify(request);
        },
      },
    });
    expect(events.map(({ state }) => state)).toEqual([
      "accepted",
      "searching",
      "failed",
    ]);
    expect(events.at(-1)).toMatchObject({ state: "failed", error: { code } });
    expect(verificationCalls).toBe(0);
  });

  it("keeps the two-action theoretical ceiling below 0.05 USD", async () => {
    const bounded = actionAwareProviderResult("open_page");
    const events = await executeWith(
      {
        ...bounded,
        usage: {
          inputTokens: 100_000,
          cachedInputTokens: 0,
          outputTokens: 700,
          reasoningTokens: 700,
          totalTokens: 100_700,
        },
      },
    );
    const completed = events.at(-1);
    if (completed?.state !== "completed") throw new Error("completion missing");
    expect(completed.receipt.estimatedCostUsd).not.toBeNull();
    expect(completed.receipt.estimatedCostUsd ?? 1).toBeLessThan(0.05);
  });

  it("keeps action diagnostics free of IDs, queries, URLs and raw content", async () => {
    const result = providerResult({
      webSearchCalls: [
        {
          toolCallId: "PRIVATE_TOOL_CALL_ID",
          sources: [{ url: "https://private.invalid/source" }],
        },
        {
          toolCallId: "PRIVATE_SECOND_TOOL_CALL_ID",
          sources: [{ url: "https://private.invalid/second" }],
        },
      ],
      webSearchActions: [
        { toolCallId: "PRIVATE_TOOL_CALL_ID", actionType: "search" },
        { toolCallId: "PRIVATE_SECOND_TOOL_CALL_ID", actionType: "search" },
      ],
      webSearchActionCount: 2,
      webSearchQueryCount: 2,
      webSearchInspectionCount: 0,
      webSearchUniqueCallCount: 2,
      webSearchActionPolicyStatus: "rejected",
      webSearchActionPolicyCode: "web_search_not_unique",
      toolCalls: 2,
    });
    const terminal = (await executeWith(result)).at(-1);
    const serialized = JSON.stringify(terminal);
    expect(serialized).not.toContain("PRIVATE_TOOL_CALL_ID");
    expect(serialized).not.toContain("PRIVATE_SECOND_TOOL_CALL_ID");
    expect(serialized).not.toContain("private.invalid");
    expect(serialized).not.toContain(providerText);
    expect(terminal).toMatchObject({
      receipt: {
        toolCallCount: 2,
        webSearchQueryCount: 2,
        webSearchInspectionCount: 0,
      },
    });
  });

  it("logs only the non-sensitive receipt", async () => {
    const records: Readonly<Record<string, unknown>>[] = [];
    await executeWith(providerResult(), { logger: (record) => records.push(record) });
    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain("Airbus SE");
    expect(serialized).not.toContain("Groupe aéronautique européen");
    expect(serialized).not.toContain(providerText);
    expect(serialized).not.toContain("authorization");
    expect(records).toHaveLength(1);
  });
});

describe("POST /api/research", () => {
  it("streams the real event order and calls the provider once", async () => {
    let calls = 0;
    const handler = createResearchPostHandler({
      providerFactory: () => makeProvider(providerResult(), () => (calls += 1)),
      sourceVerifierFactory: sourceVerifier,
      logger: { info: () => undefined },
    });
    const response = await handler(makeRequest({ name: "Airbus SE" }));
    const events = parseSse(await response.text());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(events.map(({ state }) => state)).toEqual([
      "accepted",
      "searching",
      "source_verifying",
      "validating",
      "completed",
    ]);
    expect(calls).toBe(1);
  });

  it("rejects an overlong name before constructing or calling a provider", async () => {
    let factoryCalls = 0;
    const handler = createResearchPostHandler({
      providerFactory: () => {
        factoryCalls += 1;
        return makeProvider(providerResult());
      },
      sourceVerifierFactory: sourceVerifier,
      logger: { info: () => undefined },
    });
    const response = await handler(makeRequest({ name: "A".repeat(121) }));
    expect(response.status).toBe(400);
    expect(factoryCalls).toBe(0);
  });

  it("rejects an additional field before the provider boundary", async () => {
    let factoryCalls = 0;
    const handler = createResearchPostHandler({
      providerFactory: () => {
        factoryCalls += 1;
        return makeProvider(providerResult());
      },
      sourceVerifierFactory: sourceVerifier,
      logger: { info: () => undefined },
    });
    const response = await handler(makeRequest({ name: "Airbus SE", hidden: true }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "unknown_field" },
    });
    expect(factoryCalls).toBe(0);
  });

  it("requires JSON and same-origin before the provider boundary", async () => {
    const factory = vi.fn(() => makeProvider(providerResult()));
    const handler = createResearchPostHandler({
      providerFactory: factory,
      sourceVerifierFactory: sourceVerifier,
      logger: { info: () => undefined },
    });
    const wrongType = await handler(
      makeRequest({ name: "Airbus SE" }, { "content-type": "text/plain" }),
    );
    const crossOrigin = await handler(
      makeRequest({ name: "Airbus SE" }, { origin: "https://attacker.invalid" }),
    );
    expect(wrongType.status).toBe(415);
    expect(crossOrigin.status).toBe(403);
    expect(factory).not.toHaveBeenCalled();
  });

  it("returns an explicit missing-configuration failure without exposing a key", async () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const handler = createResearchPostHandler({
        providerFactory: createOpenAIResearchProvider,
        sourceVerifierFactory: sourceVerifier,
        logger: { info: () => undefined },
      });
      const response = await handler(makeRequest({ name: "Airbus SE" }));
      const events = parseSse(await response.text());
      const failed = events.at(-1);
      expect(failed).toMatchObject({
        state: "failed",
        error: { code: "configuration_unavailable" },
        receipt: { callsAttempted: 0, toolCallCount: null },
      });
      expect(JSON.stringify(failed)).not.toContain("OPENAI_API_KEY");
      expect(JSON.stringify(failed)).not.toMatch(/sk-[A-Za-z0-9_-]+/u);
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  });
});
