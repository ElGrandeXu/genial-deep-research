$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$resolvedRootRaw = (& git -C $repoRoot rev-parse --show-toplevel 2>$null).Trim()
if ($LASTEXITCODE -ne 0) { throw 'FOUNDATION_VERIFY_FAILED: Git root is not GENIAL' }
$resolvedRoot = (Resolve-Path -LiteralPath $resolvedRootRaw).Path
if ($resolvedRoot -ne $repoRoot) { throw 'FOUNDATION_VERIFY_FAILED: Git root is not GENIAL' }

$durableControls = @(
    '.env.example',
    '.gitattributes',
    '.githooks/pre-commit',
    '.gitignore',
    'ACCEPTANCE.md',
    'AGENTS.md',
    'SOURCE_SHA256SUMS',
    'tools/scan-secrets.ps1',
    'tools/verify-source-integrity.ps1'
)
$tracked = @(& git -C $repoRoot -c core.quotepath=false ls-files)
foreach ($path in $durableControls) {
    if ($path -notin $tracked) { throw "FOUNDATION_VERIFY_FAILED: durable control missing: $path" }
}

& (Join-Path $PSScriptRoot 'verify-source-integrity.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

foreach ($source in @(
    'epreuve-deep-research.md',
    'AUDIT_FORMEL_MISSION_GENIAL_DEEP_RESEARCH.md',
    'PLAN_ACTION_DETAILLE_GENIAL_DEEP_RESEARCH.md'
)) {
    $attribute = (& git -C $repoRoot check-attr text -- $source).Trim()
    if ($attribute -notmatch ': text: unset$') {
        throw "FOUNDATION_VERIFY_FAILED: text normalization is not disabled for $source"
    }

    $indexBlob = (& git -C $repoRoot rev-parse ":$source").Trim()
    $worktreeBlob = (& git -C $repoRoot hash-object --no-filters -- $source).Trim()
    if ($indexBlob -ne $worktreeBlob) {
        throw "FOUNDATION_VERIFY_FAILED: Git index changed source bytes for $source"
    }
}

foreach ($relativePath in @(
    'PASSATION_CHATGPT_GENIAL_2026-08-26.md',
    'PASSATION_MIGRATION_TOUR_GENIAL_2026-08-26.md'
)) {
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $relativePath) -PathType Leaf)) {
        throw "FOUNDATION_VERIFY_FAILED: excluded handoff missing: $relativePath"
    }
    & git -C $repoRoot check-ignore -q -- $relativePath
    if ($LASTEXITCODE -ne 0) { throw "FOUNDATION_VERIFY_FAILED: excluded handoff is not ignored: $relativePath" }
    & git -C $repoRoot ls-files --error-unmatch -- $relativePath 2>$null
    if ($LASTEXITCODE -eq 0) { throw "FOUNDATION_VERIFY_FAILED: excluded handoff is tracked: $relativePath" }
}

$realEnvFiles = Get-ChildItem -LiteralPath $repoRoot -Force -Recurse -File -Filter '.env*' | Where-Object {
    $_.FullName -notlike "$repoRoot\.git\*" -and
    $_.FullName -notlike "$repoRoot\node_modules\*" -and
    $_.FullName -notlike "$repoRoot\.next\*" -and
    $_.Name -ne '.env.example'
}
if ($realEnvFiles) { throw 'FOUNDATION_VERIFY_FAILED: a real environment file is present' }

$hooksPath = (& git -C $repoRoot config --local --get core.hooksPath).Trim()
if ($hooksPath -ne '.githooks') { throw 'FOUNDATION_VERIFY_FAILED: versioned hooks are not active' }

$identityName = (& git -C $repoRoot config user.name 2>$null).Trim()
$identityEmail = (& git -C $repoRoot config user.email 2>$null).Trim()
if ([string]::IsNullOrWhiteSpace($identityName) -or [string]::IsNullOrWhiteSpace($identityEmail)) {
    throw 'FOUNDATION_VERIFY_FAILED: Git identity is unavailable'
}

$acceptance = Get-Content -LiteralPath (Join-Path $repoRoot 'ACCEPTANCE.md') -Raw
if ($acceptance -notmatch '- \[x\] \*\*G0 ') {
    throw 'FOUNDATION_VERIFY_FAILED: G0 is not marked complete'
}

& (Join-Path $PSScriptRoot 'scan-secrets.ps1') -Mode Tracked
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Output 'FOUNDATION_VERIFY_OK: root, durable controls, sources, attributes, exclusions, env, hooks, identity, G0, secrets'
