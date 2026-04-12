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
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module:react-native-dotenv',
      {
        moduleName: '@env',
        path: resolveEnvFile(),
        safe: false,
        allowUndefined: true,
      },
    ],
  ],
};
