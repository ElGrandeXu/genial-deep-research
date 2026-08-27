# Vercel upload manifest

Date: 2026-08-28 00:00 CEST

```text
Command: vercel deploy --dry --json
fileCount: 60
ignoredCount: 76
totalSize: 7,297,821 bytes
forbiddenUploadCount: 0
Result: VERCEL_DRY_MANIFEST_OK
```

The manifest retains `package.json`, `src/app/page.tsx`, the runtime JSON schema,
and `tools/run-next.mjs`. It excludes the two untracked mission-reference files,
browser profiles, Playwright output, local environment files, caches and
governance-only evidence. No local file was deleted.
