import { Platform } from "react-native";
import { API_BASE_URL, BACKEND_ORIGIN, SHARE_BASE_URL, SOCKET_URL } from "@env";

const trimTrailingSlash = (value) => value.replace(/\/+$/, "");
const dedupe = (items) => Array.from(new Set(items.filter(Boolean)));
const appendApiPath = (value) => {
  const trimmed = trimTrailingSlash(String(value || "").trim());
  if (!trimmed) {
    return "";
  }

  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
};
const isPrivateHostname = (hostname = "") =>
  /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|.*\.local$)/i.test(
    String(hostname || "").trim()
  );
const isLoopbackHostname = (hostname = "") =>
  /^(localhost|0\.0\.0\.0|127(?:\.\d{1,3}){0,3})$/i.test(String(hostname || "").trim());
const ANDROID_EMULATOR_HOSTS = ["10.0.2.2", "10.0.3.2"];
const DEFAULT_PUBLIC_BACKEND_ORIGIN = "https://api.aline2.com";
const replaceUrlHostname = (rawUrl, nextHostname) => {
  try {
    const parsed = new URL(rawUrl);
    parsed.hostname = nextHostname;
    return trimTrailingSlash(parsed.toString());
  } catch {
    return "";
  }
};
const buildCandidateUrls = (rawUrl, fallbackUrl) => {
  const baseUrl = trimTrailingSlash(rawUrl || fallbackUrl);
  const normalizedFallbackUrl = trimTrailingSlash(fallbackUrl || "");

  if (Platform.OS !== "android") {
    return dedupe([baseUrl, normalizedFallbackUrl]);
  }

  try {
    const parsed = new URL(baseUrl);
    const extraCandidates =
      isLoopbackHostname(parsed.hostname)
        ? ANDROID_EMULATOR_HOSTS.map((host) => replaceUrlHostname(baseUrl, host))
        : isPrivateHostname(parsed.hostname)
          ? ANDROID_EMULATOR_HOSTS.map((host) => replaceUrlHostname(baseUrl, host))
          : [];

    return dedupe([normalizedFallbackUrl, ...extraCandidates, baseUrl]);
  } catch {
    return dedupe([baseUrl, normalizedFallbackUrl]);
  }
};

const normalizedBackendOrigin = trimTrailingSlash(BACKEND_ORIGIN || "");
const publicFallbackApiBaseUrl = appendApiPath(DEFAULT_PUBLIC_BACKEND_ORIGIN);
const fallbackApiBaseUrl = publicFallbackApiBaseUrl
  || (Platform.OS === "android" ? "http://10.0.2.2:5000/api" : "http://localhost:5000/api");
const derivedApiBaseUrl = appendApiPath(normalizedBackendOrigin);
const derivedSocketBaseUrl = normalizedBackendOrigin;
const apiBaseUrlCandidates = buildCandidateUrls(API_BASE_URL || derivedApiBaseUrl, fallbackApiBaseUrl);
const socketBaseFallback = (apiBaseUrlCandidates[0] || fallbackApiBaseUrl).replace(/\/api$/, "");
const socketUrlCandidates = buildCandidateUrls(SOCKET_URL || derivedSocketBaseUrl, socketBaseFallback);
const connectionCandidates = dedupe(
  apiBaseUrlCandidates.map((apiBaseUrl, index) =>
    JSON.stringify({
      apiBaseUrl,
      socketUrl: socketUrlCandidates[index] || socketUrlCandidates[0] || socketBaseFallback,
    }),
  ),
).map((entry) => JSON.parse(entry));
const resolvedApiBaseUrl = connectionCandidates[0]?.apiBaseUrl || fallbackApiBaseUrl;
const resolvedSocketUrl = connectionCandidates[0]?.socketUrl || socketBaseFallback;

const resolvePublicShareBaseUrl = () => {
  const explicitShareBaseUrl = trimTrailingSlash(SHARE_BASE_URL || "");
  if (explicitShareBaseUrl) {
    return explicitShareBaseUrl;
  }

  try {
    if (derivedSocketBaseUrl && !isPrivateHostname(new URL(derivedSocketBaseUrl).hostname)) {
      return derivedSocketBaseUrl;
    }
  } catch {
    // Ignore malformed configured backend origins and continue.
  }

  try {
    const parsedSocketUrl = new URL(resolvedSocketUrl);
    if (!isPrivateHostname(parsedSocketUrl.hostname)) {
      return resolvedSocketUrl;
    }
  } catch {
    return "";
  }

  return "";
};

export const appConfig = {
  apiBaseUrl: resolvedApiBaseUrl,
  socketUrl: resolvedSocketUrl,
  connectionCandidates,
  publicShareBaseUrl: resolvePublicShareBaseUrl(),
};
