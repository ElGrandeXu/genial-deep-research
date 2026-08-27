import { createHash } from "node:crypto";

import {
  parse,
  type DefaultTreeAdapterMap,
} from "parse5";

import { ResearchPipelineError } from "./errors";
import {
  validateCitationAndStructuredUrl,
  type DnsResolver,
  type ValidatedSourceUrl,
} from "./source-security";
import {
  fetchSourceWithPinning,
  type FetchedSource,
  type SourceTransport,
} from "./source-transport";
import type {
  ProviderClaimCandidate,
  SourceLocator,
  SourceVerifier,
  VerifiedSourceProof,
} from "./types";

export const SOURCE_EXCERPT_MAX_CHARACTERS = 500;
export const SOURCE_CONTEXT_MAX_CHARACTERS = 16;
export const SOURCE_TITLE_MAX_CHARACTERS = 300;

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const TITLE_EXCLUDED_CONTAINERS = new Set([
  "embed",
  "iframe",
  "math",
  "noscript",
  "object",
  "svg",
  "template",
]);

const EXCLUDED_ELEMENTS = new Set([
  "head",
  "script",
  "style",
  "noscript",
  "template",
]);
const BLOCK_ELEMENTS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

type HtmlNode = DefaultTreeAdapterMap["node"];
type HtmlElement = DefaultTreeAdapterMap["element"];

function isElement(node: HtmlNode): node is HtmlElement {
  return "tagName" in node && typeof node.tagName === "string";
}

function childNodes(node: HtmlNode): readonly HtmlNode[] {
  return "childNodes" in node && Array.isArray(node.childNodes)
    ? (node.childNodes as readonly HtmlNode[])
    : [];
}

function attribute(element: HtmlElement, name: string): string | null {
  const found = element.attrs.find((entry) => entry.name.toLowerCase() === name);
  return found?.value ?? null;
}

function inlineStyleHides(style: string): boolean {
  for (const declaration of style.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 0) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration
      .slice(separator + 1)
      .trim()
      .toLowerCase()
      .replace(/\s*!important\s*$/u, "")
      .trim();
    if (
      (property === "display" && value === "none") ||
      (property === "visibility" && value === "hidden") ||
      (property === "content-visibility" && value === "hidden")
    ) {
      return true;
    }
  }
  return false;
}

function hiddenElement(element: HtmlElement): boolean {
  if (element.attrs.some((entry) => entry.name.toLowerCase() === "hidden")) {
    return true;
  }
  if (attribute(element, "aria-hidden")?.trim().toLowerCase() === "true") {
    return true;
  }
  if (
    element.tagName.toLowerCase() === "input" &&
    attribute(element, "type")?.trim().toLowerCase() === "hidden"
  ) {
    return true;
  }
  const style = attribute(element, "style");
  return style !== null && inlineStyleHides(style);
}

function findBody(node: HtmlNode): HtmlElement | null {
  if (isElement(node) && node.tagName.toLowerCase() === "body") return node;
  for (const child of childNodes(node)) {
    const body = findBody(child);
    if (body !== null) return body;
  }
  return null;
}

function findHead(node: HtmlNode): HtmlElement | null {
  if (
    isElement(node) &&
    node.namespaceURI === HTML_NAMESPACE &&
    node.tagName.toLowerCase() === "head"
  ) {
    return node;
  }
  for (const child of childNodes(node)) {
    const head = findHead(child);
    if (head !== null) return head;
  }
  return null;
}

function textContent(node: HtmlNode): string {
  if (node.nodeName === "#text" && "value" in node) {
    return String(node.value);
  }
  return childNodes(node).map(textContent).join("");
}

function documentTitleFailure(message: string): never {
  throw new ResearchPipelineError("source_metadata_missing", message);
}

