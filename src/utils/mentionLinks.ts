import { API } from "../api/api";

const mentionUserIdCache = new Map<string, string>();
const mentionLookupCache = new Map<string, Promise<string>>();

const normalizeUsername = (value: string): string =>
  String(value || "").replace(/^@/, "").trim().toLowerCase();

const readUserId = (user: any): string => String(user?._id || user?.id || "").trim();
const readUsername = (user: any): string => normalizeUsername(String(user?.username || ""));

export const primeMentionUser = (userId: string, username: string): void => {
  const normalizedUsername = normalizeUsername(username);
  const normalizedUserId = String(userId || "").trim();

  if (!normalizedUsername || !normalizedUserId) {
    return;
  }

  mentionUserIdCache.set(normalizedUsername, normalizedUserId);
};

export const resolveMentionUserId = async (username: string): Promise<string> => {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    return "";
  }

  const cachedUserId = mentionUserIdCache.get(normalizedUsername);
  if (cachedUserId) {
    return cachedUserId;
  }

  const pendingLookup = mentionLookupCache.get(normalizedUsername);
  if (pendingLookup) {
    return pendingLookup;
  }

  const lookupPromise = API.get("/auth/search", {
    params: { query: normalizedUsername },
  })
    .then((response) => {
      const users = Array.isArray(response?.data?.users) ? response.data.users : [];
      const matchedUser =
        users.find((entry: any) => readUsername(entry) === normalizedUsername)
        || users.find((entry: any) => readUsername(entry).startsWith(normalizedUsername))
        || users[0];

      const matchedUserId = readUserId(matchedUser);
      if (matchedUserId) {
        mentionUserIdCache.set(normalizedUsername, matchedUserId);
      }

      return matchedUserId;
    })
    .catch(() => "")
    .finally(() => {
      mentionLookupCache.delete(normalizedUsername);
    });

  mentionLookupCache.set(normalizedUsername, lookupPromise);
  return lookupPromise;
};
