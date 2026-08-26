param(
    [uri]$CanonicalUrl = 'https://genial-deep-research.vercel.app',
    [uri]$ImmutableUrl = 'https://genial-deep-research-9fox16480-el-grande-xue.vercel.app'
)

$ErrorActionPreference = 'Stop'

function Assert-M4 {
    param(
        [bool]$Condition,
        [string]$Finding
    )

    if (-not $Condition) {
        throw "M4_DEPLOYMENT_VERIFY_FAILED: $Finding"
    }
}

function Get-PublicResource {
    param(
        [System.Net.Http.HttpClient]$Client,
        [uri]$Origin,
        [string]$Path
    )

    $uri = [uri]::new($Origin, $Path)
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    $response = $Client.GetAsync($uri).GetAwaiter().GetResult()
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $timer.Stop()

    [pscustomobject]@{
        Path = $Path
        Status = [int]$response.StatusCode
        ContentType = [string]$response.Content.Headers.ContentType
        Redirect = $null -ne $response.Headers.Location
        LatencyMs = [math]::Round($timer.Elapsed.TotalMilliseconds, 2)
        Body = $body
    }
}

Assert-M4 ($CanonicalUrl.Scheme -eq 'https') 'canonical URL is not HTTPS'
Assert-M4 ($ImmutableUrl.Scheme -eq 'https') 'immutable URL is not HTTPS'
Assert-M4 (@([System.Net.Dns]::GetHostAddresses($CanonicalUrl.Host)).Count -gt 0) 'canonical hostname does not resolve'

