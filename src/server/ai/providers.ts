import "server-only";

import {
  createOpenAI,
  type OpenAIResponsesProviderOptions,
} from "@ai-sdk/openai";
import { generateText, LoadAPIKeyError } from "ai";

import {
  normalizeOpenAIProviderMetadata,
  type OpenAIWebSearchToolCall,
  type OpenAIWebSearchToolResult,
} from "../research/provider-metadata";
import type {
  ProviderResearchResult,
  ResearchInput,
  ResearchProvider,
} from "../research/types";

export const PRIMARY_RESEARCH_MODEL = "gpt-5.6-luna" as const;
export const PROVIDER_TIMEOUT_MS = 120_000;

function requireOpenAIKey(): string {
  const value = process.env.OPENAI_API_KEY;
  if (value === undefined || value.trim().length === 0) {
    throw new LoadAPIKeyError({
      message: "OpenAI API key is unavailable.",
    });
  }
  return value;
}

export interface ProviderInvocationDiagnostics {
  readonly callsAttempted: number;
  readonly durationMs: number;
  readonly abortReasonName: string | null;
}

export class ProviderInvocationError extends Error {
  readonly diagnostics: ProviderInvocationDiagnostics;
  readonly #sdkError: unknown;

  constructor(
    sdkError: unknown,
    diagnostics: ProviderInvocationDiagnostics,
  ) {
    super("Provider invocation failed.");
    this.name = "ProviderInvocationError";
    this.#sdkError = sdkError;
    this.diagnostics = diagnostics;
  }

  getSdkError(): unknown {
    return this.#sdkError;
  }
}

