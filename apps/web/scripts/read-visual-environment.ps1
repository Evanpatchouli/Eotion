$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'Visual baseline environment requires Windows.' }

# GET actions only; this script never changes font rendering settings.
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class VisualFontParameters {
    [DllImport("user32.dll", EntryPoint = "SystemParametersInfoW", SetLastError = true)]
    public static extern bool Get(uint action, uint parameter, out uint value, uint flags);
}
"@
$spi = [ordered]@{}
foreach ($entry in @(@('type', 0x200A), @('contrast', 0x200C), @('orientation', 0x2012))) {
    [uint32]$value = 0
    if (-not [VisualFontParameters]::Get($entry[1], 0, [ref]$value, 0)) {
        throw "Could not read font smoothing $($entry[0])."
    }
    $spi[$entry[0]] = $value
}
$avalon = [ordered]@{}
foreach ($hive in @('HKCU', 'HKLM')) {
    $key = "${hive}:\Software\Microsoft\Avalon.Graphics\DISPLAY1"
    $values = if (Test-Path -LiteralPath $key) { Get-ItemProperty -LiteralPath $key } else { $null }
    $avalon[$hive] = [ordered]@{
        PixelStructure = $values.PixelStructure
        GammaLevel = $values.GammaLevel
        ClearTypeLevel = $values.ClearTypeLevel
    }
}
$fonts = [ordered]@{}
foreach ($name in @('msyh.ttc', 'msyhbd.ttc', 'segoeui.ttf', 'arial.ttf')) {
    $path = Join-Path $env:WINDIR "Fonts/$name"
    $fonts[$name] = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
}
[ordered]@{
    osBuild = (Get-CimInstance Win32_OperatingSystem).BuildNumber
    spi = $spi
    avalon = $avalon
    fonts = $fonts
} | ConvertTo-Json -Depth 5
