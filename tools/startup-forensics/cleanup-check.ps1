$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$evidence = Join-Path $repo 'docs/verification/evidence/p11-6-startup-forensics-20261021'
$groups = @($evidence, (Join-Path $evidence 'resume-20261022'), (Join-Path $evidence 'prefix94'))
$known = @{}
foreach ($group in $groups) {
  $summary = [System.IO.File]::ReadAllText((Join-Path $group 'resource-summary.json')) | ConvertFrom-Json
  if (-not $summary.resourceLineageAudit) { throw "Lineage audit missing: $group" }
  foreach ($proc in $summary.resourceLineageAudit.validatedIdentities) {
    $key = "$($proc.pid):$($proc.birth)"
    $known[$key] = $proc
  }
}
$all = @(Get-CimInstance Win32_Process)
$remaining = @()
foreach ($proc in $known.Values) {
  $live = $all | Where-Object { [int]$_.ProcessId -eq [int]$proc.pid } | Select-Object -First 1
  if ($live -and $live.CreationDate.ToUniversalTime().Ticks -eq ([DateTimeOffset]::Parse($proc.birth)).UtcDateTime.Ticks) {
    $remaining += [ordered]@{ pid=$proc.pid; parentPid=$proc.parentPid; creationDate=$live.CreationDate.ToUniversalTime().ToString('o'); sampledBirth=$proc.birth; name=$proc.name }
  }
}
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort 7179 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess)
$preservedListeners = @(Get-NetTCPConnection -State Listen -LocalPort 7173 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess)
$result = [ordered]@{
  time=[DateTime]::UtcNow.ToString('o')
  knownProcessIdentities=$known.Count
  ownedProcessesRemaining=$remaining
  diagnosticPort=7179
  diagnosticListeners=$listeners
  userPort7173Listeners=$preservedListeners
  userServicesTerminated=$false
  method='PID and original-precision CIM birth match against conservatively reconstructed validated descendants only; read-only, no process termination'
}
$result | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $evidence 'final-service-check.json') -Encoding utf8
if ($remaining.Count -or $listeners.Count) { throw 'Owned processes or diagnostic listener remain; inspect final-service-check.json' }
