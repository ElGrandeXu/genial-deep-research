import { normalizeVisibleText } from "./source-content";
import type {
  EntityScope,
  ProviderCandidateDiscriminators,
  ProviderIdentityCandidate,
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

export interface VerifiedIdentityCandidate {
  readonly candidate: ProviderIdentityCandidate;
  readonly proof: VerifiedSourceProof;
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

function normalizedContext(value: string): string {
  return normalizeVisibleText(value)
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/\s+/gu, " ")
    .trim();
}

function containsContext(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizedContext(needle);
  return normalizedNeedle.length > 0 && normalizedContext(haystack).includes(normalizedNeedle);
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

function escapedPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
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

function verifiedDiscriminatorsFor(
  item: VerifiedIdentityCandidate,
): VerifiedDiscriminators {
  const verified: VerifiedDiscriminators = {};
  const identityExcerpt = item.proof.verifiedExcerpt;
  const values = item.candidate.discriminators;
  const proofDomain = normalizeDomain(item.proof.finalUrl);

  for (const key of ["city", "country", "industry", "employer", "legalIdentifier", "year"] as const) {
    const value = values[key];
    if (value !== null && containsContext(identityExcerpt, value)) verified[key] = value;
  }
  const officialDomain = values.officialSite === null
    ? null
    : normalizeDomain(values.officialSite);
  if (
    officialDomain !== null &&
    proofDomain !== null &&
    sameDomain(officialDomain, proofDomain)
  ) {
    verified.officialSite = officialDomain;
  }
  return verified;
}

function contextSignalsFor(
  context: string,
  item: VerifiedIdentityCandidate,
  verified: VerifiedDiscriminators,
): ContextSignal[] {
  const signals: ContextSignal[] = [];
  const contextDomains = domainsIn(context);
  const proofDomain = normalizeDomain(item.proof.finalUrl);
  if (
    proofDomain !== null &&
    [...contextDomains].some((domain) => sameDomain(domain, proofDomain))
  ) {
    signals.push({
      kind: "source_domain",
      value: proofDomain,
      strength: "strong",
    });
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
    if (value !== undefined && containsContext(context, value)) {
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
    normalizedName(item.proof.verifiedExcerpt).includes(
      normalizedName(item.candidate.displayName),
    );
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
    const verifiedDiscriminators = verifiedDiscriminatorsFor(item);
    const contextSignals = options.input.context === undefined
      ? []
      : contextSignalsFor(options.input.context, item, verifiedDiscriminators);
    const strong = contextSignals.some(({ strength }) => strength === "strong");
    const mediumKinds = new Set(
      contextSignals.filter(({ strength }) => strength === "medium").map(({ kind }) => kind),
    );
    const matched = options.input.context === undefined
      ? isDistinctiveWithoutContext(options.input, item, verifiedDiscriminators)
      : strong || mediumKinds.size >= 2;
    return { item, verifiedDiscriminators, contextSignals, matched };
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
      reasonCodes: ["unique_verified_candidate"],
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
