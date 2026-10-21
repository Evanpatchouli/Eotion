$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath 'C:/Users/31250/AppData/Local/Temp/eotion-p116-resume-dfbb4269eb4c4a6794279c34f3d9ba5d/coarse-probe'
& 'C:/Users/31250/.vite-plus/bin/node.exe' 'C:/Users/31250/Work/Eotion/apps/web/node_modules/@playwright/test/cli.js' test --config=playwright.config.ts --grep 'P11.5 coarse touch keeps controls reachable and scrolls the native Timeline surface' 1> stdout.log 2> stderr.log
$runExit = $LASTEXITCODE
[IO.File]::WriteAllText((Join-Path (Get-Location).Path 'exit-code.txt'), [string]$runExit, [Text.UTF8Encoding]::new($false))
exit $runExit
