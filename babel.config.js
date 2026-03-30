const fs = require("fs");
const path = require("path");

const resolveEnvFile = () => {
  const requested = process.env.ENVFILE || `.env.${process.env.APP_ENV || "development"}`;
  const requestedPath = path.join(__dirname, requested);

  if (fs.existsSync(requestedPath)) {
    return requested;
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
