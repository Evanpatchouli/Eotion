param(
  [Parameter(Mandatory)][string]$Artifact,
  [Parameter(Mandatory)][string]$Bundle,
  [Parameter(Mandatory)][string]$Icon,
  [Parameter(Mandatory)][string]$Metadata
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
$expected = Get-Content -LiteralPath $Metadata -Raw | ConvertFrom-Json
$bundleHash = (Get-FileHash -LiteralPath $Bundle -Algorithm SHA256).Hash.ToLowerInvariant()
$iconHash = (Get-FileHash -LiteralPath $Icon -Algorithm SHA256).Hash.ToLowerInvariant()
$zip = [IO.Compression.ZipFile]::OpenRead($Artifact)
try {
  $bundleEntry = @($zip.Entries | Where-Object FullName -Match '(^|/)main\.lynx\.bundle$')
  $metadataEntry = @($zip.Entries | Where-Object FullName -Match '(^|/)eotion-build\.json$')
  if ($bundleEntry.Count -ne 1 -or $metadataEntry.Count -ne 1) { throw 'Expected exactly one packaged Lynx bundle and build metadata.' }
  $stream = $bundleEntry[0].Open()
  try { $actualHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)).ToLowerInvariant() } finally { $stream.Dispose() }
  if ($actualHash -ne $bundleHash -or $expected.bundleSha256 -ne $bundleHash) { throw 'Packaged Lynx bundle does not match the actual mobile build.' }
  $reader = [IO.StreamReader]::new($metadataEntry[0].Open())
  try { $actual = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
  foreach ($key in @('version', 'buildNumber', 'applicationId', 'webUrl', 'bundleSha256')) {
    if ($actual.$key -ne $expected.$key) { throw "Packaged build metadata differs: $key" }
  }
  $icons = @($zip.Entries | Where-Object FullName -Match '(^|/)app_icon\.png$')
  $matchedIcon = $false
  foreach ($entry in $icons) {
    $stream = $entry.Open()
    try { $hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)).ToLowerInvariant() } finally { $stream.Dispose() }
    if ($hash -eq $iconHash) { $matchedIcon = $true }
  }
  if (!$matchedIcon) { throw 'Repository launcher PNG not found in artifact.' }
  Write-Output "[mobile] archive verified: exact Lynx bundle, repository icon, version, buildNumber, applicationId, Web URL"
} finally { $zip.Dispose() }
