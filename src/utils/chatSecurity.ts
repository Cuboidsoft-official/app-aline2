import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Keychain from "react-native-keychain";

const CHAT_LOCK_PASSCODE_SERVICE = "aline2.chat.lock.passcode";
const buildLockedChatsStorageKey = (userId: string) => `aline2.chat.locked.${String(userId || "").trim()}`;

const parseJson = <T,>(value: string | null, fallback: T): T => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const normalizeConversationId = (conversationId: string) => String(conversationId || "").trim();

export const getLockedConversationIds = async (userId: string): Promise<string[]> => {
  const storageKey = buildLockedChatsStorageKey(userId);
  if (!storageKey || !String(userId || "").trim()) {
    return [];
  }

  const rawValue = await AsyncStorage.getItem(storageKey);
  const parsedValue = parseJson<string[]>(rawValue, []);
  return Array.from(new Set(parsedValue.map((value) => normalizeConversationId(value)).filter(Boolean)));
};

export const isConversationLocked = async (userId: string, conversationId: string): Promise<boolean> => {
  const normalizedConversationId = normalizeConversationId(conversationId);
  if (!normalizedConversationId) {
    return false;
  }

  const lockedIds = await getLockedConversationIds(userId);
  return lockedIds.includes(normalizedConversationId);
};

export const setConversationLocked = async (
  userId: string,
  conversationId: string,
  locked: boolean,
): Promise<string[]> => {
  const normalizedConversationId = normalizeConversationId(conversationId);
  const storageKey = buildLockedChatsStorageKey(userId);

  if (!String(userId || "").trim() || !normalizedConversationId) {
    return [];
  }

  const existingIds = await getLockedConversationIds(userId);
  const nextIds = locked
    ? Array.from(new Set([...existingIds, normalizedConversationId]))
    : existingIds.filter((value) => value !== normalizedConversationId);

  await AsyncStorage.setItem(storageKey, JSON.stringify(nextIds));
  return nextIds;
};

export const hasChatLockPasscode = async (): Promise<boolean> => {
  const credentials = await Keychain.getGenericPassword({ service: CHAT_LOCK_PASSCODE_SERVICE });
  if (!credentials) {
    return false;
  }

  return Boolean(credentials.password);
};

export const setChatLockPasscode = async (passcode: string): Promise<void> => {
  const normalizedPasscode = String(passcode || "").trim();
  if (!/^\d{4,8}$/.test(normalizedPasscode)) {
    throw new Error("Use a 4 to 8 digit passcode.");
  }

  await Keychain.setGenericPassword("aline2-chat-lock", normalizedPasscode, {
    service: CHAT_LOCK_PASSCODE_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
};

export const verifyChatLockPasscode = async (passcode: string): Promise<boolean> => {
  const credentials = await Keychain.getGenericPassword({ service: CHAT_LOCK_PASSCODE_SERVICE });
  if (!credentials || !credentials.password) {
    return false;
  }

  return String(credentials.password) === String(passcode || "").trim();
};
