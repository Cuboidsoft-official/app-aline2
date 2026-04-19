param(
  [ValidateSet("apk", "aab")]
  [string]$Mode = "apk"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $root "android"

$env:ENVFILE = ".env.production"

$task = if ($Mode -eq "aab") { "bundleRelease" } else { "assembleRelease" }

Push-Location $androidDir
try {
  $gradleArgs = @(
    $task,
    "--no-daemon",
    "--console=plain",
    "--max-workers=1",
    "-PreactNativeArchitectures=armeabi-v7a,arm64-v8a"
  )

  & .\gradlew.bat @gradleArgs
}
finally {
  Pop-Location
}
