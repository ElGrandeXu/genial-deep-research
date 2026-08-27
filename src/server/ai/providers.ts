import "server-only";

import {
  createOpenAI,
  type OpenAIResponsesProviderOptions,
} from "@ai-sdk/openai";
import { generateText, LoadAPIKeyError, Output } from "ai";
import { z } from "zod";

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
export const PROVIDER_TIMEOUT_MS = 90_000;

const entityTypeSchema = z.enum(["person", "company"]);
const sourceProofSchema = z.object({
  sourceUrl: z.string().url(),
  excerpt: z.string().min(1).max(500),
  prefix: z.string().max(16).nullable(),
  suffix: z.string().max(16).nullable(),
});
const providerDocumentSchema = z.object({
  identityStatus: z.enum([
    "resolved",
    "ambiguous",
    "insufficient_context",
    "not_found",
  ]),
  entityType: entityTypeSchema.nullable(),
  candidates: z.array(
    z.object({
      displayName: z.string().min(1).max(160),
      entityType: entityTypeSchema,
      sourceUrl: sourceProofSchema.shape.sourceUrl,
      excerpt: sourceProofSchema.shape.excerpt,
      prefix: sourceProofSchema.shape.prefix,
      suffix: sourceProofSchema.shape.suffix,
    }),
  ).max(3),
  claims: z.array(
    z.object({
      category: z.enum([
        "identity",
        "activity",
        "role",
        "geography",
        "metric",
        "event",
        "recent_signal",
        "other",
      ]),
      entityType: entityTypeSchema,
      predicate: z.string().min(1).max(80),
      scopeType: z.enum([
        "person",
        "company",
        "group",
        "subsidiary",
        "brand",
        "country",
        "establishment",
        "undetermined",
      ]),
      scopeLabel: z.string().min(1).max(160).nullable(),
      factPeriodLabel: z.string().min(1).max(80).nullable(),
      factDate: z.string().min(4).max(40).nullable(),
      normalizedValue: z.string().min(1).max(160).nullable(),
      unit: z.string().min(1).max(40).nullable(),
      currency: z.string().min(1).max(20).nullable(),
      contradictionKey: z.string().min(1).max(100).nullable(),
      sourceUrl: sourceProofSchema.shape.sourceUrl,
      excerpt: sourceProofSchema.shape.excerpt,
      prefix: sourceProofSchema.shape.prefix,
      suffix: sourceProofSchema.shape.suffix,
    }),
  ).max(6),
  missingCategories: z.array(
    z.enum([
      "identity",
      "activity",
      "role",
      "geography",
      "metric",
      "event",
      "recent_signal",
      "other",
    ]),
  ).max(8),
});

