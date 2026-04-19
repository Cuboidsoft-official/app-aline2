import { API } from "../api/api";

const GIPHY_API_KEY = "jmI2aU0o6AWdzaq5OwHWBHu0th1if0S4";
const GIPHY_API_BASE = "https://api.giphy.com/v1/gifs";
const EMOJI_FAMILY_BASE = "https://www.emoji.family/api";
const DEFAULT_EMOJI_PACK = "fluent";

const GIPHY_CATEGORY_MAP: Record<string, string> = {
  reactions: "reaction",
  love: "love",
  funny: "funny",
  animals: "animals",
  celebrations: "celebration",
};

const EMOJI_GROUP_MAP: Record<string, string> = {
  all: "",
  smileys: "smileys-emotion",
  people: "people-body",
  animals: "animals-nature",
  food: "food-drink",
  travel: "travel-places",
  activities: "activities",
  objects: "objects",
  symbols: "symbols",
};

export interface ChatSticker {
  _id: string;
  name: string;
  type: "gif" | "emoji" | "animated" | "static";
  imageUrl: string;
  thumbnailUrl?: string;
  emoji?: string;
  category: string;
  tags: string[];
  useCount: number;
}

interface EmojiFamilyItem {
  emoji?: string;
  annotation?: string;
  group?: string;
  subgroup?: string;
  tags?: string[];
}

