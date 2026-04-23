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
const LEGACY_R2_HOST_PATTERN = /^[a-z0-9-]+\.r2\.dev$/i;
const LEGACY_R2_HOSTS_REQUIRING_PREFIX = new Set([
  "pub-0ca80f02c91947fe9a67f96ec272c6a2.r2.dev",
]);
const LEGACY_R2_KEY_PREFIX = "aline2";
const LEGACY_R2_MEDIA_PREFIXES = [
  "audio/",
  "chat/",
  "documents/",
  "images/",
  "stickers/",
  "videos/",
];

const applyLegacyR2PathFix = (rawUrl) => {
  try {
    const parsed = new URL(rawUrl);
    const normalizedHostname = String(parsed.hostname || "").trim().toLowerCase();
    const normalizedPath = parsed.pathname.replace(/^\/+/, "");

    if (!LEGACY_R2_HOST_PATTERN.test(normalizedHostname)) {
      return rawUrl;
    }

    // Only the original public R2 host required the bucket key prefix.
    // Newer hosts already return the correct bare object path.
    if (!LEGACY_R2_HOSTS_REQUIRING_PREFIX.has(normalizedHostname)) {
      return rawUrl;
    }

    if (normalizedPath.startsWith(`${LEGACY_R2_KEY_PREFIX}/`)) {
      return rawUrl;
    }

    if (!LEGACY_R2_MEDIA_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))) {
      return rawUrl;
    }

    parsed.pathname = `/${LEGACY_R2_KEY_PREFIX}/${normalizedPath}`;
    return parsed.toString();
  } catch {
    return rawUrl;
  }
};

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
    const fixedValue = applyLegacyR2PathFix(value);
    const parsed = new URL(fixedValue);
    if (!PRIVATE_HOST_PATTERN.test(parsed.hostname)) {
      return fixedValue;
    }

    if (!publicOrigin) {
      return fixedValue;
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
