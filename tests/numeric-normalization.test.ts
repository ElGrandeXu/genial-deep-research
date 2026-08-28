import { describe, expect, it } from "vitest";

import {
  classifyNumericClaims,
  metricValueNature,
  parseMetricValue,
} from "../src/server/research/numeric-normalization";
import type { ProviderFactCandidate } from "../src/server/research/types";

function metric(overrides: Partial<ProviderFactCandidate> = {}): ProviderFactCandidate {
  const excerpt = overrides.excerpt ?? "Acme Group a publié un chiffre d’affaires de 1 milliard EUR pour l’année civile 2025.";
  return {
    subjectKey: "acme-group",
    category: "metric",
    entityType: "company",
    statement: excerpt,
    predicate: "revenue",
    scopeType: "company",
    scopeLabel: "Acme Group",
    factPeriodLabel: "année civile 2025",
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
        excerpt: "Acme Group a publié un chiffre d’affaires de 1000 millions EUR pour l’année civile 2025.",
        statement: "Acme Group a publié un chiffre d’affaires de 1000 millions EUR pour l’année civile 2025.",
      }),
    )).toBe("confirmation");
  });

  it("CF-01 classifies two recalculated values with identical definition as contradiction", () => {
    expect(classifyNumericClaims(
      metric(),
      metric({
        excerpt: "Acme Group a publié un chiffre d’affaires de 1,2 milliard EUR pour l’année civile 2025.",
        statement: "Acme Group a publié un chiffre d’affaires de 1,2 milliard EUR pour l’année civile 2025.",
      }),
    )).toBe("contradiction");
  });

  it("requires an explicit and matching published-or-estimated nature", () => {
    expect(metricValueNature("Acme Group a publié 1 milliard EUR en 2025.")).toBe("published");
    expect(metricValueNature("Acme Group a déclaré une valeur de 1 milliard EUR en 2025.")).toBe("published");
    expect(metricValueNature("Acme Group estime 1 milliard EUR en 2025.")).toBe("estimated");
    expect(classifyNumericClaims(
      metric({ excerpt: "Acme Group indique 1 milliard EUR en 2025.", statement: "Acme Group indique 1 milliard EUR en 2025." }),
      metric({ excerpt: "Acme Group indique 1,2 milliard EUR en 2025.", statement: "Acme Group indique 1,2 milliard EUR en 2025." }),
    )).toBe("indetermination");
    expect(classifyNumericClaims(
      metric(),
      metric({ excerpt: "Acme Group estime un chiffre d’affaires de 1,2 milliard EUR pour l’année civile 2025.", statement: "Acme Group estime un chiffre d’affaires de 1,2 milliard EUR pour l’année civile 2025." }),
    )).toBe("explainable_difference");
  });

  it.each([
    "Acme Group indique une valeur non publiée de 1 milliard EUR en 2025.",
    "Acme Group indique une valeur non encore publiée de 1 milliard EUR en 2025.",
    "Acme Group reports a not yet published value of 1 billion EUR in 2025.",
    "Acme Group reports an unreported value of 1 billion EUR in 2025.",
    "Acme Group n’a jamais déclaré une valeur de 1 milliard EUR en 2025.",
    "Acme Group never reported a value of 1 billion EUR in 2025.",
    "Acme Group never publicly reported a value of 1 billion EUR in 2025.",
    "Acme Group indique une valeur déclarée contestée de 1 milliard EUR en 2025.",
    "Acme Group reports an unverified value of 1 billion EUR in 2025.",
  ])("keeps qualified or negated value nature unknown: %s", (excerpt) => {
    expect(metricValueNature(excerpt)).toBe("unknown");
  });

  it("compares harmless casing and spacing variants canonically", () => {
    expect(classifyNumericClaims(
      metric({ scopeLabel: "Acme Group", unit: "Revenue", currency: "EUR" }),
      metric({
        scopeLabel: "  ACME   GROUP ",
        unit: "revenue",
        currency: "eur",
        excerpt: "Acme Group a publié un chiffre d’affaires de 1,2 milliard EUR pour l’année civile 2025.",
        statement: "Acme Group a publié un chiffre d’affaires de 1,2 milliard EUR pour l’année civile 2025.",
      }),
    )).toBe("contradiction");
  });

  it("CF-02 does not compare entity and subsidiary values as a contradiction", () => {
    expect(classifyNumericClaims(
      metric(),
      metric({
        scopeType: "subsidiary",
        scopeLabel: "Acme SAS",
        excerpt: "Acme SAS reported subsidiary revenue of 1 billion EUR in calendar year 2025.",
        statement: "Acme SAS reported subsidiary revenue of 1 billion EUR in calendar year 2025.",
      }),
    )).toBe("explainable_difference");
  });

  it("records two grounded values with different metric definitions as explainable", () => {
    expect(classifyNumericClaims(
      metric({ contradictionKey: "reported-revenue" }),
      metric({
        contradictionKey: "adjusted-revenue",
        excerpt: "Acme Group a publié un chiffre d’affaires ajusté de 1,2 milliard EUR pour l’année civile 2025.",
        statement: "Acme Group a publié un chiffre d’affaires ajusté de 1,2 milliard EUR pour l’année civile 2025.",
      }),
    )).toBe("explainable_difference");
  });

  it.each([
    "Acme Group a publié un revenu net de 1,2 milliard EUR pour l’année civile 2025.",
    "Acme Group reported net turnover of 1.2 billion EUR in calendar year 2025.",
    "Acme Group reported turnover net of 1.2 billion EUR in calendar year 2025.",
  ])("keeps a net revenue definition distinct from standard revenue: %s", (excerpt) => {
    expect(classifyNumericClaims(metric(), metric({ excerpt, statement: excerpt })))
      .toBe("explainable_difference");
  });

  it.each([
    [
      "metric",
      {
        excerpt: "Acme Group reported a 2025 workforce of 157,894 employees.",
        statement: "Acme Group reported a 2025 workforce of 157,894 employees.",
      },
    ],
    [
      "currency",
      {
        excerpt: "Acme Group reported revenue of 1.2 billion USD in 2025.",
        statement: "Acme Group reported revenue of 1.2 billion USD in 2025.",
      },
    ],
    ["unit", { unit: "employees" }],
  ] as const)("rejects a declared %s contradicted by the exact excerpt", (_label, overrides) => {
    expect(classifyNumericClaims(metric(), metric(overrides))).toBe("indetermination");
  });

  it("does not mistake a rate of change for a metric level", () => {
    const workforce = (excerpt: string, normalizedValue: string) => metric({
      predicate: "workforce",
      contradictionKey: "workforce-2025",
      unit: "employees",
      currency: null,
      normalizedValue,
      excerpt,
      statement: excerpt,
    });
    expect(classifyNumericClaims(
      workforce("Acme Group reported year-end 2025 workforce growth of 10%.", "10"),
      workforce("Acme Group reported year-end 2025 workforce growth of 12%.", "12"),
    )).toBe("indetermination");
  });

  it("keeps subannual, fiscal and workforce observation bases distinct", () => {
    expect(classifyNumericClaims(
      metric(),
      metric({
        factPeriodLabel: "Q1 2025",
        excerpt: "Acme Group reported Q1 2025 revenue of 1.2 billion EUR.",
        statement: "Acme Group reported Q1 2025 revenue of 1.2 billion EUR.",
      }),
    )).toBe("indetermination");
    expect(classifyNumericClaims(
      metric(),
      metric({
        factPeriodLabel: "FY 2025",
        excerpt: "Acme Group reported FY 2025 revenue of 1.2 billion EUR.",
        statement: "Acme Group reported FY 2025 revenue of 1.2 billion EUR.",
      }),
    )).toBe("explainable_difference");

    const workforce = (excerpt: string) => metric({
      predicate: "workforce",
      contradictionKey: "workforce-2025",
      unit: "employees",
      currency: null,
      excerpt,
      statement: excerpt,
    });
    expect(classifyNumericClaims(
      workforce("Acme Group reported an average calendar year 2025 workforce of 150,000 employees."),
      workforce("Acme Group reported a year-end calendar year 2025 workforce of 157,894 employees."),
    )).toBe("explainable_difference");
  });

  it("keeps consolidated and entity-only scopes distinct", () => {
    expect(classifyNumericClaims(
      metric(),
      metric({
        scopeType: "group",
        excerpt: "Acme Group reported consolidated revenue of 1.2 billion EUR in calendar year 2025.",
        statement: "Acme Group reported consolidated revenue of 1.2 billion EUR in calendar year 2025.",
      }),
    )).toBe("explainable_difference");
    expect(classifyNumericClaims(
      metric(),
      metric({
        excerpt: "Acme Group reported consolidated revenue of 1.2 billion EUR in calendar year 2025.",
        statement: "Acme Group reported consolidated revenue of 1.2 billion EUR in calendar year 2025.",
      }),
    )).toBe("indetermination");
  });

  it("binds the compared value to the declared subject and metric in one clause", () => {
    expect(classifyNumericClaims(
      metric(),
      metric({
        excerpt: "Acme Group reported that revenue was undisclosed. Its fine was 1.2 billion EUR in 2025.",
        statement: "Acme Group reported that revenue was undisclosed. Its fine was 1.2 billion EUR in 2025.",
      }),
    )).toBe("indetermination");
    expect(classifyNumericClaims(
      metric(),
      metric({
        excerpt: "Acme Group acquired Beta. Beta reported revenue of 1.2 billion EUR in 2025.",
        statement: "Acme Group acquired Beta. Beta reported revenue of 1.2 billion EUR in 2025.",
      }),
    )).toBe("indetermination");
  });

  it.each([
    "Acme Group reported first-half 2025 revenue of 1.2 billion EUR.",
    "Acme Group reported year-to-date 2025 revenue of 1.2 billion EUR.",
    "Acme Group reported YTD 2025 revenue of 1.2 billion EUR.",
  ])("rejects a subannual observation before conflict comparison: %s", (excerpt) => {
    expect(classifyNumericClaims(metric(), metric({ excerpt, statement: excerpt })))
      .toBe("indetermination");
  });

  it("distinguishes fiscal variants from a calendar year", () => {
    for (const label of ["fiscal 2025", "fiscal-year 2025"]) {
      const excerpt = `Acme Group reported ${label} revenue of 1.2 billion EUR.`;
      expect(classifyNumericClaims(
        metric(),
        metric({ factPeriodLabel: label, excerpt, statement: excerpt }),
      )).toBe("explainable_difference");
    }
  });

  it("keeps guidance-qualified values and locale-ambiguous scaled decimals indeterminate", () => {
    const expected = "Acme Group reported expected revenue of 1.2 billion EUR in 2025.";
    expect(metricValueNature(expected)).toBe("unknown");
    expect(classifyNumericClaims(metric(), metric({ excerpt: expected, statement: expected })))
      .toBe("indetermination");
    expect(parseMetricValue("Acme Group reported revenue of 1.234 million EUR in 2025."))
      .toBeNull();
    const ambiguous = "Acme Group reported revenue of 1.234 million EUR in 2025.";
    expect(classifyNumericClaims(metric(), metric({ excerpt: ambiguous, statement: ambiguous })))
      .toBe("indetermination");
  });

  it.each([
    "Acme Group reported annual recurring revenue of 1.2 billion EUR in 2025.",
    "Acme Group reported run-rate revenue of 1.2 billion EUR in 2025.",
    "Acme Group reported operating revenue of 1.2 billion EUR in 2025.",
  ])("does not collapse a distinct revenue definition into standard revenue: %s", (excerpt) => {
    expect(classifyNumericClaims(metric(), metric({ excerpt, statement: excerpt })))
      .toBe("indetermination");
  });

  it("treats an entity and its subsidiaries as group scope", () => {
    const excerpt = "Acme Group and its subsidiaries reported revenue of 1.2 billion EUR in calendar year 2025.";
    expect(classifyNumericClaims(
      metric(),
      metric({ scopeType: "group", excerpt, statement: excerpt }),
    )).toBe("explainable_difference");
    expect(classifyNumericClaims(
      metric(),
      metric({ excerpt, statement: excerpt }),
    )).toBe("indetermination");
  });

  it("rejects a subsidiary qualifier that conflicts with a group subject extension", () => {
    const excerpt = "Acme Group and its subsidiaries reported subsidiary revenue of 1.2 billion EUR in calendar year 2025.";
    expect(classifyNumericClaims(
      metric({ scopeType: "group" }),
      metric({ scopeType: "group", excerpt, statement: excerpt }),
    )).toBe("indetermination");
  });

  it("rejects an unnamed parent-company scope for a resolved subsidiary", () => {
    const first = "Acme SAS reported parent company revenue of 1.2 billion EUR in calendar year 2025.";
    const second = "Acme SAS reported parent company revenue of 1.4 billion EUR in calendar year 2025.";
    expect(classifyNumericClaims(
      metric({ scopeLabel: "Acme SAS", excerpt: first, statement: first }),
      metric({ scopeLabel: "Acme SAS", excerpt: second, statement: second }),
    )).toBe("indetermination");
  });

  it("rejects an auditor as the attributed owner of reported revenue", () => {
    const excerpt = "Deloitte audited revenue of 1.2 billion EUR in calendar year 2025.";
    expect(classifyNumericClaims(
      metric({ scopeLabel: "Deloitte", excerpt, statement: excerpt }),
      metric({
        scopeLabel: "Deloitte",
        excerpt: "Deloitte audited revenue of 1.4 billion EUR in calendar year 2025.",
        statement: "Deloitte audited revenue of 1.4 billion EUR in calendar year 2025.",
      }),
    )).toBe("indetermination");
  });

  it.each([
    "Acme Group reported revenue of 1.2 billion EUR in 2025.",
    "Acme Group reported revenue of 1.2 billion EUR. The page was updated in calendar year 2025.",
    "Acme Group reported TTM 2025 revenue of 1.2 billion EUR.",
    "Acme Group reported LTM 2025 revenue of 1.2 billion EUR.",
    "Acme Group reported rolling-year 2025 revenue of 1.2 billion EUR.",
  ])("requires an explicit annual basis in the metric proposition: %s", (excerpt) => {
    expect(classifyNumericClaims(metric(), metric({ excerpt, statement: excerpt })))
      .toBe("indetermination");
  });

  it("recognizes financial-year as fiscal rather than calendar", () => {
    const excerpt = "Acme Group reported financial-year 2025 revenue of 1.2 billion EUR.";
    expect(classifyNumericClaims(
      metric(),
      metric({ factPeriodLabel: "financial-year 2025", excerpt, statement: excerpt }),
    )).toBe("explainable_difference");
  });

  it.each([
    "Acme Group reported that Beta Corp revenue was 1.2 billion EUR in calendar year 2025.",
    "Acme Group reported European segment revenue of 1.2 billion EUR in calendar year 2025.",
    "Acme Group reported subscription revenue of 1.2 billion EUR in calendar year 2025.",
    "Acme Group reported deferred revenue of 1.2 billion EUR in calendar year 2025.",
    "Acme Group reported revenue of 1.2 billion. The currency was EUR in calendar year 2025.",
  ])("rejects an unowned or unsupported revenue observation: %s", (excerpt) => {
    expect(classifyNumericClaims(metric(), metric({ excerpt, statement: excerpt })))
      .toBe("indetermination");
  });

  it.each([
    "Acme Group reported about revenue of 1.2 billion EUR in calendar year 2025.",
    "Acme Group reported revenue of about 1.2 billion EUR in calendar year 2025.",
    "Acme Group reported revenue of 10–12 million EUR in calendar year 2025.",
    "Acme Group reported revenue of 1,234,567 EUR in calendar year 2025.",
  ])("rejects approximate, ranged or truncated numeric observations: %s", (excerpt) => {
    expect(classifyNumericClaims(metric(), metric({ excerpt, statement: excerpt })))
      .toBe("indetermination");
  });
  it("rejects a single three-digit separator for unscaled revenue", () => {
    for (const literal of ["1.234 EUR", "1,234 EUR"]) {
      const excerpt = `Acme Group reported revenue of ${literal} in calendar year 2025.`;
      expect(classifyNumericClaims(metric(), metric({ excerpt, statement: excerpt })))
        .toBe("indetermination");
    }
  });
  it("does not partially parse a multiply-grouped numeric token", () => {
    expect(parseMetricValue(
      "Acme Group reported revenue of 1,234,567 EUR in calendar year 2025.",
    )).toBeNull();
  });

  it.each(["budgeted", "preliminary", "provisional"])(
    "keeps a reported %s value outside published/final comparison",
    (qualifier) => {
      const excerpt = `Acme Group reported ${qualifier} revenue of 1.2 billion EUR in calendar year 2025.`;
      expect(metricValueNature(excerpt)).toBe("unknown");
      expect(classifyNumericClaims(metric(), metric({ excerpt, statement: excerpt })))
        .toBe("indetermination");
    },
  );

  it.each(["permanent", "temporary"])(
    "rejects an unsupported %s workforce population",
    (population) => {
      const workforce = (excerpt: string) => metric({
        predicate: "workforce",
        contradictionKey: "workforce-calendar-2025",
        unit: "employees",
        currency: null,
        excerpt,
        statement: excerpt,
      });
      const excerpt = `Acme Group reported a year-end ${population} workforce of 157,894 employees in calendar year 2025.`;
      expect(classifyNumericClaims(
        workforce("Acme Group reported a year-end workforce of 150,000 employees in calendar year 2025."),
        workforce(excerpt),
      )).toBe("indetermination");
    },
  );

  it("does not reuse an unrelated employee count after an unavailable workforce metric", () => {
    const workforce = (excerpt: string) => metric({
      predicate: "workforce",
      contradictionKey: "workforce-calendar-2025",
      unit: "employees",
      currency: null,
      excerpt,
      statement: excerpt,
    });
    expect(classifyNumericClaims(
      workforce("Acme Group reported a year-end workforce of 150,000 employees in calendar year 2025."),
      workforce("Acme Group reported that its year-end workforce was unavailable. But 157,894 employees attended in calendar year 2025."),
    )).toBe("indetermination");
  });

  it("returns indetermination for EUR versus USD and unparseable values", () => {
    expect(classifyNumericClaims(metric(), metric({ currency: "USD" }))).toBe("indetermination");
    expect(parseMetricValue("Acme Group indique environ plusieurs centaines de salariés.")).toBeNull();
  });
});
