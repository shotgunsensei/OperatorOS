[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet(
    'tradeflowkit',
    'torqueshed',
    'techdeck',
    'pulsedesk',
    'faultlinelab',
    'ninja-pool-hall',
    'brandforgeos',
    'snapproofos',
    'studyforge-ai',
    'ninja-launch-kit',
    'callcommand-ai',
    'ninjamation',
    'outcall'
  )]
  [string]$ModuleSlug,

  [Parameter(Mandatory = $true)]
  [string]$SourcePath,

  [switch]$Apply,

  [string[]]$ExcludePathPrefix = @(),

  [ValidateRange(1, 500)]
  [int]$MaxFileSizeMb = 25
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$moduleRoot = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot "apps/modules/$ModuleSlug"))
$destinationRoot = [System.IO.Path]::GetFullPath((Join-Path $moduleRoot 'source'))
$allowedDestinationRoot = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot 'apps/modules')) + [System.IO.Path]::DirectorySeparatorChar

if (-not $destinationRoot.StartsWith($allowedDestinationRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing destination outside apps/modules: $destinationRoot"
}

$resolvedSource = Resolve-Path -LiteralPath $SourcePath -ErrorAction Stop
$sourceRoot = [System.IO.Path]::GetFullPath($resolvedSource.Path)
if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) {
  throw "Source is not a directory: $sourceRoot"
}

