$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
Set-Location -LiteralPath $repoRoot

function Write-Manifest {
    param(
        [Parameter(Mandatory)][object]$Manifest,
        [Parameter(Mandatory)][string]$Path
    )

    $json = $Manifest | ConvertTo-Json -Depth 100
    [IO.File]::WriteAllText($Path, $json, [Text.UTF8Encoding]::new($false))
}

function Assert-VercelManifestRejected {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$ExpectedDiagnostic
    )

    $output = @(& pwsh -NoProfile -File (Join-Path $PSScriptRoot 'verify-vercel-context.ps1') -ManifestPath $Path 2>&1)
    $verifierExit = $LASTEXITCODE
    $text = $output -join "`n"
    if ($verifierExit -eq 0 -or -not $text.Contains($ExpectedDiagnostic, [StringComparison]::Ordinal)) {
        throw "VERIFIER_NEGATIVE_FAILED: Vercel manifest was not rejected as expected: $ExpectedDiagnostic"
    }
}

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

$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$script:tempRoot = [IO.Path]::GetFullPath((Join-Path $tempBase "genial-vercel-regression-$([guid]::NewGuid().ToString('N'))"))
if (-not $script:tempRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'VERIFIER_NEGATIVE_FAILED: temporary manifest path escaped the system temp directory'
}
[IO.Directory]::CreateDirectory($script:tempRoot) | Out-Null
try {
    $referenceManifestPath = Join-Path $repoRoot 'tests\fixtures\vercel-context-manifest.json'
    try {
        $referenceJson = [IO.File]::ReadAllText($referenceManifestPath)
        $referenceManifest = $referenceJson | ConvertFrom-Json -Depth 100
    } catch {
        throw "VERIFIER_NEGATIVE_FAILED: reference Vercel manifest is unavailable or invalid: $($_.Exception.Message)"
    }

    $validManifestPath = Join-Path $script:tempRoot 'valid.json'
    [IO.File]::WriteAllText($validManifestPath, $referenceJson, [Text.UTF8Encoding]::new($false))
    $validOutput = @(& pwsh -NoProfile -File (Join-Path $PSScriptRoot 'verify-vercel-context.ps1') -ManifestPath $validManifestPath 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "VERIFIER_NEGATIVE_FAILED: reference manifest did not pass recorded verification: $($validOutput -join "`n")"
    }

    $schemaPath = 'docs/contracts/research-dossier.schema.json'
    $missingSchemaManifest = $referenceJson | ConvertFrom-Json -Depth 100
    $missingSchemaManifest.files = @($missingSchemaManifest.files | Where-Object { ([string]$_.path).Replace('\', '/') -ne $schemaPath })
    $missingSchemaManifest.fileCount = @($missingSchemaManifest.files).Count
    $missingSchemaManifest.totalSize = [int64](($missingSchemaManifest.files | Measure-Object -Property size -Sum).Sum)
    $missingSchemaPath = Join-Path $script:tempRoot 'missing-schema.json'
    Write-Manifest -Manifest $missingSchemaManifest -Path $missingSchemaPath
    Assert-VercelManifestRejected -Path $missingSchemaPath -ExpectedDiagnostic "VERCEL_CONTEXT_VERIFY_FAILED: missing paths: $schemaPath"

    $documentationPath = 'docs/ARCHITECTURE.md'
    $documentationFile = Get-Item -LiteralPath (Join-Path $repoRoot $documentationPath)
    $extraDocumentationManifest = $referenceJson | ConvertFrom-Json -Depth 100
    $extraDocumentationManifest.files = @($extraDocumentationManifest.files) + [pscustomobject]@{
        path = $documentationPath
        size = [int64]$documentationFile.Length
        mode = 33188
    }
    $extraDocumentationManifest.fileCount = @($extraDocumentationManifest.files).Count
    $extraDocumentationManifest.totalSize = [int64](($extraDocumentationManifest.files | Measure-Object -Property size -Sum).Sum)
    $extraDocumentationPath = Join-Path $script:tempRoot 'extra-documentation.json'
    Write-Manifest -Manifest $extraDocumentationManifest -Path $extraDocumentationPath
    Assert-VercelManifestRejected -Path $extraDocumentationPath -ExpectedDiagnostic "VERCEL_CONTEXT_VERIFY_FAILED: unexpected paths: $documentationPath"
} finally {
    if (Test-Path -LiteralPath $script:tempRoot -PathType Container) {
        Remove-Item -LiteralPath $script:tempRoot -Recurse -Force
    }
}

Write-Output 'VERIFIER_NEGATIVE_PATHS_OK: injected_secret, invalid_fixture, fact_without_proof, missing_schema, extra_documentation'
