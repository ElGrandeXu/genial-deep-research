import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import fixtures from "../docs/contracts/contract-fixtures.json";
import { validateResearchDossier } from "../src/domain/contract-validator";

const expectedStates = {
  supported_claim: ["complete_within_scope", "resolved"],
  homonym_clarification: ["needs_clarification", "ambiguous"],
  conflict_two_versions: ["partial", "resolved"],
  honest_silence: ["insufficient_evidence", "not_found_within_scope"],
  historical_information: ["complete_within_scope", "resolved"],
  technical_failure: ["technical_failure", "resolved"],
} as const;

describe("canonical M2 contract", () => {
  it("accepts the six synthetic fixtures in their expected states", () => {
    expect(fixtures.synthetic_contract_fixture).toBe(true);
    expect(fixtures.not_demo_data).toBe(true);
    expect(fixtures.not_application_output).toBe(true);
    expect(fixtures.fixtures).toHaveLength(6);

    for (const fixture of fixtures.fixtures) {
      const result = validateResearchDossier(fixture.dossier);
      const expected = expectedStates[fixture.scenario as keyof typeof expectedStates];

      expect(result, fixture.scenario).toMatchObject({ ok: true });
      expect(
        [fixture.dossier.global_status, fixture.dossier.identity.status],
        fixture.scenario,
      ).toEqual(expected);
    }
  });

  it("keeps the deterministic semantic verifier and negative mutations green", () => {
    const result = spawnSync(
      "pwsh",
      [
        "-NoProfile",
        "-File",
        join(process.cwd(), "tools", "verify-m2-contract.ps1"),
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("M2_VERIFY_OK: fixtures=6 negative_mutations=5");
  });
});
