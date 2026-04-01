import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Keychain from "react-native-keychain";

const SESSION_SERVICE = "aline2.auth.session";
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
  const credentials = await Keychain.getGenericPassword({ service: SESSION_SERVICE });

  if (!credentials) {
    return null;
  }

  return parseJson(credentials.password);
};

const setSecureSession = async (session) =>
  Keychain.setGenericPassword("aline2-session", JSON.stringify(session), {
    service: SESSION_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });

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
  const secureSession = await getSecureSession();

  if (secureSession?.accessToken) {
    return secureSession.accessToken;
  }

  return AsyncStorage.getItem(LEGACY_TOKEN_KEY);
};

export const getStoredRefreshToken = async () => {
  const secureSession = await getSecureSession();
  return secureSession?.refreshToken || null;
};

export const getStoredSessionMeta = async () => {
  const secureSession = await getSecureSession();
  return secureSession?.session || null;
};

export const getStoredUser = async () => {
  const rawUser = await AsyncStorage.getItem(USER_KEY);
  return parseJson(rawUser);
};

export const getStoredUserId = async () => {
  const rawUserId = await AsyncStorage.getItem(USER_ID_KEY);
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

  if (nextAccessToken || nextRefreshToken || session) {
    await setSecureSession({
      accessToken: nextAccessToken || null,
      refreshToken: nextRefreshToken || null,
      session: session || null,
    });
  }

  const writes = [AsyncStorage.removeItem(LEGACY_TOKEN_KEY)];

  if (user && typeof user === "object") {
    writes.push(AsyncStorage.setItem(USER_KEY, JSON.stringify(user)));

    const userId = extractUserId(user);
    if (userId) {
      writes.push(AsyncStorage.setItem(USER_ID_KEY, userId));
    }
  }

  await Promise.all(writes);
  notifySessionChanged();
};

export const clearStoredSession = async () => {
  await Promise.all([
    Keychain.resetGenericPassword({ service: SESSION_SERVICE }),
    AsyncStorage.multiRemove([LEGACY_TOKEN_KEY, USER_KEY, USER_ID_KEY]),
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
