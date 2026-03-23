import { API } from "../api/api";

type UploadableImage = {
  uri: string;
  fileName?: string | null;
  name?: string | null;
  type?: string | null;
};

type UploadableDocument = UploadableImage;

const inferExtension = (mimeType?: string | null, fallback = "bin"): string => {
  const normalized = String(mimeType || "").trim().toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (normalized === "application/pdf") {
    return "pdf";
  }

  if (normalized.startsWith("image/")) {
    return normalized.split("/")[1] || fallback;
  }

  return fallback;
};

const sanitizeFileName = (value?: string | null, mimeType?: string | null, fallbackExtension = "bin"): string => {
  const trimmed = String(value || "").trim();
  return trimmed || `upload_${Date.now()}.${inferExtension(mimeType, fallbackExtension)}`;
};

export const isRemoteMediaUrl = (value?: string | null): boolean => /^https?:\/\//i.test(String(value || ""));

export const uploadImageAsset = async (asset: UploadableImage): Promise<string> => {
  if (!asset?.uri) {
    throw new Error("Selected image is missing a usable URI.");
  }

  if (isRemoteMediaUrl(asset.uri)) {
    return asset.uri;
  }

  const body = new FormData();
  body.append(
    "image",
    {
      uri: asset.uri,
      name: sanitizeFileName(asset.fileName || asset.name, asset.type, "jpg"),
      type: asset.type || "image/jpeg",
    } as never,
  );

  const res = await API.post("/upload/image", body, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000,
  });

  const url = String(res?.data?.url || "");
  if (!url) {
    throw new Error("Image upload did not return a usable URL.");
  }

  return url;
};

export const uploadDocumentAsset = async (asset: UploadableDocument): Promise<string> => {
  if (!asset?.uri) {
    throw new Error("Selected document is missing a usable URI.");
  }

  if (isRemoteMediaUrl(asset.uri)) {
    return asset.uri;
  }

  const body = new FormData();
  body.append(
    "document",
    {
      uri: asset.uri,
      name: sanitizeFileName(asset.fileName || asset.name, asset.type, "bin"),
      type: asset.type || "application/octet-stream",
    } as never,
  );

  const res = await API.post("/upload/document", body, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000,
  });

  const url = String(res?.data?.url || "");
  if (!url) {
    throw new Error("Document upload did not return a usable URL.");
  }

  return url;
};