function extractVerifiedDocumentTitle(body: string): string {
  let document: HtmlNode;
  try {
    document = parse(body) as HtmlNode;
  } catch {
    documentTitleFailure("Le titre du document HTML ne peut pas être analysé.");
  }
  const head = findHead(document);
  if (head === null) {
    documentTitleFailure("Le document HTML ne contient pas de head avec un titre vérifiable.");
  }
  const titles: HtmlElement[] = [];
  const visit = (node: HtmlNode): void => {
    if (isElement(node)) {
      const name = node.tagName.toLowerCase();
      if (node !== head && TITLE_EXCLUDED_CONTAINERS.has(name)) return;
      if (node.namespaceURI !== HTML_NAMESPACE) return;
      if (name === "title") {
        titles.push(node);
        return;
      }
    }
    for (const child of childNodes(node)) visit(child);
  };
  visit(head);
  if (titles.length !== 1) {
    documentTitleFailure("Le document HTML doit contenir un unique title dans head.");
  }
  const titleNode = titles[0];
  if (titleNode === undefined) {
    documentTitleFailure("Le titre du document HTML est absent.");
  }
  const decoded = textContent(titleNode).normalize("NFKC");
  const nonWhitespace = decoded.replace(/\p{White_Space}+/gu, "");
  if (/\p{Cc}/u.test(nonWhitespace)) {
    documentTitleFailure("Le titre du document HTML contient un caractère de contrôle.");
  }
  const normalized = decoded.replace(/\p{White_Space}+/gu, " ").trim();
  const length = characterCount(normalized);
  if (
    length === 0 ||
    length > SOURCE_TITLE_MAX_CHARACTERS ||
    /[\r\n\u2028\u2029]/u.test(normalized)
  ) {
    documentTitleFailure("Le titre du document HTML est vide ou hors limite.");
  }
  return normalized;
}

export function normalizeVisibleText(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\u2028\u2029]/gu, "\n")
    .replace(/[\p{Z}\t\v\f]+/gu, " ");
  return normalized
    .split("\n")
    .map((line) => line.replace(/ +/gu, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}

export function extractVisibleText(
  body: string,
  mediaType: FetchedSource["mediaType"],
): string {
  if (mediaType === "text/plain") return normalizeVisibleText(body);
  try {
    const document = parse(body);
    const root = findBody(document);
    if (root === null) {
      throw new ResearchPipelineError(
        "source_parse_failed",
        "Le document HTML ne contient pas de body exploitable.",
      );
    }
    const fragments: string[] = [];
    const visit = (node: HtmlNode): void => {
      if (isElement(node)) {
        const name = node.tagName.toLowerCase();
        if (EXCLUDED_ELEMENTS.has(name) || hiddenElement(node)) return;
        if (BLOCK_ELEMENTS.has(name)) fragments.push("\n");
        for (const child of childNodes(node)) visit(child);
        if (BLOCK_ELEMENTS.has(name)) fragments.push("\n");
        return;
      }
      if (node.nodeName === "#text" && "value" in node) {
        fragments.push(String(node.value));
        return;
      }
      for (const child of childNodes(node)) visit(child);
    };
    visit(root);
    return normalizeVisibleText(fragments.join(""));
  } catch (error) {
    if (error instanceof ResearchPipelineError) throw error;
    throw new ResearchPipelineError(
      "source_parse_failed",
      "L’analyse du contenu source a échoué.",
    );
  }
}

function characterCount(value: string): number {
  return Array.from(value).length;
}

function normalizeContextCandidate(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\u2028\u2029]/gu, "\n")
    .replace(/[\p{Z}\t\v\f]+/gu, " ")
    .replace(/ +/gu, " ")
    .replace(/\n+/gu, "\n");
}

function takeLastCharacters(value: string, count: number): string {
  return Array.from(value).slice(-count).join("");
}

function takeFirstCharacters(value: string, count: number): string {
  return Array.from(value).slice(0, count).join("");
}

function safeLocatorContext(value: string): string {
  return /(?:secret|token|api[_-]?key|authorization|password|credential|signature|bearer|sk-[a-z0-9_-]+)/iu.test(
    value,
  )
    ? ""
    : value;
}

