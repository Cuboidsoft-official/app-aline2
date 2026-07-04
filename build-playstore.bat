@echo off
REM Simple batch script to build AAB for Play Store

echo ================================================
echo Building Android AAB for Google Play Store
echo ================================================
echo.

REM Set your keystore credentials here
REM IMPORTANT: Replace these with your actual values!
set ANDROID_UPLOAD_STORE_FILE=android\app\aline2-release.keystore
set ANDROID_UPLOAD_STORE_PASSWORD=YOUR_KEYSTORE_PASSWORD
set ANDROID_UPLOAD_KEY_ALIAS=YOUR_KEY_ALIAS
set ANDROID_UPLOAD_KEY_PASSWORD=YOUR_KEY_PASSWORD
set ENVFILE=.env.production
set ORG_GRADLE_PROJECT_newArchEnabled=true

echo Checking keystore file...
if not exist "%ANDROID_UPLOAD_STORE_FILE%" (
    echo ERROR: Keystore file not found at %ANDROID_UPLOAD_STORE_FILE%
    pause
    exit /b 1
)
echo Keystore found: %ANDROID_UPLOAD_STORE_FILE%
echo.

cd android

echo Step 1: Cleaning previous build...
call gradlew clean --console=plain
if %errorlevel% neq 0 goto :error

echo.
echo Step 2: Building Release AAB...
call gradlew bundleRelease --console=plain -Paline2DisableAbiSplits=true -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
if %errorlevel% neq 0 goto :error

echo.
echo ================================================
echo SUCCESS! AAB file built successfully!
echo ================================================
echo.
echo AAB Location: android\app\build\outputs\bundle\release\app-release.aab
echo.
echo Next Steps:
echo 1. Go to Google Play Console (https://play.google.com/console)
echo 2. Upload the AAB file
echo 3. Fill in release notes and submit
echo.
pause
exit /b 0

:error
echo.
echo ================================================
echo ERROR: Build failed!
echo ================================================
pause
exit /b 1
