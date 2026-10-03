param(
  [Parameter(Mandatory)][string]$Wrapper,
  [ValidateSet('assembleDebug', 'bundleRelease')][string]$Task,
  [ValidateSet('true', 'false')][string]$AllowCleartext = 'false'
)
$ErrorActionPreference = 'Stop'
& $Wrapper $Task '--console=plain' '--no-daemon' "-PeotionAllowCleartext=$AllowCleartext"
exit $LASTEXITCODE
