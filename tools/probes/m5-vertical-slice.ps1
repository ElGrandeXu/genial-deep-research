[CmdletBinding()]
param(
    [string]$StorePath = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'GenialDeepResearch\api-keys.clixml'),
    [string]$OutputPath = (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'docs\evidence\m5-attempt-009-live-result.json'),
    [int]$Port = 3115
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$server = $null
$client = $null
$handler = $null
$plainValue = $null
$bstr = [IntPtr]::Zero
$resultToPersist = $null
$probeExitCode = 1
$script:fallbackReceipt = $null
$responseBody = $null
$missionAttempt = 'attempt-009'
$costCeilingUsd = 0.05
$credentialPresent = $false
$liveRequestStarted = $false
$preliveBlocked = $false
$probeInput = [ordered]@{
    name = 'Airbus SE'
    context = 'Corporate parent entity; not an aircraft model or a local subsidiary.'
}

function Assert-Probe {
    param([bool]$Condition, [string]$Finding)
    if (-not $Condition) { throw "M5_LOCAL_LIVE_FAILED: $Finding" }
}

function Get-SseEvents {
    param([string]$Body)

    $events = [System.Collections.Generic.List[object]]::new()
    foreach ($block in [regex]::Split($Body.Trim(), "\r?\n\r?\n")) {
        $dataLines = @($block -split "\r?\n" | Where-Object { $_.StartsWith('data: ') })
        if ($dataLines.Count -ne 1) { continue }
        $events.Add(($dataLines[0].Substring(6) | ConvertFrom-Json -Depth 100))
    }
    return @($events)
}

function New-MinimalFailureReceipt {
    param(
        [string]$AttemptId = ([Guid]::NewGuid().ToString()),
        [ValidateSet('configuration', 'provider_request', 'generation', 'metadata_extraction', 'truth_validation', 'receipt_construction', 'serialization', 'persistence', 'stream_consumption', 'internal_unknown')]
        [string]$FailedStage = 'internal_unknown',
        [ValidateSet('configuration', 'authentication', 'permission', 'rate_limit', 'provider_request', 'provider_unavailable', 'network', 'timeout', 'no_output', 'structured_output_invalid', 'source_metadata_missing', 'truth_contract_rejected', 'serialization', 'internal_unknown')]
        [string]$Category = 'internal_unknown',
        [string]$PublicCode = 'probe_terminal_missing',
        [AllowNull()][Nullable[int]]$CallsAttempted = $null
    )

    return [ordered]@{
        attemptId = $AttemptId
        terminalStatus = 'failed'
        failedStage = $FailedStage
        category = $Category
        publicCode = $PublicCode
        reasonCode = $null
        sourceMediaTypeClass = $null
        retryable = $false
        provider = 'OpenAI'
        model = 'gpt-5.6-luna'
        callsAttempted = $CallsAttempted
        httpStatus = $null
        finishReason = $null
        usage = $null
        toolCallCount = $null
        webSearchQueryCount = $null
        webSearchInspectionCount = $null
        sourceCount = $null
        sourceFetchCount = $null
        sourceVerificationMs = $null
        outputPresent = $null
        outputCharacterCount = $null
        outputLineCount = $null
        terminalLineBreakCount = $null
        durationMs = $null
        estimatedCostUsd = $null
        requestIdPresent = $false
        requestIdDigest = $null
        receiptPersistence = 'memory'
        observedAt = [DateTime]::UtcNow.ToString('o')
    }
}

