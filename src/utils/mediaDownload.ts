import { Linking } from "react-native";

import { normalizeMediaUrl } from "./mediaUrls";

const getFileExtension = (value: string) => {
  try {
    const url = new URL(value);
    const matchedExtension = url.pathname.match(/\.([a-z0-9]+)$/i)?.[1];
    return matchedExtension ? matchedExtension.toLowerCase() : "jpg";
  } catch {
    return "jpg";
  }
};

const getDownloadErrorMessage = (error: unknown) =>
  String((error as { message?: string })?.message || "").toLowerCase();

export const downloadImageAsset = async (rawUrl: string, fileNameBase = "aline2_post") => {
  const normalizedUrl = normalizeMediaUrl(rawUrl);

  if (!normalizedUrl) {
    throw new Error("Image URL is missing.");
  }

  const fileName = `${fileNameBase}_${Date.now()}.${getFileExtension(normalizedUrl)}`;

  try {
    const FileSystem = require("expo-file-system/legacy");
    if (FileSystem?.downloadAsync && FileSystem?.documentDirectory) {
      const targetFileUri = `${FileSystem.documentDirectory}${fileName}`;
      const downloaded = await FileSystem.downloadAsync(normalizedUrl, targetFileUri);
      return downloaded?.uri || targetFileUri;
    }
  } catch (error) {
    const errorMessage = getDownloadErrorMessage(error);
    if (errorMessage.includes("cancel")) {
      throw error;
    }

    console.log("media download fallback error:", error);
  }

  await Linking.openURL(normalizedUrl);
  return normalizedUrl;
};
