import { API } from "../api/api";

export const listLiveStreams = async () => {
  const response = await API.get("/live-streams");
  return response.data || {};
};

export const getMyActiveLiveStream = async () => {
  const response = await API.get("/live-streams/mine/active");
  return response.data || {};
};

export const createLiveStream = async (payload = {}) => {
  const response = await API.post("/live-streams", payload);
  return response.data || {};
};

export const getLiveStream = async (liveStreamId) => {
  const response = await API.get(`/live-streams/${liveStreamId}`);
  return response.data || {};
};

export const endLiveStream = async (liveStreamId) => {
  const response = await API.post(`/live-streams/${liveStreamId}/end`, {});
  return response.data || {};
};
