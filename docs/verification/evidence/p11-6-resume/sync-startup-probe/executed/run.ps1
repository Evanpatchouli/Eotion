param(
  [ValidateSet('current-single','current-full-sync','baseline-single','baseline-full-sync')][string]$Step,
  [string]$ProbeRoot = 'C:/Users/31250/AppData/Local/Temp/eotion-p116-resume-dfbb4269eb4c4a6794279c34f3d9ba5d/sync-startup-probe/executed',
  [string]$BaseUrl = 'http://127.0.0.1:7173'
)
$ErrorActionPreference = 'Stop'
$artifactDirectory = Join-Path $ProbeRoot $Step
if (Test-Path -LiteralPath $artifactDirectory) { throw "Evidence directory already exists; choose a fresh ProbeRoot instead of overwriting evidence: $artifactDirectory" }
New-Item -ItemType Directory -Path $artifactDirectory | Out-Null
$env:EOTION_PROBE_OUTPUT = Join-Path $artifactDirectory 'test-results'
$env:EOTION_PROBE_RESULTS = Join-Path $artifactDirectory 'results.json'
$env:EOTION_PROBE_BASE_URL = $BaseUrl
$probeArguments = @('C:/Users/31250/Work/Eotion/apps/web/node_modules/@playwright/test/cli.js','test','--config',(Join-Path $ProbeRoot 'playwright.config.ts'),'--workers=1','--retries=0')
if ($Step.EndsWith('-single')) { $probeArguments += @('--grep','a second client pulls sequential changes and remote deletion removes local pages') }
$probeStarted = Get-Date
@{ executable = 'node'; arguments = $probeArguments; cwd = 'C:/Users/31250/Work/Eotion/apps/web'; baseUrl = $BaseUrl; started = $probeStarted.ToString('o'); sourcePlan = (Join-Path $ProbeRoot 'plan.json') } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $artifactDirectory 'command.json') -Encoding utf8NoBOM
Push-Location 'C:/Users/31250/Work/Eotion/apps/web'
try {
  & node @probeArguments 1> (Join-Path $artifactDirectory 'stdout.log') 2> (Join-Path $artifactDirectory 'stderr.log')
  $probeExitCode = $LASTEXITCODE
} finally { Pop-Location }
@{ exitCode=$probeExitCode;started=$probeStarted.ToString('o');ended=(Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $artifactDirectory 'summary.json') -Encoding utf8NoBOM
exit $probeExitCode
