import { describe, expect, it } from "vitest";

import { buildSearchQueryPlan } from "../src/server/research/query-plan";

describe("deterministic positive query plan", () => {
  it("prepares ordered variants without concatenating every hint", () => {
    expect(buildSearchQueryPlan({
      name: "Clémence Bertrand",
      entityType: "person",
      hints: { city: "Bordeaux", organization: "Synapse Medicine" },
    })).toEqual([
      '"Clémence Bertrand"',
      '"Clémence Bertrand" "Synapse Medicine"',
      '"Clémence Bertrand" "Bordeaux"',
    ]);
  });

  it("is monotonic when a role is added", () => {
    const base = buildSearchQueryPlan({
      name: "Clémence Bertrand",
      entityType: "person",
      hints: { city: "Bordeaux", organization: "Synapse Medicine" },
    });
    const enriched = buildSearchQueryPlan({
      name: "Clémence Bertrand",
      entityType: "person",
      hints: {
        city: "Bordeaux",
        organization: "Synapse Medicine",
        role: "Marketing Communication",
      },
    });
    expect(enriched.slice(0, base.length)).toEqual(base);
    expect(enriched.at(-1)).toBe('"Clémence Bertrand" "Marketing Communication"');
  });
});
