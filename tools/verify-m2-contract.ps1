[CmdletBinding()]
param(
    [string]$SchemaPath,
    [string]$FixturesPath,
    [string]$ContractPath,
    [switch]$SkipNegativeMutations
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($SchemaPath)) {
    $SchemaPath = Join-Path $repoRoot 'docs/contracts/research-dossier.schema.json'
}
if ([string]::IsNullOrWhiteSpace($FixturesPath)) {
    $FixturesPath = Join-Path $repoRoot 'docs/contracts/contract-fixtures.json'
}
if ([string]::IsNullOrWhiteSpace($ContractPath)) {
    $ContractPath = Join-Path $repoRoot 'docs/PRODUCT_TRUTH_CONTRACT.md'
}

function Get-PropertyValue {
    param(
        [object]$Object,
        [string]$Name
    )

    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function Test-HasProperty {
    param(
        [object]$Object,
        [string]$Name
    )

    return $null -ne $Object -and $null -ne $Object.PSObject.Properties[$Name]
}

function Test-HttpUrl {
    param([object]$Value)

    if ($Value -isnot [string] -or [string]::IsNullOrWhiteSpace($Value)) { return $false }
    $uri = $null
    if (-not [System.Uri]::TryCreate($Value, [System.UriKind]::Absolute, [ref]$uri)) { return $false }
    return $uri.Scheme -in @('http', 'https')
}

function Copy-JsonObject {
    param([object]$Object)

    return ($Object | ConvertTo-Json -Depth 100 -Compress | ConvertFrom-Json -Depth 100)
}

function Test-DossierContract {
    param(
        [object]$Dossier,
        [string]$SchemaFile
    )

    $issues = [System.Collections.Generic.List[string]]::new()
    try {
        $dossierJson = $Dossier | ConvertTo-Json -Depth 100 -Compress
        $schemaErrors = @()
        $schemaValid = Test-Json -Json $dossierJson -SchemaFile $SchemaFile -ErrorAction SilentlyContinue -ErrorVariable schemaErrors
        if (-not $schemaValid) { $issues.Add('schema_invalid') }
    } catch {
        $issues.Add('schema_validation_failed')
    }

    $candidates = @(Get-PropertyValue $Dossier.identity 'candidates')
    $sources = @(Get-PropertyValue $Dossier 'sources')
    $evidence = @(Get-PropertyValue $Dossier 'evidence')
    $claims = @(Get-PropertyValue $Dossier 'claims')
    $inferences = @(Get-PropertyValue $Dossier 'inferences')
    $contradictions = @(Get-PropertyValue $Dossier 'contradictions')
    $unknowns = @(Get-PropertyValue $Dossier 'unknowns')
    $steps = @(Get-PropertyValue $Dossier 'execution_steps')

    $candidateMap = @{}
    $sourceMap = @{}
    $evidenceMap = @{}
    $claimMap = @{}
    $inferenceMap = @{}
    $contradictionMap = @{}
    $unknownMap = @{}
    $invocationMap = @{}
    $globalIds = @{}

    $idRegistrations = [System.Collections.Generic.List[object]]::new()
    $idRegistrations.Add([pscustomobject]@{ Kind = 'dossier'; Id = (Get-PropertyValue $Dossier 'dossier_id') })
    $idRegistrations.Add([pscustomobject]@{ Kind = 'request'; Id = (Get-PropertyValue $Dossier.request 'request_id') })
    $idRegistrations.Add([pscustomobject]@{ Kind = 'run'; Id = (Get-PropertyValue $Dossier.receipt 'run_id') })
    foreach ($item in $candidates) { $idRegistrations.Add([pscustomobject]@{ Kind = 'subject'; Id = (Get-PropertyValue $item 'subject_id') }) }
    foreach ($item in $sources) { $idRegistrations.Add([pscustomobject]@{ Kind = 'source'; Id = (Get-PropertyValue $item 'source_id') }) }
    foreach ($item in $evidence) { $idRegistrations.Add([pscustomobject]@{ Kind = 'evidence'; Id = (Get-PropertyValue $item 'evidence_id') }) }
    foreach ($item in $claims) { $idRegistrations.Add([pscustomobject]@{ Kind = 'claim'; Id = (Get-PropertyValue $item 'claim_id') }) }
    foreach ($item in $inferences) { $idRegistrations.Add([pscustomobject]@{ Kind = 'inference'; Id = (Get-PropertyValue $item 'inference_id') }) }
    foreach ($item in $contradictions) { $idRegistrations.Add([pscustomobject]@{ Kind = 'contradiction'; Id = (Get-PropertyValue $item 'contradiction_id') }) }
    foreach ($item in $unknowns) { $idRegistrations.Add([pscustomobject]@{ Kind = 'unknown'; Id = (Get-PropertyValue $item 'unknown_id') }) }
    foreach ($item in $steps) {
        $idRegistrations.Add([pscustomobject]@{ Kind = 'step'; Id = (Get-PropertyValue $item 'step_id') })
        $idRegistrations.Add([pscustomobject]@{ Kind = 'invocation'; Id = (Get-PropertyValue $item 'invocation_id') })
    }

    foreach ($registration in $idRegistrations) {
        $id = [string]$registration.Id
        if ([string]::IsNullOrWhiteSpace($id)) {
            $issues.Add("empty_id:$($registration.Kind)")
            continue
        }
        if ($globalIds.ContainsKey($id)) {
            $issues.Add("duplicate_id:$id")
        } else {
            $globalIds[$id] = $registration.Kind
        }
    }

    foreach ($candidate in $candidates) { $candidateMap[[string]$candidate.subject_id] = $candidate }
    foreach ($source in $sources) { $sourceMap[[string]$source.source_id] = $source }
    foreach ($item in $evidence) { $evidenceMap[[string]$item.evidence_id] = $item }
    foreach ($claim in $claims) { $claimMap[[string]$claim.claim_id] = $claim }
    foreach ($inference in $inferences) { $inferenceMap[[string]$inference.inference_id] = $inference }
    foreach ($item in $contradictions) { $contradictionMap[[string]$item.contradiction_id] = $item }
    foreach ($unknown in $unknowns) { $unknownMap[[string]$unknown.unknown_id] = $unknown }
    foreach ($step in $steps) { $invocationMap[[string]$step.invocation_id] = $step }

    $identityStatus = [string](Get-PropertyValue $Dossier.identity 'status')
    $selectedSubjectId = Get-PropertyValue $Dossier.identity 'selected_subject_id'
    if ($identityStatus -eq 'resolved') {
        if ([string]::IsNullOrWhiteSpace([string]$selectedSubjectId) -or -not $candidateMap.ContainsKey([string]$selectedSubjectId)) {
            $issues.Add('resolved_identity_missing_selected_candidate')
        }
    } elseif ($null -ne $selectedSubjectId) {
        $issues.Add('unresolved_identity_has_selected_candidate')
    }

    $globalStatus = [string](Get-PropertyValue $Dossier 'global_status')
    $resultMode = [string](Get-PropertyValue $Dossier 'result_mode')
    $errorObject = Get-PropertyValue $Dossier 'error'
    if ($globalStatus -eq 'complete_within_scope' -and $identityStatus -ne 'resolved') {
        $issues.Add('complete_requires_resolved_identity')
    }
    if ($globalStatus -eq 'partial' -and $identityStatus -ne 'resolved') {
        $issues.Add('partial_requires_resolved_identity')
    }
    if ($globalStatus -eq 'needs_clarification' -and $identityStatus -notin @('ambiguous', 'insufficient_context')) {
        $issues.Add('clarification_requires_ambiguous_or_insufficient_identity')
    }
    if ($globalStatus -eq 'insufficient_evidence' -and $resultMode -ne 'silence') {
        $issues.Add('insufficient_evidence_requires_silence_mode')
    }
    if ($globalStatus -eq 'insufficient_evidence' -and $identityStatus -notin @('resolved', 'not_found_within_scope')) {
        $issues.Add('insufficient_evidence_has_incompatible_identity_state')
    }
    if ($globalStatus -eq 'technical_failure') {
        if ($resultMode -ne 'technical_error' -or $null -eq $errorObject) {
            $issues.Add('technical_failure_requires_error')
        }
    } elseif ($null -ne $errorObject) {
        $issues.Add('technical_error_must_use_technical_failure')
    }

    foreach ($source in $sources) {
        foreach ($field in @('provider_url', 'resolved_url', 'canonical_url')) {
            $url = Get-PropertyValue $source $field
            if ($null -ne $url -and -not (Test-HttpUrl $url)) {
                $issues.Add("invalid_http_url:$($source.source_id):$field")
            }
        }
    }

    foreach ($item in $evidence) {
        if (-not $sourceMap.ContainsKey([string]$item.source_id)) {
            $issues.Add("evidence_missing_source:$($item.evidence_id)")
        }
        if (-not $claimMap.ContainsKey([string]$item.claim_id)) {
            $issues.Add("evidence_missing_claim:$($item.evidence_id)")
        }
        if (-not $candidateMap.ContainsKey([string]$item.entity_id)) {
            $issues.Add("evidence_missing_entity:$($item.evidence_id)")
        }
    }

    $displayableStates = @('supported', 'contested', 'historical')
    foreach ($claim in $claims) {
        $claimId = [string]$claim.claim_id
        if (-not $candidateMap.ContainsKey([string]$claim.subject_id)) {
            $issues.Add("claim_missing_subject:$claimId")
        }

        $claimEvidenceIds = @(Get-PropertyValue $claim 'evidence_ids')
        foreach ($evidenceId in $claimEvidenceIds) {
            if (-not $evidenceMap.ContainsKey([string]$evidenceId)) {
                $issues.Add("claim_missing_evidence:${claimId}:$evidenceId")
                continue
            }
            if ([string]$evidenceMap[[string]$evidenceId].claim_id -ne $claimId) {
                $issues.Add("claim_evidence_backlink_mismatch:${claimId}:$evidenceId")
            }
        }

        $isDisplayedFact = [string]$claim.presentation_decision -eq 'display_fact'
        if ($isDisplayedFact) {
            if ($identityStatus -ne 'resolved') {
                $issues.Add("displayed_claim_requires_resolved_identity:$claimId")
            }
            if ([string]$claim.claim_state -notin $displayableStates) {
                $issues.Add("displayed_claim_has_forbidden_state:$claimId")
            }
            if ($claimEvidenceIds.Count -lt 1) {
                $issues.Add("displayed_claim_without_evidence:$claimId")
            }

            $hasFinalSupport = $false
            foreach ($evidenceId in $claimEvidenceIds) {
                if (-not $evidenceMap.ContainsKey([string]$evidenceId)) { continue }
                $proof = $evidenceMap[[string]$evidenceId]
                if (-not $sourceMap.ContainsKey([string]$proof.source_id)) { continue }
                $source = $sourceMap[[string]$proof.source_id]
                $hasDirectUrl = (Test-HttpUrl $source.resolved_url) -or (Test-HttpUrl $source.canonical_url)
                $directUrls = @($source.resolved_url, $source.canonical_url) | Where-Object { Test-HttpUrl $_ }
                $redirectOnlyDestination = $directUrls.Count -gt 0 -and
                    @($directUrls | Where-Object { ([System.Uri]$_).Host -ne 'vertexaisearch.cloud.google.com' }).Count -eq 0
                $finalMethod = [string]$proof.verification_method -in @('source_content', 'institutional_record', 'manual_verification')
                if ([string]$proof.relation -eq 'supports' -and
                    [string]$source.accessibility_status -eq 'accessible' -and
                    [string]$source.collection_compliance -eq 'permitted' -and
                    [string]$source.source_type -notin @('aggregator', 'search_result') -and
                    [string]$proof.entity_id -eq [string]$claim.subject_id -and
                    [string]$source.assumed_entity_id -eq [string]$claim.subject_id -and
                    [string]$proof.scope.type -eq [string]$claim.scope.type -and
                    $hasDirectUrl -and -not $redirectOnlyDestination -and $finalMethod) {
                    $hasFinalSupport = $true
                }
            }
            if (-not $hasFinalSupport) {
                $issues.Add("displayed_claim_without_final_support:$claimId")
            }

            if (-not (Test-HasProperty $claim 'fact_period') -or $null -eq $claim.fact_period) {
                $issues.Add("displayed_claim_without_temporal_qualification:$claimId")
            } elseif ([string]$claim.temporal_status -eq 'current') {
                $period = $claim.fact_period
                $hasTimeMarker = $null -ne $period.as_of -or $null -ne $period.start -or $null -ne $period.end -or $null -ne $period.label
                if ([string]$period.status -notin @('stated', 'derived') -or -not $hasTimeMarker) {
                    $issues.Add("current_claim_without_temporal_qualification:$claimId")
                }
            }

            $structuredValue = Get-PropertyValue $claim 'structured_value'
            if ($null -ne $structuredValue -and [string]$structuredValue.value_type -eq 'number') {
                if ([string]::IsNullOrWhiteSpace([string]$claim.unit)) {
                    $issues.Add("quantitative_claim_without_unit:$claimId")
                }
                if ([string]$claim.scope.type -eq 'undetermined') {
                    $issues.Add("quantitative_claim_without_scope:$claimId")
                }
                if ($null -eq $claim.fact_period -or [string]$claim.fact_period.status -eq 'unknown') {
                    $issues.Add("quantitative_claim_without_period:$claimId")
                }
            }
        }

        if ([string]$claim.claim_state -eq 'ambiguous' -and [string]$claim.presentation_decision -ne 'display_ambiguity') {
            $issues.Add("ambiguous_claim_outside_ambiguity:$claimId")
        }
        if ([string]$claim.claim_state -eq 'rejected' -and [string]$claim.presentation_decision -ne 'reject') {
            $issues.Add("rejected_claim_presented:$claimId")
        }
        if ([string]$claim.claim_state -eq 'historical' -and [string]$claim.temporal_status -ne 'historical') {
            $issues.Add("historical_claim_not_temporally_historical:$claimId")
        }
    }

    foreach ($inference in $inferences) {
        foreach ($claimId in @(Get-PropertyValue $inference 'based_on_claim_ids')) {
            if (-not $claimMap.ContainsKey([string]$claimId)) {
                $issues.Add("inference_missing_claim:$($inference.inference_id):$claimId")
            } elseif ([string]$claimMap[[string]$claimId].claim_state -notin $displayableStates) {
                $issues.Add("inference_based_on_non_displayable_claim:$($inference.inference_id):$claimId")
            }
        }
    }

    foreach ($item in $contradictions) {
        $versions = @(Get-PropertyValue $item 'versions')
        if ($versions.Count -lt 2) {
            $issues.Add("conflict_needs_two_versions:$($item.contradiction_id)")
        }
        $versionClaims = @($versions | ForEach-Object { [string]$_.claim_id })
        if (@($versionClaims | Sort-Object -Unique).Count -ne $versionClaims.Count) {
            $issues.Add("conflict_versions_must_reference_distinct_claims:$($item.contradiction_id)")
        }
        if ([string]$item.classification -eq 'contradiction') {
            if (-not [bool]$item.visible) {
                $issues.Add("contradiction_must_be_visible:$($item.contradiction_id)")
            }
            if (-not [bool]$item.published_or_estimated_checked) {
                $issues.Add("contradiction_requires_published_estimated_check:$($item.contradiction_id)")
            }
            $normalizedValues = @($versions | ForEach-Object { ($_.normalized_value | ConvertTo-Json -Compress) })
            if (@($normalizedValues | Sort-Object -Unique).Count -lt 2) {
                $issues.Add("contradiction_requires_distinct_values:$($item.contradiction_id)")
            }
        }
        foreach ($version in $versions) {
            $versionClaimId = [string]$version.claim_id
            if (-not $claimMap.ContainsKey($versionClaimId)) {
                $issues.Add("conflict_missing_claim:$($item.contradiction_id):$versionClaimId")
                continue
            }
            if ([string]$claimMap[$versionClaimId].claim_state -ne 'contested') {
                $issues.Add("conflict_claim_not_contested:$($item.contradiction_id):$versionClaimId")
            }
            foreach ($evidenceId in @($version.evidence_ids)) {
                if (-not $evidenceMap.ContainsKey([string]$evidenceId)) {
                    $issues.Add("conflict_missing_evidence:$($item.contradiction_id):$evidenceId")
                } elseif ([string]$evidenceMap[[string]$evidenceId].claim_id -ne $versionClaimId) {
                    $issues.Add("conflict_evidence_claim_mismatch:$($item.contradiction_id):$evidenceId")
                }
            }
        }
    }

    $presentation = Get-PropertyValue $Dossier 'presentation'
    foreach ($propertyName in @('key_fact_claim_ids', 'recent_signal_claim_ids')) {
        foreach ($claimId in @(Get-PropertyValue $presentation $propertyName)) {
            if (-not $claimMap.ContainsKey([string]$claimId)) {
                $issues.Add("presentation_missing_claim:${propertyName}:$claimId")
            } elseif ([string]$claimMap[[string]$claimId].claim_state -notin $displayableStates -or
                [string]$claimMap[[string]$claimId].presentation_decision -ne 'display_fact') {
                $issues.Add("presentation_non_displayable_claim:${propertyName}:$claimId")
            }
        }
    }
    foreach ($claimId in @(Get-PropertyValue $presentation 'ambiguity_claim_ids')) {
        if (-not $claimMap.ContainsKey([string]$claimId)) {
            $issues.Add("presentation_missing_ambiguity_claim:$claimId")
        } elseif ([string]$claimMap[[string]$claimId].claim_state -ne 'ambiguous') {
            $issues.Add("presentation_ambiguity_requires_ambiguous_claim:$claimId")
        }
    }
    foreach ($item in @(Get-PropertyValue $presentation 'summary_items')) {
        if ([string]$item.kind -eq 'claim') {
            if (-not $claimMap.ContainsKey([string]$item.ref_id) -or
                [string]$claimMap[[string]$item.ref_id].claim_state -notin $displayableStates) {
                $issues.Add("summary_missing_or_non_displayable_claim:$($item.ref_id)")
            }
        } elseif ([string]$item.kind -eq 'inference' -and -not $inferenceMap.ContainsKey([string]$item.ref_id)) {
            $issues.Add("summary_missing_inference:$($item.ref_id)")
        }
    }
    foreach ($id in @(Get-PropertyValue $presentation 'contradiction_ids')) {
        if (-not $contradictionMap.ContainsKey([string]$id)) { $issues.Add("presentation_missing_contradiction:$id") }
    }
    foreach ($id in @(Get-PropertyValue $presentation 'unknown_ids')) {
        if (-not $unknownMap.ContainsKey([string]$id)) { $issues.Add("presentation_missing_unknown:$id") }
    }
    foreach ($id in @(Get-PropertyValue $presentation 'source_ids')) {
        if (-not $sourceMap.ContainsKey([string]$id)) { $issues.Add("presentation_missing_source:$id") }
    }

    if ($resultMode -eq 'silence') {
        $presentedClaimCount = @($claims | Where-Object { [string]$_.presentation_decision -eq 'display_fact' }).Count
        $summaryCount = @(Get-PropertyValue $presentation 'summary_items').Count
        $factReferenceCount = @(Get-PropertyValue $presentation 'key_fact_claim_ids').Count + @(Get-PropertyValue $presentation 'recent_signal_claim_ids').Count
        if ($presentedClaimCount -gt 0 -or $summaryCount -gt 0 -or $factReferenceCount -gt 0) {
            $issues.Add('silence_forbids_displayed_claims')
        }
        $silenceUnknowns = @($unknowns | Where-Object {
            [string]$_.category -eq 'no_reliable_source' -and
            [string]$_.description -eq "Aucune source suffisamment fiable n’a été trouvée dans le périmètre de cette recherche."
        })
        if ($silenceUnknowns.Count -lt 1) {
            $issues.Add('silence_requires_bounded_canonical_statement')
        }
        if ($globalStatus -ne 'insufficient_evidence' -or $null -ne $errorObject) {
            $issues.Add('silence_must_be_nontechnical_insufficient_evidence')
        }
    }

    $failedSteps = @($steps | Where-Object { [string]$_.status -eq 'failed' })
    if (($failedSteps.Count -gt 0 -or $null -ne $errorObject) -and $globalStatus -ne 'technical_failure') {
        $issues.Add('technical_event_must_not_be_insufficient_evidence')
    }
    if ($globalStatus -eq 'technical_failure' -and $failedSteps.Count -lt 1) {
        $issues.Add('technical_failure_requires_failed_step')
    }
    if ($globalStatus -eq 'complete_within_scope' -and
        @($steps | Where-Object { [string]$_.status -notin @('completed', 'skipped') }).Count -gt 0) {
        $issues.Add('complete_dossier_has_unfinished_step')
    }

    foreach ($step in $steps) {
        if ($null -ne $step.duration_ms -and [double]$step.duration_ms -lt 0) {
            $issues.Add("negative_step_duration:$($step.step_id)")
        }
        if ([int]$step.attempt -gt 1) {
            if ($null -eq $step.retry_of -or -not $invocationMap.ContainsKey([string]$step.retry_of)) {
                $issues.Add("retry_missing_prior_invocation:$($step.invocation_id)")
            }
        } elseif ($null -ne $step.retry_of) {
            $issues.Add("first_attempt_cannot_be_retry:$($step.invocation_id)")
        }
    }

    $receipt = Get-PropertyValue $Dossier 'receipt'
    foreach ($measurement in @(
        @{ Name = 'total_duration_ms'; Value = (Get-PropertyValue $receipt 'total_duration_ms') },
        @{ Name = 'latency_ms'; Value = (Get-PropertyValue $receipt 'latency_ms') },
        @{ Name = 'provider_calls'; Value = (Get-PropertyValue $receipt 'provider_calls') },
        @{ Name = 'input_tokens'; Value = (Get-PropertyValue $receipt.usage 'input_tokens') },
        @{ Name = 'output_tokens'; Value = (Get-PropertyValue $receipt.usage 'output_tokens') },
        @{ Name = 'total_tokens'; Value = (Get-PropertyValue $receipt.usage 'total_tokens') },
        @{ Name = 'amount_usd'; Value = (Get-PropertyValue $receipt.cost 'amount_usd') }
    )) {
        if ($null -eq $measurement.Value -or [double]$measurement.Value -lt 0) {
            $issues.Add("negative_or_missing_measurement:$($measurement.Name)")
        }
    }
    if ($null -ne $receipt.usage -and [int64]$receipt.usage.total_tokens -lt ([int64]$receipt.usage.input_tokens + [int64]$receipt.usage.output_tokens)) {
        $issues.Add('total_tokens_below_input_plus_output')
    }

    $serializedDossier = $Dossier | ConvertTo-Json -Depth 100 -Compress
    if ($serializedDossier -match '"[^"]*(?:percent|percentage|progress)[^"]*"\s*:') {
        $issues.Add('forbidden_progress_property')
    }
    return @($issues | Sort-Object -Unique)
}

foreach ($path in @($SchemaPath, $FixturesPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "M2_VERIFY_FAILED: missing file $path"
    }
    if (-not (Test-Json -LiteralPath $path -ErrorAction Stop)) {
        throw "M2_VERIFY_FAILED: invalid JSON $path"
    }
}

if (-not (Test-Path -LiteralPath $ContractPath -PathType Leaf)) {
    throw "M2_VERIFY_FAILED: missing file $ContractPath"
}

$contractText = Get-Content -LiteralPath $ContractPath -Raw
$traceabilityIds = @(
    'BRIEF-INPUT',
    'BRIEF-OUTPUT',
    'BRIEF-TRACEABILITY',
    'BRIEF-LONG-WAIT',
    'BRIEF-HOMONYM',
    'BRIEF-CONFLICT',
    'BRIEF-SILENCE',
    'BRIEF-STALE',
    'BRIEF-SCOPE',
    'BRIEF-NO-PRESET',
    'BRIEF-TERMS',
    'BRIEF-PRIVACY',
    'BRIEF-COST',
    'BRIEF-ONLINE'
)
foreach ($traceabilityId in $traceabilityIds) {
    if ($contractText -notmatch [regex]::Escape($traceabilityId)) {
        throw "M2_VERIFY_FAILED: traceability entry missing: $traceabilityId"
    }
}
Write-Output "M2_TRACEABILITY_OK: requirements=$($traceabilityIds.Count)"

$null = Get-Content -LiteralPath $SchemaPath -Raw | ConvertFrom-Json -Depth 100
$suite = Get-Content -LiteralPath $FixturesPath -Raw | ConvertFrom-Json -Depth 100
Write-Output 'M2_JSON_OK: schema and fixtures'

if ($suite.synthetic_contract_fixture -ne $true -or
    $suite.not_demo_data -ne $true -or
    $suite.not_application_output -ne $true) {
    throw 'M2_VERIFY_FAILED: synthetic fixture safety metadata missing'
}

$expectedScenarios = @(
    'supported_claim',
    'homonym_clarification',
    'conflict_two_versions',
    'honest_silence',
    'historical_information',
    'technical_failure'
)
$actualScenarios = @($suite.fixtures | ForEach-Object { [string]$_.scenario })
if ($actualScenarios.Count -ne $expectedScenarios.Count -or
    @(Compare-Object ($expectedScenarios | Sort-Object) ($actualScenarios | Sort-Object)).Count -gt 0) {
    throw 'M2_VERIFY_FAILED: fixture scenario set differs from contract'
}

$fixtureIds = @($suite.fixtures | ForEach-Object { [string]$_.fixture_id })
if (@($fixtureIds | Where-Object { [string]::IsNullOrWhiteSpace($_) }).Count -gt 0 -or
    @($fixtureIds | Sort-Object -Unique).Count -ne $fixtureIds.Count) {
    throw 'M2_VERIFY_FAILED: fixture identifiers are empty or duplicated'
}

foreach ($fixture in $suite.fixtures) {
    if ([string]$fixture.dossier.origin -ne 'synthetic_contract_fixture') {
        throw "M2_VERIFY_FAILED: fixture origin is unsafe: $($fixture.fixture_id)"
    }
    if ([string]$fixture.dossier.request.name -notmatch 'Synthétique') {
        throw "M2_VERIFY_FAILED: fixture request is not explicitly synthetic: $($fixture.fixture_id)"
    }
    foreach ($candidate in @($fixture.dossier.identity.candidates)) {
        if ([string]$candidate.display_name -notmatch 'Synthétique') {
            throw "M2_VERIFY_FAILED: fixture candidate is not explicitly synthetic: $($fixture.fixture_id)"
        }
    }
    foreach ($source in @($fixture.dossier.sources)) {
        foreach ($urlField in @('provider_url', 'resolved_url', 'canonical_url')) {
            $fixtureUrl = Get-PropertyValue $source $urlField
            if ($null -eq $fixtureUrl) { continue }
            $fixtureUri = [System.Uri]$fixtureUrl
            if ($fixtureUri.Host -notlike '*.invalid') {
                throw "M2_VERIFY_FAILED: fixture URL does not use a reserved .invalid domain: $($fixture.fixture_id)"
            }
        }
    }
    $issues = @(Test-DossierContract -Dossier $fixture.dossier -SchemaFile $SchemaPath)
    if ($issues.Count -gt 0) {
        $issues | ForEach-Object { Write-Error "M2_CONTRACT_FINDING: $($fixture.scenario):$_" }
        throw "M2_VERIFY_FAILED: fixture rejected: $($fixture.scenario)"
    }
    Write-Output "M2_FIXTURE_OK: $($fixture.scenario)"
}
Write-Output "M2_SYNTHETIC_SAFETY_OK: fixtures=$($suite.fixtures.Count)"

$negativeCount = 0
if (-not $SkipNegativeMutations) {
    $byScenario = @{}
    foreach ($fixture in $suite.fixtures) { $byScenario[[string]$fixture.scenario] = $fixture.dossier }

    $mutations = [System.Collections.Generic.List[object]]::new()

    $missingEvidence = Copy-JsonObject $byScenario['supported_claim']
    $missingEvidence.evidence = @()
    $mutations.Add([pscustomobject]@{
        Name = 'missing_evidence'
        Dossier = $missingEvidence
        ExpectedIssue = 'claim_missing_evidence:'
    })

    $ambiguousComplete = Copy-JsonObject $byScenario['homonym_clarification']
    $ambiguousComplete.global_status = 'complete_within_scope'
    $mutations.Add([pscustomobject]@{
        Name = 'ambiguous_identity_marked_complete'
        Dossier = $ambiguousComplete
        ExpectedIssue = 'complete_requires_resolved_identity'
    })

    $silenceWithClaim = Copy-JsonObject $byScenario['honest_silence']
    $supported = $byScenario['supported_claim']
    $silenceWithClaim.identity = Copy-JsonObject $supported.identity
    $silenceWithClaim.sources = @(Copy-JsonObject $supported.sources[0])
    $silenceWithClaim.evidence = @(Copy-JsonObject $supported.evidence[0])
    $silenceWithClaim.claims = @(Copy-JsonObject $supported.claims[0])
    $silenceWithClaim.presentation.key_fact_claim_ids = @('claim-supported-status')
    $silenceWithClaim.presentation.source_ids = @('source-supported-register')
    $mutations.Add([pscustomobject]@{
        Name = 'silence_with_displayed_claim'
        Dossier = $silenceWithClaim
        ExpectedIssue = 'silence_forbids_displayed_claims'
    })

    $flattenedConflict = Copy-JsonObject $byScenario['conflict_two_versions']
    $flattenedConflict.contradictions[0].versions = @($flattenedConflict.contradictions[0].versions[0])
    $mutations.Add([pscustomobject]@{
        Name = 'conflict_flattened_to_one_value'
        Dossier = $flattenedConflict
        ExpectedIssue = 'conflict_needs_two_versions:'
    })

    $currentWithoutTime = Copy-JsonObject $byScenario['supported_claim']
    $currentWithoutTime.claims[0].PSObject.Properties.Remove('fact_period')
    $mutations.Add([pscustomobject]@{
        Name = 'current_claim_without_temporal_qualification'
        Dossier = $currentWithoutTime
        ExpectedIssue = 'displayed_claim_without_temporal_qualification:'
    })

    foreach ($mutation in $mutations) {
        $issues = @(Test-DossierContract -Dossier $mutation.Dossier -SchemaFile $SchemaPath)
        $matched = @($issues | Where-Object { $_ -like "$($mutation.ExpectedIssue)*" }).Count -gt 0
        if (-not $matched) {
            throw "M2_VERIFY_FAILED: negative mutation was not rejected for expected reason: $($mutation.Name)"
        }
        $negativeCount++
        Write-Output "M2_NEGATIVE_MUTATION_REJECTED: $($mutation.Name)"
    }
}

Write-Output "M2_VERIFY_OK: fixtures=$($suite.fixtures.Count) negative_mutations=$negativeCount"
