import { CameraRoll } from "@react-native-camera-roll/camera-roll";
import { PermissionsAndroid, Platform } from "react-native";
import ReactNativeBlobUtil from "react-native-blob-util";

import { normalizeMediaUrl } from "./mediaUrls";

export class GallerySaveError extends Error {
  code:
    | "missing-url"
    | "permission"
    | "download"
    | "save"
    | "unsupported"
    | "network"
    | "timeout"
    | "storage"
    | "not-found"
    | "server";

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

const isVideoExtension = (extension: string) => /^(mp4|m4v|mov|webm|avi|mkv|3gp)$/i.test(extension);

// Android's gallery save step resolves the MIME type from the file's extension
// (via MimeTypeMap), so a mismatched or unrecognized extension makes the save
// fail even though the download itself succeeded. Prefer the extension implied
// by the response's actual Content-Type when it is one we recognize.
const CONTENT_TYPE_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/bmp": "bmp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/3gpp": "3gp",
  "video/x-matroska": "mkv",
};

const getExtensionFromContentType = (headers: Record<string, string> | undefined) => {
  if (!headers) {
    return "";
  }

  const contentTypeKey = Object.keys(headers).find((key) => key.toLowerCase() === "content-type");
  const contentType = contentTypeKey ? String(headers[contentTypeKey] || "").split(";")[0].trim().toLowerCase() : "";
  return CONTENT_TYPE_TO_EXTENSION[contentType] || "";
};

