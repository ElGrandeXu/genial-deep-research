param(
    [Parameter(Mandatory = $true)]
    [uri]$BaseUrl
)

$ErrorActionPreference = 'Stop'

function Assert-Release {
    param([bool]$Condition, [string]$Finding)
    if (-not $Condition) { throw "RELEASE_DEPLOYMENT_VERIFY_FAILED: $Finding" }
}

function Get-Header {
    param([hashtable]$Headers, [string]$Name)
    $match = $Headers.Keys | Where-Object { $_ -ieq $Name } | Select-Object -First 1
    if ($null -eq $match) { return '' }
    return [string]$Headers[$match]
}

$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
$client = [System.Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(30)
$client.DefaultRequestHeaders.UserAgent.ParseAdd('GENIAL-Release-Verification/1.0')

function Invoke-ReleaseRequest {
    param(
        [string]$Method,
        [string]$Path,
        [AllowNull()][string]$Body = $null,
        [AllowNull()][string]$ContentType = $null,
        [hashtable]$Headers = @{}
    )
    $request = [System.Net.Http.HttpRequestMessage]::new(
        [System.Net.Http.HttpMethod]::new($Method),
        [uri]::new($BaseUrl, $Path)
    )
    foreach ($entry in $Headers.GetEnumerator()) {
        [void]$request.Headers.TryAddWithoutValidation($entry.Key, [string]$entry.Value)
    }
    if ($null -ne $Body) {
        $mediaType = if ([string]::IsNullOrWhiteSpace($ContentType)) { 'text/plain' } else { $ContentType }
        $request.Content = [System.Net.Http.StringContent]::new(
            $Body,
            [System.Text.Encoding]::UTF8,
            $mediaType
        )
    }
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    $response = $client.Send($request)
    $responseBody = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $timer.Stop()
    $responseHeaders = @{}
    foreach ($header in $response.Headers) {
        $responseHeaders[$header.Key] = $header.Value -join ', '
    }
    foreach ($header in $response.Content.Headers) {
        $responseHeaders[$header.Key] = $header.Value -join ', '
    }
    $result = [pscustomobject]@{
        Path = $Path
        Status = [int]$response.StatusCode
        Headers = $responseHeaders
        Body = $responseBody
        LatencyMs = [math]::Round($timer.Elapsed.TotalMilliseconds, 2)
    }
    $response.Dispose()
    $request.Dispose()
    return $result
}

try {
    Assert-Release ($BaseUrl.Scheme -eq 'https') 'base URL must use HTTPS'
    Assert-Release (@([System.Net.Dns]::GetHostAddresses($BaseUrl.Host)).Count -gt 0) 'hostname does not resolve'

    $root = Invoke-ReleaseRequest -Method GET -Path '/'
    $health = Invoke-ReleaseRequest -Method GET -Path '/api/health'
    $method = Invoke-ReleaseRequest -Method GET -Path '/api/research'
    $robots = Invoke-ReleaseRequest -Method GET -Path '/robots.txt'
    $icon = Invoke-ReleaseRequest -Method GET -Path '/icon.svg'

    Assert-Release ($root.Status -eq 200) 'root is not HTTP 200'
    Assert-Release ((Get-Header $root.Headers 'Content-Type') -like 'text/html*') 'root is not HTML'
    Assert-Release ($root.Body -match 'Recherche publique vérifiable') 'release marker is absent from root'
    foreach ($headerName in @(
        'Content-Security-Policy',
        'Referrer-Policy',
        'X-Content-Type-Options',
        'X-Frame-Options',
        'Permissions-Policy',
        'Strict-Transport-Security'
    )) {
        Assert-Release ((Get-Header $root.Headers $headerName).Length -gt 0) "security header missing: $headerName"
    }

    Assert-Release ($health.Status -eq 200) 'health is not HTTP 200'
    Assert-Release ((Get-Header $health.Headers 'Cache-Control') -match 'no-store') 'health is cacheable'
    $healthJson = $health.Body | ConvertFrom-Json
    Assert-Release (
        @($healthJson.PSObject.Properties.Name).Count -eq 1 -and $healthJson.status -ceq 'ok'
    ) 'health body differs from {"status":"ok"}'

    Assert-Release ($method.Status -eq 405) 'GET research is not HTTP 405'
    Assert-Release ((Get-Header $method.Headers 'Allow') -eq 'POST') 'GET research lacks Allow: POST'
    Assert-Release ((Get-Header $method.Headers 'Cache-Control') -match 'no-store') 'GET research error is cacheable'
    Assert-Release ($robots.Status -eq 200 -and $robots.Body -match 'User-Agent') 'robots.txt is missing or malformed'
    Assert-Release ($icon.Status -eq 200 -and (Get-Header $icon.Headers 'Content-Type') -like 'image/svg+xml*') 'favicon is missing or malformed'

    $sameOriginHeaders = @{
        Origin = $BaseUrl.GetLeftPart([System.UriPartial]::Authority).TrimEnd('/')
        'Sec-Fetch-Site' = 'same-origin'
    }
    $guardCases = @(
        [pscustomobject]@{
            Name = 'foreign_origin'; Expected = 403; Code = 'origin_rejected';
            Response = Invoke-ReleaseRequest -Method POST -Path '/api/research' -Body '{"name":"Acme"}' -ContentType 'application/json' -Headers @{ Origin = 'https://attacker.example'; 'Sec-Fetch-Site' = 'same-origin' }
        },
        [pscustomobject]@{
            Name = 'bad_mime'; Expected = 415; Code = 'content_type_required';
            Response = Invoke-ReleaseRequest -Method POST -Path '/api/research' -Body '{"name":"Acme"}' -ContentType 'text/plain' -Headers $sameOriginHeaders
        },
        [pscustomobject]@{
            Name = 'invalid_json'; Expected = 400; Code = 'invalid_json';
            Response = Invoke-ReleaseRequest -Method POST -Path '/api/research' -Body '{invalid' -ContentType 'application/json' -Headers $sameOriginHeaders
        },
        [pscustomobject]@{
            Name = 'unknown_field'; Expected = 400; Code = 'unknown_field';
            Response = Invoke-ReleaseRequest -Method POST -Path '/api/research' -Body '{"name":"Acme","unexpected":true}' -ContentType 'application/json' -Headers $sameOriginHeaders
        },
        [pscustomobject]@{
            Name = 'body_limit'; Expected = 413; Code = 'body_too_large';
            Response = Invoke-ReleaseRequest -Method POST -Path '/api/research' -Body ('x' * 1100) -ContentType 'application/json' -Headers $sameOriginHeaders
        }
    )
    foreach ($guard in $guardCases) {
        Assert-Release ($guard.Response.Status -eq $guard.Expected) "$($guard.Name) returned $($guard.Response.Status)"
        Assert-Release ((Get-Header $guard.Response.Headers 'Cache-Control') -match 'no-store') "$($guard.Name) is cacheable"
        $guardJson = $guard.Response.Body | ConvertFrom-Json
        Assert-Release ($guardJson.error.code -ceq $guard.Code) "$($guard.Name) returned the wrong error code"
    }

    $disclosurePaths = @(
        '/.env',
        '/.env.local',
        '/.git/config',
        '/AUDIT_01.md',
        '/PLAN_ACTION_01.md',
        '/epreuve-deep-research.md',
        '/test-results/.last-run.json'
    )
    foreach ($path in $disclosurePaths) {
        $response = Invoke-ReleaseRequest -Method GET -Path $path
        Assert-Release ($response.Status -eq 404) "disclosure path is accessible: $path"
    }

    $assetPaths = @(
        [regex]::Matches($root.Body, '(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"') |
            ForEach-Object { [System.Net.WebUtility]::HtmlDecode($_.Groups[1].Value) } |
            Sort-Object -Unique
    )
    $publicText = $root.Body
    foreach ($assetPath in $assetPaths) {
        $assetUrl = [uri]::new($BaseUrl, $assetPath)
        Assert-Release ($assetUrl.Host -eq $BaseUrl.Host) "external asset found: $assetPath"
        $asset = Invoke-ReleaseRequest -Method GET -Path $assetPath
        Assert-Release ($asset.Status -eq 200) "asset is unavailable: $assetPath"
        $publicText += "`n$($asset.Body)"
    }
    $forbiddenPatterns = [ordered]@{
        provider_key_name = '(?i)OPENAI_API_KEY|GEMINI_API_KEY|AI_GATEWAY_API_KEY'
        provider_key_shape = 'sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}'
        provider_endpoint = 'api\.openai\.com|generativelanguage\.googleapis\.com'
        local_windows_path = '(?i)[A-Z]:\\Users\\'
        vercel_auth_marker = '(?i)VERCEL_OIDC_TOKEN|x-vercel-protection-bypass'
    }
    foreach ($entry in $forbiddenPatterns.GetEnumerator()) {
        Assert-Release ($publicText -notmatch $entry.Value) "public bundle finding: $($entry.Key)"
    }

    [pscustomobject]@{
        base_url = $BaseUrl.AbsoluteUri.TrimEnd('/')
        root_status = $root.Status
        health_status = $health.Status
        research_get_status = $method.Status
        guard_cases = $guardCases.Count
        disclosure_paths = $disclosurePaths.Count
        assets_checked = $assetPaths.Count
        root_latency_ms = $root.LatencyMs
        health_latency_ms = $health.LatencyMs
    } | ConvertTo-Json -Compress | Write-Output
    Write-Output 'RELEASE_DEPLOYMENT_VERIFY_OK: public, guarded, non-disclosing, bundle clean'
} finally {
    $client.Dispose()
    $handler.Dispose()
}
