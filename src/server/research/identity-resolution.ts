import {
  containsEntityNameInText,
  normalizeVisibleText,
} from "./source-content";
import { publisherDomainForUrl } from "../../domain/publisher-domain";
import { evaluateClaimQuality } from "./claim-quality";
import { evaluateFactAttribution } from "./scope-policy";
import type {
  EntityScope,
  ProviderCandidateDiscriminators,
  ProviderIdentityCandidate,
  ProviderFactCandidate,
  ProviderResearchDocument,
  ResearchInput,
  VerifiedSourceProof,
} from "./types";

const CANDIDATE_KEY = /^[a-z][a-z0-9_-]{0,31}$/u;
const LEGAL_SUFFIXES = new Set([
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

type VerifiedDiscriminators = {
  -readonly [Key in keyof ProviderCandidateDiscriminators]?: string;
};

interface VerifiedCorroboratingFact {
  readonly candidate: ProviderFactCandidate;
  readonly proof: VerifiedSourceProof;
}

export interface VerifiedIdentityCandidate {
  readonly candidate: ProviderIdentityCandidate;
  readonly proof: VerifiedSourceProof;
  readonly corroboratingProofs?: readonly VerifiedSourceProof[];
  readonly corroboratingFacts?: readonly VerifiedCorroboratingFact[];
  readonly proofBasis?: "dedicated" | "verified_facts";
}

export interface ContextSignal {
  readonly kind:
    | "source_domain"
    | "official_site"
    | "legal_identifier"
    | "employer"
    | "city"
    | "country"
    | "industry"
    | "corroborated_context"
    | "year";
  readonly value: string;
  readonly strength: "strong" | "medium";
}

export interface IdentityDecision {
  readonly status:
    | "resolved"
    | "ambiguous"
    | "insufficient_context"
    | "not_found_within_scope";
  readonly selected: VerifiedIdentityCandidate | null;
  readonly candidates: readonly VerifiedIdentityCandidate[];
  readonly verifiedDiscriminators: VerifiedDiscriminators;
  readonly contextSignals: readonly ContextSignal[];
  readonly reasonCodes: readonly string[];
  readonly rationale: string;
}

function normalizedName(value: string): string {
  return normalizeVisibleText(value)
    .toLocaleLowerCase("fr")
    .replace(/[’']/gu, "'")
    .replace(/[^\p{L}\p{N}' -]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function escapedPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function proofContainsDisplayName(
  proof: VerifiedSourceProof,
  candidate: ProviderIdentityCandidate,
): boolean {
  return containsEntityNameInText(
    proof.verifiedExcerpt,
    candidate.displayName,
    candidate.entityType,
  );
}

function proofKey(proof: VerifiedSourceProof): string {
  return [
    proof.finalUrl,
    proof.locator.normalizedTextSha256,
    normalizedName(proof.verifiedExcerpt),
  ].join("|");
}

function proofsFor(item: VerifiedIdentityCandidate): readonly VerifiedSourceProof[] {
  return [...new Map(
    [item.proof, ...(item.corroboratingProofs ?? [])].map((proof) => [
      proofKey(proof),
      proof,
    ] as const),
  ).values()];
}

function factCanCorroborateCandidate(
  candidate: ProviderIdentityCandidate,
  item: {
    readonly candidate: ProviderFactCandidate;
    readonly proof: VerifiedSourceProof;
  },
): boolean {
  if (
    item.candidate.subjectKey !== candidate.candidateKey ||
    item.candidate.entityType !== candidate.entityType ||
    !proofContainsDisplayName(item.proof, candidate)
  ) {
    return false;
  }
  const selected: VerifiedIdentityCandidate = {
    candidate: {
      ...candidate,
      statement: item.proof.verifiedExcerpt,
      structuredUrl: item.proof.finalUrl,
      excerpt: item.proof.verifiedExcerpt,
      prefix: item.proof.locator.prefix,
      suffix: item.proof.locator.suffix,
    },
    proof: item.proof,
    proofBasis: "verified_facts",
  };
  return evaluateFactAttribution({
    selected,
    fact: item,
    requestedName: candidate.displayName,
    verifiedOfficialSite: undefined,
  }).accepted && evaluateClaimQuality({
    candidate: item.candidate,
    proof: item.proof,
    selectedDisplayName: candidate.displayName,
  }).accepted;
}

export function assembleVerifiedIdentityCandidates(options: {
  readonly candidates: readonly ProviderIdentityCandidate[];
  readonly verifiedCandidates: readonly VerifiedIdentityCandidate[];
  readonly verifiedFacts: readonly {
    readonly candidate: ProviderFactCandidate;
    readonly proof: VerifiedSourceProof;
  }[];
}): readonly VerifiedIdentityCandidate[] {
  return options.candidates.flatMap((candidate) => {
    const direct = options.verifiedCandidates.find(
      (item) => item.candidate.candidateKey === candidate.candidateKey,
    );
    const corroboratingFacts = options.verifiedFacts.filter((item) =>
      factCanCorroborateCandidate(candidate, item)
    );
    const factProofs = corroboratingFacts.map(({ proof }) => proof);
    const proofs = [...new Map(
      [...(direct === undefined ? [] : [direct.proof]), ...factProofs].map((proof) => [
        proofKey(proof),
        proof,
      ] as const),
    ).values()];
    const primaryProof = direct?.proof ?? proofs[0];
    if (primaryProof === undefined) return [];
    const primaryCandidate = direct?.candidate ?? {
      ...candidate,
      statement: primaryProof.verifiedExcerpt,
      structuredUrl: primaryProof.finalUrl,
      excerpt: primaryProof.verifiedExcerpt,
      prefix: primaryProof.locator.prefix,
      suffix: primaryProof.locator.suffix,
    };
    return [{
      candidate: primaryCandidate,
      proof: primaryProof,
      corroboratingProofs: proofs.filter((proof) => proof !== primaryProof),
      corroboratingFacts,
      proofBasis: direct === undefined ? "verified_facts" : "dedicated",
    }];
  });
}

function normalizedContext(value: string): string {
  return normalizeVisibleText(value)
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/\s+/gu, " ")
    .trim();
}

function contextTokens(value: string): string[] {
  return normalizedContext(value).match(/[\p{L}\p{N}]+/gu) ?? [];
}

interface IndexedContextToken {
  readonly raw: string;
  readonly normalized: string;
}

function indexedContextTokens(value: string): readonly IndexedContextToken[] {
  return [...normalizeVisibleText(value).matchAll(/[\p{L}\p{M}\p{N}]+/gu)].map((match) => ({
    raw: match[0],
    normalized: normalizedContext(match[0]),
  }));
}

function looksLikeNamedPartyToken(token: IndexedContextToken): boolean {
  const letters = [...token.raw].filter((character) => /\p{L}/u.test(character));
  const first = letters[0];
  if (first === undefined) return false;
  return first === first.toLocaleUpperCase("fr") &&
    first !== first.toLocaleLowerCase("fr");
}

const NON_PARTY_CAPITALIZED_CONTEXT_TOKENS = new Set([
  "ai",
  "ambassadeur",
  "ambassadrice",
  "ceo",
  "cfo",
  "chief",
  "coo",
  "cto",
  "directeur",
  "directrice",
  "executive",
  "expert",
  "experte",
  "fondateur",
  "fondatrice",
  "founder",
  "general",
  "generale",
  "gerant",
  "gerante",
  "head",
  "ia",
  "last",
  "mis",
  "mise",
  "officer",
  "partner",
  "president",
  "presidente",
  "responsable",
  "specialiste",
  "updated",
]);

function bridgeContainsCompetingNamedParty(
  bridge: readonly IndexedContextToken[],
  candidate: ProviderIdentityCandidate,
): boolean {
  const employerTokens = candidate.discriminators.employer === null
    ? []
    : contextTokens(candidate.discriminators.employer);
  const companySubjectTokens = candidate.entityType === "company"
    ? new Set(contextTokens(candidate.displayName))
    : new Set<string>();
  for (let index = 0; index < bridge.length;) {
    const current = bridge[index] ?? { raw: "", normalized: "" };
    if (
      !looksLikeNamedPartyToken(current) ||
      NON_PARTY_CAPITALIZED_CONTEXT_TOKENS.has(current.normalized) ||
      companySubjectTokens.has(current.normalized)
    ) {
      index += 1;
      continue;
    }
    const isExplicitEmployer = employerTokens.length > 0 &&
      employerTokens.every(
        (token, offset) => bridge[index + offset]?.normalized === token,
      ) &&
      employerBridgeIsExplicit(
        bridge.slice(0, index).map(({ normalized }) => normalized),
      );
    if (!isExplicitEmployer) return true;
    index += employerTokens.length;
  }
  return false;
}

function containsContext(haystack: string, needle: string): boolean {
  const expected = contextTokens(needle);
  if (expected.length === 0) return false;
  const available = contextTokens(haystack);
  for (let start = 0; start <= available.length - expected.length; start += 1) {
    if (expected.every((token, offset) => available[start + offset] === token)) {
      return true;
    }
  }
  return false;
}

function tokens(value: string): string[] {
  return normalizedName(value).split(/[ '-]+/u).filter(Boolean);
}

function requestedAndCandidateNamesMatch(requested: string, displayName: string): boolean {
  const requestedName = normalizedName(requested);
  const candidateName = normalizedName(displayName);
  if (requestedName === candidateName) return true;
  const requestedTokens = tokens(requestedName);
  const candidateTokens = new Set(tokens(candidateName));
  if (requestedTokens.length === 1) return candidateTokens.has(requestedTokens[0] ?? "");
  const requestedSuffix = requestedTokens.find((token) => LEGAL_SUFFIXES.has(token));
  if (requestedSuffix !== undefined && !candidateTokens.has(requestedSuffix)) return false;
  return requestedTokens.every((token) => candidateTokens.has(token));
}

function scopeMatchesType(scope: EntityScope, type: "person" | "company"): boolean {
  return type === "person" ? scope === "person" : scope !== "person";
}

function derivedEntityScope(item: VerifiedIdentityCandidate): EntityScope {
  if (item.candidate.entityType === "person") return "person";
  const excerpt = normalizedContext(item.proof.verifiedExcerpt);
  const subject = escapedPattern(normalizedContext(item.candidate.displayName));
  const relation = "(?:est|is|constitue|represente|represents|operates as|se presente comme)";
  const article = "(?:(?:un|une|le|la|les|a|an|the)\\s+|l['’])?";
  const directlyDefines = (kind: string): boolean => new RegExp(
    `\\b${subject}\\b.{0,80}\\b${relation}\\s+${article}${kind}\\b`,
    "u",
  ).test(excerpt);

  if (directlyDefines("(?:marque|brand)")) return "brand";
  if (directlyDefines("(?:filiale|subsidiary)")) return "subsidiary";
  if (
    directlyDefines("(?:groupe|group|holding)") ||
    /\b(?:groupe|group|holding)\b$/u.test(normalizedContext(item.candidate.displayName))
  ) return "group";
  return "company";
}

function withDerivedScope(item: VerifiedIdentityCandidate): VerifiedIdentityCandidate {
  const entityScope = derivedEntityScope(item);
  return entityScope === item.candidate.entityScope
    ? item
    : { ...item, candidate: { ...item.candidate, entityScope } };
}

function normalizeDomain(value: string): string | null {
  const raw = value.trim().toLocaleLowerCase("en-US");
  if (raw.length === 0) return null;
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./u, "").replace(/\.$/u, "");
  } catch {
    return null;
  }
}

function domainsIn(value: string): Set<string> {
  const domains = new Set<string>();
  const matches = value.matchAll(
    /(?:https?:\/\/)?(?:www\.)?([a-z0-9](?:[a-z0-9-]{0,62}\.)+[a-z]{2,63})(?:[/:?#][^\s,;]*)?/giu,
  );
  for (const match of matches) {
    const domain = normalizeDomain(match[1] ?? "");
    if (domain !== null) domains.add(domain);
  }
  return domains;
}

function sameDomain(left: string, right: string): boolean {
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

type TextDiscriminatorKey = "city" | "country" | "industry" | "employer" | "legalIdentifier" | "year";

function tokenSequenceStarts(haystack: readonly string[], needle: readonly string[]): number[] {
  if (needle.length === 0) return [];
  const starts: number[] = [];
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    if (needle.every((token, offset) => haystack[start + offset] === token)) {
      starts.push(start);
    }
  }
  return starts;
}

const CONTEXT_ACRONYM_EXPANSIONS = new Map<string, readonly (readonly string[])[]>([
  ["ai", [["ia"], ["artificial", "intelligence"], ["intelligence", "artificielle"]]],
  ["ia", [["ai"], ["intelligence", "artificielle"], ["artificial", "intelligence"]]],
]);

function discriminatorTokenForms(value: string): readonly (readonly string[])[] {
  const words = contextTokens(value);
  if (words.length === 0) return [];
  const joined = words.join(" ");
  if (joined === "artificial intelligence" || joined === "intelligence artificielle") {
    return [
      ["artificial", "intelligence"],
      ["intelligence", "artificielle"],
      ["ai"],
      ["ia"],
    ];
  }
  return [words];
}

function discriminatorValueRanges(
  excerptTokens: readonly string[],
  value: string,
): readonly { readonly start: number; readonly end: number }[] {
  const ranges = discriminatorTokenForms(value).flatMap((form) =>
    tokenSequenceStarts(excerptTokens, form).map((start) => ({
      start,
      end: start + form.length,
    }))
  );
  const valueTokens = contextTokens(value);
  const acronym = valueTokens.length === 1 ? valueTokens[0] : undefined;
  if (acronym !== undefined) {
    for (const expansion of CONTEXT_ACRONYM_EXPANSIONS.get(acronym) ?? []) {
      for (const start of tokenSequenceStarts(excerptTokens, expansion)) {
        ranges.push({ start, end: start + expansion.length });
      }
    }
  }
  return [...new Map(ranges.map((range) => [
    `${range.start}:${range.end}`,
    range,
  ] as const)).values()];
}

const EMPLOYER_ROLE_WORDS = new Set([
  "associe",
  "associee",
  "ceo",
  "cfo",
  "chief",
  "co",
  "cofondateur",
  "cofondatrice",
  "coo",
  "cto",
  "design",
  "directeur",
  "directrice",
  "et",
  "executive",
  "fondateur",
  "fondatrice",
  "founder",
  "general",
  "generale",
  "head",
  "membre",
  "numerique",
  "officer",
  "partner",
  "president",
  "presidente",
  "responsable",
]);
const EMPLOYER_CONNECTORS = new Set([
  "and",
  "at",
  "chez",
  "d",
  "de",
  "du",
  "et",
  "for",
  "l",
  "of",
  "pour",
]);
const INDUSTRY_MARKERS = new Set([
  "activite",
  "ambassadeur",
  "ambassadrice",
  "concoit",
  "consultant",
  "consultante",
  "developpe",
  "dirige",
  "directeur",
  "directrice",
  "expert",
  "experte",
  "formation",
  "industrie",
  "industry",
  "programme",
  "program",
  "recherche",
  "secteur",
  "specialise",
  "specialisee",
  "specialist",
  "specialiste",
]);
const INDUSTRY_CONNECTORS = new Set([
  "and",
  "d",
  "dans",
  "de",
  "du",
  "en",
  "et",
  "in",
  "l",
  "of",
  "pour",
  "sur",
]);
const LOCATION_CONNECTORS = new Set(["a", "at", "dans", "de", "en", "in"]);
const SUBJECT_BINDING_BLOCKERS = new Set([
  "accompagne",
  "accompanies",
  "avec",
  "cite",
  "cites",
  "collabore",
  "collaborates",
  "cote",
  "cotes",
  "interview",
  "interviewe",
  "interviews",
  "alongside",
  "meets",
  "mentionne",
  "mentions",
  "photograph",
  "photographie",
  "photographs",
  "presente",
  "presents",
  "recoit",
  "recoivent",
  "received",
  "receives",
  "rencontre",
  "tandis",
  "while",
  "with",
]);
const INDUSTRY_SUBJECT_ACTIONS = new Set([
  "anime",
  "concoit",
  "conduit",
  "developpe",
  "develops",
  "dirige",
  "est",
  "exerce",
  "is",
  "leads",
  "mene",
  "runs",
  "was",
]);
const INDUSTRY_SUBJECT_ARTICLES = new Set([
  "a",
  "an",
  "des",
  "l",
  "la",
  "le",
  "les",
  "the",
  "un",
  "une",
]);
const INDUSTRY_DESCRIPTOR_WORDS = new Set([
  "applique",
  "appliquee",
  "applied",
  "digital",
  "digitale",
  "industriel",
  "industrielle",
  "numerique",
  "professionnel",
  "professionnelle",
  "public",
  "publique",
  "recognized",
  "reconnu",
  "reconnue",
  "responsable",
  "transformation",
]);
const DIRECTORY_UPDATE_MONTHS = new Set([
  "aout",
  "april",
  "august",
  "avril",
  "december",
  "decembre",
  "february",
  "fevrier",
  "january",
  "janvier",
  "juillet",
  "june",
  "juin",
  "march",
  "mars",
  "may",
  "mai",
  "november",
  "novembre",
  "october",
  "octobre",
  "september",
  "septembre",
]);
const DIRECTORY_UPDATE_ARTICLES = new Set(["le", "on", "the"]);
const ROLE_ORGANIZATION_ARTICLES = new Set(["a", "an", "l", "la", "le", "les", "the", "un", "une"]);
const LOCATION_SUBJECT_ACTIONS = new Set([
  ...INDUSTRY_SUBJECT_ACTIONS,
  "base",
  "based",
  "enseigne",
  "establi",
  "etablie",
  "headquartered",
  "implante",
  "implantee",
  "intervient",
  "lives",
  "located",
  "operates",
  "publie",
  "reside",
  "travaille",
  "vit",
  "works",
]);
const LOCATION_DESCRIPTOR_WORDS = new Set([
  ...INDUSTRY_DESCRIPTOR_WORDS,
  "activite",
  "ai",
  "artificial",
  "atelier",
  "aux",
  "comme",
  "conference",
  "dans",
  "entreprise",
  "entreprises",
  "etabli",
  "etablie",
  "filiale",
  "francais",
  "francaise",
  "groupe",
  "ia",
  "intelligence",
  "numeriques",
  "organisation",
  "organisations",
  "ordre",
  "programme",
  "services",
  "travaux",
]);
const LEGAL_IDENTIFIER_MARKERS = new Set([
  "identifiant",
  "immatricule",
  "immatriculee",
  "numero",
  "registered",
  "registration",
]);
const YEAR_MARKERS = new Set(["a", "depuis", "en", "founded", "fonde", "fondee", "in", "since"]);

function employerBridgeIsExplicit(bridge: readonly string[]): boolean {
  const joined = bridge.join(" ");
  if (/^(?:travaille chez|works at|works for|employe par|employee at|rejoint|joined|dirige|leads)(?: l)?$/u.test(joined)) {
    return true;
  }
  const withoutCopula = bridge[0] === "est" || bridge[0] === "is" ? bridge.slice(1) : bridge;
  const last = withoutCopula.at(-1);
  const role = last !== undefined && EMPLOYER_CONNECTORS.has(last)
    ? withoutCopula.slice(0, -1)
    : withoutCopula;
  return role.length > 0 &&
    role.length <= 6 &&
    role.some((token) => EMPLOYER_ROLE_WORDS.has(token) && !EMPLOYER_CONNECTORS.has(token)) &&
    role.every((token) => EMPLOYER_ROLE_WORDS.has(token) || EMPLOYER_CONNECTORS.has(token));
}

function withoutDirectoryUpdateMetadata(value: readonly string[]): readonly string[] {
  let cursor = -1;
  if (
    (value[0] === "mis" || value[0] === "mise") &&
    value[1] === "a" &&
    value[2] === "jour"
  ) {
    cursor = 3;
  } else if (value[0] === "updated" && value[1] === "on") {
    cursor = 2;
  } else if (value[0] === "last" && value[1] === "updated") {
    cursor = 2;
  }
  if (cursor < 0) return value;
  if (DIRECTORY_UPDATE_ARTICLES.has(value[cursor] ?? "")) cursor += 1;
  let dateTokenCount = 0;
  while (
    cursor < value.length &&
    dateTokenCount < 4 &&
    (/^\d{1,4}$/u.test(value[cursor] ?? "") || DIRECTORY_UPDATE_MONTHS.has(value[cursor] ?? ""))
  ) {
    cursor += 1;
    dateTokenCount += 1;
  }
  return dateTokenCount > 0 ? value.slice(cursor) : value;
}

function industryPrefixIsExplicit(
  prefix: readonly string[],
  candidate: ProviderIdentityCandidate,
): boolean {
  prefix = withoutDirectoryUpdateMetadata(prefix);
  const employerTokens = candidate.discriminators.employer === null
    ? []
    : contextTokens(candidate.discriminators.employer);
  if (employerTokens.length > 0) {
    const employerStart = tokenSequenceStarts(prefix, employerTokens);
    if (employerStart.length > 1) return false;
    const start = employerStart[0];
    if (start !== undefined) {
      if (!employerBridgeIsExplicit(prefix.slice(0, start))) return false;
      return prefix.slice(start + employerTokens.length).every((token) =>
        new Set(["est", "is", "was"]).has(token)
      );
    }
  }
  return prefix.every((token) =>
    INDUSTRY_SUBJECT_ACTIONS.has(token) ||
    INDUSTRY_SUBJECT_ARTICLES.has(token) ||
    INDUSTRY_MARKERS.has(token)
  );
}

function locationBridgeIsExplicit(
  bridge: readonly string[],
  candidate: ProviderIdentityCandidate,
): boolean {
  if (!LOCATION_CONNECTORS.has(bridge.at(-1) ?? "")) return false;
  const body = withoutDirectoryUpdateMetadata(bridge.slice(0, -1));
  if (body.length === 0) return true;
  if (
    !LOCATION_SUBJECT_ACTIONS.has(body[0] ?? "") &&
    !INDUSTRY_MARKERS.has(body[0] ?? "") &&
    !EMPLOYER_ROLE_WORDS.has(body[0] ?? "")
  ) return false;

  const allowedTokens = new Set([
    ...LOCATION_SUBJECT_ACTIONS,
    ...LOCATION_DESCRIPTOR_WORDS,
    ...INDUSTRY_CONNECTORS,
    ...INDUSTRY_MARKERS,
    ...INDUSTRY_SUBJECT_ARTICLES,
    ...EMPLOYER_CONNECTORS,
    ...EMPLOYER_ROLE_WORDS,
    ...contextTokens(candidate.displayName),
    ...Object.values(candidate.discriminators).flatMap((value) =>
      value === null ? [] : contextTokens(value)
    ),
  ]);
  const unknownIndexes = body.flatMap((token, index) =>
    allowedTokens.has(token) || /^\d+$/u.test(token) ? [] : [index]
  );
  if (unknownIndexes.length === 0) return true;
  if (unknownIndexes.length > 2) return false;
  const firstUnknown = unknownIndexes[0] ?? -1;
  const contiguous = unknownIndexes.every((index, offset) => index === firstUnknown + offset);
  if (!contiguous) return false;
  const preceding = body[firstUnknown - 1] ?? "";
  return preceding === "comme" || (body[0] === "enseigne" &&
    INDUSTRY_SUBJECT_ARTICLES.has(preceding));
}

function industryBridgeIsExplicit(
  bridge: readonly string[],
  candidate: ProviderIdentityCandidate,
): boolean {
  if (!INDUSTRY_CONNECTORS.has(bridge.at(-1) ?? "")) return false;
  let markerIndex = -1;
  for (let index = 0; index < bridge.length; index += 1) {
    if (INDUSTRY_MARKERS.has(bridge[index] ?? "")) markerIndex = index;
  }
  if (markerIndex < 0 || !industryPrefixIsExplicit(bridge.slice(0, markerIndex), candidate)) {
    return false;
  }
  const descriptorTail = bridge.slice(markerIndex + 1, -1);
  const employerTokens = candidate.discriminators.employer === null
    ? []
    : contextTokens(candidate.discriminators.employer);
  let tailWithoutEmployer = descriptorTail;
  if (employerTokens.length > 0) {
    const employerStarts = tokenSequenceStarts(descriptorTail, employerTokens);
    if (employerStarts.length > 1) return false;
    const employerStart = employerStarts[0];
    if (employerStart !== undefined) {
      if (!employerBridgeIsExplicit([
        bridge[markerIndex] ?? "",
        ...descriptorTail.slice(0, employerStart),
      ])) return false;
      tailWithoutEmployer = [
        ...descriptorTail.slice(0, employerStart),
        ...descriptorTail.slice(employerStart + employerTokens.length),
      ];
    }
  }
  return tailWithoutEmployer.every((token) =>
    INDUSTRY_CONNECTORS.has(token) ||
    INDUSTRY_DESCRIPTOR_WORDS.has(token) ||
    INDUSTRY_MARKERS.has(token) ||
    INDUSTRY_SUBJECT_ARTICLES.has(token)
  );
}

function discriminatorBridgeIsExplicit(
  key: TextDiscriminatorKey,
  bridge: readonly string[],
  candidate: ProviderIdentityCandidate,
): boolean {
  if (bridge.length === 0 || bridge.length > 14) return false;
  if (bridge.some((token) => SUBJECT_BINDING_BLOCKERS.has(token))) return false;
  if (key === "employer") return employerBridgeIsExplicit(bridge);
  if (key === "city" || key === "country") {
    return locationBridgeIsExplicit(bridge, candidate);
  }
  if (key === "industry") {
    return industryBridgeIsExplicit(bridge, candidate);
  }
  if (key === "legalIdentifier") {
    return bridge.some((token) => LEGAL_IDENTIFIER_MARKERS.has(token));
  }
  return bridge.some((token) => YEAR_MARKERS.has(token));
}

function discriminatorIsSubjectBound(
  candidate: ProviderIdentityCandidate,
  proof: VerifiedSourceProof,
  key: TextDiscriminatorKey,
  value: string,
): boolean {
  const excerpt = proof.verifiedExcerpt;
  const indexedTokens = indexedContextTokens(excerpt);
  const excerptTokens = indexedTokens.map(({ normalized }) => normalized);
  const subjectTokens = contextTokens(candidate.displayName);
  const subjectStarts = tokenSequenceStarts(excerptTokens, subjectTokens);
  if (subjectStarts.length !== 1) return false;
  const subjectStart = subjectStarts[0];
  if (subjectStart === undefined) return false;
  const subjectEnd = subjectStart + subjectTokens.length;
  const valueRanges = discriminatorValueRanges(excerptTokens, value)
    .filter(({ start }) => start >= subjectEnd);
  if (valueRanges.length === 0) return false;

  const nearest = valueRanges
    .map((range) => ({
      range,
      distance: range.start - subjectEnd,
    }))
    .sort((left, right) => left.distance - right.distance)[0];
  if (nearest === undefined) return false;
  const bridgeTokens = indexedTokens.slice(subjectEnd, nearest.range.start);
  if (bridgeContainsCompetingNamedParty(bridgeTokens, candidate)) return false;
  return discriminatorBridgeIsExplicit(
    key,
    bridgeTokens.map(({ normalized }) => normalized),
    candidate,
  );
}

function verifiedDiscriminatorsFor(
  item: VerifiedIdentityCandidate,
): VerifiedDiscriminators {
  const verified: VerifiedDiscriminators = {};
  const proofs = proofsFor(item);
  const values = item.candidate.discriminators;

  for (const key of ["city", "country", "industry", "employer", "legalIdentifier", "year"] as const) {
    const value = values[key];
    if (
      value !== null &&
      proofs.some((proof) => discriminatorIsSubjectBound(item.candidate, proof, key, value))
    ) {
      verified[key] = value;
    }
  }
  const officialDomain = values.officialSite === null
    ? null
    : normalizeDomain(values.officialSite);
  if (
    officialDomain !== null &&
    proofs.some((proof) => {
      const proofDomain = normalizeDomain(proof.finalUrl);
      return proofDomain !== null && sameDomain(officialDomain, proofDomain);
    })
  ) {
    verified.officialSite = officialDomain;
  }
  return verified;
}

function contextMentionsValue(context: string, value: string): boolean {
  return discriminatorValueRanges(contextTokens(context), value).length > 0;
}

function contextTermFingerprint(value: string): string {
  const joined = contextTokens(value).join(" ");
  return joined === "ai" ||
      joined === "ia" ||
      joined === "artificial intelligence" ||
      joined === "intelligence artificielle"
    ? "artificial-intelligence"
    : joined;
}

function independentPublisherDomainCount(item: VerifiedIdentityCandidate): number {
  return new Set(
    proofsFor(item).flatMap((proof) => {
      const domain = publisherDomainForUrl(proof.finalUrl);
      return domain === null ? [] : [domain];
    }),
  ).size;
}

function proofsAreIndependent(proofs: readonly VerifiedSourceProof[]): boolean {
  const publisherDomains = new Set<string>();
  const documentDigests = new Set<string>();
  const excerptFingerprints = new Set<string>();
  for (const proof of proofs) {
    const publisherDomain = publisherDomainForUrl(proof.finalUrl);
    if (publisherDomain !== null) publisherDomains.add(publisherDomain);
    documentDigests.add(proof.locator.normalizedTextSha256);
    excerptFingerprints.add(contextTokens(proof.verifiedExcerpt).join(" "));
  }
  return publisherDomains.size >= 2 &&
    documentDigests.size >= 2 &&
    excerptFingerprints.size >= 2;
}

const GENERIC_CONTEXT_WORDS = new Set([
  "a",
  "activity",
  "activite",
  "afin",
  "ainsi",
  "an",
  "and",
  "as",
  "at",
  "au",
  "aux",
  "avec",
  "by",
  "ce",
  "ces",
  "chez",
  "comme",
  "company",
  "contexte",
  "context",
  "dans",
  "de",
  "des",
  "du",
  "elle",
  "en",
  "entreprise",
  "entre",
  "est",
  "et",
  "for",
  "from",
  "he",
  "her",
  "his",
  "il",
  "in",
  "information",
  "into",
  "is",
  "it",
  "la",
  "le",
  "les",
  "leur",
  "mais",
  "ne",
  "ni",
  "of",
  "official",
  "officiel",
  "on",
  "or",
  "ou",
  "par",
  "pas",
  "person",
  "personne",
  "pour",
  "public",
  "publique",
  "que",
  "qui",
  "role",
  "sans",
  "se",
  "ses",
  "she",
  "site",
  "son",
  "source",
  "services",
  "sous",
  "sur",
  "than",
  "that",
  "the",
  "their",
  "technologie",
  "technology",
  "to",
  "un",
  "une",
  "vers",
  "was",
  "with",
]);

interface RequestedContextTerm {
  readonly value: string;
  readonly keys: readonly TextDiscriminatorKey[];
}

const GENERIC_CONTEXT_KEYS: readonly TextDiscriminatorKey[] = [
  "employer",
  "industry",
  "city",
  "country",
];

function genericContextKeys(value: string): readonly TextDiscriminatorKey[] {
  const normalized = normalizedContext(value);
  return [
    ...GENERIC_CONTEXT_KEYS,
    ...(/^\d{4}$/u.test(normalized) ? ["year" as const] : []),
    ...(/^(?:[a-z]{2,6}[ -]?)?\d{5,18}$/u.test(normalized)
      ? ["legalIdentifier" as const]
      : []),
  ];
}

function contextTermIsSignificant(
  value: string,
  nameTokens: ReadonlySet<string>,
): boolean {
  const termTokens = contextTokens(value);
  return termTokens.length > 0 &&
    termTokens.length <= 8 &&
    Array.from(value).length <= 96 &&
    !value.includes("://") &&
    termTokens.some((token) =>
      !nameTokens.has(token) && !GENERIC_CONTEXT_WORDS.has(token)
    );
}

function requestedContextTerms(
  context: string,
  candidate: ProviderIdentityCandidate,
): readonly RequestedContextTerm[] {
  const nameTokens = new Set(tokens(candidate.displayName).map(normalizedContext));
  const terms: RequestedContextTerm[] = [];
  for (const key of ["city", "country", "employer", "industry", "legalIdentifier", "year"] as const) {
    const discriminator = candidate.discriminators[key];
    if (
      discriminator !== null &&
      contextMentionsValue(context, discriminator) &&
      contextTermIsSignificant(discriminator, nameTokens)
    ) {
      terms.push({ value: discriminator, keys: [key] });
    }
  }
  for (const fragment of context.split(/[,;|\n]+/u).map((value) => value.trim())) {
    if (!contextTermIsSignificant(fragment, nameTokens)) continue;
    terms.push({ value: fragment, keys: genericContextKeys(fragment) });
  }
  return [...new Map(terms.map((term) => [
    `${normalizedContext(term.value)}|${term.keys.join(",")}`,
    term,
  ] as const)).values()];
}

interface CorroboratedContextEvidence {
  readonly signal: ContextSignal;
  readonly fingerprint: string;
  readonly proofs: readonly VerifiedSourceProof[];
}

interface SupportedContextEvidence {
  readonly fingerprint: string;
  readonly value: string;
  readonly proofs: readonly VerifiedSourceProof[];
}

function supportedContextEvidence(
  context: string,
  item: VerifiedIdentityCandidate,
): readonly SupportedContextEvidence[] {
  const evidence = new Map<string, SupportedContextEvidence>();
  for (const term of requestedContextTerms(context, item.candidate)) {
    const matchingProofs = proofsFor(item).filter((proof) =>
      term.keys.some((key) =>
        discriminatorIsSubjectBound(item.candidate, proof, key, term.value)
      )
    );
    if (matchingProofs.length === 0) continue;
    const fingerprint = contextTermFingerprint(term.value);
    const previous = evidence.get(fingerprint);
    const proofs = [...new Map(
      [...(previous?.proofs ?? []), ...matchingProofs].map((proof) => [
        proofKey(proof),
        proof,
      ] as const),
    ).values()];
    evidence.set(fingerprint, {
      fingerprint,
      value: previous?.value ?? term.value,
      proofs,
    });
  }
  return [...evidence.values()];
}

function corroboratedContextEvidence(
  context: string,
  item: VerifiedIdentityCandidate,
): CorroboratedContextEvidence | null {
  for (const evidence of supportedContextEvidence(context, item)) {
    if (!proofsAreIndependent(evidence.proofs)) continue;
    return {
      signal: {
        kind: "corroborated_context",
        value: evidence.value,
        strength: "medium",
      },
      fingerprint: evidence.fingerprint,
      proofs: evidence.proofs,
    };
  }
  return null;
}

const SUBJECT_ROLE_PREFIX = /^(?:(?:est|is|was) (?:l |le |la |un |une |a |an |the )?)?(?:ceo|cfo|chief executive officer|coo|cto|co fondateur|co fondatrice|co founder|cofondatrice|cofondateur|directeur|directrice|fondateur|fondatrice|founder|gerant|gerante|head|partner|president|presidente|responsable)\b|^(?:dirige|leads|travaille chez|works at|works for)\b/u;
const ROLE_ORGANIZATION_CONNECTORS = new Set([
  "at",
  "chez",
  "d",
  "de",
  "des",
  "du",
  "for",
  "of",
  "pour",
]);

interface ExplicitSubjectRole {
  readonly organizationTail: readonly string[];
}

function explicitSubjectRole(
  item: VerifiedIdentityCandidate,
  proof: VerifiedSourceProof,
): ExplicitSubjectRole | null {
  const excerptTokens = contextTokens(proof.verifiedExcerpt);
  const subjectTokens = contextTokens(item.candidate.displayName);
  const subjectStarts = tokenSequenceStarts(excerptTokens, subjectTokens);
  const subjectStart = subjectStarts.length === 1 ? subjectStarts[0] : undefined;
  if (subjectStart === undefined) return null;
  const afterSubjectTokens = excerptTokens.slice(subjectStart + subjectTokens.length);
  const roleMatch = SUBJECT_ROLE_PREFIX.exec(afterSubjectTokens.join(" "));
  if (roleMatch === null) return null;
  const matchedTokenCount = contextTokens(roleMatch[0]).length;
  let organizationTail = afterSubjectTokens.slice(matchedTokenCount);
  if (ROLE_ORGANIZATION_CONNECTORS.has(organizationTail[0] ?? "")) {
    organizationTail = organizationTail.slice(1);
  }
  if (ROLE_ORGANIZATION_ARTICLES.has(organizationTail[0] ?? "")) {
    organizationTail = organizationTail.slice(1);
  }
  return { organizationTail };
}

const ORGANIZATION_ANCHOR_STOPWORDS = new Set([
  ...GENERIC_CONTEXT_WORDS,
  "ai",
  "artificial",
  "about",
  "accueil",
  "actualite",
  "actualites",
  "annuaire",
  "article",
  "blog",
  "contact",
  "direction",
  "directory",
  "equipe",
  "example",
  "france",
  "home",
  "ia",
  "intelligence",
  "lab",
  "labs",
  "news",
  "num",
  "page",
  "press",
  "presse",
  "profile",
  "profil",
  "propos",
  "group",
  "groupe",
  "organisation",
  "organization",
  "societe",
  "studio",
  "team",
]);
const URL_ORGANIZATION_PREFIXES = ["get", "go", "hello", "join", "my", "the", "use", "weare"];
const URL_ORGANIZATION_SUFFIXES = [
  "app",
  "co",
  "company",
  "fr",
  "france",
  "group",
  "groupe",
  "hq",
  "lab",
  "labs",
  "official",
  "studio",
];

interface OrganizationAnchor {
  readonly fingerprint: string;
  readonly terms: readonly string[];
}

function urlLabels(value: string): readonly string[][] {
  try {
    const parsed = new URL(value);
    let path = parsed.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {
      // A malformed escape cannot create a trusted organization anchor.
    }
    return [
      ...parsed.hostname.split("."),
      ...path.split("/"),
    ].map(contextTokens).filter((label) => label.length > 0);
  } catch {
    return [];
  }
}

function urlGroundsOrganizationAnchor(
  url: string,
  anchor: OrganizationAnchor,
): boolean {
  const compactAnchor = anchor.terms.join("");
  return urlLabels(url).some((label) => {
    if (tokenSequenceStarts(label, anchor.terms).length > 0) return true;
    if (anchor.terms.length !== 1 || label.length !== 1) return false;
    const component = label[0] ?? "";
    return URL_ORGANIZATION_PREFIXES.some((prefix) => component === `${prefix}${compactAnchor}`) ||
      URL_ORGANIZATION_SUFFIXES.some((suffix) => component === `${compactAnchor}${suffix}`);
  });
}

function traceableOrganizationAnchors(
  item: VerifiedIdentityCandidate,
  proof: VerifiedSourceProof,
): ReadonlyMap<string, OrganizationAnchor> {
  const titleTokens = contextTokens(proof.title);
  const subjectTokens = new Set(contextTokens(item.candidate.displayName));
  const anchors = new Map<string, OrganizationAnchor>();
  for (let start = 0; start < titleTokens.length; start += 1) {
    for (let length = 1; length <= 3 && start + length <= titleTokens.length; length += 1) {
      const anchorTokens = titleTokens.slice(start, start + length);
      if (
        anchorTokens.some((token) => subjectTokens.has(token)) ||
        anchorTokens.every((token) => ORGANIZATION_ANCHOR_STOPWORDS.has(token)) ||
        anchorTokens.join("").length < 5
      ) {
        continue;
      }
      const anchor = {
        fingerprint: anchorTokens.join("-"),
        terms: anchorTokens,
      } satisfies OrganizationAnchor;
      if (urlGroundsOrganizationAnchor(proof.finalUrl, anchor)) {
        anchors.set(anchor.fingerprint, anchor);
      }
    }
  }
  return anchors;
}

function maximalSharedOrganizationAnchor(
  item: VerifiedIdentityCandidate,
  roleProof: VerifiedSourceProof,
  contextProofs: readonly VerifiedSourceProof[],
): OrganizationAnchor | null {
  const roleAnchors = traceableOrganizationAnchors(item, roleProof);
  if (roleAnchors.size === 0) return null;
  const shared = new Map(contextProofs.flatMap((proof) => {
    const contextAnchors = traceableOrganizationAnchors(item, proof);
    return [...roleAnchors.entries()].filter(([fingerprint]) => contextAnchors.has(fingerprint));
  }));
  const maximal = [...shared.values()].filter((anchor) =>
    ![...shared.values()].some((other) =>
      other.terms.length > anchor.terms.length &&
      tokenSequenceStarts(other.terms, anchor.terms).length > 0
    )
  );
  return maximal.length === 1 ? maximal[0] ?? null : null;
}

function roleMatchesOrganizationAnchor(
  role: ExplicitSubjectRole,
  anchor: OrganizationAnchor,
): boolean {
  if (role.organizationTail.length === 0) return true;
  return tokenSequenceStarts(role.organizationTail, anchor.terms).includes(0);
}

function independentRoleAnchor(
  item: VerifiedIdentityCandidate,
  corroboratedContext: CorroboratedContextEvidence,
): VerifiedCorroboratingFact | null {
  const contextProofs = corroboratedContext.proofs;
  const contextProofKeys = new Set(contextProofs.map(proofKey));
  const contextDomains = new Set(contextProofs.flatMap((proof) => {
    const domain = publisherDomainForUrl(proof.finalUrl);
    return domain === null ? [] : [domain];
  }));
  const contextDocuments = new Set(
    contextProofs.map(({ locator }) => locator.normalizedTextSha256),
  );
  const contextExcerpts = new Set(
    contextProofs.map(({ verifiedExcerpt }) => contextTokens(verifiedExcerpt).join(" ")),
  );
  return (item.corroboratingFacts ?? []).find(({ candidate, proof }) => {
    const domain = publisherDomainForUrl(proof.finalUrl);
    const role = explicitSubjectRole(item, proof);
    const organizationAnchor = maximalSharedOrganizationAnchor(item, proof, contextProofs);
    return candidate.category === "role" &&
      role !== null &&
      organizationAnchor !== null &&
      roleMatchesOrganizationAnchor(role, organizationAnchor) &&
      !contextProofKeys.has(proofKey(proof)) &&
      domain !== null &&
      !contextDomains.has(domain) &&
      !contextDocuments.has(proof.locator.normalizedTextSha256) &&
      !contextExcerpts.has(contextTokens(proof.verifiedExcerpt).join(" "));
  }) ?? null;
}

function contextSignalsFor(
  context: string,
  item: VerifiedIdentityCandidate,
  verified: VerifiedDiscriminators,
): ContextSignal[] {
  const signals: ContextSignal[] = [];
  const contextDomains = domainsIn(context);
  for (const proof of proofsFor(item)) {
    const proofDomain = normalizeDomain(proof.finalUrl);
    if (
      proofDomain !== null &&
      [...contextDomains].some((domain) => sameDomain(domain, proofDomain)) &&
      !signals.some(({ kind, value }) => kind === "source_domain" && value === proofDomain)
    ) {
      signals.push({
        kind: "source_domain",
        value: proofDomain,
        strength: "strong",
      });
    }
  }
  if (
    verified.officialSite !== undefined &&
    [...contextDomains].some((domain) => sameDomain(domain, verified.officialSite ?? ""))
  ) {
    signals.push({
      kind: "official_site",
      value: verified.officialSite,
      strength: "strong",
    });
  }
  if (
    verified.legalIdentifier !== undefined &&
    containsContext(context, verified.legalIdentifier)
  ) {
    signals.push({
      kind: "legal_identifier",
      value: verified.legalIdentifier,
      strength: "strong",
    });
  }
  if (
    verified.employer !== undefined &&
    tokens(verified.employer).filter((token) => token.length >= 4).length >= 2 &&
    containsContext(context, verified.employer)
  ) {
    signals.push({ kind: "employer", value: verified.employer, strength: "strong" });
  }
  for (const key of ["city", "country", "industry", "year"] as const) {
    const value = verified[key];
    if (value !== undefined && contextMentionsValue(context, value)) {
      signals.push({ kind: key, value, strength: "medium" });
    }
  }
  return signals;
}

function isDistinctiveWithoutContext(
  input: ResearchInput,
  item: VerifiedIdentityCandidate,
  verified: VerifiedDiscriminators,
): boolean {
  if (item.candidate.entityScope === "brand") return false;
  if (item.candidate.entityType === "person") {
    return normalizedName(input.name) === normalizedName(item.candidate.displayName) &&
      tokens(item.candidate.displayName).length >= 3;
  }
  if (verified.legalIdentifier !== undefined) return true;
  const officialDomain = verified.officialSite;
  if (officialDomain === undefined) return false;
  const domainLabel = officialDomain.split(".")[0] ?? "";
  const significantName = tokens(item.candidate.displayName)
    .filter((token) => !LEGAL_SUFFIXES.has(token))
    .join("");
  return significantName.length >= 3 && domainLabel === significantName;
}

function candidateIsEligible(
  input: ResearchInput,
  item: VerifiedIdentityCandidate,
): boolean {
  const requestedType = input.entityType ?? "auto";
  return CANDIDATE_KEY.test(item.candidate.candidateKey) &&
    (requestedType === "auto" || item.candidate.entityType === requestedType) &&
    scopeMatchesType(item.candidate.entityScope, item.candidate.entityType) &&
    requestedAndCandidateNamesMatch(input.name, item.candidate.displayName) &&
    proofContainsDisplayName(item.proof, item.candidate);
}

function evaluatedEvidenceSet(
  input: ResearchInput,
  item: VerifiedIdentityCandidate,
): {
  readonly verifiedDiscriminators: VerifiedDiscriminators;
  readonly contextSignals: readonly ContextSignal[];
  readonly strong: boolean;
  readonly mediumKindCount: number;
  readonly independent: boolean;
  readonly supportedContextEvidence: readonly SupportedContextEvidence[];
  readonly corroboratedContextEvidence: CorroboratedContextEvidence | null;
} {
  const verifiedDiscriminators = verifiedDiscriminatorsFor(item);
  const baseContextSignals = input.context === undefined
    ? []
    : contextSignalsFor(input.context, item, verifiedDiscriminators);
  const independent = proofsAreIndependent(proofsFor(item));
  const corroboratedEvidence = input.context === undefined ||
      item.candidate.entityType !== "person" ||
      normalizedName(input.name) !== normalizedName(item.candidate.displayName) ||
      !independent
    ? null
    : corroboratedContextEvidence(input.context, item);
  const contextSignals = corroboratedEvidence === null
    ? baseContextSignals
    : [
        ...baseContextSignals.filter(
          ({ value }) => normalizedContext(value) !== normalizedContext(corroboratedEvidence.signal.value),
        ),
        corroboratedEvidence.signal,
      ];
  return {
    verifiedDiscriminators,
    contextSignals,
    strong: contextSignals.some(({ strength }) => strength === "strong"),
    mediumKindCount: new Set(
      contextSignals.filter(({ strength }) => strength === "medium").map(({ kind }) => kind),
    ).size,
    independent,
    supportedContextEvidence: input.context === undefined
      ? []
      : supportedContextEvidence(input.context, item),
    corroboratedContextEvidence: corroboratedEvidence,
  };
}

interface FactBackedIdentitySupport {
  readonly proofs: readonly VerifiedSourceProof[];
  readonly facts: readonly VerifiedCorroboratingFact[];
}

function factBackedIdentitySupport(
  input: ResearchInput,
  item: VerifiedIdentityCandidate,
  evaluation: ReturnType<typeof evaluatedEvidenceSet>,
): FactBackedIdentitySupport | null {
  const corroborated = evaluation.corroboratedContextEvidence;
  if (
    input.context === undefined ||
    normalizedName(input.name) !== normalizedName(item.candidate.displayName) ||
    independentPublisherDomainCount(item) < 2 ||
    !evaluation.independent ||
    corroborated === null ||
    !evaluation.contextSignals.some(({ kind }) => kind === "corroborated_context")
  ) {
    return null;
  }

  const secondContext = evaluation.supportedContextEvidence.find(
    ({ fingerprint, proofs }) => fingerprint !== corroborated.fingerprint &&
      proofs.some((proof) => corroborated.proofs.some(
        (contextProof) => proofKey(contextProof) === proofKey(proof),
      )),
  );
  const secondContextProof = secondContext?.proofs.find((proof) =>
    corroborated.proofs.some((contextProof) => proofKey(contextProof) === proofKey(proof))
  );
  const roleAnchor = secondContext === undefined
    ? independentRoleAnchor(item, corroborated)
    : null;
  if (secondContext === undefined && roleAnchor === null) return null;

  const proofs = [...new Map(
    [
      ...corroborated.proofs,
      ...(secondContextProof === undefined ? [] : [secondContextProof]),
      ...(roleAnchor === null ? [] : [roleAnchor.proof]),
    ].map((proof) => [proofKey(proof), proof] as const),
  ).values()];
  const proofKeys = new Set(proofs.map(proofKey));
  const facts = (item.corroboratingFacts ?? []).filter(({ proof }) =>
    proofKeys.has(proofKey(proof))
  );
  return facts.length === 0 ? null : { proofs, facts };
}

function narrowedFactBackedItem(options: {
  readonly original: VerifiedIdentityCandidate;
  readonly factItem: VerifiedIdentityCandidate;
  readonly support: FactBackedIdentitySupport;
}): VerifiedIdentityCandidate {
  const dedicatedProof = options.original.proofBasis === "dedicated"
    ? options.original.proof
    : null;
  const primaryProof = dedicatedProof ?? options.support.proofs[0];
  if (primaryProof === undefined) return options.factItem;
  const corroboratingProofs = [...new Map(
    [
      ...(dedicatedProof === null ? options.support.proofs.slice(1) : options.support.proofs),
    ].map((proof) => [proofKey(proof), proof] as const),
  ).values()];
  return {
    candidate: options.original.candidate,
    proof: primaryProof,
    corroboratingProofs,
    corroboratingFacts: options.support.facts,
    proofBasis: "verified_facts",
  };
}

export function resolveIdentity(options: {
  readonly input: ResearchInput;
  readonly providerStatus: ProviderResearchDocument["identityStatus"];
  readonly candidates: readonly VerifiedIdentityCandidate[];
}): IdentityDecision {
  const keys = options.candidates.map(({ candidate }) => candidate.candidateKey);
  if (new Set(keys).size !== keys.length) {
    return {
      status: "insufficient_context",
      selected: null,
      candidates: [],
      verifiedDiscriminators: {},
      contextSignals: [],
      reasonCodes: ["duplicate_candidate_key"],
      rationale: "Les identifiants de candidats sont incohérents ; aucune identité n’est retenue.",
    };
  }

  const eligible = options.candidates
    .map(withDerivedScope)
    .filter((item) => candidateIsEligible(options.input, item));
  if (eligible.length === 0) {
    return {
      status: "not_found_within_scope",
      selected: null,
      candidates: [],
      verifiedDiscriminators: {},
      contextSignals: [],
      reasonCodes: ["no_verified_candidate"],
      rationale: "Aucun candidat directement vérifiable n’a été trouvé dans le périmètre.",
    };
  }

  const evaluated = eligible.map((item) => {
    if (item.proofBasis === "verified_facts") {
      const factEvaluation = evaluatedEvidenceSet(options.input, item);
      const support = factBackedIdentitySupport(options.input, item, factEvaluation);
      if (support !== null) {
        const narrowedItem = narrowedFactBackedItem({
          original: item,
          factItem: item,
          support,
        });
        return {
          item: narrowedItem,
          ...evaluatedEvidenceSet(options.input, narrowedItem),
          matched: true,
          matchBasis: "facts" as const,
        };
      }
      return {
        item,
        ...factEvaluation,
        matched: false,
        matchBasis: "facts" as const,
      };
    }

    const dedicatedItem: VerifiedIdentityCandidate = {
      ...item,
      corroboratingProofs: [],
      corroboratingFacts: [],
      proofBasis: "dedicated",
    };
    const dedicatedEvaluation = evaluatedEvidenceSet(options.input, dedicatedItem);
    const dedicatedMatched = options.input.context === undefined
      ? isDistinctiveWithoutContext(
          options.input,
          dedicatedItem,
          dedicatedEvaluation.verifiedDiscriminators,
        )
      : dedicatedEvaluation.strong || dedicatedEvaluation.mediumKindCount >= 2;
    if (dedicatedMatched) {
      return {
        item: dedicatedItem,
        ...dedicatedEvaluation,
        matched: true,
        matchBasis: "dedicated" as const,
      };
    }

    const factProofs = item.corroboratingProofs ?? [];
    const primaryFactProof = factProofs[0];
    if (primaryFactProof !== undefined) {
      const factItem: VerifiedIdentityCandidate = {
        candidate: item.candidate,
        proof: primaryFactProof,
        corroboratingProofs: factProofs.slice(1),
        ...(item.corroboratingFacts === undefined
          ? {}
          : { corroboratingFacts: item.corroboratingFacts }),
        proofBasis: "verified_facts",
      };
      const factEvaluation = evaluatedEvidenceSet(options.input, factItem);
      const support = factBackedIdentitySupport(options.input, factItem, factEvaluation);
      if (support !== null) {
        const narrowedItem = narrowedFactBackedItem({
          original: item,
          factItem,
          support,
        });
        return {
          item: narrowedItem,
          ...evaluatedEvidenceSet(options.input, narrowedItem),
          matched: true,
          matchBasis: "facts" as const,
        };
      }
    }

    return {
      item: dedicatedItem,
      ...dedicatedEvaluation,
      matched: false,
      matchBasis: "dedicated" as const,
    };
  });
  const matched = evaluated.filter((item) => item.matched);
  if (matched.length === 1) {
    const only = matched[0];
    if (only === undefined) throw new Error("Unreachable identity decision.");
    const signalLabels = only.contextSignals.map(({ kind, value }) => `${kind}: ${value}`);
    return {
      status: "resolved",
      selected: only.item,
      candidates: [only.item],
      verifiedDiscriminators: only.verifiedDiscriminators,
      contextSignals: only.contextSignals,
      reasonCodes: [only.matchBasis === "facts"
        ? "fact_corroborated_identity"
        : "unique_verified_candidate"],
      rationale: signalLabels.length > 0
        ? `Un seul candidat vérifié correspond aux indices démontrés (${signalLabels.join(", ")}).`
        : "Un seul candidat distinctif est vérifié sans concurrent admissible.",
    };
  }

  if (matched.length > 1 || (options.input.context === undefined && eligible.length > 1)) {
    return {
      status: "ambiguous",
      selected: null,
      candidates: (matched.length > 1 ? matched.map(({ item }) => item) : eligible),
      verifiedDiscriminators: {},
      contextSignals: [],
      reasonCodes: ["multiple_verified_candidates"],
      rationale: "Plusieurs candidats vérifiés restent compatibles ; aucun n’est sélectionné.",
    };
  }

  const only = evaluated.length === 1 ? evaluated[0] : undefined;
  return {
    status: "insufficient_context",
    selected: null,
    candidates: eligible,
    verifiedDiscriminators: only?.verifiedDiscriminators ?? {},
    contextSignals: only?.contextSignals ?? [],
    reasonCodes: ["context_not_demonstrated"],
    rationale: "Le contexte fourni n’est pas suffisamment démontré par les preuves vérifiées.",
  };
}
