module.exports = {
  preset: "react-native",
  setupFiles: ["<rootDir>/jest.setup.js"],
  transformIgnorePatterns: [
    "node_modules/(?!(react-native|@react-native|@react-native-community|@react-navigation|@react-native-documents|react-native-gesture-handler|react-native-reanimated|react-native-safe-area-context|react-native-vector-icons)/)",
  ],
  moduleNameMapper: {
    "^@env$": "<rootDir>/__mocks__/@env.js",
  },
};
