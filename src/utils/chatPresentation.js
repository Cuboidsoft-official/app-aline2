const SHARED_CONTENT_PREFIX = "aline2:share:";
const CALL_EVENT_PREFIX = "aline2:call:";

const extractPostShareFromUrl = (value) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return null;
  }

  const urlMatch = rawValue.match(/https?:\/\/\S+/i);
  if (!urlMatch?.[0]) {
    return null;
  }

  try {
    const parsedUrl = new URL(urlMatch[0]);
    const postId = String(parsedUrl.searchParams.get("post") || "").trim();
    if (!postId) {
      return null;
    }

    const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
    const profileIndex = pathParts.findIndex((part) => part.toLowerCase() === "profile");
    const profileSlug = profileIndex >= 0 ? String(pathParts[profileIndex + 1] || "").trim() : "";

    return {
      kind: "post",
      postId,
      caption: "",
      createdAt: Date.now(),
      user: {
        id: profileSlug,
        username: profileSlug,
        name: profileSlug ? `@${profileSlug}` : "",
        avatarUrl: "",
      },
      media: [],
      shareUrl: parsedUrl.toString(),
    };
  } catch (error) {
    console.log("shared chat url parse error:", error);
    return null;
  }
};

const parseSharedContentValue = (value) => {
  const rawValue = String(value || "").trim();
  if (!rawValue.startsWith(SHARED_CONTENT_PREFIX)) {
    return extractPostShareFromUrl(rawValue);
  }

  try {
    const payload = JSON.parse(decodeURIComponent(rawValue.slice(SHARED_CONTENT_PREFIX.length)));
    return payload && typeof payload === "object" ? payload : null;
  } catch (error) {
    console.log("shared chat payload parse error:", error);
    return null;
  }
};

export const buildSharedPostMessage = (post) => {
  const payload = {
    kind: "post",
    postId: String(post?.id || ""),
    caption: String(post?.caption || "").trim(),
    createdAt: Number(post?.createdAt || Date.now()),
    user: {
      id: String(post?.user?.id || ""),
      username: String(post?.user?.username || ""),
      name: String(post?.user?.name || ""),
      avatarUrl: String(post?.user?.avatarUrl || ""),
    },
    media: Array.isArray(post?.media)
      ? post.media.slice(0, 4).map((asset) => ({
        id: String(asset?.id || ""),
        mediaType: String(asset?.mediaType || "image"),
        url: String(asset?.url || ""),
        thumbnailUrl: String(asset?.thumbnailUrl || ""),
      }))
      : [],
  };

  return `${SHARED_CONTENT_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
};

/**
 * @param {{
 *   callSessionId?: string;
 *   callType?: string;
 *   event?: string;
 *   callerId?: string;
 *   startedAt?: string;
 * }} [params]
 */
export const buildCallEventMessage = ({
  callSessionId,
  callType = "audio",
  event = "started",
  callerId = "",
  startedAt,
} = {}) => {
  const payload = {
    kind: "call",
    callSessionId: String(callSessionId || "").trim(),
    callType: String(callType || "audio").trim() === "video" ? "video" : "audio",
    event: String(event || "started").trim() || "started",
    callerId: String(callerId || "").trim(),
    startedAt: String(startedAt || new Date().toISOString()).trim(),
  };

  return `${CALL_EVENT_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
};

const parseCallEventValue = (value) => {
  const rawValue = String(value || "").trim();
  if (!rawValue.startsWith(CALL_EVENT_PREFIX)) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeURIComponent(rawValue.slice(CALL_EVENT_PREFIX.length)));
    return payload && typeof payload === "object" ? payload : null;
  } catch (error) {
    console.log("call event payload parse error:", error);
    return null;
  }
};

export const parseSharedContentMessage = (messageOrValue) => {
  if (typeof messageOrValue === "string") {
    return parseSharedContentValue(messageOrValue);
  }

  return parseSharedContentValue(
    messageOrValue?.text || messageOrValue?.message || messageOrValue?.content || "",
  );
};

