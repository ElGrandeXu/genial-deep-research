$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
Set-Location -LiteralPath $repoRoot

function Assert-Candidate {
    param([bool]$Condition, [string]$Finding)
    if (-not $Condition) { throw "CANDIDATE_REPOSITORY_VERIFY_FAILED: $Finding" }
}

$requiredFiles = @(
    'README.md',
    '.env.example',
    '.gitattributes',
    '.gitignore',
    '.nvmrc',
    '.vercelignore',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'next.config.ts',
    'tsconfig.json',
    'docs/NOTE_ARBITRAGE_FINALE.md',
    'docs/NOTE_ARBITRAGE_FINALE.html',
    'docs/NOTE_ARBITRAGE_FINALE.pdf',
    'docs/contracts/research-dossier.schema.json',
    'docs/evidence/final-2026-08-28/LIVE_BENCH_FINAL.md',
    'docs/evidence/final-2026-08-28/PRODUCTION_VALIDATION_FINAL.md',
    'docs/evidence/final-2026-08-28/WAF_VALIDATION.md'
)
foreach ($relativePath in $requiredFiles) {
    Assert-Candidate (Test-Path -LiteralPath (Join-Path $repoRoot $relativePath) -PathType Leaf) "required file missing: $relativePath"
}

$forbiddenPaths = @(
    '.githooks',
    'docs/evidence/audit-01-upgrade',
    'docs/evidence/release',
    'docs/captures/release',
    'docs/NOTE_ARBITRAGE_RELEASE_CANDIDATE.md',
    'docs/RESULTATS_CAS_EPREUVE_RELEASE_CANDIDATE.md',
    'docs/evidence/final-2026-08-28/GATE_MATRIX_G0_G12.md',
    'docs/evidence/final-2026-08-28/REAUDIT_FINAL.md',
    'tools/probes'
)
foreach ($relativePath in $forbiddenPaths) {
    Assert-Candidate (-not (Test-Path -LiteralPath (Join-Path $repoRoot $relativePath))) "archived path remains: $relativePath"
}

$candidateFiles = @(
    & git -C $repoRoot -c core.quotepath=false ls-files --cached --others --exclude-standard |
        Where-Object {
            -not [string]::IsNullOrWhiteSpace($_) -and
            (Test-Path -LiteralPath (Join-Path $repoRoot $_) -PathType Leaf)
        } |
        Sort-Object -Unique
)
Assert-Candidate ($LASTEXITCODE -eq 0) 'cannot enumerate candidate files'

$portableTextExtensions = @('.md', '.html', '.ps1', '.mjs', '.ts', '.tsx', '.json', '.yaml', '.yml')
$absoluteWindowsPattern = '(?i)[A-Z]:\\Users\\'
$controlWorkspacePattern = 'EGX' + '_settings'
$archiveNamePattern = 'GENIAL' + '_ARCHIVE_INTERNAL'
foreach ($relativePath in $candidateFiles) {
    if ([IO.Path]::GetExtension($relativePath) -notin $portableTextExtensions) { continue }
    $content = Get-Content -LiteralPath (Join-Path $repoRoot $relativePath) -Raw
    Assert-Candidate ($content -notmatch $absoluteWindowsPattern) "absolute Windows path: $relativePath"
    Assert-Candidate (-not $content.Contains($controlWorkspacePattern, [StringComparison]::OrdinalIgnoreCase)) "external control workspace dependency: $relativePath"
    Assert-Candidate (-not $content.Contains($archiveNamePattern, [StringComparison]::OrdinalIgnoreCase)) "external archive dependency: $relativePath"
}

$candidateNarratives = @(
    'README.md',
    'docs/NOTE_ARBITRAGE_FINALE.md',
    'docs/NOTE_ARBITRAGE_FINALE.html',
    'docs/evidence/final-2026-08-28/LIVE_BENCH_FINAL.md'
)
$obsoleteStatusPattern = '(?i)BLOCKED\s*(?:—|-)\s*G11|jamais\s+SUCCESS|r[eé]audit\s+(?:atteint\s+)?92/100|score\s+92/100|12\s+PASS\s*,\s*1\s+FAIL|\*\*G11\s+FAIL\*\*'
foreach ($relativePath in $candidateNarratives) {
    $content = Get-Content -LiteralPath (Join-Path $repoRoot $relativePath) -Raw
    Assert-Candidate ($content -notmatch $obsoleteStatusPattern) "obsolete internal status: $relativePath"
}

