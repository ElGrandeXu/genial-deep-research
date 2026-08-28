param(
    [string]$ManifestPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
Set-Location -LiteralPath $repoRoot

function Stop-VercelContextVerification {
    param([Parameter(Mandatory)][string]$Finding)

    throw "VERCEL_CONTEXT_VERIFY_FAILED: $Finding"
}

function Get-LiveVercelManifest {
    $vercelCommand = @(
        Get-Command -Name vercel -CommandType Application -All -ErrorAction SilentlyContinue |
            Sort-Object { if ($_.Name -eq 'vercel.cmd') { 0 } else { 1 } }
    ) | Select-Object -First 1
    if ($null -eq $vercelCommand) {
        Stop-VercelContextVerification 'Vercel CLI is unavailable'
    }

    $versionOutput = @(& $vercelCommand.Source --version 2>&1)
    $versionExit = $LASTEXITCODE
    $versionText = ($versionOutput -join "`n").Trim()
    $versionMatch = [regex]::Match($versionText, '(?<version>\d+\.\d+\.\d+)')
    if ($versionExit -ne 0 -or -not $versionMatch.Success) {
        Stop-VercelContextVerification 'Vercel CLI version cannot be determined'
    }
    $version = $versionMatch.Groups['version'].Value

    $helpOutput = @(& $vercelCommand.Source deploy --help 2>&1)
    $helpText = $helpOutput -join "`n"
    $missingOptions = @(@('--dry', '--json', '--no-color') | Where-Object { -not $helpText.Contains($_, [StringComparison]::Ordinal) })
    if ($missingOptions.Count -gt 0) {
        Stop-VercelContextVerification "incompatible Vercel CLI $version; missing options: $($missingOptions -join ', ')"
    }

    $linkPath = Join-Path $repoRoot '.vercel\project.json'
    if (-not (Test-Path -LiteralPath $linkPath -PathType Leaf)) {
        Stop-VercelContextVerification 'linked Vercel project missing; run vercel link'
    }
    try {
        $link = Get-Content -LiteralPath $linkPath -Raw | ConvertFrom-Json
    } catch {
        Stop-VercelContextVerification "invalid .vercel/project.json: $($_.Exception.Message)"
    }
    foreach ($property in @('projectId', 'orgId')) {
        if ($link.PSObject.Properties.Name -notcontains $property -or [string]::IsNullOrWhiteSpace([string]$link.$property)) {
            Stop-VercelContextVerification "invalid .vercel/project.json: $property missing"
        }
    }

    $tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    $tempRoot = [IO.Path]::GetFullPath((Join-Path $tempBase "genial-vercel-dry-$([guid]::NewGuid().ToString('N'))"))
    if (-not $tempRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) {
        Stop-VercelContextVerification 'temporary dry-run path escaped the system temp directory'
    }
    [IO.Directory]::CreateDirectory($tempRoot) | Out-Null
    $stdoutPath = Join-Path $tempRoot 'manifest.json'
    $stderrPath = Join-Path $tempRoot 'vercel.stderr.txt'
    try {
        & $vercelCommand.Source deploy --dry --json --no-color 1> $stdoutPath 2> $stderrPath
        $dryRunExit = $LASTEXITCODE
        $stdout = if (Test-Path -LiteralPath $stdoutPath -PathType Leaf) { [IO.File]::ReadAllText($stdoutPath) } else { '' }
        $stderr = if (Test-Path -LiteralPath $stderrPath -PathType Leaf) { [IO.File]::ReadAllText($stderrPath).Trim() } else { '' }
        if ($dryRunExit -ne 0) {
            $detail = if ([string]::IsNullOrWhiteSpace($stderr)) { 'no diagnostic' } else { $stderr }
            Stop-VercelContextVerification "Vercel dry-run failed with CLI $version (exit=$dryRunExit): $detail"
        }
        if ([string]::IsNullOrWhiteSpace($stdout)) {
            Stop-VercelContextVerification "Vercel dry-run returned no JSON with CLI $version"
        }
        return $stdout
    } finally {
        if (Test-Path -LiteralPath $tempRoot -PathType Container) {
            Remove-Item -LiteralPath $tempRoot -Recurse -Force
        }
    }
}

if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
    $manifestJson = Get-LiveVercelManifest
    $manifestSource = 'live'
} else {
    try {
        $resolvedManifestPath = (Resolve-Path -LiteralPath $ManifestPath -ErrorAction Stop).Path
    } catch {
        Stop-VercelContextVerification "manifest file unavailable: $ManifestPath"
    }
    if (-not (Test-Path -LiteralPath $resolvedManifestPath -PathType Leaf)) {
        Stop-VercelContextVerification "manifest path is not a file: $ManifestPath"
    }
    $manifestJson = [IO.File]::ReadAllText($resolvedManifestPath)
    $manifestSource = 'recorded'
}