export function buildPrompt(input: ResearchInput): string {
  const contextLine = input.context
    ? `Contexte de désambiguïsation : ${input.context}`
    : "Contexte de désambiguïsation : non fourni";

  return [
    "Recherche une seule information d’identité, stable, publique et directement vérifiable sur cette entité.",
    "Privilégie une page officielle de l’organisation ou une source institutionnelle.",
    "Choisis uniquement la nature ou la forme de l’entité ; n’ajoute ni activité, ni siège, ni date, ni description secondaire.",
    "N’énonce qu’un fait atomique : aucune seconde propriété, aucune liste, aucune causalité et aucune inférence.",
    `Entité : ${input.name}`,
    contextLine,
    "Pour STATUS: evidence, produis exactement sept lignes, sans Markdown, fence, préambule, liste, commentaire ni ligne vide interne.",
    "Chaque valeur doit tenir sur une seule ligne et ne doit avoir aucun espace terminal.",
    "CLAIM doit être une proposition simple de 10 à 200 caractères, sans point-virgule, deux-points, saut de ligne ni connecteur interdit : et, ainsi que, mais, tandis que, alors que, dont, qui.",
    "La citation URL fournie par Web Search doit couvrir intégralement la valeur de CLAIM.",
    "SOURCE_URL doit répéter exactement l’URL de cette citation.",
    "SOURCE_URL doit être une URL HTTPS publique directe vers une page web normale servie comme text/html ou application/xhtml+xml.",
    "Cette page doit être accessible sans exiger connexion, authentification, cookie, formulaire, pièce jointe, téléchargement ni document viewer, et doit posséder un titre de document.",
    "N’utilise aucun PDF, même sans extension .pdf, et refuse toute URL dont le pathname se termine par .pdf sans distinction de casse.",
    "N’utilise aucun fichier, pièce jointe, téléchargement, document viewer, JSON, endpoint API, image, contenu audio ou vidéo, ni page nécessitant une authentification.",
    "EXCERPT doit être un extrait source exact, contigu, visible, sur une seule ligne et long de 1 à 500 caractères, jamais une paraphrase.",
    "EXCERPT doit être retrouvé dans le texte visible réel de la page ; un extrait provenant uniquement d’un snippet de résultats de recherche est insuffisant.",
    "PREFIX et SUFFIX doivent contenir au maximum 16 caractères exacts ou la valeur NONE.",
    "Effectue exactement une seule requête de recherche Web Search.",
    "Sélectionne un résultat HTML parmi les résultats de cette unique recherche.",
    "Une seule inspection du résultat sélectionné, open_page ou find_in_page, est autorisée si nécessaire.",
    "Si aucune source HTML admissible n’est trouvée dans les résultats de l’unique recherche, réponds avec exactement une ligne : STATUS: silence",
    "N’effectue aucune seconde recherche.",
    "Ne transforme jamais une URL PDF en URL supposée et n’invente jamais SOURCE_URL, EXCERPT, PREFIX ni SUFFIX.",
    "Si toutes ces contraintes ne peuvent pas être satisfaites, réponds avec exactement une ligne : STATUS: silence",
    "Sinon, réponds uniquement avec cette enveloppe exacte de sept lignes :",
    "STATUS: evidence",
    "ENTITY_TYPE: person|company",
    "CLAIM: proposition simple de 10 à 200 caractères",
    "SOURCE_URL: URL exacte de la citation",
    "EXCERPT: extrait exact contigu de 1 à 500 caractères",
    "PREFIX: 16 caractères maximum ou NONE",
    "SUFFIX: 16 caractères maximum ou NONE",
  ].join("\n");
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function providerRequestId(
  headers: Readonly<Record<string, string>> | undefined,
): string | null {
  if (headers === undefined) return null;
  for (const [key, value] of Object.entries(headers)) {
    if (
      ["x-request-id", "request-id", "openai-request-id"].includes(
        key.toLowerCase(),
      ) &&
      value.length > 0
    ) {
      return value;
    }
  }
  return null;
}

function exposedNumber(value: number | undefined): number | undefined {
  return value;
}

export function createOpenAIResearchProvider(): ResearchProvider {
  return {
    async research(input, signal): Promise<ProviderResearchResult> {
      let providerHttpCalls = 0;
      const startedAt = performance.now();

      try {
        const provider = createOpenAI({
          apiKey: requireOpenAIKey(),
          fetch: async (request, init) => {
            providerHttpCalls += 1;
            return fetch(request, init);
          },
        });
        const result = await generateText({
          model: provider.responses(PRIMARY_RESEARCH_MODEL),
          prompt: buildPrompt(input),
          tools: {
            web_search: provider.tools.webSearch({
              externalWebAccess: true,
              searchContextSize: "low",
            }),
          },
          toolChoice: { type: "tool", toolName: "web_search" },
          maxOutputTokens: 700,
          maxRetries: 0,
          timeout: PROVIDER_TIMEOUT_MS,
          abortSignal: signal,
          providerOptions: {
            openai: {
              maxToolCalls: 2,
              parallelToolCalls: false,
              reasoningEffort: "low",
              store: false,
              textVerbosity: "low",
            } satisfies OpenAIResponsesProviderOptions,
          },
        });

        const toolCalls: OpenAIWebSearchToolCall[] = result.toolCalls.flatMap(
          ({ toolName, toolCallId }) =>
            toolName === "web_search"
              ? [{ toolName: "web_search" as const, toolCallId }]
              : [],
        );
        const toolResults: OpenAIWebSearchToolResult[] =
          result.toolResults.flatMap((toolResult) =>
            toolResult.toolName === "web_search" && toolResult.dynamic !== true
              ? [{
                  toolName: "web_search" as const,
                  toolCallId: toolResult.toolCallId,
                  output: toolResult.output,
                }]
              : [],
          );
        const duplicateToolResults: OpenAIWebSearchToolResult[] =
          result.steps.flatMap((step) =>
            step.staticToolResults.map(({ toolName, toolCallId, output }) => ({
              toolName,
              toolCallId,
              output,
            })),
          );
        const normalizedMetadata = normalizeOpenAIProviderMetadata({
          generatedText: result.text,
          content: result.finalStep.content,
          sources: result.sources.flatMap((source) =>
            source.sourceType === "url" ? [source] : [],
          ),
          toolCalls,
          toolResults,
          duplicateToolResults,
        });

        return {
          text: result.text,
          citations: normalizedMetadata.citations,
          sources: normalizedMetadata.sources,
          webSearchCalls: normalizedMetadata.webSearchCalls,
          webSearchActions: normalizedMetadata.webSearchActions,
          webSearchInspections: normalizedMetadata.webSearchInspections,
          webSearchActionCount: normalizedMetadata.webSearchActionCount,
          webSearchQueryCount: normalizedMetadata.webSearchQueryCount,
          webSearchInspectionCount:
            normalizedMetadata.webSearchInspectionCount,
          webSearchUniqueCallCount:
            normalizedMetadata.webSearchUniqueCallCount,
          webSearchActionPolicyStatus:
            normalizedMetadata.webSearchActionPolicyStatus,
          webSearchActionPolicyCode:
            normalizedMetadata.webSearchActionPolicyCode,
          providerMetadataStatus: normalizedMetadata.status,
          providerHttpCalls,
          toolCalls: normalizedMetadata.webSearchActionCount,
          usage: {
            inputTokens: exposedNumber(result.usage.inputTokens),
            cachedInputTokens: exposedNumber(
              result.usage.inputTokenDetails.cacheReadTokens,
            ),
            outputTokens: exposedNumber(result.usage.outputTokens),
            reasoningTokens: exposedNumber(
              result.usage.outputTokenDetails.reasoningTokens,
            ),
            totalTokens: exposedNumber(result.usage.totalTokens),
          },
          providerDurationMs: Math.round(performance.now() - startedAt),
          finishReason: result.finishReason,
          requestId: providerRequestId(result.response.headers),
        };
      } catch (error) {
        const reason = signal.reason;
        throw new ProviderInvocationError(error, {
          callsAttempted: providerHttpCalls,
          durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
          abortReasonName:
            typeof reason === "object" && reason !== null && "name" in reason
              ? stringOrNull((reason as { readonly name?: unknown }).name)
              : null,
        });
      }
    },
  };
}