$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
$client = [System.Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(30)
$client.DefaultRequestHeaders.UserAgent.ParseAdd('GENIAL-M4-Public-Verification/1.0')

try {
    $root = Get-PublicResource -Client $client -Origin $CanonicalUrl -Path '/'
    $health = Get-PublicResource -Client $client -Origin $CanonicalUrl -Path '/api/health'
    $immutableRoot = Get-PublicResource -Client $client -Origin $ImmutableUrl -Path '/'

    Assert-M4 ($root.Status -eq 200 -and -not $root.Redirect) 'canonical root is not directly public with HTTP 200'
    Assert-M4 ($root.ContentType.StartsWith('text/html', [System.StringComparison]::OrdinalIgnoreCase)) 'canonical root content type is not HTML'
    Assert-M4 ($root.Body -match 'Baseline technique' -and $root.Body -match 'Aucune recherche métier') 'canonical root does not state the product boundary honestly'
    Assert-M4 ($health.Status -eq 200 -and -not $health.Redirect) 'health route is not directly public with HTTP 200'
    Assert-M4 ($health.ContentType.StartsWith('application/json', [System.StringComparison]::OrdinalIgnoreCase)) 'health route content type is not JSON'
    Assert-M4 ($immutableRoot.Status -eq 200 -and -not $immutableRoot.Redirect) 'immutable production URL is not directly public'

    $healthJson = $health.Body | ConvertFrom-Json
    Assert-M4 (@($healthJson.PSObject.Properties.Name).Count -eq 1 -and [string]$healthJson.status -eq 'ok') 'health JSON differs from {"status":"ok"}'

    $leakPaths = @(
        '/.env',
        '/.env.local',
        '/.git/config',
        '/SOURCE_SHA256SUMS',
        '/epreuve-deep-research.md',
        '/AUDIT_FORMEL_MISSION_GENIAL_DEEP_RESEARCH.md',
        '/PLAN_ACTION_DETAILLE_GENIAL_DEEP_RESEARCH.md',
        '/PASSATION_CHATGPT_GENIAL_2026-08-26.md',
        '/PASSATION_MIGRATION_TOUR_GENIAL_2026-08-26.md'
    )
    $leakResults = @($leakPaths | ForEach-Object {
        Get-PublicResource -Client $client -Origin $CanonicalUrl -Path $_
    })
    foreach ($result in $leakResults) {
        Assert-M4 ($result.Status -eq 404 -and -not $result.Redirect) "disclosure path is accessible or redirects: $($result.Path)"
    }

    $assetPaths = @(
        [regex]::Matches($root.Body, '(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"') |
            ForEach-Object { [System.Net.WebUtility]::HtmlDecode($_.Groups[1].Value) } |
            Sort-Object -Unique
    )
    $assets = @()
    foreach ($assetPath in $assetPaths) {
        $assetUri = [uri]::new($CanonicalUrl, $assetPath)
        Assert-M4 ($assetUri.Host -eq $CanonicalUrl.Host) "external asset found: $assetPath"
        $asset = Get-PublicResource -Client $client -Origin $CanonicalUrl -Path $assetPath
        Assert-M4 ($asset.Status -eq 200) "public asset does not return HTTP 200: $assetPath"
        $assets += $asset
    }

    $publicText = $root.Body + "`n" + ($assets.Body -join "`n")
    $rules = [ordered]@{
        provider_variable_name = '(?i)OPENAI_API_KEY|GEMINI_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY|AI_GATEWAY_API_KEY'
        openai_key_shape = 'sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}'
        google_key_shape = 'AIza[0-9A-Za-z_-]{20,}'
        provider_endpoint = 'api\.openai\.com|generativelanguage\.googleapis\.com'
        passation_name = 'PASSATION_(?:CHATGPT_GENIAL|MIGRATION_TOUR_GENIAL)_2026-08-26'
        authority_name = 'epreuve-deep-research|AUDIT_FORMEL_MISSION_GENIAL_DEEP_RESEARCH|PLAN_ACTION_DETAILLE_GENIAL_DEEP_RESEARCH|SOURCE_SHA256SUMS'
        authority_hash = '4bc823833f1c943059c5a9746837dcc75592b31b5ca130143b583323336388e1|691622c46b7df65bda9649bf6aae64f4b764e0bc5c17f2d44cd77505beba0e17|c67b75a058c579cca766c4c3d6cf65b700104d9956b7d01f586506547757270b'
        windows_path = '(?i)[A-Z]:\\Users\\'
        sensitive_vercel_id = '(?i)\b(?:prj|team)_[A-Za-z0-9]{8,}\b'
        vercel_auth_marker = '(?i)VERCEL_OIDC_TOKEN|x-vercel-protection-bypass|authorization\s*[:=]'
    }
    foreach ($rule in $rules.GetEnumerator()) {
        Assert-M4 ($publicText -notmatch $rule.Value) "public bundle finding: $($rule.Key)"
    }

    $repoRoot = Split-Path -Parent $PSScriptRoot
    foreach ($source in @(
        'epreuve-deep-research.md',
        'AUDIT_FORMEL_MISSION_GENIAL_DEEP_RESEARCH.md',
        'PLAN_ACTION_DETAILLE_GENIAL_DEEP_RESEARCH.md'
    )) {
        foreach ($line in Get-Content -LiteralPath (Join-Path $repoRoot $source)) {
            $sample = $line.Trim()
            if ($sample.Length -ge 120) {
                Assert-M4 (-not $publicText.Contains($sample, [System.StringComparison]::Ordinal)) "raw authority excerpt found in public bundle: $source"
            }
        }
    }

    [pscustomobject]@{
        canonical_url = $CanonicalUrl.AbsoluteUri.TrimEnd('/')
        immutable_url = $ImmutableUrl.AbsoluteUri.TrimEnd('/')
        root_status = $root.Status
        health_status = $health.Status
        root_latency_ms = $root.LatencyMs
        health_latency_ms = $health.LatencyMs
        assets_checked = $assets.Count
        disclosure_paths_checked = $leakResults.Count
    } | ConvertTo-Json -Compress | Write-Output
    Write-Output 'M4_DEPLOYMENT_VERIFY_OK: public, health, disclosure paths, bundles'
} finally {
    $client.Dispose()
    $handler.Dispose()
}
