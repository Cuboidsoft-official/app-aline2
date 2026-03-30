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
    return `Could not reach the server at ${apiBaseUrl}. Make sure the backend is running, then for local Android dev use adb reverse with a localhost API URL or use a reachable LAN or remote host and rebuild the app.`;
  }

  return `Could not reach the server at ${apiBaseUrl}. Check that the backend is running and the API base URL is reachable.`;
};
