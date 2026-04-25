import { GoogleSignin, type User } from "@react-native-google-signin/google-signin";
import * as Keychain from "react-native-keychain";
import { YOUTUBE_DATA_API_KEY } from "@env";

import { SelectedMusicClip } from "../features/social/types";

const YOUTUBE_READONLY_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
const YOUTUBE_DATA_API_BASE_URL = "https://www.googleapis.com/youtube/v3";
const YOUTUBE_TOKEN_SERVICE = "aline2.youtube.music.session";
const ACCESS_TOKEN_TTL_MS = 55 * 60 * 1000;
const ACCESS_TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;
const DEFAULT_TRACK_DURATION_SECONDS = 30;

export const YOUTUBE_MUSIC_WEB_CLIENT_ID =
  "698129700638-96n6dv6rp9sj1l1qeevs608pbioju3hd.apps.googleusercontent.com";

let isConfigured = false;

export type YouTubeMusicItem = SelectedMusicClip & {
  youtubeVideoId: string;
  channelTitle?: string;
};

export type YouTubeMusicProfile = {
  name: string;
  email: string;
  photo?: string | null;
};

type StoredYouTubeSession = {
  accessToken: string;
  expiresAt: number;
  profile: YouTubeMusicProfile;
};

type YouTubeConnection = StoredYouTubeSession;

const parseJson = <T,>(value: string | null | undefined): T | null => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const getStoredYouTubeSession = async (): Promise<StoredYouTubeSession | null> => {
  const credentials = await Keychain.getGenericPassword({ service: YOUTUBE_TOKEN_SERVICE });

  if (!credentials || !("password" in credentials) || !credentials.password) {
    return null;
  }

  return parseJson<StoredYouTubeSession>(credentials.password);
};

const setStoredYouTubeSession = async (session: StoredYouTubeSession) =>
  Keychain.setGenericPassword("aline2-youtube-music", JSON.stringify(session), {
    service: YOUTUBE_TOKEN_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });

const clearStoredYouTubeSession = async () => {
  await Keychain.resetGenericPassword({ service: YOUTUBE_TOKEN_SERVICE });
};

const isSessionFresh = (session: StoredYouTubeSession | null | undefined) =>
  !!session?.accessToken && Number(session.expiresAt || 0) > Date.now() + ACCESS_TOKEN_EXPIRY_BUFFER_MS;

const getProfileFromUser = (user: User): YouTubeMusicProfile => ({
  name: String(user.user?.name || "Google account"),
  email: String(user.user?.email || "").trim(),
  photo: user.user?.photo,
});

const configureYouTubeSignin = () => {
  if (isConfigured) {
    return;
  }

  GoogleSignin.configure({
    webClientId: YOUTUBE_MUSIC_WEB_CLIENT_ID,
    scopes: [YOUTUBE_READONLY_SCOPE],
    offlineAccess: true,
  });

  isConfigured = true;
};

const parseDurationSeconds = (value: string | undefined): number => {
  const raw = String(value || "").trim();

  if (!raw) {
    return 0;
  }

  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(raw);
  if (!match) {
    return 0;
  }

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);

  return hours * 3600 + minutes * 60 + seconds;
};

const normalizeYouTubeErrorMessage = (payload: any, fallback: string): string => {
  const message = String(payload?.error?.message || payload?.message || "").trim();
  if (!message) {
    return fallback;
  }

  if (/access blocked|not been used|disabled/i.test(message)) {
    return "YouTube Data API access is not available for this Google project yet.";
  }

  if (/login required|unauthenticated|invalid credentials/i.test(message)) {
    return "Your YouTube session expired. Connect again to continue.";
  }

  return message;
};

