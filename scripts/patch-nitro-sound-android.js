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

let source = fs.readFileSync(targetFile, "utf8");

const autolinkLine = "apply from: '../nitrogen/generated/android/NitroSound+autolinking.gradle'\n";
source = source.replace(autolinkLine, "");

const androidNeedle = 'android {\n';
if (source.includes(androidNeedle) && !source.includes("NitroSound+autolinking.gradle")) {
  const replacement = `android {\n  compileSdk 36\n  ${autolinkLine}`;
  source = source.replace(androidNeedle, replacement);
}

source = source.replace(/compileSdk\s+getExtOrIntegerDefault\("compileSdkVersion"\)/gu, "compileSdk 36");
source = source.replace(/minSdk\s+getExtOrIntegerDefault\("minSdkVersion"\)/gu, "minSdk 24");
source = source.replace(/targetSdk\s+getExtOrIntegerDefault\("targetSdkVersion"\)/gu, "targetSdk 36");

const namespaceNeedle = '  namespace "com.margelo.nitro.sound"\n';
const insertion = `${namespaceNeedle}  ndkVersion getExtOrDefault("ndkVersion")\n`;

if (!source.includes('  ndkVersion getExtOrDefault("ndkVersion")\n') && source.includes(namespaceNeedle)) {
  source = source.replace(namespaceNeedle, insertion);
}

fs.writeFileSync(targetFile, source);