export const parseCallEventMessage = (messageOrValue) => {
  if (typeof messageOrValue === "string") {
    return parseCallEventValue(messageOrValue);
  }

  return parseCallEventValue(
    messageOrValue?.text || messageOrValue?.message || messageOrValue?.content || "",
  );
};

export const getMessageSenderId = (message) =>
  message?.sender?._id || message?.sender?.id || message?.senderId || message?.sender || "";

export const getMessageText = (message) => {
  const rawText = String(message?.text || message?.message || message?.content || "").trim();
  const sharedContent = parseSharedContentValue(rawText);
  const callEvent = parseCallEventValue(rawText);

  if (!sharedContent && !callEvent) {
    return rawText;
  }

  if (callEvent?.kind === "call") {
    return "";
  }

  if (sharedContent?.caption) {
    return String(sharedContent.caption).trim();
  }

  if (sharedContent?.kind === "post") {
    const username = String(sharedContent?.user?.username || "").trim();
    return username ? `@${username}'s post` : "Shared post";
  }

  return "";
};

export const getMessageReply = (message) => {
  const nestedReply =
    message?.replyToMessage
    || message?.replyTo
    || message?.quotedMessage
    || message?.parentMessage
    || message?.reply;

  if (nestedReply && typeof nestedReply === "object") {
    return nestedReply;
  }

  if (typeof nestedReply === "string" && nestedReply.trim()) {
    return { _id: nestedReply.trim() };
  }

  const replyId =
    message?.replyToMessageId
    || message?.replyToId
    || message?.replyMessageId
    || message?.quotedMessageId
    || message?.replyId
    || message?.parentMessageId
    || "";

  return replyId ? { _id: String(replyId) } : null;
};

export const getMessageAttachment = (message) => {
  if (message?.attachment && typeof message.attachment === "object") {
    return message.attachment;
  }

  if (message?.mediaUrl || message?.thumbnailUrl || message?.fileName) {
    return {
      url: message?.mediaUrl || null,
      thumbnailUrl: message?.thumbnailUrl || null,
      fileName: message?.fileName || null,
      mimeType: message?.mimeType || null,
    };
  }

  return null;
};

export const isImageMessage = (message) => {
  const attachment = getMessageAttachment(message);
  return ["image", "gif"].includes(String(message?.messageType || "")) || Boolean(attachment?.mimeType?.startsWith("image/"));
};

export const isDocumentMessage = (message) => {
  if (["video", "audio", "voice"].includes(String(message?.messageType || ""))) {
    return false;
  }

  const attachment = getMessageAttachment(message);
  return message?.messageType === "document" || Boolean(attachment?.url && !isImageMessage(message));
};

export const isVideoMessage = (message) => String(message?.messageType || "") === "video";

export const isAudioMessage = (message) => String(message?.messageType || "") === "audio";

export const getAttachmentDisplayName = (message) => {
  const attachment = getMessageAttachment(message);

  if (attachment?.fileName) {
    return attachment.fileName;
  }

  if (attachment?.url) {
    return attachment.url.split("/").pop() || "Attachment";
  }

  return "Attachment";
};

export const getConversationPreview = (conversation) => {
  const sharedContent = parseSharedContentMessage(conversation?.lastMessageText || "");
  const callEvent = parseCallEventMessage(conversation?.lastMessageText || "");
  if (sharedContent?.kind === "post") {
    const username = String(sharedContent?.user?.username || "").trim();
    return username ? `Shared @${username}'s post` : "Shared a post";
  }

  if (callEvent?.kind === "call") {
    const callLabel = callEvent.callType === "video" ? "Video call" : "Voice call";
    return callEvent.event === "missed" ? `Missed ${callLabel.toLowerCase()}` : callLabel;
  }

  if (conversation?.lastMessageText) {
    return conversation.lastMessageText;
  }

  switch (conversation?.lastMessageType) {
    case "image":
      return "Sent an image";
    case "gif":
      return "Sent a GIF";
    case "document":
      return "Sent a document";
    case "audio":
    case "voice":
      return "Sent a voice note";
    case "video":
      return "Sent a video";
    default:
      return "";
  }
};
