$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$staticRoot = Join-Path $repoRoot '.next\static'
if (-not (Test-Path -LiteralPath $staticRoot -PathType Container)) {
    throw 'CLIENT_BUNDLE_VERIFY_FAILED: production client bundle is missing'
}

$rules = @(
    @{ Name = 'openai-secret-name'; Pattern = 'OPENAI_API_KEY' },
    @{ Name = 'gemini-secret-name'; Pattern = 'GEMINI_API_KEY' },
    @{ Name = 'public-provider-secret'; Pattern = 'NEXT_PUBLIC_(?:OPENAI|GEMINI)' },
    @{ Name = 'openai-provider-endpoint'; Pattern = 'api\.openai\.com' },
    @{ Name = 'google-provider-endpoint'; Pattern = 'generativelanguage\.googleapis\.com' },
    @{ Name = 'openai-key-shape'; Pattern = 'sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}' },
    @{ Name = 'google-key-shape'; Pattern = 'AIza[0-9A-Za-z_-]{20,}' }
)
$findings = [System.Collections.Generic.List[string]]::new()
$files = @(Get-ChildItem -LiteralPath $staticRoot -Recurse -File | Where-Object { $_.Extension -in @('.js', '.css', '.map', '.json') })
foreach ($file in $files) {
    $content = Get-Content -LiteralPath $file.FullName -Raw
    foreach ($rule in $rules) {
        if ($content -match $rule.Pattern) {
            $relative = [System.IO.Path]::GetRelativePath($repoRoot, $file.FullName)
            $findings.Add("${relative}:$($rule.Name)")
        }
    }
}

if ($findings.Count -gt 0) {
    $findings | Sort-Object -Unique | ForEach-Object { Write-Error "CLIENT_BUNDLE_FINDING: $_" }
    exit 1
}

Write-Output "CLIENT_BUNDLE_OK: files=$($files.Count)"
