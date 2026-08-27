param(
    [string]$Commit = '9f3b92834918fe8c3182d7e51d26e33752a5340a'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$resolvedCommit = (& git -C $repoRoot rev-parse "$Commit^{commit}" 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or $resolvedCommit -ne $Commit) {
    throw 'M3_BOUNDARY_FAILED: historical M3 commit is unavailable or differs'
}

$title = (& git -C $repoRoot show -s --format='%s' $Commit).Trim()
if ($title -ne 'feat: establish application architecture baseline') {
    throw 'M3_BOUNDARY_FAILED: historical M3 title differs'
}

$historicalFiles = @(& git -C $repoRoot -c core.quotepath=false ls-tree -r --name-only $Commit)
if ('src/app/api/research/route.ts' -in $historicalFiles) {
    throw 'M3_BOUNDARY_FAILED: historical M3 unexpectedly contains a research route'
}

$historicalSources = @($historicalFiles | Where-Object { $_ -match '^src/.+\.(?:ts|tsx|js|jsx)$' })
foreach ($path in $historicalSources) {
    $content = & git -C $repoRoot show "${Commit}:$path"
    if ($content -match '\b(?:generateText|streamText)\s*\(' -or
        $content -match '\.tools\.(?:webSearch|googleSearch)\s*\(') {
        throw "M3_BOUNDARY_FAILED: historical provider execution found: $path"
    }
}

$package = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
if ($package.dependencies.PSObject.Properties.Name -contains '@ai-sdk/gateway') {
    throw 'M3_BOUNDARY_FAILED: AI Gateway dependency is forbidden'
}

Write-Output "M3_HISTORICAL_BOUNDARY_OK: commit=$Commit no provider execution, gateway, or research route"
