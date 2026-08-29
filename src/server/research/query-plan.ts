import type { ResearchInput } from "./types";

function compact(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function quote(value: string): string {
  return `"${value.replace(/["“”]+/gu, " ").trim()}"`;
}

function freeContextFragments(context: string | undefined): readonly string[] {
  return context === undefined
    ? []
    : context.split(/[,;|\n]+/gu).map(compact).filter((value) => value.length >= 2);
}

export function buildSearchQueryPlan(input: ResearchInput): readonly string[] {
  const exactName = quote(input.name);
  const hints = input.hints;
  const fragments = freeContextFragments(input.context);
  const candidates = [
    exactName,
    hints?.organization === undefined ? undefined : `${exactName} ${quote(hints.organization)}`,
    hints?.city === undefined ? undefined : `${exactName} ${quote(hints.city)}`,
    hints?.role !== undefined
      ? `${exactName} ${quote(hints.role)}`
      : hints?.industry !== undefined
        ? `${exactName} ${quote(hints.industry)}`
        : fragments[0] === undefined
          ? undefined
          : `${exactName} ${quote(fragments[0])}`,
  ].filter((value): value is string => value !== undefined);
  return [...new Set(candidates)].slice(0, 4);
}

export function positiveContextText(input: ResearchInput): string | undefined {
  const values = [
    input.hints?.city,
    input.hints?.organization,
    input.hints?.role,
    input.hints?.industry,
    input.hints?.sourceUrl,
    input.context,
  ].filter((value): value is string => value !== undefined && value.trim().length > 0);
  return values.length === 0 ? undefined : values.join(", ");
}
