import { Asset, CameraOptions, ImageLibraryOptions, launchCamera, launchImageLibrary } from "react-native-image-picker";

import { API } from "../../api/api";
import { getReadableApiErrorMessage } from "../../api/networkErrors";
import { MediaAsset } from "./types";

export type ComposerAsset = {
  id: string;
  uri: string;
  mediaType: "image" | "video";
  source: "local" | "remote";
  fileName?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  thumbnailUrl?: string;
};

const HTTP_URL_PATTERN = /^https?:\/\//i;

const sanitizeFileName = (value: string | undefined, fallback: string): string => {
  const next = (value || "").trim();
  return next || fallback;
};

const normalizeAsset = (asset: Asset, index: number): ComposerAsset => {
  if (!asset.uri) {
    throw new Error("Selected media is missing a usable file URI.");
  }

  const mediaType = asset.type?.startsWith("video/") ? "video" : "image";
  const extension = mediaType === "video" ? "mp4" : "jpg";

  const normalizedDurationMs =
    typeof asset.duration === "number" && Number.isFinite(asset.duration)
      ? Math.max(0, Math.round(asset.duration * 1000))
      : undefined;

  return {
    id: asset.fileName || `picker_${Date.now()}_${index}`,
    uri: asset.uri,
    mediaType,
    source: HTTP_URL_PATTERN.test(asset.uri) ? "remote" : "local",
    fileName: sanitizeFileName(asset.fileName, `upload_${Date.now()}_${index}.${extension}`),
    mimeType: asset.type || (mediaType === "video" ? "video/mp4" : "image/jpeg"),
    width: typeof asset.width === "number" ? asset.width : undefined,
    height: typeof asset.height === "number" ? asset.height : undefined,
    durationMs: normalizedDurationMs,
  };
};

const toFormDataFile = (asset: ComposerAsset) => ({
  uri: asset.uri,
  name: sanitizeFileName(asset.fileName, asset.mediaType === "video" ? "upload.mp4" : "upload.jpg"),
  type: asset.mimeType || (asset.mediaType === "video" ? "video/mp4" : "image/jpeg"),
});

const toRemoteMediaAsset = (asset: ComposerAsset): MediaAsset => ({
  id: asset.id || `remote_${Date.now()}`,
  mediaType: asset.mediaType,
  url: asset.uri,
  thumbnailUrl: asset.thumbnailUrl,
  durationMs: asset.durationMs,
  width: asset.width,
  height: asset.height,
});

export const createRemoteComposerAsset = (
  uri: string,
  mediaType: "image" | "video" = "image",
  thumbnailUrl?: string,
): ComposerAsset => ({
  id: `remote_${Date.now()}`,
  uri,
  mediaType,
  source: "remote",
  thumbnailUrl,
});

export const pickComposerAssets = async (options: ImageLibraryOptions): Promise<ComposerAsset[]> => {
  const result = await launchImageLibrary(options);

  if (result.didCancel) {
    return [];
  }

  if (result.errorCode) {
    throw new Error(result.errorMessage || "Could not access your media library.");
  }

  return (result.assets || []).map(normalizeAsset);
};

export const captureComposerAssets = async (options: CameraOptions): Promise<ComposerAsset[]> => {
  const result = await launchCamera(options);

  if (result.didCancel) {
    return [];
  }

  if (result.errorCode) {
    throw new Error(result.errorMessage || "Could not access your camera.");
  }

  return (result.assets || []).map(normalizeAsset);
};

const uploadSingleImage = async (asset: ComposerAsset): Promise<MediaAsset> => {
  try {
    const body = new FormData();
    body.append("image", toFormDataFile(asset) as never);

    const res = await API.post("/upload/image", body, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    if (!res?.data?.url) {
      throw new Error("Image upload did not return a usable URL.");
    }

    return {
      id: asset.id,
      mediaType: "image",
      url: res.data.url,
      width: asset.width,
      height: asset.height,
    };
  } catch (error) {
    throw new Error(getReadableApiErrorMessage(error, "Image upload failed."));
  }
};

const uploadMultipleImages = async (assets: ComposerAsset[]): Promise<MediaAsset[]> => {
  try {
    const body = new FormData();
    assets.forEach((asset) => {
      body.append("images", toFormDataFile(asset) as never);
    });

    const res = await API.post("/upload/images", body, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    const uploaded = Array.isArray(res?.data?.urls) ? res.data.urls : [];

    if (
      uploaded.length !== assets.length
      || uploaded.some((item: { url?: string } | undefined) => !item?.url)
    ) {
      throw new Error("Carousel upload did not return all uploaded image URLs.");
    }

    return assets.map((asset, index) => ({
      id: asset.id,
      mediaType: "image",
      url: uploaded[index].url,
      width: asset.width,
      height: asset.height,
    }));
  } catch (error) {
    throw new Error(getReadableApiErrorMessage(error, "Image upload failed."));
  }
};

const uploadSingleVideo = async (asset: ComposerAsset): Promise<MediaAsset> => {
  try {
    const body = new FormData();
    body.append("video", toFormDataFile(asset) as never);

    const res = await API.post("/upload/video", body, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    });

    if (!res?.data?.url) {
      throw new Error("Video upload did not return a usable playback URL.");
    }

    return {
      id: asset.id,
      mediaType: "video",
      url: res.data.url,
      thumbnailUrl: res?.data?.thumbnailUrl,
      durationMs: typeof res?.data?.duration === "number" ? res.data.duration * 1000 : asset.durationMs,
      width: typeof res?.data?.width === "number" ? res.data.width : asset.width,
      height: typeof res?.data?.height === "number" ? res.data.height : asset.height,
    };
  } catch (error) {
    throw new Error(getReadableApiErrorMessage(error, "Video upload failed."));
  }
};

export const uploadComposerAssets = async (assets: ComposerAsset[]): Promise<MediaAsset[]> => {
  if (!assets.length) {
    return [];
  }

  const remoteAssets = assets.filter((asset) => asset.source === "remote").map(toRemoteMediaAsset);
  const localAssets = assets.filter((asset) => asset.source === "local");

  if (!localAssets.length) {
    return remoteAssets;
  }

  const hasMixedTypes = new Set(localAssets.map((asset) => asset.mediaType)).size > 1;
  if (hasMixedTypes) {
    throw new Error("Please upload one media type at a time.");
  }

  const firstLocalAsset = localAssets[0];
  if (!firstLocalAsset) {
    return remoteAssets;
  }

  const mediaType = firstLocalAsset.mediaType;
  let uploadedLocalAssets: MediaAsset[] = [];

  if (mediaType === "image" && localAssets.length > 1) {
    uploadedLocalAssets = await uploadMultipleImages(localAssets);
  } else if (mediaType === "image") {
    uploadedLocalAssets = [await uploadSingleImage(firstLocalAsset)];
  } else {
    uploadedLocalAssets = [await uploadSingleVideo(firstLocalAsset)];
  }

  return [...remoteAssets, ...uploadedLocalAssets];
};