const ensureSignedInUser = async (interactive: boolean): Promise<User | null> => {
  configureYouTubeSignin();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  let currentUser = GoogleSignin.getCurrentUser();

  if (!currentUser) {
    try {
      const silentResponse = await GoogleSignin.signInSilently();
      if (silentResponse.type === "success") {
        currentUser = silentResponse.data;
      }
    } catch (error) {
      console.log("youtube sign-in restore failed:", error);
      currentUser = null;
    }
  }

  if (!currentUser && interactive) {
    let signInResponse;

    try {
      signInResponse = await GoogleSignin.signIn();
    } catch (error) {
      console.log("youtube sign-in launch failed:", error);
      throw error;
    }

    if (signInResponse.type !== "success") {
      throw new Error("YouTube sign-in was cancelled.");
    }
    currentUser = signInResponse.data;
  }

  if (!currentUser) {
    return null;
  }

  if (!currentUser.scopes?.includes(YOUTUBE_READONLY_SCOPE)) {
    const scopeResponse = await GoogleSignin.addScopes({
      scopes: [YOUTUBE_READONLY_SCOPE],
    });

    if (scopeResponse?.type === "cancelled") {
      throw new Error("YouTube permission was cancelled.");
    }

    currentUser =
      scopeResponse?.type === "success"
        ? scopeResponse.data
        : GoogleSignin.getCurrentUser();

    if (!currentUser) {
      throw new Error("Could not finish connecting YouTube.");
    }
  }

  return currentUser;
};

const createSessionFromUser = async (user: User, forceRefresh = false): Promise<YouTubeConnection> => {
  const storedSession = await getStoredYouTubeSession();

  if (forceRefresh && storedSession?.accessToken) {
    try {
      await GoogleSignin.clearCachedAccessToken(storedSession.accessToken);
    } catch {
      // Ignore stale token clear failures.
    }
  }

  const tokens = await GoogleSignin.getTokens();
  const accessToken = String(tokens?.accessToken || "").trim();

  if (!accessToken) {
    throw new Error("Could not fetch your Google access token.");
  }

  const session: StoredYouTubeSession = {
    accessToken,
    expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
    profile: getProfileFromUser(user),
  };

  await setStoredYouTubeSession(session);
  return session;
};

const ensureYouTubeConnection = async (
  interactive: boolean,
  forceRefresh = false,
): Promise<YouTubeConnection | null> => {
  configureYouTubeSignin();

  const storedSession = await getStoredYouTubeSession();
  if (!forceRefresh && isSessionFresh(storedSession)) {
    return storedSession || null;
  }

  const user = await ensureSignedInUser(interactive);
  if (!user) {
    return storedSession && storedSession.profile
      ? storedSession
      : null;
  }

  return createSessionFromUser(user, forceRefresh);
};

const mapVideoItemToTrack = (item: any): YouTubeMusicItem | null => {
  const videoId = String(item?.id?.videoId || item?.id || item?.snippet?.resourceId?.videoId || "").trim();
  const title = String(item?.snippet?.title || "").trim();
  const artist = String(item?.snippet?.channelTitle || "").trim();
  const artworkUrl =
    item?.snippet?.thumbnails?.high?.url
    || item?.snippet?.thumbnails?.medium?.url
    || item?.snippet?.thumbnails?.default?.url;
  const duration = Math.max(
    1,
    parseDurationSeconds(item?.contentDetails?.duration) || DEFAULT_TRACK_DURATION_SECONDS,
  );

  if (!videoId || !title) {
    return null;
  }

  return {
    id: `youtube:${videoId}`,
    externalId: videoId,
    youtubeVideoId: videoId,
    title,
    artist: artist || undefined,
    channelTitle: artist || undefined,
    artworkUrl: artworkUrl || undefined,
    externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    source: "youtube",
    duration,
    clipStartTime: 0,
    clipDuration: Math.min(20, duration || DEFAULT_TRACK_DURATION_SECONDS),
  };
};

