# PowerShell script to build Android AAB for Play Store
# Run this from PowerShell: .\build-aab-windows.ps1

$ErrorActionPreference = "Stop"

Write-Host "Starting Android AAB build for Play Store..." -ForegroundColor Green

# Set environment variables for signing
# IMPORTANT: Replace these with your actual keystore credentials
$env:ANDROID_UPLOAD_STORE_FILE = "android\app\aline2-release.keystore"
$env:ANDROID_UPLOAD_STORE_PASSWORD = "YOUR_KEYSTORE_PASSWORD"
$env:ANDROID_UPLOAD_KEY_ALIAS = "YOUR_KEY_ALIAS"
$env:ANDROID_UPLOAD_KEY_PASSWORD = "YOUR_KEY_PASSWORD"
$env:ENVFILE = ".env.production"

# Enable new architecture
$env:ORG_GRADLE_PROJECT_newArchEnabled = "true"

# Check if keystore exists
$keystorePath = Join-Path $PSScriptRoot $env:ANDROID_UPLOAD_STORE_FILE
if (-not (Test-Path $keystorePath)) {
    Write-Host "ERROR: Keystore file not found at: $keystorePath" -ForegroundColor Red
    exit 1
}

Write-Host "Keystore found: $keystorePath" -ForegroundColor Cyan

# Navigate to android directory
Set-Location -Path (Join-Path $PSScriptRoot "android")

Write-Host "`nStep 1: Cleaning previous build..." -ForegroundColor Yellow
.\gradlew clean --console=plain

Write-Host "`nStep 2: Generating autolinking package list..." -ForegroundColor Yellow
.\gradlew :app:generateAutolinkingPackageList --no-daemon --console=plain --max-workers=1

Write-Host "`nStep 3: Generating autolinking new architecture files..." -ForegroundColor Yellow
.\gradlew :app:generateAutolinkingNewArchitectureFiles --no-daemon --console=plain --max-workers=1

Write-Host "`nStep 4: Building Release AAB..." -ForegroundColor Yellow
.\gradlew bundleRelease `
    --no-daemon `
    --console=plain `
    --max-workers=1 `
    -Paline2DisableAbiSplits=true `
    -PreactNativeArchitectures=armeabi-v7a,arm64-v8a `
    -x generateAutolinkingNewArchitectureFiles

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ SUCCESS! AAB file built successfully!" -ForegroundColor Green
    Write-Host "`nAAB Location:" -ForegroundColor Cyan
    $aabPath = "app\build\outputs\bundle\release\app-release.aab"
    Write-Host "  $aabPath" -ForegroundColor White
    
    $fullAabPath = Join-Path (Get-Location) $aabPath
    if (Test-Path $fullAabPath) {
        $fileInfo = Get-Item $fullAabPath
        Write-Host "`nFile Size: $([math]::Round($fileInfo.Length / 1MB, 2)) MB" -ForegroundColor Cyan
        Write-Host "Full Path: $fullAabPath" -ForegroundColor Cyan
    }
    
    Write-Host "`n📱 Next Steps:" -ForegroundColor Yellow
    Write-Host "1. Go to Google Play Console: https://play.google.com/console" -ForegroundColor White
    Write-Host "2. Select your app" -ForegroundColor White
    Write-Host "3. Go to 'Release' > 'Production' (or 'Testing' for testing)" -ForegroundColor White
    Write-Host "4. Upload the AAB file from the location above" -ForegroundColor White
    Write-Host "5. Fill in release notes and submit for review" -ForegroundColor White
} else {
    Write-Host "`n❌ Build failed! Check the error messages above." -ForegroundColor Red
    exit 1
}
