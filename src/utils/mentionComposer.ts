export type MentionCandidate = {
  id: string;
  username: string;
  name?: string;
  avatarUrl?: string;
};

export const normalizeMentionUsername = (value: string): string =>
  String(value || "").replace(/^@/, "").trim().toLowerCase();

export const mapMentionCandidate = (user: any): MentionCandidate | null => {
  const id = String(user?._id || user?.id || user?.userId || user?.user?._id || user?.user?.id || "").trim();
  const username = normalizeMentionUsername(String(user?.username || user?.user?.username || ""));

  if (!id || !username) {
    return null;
  }

  return {
    id,
    username,
    name: String(user?.name || user?.fullName || user?.user?.name || user?.username || "User").trim(),
    avatarUrl: String(user?.profilePic || user?.avatarUrl || user?.user?.profilePic || user?.user?.avatarUrl || "").trim(),
  };
};

export const getActiveMentionQuery = (value: string): string | null => {
  const text = String(value || "");
  const match = text.match(/(?:^|\s)@([A-Za-z0-9._]{0,30})$/);
  return match ? match[1] || "" : null;
};

export const insertMentionAtCursorEnd = (value: string, username: string, maxLength?: number): string => {
  const text = String(value || "");
  const normalizedUsername = normalizeMentionUsername(username);
  if (!normalizedUsername) {
    return text;
  }

  const token = `@${normalizedUsername} `;
  const nextText = text.match(/(?:^|\s)@[A-Za-z0-9._]{0,30}$/)
    ? text.replace(/(?:^|\s)@[A-Za-z0-9._]{0,30}$/, (match) => `${match.startsWith(" ") ? " " : ""}${token}`)
    : `${text}${text && !text.endsWith(" ") ? " " : ""}${token}`;

  return typeof maxLength === "number" ? nextText.slice(0, maxLength) : nextText;
};