const TYPOGRAPHIC_DOUBLE_QUOTES = new Set([
  "\u00ab",
  "\u00bb",
  "\u201c",
  "\u201d",
  "\u201e",
  "\u201f",
]);
const TYPOGRAPHIC_SINGLE_QUOTES = new Set([
  "\u02bc",
  "\u2018",
  "\u2019",
  "\u201a",
  "\u201b",
  "\u2039",
  "\u203a",
]);
const TYPOGRAPHIC_DASHES = new Set([
  "\u2010",
  "\u2011",
  "\u2012",
  "\u2013",
  "\u2014",
  "\u2015",
]);

function typographicReplacement(character: string): string {
  if (TYPOGRAPHIC_DOUBLE_QUOTES.has(character)) return '"';
  if (TYPOGRAPHIC_SINGLE_QUOTES.has(character)) return "'";
  if (TYPOGRAPHIC_DASHES.has(character)) return "-";
  if (character === "\u2026") return "...";
  if (character === "\u00ad") return "";
  return character;
}

function canonicalizeTypographic(value: string): {
  readonly text: string;
  readonly originalStarts: readonly number[];
  readonly originalEnds: readonly number[];
} {
  let text = "";
  const originalStarts: number[] = [];
  const originalEnds: number[] = [];
  for (let index = 0; index < value.length;) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) break;
    const character = String.fromCodePoint(codePoint);
    const end = index + character.length;
    const replacement = typographicReplacement(character);
    text += replacement;
    for (let offset = 0; offset < replacement.length; offset += 1) {
      originalStarts.push(index);
      originalEnds.push(end);
    }
    index = end;
  }
  return { text, originalStarts, originalEnds };
}

function findOccurrences(value: string, searched: string): number[] {
  const occurrences: number[] = [];
  let cursor = 0;
  while (cursor <= value.length - searched.length) {
    const found = value.indexOf(searched, cursor);
    if (found < 0) break;
    occurrences.push(found);
    cursor = found + 1;
  }
  return occurrences;
}

