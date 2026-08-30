[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$campaign = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$artifactRoot = [System.IO.Directory]::GetParent($campaign).FullName
$uploadZip = Join-Path $artifactRoot 'operatoros-campaign-2026-08-30-upload-ready.zip'
$sourceZip = Join-Path $artifactRoot 'operatoros-campaign-2026-08-30-source.zip'

if (-not $campaign.StartsWith([System.IO.Path]::GetFullPath('C:\Dev\OperatorOS\artifacts\marketing'), [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Campaign path is outside the expected artifact root: $campaign"
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function New-CampaignZip {
  param(
    [Parameter(Mandatory)] [string] $Destination,
    [Parameter(Mandatory)] [System.IO.FileInfo[]] $Files
  )

  if (Test-Path -LiteralPath $Destination) {
    Remove-Item -LiteralPath $Destination -Force
  }

  $stream = [System.IO.File]::Open($Destination, [System.IO.FileMode]::CreateNew)
  try {
    $archive = [System.IO.Compression.ZipArchive]::new(
      $stream,
      [System.IO.Compression.ZipArchiveMode]::Create,
      $false
    )
    try {
      foreach ($file in ($Files | Sort-Object FullName -Unique)) {
        $entryName = [System.IO.Path]::GetRelativePath($campaign, $file.FullName).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
          $archive,
          $file.FullName,
          $entryName,
          [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
      }
    }
    finally {
      $archive.Dispose()
    }
  }
  finally {
    $stream.Dispose()
  }
}

$uploadFiles = @(
  Get-Item -LiteralPath (Join-Path $campaign 'README.md')
  Get-Item -LiteralPath (Join-Path $campaign 'manifest.json')
  Get-Item -LiteralPath (Join-Path $campaign 'campaign-data.json')
  Get-ChildItem -LiteralPath (Join-Path $campaign 'copy') -File -Recurse
  Get-ChildItem -LiteralPath (Join-Path $campaign 'static') -File
  Get-ChildItem -LiteralPath (Join-Path $campaign 'video') -File |
    Where-Object { $_.Extension -in '.mp4', '.png', '.srt', '.json' }
)

$sourceFiles = @(Get-ChildItem -LiteralPath $campaign -File -Recurse)

New-CampaignZip -Destination $uploadZip -Files $uploadFiles
New-CampaignZip -Destination $sourceZip -Files $sourceFiles

$result = @(
  Get-Item -LiteralPath $uploadZip, $sourceZip | ForEach-Object {
    [pscustomobject]@{
      path = $_.FullName
      bytes = $_.Length
      sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
    }
  }
)

$result | ConvertTo-Json -Depth 3
