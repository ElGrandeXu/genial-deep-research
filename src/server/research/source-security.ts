import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { ResearchPipelineError } from "./errors";

const FORBIDDEN_HOST_SUFFIXES = [
  ".local",
  ".internal",
  ".localhost",
  ".home",
  ".lan",
  ".test",
  ".invalid",
  ".example",
] as const;

const SENSITIVE_QUERY_NAMES = new Set([
  "token",
  "access_token",
  "api_key",
  "key",
  "auth",
  "authorization",
  "signature",
  "sig",
  "expires",
  "credential",
  "password",
  "client_secret",
  "secret",
  "session",
  "session_id",
  "jwt",
  "bearer",
  "id_token",
  "refresh_token",
]);

const SENSITIVE_QUERY_SEGMENTS = new Set([
  "token",
  "key",
  "auth",
  "authorization",
  "signature",
  "sig",
  "expires",
  "credential",
  "password",
  "secret",
  "session",
  "jwt",
  "bearer",
]);

const SENSITIVE_QUERY_COMPACT_NAMES = new Set(
  Array.from(SENSITIVE_QUERY_NAMES, (name) => name.replaceAll("_", "")),
);

const MAX_ADDITIONAL_QUERY_NAME_DECODE_PASSES = 4;
const UNSAFE_QUERY_MESSAGE = "Les paramètres de cette URL ne sont pas admissibles.";

export const TRACKING_QUERY_POLICY = Object.freeze({
  exactNames: ["gclid", "fbclid"] as const,
  prefixes: ["utm_"] as const,
  strategy:
    "Remove only recognized tracking parameters before comparison, fetch and persistence; preserve every other non-secret parameter and its order.",
});

export interface ValidatedSourceUrl {
  readonly url: URL;
  readonly safeHref: string;
  readonly removedTrackingParameterCount: number;
}

export interface DnsAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export interface DnsResolver {
  resolve(hostname: string): Promise<readonly DnsAddress[]>;
}

let nodeDnsResolutionCount = 0;

export function getNodeDnsResolutionCount(): number {
  return nodeDnsResolutionCount;
}

export class NodeDnsResolver implements DnsResolver {
  async resolve(hostname: string): Promise<readonly DnsAddress[]> {
    nodeDnsResolutionCount += 1;
    const answers = await lookup(hostname, { all: true, verbatim: true });
    return answers.map(({ address, family }) => ({
      address,
      family: family === 6 ? 6 : 4,
    }));
  }
}

function sourceUrlError(kind: "citation" | "redirect", message: string): never {
  throw new ResearchPipelineError(
    kind === "citation" ? "source_url_rejected" : "source_redirect_rejected",
    message,
  );
}

interface QueryNameForms {
  readonly percentSource: string;
  readonly segmented: string;
  readonly compact: string;
  readonly segments: readonly string[];
}

function normalizeQueryName(name: string): QueryNameForms | null {
  let compatible: string;
  try {
    compatible = name.normalize("NFKC");
  } catch {
    return null;
  }
  const camelSeparated = compatible
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1_$2")
    .replace(/([\p{Ll}\p{Nd}])(\p{Lu})/gu, "$1_$2");
  const equivalentSeparators = camelSeparated.replace(/[\p{Z}\p{Pd}_.-]+/gu, "_");
  if (
    equivalentSeparators.length === 0 ||
    /[^\x20-\x7e]/u.test(equivalentSeparators)
  ) {
    return null;
  }
  const lower = equivalentSeparators.toLowerCase();
  const segmented = lower
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  const compact = lower.replace(/[^a-z0-9]+/gu, "");
  if (compact.length === 0) return null;
  return {
    percentSource: compatible,
    segmented,
    compact,
    segments: segmented.split("_").filter(Boolean),
  };
}

function queryNameIndicatesSecret(forms: QueryNameForms): boolean {
  return (
    SENSITIVE_QUERY_NAMES.has(forms.segmented) ||
    SENSITIVE_QUERY_COMPACT_NAMES.has(forms.compact) ||
    forms.segments.some((segment) => SENSITIVE_QUERY_SEGMENTS.has(segment))
  );
}

