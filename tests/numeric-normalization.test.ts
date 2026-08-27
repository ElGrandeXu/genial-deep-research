import { describe, expect, it } from "vitest";

import {
  classifyNumericClaims,
  parseMetricValue,
} from "../src/server/research/numeric-normalization";
import type { ProviderFactCandidate } from "../src/server/research/types";

function metric(overrides: Partial<ProviderFactCandidate> = {}): ProviderFactCandidate {
  const excerpt = overrides.excerpt ?? "Acme Group a publié un chiffre d’affaires de 1 milliard EUR en 2025.";
  return {
    subjectKey: "acme-group",
    category: "metric",
    entityType: "company",
    statement: excerpt,
    predicate: "revenue",
    scopeType: "group",
    scopeLabel: "Acme Group",
    factPeriodLabel: "2025",
    factDate: "2025",
    normalizedValue: "1000000000",
    unit: "revenue",
    currency: "EUR",
    contradictionKey: "revenue-2025",
    structuredUrl: "https://acme.example/results",
    excerpt,
    prefix: null,
    suffix: null,
    ...overrides,
  };
}

describe("bounded numeric normalization", () => {
  it.each([
    ["1 milliard EUR", 1_000_000_000],
    ["1000 millions EUR", 1_000_000_000],
    ["1.5 billion EUR", 1_500_000_000],
    ["157 894 employés", 157_894],
  ])("normalizes %s", (literal, expected) => {
    expect(parseMetricValue(`Acme Group indique ${literal} en 2025.`)).toBe(expected);
  });

  it("treats equivalent values as confirmation", () => {
    expect(classifyNumericClaims(
      metric(),
      metric({
        excerpt: "Acme Group a publié un chiffre d’affaires de 1000 millions EUR en 2025.",
        statement: "Acme Group a publié un chiffre d’affaires de 1000 millions EUR en 2025.",
      }),
    )).toBe("confirmation");
  });

  it("CF-01 classifies two recalculated values with identical definition as contradiction", () => {
    expect(classifyNumericClaims(
      metric(),
      metric({
        excerpt: "Acme Group a publié un chiffre d’affaires de 1,2 milliard EUR en 2025.",
        statement: "Acme Group a publié un chiffre d’affaires de 1,2 milliard EUR en 2025.",
      }),
    )).toBe("contradiction");
  });

  it("CF-02 does not compare group and subsidiary values as a contradiction", () => {
    expect(classifyNumericClaims(
      metric(),
      metric({ scopeType: "subsidiary", scopeLabel: "Acme SAS" }),
    )).toBe("explainable_difference");
  });

  it("does not compare two values whose metric definitions differ", () => {
    expect(classifyNumericClaims(
      metric({ contradictionKey: "reported-revenue" }),
      metric({
        contradictionKey: "adjusted-revenue",
        excerpt: "Acme Group a publié un chiffre d’affaires ajusté de 1,2 milliard EUR en 2025.",
        statement: "Acme Group a publié un chiffre d’affaires ajusté de 1,2 milliard EUR en 2025.",
      }),
    )).toBe("indetermination");
  });

  it("returns indetermination for EUR versus USD and unparseable values", () => {
    expect(classifyNumericClaims(metric(), metric({ currency: "USD" }))).toBe("indetermination");
    expect(parseMetricValue("Acme Group indique environ plusieurs centaines de salariés.")).toBeNull();
  });
});
