import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { appConfig } from "../config/env";

export const API = axios.create({
  baseURL: appConfig.apiBaseUrl,
  timeout: 10000,
});

export const ROOT_API = axios.create({
  baseURL: appConfig.socketUrl,
  timeout: 10000,
});

const attachAuthInterceptor = (client) => {
  client.interceptors.request.use(async (config) => {
    const token = await AsyncStorage.getItem("token");

    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: config.headers?.Authorization || `Bearer ${token}`,
      };
    }

    return config;
  });
};

attachAuthInterceptor(API);
attachAuthInterceptor(ROOT_API);
