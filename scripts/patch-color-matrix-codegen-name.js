const fs = require("fs");
const path = require("path");

const targetFile = path.join(
  __dirname,
  "..",
  "node_modules",
  "react-native-color-matrix-image-filters",
  "package.json",
);

if (!fs.existsSync(targetFile)) {
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(targetFile, "utf8"));

if (!pkg.codegenConfig || pkg.codegenConfig.name !== "CMIFColorMatrixImageFiltersSpec") {
  process.exit(0);
}

pkg.codegenConfig.name = "CMIFSpec";
fs.writeFileSync(targetFile, `${JSON.stringify(pkg, null, 2)}\n`);
