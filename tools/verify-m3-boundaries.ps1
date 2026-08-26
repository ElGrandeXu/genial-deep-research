$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $repoRoot 'src'
$package = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json

if ($package.dependencies.PSObject.Properties.Name -contains '@ai-sdk/gateway') {
    throw 'M3_BOUNDARY_FAILED: AI Gateway dependency is forbidden'
}

$envTemplate = @(Get-Content -LiteralPath (Join-Path $repoRoot '.env.example'))
if ($envTemplate.Count -ne 2 -or
    $envTemplate[0] -ne 'OPENAI_API_KEY=' -or
    $envTemplate[1] -ne 'GEMINI_API_KEY=') {
    throw 'M3_BOUNDARY_FAILED: .env.example must contain only the two empty provider variables'
}

$sourceFiles = @(Get-ChildItem -LiteralPath $sourceRoot -Recurse -File | Where-Object { $_.Extension -in @('.ts', '.tsx', '.js', '.jsx') })
foreach ($file in $sourceFiles) {
    $content = Get-Content -LiteralPath $file.FullName -Raw
    if ($content -match 'NEXT_PUBLIC_(?:OPENAI|GEMINI)' -or
        $content -match 'https://(?:api\.openai\.com|generativelanguage\.googleapis\.com)' -or
        $content -match '\b(?:generateText|streamText)\s*\(' -or
        $content -match '\.tools\.(?:webSearch|googleSearch)\s*\(') {
        throw "M3_BOUNDARY_FAILED: provider execution or public secret path found: $($file.FullName)"
    }
}

$researchRoute = Join-Path $sourceRoot 'app\api\research'
if (Test-Path -LiteralPath $researchRoute) {
    throw 'M3_BOUNDARY_FAILED: a research route exists during M3'
}

Write-Output 'M3_BOUNDARY_OK: server-only secrets, no gateway, no provider call, no research route'
