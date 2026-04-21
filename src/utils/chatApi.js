import { API } from "../api/api";
import { getStoredToken } from "./authSession";
import { postMultipart } from "./multipartUpload";

const buildAuthHeaders = async (extraHeaders = {}) => {
  const token = await getStoredToken();

  return {
    ...extraHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const isNotFoundError = (error) => Number(error?.response?.status) === 404;

const requestWithNotFoundFallback = async (primaryRequest, fallbackRequest) => {
  try {
    return await primaryRequest();
  } catch (error) {
    if (!fallbackRequest || !isNotFoundError(error)) {
      throw error;
    }

    return fallbackRequest();
  }
};

const normalizeUploadUri = (value) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  if (/^(file|content):\/\//i.test(rawValue)) {
    return rawValue;
  }

  if (/^[a-z]:\\/i.test(rawValue) || rawValue.startsWith("/")) {
    return `file://${rawValue.replace(/\\/g, "/")}`;
  }

  return rawValue;
};

/**
 * @param {{ receiverId?: string; conversationType?: string; serviceId?: string }} [params]
 */
export const createChatConversation = async ({ receiverId, conversationType = "direct", serviceId } = {}) => {
  const headers = await buildAuthHeaders();
  const payload = {
    receiverId,
    conversationType,
  };

  if (serviceId) {
    payload.serviceId = serviceId;
  }

  const response = await API.post("/chat/create", payload, { headers });
  return response.data;
};

/**
 * @param {{ groupName?: string; memberIds?: string[]; groupVisibility?: "private" | "public"; groupDescription?: string }} [params]
 */
export const createGroupChatConversation = async ({
  groupName,
  memberIds = [],
  groupVisibility,
  groupDescription,
} = {}) => {
  const headers = await buildAuthHeaders();
  const payload = {
    groupName,
    memberIds,
    groupVisibility,
    groupDescription,
  };
  const response = await requestWithNotFoundFallback(
    () => API.post("/chat/group", payload, { headers }),
    () => API.post("/chat/groups", payload, { headers })
  );

  return response.data;
};

export const fetchChatConversations = async (params = {}) => {
  const headers = await buildAuthHeaders();
  const requestConfig = {
    headers,
    params,
  };
  const response = await requestWithNotFoundFallback(
    () => API.get("/chat/my-conversations", requestConfig),
    () => API.get("/chat/conversations", requestConfig)
  );
  return response.data;
};

export const fetchChatConversationDetails = async (conversationId) => {
  const headers = await buildAuthHeaders();
  const response = await API.get(`/chat/${conversationId}`, { headers });
  return response.data;
};

export const fetchPublicGroupChatConversations = async (params = {}) => {
  const headers = await buildAuthHeaders();
  const requestConfig = {
    headers,
    params,
  };
  const response = await requestWithNotFoundFallback(
    () => API.get("/chat/public-groups", requestConfig),
    () => API.get("/chat/groups/public", requestConfig)
  );
  return response.data;
};

export const joinPublicGroupChatConversation = async (conversationId) => {
  const headers = await buildAuthHeaders();
  const response = await requestWithNotFoundFallback(
    () => API.post(`/chat/${conversationId}/join`, {}, { headers }),
    () => API.post(`/chat/groups/${conversationId}/join`, {}, { headers })
  );
  return response.data;
};

/**
 * @param {{ conversationId?: string; theme?: string }} [params]
 */
export const updateConversationTheme = async ({ conversationId, theme = "default" } = {}) => {
  if (!conversationId) {
    throw new Error("conversationId is required");
  }

  const headers = await buildAuthHeaders();
  const payload = { theme };
  const response = await requestWithNotFoundFallback(
    () => API.put(`/chat/${conversationId}/theme`, payload, { headers }),
    () => API.put(`/chat/theme/${conversationId}`, payload, { headers })
  );

  return response.data;
};

/**
 * @param {{ conversationId?: string; wallpaperUrl?: string | null }} [params]
 */
export const updateConversationWallpaper = async ({ conversationId, wallpaperUrl = null } = {}) => {
  if (!conversationId) {
    throw new Error("conversationId is required");
  }

  const headers = await buildAuthHeaders();
  const payload = { wallpaperUrl };
  const response = await requestWithNotFoundFallback(
    () => API.put(`/chat/${conversationId}/wallpaper`, payload, { headers }),
    () => API.put(`/chat/wallpaper/${conversationId}`, payload, { headers })
  );

  return response.data;
};

export const updateGroupChatConversation = async ({
  conversationId,
  groupName,
  groupAvatar,
  groupVisibility,
  groupDescription,
  groupLinks,
} = {}) => {
  const headers = await buildAuthHeaders();
  const payload = {};

  if (typeof groupName !== "undefined") {
    payload.groupName = groupName;
  }

  if (typeof groupAvatar !== "undefined") {
    payload.groupAvatar = groupAvatar;
  }

  if (typeof groupVisibility !== "undefined") {
    payload.groupVisibility = groupVisibility;
  }

  if (typeof groupDescription !== "undefined") {
    payload.groupDescription = groupDescription;
  }

  if (typeof groupLinks !== "undefined") {
    payload.groupLinks = groupLinks;
  }

  const response = await API.patch(
    `/chat/${conversationId}/group`,
    payload,
    { headers }
  );
  return response.data;
};

/**
 * @param {{ conversationId?: string; memberIds?: string[] }} [params]
 */
export const addGroupChatMembers = async ({ conversationId, memberIds = [] } = {}) => {
  const headers = await buildAuthHeaders();
  const response = await API.post(
    `/chat/${conversationId}/members`,
    { memberIds },
    { headers }
  );
  return response.data;
};

export const removeGroupChatMember = async ({ conversationId, memberId } = {}) => {
  const headers = await buildAuthHeaders();
  const response = await API.delete(`/chat/${conversationId}/members/${memberId}`, { headers });
  return response.data;
};

export const promoteGroupChatAdmin = async ({ conversationId, memberId } = {}) => {
  const headers = await buildAuthHeaders();
  const response = await API.post(`/chat/${conversationId}/admins/${memberId}`, {}, { headers });
  return response.data;
};

export const demoteGroupChatAdmin = async ({ conversationId, memberId } = {}) => {
  const headers = await buildAuthHeaders();
  const response = await API.delete(`/chat/${conversationId}/admins/${memberId}`, { headers });
  return response.data;
};

export const transferGroupChatOwnership = async ({ conversationId, memberId } = {}) => {
  const headers = await buildAuthHeaders();
  const response = await API.post(`/chat/${conversationId}/owner/${memberId}`, {}, { headers });
  return response.data;
};

export const deleteGroupChatConversation = async ({ conversationId } = {}) => {
  if (!conversationId) {
    throw new Error("conversationId is required");
  }

  const headers = await buildAuthHeaders();
  const response = await requestWithNotFoundFallback(
    () => API.delete(`/chat/${conversationId}/group`, { headers }),
    () => API.delete(`/chat/groups/${conversationId}`, { headers })
  );
  return response.data;
};

export const fetchConversationMessages = async (conversationId, params = {}) => {
  const headers = await buildAuthHeaders();
  const response = await API.get(`/message/${conversationId}`, {
    headers,
    params,
  });
  return response.data;
};

export const fetchConversationMedia = async (conversationId, params = {}) => {
  const headers = await buildAuthHeaders();
  const response = await API.get(`/message/${conversationId}/media`, {
    headers,
    params,
  });
  return response.data;
};

export const searchConversationMessages = async (conversationId, params = {}) => {
  const headers = await buildAuthHeaders();
  const response = await API.get(`/message/${conversationId}/search`, {
    headers,
    params,
  });
  return response.data;
};

export const reactToChatMessage = async (messageId, emoji) => {
  const headers = await buildAuthHeaders();
  const response = await API.post(
    `/message/${messageId}/reactions`,
    { emoji },
    { headers }
  );

  return response.data;
};

export const forwardChatMessage = async ({ messageId, targetConversationId } = {}) => {
  if (!messageId) {
    throw new Error("messageId is required");
  }

  if (!targetConversationId) {
    throw new Error("targetConversationId is required");
  }

  const headers = await buildAuthHeaders();
  const response = await API.post(
    `/message/${messageId}/forward`,
    { targetConversationId },
    { headers },
  );

  return response.data;
};

/**
 * @param {{ conversationId?: string; text?: string; file?: { uri?: string; name?: string | null; type?: string | null }; mediaUrl?: string; messageType?: string; replyToMessageId?: string; duration?: number }} [params]
 */
export const sendChatMessage = async ({ conversationId, text, file, mediaUrl, messageType, replyToMessageId, duration } = {}) => {
  const trimmedText = String(text || "").trim();
  const normalizedReplyToMessageId = String(replyToMessageId || "").trim();
  const normalizedDuration = Number(duration);
  const hasDuration = Number.isFinite(normalizedDuration) && normalizedDuration > 0;
  const replyFields = normalizedReplyToMessageId
    ? {
        replyToMessageId: normalizedReplyToMessageId,
        replyMessageId: normalizedReplyToMessageId,
        parentMessageId: normalizedReplyToMessageId,
        replyTo: normalizedReplyToMessageId,
      }
    : {};

  if (!conversationId) {
    throw new Error("conversationId is required");
  }

  if (!trimmedText && !file?.uri && !mediaUrl) {
    throw new Error("text, file, or mediaUrl is required");
  }

  const headers = await buildAuthHeaders();

  if (!file?.uri) {
    const response = await API.post(
      "/message/send",
      {
        conversationId,
        text: trimmedText,
        mediaUrl,
        messageType,
        ...replyFields,
        ...(hasDuration ? { duration: normalizedDuration } : {}),
      },
      { headers }
    );

    return response.data;
  }

  const body = new FormData();
  body.append("conversationId", conversationId);

  if (trimmedText) {
    body.append("text", trimmedText);
  }

  if (messageType) {
    body.append("messageType", messageType);
  }

  if (normalizedReplyToMessageId) {
    body.append("replyToMessageId", normalizedReplyToMessageId);
    body.append("replyMessageId", normalizedReplyToMessageId);
    body.append("parentMessageId", normalizedReplyToMessageId);
    body.append("replyTo", normalizedReplyToMessageId);
  }

  if (hasDuration) {
    body.append("duration", String(normalizedDuration));
  }

  body.append(
    "file",
    {
      uri: normalizeUploadUri(file.uri),
      name: file.name || `upload_${Date.now()}`,
      type: file.type || "application/octet-stream",
    }
  );

  return postMultipart({
    path: "/message/send",
    body,
    timeoutMs: 120000,
  });
};
