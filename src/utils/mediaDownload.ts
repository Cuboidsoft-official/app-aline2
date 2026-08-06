import { Linking, Share } from "react-native";

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
    throw new Error("Media URL is missing.");
  }

  const fileName = `${fileNameBase}_${Date.now()}.${getFileExtension(normalizedUrl)}`;

  // 1. Try FileSystem download & MediaLibrary save
  try {
    let FileSystem: any = null;
    try {
      FileSystem = require("expo-file-system");
    } catch {
      try {
        FileSystem = require("expo-file-system/legacy");
      } catch {
        FileSystem = null;
      }
    }

    if (FileSystem?.downloadAsync && (FileSystem?.documentDirectory || FileSystem?.cacheDirectory)) {
      const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      const targetFileUri = `${dir}${fileName}`;
      const downloaded = await FileSystem.downloadAsync(normalizedUrl, targetFileUri);
      const downloadedUri = downloaded?.uri || targetFileUri;

      try {
        let MediaLibrary: any = null;
        try {
          MediaLibrary = require("expo-media-library");
        } catch {
          MediaLibrary = null;
        }

        if (MediaLibrary?.saveToLibraryAsync || MediaLibrary?.createAssetAsync) {
          const { status } = await MediaLibrary.requestPermissionsAsync();
          if (status === "granted") {
            if (MediaLibrary.saveToLibraryAsync) {
              await MediaLibrary.saveToLibraryAsync(downloadedUri);
            } else {
              await MediaLibrary.createAssetAsync(downloadedUri);
            }
            return downloadedUri;
          }
        }
      } catch (mediaErr) {
        console.log("MediaLibrary save fallback notice:", mediaErr);
      }

      return downloadedUri;
    }
  } catch (error) {
    console.log("FileSystem download fallback notice:", error);
  }

  // 2. Fallback: Share dialog
  try {
    await Share.share({
      title: "Save file",
      message: normalizedUrl,
      url: normalizedUrl,
    });
    return normalizedUrl;
  } catch (error) {
    const errorMessage = getDownloadErrorMessage(error);
    if (errorMessage.includes("cancel")) {
      throw error;
    }
    console.log("Share fallback error:", error);
  }

  // 3. Fallback: Open URL externally
  try {
    await Linking.openURL(normalizedUrl);
    return normalizedUrl;
  } catch (linkErr) {
    throw new Error("Unable to download or open this media file.");
  }
};
