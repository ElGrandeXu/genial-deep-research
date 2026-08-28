# Holdout preregistration

Recorded: 2026-08-28 00:18 CEST  
Runtime freeze: `041dbd125498d448062275860a8bb8a71d65317d`  
Category selected before execution: non-French subsidiary/legal entity.

This name did not appear in source code, prompts, deterministic fixtures or
implementation decisions during the audit-01 patch.

Exact future live input:

```json
{
  "entityType": "company",
  "name": "Google Ireland Limited",
  "context": "Société irlandaise enregistrée à Dublin, distincte de Google LLC et Alphabet Inc. Source officielle : https://policies.google.com/terms"
}
```

Pre-registered decision criteria:

- `resolved` is allowed only with exactly one directly verified candidate and a
  demonstrated context signal;
- the server may retain `company` unless the exact identity proof explicitly
  establishes `subsidiary`; the context alone cannot promote that scope;
- no Alphabet Inc., Google LLC or group metric may be attributed to Google
  Ireland Limited;
- every displayed fact must state the selected legal entity in its exact proof
  and keep a compatible scope label;
- fewer than three safe business facts or fewer than two publisher families must
  yield `partial`, not a forced complete dossier;
- `needs_clarification`, `partial` or honest silence is preferable to a false
  resolution;
- the observed result will not trigger any name/domain-specific patch.

Execution is forbidden until all free gates pass on the final Preview and the
remaining provider budget is explicitly confirmed.
