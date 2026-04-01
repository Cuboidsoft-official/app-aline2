import { PermissionsAndroid, Platform } from "react-native";

export const ensureCameraPermission = async () => {
  if (Platform.OS !== "android") {
    return true;
  }

  const permission = PermissionsAndroid.PERMISSIONS.CAMERA;
  const alreadyGranted = await PermissionsAndroid.check(permission);
  if (alreadyGranted) {
    return true;
  }

  const result = await PermissionsAndroid.request(permission, {
    title: "Camera permission",
    message: "Allow Aline2 to use your camera for chat attachments.",
    buttonPositive: "Allow",
    buttonNegative: "Deny",
  });

  return result === PermissionsAndroid.RESULTS.GRANTED;
};
