param(
    [switch]$SkipBuild,
    [string]$SkipBuildReason,
    [switch]$Offline
)

$ErrorActionPreference = 'Stop'

if ($SkipBuild -and [string]::IsNullOrWhiteSpace($SkipBuildReason)) {
    throw 'PROJECT_VERIFY_FAILED: -SkipBuild requires -SkipBuildReason'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

$exactReceiptRelativePath = 'docs/evidence/m5-attempt-009-live-result.json'
$exactReceiptSha256 = 'ef74074a5571228303e97ac4b11eb4e7dfd9b49d158342c581c0164e58940b95'
$script:workingTreeExemptionNegativeCount = 0

function Get-TextSha256 {
    param([Parameter(Mandatory)][string]$Text)
    $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($Text)
    try {
        return [Convert]::ToHexString(
            [System.Security.Cryptography.SHA256]::HashData($bytes)
        ).ToLowerInvariant()
    } finally {
        [Array]::Clear($bytes, 0, $bytes.Length)
    }
}

function Get-SecretScanFindings {
    param([Parameter(Mandatory)][string]$Output)
    return @(
        [regex]::Matches(
            $Output,
            'SECRET_SCAN_FINDING:\s*([^\r\n]+?):(\d+):([a-z-]+)'
        ) |
            ForEach-Object {
                '{0}:{1}:{2}' -f
                    $_.Groups[1].Value.Trim().Replace('\', '/'),
                    $_.Groups[2].Value,
                    $_.Groups[3].Value
            }
    )
}

function Test-ExactWorkingTreeReceiptExemption {
    param(
        [Parameter(Mandatory)][string]$RelativePath,
        [Parameter(Mandatory)][string]$EvidenceRaw,
        [Parameter(Mandatory)][int]$ScanExit,
        [Parameter(Mandatory)][AllowEmptyCollection()][string[]]$Findings
    )
    if ($RelativePath.Replace('\', '/') -cne $exactReceiptRelativePath) { return $false }
    if ((Get-TextSha256 -Text $EvidenceRaw) -cne $exactReceiptSha256) { return $false }

    $lines = [regex]::Split($EvidenceRaw, '\r?\n')
    $matchingLines = [System.Collections.Generic.List[int]]::new()
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index].Trim() -ceq '"secret_store": "external_dpapi",') {
            $matchingLines.Add($index + 1)
        }
    }
    if ($matchingLines.Count -ne 1) { return $false }

    $expectedFinding = "${exactReceiptRelativePath}:$($matchingLines[0]):nonempty-secret-assignment"
    return (
        $ScanExit -eq 1 -and
        $Findings.Count -eq 1 -and
        $Findings[0] -ceq $expectedFinding
    )
}

function Assert-WorkingTreeExemptionNegative {
    param([Parameter(Mandatory)][string]$Name, [bool]$Accepted)
    if ($Accepted) {
        throw "PROJECT_VERIFY_FAILED: WorkingTree exemption mutation was accepted: $Name"
    }
    $script:workingTreeExemptionNegativeCount += 1
    Write-Output "WORKINGTREE_EXEMPTION_NEGATIVE_REJECTED: $Name"
}

function Test-WorkingTreeExemptionNegativeMutations {
    $evidencePath = Join-Path $repoRoot $exactReceiptRelativePath
    if (-not (Test-Path -LiteralPath $evidencePath -PathType Leaf)) {
        throw 'PROJECT_VERIFY_FAILED: exact M5 receipt is missing'
    }
    $evidenceRaw = Get-Content -LiteralPath $evidencePath -Raw
    $lines = [regex]::Split($evidenceRaw, '\r?\n')
    $lineNumber = @(
        for ($index = 0; $index -lt $lines.Count; $index++) {
            if ($lines[$index].Trim() -ceq '"secret_store": "external_dpapi",') {
                $index + 1
            }
        }
    )
    if ($lineNumber.Count -ne 1) {
        throw 'PROJECT_VERIFY_FAILED: exact M5 receipt metadata pair differs'
    }
    $expectedFinding = "${exactReceiptRelativePath}:$($lineNumber[0]):nonempty-secret-assignment"

    Assert-WorkingTreeExemptionNegative -Name 'same_pair_other_file' -Accepted (
        Test-ExactWorkingTreeReceiptExemption -RelativePath 'docs/evidence/other.json' -EvidenceRaw $evidenceRaw -ScanExit 1 -Findings @($expectedFinding)
    )
    $otherValue = $evidenceRaw.Replace(
        '"secret_store": "external_dpapi",',
        '"secret_store": "external_other",'
    )
    Assert-WorkingTreeExemptionNegative -Name 'secret_store_other_value' -Accepted (
        Test-ExactWorkingTreeReceiptExemption -RelativePath $exactReceiptRelativePath -EvidenceRaw $otherValue -ScanExit 1 -Findings @($expectedFinding)
    )
    Assert-WorkingTreeExemptionNegative -Name 'receipt_sha_differs' -Accepted (
        Test-ExactWorkingTreeReceiptExemption -RelativePath $exactReceiptRelativePath -EvidenceRaw ($evidenceRaw + ' ') -ScanExit 1 -Findings @($expectedFinding)
    )
    $tokenAdjacent = $evidenceRaw + "`r`n" + ('"to' + 'ken": "' + ('T' * 24) + '"')
    Assert-WorkingTreeExemptionNegative -Name 'token_adjacent' -Accepted (
        Test-ExactWorkingTreeReceiptExemption -RelativePath $exactReceiptRelativePath -EvidenceRaw $tokenAdjacent -ScanExit 1 -Findings @($expectedFinding)
    )
    $keyAdjacent = $evidenceRaw + "`r`n" + ('"api_' + 'key": "' + 'sk-' + ('K' * 24) + '"')
    Assert-WorkingTreeExemptionNegative -Name 'key_adjacent' -Accepted (
        Test-ExactWorkingTreeReceiptExemption -RelativePath $exactReceiptRelativePath -EvidenceRaw $keyAdjacent -ScanExit 1 -Findings @($expectedFinding)
    )
    $bearerAdjacent = $evidenceRaw + "`r`n" + ('"authorization": "' + 'Bear' + 'er ' + ('B' * 24) + '"')
    Assert-WorkingTreeExemptionNegative -Name 'bearer_adjacent' -Accepted (
        Test-ExactWorkingTreeReceiptExemption -RelativePath $exactReceiptRelativePath -EvidenceRaw $bearerAdjacent -ScanExit 1 -Findings @($expectedFinding)
    )
    Assert-WorkingTreeExemptionNegative -Name 'additional_workingtree_occurrence' -Accepted (
        Test-ExactWorkingTreeReceiptExemption -RelativePath $exactReceiptRelativePath -EvidenceRaw $evidenceRaw -ScanExit 1 -Findings @(
            $expectedFinding,
            'docs/evidence/other.json:1:nonempty-secret-assignment'
        )
    )
    if ($script:workingTreeExemptionNegativeCount -ne 7) {
        throw 'PROJECT_VERIFY_FAILED: WorkingTree exemption mutation count differs'
    }
}

function Invoke-WorkingTreeSecretScan {
    $scanPath = Join-Path $PSScriptRoot 'scan-secrets.ps1'
    $scanOutput = (& pwsh -NoProfile -File $scanPath -Mode WorkingTree 2>&1 | Out-String)
    $scanExit = $LASTEXITCODE
    if ($scanExit -eq 0) {
        Write-Output $scanOutput.TrimEnd()
        return
    }

    $evidencePath = Join-Path $repoRoot $exactReceiptRelativePath
    if (Test-Path -LiteralPath $evidencePath -PathType Leaf) {
        $evidenceRaw = Get-Content -LiteralPath $evidencePath -Raw
        $fileHash = (Get-FileHash -LiteralPath $evidencePath -Algorithm SHA256).Hash.ToLowerInvariant()
        $findings = @(Get-SecretScanFindings -Output $scanOutput)
        if (
            $scanOutput -notmatch 'SECRET_SCAN_FAILED:|ParserError|Exception:' -and
            $fileHash -ceq $exactReceiptSha256 -and
            (Test-ExactWorkingTreeReceiptExemption -RelativePath $exactReceiptRelativePath -EvidenceRaw $evidenceRaw -ScanExit $scanExit -Findings $findings)
        ) {
            Write-Output "SECRET_SCAN_EXACT_RECEIPT_EXEMPTION_OK: path=$exactReceiptRelativePath sha256=$exactReceiptSha256"
            return
        }
    }

    Write-Output $scanOutput.TrimEnd()
    exit $scanExit
}

& (Join-Path $PSScriptRoot 'verify-foundation.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& (Join-Path $PSScriptRoot 'verify-m0.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Test-WorkingTreeExemptionNegativeMutations
Invoke-WorkingTreeSecretScan
& (Join-Path $PSScriptRoot 'scan-secrets.ps1') -Mode Staged
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& (Join-Path $PSScriptRoot 'verify-m2-contract.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& (Join-Path $PSScriptRoot 'verify-m3-boundaries.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& (Join-Path $PSScriptRoot 'verify-m5-vertical-slice.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& (Join-Path $PSScriptRoot 'verify-m5-r2a-parser.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& (Join-Path $PSScriptRoot 'verify-m5-r2b-source-pipeline.ps1')
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

& (Join-Path $PSScriptRoot 'verify-deployment.ps1') -OfflineEvidenceOnly:$Offline
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Output "PROJECT_VERIFY_OK: build=$(-not $SkipBuild)"
