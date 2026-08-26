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

const oldFunction = `def getExtOrIntegerDefault(name) {
  return rootProject.ext.has(name) ? rootProject.ext.get(name) : (project.properties["Sound_" + name]).toInteger()
}`;

const newFunction = `def getExtOrIntegerDefault(name) {
  if (rootProject.ext.has(name)) return rootProject.ext.get(name)
  if (project.hasProperty("Sound_" + name) && project.properties["Sound_" + name]) return (project.properties["Sound_" + name]).toInteger()
  if (name == "compileSdkVersion" || name == "targetSdkVersion") return 36
  if (name == "minSdkVersion") return 24
  return 36
}`;

if (source.includes(oldFunction)) {
  source = source.replace(oldFunction, newFunction);
}

const needle = '  namespace "com.margelo.nitro.sound"\n';
const insertion = `${needle}\n  ndkVersion getExtOrDefault("ndkVersion")\n`;

if (!source.includes('  ndkVersion getExtOrDefault("ndkVersion")\n') && source.includes(needle)) {
  source = source.replace(needle, insertion);
}

fs.writeFileSync(targetFile, source);
