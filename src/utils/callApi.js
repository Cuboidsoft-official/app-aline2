import { API } from "../api/api";

export const startCallSession = async ({ conversationId, callType }) => {
  const response = await API.post(`/chat/${conversationId}/calls`, { callType });
  return response.data || {};
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