export function locateVerifiedExcerpt(options: {
  readonly visibleText: string;
  readonly candidate: ProviderClaimCandidate;
  readonly fetched: Omit<FetchedSource, "body">;
  readonly retrievedAt: Date;
}): { readonly excerpt: string; readonly locator: SourceLocator } {
  const exact = normalizeVisibleText(options.candidate.excerpt);
  const exactLength = characterCount(exact);
  if (exactLength === 0 || exactLength > SOURCE_EXCERPT_MAX_CHARACTERS) {
    throw new ResearchPipelineError(
      "source_excerpt_missing",
      "L’extrait candidat est vide ou hors limite.",
    );
  }
  const prefix =
    options.candidate.prefix === null
      ? null
      : normalizeContextCandidate(options.candidate.prefix);
  const suffix =
    options.candidate.suffix === null
      ? null
      : normalizeContextCandidate(options.candidate.suffix);
  if (
    (prefix !== null && characterCount(prefix) > SOURCE_CONTEXT_MAX_CHARACTERS) ||
    (suffix !== null && characterCount(suffix) > SOURCE_CONTEXT_MAX_CHARACTERS)
  ) {
    throw new ResearchPipelineError(
      "source_excerpt_ambiguous",
      "Le contexte candidat dépasse la limite.",
    );
  }

  const occurrences = findOccurrences(options.visibleText, exact);
  let selected: number;
  let selectedEnd: number;
  let occurrenceIndex: number;
  let matchMode: SourceLocator["matchMode"];
  if (occurrences.length > 0) {
    const firstOccurrence = occurrences[0];
    if (firstOccurrence === undefined) {
      throw new ResearchPipelineError(
        "source_excerpt_missing",
        "L’extrait candidat est absent du texte visible normalisé.",
      );
    }
    selected = firstOccurrence;
    if (occurrences.length > 1) {
      if (
        prefix === null ||
        suffix === null ||
        prefix.trim().length === 0 ||
        suffix.trim().length === 0
      ) {
        throw new ResearchPipelineError(
          "source_excerpt_ambiguous",
          "L’extrait candidat possède plusieurs occurrences sans contexte exact.",
        );
      }
      const matching = occurrences.filter(
        (index) =>
          options.visibleText.slice(Math.max(0, index - prefix.length), index) === prefix &&
          options.visibleText.slice(index + exact.length, index + exact.length + suffix.length) ===
            suffix,
      );
      if (matching.length !== 1) {
        throw new ResearchPipelineError(
          "source_excerpt_ambiguous",
          "Le prefix et le suffix ne désambiguïsent pas une occurrence unique.",
        );
      }
      selected = matching[0] ?? selected;
    }
    selectedEnd = selected + exact.length;
    occurrenceIndex = occurrences.indexOf(selected);
    matchMode = "exact";
  } else {
    const canonicalCandidate = canonicalizeTypographic(exact).text;
    if (canonicalCandidate.length === 0) {
      throw new ResearchPipelineError(
        "source_excerpt_missing",
        "L’extrait candidat est absent du texte visible normalisé.",
      );
    }
    const canonicalSource = canonicalizeTypographic(options.visibleText);
    const canonicalOccurrences = findOccurrences(
      canonicalSource.text,
      canonicalCandidate,
    );
    if (canonicalOccurrences.length === 0) {
      throw new ResearchPipelineError(
        "source_excerpt_missing",
        "L’extrait candidat est absent du texte visible normalisé.",
      );
    }
    if (canonicalOccurrences.length !== 1) {
      throw new ResearchPipelineError(
        "source_excerpt_ambiguous",
        "L’extrait candidat possède plusieurs occurrences typographiquement équivalentes.",
      );
    }
    const canonicalStart = canonicalOccurrences[0];
    if (canonicalStart === undefined) {
      throw new ResearchPipelineError(
        "source_excerpt_missing",
        "L’extrait candidat est absent du texte visible normalisé.",
      );
    }
    const canonicalEnd = canonicalStart + canonicalCandidate.length - 1;
    const mappedStart = canonicalSource.originalStarts[canonicalStart];
    const mappedEnd = canonicalSource.originalEnds[canonicalEnd];
    if (
      mappedStart === undefined ||
      mappedEnd === undefined ||
      mappedEnd <= mappedStart
    ) {
      throw new ResearchPipelineError(
        "source_excerpt_missing",
        "L’extrait candidat ne peut pas être relié exactement au texte visible normalisé.",
      );
    }
    selected = mappedStart;
    selectedEnd = mappedEnd;
    occurrenceIndex = 0;
    matchMode = "typographic_equivalence";
  }

  const verifiedExcerpt = options.visibleText.slice(selected, selectedEnd);
  const previousBlock = options.visibleText.slice(0, selected).split("\n").at(-1) ?? "";
  const nextBlock = options.visibleText
    .slice(selectedEnd)
    .split("\n", 1)[0] ?? "";
  const locatorPrefix = safeLocatorContext(
    takeLastCharacters(previousBlock, SOURCE_CONTEXT_MAX_CHARACTERS),
  );
  const locatorSuffix = safeLocatorContext(
    takeFirstCharacters(nextBlock, SOURCE_CONTEXT_MAX_CHARACTERS),
  );
  const locator: SourceLocator = {
    exact: verifiedExcerpt,
    matchMode,
    prefix: locatorPrefix,
    suffix: locatorSuffix,
    occurrenceIndex,
    finalUrl: options.fetched.finalUrl,
    citationUrl: options.fetched.citationUrl,
    retrievedAt: options.retrievedAt.toISOString(),
    normalizedTextSha256: createHash("sha256")
      .update(options.visibleText, "utf8")
      .digest("hex"),
    contentType: options.fetched.contentType,
    bytesRead: options.fetched.bytesRead,
    redirectCount: options.fetched.redirectCount,
  };
  return { excerpt: verifiedExcerpt, locator };
}

export function serializeSourceLocator(locator: SourceLocator): string {
  return JSON.stringify(locator);
}

