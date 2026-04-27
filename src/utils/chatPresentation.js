const SHARED_CONTENT_PREFIX = "aline2:share:";
const CALL_EVENT_PREFIX = "aline2:call:";
const SCHEDULED_CALL_PREFIX = "aline2:call_schedule:";

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
  const isSwipe = !Array.isArray(post?.media) && post?.media?.url;
  const mediaList = isSwipe
    ? [{
        id: String(post?.media?.id || ""),
        mediaType: String(post?.media?.mediaType || "video"),
        url: String(post?.media?.url || ""),
        thumbnailUrl: String(post?.thumbnailUrl || post?.media?.thumbnailUrl || ""),
      }]
    : Array.isArray(post?.media)
      ? post.media.slice(0, 4).map((asset) => ({
          id: String(asset?.id || ""),
          mediaType: String(asset?.mediaType || "image"),
          url: String(asset?.url || ""),
          thumbnailUrl: String(asset?.thumbnailUrl || ""),
        }))
      : [];
  const payload = {
    kind: isSwipe ? "swipe" : "post",
    postId: isSwipe ? "" : String(post?.id || ""),
    swipeId: isSwipe ? String(post?.id || "") : "",
    caption: String(post?.caption || "").trim(),
    createdAt: Number(post?.createdAt || Date.now()),
    user: {
      id: String(post?.user?.id || ""),
      username: String(post?.user?.username || ""),
      name: String(post?.user?.name || ""),
      avatarUrl: String(post?.user?.avatarUrl || ""),
    },
    media: mediaList,
  };

  return `${SHARED_CONTENT_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
};

export const buildSharedStoryMessage = (story, { action = "share", replyText = "" } = {}) => {
  const normalizedAction = ["like", "reply", "share"].includes(String(action).trim().toLowerCase())
    ? String(action).trim().toLowerCase()
    : "share";
  const normalizedReplyText = String(replyText || "").trim();
  const payload = {
    kind: "story",
    storyId: String(story?.id || ""),
    storyType: String(story?.type || "media"),
    caption: String(story?.text || "").trim(),
    createdAt: Number(story?.createdAt || Date.now()),
    backgroundColor: String(story?.backgroundColor || "").trim(),
    user: {
      id: String(story?.user?.id || ""),
      username: String(story?.user?.username || ""),
      name: String(story?.user?.name || ""),
      avatarUrl: String(story?.user?.avatarUrl || ""),
    },
    media: story?.media
      ? [{
        id: String(story?.media?.id || ""),
        mediaType: String(story?.media?.mediaType || "image"),
        url: String(story?.media?.url || ""),
        thumbnailUrl: String(story?.media?.thumbnailUrl || ""),
      }]
      : [],
    interaction: {
      type: normalizedAction,
      text: normalizedAction === "reply" ? normalizedReplyText : "",
    },
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

/**
 * @param {{
 *   callType?: string;
 *   title?: string;
 *   details?: string;
 *   startAt?: string;
 *   endAt?: string;
 *   durationMinutes?: number;
 *   timeZone?: string;
 *   createdBy?: string;
 *   calendarUrl?: string;
 * }} [params]
 */
export const buildScheduledCallMessage = ({
  callType = "audio",
  title = "",
  details = "",
  startAt,
  endAt,
  durationMinutes = 30,
  timeZone = "",
  createdBy = "",
  calendarUrl = "",
} = {}) => {
  const payload = {
    kind: "call_schedule",
    callType: String(callType || "audio").trim() === "video" ? "video" : "audio",
    title: String(title || "").trim(),
    details: String(details || "").trim(),
    startAt: String(startAt || new Date().toISOString()).trim(),
    endAt: String(endAt || "").trim(),
    durationMinutes: Math.max(5, Number(durationMinutes) || 30),
    timeZone: String(timeZone || "").trim(),
    createdBy: String(createdBy || "").trim(),
    calendarUrl: String(calendarUrl || "").trim(),
  };

  return `${SCHEDULED_CALL_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
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

const parseScheduledCallValue = (value) => {
  const rawValue = String(value || "").trim();
  if (!rawValue.startsWith(SCHEDULED_CALL_PREFIX)) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeURIComponent(rawValue.slice(SCHEDULED_CALL_PREFIX.length)));
    return payload && typeof payload === "object" ? payload : null;
  } catch (error) {
    console.log("scheduled call payload parse error:", error);
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

export const parseScheduledCallMessage = (messageOrValue) => {
  if (typeof messageOrValue === "string") {
    return parseScheduledCallValue(messageOrValue);
  }

  return parseScheduledCallValue(
    messageOrValue?.text || messageOrValue?.message || messageOrValue?.content || "",
  );
};

export const getMessageSenderId = (message) =>
  message?.sender?._id || message?.sender?.id || message?.senderId || message?.sender || "";

export const getMessageText = (message) => {
  const rawText = String(message?.text || message?.message || message?.content || "").trim();
  const sharedContent = parseSharedContentValue(rawText);
  const callEvent = parseCallEventValue(rawText);
  const scheduledCall = parseScheduledCallValue(rawText);

  if (!sharedContent && !callEvent && !scheduledCall) {
    return rawText;
  }

  if (callEvent?.kind === "call") {
    return "";
  }

  if (scheduledCall?.kind === "call_schedule") {
    return "";
  }

  if (sharedContent?.caption) {
    return String(sharedContent.caption).trim();
  }

  if (sharedContent?.kind === "post") {
    const username = String(sharedContent?.user?.username || "").trim();
    return username ? `@${username}'s post` : "Shared post";
  }

  if (sharedContent?.kind === "swipe") {
    const username = String(sharedContent?.user?.username || "").trim();
    return username ? `@${username}'s swipe` : "Shared swipe";
  }

  if (sharedContent?.kind === "story") {
    const interactionType = String(sharedContent?.interaction?.type || "").trim().toLowerCase();
    const interactionText = String(sharedContent?.interaction?.text || "").trim();

    if (interactionType === "reply" && interactionText) {
      return interactionText;
    }

    if (interactionType === "like") {
      return "Liked a story";
    }

    const username = String(sharedContent?.user?.username || "").trim();
    return username ? `@${username}'s story` : "Shared story";
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

const getNormalizedMessageType = (message) =>
  String(message?.messageType || message?.type || "").trim().toLowerCase();

const getAttachmentMimeType = (message) => {
  const normalizedMessageType = getNormalizedMessageType(message);

  if (normalizedMessageType === "voice" || normalizedMessageType === "audio") {
    return "audio/*";
  }

  if (normalizedMessageType === "video") {
    return "video/*";
  }

  if (normalizedMessageType === "gif") {
    return "image/gif";
  }

  if (normalizedMessageType === "image") {
    return "image/*";
  }

  const attachment = getMessageAttachment(message);
  const explicitMimeType = String(attachment?.mimeType || message?.mimeType || "").trim().toLowerCase();
  if (explicitMimeType) {
    return explicitMimeType;
  }

  const candidate = String(attachment?.fileName || attachment?.url || "").split(/[?#]/)[0].toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|heic|heif)$/.test(candidate)) {
    return "image/*";
  }
  if (/\.(mp3|m4a|aac|wav|ogg|oga|opus|webm|mp4)$/.test(candidate)) {
    return "audio/*";
  }
  if (/\.(mp4|mov|m4v|webm|mkv|avi)$/.test(candidate)) {
    return "video/*";
  }

  return "";
};

export const isImageMessage = (message) => {
  const mimeType = getAttachmentMimeType(message);
  return ["image", "gif"].includes(getNormalizedMessageType(message)) || mimeType.startsWith("image/");
};

export const isDocumentMessage = (message) => {
  const mimeType = getAttachmentMimeType(message);
  if (
    ["video", "audio", "voice"].includes(String(message?.messageType || ""))
    || mimeType.startsWith("audio/")
    || mimeType.startsWith("video/")
  ) {
    return false;
  }

  const attachment = getMessageAttachment(message);
  return message?.messageType === "document" || Boolean(attachment?.url && !isImageMessage(message));
};

export const isVideoMessage = (message) => {
  const normalizedType = getNormalizedMessageType(message);
  if (normalizedType === "audio" || normalizedType === "voice") {
    return false;
  }

  const attachment = getMessageAttachment(message);
  const mimeType = getAttachmentMimeType(message);
  return normalizedType === "video"
    || (
      mimeType.startsWith("video/")
      && Boolean(attachment?.thumbnailUrl || message?.thumbnailUrl || attachment?.previewUrl)
    );
};

export const isAudioMessage = (message) =>
  ["audio", "voice"].includes(getNormalizedMessageType(message)) || getAttachmentMimeType(message).startsWith("audio/");

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
  const scheduledCall = parseScheduledCallMessage(conversation?.lastMessageText || "");
  if (sharedContent?.kind === "post") {
    const username = String(sharedContent?.user?.username || "").trim();
    return username ? `Shared @${username}'s post` : "Shared a post";
  }

  if (sharedContent?.kind === "swipe") {
    const username = String(sharedContent?.user?.username || "").trim();
    return username ? `Shared @${username}'s swipe` : "Shared a swipe";
  }

  if (sharedContent?.kind === "story") {
    const username = String(sharedContent?.user?.username || "").trim();
    const targetLabel = username ? `@${username}'s story` : "a story";
    const interactionType = String(sharedContent?.interaction?.type || "").trim().toLowerCase();

    if (interactionType === "reply") {
      return `Replied to ${targetLabel}`;
    }

    if (interactionType === "like") {
      return `Liked ${targetLabel}`;
    }

    return `Shared ${targetLabel}`;
  }

  if (callEvent?.kind === "call") {
    const isVideo = callEvent.callType === "video";
    if (callEvent.event === "missed") {
      return isVideo ? "Missed video call" : "Missed voice call";
    }
    if (callEvent.event === "ended") {
      return isVideo ? "Video call completed" : "Voice call completed";
    }
    return isVideo ? "Video call" : "Voice call";
  }

  if (scheduledCall?.kind === "call_schedule") {
    const isVideo = scheduledCall.callType === "video";
    return isVideo ? "Scheduled video call" : "Scheduled voice call";
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
