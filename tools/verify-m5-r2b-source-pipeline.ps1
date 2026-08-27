$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

function Assert-M5R2B {
    param([bool]$Condition, [string]$Finding)
    if (-not $Condition) { throw "M5_R2B_VERIFY_FAILED: $Finding" }
}

$required = @(
    'src/server/research/errors.ts',
    'src/server/research/provider-metadata.ts',
    'src/server/research/source-security.ts',
    'src/server/research/source-transport.ts',
    'src/server/research/source-content.ts',
    'tests/source-pipeline.test.ts',
    'tests/offline-network-guard.ts',
    'tests/fixtures/m5-r2b-synthetic-provider.json',
    'docs/evidence/M5_R2B_OFFLINE_SOURCE_PIPELINE.md',
    'docs/evidence/m5-r2b-offline-source-pipeline-result.json'
)
foreach ($relativePath in $required) {
    Assert-M5R2B (Test-Path -LiteralPath (Join-Path $repoRoot $relativePath) -PathType Leaf) "missing artifact: $relativePath"
}

$schemaPath = Join-Path $repoRoot 'docs/contracts/research-dossier.schema.json'
$schemaHash = (Get-FileHash -LiteralPath $schemaPath -Algorithm SHA256).Hash.ToLowerInvariant()
Assert-M5R2B ($schemaHash -ceq '1d90f2e7fda8d9893f48ad047cee402e45d54c8647c9376d08c6ea59774dc3d3') 'M2 schema hash changed'
& git diff --quiet -- docs/contracts/research-dossier.schema.json
Assert-M5R2B ($LASTEXITCODE -eq 0) 'M2 schema differs from HEAD'

$package = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
Assert-M5R2B ($package.dependencies.parse5 -ceq '8.0.1') 'parse5 is not the exact direct runtime dependency'

$providerMetadata = Get-Content -LiteralPath (Join-Path $repoRoot 'src/server/research/provider-metadata.ts') -Raw
$security = Get-Content -LiteralPath (Join-Path $repoRoot 'src/server/research/source-security.ts') -Raw
$transport = Get-Content -LiteralPath (Join-Path $repoRoot 'src/server/research/source-transport.ts') -Raw
$content = Get-Content -LiteralPath (Join-Path $repoRoot 'src/server/research/source-content.ts') -Raw
$service = Get-Content -LiteralPath (Join-Path $repoRoot 'src/server/research/service.ts') -Raw
$route = Get-Content -LiteralPath (Join-Path $repoRoot 'src/app/api/research/route.ts') -Raw
$failure = Get-Content -LiteralPath (Join-Path $repoRoot 'src/server/research/failure-receipt.ts') -Raw
$tests = Get-Content -LiteralPath (Join-Path $repoRoot 'tests/source-pipeline.test.ts') -Raw
$guard = Get-Content -LiteralPath (Join-Path $repoRoot 'tests/offline-network-guard.ts') -Raw

Assert-M5R2B ($providerMetadata -match 'OpenaiResponsesTextProviderMetadata') 'installed public OpenAI metadata type is not used'
Assert-M5R2B ($providerMetadata -match 'url_citation' -and $providerMetadata -match 'generatedTextStart' -and $providerMetadata -match 'provider_citation_unbound') 'citation binding is incomplete'
Assert-M5R2B ($security -match 'validateCitationAndStructuredUrl' -and $security -match 'resolveAndPinPublicAddress') 'URL or DNS boundary is not wired'
Assert-M5R2B ($security -match 'utm_' -and $security -match 'gclid' -and $security -match 'fbclid') 'tracking policy is absent'
Assert-M5R2B ($transport -match 'from "node:https"' -and $transport -notmatch 'node:internal') 'transport does not use only public Node HTTPS primitives'
Assert-M5R2B ($transport -match 'lookup' -and $transport -match 'servername' -and $transport -match 'Accept-Encoding') 'DNS pinning or HTTPS identity controls are absent'
Assert-M5R2B ($transport -match 'SOURCE_MAX_BYTES = 512 \* 1024' -and $transport -match 'SOURCE_MAX_REDIRECTS = 2') 'transport limits differ'
Assert-M5R2B ($content -match 'from "parse5"' -and $content -notmatch 'parse5/') 'parse5 public import is not exclusive'
Assert-M5R2B ($content -match 'normalizedTextSha256' -and $content -match 'occurrenceIndex' -and $content -match 'SOURCE_CONTEXT_MAX_CHARACTERS = 16') 'locator contract is incomplete'
Assert-M5R2B ($route -match 'createProductionSourceTransportDependencies' -and $route -match 'createSourceVerifier') 'production route is not wired'
Assert-M5R2B ($service -match 'sourceVerifier\.verify' -and $service -match '"source_verifying"' -and $service -match 'proof\.verifiedExcerpt') 'integrated source gate is absent'

$requiredCodes = @(
    'provider_citation_missing', 'provider_citation_unbound', 'provider_source_url_missing',
    'source_url_rejected', 'source_dns_rejected', 'source_redirect_rejected', 'source_timeout',
    'source_transport_error', 'source_body_too_large', 'source_content_type_rejected',
    'source_http_error', 'source_charset_rejected', 'source_empty', 'source_parse_failed',
    'source_excerpt_missing', 'source_excerpt_ambiguous', 'source_metadata_missing'
)
$combined = $providerMetadata + $security + $transport + $content + $failure
foreach ($code in $requiredCodes) {
    Assert-M5R2B ($combined.Contains($code)) "safe error code missing: $code"
}

$numbers = [regex]::Matches($tests, 'it\("\[(\d+)\]') | ForEach-Object { [int]$_.Groups[1].Value }
Assert-M5R2B ($numbers.Count -eq 80) "numbered synthetic tests differ: $($numbers.Count)"
Assert-M5R2B (-not (Compare-Object @(1..80) @($numbers) -SyncWindow 0)) 'numbered synthetic tests are not exactly 1..80'
Assert-M5R2B ($guard -match 'REAL_NETWORK_GUARD' -and $guard -match 'getNodeDnsResolutionCount' -and $guard -match 'getNodeHttpsRequestCount') 'offline network guard is absent'

$fixture = Get-Content -LiteralPath (Join-Path $repoRoot 'tests/fixtures/m5-r2b-synthetic-provider.json') -Raw | ConvertFrom-Json
Assert-M5R2B ($fixture.marker -ceq 'M5_R2B_SYNTHETIC_FIXTURE_NOT_PROVIDER_OUTPUT') 'synthetic fixture marker differs'

& corepack pnpm exec vitest run tests/source-pipeline.test.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Output 'M5_R2B_SOURCE_PIPELINE_VERIFY_OK: tests=80 provider_metadata=typed dns_pinning=simulated network=0 schema_m2=unchanged'
