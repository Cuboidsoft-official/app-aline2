import { appConfig } from "../config/env";

const PRIVATE_HOST_PATTERN =
  /^(localhost|0\.0\.0\.0|127(?:\.\d{1,3}){0,3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}|.*\.local)$/i;
const MEDIA_FIELD_KEYS = new Set([
  "audioUrl",
  "artworkUrl",
  "avatarUrl",
  "coverImage",
  "coverPic",
  "groupAvatar",
  "image",
  "imageUrl",
  "mediaUrl",
  "previewUrl",
  "profileImage",
  "profilePic",
  "thumbnailUrl",
]);
const MEDIA_URL_HINT_KEYS = new Set([
  "duration",
  "durationMs",
  "height",
  "mediaType",
  "messageType",
  "mimeType",
  "order",
  "type",
  "width",
 ]);

const getPublicOrigin = () => {
  const baseCandidates = [
    appConfig.publicShareBaseUrl,
    appConfig.socketUrl,
    appConfig.apiBaseUrl,
  ];

  for (const candidate of baseCandidates) {
    try {
      const parsed = new URL(String(candidate || ""));
      if (!PRIVATE_HOST_PATTERN.test(parsed.hostname)) {
        return parsed.origin;
      }
    } catch {
      // Ignore malformed candidates and continue.
    }
  }

  return "";
};

export const normalizeMediaUrl = (rawUrl) => {
  const value = String(rawUrl || "").trim();
  if (!value) {
    return "";
  }

  const publicOrigin = getPublicOrigin();

  if (/^\/[^/]/.test(value)) {
    return publicOrigin ? `${publicOrigin}${value}` : value;
  }

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return publicOrigin ? `${publicOrigin}/${value.replace(/^\/+/, "")}` : value;
  }

  try {
    const parsed = new URL(value);
    if (!PRIVATE_HOST_PATTERN.test(parsed.hostname)) {
      return value;
    }

    if (!publicOrigin) {
      return value;
    }

    const nextUrl = new URL(publicOrigin);
    nextUrl.pathname = parsed.pathname;
    nextUrl.search = parsed.search;
    nextUrl.hash = parsed.hash;
    return nextUrl.toString();
  } catch {
    return value;
  }
};

const shouldNormalizeUrlField = (key, parentValue) => {
  if (MEDIA_FIELD_KEYS.has(String(key || ""))) {
    return true;
  }

  if (key !== "url" || !parentValue || typeof parentValue !== "object" || Array.isArray(parentValue)) {
    return false;
  }

  return Object.keys(parentValue).some((entry) => MEDIA_URL_HINT_KEYS.has(entry));
};

export const normalizeMediaFieldsDeep = (value, parentKey = "", parentValue = null) => {
  if (typeof value === "string") {
    return shouldNormalizeUrlField(parentKey, parentValue) ? normalizeMediaUrl(value) : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeMediaFieldsDeep(item, "", null));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.keys(value).reduce((acc, key) => {
    acc[key] = normalizeMediaFieldsDeep(value[key], key, value);
    return acc;
  }, {});
};