function ConvertTo-AllowlistedFailureReceipt {
    param([Parameter(Mandatory)][object]$Receipt)

    $categories = @('configuration', 'authentication', 'permission', 'rate_limit', 'provider_request', 'provider_unavailable', 'network', 'timeout', 'no_output', 'structured_output_invalid', 'source_metadata_missing', 'truth_contract_rejected', 'serialization', 'internal_unknown')
    Assert-Probe ($Receipt.terminalStatus -ceq 'failed') 'terminal failure receipt status differs'
    Assert-Probe ($Receipt.category -cin $categories) 'terminal failure receipt category differs'
    Assert-Probe ($Receipt.provider -ceq 'OpenAI') 'terminal failure receipt provider differs'
    Assert-Probe ($Receipt.model -ceq 'gpt-5.6-luna') 'terminal failure receipt model differs'
    Assert-Probe ($Receipt.requestIdPresent -is [bool]) 'terminal failure receipt request ID presence differs'
    Assert-Probe ($null -eq $Receipt.requestIdDigest -or [string]$Receipt.requestIdDigest -match '^[a-f0-9]{16}$') 'terminal failure request ID digest differs'
    Assert-Probe (-not $Receipt.requestIdPresent -or $null -ne $Receipt.requestIdDigest) 'terminal failure request ID digest is missing'
    $reasonCodes = @(
        'invalid_provider_shape', 'invalid_claim_length', 'non_atomic_claim', 'source_metadata_missing',
        'content_type_missing', 'content_type_multiple', 'content_type_conflicting',
        'content_type_syntax_invalid', 'media_type_unsupported'
    )
    $contentTypeReasonCodes = @(
        'content_type_missing', 'content_type_multiple', 'content_type_conflicting',
        'content_type_syntax_invalid', 'media_type_unsupported'
    )
    $sourceMediaTypeClasses = @(
        'application_pdf', 'application_json', 'application_octet_stream', 'image',
        'audio', 'video', 'text_other', 'other'
    )
    Assert-Probe ($null -eq $Receipt.reasonCode -or [string]$Receipt.reasonCode -cin $reasonCodes) 'terminal failure reason code differs'
    if ($Receipt.publicCode -ceq 'source_content_type_rejected') {
        Assert-Probe ([string]$Receipt.reasonCode -cin $contentTypeReasonCodes) 'Content-Type failure reason code differs'
        if ($Receipt.reasonCode -ceq 'media_type_unsupported') {
            Assert-Probe ([string]$Receipt.sourceMediaTypeClass -cin $sourceMediaTypeClasses) 'Content-Type media class differs'
        } else {
            Assert-Probe ($null -eq $Receipt.sourceMediaTypeClass) 'Content-Type media class must be null'
        }
    } else {
        Assert-Probe ($null -eq $Receipt.sourceMediaTypeClass) 'unexpected source media class'
    }
    Assert-Probe ($null -eq $Receipt.outputPresent -or $Receipt.outputPresent -is [bool]) 'terminal failure output presence differs'
    foreach ($metric in @('outputCharacterCount', 'outputLineCount', 'terminalLineBreakCount')) {
        $value = $Receipt.$metric
        Assert-Probe ($null -eq $value -or ($value -is [long] -and $value -ge 0)) "terminal failure output metric differs: $metric"
    }

    $usage = if ($null -eq $Receipt.usage) { $null } else {
        [ordered]@{
            inputTokens = $Receipt.usage.inputTokens
            cachedInputTokens = $Receipt.usage.cachedInputTokens
            outputTokens = $Receipt.usage.outputTokens
            reasoningTokens = $Receipt.usage.reasoningTokens
            totalTokens = $Receipt.usage.totalTokens
        }
    }
    return [ordered]@{
        attemptId = [string]$Receipt.attemptId
        terminalStatus = 'failed'
        failedStage = [string]$Receipt.failedStage
        category = [string]$Receipt.category
        publicCode = [string]$Receipt.publicCode
        reasonCode = $Receipt.reasonCode
        sourceMediaTypeClass = $Receipt.sourceMediaTypeClass
        retryable = [bool]$Receipt.retryable
        provider = 'OpenAI'
        model = 'gpt-5.6-luna'
        callsAttempted = $Receipt.callsAttempted
        httpStatus = $Receipt.httpStatus
        finishReason = $Receipt.finishReason
        usage = $usage
        toolCallCount = $Receipt.toolCallCount
        webSearchQueryCount = $Receipt.webSearchQueryCount
        webSearchInspectionCount = $Receipt.webSearchInspectionCount
        sourceCount = $Receipt.sourceCount
        sourceFetchCount = $Receipt.sourceFetchCount
        sourceVerificationMs = $Receipt.sourceVerificationMs
        outputPresent = $Receipt.outputPresent
        outputCharacterCount = $Receipt.outputCharacterCount
        outputLineCount = $Receipt.outputLineCount
        terminalLineBreakCount = $Receipt.terminalLineBreakCount
        durationMs = $Receipt.durationMs
        estimatedCostUsd = $null
        requestIdPresent = [bool]$Receipt.requestIdPresent
        requestIdDigest = $Receipt.requestIdDigest
        receiptPersistence = 'file'
        observedAt = [string]$Receipt.observedAt
    }
}

