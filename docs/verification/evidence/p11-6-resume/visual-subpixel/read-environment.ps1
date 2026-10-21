param([string]$OutputDirectory=$PSScriptRoot)
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class FontParamsReadOnly { [DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint a,uint b,out uint c,uint d); }
"@
$spi=@(); foreach ($action in @(0x200A,0x200C,0x2012)) { $value=0; $ok=[FontParamsReadOnly]::SystemParametersInfo($action,0,[ref]$value,0); $spi += [PSCustomObject]@{Action=('{0:X}' -f $action);Success=$ok;Value=$value} }
$fontFiles=@('C:/Windows/Fonts/msyh.ttc','C:/Windows/Fonts/msyhbd.ttc','C:/Windows/Fonts/segoeui.ttf','C:/Windows/Fonts/arial.ttf')
$fontMetadata=@(); foreach ($file in $fontFiles) { if(Test-Path -LiteralPath $file) {$item=Get-Item -LiteralPath $file; $fontMetadata += [PSCustomObject]@{path=$file;size=$item.Length;lastWriteTimeUtc=$item.LastWriteTimeUtc;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash} } }
$chrome='C:/Program Files/Google/Chrome/Application/chrome.exe'
$avalon=@(); foreach ($key in @('HKCU:\Software\Microsoft\Avalon.Graphics','HKLM:\Software\Microsoft\Avalon.Graphics')) { if(Test-Path -LiteralPath $key) { $avalon += Get-ItemProperty -LiteralPath $key | Select-Object PSPath,PixelStructure,GammaLevel,EnhancedContrast,ClearTypeLevel; $avalon += Get-ChildItem -LiteralPath $key | Get-ItemProperty | Select-Object PSPath,PixelStructure,GammaLevel,EnhancedContrast,ClearTypeLevel } }
$meta=[PSCustomObject]@{date=(Get-Date -Format o);spi=$spi;desktopRegistry=(Get-ItemProperty -LiteralPath 'HKCU:\Control Panel\Desktop' | Select-Object FontSmoothing,FontSmoothingType,FontSmoothingGamma,FontSmoothingOrientation);avalon=$avalon;os=(Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber);chrome=(Get-Item -LiteralPath $chrome | Select-Object FullName,@{N='ProductVersion';E={$_.VersionInfo.ProductVersion}});chromeSha256=(Get-FileHash -LiteralPath $chrome -Algorithm SHA256).Hash;fontFiles=$fontMetadata;mutation='none; Get API only; no browser launched'}
$json=$meta | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText(($OutputDirectory+'/environment-readonly.json'),$json+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
$json