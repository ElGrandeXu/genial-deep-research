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

interface IndexedEntityWord {
  readonly raw: string;
  readonly normalized: string;
  readonly start: number;
  readonly end: number;
}

const PERSON_NAME_ADJACENT_TITLES = new Set([
  "ceo",
  "cfo",
  "coo",
  "cofondateur",
  "cofondatrice",
  "cto",
  "directeur",
  "directrice",
  "docteur",
  "dr",
  "fondateur",
  "fondatrice",
  "madame",
  "m",
  "mme",
  "monsieur",
  "mr",
  "mrs",
  "ms",
  "president",
  "presidente",
  "président",
  "présidente",
  "prof",
  "professeur",
]);
const PERSON_NAME_FOLLOWING_METADATA = new Set(["last", "mis", "mise", "updated"]);
const PERSON_TITLE_CONTEXT_PREFIXES = new Set([
  "her",
  "his",
  "la",
  "le",
  "les",
  "leur",
  "leurs",
  "nos",
  "notre",
  "our",
  "sa",
  "ses",
  "son",
  "the",
  "their",
  "vos",
  "votre",
  "your",
]);
const PERSON_NAME_ALLOWED_PREFIXES = new Set([
  ...PERSON_NAME_ADJACENT_TITLES,
  "a",
  "about",
  "au",
  "aux",
  "avec",
  "by",
  "chez",
  "contact",
  "declare",
  "declares",
  "en",
  "et",
  "explains",
  "explique",
  "for",
  "indicates",
  "indique",
  "par",
  "pour",
  "profil",
  "profile",
  "said",
  "says",
  "selon",
  "states",
  "sur",
  "with",
]);
const COMPANY_NAME_ALLOWED_PREFIXES = new Set([
  "at",
  "by",
  "chez",
  "company",
  "entreprise",
  "for",
  "groupe",
  "group",
  "la",
  "le",
  "par",
  "pour",
  "société",
  "societe",
  "the",
]);
const NAME_CONNECTOR_PREFIXES = new Set([
  "d",
  "de",
  "del",
  "des",
  "du",
  "l",
  "la",
  "le",
  "van",
  "von",
]);
const PERSON_CONNECTOR_CONTEXTS = new Set([
  "about",
  "biographie",
  "biography",
  "portrait",
  "profil",
  "profile",
]);
const COMPANY_CONNECTOR_CONTEXTS = new Set([
  "entreprise",
  "filiale",
  "groupe",
  "group",
  "société",
  "societe",
]);
const COMPANY_PREFIXES_REQUIRING_CONTEXT = new Set([
  "company",
  "entreprise",
  "filiale",
  "groupe",
  "group",
  "la",
  "le",
  "société",
  "societe",
  "the",
]);
const COMPANY_LEGAL_NAME_SUFFIXES = new Set([
  "ag",
  "corp",
  "corporation",
  "gmbh",
  "group",
  "groupe",
  "inc",
  "llc",
  "ltd",
  "plc",
  "sa",
  "sas",
  "sasu",
  "se",
]);
const COMPANY_NAME_WORD_CONNECTORS = new Set(["and", "et"]);
const COMPANY_CLAUSE_LEADERS = new Set([
  "a",
  "accompagne",
  "acquiert",
  "acquired",
  "acquires",
  "annonce",
  "announced",
  "announces",
  "are",
  "became",
  "becomes",
  "builds",
  "can",
  "collaborates",
  "commercialise",
  "compte",
  "confirms",
  "consolide",
  "conçoit",
  "creates",
  "crée",
  "delivered",
  "delivers",
  "designed",
  "designs",
  "développe",
  "develops",
  "dirige",
  "distribue",
  "distributes",
  "does",
  "employed",
  "emploie",
  "employs",
  "est",
  "exerce",
  "expanded",
  "expands",
  "exporte",
  "exports",
  "exploite",
  "fabrique",
  "fournit",
  "founded",
  "generates",
  "génère",
  "had",
  "has",
  "importe",
  "imports",
  "indicated",
  "indicates",
  "is",
  "lance",
  "launches",
  "manufactured",
  "manufactures",
  "n",
  "offre",
  "offers",
  "opère",
  "operates",
  "owns",
  "possède",
  "produit",
  "produces",
  "propose",
  "provides",
  "publie",
  "published",
  "publishes",
  "raised",
  "raises",
  "réalise",
  "regroupe",
  "reported",
  "reports",
  "représente",
  "s",
  "se",
  "sert",
  "serves",
  "sells",
  "supports",
  "travaille",
  "utilise",
  "uses",
  "va",
  "vient",
  "was",
  "vend",
  "were",
  "will",
  "works",
]);
const COMPANY_AUXILIARY_CLAUSE_LEADERS = new Set([
  "a",
  "are",
  "can",
  "does",
  "est",
  "had",
  "has",
  "is",
  "n",
  "s",
  "se",
  "va",
  "vient",
  "was",
  "were",
  "will",
]);
const PERSON_NAME_CONNECTORS = new Set([
  "d",
  "de",
  "del",
  "des",
  "du",
  "la",
  "le",
  "van",
  "von",
]);

