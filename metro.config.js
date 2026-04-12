const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");
const exclusionList = require("metro-config/private/defaults/exclusionList").default;

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // Native library build outputs inside node_modules are transient and can
    // disappear mid-build, which crashes Metro's fallback watcher on WSL/NTFS.
    blockList: exclusionList([
      /node_modules\/.*\/android\/build\/.*/,
      /node_modules\/.*\/ios\/build\/.*/,
    ]),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