export function createSourceVerifier(options: {
  readonly resolver: DnsResolver;
  readonly transport: SourceTransport;
  readonly now?: () => Date;
  readonly monotonicNow?: () => number;
  readonly timeoutMs?: number;
}): SourceVerifier {
  interface PreparedSource {
    readonly fetched: FetchedSource;
    readonly verifiedTitle: string;
    readonly visibleText: string;
    readonly retrievedAt: Date;
  }
  interface PageCacheEntry {
    networkFetchCount: number;
    fetchCountReported: boolean;
    promise: Promise<PreparedSource>;
  }

  const pageCache = new Map<string, PageCacheEntry>();

  function consumeNetworkFetchCount(entry: PageCacheEntry): number {
    if (entry.fetchCountReported) return 0;
    entry.fetchCountReported = true;
    return entry.networkFetchCount;
  }

  function cachedPage(initialUrl: ValidatedSourceUrl, signal: AbortSignal): PageCacheEntry {
    const key = initialUrl.safeHref;
    const existing = pageCache.get(key);
    if (existing !== undefined) return existing;
    const entry: PageCacheEntry = {
      networkFetchCount: 0,
      fetchCountReported: false,
      promise: Promise.resolve(undefined as never),
    };
    const countedTransport: SourceTransport = {
      async request(pinned) {
        entry.networkFetchCount += 1;
        return options.transport.request(pinned);
      },
    };
    entry.promise = (async () => {
      const fetched = await fetchSourceWithPinning({
        initialUrl,
        resolver: options.resolver,
        transport: countedTransport,
        signal,
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      });
      const verifiedTitle = fetched.mediaType === "text/plain"
        ? documentTitleFailure(
            "Une source text/plain ne fournit aucun titre de document vérifiable.",
          )
        : extractVerifiedDocumentTitle(fetched.body);
      const visibleText = extractVisibleText(fetched.body, fetched.mediaType);
      if (visibleText.length === 0) {
        throw new ResearchPipelineError(
          "source_empty",
          "Le texte visible normalisé de la source est vide.",
        );
      }
      return {
        fetched,
        verifiedTitle,
        visibleText,
        retrievedAt: (options.now ?? (() => new Date()))(),
      };
    })();
    pageCache.set(key, entry);
    return entry;
  }

  return {
    async verify(request): Promise<VerifiedSourceProof> {
      const monotonicNow = options.monotonicNow ?? (() => performance.now());
      const started = monotonicNow();
      let sourceFetchCount = 0;
      try {
        const initialUrl = validateCitationAndStructuredUrl(
          request.citation.url,
          request.candidate.structuredUrl,
        );
        const cacheEntry = cachedPage(initialUrl, request.signal);
        let prepared: PreparedSource;
        try {
          prepared = await cacheEntry.promise;
        } finally {
          sourceFetchCount = consumeNetworkFetchCount(cacheEntry);
        }
        const { fetched, verifiedTitle, visibleText, retrievedAt } = prepared;
        const { body: _discardedBody, ...fetchedMetadata } = fetched;
        void _discardedBody;
        const located = locateVerifiedExcerpt({
          visibleText,
          candidate: request.candidate,
          fetched: fetchedMetadata,
          retrievedAt,
        });
        return {
          citation: request.citation,
          citationUrl: fetched.citationUrl,
          finalUrl: fetched.finalUrl,
          title: verifiedTitle,
          verifiedExcerpt: located.excerpt,
          documentText: visibleText,
          locator: located.locator,
          sourceFetchCount,
          sourceVerificationMs: Math.max(0, Math.round(monotonicNow() - started)),
        };
      } catch (error) {
        const duration = Math.max(0, Math.round(monotonicNow() - started));
        if (error instanceof ResearchPipelineError) {
          throw new ResearchPipelineError(error.code, error.message, {
            sourceFetchCount,
            sourceVerificationMs: duration,
          }, error.contentTypeDiagnostics);
        }
        throw new ResearchPipelineError(
          "source_parse_failed",
          "La vérification de la source a échoué.",
          { sourceFetchCount, sourceVerificationMs: duration },
        );
      }
    },
  };
}