function unsafeQueryError(): never {
  throw new ResearchPipelineError("source_url_rejected", UNSAFE_QUERY_MESSAGE);
}

function assertSafeQueryName(name: string): void {
  let current = name;
  for (
    let pass = 0;
    pass <= MAX_ADDITIONAL_QUERY_NAME_DECODE_PASSES;
    pass += 1
  ) {
    const forms = normalizeQueryName(current);
    if (forms === null || queryNameIndicatesSecret(forms)) {
      unsafeQueryError();
    }
    if (!forms.percentSource.includes("%")) return;
    if (pass === MAX_ADDITIONAL_QUERY_NAME_DECODE_PASSES) {
      unsafeQueryError();
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(forms.percentSource);
    } catch {
      unsafeQueryError();
    }
    if (decoded === forms.percentSource) {
      unsafeQueryError();
    }
    current = decoded;
  }
}

function isTrackingName(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    normalized === "gclid" ||
    normalized === "fbclid" ||
    normalized.startsWith("utm_")
  );
}

function validateDnsHostname(hostname: string, kind: "citation" | "redirect"): void {
  const lower = hostname.toLowerCase();
  if (isIP(hostname) !== 0) sourceUrlError(kind, "Les adresses IP littérales sont refusées.");
  if (lower === "localhost" || !lower.includes(".")) {
    sourceUrlError(kind, "Le hostname doit être un nom DNS public.");
  }
  if (
    FORBIDDEN_HOST_SUFFIXES.some(
      (suffix) => lower === suffix.slice(1) || lower.endsWith(suffix),
    )
  ) {
    sourceUrlError(kind, "Le suffixe DNS n’est pas admissible.");
  }
  if (lower.length > 253) sourceUrlError(kind, "Le hostname est trop long.");
  const labels = lower.split(".");
  if (
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label),
    )
  ) {
    sourceUrlError(kind, "Le hostname DNS est malformé.");
  }
  const topLevel = labels.at(-1) ?? "";
  if (!/^(?:[a-z]{2,}|xn--[a-z0-9-]{2,})$/u.test(topLevel)) {
    sourceUrlError(kind, "Le suffixe DNS public est invalide.");
  }
}

export function validateSourceUrl(
  raw: string,
  kind: "citation" | "redirect",
): ValidatedSourceUrl {
  if (raw.includes("\\")) sourceUrlError(kind, "Les antislashs sont refusés.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    sourceUrlError(kind, "L’URL est malformée.");
  }
  if (url.protocol !== "https:") sourceUrlError(kind, "HTTPS est obligatoire.");
  if (url.username !== "" || url.password !== "") {
    sourceUrlError(kind, "Les credentials d’URL sont refusés.");
  }
  if (url.port !== "" && url.port !== "443") {
    sourceUrlError(kind, "Seul le port HTTPS 443 est admis.");
  }
  const canonicalHostname = url.hostname.endsWith(".")
    ? url.hostname.slice(0, -1)
    : url.hostname;
  validateDnsHostname(canonicalHostname, kind);
  url.hostname = canonicalHostname;

  const queryNames = Array.from(url.searchParams.keys());
  for (const name of queryNames) assertSafeQueryName(name);

  const trackingNames = queryNames.filter(isTrackingName);
  for (const name of new Set(trackingNames)) url.searchParams.delete(name);
  url.hash = "";
  return {
    url,
    safeHref: url.href,
    removedTrackingParameterCount: trackingNames.length,
  };
}

