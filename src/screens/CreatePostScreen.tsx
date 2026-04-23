import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  type DimensionValue,
  Image,
  KeyboardAvoidingView,
  PanResponder,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Alert } from "../utils/appAlert";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createSound } from "react-native-nitro-sound";
import Icon from "react-native-vector-icons/Ionicons";

import { API } from "../api/api";
import { getReadableApiErrorMessage, isModerationBlockedError } from "../api/networkErrors";
import {
  captureComposerAssets,
  ComposerAsset,
  createRemoteComposerAsset,
  pickComposerAssets,
  uploadComposerAssets,
} from "../features/social/mediaUpload";
import { socialApi } from "../features/social/socialApi";
import {
  CreatePostInput,
  CreateSwipeInput,
  CreateStoryInput,
  PostType,
  SelectedMusicClip,
  StoryFilterPreset,
  StoryStickerTextAlignment,
  StoryStickerPlacement,
  StoryTextStickerTheme,
  StoryType,
  Visibility,
} from "../features/social/types";
import { limits, parseCaptionEntities, toUserSafeMessage } from "../features/social/validation";
import {
  getTrendingMusicCatalog,
  importMusicCatalogItem,
  MusicCatalogItem,
  searchMusicCatalog,
  getUserOriginalSounds,
} from "../utils/musicApi";
import { PHOTO_FILTER_LIST } from "../utils/photoFilters";
import { showModerationBlockedSheet } from "../utils/moderationNotice";
import { getStoredUserId } from "../utils/authSession";
import { getAngleDeltaDegrees, getTouchMetrics, getTouchPoints } from "../features/social/stickerGestureUtils";
import { useAppTheme } from "../theme/AppThemeContext";
import SocialVideo from "../features/social/components/SocialVideo";
import {
  InstagramComposerHeader,
  InstagramComposerStepStrip,
  InstagramComposerTypeTabs,
} from "../features/social/components/create/InstagramComposerChrome";
import PhotoFilterStrip from "../components/media/PhotoFilterStrip";
import VideoTrimSheet from "../components/media/VideoTrimSheet";
import FaceOverlayPicker, { FaceSticker } from "../components/media/FaceOverlayPicker";
import StickerPickerSheet from "../components/chat/StickerPickerSheet";

let ColorMatrix: any = null;
try {
  ColorMatrix = require("react-native-color-matrix-image-filters").ColorMatrix;
} catch {
  ColorMatrix = null;
}

type ComposerTab = "post" | "story" | "swipe";
type ComposerStep = "select" | "edit" | "share";
type ComposerFramePreset = "square" | "portrait" | "landscape" | "vertical";
type StickerGestureState = {
  touchCount: number;
  startPosition: { x: number; y: number };
  startScale: number;
  startRotation: number;
  startCenter: { x: number; y: number } | null;
  startDistance: number;
  startAngle: number;
};

const tabs: ComposerTab[] = ["post", "story", "swipe"];
const composerSteps: ComposerStep[] = ["select", "edit", "share"];
const CREATE_DRAFT_STORAGE_KEY = "aline2:create-composer-draft";
const composerFramePresets: Record<
  ComposerFramePreset,
  {
    id: ComposerFramePreset;
    label: string;
    detail: string;
    aspectRatio: number;
  }
> = {
  square: {
    id: "square",
    label: "4:4",
    detail: "Classic",
    aspectRatio: 1,
  },
  portrait: {
    id: "portrait",
    label: "4:5",
    detail: "Portrait",
    aspectRatio: 4 / 5,
  },
  landscape: {
    id: "landscape",
    label: "16:9",
    detail: "Landscape",
    aspectRatio: 16 / 9,
  },
  vertical: {
    id: "vertical",
    label: "9:16",
    detail: "Full",
    aspectRatio: 9 / 16,
  },
};
const frameOptionsByTab: Record<ComposerTab, ComposerFramePreset[]> = {
  post: ["square", "portrait", "landscape"],
  story: ["vertical", "square", "landscape"],
  swipe: ["vertical", "portrait", "landscape"],
};
const composerBlueprints: Record<
  ComposerTab,
  {
    label: string;
    title: string;
    description: string;
    icon: string;
    gradient: string[];
    meta: string;
  }
> = {
  post: {
    label: "Post",
    title: "Post",
    description: "Clean post with crop, caption, and sharing controls.",
    icon: "grid-outline",
    gradient: ["#667eea", "#764ba2", "#f093fb"],
    meta: "1:1 canvas",
  },
  story: {
    label: "Story",
    title: "Story",
    description: "Quick vertical story with text, stickers, and music.",
    icon: "radio-button-on-outline",
    gradient: ["#ff7a18", "#af002d", "#319197"],
    meta: "9:16 canvas",
  },
  swipe: {
    label: "Swipe",
    title: "Swipe",
    description: "Short video with trim, sound, and share tools.",
    icon: "play-circle-outline",
    gradient: ["#00c6ff", "#7f00ff", "#ff4ecd"],
    meta: "Short video",
  },
};
const postModes: PostType[] = ["photo", "video", "carousel"];
const storyModes: StoryType[] = ["media", "text", "poll", "question"];
const MAX_CAROUSEL_ITEMS = 10;
const textStoryColors = ["#1f2937", "#7c3aed", "#db2777", "#0f766e", "#b45309", "#2563eb"];
const locationSeedOptions = ["Nearby", "Cafe", "Restaurant", "Studio", "Park", "Office"];
const storyStickerPlacements: StoryStickerPlacement[] = ["top_left", "top_right", "center", "bottom_left", "bottom_right"];
const storyTextStickerThemes: StoryTextStickerTheme[] = ["dark", "light", "accent", "outline"];
const storyTextStickerThemeLabels: Record<StoryTextStickerTheme, string> = {
  dark: "Dark",
  light: "Light",
  accent: "Accent",
  outline: "Outline",
};
const storyTextStickerAlignments: StoryStickerTextAlignment[] = ["left", "center", "right"];
const storyTextStickerAlignmentLabels: Record<StoryStickerTextAlignment, string> = {
  left: "Left",
  center: "Center",
  right: "Right",
};
const storyFilterPresets: StoryFilterPreset[] = ["none", "warm", "cool", "noir", "dream"];
const storyFilterPresetLabels: Record<StoryFilterPreset, string> = {
  none: "Original",
  warm: "Warm",
  cool: "Cool",
  noir: "Noir",
  dream: "Dream",
};
const storyStickerPlacementLabels: Record<StoryStickerPlacement, string> = {
  top_left: "Top Left",
  top_right: "Top Right",
  center: "Center",
  bottom_left: "Bottom Left",
  bottom_right: "Bottom Right",
};
const storyStickerPresetPositions: Record<StoryStickerPlacement, { x: number; y: number }> = {
  top_left: { x: 0.12, y: 0.18 },
  top_right: { x: 0.68, y: 0.18 },
  center: { x: 0.18, y: 0.44 },
  bottom_left: { x: 0.12, y: 0.72 },
  bottom_right: { x: 0.68, y: 0.72 },
};
const storyStickerDimensions = {
  text: { width: 0.64, height: 0.12 },
  emoji: { width: 0.16, height: 0.12 },
} as const;
const createStickerGestureState = (position: { x: number; y: number }): StickerGestureState => ({
  touchCount: 0,
  startPosition: position,
  startScale: 1,
  startRotation: 0,
  startCenter: null,
  startDistance: 0,
  startAngle: 0,
});
const clampStickerScale = (value: number): number => Math.min(2, Math.max(0.6, Math.round(value * 10) / 10));
const clampStickerRotation = (value: number): number => Math.min(180, Math.max(-180, Math.round(value)));
const clampNormalizedValue = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const getStoryFilterOverlayStyle = (
  preset: StoryFilterPreset,
  intensity = 1,
): { backgroundColor: string; opacity: number } | null => {
  const safeIntensity = Math.min(1, Math.max(0.2, intensity));
  switch (preset) {
    case "warm":
      return { backgroundColor: "#f59e0b", opacity: 0.18 * safeIntensity };
    case "cool":
      return { backgroundColor: "#38bdf8", opacity: 0.18 * safeIntensity };
    case "noir":
      return { backgroundColor: "#020617", opacity: 0.34 * safeIntensity };
    case "dream":
      return { backgroundColor: "#ec4899", opacity: 0.16 * safeIntensity };
    case "none":
    default:
      return null;
  }
};

const getStoryTextStickerThemeStyle = (
  theme: StoryTextStickerTheme,
): { color: string; backgroundColor: string } => {
  switch (theme) {
    case "light":
      return {
        color: "#0f172a",
        backgroundColor: "rgba(255,255,255,0.9)",
      };
    case "accent":
      return {
        color: "#ffffff",
        backgroundColor: "rgba(219,39,119,0.84)",
      };
    case "outline":
      return {
        color: "#ffffff",
        backgroundColor: "rgba(15,23,42,0.2)",
      };
    case "dark":
    default:
      return {
        color: "#ffffff",
        backgroundColor: "rgba(15,23,42,0.56)",
      };
  }
};

type AudienceCandidate = {
  id: string;
  username: string;
  name: string;
};

type LocationSuggestion = {
  name: string;
  count: number;
};

type MusicSelections = Record<ComposerTab, SelectedMusicClip | null>;
type MusicBrowseMode = "trending" | "original" | "search";

