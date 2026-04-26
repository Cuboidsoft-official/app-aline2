import { API } from "../api/api";
import { SelectedMusicClip } from "../features/social/types";

export type MusicCatalogItem = SelectedMusicClip;

const getMusicPayloadList = (payload: any): any[] => {
  if (Array.isArray(payload?.data?.data)) {
    return payload.data.data;
  }

  if (Array.isArray(payload?.data?.results)) {
    return payload.data.results;
  }

  if (Array.isArray(payload?.data?.music)) {
    return payload.data.music;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  return [];
};

const normalizeExternalUrl = (value: any): string | undefined => {
  const raw = String(value || "").trim();

  if (!raw) {
    return undefined;
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  if (raw.startsWith("/")) {
    return `https://audius.co${raw}`;
  }

  return raw;
};

const getId = (value: any): string => {
  if (!value) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return String(value._id || value.id || "");
};

const mapMusicItem = (item: any): MusicCatalogItem => ({
  id: getId(item.musicId || item._id || item.id),
  externalId: item?.externalId ? String(item.externalId) : undefined,
  title: String(item?.title || item?.trackName || "").trim(),
  artist: String(item?.artist || item?.artistName || "").trim() || undefined,
  artworkUrl: item?.thumbnailUrl || item?.artworkUrl || undefined,
  previewUrl: item?.previewUrl || item?.audioUrl || undefined,
  streamUrl: item?.streamUrl || item?.audioUrl || undefined,
  audioUrl: item?.audioUrl || item?.streamUrl || item?.previewUrl || undefined,
  externalUrl: normalizeExternalUrl(item?.externalUrl),
  source: item?.source || undefined,
  youtubeVideoId: item?.youtubeVideoId
    ? String(item.youtubeVideoId).trim()
    : String(item?.source || "").trim().toLowerCase() === "youtube"
      ? String(item?.externalId || "").trim() || undefined
      : undefined,
  isOriginal: !!item?.isOriginal,
  duration: Math.max(1, Math.round(Number(item?.duration || 0) || 0)),
  clipStartTime: Math.max(0, Math.round(Number(item?.clipStartTime || item?.startTime || 0) || 0)),
  clipDuration: Math.max(
    1,
    Math.round(Number(item?.clipDuration || item?.duration || 1) || 1),
  ),
});

const ensureValidMusicItem = (item: MusicCatalogItem): MusicCatalogItem | null => {
  if (!item.id || !item.title || !item.duration) {
    return null;
  }

  return item;
};

export const getTrendingMusicCatalog = async (limit = 10): Promise<MusicCatalogItem[]> => {
  const load = async (path: string, params: Record<string, any>) => {
    const res = await API.get(path, { params });
    return getMusicPayloadList(res)
      .map(mapMusicItem)
      .map(ensureValidMusicItem)
      .filter(Boolean) as MusicCatalogItem[];
  };

  try {
    const localFirst = await load("/music/catalog/trending", {
      limit,
      includeExternal: false,
    });

    if (localFirst.length) {
      return localFirst;
    }

    const blended = await load("/music/catalog/trending", {
      limit,
      includeExternal: true,
    });

    if (blended.length) {
      return blended;
    }
  } catch {
    // Fall back to legacy endpoints below.
  }

  return load("/music/trending", {
    limit,
  });
};

export const getUserOriginalSounds = async (userId: string, limit = 12): Promise<MusicCatalogItem[]> => {
  const res = await API.get(`/music/original/${userId}`, {
    params: {
      limit,
    },
  });

  return (Array.isArray(res?.data?.data) ? res.data.data : [])
    .map(mapMusicItem)
    .map(ensureValidMusicItem)
    .filter(Boolean) as MusicCatalogItem[];
};

export const searchMusicCatalog = async (query: string, limit = 12): Promise<MusicCatalogItem[]> => {
  const trimmedQuery = String(query || "").trim();

  if (!trimmedQuery) {
    return [];
  }

  const load = async (path: string, params: Record<string, any>) => {
    const res = await API.get(path, { params });
    return getMusicPayloadList(res)
      .map(mapMusicItem)
      .map(ensureValidMusicItem)
      .filter(Boolean) as MusicCatalogItem[];
  };

  try {
    const localFirst = await load("/music/catalog", {
      query: trimmedQuery,
      limit,
      includeExternal: false,
    });

    if (localFirst.length) {
      return localFirst;
    }

    const blended = await load("/music/catalog", {
      query: trimmedQuery,
      limit,
      includeExternal: true,
    });

    if (blended.length) {
      return blended;
    }
  } catch {
    // Fall back to legacy endpoints below.
  }

  return load("/music", {
    search: trimmedQuery,
    limit,
  });
};

export const importMusicCatalogItem = async (item: MusicCatalogItem): Promise<MusicCatalogItem> => {
  const isMongoId = /^[a-fA-F0-9]{24}$/.test(item.id);
  if (__DEV__) {
    console.log("Track:", item);
  }
  const res = await API.post("/music/catalog/import", {
    musicId: isMongoId ? item.id : undefined,
    externalId: item.externalId,
    source: item.source,
    title: item.title,
    artist: item.artist,
    thumbnailUrl: item.artworkUrl,
    previewUrl: item.previewUrl,
    streamUrl: item.streamUrl,
    audioUrl: item.audioUrl,
    externalUrl: item.externalUrl,
    duration: item.duration,
  });

  if (__DEV__) {
    console.log("Resolved Response:", res?.data?.data || res?.data);
  }

  const imported = mapMusicItem(res?.data?.data);
  const resolvedItem = {
    ...imported,
    previewUrl: imported.previewUrl || item.previewUrl,
    streamUrl: imported.streamUrl || item.streamUrl,
    audioUrl: imported.audioUrl || item.audioUrl || item.streamUrl || item.previewUrl,
    youtubeVideoId: imported.youtubeVideoId || item.youtubeVideoId,
    clipStartTime: item.clipStartTime ?? imported.clipStartTime ?? 0,
    clipDuration: item.clipDuration ?? imported.clipDuration ?? imported.duration,
  };

  if (__DEV__) {
    console.log("Preview URL:", resolvedItem.previewUrl || resolvedItem.streamUrl);
  }

  return resolvedItem;
};
