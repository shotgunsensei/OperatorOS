<#
.SYNOPSIS
  READ-ONLY ecosystem domain health check.

.DESCRIPTION
  Prints a "Domain | DNS Status | Resolved Target | HTTPS Status" table for
  every OperatorOS platform component domain and every module ecosystem
  domain. It performs NO infrastructure changes: no DNS edits, no redirects,
  no Cloudflare/Replit API calls. The only output is to the console.

  Domain source of truth: ecosystem.registry.json at the repo root
  (platformDomains.* + every module .ecosystemUrl, e.g. techdeck,
  tradeflowkit, torqueshed, ...). The script parses it with the built-in
  ConvertFrom-Json. If the registry cannot be read/parsed, it falls back to a
  minimal hard-coded domain list — NOTE: ecosystem.registry.json is the
  preferred source; the fallback only lists bare domain names and must not be
  treated as duplicated module metadata.

.EXAMPLE
  pwsh scripts/check-ecosystem-domains.ps1
#>

$ErrorActionPreference = 'Continue'

$registryPath = Join-Path $PSScriptRoot '..\ecosystem.registry.json'

function Get-BareHost {
  param([string]$Url)
  if ([string]::IsNullOrWhiteSpace($Url)) { return $null }
  return ($Url -replace '^https?://', '') -replace '/.*$', ''
}

# ---------------------------------------------------------------------------
# Collect the domain list (bare hostnames, no scheme).
# ---------------------------------------------------------------------------
$domains = @()

if (Test-Path $registryPath) {
  try {
    $registry = Get-Content -Raw -Path $registryPath | ConvertFrom-Json
    foreach ($p in $registry.platformDomains.PSObject.Properties) {
      $h = Get-BareHost $p.Value
      if ($h) { $domains += $h }
    }
    foreach ($m in $registry.modules) {
      $h = Get-BareHost $m.ecosystemUrl
      if ($h) { $domains += $h }
    }
  } catch {
    Write-Warning "Could not parse ecosystem.registry.json: $($_.Exception.Message)"
  }
}

if ($domains.Count -eq 0) {
  Write-Warning "Using minimal fallback domain list. ecosystem.registry.json is the preferred source of truth."
  # Minimal fallback — bare domain names only (NOT module metadata).
  $domains = @(
    'operatoros.net',
    'app.operatoros.net',
    'api.operatoros.net',
    'admin.operatoros.net',
    'auth.operatoros.net',
    'docs.operatoros.net',
    'status.operatoros.net',
    'techdeck.operatoros.net'
  )
}

$domains = $domains | Select-Object -Unique

# ---------------------------------------------------------------------------
# Per-domain checks. Everything fails gracefully so one bad domain never
# aborts the run.
# ---------------------------------------------------------------------------
function Resolve-Target {
  param([string]$DomainName)
  try {
    $records = Resolve-DnsName -Name $DomainName -ErrorAction Stop
    $a = $records | Where-Object { $_.Type -eq 'A' } | Select-Object -First 1
    if ($a) { return @{ Status = 'resolved'; Target = $a.IPAddress } }
    $cname = $records | Where-Object { $_.Type -eq 'CNAME' } | Select-Object -First 1
    if ($cname) { return @{ Status = 'resolved'; Target = $cname.NameHost } }
    return @{ Status = 'no-record'; Target = '-' }
  } catch {
    return @{ Status = 'no-record'; Target = '-' }
  }
}

function Get-HttpsStatus {
  param([string]$DomainName)
  try {
    $resp = Invoke-WebRequest -Uri "https://$DomainName" -Method Head -MaximumRedirection 5 -TimeoutSec 10 -ErrorAction Stop
    return [string][int]$resp.StatusCode
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code) { return [string]$code }
    return 'unreachable'
  }
}

# ---------------------------------------------------------------------------
# Render table.
# ---------------------------------------------------------------------------
$fmt = "{0,-34} | {1,-10} | {2,-28} | {3,-12}"
Write-Output ($fmt -f 'Domain', 'DNS Status', 'Resolved Target', 'HTTPS Status')
Write-Output ($fmt -f ('-' * 34), ('-' * 10), ('-' * 28), ('-' * 12))

foreach ($d in $domains) {
  $dns = Resolve-Target -DomainName $d
  $https = Get-HttpsStatus -DomainName $d
  Write-Output ($fmt -f $d, $dns.Status, $dns.Target, $https)
}
