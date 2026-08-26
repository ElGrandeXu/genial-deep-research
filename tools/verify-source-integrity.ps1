$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repoRoot 'SOURCE_SHA256SUMS'
$failures = [System.Collections.Generic.List[string]]::new()
$checked = 0

foreach ($line in Get-Content -LiteralPath $manifestPath) {
    if ($line -notmatch '^([0-9a-f]{64}) \*(.+)$') {
        throw 'SOURCE_INTEGRITY_FAILED: malformed manifest entry'
    }

    $expected = $Matches[1]
    $relativePath = $Matches[2]
    $sourcePath = Join-Path $repoRoot $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        $failures.Add("${relativePath}: missing")
        continue
    }

    $actual = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) {
        $failures.Add("${relativePath}: sha256 mismatch")
    }

    & git -C $repoRoot rev-parse --is-inside-work-tree 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $indexBlob = (& git -C $repoRoot rev-parse ":$relativePath" 2>$null).Trim()
        if ($LASTEXITCODE -eq 0) {
            $worktreeBlob = (& git -C $repoRoot hash-object --no-filters -- $relativePath).Trim()
            if ($indexBlob -ne $worktreeBlob) {
                $failures.Add("${relativePath}: Git index bytes differ")
            }
        }
    }
    $checked++
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error "SOURCE_INTEGRITY_FAILED: $_" }
    exit 1
}

Write-Output "SOURCE_INTEGRITY_OK: $checked files"
