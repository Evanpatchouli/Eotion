param([string]$OutFile, [string]$StopFile)
$ErrorActionPreference = 'Stop'
while (-not (Test-Path -LiteralPath $StopFile)) {
  try {
    $memory = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory
    [ordered]@{ time=[DateTime]::UtcNow.ToString('o'); availableBytes=$memory.AvailableBytes; committedBytes=$memory.CommittedBytes; commitLimit=$memory.CommitLimit; percentCommitted=$memory.PercentCommittedBytesInUse; poolNonpagedBytes=$memory.PoolNonpagedBytes; poolPagedBytes=$memory.PoolPagedBytes; freeSystemPageTableEntries=$memory.FreeSystemPageTableEntries } | ConvertTo-Json -Compress | Add-Content -LiteralPath $OutFile -Encoding utf8
  } catch {
    @{ time=[DateTime]::UtcNow.ToString('o'); observationError=$_.ToString() } | ConvertTo-Json -Compress | Add-Content -LiteralPath $OutFile -Encoding utf8
  }
  Start-Sleep -Seconds 15
}
