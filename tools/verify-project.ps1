param(
    [switch]$SkipBuild,
    [string]$SkipBuildReason,
    [switch]$Offline
)

$ErrorActionPreference = 'Stop'

if ($SkipBuild -and [string]::IsNullOrWhiteSpace($SkipBuildReason)) {
    throw 'PROJECT_VERIFY_FAILED: -SkipBuild requires -SkipBuildReason'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

function Invoke-RepositoryScript {
    param(
        [Parameter(Mandatory)][string]$Name,
        [AllowEmptyCollection()][object[]]$Arguments = @()
    )

    $path = Join-Path $PSScriptRoot $Name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "PROJECT_VERIFY_FAILED: required verifier missing: $Name"
    }

    & pwsh -NoProfile -File $path @Arguments
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Invoke-Pnpm {
    param([Parameter(Mandatory)][string[]]$Arguments)

    & corepack pnpm @Arguments
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Test-SecretScannerNegativeProbe {
    $scanPath = Join-Path $PSScriptRoot 'scan-secrets.ps1'
    $probeOutput = @(
        & pwsh -NoProfile -File $scanPath -Mode WorkingTree -ProbeSyntheticSecret 2>&1
    )
    $probeExit = $LASTEXITCODE
    $probeText = $probeOutput -join "`n"
    if ($probeExit -eq 0 -or $probeText -notmatch 'SECRET_SCAN_FINDING: __synthetic_secret_probe__:1:openai-key') {
        throw 'PROJECT_VERIFY_FAILED: synthetic secret was not rejected'
    }
    Write-Output 'SECRET_SCAN_NEGATIVE_PROBE_OK: synthetic OpenAI-shaped key rejected'
}

# Candidate repository boundary: required product files, final receipts,
# portable links and the official Vercel dry-run context.
Invoke-RepositoryScript -Name 'verify-candidate-repository.ps1'

# Scan every relevant Git view explicitly. A clean staged set is still a valid
# scan result and prevents the release gate from depending on staging state.
foreach ($mode in @('WorkingTree', 'Staged', 'Tracked')) {
    Invoke-RepositoryScript -Name 'scan-secrets.ps1' -Arguments @($mode)
}
Test-SecretScannerNegativeProbe

# Validate the canonical JSON contract and its semantic negative mutations,
# then exercise the runtime-only invariants against the implementation used by
# the application. The full suite runs again below as the release gate.
Invoke-RepositoryScript -Name 'verify-m2-contract.ps1'
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'tests/runtime-invariants.test.ts') -PathType Leaf)) {
    throw 'PROJECT_VERIFY_FAILED: runtime invariant tests are missing'
}
Invoke-Pnpm -Arguments @('exec', 'vitest', 'run', 'tests/runtime-invariants.test.ts')
Write-Output 'RUNTIME_INVARIANTS_OK: current runtime dossier rules exercised'

$package = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
$expectedPnpm = [string]$package.packageManager -replace '^pnpm@', ''
$actualPnpm = (& corepack pnpm --version).Trim()
if ($LASTEXITCODE -ne 0 -or $actualPnpm -ne $expectedPnpm) {
    throw "PROJECT_VERIFY_FAILED: pnpm version differs: expected=$expectedPnpm actual=$actualPnpm"
}
Write-Output "PACKAGE_MANAGER_OK: pnpm=$actualPnpm"

foreach ($script in @('lint', 'typecheck', 'test')) {
    Invoke-Pnpm -Arguments @('run', $script)
}

if ($SkipBuild) {
    Write-Output "PROJECT_BUILD_SKIPPED: $SkipBuildReason"
    Write-Output "CLIENT_BUNDLE_SKIPPED: $SkipBuildReason"
} else {
    Invoke-Pnpm -Arguments @('run', 'build')
    Invoke-RepositoryScript -Name 'verify-client-bundle.ps1'
    Invoke-Pnpm -Arguments @('run', 'test:e2e')
    Write-Output 'BROWSER_E2E_OK: Chromium production-build journeys passed'
    Invoke-Pnpm -Arguments @('run', 'lighthouse:check')
}

if ($Offline) {
    Write-Output 'DEPENDENCY_AUDIT_SKIPPED: offline mode; rerun without -Offline before release'
} else {
    Invoke-Pnpm -Arguments @('audit', '--prod', '--audit-level', 'high')
    Write-Output 'DEPENDENCY_AUDIT_OK: production dependencies, threshold=high'
}

# Keep destructive-looking checks synthetic: secret injection, invalid dossier
# and unsupported fact are rejected without touching product files or evidence.
Invoke-RepositoryScript -Name 'test-verifier-negative-paths.ps1'

Write-Output "PROJECT_VERIFY_OK: build=$(-not $SkipBuild) dependency_audit=$(-not $Offline)"
