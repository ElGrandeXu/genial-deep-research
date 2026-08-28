$ErrorActionPreference = 'Stop'

$secretOutput = @(& pwsh -NoProfile -File (Join-Path $PSScriptRoot 'scan-secrets.ps1') -Mode WorkingTree -ProbeSyntheticSecret 2>&1)
$secretExit = $LASTEXITCODE
if ($secretExit -eq 0 -or ($secretOutput -join "`n") -notmatch 'openai-key') {
    throw 'VERIFIER_NEGATIVE_FAILED: injected secret was not rejected'
}

$contractOutput = @(& pwsh -NoProfile -File (Join-Path $PSScriptRoot 'verify-m2-contract.ps1') 2>&1)
if ($LASTEXITCODE -ne 0 -or
    ($contractOutput -join "`n") -notmatch 'M2_NEGATIVE_MUTATION_REJECTED: missing_evidence' -or
    ($contractOutput -join "`n") -notmatch 'M2_NEGATIVE_MUTATION_REJECTED: current_claim_without_temporal_qualification') {
    throw 'VERIFIER_NEGATIVE_FAILED: invalid fixture or unsupported fact was not rejected'
}

Write-Output 'VERIFIER_NEGATIVE_PATHS_OK: injected_secret, invalid_fixture, fact_without_proof'
