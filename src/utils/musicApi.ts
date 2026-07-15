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

  return undefined;
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

const MUSIC_CLIP_MAX_SECONDS = 30;
const MUSIC_FETCH_LIMIT_MULTIPLIER = 3;
const MUSIC_FETCH_MAX_LIMIT = 100;

const containsJamendoUrl = (...values: Array<string | undefined>) =>
  values.some((value) => /jamendo/i.test(String(value || "")));

const isJamendoMusicItem = (item: MusicCatalogItem): boolean => {
  const source = String(item.source || "").trim().toLowerCase();
  if (source === "youtube" || source === "spotify" || source === "audius") {
    return false;
  }

  return source === "jamendo"
    || containsJamendoUrl(item.previewUrl, item.streamUrl, item.audioUrl, item.externalUrl);
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
  youtubeVideoId: undefined,
  isOriginal: !!item?.isOriginal,
  duration: Math.max(1, Math.round(Number(item?.duration || 0) || 0)),
  clipStartTime: Math.max(0, Math.round(Number(item?.clipStartTime || item?.startTime || 0) || 0)),
  clipDuration: Math.max(
    1,
    Math.min(
      MUSIC_CLIP_MAX_SECONDS,
      Math.round(Number(item?.clipDuration || item?.duration || 1) || 1),
    ),
  ),
});

const ensureValidMusicItem = (item: MusicCatalogItem): MusicCatalogItem | null => {
  if (!item.id || !item.title || !item.duration) {
    return null;
  }

  return item;
};

export const getTrendingMusicCatalog = async (limit = 10, page = 1): Promise<MusicCatalogItem[]> => {
  const fetchLimit = Math.min(MUSIC_FETCH_MAX_LIMIT, Math.max(limit, limit * MUSIC_FETCH_LIMIT_MULTIPLIER));
  const load = async (path: string, params: Record<string, any>) => {
    const res = await API.get(path, { params });
    return getMusicPayloadList(res)
      .map(mapMusicItem)
      .map(ensureValidMusicItem)
      .filter((item): item is MusicCatalogItem => !!item && isJamendoMusicItem(item))
  };

  return load("/music/catalog/trending", {
    limit: fetchLimit,
    offset: Math.max(0, page - 1) * fetchLimit,
    includeExternal: true,
    provider: "jamendo",
    source: "jamendo",
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

export const searchMusicCatalog = async (query: string, limit = 12, page = 1): Promise<MusicCatalogItem[]> => {
  const trimmedQuery = String(query || "").trim();

  if (!trimmedQuery) {
    return [];
  }

  const fetchLimit = Math.min(MUSIC_FETCH_MAX_LIMIT, Math.max(limit, limit * MUSIC_FETCH_LIMIT_MULTIPLIER));
  const load = async (path: string, params: Record<string, any>) => {
    const res = await API.get(path, { params });
    return getMusicPayloadList(res)
      .map(mapMusicItem)
      .map(ensureValidMusicItem)
      .filter((item): item is MusicCatalogItem => !!item && isJamendoMusicItem(item))
  };

  return load("/music/catalog", {
    query: trimmedQuery,
    limit: fetchLimit,
    offset: Math.max(0, page - 1) * fetchLimit,
    includeExternal: true,
    provider: "jamendo",
    source: "jamendo",
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
    // Ask the catalog to resolve only the clip needed by the composer.
    clipStartTime: Math.max(0, Math.round(Number(item.clipStartTime || 0) || 0)),
    clipDuration: Math.min(
      MUSIC_CLIP_MAX_SECONDS,
      Math.max(1, Math.round(Number(item.clipDuration || MUSIC_CLIP_MAX_SECONDS) || MUSIC_CLIP_MAX_SECONDS)),
    ),
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
    youtubeVideoId: undefined,
    clipStartTime: item.clipStartTime ?? imported.clipStartTime ?? 0,
    clipDuration: Math.min(
      MUSIC_CLIP_MAX_SECONDS,
      item.clipDuration ?? imported.clipDuration ?? imported.duration,
    ),
  };

  if (__DEV__) {
    console.log("Preview URL:", resolvedItem.previewUrl || resolvedItem.streamUrl);
  }

  return resolvedItem;
};
