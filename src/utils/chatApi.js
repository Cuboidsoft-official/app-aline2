import { API } from "../api/api";
import { getStoredToken } from "./authSession";

const buildAuthHeaders = async (extraHeaders = {}) => {
  const token = await getStoredToken();

  return {
    ...extraHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
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
 * @param {{ groupName?: string; memberIds?: string[] }} [params]
 */
export const createGroupChatConversation = async ({ groupName, memberIds = [] } = {}) => {
  const headers = await buildAuthHeaders();
  const response = await API.post(
    "/chat/group",
    {
      groupName,
      memberIds,
    },
    { headers }
  );

  return response.data;
};

export const fetchChatConversations = async (params = {}) => {
  const headers = await buildAuthHeaders();
  const response = await API.get("/chat/my-conversations", {
    headers,
    params,
  });
  return response.data;
};

export const fetchChatConversationDetails = async (conversationId) => {
  const headers = await buildAuthHeaders();
  const response = await API.get(`/chat/${conversationId}`, { headers });
  return response.data;
};

export const updateGroupChatConversation = async ({ conversationId, groupName, groupAvatar } = {}) => {
  const headers = await buildAuthHeaders();
  const payload = {};

  if (typeof groupName !== "undefined") {
    payload.groupName = groupName;
  }

  if (typeof groupAvatar !== "undefined") {
    payload.groupAvatar = groupAvatar;
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

/**
 * @param {{ conversationId?: string; text?: string; file?: { uri?: string; name?: string | null; type?: string | null }; mediaUrl?: string; messageType?: string }} [params]
 */
export const sendChatMessage = async ({ conversationId, text, file, mediaUrl, messageType } = {}) => {
  const trimmedText = String(text || "").trim();

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

  body.append(
    "file",
    {
      uri: file.uri,
      name: file.name || `upload_${Date.now()}`,
      type: file.type || "application/octet-stream",
    }
  );

  const response = await API.post("/message/send", body, {
    headers: await buildAuthHeaders({ "Content-Type": "multipart/form-data" }),
    timeout: 120000,
  });

  return response.data;
};
