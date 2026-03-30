export const getMessageSenderId = (message) =>
  message?.sender?._id || message?.sender?.id || message?.senderId || message?.sender || "";

export const getMessageText = (message) =>
  String(message?.text || message?.message || message?.content || "").trim();

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
  if (["video", "audio"].includes(String(message?.messageType || ""))) {
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
