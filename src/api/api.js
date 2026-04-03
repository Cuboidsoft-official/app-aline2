import axios from "axios";
import { Platform } from "react-native";
import { appConfig } from "../config/env";
import { normalizeMediaFieldsDeep } from "../utils/mediaUrls";
import {
  clearStoredSession,
  getStoredRefreshToken,
  getStoredToken,
  getStoredUser,
  notifySessionInvalidation,
  setStoredSession,
} from "../utils/authSession";

const connectionCandidates =
  Array.isArray(appConfig.connectionCandidates) && appConfig.connectionCandidates.length
    ? appConfig.connectionCandidates
    : [{ apiBaseUrl: appConfig.apiBaseUrl, socketUrl: appConfig.socketUrl }];
let activeConnectionIndex = 0;

export const API = axios.create({
  baseURL: connectionCandidates[0].apiBaseUrl,
  timeout: 10000,
});

export const ROOT_API = axios.create({
  baseURL: connectionCandidates[0].socketUrl,
  timeout: 10000,
});

let refreshPromise = null;

const normalizeResponsePayload = (response) => {
  if (typeof response?.data !== "undefined") {
    response.data = normalizeMediaFieldsDeep(response.data);
  }

  return response;
};

const applyConnectionCandidate = (index) => {
  const nextIndex = Math.max(0, Math.min(index, connectionCandidates.length - 1));
  activeConnectionIndex = nextIndex;
  API.defaults.baseURL = connectionCandidates[nextIndex].apiBaseUrl;
  ROOT_API.defaults.baseURL = connectionCandidates[nextIndex].socketUrl;
};

const getClientBaseUrl = (kind) =>
  connectionCandidates[activeConnectionIndex]?.[kind === "socket" ? "socketUrl" : "apiBaseUrl"] || "";

const attachAuthInterceptor = (client) => {
  client.interceptors.request.use(async (config) => {
    const token = await getStoredToken();

    if (client === ROOT_API) {
      config.baseURL = getClientBaseUrl("socket");
    } else {
      config.baseURL = getClientBaseUrl("api");
    }

    config.headers = {
      ...config.headers,
      "x-device-platform": Platform.OS,
      "x-device-name": `${Platform.OS}-${String(Platform.Version || "unknown")}`,
    };

    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: config.headers?.Authorization || `Bearer ${token}`,
      };
    }

    return config;
  });
};

const refreshAccessToken = async () => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = await getStoredRefreshToken();
      const user = await getStoredUser();

      if (!refreshToken) {
        throw new Error("No refresh token available");
      }

      const response = await API.post("/auth/refresh", { refreshToken }, {
        __skipAuthRefresh: true,
      });

      if (!response?.data?.success || !response?.data?.accessToken) {
        throw new Error(response?.data?.message || "Session refresh failed");
      }

      await setStoredSession({
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken,
        session: response.data.session,
        user: response.data.user || user,
      });

      return response.data.accessToken;
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
};

const attachConnectionFailover = (client, kind) => {
  client.interceptors.response.use(
    (response) => normalizeResponsePayload(response),
    async (error) => {
      const originalConfig = error?.config;

      if (!originalConfig) {
        return Promise.reject(error);
      }

      if (
        error?.response?.status === 401
        && !originalConfig.__isRetryAfterRefresh
        && !originalConfig.__skipAuthRefresh
        && !String(originalConfig.url || "").includes("/auth/login")
        && !String(originalConfig.url || "").includes("/auth/refresh")
      ) {
        try {
          const nextAccessToken = await refreshAccessToken();
          return client.request({
            ...originalConfig,
            __isRetryAfterRefresh: true,
            headers: {
              ...originalConfig.headers,
              Authorization: `Bearer ${nextAccessToken}`,
            },
          });
        } catch (refreshError) {
          await clearStoredSession();
          notifySessionInvalidation();
          return Promise.reject(refreshError);
        }
      }

      if (error?.response) {
        return Promise.reject(error);
      }

      const nextIndex = Number(originalConfig.__connectionRetryIndex || 0) + 1;
      if (nextIndex >= connectionCandidates.length) {
        return Promise.reject(error);
      }

      applyConnectionCandidate(nextIndex);

      return client.request({
        ...originalConfig,
        __connectionRetryIndex: nextIndex,
        baseURL: getClientBaseUrl(kind),
      });
    },
  );
};

attachAuthInterceptor(API);
attachAuthInterceptor(ROOT_API);
attachConnectionFailover(API, "api");
attachConnectionFailover(ROOT_API, "socket");

export const getActiveConnectionConfig = () => connectionCandidates[activeConnectionIndex] || connectionCandidates[0];