function Assert-RedactedJson {
    param([Parameter(Mandatory)][string]$Json)

    $forbiddenPatterns = @(
        'sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}',
        '(?i)authorization',
        '(?i)requestBodyValues',
        '(?i)responseBody',
        '(?i)responseHeaders',
        '(?i)\"(?:prompt|cookie|stack|cause)\"\s*:',
        '(?i)\"requestId\"\s*:'
    )
    foreach ($pattern in $forbiddenPatterns) {
        Assert-Probe ($Json -notmatch $pattern) 'terminal evidence contains a forbidden field or secret pattern'
    }
}

function Write-AtomicJson {
    param(
        [Parameter(Mandatory)][object]$Value,
        [Parameter(Mandatory)][string]$Path
    )

    $resolvedOutput = [System.IO.Path]::GetFullPath($Path)
    $resolvedRepo = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    Assert-Probe ($resolvedOutput.StartsWith($resolvedRepo + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) 'output must stay inside the repository'
    Assert-Probe (-not (Test-Path -LiteralPath $resolvedOutput)) 'output already exists'
    Assert-Probe ($Value.attempt -ceq $missionAttempt) 'terminal evidence attempt differs'
    Assert-Probe ($Value.input.name -ceq $probeInput.name -and $Value.input.context -ceq $probeInput.context) 'terminal evidence input differs'
    $directory = Split-Path -Parent $resolvedOutput
    Assert-Probe (Test-Path -LiteralPath $directory -PathType Container) 'output directory is unavailable'
    $json = ($Value | ConvertTo-Json -Depth 100) + [Environment]::NewLine
    Assert-RedactedJson -Json $json
    [void]($json | ConvertFrom-Json -Depth 100 -ErrorAction Stop)
    $temporary = Join-Path $directory ('.' + [System.IO.Path]::GetFileName($resolvedOutput) + '.tmp.' + $PID + '.' + [Guid]::NewGuid().ToString('N'))
    [System.IO.File]::WriteAllText($temporary, $json, [System.Text.UTF8Encoding]::new($false))
    [void](Get-Content -LiteralPath $temporary -Raw | ConvertFrom-Json -Depth 100 -ErrorAction Stop)
    [System.IO.File]::Move($temporary, $resolvedOutput, $false)
}

try {
    $resolvedRepo = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    Assert-Probe (-not (Test-Path -LiteralPath $OutputPath)) 'output already exists'
    Assert-Probe (Test-Path -LiteralPath $StorePath -PathType Leaf) 'DPAPI store is unavailable'
    $resolvedStore = [System.IO.Path]::GetFullPath($StorePath)
    Assert-Probe (-not $resolvedStore.StartsWith($resolvedRepo, [System.StringComparison]::OrdinalIgnoreCase)) 'DPAPI store is inside the repository'

    $entries = @(Import-Clixml -LiteralPath $resolvedStore -ErrorAction Stop)
    Assert-Probe ($entries.Count -eq 2) 'DPAPI store entry count differs'
    Assert-Probe (@($entries | Where-Object { $_ -isnot [System.Management.Automation.PSCredential] }).Count -eq 0) 'DPAPI store shape differs'
    $names = @($entries | ForEach-Object UserName | Sort-Object)
    Assert-Probe (-not (Compare-Object @('GEMINI_API_KEY', 'OPENAI_API_KEY') $names)) 'DPAPI store names differ'
    $credential = @($entries | Where-Object UserName -CEQ 'OPENAI_API_KEY')[0]
    Assert-Probe ($credential.Password.Length -gt 0) 'OpenAI credential is empty'

    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential.Password)
    $plainValue = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    Assert-Probe (-not [string]::IsNullOrWhiteSpace($plainValue)) 'OpenAI credential is empty'
    $credentialPresent = $true
    Write-Output 'PRESENT'

    $node = (Get-Command node -ErrorAction Stop).Source
    $nextCli = Join-Path $repoRoot 'node_modules\next\dist\bin\next'
    Assert-Probe (Test-Path -LiteralPath $nextCli -PathType Leaf) 'Next.js CLI is unavailable'

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $node
    $startInfo.WorkingDirectory = $repoRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.ArgumentList.Add($nextCli)
    $startInfo.ArgumentList.Add('start')
    $startInfo.ArgumentList.Add('--hostname')
    $startInfo.ArgumentList.Add('127.0.0.1')
    $startInfo.ArgumentList.Add('--port')
    $startInfo.ArgumentList.Add([string]$Port)
    [void]$startInfo.Environment.Remove('GEMINI_API_KEY')
    [void]$startInfo.Environment.Remove('OPENAI_API_KEY')
    $startInfo.Environment['OPENAI_API_KEY'] = $plainValue
    $startInfo.Environment['NEXT_TELEMETRY_DISABLED'] = '1'
    $server = [System.Diagnostics.Process]::Start($startInfo)
    Assert-Probe ($null -ne $server) 'application child process did not start'

    $startInfo.Environment['OPENAI_API_KEY'] = ''
    $plainValue = $null
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    $bstr = [IntPtr]::Zero
    $credential = $null
    $entries = $null

    $handler = [System.Net.Http.HttpClientHandler]::new()
    $client = [System.Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(130)
    $baseUri = [uri]"http://127.0.0.1:$Port"

    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if ($server.HasExited) { break }
        try {
            $health = $client.GetAsync([uri]::new($baseUri, '/api/health')).GetAwaiter().GetResult()
            if ([int]$health.StatusCode -eq 200) { $ready = $true; break }
        } catch {
            # Startup polling only; no provider request occurs here.
        }
        Start-Sleep -Milliseconds 250
    }
    Assert-Probe $ready 'local application did not become ready'

    $body = $probeInput | ConvertTo-Json -Compress
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, [uri]::new($baseUri, '/api/research'))
    $request.Headers.Add('Origin', "http://localhost:$Port")
    $request.Headers.Add('Sec-Fetch-Site', 'same-origin')
    $request.Content = [System.Net.Http.StringContent]::new($body, [System.Text.Encoding]::UTF8, 'application/json')
    $liveRequestStarted = $true
    $response = $client.SendAsync($request).GetAwaiter().GetResult()
    $responseBody = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    Assert-Probe ([int]$response.StatusCode -eq 200) "research HTTP status is $([int]$response.StatusCode)"

    $events = @(Get-SseEvents -Body $responseBody)
    $states = @($events | ForEach-Object state)
    $failed = @($events | Where-Object state -EQ 'failed')
    $completed = @($events | Where-Object state -EQ 'completed')
    Assert-Probe (($failed.Count + $completed.Count) -eq 1) 'exactly one terminal event is required'
    if ($failed.Count -eq 1) {
        $safeReceipt = ConvertTo-AllowlistedFailureReceipt -Receipt $failed[0].receipt
        $resultToPersist = [ordered]@{
            schema_version = '1.0'
            attempt = $missionAttempt
            status = 'M5_R3_LIVE_ATTEMPT_009_FAILED'
            observed_at_utc = [DateTime]::UtcNow.ToString('o')
            input = $probeInput
            events = @($events | ForEach-Object {
                [ordered]@{ state = $_.state; elapsed_ms = $_.elapsedMs }
            })
            error = [ordered]@{
                code = [string]$failed[0].error.code
                retryable = [bool]$failed[0].error.retryable
            }
            diagnostic = [ordered]@{
                terminal = 'failed'
                category = $safeReceipt.category
                public_code = $safeReceipt.publicCode
                retryable = $safeReceipt.retryable
            }
            receipt = $safeReceipt
            webSearchActionCount = $safeReceipt.toolCallCount
            webSearchQueryCount = $safeReceipt.webSearchQueryCount
            webSearchInspectionCount = $safeReceipt.webSearchInspectionCount
            webSearchUniqueCallCount = $null
            openai_calls = $safeReceipt.callsAttempted
            web_search_calls = $safeReceipt.toolCallCount
            source_fetches = $safeReceipt.sourceFetchCount
            provider_retries = 0
            gemini_calls = 0
            cost_ceiling_usd = $costCeilingUsd
            secret_value_exposed = $false
        }
        $probeExitCode = 1
    } else {
        Assert-Probe (-not (Compare-Object @('accepted', 'searching', 'source_verifying', 'validating', 'completed') $states -SyncWindow 0)) "event order differs: $($states -join ',')"
        $final = $completed[0]
        Assert-Probe ($final.receipt.providerHttpCalls -eq 1) 'provider HTTP call count differs'
        Assert-Probe ($final.receipt.toolCalls -in @(1, 2)) 'Web Search action count differs'
        Assert-Probe ($final.receipt.webSearchQueryCount -eq 1) 'Web Search query count differs'
        Assert-Probe ($final.receipt.webSearchInspectionCount -in @(0, 1)) 'Web Search inspection count differs'
        Assert-Probe ($final.receipt.toolCalls -eq ($final.receipt.webSearchQueryCount + $final.receipt.webSearchInspectionCount)) 'Web Search counters are incoherent'
        Assert-Probe ($final.dossier.claims.Count -eq 1) 'claim count differs'
        Assert-Probe ($final.dossier.sources.Count -eq 1) 'displayed source count differs'
        Assert-Probe ($final.dossier.evidence.Count -eq 1) 'evidence count differs'
        Assert-Probe (([uri]$final.dossier.sources[0].provider_url).Scheme -eq 'https') 'source is not HTTPS'
        Assert-Probe ($final.receipt.sourceFetchCount -ge 1) 'source was not fetched'
        Assert-Probe ($null -ne $final.receipt.estimatedCostUsd -and $final.receipt.estimatedCostUsd -le $costCeilingUsd) 'mission cost is unknown or exceeds the ceiling'

        $m2Json = $final.dossier | ConvertTo-Json -Depth 100 -Compress
        $m2Schema = Join-Path $repoRoot 'docs\contracts\research-dossier.schema.json'
        Assert-Probe (Test-Json -Json $m2Json -SchemaFile $m2Schema -ErrorAction Stop) 'M2 schema validation differs'
        $source = $final.dossier.sources[0]
        $evidence = $final.dossier.evidence[0]
        $claim = $final.dossier.claims[0]
        Assert-Probe ($evidence.source_id -ceq $source.source_id -and $evidence.claim_id -ceq $claim.claim_id) 'claim/source/evidence linkage differs'
        Assert-Probe ($claim.evidence_ids.Count -eq 1 -and $claim.evidence_ids[0] -ceq $evidence.evidence_id) 'claim evidence linkage differs'
        Assert-Probe (-not [string]::IsNullOrWhiteSpace([string]$evidence.excerpt)) 'verified excerpt is absent'
        $locator = [string]$evidence.locator | ConvertFrom-Json -Depth 100 -ErrorAction Stop
        Assert-Probe ($locator.exact -ceq $evidence.excerpt) 'locator exact excerpt differs'
        Assert-Probe ([string]$locator.contentType -match '^(?:text/html|application/xhtml\+xml); charset=(?:utf-8|us-ascii)$') 'source media type is not HTML or XHTML'
        Assert-Probe (([uri]$locator.citationUrl).Scheme -eq 'https' -and ([uri]$locator.finalUrl).Scheme -eq 'https') 'source retrieval URLs are not HTTPS'
        Assert-Probe ($locator.citationUrl -ceq $source.provider_url -and $locator.finalUrl -ceq $source.resolved_url) 'source retrieval linkage differs'
        Assert-Probe ($locator.bytesRead -is [long] -and $locator.bytesRead -gt 0) 'source byte count is invalid'
        Assert-Probe ([string]$locator.normalizedTextSha256 -match '^[a-f0-9]{64}$') 'source text digest is invalid'
        Assert-Probe (-not [string]::IsNullOrWhiteSpace([string]$source.title)) 'verified source title is absent'
        Assert-Probe ($source.collection_method -ceq 'direct_access' -and $source.accessibility_status -ceq 'accessible') 'source retrieval status differs'
        Assert-Probe ($null -ne $final.receipt.inputTokens -and $null -ne $final.receipt.outputTokens -and $null -ne $final.receipt.totalTokens) 'provider usage is incomplete'

        $resultToPersist = [ordered]@{
            schema_version = '1.0'
            attempt = $missionAttempt
            status = 'M5_R3_LIVE_ATTEMPT_009_COMPLETED_READY_FOR_EXTERNAL_AUDIT'
            observed_at_utc = [DateTime]::UtcNow.ToString('o')
            input = $probeInput
            events = @($events | ForEach-Object {
                [ordered]@{ state = $_.state; elapsed_ms = $_.elapsedMs }
            })
            provider_binding_type = 'openai_unique_source_binding'
            diagnostic = [ordered]@{
                terminal = 'completed'
                action_policy = 'admitted'
                source_verification = 'validated'
                title_verification = 'validated'
                m2 = 'valid'
            }
            claim = [string]$claim.statement
            source = [ordered]@{
                title = [string]$source.title
                domain = ([uri]$source.provider_url).Host
                url = [string]$source.provider_url
                media_type = ([string]$locator.contentType -split ';', 2)[0]
                published_at = $null
                freshness = 'unknown'
                exact_excerpt = [string]$evidence.excerpt
                locator = $locator
            }
            receipt = $final.receipt
            m2_schema_valid = $true
            webSearchActionCount = $final.receipt.toolCalls
            webSearchQueryCount = $final.receipt.webSearchQueryCount
            webSearchInspectionCount = $final.receipt.webSearchInspectionCount
            webSearchUniqueCallCount = $final.receipt.toolCalls
            openai_calls = $final.receipt.providerHttpCalls
            web_search_calls = $final.receipt.toolCalls
            source_fetches = $final.receipt.sourceFetchCount
            source_retrieval_chains = 1
            provider_retries = 0
            cost_ceiling_usd = $costCeilingUsd
            persistence = 'file'
            secret_store = ('external' + '_dpapi')
            secret_value_exposed = $false
            gemini_calls = 0
        }
        $probeExitCode = 0
    }
} catch {
    if (-not $liveRequestStarted) {
        if (-not $credentialPresent) { Write-Output 'ABSENT' }
        $preliveBlocked = $true
    } else {
        $fallbackStage = if ($null -eq $responseBody) { 'provider_request' } else { 'stream_consumption' }
        $fallbackCategory = if ($fallbackStage -eq 'stream_consumption') { 'serialization' } else { 'internal_unknown' }
        $fallbackCode = if ($fallbackStage -eq 'stream_consumption') { 'probe_stream_invalid' } else { 'probe_internal_failure' }
        $script:fallbackReceipt = New-MinimalFailureReceipt -FailedStage $fallbackStage -Category $fallbackCategory -PublicCode $fallbackCode
        $resultToPersist = [ordered]@{
            schema_version = '1.0'
            attempt = $missionAttempt
            status = 'M5_R3_LIVE_ATTEMPT_009_FAILED'
            observed_at_utc = [DateTime]::UtcNow.ToString('o')
            input = $probeInput
            events = @()
            error = [ordered]@{ code = $fallbackCode; retryable = $false }
            diagnostic = [ordered]@{
                terminal = 'failed'
                category = $script:fallbackReceipt.category
                public_code = $script:fallbackReceipt.publicCode
                retryable = $false
            }
            receipt = $script:fallbackReceipt
            webSearchActionCount = $null
            webSearchQueryCount = $null
            webSearchInspectionCount = $null
            webSearchUniqueCallCount = $null
            openai_calls = $null
            web_search_calls = $null
            source_fetches = $null
            provider_retries = 0
            gemini_calls = 0
            cost_ceiling_usd = $costCeilingUsd
            secret_value_exposed = $false
        }
        $probeExitCode = 1
    }
} finally {
    if ($bstr -ne [IntPtr]::Zero) {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    $plainValue = $null
    if ($null -ne $client) { $client.Dispose() }
    if ($null -ne $handler) { $handler.Dispose() }
    if ($null -ne $server -and -not $server.HasExited) {
        $server.Kill($true)
        [void]$server.WaitForExit(5000)
    }
    if ($null -ne $server) { $server.Dispose() }
}

if ($preliveBlocked) {
    Write-Output 'M5_R3_LIVE_ATTEMPT_009_PRELIVE_BLOCKED'
    exit 1
}

try {
    Assert-Probe ($null -ne $resultToPersist) 'terminal evidence is unavailable'
    Write-AtomicJson -Value $resultToPersist -Path $OutputPath
} catch {
    $script:fallbackReceipt = New-MinimalFailureReceipt -FailedStage 'persistence' -Category 'internal_unknown' -PublicCode 'receipt_persistence_failed'
    Write-Output 'M5_RECEIPT_PERSISTENCE_FAILED'
    exit 1
}

if ($probeExitCode -ne 0) {
    Write-Output 'M5_R3_LIVE_ATTEMPT_009_FAILED'
    exit $probeExitCode
}
Write-Output 'M5_R3_LIVE_ATTEMPT_009_COMPLETED_READY_FOR_EXTERNAL_AUDIT'
exit 0
