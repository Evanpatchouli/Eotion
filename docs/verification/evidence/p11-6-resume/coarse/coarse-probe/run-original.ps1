$ErrorActionPreference = 'Stop'
$evidenceRoot = 'C:/Users/31250/AppData/Local/Temp/eotion-p116-resume-dfbb4269eb4c4a6794279c34f3d9ba5d'
$runRoot = Join-Path $evidenceRoot 'coarse-original'
New-Item -ItemType Directory -Path $runRoot -Force | Out-Null
Set-Location -LiteralPath 'C:/Users/31250/Work/Eotion/apps/web'
& 'C:/Users/31250/.vite-plus/bin/node.exe' 'C:/Users/31250/Work/Eotion/apps/web/node_modules/@playwright/test/cli.js' test tests/product-database.spec.ts --grep 'P11.5 coarse touch keeps controls reachable and scrolls the native Timeline surface' --workers=1 --retries=0 --output="$runRoot/test-results" --reporter=line 1> "$runRoot/stdout.log" 2> "$runRoot/stderr.log"
$runExit = $LASTEXITCODE
[IO.File]::WriteAllText((Join-Path $runRoot 'exit-code.txt'), [string]$runExit, [Text.UTF8Encoding]::new($false))
exit $runExit
