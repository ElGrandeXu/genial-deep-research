import { normalizeVisibleText } from "./source-content";
import type { ProviderFactCandidate } from "./types";

export type NumericRelationship =
  | "confirmation"
  | "explainable_difference"
  | "contradiction"
  | "indetermination";

const NUMBER_PATTERN = /(?<![\p{L}\d])([-+]?\d+(?:(?:[ .\u202f]\d{3})+|(?:[.,]\d+))?)(?:\s*(k|thousand|million(?:s)?|milliard(?:s)?|billion|bn))?/giu;

function parseLiteral(raw: string): number | null {
  const compact = raw.replace(/[ \u202f]/gu, "");
  const comma = compact.lastIndexOf(",");
  const dot = compact.lastIndexOf(".");
  let canonical = compact;
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    canonical = compact.replaceAll(thousands, "").replace(decimal, ".");
  } else {
    const separator = comma >= 0 ? "," : dot >= 0 ? "." : null;
    if (separator !== null) {
      const pieces = compact.split(separator);
      const groupedThousands = pieces.length > 1 && pieces.slice(1).every((piece) => piece.length === 3);
      canonical = groupedThousands
        ? pieces.join("")
        : `${pieces.shift() ?? ""}.${pieces.join("")}`;
    }
  }
  const value = Number(canonical);
  return Number.isFinite(value) ? value : null;
}

function multiplierFor(value: string | undefined): number | null {
  if (value === undefined || value === "") return 1;
  const normalized = value.toLocaleLowerCase("fr");
  if (normalized === "k" || normalized === "thousand") return 1_000;
  if (normalized.startsWith("million")) return 1_000_000;
  if (normalized.startsWith("milliard") || normalized === "billion" || normalized === "bn") {
    return 1_000_000_000;
  }
  return null;
}

export function parseMetricValue(excerpt: string): number | null {
  const matches = [...normalizeVisibleText(excerpt).matchAll(NUMBER_PATTERN)].flatMap((match) => {
    const raw = match[1];
    const multiplier = multiplierFor(match[2]);
    if (raw === undefined || multiplier === null) return [];
    const parsed = parseLiteral(raw);
    if (parsed === null) return [];
    const isBareYear = match[2] === undefined && /^\d{4}$/u.test(raw) && parsed >= 1900 && parsed <= 2100;
    return isBareYear ? [] : [parsed * multiplier];
  });
  const unique = [...new Set(matches)];
  return unique.length === 1 ? unique[0] ?? null : null;
}

function normalized(value: string | null): string {
  return normalizeVisibleText(value ?? "").normalize("NFKC").toLocaleLowerCase("fr");
}

function samePeriod(left: ProviderFactCandidate, right: ProviderFactCandidate): boolean {
  return normalized(left.factDate ?? left.factPeriodLabel) === normalized(right.factDate ?? right.factPeriodLabel);
}

export function classifyNumericClaims(
  left: ProviderFactCandidate,
  right: ProviderFactCandidate,
): NumericRelationship {
  if (left.category !== "metric" || right.category !== "metric") return "indetermination";
  if (normalized(left.predicate) !== normalized(right.predicate)) return "indetermination";
  const leftDefinition = normalized(left.contradictionKey);
  const rightDefinition = normalized(right.contradictionKey);
  if (
    leftDefinition.length === 0 ||
    rightDefinition.length === 0 ||
    leftDefinition !== rightDefinition
  ) return "indetermination";
  if (
    left.scopeType !== right.scopeType ||
    normalized(left.scopeLabel) !== normalized(right.scopeLabel) ||
    !samePeriod(left, right) ||
    normalized(left.unit) !== normalized(right.unit)
  ) {
    return "explainable_difference";
  }
  if (normalized(left.currency) !== normalized(right.currency)) return "indetermination";
  const leftValue = parseMetricValue(left.excerpt);
  const rightValue = parseMetricValue(right.excerpt);
  if (leftValue === null || rightValue === null) return "indetermination";
  return Math.abs(leftValue - rightValue) <= Math.max(1, Math.abs(leftValue)) * 1e-12
    ? "confirmation"
    : "contradiction";
}
