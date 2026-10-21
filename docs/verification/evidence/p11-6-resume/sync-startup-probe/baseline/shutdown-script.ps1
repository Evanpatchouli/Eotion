$ErrorActionPreference = 'Stop'
$evidenceRoot = 'C:/Users/31250/AppData/Local/Temp/eotion-p116-resume-dfbb4269eb4c4a6794279c34f3d9ba5d/sync-startup-probe/baseline'
$preflight = Get-Content -LiteralPath (Join-Path $evidenceRoot 'shutdown-preflight.json') -Raw | ConvertFrom-Json
$recorded = @($preflight.recorded)
$events = [System.Collections.Generic.List[object]]::new()
$stdoutPath = Join-Path $evidenceRoot 'shutdown.stdout.log'
[System.IO.File]::WriteAllText($stdoutPath, '', [System.Text.UTF8Encoding]::new($false))
function Add-ShutdownEvent([string]$action, [object]$detail) {
  $item = [pscustomobject]@{time=(Get-Date).ToString('o');action=$action;detail=$detail}
  $events.Add($item)
  $line = $item | ConvertTo-Json -Depth 6 -Compress
  Add-Content -LiteralPath $stdoutPath -Value $line -Encoding utf8NoBOM
  Write-Output $line
}
function Assert-OwnedProcess([int]$targetPid) {
  $saved = @($recorded | Where-Object { $_.ProcessId -eq $targetPid })[0]
  if (-not $saved) { throw "Missing recorded process identity for $targetPid" }
  $live = Get-CimInstance Win32_Process -Filter "ProcessId = $targetPid"
  if (-not $live) { return $null }
  $createdMatches = $live.CreationDate.ToUniversalTime().Ticks -eq ([datetimeoffset]$saved.CreationDate).UtcDateTime.Ticks
  if ($live.CommandLine -ne $saved.CommandLine -or $live.ExecutablePath -ne $saved.ExecutablePath -or $live.ParentProcessId -ne $saved.ParentProcessId -or -not $createdMatches) { throw "PID identity changed; refusing to touch $targetPid" }
  if ($live.CommandLine -notlike '*--port 7176 --strictPort*') { throw "PID $targetPid is not recorded port7176 command" }
  return $live
}
$preserved7173 = @(Get-NetTCPConnection -LocalPort 7173 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess)
$leaf = Assert-OwnedProcess 51776
$listener = @(Get-NetTCPConnection -LocalPort 7176 -State Listen -ErrorAction SilentlyContinue)
if ($listener.Count -gt 0 -and @($listener | Where-Object { $_.OwningProcess -ne 51776 }).Count -gt 0) { throw 'Port7176 is owned by an unknown process; refusing shutdown' }
foreach ($targetPid in @(61892,54984)) { $null = Assert-OwnedProcess $targetPid }
Add-ShutdownEvent 'identity-and-listener-verified' @{pids=@(61892,54984,51776);listenerPid=@($listener.OwningProcess);sourceRecord='vite-service.json + vite-process-chain.json + vite-intermediate-process.json'}
if ($leaf) {
 $process = Get-Process -Id 51776
 $accepted = $process.CloseMainWindow()
 Add-ShutdownEvent 'normal-window-close-attempt' @{pid=51776;accepted=$accepted;reason='Hidden Vite process has no controllable PTY/stdin handle; do not signal a shared console'}
 if ($accepted) { $null = $process.WaitForExit(1500) }
}
foreach ($targetPid in @(51776,54984,61892)) {
 $live = Assert-OwnedProcess $targetPid
 if ($live) {
  Stop-Process -Id $targetPid -ErrorAction Stop
  Add-ShutdownEvent 'stop-owned-process' @{pid=$targetPid;commandLine=$live.CommandLine;creationDate=$live.CreationDate}
 } else { Add-ShutdownEvent 'already-exited' @{pid=$targetPid} }
}
$remaining = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -in @(61892,54984,51776) } | Select-Object ProcessId,ParentProcessId,CommandLine,CreationDate)
$after7176 = @(Get-NetTCPConnection -LocalPort 7176 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess)
$after7173 = @(Get-NetTCPConnection -LocalPort 7173 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess)
$metadata = [pscustomobject]@{completed=(Get-Date).ToString('o');events=$events;remainingRecordedPids=$remaining;port7176Listeners=$after7176;port7173Before=$preserved7173;port7173After=$after7173;port7173Touched=$false;directoriesDeleted=$false;browserRun=$false;buildRun=$false}
$metadata | ConvertTo-Json -Depth 14 | Set-Content -LiteralPath (Join-Path $evidenceRoot 'shutdown-metadata.json') -Encoding utf8NoBOM
Copy-Item -LiteralPath (Join-Path $evidenceRoot 'vite.stdout.log') -Destination (Join-Path $evidenceRoot 'shutdown-vite.stdout.log')
Copy-Item -LiteralPath (Join-Path $evidenceRoot 'vite.stderr.log') -Destination (Join-Path $evidenceRoot 'shutdown-vite.stderr.log')
if ($remaining.Count -gt 0 -or $after7176.Count -gt 0) { throw 'Owned shutdown incomplete; see shutdown-metadata.json' }
Add-ShutdownEvent 'shutdown-verified' @{remainingRecordedPids=0;port7176Listeners=0;port7173Listeners=@($after7173.OwningProcess)}
