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

$env:ORG_GRADLE_PROJECT_newArchEnabled = "true"
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

Write-Host "Running postinstall patches..."
Push-Location $root
try {
  npm run postinstall
}
finally {
  Pop-Location
}

Push-Location $androidDir
try {
  Write-Host "Generating autolinking package list..."
  & .\gradlew.bat :app:generateAutolinkingPackageList --no-daemon --console=plain --max-workers=1

  $listPrewarmScript = Join-Path $root "scripts/ci/list_android_codegen_prewarm_tasks.js"
  if (Test-Path $listPrewarmScript) {
    $prewarmTasks = node $listPrewarmScript
    if ($prewarmTasks) {
      $prewarmTaskList = $prewarmTasks -split "`r?`n" | Where-Object { $_.Trim() }
      if ($prewarmTaskList.Count -gt 0) {
        Write-Host "Prewarming codegen tasks: $($prewarmTaskList -join ' ')"
        $prewarmArgs = $prewarmTaskList + @("--no-daemon", "--console=plain", "--max-workers=1")
        & .\gradlew.bat @prewarmArgs
      }
    }
  }

  Write-Host "Generating new architecture autolinking files..."
  & .\gradlew.bat :app:generateAutolinkingNewArchitectureFiles --no-daemon --console=plain --max-workers=1

  $filterScript = Join-Path $root "scripts/ci/filter_android_autolinking.js"
  if (Test-Path $filterScript) {
    node $filterScript
  }

  Write-Host "Building $task..."
  $gradleArgs = @(
    $task,
    "--no-daemon",
    "--console=plain",
    "--max-workers=1",
    "-x", "generateAutolinkingNewArchitectureFiles"
  ) + $extraGradleArgs

  & .\gradlew.bat @gradleArgs
}
finally {
  Pop-Location
}
