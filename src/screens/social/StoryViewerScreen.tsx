import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Alert } from "../../utils/appAlert";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import LinearGradient from "react-native-linear-gradient";
import Icon from "react-native-vector-icons/Ionicons";

import ContentActionSheet from "../../features/social/components/ContentActionSheet";
import ProgressiveImage from "../../features/social/components/ProgressiveImage";
import SocialVideo from "../../features/social/components/SocialVideo";
import StoryActivitySheet from "../../features/social/components/StoryActivitySheet";
import { stopAllSegmentedMusicPlayback, useSegmentedMusicPlayback, useSegmentedMusicWarmup } from "../../hooks/useSegmentedMusicPlayback";
import { socialApi } from "../../features/social/socialApi";
import { Story, StoryFilterPreset } from "../../features/social/types";
import { toUserSafeMessage } from "../../features/social/validation";
import { DEFAULT_AVATAR_URL } from "../../constants/defaultAssets";
import { createChatConversation, sendChatMessage } from "../../utils/chatApi";
import { buildSharedStoryMessage } from "../../utils/chatPresentation";
import { normalizeMediaUrl } from "../../utils/mediaUrls";
import { resolveMentionUserId } from "../../utils/mentionLinks";

const DEFAULT_STORY_MS = 5000;
const TEXT_STORY_MS = 7000;
const QUICK_REACTIONS = ["❤️", "🔥", "😍", "👏", "😮"];

const formatAgo = (timestamp: number): string => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "now";

  const mins = Math.max(1, Math.floor((Date.now() - timestamp) / (1000 * 60)));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const getStoryDuration = (story: Story | undefined): number => {
  if (!story) {
    return DEFAULT_STORY_MS;
  }

  if (story.media?.mediaType === "video" && typeof story.media?.durationMs === "number" && story.media.durationMs > 0) {
    return Math.min(Math.max(story.media.durationMs, 1000), 60000);
  }

  return story.type === "text" ? TEXT_STORY_MS : DEFAULT_STORY_MS;
};

const getTrimmedMusicDurationMs = (
  music?: { duration?: number; startTime?: number; endTime?: number },
): number => {
  const maxClipMs = 30000;
  const explicitDurationMs = Math.max(0, Number(music?.duration || 0) * 1000);
  if (explicitDurationMs > 0) {
    return Math.min(maxClipMs, explicitDurationMs);
  }

  const startMs = Math.max(0, Number(music?.startTime || 0) * 1000);
  const endMs = Math.max(0, Number(music?.endTime || 0) * 1000);
  return endMs > startMs ? Math.min(maxClipMs, endMs - startMs) : 0;
};

const isSyncedStoryId = (storyId: string | undefined): boolean =>
  typeof storyId === "string" && /^[a-fA-F0-9]{24}$/.test(storyId);

