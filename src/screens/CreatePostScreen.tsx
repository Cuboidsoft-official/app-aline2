import React, { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  BackHandler,
  FlatList,
  Image,
  KeyboardAvoidingView,
  PanResponder,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";
import {
  errorCodes,
  isErrorWithCode,
  keepLocalCopy,
  pick,
  types,
} from "@react-native-documents/picker";
import { trim as trimMedia } from "react-native-video-trim";
import { RTCView, mediaDevices } from "react-native-webrtc";
import Video from "react-native-video";

import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import AppBottomDock, { APP_BOTTOM_DOCK_BASE_HEIGHT } from "../components/AppBottomDock";
import DraggableBottomSheet from "../components/DraggableBottomSheet";
import MentionSuggestionList from "../components/MentionSuggestionList";
import { Alert } from "../utils/appAlert";
import {
  captureComposerAssets,
  ComposerAsset,
  createRemoteComposerAsset,
  pickComposerAssets,
  UploadComposerAssetsOptions,
  uploadComposerAssets,
} from "../features/social/mediaUpload";
import { socialApi } from "../features/social/socialApi";
import {
  CreatePostInput,
  CreateStoryInput,
  CreateSwipeInput,
  SelectedMusicClip,
  StoryFilterPreset,
  StorySticker,
  StoryStickerTextAlignment,
  StoryTextStickerTheme,
  Visibility,
} from "../features/social/types";
import ProgressiveImage from "../features/social/components/ProgressiveImage";
import SocialVideo from "../features/social/components/SocialVideo";
import { limits, parseCaptionEntities, toUserSafeMessage } from "../features/social/validation";
import {
  getTrendingMusicCatalog,
  importMusicCatalogItem,
  searchMusicCatalog,
} from "../utils/musicApi";
import { normalizeMediaUrl } from "../utils/mediaUrls";
import { postMultipart } from "../utils/multipartUpload";
import { PHOTO_FILTER_LIST } from "../utils/photoFilters";
import { fetchEmojiStickers, fetchStickersForChat, searchStickers, type ChatSticker } from "../utils/chatStickerApi";
import { appFonts } from "../theme/designSystem";
import { useAppTheme } from "../theme/AppThemeContext";
import { ensureCameraPermission } from "../utils/permissions";
import { VIDEO_DURATION_LIMITS } from "../utils/videoTrimConfig";
import { useAudioTrimPreview } from "../hooks/useAudioTrimPreview";
import { startPublishTask } from "../features/social/publishQueue";
import { getActiveMentionQuery, insertMentionAtCursorEnd, mapMentionCandidate, MentionCandidate } from "../utils/mentionComposer";

let ColorMatrix: any = null;
try {
  ColorMatrix = require("react-native-color-matrix-image-filters").ColorMatrix;
} catch {
  ColorMatrix = null;
}

type ComposerMode = "post" | "story" | "swipe";
type ComposerStage = "launcher" | "edit" | "details";

type AspectOption = {
  id: string;
  label: string;
  detail: string;
  ratio: number;
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

type MusicResultItem = SelectedMusicClip & {
  youtubeVideoId?: string;
  channelTitle?: string;
};

type StoryToolPanel = "text" | "color" | "font" | "size" | "filters" | "sticker" | null;
type ComposerEditToolPanel = "layout" | "filters" | "tag" | "music" | "trim" | "text" | "color" | "font" | "size" | null;
type StoryTextFontVariant = "bold" | "italic" | "clean" | "soft";
type MusicPreviewMode = "audio";

const MODE_ORDER: ComposerMode[] = ["post", "swipe", "story"];
const POST_ASPECTS: AspectOption[] = [
  { id: "square", label: "1:1", detail: "Square", ratio: 1 },
  { id: "landscape", label: "16:9", detail: "Landscape", ratio: 16 / 9 },
  { id: "portrait", label: "4:5", detail: "Portrait", ratio: 4 / 5 },
  { id: "vertical", label: "9:16", detail: "Vertical", ratio: 9 / 16 },
];
const TALL_ASPECTS: AspectOption[] = [
  { id: "vertical", label: "9:16", detail: "Vertical", ratio: 9 / 16 },
  { id: "portrait", label: "4:5", detail: "Portrait", ratio: 4 / 5 },
];
const ASPECTS_BY_MODE: Record<ComposerMode, AspectOption[]> = {
  post: POST_ASPECTS,
  story: TALL_ASPECTS,
  swipe: TALL_ASPECTS,
};
const DEFAULT_ASPECT_BY_MODE: Record<ComposerMode, string> = {
  post: "portrait",
  story: "vertical",
  swipe: "vertical",
};
const CREATE_DOCK_OFFSET = APP_BOTTOM_DOCK_BASE_HEIGHT + 4;
const MODE_COPY: Record<
  ComposerMode,
  {
    label: string;
    title: string;
    subtitle: string;
    emptyLabel: string;
    galleryLabel: string;
    cameraLabel: string;
    icon: string;
  }
> = {
  post: {
    label: "Post",
    title: "Post",
    subtitle: "Share a clean photo or video post.",
    emptyLabel: "Choose or capture media to start a post.",
    galleryLabel: "Pick from gallery",
    cameraLabel: "Open camera",
    icon: "grid-outline",
  },
  story: {
    label: "Story",
    title: "Story",
    subtitle: "Capture something quick and vertical.",
    emptyLabel: "Choose or capture media to start a story.",
    galleryLabel: "Story from gallery",
    cameraLabel: "Story with camera",
    icon: "sparkles-outline",
  },
  swipe: {
    label: "Swipes",
    title: "Swipes",
    subtitle: "Record or select a short video.",
    emptyLabel: "Choose or record a video to start a swipe.",
    galleryLabel: "Video from gallery",
    cameraLabel: "Record video",
    icon: "play-circle-outline",
  },
};
const LOCATION_SEEDS = ["Nearby", "Studio", "Cafe", "Beach", "Restaurant", "Office"];
const MUSIC_PICKER_PAGE_SIZE = 24;
const MUSIC_DISCOVERY_FALLBACK_QUERIES = ["love", "party", "happy", "summer"];
const PHOTO_PICKER_MAX_DIMENSION = 2160;
const PHOTO_PICKER_QUALITY = 0.8;
const STORY_TEXT_THEMES: Array<{
  id: StoryTextStickerTheme;
  label: string;
  color: string;
  backgroundColor: string;
}> = [
  { id: "dark", label: "Dark", color: "#ffffff", backgroundColor: "rgba(15,23,42,0.62)" },
  { id: "light", label: "Light", color: "#0f172a", backgroundColor: "rgba(255,255,255,0.92)" },
  { id: "accent", label: "Accent", color: "#ffffff", backgroundColor: "rgba(219,39,119,0.84)" },
  { id: "outline", label: "Outline", color: "#ffffff", backgroundColor: "rgba(15,23,42,0.18)" },
];
const STORY_TEXT_FONT_OPTIONS: Array<{
  id: StoryTextFontVariant;
  label: string;
  fontFamily: string;
  fontStyle?: "normal" | "italic";
}> = [
  { id: "bold", label: "Bold", fontFamily: appFonts.bold, fontStyle: "normal" },
  { id: "italic", label: "Italic", fontFamily: appFonts.regular, fontStyle: "italic" },
  { id: "clean", label: "Clean", fontFamily: appFonts.semibold, fontStyle: "normal" },
  { id: "soft", label: "Soft", fontFamily: appFonts.regular, fontStyle: "normal" },
];
const STORY_FILTER_OPTIONS: Array<{ id: StoryFilterPreset; label: string }> = [
  { id: "none", label: "Original" },
  { id: "warm", label: "Warm" },
  { id: "cool", label: "Cool" },
  { id: "noir", label: "Noir" },
  { id: "dream", label: "Dream" },
];
const STORY_BACKGROUND_COLORS = [
  "#101828",
  "#1D4ED8",
  "#0F766E",
  "#BE185D",
  "#7C3AED",
  "#EA580C",
  "#334155",
  "#E11D48",
  "#F59E0B",
  "#14B8A6",
  "#2563EB",
  "#8B5CF6",
  "#111827",
  "#F8FAFC",
];
const STORY_TEXT_COLOR_OPTIONS = [
  "#FFFFFF",
  "#0F172A",
  "#F43F5E",
  "#F97316",
  "#FACC15",
  "#10B981",
  "#06B6D4",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
];
const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.round(Number(seconds || 0)));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(() => resolve(), ms));

const getDocumentPickerMessage = (error: any, fallback = "Audio pick failed"): string => {
  if (!isErrorWithCode(error)) {
    return fallback;
  }

  switch (error.code) {
    case errorCodes.OPERATION_CANCELED:
      return "";
    case errorCodes.IN_PROGRESS:
      return "The picker is already open.";
    case errorCodes.NULL_PRESENTER:
      return "Could not open the picker right now.";
    case errorCodes.UNABLE_TO_OPEN_FILE_TYPE:
      return "This audio type could not be opened on your device.";
    default:
      return fallback;
  }
};

const buildUploadedTrackTitle = (value: string): string => {
  const trimmedValue = String(value || "").trim();
  if (!trimmedValue) {
    return "My audio";
  }

  return trimmedValue.replace(/\.[^.]+$/, "").trim() || "My audio";
};

const inferAudioMimeType = (fileName: string, fallbackType?: string | null): string => {
  const normalizedFallback = String(fallbackType || "").trim().toLowerCase();
  if (normalizedFallback.startsWith("audio/")) {
    return normalizedFallback;
  }

  const extension = String(fileName || "")
    .trim()
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/)?.[1];

  switch (extension) {
    case "mp3":
      return "audio/mpeg";
    case "m4a":
      return "audio/mp4";
    case "aac":
      return "audio/aac";
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "oga":
    case "opus":
      return "audio/ogg";
    case "flac":
      return "audio/flac";
    default:
      return normalizedFallback || "audio/mpeg";
  }
};

const buildStoryOverlayTint = (preset: StoryFilterPreset, intensity: number) => {
  switch (preset) {
    case "warm":
      return { backgroundColor: `rgba(248, 168, 72, ${0.09 * intensity})` };
    case "cool":
      return { backgroundColor: `rgba(84, 142, 255, ${0.1 * intensity})` };
    case "noir":
      return { backgroundColor: `rgba(15, 23, 42, ${0.18 * intensity})` };
    case "dream":
      return { backgroundColor: `rgba(255, 138, 196, ${0.1 * intensity})` };
    case "none":
    default:
      return null;
  }
};

const toAlphaColor = (value: string, alpha: number): string => {
  const normalized = String(value || "").trim().replace("#", "");

  if (!/^[\da-fA-F]{6}$/.test(normalized)) {
    return value;
  }

  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const normalizeLocalFileUri = (value: string): string => {
  const raw = String(value || "").trim();

  if (!raw || /^(file|content|https?):\/\//i.test(raw)) {
    return raw;
  }

  return `file://${raw}`;
};

const defaultClipDuration = (mode: ComposerMode, trackDuration: number): number => {
  const safe = Math.max(1, Math.round(trackDuration || 0));

  return Math.min(30, safe);
};

const findAspectOption = (mode: ComposerMode, aspectId: string | undefined) =>
  ASPECTS_BY_MODE[mode].find((item) => item.id === aspectId) || ASPECTS_BY_MODE[mode][0];

const buildMusicLabel = (music: SelectedMusicClip | null | undefined) =>
  [music?.title, music?.artist].filter(Boolean).join(" • ");

const getMusicClipPlaybackUrl = (music: Partial<SelectedMusicClip> | null | undefined) =>
  String(music?.audioUrl || music?.streamUrl || music?.previewUrl || "").trim();

const hasPlayableMusicClip = (music: Partial<SelectedMusicClip> | null | undefined) =>
  !!getMusicClipPlaybackUrl(music);

const dedupeMusicResults = (items: MusicResultItem[]) => {
  const seen = new Set<string>();
  const nextItems: MusicResultItem[] = [];

  items.forEach((item) => {
    const key = String(
      item.id
      || item.externalId
      || `${item.source || "music"}:${item.title || ""}:${item.artist || ""}`,
    ).trim();

    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    nextItems.push(item);
  });

  return nextItems;
};

const prioritizeFreshMusicResults = (items: MusicResultItem[]) =>
  [...items].sort((left, right) => {
    const leftSource = String(left.source || "").trim().toLowerCase();
    const rightSource = String(right.source || "").trim().toLowerCase();

    if (leftSource === "upload" && rightSource !== "upload") {
      return -1;
    }

    if (rightSource === "upload" && leftSource !== "upload") {
      return 1;
    }

    const leftIsExternal = !isPersistedMusicId(left.id);
    const rightIsExternal = !isPersistedMusicId(right.id);

    if (leftIsExternal !== rightIsExternal) {
      return leftIsExternal ? -1 : 1;
    }

    return 0;
  });

const isPersistedMusicId = (value: unknown) =>
  /^[a-fA-F0-9]{24}$/.test(String(value || "").trim());

const hasTrimmedMusicSelection = (music: SelectedMusicClip | null | undefined) =>
  !!music && typeof music.clipDuration === "number" && music.clipDuration > 0;

const buildAspectMetadata = (
  uploadedMedia: CreatePostInput["media"][number],
  sourceAsset: ComposerAsset | null,
  ratio: number,
) => {
  const safeRatio = Math.max(0.5, Math.min(2, Number(ratio) || 1));
  const sourceWidth = Math.max(720, Math.round(Number(sourceAsset?.width || uploadedMedia.width || 0) || 0));
  const sourceHeight = Math.max(720, Math.round(Number(sourceAsset?.height || uploadedMedia.height || 0) || 0));

  if (safeRatio >= 1) {
    const width = Math.max(sourceWidth, Math.round(sourceHeight * safeRatio));
    return {
      ...uploadedMedia,
      width,
      height: Math.round(width / safeRatio),
    };
  }

  const height = Math.max(sourceHeight, Math.round(sourceWidth / safeRatio));
  return {
    ...uploadedMedia,
    width: Math.round(height * safeRatio),
    height,
  };
};

const mapAudienceCandidate = (user: any): AudienceCandidate | null => {
  const id = String(user?._id || user?.id || "").trim();
  const username = String(user?.username || "").replace(/^@/, "").trim();

  if (!id || !username) {
    return null;
  }

  return {
    id,
    username,
    name: String(user?.name || user?.fullName || user?.username || "User").trim(),
  };
};

const buildTaggedUserPayload = (users: AudienceCandidate[]) =>
  users.map((user) => ({
    user: user.id,
    username: user.username,
    position: { x: 0.5, y: 0.5 },
    mediaIndex: 0,
  }));

const appendMentionToken = (draft: string, username: string) => {
  const token = `@${username}`;
  const normalizedDraft = String(draft || "").trim();

  if (!token || normalizedDraft.toLowerCase().includes(token.toLowerCase())) {
    return draft;
  }

  return `${normalizedDraft}${normalizedDraft ? " " : ""}${token}`.slice(0, limits.caption);
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
    .map((part: string | undefined) => String(part || "").trim())
    .filter(Boolean);

  return parts.length ? parts.slice(0, 3).join(", ") : formatCoordinateLocation(latitude, longitude);
};

function RangeSlider({
  duration,
  startTime,
  clipDuration,
  onChange,
  accentColor,
  mutedColor,
  showWaveform = false,
}: {
  duration: number;
  startTime: number;
  clipDuration: number;
  onChange: (nextStart: number, nextDuration: number) => void;
  accentColor: string;
  mutedColor: string;
  showWaveform?: boolean;
}) {
  const sliderScrollRef = useRef<ScrollView | null>(null);
  const dragWindowRef = useRef({ startPx: 0, endPx: 0 });
  const [isDraggingHandle, setIsDraggingHandle] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const safeDuration = Math.max(1, Math.round(duration || 1));
  const normalizedClipDuration = clamp(Math.round(Number(clipDuration || 1) || 1), 1, safeDuration);
  const endTime = clamp(startTime + normalizedClipDuration, 1, safeDuration);
  const trackWidth = Math.max(viewportWidth || 0, 1);
  const selectedStart = trackWidth * (startTime / safeDuration);
  const selectedEnd = trackWidth * (endTime / safeDuration);
  const handleVisualWidth = showWaveform ? 12 : 14;
  const handleTouchWidth = showWaveform ? 28 : 24;
  const maxHandleLeft = Math.max(0, trackWidth - handleVisualWidth);
  const leftHandleLeft = clamp(selectedStart - handleVisualWidth / 2, 0, maxHandleLeft);
  const rightHandleLeft = clamp(selectedEnd - handleVisualWidth / 2, 0, maxHandleLeft);
  const minGapPx = trackWidth > 0 ? Math.max(18, trackWidth * (1 / safeDuration)) : 0;
  const selectedWidth = Math.max(minGapPx, selectedEnd - selectedStart);
  const waveformBars = useMemo(() => {
    const count = clamp(Math.round(trackWidth / 9), 28, 96);

    return Array.from({ length: count }, (_value, index) => {
      const phase = (index / Math.max(1, count - 1)) * Math.PI * 3.6;
      const heightFactor = clamp(
        0.3 + Math.abs(Math.sin(phase) * 0.46 + Math.cos(phase * 0.58) * 0.22),
        0.22,
        1,
      );

      return {
        id: `wave_${index}`,
        height: 8 + heightFactor * 24,
      };
    });
  }, [trackWidth]);

  useEffect(() => {
    if (
      !showWaveform
      || isDraggingHandle
      || !sliderScrollRef.current
      || !viewportWidth
      || trackWidth <= viewportWidth
    ) {
      return;
    }

    const targetOffset = clamp(selectedStart - viewportWidth * 0.28, 0, Math.max(0, trackWidth - viewportWidth));
    const timeout = setTimeout(() => {
      sliderScrollRef.current?.scrollTo({ x: targetOffset, animated: true });
    }, 60);

    return () => clearTimeout(timeout);
  }, [isDraggingHandle, selectedStart, showWaveform, trackWidth, viewportWidth]);

  const updateRange = useCallback(
    (nextStartPx: number, nextEndPx: number) => {
      if (!trackWidth) {
        return;
      }

      const clampedStartPx = clamp(nextStartPx, 0, Math.max(0, nextEndPx - minGapPx));
      const clampedEndPx = clamp(nextEndPx, clampedStartPx + minGapPx, trackWidth);
      const nextStart = Math.round((clampedStartPx / trackWidth) * safeDuration);
      const nextEnd = Math.round((clampedEndPx / trackWidth) * safeDuration);
      onChange(clamp(nextStart, 0, safeDuration - 1), clamp(nextEnd - nextStart, 1, safeDuration));
    },
    [minGapPx, onChange, safeDuration, trackWidth],
  );

  const leftResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dragWindowRef.current = {
            startPx: selectedStart,
            endPx: selectedEnd,
          };
          setIsDraggingHandle(true);
        },
        onPanResponderMove: (_event, gestureState) => {
          updateRange(dragWindowRef.current.startPx + gestureState.dx, dragWindowRef.current.endPx);
        },
        onPanResponderRelease: () => setIsDraggingHandle(false),
        onPanResponderTerminate: () => setIsDraggingHandle(false),
      }),
    [selectedEnd, selectedStart, updateRange],
  );

  const rightResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dragWindowRef.current = {
            startPx: selectedStart,
            endPx: selectedEnd,
          };
          setIsDraggingHandle(true);
        },
        onPanResponderMove: (_event, gestureState) => {
          updateRange(dragWindowRef.current.startPx, dragWindowRef.current.endPx + gestureState.dx);
        },
        onPanResponderRelease: () => setIsDraggingHandle(false),
        onPanResponderTerminate: () => setIsDraggingHandle(false),
      }),
    [selectedEnd, selectedStart, updateRange],
  );

  const selectionResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dragWindowRef.current = {
            startPx: selectedStart,
            endPx: selectedEnd,
          };
          setIsDraggingHandle(true);
        },
        onPanResponderMove: (_event, gestureState) => {
          const width = Math.max(minGapPx, dragWindowRef.current.endPx - dragWindowRef.current.startPx);
          const nextStart = clamp(dragWindowRef.current.startPx + gestureState.dx, 0, Math.max(0, trackWidth - width));
          updateRange(nextStart, nextStart + width);
        },
        onPanResponderRelease: () => setIsDraggingHandle(false),
        onPanResponderTerminate: () => setIsDraggingHandle(false),
      }),
    [minGapPx, selectedEnd, selectedStart, trackWidth, updateRange],
  );

  return (
    <View style={styles.sliderWrap}>
      <View style={styles.sliderLabelsRow}>
        <Text style={[styles.sliderLabel, { color: mutedColor }]}>Start {formatDuration(startTime)}</Text>
        <Text style={[styles.sliderLabel, { color: mutedColor }]}>Clip {formatDuration(normalizedClipDuration)}</Text>
      </View>
      <View
        style={styles.sliderViewport}
        onLayout={(event) => {
          setViewportWidth(event.nativeEvent.layout.width);
        }}
      >
        <ScrollView
          ref={sliderScrollRef}
          horizontal
          bounces={false}
          showsHorizontalScrollIndicator={false}
          scrollEnabled={false}
          contentContainerStyle={styles.sliderScrollContent}
        >
          <View
            style={[
              styles.sliderTrackFrame,
              {
                width: trackWidth,
              },
            ]}
          >
            <View
              style={[
                styles.sliderTrack,
                showWaveform ? styles.sliderTrackWaveform : null,
                {
                  backgroundColor: mutedColor,
                },
              ]}
            >
              {showWaveform ? (
                <View pointerEvents="none" style={styles.sliderWaveRow}>
                  {waveformBars.map((bar, index) => {
                    const centerX = trackWidth * ((index + 0.5) / Math.max(1, waveformBars.length));
                    const selected = centerX >= selectedStart && centerX <= selectedEnd;

                    return (
                      <View
                        key={bar.id}
                        style={[
                          styles.sliderWaveBar,
                          {
                            height: bar.height,
                            backgroundColor: selected ? accentColor : mutedColor,
                            opacity: selected ? 0.95 : 0.45,
                          },
                        ]}
                      />
                    );
                  })}
                </View>
              ) : null}
              <View
                {...selectionResponder.panHandlers}
                style={[
                  styles.sliderSelection,
                  {
                    left: selectedStart,
                    width: selectedWidth,
                    backgroundColor: accentColor,
                    opacity: showWaveform ? 0.16 : 1,
                  },
                ]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.sliderSelectionEdge,
                  {
                    left: clamp(selectedStart - 1, 0, Math.max(0, trackWidth - 2)),
                    backgroundColor: accentColor,
                  },
                ]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.sliderSelectionEdge,
                  {
                    left: clamp(selectedEnd - 1, 0, Math.max(0, trackWidth - 2)),
                    backgroundColor: accentColor,
                  },
                ]}
              />
            </View>
            <View
              {...leftResponder.panHandlers}
              style={[
                styles.sliderHandleTouch,
                showWaveform ? styles.sliderHandleTouchWaveform : null,
                { left: clamp(leftHandleLeft - (handleTouchWidth - handleVisualWidth) / 2, 0, Math.max(0, trackWidth - handleTouchWidth)) },
              ]}
            >
              <View
                style={[
                  styles.sliderHandle,
                  showWaveform ? styles.sliderHandleWaveform : styles.sliderHandleDefault,
                  { borderColor: accentColor },
                ]}
              >
                <View style={[styles.sliderHandleGrip, showWaveform ? styles.sliderHandleGripWaveform : null, { backgroundColor: accentColor }]} />
              </View>
            </View>
            <View
              {...rightResponder.panHandlers}
              style={[
                styles.sliderHandleTouch,
                showWaveform ? styles.sliderHandleTouchWaveform : null,
                { left: clamp(rightHandleLeft - (handleTouchWidth - handleVisualWidth) / 2, 0, Math.max(0, trackWidth - handleTouchWidth)) },
              ]}
            >
              <View
                style={[
                  styles.sliderHandle,
                  showWaveform ? styles.sliderHandleWaveform : styles.sliderHandleDefault,
                  { borderColor: accentColor },
                ]}
              >
                <View style={[styles.sliderHandleGrip, showWaveform ? styles.sliderHandleGripWaveform : null, { backgroundColor: accentColor }]} />
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
      <View style={styles.sliderLabelsRow}>
        <Text style={[styles.sliderHint, { color: mutedColor }]}>0:00</Text>
        <Text style={[styles.sliderHint, { color: mutedColor }]}>{formatDuration(duration)}</Text>
      </View>
    </View>
  );
}

