import { appConfig } from "../config/env";

const PRIVATE_HOST_PATTERN =
  /^(localhost|0\.0\.0\.0|127(?:\.\d{1,3}){0,3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}|.*\.local)$/i;

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

  try {
    const parsed = new URL(value);
    if (!PRIVATE_HOST_PATTERN.test(parsed.hostname)) {
      return value;
    }

    const publicOrigin = getPublicOrigin();
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
