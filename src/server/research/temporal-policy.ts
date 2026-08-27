import type { ResearchDossier } from "../../domain/research-dossier";
import type { ProviderFactCandidate } from "./types";

type FactPeriod = ResearchDossier["claims"][number]["fact_period"];
type TemporalStatus = ResearchDossier["claims"][number]["temporal_status"];

const MONTH_NUMBER = new Map<string, number>([
  ["janvier", 1], ["january", 1], ["jan", 1],
  ["fevrier", 2], ["february", 2], ["fev", 2], ["feb", 2],
  ["mars", 3], ["march", 3], ["mar", 3],
  ["avril", 4], ["april", 4], ["avr", 4], ["apr", 4],
  ["mai", 5], ["may", 5],
  ["juin", 6], ["june", 6], ["jun", 6],
  ["juillet", 7], ["july", 7], ["jul", 7],
  ["aout", 8], ["august", 8], ["aug", 8],
  ["septembre", 9], ["september", 9], ["sept", 9], ["sep", 9],
  ["octobre", 10], ["october", 10], ["oct", 10],
  ["novembre", 11], ["november", 11], ["nov", 11],
  ["decembre", 12], ["december", 12], ["dec", 12],
]);

function normalizedDateText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/\s+/gu, " ")
    .trim();
}

function literalAppears(excerpt: string, literal: string): boolean {
  return normalizedDateText(excerpt).includes(normalizedDateText(literal));
}

function exactDateMatchesLabel(exactDate: string, label: string): boolean {
  const [yearLiteral, monthLiteral, dayLiteral] = exactDate.slice(0, 10).split("-");
  const year = Number(yearLiteral);
  const month = Number(monthLiteral);
  const day = Number(dayLiteral);
  const normalized = normalizedDateText(label);
  if (normalized === exactDate) return true;

  const numericDayFirst = normalized.match(/\b(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})\b/u);
  if (numericDayFirst !== null) {
    return Number(numericDayFirst[1]) === day &&
      Number(numericDayFirst[2]) === month &&
      Number(numericDayFirst[3]) === year;
  }

  const monthEntry = [...MONTH_NUMBER].find(([name]) =>
    new RegExp(`\\b${name}\\b`, "u").test(normalized),
  );
  if (monthEntry === undefined || monthEntry[1] !== month) return false;
  const numbers = normalized.match(/\b\d{1,4}\b/gu)?.map(Number) ?? [];
  return numbers.includes(day) && numbers.includes(year);
}

function isoDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date.toISOString();
}

function literalYear(value: string): number | null {
  if (!/^\d{4}$/u.test(value)) return null;
  const year = Number(value);
  return year >= 1000 && year <= 9999 ? year : null;
}

export function deriveFactPeriod(candidate: ProviderFactCandidate): FactPeriod {
  const label = candidate.factPeriodLabel ?? candidate.factDate;
  const dateLiteral = candidate.factDate;
  if (
    dateLiteral === null ||
    label === null ||
    !literalAppears(candidate.excerpt, label)
  ) {
    return { status: "unknown", start: null, end: null, as_of: null, label: null };
  }
  const year = literalYear(dateLiteral);
  if (year !== null) {
    return {
      status: "stated",
      start: `${year.toString().padStart(4, "0")}-01-01T00:00:00.000Z`,
      end: `${year.toString().padStart(4, "0")}-12-31T23:59:59.999Z`,
      as_of: null,
      label,
    };
  }
  const exact = isoDate(dateLiteral);
  if (exact !== null && exactDateMatchesLabel(dateLiteral, label)) {
    return {
      status: "stated",
      start: null,
      end: null,
      as_of: exact,
      label,
    };
  }
  return { status: "unknown", start: null, end: null, as_of: null, label: null };
}

function periodMoment(period: FactPeriod): Date | null {
  const literal = period.as_of ?? period.end ?? period.start;
  if (literal === null) return null;
  const date = new Date(literal);
  return Number.isNaN(date.getTime()) ? null : date;
}

function explicitlyObservedCurrent(
  candidate: ProviderFactCandidate,
  period: FactPeriod,
  observedAt: Date,
): boolean {
  if (!/(?:^|[\s,(])(?:actuellement|à ce jour|currently|current as of)(?=$|[\s,.;:])/iu.test(candidate.excerpt)) {
    return false;
  }
  if (!new Set(["activity", "role", "geography"]).has(candidate.category)) return false;
  return period.status === "stated" &&
    period.as_of !== null &&
    period.as_of.slice(0, 10) === observedAt.toISOString().slice(0, 10);
}

export function classifyTemporalStatus(options: {
  readonly candidate: ProviderFactCandidate;
  readonly period: FactPeriod;
  readonly observedAt: Date;
}): TemporalStatus {
  if (explicitlyObservedCurrent(options.candidate, options.period, options.observedAt)) {
    return "current";
  }
  const moment = periodMoment(options.period);
  if (moment === null) return "unknown";
  if (moment.getTime() <= options.observedAt.getTime()) return "historical";
  return "unknown";
}
