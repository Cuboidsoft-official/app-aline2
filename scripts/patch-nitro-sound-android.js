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

// Directly set compileSdk, minSdk, targetSdk in android block
source = source.replace(/compileSdk\s+getExtOrIntegerDefault\("compileSdkVersion"\)/gu, "compileSdk 36");
source = source.replace(/minSdk\s+getExtOrIntegerDefault\("minSdkVersion"\)/gu, "minSdk 24");
source = source.replace(/targetSdk\s+getExtOrIntegerDefault\("targetSdkVersion"\)/gu, "targetSdk 36");

const needle = '  namespace "com.margelo.nitro.sound"\n';
const insertion = `${needle}\n  ndkVersion getExtOrDefault("ndkVersion")\n`;

if (!source.includes('  ndkVersion getExtOrDefault("ndkVersion")\n') && source.includes(needle)) {
  source = source.replace(needle, insertion);
}

fs.writeFileSync(targetFile, source);