const normalizeStickerList = (payload: any): ChatSticker[] => {
  if (Array.isArray(payload?.stickers)) {
    return payload.stickers;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  return [];
};

const normalizeArrayResponse = (payload: any): any[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  if (Array.isArray(payload?.emojis)) {
    return payload.emojis;
  }

  return [];
};

const fetchJson = async (url: string) => {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
};

const mapGiphyItem = (item: any): ChatSticker | null => {
  const imageUrl =
    item?.images?.fixed_width?.url
    || item?.images?.downsized_medium?.url
    || item?.images?.original?.url
    || item?.images?.fixed_width?.webp
    || "";

  if (!imageUrl) {
    return null;
  }

  return {
    _id: String(item?.id || `giphy-${Math.random()}`),
    name: String(item?.title || item?.slug || "GIF").replace(/\s+-\s+GIF.*$/i, "").trim() || "GIF",
    type: "gif",
    imageUrl,
    thumbnailUrl:
      item?.images?.fixed_width_still?.url
      || item?.images?.preview_gif?.url
      || item?.images?.downsized_still?.url
      || imageUrl,
    category: String(item?.rating || "gifs"),
    tags: [],
    useCount: 0,
  };
};

const buildEmojiImageUrl = (emoji: string, pack = DEFAULT_EMOJI_PACK) =>
  `${EMOJI_FAMILY_BASE}/emojis/${encodeURIComponent(emoji)}/${encodeURIComponent(pack)}/png/128`;

const mapEmojiFamilyItem = (item: EmojiFamilyItem, pack = DEFAULT_EMOJI_PACK): ChatSticker | null => {
  const emoji = String(item?.emoji || "").trim();
  if (!emoji) {
    return null;
  }

  return {
    _id: `emoji-${encodeURIComponent(emoji)}-${pack}`,
    name: String(item?.annotation || item?.subgroup || "Emoji"),
    type: "emoji",
    imageUrl: buildEmojiImageUrl(emoji, pack),
    thumbnailUrl: buildEmojiImageUrl(emoji, pack),
    emoji,
    category: String(item?.group || "emoji"),
    tags: Array.isArray(item?.tags) ? item.tags : [],
    useCount: 0,
  };
};

/**
 * Fetch all active stickers from the app backend as a fallback source.
 */
export async function fetchStickersForChat(page = 1, limit = 50): Promise<ChatSticker[]> {
  try {
    const res = await API.get(`/stickers?page=${page}&limit=${limit}`);
    return normalizeStickerList(res.data);
  } catch (error) {
    console.log("fetchStickersForChat error:", error);
    return [];
  }
}

export async function fetchStickersByCategory(category: string): Promise<ChatSticker[]> {
  try {
    const res = await API.get(`/stickers/category/${encodeURIComponent(category)}`);
    return normalizeStickerList(res.data);
  } catch (error) {
    console.log("fetchStickersByCategory error:", error);
    return [];
  }
}

export async function searchStickers(query: string): Promise<ChatSticker[]> {
  try {
    const res = await API.get(`/stickers/search?q=${encodeURIComponent(query)}`);
    return normalizeStickerList(res.data);
  } catch (error) {
    console.log("searchStickers error:", error);
    return [];
  }
}

export async function fetchEmojiStickers(params: {
  limit?: number;
  category?: string;
  query?: string;
  pack?: string;
} = {}): Promise<ChatSticker[]> {
  const {
    limit = 140,
    category = "all",
    query = "",
    pack = DEFAULT_EMOJI_PACK,
  } = params;

  try {
    const searchParams = new URLSearchParams();
    const mappedGroup = EMOJI_GROUP_MAP[category] || "";

    if (mappedGroup) {
      searchParams.append("group", mappedGroup);
    }

    searchParams.append("includeVariations", "false");

    if (query.trim()) {
      searchParams.append("search", query.trim());
    }

    const querySuffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
    const payload = await fetchJson(`${EMOJI_FAMILY_BASE}/emojis${querySuffix}`);
    const items = normalizeArrayResponse(payload)
      .map((item) => mapEmojiFamilyItem(item as EmojiFamilyItem, pack))
      .filter(Boolean) as ChatSticker[];

    return items.slice(0, limit);
  } catch (error) {
    console.log("fetchEmojiStickers error:", error);

    try {
      const searchResults = query.trim() ? await searchStickers(query.trim()) : await fetchStickersForChat(1, limit);
      return searchResults.filter((item) => String(item?.type || "").toLowerCase() === "emoji" || !!item?.emoji);
    } catch {
      return [];
    }
  }
}

export async function fetchGifStickers(params: {
  limit?: number;
  category?: string;
  query?: string;
} = {}): Promise<ChatSticker[]> {
  const {
    limit = 60,
    category = "all",
    query = "",
  } = params;

  try {
    const endpoint = query.trim() || category !== "all" ? "search" : "trending";
    const searchParams = new URLSearchParams({
      api_key: GIPHY_API_KEY,
      limit: String(limit),
      rating: "g",
      bundle: "messaging_non_clips",
    });

    if (endpoint === "search") {
      searchParams.append("q", query.trim() || GIPHY_CATEGORY_MAP[category] || category);
      searchParams.append("lang", "en");
    }

    const payload = await fetchJson(`${GIPHY_API_BASE}/${endpoint}?${searchParams.toString()}`);
    const items = normalizeArrayResponse(payload)
      .map(mapGiphyItem)
      .filter(Boolean) as ChatSticker[];

    return items;
  } catch (error) {
    console.log("fetchGifStickers error:", error);

    try {
      const fallbackQuery = query.trim() || GIPHY_CATEGORY_MAP[category] || category;
      const searchResults = fallbackQuery && fallbackQuery !== "all"
        ? await searchStickers(fallbackQuery)
        : await fetchStickersForChat(1, limit);

      return searchResults.filter((item) => String(item?.type || "").toLowerCase() === "gif");
    } catch {
      return [];
    }
  }
}

export const emojiPackOptions = [
  { id: "fluent", label: "Fluent" },
  { id: "fluentflat", label: "Fluent Flat" },
  { id: "twemoji", label: "Twemoji" },
  { id: "openmoji", label: "OpenMoji" },
  { id: "blobmoji", label: "BlobMoji" },
  { id: "noto", label: "Noto" },
] as const;

export type EmojiPackId = typeof emojiPackOptions[number]["id"];

export default {
  fetchStickersForChat,
  fetchStickersByCategory,
  fetchEmojiStickers,
  fetchGifStickers,
  searchStickers,
  emojiPackOptions,
};
