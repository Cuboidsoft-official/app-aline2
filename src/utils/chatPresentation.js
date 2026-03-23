export const getMessageSenderId = (message) =>
  message?.sender?._id || message?.sender?.id || message?.senderId || message?.sender || "";

export const getMessageText = (message) =>
  String(message?.text || message?.message || message?.content || "").trim();

export const getMessageAttachment = (message) =>
  message?.attachment && typeof message.attachment === "object" ? message.attachment : null;

export const isImageMessage = (message) => {
  const attachment = getMessageAttachment(message);
  return message?.messageType === "image" || Boolean(attachment?.mimeType?.startsWith("image/"));
};

export const isDocumentMessage = (message) => {
  const attachment = getMessageAttachment(message);
  return message?.messageType === "document" || Boolean(attachment?.url && !isImageMessage(message));
};

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
    case "document":
      return "Sent a document";
    case "voice":
      return "Sent a voice note";
    case "video":
      return "Sent a video";
    default:
      return "";
  }
};