const getStoryFilterOverlayStyle = (
  preset: StoryFilterPreset | undefined,
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

const getMusicPlaybackUrl = (music?: Story["music"]): string =>
  String(music?.audioUrl || music?.streamUrl || music?.previewUrl || "").trim();

function StoryViewerScreen({ route, navigation }: any) {
  const storyId = typeof route?.params?.storyId === "string" ? route.params.storyId : "";
  const storyUserId = typeof route?.params?.storyUserId === "string" ? route.params.storyUserId : undefined;
  const isScreenFocused = useIsFocused();
  const insets = useSafeAreaInsets();

  const [stories, setStories] = useState<Story[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [replyText, setReplyText] = useState("");
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [isReplyInputFocused, setIsReplyInputFocused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [liking, setLiking] = useState(false);
  const [busyPollVote, setBusyPollVote] = useState(false);
  const [busyReply, setBusyReply] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showOwnerActivity, setShowOwnerActivity] = useState(false);
  const [ownerActivityTab, setOwnerActivityTab] = useState<"views" | "likes" | "replies">("views");
  const [loadError, setLoadError] = useState("This story may have expired or is no longer visible to you.");
  const [isMusicEnabled, setIsMusicEnabled] = useState(true);
  const [showLikeBurst, setShowLikeBurst] = useState(false);
  const replyInputRef = useRef<TextInput | null>(null);
  const storyTapRef = useRef<{ time: number; timeout: ReturnType<typeof setTimeout> | null }>({
    time: 0,
    timeout: null,
  });
  const replyPauseBeforeFocusRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        if (!storyId) {
          throw new Error("Invalid story id");
        }

        const data = await socialApi.getStorySequence(storyId, { storyUserId });
        if (!data.stories.length || !data.stories[data.startIndex]) {
          throw new Error("Story not found or no longer available.");
        }
        if (mounted) {
          setStories(data.stories);
          setActiveIndex(data.startIndex);
          setLoadError("This story may have expired or is no longer visible to you.");
        }
      } catch (error) {
        if (mounted) {
          setLoadError(toUserSafeMessage(error));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [storyId, storyUserId]);

  const currentStory = useMemo(() => stories[activeIndex], [stories, activeIndex]);
  const nextStory = useMemo(() => stories[activeIndex + 1] || null, [activeIndex, stories]);
  const storyDuration = useMemo(() => getStoryDuration(currentStory), [currentStory]);
  const canReplyToCurrentStory = !!currentStory && currentStory.allowReplies !== false;
  const canAccessOwnerTools = !!currentStory?.isOwner && isSyncedStoryId(currentStory?.id);
  const storyMusicRawUrl = useMemo(() => getMusicPlaybackUrl(currentStory?.music), [currentStory?.music]);
  const storyMusicUrl = useMemo(
    () => normalizeMediaUrl(storyMusicRawUrl),
    [storyMusicRawUrl],
  );
  const storyMusicStartMs = Math.max(0, Number(currentStory?.music?.startTime || 0) * 1000);
  const storyMusicDurationMs = getTrimmedMusicDurationMs(currentStory?.music);
  const storyMusicTrackKey = currentStory
    ? `${currentStory.id}:${storyMusicUrl}:${storyMusicStartMs}:${storyMusicDurationMs}`
    : "";
  const hasStoryAttachedMusic = !!storyMusicUrl;
  const shouldPlayStoryMusic = hasStoryAttachedMusic
    && isMusicEnabled
    && !paused
    && !isReplyInputFocused
    && !showActions
    && !showOwnerActivity
    && isScreenFocused;
  useSegmentedMusicPlayback({
    rawUrl: storyMusicRawUrl,
    normalizedUrl: storyMusicUrl,
    trackKey: storyMusicTrackKey,
    startMs: storyMusicStartMs,
    durationMs: storyMusicDurationMs,
    shouldPlay: shouldPlayStoryMusic,
    pauseWhenInactive: true,
  });
  const nextStoryMusicRawUrl = useMemo(() => getMusicPlaybackUrl(nextStory?.music), [nextStory?.music]);
  const nextStoryMusicUrl = useMemo(
    () => normalizeMediaUrl(nextStoryMusicRawUrl),
    [nextStoryMusicRawUrl],
  );
  const nextStoryMusicStartMs = Math.max(0, Number(nextStory?.music?.startTime || 0) * 1000);
  const nextStoryMusicDurationMs = getTrimmedMusicDurationMs(nextStory?.music);
  const nextStoryMusicTrackKey = nextStory
    ? `${nextStory.id}:${nextStoryMusicUrl}:${nextStoryMusicStartMs}:${nextStoryMusicDurationMs}`
    : "";
  useSegmentedMusicWarmup({
    rawUrl: nextStoryMusicRawUrl,
    normalizedUrl: nextStoryMusicUrl,
    trackKey: nextStoryMusicTrackKey,
    enabled: isMusicEnabled && isScreenFocused && !!nextStoryMusicUrl,
  });

  useFocusEffect(
    useCallback(() => {
      return () => {
        stopAllSegmentedMusicPlayback();
      };
    }, []),
  );

  useEffect(() => {
    setProgress(0);
    setReplyText("");
  }, [activeIndex]);

  useEffect(() => {
    if (!currentStory) {
      return;
    }

    const markSeen = async () => {
      try {
        const updated = await socialApi.markStoryViewed(currentStory.id);
        setStories((prevStories) =>
          prevStories.map((story) => (story.id === updated.id ? updated : story)),
        );
      } catch {
        // Non-blocking.
      }
    };

    markSeen();
  }, [currentStory]);

  useEffect(() => {
    if (!currentStory || paused) {
      return;
    }

    const tick = 100 / storyDuration;
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 1) {
          return 1;
        }

        return Math.min(1, prev + tick);
      });
    }, 100);

    return () => clearInterval(timer);
  }, [currentStory, paused, storyDuration]);

  useEffect(() => {
    return () => {
      if (storyTapRef.current.timeout) {
        clearTimeout(storyTapRef.current.timeout);
      }
      stopAllSegmentedMusicPlayback();
    };
  }, []);

  useEffect(() => {
    if (!currentStory || paused || progress < 1) {
      return;
    }

    if (activeIndex >= stories.length - 1) {
      stopAllSegmentedMusicPlayback();
      navigation.goBack();
      return;
    }

    setActiveIndex((prev) => prev + 1);
  }, [activeIndex, currentStory, navigation, paused, progress, stories.length]);

  useEffect(() => {
    if (isReplyInputFocused) {
      stopAllSegmentedMusicPlayback();
    }
  }, [isReplyInputFocused]);

  const closeStoryViewer = useCallback(() => {
    stopAllSegmentedMusicPlayback();
    navigation.goBack();
  }, [navigation]);

  const next = () => {
    if (activeIndex >= stories.length - 1) {
      closeStoryViewer();
      return;
    }

    setActiveIndex((prev) => prev + 1);
  };

  const prev = () => {
    if (activeIndex <= 0) {
      return;
    }

    setActiveIndex((prevIndex) => prevIndex - 1);
  };

  const sendStoryInteractionToChat = useCallback(
    async ({ action, replyText: interactionReplyText }: { action: "like" | "reply"; replyText?: string }) => {
      if (!currentStory || currentStory.isOwner) {
        return;
      }

      const receiverId = String(currentStory.user?.id || "").trim();
      if (!receiverId) {
        return;
      }

      try {
        const conversation = await createChatConversation({
          receiverId,
          conversationType: "direct",
        });
        const conversationId = String(conversation?.conversation?._id || "").trim();

        if (!conversationId) {
          throw new Error("Could not open a conversation for this story.");
        }

        await sendChatMessage({
          conversationId,
          text: buildSharedStoryMessage(currentStory, { action, replyText: interactionReplyText }),
        });
      } catch (error) {
        console.log("story interaction chat send error", error);
      }
    },
    [currentStory],
  );

  const toggleLike = useCallback(async () => {
    if (!currentStory || liking || currentStory.liked) {
      return;
    }

    try {
      setLiking(true);
      const updated = await socialApi.toggleStoryLike(currentStory.id);
      setStories((prevStories) => prevStories.map((story) => (story.id === updated.id ? updated : story)));
      if (updated?.liked) {
        await sendStoryInteractionToChat({ action: "like" });
      }
    } catch (error) {
      Alert.alert("Could not update story", toUserSafeMessage(error));
    } finally {
      setLiking(false);
    }
  }, [currentStory, liking, sendStoryInteractionToChat]);

  const triggerStoryLikeBurst = useCallback(() => {
    setShowLikeBurst(true);
    setTimeout(() => {
      setShowLikeBurst(false);
    }, 720);
  }, []);

  const handleStoryCenterTap = useCallback(() => {
    const now = Date.now();
    const lastTap = storyTapRef.current;

    if (now - lastTap.time < 260) {
      if (lastTap.timeout) {
        clearTimeout(lastTap.timeout);
      }
      storyTapRef.current = { time: 0, timeout: null };
      triggerStoryLikeBurst();
      toggleLike().catch(() => undefined);
      return;
    }

    const timeout = setTimeout(() => {
      setIsMusicEnabled((current) => !current);
      storyTapRef.current = { time: 0, timeout: null };
    }, 260);

    storyTapRef.current = {
      time: now,
      timeout,
    };
  }, [toggleLike, triggerStoryLikeBurst]);

  const votePoll = async (optionIndex: 0 | 1) => {
    if (!currentStory || busyPollVote) {
      return;
    }

    try {
      setBusyPollVote(true);
      const updated = await socialApi.voteStoryPoll(currentStory.id, optionIndex);
      setStories((prevStories) => prevStories.map((story) => (story.id === updated.id ? updated : story)));
    } catch (error) {
      Alert.alert("Could not vote", toUserSafeMessage(error));
    } finally {
      setBusyPollVote(false);
    }
  };

  const sendReply = async (rawText: string) => {
    if (!currentStory || busyReply || !canReplyToCurrentStory || !rawText.trim()) {
      return;
    }

    try {
      setBusyReply(true);
      const normalizedReply = rawText.trim();
      await socialApi.replyToStory(currentStory.id, normalizedReply);
      setReplyText("");
      setStories((prevStories) =>
        prevStories.map((story) =>
          story.id === currentStory.id
            ? {
                ...story,
                replyCount: (story.replyCount || 0) + 1,
                question: story.question
                  ? { ...story.question, responseCount: story.question.responseCount + 1 }
                  : undefined,
              }
            : story,
        ),
      );
      await sendStoryInteractionToChat({ action: "reply", replyText: normalizedReply });
      Alert.alert("Sent", "Reply sent.");
    } catch (error) {
      Alert.alert("Could not send reply", toUserSafeMessage(error));
    } finally {
      setBusyReply(false);
    }
  };

  const openReplyThread = () => {
    if (!currentStory) {
      return;
    }

    setOwnerActivityTab("replies");
    setShowOwnerActivity(true);
  };

  const pauseForReplyInput = () => {
    replyPauseBeforeFocusRef.current = paused;
    setPaused(true);
    setIsReplyInputFocused(true);
    stopAllSegmentedMusicPlayback();
  };

  const focusReplyInput = () => {
    pauseForReplyInput();
    replyInputRef.current?.focus();
  };

  const handleReplyInputBlur = () => {
    setIsReplyInputFocused(false);
    setPaused(replyPauseBeforeFocusRef.current);
  };

  const openStoryLink = async () => {
    if (!currentStory?.linkUrl) {
      return;
    }

    try {
      const supported = await Linking.canOpenURL(currentStory.linkUrl);
      if (!supported) {
        throw new Error("This link could not be opened on your device.");
      }
      await Linking.openURL(currentStory.linkUrl);
    } catch (error) {
      Alert.alert("Could not open link", toUserSafeMessage(error));
    }
  };

  const openStoryLocation = async () => {
    if (!currentStory?.location) {
      return;
    }

    const query = encodeURIComponent(currentStory.location);
    const url = `https://www.google.com/maps/search/?api=1&query=${query}`;

    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        throw new Error("This location could not be opened on your device.");
      }
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert("Could not open location", toUserSafeMessage(error));
    }
  };

  const openStoryHashtag = (tag: string) => {
    const normalizedTag = String(tag || "").replace(/^#/, "").trim();
    if (!normalizedTag) {
      return;
    }

    navigation.navigate("HashtagResultsScreen", { hashtag: normalizedTag });
  };

  const openStoryMention = async (userId?: string, username?: string) => {
    const resolvedUserId = String(userId || "").trim() || (await resolveMentionUserId(username || ""));
    if (!resolvedUserId) {
      Alert.alert("Profile unavailable", "This profile could not be opened right now.");
      return;
    }

    navigation.navigate("ProfilePreviewScreen", { userId: resolvedUserId });
  };

  const openOwnerActivity = (tab: "views" | "likes" | "replies") => {
    setOwnerActivityTab(tab);
    setShowOwnerActivity(true);
  };

  const archiveCurrentStory = () => {
    if (!currentStory || !currentStory.isOwner || archiving) {
      return;
    }

    Alert.alert("Archive story", "This story will move to your archive.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Archive",
        onPress: async () => {
          try {
            setArchiving(true);
            await socialApi.archiveStory(currentStory.id);
            navigation.navigate("StoryArchive");
          } catch (error) {
            Alert.alert("Could not archive story", toUserSafeMessage(error));
          } finally {
            setArchiving(false);
          }
        },
      },
    ]);
  };

  const renderStoryBody = () => {
    if (!currentStory) {
      return null;
    }

    if (currentStory.type === "text") {
      return (
        <LinearGradient
          colors={[currentStory.backgroundColor || "#1f2937", "#0f172a", "#020617"]}
          style={styles.textStoryWrap}
        >
          <Text style={styles.textStoryContent}>{currentStory.text}</Text>
        </LinearGradient>
      );
    }

    if (currentStory.media?.mediaType === "video") {
      if (!currentStory.media?.url) {
        return <View style={[styles.storyImage, styles.storyFallback]} />;
      }

      return (
        <View style={styles.storyImage}>
          <SocialVideo
            uri={normalizeMediaUrl(currentStory.media?.url)}
            posterUri={normalizeMediaUrl(currentStory.media?.thumbnailUrl || "")}
            style={styles.storyImage}
            paused={paused || isReplyInputFocused || showActions || showOwnerActivity || !isScreenFocused}
            muted={!isScreenFocused || !isMusicEnabled || hasStoryAttachedMusic}
            onEnd={next}
            contentBlurRadius={currentStory.media?.sensitiveContent?.isSensitive ? 22 : 0}
          />
          {currentStory.media?.sensitiveContent?.isSensitive ? (
            <View style={styles.sensitiveBadge}>
              <Text style={styles.sensitiveBadgeText}>
                {currentStory.media.sensitiveContent.label ? `${currentStory.media.sensitiveContent.label} sensitive content` : "Sensitive content"}
              </Text>
            </View>
          ) : null}
        </View>
      );
    }

    const imageUri = normalizeMediaUrl(currentStory.media?.url || currentStory.media?.thumbnailUrl);
    const previewUri = normalizeMediaUrl(currentStory.media?.thumbnailUrl || currentStory.media?.url);
    return imageUri ? (
      <View style={styles.storyImage}>
        <ProgressiveImage
          uri={imageUri}
          previewUri={previewUri}
          style={styles.storyImage}
          contentBlurRadius={currentStory.media?.sensitiveContent?.isSensitive ? 22 : 0}
        />
        {currentStory.media?.sensitiveContent?.isSensitive ? (
          <View style={styles.sensitiveBadge}>
            <Text style={styles.sensitiveBadgeText}>
              {currentStory.media.sensitiveContent.label ? `${currentStory.media.sensitiveContent.label} sensitive content` : "Sensitive content"}
            </Text>
          </View>
        ) : null}
      </View>
    ) : (
      <View style={[styles.storyImage, styles.storyFallback]} />
    );
  };

  const renderStoryOverlay = () => {
    if (!currentStory) {
      return null;
    }

    if (currentStory.type === "poll" && currentStory.poll) {
      const totalVotes = currentStory.poll.votes[0] + currentStory.poll.votes[1] || 1;
      const ratioA = Math.round((currentStory.poll.votes[0] / totalVotes) * 100);
      const ratioB = 100 - ratioA;

      return (
        <View style={styles.stickerBlock}>
          <Text style={styles.stickerTitle}>{currentStory.poll.question}</Text>
          <TouchableOpacity style={styles.pollOption} onPress={() => votePoll(0)}>
            <Text style={styles.pollText}>{currentStory.poll.options[0]}</Text>
            <Text style={styles.pollPercent}>{ratioA}%</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pollOption} onPress={() => votePoll(1)}>
            <Text style={styles.pollText}>{currentStory.poll.options[1]}</Text>
            <Text style={styles.pollPercent}>{ratioB}%</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (currentStory.type === "question" && currentStory.question) {
      return (
        <View style={styles.stickerBlock}>
          <Text style={styles.stickerTitle}>{currentStory.question.prompt}</Text>
          <Text style={styles.stickerSub}>{currentStory.question.responseCount} replies so far</Text>
        </View>
      );
    }

    return null;
  };

  const renderFloatingStickers = () => {
    if (!currentStory?.stickers.length) {
      return null;
    }

    return (
      <View pointerEvents="none" style={styles.floatingStickerLayer}>
        {currentStory.stickers.map((sticker) => {
          const baseStyle = {
            left: `${Math.max(0, Math.min(1, sticker.position.x)) * 100}%`,
            top: `${Math.max(0, Math.min(1, sticker.position.y)) * 100}%`,
            width: `${Math.max(0.12, Math.min(1, sticker.position.width)) * 100}%`,
            minHeight: `${Math.max(0.08, Math.min(1, sticker.position.height)) * 100}%`,
            transform: [
              { rotate: `${sticker.position.rotation || 0}deg` },
              { scale: sticker.position.scale || 1 },
            ],
          } as const;

          if (sticker.type === "emoji") {
            return (
              <View key={sticker.id} style={[styles.floatingEmojiSticker, baseStyle]}>
                <Text
                  style={[
                    styles.floatingEmojiText,
                    sticker.style?.fontSize ? { fontSize: sticker.style.fontSize } : null,
                  ]}
                >
                  {sticker.text}
                </Text>
              </View>
            );
          }

          if (sticker.type === "image" && sticker.mediaUrl) {
            return (
              <View key={sticker.id} style={[styles.floatingImageSticker, baseStyle]}>
                <Image source={{ uri: sticker.mediaUrl }} style={styles.floatingImageAsset} resizeMode="contain" />
              </View>
            );
          }

          return (
            <View
              key={sticker.id}
              style={[
                styles.floatingTextSticker,
                baseStyle,
                sticker.style?.backgroundColor ? { backgroundColor: sticker.style.backgroundColor } : null,
              ]}
            >
              <Text
                style={[
                  styles.floatingTextStickerText,
                  sticker.style?.color ? { color: sticker.style.color } : null,
                  sticker.style?.fontSize ? { fontSize: sticker.style.fontSize } : null,
                  sticker.style?.alignment ? { textAlign: sticker.style.alignment } : null,
                ]}
              >
                {sticker.text}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  const renderStoryFilterOverlay = () => {
    if (!currentStory?.media) {
      return null;
    }

    const filterStyle = getStoryFilterOverlayStyle(currentStory.filterPreset, currentStory.filterIntensity);
    if (!filterStyle) {
      return null;
    }

    return (
      <View
        pointerEvents="none"
        style={[
          styles.storyFilterOverlay,
          {
            backgroundColor: filterStyle.backgroundColor,
            opacity: filterStyle.opacity,
          },
        ]}
      />
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (!currentStory) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.unavailableTitle}>Story unavailable</Text>
        <Text style={styles.unavailableText}>{loadError}</Text>
        <TouchableOpacity style={styles.unavailableButton} onPress={closeStoryViewer}>
          <Text style={styles.unavailableButtonText}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {renderStoryBody()}
      {renderStoryFilterOverlay()}
      {renderFloatingStickers()}
      <LinearGradient colors={["rgba(0,0,0,0.72)", "rgba(0,0,0,0.15)", "transparent"]} style={styles.topFade} />
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.2)", "rgba(0,0,0,0.82)"]} style={styles.bottomFade} />

      <View style={styles.progressRow}>
        {stories.map((story, index) => {
          const fill =
            index < activeIndex ? 1 : index === activeIndex ? progress : 0;

          return (
            <View key={story.id} style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${fill * 100}%` }]} />
            </View>
          );
        })}
      </View>

      <View style={styles.header}>
        <Image source={{ uri: currentStory.user.avatarUrl || DEFAULT_AVATAR_URL }} style={styles.avatar} />
        <View style={styles.headerMeta}>
          <View style={styles.headerUserRow}>
            <Text style={styles.username}>@{currentStory.user.username}</Text>
            {currentStory.visibility === "close_friends" ? <Text style={styles.closeFriendsBadge}>Close friends</Text> : null}
          </View>
          <Text style={styles.storyMetaLine}>{formatAgo(currentStory.createdAt)} • {currentStory.type}</Text>
        </View>

        {canAccessOwnerTools ? (
          <TouchableOpacity style={styles.iconButton} onPress={() => openOwnerActivity("views")}>
            <Icon name="stats-chart-outline" size={22} color="#fff" />
          </TouchableOpacity>
        ) : !currentStory.isOwner ? (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setShowActions(true)}
          >
            <Icon name="ellipsis-horizontal" size={22} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconButtonSpacer} />
        )}

        {hasStoryAttachedMusic ? (
          <TouchableOpacity style={styles.iconButton} onPress={() => setIsMusicEnabled((current) => !current)}>
            <Icon
              name={isMusicEnabled ? "volume-high-outline" : "volume-mute-outline"}
              size={22}
              color="#fff"
            />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={styles.closeButton} onPress={closeStoryViewer}>
          <Icon name="close" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.floatingMeta}>
        {currentStory.music?.trackName ? (
          <View style={styles.metaChip}>
            <Icon name="musical-notes-outline" size={14} color="#fff" />
            <Text style={styles.metaChipText}>
              {currentStory.music.trackName}
              {currentStory.music.artistName ? ` • ${currentStory.music.artistName}` : ""}
            </Text>
          </View>
        ) : null}
        {currentStory.linkUrl ? (
          <TouchableOpacity style={styles.metaChip} onPress={openStoryLink}>
            <Icon name="link-outline" size={14} color="#fff" />
            <Text style={styles.metaChipText}>Tap link available</Text>
          </TouchableOpacity>
        ) : null}
        {currentStory.location ? (
          <TouchableOpacity style={styles.metaChip} onPress={openStoryLocation}>
            <Icon name="location-outline" size={14} color="#fff" />
            <Text style={styles.metaChipText}>{currentStory.location}</Text>
          </TouchableOpacity>
        ) : null}
        {currentStory.hashtags.slice(0, 2).map((tag) => (
          <TouchableOpacity key={`story-tag-${tag}`} style={styles.metaChip} onPress={() => openStoryHashtag(tag)}>
            <Icon name="pricetag-outline" size={14} color="#fff" />
            <Text style={styles.metaChipText}>#{tag}</Text>
          </TouchableOpacity>
        ))}
        {(currentStory.mentionTargets && currentStory.mentionTargets.length
          ? currentStory.mentionTargets
          : currentStory.mentions.map((mention) => ({ id: undefined, username: mention })))
          .slice(0, 2)
          .map((mention) => {
            const content = (
              <>
                <Icon name="at-outline" size={14} color="#fff" />
                <Text style={styles.metaChipText}>@{mention.username}</Text>
              </>
            );

            return (
              <TouchableOpacity
                key={`story-mention-${mention.id || mention.username}-${mention.username}`}
                style={styles.metaChip}
                onPress={() => {
                  openStoryMention(mention.id, mention.username).catch(() => undefined);
                }}
              >
                {content}
              </TouchableOpacity>
            );
          })}
      </View>

      {showLikeBurst ? (
        <View pointerEvents="none" style={styles.likeBurstOverlay}>
          <Icon name="heart" size={92} color="rgba(255,255,255,0.92)" />
        </View>
      ) : null}

      {(hasStoryAttachedMusic || currentStory.media?.mediaType === "video") ? (
        <View style={styles.mediaSoundHint}>
          <Icon name={isMusicEnabled ? "volume-high-outline" : "volume-mute-outline"} size={16} color="#fff" />
          <Text style={styles.mediaSoundHintText}>{isMusicEnabled ? "Sound on" : "Muted"}</Text>
        </View>
      ) : null}

      <Pressable
        style={styles.leftTouch}
        onPress={prev}
        onPressIn={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
      />
      <Pressable
        style={styles.rightTouch}
        onPress={next}
        onPressIn={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
      />
      <Pressable
        style={styles.centerTouch}
        onPress={handleStoryCenterTap}
        onPressIn={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
      />

      <View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom + 34, 58) }]}>
        {renderStoryOverlay()}

        {!currentStory.isOwner && canReplyToCurrentStory ? (
          <View style={styles.quickReactionRow}>
            {QUICK_REACTIONS.map((emoji) => (
              <TouchableOpacity key={emoji} style={styles.emojiChip} onPress={() => sendReply(emoji)}>
                <Text style={styles.emojiText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {currentStory.isOwner ? (
          <View style={styles.ownerPanel}>
            {canAccessOwnerTools ? (
              <>
                <TouchableOpacity style={styles.ownerMetric} onPress={() => openOwnerActivity("views")}>
                  <Icon name="eye-outline" size={18} color="#fff" />
                  <Text style={styles.ownerMetricText}>{currentStory.viewCount || 0} views</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ownerMetric} onPress={openReplyThread}>
                  <Icon name="chatbubble-ellipses-outline" size={18} color="#fff" />
                  <Text style={styles.ownerMetricText}>{currentStory.replyCount || 0} replies</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ownerMetric} onPress={archiveCurrentStory}>
                  <Icon name="archive-outline" size={18} color="#fff" />
                  <Text style={styles.ownerMetricText}>{archiving ? "Archiving..." : "Archive"}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.ownerHint}>Owner tools are unavailable until this story syncs.</Text>
            )}
          </View>
        ) : (
          <View style={styles.bottomBar}>
            <TextInput
              ref={replyInputRef}
              style={[styles.replyInput, currentStory.allowReplies === false && styles.replyInputDisabled]}
              placeholder={currentStory.allowReplies === false ? "Replies turned off" : "Reply to story"}
              placeholderTextColor="#a7a7a7"
              value={replyText}
              onChangeText={setReplyText}
              onFocus={pauseForReplyInput}
              onBlur={handleReplyInputBlur}
              editable={currentStory.allowReplies !== false}
            />

            <TouchableOpacity style={styles.bottomIcon} onPress={toggleLike}>
              <Icon
                name={currentStory.liked ? "heart" : "heart-outline"}
                size={24}
                color={currentStory.liked ? "#ff4e77" : "#fff"}
              />
            </TouchableOpacity>

            <TouchableOpacity style={styles.bottomIcon} onPress={focusReplyInput}>
              <Icon name="chatbubble-outline" size={22} color="#fff" />
            </TouchableOpacity>

            {currentStory.allowSharing !== false ? (
              <TouchableOpacity
                style={styles.bottomIcon}
                onPress={() => {
                  stopAllSegmentedMusicPlayback();
                  navigation.navigate("MainApp", {
                    screen: "Create",
                    params: {
                      initialTab: "story",
                      initialMedia: currentStory.media?.url,
                      initialMediaType: currentStory.media?.mediaType,
                    },
                  });
                }}
              >
                <Icon name="paper-plane-outline" size={24} color="#fff" />
              </TouchableOpacity>
            ) : null}

            {currentStory.allowReplies !== false ? (
              <TouchableOpacity style={styles.bottomIcon} onPress={() => sendReply(replyText)}>
                <Icon name="send" size={22} color="#fff" />
              </TouchableOpacity>
            ) : (
              <Text style={styles.repliesDisabledText}>Replies off</Text>
            )}
          </View>
        )}
      </View>

      {!currentStory.isOwner ? (
        <ContentActionSheet
          visible={showActions}
          contentType="story"
          contentId={currentStory.id}
          userId={currentStory.user.id}
          userLabel={currentStory.user.username}
          title="Story options"
          onClose={() => setShowActions(false)}
          onActionComplete={(action) => {
            if (action === "not_interested" || action === "mute" || action === "block") {
              closeStoryViewer();
            }
          }}
        />
      ) : null}

      {canAccessOwnerTools ? (
        <StoryActivitySheet
          visible={showOwnerActivity}
          storyId={currentStory.id}
          initialTab={ownerActivityTab}
          onClose={() => setShowOwnerActivity(false)}
          onStoryUpdate={(updatedStory) =>
            setStories((prevStories) => prevStories.map((story) => (story.id === updatedStory.id ? updatedStory : story)))
          }
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  centered: { flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" },
  unavailableTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
  unavailableText: {
    color: "#d1d5db",
    marginTop: 10,
    textAlign: "center",
    paddingHorizontal: 28,
    lineHeight: 20,
  },
  unavailableButton: {
    marginTop: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#fff",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  unavailableButtonText: { color: "#fff", fontWeight: "700" },
  storyImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  storyFallback: { backgroundColor: "#111827" },
  sensitiveBadge: {
    position: "absolute",
    left: 16,
    bottom: 18,
    backgroundColor: "rgba(15,23,42,0.82)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  sensitiveBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  topFade: { ...StyleSheet.absoluteFillObject, height: 220 },
  bottomFade: { ...StyleSheet.absoluteFillObject, top: undefined, height: 340, bottom: 0 },
  textStoryWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  textStoryContent: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 42,
    letterSpacing: -0.7,
    textShadowColor: "rgba(0,0,0,0.24)",
    textShadowRadius: 18,
  },
  floatingStickerLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  storyFilterOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  floatingEmojiSticker: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  floatingImageSticker: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  floatingImageAsset: {
    width: "100%",
    height: "100%",
  },
  floatingEmojiText: {
    fontSize: 34,
    textAlign: "center",
  },
  floatingTextSticker: {
    position: "absolute",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "center",
  },
  floatingTextStickerText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  progressRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.28)",
    marginHorizontal: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  avatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: "rgba(255,255,255,0.72)" },
  headerMeta: { marginLeft: 10, flex: 1 },
  headerUserRow: { flexDirection: "row", alignItems: "center" },
  username: { color: "#fff", fontWeight: "900", fontSize: 14.5 },
  storyMetaLine: { color: "rgba(255,255,255,0.76)", fontSize: 12, marginTop: 2, fontWeight: "700", textTransform: "capitalize" },
  closeFriendsBadge: {
    marginLeft: 8,
    color: "#052e16",
    backgroundColor: "#4ade80",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "700",
  },
  iconButton: {
    marginRight: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.24)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  closeButton: {
    marginLeft: 2,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.28)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  floatingMeta: { paddingHorizontal: 12, marginTop: 10, gap: 8 },
  likeBurstOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaSoundHint: {
    position: "absolute",
    right: 16,
    top: 110,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: "rgba(0,0,0,0.56)",
  },
  mediaSoundHintText: { color: "#fff", fontSize: 11.5, fontWeight: "800" },
  metaChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.13)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  metaChipText: { color: "#fff", marginLeft: 7, fontSize: 12.5, fontWeight: "800" },
  leftTouch: {
    position: "absolute",
    left: 0,
    width: "38%",
    top: 0,
    bottom: 0,
  },
  centerTouch: {
    position: "absolute",
    left: "38%",
    width: "24%",
    top: 110,
    bottom: 120,
  },
  rightTouch: {
    position: "absolute",
    right: 0,
    width: "38%",
    top: 0,
    bottom: 0,
  },
  bottomSheet: { marginTop: "auto", paddingHorizontal: 12, paddingBottom: 18 },
  stickerBlock: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
  },
  stickerTitle: { color: "#fff", fontSize: 15, fontWeight: "700", marginBottom: 8 },
  stickerSub: { color: "#d4d4d4", fontSize: 12.5 },
  pollOption: {
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pollText: { color: "#fff", fontWeight: "600" },
  pollPercent: { color: "#fff", fontWeight: "700" },
  quickReactionRow: { flexDirection: "row", marginBottom: 10, flexWrap: "wrap" },
  emojiChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    marginRight: 8,
    marginBottom: 6,
  },
  emojiText: { fontSize: 15 },
  ownerPanel: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.42)",
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  ownerHint: { color: "#fff", fontWeight: "600", fontSize: 12.5 },
  ownerMetric: { flexDirection: "row", alignItems: "center" },
  ownerMetricText: { color: "#fff", marginLeft: 6, fontWeight: "700", fontSize: 12.5 },
  iconButtonSpacer: { width: 36, height: 36 },
  bottomBar: { flexDirection: "row", alignItems: "center" },
  replyInput: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    color: "#fff",
    paddingHorizontal: 16,
    backgroundColor: "rgba(0,0,0,0.42)",
    fontWeight: "700",
  },
  replyInputDisabled: { opacity: 0.6 },
  bottomIcon: { marginLeft: 12 },
  repliesDisabledText: { color: "#d4d4d4", marginLeft: 12, fontSize: 12.5, fontWeight: "600" },
});

export default StoryViewerScreen;
