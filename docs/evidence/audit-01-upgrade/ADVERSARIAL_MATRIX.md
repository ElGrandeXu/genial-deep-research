# Deterministic adversarial matrix

Date: 2026-08-27 23:49 CEST  
Environment: local, no `OPENAI_API_KEY` required, network blocked by the Vitest
offline guard.

Command:

```powershell
corepack pnpm exec vitest run tests/identity-resolution.test.ts tests/scope-policy.test.ts tests/claim-quality.test.ts tests/completeness.test.ts tests/temporal-policy.test.ts tests/numeric-normalization.test.ts tests/research.test.ts --reporter=verbose
```

Raw summary:

```text
Test Files  7 passed (7)
Tests       79 passed (79)
Exit        0
```

| ID | Executed invariant | Raw result |
|---|---|---|
| ID-01 | Provider says resolved with two plausible candidates | PASS — ambiguity, no selected subject |
| ID-02 | Unique candidate but supplied context absent from exact proof | PASS — unresolved context |
| ID-03 | Fact `subjectKey` differs from selected candidate | PASS — `subject_key_mismatch` |
| ID-04 | Multi-entity page with unlabeled metric scope | PASS — `scope_label_required` |
| ID-05 | Context contains hostile instructions | PASS — context never overrides server policy |
| SC-01 | Airbus SAS candidate with Airbus SE group revenue | PASS — `scope_incompatible` |
| SC-02 | Orange brand with Orange SA owner metric | PASS — brand/company scopes remain distinct |
| CQ-01 | `+250 / Solutions déployées` and other weak fragments | PASS — rejected by quality gate |
| CQ-02 | Atomic claim plus compound version of the same fact | PASS — one atomic fact retained |
| CP-01 | Three facts from one publisher family | PASS — `partial` |
| CP-02 | Three unique facts, three pages, two publisher domains | PASS — `complete_within_scope` |
| TM-01 | Old appointment | PASS — `historical`, never `current` |
| CF-01 | Incompatible numbers with identical definition/scope/period | PASS — visible contradiction |
| CF-02 | Group and subsidiary figures | PASS — explainable difference, not contradiction |
| SL-01 | No directly verified proof | PASS — silence with zero fact and zero source |

The full verbose console run also covers the positive counterparts: one uniquely
verified identity, compatible subsidiary attribution, atomic quality, literal
dates, equivalent metric confirmation, and exact source-backed complete dossier.
The pre-fix RED outputs are retained under `failures/`.
