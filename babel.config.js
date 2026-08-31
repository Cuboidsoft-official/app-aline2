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
    const candidatePath = path.join(__dirname, candidate);
    if (fs.existsSync(candidatePath)) {
      return candidate;
    }
  }

  return ".env";
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
    "react-native-worklets/plugin",
  ],
};
