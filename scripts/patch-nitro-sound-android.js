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

const source = fs.readFileSync(targetFile, "utf8");
const needle = '  namespace "com.margelo.nitro.sound"\n';
const insertion = `${needle}\n  ndkVersion getExtOrDefault("ndkVersion")\n`;

if (source.includes('  ndkVersion getExtOrDefault("ndkVersion")\n')) {
  process.exit(0);
}

if (!source.includes(needle)) {
  console.error("Unable to locate Android namespace block in react-native-nitro-sound build.gradle");
  process.exit(1);
}

fs.writeFileSync(targetFile, source.replace(needle, insertion));
