const fs = require("fs");
const path = require("path");

const resolveEnvFile = () => {
  const candidates = [
    process.env.ENVFILE,
    ".env",
    process.env.APP_ENV ? `.env.${process.env.APP_ENV}` : null,
    ".env.production",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const candidatePath = path.resolve(__dirname, candidate);

    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return path.resolve(__dirname, ".env");
};

module.exports = {
  presets: ["babel-preset-expo"],
  plugins: [
    [
      "module:react-native-dotenv",
      {
        moduleName: "@env",
        path: resolveEnvFile(),
        safe: false,
        allowUndefined: true,
      },
    ],
    // react-native-reanimated v4 moved its worklet transform into this
    // separate package; without it, native Reanimated/Worklets modules fail
    // to initialize ("Required value was null" from NativeWorklets). Must
    // stay last in the plugins list per react-native-worklets docs.
    // bundleMode: true is required for standalone APK builds (debuggableVariants = []).
    // Without it, _WORKLETS_BUNDLE_MODE_ENABLED stays false and the worklets runtime
    // fails to initialize in a Hermes standalone build (no Metro dev server).
    ["react-native-worklets/plugin", { bundleMode: true }],
  ],
};
