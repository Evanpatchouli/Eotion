param([ValidateSet('android', 'harmony')][string]$Platform)
$ErrorActionPreference = 'Stop'

function First-Directory($Candidates) {
  foreach ($candidate in $Candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Container)) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }
  return $null
}

function Studio-Directory($Name) {
  $installed = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
    Where-Object DisplayName -Match $Name
  $candidates = @($installed | ForEach-Object { $_.InstallLocation })
  foreach ($entry in $installed) {
    if ($entry.DisplayIcon) {
      $icon = ($entry.DisplayIcon -replace ',\d+$', '').Trim('"')
      $candidates += Split-Path (Split-Path $icon)
    }
  }
  if ($Name -eq 'DevEco') {
    $candidates += @($env:DEVECO_STUDIO_HOME, "$env:ProgramFiles\Huawei\DevEco Studio", 'C:\Apps\Huawei\DevEco Studio')
  } else {
    $candidates += @($env:ANDROID_STUDIO_HOME, "$env:ProgramFiles\Android\Android Studio", 'C:\Apps\Android Studio')
  }
  First-Directory $candidates
}

if ($Platform -eq 'android') {
  $sdkCandidates = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, "$env:LOCALAPPDATA\Android\Sdk")
  $adb = Get-Command adb -ErrorAction SilentlyContinue
  if ($adb) { $sdkCandidates += Split-Path (Split-Path $adb.Source) }
  $sdk = First-Directory $sdkCandidates
  if (!$sdk) { throw 'Android SDK not found. Set ANDROID_HOME (platforms/android-36 and build-tools/36.0.0 required).' }
  $jdkCandidates = @($env:EOTION_ANDROID_JAVA_HOME)
  # Gradle 8.14 supports Java 17–24; prefer the existing provisioned JDK 21.
  $jdkCache = Join-Path $env:USERPROFILE '.gradle\jdks'
  if (Test-Path -LiteralPath $jdkCache) {
    $jdkCandidates += @(Get-ChildItem -LiteralPath $jdkCache -Directory | Where-Object Name -Match '21' | ForEach-Object {
      if (Test-Path -LiteralPath (Join-Path $_.FullName 'bin\java.exe')) { $_.FullName }
      else { Get-ChildItem -LiteralPath $_.FullName -Directory | ForEach-Object { $_.FullName } }
    })
  }
  $studio = Studio-Directory 'Android Studio'
  $jdkCandidates += @($env:JAVA_HOME, $(if ($studio) { Join-Path $studio 'jbr' }))
  $jdk = $null
  foreach ($candidate in $jdkCandidates) {
    if (!$candidate -or !(Test-Path -LiteralPath (Join-Path $candidate 'release'))) { continue }
    $release = Get-Content -LiteralPath (Join-Path $candidate 'release') -Raw
    if ($release -match 'JAVA_VERSION="(\d+)') {
      $major = [int]$Matches[1]
      if ($major -ge 17 -and $major -le 24) { $jdk = $candidate; break }
    }
  }
  if (!$jdk) { throw 'Gradle 8.14 requires JDK 17–24. Set EOTION_ANDROID_JAVA_HOME to a supported JDK.' }
  foreach ($required in @('platforms\android-36\android.jar', 'build-tools\36.0.0\aapt2.exe')) {
    if (!(Test-Path -LiteralPath (Join-Path $sdk $required))) { throw "Android SDK missing $required under $sdk. Install it using Android Studio SDK Manager." }
  }
  @{ sdk = $sdk; javaHome = $jdk } | ConvertTo-Json -Compress
} else {
  $studio = Studio-Directory 'DevEco'
  if (!$studio) { throw 'DevEco Studio not found. Set DEVECO_STUDIO_HOME.' }
  $sdkCandidates = @($env:HARMONY_SDK_HOME, $(if ($env:OPEN_HARMONY_HOME) { Split-Path $env:OPEN_HARMONY_HOME }), (Join-Path $studio 'sdk\default'))
  $sdk = First-Directory $sdkCandidates
  if (!$sdk -or !(Test-Path -LiteralPath (Join-Path $sdk 'sdk-pkg.json'))) {
    throw 'HarmonyOS SDK root (containing sdk-pkg.json, hms and openharmony) not found. Set HARMONY_SDK_HOME.'
  }
  $node = Join-Path $studio 'tools\node\node.exe'
  $hvigor = Join-Path $studio 'tools\hvigor\bin\hvigorw.js'
  $ohpm = Join-Path $studio 'tools\ohpm\bin\pm-cli.js'
  foreach ($required in @($node, $hvigor, $ohpm)) {
    if (!(Test-Path -LiteralPath $required)) { throw "DevEco tool missing: $required" }
  }
  $metadata = Get-Content -LiteralPath (Join-Path $sdk 'sdk-pkg.json') -Raw | ConvertFrom-Json
  @{ studio = $studio; sdk = $sdk; sdkVersion = $metadata.data.platformVersion; apiVersion = $metadata.data.apiVersion; node = $node; hvigor = $hvigor; ohpm = $ohpm; javaHome = (Join-Path $studio 'jbr') } | ConvertTo-Json -Compress
}