function ValueSlider({
  value,
  min,
  max,
  onChange,
  accentColor,
  mutedColor,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (nextValue: number) => void;
  accentColor: string;
  mutedColor: string;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const safeRange = Math.max(0.0001, max - min);
  const normalizedValue = clamp((value - min) / safeRange, 0, 1);
  const handlePosition = trackWidth * normalizedValue;

  const updateValue = useCallback(
    (position: number) => {
      if (!trackWidth) {
        return;
      }

      const nextValue = min + (clamp(position, 0, trackWidth) / trackWidth) * safeRange;
      onChange(nextValue);
    },
    [min, onChange, safeRange, trackWidth],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => updateValue(event.nativeEvent.locationX),
        onPanResponderMove: (_event, gestureState) => updateValue(handlePosition + gestureState.dx),
      }),
    [handlePosition, updateValue],
  );

  return (
    <View
      style={[styles.valueSliderTrack, { backgroundColor: mutedColor }]}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      {...panResponder.panHandlers}
    >
      <View style={[styles.valueSliderFill, { width: handlePosition, backgroundColor: accentColor }]} />
      <View
        style={[
          styles.valueSliderHandle,
          {
            left: Math.max(-10, Math.min(trackWidth - 10, handlePosition - 10)),
            borderColor: accentColor,
          },
        ]}
      />
    </View>
  );
}

const FilterPreview = React.memo(function FilterPreview({
  filterId,
  imageUri,
  active,
  onPress,
  accentColor,
  backgroundColor,
  textColor,
  mutedColor,
}: {
  filterId: string;
  imageUri: string;
  active: boolean;
  onPress: () => void;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  mutedColor: string;
}) {
  const filter = PHOTO_FILTER_LIST.find((item) => item.id === filterId) || PHOTO_FILTER_LIST[0];

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={[
        styles.filterCard,
        {
          backgroundColor,
          borderColor: active ? accentColor : "transparent",
        },
      ]}
    >
      <View style={styles.filterThumbFrame}>
        {ColorMatrix && filter.id !== "none" ? (
          <ColorMatrix matrix={filter.matrix}>
            <Image source={{ uri: imageUri }} style={styles.filterThumbImage} resizeMode="cover" />
          </ColorMatrix>
        ) : (
          <Image source={{ uri: imageUri }} style={styles.filterThumbImage} resizeMode="cover" />
        )}
      </View>
      <Text style={[styles.filterName, { color: active ? textColor : mutedColor }]}>{filter.name}</Text>
    </TouchableOpacity>
  );
});

