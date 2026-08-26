[CmdletBinding()]
param(
    [string]$StorePath = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'GenialDeepResearch\api-keys.clixml'),
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $repoRoot 'docs\evidence\m1-api-capabilities-result.json'
}

$script:httpCallCount = 0
$script:inventoryCallCount = 0
$script:generationCallCount = 0
$script:providerGenerationCalls = @{ openai = 0; gemini = 0 }
$script:providerRetryUsed = @{ openai = $false; gemini = $false }
$script:maxGenerationCalls = 6
$client = $null
$loadedEntries = $null
$openAiEntry = $null
$geminiEntry = $null
$raw = $null
$resolvedStore = $null

function Get-PropertyValue {
    param(
        [AllowNull()][object]$InputObject,
        [Parameter(Mandatory)][string]$Name
    )

    if ($null -eq $InputObject) { return $null }
    $property = $InputObject.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function Get-SafeErrorCode {
    param([AllowNull()][object]$Failure)

    if ($Failure -is [System.Threading.Tasks.TaskCanceledException] -or
        $Failure -is [System.TimeoutException]) {
        return 'TIMEOUT'
    }
    return 'NETWORK_ERROR'
}

function Test-TransientResult {
    param([Parameter(Mandatory)][object]$Result)

    if ($Result.error -in @('TIMEOUT', 'NETWORK_ERROR')) { return $true }
    return $Result.http_status -in @(408, 429, 500, 502, 503, 504)
}

function Invoke-SafeHttpJson {
    param(
        [Parameter(Mandatory)][ValidateSet('openai', 'gemini')][string]$Provider,
        [Parameter(Mandatory)][System.Management.Automation.PSCredential]$Credential,
        [Parameter(Mandatory)][ValidateSet('GET', 'POST')][string]$Method,
        [Parameter(Mandatory)][string]$Uri,
        [AllowNull()][object]$Body,
        [switch]$Generation
    )

    if ($Generation -and $script:generationCallCount -ge $script:maxGenerationCalls) {
        return [pscustomobject]@{
            http_status = $null
            latency_ms = 0
            data = $null
            error = 'GENERATION_CALL_LIMIT'
        }
    }

    $script:httpCallCount++
    if ($Generation) {
        $script:generationCallCount++
        $script:providerGenerationCalls[$Provider]++
    } else {
        $script:inventoryCallCount++
    }

    $request = $null
    $response = $null
    $bodyJson = $null
    $responseBody = $null
    $plainValue = $null
    $authValue = $null
    $bstr = [IntPtr]::Zero
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

    try {
        $request = [System.Net.Http.HttpRequestMessage]::new(
            [System.Net.Http.HttpMethod]::new($Method),
            [System.Uri]::new($Uri)
        )
        $request.Headers.Accept.Add([System.Net.Http.Headers.MediaTypeWithQualityHeaderValue]::new('application/json'))

        $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Credential.Password)
        $plainValue = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
        if ([string]::IsNullOrWhiteSpace($plainValue)) { throw [System.Security.SecurityException]::new() }

        if ($Provider -eq 'openai') {
            $authValue = 'Bearer ' + $plainValue
            [void]$request.Headers.TryAddWithoutValidation('Authorization', $authValue)
        } else {
            [void]$request.Headers.TryAddWithoutValidation('x-goog-api-key', $plainValue)
        }

        if ($null -ne $Body) {
            $bodyJson = $Body | ConvertTo-Json -Depth 40 -Compress
            $request.Content = [System.Net.Http.StringContent]::new(
                $bodyJson,
                [System.Text.Encoding]::UTF8,
                'application/json'
            )
        }

        try {
            $response = $client.SendAsync($request).GetAwaiter().GetResult()
        } catch {
            $stopwatch.Stop()
            return [pscustomobject]@{
                http_status = $null
                latency_ms = [math]::Round($stopwatch.Elapsed.TotalMilliseconds, 1)
                data = $null
                error = Get-SafeErrorCode $_.Exception
            }
        }

        $stopwatch.Stop()
        $statusCode = [int]$response.StatusCode
        $responseBody = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if (-not $response.IsSuccessStatusCode) {
            return [pscustomobject]@{
                http_status = $statusCode
                latency_ms = [math]::Round($stopwatch.Elapsed.TotalMilliseconds, 1)
                data = $null
                error = "HTTP_$statusCode"
            }
        }

        try {
            $parsed = $responseBody | ConvertFrom-Json -Depth 100
        } catch {
            return [pscustomobject]@{
                http_status = $statusCode
                latency_ms = [math]::Round($stopwatch.Elapsed.TotalMilliseconds, 1)
                data = $null
                error = 'INVALID_JSON_RESPONSE'
            }
        }

        return [pscustomobject]@{
            http_status = $statusCode
            latency_ms = [math]::Round($stopwatch.Elapsed.TotalMilliseconds, 1)
            data = $parsed
            error = $null
        }
    } catch {
        $stopwatch.Stop()
        return [pscustomobject]@{
            http_status = $null
            latency_ms = [math]::Round($stopwatch.Elapsed.TotalMilliseconds, 1)
            data = $null
            error = 'LOCAL_REQUEST_ERROR'
        }
    } finally {
        if ($bstr -ne [IntPtr]::Zero) {
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
        $plainValue = $null
        $authValue = $null
        $bodyJson = $null
        $responseBody = $null
        if ($null -ne $response) { $response.Dispose() }
        if ($null -ne $request) { $request.Dispose() }
    }
}

function Invoke-GenerationWithRetry {
    param(
        [Parameter(Mandatory)][ValidateSet('openai', 'gemini')][string]$Provider,
        [Parameter(Mandatory)][System.Management.Automation.PSCredential]$Credential,
        [Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][object]$Body
    )

    $result = Invoke-SafeHttpJson -Provider $Provider -Credential $Credential -Method POST -Uri $Uri -Body $Body -Generation
    if ((Test-TransientResult $result) -and
        -not $script:providerRetryUsed[$Provider] -and
        $script:generationCallCount -lt $script:maxGenerationCalls) {
        $script:providerRetryUsed[$Provider] = $true
        Start-Sleep -Milliseconds 750
        $result = Invoke-SafeHttpJson -Provider $Provider -Credential $Credential -Method POST -Uri $Uri -Body $Body -Generation
    }
    return $result
}

function Get-Domain {
    param([AllowNull()][string]$Url)

    if ([string]::IsNullOrWhiteSpace($Url)) { return $null }
    $uri = $null
    if ([System.Uri]::TryCreate($Url, [System.UriKind]::Absolute, [ref]$uri) -and
        $uri.Scheme -in @('http', 'https')) {
        return $uri.DnsSafeHost.ToLowerInvariant()
    }
    return $null
}

function Get-UrlEvidence {
    param([AllowNull()][object[]]$Urls)

    $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $items = [System.Collections.Generic.List[object]]::new()
    foreach ($url in @($Urls)) {
        if ($url -isnot [string] -or [string]::IsNullOrWhiteSpace($url)) { continue }
        $domain = Get-Domain $url
        if ($null -eq $domain -or -not $seen.Add($url)) { continue }
        $items.Add([ordered]@{ url = $url; domain = $domain })
    }
    return @($items)
}

function Get-OpenAiText {
    param([AllowNull()][object]$ResponseData)

    $texts = [System.Collections.Generic.List[string]]::new()
    foreach ($item in @(Get-PropertyValue $ResponseData 'output')) {
        if ((Get-PropertyValue $item 'type') -ne 'message') { continue }
        foreach ($content in @(Get-PropertyValue $item 'content')) {
            if ((Get-PropertyValue $content 'type') -eq 'output_text') {
                $value = Get-PropertyValue $content 'text'
                if ($value -is [string]) { $texts.Add($value) }
            }
        }
    }
    return ($texts -join "`n")
}

function Get-GeminiText {
    param([AllowNull()][object]$ResponseData)

    $texts = [System.Collections.Generic.List[string]]::new()
    foreach ($candidate in @(Get-PropertyValue $ResponseData 'candidates')) {
        $content = Get-PropertyValue $candidate 'content'
        foreach ($part in @(Get-PropertyValue $content 'parts')) {
            if ((Get-PropertyValue $part 'thought') -eq $true) { continue }
            $value = Get-PropertyValue $part 'text'
            if ($value -is [string]) { $texts.Add($value) }
        }
    }
    return ($texts -join "`n")
}

function Test-ProbeSchema {
    param(
        [AllowNull()][string]$Text,
        [Parameter(Mandatory)][ValidateSet('OpenAI', 'Gemini')][string]$ExpectedProvider
    )

    if ([string]::IsNullOrWhiteSpace($Text)) { return $false }
    try {
        $value = $Text | ConvertFrom-Json -Depth 20
        $names = @($value.PSObject.Properties.Name | Sort-Object)
        if (Compare-Object @('ok', 'provider') $names) { return $false }
        return ((Get-PropertyValue $value 'ok') -eq $true -and
            (Get-PropertyValue $value 'provider') -ceq $ExpectedProvider)
    } catch {
        return $false
    }
}

function Get-OpenAiUsage {
    param([AllowNull()][object]$ResponseData)

    $usage = Get-PropertyValue $ResponseData 'usage'
    $inputDetails = Get-PropertyValue $usage 'input_tokens_details'
    $outputDetails = Get-PropertyValue $usage 'output_tokens_details'
    $a = Get-PropertyValue $usage 'input_tokens'
    $b = Get-PropertyValue $inputDetails 'cached_tokens'
    $c = Get-PropertyValue $usage 'output_tokens'
    $d = Get-PropertyValue $outputDetails 'reasoning_tokens'
    $e = Get-PropertyValue $usage 'total_tokens'
    return [ordered]@{
        input_tokens = $a
        cached_input_tokens = $b
        output_tokens = $c
        reasoning_output_tokens = $d
        total_tokens = $e
    }
}

function Get-GeminiUsage {
    param([AllowNull()][object]$ResponseData)

    $usage = Get-PropertyValue $ResponseData 'usageMetadata'
    $a = Get-PropertyValue $usage 'promptTokenCount'
    $b = Get-PropertyValue $usage 'cachedContentTokenCount'
    $c = Get-PropertyValue $usage 'candidatesTokenCount'
    $d = Get-PropertyValue $usage 'thoughtsTokenCount'
    $e = Get-PropertyValue $usage 'toolUsePromptTokenCount'
    $f = Get-PropertyValue $usage 'totalTokenCount'
    return [ordered]@{
        prompt_tokens = $a
        cached_tokens = $b
        output_tokens = $c
        thinking_tokens = $d
        tool_prompt_tokens = $e
        total_tokens = $f
    }
}

function Get-OpenAiCost {
    param(
        [AllowNull()][string]$Model,
        [Parameter(Mandatory)][object]$Usage,
        [int]$BillableSearches = 0
    )

    $rates = switch -Regex ($Model) {
        '^gpt-5\.6-luna' { @{ input = 0.20; output = 1.20 }; break }
        '^gpt-5\.6-terra' { @{ input = 2.00; output = 12.00 }; break }
        '^gpt-5\.6-sol' { @{ input = 4.00; output = 20.00 }; break }
        default { $null }
    }
    if ($null -eq $rates -or $null -eq $Usage.input_tokens -or $null -eq $Usage.output_tokens) { return $null }
    $amount = (($Usage.input_tokens * $rates.input) + ($Usage.output_tokens * $rates.output)) / 1000000
    return [math]::Round($amount + ($BillableSearches * 0.01), 8)
}

function Get-GeminiCost {
    param(
        [AllowNull()][string]$Model,
        [Parameter(Mandatory)][object]$Usage,
        [int]$BillableSearches = 0
    )

    $rates = switch -Regex ($Model) {
        'gemini-2\.5-flash-lite' { @{ input = 0.10; output = 0.40; search = 0.035 }; break }
        default { $null }
    }
    if ($null -eq $rates -or $null -eq $Usage.prompt_tokens -or $null -eq $Usage.output_tokens) { return $null }
    $thoughtCount = if ($null -eq $Usage.thinking_tokens) { 0 } else { [int64]$Usage.thinking_tokens }
    $amount = (($Usage.prompt_tokens * $rates.input) + (($Usage.output_tokens + $thoughtCount) * $rates.output)) / 1000000
    # Conservative list-price estimate: monthly free grounding allowance is not deducted.
    return [math]::Round($amount + ($BillableSearches * $rates.search), 8)
}

function Get-ApplicationStatus {
    param(
        [Parameter(Mandatory)][ValidateSet('openai', 'gemini')][string]$Provider,
        [AllowNull()][object]$ResponseData
    )

    if ($Provider -eq 'openai') { return Get-PropertyValue $ResponseData 'status' }
    $candidate = @(Get-PropertyValue $ResponseData 'candidates') | Select-Object -First 1
    return Get-PropertyValue $candidate 'finishReason'
}

function New-ProbeEvidence {
    param(
        [Parameter(Mandatory)][string]$Capability,
        [Parameter(Mandatory)][string]$RequestedModel,
        [Parameter(Mandatory)][string]$Endpoint,
        [Parameter(Mandatory)][object]$HttpResult,
        [Parameter(Mandatory)][ValidateSet('openai', 'gemini')][string]$Provider,
        [bool]$SchemaValid = $false,
        [bool]$SearchExecuted = $false,
        [int]$CitationCount = 0,
        [object[]]$Urls = @(),
        [AllowNull()][Nullable[int]]$BillableSearches = $null
    )

    $data = $HttpResult.data
    $usage = if ($Provider -eq 'openai') { Get-OpenAiUsage $data } else { Get-GeminiUsage $data }
    $returnedModel = if ($Provider -eq 'openai') {
        Get-PropertyValue $data 'model'
    } else {
        Get-PropertyValue $data 'modelVersion'
    }
    $responseId = if ($Provider -eq 'openai') {
        Get-PropertyValue $data 'id'
    } else {
        Get-PropertyValue $data 'responseId'
    }
    $modelStatus = if ($Provider -eq 'gemini') {
        $status = Get-PropertyValue $data 'modelStatus'
        Get-PropertyValue $status 'modelStage'
    } else { $null }
    $searchCount = if ($null -eq $BillableSearches) { 0 } else { [int]$BillableSearches }
    $cost = if ($Provider -eq 'openai') {
        Get-OpenAiCost -Model $returnedModel -Usage $usage -BillableSearches $searchCount
    } else {
        Get-GeminiCost -Model $returnedModel -Usage $usage -BillableSearches $searchCount
    }

    return [ordered]@{
        capability = $Capability
        requested_model = $RequestedModel
        returned_model_version = $returnedModel
        model_stage = $modelStatus
        endpoint = $Endpoint
        http_status = $HttpResult.http_status
        application_status = Get-ApplicationStatus -Provider $Provider -ResponseData $data
        response_id = $responseId
        schema_valid = $SchemaValid
        search_executed = $SearchExecuted
        citation_count = $CitationCount
        urls = @($Urls)
        billable_searches = $BillableSearches
        usage = $usage
        latency_ms = $HttpResult.latency_ms
        estimated_cost_usd = $cost
        pricing_date = '2026-08-26'
        error = $HttpResult.error
    }
}

function Get-OpenAiSearchEvidence {
    param([AllowNull()][object]$ResponseData)

    $calls = [System.Collections.Generic.List[object]]::new()
    $urls = [System.Collections.Generic.List[string]]::new()
    $citationCount = 0
    foreach ($item in @(Get-PropertyValue $ResponseData 'output')) {
        if ((Get-PropertyValue $item 'type') -eq 'web_search_call') {
            $calls.Add($item)
            $action = Get-PropertyValue $item 'action'
            foreach ($source in @(Get-PropertyValue $action 'sources')) {
                $sourceUrl = Get-PropertyValue $source 'url'
                if ($sourceUrl -is [string]) { $urls.Add($sourceUrl) }
            }
        }
        if ((Get-PropertyValue $item 'type') -ne 'message') { continue }
        foreach ($content in @(Get-PropertyValue $item 'content')) {
            foreach ($annotation in @(Get-PropertyValue $content 'annotations')) {
                if ((Get-PropertyValue $annotation 'type') -ne 'url_citation') { continue }
                $citationCount++
                $citationUrl = Get-PropertyValue $annotation 'url'
                if ($null -eq $citationUrl) {
                    $nested = Get-PropertyValue $annotation 'url_citation'
                    $citationUrl = Get-PropertyValue $nested 'url'
                }
                if ($citationUrl -is [string]) { $urls.Add($citationUrl) }
            }
        }
    }
    $completedCalls = @($calls | Where-Object { (Get-PropertyValue $_ 'status') -eq 'completed' }).Count
    $urlEvidence = @(Get-UrlEvidence $urls)
    return [ordered]@{
        search_call_count = $calls.Count
        completed_search_call_count = $completedCalls
        citation_count = $citationCount
        urls = $urlEvidence
        executed = ($completedCalls -gt 0 -and $citationCount -gt 0 -and $urlEvidence.Count -gt 0)
    }
}

function Get-GeminiSearchEvidence {
    param([AllowNull()][object]$ResponseData)

    $urls = [System.Collections.Generic.List[string]]::new()
    $queryCount = 0
    $supportCount = 0
    foreach ($candidate in @(Get-PropertyValue $ResponseData 'candidates')) {
        $metadata = Get-PropertyValue $candidate 'groundingMetadata'
        $queries = @(Get-PropertyValue $metadata 'webSearchQueries') | Where-Object { $_ -is [string] -and -not [string]::IsNullOrWhiteSpace($_) }
        $queryCount += @($queries | Sort-Object -Unique).Count
        $supportCount += @(Get-PropertyValue $metadata 'groundingSupports').Count
        foreach ($chunk in @(Get-PropertyValue $metadata 'groundingChunks')) {
            $web = Get-PropertyValue $chunk 'web'
            $uri = Get-PropertyValue $web 'uri'
            if ($uri -is [string]) { $urls.Add($uri) }
        }
    }
    $urlEvidence = @(Get-UrlEvidence $urls)
    return [ordered]@{
        query_count = $queryCount
        citation_count = $supportCount
        urls = $urlEvidence
        executed = ($queryCount -gt 0 -and $supportCount -gt 0 -and $urlEvidence.Count -gt 0)
    }
}

function Test-GenerationSuccess {
    param([Parameter(Mandatory)][object]$Probe)

    return ($Probe.http_status -eq 200 -and $Probe.application_status -in @('completed', 'STOP'))
}

function Write-SanitizedResult {
    param([Parameter(Mandatory)][object]$Result)

    $resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
    $resolvedRepo = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    if (-not $resolvedOutput.StartsWith($resolvedRepo + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'OUTPUT_OUTSIDE_REPOSITORY'
    }
    $directory = Split-Path -Parent $resolvedOutput
    if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
        [void](New-Item -ItemType Directory -Path $directory)
    }
    $json = $Result | ConvertTo-Json -Depth 40
    [System.IO.File]::WriteAllText($resolvedOutput, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
    $json = $null
}

try {
    $resolvedRepo = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    if (-not (Test-Path -LiteralPath $StorePath -PathType Leaf)) { throw 'SECRET_STORE_INVALID' }
    $resolvedStore = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $StorePath).Path)
    if ($resolvedStore.StartsWith($resolvedRepo + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'SECRET_STORE_INVALID'
    }

    try {
        $loadedEntries = @(Import-Clixml -LiteralPath $resolvedStore -ErrorAction Stop)
    } catch {
        throw 'SECRET_STORE_INVALID'
    }
    if ($loadedEntries.Count -ne 2 -or
        @($loadedEntries | Where-Object { $_ -isnot [System.Management.Automation.PSCredential] }).Count -ne 0) {
        throw 'SECRET_STORE_INVALID'
    }
    $names = @($loadedEntries | ForEach-Object { $_.UserName } | Sort-Object)
    if (Compare-Object @('GEMINI_API_KEY', 'OPENAI_API_KEY') $names) { throw 'SECRET_STORE_INVALID' }
    foreach ($credential in $loadedEntries) {
        if ($null -eq $credential.Password -or
            $credential.Password -isnot [System.Security.SecureString] -or
            $credential.Password.Length -le 0) {
            throw 'SECRET_STORE_INVALID'
        }
    }
    $openAiEntry = @($loadedEntries | Where-Object UserName -CEQ 'OPENAI_API_KEY')[0]
    $geminiEntry = @($loadedEntries | Where-Object UserName -CEQ 'GEMINI_API_KEY')[0]

    $client = [System.Net.Http.HttpClient]::new()
    $client.Timeout = [TimeSpan]::FromSeconds(60)

    $openAiInventoryEndpoint = 'https://api.openai.com/v1/models'
    $geminiInventoryEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000'
    $openAiInventoryHttp = Invoke-SafeHttpJson -Provider openai -Credential $openAiEntry -Method GET -Uri $openAiInventoryEndpoint -Body $null
    $geminiInventoryHttp = Invoke-SafeHttpJson -Provider gemini -Credential $geminiEntry -Method GET -Uri $geminiInventoryEndpoint -Body $null

    $openAiModelIds = @()
    if ($openAiInventoryHttp.http_status -eq 200 -and $null -eq $openAiInventoryHttp.error) {
        $openAiModelIds = @(
            @(Get-PropertyValue $openAiInventoryHttp.data 'data') |
                ForEach-Object { Get-PropertyValue $_ 'id' } |
                Where-Object { $_ -is [string] -and -not [string]::IsNullOrWhiteSpace($_) } |
                Sort-Object -Unique
        )
    }

    $geminiModels = @()
    if ($geminiInventoryHttp.http_status -eq 200 -and $null -eq $geminiInventoryHttp.error) {
        $geminiModels = @(
            @(Get-PropertyValue $geminiInventoryHttp.data 'models') |
                ForEach-Object {
                    [ordered]@{
                        name = Get-PropertyValue $_ 'name'
                        version = Get-PropertyValue $_ 'version'
                        supported_generation_methods = @(Get-PropertyValue $_ 'supportedGenerationMethods')
                    }
                } |
                Sort-Object { $_.name }
        )
    }
    $geminiGenerateModelIds = @(
        $geminiModels |
            Where-Object { $_.supported_generation_methods -contains 'generateContent' } |
            ForEach-Object { $_.name -replace '^models/', '' }
    )

    $openAiModel = @('gpt-5.6-luna', 'gpt-5.6-terra') |
        Where-Object { $openAiModelIds -contains $_ } |
        Select-Object -First 1
    $geminiModel = @('gemini-2.5-flash-lite') |
        Where-Object { $geminiGenerateModelIds -contains $_ } |
        Select-Object -First 1

    $openAiProbes = [System.Collections.Generic.List[object]]::new()
    $geminiProbes = [System.Collections.Generic.List[object]]::new()
    if ($openAiInventoryHttp.http_status -eq 200 -and $null -ne $openAiModel) {
        $openAiEndpoint = 'https://api.openai.com/v1/responses'
        $openAiStructuredBody = [ordered]@{
            model = $openAiModel
            input = 'Return the capability-check object with ok=true and provider=OpenAI.'
            reasoning = @{ effort = 'none' }
            max_output_tokens = 96
            text = @{
                verbosity = 'low'
                format = @{
                    type = 'json_schema'
                    name = 'm1_capability_check'
                    strict = $true
                    schema = [ordered]@{
                        type = 'object'
                        properties = [ordered]@{
                            ok = @{ type = 'boolean' }
                            provider = @{ type = 'string'; enum = @('OpenAI') }
                        }
                        required = @('ok', 'provider')
                        additionalProperties = $false
                    }
                }
            }
        }
        $openAiStructuredHttp = Invoke-GenerationWithRetry -Provider openai -Credential $openAiEntry -Uri $openAiEndpoint -Body $openAiStructuredBody
        $openAiStructuredText = Get-OpenAiText $openAiStructuredHttp.data
        $openAiStructuredValid = Test-ProbeSchema -Text $openAiStructuredText -ExpectedProvider OpenAI
        $openAiProbes.Add((New-ProbeEvidence -Capability 'structured_outputs' -RequestedModel $openAiModel -Endpoint 'POST /v1/responses' -HttpResult $openAiStructuredHttp -Provider openai -SchemaValid $openAiStructuredValid))
        $openAiStructuredText = $null
        $openAiStructuredHttp.data = $null
        $openAiStructuredBody = $null

        $openAiSearchBody = [ordered]@{
            model = $openAiModel
            input = 'Use web search. In one short sentence, state the date the Eiffel Tower opened to the public and cite the official Eiffel Tower website.'
            reasoning = @{ effort = 'none' }
            max_output_tokens = 192
            max_tool_calls = 1
            tools = @(
                @{
                    type = 'web_search'
                    search_context_size = 'low'
                    filters = @{ allowed_domains = @('toureiffel.paris') }
                }
            )
            tool_choice = 'required'
            include = @('web_search_call.action.sources')
            text = @{ verbosity = 'low' }
        }
        $openAiSearchHttp = Invoke-GenerationWithRetry -Provider openai -Credential $openAiEntry -Uri $openAiEndpoint -Body $openAiSearchBody
        $openAiSearch = Get-OpenAiSearchEvidence $openAiSearchHttp.data
        $openAiProbes.Add((New-ProbeEvidence -Capability 'web_search' -RequestedModel $openAiModel -Endpoint 'POST /v1/responses' -HttpResult $openAiSearchHttp -Provider openai -SearchExecuted $openAiSearch.executed -CitationCount $openAiSearch.citation_count -Urls $openAiSearch.urls -BillableSearches $openAiSearch.search_call_count))
        $openAiSearchHttp.data = $null
        $openAiSearchBody = $null
    }

    if ($geminiInventoryHttp.http_status -eq 200 -and $null -ne $geminiModel) {
        $geminiEndpoint = "https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent"
        $geminiStructuredBody = [ordered]@{
            contents = @(
                @{ role = 'user'; parts = @(@{ text = 'Return the capability-check object with ok=true and provider=Gemini.' }) }
            )
            generationConfig = [ordered]@{
                maxOutputTokens = 96
                responseMimeType = 'application/json'
                responseJsonSchema = [ordered]@{
                    type = 'object'
                    properties = [ordered]@{
                        ok = @{ type = 'boolean' }
                        provider = @{ type = 'string'; enum = @('Gemini') }
                    }
                    required = @('ok', 'provider')
                    additionalProperties = $false
                }
            }
        }
        $geminiStructuredHttp = Invoke-GenerationWithRetry -Provider gemini -Credential $geminiEntry -Uri $geminiEndpoint -Body $geminiStructuredBody
        $geminiStructuredText = Get-GeminiText $geminiStructuredHttp.data
        $geminiStructuredValid = Test-ProbeSchema -Text $geminiStructuredText -ExpectedProvider Gemini
        $geminiProbes.Add((New-ProbeEvidence -Capability 'structured_outputs' -RequestedModel $geminiModel -Endpoint "POST /v1beta/models/${geminiModel}:generateContent" -HttpResult $geminiStructuredHttp -Provider gemini -SchemaValid $geminiStructuredValid))
        $geminiStructuredText = $null
        $geminiStructuredHttp.data = $null
        $geminiStructuredBody = $null

        $geminiSearchBody = [ordered]@{
            contents = @(
                @{ role = 'user'; parts = @(@{ text = 'Use Google Search exactly once. In one short sentence, state the date the Eiffel Tower opened to the public and cite the official Eiffel Tower website.' }) }
            )
            tools = @(@{ google_search = @{} })
            generationConfig = [ordered]@{
                maxOutputTokens = 192
            }
        }
        $geminiSearchHttp = Invoke-GenerationWithRetry -Provider gemini -Credential $geminiEntry -Uri $geminiEndpoint -Body $geminiSearchBody
        $geminiSearch = Get-GeminiSearchEvidence $geminiSearchHttp.data
        $geminiBillableSearches = if ($geminiSearch.executed) { 1 } else { 0 }
        $geminiProbes.Add((New-ProbeEvidence -Capability 'google_search' -RequestedModel $geminiModel -Endpoint "POST /v1beta/models/${geminiModel}:generateContent" -HttpResult $geminiSearchHttp -Provider gemini -SearchExecuted $geminiSearch.executed -CitationCount $geminiSearch.citation_count -Urls $geminiSearch.urls -BillableSearches $geminiBillableSearches))
        $geminiSearchHttp.data = $null
        $geminiSearchBody = $null
    }

    $openAiInventory = [ordered]@{
        endpoint = 'GET /v1/models'
        http_status = $openAiInventoryHttp.http_status
        application_status = if ($openAiInventoryHttp.http_status -eq 200) { 'completed' } else { 'failed' }
        latency_ms = $openAiInventoryHttp.latency_ms
        model_count = $openAiModelIds.Count
        accessible_model_ids = $openAiModelIds
        error = $openAiInventoryHttp.error
    }
    $geminiInventory = [ordered]@{
        endpoint = 'GET /v1beta/models?pageSize=1000'
        http_status = $geminiInventoryHttp.http_status
        application_status = if ($geminiInventoryHttp.http_status -eq 200) { 'completed' } else { 'failed' }
        latency_ms = $geminiInventoryHttp.latency_ms
        model_count = $geminiModels.Count
        models = $geminiModels
        error = $geminiInventoryHttp.error
    }
    $openAiInventoryHttp.data = $null
    $geminiInventoryHttp.data = $null

    $openAiGenerationSucceeded = @($openAiProbes | Where-Object { Test-GenerationSuccess $_ }).Count -gt 0
    $geminiGenerationSucceeded = @($geminiProbes | Where-Object { Test-GenerationSuccess $_ }).Count -gt 0
    $openAiStructuredSucceeded = @($openAiProbes | Where-Object { $_.capability -eq 'structured_outputs' -and $_.schema_valid }).Count -gt 0
    $geminiStructuredSucceeded = @($geminiProbes | Where-Object { $_.capability -eq 'structured_outputs' -and $_.schema_valid }).Count -gt 0
    $openAiSearchSucceeded = @($openAiProbes | Where-Object { $_.capability -eq 'web_search' -and $_.search_executed -and $_.urls.Count -gt 0 }).Count -gt 0
    $geminiSearchSucceeded = @($geminiProbes | Where-Object { $_.capability -eq 'google_search' -and $_.search_executed -and $_.urls.Count -gt 0 }).Count -gt 0
    $openAiFullPath = $openAiGenerationSucceeded -and $openAiStructuredSucceeded -and $openAiSearchSucceeded
    $geminiFullPath = $geminiGenerationSucceeded -and $geminiStructuredSucceeded -and $geminiSearchSucceeded

    $allProbes = @($openAiProbes) + @($geminiProbes)
    $costs = @($allProbes | ForEach-Object { $_.estimated_cost_usd } | Where-Object { $null -ne $_ })
    $totalEstimatedCost = if ($costs.Count -eq 0) { 0 } else { [math]::Round(($costs | Measure-Object -Sum).Sum, 8) }
    $bothAuthenticated = ($openAiInventoryHttp.http_status -eq 200 -and $geminiInventoryHttp.http_status -eq 200)
    $minimumValidated = ($bothAuthenticated -and
        $openAiGenerationSucceeded -and
        $geminiGenerationSucceeded -and
        ($openAiStructuredSucceeded -or $geminiStructuredSucceeded) -and
        ($openAiSearchSucceeded -or $geminiSearchSucceeded) -and
        $totalEstimatedCost -lt 1)
    $allTargetedSucceeded = ($openAiStructuredSucceeded -and $geminiStructuredSucceeded -and $openAiSearchSucceeded -and $geminiSearchSucceeded)
    $decision = if ($minimumValidated -and $allTargetedSucceeded) {
        'M1_VALIDATED'
    } elseif ($bothAuthenticated -and ($openAiFullPath -or $geminiFullPath) -and $openAiGenerationSucceeded -and $geminiGenerationSucceeded -and $totalEstimatedCost -lt 1) {
        'M1_VALIDATED_WITH_LIMITATION'
    } else {
        'M1_BLOCKED'
    }

    $result = [ordered]@{
        schema_version = '1.0'
        audit = 'M1-R1-SECURE-RESUME'
        observed_at_utc = [DateTime]::UtcNow.ToString('o')
        status = $decision
        store_validation = [ordered]@{
            location = 'external_dpapi'
            OPENAI_API_KEY = 'PRESENT'
            GEMINI_API_KEY = 'PRESENT'
        }
        safeguards = [ordered]@{
            generation_call_limit = $script:maxGenerationCalls
            max_output_tokens_per_probe = 192
            reasoning = 'none_or_minimal'
            background_jobs = $false
            deep_research_models = $false
            theoretical_cost_ceiling_usd = 0.60
        }
        call_counts = [ordered]@{
            inventory = $script:inventoryCallCount
            generation = $script:generationCallCount
            retries = @($script:providerRetryUsed.Values | Where-Object { $_ }).Count
            total_http = $script:httpCallCount
            by_provider_generation = [ordered]@{
                openai = $script:providerGenerationCalls.openai
                gemini = $script:providerGenerationCalls.gemini
            }
        }
        documentation = [ordered]@{
            checked_on = '2026-08-26'
            urls = @(
                'https://developers.openai.com/api/reference/resources/models',
                'https://developers.openai.com/api/reference/resources/responses/methods/create',
                'https://developers.openai.com/api/docs/guides/structured-outputs',
                'https://developers.openai.com/api/docs/guides/tools-web-search',
                'https://developers.openai.com/api/docs/pricing',
                'https://developers.openai.com/api/docs/models/gpt-5.6-luna',
                'https://ai.google.dev/api/models',
                'https://ai.google.dev/api/generate-content',
                'https://ai.google.dev/gemini-api/docs/structured-output',
                'https://ai.google.dev/gemini-api/docs/generate-content/google-search',
                'https://ai.google.dev/gemini-api/docs/pricing',
                'https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite',
                'https://ai.google.dev/gemini-api/docs/deprecations'
            )
        }
        providers = [ordered]@{
            openai = [ordered]@{
                authentication = if ($openAiInventoryHttp.http_status -eq 200) { 'AUTHENTICATED' } else { 'FAILED' }
                selected_model = $openAiModel
                inventory = $openAiInventory
                probes = @($openAiProbes)
            }
            gemini = [ordered]@{
                authentication = if ($geminiInventoryHttp.http_status -eq 200) { 'AUTHENTICATED' } else { 'FAILED' }
                selected_model = $geminiModel
                inventory = $geminiInventory
                probes = @($geminiProbes)
            }
        }
        totals = [ordered]@{
            estimated_cost_usd = $totalEstimatedCost
            under_one_usd = ($totalEstimatedCost -lt 1)
        }
    }

    Write-SanitizedResult $result
    Write-Output $decision
    Write-Output "HTTP_CALLS=$($script:httpCallCount)"
    Write-Output "GENERATION_CALLS=$($script:generationCallCount)"
    Write-Output "ESTIMATED_COST_USD=$totalEstimatedCost"
} catch {
    if ($_.Exception.Message -eq 'SECRET_STORE_INVALID') {
        Write-Output 'M1_BLOCKED_SECRET_STORE'
        exit 42
    }
    Write-Output 'M1_BLOCKED'
    exit 1
} finally {
    $raw = $null
    if ($null -ne $client) { $client.Dispose() }
    if ($null -ne $openAiEntry -and $null -ne $openAiEntry.Password) {
        $openAiEntry.Password.Dispose()
    }
    if ($null -ne $geminiEntry -and $null -ne $geminiEntry.Password) {
        $geminiEntry.Password.Dispose()
    }
    if ($null -ne $loadedEntries) {
        for ($index = 0; $index -lt $loadedEntries.Count; $index++) { $loadedEntries[$index] = $null }
    }
    $openAiEntry = $null
    $geminiEntry = $null
    $loadedEntries = $null
    $resolvedStore = $null
    $StorePath = $null
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