$receiptHashes = [ordered]@{
    'docs/evidence/final-2026-08-28/live/01-genial.json' = 'a3b65d648b35de9d580c89c6d2885e820d8d22a88cbc086ac002204b253c33af'
    'docs/evidence/final-2026-08-28/live/02-thomas-martin.json' = 'ebdf46d9af1457a7ab68a1bd26e93f079951fd05a51d7d1b647233a04fd569c4'
    'docs/evidence/final-2026-08-28/live/03-airbus-sas.json' = 'b05afe13d3ef0c82c341024ec1c15c10783b36efc0fe053aec46865cff2ba53c'
    'docs/evidence/final-2026-08-28/live/04-silence.json' = '8d551410d22c53246c9e01dddc7cd64bb3be52746f4159055876c1b7974bdb17'
    'docs/evidence/final-2026-08-28/live/05-holdout-google-ireland-limited.json' = '3de8ca774fd8ab757effbdda5f6c93f2ee0cb0a1e9ee139f0e0e33cbdabde7a6'
}
foreach ($relativePath in $receiptHashes.Keys) {
    $fullPath = Join-Path $repoRoot $relativePath
    Assert-Candidate (Test-Path -LiteralPath $fullPath -PathType Leaf) "final receipt missing: $relativePath"
    $actualHash = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Assert-Candidate ($actualHash -eq $receiptHashes[$relativePath]) "final receipt changed: $relativePath"
}
Write-Output "FINAL_RECEIPTS_OK: count=$($receiptHashes.Count)"

$brokenLinks = [System.Collections.Generic.List[string]]::new()
$markdownFiles = @($candidateFiles | Where-Object { [IO.Path]::GetExtension($_) -eq '.md' })
foreach ($relativePath in $markdownFiles) {
    $fullPath = Join-Path $repoRoot $relativePath
    $content = Get-Content -LiteralPath $fullPath -Raw
    $matches = [regex]::Matches($content, '!\?\[[^\]]*\]\((?<target><[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)'.Replace('!\?', '!?'))
    foreach ($match in $matches) {
        $target = $match.Groups['target'].Value.Trim('<', '>')
        if ([string]::IsNullOrWhiteSpace($target) -or $target.StartsWith('#') -or $target -match '^[A-Za-z][A-Za-z0-9+.-]*:') { continue }
        $pathOnly = ($target -split '[?#]', 2)[0]
        if ([string]::IsNullOrWhiteSpace($pathOnly)) { continue }
        $decoded = [uri]::UnescapeDataString($pathOnly)
        $resolved = [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $fullPath) $decoded))
        if (-not $resolved.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $resolved)) {
            $brokenLinks.Add("$relativePath -> $target")
        }
    }
}
Assert-Candidate ($brokenLinks.Count -eq 0) ("broken Markdown links: " + ($brokenLinks -join '; '))
Write-Output "MARKDOWN_LINKS_OK: files=$($markdownFiles.Count)"

$pdfPath = Join-Path $repoRoot 'docs/NOTE_ARBITRAGE_FINALE.pdf'
$pdfBytes = [IO.File]::ReadAllBytes($pdfPath)
Assert-Candidate ($pdfBytes.Length -gt 50000) 'final PDF is unexpectedly small'
$pdfHeader = [Text.Encoding]::ASCII.GetString($pdfBytes, 0, [Math]::Min(8, $pdfBytes.Length))
Assert-Candidate ($pdfHeader.StartsWith('%PDF-')) 'final PDF header is invalid'
$pdfAscii = [Text.Encoding]::ASCII.GetString($pdfBytes)
$pdfPages = [regex]::Matches($pdfAscii, '/Type\s*/Page(?!s)\b').Count
Assert-Candidate ($pdfPages -ge 2 -and $pdfPages -le 4) "final PDF page count outside 2-4: $pdfPages"
Write-Output "PDF_STRUCTURE_OK: pages=$pdfPages bytes=$($pdfBytes.Length)"

$vercelVerifier = Join-Path $PSScriptRoot 'verify-vercel-context.ps1'
Assert-Candidate (Test-Path -LiteralPath $vercelVerifier -PathType Leaf) 'Vercel context verifier missing'
& pwsh -NoProfile -File $vercelVerifier
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output "CANDIDATE_REPOSITORY_OK: files=$($candidateFiles.Count)"