function CreatePostScreen({ navigation, route }: any) {
  const { colors, isDarkMode } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const initialMode = ((route?.params?.initialTab as ComposerMode | undefined) || "post");
  const initialMedia = route?.params?.initialMedia as string | undefined;
  const initialMediaType = (route?.params?.initialMediaType as "image" | "video" | undefined) || "image";
  const accentColor = colors.primary;
  const accentSoft = toAlphaColor(accentColor, isDarkMode ? 0.18 : 0.1);
  const screenBackground = colors.background;
  const surfaceColor = colors.card;
  const elevatedSurfaceColor = colors.surface;
  const borderColor = colors.border;
  const textColor = colors.text;
  const mutedColor = colors.mutedText;
  const hairlineColor = toAlphaColor(colors.border, isDarkMode ? 0.7 : 0.85);
  const inputBackground = colors.input;
  const [mode, setMode] = useState<ComposerMode>(initialMode);
  const [stage, setStage] = useState<ComposerStage>(initialMedia ? "edit" : "launcher");
  const [selectedAsset, setSelectedAsset] = useState<ComposerAsset | null>(
    initialMedia ? createRemoteComposerAsset(initialMedia, initialMediaType) : null,
  );
  const [aspectId, setAspectId] = useState<Record<ComposerMode, string>>({
    post: DEFAULT_ASPECT_BY_MODE.post,
    story: DEFAULT_ASPECT_BY_MODE.story,
    swipe: DEFAULT_ASPECT_BY_MODE.swipe,
  });
  const [selectedFilterId, setSelectedFilterId] = useState("none");
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationFetchingCurrent, setLocationFetchingCurrent] = useState(false);
  const [tagSheetVisible, setTagSheetVisible] = useState(false);
  const [composerEditToolPanel, setComposerEditToolPanel] = useState<ComposerEditToolPanel>("layout");
  const [musicSheetVisible, setMusicSheetVisible] = useState(false);
  const [musicTrimSheetVisible, setMusicTrimSheetVisible] = useState(false);
  const [videoTrimSheetVisible, setVideoTrimSheetVisible] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [taggableFriends, setTaggableFriends] = useState<AudienceCandidate[]>([]);
  const [taggableFriendsLoading, setTaggableFriendsLoading] = useState(false);
  const [captionMentionSuggestions, setCaptionMentionSuggestions] = useState<MentionCandidate[]>([]);
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const [selectedTagPeople, setSelectedTagPeople] = useState<AudienceCandidate[]>([]);
  const deferredTagQuery = useDeferredValue(tagQuery);
  const [disableComments, setDisableComments] = useState(false);
  const [hideLikeCount, setHideLikeCount] = useState(false);
  const [storyVisibility, setStoryVisibility] = useState<Visibility>("public");
  const [storyAllowReplies, setStoryAllowReplies] = useState(true);
  const [storyAllowSharing, setStoryAllowSharing] = useState(true);
  const [pickingMedia, setPickingMedia] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [musicQuery, setMusicQuery] = useState("");
  const [musicResults, setMusicResults] = useState<MusicResultItem[]>([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicLoadingMore, setMusicLoadingMore] = useState(false);
  const [musicPage, setMusicPage] = useState(1);
  const [musicHasMore, setMusicHasMore] = useState(true);
  const [musicUploading, setMusicUploading] = useState(false);
  const [musicImportingId, setMusicImportingId] = useState("");
  const [musicError, setMusicError] = useState("");
  const [activeMusicPreviewId, setActiveMusicPreviewId] = useState("");
  const [selectedMusic, setSelectedMusic] = useState<SelectedMusicClip | null>(null);
  const [pendingMusicSelection, setPendingMusicSelection] = useState<MusicResultItem | null>(null);
  const [musicTrimStartTime, setMusicTrimStartTime] = useState(0);
  const captionMentionQuery = getActiveMentionQuery(caption);
  const [musicTrimDuration, setMusicTrimDuration] = useState(0);
  const musicPreviewMode: MusicPreviewMode = "audio";
  const [videoTrimStartTime, setVideoTrimStartTime] = useState(0);
  const [videoTrimDuration, setVideoTrimDuration] = useState(0);
  const [videoTrimApplying, setVideoTrimApplying] = useState(false);
  const [videoTrimError, setVideoTrimError] = useState("");
  const [videoTrimPreviewPlaying, setVideoTrimPreviewPlaying] = useState(false);
  const [videoTrimPreviewLoaded, setVideoTrimPreviewLoaded] = useState(false);
  const [videoTrimPreviewLoading, setVideoTrimPreviewLoading] = useState(false);
  const [videoTrimPreviewPositionMs, setVideoTrimPreviewPositionMs] = useState(0);
  const [storyCreationMode, setStoryCreationMode] = useState<"media" | "text">("media");
  const [storyToolPanel, setStoryToolPanel] = useState<StoryToolPanel>("filters");
  const [storyCanvasSize, setStoryCanvasSize] = useState({ width: 0, height: 0 });
  const [storyBackgroundColor, setStoryBackgroundColor] = useState(STORY_BACKGROUND_COLORS[0]);
  const [storyText, setStoryText] = useState("");
  const [storyTextColor, setStoryTextColor] = useState(STORY_TEXT_COLOR_OPTIONS[0]);
  const [storyTextTheme, setStoryTextTheme] = useState<StoryTextStickerTheme>("dark");
  const [storyTextFont, setStoryTextFont] = useState<StoryTextFontVariant>("bold");
  const [storyTextAlignment] = useState<StoryStickerTextAlignment>("center");
  const [storyTextScale, setStoryTextScale] = useState(1);
  const [storyTextRotation, setStoryTextRotation] = useState(0);
  const [storyTextPosition, setStoryTextPosition] = useState({ x: 0.18, y: 0.18 });
  const [storyFilterPreset, setStoryFilterPreset] = useState<StoryFilterPreset>("none");
  const [storyFilterIntensity, setStoryFilterIntensity] = useState(1);
  const [storyBrightness, setStoryBrightness] = useState(1);
  const [_storyContrast, setStoryContrast] = useState(1);
  const [_storySaturation, setStorySaturation] = useState(1);
  const [storyStickerQuery, setStoryStickerQuery] = useState("");
  const [storyStickerLoading, setStoryStickerLoading] = useState(false);
  const [storyStickerError, setStoryStickerError] = useState("");
  const [storyEmojiOptions, setStoryEmojiOptions] = useState<ChatSticker[]>([]);
  const [storyImageOptions, setStoryImageOptions] = useState<ChatSticker[]>([]);
  const [storyEmojiSticker, setStoryEmojiSticker] = useState<string>("");
  const [storyEmojiScale, setStoryEmojiScale] = useState(1);
  const [storyEmojiRotation, setStoryEmojiRotation] = useState(0);
  const [storyEmojiPosition, setStoryEmojiPosition] = useState({ x: 0.62, y: 0.24 });
  const [storyImageSticker, setStoryImageSticker] = useState<ChatSticker | null>(null);
  const [storyImageScale, setStoryImageScale] = useState(1);
  const [storyImageRotation, setStoryImageRotation] = useState(0);
  const [storyImagePosition, setStoryImagePosition] = useState({ x: 0.56, y: 0.48 });
  const [storyActiveLayer, setStoryActiveLayer] = useState<"text" | "emoji" | "image">("text");
  const [launcherCameraReady, setLauncherCameraReady] = useState(false);
  const [launcherCameraError, setLauncherCameraError] = useState("");
  const [launcherCameraFacingMode, setLauncherCameraFacingMode] = useState<"user" | "environment">("environment");
  const [launcherCameraStreamURL, setLauncherCameraStreamURL] = useState<string | null>(null);
  const stageAnimation = useRef(new Animated.Value(1)).current;
  const tagRequestIdRef = useRef(0);
  const musicSeedLoadedRef = useRef(false);
  const musicSearchRequestIdRef = useRef(0);
  const musicResultsCacheRef = useRef(new Map<string, MusicResultItem[]>());
  const listPreviewRequestIdRef = useRef(0);
  const videoTrimVideoRef = useRef<any>(null);
  const launcherCameraStreamRef = useRef<any>(null);
  const launcherLongPressTriggeredRef = useRef(false);
  const storyTextPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const storyEmojiPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const storyImagePan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const lastStoryAssetUriRef = useRef("");
  const {
    isReady: musicPreviewReady,
    isPlaying: musicPreviewPlaying,
    isLoading: musicPreviewLoading,
    positionMs: musicPreviewPositionMs,
    resetPreview: resetMusicPreview,
    seekToSeconds: seekMusicPreviewToSeconds,
    setTrimWindow: setMusicPreviewTrimWindow,
    togglePlayback: toggleAudioMusicPreview,
  } = useAudioTrimPreview();
  const {
    isPlaying: listMusicPreviewPlaying,
    resetPreview: resetListMusicPreview,
    togglePlayback: toggleListMusicPreview,
  } = useAudioTrimPreview({ trackPosition: false });
  const {
    isPlaying: selectedMusicPreviewPlaying,
    isLoading: selectedMusicPreviewLoading,
    resetPreview: resetSelectedMusicPreview,
    togglePlayback: toggleSelectedMusicPreviewPlayback,
  } = useAudioTrimPreview({ trackPosition: false });

  const activeAspect = useMemo(() => findAspectOption(mode, aspectId[mode]), [aspectId, mode]);
  const videoDurationLimit = useMemo(() => VIDEO_DURATION_LIMITS[mode], [mode]);
  const selectedVideoDuration = useMemo(() => {
    const durationMs = Number(selectedAsset?.durationMs || 0);
    if (selectedAsset?.mediaType === "video" && durationMs > 0) {
      return Math.max(1, Math.round(durationMs / 1000));
    }

    return Math.max(1, videoDurationLimit);
  }, [selectedAsset?.durationMs, selectedAsset?.mediaType, videoDurationLimit]);
  const canContinueFromEdit = useMemo(() => {
    if (mode !== "story") {
      return !!selectedAsset;
    }

    return storyCreationMode === "text" ? !!storyText.trim() : !!selectedAsset;
  }, [mode, selectedAsset, storyCreationMode, storyText]);
  const pendingMusicPreviewRawUrl = useMemo(
    () => getMusicClipPlaybackUrl(pendingMusicSelection),
    [pendingMusicSelection],
  );
  const pendingMusicPreviewUrl = useMemo(
    () => normalizeMediaUrl(pendingMusicPreviewRawUrl),
    [pendingMusicPreviewRawUrl],
  );
  const canPreviewMusic = Boolean(pendingMusicPreviewRawUrl || pendingMusicPreviewUrl);
  const parentRouteNames = navigation?.getParent?.()?.getState?.()?.routeNames || [];
  const isInsideTabNavigator = Array.isArray(parentRouteNames)
    && parentRouteNames.includes("Feed")
    && parentRouteNames.includes("Create");
  useEffect(() => {
    setMusicPreviewTrimWindow(
      Math.max(0, musicTrimStartTime),
      Math.max(musicTrimStartTime + 1, musicTrimStartTime + Math.max(1, musicTrimDuration)),
    );
  }, [musicTrimDuration, musicTrimStartTime, setMusicPreviewTrimWindow]);
  useEffect(() => {
    if (!selectedMusic) {
      resetSelectedMusicPreview(0, 1, { rawUrl: "", normalizedUrl: "" }).catch(() => undefined);
      return;
    }

    const startTime = Math.max(0, Number(selectedMusic.clipStartTime || 0));
    const duration = Math.min(30, Math.max(1, Number(selectedMusic.clipDuration || 30)));
    const rawUrl = getMusicClipPlaybackUrl(selectedMusic);
    resetSelectedMusicPreview(startTime, startTime + duration, {
      rawUrl,
      normalizedUrl: normalizeMediaUrl(rawUrl),
    }).catch(() => undefined);
  }, [resetSelectedMusicPreview, selectedMusic]);
  const storyTextThemeStyle =
    STORY_TEXT_THEMES.find((item) => item.id === storyTextTheme) || STORY_TEXT_THEMES[0];
  const storyTextFontStyle =
    STORY_TEXT_FONT_OPTIONS.find((item) => item.id === storyTextFont) || STORY_TEXT_FONT_OPTIONS[0];
  const composerTextStickerStyle = useMemo(
    () => ({
      color: storyTextColor || storyTextThemeStyle.color,
      backgroundColor: storyTextThemeStyle.backgroundColor,
      fontSize: Math.round(18 * storyTextScale),
      fontFamily: storyTextFontStyle.fontFamily,
      fontStyle: storyTextFontStyle.fontStyle || "normal",
      alignment: storyTextAlignment,
    }),
    [storyTextAlignment, storyTextColor, storyTextFontStyle.fontFamily, storyTextFontStyle.fontStyle, storyTextScale, storyTextThemeStyle.backgroundColor, storyTextThemeStyle.color],
  );
  const buildComposerTextStickers = useCallback((): StorySticker[] => {
    const normalizedText = storyText.trim();
    if (!normalizedText) {
      return [];
    }

    return [
      {
        id: "composer_text_overlay",
        type: "text",
        text: normalizedText,
        position: {
          x: storyTextPosition.x,
          y: storyTextPosition.y,
          width: 0.58,
          height: 0.12,
          rotation: storyTextRotation,
          scale: storyTextScale,
        },
        style: composerTextStickerStyle,
      },
    ];
  }, [composerTextStickerStyle, storyText, storyTextPosition.x, storyTextPosition.y, storyTextRotation, storyTextScale]);
  const storyOverlayTint = useMemo(
    () => buildStoryOverlayTint(storyFilterPreset, storyFilterIntensity),
    [storyFilterIntensity, storyFilterPreset],
  );
  const storyExpandedCanvasHeight = useMemo(
    () => Math.max(520, Math.round(windowHeight - insets.top - 36)),
    [insets.top, windowHeight],
  );
  const storyCompactCanvasHeight = useMemo(() => clamp(windowHeight * 0.24, 188, 224), [windowHeight]);
  const storyBrightnessOverlay = useMemo(() => {
    if (storyBrightness === 1) {
      return null;
    }

    return {
      backgroundColor: storyBrightness > 1 ? "#ffffff" : "#020617",
      opacity: Math.min(0.18, Math.abs(storyBrightness - 1) * 0.22),
    };
  }, [storyBrightness]);
  const filteredFriends = useMemo(() => {
    const query = deferredTagQuery.trim().toLowerCase();

    if (!query) {
      return taggableFriends;
    }

    return taggableFriends.filter((friend) => {
      const username = friend.username.toLowerCase();
      const name = friend.name.toLowerCase();
      return username.includes(query) || name.includes(query);
    });
  }, [deferredTagQuery, taggableFriends]);

  const resetStoryEditor = useCallback((nextCreationMode: "media" | "text" = "media") => {
    setStoryCreationMode(nextCreationMode);
    setStoryToolPanel(nextCreationMode === "text" ? "text" : "filters");
      setStoryBackgroundColor(STORY_BACKGROUND_COLORS[Math.floor(Math.random() * STORY_BACKGROUND_COLORS.length)] || STORY_BACKGROUND_COLORS[0]);
      setStoryText("");
      setStoryTextColor(STORY_TEXT_COLOR_OPTIONS[0]);
      setStoryTextTheme("dark");
    setStoryTextFont("bold");
    setStoryTextScale(1);
    setStoryTextRotation(0);
    setStoryTextPosition({ x: 0.18, y: 0.18 });
    setStoryFilterPreset("none");
    setStoryFilterIntensity(1);
    setStoryBrightness(1);
    setStoryContrast(1);
    setStorySaturation(1);
    setStoryStickerQuery("");
    setStoryStickerError("");
    setStoryEmojiSticker("");
    setStoryEmojiScale(1);
    setStoryEmojiRotation(0);
    setStoryEmojiPosition({ x: 0.62, y: 0.24 });
    setStoryImageSticker(null);
    setStoryImageScale(1);
    setStoryImageRotation(0);
    setStoryImagePosition({ x: 0.56, y: 0.48 });
    setStoryActiveLayer("text");
  }, []);

  const animateStage = useCallback(() => {
    stageAnimation.setValue(0);
    Animated.timing(stageAnimation, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [stageAnimation]);

  useEffect(() => {
    animateStage();
  }, [animateStage, stage]);

  useEffect(() => {
    if (selectedAsset || stage !== "launcher") {
      return;
    }

    setSelectedFilterId("none");
  }, [selectedAsset, stage]);

  useEffect(() => {
    const assetUri = String(selectedAsset?.uri || "");

    if (!assetUri || assetUri === lastStoryAssetUriRef.current) {
      return;
    }

    lastStoryAssetUriRef.current = assetUri;
    resetStoryEditor("media");
  }, [resetStoryEditor, selectedAsset?.uri]);

  useEffect(() => {
    if (!storyCanvasSize.width || !storyCanvasSize.height) {
      return;
    }

    storyTextPan.setValue({
      x: clamp(storyTextPosition.x, 0.04, 0.84) * storyCanvasSize.width,
      y: clamp(storyTextPosition.y, 0.04, 0.84) * storyCanvasSize.height,
    });
  }, [storyCanvasSize.height, storyCanvasSize.width, storyTextPan, storyTextPosition.x, storyTextPosition.y]);

  useEffect(() => {
    if (!storyCanvasSize.width || !storyCanvasSize.height) {
      return;
    }

    storyEmojiPan.setValue({
      x: clamp(storyEmojiPosition.x, 0.04, 0.84) * storyCanvasSize.width,
      y: clamp(storyEmojiPosition.y, 0.04, 0.84) * storyCanvasSize.height,
    });
  }, [storyCanvasSize.height, storyCanvasSize.width, storyEmojiPan, storyEmojiPosition.x, storyEmojiPosition.y]);

  useEffect(() => {
    if (!storyCanvasSize.width || !storyCanvasSize.height) {
      return;
    }

    storyImagePan.setValue({
      x: clamp(storyImagePosition.x, 0.04, 0.84) * storyCanvasSize.width,
      y: clamp(storyImagePosition.y, 0.04, 0.84) * storyCanvasSize.height,
    });
  }, [storyCanvasSize.height, storyCanvasSize.width, storyImagePan, storyImagePosition.x, storyImagePosition.y]);

  useEffect(() => {
    if (mode !== "story" || stage !== "edit") {
      return;
    }

    let cancelled = false;

    const loadStoryStickerOptions = async () => {
      try {
        setStoryStickerLoading(true);
        setStoryStickerError("");
        const query = storyStickerQuery.trim();
        const [emojiItems, imageItems] = await Promise.all([
          fetchEmojiStickers({ limit: 24, query }),
          query ? searchStickers(query) : fetchStickersForChat(1, 24),
        ]);

        if (cancelled) {
          return;
        }

        setStoryEmojiOptions(emojiItems.filter((item) => item.emoji).slice(0, 18));
        setStoryImageOptions(imageItems.filter((item) => item.imageUrl).slice(0, 18));
      } catch (error) {
        if (!cancelled) {
          setStoryStickerError(toUserSafeMessage(error));
          setStoryEmojiOptions([]);
          setStoryImageOptions([]);
        }
      } finally {
        if (!cancelled) {
          setStoryStickerLoading(false);
        }
      }
    };

    const timeout = setTimeout(() => {
      loadStoryStickerOptions().catch(() => undefined);
    }, storyStickerQuery.trim() ? 220 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [mode, stage, storyStickerQuery]);

  useEffect(() => {
    const nextMode = route?.params?.initialTab as ComposerMode | undefined;
    const nextMedia = route?.params?.initialMedia as string | undefined;
    const nextMediaType = (route?.params?.initialMediaType as "image" | "video" | undefined) || "image";

    if (!nextMode && !nextMedia) {
      return;
    }

    if (nextMode) {
      setMode(nextMode);
    }

    if (nextMedia) {
      setSelectedAsset(createRemoteComposerAsset(nextMedia, nextMediaType));
      setStage("edit");
    }

    navigation.setParams?.({
      initialTab: undefined,
      initialMedia: undefined,
      initialMediaType: undefined,
    });
  }, [navigation, route?.params]);

  const exitComposer = useCallback(() => {
    if (navigation.canGoBack?.()) {
      navigation.goBack();
      return;
    }

    if (mode === "swipe") {
      navigation.getParent?.()?.navigate("Swipes");
      return;
    }

    navigation.navigate("Feed");
  }, [mode, navigation]);

  const handleBackAction = useCallback(() => {
    if (stage === "details") {
      startTransition(() => setStage("edit"));
      return true;
    }

    if (stage === "edit") {
      startTransition(() => {
        setStage("launcher");
        setSelectedAsset(null);
      });
      return true;
    }

    exitComposer();
    return true;
  }, [exitComposer, stage]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", handleBackAction);
    return () => subscription.remove();
  }, [handleBackAction]);

  const fetchLocationSuggestions = useCallback(async (query: string) => {
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

  const runLocationSearch = useCallback(
    async (query: string) => {
      try {
        setLocationLoading(true);
        setLocationSuggestions(await fetchLocationSuggestions(query));
      } catch (error) {
        Alert.alert("Could not search locations", toUserSafeMessage(error));
      } finally {
        setLocationLoading(false);
      }
    },
    [fetchLocationSuggestions],
  );

  const requestCurrentLocationPermission = useCallback(async () => {
    if (Platform.OS !== "android") {
      return true;
    }

    const permission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: "Use your current location",
        message: "Allow Aline2 to fetch your current location for your post, story, or swipe.",
        buttonPositive: "Allow",
        buttonNegative: "Not now",
      },
    );

    return permission === PermissionsAndroid.RESULTS.GRANTED;
  }, []);

  const applyCurrentLocation = useCallback(async () => {
    try {
      setLocationFetchingCurrent(true);
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
        // Keep coordinates fallback.
      }

      setLocation(nextLabel);
      setLocationSuggestions([{ name: nextLabel, count: 0 }]);
    } catch (error) {
      Alert.alert("Location unavailable", toUserSafeMessage(error));
    } finally {
      setLocationFetchingCurrent(false);
    }
  }, [requestCurrentLocationPermission]);

  useEffect(() => {
    if (stage !== "edit" || taggableFriends.length) {
      return;
    }

    let mounted = true;

    const preloadTaggableUsers = async () => {
      try {
        const response = await API.get("/search/suggested/users", {
          params: { limit: 12 },
        });
        const users = Array.isArray(response?.data?.users) ? response.data.users : [];

        if (mounted && users.length) {
          setTaggableFriends(users.map(mapAudienceCandidate).filter(Boolean) as AudienceCandidate[]);
        }
      } catch {
        // Keep the tag sheet lazy if suggestions are unavailable.
      }
    };

    preloadTaggableUsers().catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, [stage, taggableFriends.length]);

  useEffect(() => {
    if (!tagSheetVisible) {
      return;
    }

    let mounted = true;
    const requestId = tagRequestIdRef.current + 1;
    tagRequestIdRef.current = requestId;

    const loadUsers = async () => {
      try {
        setTaggableFriendsLoading(true);
        const query = deferredTagQuery.trim();
        let users: any[] = [];

        if (query) {
          const response = await API.get("/auth/search", {
            params: { query },
          });
          users = Array.isArray(response?.data?.users) ? response.data.users : [];
        } else {
          try {
            const response = await API.get("/search/suggested/users", {
              params: { limit: 12 },
            });
            users = Array.isArray(response?.data?.users) ? response.data.users : [];
          } catch {
            const response = await API.get("/auth/users");
            users = Array.isArray(response?.data?.users) ? response.data.users.slice(0, 20) : [];
          }
        }

        if (!mounted || tagRequestIdRef.current !== requestId) {
          return;
        }

        setTaggableFriends(users.map(mapAudienceCandidate).filter(Boolean) as AudienceCandidate[]);
      } catch (error) {
        if (mounted && tagRequestIdRef.current === requestId) {
          setTaggableFriends([]);
          console.log("taggable friends error:", error);
        }
      } finally {
        if (mounted && tagRequestIdRef.current === requestId) {
          setTaggableFriendsLoading(false);
        }
      }
    };

    const timeout = setTimeout(() => {
      loadUsers().catch(() => undefined);
    }, deferredTagQuery.trim() ? 220 : 0);

    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, [deferredTagQuery, tagSheetVisible]);

  useEffect(() => {
    if (captionMentionQuery === null) {
      setCaptionMentionSuggestions([]);
      return;
    }

    let mounted = true;
    const query = captionMentionQuery.trim();

    const loadMentions = async () => {
      try {
        const response = query
          ? await API.get("/auth/search", { params: { query } })
          : await API.get("/search/suggested/users", { params: { limit: 8 } });
        const users = Array.isArray(response?.data?.users) ? response.data.users : [];
        if (mounted) {
          setCaptionMentionSuggestions(users.map(mapMentionCandidate).filter(Boolean) as MentionCandidate[]);
        }
      } catch {
        if (mounted) {
          setCaptionMentionSuggestions([]);
        }
      }
    };

    const timeout = setTimeout(() => {
      loadMentions().catch(() => undefined);
    }, query ? 180 : 0);

    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, [captionMentionQuery]);

  const pickFromGallery = useCallback(async () => {
    if (pickingMedia) {
      return;
    }

    try {
      setPickingMedia(true);
      const pickerMediaType = mode === "swipe" ? "video" : "mixed";
      const [asset] = await pickComposerAssets({
        mediaType: pickerMediaType,
        selectionLimit: 1,
        quality: PHOTO_PICKER_QUALITY,
        maxWidth: PHOTO_PICKER_MAX_DIMENSION,
        maxHeight: PHOTO_PICKER_MAX_DIMENSION,
        presentationStyle: "fullScreen",
      });

      if (!asset) {
        return;
      }

      if (mode === "swipe" && asset.mediaType !== "video") {
        throw new Error("Swipes require a video.");
      }

      if (mode === "story") {
        setStoryCreationMode("media");
        setStoryToolPanel("filters");
      }
      setSelectedAsset(asset);
      startTransition(() => setStage("edit"));
    } catch (error) {
      Alert.alert("Could not pick media", toUserSafeMessage(error));
    } finally {
      setPickingMedia(false);
    }
  }, [mode, pickingMedia]);

  const stopLauncherCameraPreview = useCallback(() => {
    const currentStream = launcherCameraStreamRef.current;
    launcherCameraStreamRef.current = null;
    setLauncherCameraReady(false);
    setLauncherCameraStreamURL(null);

    if (currentStream?.getTracks) {
      currentStream.getTracks().forEach((track: any) => track.stop?.());
    }
  }, []);

  const startLauncherCameraPreview = useCallback(async () => {
    setLauncherCameraError("");
    const hasPermission = await ensureCameraPermission("Allow Aline2 to use your camera for create post preview.");

    if (!hasPermission) {
      throw new Error("Camera permission is required for preview.");
    }

    const stream = await mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: launcherCameraFacingMode,
        frameRate: 24,
        width: 720,
        height: 1280,
      },
    } as any);

    launcherCameraStreamRef.current = stream;
    setLauncherCameraStreamURL(typeof stream?.toURL === "function" ? stream.toURL() : null);
    setLauncherCameraReady(true);
  }, [launcherCameraFacingMode]);

  const captureWithCamera = useCallback(async (mediaPreference?: "photo" | "video" | "mixed") => {
    if (pickingMedia) {
      return;
    }

    let capturedAsset: ComposerAsset | null = null;

    try {
      setPickingMedia(true);
      setLauncherCameraError("");
      stopLauncherCameraPreview();
      await delay(320);
      const captureMediaType = mediaPreference || (mode === "swipe" ? "video" : "photo");
      const captureOptions: Parameters<typeof captureComposerAssets>[0] = {
        mediaType: captureMediaType,
        cameraType: launcherCameraFacingMode === "user" ? "front" : "back",
        quality: PHOTO_PICKER_QUALITY,
        maxWidth: PHOTO_PICKER_MAX_DIMENSION,
        maxHeight: PHOTO_PICKER_MAX_DIMENSION,
        saveToPhotos: false,
        videoQuality: "high",
      };

      if (captureMediaType === "video") {
        captureOptions.durationLimit = VIDEO_DURATION_LIMITS[mode];
      }

      const [asset] = await captureComposerAssets(captureOptions);

      if (!asset) {
        return;
      }

      capturedAsset = asset;
      if (mode === "swipe" && asset.mediaType !== "video") {
        throw new Error("Swipes require a video.");
      }

      if (mode === "story") {
        setStoryCreationMode("media");
        setStoryToolPanel("filters");
      }
      setSelectedAsset(asset);
      startTransition(() => setStage("edit"));
    } catch (error) {
      Alert.alert("Could not open camera", toUserSafeMessage(error));
    } finally {
      setPickingMedia(false);
      if (!capturedAsset && stage === "launcher") {
        delay(320)
          .then(() => startLauncherCameraPreview())
          .catch((error) => {
            setLauncherCameraError(toUserSafeMessage(error));
          });
      }
    }
  }, [launcherCameraFacingMode, mode, pickingMedia, stage, startLauncherCameraPreview, stopLauncherCameraPreview]);

  const startTextStoryDraft = useCallback(() => {
    lastStoryAssetUriRef.current = "";
    setSelectedAsset(null);
    resetStoryEditor("text");
    setStoryToolPanel("text");
    startTransition(() => setStage("edit"));
  }, [resetStoryEditor]);

  const switchLauncherCameraFacing = useCallback(() => {
    setLauncherCameraReady(false);
    setLauncherCameraError("");
    setLauncherCameraFacingMode((current) => (current === "user" ? "environment" : "user"));
  }, []);

  useEffect(() => {
    if (stage !== "launcher" || selectedAsset) {
      stopLauncherCameraPreview();
      return;
    }

    let cancelled = false;

    stopLauncherCameraPreview();
    startLauncherCameraPreview().catch((error) => {
      if (!cancelled) {
        console.log("launcher camera preview error:", error);
        setLauncherCameraError(toUserSafeMessage(error));
        stopLauncherCameraPreview();
      }
    });

    return () => {
      cancelled = true;
      stopLauncherCameraPreview();
    };
  }, [launcherCameraFacingMode, selectedAsset, stage, startLauncherCameraPreview, stopLauncherCameraPreview]);

  useEffect(() => {
    if (!musicTrimSheetVisible || !pendingMusicSelection) {
      resetMusicPreview(0, 1, { rawUrl: "", normalizedUrl: "" }).catch(() => undefined);
      return;
    }

    const nextEndTime = Math.min(
      Math.max(1, Number(pendingMusicSelection.duration || 1)),
      Math.max(musicTrimStartTime + 1, musicTrimStartTime + Math.max(1, musicTrimDuration)),
    );

    resetMusicPreview(Math.max(0, musicTrimStartTime), nextEndTime, {
      rawUrl: pendingMusicPreviewRawUrl,
      normalizedUrl: pendingMusicPreviewUrl,
    }).catch(() => undefined);
  }, [
    musicTrimDuration,
    musicTrimSheetVisible,
    musicTrimStartTime,
    pendingMusicPreviewRawUrl,
    pendingMusicPreviewUrl,
    pendingMusicSelection,
    resetMusicPreview,
  ]);

  useEffect(() => {
    if (!musicTrimSheetVisible || !musicPreviewReady) {
      return;
    }

    seekMusicPreviewToSeconds(Math.max(0, musicTrimStartTime));
  }, [musicPreviewReady, musicTrimSheetVisible, musicTrimStartTime, seekMusicPreviewToSeconds]);

  useEffect(() => {
    if (!videoTrimSheetVisible || selectedAsset?.mediaType !== "video") {
      setVideoTrimPreviewPlaying(false);
      setVideoTrimPreviewLoading(false);
      setVideoTrimPreviewLoaded(false);
      setVideoTrimError("");
      return;
    }

    setVideoTrimPreviewPlaying(false);
    setVideoTrimPreviewLoading(false);
    setVideoTrimPreviewLoaded(false);
    setVideoTrimPreviewPositionMs(Math.max(0, videoTrimStartTime * 1000));
  }, [selectedAsset?.mediaType, selectedAsset?.uri, videoTrimSheetVisible, videoTrimStartTime]);

  useEffect(() => {
    if (!videoTrimSheetVisible || !videoTrimPreviewLoaded || selectedAsset?.mediaType !== "video") {
      return;
    }

    videoTrimVideoRef.current?.seek?.(videoTrimStartTime);
    setVideoTrimPreviewPositionMs(videoTrimStartTime * 1000);
  }, [selectedAsset?.mediaType, videoTrimPreviewLoaded, videoTrimSheetVisible, videoTrimStartTime]);

  const fetchMusicResults = useCallback(async (query: string, page = 1) => {
    const trimmedQuery = String(query || "").trim();
    const cacheKey = `${trimmedQuery.toLowerCase()}::${page}`;
    const cachedResults = musicResultsCacheRef.current.get(cacheKey);
    if (cachedResults) {
      return cachedResults;
    }

    const catalogResults = trimmedQuery
      ? await searchMusicCatalog(trimmedQuery, MUSIC_PICKER_PAGE_SIZE, page)
      : await getTrendingMusicCatalog(MUSIC_PICKER_PAGE_SIZE, page);

    let combinedResults = (catalogResults as MusicResultItem[]).filter(hasPlayableMusicClip);

    if (page === 1 && combinedResults.length < 8) {
      const fallbackQueries = trimmedQuery
        ? [trimmedQuery, ...MUSIC_DISCOVERY_FALLBACK_QUERIES]
        : MUSIC_DISCOVERY_FALLBACK_QUERIES;

      for (const fallbackQuery of fallbackQueries) {
        const nextResults = (await searchMusicCatalog(fallbackQuery, MUSIC_PICKER_PAGE_SIZE, 1)).filter(
          hasPlayableMusicClip,
        ) as MusicResultItem[];

        combinedResults = dedupeMusicResults([...combinedResults, ...nextResults]);
        if (combinedResults.length >= MUSIC_PICKER_PAGE_SIZE) {
          break;
        }
      }
    }

    const nextResults = prioritizeFreshMusicResults(dedupeMusicResults(combinedResults)).slice(0, MUSIC_PICKER_PAGE_SIZE);
    musicResultsCacheRef.current.set(cacheKey, nextResults);
    return nextResults;
  }, []);

  const runMusicSearch = useCallback(async () => {
    const query = musicQuery.trim();
    const requestId = musicSearchRequestIdRef.current + 1;
    musicSearchRequestIdRef.current = requestId;

    try {
      setMusicLoading(true);
      setMusicError("");
      setMusicResults([]);
      setMusicPage(1);
      setMusicHasMore(true);
      const nextResults = await fetchMusicResults(query, 1);
      if (musicSearchRequestIdRef.current !== requestId) {
        return;
      }
      setMusicResults(nextResults);
      setMusicHasMore(nextResults.length >= MUSIC_PICKER_PAGE_SIZE);

      if (!nextResults.length) {
        setMusicError("");
      }
    } catch (error) {
      if (musicSearchRequestIdRef.current !== requestId) {
        return;
      }
      console.log("music search error:", error);
      setMusicResults([]);
      setMusicError("");
    } finally {
      if (musicSearchRequestIdRef.current === requestId) {
        setMusicLoading(false);
      }
    }
  }, [fetchMusicResults, musicQuery]);

  const loadMoreMusicResults = useCallback(async () => {
    if (musicLoading || musicLoadingMore || !musicHasMore) {
      return;
    }

    const nextPage = musicPage + 1;
    const requestId = musicSearchRequestIdRef.current;

    try {
      setMusicLoadingMore(true);
      const nextResults = await fetchMusicResults(musicQuery.trim(), nextPage);
      if (musicSearchRequestIdRef.current !== requestId) {
        return;
      }
      setMusicResults((current) => prioritizeFreshMusicResults(dedupeMusicResults([...current, ...nextResults])));
      setMusicPage(nextPage);
      setMusicHasMore(nextResults.length >= MUSIC_PICKER_PAGE_SIZE);
    } catch (error) {
      if (musicSearchRequestIdRef.current !== requestId) {
        return;
      }
      console.log("music load more error:", error);
      setMusicHasMore(false);
    } finally {
      if (musicSearchRequestIdRef.current === requestId) {
        setMusicLoadingMore(false);
      }
    }
  }, [fetchMusicResults, musicHasMore, musicLoading, musicLoadingMore, musicPage, musicQuery]);

  useEffect(() => {
    if (!musicSheetVisible) {
      musicSeedLoadedRef.current = false;
      listPreviewRequestIdRef.current += 1;
      setActiveMusicPreviewId("");
      setMusicPage(1);
      setMusicHasMore(true);
      setMusicLoadingMore(false);
      resetListMusicPreview(0, 1, { rawUrl: "", normalizedUrl: "" }).catch(() => undefined);
    }
  }, [musicSheetVisible, resetListMusicPreview]);

  useEffect(() => {
    if (!musicSheetVisible || musicSeedLoadedRef.current) {
      return;
    }

    musicSeedLoadedRef.current = true;
    runMusicSearch().catch(() => undefined);
  }, [musicSheetVisible, runMusicSearch]);

  const closeMusicTrimSheet = useCallback(() => {
    resetMusicPreview(0, 1, { rawUrl: "", normalizedUrl: "" }).catch(() => undefined);
    setMusicTrimSheetVisible(false);
    setPendingMusicSelection(null);
  }, [resetMusicPreview]);

  const closeMusicSheet = useCallback(() => {
    setMusicSheetVisible(false);
    setActiveMusicPreviewId("");
    resetListMusicPreview(0, 1, { rawUrl: "", normalizedUrl: "" }).catch(() => undefined);
  }, [resetListMusicPreview]);

  const closeVideoTrimSheet = useCallback(() => {
    setVideoTrimSheetVisible(false);
    setVideoTrimPreviewPlaying(false);
    setVideoTrimPreviewLoading(false);
    setVideoTrimPreviewLoaded(false);
    setVideoTrimError("");
  }, []);

  const stopAllComposerAudio = useCallback(() => {
    setActiveMusicPreviewId("");
    setVideoTrimPreviewPlaying(false);
    resetMusicPreview(0, 1, { rawUrl: "", normalizedUrl: "" }).catch(() => undefined);
    resetListMusicPreview(0, 1, { rawUrl: "", normalizedUrl: "" }).catch(() => undefined);
    resetSelectedMusicPreview(0, 1, { rawUrl: "", normalizedUrl: "" }).catch(() => undefined);
  }, [resetListMusicPreview, resetMusicPreview, resetSelectedMusicPreview]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        stopAllComposerAudio();
      };
    }, [stopAllComposerAudio]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        stopAllComposerAudio();
      }
    });

    return () => subscription.remove();
  }, [stopAllComposerAudio]);

  const resetComposerState = useCallback(() => {
    setStage("launcher");
    setSelectedAsset(null);
    setAspectId({
      post: DEFAULT_ASPECT_BY_MODE.post,
      story: DEFAULT_ASPECT_BY_MODE.story,
      swipe: DEFAULT_ASPECT_BY_MODE.swipe,
    });
    setSelectedFilterId("none");
    setCaption("");
    setLocation("");
    setLocationSuggestions([]);
    setTagQuery("");
    setSelectedMentions([]);
    setSelectedTagPeople([]);
    setDisableComments(false);
    setHideLikeCount(false);
    setPublishError("");
    setSelectedMusic(null);
    setPendingMusicSelection(null);
    setMusicQuery("");
    setMusicResults([]);
    setMusicError("");
    setMusicTrimStartTime(0);
    setMusicTrimDuration(0);
    setVideoTrimStartTime(0);
    setVideoTrimDuration(0);
    setVideoTrimError("");
    stopAllComposerAudio();
    setStoryVisibility("public");
    setStoryAllowReplies(true);
    setStoryAllowSharing(true);
    resetStoryEditor("media");
  }, [resetStoryEditor, stopAllComposerAudio]);

  const openVideoTrimmer = useCallback(() => {
    if (selectedAsset?.mediaType !== "video") {
      return;
    }

    const nextDuration = Math.min(selectedVideoDuration, videoDurationLimit);
    setVideoTrimError("");
    setVideoTrimStartTime((current) => clamp(current, 0, Math.max(0, selectedVideoDuration - 1)));
    setVideoTrimDuration((current) => {
      const nextClipDuration = Math.max(1, nextDuration);
      return current > 0 ? clamp(current, 1, Math.max(1, selectedVideoDuration)) : nextClipDuration;
    });
    setVideoTrimPreviewPositionMs((current) => (current > 0 ? current : 0));
    setVideoTrimSheetVisible(true);
  }, [selectedAsset?.mediaType, selectedVideoDuration, videoDurationLimit]);

  const updateVideoTrimWindow = useCallback(
    (nextStartTime: number, nextDuration: number) => {
      const safeDuration = Math.max(1, selectedVideoDuration);
      const safeStart = clamp(nextStartTime, 0, Math.max(0, safeDuration - 1));
      const clampedDuration = clamp(nextDuration, 1, Math.max(1, safeDuration - safeStart));

      setVideoTrimStartTime(safeStart);
      setVideoTrimDuration(clampedDuration);
      setVideoTrimPreviewPositionMs(safeStart * 1000);
    },
    [selectedVideoDuration],
  );

  const toggleVideoTrimPreview = useCallback(async () => {
    if (selectedAsset?.mediaType !== "video" || videoTrimPreviewLoading) {
      return;
    }

    const clipStartMs = Math.max(0, videoTrimStartTime * 1000);
    const clipEndMs = clipStartMs + Math.max(1000, videoTrimDuration * 1000);

    try {
      setVideoTrimError("");
      resetMusicPreview(0, 1, { rawUrl: "", normalizedUrl: "" }).catch(() => undefined);
      resetSelectedMusicPreview(0, 1, { rawUrl: "", normalizedUrl: "" }).catch(() => undefined);

      if (videoTrimPreviewPlaying) {
        setVideoTrimPreviewPlaying(false);
        return;
      }

      if (!videoTrimPreviewLoaded) {
        setVideoTrimPreviewLoading(true);
        setVideoTrimPreviewPlaying(true);
        return;
      }

      if (videoTrimPreviewPositionMs < clipStartMs || videoTrimPreviewPositionMs >= clipEndMs) {
        videoTrimVideoRef.current?.seek?.(videoTrimStartTime);
        setVideoTrimPreviewPositionMs(clipStartMs);
      }

      setVideoTrimPreviewPlaying(true);
    } catch (error) {
      console.log("video trim preview error:", error);
      setVideoTrimPreviewLoading(false);
      setVideoTrimPreviewPlaying(false);
      setVideoTrimError("Video preview unavailable right now.");
    }
  }, [
    selectedAsset?.mediaType,
    videoTrimDuration,
    videoTrimPreviewLoaded,
    videoTrimPreviewLoading,
    videoTrimPreviewPlaying,
    videoTrimPreviewPositionMs,
    videoTrimStartTime,
    resetMusicPreview,
    resetSelectedMusicPreview,
  ]);

  const applyVideoTrim = useCallback(async () => {
    if (selectedAsset?.mediaType !== "video") {
      return;
    }

    const safeStartMs = Math.max(0, videoTrimStartTime * 1000);
    const safeEndMs = safeStartMs + Math.max(1000, videoTrimDuration * 1000);

    try {
      setVideoTrimApplying(true);
      setVideoTrimError("");

      const result = await trimMedia(selectedAsset.uri, {
        type: "video",
        outputExt: "mp4",
        startTime: safeStartMs,
        endTime: safeEndMs,
      });

      const trimmedUri = normalizeLocalFileUri(result?.outputPath || "");
      if (!trimmedUri) {
        throw new Error("Trimmed video file was not returned.");
      }

      setSelectedAsset((current) =>
        current
          ? {
              ...current,
              id: `${current.id}_trim_${Date.now()}`,
              uri: trimmedUri,
              source: "local",
              fileName: `trimmed_${Date.now()}.mp4`,
              mimeType: "video/mp4",
              durationMs: Math.max(
                1000,
                Number(result?.duration && Number(result.duration) > 1000
                  ? result.duration
                  : Math.round((Number(result?.duration) || videoTrimDuration) * 1000))
              ),
              thumbnailUrl: current.thumbnailUrl,
            }
          : current,
      );
      closeVideoTrimSheet();
    } catch (error) {
      console.log("video trim apply error:", error);
      setVideoTrimError(toUserSafeMessage(error));
    } finally {
      setVideoTrimApplying(false);
    }
  }, [closeVideoTrimSheet, selectedAsset, videoTrimDuration, videoTrimStartTime]);

  const openMusicTrimmer = useCallback(
    async (item: MusicResultItem | SelectedMusicClip) => {
      const safeDuration = Math.max(1, Math.round(Number(item?.duration || 0) || 1));
      const nextStart = clamp(Math.round(Number(item?.clipStartTime || 0) || 0), 0, Math.max(0, safeDuration - 1));
      const nextDuration = clamp(
        Math.round(Number(item?.clipDuration || defaultClipDuration(mode, safeDuration)) || defaultClipDuration(mode, safeDuration)),
        1,
        Math.max(1, safeDuration - nextStart),
      );
      const nextEnd = Math.min(safeDuration, nextStart + nextDuration);
      const rawPlaybackUrl = getMusicClipPlaybackUrl(item);
      const playbackUrl = normalizeMediaUrl(rawPlaybackUrl);

      try {
        setMusicError("");
        if (!playbackUrl) {
          setMusicError("Music preview is not available for this track.");
          return;
        }

        setPendingMusicSelection({
          ...item,
          clipStartTime: nextStart,
          clipEndTime: nextEnd,
          clipDuration: nextDuration,
        });
        setMusicTrimStartTime(nextStart);
        setMusicTrimDuration(nextDuration);
        await resetMusicPreview(nextStart, nextEnd, {
          rawUrl: rawPlaybackUrl,
          normalizedUrl: playbackUrl,
        });
        closeMusicSheet();
        setMusicTrimSheetVisible(true);
      } catch (error) {
        setMusicError(toUserSafeMessage(error));
      }
    },
    [closeMusicSheet, mode, resetMusicPreview],
  );

  const quickSelectMusic = useCallback(
    async (item: MusicResultItem | SelectedMusicClip) => {
      await openMusicTrimmer(item);
    },
    [openMusicTrimmer],
  );

  const uploadCustomMusic = useCallback(async () => {
    try {
      const [file] = await pick({
        mode: "import",
        allowMultiSelection: false,
        type: [types.audio],
      });

      if (!file?.uri) {
        return;
      }

      let localUri = file.uri;
      if (file.isVirtual || String(file.uri || "").startsWith("content://")) {
        const [localCopy] = await keepLocalCopy({
          destination: "cachesDirectory",
          files: [
            {
              uri: file.uri,
              fileName: file.name || `audio_${Date.now()}`,
              convertVirtualFileToType: file.convertibleToMimeTypes?.[0]?.mimeType,
            },
          ],
        });

        if (!localCopy || localCopy.status !== "success") {
          throw new Error(localCopy?.copyError || "Unable to access the selected audio file.");
        }

        localUri = localCopy.localUri;
      }

      setMusicUploading(true);
      const externalId = `upload-${Date.now()}`;
      const body = new FormData();
      const normalizedName = String(file.name || `${externalId}.m4a`).trim() || `${externalId}.m4a`;
      body.append("audio", {
        uri: normalizeLocalFileUri(localUri),
        name: normalizedName,
        type: inferAudioMimeType(normalizedName, file.type),
      } as any);

      const uploaded = await postMultipart({
        path: "/upload/audio",
        body,
        timeoutMs: 120000,
      });

      const playbackUrl = String(uploaded?.url || "").trim();
      const nextTrack: MusicResultItem = {
        id: `upload:${externalId}`,
        externalId,
        title: buildUploadedTrackTitle(normalizedName),
        artist: "You",
        artworkUrl: selectedAsset?.thumbnailUrl,
        audioUrl: playbackUrl,
        streamUrl: playbackUrl,
        previewUrl: playbackUrl,
        source: "upload",
        isOriginal: true,
        duration: Math.max(1, Math.round(Number(uploaded?.duration || 0) || 1)),
      };

      if (!hasPlayableMusicClip(nextTrack)) {
        throw new Error("Uploaded audio could not be prepared for preview.");
      }

      setMusicResults((current) => prioritizeFreshMusicResults(dedupeMusicResults([nextTrack, ...current])).slice(0, 12));
      setMusicQuery("");
      await openMusicTrimmer(nextTrack);
    } catch (error: any) {
      const message =
        getDocumentPickerMessage(error)
        || getReadableApiErrorMessage(error, "Could not add your audio right now.");

      if (!message) {
        return;
      }

      console.log("custom music upload error:", error);
      Alert.alert("Audio upload failed", message);
    } finally {
      setMusicUploading(false);
    }
  }, [openMusicTrimmer, selectedAsset?.thumbnailUrl]);

  const toggleListPreviewForItem = useCallback(
    async (item: MusicResultItem | SelectedMusicClip) => {
      const rawPlaybackUrl = getMusicClipPlaybackUrl(item);
      const playbackUrl = normalizeMediaUrl(rawPlaybackUrl);
      if (!playbackUrl) {
        return;
      }

      let previewRequestId = 0;
      try {
        if (activeMusicPreviewId === item.id && listMusicPreviewPlaying) {
          listPreviewRequestIdRef.current += 1;
          await toggleListMusicPreview();
          setActiveMusicPreviewId("");
          return;
        }

        previewRequestId = listPreviewRequestIdRef.current + 1;
        listPreviewRequestIdRef.current = previewRequestId;
        setActiveMusicPreviewId(item.id);
        await resetListMusicPreview(
          0,
          Math.max(1, Math.min(Number(item.duration || 0) || 1, 30)),
          { rawUrl: rawPlaybackUrl, normalizedUrl: playbackUrl },
        );
        if (listPreviewRequestIdRef.current !== previewRequestId) {
          return;
        }
        await toggleListMusicPreview();
        if (listPreviewRequestIdRef.current !== previewRequestId) {
          setActiveMusicPreviewId("");
        }
      } catch (error) {
        console.log("music list preview error:", error);
        if (previewRequestId && listPreviewRequestIdRef.current === previewRequestId) {
          setActiveMusicPreviewId("");
        }
      }
    },
    [activeMusicPreviewId, listMusicPreviewPlaying, resetListMusicPreview, toggleListMusicPreview],
  );

  const updateMusicTrimWindow = useCallback(
    (nextStartTime: number, nextDuration: number) => {
      const safeDuration = Math.max(1, Math.round(Number(pendingMusicSelection?.duration || 0) || 1));
      const safeStart = clamp(nextStartTime, 0, Math.max(0, safeDuration - 1));
      const clampedDuration = clamp(nextDuration, 1, Math.max(1, safeDuration - safeStart));
      const safeEnd = Math.min(safeDuration, safeStart + clampedDuration);

      setMusicTrimStartTime(safeStart);
      setMusicTrimDuration(clampedDuration);
      resetMusicPreview(safeStart, safeEnd);
      setPendingMusicSelection((current) =>
        current
          ? {
              ...current,
              clipStartTime: safeStart,
              clipEndTime: safeEnd,
              clipDuration: clampedDuration,
            }
          : current,
      );
    },
    [pendingMusicSelection?.duration, resetMusicPreview],
  );

  const nudgeMusicTrimStart = useCallback(
    (deltaSeconds: number) => {
      if (!pendingMusicSelection) {
        return;
      }

      const safeDuration = Math.max(1, Math.round(Number(pendingMusicSelection.duration || 0) || 1));
      const activeDuration = clamp(
        Math.round(Number(musicTrimDuration || pendingMusicSelection.clipDuration || defaultClipDuration(mode, safeDuration)) || 1),
        1,
        safeDuration,
      );
      const safeStart = clamp(
        musicTrimStartTime + deltaSeconds,
        0,
        Math.max(0, safeDuration - activeDuration),
      );

      updateMusicTrimWindow(safeStart, activeDuration);
    },
    [
      mode,
      musicTrimDuration,
      musicTrimStartTime,
      pendingMusicSelection,
      updateMusicTrimWindow,
    ],
  );

  const toggleMusicPreview = useCallback(async () => {
    if (!pendingMusicSelection || musicPreviewLoading) {
      return;
    }

    if (!canPreviewMusic) {
      return;
    }

    try {
      setMusicError("");
      setVideoTrimPreviewPlaying(false);
      await toggleAudioMusicPreview();
    } catch (error) {
      console.log("Player Error:", error);
      setMusicError(toUserSafeMessage(error));
    }
  }, [
    canPreviewMusic,
    musicPreviewLoading,
    pendingMusicSelection,
    toggleAudioMusicPreview,
  ]);

  const toggleSelectedMusicPreview = useCallback(async () => {
    if (!selectedMusic || selectedMusicPreviewLoading) {
      return;
    }

    const rawUrl = getMusicClipPlaybackUrl(selectedMusic);
    if (!rawUrl) {
      setMusicError("Music preview is not available for this track.");
      return;
    }

    try {
      setVideoTrimPreviewPlaying(false);
      await toggleSelectedMusicPreviewPlayback();
    } catch (error) {
      setMusicError(toUserSafeMessage(error));
    }
  }, [selectedMusic, selectedMusicPreviewLoading, toggleSelectedMusicPreviewPlayback]);

  const seekMusicPreviewBy = useCallback(async (deltaSeconds: number) => {
    if (!pendingMusicSelection) {
      return;
    }

    const clipStartMs = Math.max(0, musicTrimStartTime * 1000);
    const clipEndMs = clipStartMs + Math.max(1000, musicTrimDuration * 1000);
    const nextTargetMs = clamp(
      Math.round((musicPreviewPositionMs || clipStartMs) + deltaSeconds * 1000),
      clipStartMs,
      clipEndMs,
    );

    if (!canPreviewMusic) {
      return;
    }

    try {
      await seekMusicPreviewToSeconds(Math.max(0, nextTargetMs / 1000));
    } catch (error) {
      console.log("Player Error:", error);
    }
  }, [
    canPreviewMusic,
    musicPreviewPositionMs,
    musicTrimDuration,
    musicTrimStartTime,
    pendingMusicSelection,
    seekMusicPreviewToSeconds,
  ]);

  const confirmMusicTrim = useCallback(async () => {
    if (!pendingMusicSelection) {
      return;
    }

    try {
      setMusicImportingId(pendingMusicSelection.id);
      setMusicError("");
      const savedEndTime = Math.min(
        Math.max(1, Number(pendingMusicSelection.duration || 1)),
        Math.max(musicTrimStartTime + 1, musicTrimStartTime + Math.max(1, musicTrimDuration)),
      );
      const imported = await importMusicCatalogItem({
        ...pendingMusicSelection,
        externalId: pendingMusicSelection.externalId,
        source: pendingMusicSelection.source || "upload",
        clipStartTime: musicTrimStartTime,
        clipEndTime: savedEndTime,
        clipDuration: musicTrimDuration,
      });
      setSelectedMusic({
        ...imported,
        clipStartTime: musicTrimStartTime,
        clipEndTime: savedEndTime,
        clipDuration: musicTrimDuration,
      });
      closeMusicTrimSheet();
    } catch (error) {
      setMusicError(toUserSafeMessage(error));
    } finally {
      setMusicImportingId("");
    }
  }, [closeMusicTrimSheet, musicTrimDuration, musicTrimStartTime, pendingMusicSelection]);

  const toggleMention = useCallback((candidate: AudienceCandidate) => {
    const normalized = String(candidate?.username || "").replace(/^@/, "").trim();
    const candidateId = String(candidate?.id || "").trim();

    if (!normalized || !candidateId) {
      return;
    }

    setSelectedTagPeople((current) => {
      const alreadySelected = current.some((item) => item.id === candidateId || item.username === normalized);
      if (alreadySelected) {
        return current.filter((item) => item.id !== candidateId && item.username !== normalized);
      }

      return [...current, candidate];
    });

    setSelectedMentions((current) => {
      if (current.includes(normalized)) {
        return current.filter((item) => item !== normalized);
      }

      setCaption((draft) => appendMentionToken(draft, normalized));
      return [...current, normalized];
    });
  }, []);

  const preparePostPayload = useCallback(async (
    uploadOptions?: UploadComposerAssetsOptions,
  ): Promise<CreatePostInput> => {
    if (!selectedAsset) {
      throw new Error("Choose media before publishing this post.");
    }

    const captionEntities = parseCaptionEntities(caption);
    const hashtags = Array.from(new Set(captionEntities.hashtags));
    const mentions = Array.from(new Set([...selectedMentions, ...captionEntities.mentions]));
    const [uploadedMedia] = await uploadComposerAssets([selectedAsset], uploadOptions);
    const framedMedia = buildAspectMetadata(uploadedMedia, selectedAsset, activeAspect.ratio);

    return {
      type: framedMedia.mediaType === "video" ? "video" : "photo",
      caption: caption.trim(),
      media: [framedMedia],
      location: location.trim() || undefined,
      music: selectedMusic || undefined,
      hashtags,
      mentions,
      taggedUsers: buildTaggedUserPayload(selectedTagPeople),
      collaboratorIds: [],
      settings: {
        disableComments,
        hideLikeCount,
        allowRemix: false,
      },
      filterPreset: framedMedia.mediaType === "image" && selectedFilterId !== "none" ? selectedFilterId : undefined,
      stickers: buildComposerTextStickers(),
    };
  }, [activeAspect.ratio, buildComposerTextStickers, caption, disableComments, hideLikeCount, location, selectedAsset, selectedFilterId, selectedMentions, selectedMusic, selectedTagPeople]);

  const prepareStoryPayload = useCallback(async (
    uploadOptions?: UploadComposerAssetsOptions,
  ): Promise<CreateStoryInput> => {
    if (!selectedAsset && storyCreationMode !== "text") {
      throw new Error("Choose media before publishing this story.");
    }

    const captionEntities = parseCaptionEntities(caption);
    const hashtags = Array.from(new Set(captionEntities.hashtags));
    const mentions = Array.from(new Set([...selectedMentions, ...captionEntities.mentions]));
    const normalizedStoryText = storyText.trim();
    const normalizedStoryEmoji = storyEmojiSticker.trim();
    const normalizedStoryImageUrl = String(storyImageSticker?.imageUrl || "").trim();
    const normalizedStoryImageLabel = String(storyImageSticker?.name || "Sticker").trim();

    if (storyCreationMode === "text") {
      return {
        type: "text",
        text: normalizedStoryText || caption.trim() || undefined,
        backgroundColor: storyBackgroundColor,
        location: location.trim() || undefined,
        customEmojiSticker: normalizedStoryEmoji || undefined,
        customEmojiStickerPosition: normalizedStoryEmoji ? storyEmojiPosition : undefined,
        customEmojiStickerScale: normalizedStoryEmoji ? storyEmojiScale : undefined,
        customEmojiStickerRotation: normalizedStoryEmoji ? storyEmojiRotation : undefined,
        customImageStickerUrl: normalizedStoryImageUrl || undefined,
        customImageStickerLabel: normalizedStoryImageUrl ? normalizedStoryImageLabel : undefined,
        customImageStickerPosition: normalizedStoryImageUrl ? storyImagePosition : undefined,
        customImageStickerScale: normalizedStoryImageUrl ? storyImageScale : undefined,
        customImageStickerRotation: normalizedStoryImageUrl ? storyImageRotation : undefined,
        mentions,
        hashtags,
        visibility: storyVisibility,
        allowReplies: storyAllowReplies,
        allowSharing: storyAllowSharing,
        music: selectedMusic || undefined,
      };
    }

    const [uploadedMedia] = await uploadComposerAssets([selectedAsset!], uploadOptions);

    return {
      type: "media",
      media: uploadedMedia,
      text: caption.trim() || undefined,
      location: location.trim() || undefined,
      filterPreset: storyFilterPreset,
      filterIntensity: storyFilterPreset === "none" ? undefined : storyFilterIntensity,
      customTextSticker: normalizedStoryText || undefined,
      customTextStickerPosition: normalizedStoryText ? storyTextPosition : undefined,
      customTextStickerScale: normalizedStoryText ? storyTextScale : undefined,
      customTextStickerRotation: normalizedStoryText ? storyTextRotation : undefined,
      customTextStickerTheme: normalizedStoryText ? storyTextTheme : undefined,
      customTextStickerAlignment: normalizedStoryText ? storyTextAlignment : undefined,
      customEmojiSticker: normalizedStoryEmoji || undefined,
      customEmojiStickerPosition: normalizedStoryEmoji ? storyEmojiPosition : undefined,
      customEmojiStickerScale: normalizedStoryEmoji ? storyEmojiScale : undefined,
      customEmojiStickerRotation: normalizedStoryEmoji ? storyEmojiRotation : undefined,
      customImageStickerUrl: normalizedStoryImageUrl || undefined,
      customImageStickerLabel: normalizedStoryImageUrl ? normalizedStoryImageLabel : undefined,
      customImageStickerPosition: normalizedStoryImageUrl ? storyImagePosition : undefined,
      customImageStickerScale: normalizedStoryImageUrl ? storyImageScale : undefined,
      customImageStickerRotation: normalizedStoryImageUrl ? storyImageRotation : undefined,
      mentions,
      hashtags,
      visibility: storyVisibility,
      allowReplies: storyAllowReplies,
      allowSharing: storyAllowSharing,
      music: selectedMusic || undefined,
    };
  }, [
    caption,
    location,
    selectedAsset,
    selectedMentions,
    selectedMusic,
    storyBackgroundColor,
    storyAllowReplies,
    storyAllowSharing,
    storyCreationMode,
    storyEmojiPosition,
    storyEmojiRotation,
    storyEmojiScale,
    storyEmojiSticker,
    storyImagePosition,
    storyImageRotation,
    storyImageScale,
    storyImageSticker,
    storyFilterIntensity,
    storyFilterPreset,
    storyText,
    storyTextAlignment,
    storyTextPosition,
    storyTextRotation,
    storyTextScale,
    storyTextTheme,
    storyVisibility,
  ]);

  const prepareSwipePayload = useCallback(async (
    uploadOptions?: UploadComposerAssetsOptions,
  ): Promise<CreateSwipeInput> => {
    if (!selectedAsset) {
      throw new Error("Choose a video before publishing this swipe.");
    }

    const captionEntities = parseCaptionEntities(caption);
    const hashtags = Array.from(new Set(captionEntities.hashtags));
    const mentions = Array.from(new Set([...selectedMentions, ...captionEntities.mentions]));
    const [uploadedMedia] = await uploadComposerAssets([selectedAsset], uploadOptions);

    if (uploadedMedia.mediaType !== "video") {
      throw new Error("Swipes require a video.");
    }

    return {
      caption: caption.trim(),
      media: uploadedMedia,
      thumbnailUrl: uploadedMedia.thumbnailUrl,
      music: selectedMusic || undefined,
      location: location.trim() || undefined,
      hashtags,
      mentions,
      taggedUsers: buildTaggedUserPayload(selectedTagPeople),
      stickers: buildComposerTextStickers(),
    };
  }, [buildComposerTextStickers, caption, location, selectedAsset, selectedMentions, selectedMusic, selectedTagPeople]);

  const publish = useCallback(async () => {
    if (publishing) {
      return;
    }

    try {
      setPublishing(true);
      setPublishError("");
      if (selectedMusic && !hasTrimmedMusicSelection(selectedMusic)) {
        throw new Error("Please trim the selected music before publishing.");
      }
      if (selectedMusic && !isPersistedMusicId(selectedMusic.id)) {
        throw new Error("Selected track is still syncing. Please select it again.");
      }
      if (selectedMusic && !getMusicClipPlaybackUrl(selectedMusic)) {
        throw new Error("Selected track is missing playback data. Choose another track.");
      }
      const queueLabel = MODE_COPY[mode].label;

      startPublishTask({
        mode,
        label: queueLabel,
        run: async ({ setProgress }) => {
          const handleUploadProgress = (progress: number) => {
            setProgress(0.08 + progress * 0.72, "Uploading media...");
          };

          if (mode === "post") {
            setProgress(0.05, "Preparing post...");
            const payload = await preparePostPayload({ onProgress: handleUploadProgress });
            setProgress(0.88, "Publishing post...", "publishing");
            await socialApi.createPost(payload);
            setProgress(1, "Post uploaded", "success");
            return;
          }

          if (mode === "story") {
            setProgress(0.05, "Preparing story...");
            const payload = await prepareStoryPayload({ onProgress: handleUploadProgress });
            setProgress(0.88, "Publishing story...", "publishing");
            await socialApi.createStory(payload);
            setProgress(1, "Story uploaded", "success");
            return;
          }

          setProgress(0.05, "Preparing swipe...");
          const payload = await prepareSwipePayload({ onProgress: handleUploadProgress });
          setProgress(0.88, "Publishing swipe...", "publishing");
          await socialApi.createSwipe(payload);
          setProgress(1, "Swipe uploaded", "success");
        },
      });

      resetComposerState();
      exitComposer();
    } catch (error) {
      const nextMessage = getReadableApiErrorMessage(error, toUserSafeMessage(error));
      setPublishError(nextMessage);
      Alert.alert("Publish failed", nextMessage);
    } finally {
      setPublishing(false);
    }
  }, [exitComposer, mode, preparePostPayload, prepareStoryPayload, prepareSwipePayload, publishing, resetComposerState, selectedMusic]);

  const updateStoryTextPosition = useCallback((nextPosition: { x: number; y: number }) => {
    setStoryTextPosition({
      x: clamp(nextPosition.x, 0.04, 0.84),
      y: clamp(nextPosition.y, 0.04, 0.84),
    });
  }, []);

  const updateStoryEmojiPosition = useCallback((nextPosition: { x: number; y: number }) => {
    setStoryEmojiPosition({
      x: clamp(nextPosition.x, 0.04, 0.84),
      y: clamp(nextPosition.y, 0.04, 0.84),
    });
  }, []);

  const updateStoryImagePosition = useCallback((nextPosition: { x: number; y: number }) => {
    setStoryImagePosition({
      x: clamp(nextPosition.x, 0.04, 0.84),
      y: clamp(nextPosition.y, 0.04, 0.84),
    });
  }, []);

  const storyTextResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!storyText.trim(),
        onMoveShouldSetPanResponder: () => !!storyText.trim(),
        onPanResponderGrant: () => {
          setStoryActiveLayer("text");
          storyTextPan.setOffset({
            x: Number((storyTextPan.x as any)._value || 0),
            y: Number((storyTextPan.y as any)._value || 0),
          });
          storyTextPan.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: Animated.event([null, { dx: storyTextPan.x, dy: storyTextPan.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: () => {
          storyTextPan.flattenOffset();
          const rawX = Number((storyTextPan.x as any)._value || 0);
          const rawY = Number((storyTextPan.y as any)._value || 0);
          updateStoryTextPosition({
            x: storyCanvasSize.width ? rawX / storyCanvasSize.width : storyTextPosition.x,
            y: storyCanvasSize.height ? rawY / storyCanvasSize.height : storyTextPosition.y,
          });
        },
      }),
    [
      storyCanvasSize.height,
      storyCanvasSize.width,
      storyText,
      storyTextPan,
      storyTextPosition.x,
      storyTextPosition.y,
      updateStoryTextPosition,
    ],
  );

  const storyEmojiResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!storyEmojiSticker,
        onMoveShouldSetPanResponder: () => !!storyEmojiSticker,
        onPanResponderGrant: () => {
          setStoryActiveLayer("emoji");
          storyEmojiPan.setOffset({
            x: Number((storyEmojiPan.x as any)._value || 0),
            y: Number((storyEmojiPan.y as any)._value || 0),
          });
          storyEmojiPan.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: Animated.event([null, { dx: storyEmojiPan.x, dy: storyEmojiPan.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: () => {
          storyEmojiPan.flattenOffset();
          const rawX = Number((storyEmojiPan.x as any)._value || 0);
          const rawY = Number((storyEmojiPan.y as any)._value || 0);
          updateStoryEmojiPosition({
            x: storyCanvasSize.width ? rawX / storyCanvasSize.width : storyEmojiPosition.x,
            y: storyCanvasSize.height ? rawY / storyCanvasSize.height : storyEmojiPosition.y,
          });
        },
      }),
    [
      storyCanvasSize.height,
      storyCanvasSize.width,
      storyEmojiPan,
      storyEmojiPosition.x,
      storyEmojiPosition.y,
      storyEmojiSticker,
      updateStoryEmojiPosition,
    ],
  );

  const storyImageResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!storyImageSticker?.imageUrl,
        onMoveShouldSetPanResponder: () => !!storyImageSticker?.imageUrl,
        onPanResponderGrant: () => {
          setStoryActiveLayer("image");
          storyImagePan.setOffset({
            x: Number((storyImagePan.x as any)._value || 0),
            y: Number((storyImagePan.y as any)._value || 0),
          });
          storyImagePan.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: Animated.event([null, { dx: storyImagePan.x, dy: storyImagePan.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: () => {
          storyImagePan.flattenOffset();
          const rawX = Number((storyImagePan.x as any)._value || 0);
          const rawY = Number((storyImagePan.y as any)._value || 0);
          updateStoryImagePosition({
            x: storyCanvasSize.width ? rawX / storyCanvasSize.width : storyImagePosition.x,
            y: storyCanvasSize.height ? rawY / storyCanvasSize.height : storyImagePosition.y,
          });
        },
      }),
    [
      storyCanvasSize.height,
      storyCanvasSize.width,
      storyImagePan,
      storyImagePosition.x,
      storyImagePosition.y,
      storyImageSticker?.imageUrl,
      updateStoryImagePosition,
    ],
  );

  const renderStoryAdjustment = (
    label: string,
    valueText: string,
    value: number,
    min: number,
    max: number,
    onChange: (nextValue: number) => void,
  ) => (
    <View style={styles.storyAdjustmentBlock}>
      <View style={styles.storyAdjustmentHeader}>
        <Text style={[styles.storyAdjustmentLabel, { color: textColor }]}>{label}</Text>
        <Text style={[styles.storyAdjustmentValue, { color: mutedColor }]}>{valueText}</Text>
      </View>
      <ValueSlider value={value} min={min} max={max} onChange={onChange} accentColor={accentColor} mutedColor={hairlineColor} />
    </View>
  );

  const renderStoryCanvas = (options?: { interactive?: boolean; compact?: boolean; fullscreen?: boolean }) => {
    if (!selectedAsset && storyCreationMode !== "text") {
      return (
        <View style={[styles.emptyPreview, { backgroundColor: elevatedSurfaceColor, borderColor }]}>
          <Icon name={MODE_COPY[mode].icon} size={34} color={mutedColor} />
          <Text style={[styles.emptyPreviewTitle, { color: textColor }]}>{MODE_COPY[mode].emptyLabel}</Text>
        </View>
      );
    }

    const interactive = !!options?.interactive;
    const compact = !!options?.compact;
    const fullscreen = !!options?.fullscreen;
    const frameStyle = [
      styles.storyCanvasFrame,
      compact ? styles.storyCanvasCompact : styles.storyCanvasExpanded,
      fullscreen ? styles.storyCanvasFullscreen : null,
      {
        backgroundColor: isDarkMode ? "#020617" : "#DDE8E1",
        borderColor,
        height: compact ? storyCompactCanvasHeight : storyExpandedCanvasHeight,
      },
    ];

    return (
      <View
        style={frameStyle}
        onLayout={(event) => {
          if (!interactive) {
            return;
          }

          const { width, height } = event.nativeEvent.layout;
          if (width && height) {
            setStoryCanvasSize({ width, height });
          }
        }}
      >
        {!selectedAsset ? (
          <View style={[styles.storyCanvasMedia, { backgroundColor: storyBackgroundColor }]} />
        ) : selectedAsset.mediaType === "video" ? (
          <SocialVideo
            uri={selectedAsset.uri}
            posterUri={selectedAsset.thumbnailUrl}
            style={StyleSheet.absoluteFill}
            muted
            repeat
            paused={stage === "details"}
          />
        ) : (
          <Image source={{ uri: selectedAsset.uri }} style={styles.storyCanvasMedia} resizeMode="cover" />
        )}

        {selectedAsset?.mediaType === "video" && storyOverlayTint ? (
          <View pointerEvents="none" style={[styles.storyFilterOverlay, storyOverlayTint]} />
        ) : null}
        {storyBrightnessOverlay ? (
          <View pointerEvents="none" style={[styles.storyFilterOverlay, storyBrightnessOverlay]} />
        ) : null}
        <View pointerEvents="none" style={styles.storyCanvasShade} />

        {storyText.trim() ? (
          <Animated.View
            style={[
              styles.storyLayer,
              storyCreationMode === "text" ? styles.storyLayerTextStory : null,
              {
                transform: [
                  ...storyTextPan.getTranslateTransform(),
                  { rotate: `${storyTextRotation}deg` },
                  { scale: storyTextScale },
                ],
              },
              interactive && storyActiveLayer === "text" ? [styles.storyLayerActive, { borderColor: accentColor }] : null,
            ]}
            {...(interactive ? storyTextResponder.panHandlers : {})}
          >
            <Text
              style={[
                styles.storyTextOverlay,
                storyCreationMode === "text" ? styles.storyTextOverlayTextStory : null,
                {
                  color: storyTextColor || storyTextThemeStyle.color,
                  backgroundColor: storyTextThemeStyle.backgroundColor,
                  fontFamily: storyTextFontStyle.fontFamily,
                  fontStyle: storyTextFontStyle.fontStyle || "normal",
                  textAlign: storyTextAlignment,
                },
              ]}
            >
              {storyText}
            </Text>
          </Animated.View>
        ) : interactive ? (
          <View pointerEvents="none" style={styles.storyCanvasHintWrap}>
            <Text style={styles.storyCanvasHintTitle}>Add text, overlay, or music</Text>
          </View>
        ) : null}

        {storyEmojiSticker ? (
          <Animated.View
            style={[
              styles.storyEmojiLayer,
              {
                transform: [
                  ...storyEmojiPan.getTranslateTransform(),
                  { rotate: `${storyEmojiRotation}deg` },
                  { scale: storyEmojiScale },
                ],
              },
              interactive && storyActiveLayer === "emoji" ? [styles.storyLayerActive, { borderColor: accentColor }] : null,
            ]}
            {...(interactive ? storyEmojiResponder.panHandlers : {})}
          >
            <Text style={styles.storyEmojiText}>{storyEmojiSticker}</Text>
          </Animated.View>
        ) : null}

        {storyImageSticker?.imageUrl ? (
          <Animated.View
            style={[
              styles.storyImageLayer,
              {
                transform: [
                  ...storyImagePan.getTranslateTransform(),
                  { rotate: `${storyImageRotation}deg` },
                  { scale: storyImageScale },
                ],
              },
              interactive && storyActiveLayer === "image" ? [styles.storyLayerActive, { borderColor: accentColor }] : null,
            ]}
            {...(interactive ? storyImageResponder.panHandlers : {})}
          >
            <Image source={{ uri: storyImageSticker.imageUrl }} style={styles.storyImageAsset} resizeMode="contain" />
          </Animated.View>
        ) : null}

        {selectedMusic ? (
          <View style={styles.storyMusicBadge}>
            <Icon name="musical-notes" size={12} color="#fff" />
            <Text style={styles.storyMusicBadgeText} numberOfLines={1}>
              {selectedMusic.title}
            </Text>
          </View>
        ) : null}

        {selectedAsset?.mediaType === "video" ? (
          <View style={styles.storyVideoPill}>
            <Icon name="videocam" size={14} color="#fff" />
            <Text style={styles.storyVideoPillText}>Video</Text>
          </View>
        ) : null}
      </View>
    );
  };

  const renderStoryToolRail = () => {
    const railItems: Array<{
      id: Exclude<StoryToolPanel, null> | "music" | "trim";
      label: string;
      icon: string;
      active?: boolean;
      onPress: () => void;
    }> = [
      {
        id: "text",
        label: "Text",
        icon: "text-outline",
        active: storyToolPanel === "text",
        onPress: () => {
          setStoryActiveLayer("text");
          setStoryToolPanel("text");
        },
      },
      {
        id: "color",
        label: "Color",
        icon: "color-palette-outline",
        active: storyToolPanel === "color",
        onPress: () => setStoryToolPanel("color"),
      },
      {
        id: "font",
        label: "Font",
        icon: "create-outline",
        active: storyToolPanel === "font",
        onPress: () => setStoryToolPanel("font"),
      },
      {
        id: "size",
        label: "Size",
        icon: "resize-outline",
        active: storyToolPanel === "size",
        onPress: () => setStoryToolPanel("size"),
      },
      {
        id: "sticker",
        label: "Overlay",
        icon: "sparkles-outline",
        active: storyToolPanel === "sticker",
        onPress: () => {
          setStoryActiveLayer(storyImageSticker ? "image" : "emoji");
          setStoryToolPanel("sticker");
        },
      },
      {
        id: "music",
        label: "Music",
        icon: "musical-notes-outline",
        active: musicSheetVisible || !!selectedMusic,
        onPress: () => setMusicSheetVisible(true),
      },
      ...(selectedAsset?.mediaType === "video"
        ? [
            {
              id: "trim" as const,
              label: "Trim",
              icon: "cut-outline",
              active: videoTrimSheetVisible,
              onPress: openVideoTrimmer,
            },
          ]
        : []),
      {
        id: "filters",
        label: "Filter",
        icon: "color-filter-outline",
        active: storyToolPanel === "filters",
        onPress: () => setStoryToolPanel("filters"),
      },
    ];

    return (
      <View
        style={[
          styles.storyToolRail,
          {
            backgroundColor: toAlphaColor(isDarkMode ? "#020617" : "#ffffff", isDarkMode ? 0.86 : 0.92),
            borderColor,
            top: Math.max(insets.top + 92, 118),
          },
        ]}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.storyToolRailScroll}>
          {railItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.storyRailButton,
                item.active ? { backgroundColor: accentSoft, borderColor: accentColor } : { backgroundColor: inputBackground, borderColor },
              ]}
              onPress={item.onPress}
            >
              <Icon name={item.icon} size={17} color={accentColor} />
              <Text style={[styles.storyRailButtonText, { color: textColor }]} numberOfLines={2}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderStoryToolPanel = (options?: { inSheet?: boolean }) => {
    const inSheet = !!options?.inSheet;
    const panelStyle = inSheet ? styles.storyToolPanelSheet : styles.storyToolPanel;
    const showPanelTitle = !inSheet;

    if (storyToolPanel === "text") {
      return (
        <View style={[panelStyle, { backgroundColor: surfaceColor, borderColor }]}>
          {showPanelTitle ? (
            <Text style={[styles.storyToolPanelTitle, { color: textColor }]}>
              {storyCreationMode === "text" ? "Story text" : "Text overlay"}
            </Text>
          ) : null}
          <TextInput
            value={storyText}
            onChangeText={(nextValue) => {
              setStoryText(nextValue.replace(/\s{2,}/g, " ").slice(0, 48));
              setStoryActiveLayer("text");
            }}
            placeholder="Write something"
            placeholderTextColor={mutedColor}
            multiline
            maxLength={48}
            style={[styles.storyTextInput, { color: textColor, backgroundColor: inputBackground, borderColor }]}
          />

          <View style={styles.storyAlignmentRow}>
            {STORY_TEXT_FONT_OPTIONS.slice(0, 3).map((option) => {
              const active = storyTextFont === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.storyAlignButton,
                    {
                      backgroundColor: active ? accentSoft : inputBackground,
                      borderColor: active ? accentColor : borderColor,
                    },
                  ]}
                  onPress={() => setStoryTextFont(option.id)}
                >
                  <Icon
                    name={option.id === "italic" ? "create-outline" : option.id === "bold" ? "text-outline" : "reader-outline"}
                    size={16}
                    color={accentColor}
                  />
                  <Text
                    style={[
                      styles.storyAlignButtonText,
                      {
                        color: textColor,
                        fontFamily: option.fontFamily,
                        fontStyle: option.fontStyle || "normal",
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

        </View>
      );
    }

    if (storyToolPanel === "color") {
      return (
        <View style={[panelStyle, { backgroundColor: surfaceColor, borderColor }]}>
          {showPanelTitle ? <Text style={[styles.storyToolPanelTitle, { color: textColor }]}>Text color</Text> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyChipRow}>
            {STORY_TEXT_THEMES.map((theme) => {
              const active = theme.id === storyTextTheme;
              return (
                <TouchableOpacity
                  key={theme.id}
                  style={[
                    styles.storyThemeChip,
                    {
                      backgroundColor: active ? accentSoft : inputBackground,
                      borderColor: active ? accentColor : borderColor,
                    },
                  ]}
                  onPress={() => setStoryTextTheme(theme.id)}
                >
                  <View style={[styles.storyThemeSwatch, { backgroundColor: theme.backgroundColor }]} />
                  <Text style={[styles.storyThemeChipText, { color: textColor }]}>{theme.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyChipRow}>
            {STORY_TEXT_COLOR_OPTIONS.map((color) => {
              const active = storyTextColor === color;
              return (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.storyBackgroundChip,
                    {
                      backgroundColor: color,
                      borderColor: active ? accentColor : "rgba(255,255,255,0.18)",
                    },
                  ]}
                  onPress={() => setStoryTextColor(color)}
                />
              );
            })}
          </ScrollView>
        </View>
      );
    }

    if (storyToolPanel === "font") {
      return (
        <View style={[panelStyle, { backgroundColor: surfaceColor, borderColor }]}>
          {showPanelTitle ? <Text style={[styles.storyToolPanelTitle, { color: textColor }]}>Font family</Text> : null}
          <View style={styles.storyFontList}>
            {STORY_TEXT_FONT_OPTIONS.map((option) => {
              const active = storyTextFont === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.storyFontOption,
                    {
                      backgroundColor: active ? accentSoft : inputBackground,
                      borderColor: active ? accentColor : borderColor,
                    },
                  ]}
                  onPress={() => setStoryTextFont(option.id)}
                >
                  <Text style={[styles.storyFontOptionText, { color: textColor, fontFamily: option.fontFamily }]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      );
    }

    if (storyToolPanel === "size") {
      return (
        <View style={[panelStyle, { backgroundColor: surfaceColor, borderColor }]}>
          {showPanelTitle ? <Text style={[styles.storyToolPanelTitle, { color: textColor }]}>Text size</Text> : null}
          {renderStoryAdjustment("Size", `${Math.round(storyTextScale * 100)}%`, storyTextScale, 0.8, 1.8, setStoryTextScale)}
        </View>
      );
    }

    if (storyToolPanel === "filters") {
      return (
        <View style={[panelStyle, { backgroundColor: surfaceColor, borderColor }]}>
          {showPanelTitle ? <Text style={[styles.storyToolPanelTitle, { color: textColor }]}>Story look</Text> : null}
          <View style={styles.storyPanelSection}>
            <View style={styles.storyToolPanelHeader}>
              <Text style={[styles.storyPanelLabel, { color: textColor }]}>Background</Text>
              <TouchableOpacity
                onPress={() =>
                  setStoryBackgroundColor(
                    STORY_BACKGROUND_COLORS[Math.floor(Math.random() * STORY_BACKGROUND_COLORS.length)] || STORY_BACKGROUND_COLORS[0],
                  )
                }
              >
                <Text style={[styles.storyStickerClear, { color: accentColor }]}>Random</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyChipRow}>
              {STORY_BACKGROUND_COLORS.map((color) => {
                const active = color === storyBackgroundColor;
                return (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.storyBackgroundChip,
                      {
                        backgroundColor: color,
                        borderColor: active ? "#ffffff" : "rgba(255,255,255,0.18)",
                      },
                    ]}
                    onPress={() => setStoryBackgroundColor(color)}
                  />
                );
              })}
            </ScrollView>
          </View>

          {selectedAsset ? (
            <>
              <View style={styles.storyPanelSection}>
                <Text style={[styles.storyPanelLabel, { color: textColor }]}>Filter preset</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyChipRow}>
                  {STORY_FILTER_OPTIONS.map((filter) => {
                    const active = storyFilterPreset === filter.id;
                    return (
                      <TouchableOpacity
                        key={filter.id}
                        style={[
                          styles.storyFilterChip,
                          {
                            backgroundColor: active ? accentSoft : inputBackground,
                            borderColor: active ? accentColor : borderColor,
                          },
                        ]}
                        onPress={() => setStoryFilterPreset(filter.id)}
                      >
                        <Text style={[styles.storyFilterChipText, { color: textColor }]}>{filter.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {renderStoryAdjustment("Intensity", `${Math.round(storyFilterIntensity * 100)}%`, storyFilterIntensity, 0.2, 1, setStoryFilterIntensity)}
            </>
          ) : (
            <Text style={[styles.helperText, { color: mutedColor }]}>Pick a background color.</Text>
          )}
        </View>
      );
    }

    if (storyToolPanel === "sticker") {
      return (
        <View style={[panelStyle, { backgroundColor: surfaceColor, borderColor }]}>
          <View style={styles.storyToolPanelHeader}>
            {showPanelTitle ? <Text style={[styles.storyToolPanelTitle, { color: textColor }]}>Stickers</Text> : <View />}
            {storyEmojiSticker || storyImageSticker ? (
              <TouchableOpacity
                onPress={() => {
                  setStoryEmojiSticker("");
                  setStoryImageSticker(null);
                }}
              >
                <Text style={[styles.storyStickerClear, { color: accentColor }]}>Remove</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <TextInput
            value={storyStickerQuery}
            onChangeText={setStoryStickerQuery}
            placeholder="Search emoji or overlay"
            placeholderTextColor={mutedColor}
            style={[styles.storyTextInput, styles.storyStickerSearchInput, { color: textColor, backgroundColor: inputBackground, borderColor }]}
          />

          {storyStickerLoading ? <ActivityIndicator size="small" color={accentColor} style={styles.storyStickerLoader} /> : null}
          {storyStickerError ? <Text style={[styles.helperText, { color: isDarkMode ? "#FCA5A5" : "#B91C1C" }]}>{storyStickerError}</Text> : null}

          <Text style={[styles.storyPanelLabel, styles.storyStickerSectionTitle, { color: textColor }]}>Quick emoji</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyChipRow}>
            {storyEmojiOptions.map((item) => {
              const emoji = String(item.emoji || "").trim();
              if (!emoji) {
                return null;
              }
              const active = storyEmojiSticker === emoji;
              return (
                <TouchableOpacity
                  key={item._id}
                  style={[
                    styles.storyEmojiChip,
                    {
                      backgroundColor: active ? accentSoft : inputBackground,
                      borderColor: active ? accentColor : borderColor,
                    },
                  ]}
                  onPress={() => {
                    setStoryEmojiSticker(emoji);
                    setStoryActiveLayer("emoji");
                  }}
                >
                  <Text style={styles.storyEmojiChipText}>{emoji}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.storyToolPanelHeader}>
            <Text style={[styles.storyPanelLabel, styles.storyStickerSectionTitle, { color: textColor }]}>Overlay images</Text>
            <Text style={[styles.helperText, styles.storyStickerSectionHint, { color: mutedColor }]}>Text and media</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyChipRow}>
            {storyImageOptions.map((item) => {
              const active = storyImageSticker?._id === item._id;
              return (
                <TouchableOpacity
                  key={item._id}
                  style={[
                    styles.storyImageOption,
                    {
                      backgroundColor: active ? accentSoft : inputBackground,
                      borderColor: active ? accentColor : borderColor,
                    },
                  ]}
                  onPress={() => {
                    setStoryImageSticker(item);
                    setStoryActiveLayer("image");
                  }}
                >
                  <Image source={{ uri: item.thumbnailUrl || item.imageUrl }} style={styles.storyImageOptionThumb} resizeMode="contain" />
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {storyEmojiSticker ? (
            <>
              {renderStoryAdjustment("Size", `${Math.round(storyEmojiScale * 100)}%`, storyEmojiScale, 0.8, 1.8, setStoryEmojiScale)}
              {renderStoryAdjustment("Rotate", `${Math.round(storyEmojiRotation)} deg`, storyEmojiRotation, -45, 45, setStoryEmojiRotation)}
            </>
          ) : null}

          {storyImageSticker ? (
            <>
              <Text style={[styles.helperText, { color: mutedColor }]} numberOfLines={1}>
                {storyImageSticker.name || "Selected overlay"}
              </Text>
              {renderStoryAdjustment("Size", `${Math.round(storyImageScale * 100)}%`, storyImageScale, 0.8, 1.8, setStoryImageScale)}
              {renderStoryAdjustment("Rotate", `${Math.round(storyImageRotation)} deg`, storyImageRotation, -45, 45, setStoryImageRotation)}
            </>
          ) : null}
        </View>
      );
    }

    return null;
  };

  const renderStoryToolSheet = () => {
    if (!storyToolPanel) {
      return null;
    }

    const sheetTitle =
      storyToolPanel === "text"
        ? storyCreationMode === "text"
          ? "Story text"
          : "Text overlay"
        : storyToolPanel === "color"
          ? "Text color"
          : storyToolPanel === "font"
            ? "Font family"
            : storyToolPanel === "size"
              ? "Text size"
        : storyToolPanel === "filters"
          ? "Story look"
          : "Stickers";

    const sheetEyebrow =
      storyToolPanel === "text"
        ? "Text"
        : storyToolPanel === "color"
          ? "Color"
          : storyToolPanel === "font"
            ? "Font"
            : storyToolPanel === "size"
              ? "Size"
        : storyToolPanel === "filters"
          ? "Look"
          : "Stickers";

    const snapPoints =
      storyToolPanel === "text"
        ? [0.42, 0.64]
        : storyToolPanel === "color"
          ? [0.34, 0.5]
          : storyToolPanel === "font"
            ? [0.34, 0.48]
            : storyToolPanel === "size"
              ? [0.36, 0.56]
        : storyToolPanel === "filters"
          ? [0.46, 0.72]
          : [0.44, 0.7];

    return (
      <DraggableBottomSheet
        visible
        onClose={() => setStoryToolPanel(null)}
        snapPoints={snapPoints}
        initialSnapIndex={1}
      >
        <View style={styles.sheetContent}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={[styles.sheetEyebrow, { color: accentColor }]}>{sheetEyebrow}</Text>
              <Text style={[styles.sheetTitle, { color: textColor }]}>{sheetTitle}</Text>
            </View>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: inputBackground, borderColor }]}
              onPress={() => setStoryToolPanel(null)}
            >
              <Icon name="close" size={18} color={textColor} />
            </TouchableOpacity>
          </View>
          {renderStoryToolPanel({ inSheet: true })}
        </View>
      </DraggableBottomSheet>
    );
  };

  const renderStoryEditStage = () => (
    <Animated.View
      style={[
        styles.storyStageWrap,
        {
          opacity: stageAnimation,
          transform: [
            {
              translateY: stageAnimation.interpolate({
                inputRange: [0, 1],
                outputRange: [16, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.storyEditContent}>
        <View style={styles.storyCanvasShell}>{renderStoryCanvas({ interactive: true, fullscreen: true })}</View>
        <View style={[styles.storyStageTopBar, { paddingTop: Math.max(insets.top + 4, 10) }]}>
          {renderStageHeader("Edit story", "", () => {
            if (!canContinueFromEdit) {
              Alert.alert("Complete your story", storyCreationMode === "text" ? "Add some text before continuing." : MODE_COPY[mode].emptyLabel);
              return;
            }
            startTransition(() => setStage("details"));
          })}
        </View>
        {renderStoryToolRail()}
      </View>
      {renderStoryToolSheet()}
    </Animated.View>
  );

  const renderStageHeader = (
    title: string,
    subtitle: string,
    onNext: () => void,
    options?: { disabled?: boolean; loading?: boolean },
  ) => (
    <View style={styles.topBar}>
      <TouchableOpacity style={[styles.iconButton, { backgroundColor: surfaceColor, borderColor }]} onPress={handleBackAction}>
        <Icon name="chevron-back" size={18} color={textColor} />
      </TouchableOpacity>
      <View style={styles.topBarCenter}>
        <Text style={[styles.topBarTitle, { color: textColor }]}>{title}</Text>
        {subtitle ? <Text style={[styles.topBarSubtitle, { color: mutedColor }]}>{subtitle}</Text> : null}
      </View>
      <TouchableOpacity
        style={[
          styles.iconButton,
          styles.topBarNavButton,
          {
            backgroundColor: options?.disabled ? inputBackground : accentSoft,
            borderColor: options?.disabled ? borderColor : accentColor,
          },
        ]}
        onPress={onNext}
        disabled={options?.disabled}
      >
        {options?.loading ? (
          <ActivityIndicator size="small" color={accentColor} />
        ) : (
          <Icon name="chevron-forward" size={18} color={options?.disabled ? mutedColor : accentColor} />
        )}
      </TouchableOpacity>
    </View>
  );

  const updateComposerCanvasSize = (width: number, height: number) => {
    if (width && height) {
      setStoryCanvasSize({ width, height });
    }
  };

  const renderComposerTextOverlay = (interactive = false) => {
    const normalizedText = storyText.trim();

    if (!normalizedText) {
      return interactive ? (
        <View pointerEvents="none" style={styles.storyCanvasHintWrap}>
          <Text style={styles.storyCanvasHintTitle}>Add draggable text</Text>
        </View>
      ) : null;
    }

    const textStyle = [
      styles.storyTextOverlay,
      {
        color: composerTextStickerStyle.color,
        backgroundColor: composerTextStickerStyle.backgroundColor,
        fontFamily: composerTextStickerStyle.fontFamily,
        fontStyle: composerTextStickerStyle.fontStyle,
        textAlign: composerTextStickerStyle.alignment,
      },
    ];

    if (!interactive) {
      return (
        <View
          pointerEvents="none"
          style={[
            styles.storyLayer,
            {
              left: `${clamp(storyTextPosition.x, 0.04, 0.84) * 100}%`,
              top: `${clamp(storyTextPosition.y, 0.04, 0.84) * 100}%`,
              transform: [
                { rotate: `${storyTextRotation}deg` },
                { scale: storyTextScale },
              ],
            },
          ]}
        >
          <Text style={textStyle}>{normalizedText}</Text>
        </View>
      );
    }

    return (
      <Animated.View
        style={[
          styles.storyLayer,
          {
            transform: [
              ...storyTextPan.getTranslateTransform(),
              { rotate: `${storyTextRotation}deg` },
              { scale: storyTextScale },
            ],
          },
          storyActiveLayer === "text" ? [styles.storyLayerActive, { borderColor: accentColor }] : null,
        ]}
        {...storyTextResponder.panHandlers}
      >
        <Text style={textStyle}>{normalizedText}</Text>
      </Animated.View>
    );
  };

  const renderPreviewMedia = (options?: { interactive?: boolean }) => {
    if (!selectedAsset) {
      return (
        <View style={[styles.emptyPreview, { backgroundColor: elevatedSurfaceColor, borderColor }]}>
          <Icon name={MODE_COPY[mode].icon} size={34} color={mutedColor} />
          <Text style={[styles.emptyPreviewTitle, { color: textColor }]}>{MODE_COPY[mode].emptyLabel}</Text>
        </View>
      );
    }

    if (mode === "story") {
      return renderStoryCanvas({ compact: true });
    }

    const previewStyle = [
      styles.previewFrame,
      {
        backgroundColor: isDarkMode ? "#020617" : "#E5ECE7",
        borderColor,
        aspectRatio: activeAspect.ratio,
      },
    ];
    const imageResizeMode =
      selectedAsset.width && selectedAsset.height && Math.abs(selectedAsset.width / Math.max(1, selectedAsset.height) - activeAspect.ratio) > 0.12
        ? "contain"
        : "cover";
    const interactive = !!options?.interactive;

    if (selectedAsset.mediaType === "video") {
      return (
        <View
          style={previewStyle}
          onLayout={(event) => {
            if (interactive) {
              updateComposerCanvasSize(event.nativeEvent.layout.width, event.nativeEvent.layout.height);
            }
          }}
        >
          <SocialVideo
            uri={selectedAsset.uri}
            posterUri={selectedAsset.thumbnailUrl}
            style={StyleSheet.absoluteFill}
            muted
            repeat
            paused={stage === "details"}
          />
          <View style={styles.videoBadge}>
            <Icon name="videocam" size={16} color="#fff" />
            <Text style={styles.videoBadgeText}>{MODE_COPY[mode].label}</Text>
          </View>
          {renderComposerTextOverlay(interactive)}
        </View>
      );
    }

    return (
      <View
        style={previewStyle}
        onLayout={(event) => {
          if (interactive) {
            updateComposerCanvasSize(event.nativeEvent.layout.width, event.nativeEvent.layout.height);
          }
        }}
      >
        {ColorMatrix && selectedFilterId !== "none" ? (
          <View style={styles.previewMediaFill}>
            <ColorMatrix matrix={(PHOTO_FILTER_LIST.find((item) => item.id === selectedFilterId) || PHOTO_FILTER_LIST[0]).matrix}>
              <Image source={{ uri: selectedAsset.uri }} style={styles.previewMedia} resizeMode={imageResizeMode} />
            </ColorMatrix>
          </View>
        ) : (
          <ProgressiveImage
            uri={selectedAsset.uri}
            previewUri={selectedAsset.thumbnailUrl}
            style={styles.previewMediaFill}
            resizeMode={imageResizeMode}
          />
        )}
        {renderComposerTextOverlay(interactive)}
      </View>
    );
  };

  const renderLauncher = () => {
    const launcherCaptureDisabled = pickingMedia || (!launcherCameraReady && !launcherCameraError);

    return (
    <View style={styles.launcherShell}>
      <View style={styles.launcherPreviewWrap}>
        {launcherCameraStreamURL ? (
          <RTCView
            streamURL={launcherCameraStreamURL}
            style={styles.launcherPreviewVideo}
            objectFit="cover"
            mirror={launcherCameraFacingMode === "user"}
          />
        ) : (
          <View style={[styles.launcherPreviewFallback, { backgroundColor: elevatedSurfaceColor }]} />
        )}
        <View style={styles.launcherGridOverlay} pointerEvents="none">
          <View style={[styles.launcherGridColumn, { left: "33.33%" }]} />
          <View style={[styles.launcherGridColumn, { left: "66.66%" }]} />
          <View style={[styles.launcherGridRow, { top: "33.33%" }]} />
          <View style={[styles.launcherGridRow, { top: "66.66%" }]} />
        </View>
        <View style={styles.launcherPreviewTopBar}>
          <TouchableOpacity
            style={[styles.iconButton, styles.launcherPreviewIcon, { backgroundColor: "rgba(255,255,255,0.92)", borderColor: "rgba(15,23,42,0.08)" }]}
            onPress={switchLauncherCameraFacing}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Icon name="camera-reverse-outline" size={18} color="#0f172a" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconButton, styles.launcherPreviewIcon, { backgroundColor: "rgba(255,255,255,0.92)", borderColor: "rgba(15,23,42,0.08)" }]}
            onPress={exitComposer}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Icon name="close" size={18} color="#0f172a" />
          </TouchableOpacity>
        </View>
      </View>
      <View pointerEvents="none" style={styles.launcherShade} />
      <Animated.View
        style={[
          styles.launcherSheet,
          {
            backgroundColor: surfaceColor,
            borderColor,
            paddingBottom: Math.max(insets.bottom + 18, 28),
            marginBottom: CREATE_DOCK_OFFSET,
            opacity: stageAnimation,
            transform: [
              {
                translateY: stageAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [28, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.launcherHeader}>
          <View>
            <Text style={[styles.launcherEyebrow, { color: mutedColor }]}>Create</Text>
            <Text style={[styles.launcherTitle, { color: textColor }]}>{MODE_COPY[mode].title}</Text>
          </View>
          <Text style={[styles.launcherStatusText, { color: launcherCameraError ? "#B91C1C" : mutedColor }]}>
            {launcherCameraError ? "Preview unavailable" : launcherCameraReady ? "Live camera" : "Starting camera"}
          </Text>
        </View>

        <View style={styles.launcherModeRow}>
          {MODE_ORDER.map((item) => {
            const active = item === mode;
            return (
              <TouchableOpacity
                key={item}
                activeOpacity={0.9}
                onPress={() => setMode(item)}
                style={styles.launcherModeButton}
              >
                <Text style={[styles.launcherModeText, { color: active ? textColor : mutedColor }]}>
                  {MODE_COPY[item].label}
                </Text>
                <View style={[styles.launcherModeUnderline, { backgroundColor: active ? accentColor : "transparent" }]} />
              </TouchableOpacity>
            );
          })}
        </View>

        {mode === "story" ? (
          <View style={styles.storyLauncherChoiceRow}>
            <TouchableOpacity
              activeOpacity={0.92}
              style={[styles.storyLauncherChoiceCard, { backgroundColor: inputBackground, borderColor }]}
              onPress={startTextStoryDraft}
            >
              <Icon name="text-outline" size={18} color={accentColor} />
              <Text style={[styles.storyLauncherChoiceTitle, { color: textColor }]}>Text story</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.92}
              style={[styles.storyLauncherChoiceCard, { backgroundColor: inputBackground, borderColor }]}
              onPress={() => {
                resetStoryEditor("media");
                pickFromGallery().catch(() => undefined);
              }}
            >
              <Icon name="images-outline" size={18} color={accentColor} />
              <Text style={[styles.storyLauncherChoiceTitle, { color: textColor }]}>Media story</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.launcherFooterRow}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.launcherSideAction, { backgroundColor: inputBackground, borderColor }]}
            onPress={() => captureWithCamera().catch(() => undefined)}
            disabled={launcherCaptureDisabled}
          >
            <Icon name="camera-outline" size={20} color={textColor} />
            <Text style={[styles.launcherSideLabel, { color: textColor }]}>Shoot</Text>
          </TouchableOpacity>

          <View style={styles.launcherCenterCopy}>
            <Text style={[styles.launcherCenterTitle, { color: textColor }]}>Camera first</Text>
            <TouchableOpacity
              activeOpacity={0.92}
              style={[
                styles.launcherRecordButton,
                { borderColor: isDarkMode ? "rgba(255,255,255,0.22)" : "rgba(15,23,42,0.08)" },
              ]}
              onPress={() => {
                if (launcherLongPressTriggeredRef.current) {
                  launcherLongPressTriggeredRef.current = false;
                  return;
                }

                captureWithCamera("photo").catch(() => undefined);
              }}
              onLongPress={() => {
                launcherLongPressTriggeredRef.current = true;
                captureWithCamera("video").catch(() => undefined);
              }}
              delayLongPress={240}
              disabled={launcherCaptureDisabled}
            >
              <View style={styles.launcherRecordOuter}>
                <View style={[styles.launcherRecordInner, { backgroundColor: pickingMedia ? "#F87171" : "#EF4444" }]} />
              </View>
            </TouchableOpacity>
            <Text style={[styles.launcherCenterBody, { color: mutedColor }]}>
              {pickingMedia ? "Opening camera" : launcherCameraReady || launcherCameraError ? "Tap photo - hold video" : "Starting camera"}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.launcherSideAction, { backgroundColor: inputBackground, borderColor }]}
            onPress={pickFromGallery}
            disabled={pickingMedia}
          >
            {pickingMedia ? <ActivityIndicator size="small" color={accentColor} /> : <Icon name="images-outline" size={20} color={textColor} />}
            <Text style={[styles.launcherSideLabel, { color: textColor }]}>Pick</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
    );
  };

  const renderAspectSelector = () => (
    <View style={styles.chipRow}>
      {ASPECTS_BY_MODE[mode].map((option) => {
        const active = option.id === activeAspect.id;
        return (
          <TouchableOpacity
            key={option.id}
            style={[
              styles.choiceChip,
              {
                backgroundColor: active ? accentSoft : inputBackground,
                borderColor: active ? accentColor : borderColor,
              },
            ]}
            onPress={() =>
              setAspectId((current) => ({
                ...current,
                [mode]: option.id,
              }))
            }
          >
            <Text style={[styles.choiceChipLabel, { color: active ? textColor : mutedColor }]}>{option.label}</Text>
            <Text style={[styles.choiceChipDetail, { color: mutedColor }]}>{option.detail}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const selectFilter = useCallback((filterId: string) => {
    setSelectedFilterId((current) => (current === filterId ? current : filterId));
  }, []);

  const renderFilterSelector = () => {
    if (!selectedAsset || selectedAsset.mediaType !== "image") {
      return null;
    }

    return (
      <FlatList
        horizontal
        data={PHOTO_FILTER_LIST}
        keyExtractor={(filter) => filter.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        initialNumToRender={6}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews
        renderItem={({ item: filter }) => (
          <FilterPreview
            filterId={filter.id}
            imageUri={selectedAsset.thumbnailUrl || selectedAsset.uri}
            active={selectedFilterId === filter.id}
            onPress={() => selectFilter(filter.id)}
            accentColor={accentColor}
            backgroundColor={surfaceColor}
            textColor={textColor}
            mutedColor={mutedColor}
          />
        )}
      />
    );
  };

  const renderMentionChips = () => {
    const taggedPeople = selectedTagPeople.length ? selectedTagPeople.map((item) => item.username) : selectedMentions;

    if (!taggedPeople.length) {
      return <Text style={[styles.helperText, { color: mutedColor }]}>No tagged people yet.</Text>;
    }

    return (
      <View style={styles.tagWrap}>
        {taggedPeople.map((username) => (
          <View key={username} style={[styles.tagChip, { backgroundColor: accentSoft, borderColor: accentColor }]}>
            <Text style={[styles.tagChipText, { color: textColor }]}>@{username}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderComposerEditToolRail = () => {
    const railItems: Array<{
      id: Exclude<ComposerEditToolPanel, null>;
      label: string;
      icon: string;
      active?: boolean;
      onPress: () => void;
      hidden?: boolean;
    }> = [
      {
        id: "layout",
        label: "Layout",
        icon: "crop-outline",
        active: composerEditToolPanel === "layout",
        onPress: () => setComposerEditToolPanel("layout"),
      },
      {
        id: "text",
        label: "Text",
        icon: "text-outline",
        active: composerEditToolPanel === "text" || !!storyText.trim(),
        onPress: () => {
          setStoryActiveLayer("text");
          setComposerEditToolPanel("text");
        },
      },
      {
        id: "color",
        label: "Color",
        icon: "color-palette-outline",
        active: composerEditToolPanel === "color",
        onPress: () => setComposerEditToolPanel("color"),
      },
      {
        id: "font",
        label: "Font",
        icon: "create-outline",
        active: composerEditToolPanel === "font",
        onPress: () => setComposerEditToolPanel("font"),
      },
      {
        id: "size",
        label: "Size",
        icon: "resize-outline",
        active: composerEditToolPanel === "size",
        onPress: () => setComposerEditToolPanel("size"),
      },
      {
        id: "filters",
        label: "Filter",
        icon: "color-filter-outline",
        active: composerEditToolPanel === "filters",
        onPress: () => setComposerEditToolPanel("filters"),
        hidden: mode !== "post",
      },
      {
        id: "tag",
        label: "Tag",
        icon: "person-add-outline",
        active: composerEditToolPanel === "tag",
        onPress: () => setComposerEditToolPanel("tag"),
      },
      {
        id: "music",
        label: "Music",
        icon: "musical-notes-outline",
        active: composerEditToolPanel === "music" || !!selectedMusic,
        onPress: () => setComposerEditToolPanel("music"),
      },
      {
        id: "trim",
        label: "Trim",
        icon: "cut-outline",
        active: videoTrimSheetVisible,
        onPress: openVideoTrimmer,
        hidden: selectedAsset?.mediaType !== "video",
      },
    ];

    return (
      <View
        style={[
          styles.storyToolRail,
          {
            backgroundColor: toAlphaColor(isDarkMode ? "#020617" : "#ffffff", isDarkMode ? 0.86 : 0.92),
            borderColor,
            top: Math.max(insets.top + 92, 118),
          },
        ]}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.storyToolRailScroll}>
          {railItems.filter((item) => !item.hidden).map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.storyRailButton,
                item.active ? { backgroundColor: accentSoft, borderColor: accentColor } : { backgroundColor: inputBackground, borderColor },
              ]}
              onPress={item.onPress}
            >
              <Icon name={item.icon} size={17} color={accentColor} />
              <Text style={[styles.storyRailButtonText, { color: textColor }]} numberOfLines={2}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderComposerEditToolPanel = () => {
    if (composerEditToolPanel === "text") {
      return (
        <View style={[styles.storyToolPanelSheet, { backgroundColor: surfaceColor, borderColor }]}>
          <Text style={[styles.sectionEyebrow, { color: accentColor }]}>Overlay</Text>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Text</Text>
          <TextInput
            value={storyText}
            onChangeText={(nextValue) => {
              setStoryText(nextValue.replace(/\s{2,}/g, " ").slice(0, 48));
              setStoryActiveLayer("text");
            }}
            placeholder="Write overlay text"
            placeholderTextColor={mutedColor}
            multiline
            maxLength={48}
            style={[styles.storyTextInput, { color: textColor, backgroundColor: inputBackground, borderColor }]}
          />
          <View style={styles.storyAlignmentRow}>
            {STORY_TEXT_FONT_OPTIONS.slice(0, 3).map((option) => {
              const active = storyTextFont === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.storyAlignButton,
                    {
                      backgroundColor: active ? accentSoft : inputBackground,
                      borderColor: active ? accentColor : borderColor,
                    },
                  ]}
                  onPress={() => setStoryTextFont(option.id)}
                >
                  <Icon
                    name={option.id === "italic" ? "create-outline" : option.id === "bold" ? "text-outline" : "reader-outline"}
                    size={16}
                    color={accentColor}
                  />
                  <Text
                    style={[
                      styles.storyAlignButtonText,
                      {
                        color: textColor,
                        fontFamily: option.fontFamily,
                        fontStyle: option.fontStyle || "normal",
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      );
    }

    if (composerEditToolPanel === "color") {
      return (
        <View style={[styles.storyToolPanelSheet, { backgroundColor: surfaceColor, borderColor }]}>
          <Text style={[styles.sectionEyebrow, { color: accentColor }]}>Overlay</Text>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Color</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyChipRow}>
            {STORY_TEXT_THEMES.map((theme) => {
              const active = theme.id === storyTextTheme;
              return (
                <TouchableOpacity
                  key={theme.id}
                  style={[
                    styles.storyThemeChip,
                    {
                      backgroundColor: active ? accentSoft : inputBackground,
                      borderColor: active ? accentColor : borderColor,
                    },
                  ]}
                  onPress={() => setStoryTextTheme(theme.id)}
                >
                  <View style={[styles.storyThemeSwatch, { backgroundColor: theme.backgroundColor }]} />
                  <Text style={[styles.storyThemeChipText, { color: textColor }]}>{theme.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyChipRow}>
            {STORY_TEXT_COLOR_OPTIONS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.storyBackgroundChip,
                  {
                    backgroundColor: color,
                    borderColor: storyTextColor === color ? accentColor : "rgba(255,255,255,0.18)",
                  },
                ]}
                onPress={() => setStoryTextColor(color)}
              />
            ))}
          </ScrollView>
        </View>
      );
    }

    if (composerEditToolPanel === "font") {
      return (
        <View style={[styles.storyToolPanelSheet, { backgroundColor: surfaceColor, borderColor }]}>
          <Text style={[styles.sectionEyebrow, { color: accentColor }]}>Overlay</Text>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Font family</Text>
          <View style={styles.storyFontList}>
            {STORY_TEXT_FONT_OPTIONS.map((option) => {
              const active = storyTextFont === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.storyFontOption,
                    {
                      backgroundColor: active ? accentSoft : inputBackground,
                      borderColor: active ? accentColor : borderColor,
                    },
                  ]}
                  onPress={() => setStoryTextFont(option.id)}
                >
                  <Text
                    style={[
                      styles.storyFontOptionText,
                      {
                        color: textColor,
                        fontFamily: option.fontFamily,
                        fontStyle: option.fontStyle || "normal",
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      );
    }

    if (composerEditToolPanel === "size") {
      return (
        <View style={[styles.storyToolPanelSheet, { backgroundColor: surfaceColor, borderColor }]}>
          <Text style={[styles.sectionEyebrow, { color: accentColor }]}>Overlay</Text>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Text size</Text>
          {renderStoryAdjustment("Size", `${Math.round(storyTextScale * 100)}%`, storyTextScale, 0.8, 1.8, setStoryTextScale)}
        </View>
      );
    }

    if (composerEditToolPanel === "layout") {
      return (
        <View style={[styles.storyToolPanelSheet, { backgroundColor: surfaceColor, borderColor }]}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionEyebrow, { color: accentColor }]}>Layout</Text>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Aspect ratio</Text>
            </View>
            <Text style={[styles.sectionMeta, { color: mutedColor }]}>
              {mode === "post" ? "1:1, 16:9, 4:5, 9:16" : "9:16, 4:5"}
            </Text>
          </View>
          {renderAspectSelector()}
        </View>
      );
    }

    if (composerEditToolPanel === "filters") {
      return (
        <View style={[styles.storyToolPanelSheet, { backgroundColor: surfaceColor, borderColor }]}>
          <Text style={[styles.sectionEyebrow, { color: accentColor }]}>Look</Text>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Filters</Text>
          <View style={styles.composerSheetBlock}>
            {selectedAsset?.mediaType === "image" ? (
              renderFilterSelector()
            ) : (
              <Text style={[styles.helperText, { color: mutedColor }]}>Filters are available for photo posts.</Text>
            )}
          </View>
        </View>
      );
    }

    if (composerEditToolPanel === "tag") {
      return (
        <View style={[styles.storyToolPanelSheet, { backgroundColor: surfaceColor, borderColor }]}>
          <TouchableOpacity
            style={[styles.toolAction, styles.toolActionFullWidth, { backgroundColor: inputBackground, borderColor }]}
            onPress={() => setTagSheetVisible(true)}
          >
            <Icon name="person-add-outline" size={18} color={accentColor} />
            <View style={styles.toolActionBody}>
              <Text style={[styles.toolActionTitle, { color: textColor }]}>Tag people</Text>
              <Text style={[styles.toolActionMeta, { color: mutedColor }]}>
                {selectedTagPeople.length || selectedMentions.length ? `${selectedTagPeople.length || selectedMentions.length} selected` : "Tap to choose"}
              </Text>
            </View>
          </TouchableOpacity>
          <View style={styles.inlineBlock}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Tagged</Text>
            {renderMentionChips()}
          </View>
        </View>
      );
    }

    if (composerEditToolPanel === "music") {
      return (
        <View style={[styles.storyToolPanelSheet, { backgroundColor: surfaceColor, borderColor }]}>
          <TouchableOpacity
            style={[styles.toolAction, styles.toolActionFullWidth, { backgroundColor: inputBackground, borderColor }]}
            onPress={() => setMusicSheetVisible(true)}
          >
            <Icon name="musical-notes-outline" size={18} color={accentColor} />
            <View style={styles.toolActionBody}>
              <Text style={[styles.toolActionTitle, { color: textColor }]}>Add music</Text>
              <Text style={[styles.toolActionMeta, { color: mutedColor }]}>{selectedMusic ? buildMusicLabel(selectedMusic) : "Choose a track"}</Text>
            </View>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  const renderComposerEditToolSheet = () => {
    if (!composerEditToolPanel) {
      return null;
    }

    const sheetTitle =
      composerEditToolPanel === "layout"
        ? "Layout"
        : composerEditToolPanel === "filters"
          ? "Filters"
          : composerEditToolPanel === "tag"
            ? "Tag people"
            : composerEditToolPanel === "text"
              ? "Text"
              : composerEditToolPanel === "color"
                ? "Color"
                : composerEditToolPanel === "font"
                  ? "Font"
                  : composerEditToolPanel === "size"
                    ? "Size"
                    : "Music";
    const snapPoints = composerEditToolPanel === "filters" || composerEditToolPanel === "color" ? [0.42, 0.62] : [0.34, 0.52];

    return (
      <DraggableBottomSheet
        visible
        onClose={() => setComposerEditToolPanel(null)}
        snapPoints={snapPoints}
        initialSnapIndex={1}
      >
        <View style={styles.sheetContent}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={[styles.sheetEyebrow, { color: accentColor }]}>{MODE_COPY[mode].label}</Text>
              <Text style={[styles.sheetTitle, { color: textColor }]}>{sheetTitle}</Text>
            </View>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: inputBackground, borderColor }]}
              onPress={() => setComposerEditToolPanel(null)}
            >
              <Icon name="close" size={18} color={textColor} />
            </TouchableOpacity>
          </View>
          {renderComposerEditToolPanel()}
        </View>
      </DraggableBottomSheet>
    );
  };

  const renderEditStage = () => {
    if (mode === "story") {
      return renderStoryEditStage();
    }

    return (
      <Animated.View
        style={[
          styles.storyStageWrap,
          {
            opacity: stageAnimation,
            transform: [
              {
                translateY: stageAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.storyEditContent}>
          <View style={styles.storyCanvasShell}>
            <View style={styles.composerEditPreviewWrap}>
              {renderPreviewMedia({ interactive: true })}
            </View>
          </View>
          <View style={[styles.storyStageTopBar, { paddingTop: Math.max(insets.top + 4, 10) }]}>
            {renderStageHeader(`Edit ${MODE_COPY[mode].label}`, "", () => {
              if (!canContinueFromEdit) {
                Alert.alert("Add media first", MODE_COPY[mode].emptyLabel);
                return;
              }
              startTransition(() => setStage("details"));
            })}
          </View>
          {renderComposerEditToolRail()}
        </View>
        {renderComposerEditToolSheet()}
      </Animated.View>
    );
  };

  const renderLocationSuggestions = () => {
    if (!locationLoading && !locationSuggestions.length) {
      return null;
    }

    return (
      <View style={[styles.suggestionsWrap, { backgroundColor: elevatedSurfaceColor, borderColor }]}>
        {locationLoading ? (
          <View style={styles.suggestionLoading}>
            <ActivityIndicator size="small" color={accentColor} />
            <Text style={[styles.suggestionMeta, { color: mutedColor }]}>Looking up places...</Text>
          </View>
        ) : null}

        {!locationLoading
          ? locationSuggestions.map((suggestion) => (
            <TouchableOpacity
              key={`${suggestion.name}-${suggestion.count}`}
              style={styles.suggestionButton}
              onPress={() => {
                setLocation(suggestion.name);
                setLocationSuggestions([]);
              }}
            >
              <View style={styles.suggestionBody}>
                <Text style={[styles.suggestionName, { color: textColor }]} numberOfLines={1}>
                  {suggestion.name}
                </Text>
                <Text style={[styles.suggestionMeta, { color: mutedColor }]}>
                  {suggestion.count > 0 ? `${suggestion.count} posts` : "Suggested location"}
                </Text>
              </View>
              <Icon name="location-outline" size={16} color={accentColor} />
            </TouchableOpacity>
          ))
          : null}
      </View>
    );
  };

  const renderDetailsStage = () => {
    if (mode === "story") {
      return (
        <Animated.View
          style={[
            styles.stageWrap,
            {
              opacity: stageAnimation,
              transform: [
                {
                  translateY: stageAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [16, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {renderStageHeader("Share story", "", publish, { loading: publishing })}

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + CREATE_DOCK_OFFSET + 16, 104) }}>
            <View style={[styles.summaryCard, styles.summaryCardStory, { backgroundColor: surfaceColor, borderColor }]}>
              <View style={styles.summaryPreviewStory}>{renderPreviewMedia()}</View>
              <View style={styles.summaryCopyStory}>
                <Text style={[styles.summaryTitle, { color: textColor }]}>Story ready</Text>
                <Text style={[styles.summaryMeta, { color: mutedColor }]}>
                  {storyCreationMode === "text"
                    ? "Text story"
                    : selectedAsset?.mediaType === "video"
                      ? "Video story"
                      : "Image story"}
                  {selectedMusic ? ` • ${selectedMusic.title}` : ""}
                </Text>
              </View>
            </View>

            <View style={[styles.sectionCard, { backgroundColor: surfaceColor, borderColor }]}>
              <Text style={[styles.sectionEyebrow, { color: accentColor }]}>Tag</Text>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Tag people</Text>
              <TouchableOpacity
                style={[styles.toolAction, styles.toolActionFullWidth, { backgroundColor: inputBackground, borderColor }]}
                onPress={() => setTagSheetVisible(true)}
              >
                <Icon name="at-outline" size={18} color={accentColor} />
                <View style={styles.toolActionBody}>
                  <Text style={[styles.toolActionTitle, { color: textColor }]}>Tagged people</Text>
                  <Text style={[styles.toolActionMeta, { color: mutedColor }]}>
                    {selectedTagPeople.length || selectedMentions.length ? `${selectedTagPeople.length || selectedMentions.length} selected` : "Tap to choose"}
                  </Text>
                </View>
              </TouchableOpacity>
              <View style={styles.storyDetailsTags}>{renderMentionChips()}</View>
            </View>

            <View style={[styles.sectionCard, { backgroundColor: surfaceColor, borderColor }]}>
              <Text style={[styles.sectionEyebrow, { color: accentColor }]}>Replies</Text>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Comments and replies</Text>
              <View style={styles.switchRow}>
                <View style={styles.switchCopy}>
                  <Text style={[styles.switchTitle, { color: textColor }]}>Allow comments</Text>
                  <Text style={[styles.switchMeta, { color: mutedColor }]}>Let people reply to this story.</Text>
                </View>
                <Switch value={storyAllowReplies} onValueChange={setStoryAllowReplies} trackColor={{ false: hairlineColor, true: accentSoft }} thumbColor={storyAllowReplies ? accentColor : "#fff"} />
              </View>
            </View>

            {publishError ? (
              <View style={[styles.errorCard, { backgroundColor: isDarkMode ? "rgba(127,29,29,0.32)" : "#FFF1F2", borderColor: isDarkMode ? "rgba(248,113,113,0.24)" : "#FECACA" }]}>
                <Text style={[styles.errorTitle, { color: isDarkMode ? "#FECACA" : "#991B1B" }]}>Publish issue</Text>
                <Text style={[styles.errorBody, { color: isDarkMode ? "#FCA5A5" : "#B91C1C" }]}>{publishError}</Text>
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>
      );
    }

    return (
    <Animated.View
      style={[
        styles.stageWrap,
        {
          opacity: stageAnimation,
          transform: [
            {
              translateY: stageAnimation.interpolate({
                inputRange: [0, 1],
                outputRange: [16, 0],
              }),
            },
          ],
        },
      ]}
    >
          {renderStageHeader("Final details", "", publish, { loading: publishing })}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + CREATE_DOCK_OFFSET + 16, 104) }}>
          <View style={[styles.summaryCard, { backgroundColor: surfaceColor, borderColor }]}>
            <View style={styles.summaryPreview}>{renderPreviewMedia()}</View>
            <View style={styles.summaryCopy}>
              <Text style={[styles.summaryTitle, { color: textColor }]}>{MODE_COPY[mode].label}</Text>
              <Text style={[styles.summaryMeta, { color: mutedColor }]}>
                {selectedAsset?.mediaType === "video" ? "Video ready" : "Image ready"} • {activeAspect.label}
              </Text>
            </View>
          </View>

          <View style={[styles.sectionCard, { backgroundColor: surfaceColor, borderColor }]}>
            <Text style={[styles.sectionEyebrow, { color: accentColor }]}>Caption</Text>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Caption</Text>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Write a caption"
              placeholderTextColor={mutedColor}
              multiline
              maxLength={limits.caption}
              style={[
                styles.captionInput,
                {
                  color: textColor,
                  backgroundColor: inputBackground,
                  borderColor,
                },
              ]}
            />
            <MentionSuggestionList
              visible={captionMentionQuery !== null}
              candidates={captionMentionSuggestions}
              onSelect={(candidate) => {
                setCaption((current) => insertMentionAtCursorEnd(current, candidate.username, limits.caption));
                setCaptionMentionSuggestions([]);
                setSelectedMentions((current) => Array.from(new Set([...current, candidate.username])));
              }}
            />
            <View style={styles.captionFooter}>
              <Text style={[styles.helperText, { color: mutedColor }]}>Tags and hashtags stay in sync.</Text>
              <Text style={[styles.helperText, { color: mutedColor }]}>{caption.length}/{limits.caption}</Text>
            </View>
          </View>

          <View style={[styles.sectionCard, { backgroundColor: surfaceColor, borderColor }]}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.sectionEyebrow, { color: accentColor }]}>Location</Text>
                <Text style={[styles.sectionTitle, { color: textColor }]}>Add a place</Text>
              </View>
              <TouchableOpacity
                style={[styles.secondaryPill, { backgroundColor: inputBackground, borderColor }]}
                onPress={applyCurrentLocation}
                disabled={locationFetchingCurrent}
              >
                {locationFetchingCurrent ? <ActivityIndicator size="small" color={accentColor} /> : <Icon name="locate-outline" size={16} color={accentColor} />}
                <Text style={[styles.secondaryPillText, { color: textColor }]}>Current</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              value={location}
              onChangeText={(value) => {
                setLocation(value);
                runLocationSearch(value).catch(() => undefined);
              }}
              placeholder="Search a location"
              placeholderTextColor={mutedColor}
              maxLength={limits.location}
              style={[
                styles.singleLineInput,
                {
                  color: textColor,
                  backgroundColor: inputBackground,
                  borderColor,
                },
              ]}
            />
            <View style={styles.seedWrap}>
              {LOCATION_SEEDS.map((seed) => (
                <TouchableOpacity
                  key={seed}
                  style={[styles.seedChip, { backgroundColor: inputBackground, borderColor }]}
                  onPress={() => {
                    setLocation(seed);
                    runLocationSearch(seed).catch(() => undefined);
                  }}
                >
                  <Text style={[styles.seedChipText, { color: textColor }]}>{seed}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {renderLocationSuggestions()}
          </View>

          <View style={[styles.sectionCard, { backgroundColor: surfaceColor, borderColor }]}>
            <View style={styles.toolActionRow}>
              <TouchableOpacity
                style={[styles.toolAction, { backgroundColor: inputBackground, borderColor }]}
                onPress={() => setTagSheetVisible(true)}
              >
                <Icon name="at-outline" size={18} color={accentColor} />
                <View style={styles.toolActionBody}>
                  <Text style={[styles.toolActionTitle, { color: textColor }]}>Tagged people</Text>
                  <Text style={[styles.toolActionMeta, { color: mutedColor }]}>
                    {selectedTagPeople.length || selectedMentions.length ? `${selectedTagPeople.length || selectedMentions.length} selected` : "Tap to choose"}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toolAction, { backgroundColor: inputBackground, borderColor }]}
                onPress={() => setMusicSheetVisible(true)}
              >
                <Icon name="musical-notes-outline" size={18} color={accentColor} />
                <View style={styles.toolActionBody}>
                  <Text style={[styles.toolActionTitle, { color: textColor }]}>Music</Text>
                  <Text style={[styles.toolActionMeta, { color: mutedColor }]}>{selectedMusic ? buildMusicLabel(selectedMusic) : "Add music"}</Text>
                </View>
              </TouchableOpacity>
            </View>
            {renderMentionChips()}
          </View>

          {mode === "post" ? (
            <View style={[styles.sectionCard, { backgroundColor: surfaceColor, borderColor }]}>
              <Text style={[styles.sectionEyebrow, { color: accentColor }]}>Settings</Text>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Post controls</Text>
              <View style={styles.switchRow}>
                <View style={styles.switchCopy}>
                  <Text style={[styles.switchTitle, { color: textColor }]}>Disable comments</Text>
                  <Text style={[styles.switchMeta, { color: mutedColor }]}>Keep replies off for this post.</Text>
                </View>
                <Switch value={disableComments} onValueChange={setDisableComments} trackColor={{ false: hairlineColor, true: accentSoft }} thumbColor={disableComments ? accentColor : "#fff"} />
              </View>
              <View style={[styles.switchRow, styles.switchRowBorder, { borderTopColor: hairlineColor }]}>
                <View style={styles.switchCopy}>
                  <Text style={[styles.switchTitle, { color: textColor }]}>Hide like count</Text>
                  <Text style={[styles.switchMeta, { color: mutedColor }]}>Only you will see the total likes.</Text>
                </View>
                <Switch value={hideLikeCount} onValueChange={setHideLikeCount} trackColor={{ false: hairlineColor, true: accentSoft }} thumbColor={hideLikeCount ? accentColor : "#fff"} />
              </View>
            </View>
          ) : null}

          {publishError ? (
            <View style={[styles.errorCard, { backgroundColor: isDarkMode ? "rgba(127,29,29,0.32)" : "#FFF1F2", borderColor: isDarkMode ? "rgba(248,113,113,0.24)" : "#FECACA" }]}>
              <Text style={[styles.errorTitle, { color: isDarkMode ? "#FECACA" : "#991B1B" }]}>Publish issue</Text>
              <Text style={[styles.errorBody, { color: isDarkMode ? "#FCA5A5" : "#B91C1C" }]}>{publishError}</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
    );
  };

  const renderTagSheet = () => (
    <DraggableBottomSheet
      visible={tagSheetVisible}
      onClose={() => setTagSheetVisible(false)}
      snapPoints={[0.52, 0.78]}
      initialSnapIndex={1}
    >
      <View style={styles.sheetContent}>
        <View style={styles.sheetHeader}>
          <View>
            <Text style={[styles.sheetEyebrow, { color: accentColor }]}>Tag people</Text>
            <Text style={[styles.sheetTitle, { color: textColor }]}>Mention people</Text>
          </View>
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: inputBackground, borderColor }]}
            onPress={() => setTagSheetVisible(false)}
          >
            <Icon name="close" size={18} color={textColor} />
          </TouchableOpacity>
        </View>

        <TextInput
          value={tagQuery}
          onChangeText={setTagQuery}
          placeholder="Search username"
          placeholderTextColor={mutedColor}
          style={[
            styles.singleLineInput,
            {
              color: textColor,
              backgroundColor: inputBackground,
              borderColor,
            },
          ]}
        />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetList}>
          {taggableFriendsLoading ? <ActivityIndicator size="small" color={accentColor} /> : null}
          {!taggableFriendsLoading && !filteredFriends.length ? (
            <Text style={[styles.helperText, { color: mutedColor }]}>No users found.</Text>
          ) : null}
          {filteredFriends.map((friend) => {
            const active = selectedTagPeople.some((item) => item.id === friend.id || item.username === friend.username);
            return (
              <TouchableOpacity
                key={friend.id}
                style={[styles.friendRow, { backgroundColor: inputBackground, borderColor }]}
                onPress={() => toggleMention(friend)}
              >
                <View style={styles.friendCopy}>
                  <Text style={[styles.friendName, { color: textColor }]}>{friend.name}</Text>
                  <Text style={[styles.friendUsername, { color: mutedColor }]}>@{friend.username}</Text>
                </View>
                <Icon name={active ? "checkmark-circle" : "add-circle-outline"} size={22} color={active ? accentColor : mutedColor} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </DraggableBottomSheet>
  );

  const renderMusicSheet = () => (
    <DraggableBottomSheet
      visible={musicSheetVisible}
      onClose={closeMusicSheet}
      snapPoints={[0.54, 0.84]}
      initialSnapIndex={1}
    >
      <View style={styles.sheetContent}>
        <View style={styles.sheetHeader}>
          <View>
            <Text style={[styles.sheetEyebrow, { color: accentColor }]}>Music</Text>
            <Text style={[styles.sheetTitle, { color: textColor }]}>Select music</Text>
          </View>
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: inputBackground, borderColor }]}
            onPress={closeMusicSheet}
          >
            <Icon name="close" size={18} color={textColor} />
          </TouchableOpacity>
        </View>

        <View style={styles.musicSearchRow}>
          <TextInput
            value={musicQuery}
            onChangeText={setMusicQuery}
            placeholder="Search track or artist"
            placeholderTextColor={mutedColor}
            maxLength={limits.music}
            onSubmitEditing={() => runMusicSearch().catch(() => undefined)}
            style={[
              styles.musicSearchInput,
              {
                color: textColor,
                backgroundColor: inputBackground,
                borderColor,
              },
            ]}
          />
          <TouchableOpacity style={[styles.searchButton, { backgroundColor: accentColor }]} onPress={() => runMusicSearch().catch(() => undefined)} disabled={musicLoading}>
            {musicLoading ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="search-outline" size={16} color="#fff" />}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.uploadMusicButton, { backgroundColor: inputBackground, borderColor }]}
          onPress={() => uploadCustomMusic().catch(() => undefined)}
          disabled={musicUploading}
        >
          {musicUploading ? (
            <ActivityIndicator size="small" color={textColor} />
          ) : (
            <Icon name="cloud-upload-outline" size={15} color={textColor} />
          )}
          <Text style={[styles.uploadMusicButtonText, { color: textColor }]}>Upload your audio</Text>
        </TouchableOpacity>

        {selectedMusic ? (
          <View style={[styles.currentMusicCard, { backgroundColor: surfaceColor, borderColor }]}>
            <View style={styles.currentMusicHeader}>
              {selectedMusic.artworkUrl ? (
                <Image source={{ uri: selectedMusic.artworkUrl }} style={styles.currentMusicArtwork} />
              ) : (
                <View style={[styles.currentMusicArtwork, styles.currentMusicArtworkFallback, { backgroundColor: inputBackground, borderColor }]}>
                  <Icon name="musical-notes-outline" size={18} color={mutedColor} />
                </View>
              )}
                <View style={styles.currentMusicCopy}>
                  <Text style={[styles.currentMusicTitle, { color: textColor }]}>{buildMusicLabel(selectedMusic)}</Text>
                  <Text style={[styles.currentMusicMeta, { color: mutedColor }]}>
                    {formatDuration(selectedMusic.clipStartTime || 0)} - {formatDuration(selectedMusic.clipEndTime || ((selectedMusic.clipStartTime || 0) + (selectedMusic.clipDuration || selectedMusic.duration)))} / {formatDuration(selectedMusic.clipDuration || selectedMusic.duration)} selected
                  </Text>
                </View>
              </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.musicActionRow}>
              <TouchableOpacity
                style={[styles.musicActionIconButton, { backgroundColor: inputBackground, borderColor }]}
                onPress={() => toggleSelectedMusicPreview().catch(() => undefined)}
                disabled={selectedMusicPreviewLoading}
              >
                {selectedMusicPreviewLoading ? (
                  <ActivityIndicator size="small" color={textColor} />
                ) : (
                  <Icon name={selectedMusicPreviewPlaying ? "pause-outline" : "play-outline"} size={18} color={textColor} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.musicActionIconButton, { backgroundColor: inputBackground, borderColor }]}
                onPress={() => openMusicTrimmer(selectedMusic).catch(() => undefined)}
                disabled={musicImportingId === selectedMusic.id}
              >
                {musicImportingId === selectedMusic.id ? (
                  <ActivityIndicator size="small" color={textColor} />
                ) : (
                  <Icon name="cut-outline" size={18} color={textColor} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.musicActionIconButton, styles.musicActionIconButtonDanger, { backgroundColor: inputBackground, borderColor }]}
                onPress={() => setSelectedMusic(null)}
              >
                <Icon name="trash-outline" size={18} color={textColor} />
              </TouchableOpacity>
            </ScrollView>
          </View>
        ) : null}

        <FlatList
          data={musicResults}
          keyExtractor={(item) => item.id}
          style={styles.musicResultsList}
          contentContainerStyle={styles.sheetList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onEndReached={loadMoreMusicResults}
          onEndReachedThreshold={0.55}
          ListEmptyComponent={!musicLoading ? <View style={styles.musicResultSpacer} /> : null}
          ListFooterComponent={musicLoadingMore ? (
            <View style={styles.musicLoadingMoreFooter}>
              <ActivityIndicator size="small" color={accentColor} />
            </View>
          ) : null}
          renderItem={({ item }) => {
            const isSelected = selectedMusic?.externalId === item.externalId || selectedMusic?.title === item.title;
            const isImporting = musicImportingId === item.id;
            const hasPreview = !!normalizeMediaUrl(getMusicClipPlaybackUrl(item));
            const isPlayingPreview = activeMusicPreviewId === item.id && listMusicPreviewPlaying;

            return (
              <View
                key={item.id}
                style={[
                  styles.musicResultRow,
                  {
                    backgroundColor: isSelected ? accentSoft : inputBackground,
                    borderColor: isSelected ? accentColor : borderColor,
                  },
                ]}
              >
                {item.artworkUrl ? (
                  <Image source={{ uri: item.artworkUrl }} style={styles.musicResultArtwork} />
                ) : (
                  <View style={[styles.musicResultArtwork, styles.currentMusicArtworkFallback, { backgroundColor: surfaceColor, borderColor }]}>
                    <Icon name="musical-notes-outline" size={18} color={mutedColor} />
                  </View>
                )}
                <View style={styles.musicResultCopy}>
                  <Text style={[styles.musicResultTitle, { color: textColor }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={[styles.musicResultMeta, { color: mutedColor }]} numberOfLines={1}>
                    {item.artist || item.source || "Track"} / {formatDuration(item.duration)}
                  </Text>
                </View>
                <View style={styles.musicResultActions}>
                  <TouchableOpacity
                    style={[styles.resultPlayButton, { backgroundColor: surfaceColor, borderColor }]}
                    onPress={() => toggleListPreviewForItem(item).catch(() => undefined)}
                    disabled={isImporting || !hasPreview}
                  >
                    <Icon
                      name={isPlayingPreview ? "pause-outline" : "play-outline"}
                      size={16}
                      color={hasPreview ? textColor : mutedColor}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.selectButton, { backgroundColor: accentColor }]}
                    onPress={() => quickSelectMusic(item).catch(() => undefined)}
                    disabled={isImporting}
                  >
                    {isImporting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Icon name={isSelected ? "checkmark" : "add"} size={20} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      </View>
    </DraggableBottomSheet>
  );

  const renderMusicTrimSheet = () => {
    const track = pendingMusicSelection;
    const activeClipDuration = track ? musicTrimDuration || track.clipDuration || track.duration : 0;
    const clipEndTime = track ? Math.min(track.duration, musicTrimStartTime + activeClipDuration) : 0;
    const previewSelectionProgress = activeClipDuration
      ? clamp(
          (Math.max(0, musicPreviewPositionMs) - musicTrimStartTime * 1000) / Math.max(1000, activeClipDuration * 1000),
          0,
          1,
        )
      : 0;

    return (
      <DraggableBottomSheet
        visible={musicTrimSheetVisible}
        onClose={closeMusicTrimSheet}
        snapPoints={[0.48, 0.72]}
        initialSnapIndex={1}
      >
        <View style={styles.sheetContent}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={[styles.sheetEyebrow, { color: accentColor }]}>Music</Text>
              <Text style={[styles.sheetTitle, { color: textColor }]}>Trim track</Text>
            </View>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: inputBackground, borderColor }]}
              onPress={closeMusicTrimSheet}
            >
              <Icon name="close" size={18} color={textColor} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.sheetBodyScroll}
            contentContainerStyle={styles.sheetBodyContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {track ? (
              <View style={[styles.currentMusicCard, { backgroundColor: surfaceColor, borderColor }]}>
                <View style={styles.currentMusicHeader}>
                  <View style={styles.currentMusicCopy}>
                    <Text style={[styles.currentMusicTitle, { color: textColor }]} numberOfLines={1}>
                      {track.title}
                    </Text>
                    <Text style={[styles.currentMusicMeta, { color: mutedColor }]} numberOfLines={1}>
                      {track.artist || track.source || "Track"} / {formatDuration(track.duration)}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.trimHeroCard, { backgroundColor: inputBackground, borderColor }]}
                  onPress={() => toggleMusicPreview().catch(() => undefined)}
                  disabled={musicPreviewLoading || !canPreviewMusic}
                >
                  {track.artworkUrl ? (
                    <Image source={{ uri: track.artworkUrl }} style={styles.trimHeroArtwork} />
                  ) : (
                    <View style={[styles.trimHeroArtwork, styles.trimHeroArtworkFallback, { backgroundColor: inputBackground }]}>
                      <Icon name="musical-notes-outline" size={24} color="#fff" />
                    </View>
                  )}
                  <View style={styles.trimHeroShade} />
                  <View style={styles.trimHeroTopRow}>
                    <View style={[styles.trimHeroSourcePill, { backgroundColor: "rgba(15, 23, 42, 0.7)" }]}>
                      <Text style={styles.trimHeroSourceText}>
                        {String(track.source || "music").trim().toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.trimHeroCenter}>
                    <View style={[styles.trimHeroPlayButton, { backgroundColor: "rgba(255,255,255,0.9)" }]}>
                      {musicPreviewLoading ? (
                        <ActivityIndicator size="small" color={accentColor} />
                      ) : (
                        <Icon name={musicPreviewPlaying ? "pause" : "play"} size={24} color={accentColor} />
                      )}
                    </View>
                  </View>
                  <View style={styles.trimHeroBottom}>
                    <Text style={styles.trimHeroTitle} numberOfLines={1}>
                      Trimmed preview
                    </Text>
                    <Text style={styles.trimHeroMeta} numberOfLines={1}>
                      {formatDuration(Math.floor(musicPreviewPositionMs / 1000))} • {formatDuration(musicTrimStartTime)} - {formatDuration(clipEndTime)} / {formatDuration(activeClipDuration)}
                    </Text>
                  </View>
                </TouchableOpacity>

                <View style={[styles.trimPreviewProgressTrack, { backgroundColor: hairlineColor }]}>
                  <View
                    style={[
                      styles.trimPreviewProgressFill,
                      {
                        backgroundColor: accentColor,
                        width: `${previewSelectionProgress * 100}%`,
                      },
                    ]}
                  />
                </View>

                {musicPreviewMode === "audio" && !canPreviewMusic ? (
                  <View style={[styles.youtubePreviewCard, styles.youtubePreviewFallbackCard, { backgroundColor: inputBackground, borderColor }]}>
                    <Icon name="alert-circle-outline" size={28} color={accentColor} />
                  <Text style={[styles.youtubePreviewFallbackTitle, { color: textColor }]}>Preview not available</Text>
                  <Text style={[styles.youtubePreviewFallbackText, { color: mutedColor }]}>
                    This track does not have a playable audio preview. Choose another result or upload your own audio.
                  </Text>
                </View>
                ) : null}

                {musicError ? <Text style={[styles.sheetError, { color: isDarkMode ? "#FCA5A5" : "#B91C1C" }]}>{musicError}</Text> : null}

                <RangeSlider
                  duration={track.duration}
                  startTime={musicTrimStartTime}
                  clipDuration={activeClipDuration}
                  onChange={updateMusicTrimWindow}
                  accentColor={accentColor}
                  mutedColor={hairlineColor}
                  showWaveform
                />

                <View style={styles.trimNudgePanel}>
                  <View>
                    <Text style={[styles.trimNudgeLabel, { color: mutedColor }]}>Start time</Text>
                    <Text style={[styles.trimNudgeValue, { color: textColor }]}>{formatDuration(musicTrimStartTime)}</Text>
                  </View>
                  <View style={styles.trimNudgeButtonRow}>
                    {[-5, -1, 1, 5].map((delta) => (
                      <TouchableOpacity
                        key={`music-start-nudge-${delta}`}
                        style={[styles.trimNudgeButton, { backgroundColor: inputBackground, borderColor }]}
                        onPress={() => nudgeMusicTrimStart(delta)}
                        disabled={musicImportingId === track.id}
                      >
                        <Text style={[styles.trimNudgeButtonText, { color: textColor }]}>
                          {delta > 0 ? `+${delta}s` : `${delta}s`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.trimActionDock}>
                  <ScrollView
                    horizontal
                    nestedScrollEnabled
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.trimActionRow}
                  >
                    <TouchableOpacity
                      style={[styles.musicActionIconButton, { backgroundColor: inputBackground, borderColor }]}
                      onPress={() => seekMusicPreviewBy(-5).catch(() => undefined)}
                      disabled={!canPreviewMusic}
                    >
                      <Icon name="play-skip-back-outline" size={18} color={textColor} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.musicActionIconButton, { backgroundColor: inputBackground, borderColor }]}
                      onPress={() => seekMusicPreviewBy(5).catch(() => undefined)}
                      disabled={!canPreviewMusic}
                    >
                      <Icon name="play-skip-forward-outline" size={18} color={textColor} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.musicActionIconButton, { backgroundColor: inputBackground, borderColor }]}
                      onPress={() => {
                        closeMusicTrimSheet();
                        setMusicSheetVisible(true);
                      }}
                    >
                      <Icon name="swap-horizontal-outline" size={18} color={textColor} />
                    </TouchableOpacity>
                  </ScrollView>

                  <TouchableOpacity
                    style={[styles.primaryButton, styles.trimAddButton, { backgroundColor: accentColor }]}
                    onPress={() => confirmMusicTrim().catch(() => undefined)}
                    disabled={musicImportingId === track.id}
                  >
                    {musicImportingId === track.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <View style={styles.trimAddButtonContent}>
                        <Icon name="checkmark" size={18} color="#fff" />
                        <Text style={styles.primaryButtonText}>Add music</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

          </ScrollView>
        </View>
      </DraggableBottomSheet>
    );
  };

  const renderVideoTrimSheet = () => {
    if (selectedAsset?.mediaType !== "video") {
      return null;
    }

    const activeClipDuration = videoTrimDuration || Math.min(selectedVideoDuration, videoDurationLimit);
    const clipEndTime = Math.min(selectedVideoDuration, videoTrimStartTime + activeClipDuration);

    return (
      <DraggableBottomSheet
        visible={videoTrimSheetVisible}
        onClose={closeVideoTrimSheet}
        snapPoints={[0.48, 0.82]}
        initialSnapIndex={1}
      >
        <View style={styles.sheetContent}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={[styles.sheetEyebrow, { color: accentColor }]}>Video</Text>
              <Text style={[styles.sheetTitle, { color: textColor }]}>Trim video</Text>
            </View>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: inputBackground, borderColor }]}
              onPress={closeVideoTrimSheet}
            >
              <Icon name="close" size={18} color={textColor} />
            </TouchableOpacity>
          </View>

          <View style={[styles.videoTrimCard, { backgroundColor: surfaceColor, borderColor }]}>
            <View style={styles.videoTrimPreviewWrap}>
              <Video
                key={`${selectedAsset.id}:${selectedAsset.uri}`}
                ref={videoTrimVideoRef}
                source={{ uri: selectedAsset.uri }}
                style={styles.videoTrimPreview}
                paused={!videoTrimPreviewPlaying}
                repeat={false}
                resizeMode="cover"
                onLoad={() => {
                  setVideoTrimPreviewLoaded(true);
                  setVideoTrimPreviewLoading(false);
                  videoTrimVideoRef.current?.seek?.(videoTrimStartTime);
                }}
                onProgress={(event) => {
                  const currentTime = Math.max(0, Number(event?.currentTime || 0));
                  const currentPositionMs = currentTime * 1000;
                  const clipEndMs = clipEndTime * 1000;

                  setVideoTrimPreviewPositionMs(currentPositionMs);

                  if (clipEndMs > 0 && currentPositionMs >= clipEndMs) {
                    setVideoTrimPreviewPlaying(false);
                    videoTrimVideoRef.current?.seek?.(videoTrimStartTime);
                    setVideoTrimPreviewPositionMs(videoTrimStartTime * 1000);
                  }
                }}
                onError={(error) => {
                  console.log("video trim player error:", error);
                  setVideoTrimPreviewLoading(false);
                  setVideoTrimPreviewPlaying(false);
                  setVideoTrimError("Video preview unavailable right now.");
                }}
              />
              <View pointerEvents="none" style={styles.videoTrimShade} />
              <View pointerEvents="none" style={styles.videoTrimBadge}>
                <Icon name="cut-outline" size={14} color="#fff" />
                <Text style={styles.videoTrimBadgeText}>Preview clip</Text>
              </View>
            </View>

            <View style={styles.videoTrimMetaRow}>
              <View style={styles.videoTrimMetaCopy}>
                <Text style={[styles.videoTrimTitle, { color: textColor }]}>Selection</Text>
                <Text style={[styles.videoTrimMeta, { color: mutedColor }]}>
                  {formatDuration(videoTrimStartTime)} - {formatDuration(clipEndTime)} • {formatDuration(activeClipDuration)}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.trimPreviewButton, { backgroundColor: accentColor }]}
                onPress={() => toggleVideoTrimPreview().catch(() => undefined)}
                disabled={videoTrimPreviewLoading}
              >
                {videoTrimPreviewLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Icon name={videoTrimPreviewPlaying ? "pause" : "play"} size={18} color="#fff" />
                )}
              </TouchableOpacity>
            </View>

            <Text style={[styles.videoTrimTime, { color: mutedColor }]}>
              {formatDuration(Math.floor(videoTrimPreviewPositionMs / 1000))} / {formatDuration(selectedVideoDuration)}
            </Text>
            <Text style={[styles.helperText, { color: mutedColor }]}>
              Drag the handles to keep the strongest part of the clip. The trimmed file replaces the original one for publishing.
            </Text>

            <RangeSlider
              duration={selectedVideoDuration}
              startTime={videoTrimStartTime}
              clipDuration={activeClipDuration}
              onChange={updateVideoTrimWindow}
              accentColor={accentColor}
              mutedColor={hairlineColor}
            />

            <View style={styles.musicActionRow}>
              <TouchableOpacity
                style={[styles.secondaryPill, { backgroundColor: inputBackground, borderColor }]}
                onPress={closeVideoTrimSheet}
              >
                <Text style={[styles.secondaryPillText, { color: textColor }]}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, styles.trimAddButton, { backgroundColor: accentColor }]}
                onPress={() => applyVideoTrim().catch(() => undefined)}
                disabled={videoTrimApplying}
              >
                {videoTrimApplying ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Save trim</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {videoTrimError ? <Text style={[styles.sheetError, { color: isDarkMode ? "#FCA5A5" : "#B91C1C" }]}>{videoTrimError}</Text> : null}
        </View>
      </DraggableBottomSheet>
    );
  };

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.screen, { backgroundColor: screenBackground }]}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={screenBackground} />
      <View style={[styles.backgroundOrb, styles.backgroundOrbOne, { backgroundColor: accentSoft }]} />
      <View style={[styles.backgroundOrb, styles.backgroundOrbTwo, { backgroundColor: toAlphaColor(accentColor, isDarkMode ? 0.1 : 0.16) }]} />

      {stage === "launcher" ? renderLauncher() : null}

      {stage === "edit" ? renderEditStage() : null}

      {stage === "details" ? renderDetailsStage() : null}

      {renderTagSheet()}
      {renderMusicSheet()}
      {renderMusicTrimSheet()}
      {renderVideoTrimSheet()}
      {!isInsideTabNavigator ? <AppBottomDock navigation={navigation} activeRouteName="Create" /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  backgroundOrb: {
    position: "absolute",
    borderRadius: 999,
  },
  backgroundOrbOne: {
    width: 240,
    height: 240,
    top: -80,
    right: -50,
  },
  backgroundOrbTwo: {
    width: 220,
    height: 220,
    left: -70,
    bottom: 120,
  },
  launcherShell: {
    flex: 1,
    justifyContent: "flex-end",
  },
  launcherPreviewWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0f172a",
  },
  launcherPreviewVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  launcherPreviewFallback: {
    ...StyleSheet.absoluteFillObject,
  },
  launcherGridOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  launcherGridColumn: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  launcherGridRow: {
    position: "absolute",
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  launcherShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 23, 0.16)",
  },
  launcherPreviewTopBar: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 5,
    elevation: 5,
  },
  launcherPreviewIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  launcherSheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  launcherHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  launcherStatusText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: appFonts.medium,
  },
  launcherEyebrow: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    fontFamily: appFonts.medium,
  },
  launcherTitle: {
    marginTop: 4,
    fontSize: 19,
    lineHeight: 23,
    fontFamily: appFonts.bold,
  },
  launcherBody: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: appFonts.regular,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  launcherModeRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 28,
    marginTop: 18,
  },
  launcherModeButton: {
    alignItems: "center",
    gap: 10,
  },
  launcherModeText: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: appFonts.medium,
  },
  launcherModeUnderline: {
    width: 26,
    height: 3,
    borderRadius: 999,
  },
  storyLauncherChoiceRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
  },
  storyLauncherChoiceCard: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  storyLauncherChoiceTitle: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 17,
    fontFamily: appFonts.semibold,
  },
  storyLauncherChoiceMeta: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: appFonts.regular,
  },
  launcherFooterRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 20,
    gap: 16,
  },
  launcherSideAction: {
    width: 90,
    minHeight: 76,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 10,
  },
  launcherSideLabel: {
    fontSize: 11,
    fontFamily: appFonts.medium,
  },
  launcherCenterCopy: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  launcherRecordButton: {
    marginTop: 10,
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  launcherRecordOuter: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  launcherRecordInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  launcherCenterTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: appFonts.semibold,
  },
  launcherCenterBody: {
    marginTop: 6,
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center",
    fontFamily: appFonts.regular,
  },
  stageWrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  topBarCenter: {
    flex: 1,
  },
  topBarTitle: {
    fontSize: 15,
    lineHeight: 19,
    fontFamily: appFonts.semibold,
  },
  topBarSubtitle: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: appFonts.regular,
  },
  topBarNavButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  storyStageWrap: {
    flex: 1,
    paddingTop: 0,
  },
  storyEditContent: {
    flex: 1,
    backgroundColor: "#020617",
    overflow: "hidden",
  },
  storyStageTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 4,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  storyCanvasShell: {
    flex: 1,
    marginHorizontal: 0,
    minHeight: 0,
    maxHeight: 9999,
  },
  storyCanvasFrame: {
    width: "100%",
    flex: 1,
    overflow: "hidden",
    borderRadius: 30,
    borderWidth: 1,
  },
  storyCanvasExpanded: {
    aspectRatio: 9 / 16,
    minHeight: 420,
  },
  storyCanvasCompact: {
    aspectRatio: 9 / 16,
    minHeight: 188,
    marginBottom: 12,
  },
  storyCanvasFullscreen: {
    borderRadius: 0,
    borderWidth: 0,
  },
  storyCanvasMedia: {
    ...StyleSheet.absoluteFillObject,
  },
  storyCanvasMediaWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  storyCanvasShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 23, 0.08)",
  },
  storyFilterOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  storyLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    maxWidth: "68%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "transparent",
  },
  storyLayerTextStory: {
    width: "92%",
    maxWidth: "92%",
  },
  storyLayerActive: {
    shadowColor: "#020617",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  storyTextOverlay: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    fontSize: 24,
    lineHeight: 30,
    fontFamily: appFonts.bold,
  },
  storyTextOverlayTextStory: {
    width: "100%",
    fontSize: 26,
    lineHeight: 32,
  },
  storyEmojiLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  storyImageLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 112,
    height: 112,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "transparent",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  storyImageAsset: {
    width: "100%",
    height: "100%",
  },
  storyEmojiText: {
    fontSize: 48,
    lineHeight: 56,
  },
  storyMusicBadge: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.66)",
  },
  storyMusicBadgeText: {
    flex: 1,
    color: "#fff",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appFonts.medium,
  },
  storyVideoPill: {
    position: "absolute",
    top: 18,
    right: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
  },
  storyVideoPillText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: appFonts.semibold,
  },
  storyCanvasHintWrap: {
    position: "absolute",
    left: 18,
    right: 110,
    bottom: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 22,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
  },
  storyCanvasHintTitle: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 18,
    fontFamily: appFonts.semibold,
  },
  storyCanvasHintBody: {
    marginTop: 4,
    color: "rgba(255,255,255,0.86)",
    fontSize: 12,
    lineHeight: 17,
    fontFamily: appFonts.regular,
  },
  storyToolPanel: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 24,
    borderWidth: 1,
    padding: 14,
  },
  storyToolPanelSheet: {
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
    borderRadius: 0,
    borderWidth: 0,
    padding: 0,
  },
  storyToolPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  storyStickerSectionTitle: {
    marginTop: 10,
  },
  storyStickerSectionHint: {
    marginTop: 10,
  },
  storyToolPanelTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: appFonts.semibold,
  },
  storyTextInput: {
    minHeight: 82,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: appFonts.medium,
    textAlignVertical: "top",
  },
  storyStickerSearchInput: {
    minHeight: 48,
    marginBottom: 4,
  },
  storyStickerLoader: {
    marginTop: 8,
  },
  storyChipRow: {
    gap: 10,
    paddingVertical: 6,
  },
  storyThemeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  storyThemeSwatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  storyThemeChipText: {
    fontSize: 12,
    fontFamily: appFonts.medium,
  },
  storyAlignmentRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  storyAlignButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 11,
  },
  storyAlignButtonText: {
    fontSize: 12,
    fontFamily: appFonts.medium,
  },
  storyAdjustmentBlock: {
    marginTop: 14,
  },
  storyAdjustmentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  storyAdjustmentLabel: {
    fontSize: 12,
    fontFamily: appFonts.semibold,
  },
  storyAdjustmentValue: {
    fontSize: 11,
    fontFamily: appFonts.medium,
  },
  storyPanelSection: {
    marginTop: 10,
  },
  storyPanelLabel: {
    fontSize: 12,
    fontFamily: appFonts.semibold,
  },
  storyFontList: {
    gap: 10,
    marginTop: 12,
  },
  storyFontOption: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  storyFontOptionText: {
    fontSize: 15,
    lineHeight: 20,
  },
  storyToolRail: {
    position: "absolute",
    right: 12,
    zIndex: 5,
    width: 84,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 8,
    shadowColor: "#020617",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  storyToolRailScroll: {
    gap: 8,
    paddingBottom: 2,
  },
  storyRailButton: {
    minHeight: 64,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  storyRailButtonText: {
    fontSize: 10,
    lineHeight: 12,
    textAlign: "center",
    fontFamily: appFonts.medium,
  },
  storyToolDock: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 30,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    shadowColor: "#020617",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  storyToolButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  storyToolButtonText: {
    fontSize: 11,
    lineHeight: 14,
    textAlign: "center",
    fontFamily: appFonts.medium,
  },
  storyFilterChip: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  storyFilterChipText: {
    fontSize: 12,
    fontFamily: appFonts.medium,
  },
  storyBackgroundChip: {
    width: 42,
    height: 42,
    borderRadius: 16,
    borderWidth: 2,
  },
  storyEmojiChip: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  storyImageOption: {
    width: 78,
    height: 78,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    overflow: "hidden",
  },
  storyImageOptionThumb: {
    width: "100%",
    height: "100%",
  },
  storyEmojiChipText: {
    fontSize: 24,
  },
  storyStickerClear: {
    fontSize: 12,
    fontFamily: appFonts.semibold,
  },
  composerEditPreviewWrap: {
    width: "100%",
    paddingHorizontal: 14,
    paddingTop: 112,
    paddingBottom: 28,
    justifyContent: "center",
  },
  composerSheetBlock: {
    marginTop: 14,
  },
  previewFrame: {
    width: "100%",
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 12,
  },
  previewMediaFill: {
    ...StyleSheet.absoluteFillObject,
  },
  previewMedia: {
    width: "100%",
    height: "100%",
  },
  emptyPreview: {
    width: "100%",
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 26,
    paddingVertical: 38,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyPreviewTitle: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 20,
    textAlign: "center",
    fontFamily: appFonts.semibold,
  },
  emptyPreviewBody: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    fontFamily: appFonts.regular,
  },
  videoBadge: {
    position: "absolute",
    left: 16,
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.62)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  videoBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: appFonts.semibold,
  },
  sectionCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  sectionEyebrow: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontFamily: appFonts.medium,
  },
  sectionTitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: appFonts.semibold,
  },
  sectionMeta: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: "right",
    fontFamily: appFonts.regular,
  },
  chipRow: {
    flexDirection: "row",
    gap: 10,
  },
  choiceChip: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  choiceChipLabel: {
    fontSize: 13,
    lineHeight: 16,
    fontFamily: appFonts.semibold,
  },
  choiceChipDetail: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: appFonts.regular,
  },
  filterRow: {
    flexDirection: "row",
    gap: 10,
    paddingRight: 8,
  },
  filterCard: {
    width: 88,
    borderRadius: 22,
    borderWidth: 1.5,
    padding: 8,
  },
  filterThumbFrame: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#0f172a",
  },
  filterThumbImage: {
    width: "100%",
    height: "100%",
  },
  filterName: {
    marginTop: 8,
    fontSize: 12,
    textAlign: "center",
    fontFamily: appFonts.medium,
  },
  toolActionRow: {
    gap: 12,
  },
  toolAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  toolActionBody: {
    flex: 1,
  },
  toolActionTitle: {
    fontSize: 12,
    lineHeight: 15,
    fontFamily: appFonts.semibold,
  },
  toolActionMeta: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: appFonts.regular,
  },
  inlineBlock: {
    marginTop: 12,
  },
  helperText: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: appFonts.regular,
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  tagChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tagChipText: {
    fontSize: 11,
    fontFamily: appFonts.medium,
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 26,
    overflow: "hidden",
    marginBottom: 14,
  },
  summaryCardStory: {
    flexDirection: "column",
    alignItems: "stretch",
    padding: 12,
  },
  summaryPreview: {
    width: 120,
    padding: 10,
  },
  summaryPreviewStory: {
    width: "100%",
  },
  summaryCopy: {
    flex: 1,
    paddingRight: 16,
  },
  summaryCopyStory: {
    paddingTop: 12,
    paddingHorizontal: 4,
  },
  summaryTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontFamily: appFonts.semibold,
  },
  summaryMeta: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: appFonts.regular,
  },
  captionInput: {
    minHeight: 116,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    textAlignVertical: "top",
    fontSize: 12,
    lineHeight: 18,
    fontFamily: appFonts.regular,
    marginTop: 14,
  },
  captionFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 10,
  },
  toolActionFullWidth: {
    width: "100%",
  },
  storyDetailsTags: {
    marginTop: 12,
  },
  singleLineInput: {
    height: 48,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 12,
    fontFamily: appFonts.regular,
    marginTop: 14,
  },
  seedWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  seedChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  seedChipText: {
    fontSize: 12,
    fontFamily: appFonts.medium,
  },
  suggestionsWrap: {
    marginTop: 12,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  suggestionLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
  },
  suggestionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  suggestionBody: {
    flex: 1,
    paddingRight: 10,
  },
  suggestionName: {
    fontSize: 13,
    fontFamily: appFonts.semibold,
  },
  suggestionMeta: {
    marginTop: 3,
    fontSize: 12,
    fontFamily: appFonts.regular,
  },
  secondaryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  secondaryPillText: {
    fontSize: 13,
    fontFamily: appFonts.medium,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 14,
  },
  switchRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  switchCopy: {
    flex: 1,
  },
  switchTitle: {
    fontSize: 13,
    lineHeight: 16,
    fontFamily: appFonts.semibold,
  },
  switchMeta: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: appFonts.regular,
  },
  visibilityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
    marginBottom: 12,
  },
  visibilityChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  visibilityChipText: {
    fontSize: 12,
    fontFamily: appFonts.medium,
  },
  errorCard: {
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
  },
  errorTitle: {
    fontSize: 13,
    fontFamily: appFonts.semibold,
  },
  errorBody: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: appFonts.regular,
  },
  footerBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerGhostButton: {
    height: 52,
    minWidth: 92,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  footerGhostText: {
    fontSize: 13,
    fontFamily: appFonts.semibold,
  },
  primaryButton: {
    flex: 1,
    height: 52,
    borderRadius: 18,
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: appFonts.semibold,
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sheetEyebrow: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontFamily: appFonts.medium,
  },
  sheetTitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: appFonts.semibold,
  },
  sheetList: {
    gap: 10,
    paddingTop: 12,
    paddingBottom: 12,
  },
  musicResultsList: {
    flex: 1,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  friendCopy: {
    flex: 1,
  },
  friendName: {
    fontSize: 13,
    fontFamily: appFonts.semibold,
  },
  friendUsername: {
    marginTop: 4,
    fontSize: 12,
    fontFamily: appFonts.regular,
  },
  musicSearchRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  musicSearchInput: {
    flex: 1,
    height: 46,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 13,
    fontFamily: appFonts.regular,
  },
  uploadMusicButton: {
    marginTop: 10,
    marginBottom: 2,
    minHeight: 40,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  uploadMusicButtonText: {
    fontSize: 11.5,
    lineHeight: 14,
    fontFamily: appFonts.medium,
  },
  searchButton: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  currentMusicCard: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
  },
  currentMusicHeader: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  currentMusicArtwork: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  currentMusicArtworkFallback: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  currentMusicCopy: {
    flex: 1,
  },
  trimHeroCard: {
    marginTop: 14,
    height: 164,
    borderRadius: 0,
    borderWidth: 1,
    overflow: "hidden",
    justifyContent: "space-between",
  },
  trimHeroArtwork: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  trimHeroArtworkFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#312E81",
  },
  trimHeroShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
  },
  trimHeroTopRow: {
    paddingHorizontal: 12,
    paddingTop: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  trimHeroSourcePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  trimHeroSourceText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: appFonts.semibold,
  },
  trimHeroCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  trimHeroPlayButton: {
    width: 58,
    height: 58,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  trimHeroBottom: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  trimHeroTitle: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 18,
    fontFamily: appFonts.semibold,
  },
  trimHeroMeta: {
    marginTop: 4,
    color: "rgba(255,255,255,0.88)",
    fontSize: 11,
    lineHeight: 15,
    fontFamily: appFonts.medium,
  },
  currentMusicTitle: {
    fontSize: 12,
    lineHeight: 15,
    fontFamily: appFonts.semibold,
  },
  currentMusicMeta: {
    marginTop: 2,
    fontSize: 10.5,
    lineHeight: 14,
    fontFamily: appFonts.regular,
  },
  sliderWrap: {
    marginTop: 16,
  },
  sliderLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sliderLabel: {
    fontSize: 12,
    fontFamily: appFonts.medium,
  },
  sliderHint: {
    fontSize: 11,
    fontFamily: appFonts.regular,
  },
  sliderTrack: {
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  sliderTrackFrame: {
    position: "relative",
    justifyContent: "center",
    minHeight: 52,
  },
  sliderViewport: {
    marginVertical: 14,
  },
  sliderScrollContent: {
    paddingVertical: 2,
  },
  sliderTrackWaveform: {
    height: 54,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  sliderSelection: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderRadius: 999,
  },
  sliderSelectionEdge: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 999,
  },
  sliderWaveRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  sliderWaveBar: {
    width: 4,
    borderRadius: 999,
    alignSelf: "center",
  },
  sliderHandleTouch: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  sliderHandleTouchWaveform: {
    width: 34,
  },
  sliderHandle: {
    borderWidth: 2,
    backgroundColor: "rgba(255,255,255,0.96)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#020617",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  sliderHandleDefault: {
    width: 18,
    height: 28,
    borderRadius: 999,
  },
  sliderHandleWaveform: {
    width: 18,
    height: 48,
    borderRadius: 999,
  },
  sliderHandleGrip: {
    width: 3,
    height: 12,
    borderRadius: 999,
  },
  sliderHandleGripWaveform: {
    width: 4,
    height: 18,
    borderRadius: 999,
  },
  valueSliderTrack: {
    height: 6,
    borderRadius: 999,
    justifyContent: "center",
  },
  valueSliderFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 999,
  },
  valueSliderHandle: {
    position: "absolute",
    top: -7,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 3,
  },
  musicActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    alignItems: "center",
    paddingRight: 4,
  },
  trimActionRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingRight: 4,
  },
  musicActionIconButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  musicActionIconButtonPrimary: {
    shadowColor: "#020617",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  musicActionIconButtonDanger: {
    opacity: 0.92,
  },
  trimPreviewProgressTrack: {
    height: 6,
    borderRadius: 0,
    overflow: "hidden",
    marginTop: 10,
  },
  trimPreviewProgressFill: {
    height: "100%",
    borderRadius: 0,
  },
  trimPreviewButton: {
    width: 42,
    height: 42,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetBodyScroll: {
    flex: 1,
  },
  sheetBodyContent: {
    paddingBottom: 8,
  },
  youtubePreviewCard: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 18,
    overflow: "hidden",
  },
  youtubePreviewFallbackCard: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: "center",
    gap: 10,
  },
  youtubePreviewFallbackTitle: {
    fontSize: 13,
    lineHeight: 16,
    fontFamily: appFonts.semibold,
    textAlign: "center",
  },
  youtubePreviewFallbackText: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: appFonts.regular,
    textAlign: "center",
  },
  trimAddButton: {
    flex: 1,
    height: 42,
  },
  trimAddButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  trimActionDock: {
    marginTop: 14,
    gap: 12,
  },
  trimNudgePanel: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  trimNudgeLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: appFonts.medium,
  },
  trimNudgeValue: {
    marginTop: 2,
    fontSize: 15,
    lineHeight: 19,
    fontFamily: appFonts.semibold,
  },
  trimNudgeButtonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  trimNudgeButton: {
    minWidth: 48,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  trimNudgeButtonText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: appFonts.semibold,
  },
  videoTrimCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 12,
    gap: 14,
  },
  videoTrimPreviewWrap: {
    height: 240,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#020617",
  },
  videoTrimPreview: {
    width: "100%",
    height: "100%",
  },
  videoTrimShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 23, 0.08)",
  },
  videoTrimBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.62)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  videoTrimBadgeText: {
    color: "#fff",
    fontSize: 11,
    lineHeight: 14,
    fontFamily: appFonts.semibold,
  },
  videoTrimMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  videoTrimMetaCopy: {
    flex: 1,
  },
  videoTrimTitle: {
    fontSize: 15,
    lineHeight: 18,
    fontFamily: appFonts.semibold,
  },
  videoTrimMeta: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appFonts.regular,
  },
  videoTrimTime: {
    fontSize: 12,
    textAlign: "right",
    fontFamily: appFonts.medium,
  },
  sheetError: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: appFonts.medium,
  },
  musicResultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 72,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  musicResultArtwork: {
    width: 42,
    height: 42,
    borderRadius: 12,
  },
  musicResultCopy: {
    flex: 1,
  },
  musicResultTitle: {
    fontSize: 11.5,
    lineHeight: 14,
    fontFamily: appFonts.semibold,
  },
  musicResultMeta: {
    marginTop: 2,
    fontSize: 10.2,
    lineHeight: 13,
    fontFamily: appFonts.regular,
  },
  musicResultActions: {
    gap: 6,
    alignItems: "flex-end",
  },
  musicResultSpacer: {
    height: 8,
  },
  musicLoadingMoreFooter: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  resultPlayButton: {
    width: 32,
    height: 32,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  selectButton: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default CreatePostScreen;
