param(
    [ValidateSet('Staged', 'Tracked', 'WorkingTree')]
    [string]$Mode = 'Staged',
    [switch]$ProbeSyntheticSecret
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$gitRootRaw = (& git -C $repoRoot rev-parse --show-toplevel 2>$null).Trim()
if ($LASTEXITCODE -ne 0) {
    throw 'SECRET_SCAN_FAILED: unexpected Git root'
}
$gitRoot = (Resolve-Path -LiteralPath $gitRootRaw).Path
if ($gitRoot -ne $repoRoot) { throw 'SECRET_SCAN_FAILED: unexpected Git root' }

if ($ProbeSyntheticSecret) {
    $files = @('__synthetic_secret_probe__')
} elseif ($Mode -eq 'Staged') {
    $files = @(& git -C $repoRoot -c core.quotepath=false diff --cached --name-only --diff-filter=ACMR)
} elseif ($Mode -eq 'Tracked') {
    $files = @(& git -C $repoRoot -c core.quotepath=false ls-files)
} else {
    $files = @(& git -C $repoRoot -c core.quotepath=false ls-files --cached --others --exclude-standard)
}

$rules = @(
    @{ Name = 'openai-key'; Pattern = 'sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}' },
    @{ Name = 'google-api-key'; Pattern = 'AIza[0-9A-Za-z_-]{20,}' },
    @{ Name = 'aws-access-key'; Pattern = '(?:AKIA|ASIA)[A-Z0-9]{16}' },
    @{ Name = 'private-key'; Pattern = '-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----' },
    @{ Name = 'nonempty-secret-assignment'; Pattern = '(?i)^\s*(?:(?:const|let|var|export)\s+)?[\$"'']?[A-Z0-9_.-]*(?:api[_-]?key|secret|token|password|credentials?)[A-Z0-9_.-]*["'']?\s*[:=]\s*(?:"[^"\r\n]{8,}"|''[^''\r\n]{8,}''|[A-Za-z0-9_./+=-]{8,})\s*[,;]?\s*$' }
)

$findings = [System.Collections.Generic.List[string]]::new()
$excludedInputs = @(
    'PASSATION_CHATGPT_GENIAL_2026-08-26.md',
    'PASSATION_MIGRATION_TOUR_GENIAL_2026-08-26.md'
)
$knownNonSecretAssignments = @{
    'docs/evidence/m5-attempt-009-live-result.json' = @(
        '  "secret_store": "external_dpapi",'
    )
    'src/server/research/service.ts' = @(
        '  const inputTokens = options.result.usage.inputTokens;',
        '  const outputTokens = options.result.usage.outputTokens;',
        '  const totalTokens = options.result.usage.totalTokens;',
        '        inputTokens: receipt.inputTokens,',
        '        cachedInputTokens: receipt.cachedInputTokens,',
        '        outputTokens: receipt.outputTokens,',
        '        reasoningTokens: receipt.reasoningTokens,',
        '        totalTokens: receipt.totalTokens,'
    )
}
foreach ($relativePath in $files) {
    if ([string]::IsNullOrWhiteSpace($relativePath)) { continue }
    if ($relativePath -in $excludedInputs) {
        $findings.Add("${relativePath}:0:excluded-input")
        continue
    }

    if ($ProbeSyntheticSecret -and $relativePath -eq '__synthetic_secret_probe__') {
        $lines = @('sk-' + (('A' * 24) -join ''))
    } elseif ($Mode -eq 'Staged') {
        $lines = @(& git -C $repoRoot show ":$relativePath" 2>$null)
        if ($LASTEXITCODE -ne 0) { throw "SECRET_SCAN_FAILED: cannot read staged path $relativePath" }
    } else {
        $fullPath = Join-Path $repoRoot $relativePath
        if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) { continue }
        $lines = @(Get-Content -LiteralPath $fullPath -ErrorAction Stop)
    }

    for ($index = 0; $index -lt $lines.Count; $index++) {
        foreach ($rule in $rules) {
            if ($lines[$index] -match $rule.Pattern) {
                $allowedLines = $knownNonSecretAssignments[$relativePath]
                if ($null -ne $allowedLines -and $lines[$index] -cin $allowedLines) { continue }
                $findings.Add("${relativePath}:$($index + 1):$($rule.Name)")
            }
        }
    }
}

if ($findings.Count -gt 0) {
    $findings | Sort-Object -Unique | ForEach-Object { Write-Error "SECRET_SCAN_FINDING: $_" }
    exit 1
}

Write-Output "SECRET_SCAN_OK: mode=$Mode files=$($files.Count)"