try {
    $manifest = $manifestJson | ConvertFrom-Json -Depth 100
} catch {
    Stop-VercelContextVerification "invalid manifest JSON: $($_.Exception.Message)"
}
if ($null -eq $manifest -or $manifest -is [array]) {
    Stop-VercelContextVerification 'manifest JSON root must be an object'
}
foreach ($property in @('framework', 'fileCount', 'totalSize', 'files')) {
    if ($manifest.PSObject.Properties.Name -notcontains $property) {
        Stop-VercelContextVerification "manifest property missing: $property"
    }
}
$frameworkSlug = ''
if ($null -ne $manifest.framework -and $manifest.framework.PSObject.Properties.Name -contains 'slug') {
    $frameworkSlug = [string]$manifest.framework.slug
}
if ($frameworkSlug -ne 'nextjs') {
    Stop-VercelContextVerification "unexpected framework: $frameworkSlug"
}

$manifestEntries = @($manifest.files)
try {
    $declaredFileCount = [int64]$manifest.fileCount
    $declaredTotalSize = [int64]$manifest.totalSize
} catch {
    Stop-VercelContextVerification 'manifest counters are not integers'
}
if ($declaredFileCount -ne $manifestEntries.Count) {
    Stop-VercelContextVerification "manifest fileCount mismatch: declared=$declaredFileCount entries=$($manifestEntries.Count)"
}

$manifestFiles = [Collections.Generic.Dictionary[string, int64]]::new([StringComparer]::Ordinal)
foreach ($entry in $manifestEntries) {
    if ($null -eq $entry -or $entry.PSObject.Properties.Name -notcontains 'path' -or $entry.PSObject.Properties.Name -notcontains 'mode') {
        Stop-VercelContextVerification 'manifest file entry lacks path or mode'
    }
    $relativePath = ([string]$entry.path).Replace('\', '/')
    while ($relativePath.StartsWith('./', [StringComparison]::Ordinal)) {
        $relativePath = $relativePath.Substring(2)
    }
    if ([string]::IsNullOrWhiteSpace($relativePath) -or
        $relativePath.StartsWith('/', [StringComparison]::Ordinal) -or
        $relativePath -match '^[A-Za-z]:' -or
        ($relativePath -split '/') -contains '..') {
        Stop-VercelContextVerification "invalid manifest path: $relativePath"
    }
    try {
        $mode = [int64]$entry.mode
    } catch {
        Stop-VercelContextVerification "invalid manifest mode: $relativePath"
    }
    if (($mode -band 0xF000) -ne 0x8000) { continue }
    if ($entry.PSObject.Properties.Name -notcontains 'size') {
        Stop-VercelContextVerification "regular file lacks size: $relativePath"
    }
    try {
        $size = [int64]$entry.size
    } catch {
        Stop-VercelContextVerification "invalid manifest size: $relativePath"
    }
    if ($size -lt 0) {
        Stop-VercelContextVerification "negative manifest size: $relativePath"
    }
    if ($manifestFiles.ContainsKey($relativePath)) {
        Stop-VercelContextVerification "duplicate regular path: $relativePath"
    }
    $manifestFiles.Add($relativePath, $size)
}

$trackedSourceFiles = @(
    & git -C $repoRoot -c core.quotepath=false ls-files -- src |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        ForEach-Object { $_.Replace('\', '/') }
)
if ($LASTEXITCODE -ne 0) {
    Stop-VercelContextVerification 'cannot enumerate Git-tracked src files'
}
$requiredBuildFiles = @(
    'next-env.d.ts',
    'next.config.ts',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tools/run-next.mjs',
    'tsconfig.json'
)
$expectedFiles = @(
    $trackedSourceFiles
    'docs/contracts/research-dossier.schema.json'
    $requiredBuildFiles
) | Sort-Object -Unique
$expectedSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
foreach ($relativePath in $expectedFiles) {
    $null = $expectedSet.Add($relativePath)
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $relativePath) -PathType Leaf)) {
        Stop-VercelContextVerification "expected local file missing: $relativePath"
    }
}

$missingFiles = @($expectedFiles | Where-Object { -not $manifestFiles.ContainsKey($_) } | Sort-Object)
if ($missingFiles.Count -gt 0) {
    Stop-VercelContextVerification "missing paths: $($missingFiles -join ', ')"
}
$unexpectedFiles = @($manifestFiles.Keys | Where-Object { -not $expectedSet.Contains($_) } | Sort-Object)
if ($unexpectedFiles.Count -gt 0) {
    Stop-VercelContextVerification "unexpected paths: $($unexpectedFiles -join ', ')"
}

$sizeMismatches = [Collections.Generic.List[string]]::new()
$localTotalSize = [int64]0
foreach ($relativePath in $expectedFiles) {
    $localSize = [int64](Get-Item -LiteralPath (Join-Path $repoRoot $relativePath)).Length
    $manifestSize = $manifestFiles[$relativePath]
    if ($localSize -ne $manifestSize) {
        $sizeMismatches.Add("$relativePath(manifest=$manifestSize local=$localSize)")
    }
    $localTotalSize += $localSize
}
if ($sizeMismatches.Count -gt 0) {
    Stop-VercelContextVerification "size mismatches: $($sizeMismatches -join ', ')"
}
if ($declaredTotalSize -ne $localTotalSize) {
    Stop-VercelContextVerification "manifest totalSize mismatch: declared=$declaredTotalSize regular=$localTotalSize"
}

Write-Output "VERCEL_CONTEXT_OK: source=$manifestSource framework=nextjs files=$($manifestFiles.Count) bytes=$localTotalSize"
