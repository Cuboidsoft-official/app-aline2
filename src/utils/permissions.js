import { Alert, PermissionsAndroid, Platform } from "react-native";

const isAndroid = Platform.OS === "android";

export const ensureCameraPermission = async (message = "Allow Aline2 to use your camera.") => {
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
    message,
    buttonPositive: "Allow",
    buttonNegative: "Deny",
  });

  return result === PermissionsAndroid.RESULTS.GRANTED;
};

export const resolveCameraCaptureMediaType = async (
  mediaType = "photo",
  {
    title = "Choose capture type",
    message = "Select whether you want to take a photo or record a video.",
  } = {},
) => {
  if (!isAndroid || mediaType !== "mixed") {
    return mediaType;
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(value);
    };

    Alert.alert(
      title,
      message,
      [
        {
          text: "Photo",
          onPress: () => finish("photo"),
        },
        {
          text: "Video",
          onPress: () => finish("video"),
        },
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => finish(null),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => finish(null),
      },
    );
  });
};
