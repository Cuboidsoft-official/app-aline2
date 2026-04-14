import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  PanResponder,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createSound } from "react-native-nitro-sound";
import Icon from "react-native-vector-icons/Ionicons";

import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
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
import { getStoredUserId } from "../utils/authSession";
import { useAppTheme } from "../theme/AppThemeContext";
import SocialVideo from "../features/social/components/SocialVideo";
import PhotoFilterStrip from "../components/media/PhotoFilterStrip";
import VideoTrimSheet from "../components/media/VideoTrimSheet";
import FaceOverlayPicker from "../components/media/FaceOverlayPicker";

type ComposerTab = "post" | "story" | "swipe";

const tabs: ComposerTab[] = ["post", "story", "swipe"];
const postModes: PostType[] = ["photo", "video", "carousel"];
const storyModes: StoryType[] = ["media", "text", "poll", "question"];
const MAX_CAROUSEL_ITEMS = 10;
const textStoryColors = ["#1f2937", "#7c3aed", "#db2777", "#0f766e", "#b45309", "#2563eb"];
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
const clampStickerScale = (value: number): number => Math.min(2, Math.max(0.6, Math.round(value * 10) / 10));
const clampStickerRotation = (value: number): number => Math.min(180, Math.max(-180, Math.round(value)));
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

