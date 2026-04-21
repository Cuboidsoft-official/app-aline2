import AsyncStorage from "@react-native-async-storage/async-storage";

const buildMutedChatsStorageKey = (userId: string) =>
  `aline2.chat.muted.${String(userId || "").trim()}`;

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

export const getMutedConversationIds = async (userId: string): Promise<string[]> => {
  const storageKey = buildMutedChatsStorageKey(userId);
  if (!storageKey || !String(userId || "").trim()) {
    return [];
  }

  const rawValue = await AsyncStorage.getItem(storageKey);
  const parsedValue = parseJson<string[]>(rawValue, []);
  return Array.from(new Set(parsedValue.map((value) => normalizeConversationId(value)).filter(Boolean)));
};

export const isConversationMuted = async (userId: string, conversationId: string): Promise<boolean> => {
  const normalizedConversationId = normalizeConversationId(conversationId);
  if (!normalizedConversationId) {
    return false;
  }

  const mutedIds = await getMutedConversationIds(userId);
  return mutedIds.includes(normalizedConversationId);
};

export const setConversationMuted = async (
  userId: string,
  conversationId: string,
  muted: boolean,
): Promise<string[]> => {
  const normalizedConversationId = normalizeConversationId(conversationId);
  const storageKey = buildMutedChatsStorageKey(userId);

  if (!String(userId || "").trim() || !normalizedConversationId) {
    return [];
  }

  const existingIds = await getMutedConversationIds(userId);
  const nextIds = muted
    ? Array.from(new Set([...existingIds, normalizedConversationId]))
    : existingIds.filter((value) => value !== normalizedConversationId);

  await AsyncStorage.setItem(storageKey, JSON.stringify(nextIds));
  return nextIds;
};

