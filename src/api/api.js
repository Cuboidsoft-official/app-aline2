import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { appConfig } from "../config/env";

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
    const token = await AsyncStorage.getItem("token");

    if (client === ROOT_API) {
      config.baseURL = getClientBaseUrl("socket");
    } else {
      config.baseURL = getClientBaseUrl("api");
    }

    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: config.headers?.Authorization || `Bearer ${token}`,
      };
    }

    return config;
  });
};

const attachConnectionFailover = (client, kind) => {
  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalConfig = error?.config;

      if (error?.response || !originalConfig) {
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
