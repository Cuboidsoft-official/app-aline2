const fs = require("fs");
const path = require("path");

const targetFile = path.join(
  __dirname,
  "..",
  "node_modules",
  "react-native-nitro-sound",
  "android",
  "build.gradle",
);

if (!fs.existsSync(targetFile)) {
  process.exit(0);
}

const autolinkOriginal = path.join(
  __dirname,
  "..",
  "node_modules",
  "react-native-nitro-sound",
  "nitrogen",
  "generated",
  "android",
  "NitroSound+autolinking.gradle",
);
const autolinkSafe = path.join(
  __dirname,
  "..",
  "node_modules",
  "react-native-nitro-sound",
  "nitrogen",
  "generated",
  "android",
  "NitroSoundAutolinking.gradle",
);

if (fs.existsSync(autolinkOriginal)) {
  fs.copyFileSync(autolinkOriginal, autolinkSafe);
}

const cleanContent = `def getExtOrDefault(name) {
  return rootProject.ext.has(name) ? rootProject.ext.get(name) : project.properties['Sound_' + name]
}

def reactNativeArchitectures() {
  def value = rootProject.getProperties().get("reactNativeArchitectures")
  return value ? value.split(",") : ["armeabi-v7a", "x86", "x86_64", "arm64-v8a"]
}

apply plugin: "com.android.library"
apply plugin: "kotlin-android"

def getExtOrIntegerDefault(name) {
  if (rootProject.ext.has(name)) return rootProject.ext.get(name)
  if (project.hasProperty("Sound_" + name) && project.properties["Sound_" + name]) return (project.properties["Sound_" + name]).toInteger()
  if (name == "compileSdkVersion" || name == "targetSdkVersion") return 36
  if (name == "minSdkVersion") return 24
  return 36
}

android {
  namespace "com.margelo.nitro.sound"
  ndkVersion getExtOrDefault("ndkVersion")

  compileSdk 36

  defaultConfig {
    minSdk 24
    targetSdk 36

    externalNativeBuild {
      cmake {
        cppFlags "-frtti -fexceptions -Wall -fstack-protector-all"
        arguments "-DANDROID_STL=c++_shared", "-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON"
        abiFilters (*reactNativeArchitectures())
      }
    }

    consumerProguardFiles "consumer-rules.pro"
  }

  externalNativeBuild {
    cmake {
      path "CMakeLists.txt"
    }
  }

  packagingOptions {
    resources {
      excludes += [
              "META-INF",
              "META-INF/**"
      ]
    }
    jniLibs {
      excludes += [
              "**/libjsi.so",
              "**/libreactnative.so",
              "**/libfbjni.so",
              "**/libc++_shared.so",
              "**/libNitroModules.so"
      ]
    }
  }

  buildFeatures {
    buildConfig true
    prefab true
  }

  buildTypes {
    release {
      minifyEnabled false
    }
  }

  lintOptions {
    disable "GradleCompatible"
  }

  compileOptions {
    sourceCompatibility JavaVersion.VERSION_1_8
    targetCompatibility JavaVersion.VERSION_1_8
  }

  sourceSets {
    main {
      java.srcDirs += [
        "generated/java",
        "generated/jni",
        "\${project.projectDir}/../nitrogen/generated/android/kotlin"
      ]
    }
  }
}

repositories {
  mavenCentral()
  google()
}

def kotlin_version = getExtOrDefault("kotlinVersion")

dependencies {
  implementation "com.facebook.react:react-android"
  implementation "org.jetbrains.kotlin:kotlin-stdlib:$kotlin_version"
  implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3"
  implementation project(":react-native-nitro-modules")
}
`;

fs.writeFileSync(targetFile, cleanContent);
