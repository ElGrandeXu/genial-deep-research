$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$resolvedRootRaw = (& git -C $repoRoot rev-parse --show-toplevel 2>$null).Trim()
if ($LASTEXITCODE -ne 0) {
    throw 'M0_VERIFY_FAILED: Git root is not GENIAL'
}
$resolvedRoot = (Resolve-Path -LiteralPath $resolvedRootRaw).Path
if ($resolvedRoot -ne $repoRoot) { throw 'M0_VERIFY_FAILED: Git root is not GENIAL' }

$requiredTracked = @(
    '.env.example',
    '.gitattributes',
    '.githooks/pre-commit',
    '.gitignore',
    'ACCEPTANCE.md',
    'AGENTS.md',
    'AUDIT_FORMEL_MISSION_GENIAL_DEEP_RESEARCH.md',
    'EVIDENCE.md',
    'HANDOFF.md',
    'INPUTS.md',
    'MISSION.md',
    'PLAN_ACTION_DETAILLE_GENIAL_DEEP_RESEARCH.md',
    'RESULT.md',
    'SOURCE_SHA256SUMS',
    'epreuve-deep-research.md',
    'tools/scan-secrets.ps1',
    'tools/verify-m0.ps1',
    'tools/verify-source-integrity.ps1'
) | Sort-Object

$actualTracked = @(& git -C $repoRoot -c core.quotepath=false ls-files) | Sort-Object
$missingM0Paths = @($requiredTracked | Where-Object { $_ -notin $actualTracked })
if ($missingM0Paths.Count -gt 0) {
    throw 'M0_VERIFY_FAILED: a required M0 path is missing'
}

& (Join-Path $PSScriptRoot 'verify-source-integrity.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$sources = @(
    'epreuve-deep-research.md',
    'AUDIT_FORMEL_MISSION_GENIAL_DEEP_RESEARCH.md',
    'PLAN_ACTION_DETAILLE_GENIAL_DEEP_RESEARCH.md'
)
foreach ($source in $sources) {
    $attribute = (& git -C $repoRoot check-attr text -- $source).Trim()
    if ($attribute -notmatch ': text: unset$') {
        throw "M0_VERIFY_FAILED: text normalization is not disabled for $source"
    }

    $indexBlob = (& git -C $repoRoot rev-parse ":$source").Trim()
    $worktreeBlob = (& git -C $repoRoot hash-object --no-filters -- $source).Trim()
    if ($indexBlob -ne $worktreeBlob) {
        throw "M0_VERIFY_FAILED: Git index changed source bytes for $source"
    }
}

$obsolete = @(
    'PASSATION_CHATGPT_GENIAL_2026-08-26.md',
    'PASSATION_MIGRATION_TOUR_GENIAL_2026-08-26.md'
)
foreach ($relativePath in $obsolete) {
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $relativePath) -PathType Leaf)) {
        throw "M0_VERIFY_FAILED: excluded handoff missing: $relativePath"
    }
    & git -C $repoRoot check-ignore -q -- $relativePath
    if ($LASTEXITCODE -ne 0) { throw "M0_VERIFY_FAILED: excluded handoff is not ignored: $relativePath" }
    & git -C $repoRoot ls-files --error-unmatch -- $relativePath 2>$null
    if ($LASTEXITCODE -eq 0) { throw "M0_VERIFY_FAILED: excluded handoff is tracked: $relativePath" }
}

$realEnvFiles = Get-ChildItem -LiteralPath $repoRoot -Force -Recurse -File | Where-Object {
    $_.FullName -notlike "$repoRoot\.git\*" -and
    $_.Name -like '.env*' -and
    $_.Name -ne '.env.example'
}
if ($realEnvFiles) { throw 'M0_VERIFY_FAILED: a real environment file is present' }

$remotes = @(& git -C $repoRoot remote)
if ($remotes.Count -gt 0) { throw 'M0_VERIFY_FAILED: a Git remote exists' }

$hooksPath = (& git -C $repoRoot config --local --get core.hooksPath).Trim()
if ($hooksPath -ne '.githooks') { throw 'M0_VERIFY_FAILED: versioned hooks are not active' }

$identityName = (& git -C $repoRoot config user.name 2>$null).Trim()
$identityEmail = (& git -C $repoRoot config user.email 2>$null).Trim()
if ([string]::IsNullOrWhiteSpace($identityName) -or [string]::IsNullOrWhiteSpace($identityEmail)) {
    throw 'M0_VERIFY_FAILED: Git identity is unavailable'
}

$acceptance = Get-Content -LiteralPath (Join-Path $repoRoot 'ACCEPTANCE.md') -Raw
if ($acceptance -notmatch '- \[x\] \*\*G0 ') {
    throw 'M0_VERIFY_FAILED: G0 is not marked complete'
}

$staged = @(& git -C $repoRoot diff --cached --name-only)
if ($staged.Count -gt 0) {
    & (Join-Path $PSScriptRoot 'scan-secrets.ps1') -Mode Staged
} else {
    & (Join-Path $PSScriptRoot 'scan-secrets.ps1') -Mode Tracked
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Output 'M0_VERIFY_OK: root, required baseline, integrity, attributes, exclusions, secrets, remotes, hooks, identity, G0'
