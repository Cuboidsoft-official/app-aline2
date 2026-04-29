#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const appRoot = path.resolve(__dirname, "..", "..");
const autolinkingConfigPath = path.join(
  appRoot,
  "android",
  "build",
  "generated",
  "autolinking",
  "autolinking.json",
);

if (!fs.existsSync(autolinkingConfigPath)) {
  throw new Error(
    `Autolinking config not found at ${autolinkingConfigPath}. Run :app:generateAutolinkingPackageList first.`,
  );
}

const model = JSON.parse(fs.readFileSync(autolinkingConfigPath, "utf8"));
const generatedCodegenSegment = `${path.sep}build${path.sep}generated${path.sep}source${path.sep}codegen${path.sep}jni${path.sep}`;

const normalizeProjectName = (packageName) => packageName.replace(/^@/u, "").replace(/\//gu, "_");

const usesGeneratedCodegen = (cmakeListsPath) =>
  typeof cmakeListsPath === "string" &&
  cmakeListsPath.includes(generatedCodegenSegment);

const tasks = new Set();

for (const [packageName, dependency] of Object.entries(model.dependencies || {})) {
  const android = dependency?.platforms?.android;
  if (!android) {
    continue;
  }

  const needsGeneratedCodegen =
    usesGeneratedCodegen(android.cmakeListsPath) ||
    usesGeneratedCodegen(android.cxxModuleCMakeListsPath);
  const hasAutolinkedCodegenModule =
    Boolean(android.libraryName) ||
    Boolean(android.cxxModuleCMakeListsModuleName);

  if (!needsGeneratedCodegen || !hasAutolinkedCodegenModule) {
    continue;
  }

  const projectName = normalizeProjectName(packageName);
  tasks.add(`:${projectName}:generateCodegenSchemaFromJavaScript`);
  tasks.add(`:${projectName}:generateCodegenArtifactsFromSchema`);
}

for (const task of tasks) {
  process.stdout.write(`${task}\n`);
}
