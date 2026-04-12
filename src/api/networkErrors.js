import { Platform } from "react-native";
import { getActiveConnectionConfig } from "./api";

const isNetworkFailure = (error) => !error?.response;

export const getReadableApiErrorMessage = (error, fallbackMessage = "Please try again.") => {
  if (error?.response?.data?.message) {
    return String(error.response.data.message);
  }

  if (!isNetworkFailure(error)) {
    return error?.message || fallbackMessage;
  }

  const activeConnection = getActiveConnectionConfig();
  const apiBaseUrl = activeConnection?.apiBaseUrl || "";

  if (Platform.OS === "android") {
    return `Could not reach the server at ${apiBaseUrl}. Check that the configured API host is reachable. If you intend to use a local backend, explicitly point the app env to localhost and rebuild.`;
  }

  return `Could not reach the server at ${apiBaseUrl}. Check that the backend is running and the API base URL is reachable.`;
};
