# Preview validation 01 — free gates only

Date: 2026-08-28 00:02–00:05 CEST  
Runtime source commit: `52d3112dd0dbe8d8d22d2584f1856a791d9f2c32`  
Deployment ID: `dpl_51MPMM2fgREH3ogqriTYjh7iBFHs`  
URL: <https://genial-deep-research-aeu7pkxi6-el-grande-xue.vercel.app>

Vercel reported `READY`, target `preview`, Node.js `24.x`, function timeout
`180` seconds for `/api/research`, and metadata
`runtimeCommit=52d3112dd0dbe8d8d22d2584f1856a791d9f2c32`.

The CLI metadata also reports `gitDirty=1` because the mission-reference files
`AUDIT_01.md` and `PLAN_ACTION_01.md` remain intentionally untracked. They were
excluded from the verified upload manifest. This deployment is therefore a
validated intermediate Preview, not the final promotion candidate; the final
candidate must be emitted from a clean detached worktree.

Raw build result:

```text
Vercel CLI 59.3.0
pnpm 11.24.0
Next.js 16.3.3
Compiled successfully
TypeScript finished
7/7 static pages generated
api/research runtime: nodejs24.x
api/research timeout: 180 s
readyState: READY
```

Browser command (fixture interception in the browser only; no fixture exists in
the deployed runtime):

```powershell
$env:PLAYWRIGHT_BASE_URL='https://genial-deep-research-aeu7pkxi6-el-grande-xue.vercel.app'
corepack pnpm test:e2e
```

```text
8 passed (21.7s)
Exit 0
```

Remote HTTP command:

```powershell
pwsh -NoProfile -File tools/verify-release-deployment.ps1 `
  -BaseUrl https://genial-deep-research-aeu7pkxi6-el-grande-xue.vercel.app
```

```text
root_status=200
health_status=200; cache-control=no-store
research_get_status=405; allow=POST; cache-control=no-store
foreign_origin=403
bad_mime=415
invalid_json=400
unknown_field=400
body_limit=413
guard_cases=5
disclosure_paths=7
assets_checked=10
RELEASE_DEPLOYMENT_VERIFY_OK
Exit 0
```

No valid research request was sent. Provider calls and provider spend for this
Preview validation are exactly zero.
