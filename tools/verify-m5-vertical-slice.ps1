$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repoRoot = Split-Path -Parent $PSScriptRoot
$script:negativeMutationCount = 0

function Assert-M5 {
    param([bool]$Condition, [string]$Finding)
    if (-not $Condition) { throw "M5_VERIFY_FAILED: $Finding" }
}

function Get-Sha256 {
    param([Parameter(Mandatory)][string]$Path)
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Get-TextSha256 {
    param([Parameter(Mandatory)][string]$Text)
    $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($Text)
    try {
        $digest = [System.Security.Cryptography.SHA256]::HashData($bytes)
        return [Convert]::ToHexString($digest).ToLowerInvariant()
    } finally {
        [Array]::Clear($bytes, 0, $bytes.Length)
    }
}

function Copy-JsonValue {
    param([Parameter(Mandatory)][object]$Value)
    return ($Value | ConvertTo-Json -Depth 100 -Compress | ConvertFrom-Json -Depth 100)
}

function Set-JsonProperty {
    param(
        [Parameter(Mandatory)][object]$Value,
        [Parameter(Mandatory)][string]$Name,
        [AllowNull()][object]$NewValue
    )
    $property = $Value.PSObject.Properties[$Name]
    Assert-M5 ($null -ne $property) "JSON property is missing: $Name"
    $property.Value = $NewValue
}

function Assert-NegativeMutation {
    param([Parameter(Mandatory)][string]$Name, [bool]$Accepted)
    Assert-M5 (-not $Accepted) "negative mutation was accepted: $Name"
    $script:negativeMutationCount += 1
    Write-Output "M5_NEGATIVE_MUTATION_REJECTED: $Name"
}

function Test-ProviderConfigurationSource {
    param([Parameter(Mandatory)][string]$Text)
    return (
        [regex]::Matches($Text, 'maxToolCalls\s*:').Count -eq 1 -and
        $Text -match 'maxToolCalls:\s*2\b' -and
        [regex]::Matches($Text, 'parallelToolCalls\s*:').Count -eq 1 -and
        $Text -match 'parallelToolCalls:\s*false\b' -and
        $Text -notmatch 'parallelToolCalls:\s*true\b' -and
        $Text -match 'maxRetries:\s*0\b' -and
        $Text -match 'maxOutputTokens:\s*700\b' -and
        $Text -match 'store:\s*false\b'
    )
}

function Test-NormalizationContractSource {
    param(
        [Parameter(Mandatory)][string]$MetadataText,
        [Parameter(Mandatory)][string]$TypesText
    )
    $requiredMetadataPatterns = @(
        'ProviderWebSearchAction\["actionType"\]',
        'action\.type === "search"',
        'action\.type === "openPage"',
        'action\.type === "findInPage"',
        'return "search"',
        'return "open_page"',
        'return "find_in_page"',
        'const observations = new Map<',
        'actionTypes: new Set<ProviderWebSearchAction\["actionType"\]>',
        'observation\.actionTypes\.add\(actionType\)',
        'observation\.actionTypes\.size !== 1',
        'observation\.sourceViews\.size !== 1',
        'const uniqueIds = new Set\(\[\.\.\.callIds, \.\.\.observations\.keys\(\)\]\)',
        'queryCount > 1',
        '\? "web_search_not_unique"',
        'inspectionCount > 1',
        'actionCount !== queryCount \+ inspectionCount',
        '\(actionCount !== 1 && actionCount !== 2\)',
        'uniqueCallCount: uniqueIds\.size'
    )
    foreach ($pattern in $requiredMetadataPatterns) {
        if ($MetadataText -notmatch $pattern) { return $false }
    }
    return $TypesText -match 'actionType: "search" \| "open_page" \| "find_in_page"'
}

function Test-SourceBindingContractSource {
    param(
        [Parameter(Mandatory)][string]$MetadataText,
        [Parameter(Mandatory)][string]$TypesText,
        [Parameter(Mandatory)][string]$SourceSecurityText,
        [Parameter(Mandatory)][string]$SourceContentText
    )
    $citationPriority = $MetadataText.IndexOf('if (result.citations.length > 0)', [System.StringComparison]::Ordinal)
    $searchSourcePriority = $MetadataText.IndexOf('const webSearchCalls = result.webSearchCalls ?? [];', [System.StringComparison]::Ordinal)
    $inspectionPriority = $MetadataText.IndexOf('const actions = result.webSearchActions ?? [];', [System.StringComparison]::Ordinal)
    if (
        $citationPriority -lt 0 -or
        $searchSourcePriority -le $citationPriority -or
        $inspectionPriority -le $searchSourcePriority
    ) { return $false }

    $requiredMetadataPatterns = @(
        'return bindUrlCitation\(result, candidate\)',
        'webSearchCalls\.length > 1',
        'const matches = call\.sources\.filter\(',
        'validateSourceUrl\(url, "citation"\)\.safeHref === structuredUrl\.safeHref',
        'matches\.length !== 1',
        'bindingType: "web_search_source"',
        'actionType === "open_page" \|\| actionType === "find_in_page"',
        'searchActions\.length !== 1 \|\| inspectionActions\.length === 0',
        'inspectionActions\.length !== 1',
        'inspections\.length !== 1 \|\| result\.sources\.length > 0',
        'action\.toolCallId !== inspection\.toolCallId',
        'action\.actionType !== inspection\.actionType',
        'inspection\.urlStatus !== "present"',
        'validateSourceUrl\(inspection\.url, "citation"\)',
        'validateSourceUrl\(candidate\.structuredUrl, "citation"\)',
        'structuredUrl\.safeHref !== inspectionUrl\.safeHref',
        'bindingType: "inspection_action_url"'
    )
    foreach ($pattern in $requiredMetadataPatterns) {
        if ($MetadataText -notmatch $pattern) { return $false }
    }

    $requiredTypePatterns = @(
        'export interface ProviderInspectionActionUrlBinding',
        'readonly bindingType: "inspection_action_url"',
        'readonly actionType: "open_page" \| "find_in_page"',
        '\| ProviderInspectionActionUrlBinding;',
        'readonly urlStatus: "present";\s*readonly url: string;',
        'readonly urlStatus: "missing" \| "invalid" \| "ambiguous";\s*readonly url\?: never;'
    )
    foreach ($pattern in $requiredTypePatterns) {
        if ($TypesText -notmatch $pattern) { return $false }
    }

    return (
        $SourceSecurityText -match 'url\.protocol !== "https:"' -and
        $SourceSecurityText -match 'url\.username !== "" \|\| url\.password !== ""' -and
        $SourceSecurityText -match 'citation\.safeHref !== structured\.safeHref' -and
        $SourceContentText -match 'validateCitationAndStructuredUrl\(\s*request\.citation\.url,\s*request\.candidate\.structuredUrl,\s*\)'
    )
}

function Test-ServiceAdmissionSource {
    param([Parameter(Mandatory)][string]$Text)
    $requiredPatterns = @(
        'result\.webSearchQueryCount > 1',
        'result\.webSearchActionPolicyCode === "web_search_not_unique"',
        'result\.webSearchQueryCount === 1',
        'result\.webSearchInspectionCount === 0',
        'result\.webSearchInspectionCount === 1',
        'result\.webSearchActionCount ===\s*\r?\n?\s*result\.webSearchQueryCount \+ result\.webSearchInspectionCount',
        'result\.webSearchActionCount === 1 \|\| result\.webSearchActionCount === 2',
        'result\.webSearchUniqueCallCount === result\.webSearchActionCount',
        'result\.toolCalls === result\.webSearchActionCount',
        'actions\.length === result\.webSearchActionCount',
        'actionQueryCount === result\.webSearchQueryCount',
        'actionInspectionCount === result\.webSearchInspectionCount',
        'new Set\(actions\.map\(\(\{ toolCallId \}\) => toolCallId\)\)\.size'
    )
    foreach ($pattern in $requiredPatterns) {
        if ($Text -notmatch $pattern) { return $false }
    }
    return $true
}

function Test-BillingContractSource {
    param(
        [Parameter(Mandatory)][string]$ServiceText,
        [Parameter(Mandatory)][string]$ProviderText,
        [Parameter(Mandatory)][string]$ProbeText
    )
    return (
        $ServiceText -match 'webSearchUsdPerCall:\s*0\.01 as const' -and
        $ServiceText -match 'result\.toolCalls \* PRICING\.webSearchUsdPerCall' -and
        $ServiceText -match 'Number\(amount\.toFixed\(8\)\)' -and
        $ServiceText -match 'Web Search facturé conservativement 0,01 USD par action observée' -and
        $ProviderText -match 'toolCalls: normalizedMetadata\.webSearchActionCount' -and
        $ProbeText -match '\$costCeilingUsd = 0\.05' -and
        $ProbeText -match 'estimatedCostUsd -and \$final\.receipt\.estimatedCostUsd -le \$costCeilingUsd'
    )
}

function Test-FailureReceiptContractSource {
    param(
        [Parameter(Mandatory)][string]$FailureReceiptText,
        [Parameter(Mandatory)][string]$TypesText
    )
    $requiredPatterns = @(
        'FAILURE_REASON_CODES\.includes\(code as FailureReasonCode\)',
        'CONTENT_TYPE_REJECTION_REASON_CODES\.includes\(diagnostics\.reasonCode\)',
        'SOURCE_MEDIA_TYPE_CLASSES\.includes\(diagnostics\.sourceMediaTypeClass\)',
        'requestIdDigest:\s*clearRequestId === null \? null : digestProviderRequestId\(clearRequestId\)',
        'estimatedCostUsd: null',
        'return \{\s*attemptId: context\.attemptId,',
        'receiptPersistence: context\.receiptPersistence \?\? "memory"'
    )
    foreach ($pattern in $requiredPatterns) {
        if ($FailureReceiptText -notmatch $pattern) { return $false }
    }

    $receiptType = [regex]::Match(
        $TypesText,
        'export interface FailureReceipt \{(?<body>[\s\S]*?)\r?\n\}'
    )
    if (-not $receiptType.Success) { return $false }
    $body = $receiptType.Groups['body'].Value
    foreach ($forbiddenField in @('raw', 'payload', 'url', 'content', 'toolCallId', 'sourceId', 'requestId')) {
        if ($body -match "readonly\s+$forbiddenField\s*[?:]") { return $false }
    }
    return (
        $body -match 'readonly reasonCode: FailureReasonCode \| null' -and
        $body -match 'readonly sourceMediaTypeClass: SourceMediaTypeClass \| null' -and
        $body -match 'readonly requestIdPresent: boolean' -and
        $body -match 'readonly requestIdDigest: string \| null'
    )
}

function Get-NormalizedActionSnapshot {
    param([Parameter(Mandatory)][object[]]$RawActions)
    $invalid = $false
    $byId = @{}
    foreach ($raw in $RawActions) {
        $id = if ($null -eq $raw.PSObject.Properties['id']) { '' } else { [string]$raw.id }
        $type = if ($null -eq $raw.PSObject.Properties['type']) { '' } else { [string]$raw.type }
        $publicType = switch -CaseSensitive ($type) {
            'search' { 'search'; break }
            'openPage' { 'open_page'; break }
            'findInPage' { 'find_in_page'; break }
            default { $null }
        }
        if ([string]::IsNullOrWhiteSpace($id) -or $null -eq $publicType) {
            $invalid = $true
            continue
        }
        if (-not $byId.ContainsKey($id)) {
            $byId[$id] = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
        }
        [void]$byId[$id].Add($publicType)
    }

    $actions = [System.Collections.Generic.List[object]]::new()
    foreach ($id in @($byId.Keys | Sort-Object)) {
        $types = $byId[$id]
        if ($types.Count -ne 1) {
            $invalid = $true
            continue
        }
        $actions.Add([pscustomobject]@{
            toolCallId = $id
            actionType = @($types)[0]
        })
    }
    $queryCount = @($actions | Where-Object actionType -CEQ 'search').Count
    $inspectionCount = @($actions | Where-Object { $_.actionType -in @('open_page', 'find_in_page') }).Count
    $actionCount = $actions.Count
    $policyCode = if ($queryCount -gt 1) {
        'web_search_not_unique'
    } elseif (
        $invalid -or
        $queryCount -ne 1 -or
        $inspectionCount -gt 1 -or
        $actionCount -ne ($queryCount + $inspectionCount) -or
        $actionCount -notin @(1, 2)
    ) {
        'web_search_action_invalid'
    } else {
        $null
    }
    return [pscustomobject]@{
        webSearchActions = @($actions)
        webSearchActionCount = $actionCount
        webSearchQueryCount = $queryCount
        webSearchInspectionCount = $inspectionCount
        webSearchUniqueCallCount = $byId.Count
        webSearchActionPolicyStatus = if ($null -eq $policyCode) { 'supported' } else { 'rejected' }
        webSearchActionPolicyCode = $policyCode
        toolCalls = $actionCount
    }
}

function Test-AdmissionSnapshot {
    param([Parameter(Mandatory)][object]$Snapshot)
    $actions = @($Snapshot.webSearchActions)
    $counts = @(
        $Snapshot.webSearchActionCount,
        $Snapshot.webSearchQueryCount,
        $Snapshot.webSearchInspectionCount,
        $Snapshot.webSearchUniqueCallCount,
        $Snapshot.toolCalls
    )
    $integerCounts = @($counts | Where-Object {
        ($_ -is [int] -or $_ -is [long]) -and $_ -ge 0
    }).Count -eq $counts.Count
    $queryCount = @($actions | Where-Object actionType -CEQ 'search').Count
    $inspectionCount = @($actions | Where-Object { $_.actionType -in @('open_page', 'find_in_page') }).Count
    $allowedActions = @($actions | Where-Object { $_.actionType -in @('search', 'open_page', 'find_in_page') }).Count -eq $actions.Count
    return (
        $integerCounts -and
        $allowedActions -and
        $Snapshot.webSearchActionPolicyStatus -ceq 'supported' -and
        $null -eq $Snapshot.webSearchActionPolicyCode -and
        $Snapshot.webSearchQueryCount -eq 1 -and
        $Snapshot.webSearchInspectionCount -in @(0, 1) -and
        $Snapshot.webSearchActionCount -eq ($Snapshot.webSearchQueryCount + $Snapshot.webSearchInspectionCount) -and
        $Snapshot.webSearchActionCount -in @(1, 2) -and
        $Snapshot.webSearchUniqueCallCount -eq $Snapshot.webSearchActionCount -and
        $Snapshot.toolCalls -eq $Snapshot.webSearchActionCount -and
        $actions.Count -eq $Snapshot.webSearchActionCount -and
        $queryCount -eq $Snapshot.webSearchQueryCount -and
        $inspectionCount -eq $Snapshot.webSearchInspectionCount -and
        @($actions.toolCallId | Sort-Object -Unique).Count -eq $Snapshot.webSearchUniqueCallCount
    )
}

function Get-EstimatedCostUsd {
    param(
        [long]$InputTokens,
        [long]$CachedInputTokens,
        [long]$OutputTokens,
        [int]$ActionCount
    )
    if (
        $InputTokens -lt 0 -or
        $CachedInputTokens -lt 0 -or
        $CachedInputTokens -gt $InputTokens -or
        $OutputTokens -lt 0 -or
        $ActionCount -notin @(1, 2)
    ) { return $null }
    $uncached = $InputTokens - $CachedInputTokens
    $amount =
        ($uncached * 0.2) / 1000000 +
        ($CachedInputTokens * 0.02) / 1000000 +
        ($OutputTokens * 1.2) / 1000000 +
        $ActionCount * 0.01
    return [Math]::Round($amount, 8)
}

function Test-ExactObjectProperties {
    param(
        [Parameter(Mandatory)][object]$Value,
        [Parameter(Mandatory)][string[]]$Expected
    )
    $actualNames = @($Value.PSObject.Properties.Name | Sort-Object)
    $expectedNames = @($Expected | Sort-Object)
    return ($actualNames -join ',') -ceq ($expectedNames -join ',')
}

function Test-EvidenceRedaction {
    param(
        [Parameter(Mandatory)][object]$Evidence,
        [Parameter(Mandatory)][string]$RawJson
    )
    if (
        $Evidence.secret_store -cne 'external_dpapi' -or
        $Evidence.secret_value_exposed -ne $false -or
        [regex]::Matches($RawJson, '"secret_store"\s*:\s*"external_dpapi"').Count -ne 1
    ) { return $false }
    if (-not (Test-ExactObjectProperties -Value $Evidence.diagnostic -Expected @(
        'terminal',
        'action_policy',
        'source_verification',
        'title_verification',
        'm2'
    ))) { return $false }
    if (
        $Evidence.diagnostic.terminal -cne 'completed' -or
        $Evidence.diagnostic.action_policy -cne 'admitted' -or
        $Evidence.diagnostic.source_verification -cne 'validated' -or
        $Evidence.diagnostic.title_verification -cne 'validated' -or
        $Evidence.diagnostic.m2 -cne 'valid'
    ) { return $false }

    $receipt = $Evidence.receipt
    if (-not (Test-ExactObjectProperties -Value $receipt -Expected @(
        'executionId',
        'provider',
        'model',
        'purpose',
        'providerHttpCalls',
        'toolCalls',
        'webSearchQueryCount',
        'webSearchInspectionCount',
        'sourceFetchCount',
        'inputTokens',
        'cachedInputTokens',
        'outputTokens',
        'reasoningTokens',
        'totalTokens',
        'sourceCount',
        'durations',
        'timedOutOrCancelled',
        'finalStatus',
        'pricing',
        'estimatedCostUsd',
        'costLimitations'
    ))) { return $false }
    if (-not (Test-ExactObjectProperties -Value $receipt.durations -Expected @(
        'acceptedMs',
        'searchingMs',
        'sourceVerifyingMs',
        'validatingMs',
        'totalMs'
    ))) { return $false }
    if (-not (Test-ExactObjectProperties -Value $receipt.pricing -Expected @(
        'date',
        'inputUsdPerMillion',
        'cachedInputUsdPerMillion',
        'outputUsdPerMillion',
        'webSearchUsdPerCall'
    ))) { return $false }
    if ([string]$receipt.executionId -notmatch '^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$') { return $false }
    $receiptRaw = $receipt | ConvertTo-Json -Depth 100 -Compress
    if (
        $receiptRaw -match '(?i)https?://' -or
        $receiptRaw -match '(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{12,}' -or
        $receiptRaw -match 'sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}' -or
        $receiptRaw -match 'AIza[0-9A-Za-z_-]{20,}'
    ) { return $false }
    $forbiddenPatterns = @(
        'sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}',
        'AIza[0-9A-Za-z_-]{20,}',
        '-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----',
        '(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{12,}',
        '(?i)"(?:authorization|requestBodyValues|responseBody|responseHeaders|prompt|cookie|stack|cause|requestId)"\s*:'
    )
    foreach ($pattern in $forbiddenPatterns) {
        if ($RawJson -match $pattern) { return $false }
    }
    return $true
}

function Test-Attempt009 {
    param(
        [Parameter(Mandatory)][object]$Evidence,
        [Parameter(Mandatory)][string]$RawJson
    )
    try {
        if ($Evidence.attempt -cne 'attempt-009') { return $false }
        if ($Evidence.status -cne 'M5_R3_LIVE_ATTEMPT_009_COMPLETED_READY_FOR_EXTERNAL_AUDIT') { return $false }
        if ((@($Evidence.events.state) -join '>') -cne 'accepted>searching>source_verifying>validating>completed') { return $false }
        $previousElapsed = -1L
        foreach ($event in @($Evidence.events)) {
            if ($event.elapsed_ms -isnot [long] -or $event.elapsed_ms -lt $previousElapsed) { return $false }
            $previousElapsed = $event.elapsed_ms
        }
        if ($Evidence.provider_binding_type -cne 'openai_unique_source_binding') { return $false }
        if ($Evidence.diagnostic.terminal -cne 'completed' -or $Evidence.diagnostic.action_policy -cne 'admitted') { return $false }
        if ($Evidence.diagnostic.source_verification -cne 'validated' -or $Evidence.diagnostic.title_verification -cne 'validated') { return $false }
        if ($Evidence.diagnostic.m2 -cne 'valid' -or $Evidence.m2_schema_valid -ne $true) { return $false }
        $claim = [string]$Evidence.claim
        if ($claim.Length -lt 10 -or $claim.Length -gt 200 -or $claim -match '[;:\r\n]') { return $false }
        if ([string]::IsNullOrWhiteSpace([string]$Evidence.source.title)) { return $false }
        $excerpt = [string]$Evidence.source.exact_excerpt
        $locator = $Evidence.source.locator
        if ([string]::IsNullOrWhiteSpace($excerpt) -or $excerpt.Length -gt 500) { return $false }
        if ($locator.exact -cne $excerpt -or $locator.matchMode -cne 'exact' -or $locator.occurrenceIndex -ne 0) { return $false }
        if (([string]$locator.prefix).Length -gt 16 -or ([string]$locator.suffix).Length -gt 16) { return $false }
        if ($locator.contentType -notmatch '^text/html; charset=utf-8$') { return $false }
        if ($Evidence.source.media_type -cne 'text/html') { return $false }
        if ($locator.normalizedTextSha256 -notmatch '^[a-f0-9]{64}$') { return $false }
        if ($locator.bytesRead -isnot [long] -or $locator.bytesRead -le 0 -or $locator.redirectCount -ne 0) { return $false }
        $citationUri = [uri]$locator.citationUrl
        $finalUri = [uri]$locator.finalUrl
        if (
            -not $citationUri.IsAbsoluteUri -or
            -not $finalUri.IsAbsoluteUri -or
            $citationUri.Scheme -cne 'https' -or
            $finalUri.Scheme -cne 'https' -or
            -not [string]::IsNullOrEmpty($citationUri.UserInfo) -or
            -not [string]::IsNullOrEmpty($finalUri.UserInfo)
        ) { return $false }
        if ($locator.citationUrl -cne $Evidence.source.url -or $locator.finalUrl -cne $Evidence.source.url) { return $false }
        $uniqueBoundUrls = @(
            @($Evidence.source.url, $locator.citationUrl, $locator.finalUrl) |
                Sort-Object -Unique
        )
        if ($uniqueBoundUrls.Count -ne 1) { return $false }
        $receipt = $Evidence.receipt
        if ($receipt.provider -cne 'OpenAI' -or $receipt.model -cne 'gpt-5.6-luna') { return $false }
        if ($receipt.providerHttpCalls -ne 1 -or $receipt.toolCalls -ne 2) { return $false }
        if ($receipt.webSearchQueryCount -ne 1 -or $receipt.webSearchInspectionCount -ne 1) { return $false }
        if ($receipt.sourceFetchCount -ne 1 -or $receipt.finalStatus -cne 'completed') { return $false }
        if ($receipt.timedOutOrCancelled -ne $false) { return $false }
        if ($receipt.inputTokens -isnot [long] -or $receipt.cachedInputTokens -isnot [long] -or $receipt.outputTokens -isnot [long] -or $receipt.reasoningTokens -isnot [long] -or $receipt.totalTokens -isnot [long]) { return $false }
        if ($receipt.inputTokens + $receipt.outputTokens -ne $receipt.totalTokens) { return $false }
        if ($receipt.reasoningTokens -lt 0 -or $receipt.reasoningTokens -gt $receipt.outputTokens) { return $false }
        $expectedCost = Get-EstimatedCostUsd -InputTokens $receipt.inputTokens -CachedInputTokens $receipt.cachedInputTokens -OutputTokens $receipt.outputTokens -ActionCount $receipt.toolCalls
        if ($null -eq $expectedCost -or [double]$receipt.estimatedCostUsd -ne [double]$expectedCost) { return $false }
        if ([double]$receipt.estimatedCostUsd -ne 0.023021) { return $false }
        if ([double]$receipt.estimatedCostUsd -gt 0.05 -or [double]$receipt.estimatedCostUsd -gt [double]$Evidence.cost_ceiling_usd) { return $false }
        if (
            $receipt.pricing.inputUsdPerMillion -ne 0.2 -or
            $receipt.pricing.cachedInputUsdPerMillion -ne 0.02 -or
            $receipt.pricing.outputUsdPerMillion -ne 1.2 -or
            $receipt.pricing.webSearchUsdPerCall -ne 0.01
        ) { return $false }
        if ($Evidence.webSearchActionCount -ne 2 -or $Evidence.webSearchQueryCount -ne 1 -or $Evidence.webSearchInspectionCount -ne 1 -or $Evidence.webSearchUniqueCallCount -ne 2) { return $false }
        if ($Evidence.openai_calls -ne 1 -or $Evidence.web_search_calls -ne 2) { return $false }
        if (
            $receipt.toolCalls -ne $Evidence.webSearchActionCount -or
            $receipt.webSearchQueryCount -ne $Evidence.webSearchQueryCount -or
            $receipt.webSearchInspectionCount -ne $Evidence.webSearchInspectionCount -or
            $Evidence.web_search_calls -ne $Evidence.webSearchActionCount
        ) { return $false }
        if ($Evidence.source_fetches -ne 1 -or $Evidence.source_retrieval_chains -ne 1) { return $false }
        if ($Evidence.provider_retries -ne 0 -or $Evidence.gemini_calls -ne 0) { return $false }
        if ($Evidence.persistence -cne 'file') { return $false }
        if (-not (Test-EvidenceRedaction -Evidence $Evidence -RawJson $RawJson)) { return $false }
        return $true
    } catch {
        return $false
    }
}

function Test-WorkingTreeScanWithExactReceiptExemption {
    param(
        [Parameter(Mandatory)][string]$EvidencePath,
        [Parameter(Mandatory)][string]$EvidenceRaw
    )
    $lines = [regex]::Split($EvidenceRaw, '\r?\n')
    $matchingLines = [System.Collections.Generic.List[int]]::new()
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index].Trim() -ceq '"secret_store": "external_dpapi",') {
            $matchingLines.Add($index + 1)
        }
    }
    if ($matchingLines.Count -ne 1) { return $false }
    $scanPath = Join-Path $repoRoot 'tools/scan-secrets.ps1'
    $scanOutput = (& pwsh -NoProfile -File $scanPath -Mode WorkingTree 2>&1 | Out-String)
    $scanExit = $LASTEXITCODE
    $findings = @(
        [regex]::Matches($scanOutput, 'SECRET_SCAN_FINDING:\s*([^\r\n]+?):(\d+):([a-z-]+)') |
            ForEach-Object {
                '{0}:{1}:{2}' -f
                    $_.Groups[1].Value.Trim().Replace('\', '/'),
                    $_.Groups[2].Value,
                    $_.Groups[3].Value
            }
    )
    $relative = [System.IO.Path]::GetRelativePath($repoRoot, $EvidencePath).Replace('\', '/')
    $expectedFinding = "${relative}:$($matchingLines[0]):nonempty-secret-assignment"
    return (
        $scanExit -eq 1 -and
        $scanOutput -notmatch 'SECRET_SCAN_FAILED:|ParserError|Exception:' -and
        $findings.Count -eq 1 -and
        $findings[0] -ceq $expectedFinding
    )
}

$package = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
$dependencies = @($package.dependencies.PSObject.Properties.Name)
Assert-M5 ('@ai-sdk/openai' -in $dependencies) 'OpenAI AI SDK provider is missing'
Assert-M5 ('@ai-sdk/google' -notin $dependencies) 'Gemini provider remains in runtime dependencies'
Assert-M5 ('@ai-sdk/gateway' -notin $dependencies) 'AI Gateway is forbidden'

$providerPath = Join-Path $repoRoot 'src/server/ai/providers.ts'
$metadataPath = Join-Path $repoRoot 'src/server/research/provider-metadata.ts'
$typesPath = Join-Path $repoRoot 'src/server/research/types.ts'
$sourceContentPath = Join-Path $repoRoot 'src/server/research/source-content.ts'
$sourceSecurityPath = Join-Path $repoRoot 'src/server/research/source-security.ts'
$routePath = Join-Path $repoRoot 'src/app/api/research/route.ts'
$servicePath = Join-Path $repoRoot 'src/server/research/service.ts'
$failureReceiptPath = Join-Path $repoRoot 'src/server/research/failure-receipt.ts'
$uiPath = Join-Path $repoRoot 'src/app/research-form.tsx'
$probePath = Join-Path $repoRoot 'tools/probes/m5-vertical-slice.ps1'
$attempt009Path = Join-Path $repoRoot 'docs/evidence/m5-attempt-009-live-result.json'
foreach ($path in @($providerPath, $metadataPath, $typesPath, $sourceContentPath, $sourceSecurityPath, $routePath, $servicePath, $failureReceiptPath, $uiPath, $probePath, $attempt009Path)) {
    Assert-M5 (Test-Path -LiteralPath $path -PathType Leaf) "runtime file missing: $path"
}

$provider = Get-Content -LiteralPath $providerPath -Raw
$metadata = Get-Content -LiteralPath $metadataPath -Raw
$types = Get-Content -LiteralPath $typesPath -Raw
$sourceContent = Get-Content -LiteralPath $sourceContentPath -Raw
$sourceSecurity = Get-Content -LiteralPath $sourceSecurityPath -Raw
$route = Get-Content -LiteralPath $routePath -Raw
$service = Get-Content -LiteralPath $servicePath -Raw
$failureReceipt = Get-Content -LiteralPath $failureReceiptPath -Raw
$ui = Get-Content -LiteralPath $uiPath -Raw
$probe = Get-Content -LiteralPath $probePath -Raw

Assert-M5 ($provider -match 'import "server-only"') 'provider boundary is not server-only'
Assert-M5 ($provider -match 'provider\.responses\(PRIMARY_RESEARCH_MODEL\)') 'Responses API is not selected directly'
Assert-M5 ($provider -match 'PRIMARY_RESEARCH_MODEL = "gpt-5\.6-luna"') 'model differs from gpt-5.6-luna'
Assert-M5 ($provider -match 'provider\.tools\.webSearch\(') 'OpenAI Web Search tool is absent'
Assert-M5 ($provider -match 'toolChoice: \{ type: "tool", toolName: "web_search" \}') 'Web Search is not forced'
Assert-M5 (Test-ProviderConfigurationSource -Text $provider) 'provider action limits, retry, output, parallelism, or storage differ'
Assert-M5 ($provider -notmatch 'createGoogle|googleSearch|GEMINI') 'Gemini runtime path found'
Assert-M5 (Test-NormalizationContractSource -MetadataText $metadata -TypesText $types) 'action-aware provider metadata normalization differs'
Assert-M5 (Test-SourceBindingContractSource -MetadataText $metadata -TypesText $types -SourceSecurityText $sourceSecurity -SourceContentText $sourceContent) 'provider source binding priority, inspection typing, or public URL contract differs'
Assert-M5 (Test-ServiceAdmissionSource -Text $service) 'action-aware service admission differs'
Assert-M5 (Test-BillingContractSource -ServiceText $service -ProviderText $provider -ProbeText $probe) 'per-action billing or cost ceiling differs'
Assert-M5 (Test-FailureReceiptContractSource -FailureReceiptText $failureReceipt -TypesText $types) 'failure receipt diagnostics or redaction contract differs'
Assert-M5 (
    $sourceContent -match 'if \(matching\.length !== 1\)' -and
    $sourceContent -match 'matchMode = "exact"' -and
    $sourceContent -match 'exact: verifiedExcerpt'
) 'exact unique excerpt proof gate differs'

Assert-M5 ($route -match 'export const runtime = "nodejs"') 'research route is not Node runtime'
Assert-M5 ($route -match 'export const POST') 'POST handler is absent'
Assert-M5 ($route -notmatch 'export (?:async )?function GET|export const GET') 'GET research handler is forbidden'
Assert-M5 ($route -match 'text/event-stream') 'progress stream is absent'
Assert-M5 ($route -match 'serializeResearchEvent' -and $failureReceipt -match 'terminal_serialization_failed') 'terminal serialization fallback is absent'
Assert-M5 ($service -match '"accepted"' -and $service -match '"searching"' -and $service -match '"source_verifying"' -and $service -match '"validating"' -and $service -match '"completed"' -and $service -match '"failed"') 'required progress states are incomplete'
Assert-M5 ($service -match 'validateResearchDossier') 'M2 JSON Schema validator is not used'
Assert-M5 ($service -match 'sourceVerifier\.verify' -and $service -match 'excerpt: proof\.verifiedExcerpt') 'source excerpt truth gate is absent'
Assert-M5 ($service -notmatch 'Extrait source non exposé') 'fabricated source excerpt remains'
Assert-M5 ($failureReceipt -match 'APICallError\.isInstance' -and $failureReceipt -match 'NoObjectGeneratedError\.isInstance' -and $failureReceipt -match 'NoOutputGeneratedError\.isInstance' -and $failureReceipt -match 'RetryError\.isInstance' -and $failureReceipt -match 'LoadAPIKeyError\.isInstance') 'installed AI SDK guards are incomplete'
Assert-M5 ($failureReceipt -match 'requestIdDigest' -and $failureReceipt -match 'digestProviderRequestId') 'request ID digest protection is absent'
Assert-M5 ($probe -match 'Write-AtomicJson' -and $probe -match '\.tmp\.' -and $probe -match '\[System\.IO\.File\]::Move') 'atomic probe persistence is absent'
Assert-M5 ($probe -match 'exactly one terminal event is required') 'probe terminal cardinality gate is absent'
Assert-M5 ($probe -match 'stream_consumption' -and $probe -match 'probe_stream_invalid' -and $probe -match 'fallbackReceipt') 'probe stream/persistence fallback is absent'
Assert-M5 ($ui -match 'Nom de la personne ou organisation') 'public entity field is absent'
Assert-M5 ($ui -match 'Contexte de désambiguïsation') 'public context field is absent'
Assert-M5 ($ui -match 'personne publique ou une organisation publique') 'public-entity privacy warning is absent'
Assert-M5 ($ui -notmatch 'Airbus SE' -and $ui -notmatch 'Mozilla Foundation') 'validation case is hard-coded in the UI'

$envTemplate = @(Get-Content -LiteralPath (Join-Path $repoRoot '.env.example'))
Assert-M5 ($envTemplate.Count -eq 1 -and $envTemplate[0] -eq 'OPENAI_API_KEY=') '.env.example must contain only an empty OpenAI variable'

$attemptPath = Join-Path $repoRoot 'docs/evidence/m5-attempt-001-failure.json'
Assert-M5 (Test-Path -LiteralPath $attemptPath -PathType Leaf) 'attempt 001 immutable failure evidence is missing'
$attempt = Get-Content -LiteralPath $attemptPath -Raw | ConvertFrom-Json
Assert-M5 ($attempt.attempt -eq 1 -and $attempt.model -ceq 'gpt-5.6-luna') 'attempt 001 identity differs'
Assert-M5 ($attempt.calls.openai -eq 1 -and $attempt.calls.gemini -eq 0 -and $attempt.retries -eq 0) 'attempt 001 call facts differ'
Assert-M5 (-not (Compare-Object @('accepted', 'searching', 'validating', 'failed') @($attempt.events) -SyncWindow 0)) 'attempt 001 event sequence differs'
foreach ($field in @('tool_calls', 'usage', 'latency_ms', 'cost_usd', 'claim', 'source', 'exact_error')) {
    Assert-M5 ($null -eq $attempt.$field -and $attempt.knowledge_status.$field -ceq 'UNKNOWN') "attempt 001 unknown field differs: $field"
}

$replayPath = Join-Path $repoRoot 'tests/fixtures/m1-provider-transport-replay.json'
$replay = Get-Content -LiteralPath $replayPath -Raw | ConvertFrom-Json -Depth 100
Assert-M5 ($replay.marker -ceq 'PROVIDER_TRANSPORT_REPLAY — NOT PRODUCT OUTPUT') 'M1 replay marker differs'
Assert-M5 ($replay.retained_counts.web_search_calls -eq 1 -and $replay.retained_counts.url_citations -eq 1 -and $replay.retained_counts.url_union -eq 17) 'M1 retained transport counts differ'
Assert-M5 ('source_excerpt' -in @($replay.not_retained)) 'M1 replay does not expose the truth-contract gap'

$immutableHashes = [ordered]@{
    'docs/evidence/m5-attempt-001-failure.json' = '7f4ef1c935290225c834254005d41e439ccfa9260ae51358ab94cfc6dc663d2a'
    'docs/evidence/m5-attempt-002-live-result.json' = '5a41d8bad3f55a9e82c1c5375c384da0412d5ee7d7fcf18c2ba83b39fc4bfb2d'
    'docs/evidence/m5-attempt-003-live-result.json' = 'ae63d79465ffd3c087144999656b04957c4005fca49b474cee99c486c707aa71'
    'docs/evidence/m5-attempt-004-live-result.json' = '21341a013b006a4f7c6b341c2832720edbff2355ffad66d6bac0094fa34dcef6'
    'docs/evidence/m5-attempt-005-live-result.json' = '0a5940ee8f8e9e01217a12293a774ff574c71e5611c5a4a14aef8d256e761fff'
    'docs/evidence/m5-attempt-006-live-result.json' = '83decc2cc731a86eccf7b0aff7b5ebd66e11718dbb2a9dcaf2c87353ac606c3b'
    'docs/evidence/m5-attempt-007-live-result.json' = '4e80bd3f3836ce8f84e7318ed4f543fdec9b2fa993812c2d6bf9e602b830b526'
    'docs/evidence/m5-attempt-008-live-result.json' = '0ff878a52ab37215088129825b1b3f64ab08f0a94d282792f8cae97f6727756a'
    'docs/evidence/m5-attempt-009-live-result.json' = 'ef74074a5571228303e97ac4b11eb4e7dfd9b49d158342c581c0164e58940b95'
    'docs/evidence/g3-rc-deployment-result.json' = 'f9cbe64471df73a8633a6c0269bb612fc3f240c936ed7b3e023f755495d1fdd7'
    'docs/evidence/g3-rc-live-attempt-002.json' = '3894630d1f8e26e86205eb39ca04b0806e2cff051032ed08d122de1574c71436'
    'tools/probes/m5-vertical-slice.ps1' = 'cacdc19264a825ddf4d8f88421ee3cc3d8525241d78ea3c00759ba4001fdad4a'
    'docs/contracts/research-dossier.schema.json' = '1d90f2e7fda8d9893f48ad047cee402e45d54c8647c9376d08c6ea59774dc3d3'
}
foreach ($entry in $immutableHashes.GetEnumerator()) {
    $path = Join-Path $repoRoot $entry.Key
    Assert-M5 (Test-Path -LiteralPath $path -PathType Leaf) "immutable file is missing: $($entry.Key)"
    Assert-M5 ((Get-Sha256 -Path $path) -ceq $entry.Value) "immutable file differs: $($entry.Key)"
}

$searchOnly = Get-NormalizedActionSnapshot -RawActions @(
    [pscustomobject]@{ id = 'search-1'; type = 'search' }
)
$searchOpenPage = Get-NormalizedActionSnapshot -RawActions @(
    [pscustomobject]@{ id = 'search-1'; type = 'search' },
    [pscustomobject]@{ id = 'inspect-1'; type = 'openPage' }
)
$searchFindInPage = Get-NormalizedActionSnapshot -RawActions @(
    [pscustomobject]@{ id = 'search-1'; type = 'search' },
    [pscustomobject]@{ id = 'inspect-1'; type = 'findInPage' }
)
$deduplicatedSearch = Get-NormalizedActionSnapshot -RawActions @(
    [pscustomobject]@{ id = 'search-1'; type = 'search' },
    [pscustomobject]@{ id = 'search-1'; type = 'search' }
)
Assert-M5 (Test-AdmissionSnapshot -Snapshot $searchOnly) 'search-only action accounting is rejected'
Assert-M5 (Test-AdmissionSnapshot -Snapshot $searchOpenPage) 'search plus openPage action accounting is rejected'
Assert-M5 (Test-AdmissionSnapshot -Snapshot $searchFindInPage) 'search plus findInPage action accounting is rejected'
Assert-M5 (
    (Test-AdmissionSnapshot -Snapshot $deduplicatedSearch) -and
    $deduplicatedSearch.webSearchActionCount -eq 1 -and
    $deduplicatedSearch.webSearchUniqueCallCount -eq 1
) 'same ID/action is not deduplicated'
$publicActionProperties = @($searchOpenPage.webSearchActions[0].PSObject.Properties.Name | Sort-Object)
Assert-M5 (($publicActionProperties -join ',') -ceq 'actionType,toolCallId') 'public action shape exposes non-allowlisted data'
Assert-M5 ((Get-EstimatedCostUsd -InputTokens 0 -CachedInputTokens 0 -OutputTokens 0 -ActionCount 1) -eq 0.01) 'one-action billing differs'
Assert-M5 ((Get-EstimatedCostUsd -InputTokens 0 -CachedInputTokens 0 -OutputTokens 0 -ActionCount 2) -eq 0.02) 'two-action billing differs'
$twoActionConservativeCeiling = Get-EstimatedCostUsd -InputTokens 100000 -CachedInputTokens 0 -OutputTokens 700 -ActionCount 2
Assert-M5 ($null -ne $twoActionConservativeCeiling -and $twoActionConservativeCeiling -lt 0.05) 'two-action conservative cost bound exceeds 0.05 USD'

Assert-NegativeMutation -Name 'maxToolCalls=1' -Accepted (Test-ProviderConfigurationSource -Text $provider.Replace('maxToolCalls: 2', 'maxToolCalls: 1'))
Assert-NegativeMutation -Name 'maxToolCalls=3' -Accepted (Test-ProviderConfigurationSource -Text $provider.Replace('maxToolCalls: 2', 'maxToolCalls: 3'))
Assert-NegativeMutation -Name 'parallelToolCalls=true' -Accepted (Test-ProviderConfigurationSource -Text $provider.Replace('parallelToolCalls: false', 'parallelToolCalls: true'))
Assert-NegativeMutation -Name 'normalization_action_allowlist_removed' -Accepted (Test-NormalizationContractSource -MetadataText $metadata.Replace('if (action.type === "openPage")', 'if (action.type === "openWindow")') -TypesText $types)
Assert-NegativeMutation -Name 'normalization_deduplication_removed' -Accepted (Test-NormalizationContractSource -MetadataText $metadata.Replace('actionTypes: new Set<ProviderWebSearchAction["actionType"]>(),', 'actionTypes: [] as never,') -TypesText $types)
Assert-NegativeMutation -Name 'normalization_id_contradiction_admitted' -Accepted (Test-NormalizationContractSource -MetadataText $metadata.Replace('if (observation.actionTypes.size !== 1)', 'if (observation.actionTypes.size > 2)') -TypesText $types)

$zeroSearch = Get-NormalizedActionSnapshot -RawActions @(
    [pscustomobject]@{ id = 'inspect-1'; type = 'openPage' }
)
Assert-NegativeMutation -Name 'zero_search' -Accepted (Test-AdmissionSnapshot -Snapshot $zeroSearch)
$twoSearches = Get-NormalizedActionSnapshot -RawActions @(
    [pscustomobject]@{ id = 'search-1'; type = 'search' },
    [pscustomobject]@{ id = 'search-2'; type = 'search' }
)
Assert-M5 ($twoSearches.webSearchActionPolicyCode -ceq 'web_search_not_unique') 'two searches do not map to web_search_not_unique'
Assert-NegativeMutation -Name 'two_searches' -Accepted (Test-AdmissionSnapshot -Snapshot $twoSearches)
$tooManyActions = Get-NormalizedActionSnapshot -RawActions @(
    [pscustomobject]@{ id = 'search-1'; type = 'search' },
    [pscustomobject]@{ id = 'inspect-1'; type = 'openPage' },
    [pscustomobject]@{ id = 'inspect-2'; type = 'findInPage' }
)
Assert-NegativeMutation -Name 'two_inspections' -Accepted (Test-AdmissionSnapshot -Snapshot $tooManyActions)
Assert-NegativeMutation -Name 'more_than_two_actions' -Accepted (Test-AdmissionSnapshot -Snapshot $tooManyActions)
$incoherentCounters = Copy-JsonValue -Value $searchOpenPage
Set-JsonProperty -Value $incoherentCounters -Name 'toolCalls' -NewValue 1
Assert-NegativeMutation -Name 'incoherent_counters' -Accepted (Test-AdmissionSnapshot -Snapshot $incoherentCounters)
$unsupportedAction = Get-NormalizedActionSnapshot -RawActions @(
    [pscustomobject]@{ id = 'search-1'; type = 'search' },
    [pscustomobject]@{ id = 'inspect-1'; type = 'navigate' }
)
Assert-NegativeMutation -Name 'unsupported_action' -Accepted (Test-AdmissionSnapshot -Snapshot $unsupportedAction)
$contradictoryId = Get-NormalizedActionSnapshot -RawActions @(
    [pscustomobject]@{ id = 'shared-1'; type = 'search' },
    [pscustomobject]@{ id = 'shared-1'; type = 'openPage' }
)
Assert-NegativeMutation -Name 'contradictory_id' -Accepted (Test-AdmissionSnapshot -Snapshot $contradictoryId)

$attempt009Raw = Get-Content -LiteralPath $attempt009Path -Raw
$attempt009 = $attempt009Raw | ConvertFrom-Json -Depth 100
Assert-M5 (Test-Attempt009 -Evidence $attempt009 -RawJson $attempt009Raw) 'Attempt 009 contract differs'
Assert-M5 (Test-WorkingTreeScanWithExactReceiptExemption -EvidencePath $attempt009Path -EvidenceRaw $attempt009Raw) 'WorkingTree secret scan has a finding beyond the exact public receipt metadata pair'

$unbilledInspection = Copy-JsonValue -Value $attempt009
Set-JsonProperty -Value $unbilledInspection.receipt -Name 'estimatedCostUsd' -NewValue ([double]$unbilledInspection.receipt.estimatedCostUsd - 0.01)
$unbilledInspectionRaw = $unbilledInspection | ConvertTo-Json -Depth 100 -Compress
Assert-NegativeMutation -Name 'inspection_not_billed' -Accepted (Test-Attempt009 -Evidence $unbilledInspection -RawJson $unbilledInspectionRaw)
$overCeiling = Copy-JsonValue -Value $attempt009
Set-JsonProperty -Value $overCeiling.receipt -Name 'estimatedCostUsd' -NewValue 0.05000001
$overCeilingRaw = $overCeiling | ConvertTo-Json -Depth 100 -Compress
Assert-NegativeMutation -Name 'cost_above_0.05_usd' -Accepted (Test-Attempt009 -Evidence $overCeiling -RawJson $overCeilingRaw)
$nonCompleted = Copy-JsonValue -Value $attempt009
Set-JsonProperty -Value $nonCompleted.receipt -Name 'finalStatus' -NewValue 'failed'
$nonCompletedRaw = $nonCompleted | ConvertTo-Json -Depth 100 -Compress
Assert-NegativeMutation -Name 'terminal_not_completed' -Accepted (Test-Attempt009 -Evidence $nonCompleted -RawJson $nonCompletedRaw)
$incompleteSequence = Copy-JsonValue -Value $attempt009
Set-JsonProperty -Value $incompleteSequence -Name 'events' -NewValue @($incompleteSequence.events | Where-Object state -CNE 'source_verifying')
$incompleteSequenceRaw = $incompleteSequence | ConvertTo-Json -Depth 100 -Compress
Assert-NegativeMutation -Name 'incomplete_sequence' -Accepted (Test-Attempt009 -Evidence $incompleteSequence -RawJson $incompleteSequenceRaw)
$nonExactExcerpt = Copy-JsonValue -Value $attempt009
Set-JsonProperty -Value $nonExactExcerpt.source -Name 'exact_excerpt' -NewValue ([string]$nonExactExcerpt.source.exact_excerpt + ' altered')
$nonExactExcerptRaw = $nonExactExcerpt | ConvertTo-Json -Depth 100 -Compress
Assert-NegativeMutation -Name 'non_exact_excerpt' -Accepted (Test-Attempt009 -Evidence $nonExactExcerpt -RawJson $nonExactExcerptRaw)
$invalidM2 = Copy-JsonValue -Value $attempt009
Set-JsonProperty -Value $invalidM2 -Name 'm2_schema_valid' -NewValue $false
$invalidM2Raw = $invalidM2 | ConvertTo-Json -Depth 100 -Compress
Assert-NegativeMutation -Name 'm2_invalid' -Accepted (Test-Attempt009 -Evidence $invalidM2 -RawJson $invalidM2Raw)
$modifiedProofRaw = $attempt009Raw.Replace('"m2_schema_valid": true', '"m2_schema_valid": false')
Assert-M5 ($modifiedProofRaw -cne $attempt009Raw) 'Attempt 009 proof mutation was not applied in memory'
Assert-NegativeMutation -Name 'attempt_009_modified' -Accepted ((Get-TextSha256 -Text $modifiedProofRaw) -ceq $immutableHashes['docs/evidence/m5-attempt-009-live-result.json'])
$alternateStore = Copy-JsonValue -Value $attempt009
Set-JsonProperty -Value $alternateStore -Name 'secret_store' -NewValue ('external' + '_alternate')
$alternateStoreRaw = $alternateStore | ConvertTo-Json -Depth 100 -Compress
Assert-NegativeMutation -Name 'secret_store_other_value' -Accepted (Test-EvidenceRedaction -Evidence $alternateStore -RawJson $alternateStoreRaw)
$adjacentMaterial = Copy-JsonValue -Value $attempt009
$adjacentMaterial | Add-Member -NotePropertyName 'adjacentMaterial' -NotePropertyValue ('Bearer ' + ('B' * 24))
$adjacentMaterialRaw = $adjacentMaterial | ConvertTo-Json -Depth 100 -Compress
Assert-NegativeMutation -Name 'secret_store_adjacent_material' -Accepted (Test-EvidenceRedaction -Evidence $adjacentMaterial -RawJson $adjacentMaterialRaw)

$global:LASTEXITCODE = 0
Write-Output "M5_R3_ATTEMPT_009_CLOSED_AND_VALIDATED: mutations=$script:negativeMutationCount search=1 inspection=0_or_1 actions=1_or_2 maxToolCalls=2 parallelToolCalls=false"
