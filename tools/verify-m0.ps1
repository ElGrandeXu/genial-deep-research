param(
    [string]$Commit = '48fd09af8759e59be19e3d06ebe18dc4a3521a5f'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$resolvedRootRaw = (& git -C $repoRoot rev-parse --show-toplevel 2>$null).Trim()
if ($LASTEXITCODE -ne 0) { throw 'M0_VERIFY_FAILED: Git root is not GENIAL' }
$resolvedRoot = (Resolve-Path -LiteralPath $resolvedRootRaw).Path
if ($resolvedRoot -ne $repoRoot) { throw 'M0_VERIFY_FAILED: Git root is not GENIAL' }

$resolvedCommit = (& git -C $repoRoot rev-parse "$Commit^{commit}" 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or $resolvedCommit -ne $Commit) {
    throw 'M0_VERIFY_FAILED: historical M0 commit is unavailable or differs'
}

$title = (& git -C $repoRoot show -s --format='%s' $resolvedCommit).Trim()
if ($title -ne 'chore: bootstrap Genial Deep Research governance') {
    throw 'M0_VERIFY_FAILED: historical M0 title differs'
}

$expectedTracked = @(
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
$historicalTracked = @(& git -C $repoRoot -c core.quotepath=false ls-tree -r --name-only $resolvedCommit) | Sort-Object
if (Compare-Object $expectedTracked $historicalTracked) {
    throw 'M0_VERIFY_FAILED: historical M0 inventory differs'
}

foreach ($source in @(
    'epreuve-deep-research.md',
    'AUDIT_FORMEL_MISSION_GENIAL_DEEP_RESEARCH.md',
    'PLAN_ACTION_DETAILLE_GENIAL_DEEP_RESEARCH.md'
)) {
    $historicalBlob = (& git -C $repoRoot rev-parse "${resolvedCommit}:$source").Trim()
    $currentBlob = (& git -C $repoRoot hash-object --no-filters -- $source).Trim()
    if ($historicalBlob -ne $currentBlob) {
        throw "M0_VERIFY_FAILED: historical source differs: $source"
    }
}

Write-Output "M0_HISTORICAL_OK: commit=$resolvedCommit files=$($historicalTracked.Count)"
