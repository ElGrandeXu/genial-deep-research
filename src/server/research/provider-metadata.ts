import type {
  OpenAIProvider,
  OpenaiResponsesTextProviderMetadata,
} from "@ai-sdk/openai";
import type { StaticToolCall, StaticToolResult } from "ai";

import { ResearchPipelineError } from "./errors";
import type {
  ProviderCitation,
  ProviderClaimCandidate,
  ProviderSource,
  ProviderSourceBinding,
  ProviderWebSearchAction,
  ProviderWebSearchCall,
  ProviderWebSearchInspection,
  WebSearchActionPolicyCode,
} from "./types";
import { validateSourceUrl } from "./source-security";

const FORBIDDEN_ATOMIC_CONNECTORS =
  /[;:\n]|\b(?:et|ainsi que|mais|tandis que|alors que|dont|qui)\b/iu;

function attributableUrlKey(value: string): string {
  const validated = validateSourceUrl(value, "citation");
  const url = new URL(validated.safeHref);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_.+|fbclid|gclid)$/iu.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.toString();
}

interface OpenAITextPart {
  readonly type: "text";
  readonly text: string;
  readonly providerMetadata?: OpenaiResponsesTextProviderMetadata;
}

interface OpenAISourcePart {
  readonly sourceType: "url";
  readonly id: string;
  readonly url: string;
  readonly title?: string;
}

type OpenAIWebSearchTool = ReturnType<OpenAIProvider["tools"]["webSearch"]>;
type OpenAIWebSearchToolSet = { readonly web_search: OpenAIWebSearchTool };
export type OpenAIWebSearchToolCall = Pick<
  StaticToolCall<OpenAIWebSearchToolSet>,
  "toolName" | "toolCallId"
>;
export type OpenAIWebSearchToolResult = Pick<
  StaticToolResult<OpenAIWebSearchToolSet>,
  "toolName" | "toolCallId" | "output"
>;

