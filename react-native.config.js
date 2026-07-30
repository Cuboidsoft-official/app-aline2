const android = require('@react-native-community/cli-platform-android');
const ios = require('@react-native-community/cli-platform-ios');

module.exports = {
  platforms: {
    android: {
      npmPackageName: '@react-native-community/cli-platform-android',
      dependencyConfig: android.dependencyConfig,
      projectConfig: android.projectConfig,
      linkConfig: android.linkConfig,
    },
    ios: {
      npmPackageName: '@react-native-community/cli-platform-ios',
      dependencyConfig: ios.dependencyConfig,
      projectConfig: ios.projectConfig,
      linkConfig: ios.linkConfig,
    },
  },
  project: {
    android: {
      sourceDir: './android',
      packageName: 'com.aline2',
    },
  },
  dependencies: {
    expo: {
      platforms: {
        android: null,
        ios: null,
      },
    },
  },
  assets: ['./node_modules/react-native-vector-icons/Fonts'],
};