// Used to detect a truncated/corrupted download (partial file saved to disk
// but the connection dropped before all bytes arrived) so we retry instead of
// saving a broken image/video to the gallery.
const getExpectedContentLength = (headers: Record<string, string> | undefined) => {
  if (!headers) {
    return -1;
  }
  const key = Object.keys(headers).find((k) => k.toLowerCase() === "content-length");
  const value = key ? Number(headers[key]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : -1;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Deterministic (non-crypto) hash so the same URL always maps to the same
// cache file name, letting us detect and reuse an already-downloaded video
// instead of fetching it again.
const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
};

const getVideoCacheFilePath = (url: string, extension: string) =>
  `${ReactNativeBlobUtil.fs.dirs.CacheDir}/aline2_media_cache/${hashString(url)}.${extension}`;

// Dev-only diagnostics. Never include headers, cookies, tokens, or full URLs
// (query strings can carry signed-URL auth) — hostname/path only.
const isDev = typeof __DEV__ !== "undefined" && __DEV__;

const getUrlHostname = (value: string) => {
  try {
    return new URL(value).hostname;
  } catch {
    return "unknown-host";
  }
};

const sanitizeForLog = (value: string) =>
  String(value || "").replace(/https?:\/\/[^\s"']+/gi, (match) => {
    try {
      const parsed = new URL(match);
      return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
    } catch {
      return "[url]";
    }
  });

const devLog = (...args: any[]) => {
  if (isDev) {
    console.log("[GallerySave]", ...args.map((arg) => (typeof arg === "string" ? sanitizeForLog(arg) : arg)));
  }
};

// A weak/unstable connection can close the stream before all bytes arrive.
// Retrying a couple of times resolves most of these transient network drops.
// We also request an uncompressed response (Accept-Encoding: identity) because
// gzip-compressed responses make some native HTTP clients falsely report the
// download as "interrupted" (decompressed byte count legitimately differs
// from the compressed Content-Length header).
const DOWNLOAD_MAX_ATTEMPTS = 4;
const DOWNLOAD_TIMEOUT_MS = 120000;
const MIN_REQUIRED_FREE_BYTES = 20 * 1024 * 1024; // 20MB safety margin

// Translates a raw network/native error into a specific, user-facing reason
// instead of a generic "could not download" message.
const classifyFetchError = (error: any): GallerySaveError => {
  const raw = String(error?.message || "");
  const message = raw.toLowerCase();

  if (message.includes("timed out") || message.includes("timeout")) {
    return new GallerySaveError("timeout", "The download timed out. Please check your internet connection and try again.");
  }
  if (
    message.includes("unable to resolve host") ||
    message.includes("failed to connect") ||
    message.includes("network is unreachable") ||
    message.includes("econnrefused") ||
    message.includes("no address associated")
  ) {
    return new GallerySaveError("network", "No internet connection. Please check your network and try again.");
  }
  if (message.includes("interrupted")) {
    return new GallerySaveError("download", "The download was interrupted, likely due to a weak or unstable connection. Please try again.");
  }
  return new GallerySaveError("download", raw ? `Could not download this media for the gallery: ${raw}` : "Could not download this media for the gallery.");
};

const describeHttpStatus = (status: number): GallerySaveError => {
  if (status === 404) {
    return new GallerySaveError("not-found", "This media is no longer available.");
  }
  if (status === 401 || status === 403) {
    return new GallerySaveError("download", "You don't have access to this media.");
  }
  if (status >= 500) {
    return new GallerySaveError("server", "The server is currently unavailable. Please try again later.");
  }
  return new GallerySaveError("download", `Could not download this media for the gallery (error ${status}).`);
};

// Some CDN/object-storage URLs contain unencoded spaces or unicode characters
// (e.g. from original uploaded filenames), which makes native HTTP clients on
// Android fail with a malformed-URL error before any status code is returned.
const encodeUrlForFetch = (value: string) => {
  try {
    const url = new URL(value);
    const encodedPathname = url.pathname
      .split("/")
      .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
      .join("/");
    return `${url.origin}${encodedPathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
};

const ensureLegacyAndroidGalleryPermission = async () => {
  if (Platform.OS !== "android" || Number(Platform.Version) > 28) {
    return true;
  }

  const permission = PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;
  const alreadyGranted = await PermissionsAndroid.check(permission);
  if (alreadyGranted) {
    return true;
  }

  const result = await PermissionsAndroid.request(permission, {
    title: "Storage permission",
    message: "Allow Aline2 to save media to your gallery.",
    buttonPositive: "Allow",
    buttonNegative: "Deny",
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
};

export const saveMediaToGallery = async (
  rawUrl: string,
  fileNameBase = "aline2_post",
  requestHeaders: Record<string, string> = {}
) => {
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

  if (!(await ensureLegacyAndroidGalleryPermission())) {
    throw new GallerySaveError("permission", "Gallery permission is required to save this media.");
  }

  // Videos keep their downloaded file cached on disk (see finally below) so a
  // repeat Save-to-Gallery tap reuses it instead of fetching over the network again.
  const isVideo = isVideoExtension(extension);
  let temporaryPath = "";
  try {
    if (!ReactNativeBlobUtil?.config || !CameraRoll?.save) {
      throw new GallerySaveError("unsupported", "Gallery saving is unavailable on this device.");
    }

    // Android's df() returns internal_free/external_free strings, while iOS
    // returns a numeric free field directly — read whichever is available.
    const freeDiskSpace = await Promise.resolve()
      .then(() => ReactNativeBlobUtil.fs.df())
      .then((info: any) => {
        const candidates = [info?.free, info?.external_free, info?.internal_free]
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value >= 0);
        return candidates.length ? Math.max(...candidates) : -1;
      })
      .catch(() => -1);
    if (freeDiskSpace >= 0 && freeDiskSpace < MIN_REQUIRED_FREE_BYTES) {
      throw new GallerySaveError("storage", "Not enough storage space on your device to save this media.");
    }

    const cacheDir = ReactNativeBlobUtil.fs.dirs.CacheDir;
    const videoCachePath = isVideo ? getVideoCacheFilePath(normalizedUrl, extension) : "";
    if (isVideo) {
      await Promise.resolve(ReactNativeBlobUtil.fs.mkdir?.(`${cacheDir}/aline2_media_cache`)).catch(() => undefined);
    }

    devLog("start", { host: getUrlHostname(normalizedUrl), fileName });

    // Videos are never re-fetched if a previously downloaded copy is still on
    // disk and intact — this is what avoids the redundant network download
    // (and its "weak connection" failures) when Save to Gallery is tapped on
    // a video that was already saved/attempted before.
    const cachedVideoStat = isVideo
      ? await ReactNativeBlobUtil.fs.stat(videoCachePath).catch(() => null)
      : null;
    const hasValidVideoCache = isVideo && !!cachedVideoStat && Number(cachedVideoStat.size) > 0;

    let temporaryPathIsCache = false;
    const destinationPath = isVideo
      ? videoCachePath
      : `${cacheDir}/aline2_gallery_${Date.now()}_${Math.round(Math.random() * 1e6)}.${extension}`;

    let downloaded: any = null;
    if (hasValidVideoCache) {
      devLog("reusing cached video", { size: Number(cachedVideoStat!.size) });
      temporaryPath = videoCachePath;
      temporaryPathIsCache = true;
    } else {
      downloaded = await (async () => {
      let lastError: any = null;
      for (let attempt = 1; attempt <= DOWNLOAD_MAX_ATTEMPTS; attempt += 1) {
        devLog("attempt", attempt);
        // Ensure no partial file lingers from a previous failed attempt.
        await ReactNativeBlobUtil.fs.unlink(destinationPath).catch(() => undefined);
        try {
          const response = await ReactNativeBlobUtil
            .config({
              path: destinationPath,
              overwrite: true,
              timeout: DOWNLOAD_TIMEOUT_MS,
            })
            .fetch("GET", encodeUrlForFetch(normalizedUrl), {
              Accept: "*/*",
              "Accept-Encoding": "identity",
              ...requestHeaders,
            });

          const status = Number(response?.info?.().status || 0);
          const responseHeaders = response?.info?.().headers;
          devLog("response", {
            status,
            contentType: responseHeaders ? getExtensionFromContentType(responseHeaders) || "unknown" : "unknown",
            contentLength: getExpectedContentLength(responseHeaders),
          });
          if (status < 200 || status >= 300) {
            throw describeHttpStatus(status);
          }

          // A stream that closes early leaves a file smaller than the
          // server-advertised size — this is the "broken image" case. Only
          // check this when Content-Length is known, and retry it like any
          // other transient network drop.
          const expectedSize = getExpectedContentLength(response?.info?.().headers);
          if (expectedSize > 0) {
            const path = String(response?.path?.() || "");
            const fileStat = path ? await ReactNativeBlobUtil.fs.stat(path).catch(() => null) : null;
            const actualSize = fileStat ? Number(fileStat.size) : 0;
            if (actualSize < expectedSize) {
              throw new GallerySaveError("download", "The download was interrupted, likely due to a weak or unstable connection. Please try again.");
            }
          }

          return response;
        } catch (fetchError: any) {
          lastError = fetchError;
          const isRetryable =
            /interrupted|timed out|timeout|econnreset|connection reset|socket closed|connection aborted|network request failed|broken pipe|unexpected end/i.test(
              String(fetchError?.message || "")
            );
          if (!isRetryable || attempt === DOWNLOAD_MAX_ATTEMPTS) {
            throw fetchError;
          }
          devLog("retrying after error", sanitizeForLog(String(fetchError?.message || "")));
          await wait(500 * attempt);
        }
      }
      throw lastError;
      })();

      const status = Number(downloaded?.info?.().status || 0);
      if (status < 200 || status >= 300) {
        throw describeHttpStatus(status);
      }

      temporaryPath = String(downloaded?.path?.() || "");
      if (!temporaryPath) {
        throw new GallerySaveError("download", "Could not download this media for the gallery.");
      }

      const fileStat = await ReactNativeBlobUtil.fs.stat(temporaryPath).catch(() => null);
      if (!fileStat || Number(fileStat.size) <= 0) {
        throw new GallerySaveError("download", "Could not download this media for the gallery.");
      }
      devLog("downloaded file size", Number(fileStat.size));
    }

    const correctedExtension = downloaded ? getExtensionFromContentType(downloaded?.info?.().headers) : "";
    // Videos keep their deterministic cache-path extension so a later Save
    // attempt can find the same file again — renaming would silently break
    // the cache lookup above.
    if (!temporaryPathIsCache && !isVideo && correctedExtension && correctedExtension !== extension) {
      const renamedPath = temporaryPath.replace(/\.[a-z0-9]+$/i, `.${correctedExtension}`);
      await ReactNativeBlobUtil.fs.mv(temporaryPath, renamedPath).catch(() => undefined);
      if (await ReactNativeBlobUtil.fs.exists(renamedPath).catch(() => false)) {
        temporaryPath = renamedPath;
      }
    }

    const localUri = temporaryPath.startsWith("file://") ? temporaryPath : `file://${temporaryPath}`;
    const finalExtension = correctedExtension || extension;

    try {
      await CameraRoll.save(localUri, {
        type: isVideoExtension(finalExtension) ? "video" : "photo",
        album: "Aline2",
      });
    } catch (saveError: any) {
      const saveMessage = String(saveError?.message || "").toLowerCase();
      if (saveMessage.includes("permission") || saveMessage.includes("photos") || saveMessage.includes("gallery")) {
        throw new GallerySaveError("permission", saveError?.message || "Gallery permission is required to save this media.");
      }
      devLog("save failed", sanitizeForLog(String(saveError?.message || saveError)));
      throw new GallerySaveError(
        "save",
        saveError?.message ? `Could not save this media to the gallery: ${saveError.message}` : "Could not save this media to the gallery."
      );
    }

    devLog("save result", { finalExtension, type: isVideoExtension(finalExtension) ? "video" : "photo" });
    return localUri;
  } catch (error: any) {
    if (error instanceof GallerySaveError) {
      throw error;
    }
    const message = String(error?.message || "").toLowerCase();
    if (message.includes("permission") || message.includes("photos") || message.includes("gallery")) {
      throw new GallerySaveError("permission", error?.message || "Gallery permission is required to save this media.");
    }
    devLog("download failed", sanitizeForLog(String(error?.message || error)));
    throw classifyFetchError(error);
  } finally {
    // Videos are intentionally left in the cache directory for reuse by a
    // later Save-to-Gallery attempt; only clean up non-video temp downloads.
    if (temporaryPath && !isVideo) {
      ReactNativeBlobUtil.fs.unlink(temporaryPath).catch(() => undefined);
    }
  }
};

// Keep the old export for existing callers while exposing the gallery-specific operation clearly.
export const downloadImageAsset = saveMediaToGallery;

// For images that are already rendered on screen, skip the network
// download entirely and save a local snapshot of the displayed <Image>
// (via react-native-view-shot). This avoids "download interrupted" network
// failures altogether since no network request is made.
export const saveCapturedImageToGallery = async (captureImage: () => Promise<string>) => {
  if (!(await ensureLegacyAndroidGalleryPermission())) {
    throw new GallerySaveError("permission", "Gallery permission is required to save this image.");
  }

  if (!CameraRoll?.save) {
    throw new GallerySaveError("unsupported", "Gallery saving is unavailable on this device.");
  }

  let capturedPath = "";
  try {
    capturedPath = await captureImage();
  } catch (captureError: any) {
    devLog("image capture failed", sanitizeForLog(String(captureError?.message || captureError)));
    throw new GallerySaveError("download", "Unable to capture this image. Please try again.");
  }

  if (!capturedPath) {
    throw new GallerySaveError("download", "Unable to capture this image. Please try again.");
  }

  const localUri = capturedPath.startsWith("file://") ? capturedPath : `file://${capturedPath}`;

  try {
    await CameraRoll.save(localUri, { type: "photo", album: "Aline2" });
  } catch (saveError: any) {
    const saveMessage = String(saveError?.message || "").toLowerCase();
    if (saveMessage.includes("permission") || saveMessage.includes("photos") || saveMessage.includes("gallery")) {
      throw new GallerySaveError("permission", "Gallery permission is required to save this image.");
    }
    devLog("save failed", sanitizeForLog(String(saveError?.message || saveError)));
    throw new GallerySaveError("save", "Could not save this image to the gallery.");
  } finally {
    ReactNativeBlobUtil.fs.unlink(capturedPath.replace(/^file:\/\//, "")).catch(() => undefined);
  }

  devLog("save result", { finalExtension: "jpg", type: "photo" });
  return localUri;
};
