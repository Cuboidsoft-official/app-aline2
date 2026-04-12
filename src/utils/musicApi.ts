import { API } from "../api/api";
import { SelectedMusicClip } from "../features/social/types";

export type MusicCatalogItem = SelectedMusicClip;

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
  externalUrl: normalizeExternalUrl(item?.externalUrl),
  source: item?.source || undefined,
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
  const res = await API.get("/music/catalog/trending", {
    params: {
      limit,
    },
  });

  return (Array.isArray(res?.data?.data) ? res.data.data : [])
    .map(mapMusicItem)
    .map(ensureValidMusicItem)
    .filter(Boolean) as MusicCatalogItem[];
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
  const res = await API.get("/music/catalog", {
    params: {
      query,
      limit,
    },
  });

  return (Array.isArray(res?.data?.data) ? res.data.data : [])
    .map(mapMusicItem)
    .map(ensureValidMusicItem)
    .filter(Boolean) as MusicCatalogItem[];
};

export const importMusicCatalogItem = async (item: MusicCatalogItem): Promise<MusicCatalogItem> => {
  const isMongoId = /^[a-fA-F0-9]{24}$/.test(item.id);
  const res = await API.post("/music/catalog/import", {
    musicId: isMongoId ? item.id : undefined,
    externalId: item.externalId,
    source: item.source,
    title: item.title,
    artist: item.artist,
    thumbnailUrl: item.artworkUrl,
    previewUrl: item.previewUrl,
    externalUrl: item.externalUrl,
    duration: item.duration,
  });

  const imported = mapMusicItem(res?.data?.data);
  return {
    ...imported,
    clipStartTime: item.clipStartTime ?? imported.clipStartTime ?? 0,
    clipDuration: item.clipDuration ?? imported.clipDuration ?? imported.duration,
  };
};
