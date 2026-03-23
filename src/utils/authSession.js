import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "token";
const USER_KEY = "user";
const USER_ID_KEY = "userId";

const extractUserId = (user) => {
  if (!user || typeof user !== "object") {
    return "";
  }

  return String(user._id || user.id || "");
};

export const getStoredToken = () => AsyncStorage.getItem(TOKEN_KEY);

export const getStoredUser = async () => {
  const rawUser = await AsyncStorage.getItem(USER_KEY);
  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser);
  } catch {
    return null;
  }
};

export const getStoredUserId = async () => {
  const rawUserId = await AsyncStorage.getItem(USER_ID_KEY);
  if (rawUserId) {
    return rawUserId;
  }

  const user = await getStoredUser();
  return extractUserId(user);
};

export const setStoredSession = async ({ token, user }) => {
  const writes = [];

  if (typeof token === "string" && token) {
    writes.push(AsyncStorage.setItem(TOKEN_KEY, token));
  }

  if (user && typeof user === "object") {
    writes.push(AsyncStorage.setItem(USER_KEY, JSON.stringify(user)));

    const userId = extractUserId(user);
    if (userId) {
      writes.push(AsyncStorage.setItem(USER_ID_KEY, userId));
    }
  }

  await Promise.all(writes);
};

export const clearStoredSession = async () => {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY, USER_ID_KEY]);
};
