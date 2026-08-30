import { normalizeVisibleText } from "./source-content";

export const COMPANY_LEGAL_SUFFIXES = new Set([
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

interface CompanyNameParts {
  readonly core: string;
  readonly suffix: string | null;
}

function normalizedCompanyName(value: string): string {
  return normalizeVisibleText(value)
    .toLocaleLowerCase("fr")
    .replace(/[’']/gu, "'")
    .replace(/[^\p{L}\p{N}' -]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function companyNameParts(value: string): CompanyNameParts {
  const tokens = normalizedCompanyName(value).split(/[ '-]+/u).filter(Boolean);
  const last = tokens.at(-1);
  const suffix = last !== undefined && COMPANY_LEGAL_SUFFIXES.has(last) ? last : null;
  return {
    core: (suffix === null ? tokens : tokens.slice(0, -1)).join(" "),
    suffix,
  };
}

export function companyNamesCompatible(left: string, right: string): boolean {
  const normalizedLeft = normalizedCompanyName(left);
  const normalizedRight = normalizedCompanyName(right);
  if (normalizedLeft.length === 0 || normalizedRight.length === 0) return false;
  if (normalizedLeft === normalizedRight) return true;
  const leftParts = companyNameParts(left);
  const rightParts = companyNameParts(right);
  return leftParts.core.length > 0 &&
    leftParts.core === rightParts.core &&
    (leftParts.suffix === null) !== (rightParts.suffix === null);
}

export function companyNameHasLegalSuffix(value: string): boolean {
  return companyNameParts(value).suffix !== null;
}

export function companyIdentityLabels(displayName: string, requestedName: string): readonly string[] {
  const labels = new Set<string>([displayName]);
  const parts = companyNameParts(displayName);
  if (parts.suffix !== null && parts.core.length >= 3) {
    const coreWordCount = parts.core.split(" ").length;
    labels.add(displayName.split(/\s+/u).slice(0, coreWordCount).join(" "));
  }
  if (companyNamesCompatible(displayName, requestedName)) labels.add(requestedName);
  return [...labels];
}