const runYouTubeRequest = async (path: string) => {
  const apiKey = String(YOUTUBE_DATA_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("YouTube Data API key is missing. Add `YOUTUBE_DATA_API_KEY` to your .env.");
  }

  const requestUrl = new URL(`${YOUTUBE_DATA_API_BASE_URL}/${path}`);
  requestUrl.searchParams.set("key", apiKey);

  const response = await fetch(requestUrl.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (__DEV__) {
    console.log("[YouTube API]", path, {
      ok: response.ok,
      status: response.status,
      itemCount: Array.isArray(payload?.items) ? payload.items.length : 0,
    });
  }

  if (!response.ok) {
    throw new Error(normalizeYouTubeErrorMessage(payload, "YouTube request failed."));
  }

  return payload;
};

export const getYouTubeMusicConnection = async (): Promise<YouTubeMusicProfile | null> => {
  const session = await getStoredYouTubeSession();
  if (session?.profile) {
    return session.profile;
  }

  try {
    const restored = await ensureYouTubeConnection(false);
    return restored?.profile || null;
  } catch (error) {
    console.log("youtube session restore error:", error);
    return null;
  }
};

export const connectYouTubeMusic = async (): Promise<YouTubeMusicProfile> => {
  let connection: YouTubeConnection | null = null;

  try {
    connection = await ensureYouTubeConnection(true, true);
  } catch (error) {
    console.log("youtube connect error:", error);
    throw error;
  }

  if (!connection) {
    throw new Error("Connect to use music.");
  }

  return connection.profile;
};

export const disconnectYouTubeMusic = async () => {
  await clearStoredYouTubeSession();
  try {
    await GoogleSignin.clearCachedAccessToken((await getStoredYouTubeSession())?.accessToken || "");
  } catch {
    // Ignore cache cleanup failures.
  }
};

export const searchYouTubeMusic = async (query: string, limit = 10): Promise<YouTubeMusicItem[]> => {
  const trimmedQuery = String(query || "").trim();

  if (!trimmedQuery) {
    return [];
  }

  const buildSearchParams = (searchQuery: string) => new URLSearchParams({
    part: "snippet",
    q: searchQuery,
    type: "video",
    maxResults: String(Math.max(1, Math.min(limit, 15))),
  });

  const searchQueries = [trimmedQuery, `${trimmedQuery} music`];
  let searchItems: any[] = [];

  for (const searchQuery of searchQueries) {
    const searchPayload = await runYouTubeRequest(`search?${buildSearchParams(searchQuery).toString()}`);
    searchItems = Array.isArray(searchPayload?.items) ? searchPayload.items : [];
    if (searchItems.length) {
      break;
    }
  }

  const videoIds = searchItems
    .map((item: any) => String(item?.id?.videoId || "").trim())
    .filter(Boolean);

  if (!videoIds.length) {
    return getTrendingYouTubeMusic(limit);
  }

  const videoParams = new URLSearchParams({
    part: "contentDetails,snippet",
    id: videoIds.join(","),
    maxResults: String(videoIds.length),
  });

  const videoPayload = await runYouTubeRequest(`videos?${videoParams.toString()}`);
  const videoItems = Array.isArray(videoPayload?.items) ? videoPayload.items : [];
  const videoItemMap = new Map(
    videoItems.map((item: any) => [String(item?.id || "").trim(), item]),
  );

  const results = searchItems
    .map((item: any) => {
      const videoId = String(item?.id?.videoId || "").trim();
      return mapVideoItemToTrack(videoItemMap.get(videoId) || item);
    })
    .filter(Boolean) as YouTubeMusicItem[];

  if (results.length) {
    return results;
  }

  return videoItems
    .map(mapVideoItemToTrack)
    .filter(Boolean) as YouTubeMusicItem[];
};

export const getTrendingYouTubeMusic = async (limit = 10): Promise<YouTubeMusicItem[]> => {
  const params = new URLSearchParams({
    part: "contentDetails,snippet",
    chart: "mostPopular",
    videoCategoryId: "10",
    maxResults: String(Math.max(1, Math.min(limit, 15))),
  });

  const payload = await runYouTubeRequest(`videos?${params.toString()}`);
  const items = Array.isArray(payload?.items) ? payload.items : [];

  return items
    .map(mapVideoItemToTrack)
    .filter(Boolean) as YouTubeMusicItem[];
};
