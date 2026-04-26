import { API } from "../api/api";

export const startCallSession = async ({ conversationId, callType }) => {
  const response = await API.post(`/chat/${conversationId}/calls`, { callType });
  return response.data || {};
};

export const isCallAlreadyActiveError = (error) => {
  const code = String(error?.response?.data?.code || "").trim();
  const message = String(error?.response?.data?.message || "").trim().toLowerCase();

  return code === "CALL_ALREADY_ACTIVE" || message === "a call is already active in this conversation";
};

export const getExistingCallPayloadFromError = (error) => {
  const data = error?.response?.data || {};
  const callSessionId = String(data?.callSession?._id || "").trim();

  if (!callSessionId) {
    return null;
  }

  return {
    callSession: data.callSession,
    iceServers: Array.isArray(data.iceServers) ? data.iceServers : [],
    callRuntime: data.callRuntime || null,
  };
};

export const getCallSession = async (callSessionId) => {
  const response = await API.get(`/chat/calls/${callSessionId}`);
  return response.data || {};
};

export const answerCallSession = async (callSessionId) => {
  const response = await API.post(`/chat/calls/${callSessionId}/answer`, {});
  return response.data || {};
};

export const rejectCallSession = async (callSessionId, reason = "declined") => {
  const response = await API.post(`/chat/calls/${callSessionId}/reject`, { reason });
  return response.data || {};
};

export const endCallSession = async (callSessionId, reason = "") => {
  const response = await API.post(`/chat/calls/${callSessionId}/end`, { reason });
  return response.data || {};
};
