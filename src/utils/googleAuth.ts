import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from "@env";

import { API } from "../api/api";
import { setStoredSession } from "./authSession";
import { registerPushToken } from "./pushRegistration";

let isConfigured = false;

const getGoogleConfig = () => {
  const webClientId = String(GOOGLE_WEB_CLIENT_ID || "").trim();
  const iosClientId = String(GOOGLE_IOS_CLIENT_ID || "").trim();

  if (!webClientId) {
    console.warn("Google login is not configured: GOOGLE_WEB_CLIENT_ID is missing.");
    return null;
  }

  return {
    webClientId,
    iosClientId: iosClientId || undefined,
  };
};

export const ensureGoogleConfigured = () => {
  if (isConfigured) {
    return true;
  }

  const config = getGoogleConfig();
  if (!config) {
    return false;
  }

  try {
    GoogleSignin.configure({
      webClientId: config.webClientId,
      iosClientId: config.iosClientId,
      offlineAccess: false,
    });

    isConfigured = true;
    return true;
  } catch (err) {
    console.warn("Failed to configure Google Sign-In:", err);
    return false;
  }
};

export const isGoogleCancelledError = (error: any): boolean =>
  error?.code === statusCodes.SIGN_IN_CANCELLED;

export const loginWithGoogle = async () => {
  const isSetup = ensureGoogleConfigured();
  if (!isSetup) {
    throw new Error("Google Login is not currently configured or supported on this device.");
  }

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const response = await GoogleSignin.signIn();

  if (response.type !== "success") {
    return { cancelled: true as const };
  }

  const idToken = String(response.data.idToken || "").trim();

  if (!idToken) {
    throw new Error("Google login did not return an ID token.");
  }

  const res = await API.post("/auth/google/mobile", { idToken });

  if (!res?.data?.success || !res?.data?.token || !res?.data?.user) {
    throw new Error(res?.data?.message || "Google login failed.");
  }

  await setStoredSession({
    accessToken: res.data.accessToken || res.data.token,
    refreshToken: res.data.refreshToken,
    session: res.data.session,
    user: res.data.user,
  });

  registerPushToken().catch(() => { });

  return {
    cancelled: false as const,
    user: res.data.user,
  };
};
