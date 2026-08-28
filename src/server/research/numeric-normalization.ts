import {
  canonicalConflictText,
  conflictExcerptPeriodKey,
  conflictMetricObservation,
  conflictMetricPredicate,
  conflictScopeMatchesExcerpt,
  conflictValueNature,
  conflictVersionUnitMatchesExcerpt,
  parseConflictMetricValue,
  type ConflictMetricObservation,
} from "../../domain/conflict-comparison";
import { normalizeVisibleText } from "./source-content";
import type { ProviderFactCandidate } from "./types";

export type NumericRelationship =
  | "confirmation"
  | "explainable_difference"
  | "contradiction"
  | "indetermination";

export type MetricValueNature = "published" | "estimated" | "unknown";

export function parseMetricValue(excerpt: string): number | null {
  return parseConflictMetricValue(normalizeVisibleText(excerpt));
}

function normalized(value: string | null): string {
  return normalizeVisibleText(value ?? "").normalize("NFKC").toLocaleLowerCase("fr");
}

export function metricValueNature(excerpt: string): MetricValueNature {
  return conflictValueNature(normalizeVisibleText(excerpt));
}

export type MetricComparisonSignature = ConflictMetricObservation;

export function metricComparisonSignature(
  candidate: ProviderFactCandidate,
): MetricComparisonSignature | null {
  if (candidate.category !== "metric") return null;
  if (candidate.scopeLabel === null) return null;
  const signature = conflictMetricObservation(candidate.excerpt, candidate.scopeLabel);
  const periodKey = signature?.periodKey ?? null;
  const periodYear = periodKey?.split("|", 1)[0] ?? null;
  if (
    signature === null ||
    periodKey === null ||
    periodYear === null ||
    conflictMetricPredicate(candidate.predicate) !== signature.metric ||
    canonicalConflictText(candidate.factDate) !== periodYear ||
    conflictExcerptPeriodKey(candidate.factPeriodLabel ?? "") !== periodKey ||
    !conflictScopeMatchesExcerpt(
      { type: candidate.scopeType, label: candidate.scopeLabel },
      signature,
    ) ||
    !conflictVersionUnitMatchesExcerpt(candidate.unit, signature) ||
    canonicalConflictText(candidate.currency) !== canonicalConflictText(signature.currency)
  ) {
    return null;
  }
  return { ...signature, periodKey };
}

export function classifyNumericClaims(
  left: ProviderFactCandidate,
  right: ProviderFactCandidate,
): NumericRelationship {
  if (left.category !== "metric" || right.category !== "metric") return "indetermination";
  const leftSignature = metricComparisonSignature(left);
  const rightSignature = metricComparisonSignature(right);
  if (leftSignature === null || rightSignature === null) return "indetermination";
  if (
    leftSignature.metric !== rightSignature.metric ||
    leftSignature.semanticUnit !== rightSignature.semanticUnit ||
    leftSignature.currency !== rightSignature.currency
  ) return "indetermination";
  if (
    left.scopeType !== right.scopeType ||
    normalized(left.scopeLabel) !== normalized(right.scopeLabel) ||
    leftSignature.periodKey !== rightSignature.periodKey ||
    leftSignature.definition !== rightSignature.definition ||
    leftSignature.scopeKind !== rightSignature.scopeKind
  ) {
    return "explainable_difference";
  }
  if (normalized(left.predicate) !== normalized(right.predicate)) return "indetermination";
  const leftDefinition = normalized(left.contradictionKey);
  const rightDefinition = normalized(right.contradictionKey);
  if (
    leftDefinition.length === 0 ||
    rightDefinition.length === 0 ||
    leftDefinition !== rightDefinition
  ) return "indetermination";
  const leftNature = leftSignature.valueNature;
  const rightNature = rightSignature.valueNature;
  if (leftNature === "unknown" || rightNature === "unknown") return "indetermination";
  if (leftNature !== rightNature) return "explainable_difference";
  const leftValue = leftSignature.value;
  const rightValue = rightSignature.value;
  return Math.abs(leftValue - rightValue) <= Math.max(1, Math.abs(leftValue)) * 1e-12
    ? "confirmation"
    : "contradiction";
}
