import { normalizeMediaUrl } from "./mediaUrls";

export class GallerySaveError extends Error {
  code: "missing-url" | "permission" | "download" | "unsupported";

  constructor(code: GallerySaveError["code"], message: string) {
    super(message);
    this.name = "GallerySaveError";
    this.code = code;
  }
}

export const getMediaFileExtension = (value: string, fallback = "jpg") => {
  try {
    const url = new URL(value);
    const matchedExtension = url.pathname.match(/\.([a-z0-9]+)$/i)?.[1];
    return matchedExtension ? matchedExtension.toLowerCase() : fallback;
  } catch {
    return fallback;
  }
};

export const saveMediaToGallery = async (rawUrl: string, fileNameBase = "aline2_post") => {
  const normalizedUrl = normalizeMediaUrl(rawUrl);

  if (!normalizedUrl) {
    throw new GallerySaveError("missing-url", "Media URL is missing.");
  }

  const safeBaseName = String(fileNameBase || "aline2_post")
    .replace(/[^a-z0-9._-]+/gi, "_")
    .replace(/\.+$/, "") || "aline2_post";
  const existingExtension = safeBaseName.match(/\.([a-z0-9]+)$/i)?.[1];
  const extension = getMediaFileExtension(normalizedUrl, existingExtension || "jpg");
  const fileName = existingExtension
    ? `${safeBaseName.replace(/\.[a-z0-9]+$/i, "")}_${Date.now()}.${existingExtension}`
    : `${safeBaseName}_${Date.now()}.${extension}`;

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

    if (!FileSystem?.downloadAsync || (!FileSystem?.documentDirectory && !FileSystem?.cacheDirectory)) {
      throw new GallerySaveError("unsupported", "Gallery saving is unavailable on this device.");
    }

    const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    const targetFileUri = `${dir}${fileName}`;
    const downloaded = await FileSystem.downloadAsync(normalizedUrl, targetFileUri);
    const downloadedUri = downloaded?.uri || targetFileUri;

    let MediaLibrary: any = null;
    try {
      MediaLibrary = require("expo-media-library");
    } catch {
      MediaLibrary = null;
    }

    if (!MediaLibrary?.saveToLibraryAsync && !MediaLibrary?.createAssetAsync) {
      throw new GallerySaveError("unsupported", "Gallery saving is unavailable on this device.");
    }

    const requestPermissions = MediaLibrary.requestPermissionsAsync;
    let permission: any = null;
    if (typeof requestPermissions === "function") {
      permission = await requestPermissions(true).catch(async () => {
        if (typeof requestPermissions === "function") {
          return requestPermissions({ writeOnly: true });
        }
        return { status: "denied" };
      });
    }

    if (permission?.status !== "granted") {
      throw new GallerySaveError("permission", "Gallery permission is required to save this media.");
    }

    if (MediaLibrary.saveToLibraryAsync) {
      try {
        await MediaLibrary.saveToLibraryAsync(downloadedUri);
      } catch (saveError) {
        if (typeof MediaLibrary.createAssetAsync !== "function") {
          throw saveError;
        }
        await MediaLibrary.createAssetAsync(downloadedUri);
      }
    } else {
      await MediaLibrary.createAssetAsync(downloadedUri);
    }

    return downloadedUri;
  } catch (error: any) {
    const message = String(error?.message || "").toLowerCase();
    if (error instanceof GallerySaveError) {
      throw error;
    }
    if (message.includes("gallery") || message.includes("permission")) {
      throw new GallerySaveError("permission", error?.message || "Gallery permission is required to save this media.");
    }
    console.log("FileSystem download error:", error);
    throw new GallerySaveError("download", "Could not download this media for the gallery.");
  }
};

// Keep the old export for existing callers while exposing the gallery-specific operation clearly.
export const downloadImageAsset = saveMediaToGallery;
