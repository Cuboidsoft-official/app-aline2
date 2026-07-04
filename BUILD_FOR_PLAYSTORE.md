# 🚀 Google Play Store ke liye Build Guide

## 📋 Pre-requisites (Zaroori Cheezein)

1. ✅ Java JDK 17 or higher installed
2. ✅ Android SDK installed
3. ✅ Gradle installed (React Native ke saath aata hai)
4. ✅ Keystore file ready (`aline2-release.keystore`)
5. ✅ Keystore credentials (password, alias, key password)

## 🔑 Step 1: Keystore Credentials Setup

Aapko apne keystore ki details chaiye hongi:

### Agar aapke paas keystore nahi hai, to naya banao:
```cmd
cd android\app
keytool -genkeypair -v -storetype PKCS12 -keystore aline2-release.keystore -alias aline2-key -keyalg RSA -keysize 2048 -validity 10000
```

**Important:** Password aur alias yaad rakhna! Ye baad mein chahiye.

### Agar keystore already hai:
Keystore details check karne ke liye:
```cmd
keytool -list -v -keystore android\app\aline2-release.keystore
```

## 🛠️ Step 2: Build Script Configure Karo

### Option A: BAT File Use Karo (Simplest - Recommended)

1. `build-playstore.bat` file kholo
2. Apne keystore credentials fill karo:
   ```bat
   set ANDROID_UPLOAD_STORE_PASSWORD=your_actual_password
   set ANDROID_UPLOAD_KEY_ALIAS=your_actual_alias
   set ANDROID_UPLOAD_KEY_PASSWORD=your_actual_key_password
   ```

3. File save karo

### Option B: PowerShell Script Use Karo

1. `build-aab-windows.ps1` file kholo
2. Credentials update karo
3. PowerShell mein run karo: `.\build-aab-windows.ps1`

### Option C: Manual Environment Variables

Command Prompt mein directly set karo:
```cmd
set ANDROID_UPLOAD_STORE_FILE=android\app\aline2-release.keystore
set ANDROID_UPLOAD_STORE_PASSWORD=your_password
set ANDROID_UPLOAD_KEY_ALIAS=your_alias
set ANDROID_UPLOAD_KEY_PASSWORD=your_key_password
set ENVFILE=.env.production
```

## 🏗️ Step 3: Build Banao

### Simple Method (BAT file):
```cmd
build-playstore.bat
```

### Manual Method:
```cmd
cd android
gradlew clean
gradlew bundleRelease -Paline2DisableAbiSplits=true -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
```

## 📦 Step 4: AAB File Dhundo

Build successful hone ke baad, AAB file yahan milegi:
```
android\app\build\outputs\bundle\release\app-release.aab
```

## 📱 Step 5: Play Store pe Upload Karo

1. **Google Play Console kholo:** https://play.google.com/console
2. **Apna app select karo**
3. Left sidebar se **"Release" > "Production"** (ya "Testing" for beta)
4. **"Create new release"** button click karo
5. **AAB file upload karo** (drag & drop ya browse)
6. **Release notes likho** (What's new in this version)
7. **Review and rollout** karo

## 🎯 Current App Details

- **App ID:** com.aline2
- **Version Code:** 7
- **Version Name:** 2.0.0
- **Build Type:** AAB (Android App Bundle)
- **Supported ABIs:** armeabi-v7a, arm64-v8a

## ⚠️ Common Issues & Solutions

### Issue 1: "Keystore not found"
**Solution:** Ensure keystore path sahi hai. Check karo:
```cmd
dir android\app\aline2-release.keystore
```

### Issue 2: "Wrong password"
**Solution:** Keystore password verify karo:
```cmd
keytool -list -v -keystore android\app\aline2-release.keystore
```

### Issue 3: Build fails with memory error
**Solution:** `android\gradle.properties` mein memory badhao:
```properties
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m
```

### Issue 4: "ANDROID_NDK is not set"
**Solution:** NDK path set karo ya `local.properties` file mein add karo

### Issue 5: Build bahut slow hai
**Solution:** Gradle daemon enable karo:
```cmd
echo org.gradle.daemon=true >> android\gradle.properties
```

## 🔍 Build Verification

AAB file verify karne ke liye bundletool use karo:
```cmd
java -jar bundletool.jar validate --bundle=android\app\build\outputs\bundle\release\app-release.aab
```

## 📊 APK vs AAB

| Feature | APK | AAB |
|---------|-----|-----|
| File Size | Bada | Chota |
| Play Store Required | ❌ No | ✅ Yes (2021+) |
| Dynamic Delivery | ❌ No | ✅ Yes |
| Recommended | Old way | ✅ **Current Standard** |

**Play Store ab sirf AAB accept karta hai for new apps!**

## 🎉 Success Checklist

- [ ] Keystore credentials sahi set kiye
- [ ] `.env.production` file configured hai
- [ ] Build script successfully run hui
- [ ] AAB file generated hui
- [ ] AAB file size reasonable hai (usually 30-80 MB)
- [ ] Play Console pe upload kiya
- [ ] Release notes add kiye
- [ ] Testing track pe test kiya (optional but recommended)

## 📞 Help & Support

Agar koi problem aaye to:
1. Error message carefully padho
2. Stack trace check karo
3. Gradle cache clean karo: `cd android && gradlew clean --no-daemon`
4. Node modules reinstall karo: `rm -rf node_modules && npm install`

---

**Good Luck! 🚀 App Play Store pe jald hi live hoga!**