export function validateCitationAndStructuredUrl(
  citationUrl: string,
  structuredUrl: string,
): ValidatedSourceUrl {
  const citation = validateSourceUrl(citationUrl, "citation");
  let structured: ValidatedSourceUrl;
  try {
    structured = validateSourceUrl(structuredUrl, "citation");
  } catch {
    throw new ResearchPipelineError(
      "source_url_rejected",
      "L’URL structurée proposée est invalide.",
    );
  }
  if (citation.safeHref !== structured.safeHref) {
    throw new ResearchPipelineError(
      "source_url_rejected",
      "L’URL structurée ne correspond pas à la citation fournisseur.",
    );
  }
  return citation;
}

function parseIpv4(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^(?:0|[1-9][0-9]{0,2})$/u.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

function ipv4InPrefix(value: number, base: number, bits: number): boolean {
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (base & mask);
}

const FORBIDDEN_IPV4_PREFIXES: ReadonlyArray<readonly [number, number]> = [
  [0x00000000, 8],
  [0x0a000000, 8],
  [0x64400000, 10],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0000000, 24],
  [0xc0000200, 24],
  [0xc0586300, 24],
  [0xc0a80000, 16],
  [0xc6120000, 15],
  [0xc6336400, 24],
  [0xcb007100, 24],
  [0xe0000000, 4],
  [0xf0000000, 4],
];

function embeddedIpv4Words(value: string): string {
  const lastColon = value.lastIndexOf(":");
  const ipv4 = parseIpv4(value.slice(lastColon + 1));
  if (lastColon < 0 || ipv4 === null) return value;
  return `${value.slice(0, lastColon)}:${((ipv4 >>> 16) & 0xffff).toString(16)}:${(
    ipv4 & 0xffff
  ).toString(16)}`;
}

function parseIpv6(address: string): Uint16Array | null {
  if (address.includes("%")) return null;
  const value = embeddedIpv4Words(address.toLowerCase());
  if (value.split("::").length > 2) return null;
  const [leftRaw, rightRaw] = value.split("::") as [string, string?];
  const left = leftRaw.length === 0 ? [] : leftRaw.split(":");
  const right = rightRaw === undefined || rightRaw.length === 0 ? [] : rightRaw.split(":");
  const missing = 8 - left.length - right.length;
  if ((rightRaw === undefined && missing !== 0) || missing < 0) return null;
  const groups = [
    ...left,
    ...Array.from({ length: rightRaw === undefined ? 0 : missing }, () => "0"),
    ...right,
  ];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/u.test(group))) {
    return null;
  }
  return Uint16Array.from(groups.map((group) => Number.parseInt(group, 16)));
}

function ipv6InPrefix(words: Uint16Array, base: readonly number[], bits: number): boolean {
  const fullWords = Math.floor(bits / 16);
  const remaining = bits % 16;
  for (let index = 0; index < fullWords; index += 1) {
    if (words[index] !== (base[index] ?? 0)) return false;
  }
  if (remaining === 0) return true;
  const mask = (0xffff << (16 - remaining)) & 0xffff;
  return ((words[fullWords] ?? 0) & mask) === ((base[fullWords] ?? 0) & mask);
}

const FORBIDDEN_IPV6_PREFIXES: ReadonlyArray<
  readonly [readonly number[], number]
> = [
  [[0, 0, 0, 0, 0, 0], 96],
  [[0, 0, 0, 0, 0, 0xffff], 96],
  [[0, 0, 0, 0, 0xffff, 0], 96],
  [[0x0064, 0xff9b, 0x0001], 48],
  [[0x0064, 0xff9b], 96],
  [[0x0100, 0, 0, 0], 64],
  [[0x0100, 0, 0, 1], 64],
  [[0x2001], 23],
  [[0x2001, 0x0000], 32],
  [[0x2001, 0x0002], 48],
  [[0x2001, 0x0010], 28],
  [[0x2001, 0x0020], 28],
  [[0x2001, 0x0030], 28],
  [[0x2001, 0x0db8], 32],
  [[0x2002], 16],
  [[0x3fff], 20],
  [[0x4000], 3],
  [[0x5f00], 16],
  [[0xfc00], 7],
  [[0xfe00], 9],
  [[0xfe80], 10],
  [[0xfec0], 10],
  [[0xff00], 8],
];