const splitTokens = (raw: string): string[] =>
  raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => token.replace(/^[@#]/, ""));

const appendCaptionEntities = (baseCaption: string, hashtags: string[], mentions: string[]): string => {
  const caption = baseCaption.trim();
  const existingHashtags = new Set((caption.match(/#([a-zA-Z0-9_.]{1,30})/g) || []).map((token) => token.slice(1).toLowerCase()));
  const existingMentions = new Set((caption.match(/@([a-zA-Z0-9_.]{1,30})/g) || []).map((token) => token.slice(1).toLowerCase()));

  const appendedHashtags = hashtags.filter((tag) => !existingHashtags.has(tag.toLowerCase())).map((tag) => `#${tag}`);
  const appendedMentions = mentions.filter((mention) => !existingMentions.has(mention.toLowerCase())).map((mention) => `@${mention}`);

  return [caption, ...appendedHashtags, ...appendedMentions].filter(Boolean).join(" ").trim();
};

const defaultClipDuration = (tab: ComposerTab, trackDuration: number): number => {
  const safeDuration = Math.max(1, Math.round(trackDuration || 0));

  if (tab === "story") {
    return Math.min(15, safeDuration);
  }

  if (tab === "swipe") {
    return Math.min(30, safeDuration);
  }

  return Math.min(20, safeDuration);
};

const formatDuration = (seconds: number | undefined): string => {
  const safe = Math.max(0, Math.round(Number(seconds || 0)));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const buildMusicLabel = (music: SelectedMusicClip | null | undefined): string =>
  [music?.title, music?.artist].filter(Boolean).join(" • ");

const isValidHttpUrl = (value: string): boolean => {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return true;
  }

  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const formatCoordinateLocation = (latitude: number, longitude: number): string =>
  `Current location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;

const reverseGeocodeLocation = async (latitude: number, longitude: number): Promise<string> => {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=16`,
    {
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error("Could not reverse geocode your location.");
  }

  const payload = await response.json();
  const address = payload?.address || {};
  const parts = [
    address?.suburb,
    address?.neighbourhood,
    address?.city || address?.town || address?.village,
    address?.state,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  return parts.length ? parts.slice(0, 3).join(", ") : formatCoordinateLocation(latitude, longitude);
};

function CreatePostScreen({ navigation, route }: any) {
  const { colors, isDarkMode } = useAppTheme();
  const initialTab = (route?.params?.initialTab as ComposerTab | undefined) || "post";
  const initialMedia = route?.params?.initialMedia as string | undefined;
  const initialMediaType = (route?.params?.initialMediaType as "image" | "video" | undefined) || "image";

  const [activeTab, setActiveTab] = useState<ComposerTab>(initialTab);
  const [activeStep, setActiveStep] = useState<ComposerStep>(initialMedia ? "edit" : "select");
  const [publishing, setPublishing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [pickingMedia, setPickingMedia] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [showStickerPickerSheet, setShowStickerPickerSheet] = useState(false);
  const [framePresetByTab, setFramePresetByTab] = useState<Record<ComposerTab, ComposerFramePreset>>({
    post: "square",
    story: "vertical",
    swipe: "vertical",
  });

  const [postType, setPostType] = useState<PostType>("photo");
  const [storyType, setStoryType] = useState<StoryType>("media");

  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationFetchTarget, setLocationFetchTarget] = useState<ComposerTab | null>(null);
  const [activeAssetIndex, setActiveAssetIndex] = useState(0);
  const [taggableFriends, setTaggableFriends] = useState<AudienceCandidate[]>([]);
  const [taggableFriendsLoading, setTaggableFriendsLoading] = useState(false);

  const [hashtagsRaw, setHashtagsRaw] = useState("");
  const [mentionsRaw, setMentionsRaw] = useState("");

  const [disableComments, setDisableComments] = useState(false);
  const [sharePostToStory, setSharePostToStory] = useState(false);
  const [hideLikeCount, setHideLikeCount] = useState(false);

  const [selectedAssets, setSelectedAssets] = useState<ComposerAsset[]>(
    initialMedia ? [createRemoteComposerAsset(initialMedia, initialMediaType)] : [],
  );

  const [storyCaption, setStoryCaption] = useState("");
  const [storyBackgroundColor, setStoryBackgroundColor] = useState("#1f2937");
  const [storyFilterPreset, setStoryFilterPreset] = useState<StoryFilterPreset>("none");
  const [storyFilterIntensity, setStoryFilterIntensity] = useState(1);

  // Photo filter / video trim / face overlay state
  const [selectedPhotoFilter, setSelectedPhotoFilter] = useState("none");
  const [showVideoTrim, setShowVideoTrim] = useState(false);
  const [showFaceOverlay, setShowFaceOverlay] = useState(false);
  const [storyLinkUrl, setStoryLinkUrl] = useState("");
  const [storyLocation, setStoryLocation] = useState("");
  const [storyLocationSuggestions, setStoryLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [storyLocationLoading, setStoryLocationLoading] = useState(false);
  const [storyHashtagsRaw, setStoryHashtagsRaw] = useState("");
  const [storyMentionsRaw, setStoryMentionsRaw] = useState("");
  const [storyStickerText, setStoryStickerText] = useState("");
  const [storyStickerTextPlacement, setStoryStickerTextPlacement] = useState<StoryStickerPlacement>("bottom_left");
  const [storyStickerTextPosition, setStoryStickerTextPosition] = useState<{ x: number; y: number } | null>(
    storyStickerPresetPositions.bottom_left,
  );
  const [storyStickerTextScale, setStoryStickerTextScale] = useState(1);
  const [storyStickerTextRotation, setStoryStickerTextRotation] = useState(0);
  const [storyStickerTextTheme, setStoryStickerTextTheme] = useState<StoryTextStickerTheme>("dark");
  const [storyStickerTextAlignment, setStoryStickerTextAlignment] = useState<StoryStickerTextAlignment>("center");
  const [storyStickerEmoji, setStoryStickerEmoji] = useState("");
  const [storyStickerEmojiPlacement, setStoryStickerEmojiPlacement] = useState<StoryStickerPlacement>("top_right");
  const [storyStickerEmojiPosition, setStoryStickerEmojiPosition] = useState<{ x: number; y: number } | null>(
    storyStickerPresetPositions.top_right,
  );
  const [storyStickerEmojiScale, setStoryStickerEmojiScale] = useState(1);
  const [storyStickerEmojiRotation, setStoryStickerEmojiRotation] = useState(0);
  const [storyFaceStickers, setStoryFaceStickers] = useState<FaceSticker[]>([]);
  const [storyPreviewSize, setStoryPreviewSize] = useState({ width: 0, height: 0 });
  const [storyVisibility, setStoryVisibility] = useState<Visibility>("public");
  const [storyVisibleToUserIds, setStoryVisibleToUserIds] = useState<string[]>([]);
  const [storyAudienceCandidates, setStoryAudienceCandidates] = useState<AudienceCandidate[]>([]);
  const [storyAudienceLoading, setStoryAudienceLoading] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptionA, setPollOptionA] = useState("Yes");
  const [pollOptionB, setPollOptionB] = useState("No");
  const [questionPrompt, setQuestionPrompt] = useState("");
  const [storyAllowReplies, setStoryAllowReplies] = useState(true);
  const [storyAllowSharing, setStoryAllowSharing] = useState(true);
  const [musicSelections, setMusicSelections] = useState<MusicSelections>({
    post: null,
    story: null,
    swipe: null,
  });
  const [musicQuery, setMusicQuery] = useState("");
  const [musicResults, setMusicResults] = useState<MusicCatalogItem[]>([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicImportingId, setMusicImportingId] = useState("");
  const [musicError, setMusicError] = useState("");
  const [musicBrowseMode, setMusicBrowseMode] = useState<MusicBrowseMode>("trending");
  const [musicPreviewLoadingId, setMusicPreviewLoadingId] = useState("");
  const [musicPreviewPlayingId, setMusicPreviewPlayingId] = useState("");
  const [musicPreviewPositionMs, setMusicPreviewPositionMs] = useState(0);
  const [musicPreviewDurationMs, setMusicPreviewDurationMs] = useState(0);

  const composerBackground = colors.background;
  const surfaceColor = colors.card;
  const elevatedSurfaceColor = colors.card;
  const subtleSurfaceColor = colors.surface;
  const composerBorderColor = colors.border;
  const composerMutedText = colors.mutedText;
  const composerAccent = colors.primary || "#E1306C";
  const composerText = colors.text;
  const inputStyle = { borderColor: composerBorderColor, backgroundColor: surfaceColor, color: composerText };
  const helperTextStyle = { color: composerMutedText };
  const controlBorderStyle = { borderColor: composerBorderColor };
  const activePillStyle = { backgroundColor: composerAccent, borderColor: composerAccent };
  const textStickerGestureRef = useRef<StickerGestureState>(createStickerGestureState(storyStickerPresetPositions.bottom_left));
  const emojiStickerGestureRef = useRef<StickerGestureState>(createStickerGestureState(storyStickerPresetPositions.top_right));
  const musicPreviewPlayerRef = useRef(createSound());
  const activeFramePreset = framePresetByTab[activeTab];
  const activeFrameConfig = composerFramePresets[activeFramePreset];
  const hasSelectedCanvasMedia = selectedAssets.length > 0 || (activeTab === "story" && storyType === "text");
  const headerTitle = activeTab === "swipe" ? "New Swipe" : activeTab === "story" ? "New Story" : "New Post";
  const headerPrimaryLabel = activeStep === "share" ? "Share" : "Next";

  const stopMusicPreview = useCallback(async () => {
    const player = musicPreviewPlayerRef.current;

    try {
      player.removePlayBackListener();
    } catch {
      // noop
    }

    try {
      player.removePlaybackEndListener();
    } catch {
      // noop
    }

    try {
      await player.stopPlayer();
    } catch {
      // noop
    } finally {
      setMusicPreviewLoadingId("");
      setMusicPreviewPlayingId("");
      setMusicPreviewPositionMs(0);
      setMusicPreviewDurationMs(0);
    }
  }, []);

  const startMusicPreview = useCallback(
    async (item: MusicCatalogItem) => {
      const previewUrl = String(item.previewUrl || "").trim();

      if (!previewUrl) {
        throw new Error("Preview is not available for this track yet.");
      }

      await stopMusicPreview();

      const player = musicPreviewPlayerRef.current;
      player.setSubscriptionDuration(0.1);
      player.addPlayBackListener((event: any) => {
        setMusicPreviewPositionMs(Math.max(0, Number(event?.currentPosition || 0)));
        setMusicPreviewDurationMs((currentDuration) => {
          const reportedDuration = Math.max(0, Number(event?.duration || 0));
          return reportedDuration || currentDuration;
        });
      });
      player.addPlaybackEndListener(() => {
        setMusicPreviewLoadingId("");
        setMusicPreviewPlayingId("");
        setMusicPreviewPositionMs(0);
        setMusicPreviewDurationMs(0);
      });

      setMusicPreviewLoadingId(item.id);
      setMusicPreviewDurationMs(Math.max(0, Number(item.duration || 0) * 1000));

      try {
        await player.startPlayer(previewUrl);
        setMusicPreviewPlayingId(item.id);
      } finally {
        setMusicPreviewLoadingId("");
      }
    },
    [stopMusicPreview],
  );

  const toggleMusicPreview = useCallback(
    async (item: MusicCatalogItem) => {
      try {
        if (musicPreviewPlayingId === item.id) {
          await stopMusicPreview();
          return;
        }

        await startMusicPreview(item);
      } catch (error) {
        setMusicError(toUserSafeMessage(error));
      }
    },
    [musicPreviewPlayingId, startMusicPreview, stopMusicPreview],
  );

  useEffect(() => () => {
    stopMusicPreview().catch(() => undefined);
    musicPreviewPlayerRef.current.dispose();
  }, [stopMusicPreview]);

  useEffect(() => {
    const routeTab = route?.params?.initialTab as ComposerTab | undefined;
    const routeMedia = route?.params?.initialMedia as string | undefined;
    const routeMediaTypeParam = route?.params?.initialMediaType as "image" | "video" | undefined;
    const routeMediaType = routeMediaTypeParam || "image";

    if (!routeTab && !routeMedia && !routeMediaTypeParam) {
      return;
    }

    if (routeTab) {
      setActiveTab(routeTab);
    }

    if (routeMedia) {
      setSelectedAssets([createRemoteComposerAsset(routeMedia, routeMediaType)]);
      setActiveStep("edit");
    }

    navigation.setParams({
      initialTab: undefined,
      initialMedia: undefined,
      initialMediaType: undefined,
    });
  }, [navigation, route?.params]);

  const fetchLocationSuggestions = useCallback(async (query: string): Promise<LocationSuggestion[]> => {
    const trimmedQuery = String(query || "").trim();

    if (trimmedQuery.length < 2) {
      return [];
    }

    const response = await API.get(`/search?type=locations&query=${encodeURIComponent(trimmedQuery)}`);
    const results = Array.isArray(response?.data?.results?.locations) ? response.data.results.locations : [];

    return results
      .map((entry: any) => ({
        name: String(entry?.name || "").trim(),
        count: Math.max(0, Number(entry?.count || 0)),
      }))
      .filter((entry: LocationSuggestion) => !!entry.name)
      .slice(0, 6);
  }, []);

  const requestCurrentLocationPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== "android") {
      return true;
    }

    const permission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: "Use your current location",
      message: "Allow Aline2 to fetch your current location for posts, stories, and swipes.",
        buttonPositive: "Allow",
        buttonNegative: "Not now",
      },
    );

    return permission === PermissionsAndroid.RESULTS.GRANTED;
  }, []);

  const applyCurrentLocation = useCallback(
    async (target: ComposerTab) => {
      try {
        setLocationFetchTarget(target);

        const hasPermission = await requestCurrentLocationPermission();
        if (!hasPermission) {
          throw new Error("Location permission was denied.");
        }

        const geolocation = (globalThis as any)?.navigator?.geolocation;
        if (!geolocation?.getCurrentPosition) {
          throw new Error("Current location is not available on this device build yet.");
        }

        const position = await new Promise<{ coords: { latitude: number; longitude: number } }>((resolve, reject) => {
          geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 30000,
          });
        });

        const latitude = Number(position?.coords?.latitude);
        const longitude = Number(position?.coords?.longitude);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          throw new Error("We could not read your current coordinates.");
        }

        let nextLabel = formatCoordinateLocation(latitude, longitude);
        try {
          nextLabel = await reverseGeocodeLocation(latitude, longitude);
        } catch {
          // Keep coordinate fallback if reverse geocoding fails.
        }

        if (target === "story") {
          setStoryLocation(nextLabel);
          setStoryLocationSuggestions([
            {
              name: nextLabel,
              count: 0,
            },
          ]);
          return;
        }

        setLocation(nextLabel);
        setLocationSuggestions([
          {
            name: nextLabel,
            count: 0,
          },
        ]);
      } catch (error) {
        Alert.alert("Location unavailable", toUserSafeMessage(error));
      } finally {
        setLocationFetchTarget(null);
      }
    },
    [requestCurrentLocationPermission],
  );

  useEffect(() => {
    setLocationLoading(false);
  }, [location]);

  useEffect(() => {
    setStoryLocationLoading(false);
  }, [storyLocation]);

  useEffect(() => {
    setActiveAssetIndex((current) => Math.min(current, Math.max(0, selectedAssets.length - 1)));
  }, [selectedAssets.length]);

  useEffect(() => {
    let mounted = true;

    const loadTaggableFriends = async () => {
      if (taggableFriends.length || taggableFriendsLoading) {
        return;
      }

      try {
        setTaggableFriendsLoading(true);
        const res = await API.get("/auth/users");
        const users = Array.isArray(res?.data?.users) ? res.data.users : [];

        if (!mounted) {
          return;
        }

        setTaggableFriends(
          users
            .map((user: any) => ({
              id: String(user?._id || user?.id || ""),
              username: String(user?.username || ""),
              name: String(user?.name || user?.username || "User"),
            }))
            .filter((user: AudienceCandidate) => !!user.id && !!user.username),
        );
      } catch (error) {
        if (mounted) {
          console.log("taggable friends error:", error);
        }
      } finally {
        if (mounted) {
          setTaggableFriendsLoading(false);
        }
      }
    };

    loadTaggableFriends();

    return () => {
      mounted = false;
    };
  }, [taggableFriends.length, taggableFriendsLoading]);

  const primaryAsset = useMemo(() => selectedAssets[activeAssetIndex] || selectedAssets[0] || null, [activeAssetIndex, selectedAssets]);

  const getStickerPosition = useCallback(
    (type: "text" | "emoji") =>
      type === "text"
        ? storyStickerTextPosition || storyStickerPresetPositions[storyStickerTextPlacement]
        : storyStickerEmojiPosition || storyStickerPresetPositions[storyStickerEmojiPlacement],
    [storyStickerEmojiPlacement, storyStickerEmojiPosition, storyStickerTextPlacement, storyStickerTextPosition],
  );

  const clampStickerPosition = useCallback((type: "text" | "emoji", x: number, y: number) => {
    const bounds = storyStickerDimensions[type];
    return {
      x: Math.min(Math.max(0, x), 1 - bounds.width),
      y: Math.min(Math.max(0, y), 1 - bounds.height),
    };
  }, []);

  const updateStickerPosition = useCallback((type: "text" | "emoji", position: { x: number; y: number }) => {
    const clamped = clampStickerPosition(type, position.x, position.y);
    if (type === "text") {
      setStoryStickerTextPosition(clamped);
      return;
    }
    setStoryStickerEmojiPosition(clamped);
  }, [clampStickerPosition]);

  const getStickerScale = useCallback(
    (type: "text" | "emoji") => (type === "text" ? storyStickerTextScale : storyStickerEmojiScale),
    [storyStickerEmojiScale, storyStickerTextScale],
  );

  const getStickerRotation = useCallback(
    (type: "text" | "emoji") => (type === "text" ? storyStickerTextRotation : storyStickerEmojiRotation),
    [storyStickerEmojiRotation, storyStickerTextRotation],
  );

  const updateStickerScale = useCallback((type: "text" | "emoji", value: number) => {
    const clampedValue = clampStickerScale(value);

    if (type === "text") {
      setStoryStickerTextScale(clampedValue);
      return;
    }

    setStoryStickerEmojiScale(clampedValue);
  }, []);

  const updateStickerRotation = useCallback((type: "text" | "emoji", value: number) => {
    const clampedValue = clampStickerRotation(value);

    if (type === "text") {
      setStoryStickerTextRotation(clampedValue);
      return;
    }

    setStoryStickerEmojiRotation(clampedValue);
  }, []);

  const syncStickerGestureBaseline = useCallback(
    (type: "text" | "emoji", touches: Array<{ pageX: number; pageY: number }>) => {
      const metrics = getTouchMetrics(touches);

      if (!metrics) {
        return;
      }

      const gestureState = type === "text" ? textStickerGestureRef.current : emojiStickerGestureRef.current;
      gestureState.touchCount = touches.length;
      gestureState.startPosition = getStickerPosition(type);
      gestureState.startScale = getStickerScale(type);
      gestureState.startRotation = getStickerRotation(type);
      gestureState.startCenter = {
        x: metrics.centerX,
        y: metrics.centerY,
      };
      gestureState.startDistance = metrics.distance;
      gestureState.startAngle = metrics.angle;
    },
    [getStickerPosition, getStickerRotation, getStickerScale],
  );

  const handleStickerGestureMove = useCallback(
    (type: "text" | "emoji", touches: Array<{ pageX: number; pageY: number }>) => {
      if (!storyPreviewSize.width || !storyPreviewSize.height || !touches.length) {
        return;
      }

      const gestureState = type === "text" ? textStickerGestureRef.current : emojiStickerGestureRef.current;

      if (!gestureState.startCenter || gestureState.touchCount !== touches.length) {
        syncStickerGestureBaseline(type, touches);
      }

      const metrics = getTouchMetrics(touches);

      if (!metrics || !gestureState.startCenter) {
        return;
      }

      updateStickerPosition(type, {
        x: gestureState.startPosition.x + (metrics.centerX - gestureState.startCenter.x) / storyPreviewSize.width,
        y: gestureState.startPosition.y + (metrics.centerY - gestureState.startCenter.y) / storyPreviewSize.height,
      });

      if (touches.length >= 2 && gestureState.startDistance > 0) {
        updateStickerScale(type, gestureState.startScale * (metrics.distance / gestureState.startDistance));
        updateStickerRotation(type, gestureState.startRotation + getAngleDeltaDegrees(gestureState.startAngle, metrics.angle));
      }
    },
    [storyPreviewSize.height, storyPreviewSize.width, syncStickerGestureBaseline, updateStickerPosition, updateStickerRotation, updateStickerScale],
  );

  const resetStickerGesture = useCallback((type: "text" | "emoji") => {
    const gestureState = type === "text" ? textStickerGestureRef.current : emojiStickerGestureRef.current;
    gestureState.touchCount = 0;
    gestureState.startCenter = null;
    gestureState.startDistance = 0;
  }, []);

  const handleStoryPreviewLayout = (width: number, height: number) => {
    if (width > 0 && height > 0) {
      setStoryPreviewSize({ width, height });
    }
  };

  const textStickerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!storyStickerText.trim(),
        onMoveShouldSetPanResponder: () => !!storyStickerText.trim(),
        onPanResponderGrant: (event) => {
          syncStickerGestureBaseline("text", getTouchPoints(event?.nativeEvent?.touches));
        },
        onPanResponderMove: (event) => {
          handleStickerGestureMove("text", getTouchPoints(event?.nativeEvent?.touches));
        },
        onPanResponderRelease: () => resetStickerGesture("text"),
        onPanResponderTerminate: () => resetStickerGesture("text"),
      }),
    [handleStickerGestureMove, resetStickerGesture, storyStickerText, syncStickerGestureBaseline],
  );

  const emojiStickerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!storyStickerEmoji.trim(),
        onMoveShouldSetPanResponder: () => !!storyStickerEmoji.trim(),
        onPanResponderGrant: (event) => {
          syncStickerGestureBaseline("emoji", getTouchPoints(event?.nativeEvent?.touches));
        },
        onPanResponderMove: (event) => {
          handleStickerGestureMove("emoji", getTouchPoints(event?.nativeEvent?.touches));
        },
        onPanResponderRelease: () => resetStickerGesture("emoji"),
        onPanResponderTerminate: () => resetStickerGesture("emoji"),
      }),
    [handleStickerGestureMove, resetStickerGesture, storyStickerEmoji, syncStickerGestureBaseline],
  );

  useEffect(() => {
    if (activeTab !== "story" || storyVisibility !== "custom" || storyAudienceCandidates.length || storyAudienceLoading) {
      return;
    }

    let mounted = true;

    const loadStoryAudience = async () => {
      try {
        setStoryAudienceLoading(true);
        const res = await API.get("/auth/users");
        const users = Array.isArray(res?.data?.users) ? res.data.users : [];

        if (!mounted) {
          return;
        }

        setStoryAudienceCandidates(
          users.map((user: any) => ({
            id: String(user?._id || user?.id || ""),
            username: String(user?.username || ""),
            name: String(user?.name || user?.username || "User"),
          })).filter((user: AudienceCandidate) => !!user.id),
        );
      } catch (error) {
        if (mounted) {
          Alert.alert("Could not load audience", toUserSafeMessage(error));
        }
      } finally {
        if (mounted) {
          setStoryAudienceLoading(false);
        }
      }
    };

    loadStoryAudience();

    return () => {
      mounted = false;
    };
  }, [activeTab, storyAudienceCandidates.length, storyAudienceLoading, storyVisibility]);

  useEffect(() => {
    let mounted = true;

    const loadTrending = async () => {
      if (musicResults.length || musicLoading) {
        return;
      }

      try {
        setMusicLoading(true);
        setMusicError("");
        const tracks = await getTrendingMusicCatalog(8);
        if (mounted) {
          setMusicResults(tracks);
        }
      } catch (error) {
        if (mounted) {
          setMusicError(toUserSafeMessage(error));
        }
      } finally {
        if (mounted) {
          setMusicLoading(false);
        }
      }
    };

    loadTrending();

    return () => {
      mounted = false;
    };
  }, [musicLoading, musicResults.length]);

  const resetAssetsForTab = (tab: ComposerTab) => {
    if (tab === "story" && initialMedia) {
      setSelectedAssets([createRemoteComposerAsset(initialMedia, initialMediaType)]);
      return;
    }

    setSelectedAssets([]);
  };

  const onSelectTab = (tab: ComposerTab) => {
    startTransition(() => {
      setActiveTab(tab);
      setActiveStep("select");
      resetAssetsForTab(tab);
      setPublishError("");
    });
  };

  const moveToStep = (step: ComposerStep) => {
    if ((step === "edit" || step === "share") && !hasSelectedCanvasMedia) {
      Alert.alert(
        "Add media first",
        activeTab === "story" && storyType === "text"
          ? "Choose a story mode or add media before moving ahead."
        : `Pick ${activeTab === "swipe" ? "a swipe video" : "photo or video"} first so the next screen has something to preview.`,
      );
      return;
    }

    startTransition(() => {
      setActiveStep(step);
    });
  };

  const handleBackPress = () => {
    const currentStepIndex = composerSteps.indexOf(activeStep);

    if (currentStepIndex > 0) {
      moveToStep(composerSteps[currentStepIndex - 1]);
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate(activeTab === "swipe" ? "Swipes" : "Feed");
  };

  const handlePrimaryHeaderAction = () => {
    if (activeStep === "share") {
      publish().catch(() => undefined);
      return;
    }

    const currentStepIndex = composerSteps.indexOf(activeStep);
    const nextStep = composerSteps[Math.min(composerSteps.length - 1, currentStepIndex + 1)];
    moveToStep(nextStep);
  };

  const openLiveComposer = useCallback(() => {
    navigation.navigate("LiveStreamsScreen", { focusMode: "host" });
  }, [navigation]);

  const setFramePresetForTab = (tab: ComposerTab, preset: ComposerFramePreset) => {
    setFramePresetByTab((prev) => ({
      ...prev,
      [tab]: preset,
    }));
  };

  const cycleActiveFramePreset = () => {
    const options = frameOptionsByTab[activeTab];
    const currentIndex = options.indexOf(activeFramePreset);
    const nextPreset = options[(currentIndex + 1) % options.length];
    setFramePresetForTab(activeTab, nextPreset);
  };

  const addStoryStickerFromPicker = (sticker: any) => {
    const emoji = String(sticker?.emoji || "").trim() || "✨";

    setStoryFaceStickers((prev) => {
      const placementIndex = prev.length;
      const nextSticker: FaceSticker = {
        id: String(sticker?._id || sticker?.id || `story_sticker_${Date.now()}`),
        name: String(sticker?.name || "Sticker"),
        emoji,
        placementId: Date.now(),
        position: {
          x: clampNormalizedValue(0.18 + (placementIndex % 3) * 0.18, 0.08, 0.74),
          y: clampNormalizedValue(0.18 + Math.floor(placementIndex / 3) * 0.12, 0.08, 0.74),
        },
        scale: 1,
        rotation: 0,
      };

      return [...prev, nextSticker].slice(0, 8);
    });
    setShowStickerPickerSheet(false);
  };

  const setMusicForTab = (tab: ComposerTab, selection: SelectedMusicClip | null) => {
    setMusicSelections((prev) => ({
      ...prev,
      [tab]: selection,
    }));
  };

  const loadTrendingMusic = async () => {
    try {
      setMusicBrowseMode("trending");
      setMusicLoading(true);
      setMusicError("");
      setMusicResults(await getTrendingMusicCatalog(8));
    } catch (error) {
      setMusicError(toUserSafeMessage(error));
    } finally {
      setMusicLoading(false);
    }
  };

  const loadOriginalSounds = async () => {
    try {
      setMusicBrowseMode("original");
      setMusicLoading(true);
      setMusicError("");
      const userId = await getStoredUserId();

      if (!userId) {
        throw new Error("Log in again to load your original sounds.");
      }

      const originals = await getUserOriginalSounds(userId, 12);
      setMusicResults(originals);
    } catch (error) {
      setMusicError(toUserSafeMessage(error));
    } finally {
      setMusicLoading(false);
    }
  };

  const runMusicSearch = async () => {
    const query = musicQuery.trim();

    if (!query) {
      await loadTrendingMusic();
      return;
    }

    try {
      setMusicBrowseMode("search");
      setMusicLoading(true);
      setMusicError("");
      setMusicResults(await searchMusicCatalog(query, 12));
    } catch (error) {
      setMusicError(toUserSafeMessage(error));
    } finally {
      setMusicLoading(false);
    }
  };

  const attachMusic = async (item: MusicCatalogItem) => {
    try {
      setMusicImportingId(item.id);
      setMusicError("");
      const imported = await importMusicCatalogItem({
        ...item,
        clipStartTime: 0,
        clipDuration: defaultClipDuration(activeTab, item.duration),
      });
      setMusicForTab(activeTab, imported);
    } catch (error) {
      setMusicError(toUserSafeMessage(error));
    } finally {
      setMusicImportingId("");
    }
  };

  const updateSelectedMusic = (updater: (current: SelectedMusicClip) => SelectedMusicClip) => {
    const current = musicSelections[activeTab];
    if (!current) {
      return;
    }

    setMusicForTab(activeTab, updater(current));
  };

  const setSelectedMusicClipDuration = (nextDuration: number) => {
    updateSelectedMusic((current) => {
      const maxDuration = Math.max(1, current.duration - (current.clipStartTime || 0));
      return {
        ...current,
        clipDuration: Math.max(1, Math.min(nextDuration, maxDuration)),
      };
    });
  };

  const nudgeSelectedMusicStart = (delta: number) => {
    updateSelectedMusic((current) => {
      const maxStart = Math.max(0, current.duration - 1);
      const nextStart = Math.max(0, Math.min(maxStart, (current.clipStartTime || 0) + delta));
      const maxDuration = Math.max(1, current.duration - nextStart);
      return {
        ...current,
        clipStartTime: nextStart,
        clipDuration: Math.max(1, Math.min(current.clipDuration || current.duration, maxDuration)),
      };
    });
  };

  const onPickMedia = async () => {
    if (pickingMedia) {
      return;
    }

    const pickerMediaType =
      activeTab === "story"
        ? "mixed"
        : activeTab === "swipe" || postType === "video"
          ? "video"
          : "photo";
    const selectionLimit = activeTab === "post" && postType === "carousel" ? MAX_CAROUSEL_ITEMS : 1;

    try {
      setPickingMedia(true);
      const pickedAssets = await pickComposerAssets({
        mediaType: pickerMediaType,
        selectionLimit,
        quality: 0.9,
        presentationStyle: "fullScreen",
      });

      if (!pickedAssets.length) {
        return;
      }

      if (activeTab === "post" && postType === "carousel") {
        setSelectedAssets(pickedAssets.slice(0, MAX_CAROUSEL_ITEMS));
        setActiveAssetIndex(0);
        return;
      }

      setSelectedAssets([pickedAssets[0]]);
      setActiveAssetIndex(0);
    } catch (error) {
      Alert.alert("Could not pick media", toUserSafeMessage(error));
    } finally {
      setPickingMedia(false);
    }
  };

  const onCaptureMedia = async () => {
    if (pickingMedia) {
      return;
    }

    const captureMediaType =
      activeTab === "story"
        ? "mixed"
        : activeTab === "swipe" || postType === "video"
          ? "video"
          : "photo";

    try {
      setPickingMedia(true);
      const capturedAssets = await captureComposerAssets({
        mediaType: captureMediaType,
        quality: 0.9,
        saveToPhotos: false,
        videoQuality: "high",
        durationLimit: activeTab === "swipe" ? 60 : undefined,
      });

      if (!capturedAssets.length) {
        return;
      }

      setSelectedAssets([capturedAssets[0]]);
      setActiveAssetIndex(0);
    } catch (error) {
      Alert.alert("Could not open camera", toUserSafeMessage(error));
    } finally {
      setPickingMedia(false);
    }
  };

  const removeAsset = (assetId: string) => {
    setSelectedAssets((prev) => prev.filter((asset) => asset.id !== assetId));
  };

  const toggleStoryAudienceUser = (userId: string) => {
    setStoryVisibleToUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const toggleMentionFriend = (target: "post" | "story" | "swipe", username: string) => {
    const readRaw = target === "story" ? storyMentionsRaw : mentionsRaw;
    const writeRaw = target === "story" ? setStoryMentionsRaw : setMentionsRaw;
    const currentMentions = splitTokens(readRaw);
    const normalizedUsername = String(username || "").replace(/^@/, "").trim();

    if (!normalizedUsername) {
      return;
    }

    const nextMentions = currentMentions.includes(normalizedUsername)
      ? currentMentions.filter((item) => item !== normalizedUsername)
      : [...currentMentions, normalizedUsername];

    writeRaw(nextMentions.join(", "));
  };

  const requestLocationSuggestions = async (target: "post" | "story" | "swipe", query: string) => {
    const results = await fetchLocationSuggestions(query);

    if (target === "story") {
      setStoryLocationSuggestions(results);
      return;
    }

    setLocationSuggestions(results);
  };

  const requireAssets = (message: string): ComposerAsset[] => {
    if (!selectedAssets.length) {
      throw new Error(message);
    }

    return selectedAssets;
  };

  const preparePostPayload = async (): Promise<CreatePostInput> => {
    const enteredHashtags = splitTokens(hashtagsRaw);
    const enteredMentions = splitTokens(mentionsRaw);
    const captionEntities = parseCaptionEntities(caption);
    const hashtags = Array.from(new Set([...enteredHashtags, ...captionEntities.hashtags]));
    const mentions = Array.from(new Set([...enteredMentions, ...captionEntities.mentions]));
    const assets = requireAssets("Choose media before publishing this post.");

    if (postType === "carousel" && assets.some((asset) => asset.mediaType !== "image")) {
      throw new Error("Carousel posts support images only.");
    }

    if (postType === "photo" && assets[0]?.mediaType !== "image") {
      throw new Error("Photo posts require an image.");
    }

    if (postType === "video" && assets[0]?.mediaType !== "video") {
      throw new Error("Video posts require a video file.");
    }

    const media = await uploadComposerAssets(postType === "carousel" ? assets : [assets[0]]);

    return {
      type: postType,
      caption: appendCaptionEntities(caption, hashtags, mentions),
      media,
      location,
      music: musicSelections.post || undefined,
      hashtags,
      mentions,
      collaboratorIds: [],
      settings: {
        disableComments,
        hideLikeCount,
        allowRemix: false,
      },
      filterPreset: selectedPhotoFilter !== "none" ? selectedPhotoFilter : undefined,
      stickers: [
        storyStickerText.trim()
          ? {
              id: "post_text_sticker",
              type: "text" as const,
              text: storyStickerText.trim(),
              position: {
                ...getStickerPosition("text"),
                width: storyStickerDimensions.text.width,
                height: storyStickerDimensions.text.height,
                rotation: storyStickerTextRotation,
                scale: storyStickerTextScale,
              },
              style: {
                ...getStoryTextStickerThemeStyle(storyStickerTextTheme),
                alignment: storyStickerTextAlignment,
                fontSize: Math.round(18 * storyStickerTextScale),
              },
            }
          : null,
        storyStickerEmoji.trim()
          ? {
              id: "post_emoji_sticker",
              type: "emoji" as const,
              text: storyStickerEmoji.trim(),
              position: {
                ...getStickerPosition("emoji"),
                width: storyStickerDimensions.emoji.width,
                height: storyStickerDimensions.emoji.height,
                rotation: storyStickerEmojiRotation,
                scale: storyStickerEmojiScale,
              },
              style: {
                fontSize: Math.round(36 * storyStickerEmojiScale),
              },
            }
          : null,
      ].filter(Boolean) as CreatePostInput["stickers"],
    };
  };

  const prepareStoryPayload = async (): Promise<CreateStoryInput> => {
    let background: CreateStoryInput["media"];

    if (storyType !== "text") {
      const assets = requireAssets("Choose media before publishing this story.");
      const [uploadedBackground] = await uploadComposerAssets([assets[0]]);
      background = uploadedBackground;
    }

    if ((storyType === "poll" || storyType === "question") && background?.mediaType !== "image") {
      throw new Error("Poll and question stories currently require an image background.");
    }

    if (storyType === "text" && !storyCaption.trim()) {
      throw new Error("Write something before publishing a text story.");
    }

    if (storyLinkUrl.trim() && !isValidHttpUrl(storyLinkUrl)) {
      throw new Error("Story links must start with http:// or https://");
    }

    if (storyType === "poll") {
      if (!pollQuestion.trim()) {
        throw new Error("Add a poll question before publishing.");
      }

      if (!pollOptionA.trim() || !pollOptionB.trim()) {
        throw new Error("Poll stories need two answer options.");
      }
    }

    if (storyType === "question" && !questionPrompt.trim()) {
      throw new Error("Add a question prompt before publishing.");
    }

    const base: CreateStoryInput = {
      type: storyType,
      media: background,
      text: storyCaption.trim() || undefined,
      backgroundColor: storyType === "text" ? storyBackgroundColor : undefined,
      filterPreset: storyType === "text" ? undefined : storyFilterPreset,
      filterIntensity: storyType === "text" || storyFilterPreset === "none" ? undefined : storyFilterIntensity,
      linkUrl: storyLinkUrl.trim() || undefined,
      location: storyLocation.trim() || undefined,
      customTextSticker: storyStickerText.trim() || undefined,
      customTextStickerPlacement: storyStickerTextPlacement,
      customTextStickerPosition: storyStickerText.trim() ? getStickerPosition("text") : undefined,
      customTextStickerScale: storyStickerText.trim() ? storyStickerTextScale : undefined,
      customTextStickerRotation: storyStickerText.trim() ? storyStickerTextRotation : undefined,
      customTextStickerTheme: storyStickerText.trim() ? storyStickerTextTheme : undefined,
      customTextStickerAlignment: storyStickerText.trim() ? storyStickerTextAlignment : undefined,
      customEmojiSticker: storyStickerEmoji.trim() || undefined,
      customEmojiStickerPlacement: storyStickerEmojiPlacement,
      customEmojiStickerPosition: storyStickerEmoji.trim() ? getStickerPosition("emoji") : undefined,
      customEmojiStickerScale: storyStickerEmoji.trim() ? storyStickerEmojiScale : undefined,
      customEmojiStickerRotation: storyStickerEmoji.trim() ? storyStickerEmojiRotation : undefined,
      extraEmojiStickers: storyFaceStickers.length
        ? storyFaceStickers.map((sticker) => ({
          text: sticker.emoji,
          position: sticker.position || { x: 0.34, y: 0.24 },
          scale: sticker.scale,
          rotation: sticker.rotation,
        }))
        : undefined,
      hashtags: splitTokens(storyHashtagsRaw),
      mentions: splitTokens(storyMentionsRaw),
      visibility: storyVisibility,
      visibleToUserIds: storyVisibility === "custom" ? storyVisibleToUserIds : undefined,
      allowReplies: storyAllowReplies,
      allowSharing: storyAllowSharing,
      music: musicSelections.story || undefined,
    };

    if (storyType === "poll") {
      base.poll = {
        question: pollQuestion.trim(),
        options: [pollOptionA.trim(), pollOptionB.trim()],
      };
    }

    if (storyType === "question") {
      base.question = {
        prompt: questionPrompt.trim(),
      };
    }

    return base;
  };

  const prepareSwipePayload = async (): Promise<CreateSwipeInput> => {
    const assets = requireAssets("Choose a video before publishing this swipe.");
    const [video] = await uploadComposerAssets([assets[0]]);

    if (video.mediaType !== "video") {
      throw new Error("Swipes require a video upload.");
    }

    return {
      caption: appendCaptionEntities(caption, splitTokens(hashtagsRaw), splitTokens(mentionsRaw)),
      media: video,
      thumbnailUrl: video.thumbnailUrl,
      music: musicSelections.swipe || undefined,
      location,
      hashtags: splitTokens(hashtagsRaw),
      mentions: splitTokens(mentionsRaw),
    };
  };

  const publish = async () => {
    if (publishing) {
      return;
    }

    try {
      setPublishing(true);

      if (activeTab === "post") {
        await socialApi.createPost(await preparePostPayload());
      } else if (activeTab === "story") {
        await socialApi.createStory(await prepareStoryPayload());
      } else {
        await socialApi.createSwipe(await prepareSwipePayload());
      }

      const publishedType = activeTab === "swipe" ? "swipe" : activeTab;
      await AsyncStorage.removeItem(CREATE_DRAFT_STORAGE_KEY);
      setPublishError("");
      Alert.alert("Published", `Your ${publishedType} is now live.`);
      startTransition(() => {
        if (activeTab === "swipe") {
          navigation.navigate("Swipes");
          return;
        }

        navigation.navigate("MainApp", { screen: "Feed" });
      });
    } catch (error) {
      const nextMessage = getReadableApiErrorMessage(error, toUserSafeMessage(error));
      setPublishError(nextMessage);
      if (isModerationBlockedError(error) && showModerationBlockedSheet(error, { fallbackMessage: nextMessage })) {
        return;
      }

      Alert.alert("Publish failed", nextMessage);
    } finally {
      setPublishing(false);
    }
  };

  const saveDraft = async () => {
    if (savingDraft) {
      return;
    }

    try {
      setSavingDraft(true);
      await AsyncStorage.setItem(
        CREATE_DRAFT_STORAGE_KEY,
        JSON.stringify({
          activeTab,
          postType,
          storyType,
          caption,
          storyCaption,
          location,
          storyLocation,
          hashtagsRaw,
          mentionsRaw,
          storyHashtagsRaw,
          storyMentionsRaw,
          storyBackgroundColor,
          storyFilterPreset,
          storyFilterIntensity,
          storyStickerText,
          storyStickerEmoji,
          storyVisibility,
          sharePostToStory,
          disableComments,
          hideLikeCount,
          framePresetByTab,
          selectedAssets,
          musicSelections,
          savedAt: Date.now(),
        }),
      );
      Alert.alert("Draft saved", "Your draft was saved on this device.");
    } catch (error) {
      Alert.alert("Could not save draft", toUserSafeMessage(error));
    } finally {
      setSavingDraft(false);
    }
  };

  const renderCreateModeCards = () => (
    <View style={[styles.bottomModeDock, { backgroundColor: surfaceColor, borderColor: composerBorderColor }]}>
      {tabs.map((tab) => {
        const blueprint = composerBlueprints[tab];
        const isActive = activeTab === tab;

        return (
          <TouchableOpacity
            key={`create-card-${tab}`}
            activeOpacity={0.92}
            style={[
              styles.bottomModeTab,
              isActive && { backgroundColor: composerAccent },
            ]}
            onPress={() => onSelectTab(tab)}
          >
            <Icon name={blueprint.icon} size={18} color={isActive ? "#fff" : composerMutedText} />
            <Text style={[styles.bottomModeText, { color: isActive ? "#fff" : composerMutedText }]}>
              {tab === "swipe" ? "Swipes" : blueprint.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
  void renderCreateModeCards;

  const renderFrameSelector = () => (
    <View style={[styles.frameCard, { backgroundColor: elevatedSurfaceColor, borderColor: composerBorderColor }]}>
      <View style={styles.panelHeaderRow}>
        <View>
          <Text style={[styles.panelEyebrow, { color: composerAccent }]}>Post frame</Text>
          <Text style={[styles.panelTitle, { color: composerText }]}>Choose frame</Text>
        </View>
        <View style={[styles.pipelineBadge, { backgroundColor: subtleSurfaceColor, borderColor: composerBorderColor }]}>
          <Icon name="scan-outline" size={13} color={composerAccent} />
          <Text style={[styles.pipelineBadgeText, { color: composerText }]}>{activeFrameConfig.label}</Text>
        </View>
      </View>
      <View style={styles.frameOptionRow}>
        {frameOptionsByTab[activeTab].map((preset) => {
          const config = composerFramePresets[preset];
          const selected = activeFramePreset === preset;

          return (
            <TouchableOpacity
              key={`frame-${activeTab}-${preset}`}
              style={[
                styles.frameChip,
                { backgroundColor: subtleSurfaceColor, borderColor: composerBorderColor },
                selected && { backgroundColor: composerAccent, borderColor: composerAccent },
              ]}
              onPress={() => setFramePresetForTab(activeTab, preset)}
            >
              <Text style={[styles.frameChipLabel, { color: selected ? "#fff" : composerText }]}>{config.label}</Text>
              <Text style={[styles.frameChipDetail, { color: selected ? "rgba(255,255,255,0.8)" : composerMutedText }]}>
                {config.detail}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderEditorToolRail = () => {
    const activeImageFilter =
      activeTab === "post"
        ? selectedPhotoFilter
        : activeTab === "story"
          ? storyFilterPreset
          : "none";

    const quickTools = [
      {
        id: "gallery",
        icon: "images-outline",
        label: "Gallery",
        detail: "Pick",
        onPress: onPickMedia,
      },
      {
        id: "camera",
        icon: "camera-outline",
        label: "Camera",
        detail: "Shoot",
        onPress: onCaptureMedia,
      },
      {
        id: "frame",
        icon: "crop-outline",
        label: activeFrameConfig.label,
        detail: "Frame",
        onPress: cycleActiveFramePreset,
      },
      primaryAsset?.mediaType === "video"
        ? {
          id: "trim",
          icon: "cut-outline",
          label: "Trim",
          detail: "Editor",
          onPress: () => setShowVideoTrim(true),
        }
        : {
          id: "filter",
          icon: "color-filter-outline",
          label: activeImageFilter === "none" ? "Filter" : "Filtered",
          detail: activeImageFilter,
          onPress: () => {
            if (activeTab === "story") {
              const nextIndex = (storyFilterPresets.indexOf(storyFilterPreset) + 1) % storyFilterPresets.length;
              setStoryFilterPreset(storyFilterPresets[nextIndex]);
              return;
            }

            const nextIndex = (PHOTO_FILTER_LIST.findIndex((filter) => filter.id === selectedPhotoFilter) + 1) % PHOTO_FILTER_LIST.length;
            setSelectedPhotoFilter(PHOTO_FILTER_LIST[nextIndex]?.id || "none");
          },
        },
      activeTab === "story"
        ? {
          id: "stickers",
          icon: "happy-outline",
          label: "Sticker",
          detail: "Add",
          onPress: () => setShowStickerPickerSheet(true),
        }
        : {
          id: "music",
          icon: "musical-notes-outline",
          label: musicSelections[activeTab] ? "Music" : "Sound",
          detail: musicSelections[activeTab] ? "Attached" : "Browse",
          onPress: loadTrendingMusic,
        },
      {
        id: "live",
        icon: "radio-outline",
        label: "Live",
        detail: "Host",
        onPress: openLiveComposer,
      },
    ];

    return (
      <View style={[styles.quickToolCard, { backgroundColor: elevatedSurfaceColor, borderColor: composerBorderColor }]}>
        <View style={styles.panelHeaderRow}>
          <View>
            <Text style={[styles.panelEyebrow, { color: composerAccent }]}>Tools</Text>
            <Text style={[styles.panelTitle, { color: composerText }]}>Edit tools</Text>
          </View>
          <TouchableOpacity
            style={[styles.pipelineBadge, { backgroundColor: subtleSurfaceColor, borderColor: composerBorderColor }]}
            onPress={openLiveComposer}
            activeOpacity={0.85}
          >
            <Icon name="sparkles-outline" size={13} color={composerAccent} />
            <Text style={[styles.pipelineBadgeText, { color: composerText }]}>Go Live</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.quickToolRow}>
          {quickTools.map((tool) => (
            <TouchableOpacity
              key={`quick-tool-${tool.id}`}
              style={[styles.quickToolButton, { backgroundColor: subtleSurfaceColor, borderColor: composerBorderColor }]}
              onPress={tool.onPress}
            >
              <Icon name={tool.icon} size={18} color={composerText} />
              <Text style={[styles.quickToolLabel, { color: composerText }]}>{tool.label}</Text>
              <Text style={[styles.quickToolDetail, { color: composerMutedText }]}>{tool.detail}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderMediaSelectorPanel = () => {
    if (activeTab === "story" && storyType === "text") {
      return (
        <View style={[styles.mediaSelectorPanel, { backgroundColor: elevatedSurfaceColor, borderColor: composerBorderColor }]}>
          <View style={styles.panelHeaderRow}>
            <View>
              <Text style={[styles.panelEyebrow, { color: composerAccent }]}>Canvas</Text>
              <Text style={[styles.panelTitle, { color: composerText }]}>Gradient story mode</Text>
            </View>
            <Icon name="color-palette-outline" size={22} color={composerAccent} />
          </View>
          <Text style={[styles.helperText, helperTextStyle]}>
            Text stories publish without media, while stickers and music still layer onto the preview.
          </Text>
        </View>
      );
    }

    return (
      <View style={[styles.mediaSelectorPanel, { backgroundColor: elevatedSurfaceColor, borderColor: composerBorderColor }]}>
        <View style={styles.panelHeaderRow}>
          <View>
            <Text style={[styles.panelEyebrow, { color: composerAccent }]}>Media selector</Text>
            <Text style={[styles.panelTitle, { color: composerText }]}>Pick media</Text>
          </View>
          <View style={styles.mediaActionsRow}>
            <TouchableOpacity
              style={[styles.secondaryPickButton, { backgroundColor: subtleSurfaceColor, borderColor: composerBorderColor }]}
              disabled={pickingMedia}
              onPress={onCaptureMedia}
            >
              <Icon name="camera-outline" size={18} color={composerText} />
              <Text style={[styles.secondaryPickButtonText, { color: composerText }]}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.pickButton, { backgroundColor: composerAccent }]} disabled={pickingMedia} onPress={onPickMedia}>
              {pickingMedia ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="images-outline" size={18} color="#fff" />}
              <Text style={styles.pickButtonText}>{selectedAssets.length ? "Replace" : "Choose"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.galleryTabsRow}>
          {["Gallery", "Camera", "Video"].map((label, index) => (
            <View
              key={`gallery-tab-${label}`}
              style={[
                styles.galleryTab,
                { backgroundColor: index === 0 ? composerAccent : subtleSurfaceColor, borderColor: composerBorderColor },
              ]}
            >
              <Text style={[styles.galleryTabText, { color: index === 0 ? "#fff" : composerText }]}>{label}</Text>
            </View>
          ))}
        </View>

        {selectedAssets.length ? renderSelectedAssets() : (
          <View style={styles.selectorSkeletonGrid}>
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <View key={`selector-skeleton-${item}`} style={[styles.selectorSkeletonCell, { backgroundColor: subtleSurfaceColor }]}>
                {item === 0 ? <Icon name="add-outline" size={22} color={composerMutedText} /> : null}
              </View>
            ))}
          </View>
        )}
        <View style={styles.inlineMediaToolRow}>
          {renderVideoTrimButton()}
          {renderFaceOverlayButton()}
        </View>
      </View>
    );
  };

  const renderPreviewSharePanel = () => (
    <View style={[styles.previewSharePanel, { backgroundColor: elevatedSurfaceColor, borderColor: composerBorderColor }]}>
      <View style={styles.panelHeaderRow}>
        <View>
          <Text style={[styles.panelEyebrow, { color: composerAccent }]}>Preview and share</Text>
          <Text style={[styles.panelTitle, { color: composerText }]}>
            Final checks for {composerBlueprints[activeTab].label}
          </Text>
        </View>
        <Icon name="shield-checkmark-outline" size={22} color={composerAccent} />
      </View>
      <View style={styles.shareOptionRow}>
        {["Public", "Followers", "Private"].map((option, index) => (
          <View
            key={`visibility-${option}`}
            style={[
              styles.visibilityChip,
              { backgroundColor: index === 0 ? composerAccent : subtleSurfaceColor, borderColor: composerBorderColor },
            ]}
          >
            <Text style={[styles.visibilityChipText, { color: index === 0 ? "#fff" : composerText }]}>{option}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.helperText, helperTextStyle]}>
          Swipes can use the first frame as a thumbnail, stories support close friends, and posts keep comments and privacy controls ready before publishing.
      </Text>
    </View>
  );
  void renderPreviewSharePanel;

  const renderMediaPreview = () => {
    const textStickerPosition = getStickerPosition("text");
    const emojiStickerPosition = getStickerPosition("emoji");
    const textStickerThemeStyle = getStoryTextStickerThemeStyle(storyStickerTextTheme);
    const storyFilterStyle =
      activeTab === "story" ? getStoryFilterOverlayStyle(storyFilterPreset, storyFilterIntensity) : null;
    const previewStickers =
      activeTab !== "swipe" && (storyStickerText.trim() || storyStickerEmoji.trim()) ? (
        <View style={styles.storyPreviewStickerLayer}>
          {storyStickerEmoji.trim() ? (
            <View
              style={[
                styles.storyPreviewEmojiSticker,
                {
                  left: `${emojiStickerPosition.x * 100}%`,
                  top: `${emojiStickerPosition.y * 100}%`,
                  transform: [{ rotate: `${storyStickerEmojiRotation}deg` }, { scale: storyStickerEmojiScale }],
                },
              ]}
              {...emojiStickerPanResponder.panHandlers}
            >
              <Text style={styles.storyPreviewEmojiText}>{storyStickerEmoji.trim()}</Text>
            </View>
          ) : null}
          {storyStickerText.trim() ? (
            <View
              style={[
                styles.storyPreviewTextSticker,
                {
                  left: `${textStickerPosition.x * 100}%`,
                  top: `${textStickerPosition.y * 100}%`,
                  backgroundColor: textStickerThemeStyle.backgroundColor,
                  transform: [{ rotate: `${storyStickerTextRotation}deg` }, { scale: storyStickerTextScale }],
                },
              ]}
              {...textStickerPanResponder.panHandlers}
            >
              <Text
                style={[
                  styles.storyPreviewTextStickerText,
                  {
                    color: textStickerThemeStyle.color,
                    textAlign: storyStickerTextAlignment,
                  },
                ]}
              >
                {storyStickerText.trim()}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null;
    const previewFaceStickers =
      activeTab === "story" && storyFaceStickers.length ? (
        <View pointerEvents="none" style={styles.storyPreviewStickerLayer}>
          {storyFaceStickers.map((sticker) => (
            <View
              key={`story-face-sticker-${sticker.placementId || sticker.id}`}
              style={[
                styles.storyPreviewEmojiSticker,
                {
                  left: `${(sticker.position?.x ?? 0.34) * 100}%`,
                  top: `${(sticker.position?.y ?? 0.24) * 100}%`,
                  transform: [
                    { rotate: `${sticker.rotation || 0}deg` },
                    { scale: sticker.scale || 1 },
                  ],
                },
              ]}
            >
              <Text style={styles.storyPreviewEmojiText}>{sticker.emoji}</Text>
            </View>
          ))}
        </View>
      ) : null;
    const previewWidth: DimensionValue =
      activeTab === "post"
        ? "100%"
        : activeFramePreset === "landscape"
          ? "100%"
          : activeFramePreset === "portrait"
            ? "82%"
            : "76%";
    const previewFrameStyle = [
      styles.dynamicPreviewShell,
      {
        width: previewWidth,
        aspectRatio: activeFrameConfig.aspectRatio,
        borderRadius: activeTab === "post" ? 28 : 32,
      },
    ];
    const previewMetaItems = [
      { id: "frame", label: activeFrameConfig.label },
      activeTab === "story" ? (storyLocation.trim() ? { id: "location", label: storyLocation.trim() } : null) : (location.trim() ? { id: "location", label: location.trim() } : null),
      buildMusicLabel(musicSelections[activeTab]) ? { id: "music", label: buildMusicLabel(musicSelections[activeTab]) } : null,
    ].filter(Boolean) as Array<{ id: string; label: string }>;
    const previewMetaOverlay = previewMetaItems.length ? (
      <View style={styles.previewMetaOverlay}>
        {previewMetaItems.map((item) => (
          <View key={`preview-meta-${item.id}`} style={styles.previewMetaChip}>
            <Text style={styles.previewMetaChipText} numberOfLines={1}>{item.label}</Text>
          </View>
        ))}
      </View>
    ) : null;

    if (activeTab === "story" && storyType === "text") {
      return (
        <View
          style={[styles.textStoryPreview, previewFrameStyle, { backgroundColor: storyBackgroundColor }]}
          onLayout={(event) => handleStoryPreviewLayout(event.nativeEvent.layout.width, event.nativeEvent.layout.height)}
        >
          <Text style={styles.textStoryPreviewText}>
            {storyCaption.trim() || "Type your story text"}
          </Text>
          {previewFaceStickers}
          {previewStickers}
          {previewMetaOverlay}
        </View>
      );
    }

    if (!primaryAsset) {
      return (
        <View style={[styles.emptyPreview, previewFrameStyle]}>
          <Icon name="images-outline" size={36} color="#6b7280" />
          <Text style={styles.emptyPreviewTitle}>No media selected</Text>
          <Text style={styles.emptyPreviewText}>Pick media from your device before publishing.</Text>
        </View>
      );
    }

    if (activeTab === "post" && postType === "carousel" && selectedAssets.length > 1) {
      return (
        <View style={previewFrameStyle}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => {
              const nextIndex = Math.round(
                Number(event?.nativeEvent?.contentOffset?.x || 0) / Math.max(1, storyPreviewSize.width || 1),
              );
              setActiveAssetIndex(Math.max(0, Math.min(selectedAssets.length - 1, nextIndex)));
            }}
            onLayout={(event) => handleStoryPreviewLayout(event.nativeEvent.layout.width, event.nativeEvent.layout.height)}
          >
            {selectedAssets.map((asset) => (
              <Image
                key={`preview-carousel-${asset.id}`}
                source={{ uri: asset.thumbnailUrl || asset.uri }}
                style={[styles.previewMediaFill, { width: storyPreviewSize.width || 280 }]}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
          <View style={styles.previewPagerRow}>
            {selectedAssets.map((asset, index) => (
              <View
                key={`preview-dot-${asset.id}`}
                style={[styles.previewPagerDot, index === activeAssetIndex && styles.previewPagerDotActive]}
              />
            ))}
          </View>
          {previewStickers}
          {previewMetaOverlay}
        </View>
      );
    }

    if (primaryAsset.mediaType === "video") {
      const previewVideo = (
        <View
          style={previewFrameStyle}
          onLayout={(event) => handleStoryPreviewLayout(event.nativeEvent.layout.width, event.nativeEvent.layout.height)}
        >
          <SocialVideo
            uri={primaryAsset.uri}
            posterUri={primaryAsset.thumbnailUrl || primaryAsset.uri}
            style={styles.previewMediaFill}
            muted={false}
            repeat
            controls
          />
          {activeTab === "story" ? previewFaceStickers : null}
          {previewStickers}
          {previewMetaOverlay}
        </View>
      );

      return previewVideo;
    }

    const rawPreviewImage = (
      <Image
        source={{ uri: primaryAsset.thumbnailUrl || primaryAsset.uri }}
        style={styles.previewMediaFill}
      />
    );
    const activePhotoFilter = selectedPhotoFilter !== "none"
      ? PHOTO_FILTER_LIST.find((filter) => filter.id === selectedPhotoFilter)
      : null;
    const filteredPostPreview =
      activeTab === "post" && ColorMatrix && activePhotoFilter?.matrix
        ? <ColorMatrix matrix={activePhotoFilter.matrix}>{rawPreviewImage}</ColorMatrix>
        : rawPreviewImage;

    return (
      <View
        style={previewFrameStyle}
        onLayout={(event) => handleStoryPreviewLayout(event.nativeEvent.layout.width, event.nativeEvent.layout.height)}
      >
        {activeTab === "post" ? filteredPostPreview : rawPreviewImage}
        {storyFilterStyle && activeTab === "story" ? (
          <View
            pointerEvents="none"
            style={[
              styles.storyFilterOverlay,
              {
                backgroundColor: storyFilterStyle.backgroundColor,
                opacity: storyFilterStyle.opacity,
              },
            ]}
          />
        ) : null}
        {activeTab === "story" ? previewFaceStickers : null}
        {previewStickers}
        {previewMetaOverlay}
      </View>
    );
  };

  /** GPU-accelerated photo filter strip for post images */
  const renderPhotoFilterStrip = () => {
    if (activeTab !== "post" || postType !== "photo" || !primaryAsset || primaryAsset.mediaType !== "image") {
      return null;
    }

    return (
      <PhotoFilterStrip
        imageUri={primaryAsset.thumbnailUrl || primaryAsset.uri}
        selectedFilter={selectedPhotoFilter}
        onSelectFilter={(filter: any) => setSelectedPhotoFilter(filter.id)}
      />
    );
  };

  /** Video trim button for video posts */
  const renderVideoTrimButton = () => {
    if (!primaryAsset || primaryAsset.mediaType !== "video") {
      return null;
    }

    return (
      <>
        <TouchableOpacity
          style={[styles.mediaActionButton, { backgroundColor: composerAccent }]}
          onPress={() => setShowVideoTrim(true)}
        >
          <Icon name="cut-outline" size={18} color="#fff" />
          <Text style={styles.mediaActionText}>Edit Video</Text>
        </TouchableOpacity>
        <VideoTrimSheet
          visible={showVideoTrim}
          videoUri={primaryAsset.uri}
          contentType={activeTab === "swipe" ? "swipe" : activeTab === "story" ? "story" : "post"}
          onClose={() => setShowVideoTrim(false)}
          onTrimmed={(result: any) => {
            if (result?.uri) {
              setSelectedAssets((prev) =>
                prev.map((a, i) => (i === 0 ? { ...a, uri: result.uri } : a))
              );
            }
          }}
        />
      </>
    );
  };

  /** Face overlay stickers button */
  const renderFaceOverlayButton = () => {
    if (activeTab !== "story") {
      return null;
    }

    return (
      <>
        <TouchableOpacity
          style={[styles.mediaActionButton, { backgroundColor: "#FF6B35", marginLeft: primaryAsset?.mediaType === "video" ? 8 : 0 }]}
          onPress={() => setShowFaceOverlay(true)}
        >
          <Icon name="happy-outline" size={18} color="#fff" />
          <Text style={styles.mediaActionText}>
            {storyFaceStickers.length ? `Story Stickers (${storyFaceStickers.length})` : "Story Stickers"}
          </Text>
        </TouchableOpacity>
        <FaceOverlayPicker
          visible={showFaceOverlay}
          stickers={storyFaceStickers}
          onClose={() => setShowFaceOverlay(false)}
          onStickersChanged={setStoryFaceStickers}
        />
      </>
    );
  };

  const renderSelectedAssets = () => {
    if (!selectedAssets.length) {
      return null;
    }

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.assetRow}>
        {selectedAssets.map((asset, index) => (
          <TouchableOpacity
            key={asset.id}
            style={[styles.assetChip, index === activeAssetIndex && styles.assetChipActive]}
            activeOpacity={0.88}
            onPress={() => setActiveAssetIndex(index)}
          >
            {asset.mediaType === "video" && !asset.thumbnailUrl && asset.source === "local" ? (
              <View style={[styles.assetThumb, styles.assetThumbVideo]}>
                <Icon name="videocam-outline" size={18} color="#fff" />
              </View>
            ) : (
              <Image source={{ uri: asset.thumbnailUrl || asset.uri }} style={styles.assetThumb} />
            )}
            <View style={styles.assetIndexBadge}>
              <Text style={styles.assetIndexText}>{index + 1}</Text>
            </View>
            <TouchableOpacity style={styles.assetRemove} onPress={() => removeAsset(asset.id)}>
              <Icon name="close" size={14} color="#fff" />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  const renderLocationSuggestions = (
    suggestions: LocationSuggestion[],
    loading: boolean,
    onSelect: (value: string) => void,
  ) => {
    if (!loading && !suggestions.length) {
      return null;
    }

    return (
      <View style={[styles.locationSuggestionsCard, { backgroundColor: elevatedSurfaceColor, borderColor: composerBorderColor }]}>
        {loading && !suggestions.length ? (
          <View style={styles.locationSuggestionsLoadingRow}>
            <ActivityIndicator size="small" color={composerAccent} />
            <Text style={[styles.locationSuggestionMeta, helperTextStyle]}>Looking up places...</Text>
          </View>
        ) : null}

        {suggestions.map((suggestion) => (
          <TouchableOpacity
            key={`${suggestion.name}:${suggestion.count}`}
            style={styles.locationSuggestionButton}
            activeOpacity={0.82}
            onPress={() => onSelect(suggestion.name)}
          >
            <View style={styles.locationSuggestionBody}>
              <Text style={[styles.locationSuggestionName, { color: composerText }]} numberOfLines={1}>
                {suggestion.name}
              </Text>
              <Text style={[styles.locationSuggestionMeta, helperTextStyle]}>
                {suggestion.count > 0 ? `${suggestion.count} posts` : "Suggested location"}
              </Text>
            </View>
            <Icon name="location-outline" size={16} color={composerAccent} />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderLocationPicker = (
    target: "post" | "story" | "swipe",
    value: string,
    suggestions: LocationSuggestion[],
    loading: boolean,
    onChangeText: (value: string) => void,
    onSelect: (value: string) => void,
  ) => (
    <View style={[styles.selectorCard, { backgroundColor: elevatedSurfaceColor, borderColor: composerBorderColor }]}>
      <View style={styles.selectorCardHeader}>
        <Text style={[styles.selectorTitle, { color: composerText }]}>
          {value ? value : "Choose a place from suggestions"}
        </Text>
        <Icon name="location-outline" size={18} color={composerAccent} />
      </View>
      <View style={styles.locationInputRow}>
        <TextInput
          style={[styles.locationSearchInput, inputStyle]}
          value={value}
          onChangeText={onChangeText}
          placeholder="Search city, area, or place"
          placeholderTextColor={composerMutedText}
          autoCapitalize="words"
          returnKeyType="search"
          onSubmitEditing={() => {
            const setLoading = target === "story" ? setStoryLocationLoading : setLocationLoading;
            setLoading(true);
            requestLocationSuggestions(target, value)
              .catch((error) => {
                Alert.alert("Could not search locations", toUserSafeMessage(error));
              })
              .finally(() => setLoading(false));
          }}
        />
        <TouchableOpacity
          style={[styles.locationActionButton, { backgroundColor: composerAccent }]}
          onPress={() => {
            const setLoading = target === "story" ? setStoryLocationLoading : setLocationLoading;
            setLoading(true);
            requestLocationSuggestions(target, value)
              .catch((error) => {
                Alert.alert("Could not search locations", toUserSafeMessage(error));
              })
              .finally(() => setLoading(false));
          }}
        >
          <Icon name="search-outline" size={16} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.locationActionButton, { backgroundColor: surfaceColor, borderColor: composerBorderColor }]}
          onPress={() => {
            applyCurrentLocation(target).catch(() => undefined);
          }}
          disabled={locationFetchTarget === target}
        >
          {locationFetchTarget === target ? (
            <ActivityIndicator size="small" color={composerText} />
          ) : (
            <Icon name="locate-outline" size={16} color={composerText} />
          )}
        </TouchableOpacity>
      </View>
      <View style={styles.seedRow}>
        {locationSeedOptions.map((seed) => (
          <TouchableOpacity
            key={`${target}-${seed}`}
            style={[styles.seedChip, { backgroundColor: surfaceColor, borderColor: composerBorderColor }]}
            onPress={() => {
              const setLoading = target === "story" ? setStoryLocationLoading : setLocationLoading;
              setLoading(true);
              requestLocationSuggestions(target, seed)
                .catch((error) => {
                  console.log("seeded location suggestion error:", error);
                })
                .finally(() => setLoading(false));
            }}
          >
            <Text style={[styles.seedChipText, { color: composerText }]}>{seed}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {renderLocationSuggestions(suggestions, loading, onSelect)}
    </View>
  );

  const renderMentionSelector = (target: "post" | "story" | "swipe", rawValue: string) => {
    const selectedMentions = splitTokens(rawValue);

    return (
      <View style={[styles.selectorCard, { backgroundColor: elevatedSurfaceColor, borderColor: composerBorderColor }]}>
        <View style={styles.selectorCardHeader}>
          <Text style={[styles.selectorTitle, { color: composerText }]}>Tag friends</Text>
          {taggableFriendsLoading ? <ActivityIndicator size="small" color={composerAccent} /> : null}
        </View>
        <View style={styles.friendSelectorWrap}>
          {taggableFriends.map((friend) => {
            const selected = selectedMentions.includes(friend.username);
            return (
              <TouchableOpacity
                key={`${target}-${friend.id}`}
                style={[
                  styles.friendSelectorChip,
                  { backgroundColor: selected ? composerAccent : surfaceColor, borderColor: composerBorderColor },
                ]}
                onPress={() => toggleMentionFriend(target, friend.username)}
              >
                <Text style={[styles.friendSelectorText, { color: selected ? "#fff" : composerText }]}>
                  @{friend.username}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderMusicPicker = (tab: ComposerTab) => {
    const current = musicSelections[tab];
    const clipPresets = [5, 10, 15, 30];

    return (
      <>
        <Text style={[styles.sectionLabel, { color: composerText }]}>Music</Text>
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.pill, controlBorderStyle, { backgroundColor: surfaceColor }, musicBrowseMode === "trending" && [styles.pillActive, activePillStyle]]}
            onPress={loadTrendingMusic}
          >
            <Text style={[styles.pillText, { color: musicBrowseMode === "trending" ? "#fff" : composerText }, musicBrowseMode === "trending" && styles.pillTextActive]}>Trending</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pill, controlBorderStyle, { backgroundColor: surfaceColor }, musicBrowseMode === "original" && [styles.pillActive, activePillStyle]]}
            onPress={loadOriginalSounds}
          >
            <Text style={[styles.pillText, { color: musicBrowseMode === "original" ? "#fff" : composerText }, musicBrowseMode === "original" && styles.pillTextActive]}>My Audio</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.musicSearchRow}>
          <TextInput
            style={[styles.musicSearchInput, inputStyle]}
            value={musicQuery}
            onChangeText={setMusicQuery}
            placeholder="Search tracks or original sounds"
            placeholderTextColor={composerMutedText}
            maxLength={limits.music}
            returnKeyType="search"
            onSubmitEditing={runMusicSearch}
          />
          <TouchableOpacity style={[styles.musicActionButton, { backgroundColor: composerAccent }]} onPress={runMusicSearch} disabled={musicLoading}>
            {musicLoading ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="search-outline" size={16} color="#fff" />}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.musicSecondaryButton, { backgroundColor: surfaceColor, borderColor: composerBorderColor }]} onPress={loadTrendingMusic} disabled={musicLoading}>
            <Icon name="flame-outline" size={16} color={composerText} />
          </TouchableOpacity>
        </View>

        {current ? (
          <View style={[styles.musicCard, { backgroundColor: elevatedSurfaceColor, borderColor: composerBorderColor }]}>
            <View style={styles.musicCardHeader}>
              <View style={styles.musicTitleBlock}>
                <Text style={[styles.musicTitle, { color: composerText }]}>{buildMusicLabel(current)}</Text>
                <Text style={[styles.musicMeta, helperTextStyle]}>
                  {[current.source || "catalog", current.isOriginal ? "original" : null, `${formatDuration(current.duration)} track`]
                    .filter(Boolean)
                    .join(" • ")}
                </Text>
              </View>
              <TouchableOpacity style={[styles.musicClearButton, { backgroundColor: surfaceColor, borderColor: composerBorderColor }]} onPress={() => setMusicForTab(tab, null)}>
                <Text style={[styles.musicClearText, { color: composerText }]}>Remove</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.sectionLabel, { color: composerText }]}>Clip length</Text>
            <View style={styles.modeRow}>
              {clipPresets
                .filter((preset) => preset <= current.duration)
                .map((preset) => (
                  <TouchableOpacity
                    key={preset}
                    style={[styles.pill, controlBorderStyle, { backgroundColor: surfaceColor }, (current.clipDuration || 0) === preset && [styles.pillActive, activePillStyle]]}
                    onPress={() => setSelectedMusicClipDuration(preset)}
                  >
                    <Text style={[styles.pillText, { color: (current.clipDuration || 0) === preset ? "#fff" : composerText }, (current.clipDuration || 0) === preset && styles.pillTextActive]}>
                      {preset}s
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>

            <Text style={[styles.sectionLabel, { color: composerText }]}>Clip start</Text>
            <View style={styles.clipAdjustRow}>
              <View style={styles.clipAdjustGroup}>
                <TouchableOpacity style={[styles.clipAdjustButton, { backgroundColor: composerAccent }]} onPress={() => nudgeSelectedMusicStart(-1)}>
                  <Text style={styles.clipAdjustText}>-1s</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.clipAdjustButton, { backgroundColor: composerAccent }]} onPress={() => nudgeSelectedMusicStart(-5)}>
                  <Text style={styles.clipAdjustText}>-5s</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.clipAdjustValue, { color: composerText }]}>
                Starts at {formatDuration(current.clipStartTime)} for {formatDuration(current.clipDuration)}
              </Text>
              <View style={styles.clipAdjustGroup}>
                <TouchableOpacity style={[styles.clipAdjustButton, { backgroundColor: composerAccent }]} onPress={() => nudgeSelectedMusicStart(1)}>
                  <Text style={styles.clipAdjustText}>+1s</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.clipAdjustButton, { backgroundColor: composerAccent }]} onPress={() => nudgeSelectedMusicStart(5)}>
                  <Text style={styles.clipAdjustText}>+5s</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <Text style={[styles.helperText, helperTextStyle]}>
            Attach a real track so this {tab === "story" ? "story" : tab} uses a saved music record instead of placeholder text.
          </Text>
        )}

        {musicError ? <Text style={[styles.musicError, { color: "#fca5a5" }]}>{musicError}</Text> : null}

        {!musicLoading && !musicResults.length ? (
          <Text style={[styles.helperText, helperTextStyle]}>
            {musicBrowseMode === "original"
              ? "You do not have any original sounds yet. Publish a video first, then turn it into audio."
              : musicBrowseMode === "search"
                ? "No tracks matched this search yet."
                : "No music is available right now."}
          </Text>
        ) : null}

        <View style={styles.musicResultsWrap}>
          {musicResults.map((item) => {
            const isCurrent = !!current && (
              current.id === item.id ||
              (!!current.externalId && current.externalId === item.externalId && current.source === item.source) ||
              (current.title === item.title && current.artist === item.artist && current.source === item.source)
            );
            const isImporting = musicImportingId === item.id;
            const isPreviewing = musicPreviewPlayingId === item.id;
            const isPreviewLoading = musicPreviewLoadingId === item.id;
            const previewLabel =
              isPreviewing || isPreviewLoading
                ? `${formatDuration(Math.round(musicPreviewPositionMs / 1000))} / ${formatDuration(Math.round((musicPreviewDurationMs || item.duration * 1000) / 1000))}`
                : null;

            return (
              <View
                key={`${item.id}:${item.title}`}
                style={[
                  styles.musicResultCard,
                  { backgroundColor: surfaceColor, borderColor: composerBorderColor },
                  isCurrent && [styles.musicResultCardActive, { backgroundColor: elevatedSurfaceColor, borderColor: composerAccent }],
                ]}
              >
                <TouchableOpacity
                  style={styles.musicResultBody}
                  onPress={() => attachMusic(item)}
                  disabled={isImporting}
                >
                  <Text style={[styles.musicResultTitle, { color: composerText }]}>{buildMusicLabel(item)}</Text>
                  <Text style={[styles.musicResultMeta, helperTextStyle]}>
                    {[item.source || "catalog", item.isOriginal ? "original" : null, formatDuration(item.duration)]
                      .filter(Boolean)
                      .join(" • ")}
                  </Text>
                  {previewLabel ? <Text style={[styles.musicPreviewMeta, helperTextStyle]}>{previewLabel}</Text> : null}
                </TouchableOpacity>
                <View style={styles.musicResultActions}>
                  <TouchableOpacity
                    style={[styles.musicResultIconButton, { backgroundColor: elevatedSurfaceColor, borderColor: composerBorderColor }]}
                    onPress={() => {
                      toggleMusicPreview(item).catch(() => undefined);
                    }}
                    disabled={!item.previewUrl || isImporting || isPreviewLoading}
                  >
                    {isPreviewLoading ? (
                      <ActivityIndicator size="small" color={composerText} />
                    ) : (
                      <Icon
                        name={isPreviewing ? "pause" : "play"}
                        size={16}
                        color={item.previewUrl ? composerText : composerMutedText}
                      />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.musicResultIconButton, { backgroundColor: elevatedSurfaceColor, borderColor: composerBorderColor }]}
                    onPress={() => {
                      attachMusic(item).catch(() => undefined);
                    }}
                    disabled={isImporting}
                  >
                    {isImporting ? (
                      <ActivityIndicator size="small" color={composerText} />
                    ) : (
                      <Icon name={isCurrent ? "checkmark-circle" : "add-circle-outline"} size={20} color={composerText} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      </>
    );
  };

  const renderPostControls = () => (
    <>
      <Text style={[styles.sectionLabel, { color: composerText }]}>Post Type</Text>
      <View style={styles.modeRow}>
        {postModes.map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.pill, controlBorderStyle, { backgroundColor: surfaceColor }, postType === mode && [styles.pillActive, activePillStyle]]}
            onPress={() => {
              setPostType(mode);
              setSelectedAssets([]);
            }}
          >
            <Text style={[styles.pillText, { color: postType === mode ? "#fff" : composerText }, postType === mode && styles.pillTextActive]}>{mode}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.sectionLabel, { color: composerText }]}>Caption</Text>
      <TextInput
        style={[styles.input, inputStyle]}
        value={caption}
        onChangeText={setCaption}
        placeholder="Write caption"
        placeholderTextColor={composerMutedText}
        multiline
        maxLength={limits.caption}
      />
      <Text style={[styles.counter, helperTextStyle]}>{caption.length}/{limits.caption}</Text>

      <Text style={[styles.sectionLabel, { color: composerText }]}>Location</Text>
      {renderLocationPicker("post", location, locationSuggestions, locationLoading, setLocation, (value) => {
        setLocation(value);
        setLocationSuggestions([]);
      })}
      {renderMusicPicker("post")}

      <Text style={[styles.sectionLabel, { color: composerText }]}>Hashtags (comma separated)</Text>
      <TextInput style={[styles.inputSingle, inputStyle]} value={hashtagsRaw} onChangeText={setHashtagsRaw} placeholder="fashion, travel" placeholderTextColor={composerMutedText} />

      <Text style={[styles.sectionLabel, { color: composerText }]}>Tag People</Text>
      {renderMentionSelector("post", mentionsRaw)}

      <Text style={[styles.sectionLabel, { color: composerText }]}>Text sticker</Text>
      <TextInput
        style={[styles.inputSingle, inputStyle]}
        value={storyStickerText}
        onChangeText={setStoryStickerText}
        placeholder="Add a text sticker on the post"
        placeholderTextColor={composerMutedText}
        maxLength={60}
      />
      {storyStickerText.trim() ? (
        <>
          <View style={styles.modeRow}>
            {storyTextStickerThemes.map((theme) => (
              <TouchableOpacity
                key={`post-text-theme-${theme}`}
                style={[styles.pill, controlBorderStyle, { backgroundColor: surfaceColor }, storyStickerTextTheme === theme && [styles.pillActive, activePillStyle]]}
                onPress={() => setStoryStickerTextTheme(theme)}
              >
                <Text style={[styles.pillText, { color: storyStickerTextTheme === theme ? "#fff" : composerText }, storyStickerTextTheme === theme && styles.pillTextActive]}>
                  {storyTextStickerThemeLabels[theme]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.modeRow}>
            {storyTextStickerAlignments.map((alignment) => (
              <TouchableOpacity
                key={`post-text-alignment-${alignment}`}
                style={[styles.pill, controlBorderStyle, { backgroundColor: surfaceColor }, storyStickerTextAlignment === alignment && [styles.pillActive, activePillStyle]]}
                onPress={() => setStoryStickerTextAlignment(alignment)}
              >
                <Text style={[styles.pillText, { color: storyStickerTextAlignment === alignment ? "#fff" : composerText }, storyStickerTextAlignment === alignment && styles.pillTextActive]}>
                  {storyTextStickerAlignmentLabels[alignment]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.modeRow}>
            {storyStickerPlacements.map((placement) => (
              <TouchableOpacity
                key={`post-text-${placement}`}
                style={[styles.pill, controlBorderStyle, { backgroundColor: surfaceColor }, storyStickerTextPlacement === placement && [styles.pillActive, activePillStyle]]}
                onPress={() => {
                  setStoryStickerTextPlacement(placement);
                  setStoryStickerTextPosition(storyStickerPresetPositions[placement]);
                }}
              >
                <Text style={[styles.pillText, { color: storyStickerTextPlacement === placement ? "#fff" : composerText }, storyStickerTextPlacement === placement && styles.pillTextActive]}>
                  {storyStickerPlacementLabels[placement]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.stickerScaleRow}>
            <TouchableOpacity style={[styles.scaleButton, { backgroundColor: surfaceColor, borderColor: composerBorderColor }]} onPress={() => setStoryStickerTextScale((value) => clampStickerScale(value - 0.1))}>
              <Text style={[styles.scaleButtonText, { color: composerText }]}>A-</Text>
            </TouchableOpacity>
            <Text style={[styles.scaleValueText, { color: composerText }]}>Text size {storyStickerTextScale.toFixed(1)}x</Text>
            <TouchableOpacity style={[styles.scaleButton, { backgroundColor: surfaceColor, borderColor: composerBorderColor }]} onPress={() => setStoryStickerTextScale((value) => clampStickerScale(value + 0.1))}>
              <Text style={[styles.scaleButtonText, { color: composerText }]}>A+</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.stickerScaleRow}>
            <TouchableOpacity style={[styles.scaleButton, { backgroundColor: surfaceColor, borderColor: composerBorderColor }]} onPress={() => setStoryStickerTextRotation((value) => clampStickerRotation(value - 15))}>
              <Text style={[styles.scaleButtonText, { color: composerText }]}>↺</Text>
            </TouchableOpacity>
            <Text style={[styles.scaleValueText, { color: composerText }]}>Text angle {storyStickerTextRotation}deg</Text>
            <TouchableOpacity style={[styles.scaleButton, { backgroundColor: surfaceColor, borderColor: composerBorderColor }]} onPress={() => setStoryStickerTextRotation((value) => clampStickerRotation(value + 15))}>
              <Text style={[styles.scaleButtonText, { color: composerText }]}>↻</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}

      <Text style={[styles.sectionLabel, { color: composerText }]}>Emoji sticker</Text>
      <TextInput
        style={[styles.inputSingle, inputStyle]}
        value={storyStickerEmoji}
        onChangeText={setStoryStickerEmoji}
        placeholder="✨"
        placeholderTextColor={composerMutedText}
        maxLength={16}
      />
      {storyStickerEmoji.trim() ? (
        <>
          <View style={styles.modeRow}>
            {storyStickerPlacements.map((placement) => (
              <TouchableOpacity
                key={`post-emoji-${placement}`}
                style={[styles.pill, controlBorderStyle, { backgroundColor: surfaceColor }, storyStickerEmojiPlacement === placement && [styles.pillActive, activePillStyle]]}
                onPress={() => {
                  setStoryStickerEmojiPlacement(placement);
                  setStoryStickerEmojiPosition(storyStickerPresetPositions[placement]);
                }}
              >
                <Text style={[styles.pillText, { color: storyStickerEmojiPlacement === placement ? "#fff" : composerText }, storyStickerEmojiPlacement === placement && styles.pillTextActive]}>
                  {storyStickerPlacementLabels[placement]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.stickerScaleRow}>
            <TouchableOpacity style={[styles.scaleButton, { backgroundColor: surfaceColor, borderColor: composerBorderColor }]} onPress={() => setStoryStickerEmojiScale((value) => clampStickerScale(value - 0.1))}>
              <Text style={[styles.scaleButtonText, { color: composerText }]}>-</Text>
            </TouchableOpacity>
            <Text style={[styles.scaleValueText, { color: composerText }]}>Emoji size {storyStickerEmojiScale.toFixed(1)}x</Text>
            <TouchableOpacity style={[styles.scaleButton, { backgroundColor: surfaceColor, borderColor: composerBorderColor }]} onPress={() => setStoryStickerEmojiScale((value) => clampStickerScale(value + 0.1))}>
              <Text style={[styles.scaleButtonText, { color: composerText }]}>+</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.stickerScaleRow}>
            <TouchableOpacity style={[styles.scaleButton, { backgroundColor: surfaceColor, borderColor: composerBorderColor }]} onPress={() => setStoryStickerEmojiRotation((value) => clampStickerRotation(value - 15))}>
              <Text style={[styles.scaleButtonText, { color: composerText }]}>↺</Text>
            </TouchableOpacity>
            <Text style={[styles.scaleValueText, { color: composerText }]}>Emoji angle {storyStickerEmojiRotation}deg</Text>
            <TouchableOpacity style={[styles.scaleButton, { backgroundColor: surfaceColor, borderColor: composerBorderColor }]} onPress={() => setStoryStickerEmojiRotation((value) => clampStickerRotation(value + 15))}>
              <Text style={[styles.scaleButtonText, { color: composerText }]}>↻</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}

      <View style={styles.switchRow}><Text style={[styles.switchLabel, { color: composerText }]}>Allow comments</Text><Switch value={!disableComments} onValueChange={(value) => setDisableComments(!value)} /></View>
      <View style={styles.switchRow}><Text style={[styles.switchLabel, { color: composerText }]}>Share to story</Text><Switch value={sharePostToStory} onValueChange={setSharePostToStory} /></View>
      <View style={styles.switchRow}><Text style={[styles.switchLabel, { color: composerText }]}>Hide like count</Text><Switch value={hideLikeCount} onValueChange={setHideLikeCount} /></View>

      <Text style={[styles.helperText, helperTextStyle]}>
        {postType === "carousel"
          ? "Select up to 10 images for a carousel post."
          : postType === "video"
            ? "Choose a single video. It will upload through the backend media pipeline."
            : "Choose a single image for this post."}
      </Text>
      <Text style={[styles.helperText, helperTextStyle]}>
        Drag stickers directly on the preview. Use two fingers on the canvas to resize and rotate them without leaving the composer.
      </Text>
      <Text style={[styles.helperText, helperTextStyle]}>
        Basic posting is production-focused here: caption, media, location, music, hashtags, mentions, comment control, and like-count privacy are supported. Collaboration/remix controls are hidden until they are fully product-ready.
      </Text>

      {/* Photo Filters for image posts */}
      {renderPhotoFilterStrip()}
    </>
  );

  const renderStoryControls = () => (
    <>
      <Text style={[styles.sectionLabel, { color: colors.text }]}>Story Type</Text>
      <View style={styles.modeRow}>
        {storyModes.map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.pill, controlBorderStyle, { backgroundColor: surfaceColor }, storyType === mode && [styles.pillActive, activePillStyle]]}
            onPress={() => setStoryType(mode)}
          >
            <Text style={[styles.pillText, { color: storyType === mode ? "#fff" : colors.text }, storyType === mode && styles.pillTextActive]}>{mode}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {storyType === "poll" ? (
        <>
          <Text style={[styles.sectionLabel, { color: colors.text }]}>Poll Question</Text>
          <TextInput style={[styles.inputSingle, inputStyle]} value={pollQuestion} onChangeText={setPollQuestion} placeholder="Ask a poll question" placeholderTextColor={colors.mutedText} />
          <Text style={[styles.sectionLabel, { color: colors.text }]}>Option A</Text>
          <TextInput style={[styles.inputSingle, inputStyle]} value={pollOptionA} onChangeText={setPollOptionA} placeholder="Option A" placeholderTextColor={colors.mutedText} />
          <Text style={[styles.sectionLabel, { color: colors.text }]}>Option B</Text>
          <TextInput style={[styles.inputSingle, inputStyle]} value={pollOptionB} onChangeText={setPollOptionB} placeholder="Option B" placeholderTextColor={colors.mutedText} />
        </>
      ) : null}

      {storyType === "question" ? (
        <>
          <Text style={[styles.sectionLabel, { color: colors.text }]}>Question Prompt</Text>
          <TextInput style={[styles.inputSingle, inputStyle]} value={questionPrompt} onChangeText={setQuestionPrompt} placeholder="Ask followers anything" placeholderTextColor={colors.mutedText} />
        </>
      ) : null}

      <Text style={[styles.sectionLabel, { color: colors.text }]}>{storyType === "text" ? "Text story" : "Caption"}</Text>
      <TextInput
        style={[styles.input, inputStyle, storyType === "text" && styles.textStoryInput]}
        value={storyCaption}
        onChangeText={setStoryCaption}
        placeholder={storyType === "text" ? "Share a thought" : "Add story caption"}
        placeholderTextColor={colors.mutedText}
        maxLength={limits.caption}
        multiline
      />
      <Text style={[styles.counter, helperTextStyle]}>{storyCaption.length}/{limits.caption}</Text>

      {storyType === "text" ? (
        <>
          <Text style={[styles.sectionLabel, { color: colors.text }]}>Background</Text>
          <View style={styles.colorRow}>
            {textStoryColors.map((color) => {
              const selected = storyBackgroundColor === color;
              return (
                <TouchableOpacity
                  key={color}
                  style={[styles.colorChip, { backgroundColor: color }, selected && styles.colorChipSelected]}
                  onPress={() => setStoryBackgroundColor(color)}
                />
              );
            })}
          </View>
        </>
      ) : null}

      {storyType !== "text" ? (
        <>
          <Text style={[styles.sectionLabel, { color: colors.text }]}>Filter</Text>
          <View style={styles.modeRow}>
            {storyFilterPresets.map((preset) => (
              <TouchableOpacity
                key={`story-filter-${preset}`}
                style={[styles.pill, controlBorderStyle, { backgroundColor: surfaceColor }, storyFilterPreset === preset && [styles.pillActive, activePillStyle]]}
                onPress={() => setStoryFilterPreset(preset)}
              >
                <Text style={[styles.pillText, { color: storyFilterPreset === preset ? "#fff" : colors.text }, storyFilterPreset === preset && styles.pillTextActive]}>
                  {storyFilterPresetLabels[preset]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {storyFilterPreset !== "none" ? (
            <View style={styles.stickerScaleRow}>
              <TouchableOpacity
                style={[styles.scaleButton, { backgroundColor: surfaceColor, borderColor: colors.border }]}
                onPress={() => setStoryFilterIntensity((value) => Math.max(0.2, Math.round((value - 0.1) * 10) / 10))}
              >
                <Text style={styles.scaleButtonText}>-</Text>
              </TouchableOpacity>
              <Text style={[styles.scaleValueText, { color: colors.text }]}>Filter strength {storyFilterIntensity.toFixed(1)}x</Text>
              <TouchableOpacity
                style={[styles.scaleButton, { backgroundColor: surfaceColor, borderColor: colors.border }]}
                onPress={() => setStoryFilterIntensity((value) => Math.min(1, Math.round((value + 0.1) * 10) / 10))}
              >
                <Text style={styles.scaleButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      ) : null}

      <Text style={[styles.sectionLabel, { color: colors.text }]}>Audience</Text>
      <View style={styles.modeRow}>
        {(["public", "friends", "close_friends", "custom"] as Visibility[]).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.pill, controlBorderStyle, { backgroundColor: surfaceColor }, storyVisibility === mode && [styles.pillActive, activePillStyle]]}
            onPress={() => setStoryVisibility(mode)}
          >
            <Text style={[styles.pillText, { color: storyVisibility === mode ? "#fff" : colors.text }, storyVisibility === mode && styles.pillTextActive]}>{mode}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {storyVisibility === "custom" ? (
        <>
          <Text style={[styles.sectionLabel, { color: colors.text }]}>Custom audience</Text>
          {storyAudienceLoading ? (
            <ActivityIndicator size="small" color="#111827" />
          ) : (
            <View style={styles.audienceWrap}>
              {storyAudienceCandidates.map((user) => {
                const selected = storyVisibleToUserIds.includes(user.id);
                return (
                  <TouchableOpacity
                    key={user.id}
                    style={[styles.audienceChip, selected && styles.audienceChipSelected]}
                    onPress={() => toggleStoryAudienceUser(user.id)}
                  >
                    <Text style={[styles.audienceChipText, selected && styles.audienceChipTextSelected]}>
                      @{user.username}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          <Text style={[styles.helperText, helperTextStyle]}>Only selected users will be able to view this story.</Text>
        </>
      ) : null}

      {renderMusicPicker("story")}

      <Text style={[styles.sectionLabel, { color: colors.text }]}>Link</Text>
      <TextInput
        style={[styles.inputSingle, inputStyle]}
        value={storyLinkUrl}
        onChangeText={setStoryLinkUrl}
        placeholder="https://example.com"
        placeholderTextColor={colors.mutedText}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={[styles.sectionLabel, { color: colors.text }]}>Location</Text>
      {renderLocationPicker("story", storyLocation, storyLocationSuggestions, storyLocationLoading, setStoryLocation, (value) => {
        setStoryLocation(value);
        setStoryLocationSuggestions([]);
      })}

      <Text style={[styles.sectionLabel, { color: colors.text }]}>Hashtags</Text>
      <TextInput
        style={[styles.inputSingle, inputStyle]}
        value={storyHashtagsRaw}
        onChangeText={setStoryHashtagsRaw}
        placeholder="travel, sunrise"
        placeholderTextColor={colors.mutedText}
      />

      <Text style={[styles.sectionLabel, { color: colors.text }]}>Tag People</Text>
      {renderMentionSelector("story", storyMentionsRaw)}

      <Text style={[styles.sectionLabel, { color: colors.text }]}>Text sticker</Text>
      <TextInput
        style={[styles.inputSingle, inputStyle]}
        value={storyStickerText}
        onChangeText={setStoryStickerText}
        placeholder="Add a headline sticker"
        placeholderTextColor={colors.mutedText}
        maxLength={60}
      />
      {storyStickerText.trim() ? (
        <>
          <View style={styles.modeRow}>
            {storyTextStickerThemes.map((theme) => (
              <TouchableOpacity
                key={`text-theme-${theme}`}
                style={[styles.pill, controlBorderStyle, { backgroundColor: surfaceColor }, storyStickerTextTheme === theme && [styles.pillActive, activePillStyle]]}
                onPress={() => setStoryStickerTextTheme(theme)}
              >
                <Text style={[styles.pillText, { color: storyStickerTextTheme === theme ? "#fff" : colors.text }, storyStickerTextTheme === theme && styles.pillTextActive]}>
                  {storyTextStickerThemeLabels[theme]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.modeRow}>
            {storyTextStickerAlignments.map((alignment) => (
              <TouchableOpacity
                key={`text-align-${alignment}`}
                style={[styles.pill, controlBorderStyle, { backgroundColor: surfaceColor }, storyStickerTextAlignment === alignment && [styles.pillActive, activePillStyle]]}
                onPress={() => setStoryStickerTextAlignment(alignment)}
              >
                <Text style={[styles.pillText, { color: storyStickerTextAlignment === alignment ? "#fff" : colors.text }, storyStickerTextAlignment === alignment && styles.pillTextActive]}>
                  {storyTextStickerAlignmentLabels[alignment]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.modeRow}>
            {storyStickerPlacements.map((placement) => (
              <TouchableOpacity
                key={`text-${placement}`}
                style={[styles.pill, controlBorderStyle, { backgroundColor: surfaceColor }, storyStickerTextPlacement === placement && [styles.pillActive, activePillStyle]]}
                onPress={() => {
                  setStoryStickerTextPlacement(placement);
                  setStoryStickerTextPosition(storyStickerPresetPositions[placement]);
                }}
              >
                <Text style={[styles.pillText, { color: storyStickerTextPlacement === placement ? "#fff" : colors.text }, storyStickerTextPlacement === placement && styles.pillTextActive]}>
                  {storyStickerPlacementLabels[placement]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.stickerScaleRow}>
            <TouchableOpacity style={[styles.scaleButton, { backgroundColor: surfaceColor, borderColor: colors.border }]} onPress={() => setStoryStickerTextScale((value) => clampStickerScale(value - 0.1))}>
              <Text style={[styles.scaleButtonText, { color: colors.text }]}>A-</Text>
            </TouchableOpacity>
            <Text style={[styles.scaleValueText, { color: colors.text }]}>Text size {storyStickerTextScale.toFixed(1)}x</Text>
            <TouchableOpacity style={[styles.scaleButton, { backgroundColor: surfaceColor, borderColor: colors.border }]} onPress={() => setStoryStickerTextScale((value) => clampStickerScale(value + 0.1))}>
              <Text style={[styles.scaleButtonText, { color: colors.text }]}>A+</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.stickerScaleRow}>
            <TouchableOpacity style={[styles.scaleButton, { backgroundColor: surfaceColor, borderColor: colors.border }]} onPress={() => setStoryStickerTextRotation((value) => clampStickerRotation(value - 15))}>
              <Text style={[styles.scaleButtonText, { color: colors.text }]}>↺</Text>
            </TouchableOpacity>
            <Text style={[styles.scaleValueText, { color: colors.text }]}>Text angle {storyStickerTextRotation}deg</Text>
            <TouchableOpacity style={[styles.scaleButton, { backgroundColor: surfaceColor, borderColor: colors.border }]} onPress={() => setStoryStickerTextRotation((value) => clampStickerRotation(value + 15))}>
              <Text style={[styles.scaleButtonText, { color: colors.text }]}>↻</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}

      <Text style={[styles.sectionLabel, { color: colors.text }]}>Emoji sticker</Text>
      <TextInput
        style={[styles.inputSingle, inputStyle]}
        value={storyStickerEmoji}
        onChangeText={setStoryStickerEmoji}
        placeholder="✨"
        placeholderTextColor={colors.mutedText}
        maxLength={16}
      />
      {storyStickerEmoji.trim() ? (
        <>
          <View style={styles.modeRow}>
            {storyStickerPlacements.map((placement) => (
              <TouchableOpacity
                key={`emoji-${placement}`}
                style={[styles.pill, controlBorderStyle, { backgroundColor: surfaceColor }, storyStickerEmojiPlacement === placement && [styles.pillActive, activePillStyle]]}
                onPress={() => {
                  setStoryStickerEmojiPlacement(placement);
                  setStoryStickerEmojiPosition(storyStickerPresetPositions[placement]);
                }}
              >
                <Text style={[styles.pillText, { color: storyStickerEmojiPlacement === placement ? "#fff" : colors.text }, storyStickerEmojiPlacement === placement && styles.pillTextActive]}>
                  {storyStickerPlacementLabels[placement]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.stickerScaleRow}>
            <TouchableOpacity style={[styles.scaleButton, { backgroundColor: surfaceColor, borderColor: colors.border }]} onPress={() => setStoryStickerEmojiScale((value) => clampStickerScale(value - 0.1))}>
              <Text style={[styles.scaleButtonText, { color: colors.text }]}>-</Text>
            </TouchableOpacity>
            <Text style={[styles.scaleValueText, { color: colors.text }]}>Emoji size {storyStickerEmojiScale.toFixed(1)}x</Text>
            <TouchableOpacity style={[styles.scaleButton, { backgroundColor: surfaceColor, borderColor: colors.border }]} onPress={() => setStoryStickerEmojiScale((value) => clampStickerScale(value + 0.1))}>
              <Text style={[styles.scaleButtonText, { color: colors.text }]}>+</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.stickerScaleRow}>
            <TouchableOpacity style={[styles.scaleButton, { backgroundColor: surfaceColor, borderColor: colors.border }]} onPress={() => setStoryStickerEmojiRotation((value) => clampStickerRotation(value - 15))}>
              <Text style={[styles.scaleButtonText, { color: colors.text }]}>↺</Text>
            </TouchableOpacity>
            <Text style={[styles.scaleValueText, { color: colors.text }]}>Emoji angle {storyStickerEmojiRotation}deg</Text>
            <TouchableOpacity style={[styles.scaleButton, { backgroundColor: surfaceColor, borderColor: colors.border }]} onPress={() => setStoryStickerEmojiRotation((value) => clampStickerRotation(value + 15))}>
              <Text style={[styles.scaleButtonText, { color: colors.text }]}>↻</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}

      <View style={styles.switchRow}><Text style={[styles.switchLabel, { color: colors.text }]}>Allow replies</Text><Switch value={storyAllowReplies} onValueChange={setStoryAllowReplies} /></View>
      <View style={styles.switchRow}><Text style={[styles.switchLabel, { color: colors.text }]}>Allow sharing</Text><Switch value={storyAllowSharing} onValueChange={setStoryAllowSharing} /></View>

      <Text style={[styles.helperText, helperTextStyle]}>
        {storyType === "text"
          ? "Text stories now publish without requiring media. Polls and questions still need an image background."
          : "Links, location, hashtag, mention, custom text, and emoji story stickers now publish with draggable placement, size, and rotation controls in the preview. Polls and questions still require an image background."}
      </Text>
    </>
  );

  const renderSwipeControls = () => (
    <>
      <Text style={[styles.sectionLabel, { color: colors.text }]}>Caption</Text>
      <TextInput style={[styles.input, inputStyle]} value={caption} onChangeText={setCaption} placeholder="Write swipe caption" placeholderTextColor={colors.mutedText} maxLength={limits.caption} multiline />
      <Text style={[styles.counter, helperTextStyle]}>{caption.length}/{limits.caption}</Text>

      {renderMusicPicker("swipe")}

      <Text style={[styles.sectionLabel, { color: colors.text }]}>Location</Text>
      {renderLocationPicker("swipe", location, locationSuggestions, locationLoading, setLocation, (value) => {
        setLocation(value);
        setLocationSuggestions([]);
      })}

      <Text style={[styles.sectionLabel, { color: colors.text }]}>Hashtags</Text>
      <TextInput style={[styles.inputSingle, inputStyle]} value={hashtagsRaw} onChangeText={setHashtagsRaw} placeholder="fitlife, travel" placeholderTextColor={colors.mutedText} />

      <Text style={[styles.sectionLabel, { color: colors.text }]}>Tag People</Text>
      {renderMentionSelector("swipe", mentionsRaw)}

      <Text style={[styles.helperText, helperTextStyle]}>Swipes require a single short-form video. The backend will create a thumbnail automatically.</Text>
    </>
  );

  const renderStepIntroCard = (title: string, icon: string, description?: string) => (
    <View style={[styles.stepIntroCard, { backgroundColor: elevatedSurfaceColor, borderColor: composerBorderColor }]}>
      <View style={[styles.stepIntroIcon, { backgroundColor: subtleSurfaceColor }]}>
        <Icon name={icon} size={18} color={composerAccent} />
      </View>
      <View style={styles.stepIntroCopy}>
        <Text style={[styles.stepIntroTitle, { color: composerText }]}>{title}</Text>
        {description ? (
          <Text style={[styles.stepIntroDescription, { color: composerMutedText }]}>{description}</Text>
        ) : null}
      </View>
    </View>
  );

  const renderCanvasPanel = (title: string, eyebrow: string) => (
    <View style={[styles.canvasPanel, { backgroundColor: elevatedSurfaceColor, borderColor: composerBorderColor }]}>
      <View style={styles.panelHeaderRow}>
        <View>
          <Text style={[styles.panelEyebrow, { color: composerAccent }]}>{eyebrow}</Text>
          <Text style={[styles.panelTitle, { color: composerText }]}>{title}</Text>
        </View>
        <Text style={[styles.canvasRatioBadge, { color: composerText, backgroundColor: surfaceColor, borderColor: composerBorderColor }]}>
          {activeFrameConfig.label}
        </Text>
      </View>
      {renderMediaPreview()}
    </View>
  );

  const renderSelectStage = () => (
    <>
      {renderStepIntroCard(
        "Choose media",
        "images-outline",
      )}

      {activeTab === "post" ? (
        <>
          <Text style={[styles.sectionLabel, { color: composerText }]}>Post Type</Text>
          <View style={styles.modeRow}>
            {postModes.map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[styles.pill, controlBorderStyle, { backgroundColor: surfaceColor }, postType === mode && [styles.pillActive, activePillStyle]]}
                onPress={() => {
                  setPostType(mode);
                  setSelectedAssets([]);
                }}
              >
                <Text style={[styles.pillText, { color: postType === mode ? "#fff" : composerText }, postType === mode && styles.pillTextActive]}>{mode}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}

      {activeTab === "story" ? (
        <>
          <Text style={[styles.sectionLabel, { color: composerText }]}>Story Type</Text>
          <View style={styles.modeRow}>
            {storyModes.map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[styles.pill, controlBorderStyle, { backgroundColor: surfaceColor }, storyType === mode && [styles.pillActive, activePillStyle]]}
                onPress={() => setStoryType(mode)}
              >
                <Text style={[styles.pillText, { color: storyType === mode ? "#fff" : composerText }, storyType === mode && styles.pillTextActive]}>{mode}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}

      {renderCanvasPanel(
      activeTab === "story" ? "Story canvas" : activeTab === "swipe" ? "Swipe cover preview" : "Post preview",
        "Select",
      )}
      {renderFrameSelector()}
      {renderMediaSelectorPanel()}
    </>
  );

  const renderEditStage = () => (
    <>
      {renderStepIntroCard(
        "Adjust content",
        "sparkles-outline",
      )}
      {renderCanvasPanel(
      activeTab === "story" ? "Preview your story edits" : activeTab === "swipe" ? "Preview your swipe edits" : "Preview your post edits",
        "Edit",
      )}
      {renderEditorToolRail()}
      {activeTab === "post" ? renderPhotoFilterStrip() : null}
      {activeTab === "story" && storyType === "text" ? (
        <>
          <Text style={[styles.sectionLabel, { color: composerText }]}>Background</Text>
          <View style={styles.colorRow}>
            {textStoryColors.map((color) => {
              const selected = storyBackgroundColor === color;
              return (
                <TouchableOpacity
                  key={`edit-${color}`}
                  style={[styles.colorChip, { backgroundColor: color }, selected && styles.colorChipSelected]}
                  onPress={() => setStoryBackgroundColor(color)}
                />
              );
            })}
          </View>
        </>
      ) : null}
      {activeTab === "story" && storyType !== "text" ? (
        <>
          <Text style={[styles.sectionLabel, { color: composerText }]}>Story Filter</Text>
          <View style={styles.modeRow}>
            {storyFilterPresets.map((preset) => (
              <TouchableOpacity
                key={`edit-story-filter-${preset}`}
                style={[styles.pill, controlBorderStyle, { backgroundColor: surfaceColor }, storyFilterPreset === preset && [styles.pillActive, activePillStyle]]}
                onPress={() => setStoryFilterPreset(preset)}
              >
                <Text style={[styles.pillText, { color: storyFilterPreset === preset ? "#fff" : composerText }, storyFilterPreset === preset && styles.pillTextActive]}>
                  {storyFilterPresetLabels[preset]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}
    </>
  );

  const renderShareStage = () => (
    <>
      {renderStepIntroCard(
        "Details and publish",
        "paper-plane-outline",
      )}
      {renderCanvasPanel(
      activeTab === "story" ? "Ready-to-publish story" : activeTab === "swipe" ? "Ready-to-publish swipe" : "Ready-to-publish post",
        "Share",
      )}
      {activeTab === "post" ? renderPostControls() : null}
      {activeTab === "story" ? renderStoryControls() : null}
      {activeTab === "swipe" ? renderSwipeControls() : null}
    </>
  );

  const renderActiveStep = () => {
    if (activeStep === "select") {
      return renderSelectStage();
    }

    if (activeStep === "edit") {
      return renderEditStage();
    }

    return renderShareStage();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: composerBackground }]}>
      <KeyboardAvoidingView style={styles.container} behavior="padding">
        <InstagramComposerHeader
          title={headerTitle}
          borderColor={composerBorderColor}
          backgroundColor={surfaceColor}
          accentColor={composerAccent}
          textColor={composerText}
          mutedTextColor={composerMutedText}
          draftBusy={savingDraft}
          primaryBusy={publishing}
          primaryLabel={headerPrimaryLabel}
          onBack={handleBackPress}
          onDraft={() => {
            saveDraft().catch(() => undefined);
          }}
          onPrimary={handlePrimaryHeaderAction}
        />
        <InstagramComposerTypeTabs
          activeTab={activeTab}
          accentColor={composerAccent}
          textColor={composerText}
          mutedTextColor={composerMutedText}
          borderColor={composerBorderColor}
          surfaceColor={surfaceColor}
          onSelectTab={onSelectTab}
        />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <InstagramComposerStepStrip
            activeStep={activeStep}
            accentColor={composerAccent}
            textColor={composerText}
            mutedTextColor={composerMutedText}
            borderColor={composerBorderColor}
            surfaceColor={surfaceColor}
            subtleSurfaceColor={subtleSurfaceColor}
            onSelectStep={moveToStep}
          />

          {publishError ? (
            <View
              style={[
                styles.errorBanner,
                {
                  backgroundColor: isDarkMode ? "#3b1f24" : "#FEF2F2",
                  borderColor: isDarkMode ? "#7f1d1d" : "#FECACA",
                },
              ]}
            >
              <Text style={[styles.errorBannerTitle, { color: isDarkMode ? "#FECACA" : "#991B1B" }]}>Publish issue</Text>
              <Text style={[styles.errorBannerText, { color: isDarkMode ? "#FCA5A5" : "#B91C1C" }]}>{publishError}</Text>
            </View>
          ) : null}

          {renderActiveStep()}

          <TouchableOpacity
            style={[styles.saveDraftButton, { backgroundColor: surfaceColor, borderColor: composerBorderColor }, savingDraft && styles.publishButtonDisabled]}
            onPress={saveDraft}
            disabled={savingDraft}
          >
            <Icon name="bookmark-outline" size={18} color={composerText} />
            <Text style={[styles.saveDraftText, { color: composerText }]}>
              {savingDraft ? "Saving Draft..." : "Save Draft"}
            </Text>
          </TouchableOpacity>

          {activeStep === "share" ? (
            <TouchableOpacity
              style={[styles.publishButton, { backgroundColor: composerAccent }, publishing && styles.publishButtonDisabled]}
              onPress={publish}
              disabled={publishing}
            >
              <Icon name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={styles.publishText}>
                {publishing ? "Publishing..." : `Publish ${composerBlueprints[activeTab].label}`}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.publishButton, { backgroundColor: composerAccent }]}
              onPress={handlePrimaryHeaderAction}
            >
              <Icon name="arrow-forward-outline" size={18} color="#fff" />
              <Text style={styles.publishText}>Continue to {activeStep === "select" ? "Edit" : "Share"}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
        <StickerPickerSheet
          visible={showStickerPickerSheet}
          onClose={() => setShowStickerPickerSheet(false)}
          preferredMode="stickers"
          onSend={addStoryStickerFromPicker}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050608" },
  header: {
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerKicker: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  headerTitle: { fontSize: 24, fontWeight: "900", color: "#ffffff", letterSpacing: -0.6 },
  headerAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  headerActionText: { fontSize: 12, fontWeight: "800" },
  stepIntroCard: {
    marginBottom: 16,
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepIntroIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  stepIntroCopy: {
    flex: 1,
  },
  stepIntroTitle: {
    fontSize: 16,
    fontWeight: "900",
  },
  stepIntroDescription: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  instagramHero: {
    borderRadius: 30,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  instagramHeroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  instagramEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.8)",
  },
  instagramTitle: {
    marginTop: 4,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.8,
    color: "#ffffff",
  },
  instagramSubtitle: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    color: "rgba(255,255,255,0.84)",
  },
  instagramHeroIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  instagramMetricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18,
  },
  instagramMetricCard: {
    minWidth: "47%",
    flexGrow: 1,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  instagramMetricValue: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  instagramMetricLabel: {
    marginTop: 4,
    color: "rgba(255,255,255,0.68)",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  frameCard: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 24,
    padding: 14,
  },
  frameOptionRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  frameChip: {
    minWidth: 96,
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  frameChipLabel: {
    fontSize: 14,
    fontWeight: "900",
  },
  frameChipDetail: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "700",
  },
  quickToolCard: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 24,
    padding: 14,
  },
  quickToolRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  quickToolButton: {
    minWidth: "30%",
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 74,
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  quickToolLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  quickToolDetail: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  dynamicPreviewShell: {
    alignSelf: "center",
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#0b0d12",
  },
  previewMediaFill: {
    width: "100%",
    height: "100%",
  },
  previewMetaOverlay: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  previewMetaChip: {
    maxWidth: "82%",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(9,11,15,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  previewMetaChipText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },
  previewPagerRow: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 14,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  previewPagerDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  previewPagerDotActive: {
    width: 20,
    backgroundColor: "#ffffff",
  },
  bottomModeDock: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
  },
  bottomModeTab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  bottomModeText: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.25,
  },
  modeCardsGrid: {
    flexDirection: "row",
    gap: 10,
  },
  createModeCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 22,
    overflow: "hidden",
    shadowColor: "#111827",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  createModeCardActive: {
    transform: [{ translateY: -2 }],
    shadowOpacity: 0.16,
    elevation: 6,
  },
  createModePreview: {
    height: 92,
    padding: 12,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  previewGridOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
  },
  previewSpark: {
    position: "absolute",
    right: -18,
    top: -24,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  previewSparkSmall: {
    left: 12,
    top: 54,
    right: undefined,
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  createModeMeta: {
    alignSelf: "flex-start",
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  createModeBody: { paddingHorizontal: 12, paddingVertical: 12 },
  createModeTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  createModeTitle: { fontSize: 15, fontWeight: "900" },
  createModeDescription: { marginTop: 6, fontSize: 11.5, lineHeight: 16 },
  studioHero: {
    marginTop: 16,
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: "#111827",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 7,
  },
  studioHeroShade: {
    padding: 18,
    backgroundColor: "rgba(5,8,22,0.16)",
  },
  studioHeroTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  studioKicker: { color: "rgba(255,255,255,0.78)", fontWeight: "900", fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase" },
  studioTitle: { color: "#fff", fontSize: 29, fontWeight: "900", letterSpacing: -0.8, marginTop: 4 },
  studioIconBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
  },
  studioDescription: { color: "rgba(255,255,255,0.88)", marginTop: 12, lineHeight: 20, fontWeight: "600" },
  studioMetricRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  studioMetric: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  studioMetricValue: { color: "#fff", fontSize: 12, fontWeight: "900", textTransform: "capitalize" },
  studioMetricLabel: { color: "rgba(255,255,255,0.72)", marginTop: 3, fontSize: 10, fontWeight: "700" },
  canvasPanel: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 26,
    padding: 12,
  },
  panelHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  panelEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  panelTitle: { marginTop: 3, fontSize: 16, fontWeight: "900", letterSpacing: -0.2 },
  canvasRatioBadge: {
    overflow: "hidden",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontWeight: "900",
    fontSize: 12,
  },
  mediaSelectorPanel: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 24,
    padding: 14,
  },
  galleryTabsRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  galleryTab: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  galleryTabText: { fontSize: 12, fontWeight: "900" },
  selectorSkeletonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  selectorSkeletonCell: {
    width: "31.6%",
    aspectRatio: 1,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineMediaToolRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  toolRailCard: {
    marginTop: 14,
  },
  pipelineBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  pipelineBadgeText: { fontSize: 11, fontWeight: "900" },
  toolRail: { gap: 10, paddingRight: 4 },
  toolCard: {
    width: 122,
    borderWidth: 1,
    borderRadius: 20,
    padding: 12,
  },
  toolIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  toolTitle: { marginTop: 10, fontSize: 14, fontWeight: "900" },
  toolDetail: { marginTop: 4, fontSize: 11.5, lineHeight: 16 },
  pipelineText: { marginTop: 10, lineHeight: 19 },
  previewSharePanel: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 24,
    padding: 14,
  },
  shareOptionRow: { flexDirection: "row", gap: 8 },
  visibilityChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  visibilityChipText: { fontWeight: "900", fontSize: 12 },
  mediaActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  secondaryPickButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  secondaryPickButtonText: {
    marginLeft: 6,
    color: "#111827",
    fontWeight: "700",
  },
  tabsRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#dadada",
    borderRadius: 14,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  tabButtonActive: {
    backgroundColor: "#0f0f0f",
    borderColor: "#0f0f0f",
  },
  tabText: { fontWeight: "700", color: "#595959", fontSize: 12 },
  tabTextActive: { color: "#fff" },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 116 },
  errorBanner: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  errorBannerTitle: {
    color: "#991B1B",
    fontWeight: "800",
    marginBottom: 4,
  },
  errorBannerText: {
    color: "#B91C1C",
    lineHeight: 19,
  },
  preview: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 22,
    backgroundColor: "#efefef",
  },
  verticalPreview: {
    width: "76%",
    aspectRatio: 9 / 16,
    alignSelf: "center",
    borderRadius: 24,
    backgroundColor: "#050816",
  },
  storyPreviewFrame: {
    width: "76%",
    aspectRatio: 9 / 16,
    alignSelf: "center",
    borderRadius: 24,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#050816",
  },
  emptyPreview: {
    aspectRatio: 1,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 24,
  },
  emptyPreviewVertical: {
    width: "76%",
    aspectRatio: 9 / 16,
    alignSelf: "center",
  },
  emptyPreviewTitle: { marginTop: 12, fontSize: 16, fontWeight: "700", color: "#111827" },
  emptyPreviewText: { marginTop: 6, textAlign: "center", color: "#6b7280", lineHeight: 20 },
  videoPreviewCard: {
    height: 250,
    borderRadius: 18,
    backgroundColor: "#111827",
    justifyContent: "center",
    alignItems: "center",
  },
  videoPreviewTitle: { marginTop: 12, color: "#fff", fontSize: 18, fontWeight: "700" },
  videoPreviewText: { marginTop: 6, color: "#cbd5e1" },
  textStoryPreview: {
    width: "76%",
    aspectRatio: 9 / 16,
    alignSelf: "center",
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 28,
    overflow: "hidden",
    position: "relative",
  },
  textStoryPreviewText: {
    color: "#fff",
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "700",
    textAlign: "center",
  },
  storyPreviewStickerLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  storyFilterOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  storyPreviewEmojiSticker: {
    position: "absolute",
  },
  storyPreviewEmojiText: {
    fontSize: 34,
  },
  storyPreviewTextSticker: {
    position: "absolute",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(15,23,42,0.56)",
  },
  storyPreviewTextStickerText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  mediaSectionHeader: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionLabel: { marginTop: 16, marginBottom: 8, fontSize: 13, fontWeight: "700", color: "#111" },
  musicSearchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  musicSearchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 14,
    minHeight: 46,
    paddingHorizontal: 14,
    color: "#111827",
    backgroundColor: "#fff",
  },
  musicActionButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#111827",
    justifyContent: "center",
    alignItems: "center",
  },
  musicSecondaryButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d1d5db",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  musicCard: {
    marginTop: 12,
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  musicCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  musicTitleBlock: { flex: 1 },
  musicTitle: { fontSize: 15, fontWeight: "800", color: "#111827" },
  musicMeta: { marginTop: 4, color: "#6b7280", fontSize: 12 },
  musicClearButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  musicClearText: { color: "#111827", fontWeight: "700", fontSize: 12 },
  clipAdjustRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  clipAdjustGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  clipAdjustButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "#111827",
  },
  clipAdjustText: { color: "#fff", fontWeight: "700" },
  clipAdjustValue: { flex: 1, textAlign: "center", color: "#374151", fontWeight: "600" },
  musicError: { marginTop: 10, color: "#b91c1c", fontWeight: "600" },
  musicResultsWrap: { marginTop: 12, gap: 10 },
  musicResultCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  musicResultCardActive: {
    borderColor: "#111827",
    backgroundColor: "#f9fafb",
  },
  musicResultBody: { flex: 1 },
  musicResultTitle: { color: "#111827", fontWeight: "800" },
  musicResultMeta: { marginTop: 4, color: "#6b7280", fontSize: 12 },
  musicPreviewMeta: { marginTop: 4, color: "#6b7280", fontSize: 12, fontWeight: "600" },
  musicResultActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  musicResultIconButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d1d5db",
    justifyContent: "center",
    alignItems: "center",
  },
  pickButton: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#111827",
    borderRadius: 999,
    paddingHorizontal: 12,
    height: 34,
  },
  pickButtonText: { color: "#fff", fontWeight: "700" },
  assetRow: { paddingTop: 12, paddingBottom: 4 },
  assetChip: { marginRight: 10, position: "relative" },
  assetChipActive: { transform: [{ translateY: -2 }] },
  assetThumb: { width: 76, height: 76, borderRadius: 14, backgroundColor: "#e5e7eb" },
  assetThumbVideo: { justifyContent: "center", alignItems: "center", backgroundColor: "#111827" },
  assetIndexBadge: {
    position: "absolute",
    left: 6,
    bottom: 6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    backgroundColor: "rgba(17,24,39,0.82)",
  },
  assetIndexText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  assetRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(17,24,39,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  modeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: {
    borderWidth: 1,
    borderColor: "#d7d7d7",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  pillActive: { backgroundColor: "#111827", borderColor: "#111827" },
  pillText: { color: "#444", fontWeight: "700" },
  pillTextActive: { color: "#fff" },
  stickerScaleRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  scaleButton: {
    minWidth: 44,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d1d5db",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  scaleButtonText: {
    color: "#111827",
    fontWeight: "800",
  },
  scaleValueText: {
    color: "#374151",
    fontWeight: "700",
    flexShrink: 1,
  },
  audienceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  audienceChip: {
    borderWidth: 1,
    borderColor: "#d7d7d7",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  audienceChipSelected: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  audienceChipText: { color: "#374151", fontWeight: "600" },
  audienceChipTextSelected: { color: "#fff" },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  colorChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorChipSelected: {
    borderColor: "#111827",
  },
  input: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    textAlignVertical: "top",
  },
  textStoryInput: {
    minHeight: 140,
  },
  inputSingle: {
    height: 48,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  locationSuggestionsCard: {
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  locationSuggestionsLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  locationSuggestionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  locationSuggestionBody: {
    flex: 1,
  },
  locationSuggestionName: {
    fontSize: 14,
    fontWeight: "700",
  },
  locationSuggestionMeta: {
    marginTop: 2,
    fontSize: 12,
    color: "#6b7280",
  },
  selectorCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
  },
  selectorCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  selectorTitle: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "800",
  },
  locationInputRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  locationSearchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 46,
    paddingHorizontal: 14,
    color: "#111827",
    backgroundColor: "#fff",
  },
  locationActionButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  seedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  seedChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  seedChipText: {
    fontSize: 12,
    fontWeight: "800",
  },
  friendSelectorWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  friendSelectorChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  friendSelectorText: {
    fontSize: 12,
    fontWeight: "800",
  },
  counter: { marginTop: 6, color: "#666", fontSize: 12 },
  switchRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  switchLabel: { color: "#222", fontWeight: "600", flex: 1, paddingRight: 8 },
  helperText: { marginTop: 10, color: "#6b7280", lineHeight: 20 },
  saveDraftButton: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 46,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
  },
  saveDraftText: { fontWeight: "900", fontSize: 14 },
  publishButton: {
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: "#111827",
    minHeight: 46,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
  },
  publishButtonDisabled: { opacity: 0.7 },
  publishText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  mediaActionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  mediaActionText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
});

export default CreatePostScreen;
