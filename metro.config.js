const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");
const exclusionList = require("metro-config/private/defaults/exclusionList").default;
const { getBundleModeMetroConfig } = require("react-native-worklets/bundleMode");
const path = require("path");
const fs = require("fs");

// react-native-worklets/plugin with bundleMode:true generates per-worklet JS
// files here at Babel-transform time. On a clean run the directory does not
// exist when Metro starts its initial filesystem crawl, so Metro cannot hash
// the files it later resolves through getBundleModeMetroConfig and the build
// fails with "Failed to get the SHA-1 for .worklets/*.js". Pre-creating the
// directory and adding it to watchFolders ensures Metro includes it in its
// initial snapshot before any transforms produce files inside it.
const workletsDir = path.resolve(
  __dirname,
  "node_modules/react-native-worklets/.worklets"
);
fs.mkdirSync(workletsDir, { recursive: true });

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [workletsDir],
  resolver: {
    // Native library build outputs inside node_modules are transient and can
    // disappear mid-build, which crashes Metro's fallback watcher on WSL/NTFS.
    blockList: exclusionList([
      /node_modules\/.*\/android\/build\/.*/,
      /node_modules\/.*\/ios\/build\/.*/,
    ]),
  },
};

// getBundleModeMetroConfig adds the resolver and serializer required for
// react-native-worklets bundleMode: true (standalone APK builds).
module.exports = getBundleModeMetroConfig(mergeConfig(getDefaultConfig(__dirname), config));