// Fail closed: only the project-approved current global-unicast space is eligible.
const ALLOWED_IPV6_GLOBAL_UNICAST_PREFIX = [[0x2000] as const, 3] as const;

function canonicalIpv6Address(words: Uint16Array): string {
  const groups = Array.from(words, (word) => word.toString(16));
  let longestStart = -1;
  let longestLength = 0;
  for (let start = 0; start < groups.length; ) {
    if (groups[start] !== "0") {
      start += 1;
      continue;
    }
    let end = start + 1;
    while (end < groups.length && groups[end] === "0") end += 1;
    const length = end - start;
    if (length >= 2 && length > longestLength) {
      longestStart = start;
      longestLength = length;
    }
    start = end;
  }
  if (longestStart < 0) return groups.join(":");
  const left = groups.slice(0, longestStart).join(":");
  const right = groups.slice(longestStart + longestLength).join(":");
  return `${left}::${right}`;
}

function canonicalizeDnsAddress(entry: DnsAddress): DnsAddress | null {
  if (entry.family === 4) {
    return parseIpv4(entry.address) === null ? null : entry;
  }
  const words = parseIpv6(entry.address);
  return words === null
    ? null
    : { address: canonicalIpv6Address(words), family: 6 };
}

export function isPublicDnsAddress(entry: DnsAddress): boolean {
  const detected = isIP(entry.address);
  if (detected !== entry.family) return false;
  if (entry.family === 4) {
    const value = parseIpv4(entry.address);
    return (
      value !== null &&
      !FORBIDDEN_IPV4_PREFIXES.some(([base, bits]) =>
        ipv4InPrefix(value, base, bits),
      )
    );
  }
  const words = parseIpv6(entry.address);
  return (
    words !== null &&
    ipv6InPrefix(
      words,
      ALLOWED_IPV6_GLOBAL_UNICAST_PREFIX[0],
      ALLOWED_IPV6_GLOBAL_UNICAST_PREFIX[1],
    ) &&
    !FORBIDDEN_IPV6_PREFIXES.some(([base, bits]) =>
      ipv6InPrefix(words, base, bits),
    )
  );
}

function addressSortKey(entry: DnsAddress): string {
  if (entry.family === 4) {
    return `4-${String(parseIpv4(entry.address) ?? 0).padStart(10, "0")}`;
  }
  const words = parseIpv6(entry.address);
  return `6-${words === null ? entry.address : Array.from(words).map((word) => word.toString(16).padStart(4, "0")).join("")}`;
}

export async function resolveAndPinPublicAddress(
  hostname: string,
  resolver: DnsResolver,
): Promise<DnsAddress> {
  let answers: readonly DnsAddress[];
  try {
    answers = await resolver.resolve(hostname);
  } catch {
    throw new ResearchPipelineError(
      "source_dns_rejected",
      "La résolution DNS de la source a échoué.",
    );
  }
  const canonicalAnswers = answers.map(canonicalizeDnsAddress);
  if (
    canonicalAnswers.length === 0 ||
    canonicalAnswers.some(
      (answer) => answer === null || !isPublicDnsAddress(answer),
    )
  ) {
    throw new ResearchPipelineError(
      "source_dns_rejected",
      "La résolution DNS n’est pas exclusivement publique.",
    );
  }
  const validatedAnswers = canonicalAnswers.filter(
    (answer): answer is DnsAddress => answer !== null,
  );
  const unique = Array.from(
    new Map(
      validatedAnswers.map((answer) => [
        `${answer.family}:${answer.address}`,
        answer,
      ] as const),
    ).values(),
  ).sort((left, right) => {
    const leftKey = addressSortKey(left);
    const rightKey = addressSortKey(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  const selected = unique[0];
  if (selected === undefined) {
    throw new ResearchPipelineError(
      "source_dns_rejected",
      "Aucune adresse DNS publique n’est disponible.",
    );
  }
  return selected;
}