$gitSafeDirectory = $sourceRoot.Replace('\', '/')
$insideWorkTreeOutput = @(& git -c "safe.directory=$gitSafeDirectory" -C $sourceRoot rev-parse --is-inside-work-tree 2>$null)
$insideWorkTree = if ($insideWorkTreeOutput.Count -gt 0) { [string]$insideWorkTreeOutput[0] } else { '' }
if ($LASTEXITCODE -ne 0 -or $insideWorkTree -ne 'true') {
  throw "Source must be a Git worktree so only tracked files are imported: $sourceRoot"
}

if (Test-Path -LiteralPath $destinationRoot) {
  throw "Destination already exists. This importer never overwrites snapshots: $destinationRoot"
}

$sourceStatus = @(& git -c "safe.directory=$gitSafeDirectory" -C $sourceRoot status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect source worktree status.' }
$trackedChanges = @($sourceStatus | Where-Object { $_ -notmatch '^\?\?' })
$untrackedChanges = @($sourceStatus | Where-Object { $_ -match '^\?\?' })
if ($trackedChanges.Count -gt 0) {
  throw "Source has $($trackedChanges.Count) tracked change(s). Commit or otherwise resolve them before creating a commit-addressed snapshot."
}
if ($untrackedChanges.Count -gt 0) {
  Write-Warning "Source has $($untrackedChanges.Count) untracked item(s); tracked-files-only import will ignore them."
}

$trackedFiles = @(& git -c "safe.directory=$gitSafeDirectory" -c core.quotepath=false -C $sourceRoot ls-files)
if ($LASTEXITCODE -ne 0) {
  throw 'git ls-files failed.'
}
$trackedFiles = @($trackedFiles | Where-Object { $_ })
if ($trackedFiles.Count -eq 0) {
  throw 'Source repository has no tracked files.'
}

$excludedDirectoryPattern = '(^|/)(\.git|\.agents|\.openai|\.migration-backup|\.backup|backups?|\.replit-artifact|attached_assets|mockup-sandbox|design-audit|node_modules|dist|build|\.next|coverage|\.cache|\.turbo|\.vercel|playwright-report|test-results|tmp|temp|uploads?)(/|$)'
$excludedFilePattern = '(?i)(^|/)(\.env($|\.)|\.replit(?:ignore)?($|\.)|id_rsa(\.pub)?$|id_ed25519(\.pub)?$|credentials\.json$|service-account[^/]*\.json$)|(?i)\.(pem|key|p12|pfx|jks|keystore|sqlite|sqlite3|db|log)$'
$excludedDependencyLockPattern = '(?i)(^|/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|bun\.lockb?|pnpm-lock(?: \(\d+\))?\.yaml)$'
$maxFileBytes = [int64]$MaxFileSizeMb * 1MB

$secretPatterns = [ordered]@{
  private_key = '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'
  aws_access_key = 'AKIA[0-9A-Z]{16}'
  stripe_live_key = '(?:sk|rk)_live_[A-Za-z0-9]{16,}'
  github_token = '(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})'
  slack_token = 'xox[baprs]-[A-Za-z0-9-]{20,}'
  google_api_key = 'AIza[0-9A-Za-z_-]{30,}'
}

$included = [System.Collections.Generic.List[object]]::new()
$excluded = [System.Collections.Generic.List[object]]::new()
$findings = [System.Collections.Generic.List[object]]::new()
$normalizedExcludedPrefixes = @($ExcludePathPrefix | ForEach-Object {
  $prefix = ([string]$_).Replace('\', '/').Trim('/')
  if (-not $prefix -or [System.IO.Path]::IsPathRooted($prefix) -or $prefix.Split('/') -contains '..') {
    throw "Unsafe exclusion prefix: $_"
  }
  $prefix
})

foreach ($trackedFile in $trackedFiles) {
  $relative = $trackedFile.Replace('\', '/')
  if ([System.IO.Path]::IsPathRooted($relative) -or $relative.Split('/') -contains '..') {
    throw "Unsafe tracked path: $relative"
  }

  $matchesExplicitExclusion = $false
  foreach ($prefix in $normalizedExcludedPrefixes) {
    if ($relative -eq $prefix -or $relative.StartsWith("$prefix/", [System.StringComparison]::OrdinalIgnoreCase)) {
      $matchesExplicitExclusion = $true
      break
    }
  }
  if ($relative -match $excludedDependencyLockPattern) {
    $excluded.Add([pscustomobject]@{ path = $relative; reason = 'dependency lockfile excluded from non-installable historical snapshot' })
    continue
  }
  if ($matchesExplicitExclusion -or $relative -match $excludedDirectoryPattern -or $relative -match $excludedFilePattern) {
    $excluded.Add([pscustomobject]@{ path = $relative; reason = 'excluded path or sensitive filename' })
    continue
  }

  $sourceFile = [System.IO.Path]::GetFullPath((Join-Path $sourceRoot $relative))
  $sourcePrefix = $sourceRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
  if (-not $sourceFile.StartsWith($sourcePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Tracked path escaped source root: $relative"
  }
  if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) {
    $excluded.Add([pscustomobject]@{ path = $relative; reason = 'not a regular checked-out file' })
    continue
  }

  $fileInfo = Get-Item -LiteralPath $sourceFile -Force
  if ($fileInfo.Length -gt $maxFileBytes) {
    $excluded.Add([pscustomobject]@{ path = $relative; reason = "larger than ${MaxFileSizeMb}MB" })
    continue
  }

  if ($fileInfo.Length -le 2MB -and $fileInfo.Length -gt 0) {
    $bytes = [System.IO.File]::ReadAllBytes($sourceFile)
    $sampleLength = [Math]::Min($bytes.Length, 4096)
    $containsNull = $false
    for ($index = 0; $index -lt $sampleLength; $index += 1) {
      if ($bytes[$index] -eq 0) {
        $containsNull = $true
        break
      }
    }
    if (-not $containsNull) {
      $text = [System.Text.Encoding]::UTF8.GetString($bytes)
      foreach ($entry in $secretPatterns.GetEnumerator()) {
        if ($text -match $entry.Value) {
          $findings.Add([pscustomobject]@{ path = $relative; pattern = $entry.Key })
        }
      }
    }
  }

  $included.Add([pscustomobject]@{ path = $relative; source = $sourceFile; bytes = $fileInfo.Length })
}

$commitOutput = @(& git -c "safe.directory=$gitSafeDirectory" -C $sourceRoot rev-parse HEAD)
if ($LASTEXITCODE -ne 0 -or $commitOutput.Count -eq 0) { throw 'Unable to resolve source commit.' }
$commit = ([string]$commitOutput[0]).Trim()
$remoteOutput = @(& git -c "safe.directory=$gitSafeDirectory" -C $sourceRoot config --get remote.origin.url 2>$null)
$remote = if ($remoteOutput.Count -gt 0) { ([string]$remoteOutput[0]).Trim() } else { '' }
if ($remote -match '^https?://[^/@]+@') {
  $remote = $remote -replace '^(https?://)[^/@]+@', '$1'
}

$totalBytes = ($included | Measure-Object -Property bytes -Sum).Sum
if ($null -eq $totalBytes) { $totalBytes = 0 }

Write-Output "Module: $ModuleSlug"
Write-Output "Commit: $commit"
Write-Output "Tracked files: $($trackedFiles.Count)"
Write-Output "Import candidates: $($included.Count) ($totalBytes bytes)"
Write-Output "Excluded: $($excluded.Count)"
Write-Output "High-confidence secret findings: $($findings.Count)"

if ($excluded.Count -gt 0) {
  $excluded | Sort-Object path | Format-Table -AutoSize path, reason
}
if ($findings.Count -gt 0) {
  $findings | Sort-Object path, pattern | Format-Table -AutoSize path, pattern
  throw 'Import blocked: review and remove or explicitly exclude every secret finding.'
}

if (-not $Apply) {
  Write-Output 'Dry run complete. Re-run with -Apply after reviewing the inventory.'
  exit 0
}

New-Item -ItemType Directory -Path $destinationRoot -Force | Out-Null
foreach ($file in $included) {
  $destinationFile = [System.IO.Path]::GetFullPath((Join-Path $destinationRoot $file.path))
  $destinationPrefix = $destinationRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
  if (-not $destinationFile.StartsWith($destinationPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing escaped destination: $destinationFile"
  }
  $destinationDirectory = Split-Path -Parent $destinationFile
  New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
  Copy-Item -LiteralPath $file.source -Destination $destinationFile
}

$manifest = [ordered]@{
  moduleSlug = $ModuleSlug
  sourceRemote = if ($remote) { $remote } else { $null }
  sourceCommit = $commit
  importedAtUtc = [DateTime]::UtcNow.ToString('o')
  trackedFileCount = $trackedFiles.Count
  fileCount = $included.Count
  totalBytes = [int64]$totalBytes
  maxFileSizeMb = $MaxFileSizeMb
  excludedFiles = @($excluded | Sort-Object path | ForEach-Object {
    [ordered]@{ path = $_.path; reason = $_.reason }
  })
  highConfidenceSecretFindings = 0
  policy = 'tracked-files-only; dependency locks, generated artifacts, local data, private keys, credentials, and environment files excluded'
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $destinationRoot 'SOURCE_SNAPSHOT.json') -Encoding utf8

Write-Output "Imported $($included.Count) files into $destinationRoot"
