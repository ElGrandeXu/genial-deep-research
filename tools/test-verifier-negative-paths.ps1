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
    $ansiPattern = "$([char]27)\[[0-?]*[ -/]*[@-~]"
    $plainText = [regex]::Replace($text, $ansiPattern, '').Replace('|', ' ')
    $comparableText = [regex]::Replace($plainText, '\s+', ' ').Trim()
    $comparableExpected = [regex]::Replace($ExpectedDiagnostic, '\s+', ' ').Trim()
    if ($verifierExit -eq 0 -or -not $comparableText.Contains($comparableExpected, [StringComparison]::Ordinal)) {
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

    $absoluteBaseManifest = $referenceJson | ConvertFrom-Json -Depth 100
    $syntheticAbsoluteBase = 'C:' + [IO.Path]::DirectorySeparatorChar + 'Users\candidate\project'
    $absoluteBaseManifest | Add-Member -NotePropertyName basePath -NotePropertyValue $syntheticAbsoluteBase
    $absoluteBasePath = Join-Path $script:tempRoot 'absolute-base.json'
    Write-Manifest -Manifest $absoluteBaseManifest -Path $absoluteBasePath
    Assert-VercelManifestRejected -Path $absoluteBasePath -ExpectedDiagnostic 'VERCEL_CONTEXT_VERIFY_FAILED: recorded manifest contains non-portable properties: basePath'

    $directoryManifest = $referenceJson | ConvertFrom-Json -Depth 100
    $directoryManifest.files = @($directoryManifest.files) + [pscustomobject]@{
        path = 'src'
        size = 0
        mode = 16822
    }
    $directoryManifest.fileCount = @($directoryManifest.files).Count
    $directoryPath = Join-Path $script:tempRoot 'directory-entry.json'
    Write-Manifest -Manifest $directoryManifest -Path $directoryPath
    Assert-VercelManifestRejected -Path $directoryPath -ExpectedDiagnostic 'VERCEL_CONTEXT_VERIFY_FAILED: recorded manifest contains non-regular entry: src'

    $backslashManifest = $referenceJson | ConvertFrom-Json -Depth 100
    $backslashManifest.files[0].path = ([string]$backslashManifest.files[0].path).Replace('/', '\')
    $backslashPath = Join-Path $script:tempRoot 'backslash-path.json'
    Write-Manifest -Manifest $backslashManifest -Path $backslashPath
    Assert-VercelManifestRejected -Path $backslashPath -ExpectedDiagnostic 'VERCEL_CONTEXT_VERIFY_FAILED: recorded manifest path must use forward slashes'

    $dotPrefixManifest = $referenceJson | ConvertFrom-Json -Depth 100
    $dotPrefixManifest.files[0].path = './' + [string]$dotPrefixManifest.files[0].path
    $dotPrefixPath = Join-Path $script:tempRoot 'dot-prefix-path.json'
    Write-Manifest -Manifest $dotPrefixManifest -Path $dotPrefixPath
    Assert-VercelManifestRejected -Path $dotPrefixPath -ExpectedDiagnostic 'VERCEL_CONTEXT_VERIFY_FAILED: recorded manifest path is not canonical'

    $doubleSlashManifest = $referenceJson | ConvertFrom-Json -Depth 100
    $doubleSlashManifest.files[0].path = ([string]$doubleSlashManifest.files[0].path).Replace('/', '//')
    $doubleSlashPath = Join-Path $script:tempRoot 'double-slash-path.json'
    Write-Manifest -Manifest $doubleSlashManifest -Path $doubleSlashPath
    Assert-VercelManifestRejected -Path $doubleSlashPath -ExpectedDiagnostic 'VERCEL_CONTEXT_VERIFY_FAILED: recorded manifest path is not canonical'
} finally {
    if (Test-Path -LiteralPath $script:tempRoot -PathType Container) {
        Remove-Item -LiteralPath $script:tempRoot -Recurse -Force
    }
}

Write-Output 'VERIFIER_NEGATIVE_PATHS_OK: injected_secret, invalid_fixture, fact_without_proof, missing_schema, extra_documentation, absolute_base, directory_entry, backslash_path, dot_prefix, double_slash'
