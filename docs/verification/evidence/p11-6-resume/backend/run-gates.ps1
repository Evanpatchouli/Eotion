$ErrorActionPreference = 'Continue'
$root = 'C:\Users\31250\AppData\Local\Temp\eotion-p116-resume-dfbb4269eb4c4a6794279c34f3d9ba5d\backend'
$repo = 'C:\Users\31250\Work\Eotion'
$mongoUri = 'mongodb://127.0.0.1:55479/?replicaSet=p116_dfbb4269'
$env:P4_TEST_MONGODB_URI = $mongoUri
$gates = @(
  @{ Name='domain-test'; Args=@('--filter','@eotion/domain','test'); Mongo=$false },
  @{ Name='contracts-test'; Args=@('--filter','@eotion/contracts','test'); Mongo=$false },
  @{ Name='sdk-test'; Args=@('--filter','@eotion/sdk','test'); Mongo=$false },
  @{ Name='storage-test'; Args=@('--filter','@eotion/storage','test'); Mongo=$false },
  @{ Name='api-domain-real-mongo'; Args=@('--filter','@eotion/api','test:domain'); Mongo=$true },
  @{ Name='api-http-real-mongo'; Args=@('--filter','@eotion/api','test:http'); Mongo=$true },
  @{ Name='api-mcp-real-mongo'; Args=@('--filter','@eotion/api','test:mcp'); Mongo=$true },
  @{ Name='api-database-performance-real-mongo'; Args=@('--filter','@eotion/api','test:database:performance'); Mongo=$true },
  @{ Name='api-typecheck'; Args=@('--filter','@eotion/api','typecheck'); Mongo=$false },
  @{ Name='api-build'; Args=@('--filter','@eotion/api','build'); Mongo=$false },
  @{ Name='version-check'; Args=@('version:check'); Mongo=$false }
)
$results = [System.Collections.Generic.List[object]]::new()
Push-Location $repo
try {
  foreach ($gate in $gates) {
    $started = (Get-Date).ToUniversalTime().ToString('o')
    $out = Join-Path (Join-Path $root 'logs') ($gate.Name + '.stdout.log')
    $err = Join-Path (Join-Path $root 'logs') ($gate.Name + '.stderr.log')
    $envUsed = if ($gate.Mongo) { $mongoUri } else { $null }
    "[$started] pnpm $($gate.Args -join ' ')" | Set-Content -LiteralPath (Join-Path (Join-Path $root 'logs') ($gate.Name + '.command.txt')) -Encoding utf8NoBOM
    & pnpm @($gate.Args) 1> $out 2> $err
    $exitCode = $LASTEXITCODE
    $finished = (Get-Date).ToUniversalTime().ToString('o')
    $results.Add([pscustomobject]@{ name=$gate.Name; command=('pnpm ' + ($gate.Args -join ' ')); startedAt=$started; finishedAt=$finished; exitCode=$exitCode; mongoUri=$envUsed; stdout=$out; stderr=$err })
    $results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $root 'summary.json') -Encoding utf8NoBOM
    "GATE $($gate.Name) EXIT $exitCode ($started to $finished)"
  }
} finally {
  Pop-Location
}

