import { API } from "../../api/api";

// Backend searchRoutes is mounted at /api/search and returns results.channels.
export async function searchPublicChannels(query: string): Promise<any[]> {
  const response = await API.get("/search", {
    params: { query: query.trim(), type: "channels" },
  });
  return Array.isArray(response.data?.results?.channels)
    ? response.data.results.channels
    : [];
}
