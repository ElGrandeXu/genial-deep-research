import { describe, expect, it } from "vitest";

import {
  classifyTemporalStatus,
  deriveFactPeriod,
} from "../src/server/research/temporal-policy";
import type { ProviderFactCandidate } from "../src/server/research/types";

function candidate(overrides: Partial<ProviderFactCandidate> = {}): ProviderFactCandidate {
  const excerpt = overrides.excerpt ?? "Acme SAS a été fondée en 2015.";
  return {
    subjectKey: "acme-sas",
    category: "event",
    entityType: "company",
    statement: excerpt,
    predicate: "foundation",
    scopeType: "company",
    scopeLabel: "Acme SAS",
    factPeriodLabel: "2015",
    factDate: "2015",
    normalizedValue: null,
    unit: null,
    currency: null,
    contradictionKey: null,
    structuredUrl: "https://acme.example/history",
    excerpt,
    prefix: null,
    suffix: null,
    ...overrides,
  };
}

describe("conservative temporal policy", () => {
  it("represents a literal year as an interval and never as 31 December", () => {
    expect(deriveFactPeriod(candidate())).toEqual({
      status: "stated",
      start: "2015-01-01T00:00:00.000Z",
      end: "2015-12-31T23:59:59.999Z",
      as_of: null,
      label: "2015",
    });
  });

  it("represents an exact date as as_of", () => {
    expect(deriveFactPeriod(candidate({
      factPeriodLabel: "12 mai 2025",
      factDate: "2025-05-12",
      excerpt: "Acme SAS a annoncé ce partenariat le 12 mai 2025.",
      statement: "Acme SAS a annoncé ce partenariat le 12 mai 2025.",
    }))).toMatchObject({
      start: null,
      end: null,
      as_of: "2025-05-12T00:00:00.000Z",
      label: "12 mai 2025",
    });
  });

  it("rejects an exact date inferred from a year-only excerpt", () => {
    expect(deriveFactPeriod(candidate({
      factPeriodLabel: "2025",
      factDate: "2025-05-12",
      excerpt: "Acme SAS a annoncé ce partenariat en 2025.",
      statement: "Acme SAS a annoncé ce partenariat en 2025.",
    }))).toEqual({
      status: "unknown",
      start: null,
      end: null,
      as_of: null,
      label: null,
    });
  });

  it("does not accept an ISO date embedded inside a larger number", () => {
    expect(deriveFactPeriod(candidate({
      factPeriodLabel: "2025-05-12",
      factDate: "2025-05-12",
      excerpt: "Acme SAS référence l’identifiant 12025-05-12 dans son registre.",
      statement: "Acme SAS référence l’identifiant 12025-05-12 dans son registre.",
    }))).toEqual({
      status: "unknown",
      start: null,
      end: null,
      as_of: null,
      label: null,
    });
  });

  it("rejects an ISO date that disagrees with the literal date label", () => {
    expect(deriveFactPeriod(candidate({
      factPeriodLabel: "13 mai 2025",
      factDate: "2025-05-12",
      excerpt: "Acme SAS a annoncé ce partenariat le 13 mai 2025.",
      statement: "Acme SAS a annoncé ce partenariat le 13 mai 2025.",
    }))).toMatchObject({ status: "unknown", as_of: null });
  });

  it("rejects a literal year that disagrees with the year in the excerpt", () => {
    expect(deriveFactPeriod(candidate({
      factPeriodLabel: "2025",
      factDate: "2024",
      excerpt: "Acme SAS a annoncé ce partenariat en 2025.",
      statement: "Acme SAS a annoncé ce partenariat en 2025.",
    }))).toEqual({
      status: "unknown",
      start: null,
      end: null,
      as_of: null,
      label: null,
    });
  });

  it("does not accept a declared year embedded inside a larger number", () => {
    expect(deriveFactPeriod(candidate({
      factPeriodLabel: "2025",
      factDate: "2025",
      excerpt: "Acme SAS a livré 12025 unités.",
      statement: "Acme SAS a livré 12025 unités.",
    }))).toMatchObject({ status: "unknown", start: null, end: null });
  });

  it("TM-01 never turns an old appointment into a current role", () => {
    const appointment = candidate({
      category: "role",
      predicate: "appointment",
      factPeriodLabel: "2021",
      factDate: "2021",
      excerpt: "Acme SAS a nommé Alice Martin directrice générale en 2021.",
      statement: "Acme SAS a nommé Alice Martin directrice générale en 2021.",
    });
    expect(classifyTemporalStatus({
      candidate: appointment,
      period: deriveFactPeriod(appointment),
      observedAt: new Date("2026-08-27T12:00:00.000Z"),
    })).toBe("historical");
  });

  it("keeps a recent event dated without calling it a current state", () => {
    const event = candidate({
      category: "recent_signal",
      predicate: "partnership_announcement",
      factPeriodLabel: "20 août 2026",
      factDate: "2026-08-20",
      excerpt: "Acme SAS a annoncé un partenariat le 20 août 2026.",
      statement: "Acme SAS a annoncé un partenariat le 20 août 2026.",
    });
    expect(classifyTemporalStatus({
      candidate: event,
      period: deriveFactPeriod(event),
      observedAt: new Date("2026-08-27T12:00:00.000Z"),
    })).toBe("historical");
  });

  it("leaves an undated present-tense role unknown", () => {
    const role = candidate({
      category: "role",
      predicate: "chief_executive",
      factPeriodLabel: null,
      factDate: null,
      excerpt: "Alice Martin est directrice générale d’Acme SAS.",
      statement: "Alice Martin est directrice générale d’Acme SAS.",
    });
    const period = deriveFactPeriod(role);
    expect(period.status).toBe("unknown");
    expect(classifyTemporalStatus({
      candidate: role,
      period,
      observedAt: new Date("2026-08-27T12:00:00.000Z"),
    })).toBe("unknown");
  });

  it("does not trust a provider-only observation date for a current role", () => {
    const role = candidate({
      category: "role",
      predicate: "chief_executive",
      factPeriodLabel: "27 août 2026",
      factDate: "2026-08-27",
      excerpt: "Alice Martin est actuellement directrice générale d’Acme SAS.",
      statement: "Alice Martin est actuellement directrice générale d’Acme SAS.",
    });
    const period = deriveFactPeriod(role);
    expect(period.status).toBe("unknown");
    expect(classifyTemporalStatus({
      candidate: role,
      period,
      observedAt: new Date("2026-08-27T12:00:00.000Z"),
    })).toBe("unknown");
  });

  it("accepts current only when the exact observation date is in the proof", () => {
    const role = candidate({
      category: "role",
      predicate: "chief_executive",
      factPeriodLabel: "27 août 2026",
      factDate: "2026-08-27",
      excerpt: "À ce jour, le 27 août 2026, Alice Martin est directrice générale d’Acme SAS.",
      statement: "À ce jour, le 27 août 2026, Alice Martin est directrice générale d’Acme SAS.",
    });
    const period = deriveFactPeriod(role);
    expect(period.status).toBe("stated");
    expect(classifyTemporalStatus({
      candidate: role,
      period,
      observedAt: new Date("2026-08-27T12:00:00.000Z"),
    })).toBe("current");
  });
});
