param([int]$RootProcessId, [string]$OutFile, [string]$StopFile, [int]$Port = 7179)
$ErrorActionPreference = 'Stop'
$knownIds = [System.Collections.Generic.HashSet[int]]::new()
[void]$knownIds.Add($RootProcessId)
$knownBirth = @{}
while (-not (Test-Path -LiteralPath $StopFile)) {
  try {
    $sampleStartedAt = [DateTime]::UtcNow.ToString('o')
    $all = @(Get-CimInstance Win32_Process)
    foreach ($knownId in @($knownIds)) {
      $live = $all | Where-Object { [int]$_.ProcessId -eq $knownId } | Select-Object -First 1
      if (-not $live -or ($knownBirth.ContainsKey($knownId) -and $knownBirth[$knownId] -ne $live.CreationDate)) {
        [void]$knownIds.Remove($knownId)
        $knownBirth.Remove($knownId)
      } elseif (-not $knownBirth.ContainsKey($knownId)) { $knownBirth[$knownId] = $live.CreationDate }
    }
    do {
      $added = $false
      foreach ($proc in $all) {
        if ($knownIds.Contains([int]$proc.ParentProcessId) -and -not $knownIds.Contains([int]$proc.ProcessId)) {
          [void]$knownIds.Add([int]$proc.ProcessId); $knownBirth[[int]$proc.ProcessId] = $proc.CreationDate; $added = $true
        }
      }
    } while ($added)
    $owned = @($all | Where-Object { $knownIds.Contains([int]$_.ProcessId) })
    $metrics = @($owned | ForEach-Object {
      $proc = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
      if ($proc) {
        [ordered]@{ pid=$_.ProcessId; parentPid=$_.ParentProcessId; name=$_.Name; creationDate=$_.CreationDate.ToUniversalTime().ToString('o'); handles=$proc.HandleCount; threads=$proc.Threads.Count; workingSet=$proc.WorkingSet64; privateBytes=$proc.PrivateMemorySize64; commandLine=$_.CommandLine }
      }
    })
    $processesSampledAt = [DateTime]::UtcNow.ToString('o')
    $os = Get-CimInstance Win32_OperatingSystem
    $memorySampledAt = [DateTime]::UtcNow.ToString('o')
    $tcp = @(Get-NetTCPConnection -ErrorAction SilentlyContinue)
    $relatedTcp = @($tcp | Where-Object { $knownIds.Contains([int]$_.OwningProcess) -or $_.LocalPort -eq $Port -or $_.RemotePort -eq $Port } | Select-Object LocalAddress,LocalPort,RemoteAddress,RemotePort,State,OwningProcess)
    [ordered]@{ time=[DateTime]::UtcNow.ToString('o'); sampleStartedAt=$sampleStartedAt; processesSampledAt=$processesSampledAt; memorySampledAt=$memorySampledAt; rootPid=$RootProcessId; freePhysicalBytes=[long]$os.FreePhysicalMemory*1024; totalPhysicalBytes=[long]$os.TotalVisibleMemorySize*1024; systemTcpCount=$tcp.Count; processes=$metrics; tcp=$relatedTcp } | ConvertTo-Json -Depth 8 -Compress | Add-Content -LiteralPath $OutFile -Encoding utf8
  } catch {
    @{ time=[DateTime]::UtcNow.ToString('o'); observationError=$_.ToString() } | ConvertTo-Json -Compress | Add-Content -LiteralPath $OutFile -Encoding utf8
  }
  Start-Sleep -Seconds 3
}
