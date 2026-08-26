param(
    [switch]$SkipBuild,
    [string]$SkipBuildReason
)

$ErrorActionPreference = 'Stop'

if ($SkipBuild -and [string]::IsNullOrWhiteSpace($SkipBuildReason)) {
    throw 'PROJECT_VERIFY_FAILED: -SkipBuild requires -SkipBuildReason'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

& (Join-Path $PSScriptRoot 'verify-foundation.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& (Join-Path $PSScriptRoot 'verify-m0.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& (Join-Path $PSScriptRoot 'scan-secrets.ps1') -Mode WorkingTree
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& (Join-Path $PSScriptRoot 'scan-secrets.ps1') -Mode Staged
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& (Join-Path $PSScriptRoot 'verify-m2-contract.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& (Join-Path $PSScriptRoot 'verify-m3-boundaries.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& (Join-Path $PSScriptRoot 'test-verifier-negative-paths.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$package = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
$expectedPnpm = [string]$package.packageManager -replace '^pnpm@', ''
$actualPnpm = (& corepack pnpm --version).Trim()
if ($LASTEXITCODE -ne 0 -or $actualPnpm -ne $expectedPnpm) {
    throw "PROJECT_VERIFY_FAILED: pnpm version differs: expected=$expectedPnpm actual=$actualPnpm"
}
Write-Output "PACKAGE_MANAGER_OK: pnpm=$actualPnpm"

foreach ($script in @('lint', 'typecheck', 'test')) {
    & corepack pnpm run $script
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($SkipBuild) {
    Write-Output "PROJECT_BUILD_SKIPPED: $SkipBuildReason"
} else {
    & corepack pnpm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & (Join-Path $PSScriptRoot 'verify-client-bundle.ps1')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Output "PROJECT_VERIFY_OK: build=$(-not $SkipBuild)"
