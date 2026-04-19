/**
 * @format
 */
import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

try {
  const messaging = require("@react-native-firebase/messaging").default;
  if (typeof messaging === "function") {
    messaging().setBackgroundMessageHandler(async () => {});
  }
} catch {
  // Firebase messaging is optional in local development.
}

AppRegistry.registerComponent(appName, () => App);