// OpenAI Structured Outputs accepts a deliberately limited JSON Schema subset.
// Keep transport constraints structural, then apply the stricter local schema
// after generation (URLs, lengths and cardinalities are still rejected before
// any provider value can reach source retrieval or the public dossier).
const sourceProofOutputSchema = z.object({
  sourceUrl: z.string(),
  excerpt: z.string(),
  prefix: z.string().nullable(),
  suffix: z.string().nullable(),
});
const providerDocumentOutputSchema = z.object({
  identityStatus: z.enum([
    "resolved",
    "ambiguous",
    "insufficient_context",
    "not_found",
  ]),
  entityType: entityTypeSchema.nullable(),
  candidates: z.array(
    z.object({
      displayName: z.string(),
      entityType: entityTypeSchema,
      sourceUrl: sourceProofOutputSchema.shape.sourceUrl,
      excerpt: sourceProofOutputSchema.shape.excerpt,
      prefix: sourceProofOutputSchema.shape.prefix,
      suffix: sourceProofOutputSchema.shape.suffix,
    }),
  ),
  claims: z.array(
    z.object({
      category: z.enum([
        "identity",
        "activity",
        "role",
        "geography",
        "metric",
        "event",
        "recent_signal",
        "other",
      ]),
      entityType: entityTypeSchema,
      predicate: z.string(),
      scopeType: z.enum([
        "person",
        "company",
        "group",
        "subsidiary",
        "brand",
        "country",
        "establishment",
        "undetermined",
      ]),
      scopeLabel: z.string().nullable(),
      factPeriodLabel: z.string().nullable(),
      factDate: z.string().nullable(),
      normalizedValue: z.string().nullable(),
      unit: z.string().nullable(),
      currency: z.string().nullable(),
      contradictionKey: z.string().nullable(),
      sourceUrl: sourceProofOutputSchema.shape.sourceUrl,
      excerpt: sourceProofOutputSchema.shape.excerpt,
      prefix: sourceProofOutputSchema.shape.prefix,
      suffix: sourceProofOutputSchema.shape.suffix,
    }),
  ),
  missingCategories: z.array(
    z.enum([
      "identity",
      "activity",
      "role",
      "geography",
      "metric",
      "event",
      "recent_signal",
      "other",
    ]),
  ),
});

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
    "Tu construis un dossier factuel compact en français sur une personne ou une entreprise.",
    "Chaque fait doit être prouvé par un extrait exact, contigu et visible d’une page HTML publique que Web Search a réellement consultée.",
    "N’invente jamais une URL, un extrait, une date, une identité, une valeur ou une relation.",
    "Privilégie les sites officiels, registres publics et publications reconnues ; diversifie les pages sources lorsque les preuves le permettent.",
    "Cherche 3 à 6 faits utiles répartis sur plusieurs catégories et au moins deux pages distinctes lorsque c’est possible : identité, activité, rôle, géographie, métrique, événement ou signal récent.",
    "Un extrait doit se suffire à lui-même pour prouver le fait affiché. N’utilise pas un simple snippet de résultats si la page ne le contient pas.",
    "SOURCE_URL doit être l’URL HTTPS exacte de la page contenant EXCERPT, jamais un PDF, fichier, API, image, vidéo, page de connexion ou résultat de recherche.",
    "EXCERPT contient 1 à 500 caractères exacts. PREFIX et SUFFIX contiennent le contexte exact adjacent (16 caractères maximum) ou null.",
    "Pour éviter toute affirmation non démontrée, le produit affichera chaque fait avec le texte exact de EXCERPT.",
    "Ne fusionne jamais des homonymes. Si plusieurs personnes ou entreprises plausibles subsistent, identityStatus=ambiguous, fournis jusqu’à trois candidats distincts et aucune claim.",
    "Si un indice décisif manque, identityStatus=insufficient_context, fournis les candidats prouvés disponibles et aucune claim.",
    "Si l’entité ou des preuves publiques suffisantes sont introuvables, identityStatus=not_found et aucune claim.",
    "identityStatus=resolved uniquement si les preuves et le contexte désignent une entité sans ambiguïté raisonnable.",
    "Quand l’identité est resolved, candidates contient exactement cette entité avec une preuve d’identité ; quand elle est not_found, candidates est vide.",
    "Pour chaque candidat, displayName doit être démontré par son EXCERPT et sa SOURCE_URL.",
    "factPeriodLabel ne peut être renseigné que si ce libellé apparaît littéralement dans EXCERPT. factDate doit être une date ISO ou une année explicitement prouvée ; sinon null.",
    "normalizedValue sert uniquement à comparer des versions contradictoires d’un même fait. Utilise la même contradictionKey pour deux valeurs réellement comparables ; sinon null.",
    "missingCategories liste uniquement les catégories utiles recherchées mais non prouvées.",
    "N’ajoute aucune synthèse, opinion, inférence, causalité ni information absente des extraits.",
    "Tu peux effectuer jusqu’à quatre actions Web Search au total. Arrête dès que le dossier est démontrable ou que l’insuffisance est établie.",
    `Entité : ${input.name}`,
    `Type demandé : ${input.entityType ?? "auto"}`,
    contextLine,
    "Respecte strictement le schéma de sortie fourni.",
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
              searchContextSize: "medium",
            }),
          },
          toolChoice: { type: "tool", toolName: "web_search" },
          output: Output.object({
            schema: providerDocumentOutputSchema,
            name: "verified_public_dossier",
            description: "Résolution d’identité et faits publics avec extraits exacts.",
          }),
          maxOutputTokens: 2_600,
          maxRetries: 0,
          timeout: PROVIDER_TIMEOUT_MS,
          abortSignal: signal,
          providerOptions: {
            openai: {
              maxToolCalls: 4,
              parallelToolCalls: false,
              reasoningEffort: "low",
              store: false,
              textVerbosity: "medium",
            } satisfies OpenAIResponsesProviderOptions,
          },
        });

        const document = providerDocumentSchema.parse(result.output);
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
          document: {
            identityStatus: document.identityStatus,
            entityType: document.entityType,
            candidates: document.candidates.map((candidate) => ({
              displayName: candidate.displayName,
              entityType: candidate.entityType,
              statement: candidate.excerpt,
              structuredUrl: candidate.sourceUrl,
              excerpt: candidate.excerpt,
              prefix: candidate.prefix,
              suffix: candidate.suffix,
            })),
            claims: document.claims.map((claim) => ({
              category: claim.category,
              entityType: claim.entityType,
              statement: claim.excerpt,
              predicate: claim.predicate,
              scopeType: claim.scopeType,
              scopeLabel: claim.scopeLabel,
              factPeriodLabel: claim.factPeriodLabel,
              factDate: claim.factDate,
              normalizedValue: claim.normalizedValue,
              unit: claim.unit,
              currency: claim.currency,
              contradictionKey: claim.contradictionKey,
              structuredUrl: claim.sourceUrl,
              excerpt: claim.excerpt,
              prefix: claim.prefix,
              suffix: claim.suffix,
            })),
            missingCategories: document.missingCategories,
          },
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
