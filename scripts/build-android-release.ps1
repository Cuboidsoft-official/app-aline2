param(
  [ValidateSet("apk", "apk-arm64", "aab")]
  [string]$Mode = "apk"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $root "android"

$secretsFile = Join-Path $root "release-secrets/aline2-upload-2026.env"
if (Test-Path $secretsFile) {
  Get-Content $secretsFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
      $parts = $line.Split("=", 2)
      [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), [System.EnvironmentVariableTarget]::Process)
    }
  }
}

if ($env:ANDROID_UPLOAD_STORE_FILE) {
  if (-not [System.IO.Path]::IsPathRooted($env:ANDROID_UPLOAD_STORE_FILE)) {
    $env:ANDROID_UPLOAD_STORE_FILE = [System.IO.Path]::GetFullPath((Join-Path $root $env:ANDROID_UPLOAD_STORE_FILE))
  }
}

$env:ENVFILE = ".env.production"

switch ($Mode) {
  "apk" {
    $task = "assembleRelease"
    $extraGradleArgs = @(
      "-PreactNativeArchitectures=armeabi-v7a,arm64-v8a",
      "-Paline2DisableAbiSplits=true"
    )
  }
  "apk-arm64" {
    $task = "assembleRelease"
    $extraGradleArgs = @(
      "-PreactNativeArchitectures=arm64-v8a"
    )
  }
  "aab" {
    $task = "bundleRelease"
    $extraGradleArgs = @(
      "-PreactNativeArchitectures=armeabi-v7a,arm64-v8a",
      "-Paline2DisableAbiSplits=true"
    )
  }
}

Push-Location $androidDir
try {
  $gradleArgs = @(
    $task,
    "--no-daemon",
    "--console=plain",
    "--max-workers=1"
  ) + $extraGradleArgs

  & .\gradlew.bat @gradleArgs
}
finally {
  Pop-Location
}
