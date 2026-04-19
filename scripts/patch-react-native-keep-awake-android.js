const fs = require("fs");
const path = require("path");

const targetFile = path.join(
  __dirname,
  "..",
  "node_modules",
  "react-native-keep-awake",
  "android",
  "build.gradle",
);

if (!fs.existsSync(targetFile)) {
  process.exit(0);
}

const source = fs.readFileSync(targetFile, "utf8");

if (!source.includes("jcenter()")) {
  process.exit(0);
}

fs.writeFileSync(targetFile, source.replace("        jcenter()", "        mavenCentral()"));
