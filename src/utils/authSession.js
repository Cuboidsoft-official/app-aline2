import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Keychain from "react-native-keychain";
import { normalizeMediaFieldsDeep } from "./mediaUrls";

const SESSION_SERVICE = "aline2.auth.session";
const SESSION_DATA_KEY = "aline2_session_data";
const LEGACY_TOKEN_KEY = "token";
const USER_KEY = "user";
const USER_ID_KEY = "userId";
let sessionInvalidationHandler = null;
const sessionChangeListeners = new Set();

const extractUserId = (user) => {
  if (!user || typeof user !== "object") {
    return "";
  }

  return String(user._id || user.id || "");
};

const parseJson = (value) => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const getSecureSession = async () => {
  try {
    const credentials = await Keychain.getGenericPassword({ service: SESSION_SERVICE });

    if (!credentials) {
      return null;
    }

    return parseJson(credentials.password);
  } catch (error) {
    console.log("[authSession] Keychain read error, falling back to AsyncStorage:", error?.message);
    return null;
  }
};

const setSecureSession = async (session) => {
  try {
    await Keychain.setGenericPassword("aline2-session", JSON.stringify(session), {
      service: SESSION_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch (error) {
    console.log("[authSession] Keychain write error (non-fatal):", error?.message);
  }
};

const clearSecureSession = async () => {
  try {
    await Keychain.resetGenericPassword({ service: SESSION_SERVICE });
  } catch (error) {
    console.log("[authSession] Keychain reset error (non-fatal):", error?.message);
  }
};

const getAsyncSessionData = async () => {
  try {
    const raw = await AsyncStorage.getItem(SESSION_DATA_KEY);
    return parseJson(raw);
  } catch {
    return null;
  }
};

const notifySessionChanged = () => {
  sessionChangeListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.log("session change listener error", error);
    }
  });
};

export const getStoredToken = async () => {
  try {
    const secureSession = await getSecureSession();

    if (secureSession?.accessToken) {
      return secureSession.accessToken;
    }

    const asyncSession = await getAsyncSessionData();
    if (asyncSession?.accessToken) {
      return asyncSession.accessToken;
    }

    return (await AsyncStorage.getItem(LEGACY_TOKEN_KEY).catch(() => null)) || null;
  } catch {
    return null;
  }
};

export const getStoredRefreshToken = async () => {
  try {
    const secureSession = await getSecureSession();
    if (secureSession?.refreshToken) {
      return secureSession.refreshToken;
    }

    const asyncSession = await getAsyncSessionData();
    return asyncSession?.refreshToken || null;
  } catch {
    return null;
  }
};

export const getStoredSessionMeta = async () => {
  try {
    const secureSession = await getSecureSession();
    if (secureSession?.session) {
      return secureSession.session;
    }

    const asyncSession = await getAsyncSessionData();
    return asyncSession?.session || null;
  } catch {
    return null;
  }
};

export const getStoredUser = async () => {
  const rawUser = await AsyncStorage.getItem(USER_KEY).catch(() => null);
  return parseJson(rawUser);
};

export const getStoredUserId = async () => {
  const rawUserId = await AsyncStorage.getItem(USER_ID_KEY).catch(() => null);
  if (rawUserId) {
    return rawUserId;
  }

  const user = await getStoredUser();
  return extractUserId(user);
};

export const setStoredSession = async (payload = {}) => {
  const { token, accessToken, refreshToken, session, user } = payload;
  const nextAccessToken = String(accessToken || token || "").trim();
  const nextRefreshToken = String(refreshToken || "").trim();
  const normalizedUser =
    user && typeof user === "object"
      ? normalizeMediaFieldsDeep(user)
      : user;

  const sessionObj = {
    accessToken: nextAccessToken || null,
    refreshToken: nextRefreshToken || null,
    session: session || null,
  };

  if (nextAccessToken || nextRefreshToken || session) {
    await setSecureSession(sessionObj);
  }

  const writes = [
    AsyncStorage.setItem(SESSION_DATA_KEY, JSON.stringify(sessionObj)),
  ];

  if (nextAccessToken) {
    writes.push(AsyncStorage.setItem(LEGACY_TOKEN_KEY, nextAccessToken));
  }

  if (normalizedUser && typeof normalizedUser === "object") {
    writes.push(AsyncStorage.setItem(USER_KEY, JSON.stringify(normalizedUser)));

    const userId = extractUserId(normalizedUser);
    if (userId) {
      writes.push(AsyncStorage.setItem(USER_ID_KEY, userId));
    }
  }

  await Promise.all(writes.map((w) => w.catch(() => {})));
  notifySessionChanged();
};

export const clearStoredSession = async () => {
  await Promise.all([
    clearSecureSession(),
    AsyncStorage.multiRemove([SESSION_DATA_KEY, LEGACY_TOKEN_KEY, USER_KEY, USER_ID_KEY]).catch(() => {}),
  ]);
  notifySessionChanged();
};

export const subscribeSessionChanges = (handler) => {
  if (typeof handler !== "function") {
    return () => {};
  }

  sessionChangeListeners.add(handler);

  return () => {
    sessionChangeListeners.delete(handler);
  };
};

export const setSessionInvalidationHandler = (handler) => {
  sessionInvalidationHandler = typeof handler === "function" ? handler : null;

  return () => {
    if (sessionInvalidationHandler === handler) {
      sessionInvalidationHandler = null;
    }
  };
};

export const notifySessionInvalidation = () => {
  if (typeof sessionInvalidationHandler === "function") {
    sessionInvalidationHandler();
  }
};