function normalizedEntityName(value: string): string {
  return normalizeVisibleText(value)
    .toLocaleLowerCase("fr")
    .replace(/\u00ad/gu, "")
    .replace(/[’']/gu, "'")
    .replace(/[^\p{L}\p{N}' -]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function indexedEntityWords(value: string): {
  readonly text: string;
  readonly words: readonly IndexedEntityWord[];
} {
  const text = normalizeVisibleText(value);
  const words = [...text.matchAll(/[\p{L}\p{M}\p{N}\u00ad]+/gu)].flatMap((match) => {
    const raw = match[0];
    const start = match.index;
    if (raw === undefined || start === undefined) return [];
    return [{
      raw,
      normalized: normalizedEntityName(raw),
      start,
      end: start + raw.length,
    }];
  });
  return { text, words };
}

function companyAliasCaseIsCompatible(source: string, displayName: string): boolean {
  const expectedLetters = [...displayName].filter((character) => /\p{L}/u.test(character));
  const sourceLetters = [...source].filter((character) => /\p{L}/u.test(character));
  if (expectedLetters.length === 0 || sourceLetters.length === 0) return false;
  const expectedCase = expectedLetters.join("");
  const sourceCase = sourceLetters.join("");
  return sourceCase === expectedCase || sourceLetters.every((character) =>
    character === character.toLocaleUpperCase("fr")
  );
}

function separatorCanJoinPersonName(value: string): boolean {
  return value.length > 0 && /^[\s'’\p{Cc}\p{Cf}\p{Pc}\p{Pd}-]+$/u.test(value);
}

function separatorTightlyJoinsName(value: string): boolean {
  return value.length > 0 && [...value].every((character) =>
    /^['’\p{Pc}\p{Pd}-]$/u.test(character) ||
    isIgnorableWordBoundaryCharacter(character)
  );
}

function separatorContainsCompanyNameConnector(value: string): boolean {
  return /^[\s\p{Cc}\p{Cf}]*[&+/]+[\s\p{Cc}\p{Cf}]*$/u.test(value);
}

function separatorCanContinueCompanyName(value: string): boolean {
  return value.length > 0 && /^[\s\p{Cc}\p{Cf}]+$/u.test(value);
}

function prefixRequiresOuterContext(
  prefix: string,
  entityType: "person" | "company",
): boolean {
  return entityType === "person"
    ? PERSON_NAME_ADJACENT_TITLES.has(prefix) ||
      PERSON_TITLE_CONTEXT_PREFIXES.has(prefix)
    : COMPANY_PREFIXES_REQUIRING_CONTEXT.has(prefix);
}

function separatorCanJoinEntityPrefix(
  value: string,
  prefix: string,
  entityType: "person" | "company",
): boolean {
  return separatorCanJoinPersonName(value) || (
    entityType === "person" &&
    PERSON_NAME_ADJACENT_TITLES.has(prefix) &&
    /^\.\s*$/u.test(value)
  );
}

function looksLikePersonNameComponent(word: IndexedEntityWord): boolean {
  if (
    PERSON_NAME_ADJACENT_TITLES.has(word.normalized) ||
    PERSON_NAME_FOLLOWING_METADATA.has(word.normalized)
  ) return false;
  const firstLetter = [...word.raw].find((character) => /\p{L}/u.test(character));
  return firstLetter !== undefined &&
    firstLetter === firstLetter.toLocaleUpperCase("fr") &&
    firstLetter !== firstLetter.toLocaleLowerCase("fr");
}

function looksLikeCompanyNameComponent(word: IndexedEntityWord): boolean {
  const firstLetter = [...word.raw].find((character) => /\p{L}/u.test(character));
  return firstLetter !== undefined &&
    firstLetter === firstLetter.toLocaleUpperCase("fr") &&
    firstLetter !== firstLetter.toLocaleLowerCase("fr");
}

function companyAliasHasClosedLegalContinuation(options: {
  readonly text: string;
  readonly words: readonly IndexedEntityWord[];
  readonly start: number;
}): boolean {
  for (let currentIndex = options.start; currentIndex < options.start + 12; currentIndex += 1) {
    const previous = options.words[currentIndex - 1];
    const current = options.words[currentIndex];
    if (previous === undefined || current === undefined) return false;
    const separator = options.text.slice(previous.end, current.start);
    if (/[.!?;:\n]/u.test(separator)) return false;
    if (!COMPANY_LEGAL_NAME_SUFFIXES.has(current.normalized)) continue;
    const following = options.words[currentIndex + 1];
    if (following === undefined) return true;
    const followingSeparator = options.text.slice(current.end, following.start);
    if (/[,;:!?\.\n]/u.test(followingSeparator)) return true;
    if (
      COMPANY_CLAUSE_LEADERS.has(following.normalized) &&
      !(following.normalized === "a" && looksLikeCompanyNameComponent(following))
    ) return true;
  }
  return false;
}

function adjacentPersonNameComponent(options: {
  readonly text: string;
  readonly words: readonly IndexedEntityWord[];
  readonly matchStart: number;
  readonly matchEnd: number;
  readonly direction: -1 | 1;
}): boolean {
  const adjacentIndex = options.direction < 0 ? options.matchStart - 1 : options.matchEnd;
  const adjacent = options.words[adjacentIndex];
  const edge = options.direction < 0
    ? options.words[options.matchStart]?.start
    : options.words[options.matchEnd - 1]?.end;
  if (adjacent === undefined || edge === undefined) return false;
  const separator = options.direction < 0
    ? options.text.slice(adjacent.end, edge)
    : options.text.slice(edge, adjacent.start);
  if (!separatorCanJoinPersonName(separator)) return false;
  if (looksLikePersonNameComponent(adjacent)) return true;
  if (!PERSON_NAME_CONNECTORS.has(adjacent.normalized)) return false;

  const outerIndex = adjacentIndex + options.direction;
  const outer = options.words[outerIndex];
  if (outer === undefined) return false;
  const outerSeparator = options.direction < 0
    ? options.text.slice(outer.end, adjacent.start)
    : options.text.slice(adjacent.end, outer.start);
  return separatorCanJoinPersonName(outerSeparator) && looksLikePersonNameComponent(outer);
}

function matchHasDisallowedPrefix(options: {
  readonly text: string;
  readonly words: readonly IndexedEntityWord[];
  readonly matchStart: number;
  readonly matchedRangeStart: number;
  readonly entityType: "person" | "company";
}): boolean {
  const first = options.words[options.matchStart];
  const previous = options.words[options.matchStart - 1];
  if (first === undefined || previous === undefined) return false;
  const separator = options.text.slice(previous.end, options.matchedRangeStart);
  if (separator.length === 0) return true;
  if (!separatorCanJoinEntityPrefix(
    separator,
    previous.normalized,
    options.entityType,
  )) return false;
  const allowedPrefixes = options.entityType === "person"
    ? PERSON_NAME_ALLOWED_PREFIXES
    : COMPANY_NAME_ALLOWED_PREFIXES;
  if (allowedPrefixes.has(previous.normalized)) {
    let prefixIndex = options.matchStart - 1;
    while (prefixIndex >= 0) {
      const prefix = options.words[prefixIndex];
      if (prefix === undefined || !prefixRequiresOuterContext(
        prefix.normalized,
        options.entityType,
      )) return false;

      const outer = options.words[prefixIndex - 1];
      if (outer === undefined) return false;
      const outerSeparator = options.text.slice(outer.end, prefix.start);
      if (!separatorCanJoinEntityPrefix(
        outerSeparator,
        outer.normalized,
        options.entityType,
      )) return false;
      const allowedTitleContext = options.entityType === "person" &&
        PERSON_TITLE_CONTEXT_PREFIXES.has(outer.normalized);
      if (!allowedPrefixes.has(outer.normalized) && !allowedTitleContext) return true;
      prefixIndex -= 1;
    }
    return false;
  }
  if (!NAME_CONNECTOR_PREFIXES.has(previous.normalized)) return true;

  const outer = options.words[options.matchStart - 2];
  if (outer === undefined) return true;
  const outerSeparator = options.text.slice(outer.end, previous.start);
  if (!separatorCanJoinPersonName(outerSeparator)) return true;
  const connectorContexts = options.entityType === "person"
    ? PERSON_CONNECTOR_CONTEXTS
    : COMPANY_CONNECTOR_CONTEXTS;
  return !connectorContexts.has(outer.normalized);
}

function matchHasTightlyJoinedSuffix(options: {
  readonly text: string;
  readonly words: readonly IndexedEntityWord[];
  readonly matchEnd: number;
  readonly matchedRangeEnd: number;
  readonly entityType: "person" | "company";
  readonly matchedNameHasLegalSuffix: boolean;
}): boolean {
  const last = options.words[options.matchEnd - 1];
  const next = options.words[options.matchEnd];
  if (last === undefined || next === undefined) return false;
  const separator = options.text.slice(options.matchedRangeEnd, next.start);
  if (separatorTightlyJoinsName(separator)) {
    if (/^['’]$/u.test(separator) && next.normalized === "s") return false;
    if (
      options.entityType === "person" &&
      /^\p{Pd}$/u.test(separator) &&
      PERSON_NAME_ADJACENT_TITLES.has(next.normalized)
    ) return false;
    return true;
  }
  if (options.entityType !== "company") return false;
  if (separatorContainsCompanyNameConnector(separator)) return true;
  if (!separatorCanContinueCompanyName(separator)) return false;
  if (options.matchedNameHasLegalSuffix) {
    if (COMPANY_CLAUSE_LEADERS.has(next.normalized)) return false;
    return COMPANY_LEGAL_NAME_SUFFIXES.has(next.normalized) ||
      COMPANY_NAME_WORD_CONNECTORS.has(next.normalized) ||
      looksLikeCompanyNameComponent(next);
  }
  if (COMPANY_LEGAL_NAME_SUFFIXES.has(next.normalized)) return true;
  if (COMPANY_NAME_WORD_CONNECTORS.has(next.normalized)) return true;
  if (!COMPANY_CLAUSE_LEADERS.has(next.normalized)) return true;
  if (companyAliasHasClosedLegalContinuation({
    ...options,
    start: options.matchEnd + 1,
  })) return true;
  const following = options.words[options.matchEnd + 1];
  if (
    COMPANY_CLAUSE_LEADERS.has(next.normalized) &&
    !COMPANY_AUXILIARY_CLAUSE_LEADERS.has(next.normalized) &&
    following !== undefined &&
    COMPANY_CLAUSE_LEADERS.has(following.normalized)
  ) return true;
  return !COMPANY_CLAUSE_LEADERS.has(next.normalized);
}

function mechanicallyMatchedNameRange(options: {
  readonly text: string;
  readonly displayName: string;
  readonly firstWordStart: number;
  readonly lastWordEnd: number;
}): { readonly start: number; readonly end: number } | null {
  const canonicalName = canonicalizeMechanical(
    normalizeVisibleText(options.displayName),
  ).text;
  if (canonicalName.length === 0) return null;
  const canonicalText = canonicalizeMechanical(options.text);
  for (const canonicalStart of findOccurrences(canonicalText.text, canonicalName)) {
    const canonicalEnd = canonicalStart + canonicalName.length - 1;
    const mappedStart = canonicalText.originalStarts[canonicalStart];
    const mappedEnd = canonicalText.originalEnds[canonicalEnd];
    if (
      mappedStart === undefined ||
      mappedEnd === undefined ||
      mappedEnd <= mappedStart ||
      mappedStart > options.firstWordStart ||
      mappedEnd < options.lastWordEnd ||
      !isCanonicalClusterBoundary(
        canonicalText.originalStarts,
        canonicalStart,
        canonicalEnd,
      )
    ) {
      continue;
    }
    return { start: mappedStart, end: mappedEnd };
  }
  return null;
}

function entityNameMatchRanges(
  value: string,
  displayName: string,
  entityType: "person" | "company",
): readonly { readonly start: number; readonly end: number }[] {
  const expectedWords = normalizedEntityName(displayName)
    .split(/[ '-]+/u)
    .filter(Boolean);
  if (expectedWords.length === 0) return [];
  const indexed = indexedEntityWords(value);
  const ranges: Array<{ readonly start: number; readonly end: number }> = [];
  for (let start = 0; start <= indexed.words.length - expectedWords.length; start += 1) {
    const matching = expectedWords.every(
      (expected, offset) => indexed.words[start + offset]?.normalized === expected,
    );
    if (!matching) continue;
    const end = start + expectedWords.length;
    const first = indexed.words[start];
    const last = indexed.words[end - 1];
    if (first === undefined || last === undefined) continue;
    const matchedRange = mechanicallyMatchedNameRange({
      text: indexed.text,
      displayName,
      firstWordStart: first.start,
      lastWordEnd: last.end,
    });
    if (matchedRange === null) continue;
    const matchedNameHasLegalSuffix = entityType === "company" &&
      COMPANY_LEGAL_NAME_SUFFIXES.has(expectedWords.at(-1) ?? "");
    if (
      entityType === "company" &&
      !matchedNameHasLegalSuffix &&
      !companyAliasCaseIsCompatible(
        indexed.text.slice(matchedRange.start, matchedRange.end),
        displayName,
      )
    ) {
      continue;
    }
    if (
      matchHasTightlyJoinedSuffix({
        ...indexed,
        matchEnd: end,
        matchedRangeEnd: matchedRange.end,
        entityType,
        matchedNameHasLegalSuffix,
      }) ||
      matchHasDisallowedPrefix({
        ...indexed,
        matchStart: start,
        matchedRangeStart: matchedRange.start,
        entityType,
      })
    ) {
      continue;
    }
    if (
      entityType === "person" &&
      adjacentPersonNameComponent({
        ...indexed,
        matchStart: start,
        matchEnd: end,
        direction: 1,
      })
    ) {
      continue;
    }
    ranges.push(matchedRange);
  }
  return ranges;
}

export function containsEntityNameInText(
  value: string,
  displayName: string,
  entityType: "person" | "company",
): boolean {
  return entityNameMatchRanges(value, displayName, entityType).length > 0;
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
const BOUNDARY_ZERO_WIDTH_CHARACTERS = new Set([
  "\u200b", // zero-width space
  "\u200c", // zero-width non-joiner
  "\u200d", // zero-width joiner (emitted at Webflow block boundaries)
  "\u2060", // word joiner
  "\ufeff", // zero-width no-break space
]);

interface IndexedCharacter {
  readonly character: string;
  readonly start: number;
  readonly end: number;
}

function typographicReplacement(character: string): string {
  if (TYPOGRAPHIC_DOUBLE_QUOTES.has(character)) return '"';
  if (TYPOGRAPHIC_SINGLE_QUOTES.has(character)) return "'";
  if (TYPOGRAPHIC_DASHES.has(character)) return "-";
  if (character === "\u2026") return "...";
  if (character === "\u00ad") return "";
  return character;
}

function indexedCharacters(value: string): readonly IndexedCharacter[] {
  const characters: IndexedCharacter[] = [];
  for (let index = 0; index < value.length;) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) break;
    const character = String.fromCodePoint(codePoint);
    const end = index + character.length;
    characters.push({ character, start: index, end });
    index = end;
  }
  return characters;
}

function isWhitespace(character: string): boolean {
  return /^\p{White_Space}$/u.test(character);
}

function isBoundarySeparator(character: string): boolean {
  return isWhitespace(character) || /^\p{P}$/u.test(character);
}

function isWordConstituent(character: string | null): boolean {
  return character !== null && /^[\p{L}\p{M}\p{N}]$/u.test(character);
}

function canonicalizeMechanical(value: string): {
  readonly text: string;
  readonly originalStarts: readonly number[];
  readonly originalEnds: readonly number[];
} {
  let text = "";
  const originalStarts: number[] = [];
  const originalEnds: number[] = [];
  const append = (replacement: string, item: IndexedCharacter): void => {
    if (replacement.length === 0) return;
    if (replacement === " " && text.endsWith(" ")) {
      originalEnds[originalEnds.length - 1] = item.end;
      return;
    }
    text += replacement;
    for (let offset = 0; offset < replacement.length; offset += 1) {
      originalStarts.push(item.start);
      originalEnds.push(item.end);
    }
  };
  const characters = indexedCharacters(value);
  for (let index = 0; index < characters.length;) {
    const item = characters[index];
    if (item === undefined) break;
    if (BOUNDARY_ZERO_WIDTH_CHARACTERS.has(item.character)) {
      let runEnd = index + 1;
      while (
        runEnd < characters.length &&
        BOUNDARY_ZERO_WIDTH_CHARACTERS.has(characters[runEnd]?.character ?? "")
      ) {
        runEnd += 1;
      }
      const previous = characters[index - 1]?.character ?? null;
      const next = characters[runEnd]?.character ?? null;
      if (
        previous === null ||
        next === null ||
        isBoundarySeparator(previous) ||
        isBoundarySeparator(next)
      ) {
        index = runEnd;
        continue;
      }
      for (let retained = index; retained < runEnd; retained += 1) {
        const retainedItem = characters[retained];
        if (retainedItem !== undefined) {
          append(retainedItem.character.toLocaleLowerCase("fr"), retainedItem);
        }
      }
      index = runEnd;
      continue;
    }
    const replacement = isWhitespace(item.character)
      ? " "
      : typographicReplacement(item.character).toLocaleLowerCase("fr");
    index += 1;
    append(replacement, item);
  }
  return { text, originalStarts, originalEnds };
}

function mechanicalComparisonKey(value: string): string {
  return canonicalizeMechanical(normalizeVisibleText(value)).text
    .trim()
    .replace(/\.$/u, "")
    .trimEnd();
}

export function textsAreMechanicallyEquivalent(left: string, right: string): boolean {
  const leftKey = mechanicalComparisonKey(left);
  return leftKey.length > 0 && leftKey === mechanicalComparisonKey(right);
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

function characterAt(value: string, index: number): string | null {
  if (index < 0 || index >= value.length) return null;
  const codePoint = value.codePointAt(index);
  return codePoint === undefined ? null : String.fromCodePoint(codePoint);
}

function characterBefore(value: string, index: number): string | null {
  if (index <= 0 || index > value.length) return null;
  let start = index - 1;
  const lastCodeUnit = value.charCodeAt(start);
  if (
    lastCodeUnit >= 0xdc00 &&
    lastCodeUnit <= 0xdfff &&
    start > 0
  ) {
    const previousCodeUnit = value.charCodeAt(start - 1);
    if (previousCodeUnit >= 0xd800 && previousCodeUnit <= 0xdbff) start -= 1;
  }
  return value.slice(start, index);
}

function isIgnorableWordBoundaryCharacter(character: string): boolean {
  return /^\p{Cf}$/u.test(character) ||
    (/^\p{Cc}$/u.test(character) && !isWhitespace(character));
}

interface SignificantCharacter {
  readonly character: string;
  readonly start: number;
  readonly end: number;
}

function significantCharacterAt(value: string, index: number): SignificantCharacter | null {
  let cursor = index;
  while (cursor < value.length) {
    const character = characterAt(value, cursor);
    if (character === null) return null;
    if (!isIgnorableWordBoundaryCharacter(character)) {
      return { character, start: cursor, end: cursor + character.length };
    }
    cursor += character.length;
  }
  return null;
}

function significantCharacterBefore(value: string, index: number): SignificantCharacter | null {
  let cursor = index;
  while (cursor > 0) {
    const character = characterBefore(value, cursor);
    if (character === null) return null;
    if (!isIgnorableWordBoundaryCharacter(character)) {
      return { character, start: cursor - character.length, end: cursor };
    }
    cursor -= character.length;
  }
  return null;
}

function isIntraWordConnector(character: string): boolean {
  return /^['’\p{Pc}\p{Pd}-]$/u.test(character);
}

function joinedToWordBefore(value: string, boundary: SignificantCharacter | null): boolean {
  if (boundary === null) return false;
  if (isWordConstituent(boundary.character)) return true;
  if (!isIntraWordConnector(boundary.character)) return false;
  return isWordConstituent(
    significantCharacterBefore(value, boundary.start)?.character ?? null,
  );
}

function joinedToWordAfter(value: string, boundary: SignificantCharacter | null): boolean {
  if (boundary === null) return false;
  if (isWordConstituent(boundary.character)) return true;
  if (!isIntraWordConnector(boundary.character)) return false;
  return isWordConstituent(
    significantCharacterAt(value, boundary.end)?.character ?? null,
  );
}

function hasStandaloneMatchBoundaries(
  value: string,
  start: number,
  end: number,
): boolean {
  const first = significantCharacterAt(value, start)?.character ?? null;
  const previous = significantCharacterBefore(value, start);
  const last = significantCharacterBefore(value, end)?.character ?? null;
  const next = significantCharacterAt(value, end);
  return !(isWordConstituent(first) && joinedToWordBefore(value, previous)) &&
    !(isWordConstituent(last) && joinedToWordAfter(value, next));
}

function isCanonicalClusterBoundary(
  positions: readonly number[],
  start: number,
  endInclusive: number,
): boolean {
  const beginsAtOriginalCharacter = start === 0 || positions[start - 1] !== positions[start];
  const endsAtOriginalCharacter = endInclusive === positions.length - 1 ||
    positions[endInclusive + 1] !== positions[endInclusive];
  return beginsAtOriginalCharacter && endsAtOriginalCharacter;
}

export function locateVerifiedExcerpt(options: {
  readonly visibleText: string;
  readonly candidate: ProviderClaimCandidate;
  readonly attributedDisplayNames?: readonly string[];
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

  const occurrences = findOccurrences(options.visibleText, exact).filter((index) =>
    hasStandaloneMatchBoundaries(options.visibleText, index, index + exact.length)
  );
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
    const canonicalCandidate = canonicalizeMechanical(exact).text;
    if (canonicalCandidate.length === 0) {
      throw new ResearchPipelineError(
        "source_excerpt_missing",
        "L’extrait candidat est absent du texte visible normalisé.",
      );
    }
    const canonicalSource = canonicalizeMechanical(options.visibleText);
    const canonicalOccurrences = findOccurrences(
      canonicalSource.text,
      canonicalCandidate,
    ).flatMap((canonicalStart) => {
      const canonicalEnd = canonicalStart + canonicalCandidate.length - 1;
      const mappedStart = canonicalSource.originalStarts[canonicalStart];
      const mappedEnd = canonicalSource.originalEnds[canonicalEnd];
      if (
        mappedStart === undefined ||
        mappedEnd === undefined ||
        mappedEnd <= mappedStart ||
        !isCanonicalClusterBoundary(
          canonicalSource.originalStarts,
          canonicalStart,
          canonicalEnd,
        ) ||
        !hasStandaloneMatchBoundaries(options.visibleText, mappedStart, mappedEnd)
      ) {
        return [];
      }
      return [{ canonicalStart, mappedStart, mappedEnd }];
    });
    if (canonicalOccurrences.length === 0) {
      throw new ResearchPipelineError(
        "source_excerpt_missing",
        "L’extrait candidat est absent du texte visible normalisé.",
      );
    }
    if (canonicalOccurrences.length !== 1) {
      throw new ResearchPipelineError(
        "source_excerpt_ambiguous",
        "L’extrait candidat possède plusieurs occurrences mécaniquement équivalentes.",
      );
    }
    const canonicalOccurrence = canonicalOccurrences[0];
    if (canonicalOccurrence === undefined) {
      throw new ResearchPipelineError(
        "source_excerpt_missing",
        "L’extrait candidat est absent du texte visible normalisé.",
      );
    }
    selected = canonicalOccurrence.mappedStart;
    selectedEnd = canonicalOccurrence.mappedEnd;
    occurrenceIndex = 0;
    matchMode = "mechanical_equivalence";
  }

  if (
    characterCount(options.visibleText.slice(selected, selectedEnd)) >
      SOURCE_EXCERPT_MAX_CHARACTERS
  ) {
    throw new ResearchPipelineError(
      "source_excerpt_missing",
      "La tranche source remappée dépasse la limite autorisée.",
    );
  }

  const candidateDisplayName = "displayName" in options.candidate &&
      typeof options.candidate.displayName === "string"
    ? options.candidate.displayName
    : "scopeLabel" in options.candidate && typeof options.candidate.scopeLabel === "string"
      ? options.candidate.scopeLabel
      : null;
  if (
    options.attributedDisplayNames !== undefined &&
    options.attributedDisplayNames.length === 0
  ) {
    throw new ResearchPipelineError(
      "source_excerpt_missing",
      "Aucun nom d’entité attribuée ne permet de contrôler l’extrait candidat.",
    );
  }
  const displayNames = options.attributedDisplayNames ??
    (candidateDisplayName === null ? [] : [candidateDisplayName]);
  if (
    displayNames.length > 0 &&
    !displayNames.some((displayName) =>
      entityNameMatchRanges(
        options.visibleText,
        displayName,
        options.candidate.entityType,
      ).some((range) => range.start >= selected && range.end <= selectedEnd)
    )
  ) {
    throw new ResearchPipelineError(
      "source_excerpt_missing",
      "L’extrait candidat tronque ou confond le nom de l’entité attribuée.",
    );
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
          ...(request.attributedDisplayNames === undefined
            ? {}
            : { attributedDisplayNames: request.attributedDisplayNames }),
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
