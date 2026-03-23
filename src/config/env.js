import { Platform } from "react-native";
import { API_BASE_URL, SOCKET_URL } from "@env";

const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

const fallbackApiBaseUrl =
  Platform.OS === "android" ? "http://0.0.0.0:5000/api" : "http://localhost:5000/api";

const resolvedApiBaseUrl = trimTrailingSlash(API_BASE_URL || fallbackApiBaseUrl);

const resolvedSocketUrl = trimTrailingSlash(
  SOCKET_URL || resolvedApiBaseUrl.replace(/\/api$/, "")
);

export const appConfig = {
  apiBaseUrl: resolvedApiBaseUrl,
  socketUrl: resolvedSocketUrl,
};