function CreatePostScreen({ navigation, route }: any) {
  const { colors, isDarkMode } = useAppTheme();
  const initialTab = (route?.params?.initialTab as ComposerTab | undefined) || "post";
  const initialMedia = route?.params?.initialMedia as string | undefined;
  const initialMediaType = (route?.params?.initialMediaType as "image" | "video" | undefined) || "image";

  const [activeTab, setActiveTab] = useState<ComposerTab>(initialTab);
  const [publishing, setPublishing] = useState(false);
  const [pickingMedia, setPickingMedia] = useState(false);
  const [publishError, setPublishError] = useState("");

  const [postType, setPostType] = useState<PostType>("photo");
  const [storyType, setStoryType] = useState<StoryType>("media");

  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");

  const [hashtagsRaw, setHashtagsRaw] = useState("");
  const [mentionsRaw, setMentionsRaw] = useState("");

  const [disableComments, setDisableComments] = useState(false);
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

  const surfaceColor = isDarkMode ? colors.surface : colors.card;
  const elevatedSurfaceColor = isDarkMode ? colors.card : "#f8fafc";
  const subtleSurfaceColor = isDarkMode ? colors.surface : "#f3f4f6";
  const inputStyle = { borderColor: colors.border, backgroundColor: surfaceColor, color: colors.text };
  const helperTextStyle = { color: colors.mutedText };
  const controlBorderStyle = { borderColor: colors.border };
  const activePillStyle = { backgroundColor: colors.primary, borderColor: colors.primary };
  const textStickerDragStartRef = useRef(storyStickerPresetPositions.bottom_left);
  const emojiStickerDragStartRef = useRef(storyStickerPresetPositions.top_right);
  const musicPreviewPlayerRef = useRef(createSound());

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
    }

    navigation.setParams({
      initialTab: undefined,
      initialMedia: undefined,
      initialMediaType: undefined,
    });
  }, [navigation, route?.params]);

  const primaryAsset = useMemo(() => selectedAssets[0] || null, [selectedAssets]);

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
        onPanResponderGrant: () => {
          textStickerDragStartRef.current = getStickerPosition("text");
        },
        onPanResponderMove: (_event, gestureState) => {
          if (!storyPreviewSize.width || !storyPreviewSize.height) {
            return;
          }

          updateStickerPosition("text", {
            x: textStickerDragStartRef.current.x + gestureState.dx / storyPreviewSize.width,
            y: textStickerDragStartRef.current.y + gestureState.dy / storyPreviewSize.height,
          });
        },
      }),
    [getStickerPosition, storyPreviewSize.height, storyPreviewSize.width, storyStickerText, updateStickerPosition],
  );

  const emojiStickerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!storyStickerEmoji.trim(),
        onMoveShouldSetPanResponder: () => !!storyStickerEmoji.trim(),
        onPanResponderGrant: () => {
          emojiStickerDragStartRef.current = getStickerPosition("emoji");
        },
        onPanResponderMove: (_event, gestureState) => {
          if (!storyPreviewSize.width || !storyPreviewSize.height) {
            return;
          }

          updateStickerPosition("emoji", {
            x: emojiStickerDragStartRef.current.x + gestureState.dx / storyPreviewSize.width,
            y: emojiStickerDragStartRef.current.y + gestureState.dy / storyPreviewSize.height,
          });
        },
      }),
    [getStickerPosition, storyPreviewSize.height, storyPreviewSize.width, storyStickerEmoji, updateStickerPosition],
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
    setActiveTab(tab);
    resetAssetsForTab(tab);
    setPublishError("");
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
        return;
      }

      setSelectedAssets([pickedAssets[0]]);
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
      setPublishError("");
      Alert.alert("Published", `Your ${publishedType} is now live.`);
      navigation.navigate(activeTab === "swipe" ? "Swipes" : "Feed");
    } catch (error) {
      const nextMessage = getReadableApiErrorMessage(error, toUserSafeMessage(error));
      setPublishError(nextMessage);
      Alert.alert("Publish failed", nextMessage);
    } finally {
      setPublishing(false);
    }
  };

  const renderMediaPreview = () => {
    const textStickerPosition = getStickerPosition("text");
    const emojiStickerPosition = getStickerPosition("emoji");
    const textStickerThemeStyle = getStoryTextStickerThemeStyle(storyStickerTextTheme);
    const storyFilterStyle =
      activeTab === "story" ? getStoryFilterOverlayStyle(storyFilterPreset, storyFilterIntensity) : null;
    const previewStickers =
      activeTab === "story" && (storyStickerText.trim() || storyStickerEmoji.trim()) ? (
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

    if (activeTab === "story" && storyType === "text") {
      return (
        <View
          style={[styles.textStoryPreview, { backgroundColor: storyBackgroundColor }]}
          onLayout={(event) => handleStoryPreviewLayout(event.nativeEvent.layout.width, event.nativeEvent.layout.height)}
        >
          <Text style={styles.textStoryPreviewText}>
            {storyCaption.trim() || "Type your story text"}
          </Text>
          {previewStickers}
        </View>
      );
    }

    if (!primaryAsset) {
      return (
        <View style={styles.emptyPreview}>
          <Icon name="images-outline" size={36} color="#6b7280" />
          <Text style={styles.emptyPreviewTitle}>No media selected</Text>
          <Text style={styles.emptyPreviewText}>Pick media from your device before publishing.</Text>
        </View>
      );
    }

    if (primaryAsset.mediaType === "video") {
      const previewVideo = (
        <SocialVideo
          uri={primaryAsset.uri}
          posterUri={primaryAsset.thumbnailUrl || primaryAsset.uri}
          style={styles.preview}
          muted={false}
          repeat
          controls
        />
      );

      return activeTab === "story" ? (
        <View
          style={styles.storyPreviewFrame}
          onLayout={(event) => handleStoryPreviewLayout(event.nativeEvent.layout.width, event.nativeEvent.layout.height)}
        >
          {previewVideo}
          {previewStickers}
        </View>
      ) : previewVideo;
    }

    return activeTab === "story" ? (
      <View
        style={styles.storyPreviewFrame}
        onLayout={(event) => handleStoryPreviewLayout(event.nativeEvent.layout.width, event.nativeEvent.layout.height)}
      >
        <Image
          source={{ uri: primaryAsset.thumbnailUrl || primaryAsset.uri }}
          style={styles.preview}
        />
        {storyFilterStyle ? (
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
        {previewStickers}
      </View>
    ) : (
      <Image
        source={{ uri: primaryAsset.thumbnailUrl || primaryAsset.uri }}
        style={styles.preview}
      />
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
          style={[styles.mediaActionButton, { backgroundColor: colors.primary }]}
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
    if (activeTab !== "post" && activeTab !== "story") {
      return null;
    }

    return (
      <>
        <TouchableOpacity
          style={[styles.mediaActionButton, { backgroundColor: "#FF6B35", marginLeft: 8 }]}
          onPress={() => setShowFaceOverlay(true)}
        >
          <Icon name="happy-outline" size={18} color="#fff" />
          <Text style={styles.mediaActionText}>Face Stickers</Text>
        </TouchableOpacity>
        <FaceOverlayPicker
          visible={showFaceOverlay}
          onClose={() => setShowFaceOverlay(false)}
          onStickersChanged={() => { }}
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
        {selectedAssets.map((asset) => (
          <View key={asset.id} style={styles.assetChip}>
            {asset.mediaType === "video" && !asset.thumbnailUrl && asset.source === "local" ? (
              <View style={[styles.assetThumb, styles.assetThumbVideo]}>
                <Icon name="videocam-outline" size={18} color="#fff" />
              </View>
            ) : (
              <Image source={{ uri: asset.thumbnailUrl || asset.uri }} style={styles.assetThumb} />
            )}
            <TouchableOpacity style={styles.assetRemove} onPress={() => removeAsset(asset.id)}>
              <Icon name="close" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    );
  };

  const renderMusicPicker = (tab: ComposerTab) => {
    const current = musicSelections[tab];
    const clipPresets = [5, 10, 15, 30];

    return (
      <>
        <Text style={[styles.sectionLabel, { color: colors.text }]}>Music</Text>
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.pill, controlBorderStyle, { backgroundColor: surfaceColor }, musicBrowseMode === "trending" && [styles.pillActive, activePillStyle]]}
            onPress={loadTrendingMusic}
          >
            <Text style={[styles.pillText, { color: musicBrowseMode === "trending" ? "#fff" : colors.text }, musicBrowseMode === "trending" && styles.pillTextActive]}>Trending</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pill, controlBorderStyle, { backgroundColor: surfaceColor }, musicBrowseMode === "original" && [styles.pillActive, activePillStyle]]}
            onPress={loadOriginalSounds}
          >
            <Text style={[styles.pillText, { color: musicBrowseMode === "original" ? "#fff" : colors.text }, musicBrowseMode === "original" && styles.pillTextActive]}>My Audio</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.musicSearchRow}>
          <TextInput
            style={[styles.musicSearchInput, inputStyle]}
            value={musicQuery}
            onChangeText={setMusicQuery}
            placeholder="Search tracks or original sounds"
            placeholderTextColor={colors.mutedText}
            maxLength={limits.music}
            returnKeyType="search"
            onSubmitEditing={runMusicSearch}
          />
          <TouchableOpacity style={[styles.musicActionButton, { backgroundColor: colors.primary }]} onPress={runMusicSearch} disabled={musicLoading}>
            {musicLoading ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="search-outline" size={16} color="#fff" />}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.musicSecondaryButton, { backgroundColor: surfaceColor, borderColor: colors.border }]} onPress={loadTrendingMusic} disabled={musicLoading}>
            <Icon name="flame-outline" size={16} color={colors.text} />
          </TouchableOpacity>
        </View>

        {current ? (
          <View style={[styles.musicCard, { backgroundColor: elevatedSurfaceColor, borderColor: colors.border }]}>
            <View style={styles.musicCardHeader}>
              <View style={styles.musicTitleBlock}>
                <Text style={[styles.musicTitle, { color: colors.text }]}>{buildMusicLabel(current)}</Text>
                <Text style={[styles.musicMeta, helperTextStyle]}>
                  {[current.source || "catalog", current.isOriginal ? "original" : null, `${formatDuration(current.duration)} track`]
                    .filter(Boolean)
                    .join(" • ")}
                </Text>
              </View>
              <TouchableOpacity style={[styles.musicClearButton, { backgroundColor: surfaceColor, borderColor: colors.border }]} onPress={() => setMusicForTab(tab, null)}>
                <Text style={[styles.musicClearText, { color: colors.text }]}>Remove</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.sectionLabel, { color: colors.text }]}>Clip length</Text>
            <View style={styles.modeRow}>
              {clipPresets
                .filter((preset) => preset <= current.duration)
                .map((preset) => (
                  <TouchableOpacity
                    key={preset}
                    style={[styles.pill, controlBorderStyle, { backgroundColor: surfaceColor }, (current.clipDuration || 0) === preset && [styles.pillActive, activePillStyle]]}
                    onPress={() => setSelectedMusicClipDuration(preset)}
                  >
                    <Text style={[styles.pillText, { color: (current.clipDuration || 0) === preset ? "#fff" : colors.text }, (current.clipDuration || 0) === preset && styles.pillTextActive]}>
                      {preset}s
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>

            <Text style={[styles.sectionLabel, { color: colors.text }]}>Clip start</Text>
            <View style={styles.clipAdjustRow}>
              <TouchableOpacity style={[styles.clipAdjustButton, { backgroundColor: colors.primary }]} onPress={() => nudgeSelectedMusicStart(-5)}>
                <Text style={styles.clipAdjustText}>-5s</Text>
              </TouchableOpacity>
              <Text style={[styles.clipAdjustValue, { color: colors.text }]}>
                Starts at {formatDuration(current.clipStartTime)} for {formatDuration(current.clipDuration)}
              </Text>
              <TouchableOpacity style={[styles.clipAdjustButton, { backgroundColor: colors.primary }]} onPress={() => nudgeSelectedMusicStart(5)}>
                <Text style={styles.clipAdjustText}>+5s</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Text style={[styles.helperText, helperTextStyle]}>
            Attach a real track so this {tab === "story" ? "story" : tab} uses a saved music record instead of placeholder text.
          </Text>
        )}

        {musicError ? <Text style={[styles.musicError, { color: isDarkMode ? "#FCA5A5" : "#b91c1c" }]}>{musicError}</Text> : null}

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
                  { backgroundColor: surfaceColor, borderColor: colors.border },
                  isCurrent && [styles.musicResultCardActive, { backgroundColor: elevatedSurfaceColor, borderColor: colors.primary }],
                ]}
              >
                <TouchableOpacity
                  style={styles.musicResultBody}
                  onPress={() => attachMusic(item)}
                  disabled={isImporting}
                >
                  <Text style={[styles.musicResultTitle, { color: colors.text }]}>{buildMusicLabel(item)}</Text>
                  <Text style={[styles.musicResultMeta, helperTextStyle]}>
                    {[item.source || "catalog", item.isOriginal ? "original" : null, formatDuration(item.duration)]
                      .filter(Boolean)
                      .join(" • ")}
                  </Text>
                  {previewLabel ? <Text style={[styles.musicPreviewMeta, helperTextStyle]}>{previewLabel}</Text> : null}
                </TouchableOpacity>
                <View style={styles.musicResultActions}>
                  <TouchableOpacity
                    style={[styles.musicResultIconButton, { backgroundColor: elevatedSurfaceColor, borderColor: colors.border }]}
                    onPress={() => {
                      toggleMusicPreview(item).catch(() => undefined);
                    }}
                    disabled={!item.previewUrl || isImporting || isPreviewLoading}
                  >
                    {isPreviewLoading ? (
                      <ActivityIndicator size="small" color={colors.text} />
                    ) : (
                      <Icon
                        name={isPreviewing ? "pause" : "play"}
                        size={16}
                        color={item.previewUrl ? colors.text : colors.mutedText}
                      />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.musicResultIconButton, { backgroundColor: elevatedSurfaceColor, borderColor: colors.border }]}
                    onPress={() => {
                      attachMusic(item).catch(() => undefined);
                    }}
                    disabled={isImporting}
                  >
                    {isImporting ? (
                      <ActivityIndicator size="small" color={colors.text} />
                    ) : (
                      <Icon name={isCurrent ? "checkmark-circle" : "add-circle-outline"} size={20} color={colors.text} />
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
      <Text style={[styles.sectionLabel, { color: colors.text }]}>Post Type</Text>
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
            <Text style={[styles.pillText, { color: postType === mode ? "#fff" : colors.text }, postType === mode && styles.pillTextActive]}>{mode}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.sectionLabel, { color: colors.text }]}>Caption</Text>
      <TextInput
        style={[styles.input, inputStyle]}
        value={caption}
        onChangeText={setCaption}
        placeholder="Write caption"
        placeholderTextColor={colors.mutedText}
        multiline
        maxLength={limits.caption}
      />
      <Text style={[styles.counter, helperTextStyle]}>{caption.length}/{limits.caption}</Text>

      <Text style={[styles.sectionLabel, { color: colors.text }]}>Location</Text>
      <TextInput style={[styles.inputSingle, inputStyle]} value={location} onChangeText={setLocation} placeholder="Add location" placeholderTextColor={colors.mutedText} maxLength={limits.location} />
      {renderMusicPicker("post")}

      <Text style={[styles.sectionLabel, { color: colors.text }]}>Hashtags (comma separated)</Text>
      <TextInput style={[styles.inputSingle, inputStyle]} value={hashtagsRaw} onChangeText={setHashtagsRaw} placeholder="fashion, travel" placeholderTextColor={colors.mutedText} />

      <Text style={[styles.sectionLabel, { color: colors.text }]}>Mentions (comma separated)</Text>
      <TextInput style={[styles.inputSingle, inputStyle]} value={mentionsRaw} onChangeText={setMentionsRaw} placeholder="alice, bob" placeholderTextColor={colors.mutedText} />

      <View style={styles.switchRow}><Text style={[styles.switchLabel, { color: colors.text }]}>Disable comments</Text><Switch value={disableComments} onValueChange={setDisableComments} /></View>
      <View style={styles.switchRow}><Text style={[styles.switchLabel, { color: colors.text }]}>Hide like count</Text><Switch value={hideLikeCount} onValueChange={setHideLikeCount} /></View>

      <Text style={[styles.helperText, helperTextStyle]}>
        {postType === "carousel"
          ? "Select up to 10 images for a carousel post."
          : postType === "video"
            ? "Choose a single video. It will upload through the backend media pipeline."
            : "Choose a single image for this post."}
      </Text>
      <Text style={[styles.helperText, helperTextStyle]}>
        Basic posting is production-focused here: caption, media, location, music, hashtags, mentions, comment control, and like-count privacy are supported. Collaboration/remix controls are hidden until they are fully product-ready.
      </Text>

      {/* Photo Filters for image posts */}
      {renderPhotoFilterStrip()}

      {/* Video trim + Face overlay buttons */}
      <View style={{ flexDirection: "row", marginTop: 8 }}>
        {renderVideoTrimButton()}
        {renderFaceOverlayButton()}
      </View>
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
          <Text style={styles.sectionLabel}>Poll Question</Text>
          <TextInput style={styles.inputSingle} value={pollQuestion} onChangeText={setPollQuestion} placeholder="Ask a poll question" />
          <Text style={styles.sectionLabel}>Option A</Text>
          <TextInput style={styles.inputSingle} value={pollOptionA} onChangeText={setPollOptionA} placeholder="Option A" />
          <Text style={styles.sectionLabel}>Option B</Text>
          <TextInput style={styles.inputSingle} value={pollOptionB} onChangeText={setPollOptionB} placeholder="Option B" />
        </>
      ) : null}

      {storyType === "question" ? (
        <>
          <Text style={styles.sectionLabel}>Question Prompt</Text>
          <TextInput style={styles.inputSingle} value={questionPrompt} onChangeText={setQuestionPrompt} placeholder="Ask followers anything" />
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
          <Text style={styles.sectionLabel}>Background</Text>
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
          <Text style={styles.sectionLabel}>Custom audience</Text>
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
          <Text style={styles.helperText}>Only selected users will be able to view this story.</Text>
        </>
      ) : null}

      {renderMusicPicker("story")}

      <Text style={styles.sectionLabel}>Link</Text>
      <TextInput
        style={styles.inputSingle}
        value={storyLinkUrl}
        onChangeText={setStoryLinkUrl}
        placeholder="https://example.com"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.sectionLabel}>Location</Text>
      <TextInput
        style={styles.inputSingle}
        value={storyLocation}
        onChangeText={setStoryLocation}
        placeholder="Add location sticker"
        maxLength={limits.location}
      />

      <Text style={styles.sectionLabel}>Hashtags</Text>
      <TextInput
        style={styles.inputSingle}
        value={storyHashtagsRaw}
        onChangeText={setStoryHashtagsRaw}
        placeholder="travel, sunrise"
      />

      <Text style={styles.sectionLabel}>Mentions</Text>
      <TextInput
        style={styles.inputSingle}
        value={storyMentionsRaw}
        onChangeText={setStoryMentionsRaw}
        placeholder="alice, bob"
      />

      <Text style={styles.sectionLabel}>Text sticker</Text>
      <TextInput
        style={styles.inputSingle}
        value={storyStickerText}
        onChangeText={setStoryStickerText}
        placeholder="Add a headline sticker"
        maxLength={60}
      />
      {storyStickerText.trim() ? (
        <>
          <View style={styles.modeRow}>
            {storyTextStickerThemes.map((theme) => (
              <TouchableOpacity
                key={`text-theme-${theme}`}
                style={[styles.pill, storyStickerTextTheme === theme && styles.pillActive]}
                onPress={() => setStoryStickerTextTheme(theme)}
              >
                <Text style={[styles.pillText, storyStickerTextTheme === theme && styles.pillTextActive]}>
                  {storyTextStickerThemeLabels[theme]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.modeRow}>
            {storyTextStickerAlignments.map((alignment) => (
              <TouchableOpacity
                key={`text-align-${alignment}`}
                style={[styles.pill, storyStickerTextAlignment === alignment && styles.pillActive]}
                onPress={() => setStoryStickerTextAlignment(alignment)}
              >
                <Text style={[styles.pillText, storyStickerTextAlignment === alignment && styles.pillTextActive]}>
                  {storyTextStickerAlignmentLabels[alignment]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.modeRow}>
            {storyStickerPlacements.map((placement) => (
              <TouchableOpacity
                key={`text-${placement}`}
                style={[styles.pill, storyStickerTextPlacement === placement && styles.pillActive]}
                onPress={() => {
                  setStoryStickerTextPlacement(placement);
                  setStoryStickerTextPosition(storyStickerPresetPositions[placement]);
                }}
              >
                <Text style={[styles.pillText, storyStickerTextPlacement === placement && styles.pillTextActive]}>
                  {storyStickerPlacementLabels[placement]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.stickerScaleRow}>
            <TouchableOpacity style={styles.scaleButton} onPress={() => setStoryStickerTextScale((value) => clampStickerScale(value - 0.1))}>
              <Text style={styles.scaleButtonText}>A-</Text>
            </TouchableOpacity>
            <Text style={styles.scaleValueText}>Text size {storyStickerTextScale.toFixed(1)}x</Text>
            <TouchableOpacity style={styles.scaleButton} onPress={() => setStoryStickerTextScale((value) => clampStickerScale(value + 0.1))}>
              <Text style={styles.scaleButtonText}>A+</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.stickerScaleRow}>
            <TouchableOpacity style={styles.scaleButton} onPress={() => setStoryStickerTextRotation((value) => clampStickerRotation(value - 15))}>
              <Text style={styles.scaleButtonText}>↺</Text>
            </TouchableOpacity>
            <Text style={styles.scaleValueText}>Text angle {storyStickerTextRotation}deg</Text>
            <TouchableOpacity style={styles.scaleButton} onPress={() => setStoryStickerTextRotation((value) => clampStickerRotation(value + 15))}>
              <Text style={styles.scaleButtonText}>↻</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}

      <Text style={styles.sectionLabel}>Emoji sticker</Text>
      <TextInput
        style={styles.inputSingle}
        value={storyStickerEmoji}
        onChangeText={setStoryStickerEmoji}
        placeholder="✨"
        maxLength={16}
      />
      {storyStickerEmoji.trim() ? (
        <>
          <View style={styles.modeRow}>
            {storyStickerPlacements.map((placement) => (
              <TouchableOpacity
                key={`emoji-${placement}`}
                style={[styles.pill, storyStickerEmojiPlacement === placement && styles.pillActive]}
                onPress={() => {
                  setStoryStickerEmojiPlacement(placement);
                  setStoryStickerEmojiPosition(storyStickerPresetPositions[placement]);
                }}
              >
                <Text style={[styles.pillText, storyStickerEmojiPlacement === placement && styles.pillTextActive]}>
                  {storyStickerPlacementLabels[placement]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.stickerScaleRow}>
            <TouchableOpacity style={styles.scaleButton} onPress={() => setStoryStickerEmojiScale((value) => clampStickerScale(value - 0.1))}>
              <Text style={styles.scaleButtonText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.scaleValueText}>Emoji size {storyStickerEmojiScale.toFixed(1)}x</Text>
            <TouchableOpacity style={styles.scaleButton} onPress={() => setStoryStickerEmojiScale((value) => clampStickerScale(value + 0.1))}>
              <Text style={styles.scaleButtonText}>+</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.stickerScaleRow}>
            <TouchableOpacity style={styles.scaleButton} onPress={() => setStoryStickerEmojiRotation((value) => clampStickerRotation(value - 15))}>
              <Text style={styles.scaleButtonText}>↺</Text>
            </TouchableOpacity>
            <Text style={styles.scaleValueText}>Emoji angle {storyStickerEmojiRotation}deg</Text>
            <TouchableOpacity style={styles.scaleButton} onPress={() => setStoryStickerEmojiRotation((value) => clampStickerRotation(value + 15))}>
              <Text style={styles.scaleButtonText}>↻</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}

      <View style={styles.switchRow}><Text style={styles.switchLabel}>Allow replies</Text><Switch value={storyAllowReplies} onValueChange={setStoryAllowReplies} /></View>
      <View style={styles.switchRow}><Text style={styles.switchLabel}>Allow sharing</Text><Switch value={storyAllowSharing} onValueChange={setStoryAllowSharing} /></View>

      <Text style={styles.helperText}>
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
      <TextInput style={[styles.inputSingle, inputStyle]} value={location} onChangeText={setLocation} placeholder="Add location" placeholderTextColor={colors.mutedText} maxLength={limits.location} />

      <Text style={[styles.sectionLabel, { color: colors.text }]}>Hashtags</Text>
      <TextInput style={[styles.inputSingle, inputStyle]} value={hashtagsRaw} onChangeText={setHashtagsRaw} placeholder="fitlife, travel" placeholderTextColor={colors.mutedText} />

      <Text style={[styles.sectionLabel, { color: colors.text }]}>Mentions</Text>
      <TextInput style={[styles.inputSingle, inputStyle]} value={mentionsRaw} onChangeText={setMentionsRaw} placeholder="alice, bob" placeholderTextColor={colors.mutedText} />

      <Text style={[styles.helperText, helperTextStyle]}>Swipes require a single short-form video. The backend will create a thumbnail automatically.</Text>
    </>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.container} behavior="padding">
        <View style={[styles.header, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Advanced Create</Text>
        </View>

        <View style={styles.tabsRow}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabButton,
                { borderColor: colors.border, backgroundColor: surfaceColor },
                activeTab === tab && [styles.tabButtonActive, activePillStyle],
              ]}
              onPress={() => onSelectTab(tab)}
            >
              <Text style={[styles.tabText, { color: activeTab === tab ? "#fff" : colors.mutedText }, activeTab === tab && styles.tabTextActive]}>
                {tab.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
          {renderMediaPreview()}

          {!(activeTab === "story" && storyType === "text") ? (
            <>
              <View style={styles.mediaSectionHeader}>
                <Text style={[styles.sectionLabel, { color: colors.text }]}>Media</Text>
                <View style={styles.mediaActionsRow}>
                  <TouchableOpacity
                    style={[styles.secondaryPickButton, { backgroundColor: subtleSurfaceColor, borderColor: colors.border }]}
                    disabled={pickingMedia}
                    onPress={onCaptureMedia}
                  >
                    <Icon name="camera-outline" size={18} color={colors.text} />
                    <Text style={[styles.secondaryPickButtonText, { color: colors.text }]}>Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.pickButton, { backgroundColor: colors.primary }]} disabled={pickingMedia} onPress={onPickMedia}>
                    {pickingMedia ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="images-outline" size={18} color="#fff" />}
                    <Text style={styles.pickButtonText}>{selectedAssets.length ? "Replace" : "Choose"}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {renderSelectedAssets()}
            </>
          ) : null}

          {activeTab === "post" ? renderPostControls() : null}
          {activeTab === "story" ? renderStoryControls() : null}
          {activeTab === "swipe" ? renderSwipeControls() : null}

          <TouchableOpacity
            style={[styles.publishButton, { backgroundColor: colors.primary }, publishing && styles.publishButtonDisabled]}
            onPress={publish}
            disabled={publishing}
          >
            <Icon name="cloud-upload-outline" size={18} color="#fff" />
            <Text style={styles.publishText}>
              {publishing ? "Publishing..." : `Publish ${activeTab}`}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    paddingTop: 44,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  headerTitle: { fontSize: 24, fontWeight: "800", color: "#171717" },
  mediaActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  secondaryPickButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 32 },
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
    height: 250,
    borderRadius: 18,
    backgroundColor: "#efefef",
  },
  storyPreviewFrame: {
    width: "100%",
    height: 250,
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
  },
  emptyPreview: {
    height: 250,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 24,
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
    minHeight: 250,
    borderRadius: 18,
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
    paddingHorizontal: 14,
    height: 38,
  },
  pickButtonText: { color: "#fff", fontWeight: "700" },
  assetRow: { paddingTop: 12, paddingBottom: 4 },
  assetChip: { marginRight: 10, position: "relative" },
  assetThumb: { width: 76, height: 76, borderRadius: 14, backgroundColor: "#e5e7eb" },
  assetThumbVideo: { justifyContent: "center", alignItems: "center", backgroundColor: "#111827" },
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
  counter: { marginTop: 6, color: "#666", fontSize: 12 },
  switchRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  switchLabel: { color: "#222", fontWeight: "600" },
  helperText: { marginTop: 10, color: "#6b7280", lineHeight: 20 },
  publishButton: {
    marginTop: 26,
    borderRadius: 16,
    backgroundColor: "#111827",
    minHeight: 52,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  publishButtonDisabled: { opacity: 0.7 },
  publishText: { color: "#fff", fontWeight: "800", fontSize: 15 },
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
