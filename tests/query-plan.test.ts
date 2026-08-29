import { describe, expect, it } from "vitest";

import { buildSearchQueryPlan } from "../src/server/research/query-plan";

describe("deterministic positive query plan", () => {
  it("prepares ordered variants without concatenating every hint", () => {
    expect(buildSearchQueryPlan({
      name: "Ariane Veldor",
      entityType: "person",
      hints: { city: "Val-sur-Nacre", organization: "Atelier Orbe Zéro" },
    })).toEqual([
      '"Ariane Veldor"',
      '"Ariane Veldor" "Atelier Orbe Zéro"',
      '"Ariane Veldor" "Val-sur-Nacre"',
    ]);
  });

  it("is monotonic when a role is added", () => {
    const base = buildSearchQueryPlan({
      name: "Ariane Veldor",
      entityType: "person",
      hints: { city: "Val-sur-Nacre", organization: "Atelier Orbe Zéro" },
    });
    const enriched = buildSearchQueryPlan({
      name: "Ariane Veldor",
      entityType: "person",
      hints: {
        city: "Val-sur-Nacre",
        organization: "Atelier Orbe Zéro",
        role: "Responsable Rayonnement Numérique",
      },
    });
    expect(enriched.slice(0, base.length)).toEqual(base);
    expect(enriched.at(-1)).toBe('"Ariane Veldor" "Responsable Rayonnement Numérique"');
  });
});
