const fs = require("fs");
const path = require("path");

const packageJsonPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "react-native-webrtc",
  "node_modules",
  "event-target-shim",
  "package.json",
);

if (!fs.existsSync(packageJsonPath)) {
  process.exit(0);
}

const source = fs.readFileSync(packageJsonPath, "utf8");
const pkg = JSON.parse(source);

if (!pkg.exports || typeof pkg.exports !== "object") {
  console.error("Unable to patch event-target-shim exports: missing exports field");
  process.exit(1);
}

if (pkg.exports["./index"]) {
  process.exit(0);
}

const rootExport = pkg.exports["."];
if (!rootExport) {
  console.error("Unable to patch event-target-shim exports: missing root export");
  process.exit(1);
}

pkg.exports["./index"] = rootExport;

fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