interface NormalizedWebSearchAccounting {
  readonly actions: readonly ProviderWebSearchAction[];
  readonly searchCalls: readonly ProviderWebSearchCall[];
  readonly inspections: readonly ProviderWebSearchInspection[];
  readonly actionCount: number;
  readonly queryCount: number;
  readonly inspectionCount: number;
  readonly uniqueCallCount: number;
  readonly policyStatus: "supported" | "rejected";
  readonly policyCode: WebSearchActionPolicyCode | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function isTextPart(value: unknown): value is OpenAITextPart {
  const record = asRecord(value);
  return record?.type === "text" && typeof record.text === "string";
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function normalizeActionType(
  action: Record<string, unknown>,
): ProviderWebSearchAction["actionType"] | null {
  if (action.type === "search") {
    if (
      !hasOnlyKeys(action, ["type", "query", "queries"]) ||
      (action.query !== undefined && typeof action.query !== "string") ||
      (action.queries !== undefined &&
        (!Array.isArray(action.queries) ||
          action.queries.some((query) => typeof query !== "string")))
    ) return null;
    return "search";
  }
  if (action.type === "openPage") {
    if (!hasOnlyKeys(action, ["type", "url"])) return null;
    return "open_page";
  }
  if (action.type === "findInPage") {
    if (
      !hasOnlyKeys(action, ["type", "url", "pattern"]) ||
      (action.pattern !== undefined &&
        action.pattern !== null &&
        typeof action.pattern !== "string")
    ) return null;
    return "find_in_page";
  }
  return null;
}

function normalizeInspectionUrl(
  action: Record<string, unknown>,
):
  | { readonly status: "present"; readonly url: string }
  | { readonly status: "missing" | "invalid" } {
  if (action.url === undefined || action.url === null) {
    return { status: "missing" };
  }
  return typeof action.url === "string"
    ? { status: "present", url: action.url }
    : { status: "invalid" };
}

function normalizeSearchSources(value: unknown): {
  readonly valid: boolean;
  readonly sources: readonly { readonly url: string }[] | null;
} {
  if (value === undefined) return { valid: true, sources: null };
  if (!Array.isArray(value)) return { valid: false, sources: null };
  const sources: { readonly url: string }[] = [];
  for (const rawSource of value) {
    const source = asRecord(rawSource);
    if (source === null) return { valid: false, sources: null };
    if (source.type === "url") {
      if (
        !hasOnlyKeys(source, ["type", "url"]) ||
        typeof source.url !== "string"
      ) return { valid: false, sources: null };
      sources.push({ url: source.url });
      continue;
    }
    if (
      source.type !== "api" ||
      !hasOnlyKeys(source, ["type", "name"]) ||
      typeof source.name !== "string"
    ) return { valid: false, sources: null };
  }
  return { valid: true, sources };
}

function normalizeWebSearchAccounting(options: {
  readonly toolCalls: readonly OpenAIWebSearchToolCall[];
  readonly toolResults: readonly OpenAIWebSearchToolResult[];
  readonly duplicateToolResults: readonly OpenAIWebSearchToolResult[];
}): NormalizedWebSearchAccounting {
  const callIds = new Set<string>();
  let invalid = false;
  for (const call of options.toolCalls) {
    if (
      call.toolName !== "web_search" ||
      typeof call.toolCallId !== "string" ||
      call.toolCallId.length === 0
    ) {
      invalid = true;
      continue;
    }
    callIds.add(call.toolCallId);
  }

  const observations = new Map<
    string,
    {
      readonly actionTypes: Set<ProviderWebSearchAction["actionType"]>;
      readonly sourceViews: Map<
        string,
        readonly { readonly url: string }[] | null
      >;
      readonly inspectionUrlViews: Map<
        string,
        | { readonly status: "present"; readonly url: string }
        | { readonly status: "missing" | "invalid" }
      >;
      inspectionSourceUrlObserved: boolean;
    }
  >();
  for (const result of [...options.toolResults, ...options.duplicateToolResults]) {
    if (
      result.toolName !== "web_search" ||
      typeof result.toolCallId !== "string" ||
      result.toolCallId.length === 0
    ) {
      invalid = true;
      continue;
    }
    const output = asRecord(result.output);
    const action = output === null ? null : asRecord(output.action);
    if (
      output === null ||
      !hasOnlyKeys(output, ["action", "sources"]) ||
      action === null
    ) {
      invalid = true;
      continue;
    }
    const actionType = normalizeActionType(action);
    if (actionType === null) {
      invalid = true;
      continue;
    }
    const normalizedSources = normalizeSearchSources(output.sources);
    if (!normalizedSources.valid) {
      invalid = true;
      continue;
    }
    const observation = observations.get(result.toolCallId) ?? {
      actionTypes: new Set<ProviderWebSearchAction["actionType"]>(),
      sourceViews: new Map<
        string,
        readonly { readonly url: string }[] | null
      >(),
      inspectionUrlViews: new Map(),
      inspectionSourceUrlObserved: false,
    };
    observation.actionTypes.add(actionType);
    if (actionType === "search") {
      const signature = JSON.stringify(normalizedSources.sources);
      observation.sourceViews.set(signature, normalizedSources.sources);
    } else {
      const urlView = normalizeInspectionUrl(action);
      const signature =
        urlView.status === "present"
          ? `present:${urlView.url}`
          : urlView.status;
      observation.inspectionUrlViews.set(signature, urlView);
      if ((normalizedSources.sources?.length ?? 0) > 0) {
        observation.inspectionSourceUrlObserved = true;
      }
    }
    observations.set(result.toolCallId, observation);
  }

  const uniqueIds = new Set([...callIds, ...observations.keys()]);
  if (
    [...uniqueIds].some(
      (toolCallId) =>
        !callIds.has(toolCallId) || !observations.has(toolCallId),
    )
  ) invalid = true;

  const actions: ProviderWebSearchAction[] = [];
  const searchCalls: ProviderWebSearchCall[] = [];
  const inspections: ProviderWebSearchInspection[] = [];
  for (const [toolCallId, observation] of observations) {
    if (observation.actionTypes.size !== 1) {
      invalid = true;
      continue;
    }
    const [actionType] = observation.actionTypes;
    if (actionType === undefined) {
      invalid = true;
      continue;
    }
    if (actionType === "search" && observation.sourceViews.size !== 1) {
      invalid = true;
      continue;
    }
    actions.push({ toolCallId, actionType });
    if (actionType === "search") {
      searchCalls.push({
        toolCallId,
        sources: [...observation.sourceViews.values()][0] ?? null,
      });
    } else {
      const urlViews = [...observation.inspectionUrlViews.values()];
      const urlView = urlViews[0];
      if (
        observation.inspectionSourceUrlObserved ||
        urlViews.length !== 1 ||
        urlView === undefined
      ) {
        inspections.push({ toolCallId, actionType, urlStatus: "ambiguous" });
      } else if (urlView.status === "present") {
        inspections.push({
          toolCallId,
          actionType,
          urlStatus: "present",
          url: urlView.url,
        });
      } else {
        inspections.push({
          toolCallId,
          actionType,
          urlStatus: urlView.status,
        });
      }
    }
  }

  const observedActionTypes = [...observations.values()].flatMap(
    ({ actionTypes }) => [...actionTypes],
  );
  const queryCount = observedActionTypes.filter(
    (actionType) => actionType === "search",
  ).length;
  const inspectionCount = observedActionTypes.filter(
    (actionType) => actionType === "open_page" || actionType === "find_in_page",
  ).length;
  const actionCount = observedActionTypes.length;
  const inspectionActionContradiction = [...observations.values()].some(
    ({ actionTypes }) =>
      actionTypes.size > 1 &&
      [...actionTypes].some(
        (actionType) =>
          actionType === "open_page" || actionType === "find_in_page",
      ),
  );
  const policyCode: WebSearchActionPolicyCode | null =
    inspectionActionContradiction
      ? "inspection_url_ambiguous"
      : invalid ||
          queryCount < 1 ||
          actionCount < 1 ||
          actionCount > 4 ||
          actionCount !== queryCount + inspectionCount
        ? "web_search_action_invalid"
        : null;
  return {
    actions,
    searchCalls,
    inspections,
    actionCount,
    queryCount,
    inspectionCount,
    uniqueCallCount: uniqueIds.size,
    policyStatus: policyCode === null ? "supported" : "rejected",
    policyCode,
  };
}

export function normalizeOpenAIProviderMetadata(options: {
  readonly generatedText: string;
  readonly content: readonly unknown[];
  readonly sources: readonly OpenAISourcePart[];
  readonly toolCalls: readonly OpenAIWebSearchToolCall[];
  readonly toolResults?: readonly OpenAIWebSearchToolResult[];
  readonly duplicateToolResults?: readonly OpenAIWebSearchToolResult[];
}): {
  readonly status: "supported" | "unknown";
  readonly citations: readonly ProviderCitation[];
  readonly sources: readonly ProviderSource[];
  readonly webSearchCalls: readonly ProviderWebSearchCall[];
  readonly webSearchActions: readonly ProviderWebSearchAction[];
  readonly webSearchInspections: readonly ProviderWebSearchInspection[];
  readonly webSearchActionCount: number;
  readonly webSearchQueryCount: number;
  readonly webSearchInspectionCount: number;
  readonly webSearchUniqueCallCount: number;
  readonly webSearchActionPolicyStatus: "supported" | "rejected";
  readonly webSearchActionPolicyCode: WebSearchActionPolicyCode | null;
} {
  const sources = options.sources.map((source) => ({
    sourceId: source.id,
    url: source.url,
    ...(source.title === undefined ? {} : { title: source.title }),
  }));
  const accounting = normalizeWebSearchAccounting({
    toolCalls: options.toolCalls,
    toolResults: options.toolResults ?? [],
    duplicateToolResults: options.duplicateToolResults ?? [],
  });
  const normalizedWebSearchCalls = accounting.searchCalls;
  const complete = (
    status: "supported" | "unknown",
    citations: readonly ProviderCitation[],
  ) => ({
    status,
    citations,
    sources,
    webSearchCalls: normalizedWebSearchCalls,
    webSearchActions: accounting.actions,
    webSearchInspections: accounting.inspections,
    webSearchActionCount: accounting.actionCount,
    webSearchQueryCount: accounting.queryCount,
    webSearchInspectionCount: accounting.inspectionCount,
    webSearchUniqueCallCount: accounting.uniqueCallCount,
    webSearchActionPolicyStatus: accounting.policyStatus,
    webSearchActionPolicyCode: accounting.policyCode,
  });
  const toolCallId =
    accounting.queryCount === 1
      ? accounting.actions.find(({ actionType }) => actionType === "search")
          ?.toolCallId ?? null
      : null;
  const citations: ProviderCitation[] = [];
  let generatedOffset = 0;
  let reconstructedText = "";

  for (const rawPart of options.content) {
    if (!isTextPart(rawPart)) continue;
    const part = rawPart;
    reconstructedText += part.text;
    const metadataRecord = asRecord(part.providerMetadata);
    if (metadataRecord === null) {
      generatedOffset += part.text.length;
      continue;
    }
    if (!hasOnlyKeys(metadataRecord, ["openai"])) {
      return complete("unknown", []);
    }
    const openai = asRecord(metadataRecord.openai);
    if (
      openai === null ||
      !hasOnlyKeys(openai, ["itemId", "phase", "annotations"]) ||
      typeof openai.itemId !== "string" ||
      openai.itemId.length === 0
    ) {
      return complete("unknown", []);
    }
    if (openai.annotations === undefined) {
      generatedOffset += part.text.length;
      continue;
    }
    if (!Array.isArray(openai.annotations)) {
      return complete("unknown", []);
    }
    for (const rawAnnotation of openai.annotations) {
      const annotation = asRecord(rawAnnotation);
      if (
        annotation === null ||
        annotation.type !== "url_citation" ||
        !hasOnlyKeys(annotation, [
          "type",
          "start_index",
          "end_index",
          "url",
          "title",
        ]) ||
        typeof annotation.start_index !== "number" ||
        !Number.isInteger(annotation.start_index) ||
        typeof annotation.end_index !== "number" ||
        !Number.isInteger(annotation.end_index) ||
        typeof annotation.url !== "string" ||
        typeof annotation.title !== "string"
      ) {
        return complete("unknown", []);
      }
      const source = sources.find(({ url }) => url === annotation.url);
      citations.push({
        provider: "openai",
        metadataType: "url_citation",
        sourceId: source?.sourceId ?? null,
        url: annotation.url,
        title: annotation.title.length === 0 ? null : annotation.title,
        generatedTextStart: generatedOffset + annotation.start_index,
        generatedTextEnd: generatedOffset + annotation.end_index,
        textPartId: openai.itemId,
        toolCallId,
      });
    }
    generatedOffset += part.text.length;
  }

  if (reconstructedText !== options.generatedText) {
    return complete("unknown", []);
  }
  return complete("supported", citations);
}

function field(line: string, label: string): string {
  const marker = `${label}: `;
  if (!line.startsWith(marker)) {
    throw new ResearchPipelineError(
      "invalid_provider_shape",
      "Le fournisseur n’a pas produit le format factuel attendu.",
    );
  }
  const value = line.slice(marker.length);
  if (value.length === 0 || value !== value.trim()) {
    throw new ResearchPipelineError(
      "invalid_provider_shape",
      "Le fournisseur n’a pas produit le format factuel attendu.",
    );
  }
  return value;
}

export function parseProviderCandidate(text: string): ProviderClaimCandidate {
  const terminalLineBreaks = text.match(/(?:(?:\r\n)|\n)+$/u)?.[0] ?? "";
  const normalizedEnvelope = text.slice(0, text.length - terminalLineBreaks.length);
  if (normalizedEnvelope === "STATUS: silence") {
    throw new ResearchPipelineError(
      "source_metadata_missing",
      "Le fournisseur n’a proposé aucune preuve admissible.",
    );
  }
  const lines = normalizedEnvelope.split(/\r?\n/u);
  if (lines.length !== 7 || lines[0] !== "STATUS: evidence") {
    throw new ResearchPipelineError(
      "invalid_provider_shape",
      "Le fournisseur n’a pas produit le format factuel attendu.",
    );
  }
  const entityType = field(lines[1] ?? "", "ENTITY_TYPE");
  const statement = field(lines[2] ?? "", "CLAIM");
  const structuredUrl = field(lines[3] ?? "", "SOURCE_URL");
  const excerpt = field(lines[4] ?? "", "EXCERPT");
  const rawPrefix = field(lines[5] ?? "", "PREFIX");
  const rawSuffix = field(lines[6] ?? "", "SUFFIX");

  if (entityType !== "person" && entityType !== "company") {
    throw new ResearchPipelineError(
      "invalid_provider_shape",
      "Le type d’entité fournisseur est invalide.",
    );
  }
  if (statement.length < 10 || statement.length > 200) {
    throw new ResearchPipelineError(
      "invalid_claim_length",
      "L’affirmation produite n’a pas une longueur exploitable.",
    );
  }
  if (FORBIDDEN_ATOMIC_CONNECTORS.test(statement)) {
    throw new ResearchPipelineError(
      "non_atomic_claim",
      "Le fournisseur a produit plusieurs faits.",
    );
  }
  const sentenceEnds = statement.match(/[.!?](?=\s|$)/gu)?.length ?? 0;
  if (sentenceEnds > 1) {
    throw new ResearchPipelineError(
      "non_atomic_claim",
      "Le fournisseur a produit plusieurs faits.",
    );
  }
  const claimMarker = `CLAIM: ${statement}`;
  const markerStart = normalizedEnvelope.indexOf(claimMarker);
  if (markerStart < 0) {
    throw new ResearchPipelineError(
      "invalid_provider_shape",
      "La position de l’affirmation fournisseur est introuvable.",
    );
  }
  const claimStart = markerStart + "CLAIM: ".length;
  return {
    entityType,
    statement,
    claimStart,
    claimEnd: claimStart + statement.length,
    structuredUrl,
    excerpt,
    prefix: rawPrefix === "NONE" ? null : rawPrefix,
    suffix: rawSuffix === "NONE" ? null : rawSuffix,
  };
}

function bindUrlCitation(
  result: {
    readonly text: string;
    readonly citations: readonly ProviderCitation[];
    readonly sources: readonly ProviderSource[];
    readonly providerMetadataStatus: "supported" | "unknown";
  },
  candidate: ProviderClaimCandidate,
): ProviderCitation {
  const claimStart = candidate.claimStart;
  const claimEnd = candidate.claimEnd;
  if (claimStart === undefined || claimEnd === undefined) {
    throw new ResearchPipelineError(
      "provider_citation_unbound",
      "Les offsets de l’affirmation sont absents.",
    );
  }
  for (const citation of result.citations) {
    if (
      citation.generatedTextStart < 0 ||
      citation.generatedTextEnd <= citation.generatedTextStart ||
      citation.generatedTextEnd > result.text.length
    ) {
      throw new ResearchPipelineError(
        "provider_citation_unbound",
        "Les offsets de citation fournisseur sont invalides.",
      );
    }
  }
  const covering = result.citations.filter(
    (citation) =>
      citation.generatedTextStart <= claimStart &&
      citation.generatedTextEnd >= claimEnd,
  );
  if (covering.length !== 1) {
    throw new ResearchPipelineError(
      "provider_citation_unbound",
      "Aucune citation fournisseur univoque ne couvre l’affirmation.",
    );
  }
  const citation = covering[0];
  if (citation === undefined) {
    throw new ResearchPipelineError(
      "provider_citation_unbound",
      "La citation fournisseur est introuvable.",
    );
  }
  if (citation.url.trim().length === 0) {
    throw new ResearchPipelineError(
      "provider_source_url_missing",
      "La citation fournisseur ne contient pas d’URL.",
    );
  }
  if (
    citation.sourceId !== null &&
    !result.sources.some(
      ({ sourceId, url }) => sourceId === citation.sourceId && url === citation.url,
    )
  ) {
    throw new ResearchPipelineError(
      "source_metadata_missing",
      "L’identifiant de source fournisseur ne correspond pas à la citation.",
    );
  }
  if (citation.title === null) {
    throw new ResearchPipelineError(
      "source_metadata_missing",
      "Le titre requis par le contrat M2 est absent de la citation fournisseur.",
    );
  }
  return citation;
}

export function bindProviderSource(
  result: {
    readonly text: string;
    readonly citations: readonly ProviderCitation[];
    readonly sources: readonly ProviderSource[];
    readonly webSearchCalls?: readonly ProviderWebSearchCall[];
    readonly webSearchActions?: readonly ProviderWebSearchAction[];
    readonly webSearchInspections?: readonly ProviderWebSearchInspection[];
    readonly providerMetadataStatus: "supported" | "unknown";
  },
  candidate: ProviderClaimCandidate,
): ProviderSourceBinding {
  if (result.providerMetadataStatus !== "supported") {
    throw new ResearchPipelineError(
      "source_metadata_missing",
      "La forme des métadonnées fournisseur n’est pas prise en charge.",
    );
  }
  if (
    candidate.claimStart !== undefined &&
    candidate.claimEnd !== undefined &&
    result.citations.length > 0
  ) {
    return bindUrlCitation(result, candidate);
  }

  if (candidate.claimStart === undefined || candidate.claimEnd === undefined) {
    let structuredUrl: ReturnType<typeof validateSourceUrl>;
    try {
      structuredUrl = validateSourceUrl(candidate.structuredUrl, "citation");
    } catch {
      throw new ResearchPipelineError(
        "source_url_rejected",
        "L’URL structurée proposée est invalide.",
      );
    }
    const matches = (url: string): boolean => {
      try {
        return attributableUrlKey(url) === attributableUrlKey(structuredUrl.safeHref);
      } catch {
        return false;
      }
    };

    const citation = result.citations.find(({ url }) => matches(url));
    if (citation !== undefined) return citation;

    const directSource = result.sources.find(({ url }) => matches(url));
    if (directSource !== undefined) {
      return {
        provider: "openai",
        bindingType: "provider_source",
        url: directSource.url,
        sourceId: directSource.sourceId,
      };
    }

    for (const call of result.webSearchCalls ?? []) {
      const source = call.sources?.find(({ url }) => matches(url));
      if (source !== undefined) {
        return {
          provider: "openai",
          bindingType: "web_search_source",
          url: source.url,
          toolCallId: call.toolCallId,
        };
      }
    }

    for (const inspection of result.webSearchInspections ?? []) {
      if (inspection.urlStatus === "present" && matches(inspection.url)) {
        return {
          provider: "openai",
          bindingType: "inspection_action_url",
          url: inspection.url,
          toolCallId: inspection.toolCallId,
          actionType: inspection.actionType,
        };
      }
    }

    // Structured Outputs do not always carry URL annotations or an expanded
    // source list. The URL still has to pass the strict public-URL policy, then
    // the source verifier fetches it directly and locates the exact excerpt.
    // No provider-only statement can reach the dossier through this fallback.
    return {
      provider: "openai",
      bindingType: "structured_output_url",
      url: structuredUrl.safeHref,
    };
  }

  const webSearchCalls = result.webSearchCalls ?? [];
  if (webSearchCalls.length > 1) {
    throw new ResearchPipelineError(
      "web_search_not_unique",
      "La liaison fournisseur exige une unique action de recherche Web Search.",
    );
  }
  const call = webSearchCalls[0];
  if (call !== undefined && call.sources !== null && call.sources.length > 0) {
    let structuredUrl: ReturnType<typeof validateSourceUrl>;
    try {
      structuredUrl = validateSourceUrl(candidate.structuredUrl, "citation");
    } catch {
      throw new ResearchPipelineError(
        "source_url_rejected",
        "L’URL structurée proposée est invalide.",
      );
    }
    const matches = call.sources.filter(
      ({ url }) =>
        attributableUrlKey(url) === attributableUrlKey(structuredUrl.safeHref),
    );
    if (matches.length !== 1) {
      throw new ResearchPipelineError(
        "source_metadata_missing",
        "L’URL structurée ne correspond pas à une source Web Search univoque.",
      );
    }
    const source = matches[0];
    if (source === undefined) {
      throw new ResearchPipelineError(
        "source_metadata_missing",
        "La source Web Search liée est absente.",
      );
    }
    return {
      provider: "openai",
      bindingType: "web_search_source",
      url: source.url,
      toolCallId: call.toolCallId,
    };
  }

  const actions = result.webSearchActions ?? [];
  const searchActions = actions.filter(
    ({ actionType }) => actionType === "search",
  );
  const inspectionActions = actions.filter(
    ({ actionType }) =>
      actionType === "open_page" || actionType === "find_in_page",
  );
  if (searchActions.length !== 1 || inspectionActions.length === 0) {
    throw new ResearchPipelineError(
      "inspection_url_missing",
      "L’action d’inspection publique requise est absente.",
    );
  }
  if (inspectionActions.length !== 1) {
    throw new ResearchPipelineError(
      "inspection_url_ambiguous",
      "Plusieurs actions d’inspection ou représentations concurrentes sont présentes.",
    );
  }
  const inspections = result.webSearchInspections ?? [];
  if (inspections.length === 0) {
    throw new ResearchPipelineError(
      "inspection_url_missing",
      "L’URL publique de l’action d’inspection est absente.",
    );
  }
  if (inspections.length !== 1 || result.sources.length > 0) {
    throw new ResearchPipelineError(
      "inspection_url_ambiguous",
      "Plusieurs représentations de source concurrentes sont présentes.",
    );
  }
  const action = inspectionActions[0];
  const inspection = inspections[0];
  if (
    action === undefined ||
    inspection === undefined ||
    action.toolCallId !== inspection.toolCallId ||
    action.actionType !== inspection.actionType
  ) {
    throw new ResearchPipelineError(
      "inspection_url_ambiguous",
      "L’action d’inspection et son URL publique sont incohérentes.",
    );
  }
  if (inspection.urlStatus !== "present") {
    if (inspection.urlStatus === "missing") {
      throw new ResearchPipelineError(
        "inspection_url_missing",
        "L’URL publique de l’action d’inspection est absente.",
      );
    }
    if (inspection.urlStatus === "invalid") {
      throw new ResearchPipelineError(
        "inspection_url_invalid",
        "L’URL publique de l’action d’inspection est invalide.",
      );
    }
    throw new ResearchPipelineError(
      "inspection_url_ambiguous",
      "Plusieurs représentations de l’URL d’inspection sont présentes.",
    );
  }

  let inspectionUrl: ReturnType<typeof validateSourceUrl>;
  try {
    inspectionUrl = validateSourceUrl(inspection.url, "citation");
  } catch {
    throw new ResearchPipelineError(
      "inspection_url_invalid",
      "L’URL publique de l’action d’inspection est invalide.",
    );
  }
  let structuredUrl: ReturnType<typeof validateSourceUrl>;
  try {
    structuredUrl = validateSourceUrl(candidate.structuredUrl, "citation");
  } catch {
    throw new ResearchPipelineError(
      "inspection_url_mismatch",
      "L’URL textuelle ne correspond pas à l’action d’inspection.",
    );
  }
  if (structuredUrl.safeHref !== inspectionUrl.safeHref) {
    throw new ResearchPipelineError(
      "inspection_url_mismatch",
      "L’URL textuelle ne correspond pas à l’action d’inspection.",
    );
  }
  return {
    provider: "openai",
    bindingType: "inspection_action_url",
    url: inspection.url,
    toolCallId: inspection.toolCallId,
    actionType: inspection.actionType,
  };
}
