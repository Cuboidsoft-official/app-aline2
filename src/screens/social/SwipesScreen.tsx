import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  LayoutChangeEvent,
  FlatList,
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Alert } from "../../utils/appAlert";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import LinearGradient from "react-native-linear-gradient";
import Icon from "react-native-vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppBottomDock, { APP_BOTTOM_DOCK_BASE_HEIGHT } from "../../components/AppBottomDock";
import DraggableBottomSheet from "../../components/DraggableBottomSheet";
import CommentThreadSheet from "../../features/social/components/CommentThreadSheet";
import InteractiveText from "../../features/social/components/InteractiveText";
import ShareTargetsList, { ShareTarget } from "../../features/social/components/ShareTargetsList";
import SocialVideo from "../../features/social/components/SocialVideo";
import { socialApi } from "../../features/social/socialApi";
import { ReportReason, Swipe, SwipeComment } from "../../features/social/types";
import { useSegmentedMusicPlayback } from "../../hooks/useSegmentedMusicPlayback";
import { toUserSafeMessage } from "../../features/social/validation";
import { normalizeMediaUrl } from "../../utils/mediaUrls";
import { resolveMentionUserId } from "../../utils/mentionLinks";
import { shouldShowVerifiedBadge } from "../../utils/verificationBadges";
import { buildSharedPostMessage } from "../../utils/chatPresentation";
import { createChatConversation, sendChatMessage } from "../../utils/chatApi";
import { API } from "../../api/api";

const { height } = Dimensions.get("window");
const reportReasons: ReportReason[] = [
  "spam",
  "violence",
  "harassment",
  "nudity",
  "hate_speech",
  "false_information",
  "other",
];

const formatCount = (value: number): string => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return `${value}`;
};

const formatAgo = (timestamp: number): string => {
  const mins = Math.max(1, Math.floor((Date.now() - timestamp) / (1000 * 60)));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const formatSwipeMusicLabel = (music?: Swipe["music"]): string => {
  const trackName = String(music?.trackName || "").trim();
  const artistName = String(music?.artistName || "").trim();

  if (!trackName) {
    return "";
  }

  return artistName ? `${trackName} • ${artistName}` : trackName;
};

const getMusicPlaybackUrl = (music?: Swipe["music"]): string =>
  String(music?.audioUrl || music?.streamUrl || music?.previewUrl || "").trim();

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

function SwipesScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const [viewportHeight, setViewportHeight] = useState(height);
  const [swipes, setSwipes] = useState<Swipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyActions, setBusyActions] = useState<Record<string, boolean>>({});
  const [activeSheet, setActiveSheet] = useState<null | "comments" | "share" | "actions">(null);
  const [selectedSwipe, setSelectedSwipe] = useState<Swipe | null>(null);
  const [sheetComments, setSheetComments] = useState<SwipeComment[]>([]);
  const [sheetDraft, setSheetDraft] = useState("");
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetSubmitting, setSheetSubmitting] = useState(false);
  const [sheetBusyIds, setSheetBusyIds] = useState<Record<string, boolean>>({});
  const [selectedShareTargets, setSelectedShareTargets] = useState<ShareTarget[]>([]);
  const [selectedReason, setSelectedReason] = useState<ReportReason>("spam");
  const [reportNote, setReportNote] = useState("");
  const [threadComment, setThreadComment] = useState<SwipeComment | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isSwipeSoundEnabled, setIsSwipeSoundEnabled] = useState(true);
  const [activeSwipeIndex, setActiveSwipeIndex] = useState(0);
  const [likeBurstSwipeId, setLikeBurstSwipeId] = useState("");
  const isScreenFocused = useIsFocused();

  const swipeTapRef = useRef<{ id: string; time: number; timeout: ReturnType<typeof setTimeout> | null }>({
    id: "",
    time: 0,
    timeout: null,
  });
  const swipeListRef = useRef<FlatList<Swipe> | null>(null);

  const activeSwipe = swipes[activeSwipeIndex] || null;
  const activeSwipeRawMusicUrl = getMusicPlaybackUrl(activeSwipe?.music);
  const activeSwipeMusicUrl = normalizeMediaUrl(activeSwipeRawMusicUrl);
  const activeSwipeMusicStartMs = Math.max(0, Number(activeSwipe?.music?.startTime || 0) * 1000);
  const activeSwipeMusicDurationMs = getTrimmedMusicDurationMs(activeSwipe?.music);
  const activeSwipeMusicTrackKey = activeSwipe
    ? `${activeSwipe.id}:${activeSwipeMusicUrl}:${activeSwipeMusicStartMs}:${activeSwipeMusicDurationMs}`
    : "";
  const isSwipePlaybackEnabled = isSwipeSoundEnabled && !activeSheet && isScreenFocused;
  const shouldPlaySwipeMusic = isSwipePlaybackEnabled && !!activeSwipeMusicUrl;
  useSegmentedMusicPlayback({
    rawUrl: activeSwipeRawMusicUrl,
    normalizedUrl: activeSwipeMusicUrl,
    trackKey: activeSwipeMusicTrackKey,
    startMs: activeSwipeMusicStartMs,
    durationMs: activeSwipeMusicDurationMs,
    shouldPlay: shouldPlaySwipeMusic,
  });
  const bottomDockPadding = APP_BOTTOM_DOCK_BASE_HEIGHT
    + Math.max(insets.bottom + (Platform.OS === "android" ? 8 : 0), Platform.OS === "ios" ? 14 : 20);
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 80,
  }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ index: number | null; isViewable?: boolean }> }) => {
    const firstVisibleItem = viewableItems.find((entry) => entry.isViewable && typeof entry.index === "number");
    if (typeof firstVisibleItem?.index === "number") {
      setActiveSwipeIndex(firstVisibleItem.index);
    }
  }).current;

  const isBusy = (type: "like" | "save" | "share", swipeId: string): boolean =>
    !!busyActions[`${type}_${swipeId}`];

  const setBusy = (type: "like" | "save" | "share", swipeId: string, value: boolean) => {
    setBusyActions((prev) => ({ ...prev, [`${type}_${swipeId}`]: value }));
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const load = async () => {
        try {
          const data = await socialApi.getSwipes();
          if (active) {
            setSwipes(data);
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      };

      load();

      return () => {
        active = false;
      };
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (swipeTapRef.current.timeout) {
          clearTimeout(swipeTapRef.current.timeout);
        }
      };
    }, []),
  );

  const handleLike = async (swipeId: string) => {
    if (isBusy("like", swipeId)) {
      return;
    }

    try {
      setBusy("like", swipeId, true);
      const updated = await socialApi.toggleSwipeLike(swipeId);
      setSwipes((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedSwipe((prev) => (prev?.id === updated.id ? updated : prev));
    } catch (error) {
      Alert.alert("Could not update swipe", toUserSafeMessage(error));
    } finally {
      setBusy("like", swipeId, false);
    }
  };

  const handleSave = async (swipeId: string) => {
    if (isBusy("save", swipeId)) {
      return;
    }

    try {
      setBusy("save", swipeId, true);
      const updated = await socialApi.toggleSwipeSave(swipeId);
      setSwipes((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedSwipe((prev) => (prev?.id === updated.id ? updated : prev));
    } catch (error) {
      Alert.alert("Could not save swipe", toUserSafeMessage(error));
    } finally {
      setBusy("save", swipeId, false);
    }
  };

  const handleShare = async (swipeId: string) => {
    if (isBusy("share", swipeId)) {
      return;
    }

    try {
      setBusy("share", swipeId, true);
      const targetSwipe = swipes.find((item) => item.id === swipeId) || selectedSwipe;

      if (!targetSwipe) {
        throw new Error("Swipe not found");
      }

      navigation.navigate("MainApp", {
        screen: "Create",
        params: {
          initialTab: "story",
          initialMedia: targetSwipe.media.url,
          initialMediaType: targetSwipe.media.mediaType || "video",
        },
      });
    } catch (error) {
      Alert.alert("Could not share swipe", toUserSafeMessage(error));
    } finally {
      setBusy("share", swipeId, false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await socialApi.getSwipes();
      setSwipes(data);
    } catch (error) {
      Alert.alert("Could not refresh swipes", toUserSafeMessage(error));
    } finally {
      setRefreshing(false);
    }
  };

  const onListLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    const nextHeight = Math.round(nativeEvent.layout.height);
    if (nextHeight > 0 && nextHeight !== viewportHeight) {
      setViewportHeight(nextHeight);
    }
  };

  const openUserProfile = useCallback((userId: string) => {
    const normalizedUserId = String(userId || "");
    if (!normalizedUserId) {
      return;
    }

    navigation.navigate("ProfilePreviewScreen", { userId: normalizedUserId });
  }, [navigation]);

  const openMentionProfile = useCallback(async (username: string) => {
    const resolvedUserId = await resolveMentionUserId(username);
    if (!resolvedUserId) {
      Alert.alert("Profile unavailable", "This profile could not be opened right now.");
      return;
    }

    navigation.navigate("ProfilePreviewScreen", { userId: resolvedUserId });
  }, [navigation]);

  const openHashtagResults = useCallback((tag: string) => {
    const normalizedTag = String(tag || "").replace(/^#/, "").trim();
    if (!normalizedTag) {
      return;
    }

    navigation.navigate("HashtagResultsScreen", { hashtag: normalizedTag });
  }, [navigation]);

  const closeSheet = () => {
    setActiveSheet(null);
    setSelectedSwipe(null);
    setSelectedShareTargets([]);
    setSheetComments([]);
    setSheetLoading(false);
    setSheetBusyIds({});
    setSelectedReason("spam");
    setReportNote("");
    setSheetDraft("");
    setThreadComment(null);
  };

  const openCommentsSheet = async (swipe: Swipe) => {
    setSelectedSwipe(swipe);
    setActiveSheet("comments");
    setSheetComments([]);
    setSheetLoading(true);
    try {
      const comments = await socialApi.getSwipeComments(swipe.id);
      setSheetComments(comments);
    } catch (error) {
      Alert.alert("Could not load comments", toUserSafeMessage(error));
    } finally {
      setSheetLoading(false);
    }
  };

  const openShareSheet = (swipe: Swipe) => {
    setSelectedSwipe(swipe);
    setActiveSheet("share");
  };

  const openActionsSheet = (swipe: Swipe) => {
    setSelectedSwipe(swipe);
    setActiveSheet("actions");
  };

  const openSwipeComposer = () => {
    navigation.navigate("MainApp", {
      screen: "Create",
      params: { initialTab: "swipe" },
    });
  };

  const openCommentThread = (comment: SwipeComment) => {
    setThreadComment(comment);
  };

  const onSubmitSheetComment = async () => {
    if (!selectedSwipe || !sheetDraft.trim() || sheetSubmitting) {
      return;
    }

    try {
      setSheetSubmitting(true);
      const added = await socialApi.addSwipeComment(selectedSwipe.id, sheetDraft);
      setSheetComments((prev) => [added, ...prev]);
      setSwipes((prev) =>
        prev.map((item) =>
          item.id === selectedSwipe.id ? { ...item, commentsCount: item.commentsCount + 1 } : item,
        ),
      );
      setSelectedSwipe((prev) => (prev ? { ...prev, commentsCount: prev.commentsCount + 1 } : prev));
      setSheetDraft("");
    } catch (error) {
      Alert.alert("Could not comment", toUserSafeMessage(error));
    } finally {
      setSheetSubmitting(false);
    }
  };

  const onToggleSheetCommentLike = async (commentId: string) => {
    if (!selectedSwipe || sheetBusyIds[commentId]) {
      return;
    }

    try {
      setSheetBusyIds((prev) => ({ ...prev, [commentId]: true }));
      const updated = await socialApi.toggleSwipeCommentLike(selectedSwipe.id, commentId);
      setSheetComments((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      Alert.alert("Could not update like", toUserSafeMessage(error));
    } finally {
      setSheetBusyIds((prev) => ({ ...prev, [commentId]: false }));
    }
  };

  const onDeleteSheetComment = (comment: SwipeComment) => {
    if (!selectedSwipe) {
      return;
    }

    Alert.alert("Delete comment", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const result = await socialApi.deleteSwipeComment(selectedSwipe.id, comment.id);
            setSheetComments((prev) => prev.filter((item) => item.id !== comment.id));
            setSwipes((prev) =>
              prev.map((item) =>
                item.id === selectedSwipe.id
                  ? { ...item, commentsCount: Math.max(0, item.commentsCount - Math.max(1, result.deletedCount || 1)) }
                  : item,
              ),
            );
            setSelectedSwipe((prev) =>
              prev
                ? { ...prev, commentsCount: Math.max(0, prev.commentsCount - Math.max(1, result.deletedCount || 1)) }
                : prev,
            );
          } catch (error) {
            Alert.alert("Could not delete comment", toUserSafeMessage(error));
          }
        },
      },
    ]);
  };

  const onReportSwipe = async () => {
    if (!selectedSwipe) {
      return;
    }

    try {
      await socialApi.reportContent("swipe", selectedSwipe.id, selectedReason, reportNote);
      Alert.alert("Reported", "Thanks for your report.");
      closeSheet();
    } catch (error) {
      Alert.alert("Could not report swipe", toUserSafeMessage(error));
    }
  };

  const onMuteSwipeUser = async () => {
    if (!selectedSwipe) {
      return;
    }

    try {
      await socialApi.muteUser(selectedSwipe.user.id);
      setSwipes((prev) => prev.filter((item) => item.user.id !== selectedSwipe.user.id));
      closeSheet();
    } catch (error) {
      Alert.alert("Could not mute user", toUserSafeMessage(error));
    }
  };

  const onBlockSwipeUser = async () => {
    if (!selectedSwipe) {
      return;
    }

    try {
      await socialApi.blockUser(selectedSwipe.user.id);
      setSwipes((prev) => prev.filter((item) => item.user.id !== selectedSwipe.user.id));
      closeSheet();
    } catch (error) {
      Alert.alert("Could not block user", toUserSafeMessage(error));
    }
  };

  const onMarkSwipeNotInterested = async () => {
    if (!selectedSwipe) {
      return;
    }

    try {
      await socialApi.markNotInterested("swipe", selectedSwipe.id);
      setSwipes((prev) => prev.filter((item) => item.id !== selectedSwipe.id));
      closeSheet();
    } catch (error) {
      Alert.alert("Could not update preferences", toUserSafeMessage(error));
    }
  };

  const sendSwipeToSelectedChats = async () => {
    if (!selectedSwipe || !selectedShareTargets.length) {
      return;
    }

    try {
      const shareMessage = buildSharedPostMessage(selectedSwipe);
      const sendResults = await Promise.allSettled(
        selectedShareTargets.map(async (target) => {
          const conversationId =
            target.kind === "group" && target.conversationId
              ? target.conversationId
              : String(
                  (
                    await createChatConversation({
                      receiverId: target.id,
                      conversationType: "direct",
                    })
                  )?.conversation?._id || "",
                );

          if (!conversationId) {
            throw new Error("Could not open this chat.");
          }

          await sendChatMessage({
            conversationId,
            text: shareMessage,
          });

          await API.post(`/posts/${selectedSwipe.id}/share`, {
            shareType: "conversation",
            conversationId,
          }).catch((error) => {
            console.log("swipe share count update error:", error);
          });

          return target;
        }),
      );

      const successCount = sendResults.filter((result) => result.status === "fulfilled").length;
      const failedCount = sendResults.length - successCount;

      if (!successCount) {
        const firstFailure = sendResults.find((result) => result.status === "rejected");
        throw firstFailure?.status === "rejected" ? firstFailure.reason : new Error("Could not send swipe.");
      }

      setSwipes((prev) =>
        prev.map((item) =>
          item.id === selectedSwipe.id
            ? { ...item, sharesCount: item.sharesCount + successCount }
            : item,
        ),
      );
      setSelectedSwipe((prev) => (
        prev ? { ...prev, sharesCount: prev.sharesCount + successCount } : prev
      ));

      Alert.alert(
        failedCount > 0 ? "Partially sent" : "Sent",
        failedCount > 0
          ? `Sent to ${successCount} chats. ${failedCount} failed.`
          : `Swipe sent to ${successCount} ${successCount === 1 ? "chat" : "chats"}.`,
      );
      closeSheet();
    } catch (error) {
      Alert.alert("Could not send swipe", toUserSafeMessage(error));
    }
  };

  const triggerSwipeLikeBurst = useCallback((swipeId: string) => {
    setLikeBurstSwipeId(swipeId);
    setTimeout(() => {
      setLikeBurstSwipeId((current) => (current === swipeId ? "" : current));
    }, 720);
  }, []);

  const handleSwipeMediaTap = (swipe: Swipe) => {
    const now = Date.now();
    const lastTap = swipeTapRef.current;

    if (lastTap.id === swipe.id && now - lastTap.time < 260) {
      if (lastTap.timeout) {
        clearTimeout(lastTap.timeout);
      }
      swipeTapRef.current = { id: "", time: 0, timeout: null };
      triggerSwipeLikeBurst(swipe.id);
      handleLike(swipe.id).catch(() => undefined);
      return;
    }

    const timeout = setTimeout(() => {
      setIsSwipeSoundEnabled((current) => !current);
      swipeTapRef.current = { id: "", time: 0, timeout: null };
    }, 260);

    swipeTapRef.current = {
      id: swipe.id,
      time: now,
      timeout,
    };
  };

  useEffect(() => {
    if (!swipes.length) {
      setActiveSwipeIndex(0);
      return;
    }

    if (activeSwipeIndex > swipes.length - 1) {
      setActiveSwipeIndex(swipes.length - 1);
    }
  }, [activeSwipeIndex, swipes.length]);

  useEffect(() => {
    const targetSwipeId = String(route?.params?.swipeId || "").trim();
    if (!targetSwipeId || !swipes.length) {
      return;
    }

    const targetIndex = swipes.findIndex((item) => item.id === targetSwipeId);
    if (targetIndex < 0) {
      return;
    }

    setActiveSwipeIndex(targetIndex);
    requestAnimationFrame(() => {
      swipeListRef.current?.scrollToIndex?.({ index: targetIndex, animated: false });
    });
  }, [route?.params?.swipeId, swipes]);

  const renderSwipe = ({ item, index }: { item: Swipe; index: number }) => {
    const isActive = index === activeSwipeIndex;
    const musicLabel = formatSwipeMusicLabel(item.music);
    const hasAttachedMusic = !!getMusicPlaybackUrl(item.music);

    return (
      <View style={[styles.swipeItem, { height: viewportHeight }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => handleSwipeMediaTap(item)}>
          <SocialVideo
            uri={normalizeMediaUrl(item.media.url)}
            posterUri={normalizeMediaUrl(item.thumbnailUrl || item.media.thumbnailUrl || item.media.url)}
            style={styles.swipeMedia}
            paused={!isActive || !!activeSheet || !isScreenFocused}
            muted={!isSwipePlaybackEnabled || hasAttachedMusic}
            repeat
            contentBlurRadius={item.media.sensitiveContent?.isSensitive ? 22 : 0}
          />
          {item.media.sensitiveContent?.isSensitive ? (
            <View style={styles.sensitiveBadge}>
              <Text style={styles.sensitiveBadgeText}>
                {item.media.sensitiveContent.label ? `${item.media.sensitiveContent.label} sensitive content` : "Sensitive content"}
              </Text>
            </View>
          ) : null}
          {likeBurstSwipeId === item.id ? (
            <View pointerEvents="none" style={styles.likeBurstOverlay}>
              <Icon name="heart" size={92} color="rgba(255,255,255,0.92)" />
            </View>
          ) : null}
          <View style={styles.mediaSoundHint}>
            <Icon
              name={isSwipePlaybackEnabled ? "volume-high-outline" : "volume-mute-outline"}
              size={16}
              color="#fff"
            />
            <Text style={styles.mediaSoundHintText}>{isSwipePlaybackEnabled ? "Sound on" : "Muted"}</Text>
          </View>
        </Pressable>
        <LinearGradient colors={["rgba(0,0,0,0.74)", "rgba(0,0,0,0.12)", "transparent"]} style={styles.topGradient} />
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.42)", "rgba(0,0,0,0.88)"]} style={styles.bottomGradient} />
        <View style={[styles.overlay, { paddingBottom: bottomDockPadding + 12 }]}>
          <View style={styles.topBar}>
            <Text style={styles.screenTitle}>Swipes</Text>
            <TouchableOpacity style={styles.createButton} onPress={openSwipeComposer}>
              <LinearGradient colors={["#00c6ff", "#7f00ff", "#ff4ecd"]} style={styles.createButtonGradient}>
                <Icon name="add" size={18} color="#fff" />
                <Text style={styles.createButtonText}>New Swipe</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
          <View style={styles.bottomRow}>
            <View style={styles.bottomTextBlock}>
              <TouchableOpacity style={styles.userRow} onPress={() => openUserProfile(item.user.id)}>
                <Text style={styles.userName}>@{item.user.username}</Text>
                {shouldShowVerifiedBadge(item.user) ? <Icon name="checkmark-circle" color="#6cbcff" size={16} /> : null}
              </TouchableOpacity>

              <InteractiveText
                style={styles.caption}
                mentionStyle={styles.captionEntity}
                hashtagStyle={styles.captionEntity}
                onPressMention={(mention) => {
                  void openMentionProfile(mention);
                }}
                onPressHashtag={openHashtagResults}
                text={item.caption}
              />

              {item.mentions.length ? (
                <InteractiveText
                  style={styles.mentionLine}
                  mentionStyle={styles.captionEntity}
                  onPressMention={(mention) => {
                    void openMentionProfile(mention);
                  }}
                  text={item.mentions.map((mention) => `@${mention}`).join(" ")}
                />
              ) : null}

              {item.hashtags.length ? (
                <InteractiveText
                  style={styles.hashTags}
                  hashtagStyle={styles.captionEntity}
                  onPressHashtag={openHashtagResults}
                  text={item.hashtags.map((tag) => `#${tag}`).join(" ")}
                />
              ) : null}

              {item.location ? (
                <View style={styles.locationRow}>
                  <Icon name="location-outline" size={13} color="#fff" />
                  <Text style={styles.locationText}>{item.location}</Text>
                </View>
              ) : null}

              {musicLabel ? (
                <View style={styles.musicRow}>
                  <Icon name="musical-notes" size={13} color="#fff" />
                  <Text style={styles.musicText}>{musicLabel}</Text>
                </View>
              ) : null}

              <View style={styles.reelMetaRail}>
                <View style={styles.reelMetaChip}>
                  <Icon name="sparkles-outline" size={13} color="#fff" />
                  <Text style={styles.reelMetaText}>Effects ready</Text>
                </View>
                <View style={styles.reelMetaChip}>
                  <Icon name="cut-outline" size={13} color="#fff" />
                  <Text style={styles.reelMetaText}>Trimmed video</Text>
                </View>
              </View>
            </View>

            <View style={styles.actionRail}>
              <TouchableOpacity style={styles.actionButton} onPress={() => handleLike(item.id)}>
                <Icon name={item.liked ? "heart" : "heart-outline"} size={28} color={item.liked ? "#ff4f73" : "#fff"} />
                <Text style={styles.actionText}>{formatCount(item.likesCount)}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionButton} onPress={() => openCommentsSheet(item)}>
                <Icon name="chatbubble-outline" size={25} color="#fff" />
                <Text style={styles.actionText}>{formatCount(item.commentsCount)}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionButton} onPress={() => openShareSheet(item)}>
                <Icon name="paper-plane-outline" size={25} color="#fff" />
                <Text style={styles.actionText}>{formatCount(item.sharesCount)}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionButton} onPress={() => setIsSwipeSoundEnabled((current) => !current)}>
                <Icon
                  name={isSwipePlaybackEnabled ? "volume-high-outline" : "volume-mute-outline"}
                  size={23}
                  color="#fff"
                />
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionButton} onPress={() => handleSave(item.id)}>
                <Icon name={item.saved ? "bookmark" : "bookmark-outline"} size={23} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionButton} onPress={() => openActionsSheet(item)}>
                <Icon name="ellipsis-horizontal" size={23} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#7b3fe4" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={swipeListRef}
        data={swipes}
        keyExtractor={(item) => item.id}
        renderItem={renderSwipe}
        onLayout={onListLayout}
        pagingEnabled
        snapToInterval={viewportHeight}
        snapToAlignment="start"
        disableIntervalMomentum
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={Platform.OS === "android"}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        updateCellsBatchingPeriod={16}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({
          length: viewportHeight,
          offset: viewportHeight * index,
          index,
        })}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        onMomentumScrollEnd={(event) => {
          const nextIndex = Math.round(
            Number(event?.nativeEvent?.contentOffset?.y || 0) / Math.max(1, viewportHeight),
          );
          setActiveSwipeIndex(Math.max(0, Math.min(swipes.length - 1, nextIndex)));
        }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (!loadingMore) {
            setLoadingMore(true);
            socialApi.getSwipes().then((data) => {
              if (data.length > 0) {
                setSwipes((prev) => {
                  const existingIds = new Set(prev.map((s) => s.id));
                  const newItems = data.filter((s) => !existingIds.has(s.id));
                  return [...prev, ...newItems];
                });
              }
            }).catch(() => { }).finally(() => setLoadingMore(false));
          }
        }}
      />
      <AppBottomDock navigation={navigation} activeRouteName="Swipes" />

      <Modal visible={!!activeSheet && activeSheet !== "share"} transparent animationType="slide" onRequestClose={closeSheet}>
        <Pressable style={styles.sheetBackdrop} onPress={closeSheet} />
        <View style={[styles.sheetWrap, activeSheet === "share" && styles.shareSheetWrap]}>
          <View style={[styles.sheetHandle, activeSheet === "share" && styles.shareSheetHandle]} />
          {activeSheet === "comments" ? (
            <View style={styles.sheetContent}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Comments</Text>
                <TouchableOpacity
                  onPress={() => {
                    const swipeId = selectedSwipe?.id;
                    closeSheet();
                    if (swipeId) {
                      navigation.navigate("SwipeComments", { swipeId });
                    }
                  }}
                >
                  <Text style={styles.sheetLink}>Open full</Text>
                </TouchableOpacity>
              </View>
              {sheetLoading ? (
                <View style={styles.sheetLoader}>
                  <ActivityIndicator size="small" color="#3345d1" />
                </View>
              ) : (
                <FlatList
                  data={sheetComments}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.sheetListContent}
                  renderItem={({ item }) => (
                    <View style={styles.sheetCommentRow}>
                      <ImageBackground source={{ uri: item.user.avatarUrl }} style={styles.sheetCommentAvatar} imageStyle={styles.sheetCommentAvatarImage} />
                      <View style={styles.sheetCommentBody}>
                        <View style={styles.sheetCommentTop}>
                          <Text style={styles.sheetCommentUser}>@{item.user.username}</Text>
                          <Text style={styles.sheetCommentTime}>{formatAgo(item.createdAt)}</Text>
                        </View>
                        <Text style={styles.sheetCommentText}>{item.text}</Text>
                        <View style={styles.sheetCommentActions}>
                          <TouchableOpacity onPress={() => onToggleSheetCommentLike(item.id)}>
                            <Text style={styles.sheetCommentAction}>{item.liked ? "Unlike" : "Like"}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => openCommentThread(item)}>
                            <Text style={styles.sheetCommentAction}>Reply</Text>
                          </TouchableOpacity>
                          {item.replyCount ? (
                            <TouchableOpacity onPress={() => openCommentThread(item)}>
                              <Text style={styles.sheetCommentAction}>
                                View replies {item.replyCount > 0 ? `(${item.replyCount})` : ""}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                          {item.canDelete ? (
                            <TouchableOpacity onPress={() => onDeleteSheetComment(item)}>
                              <Text style={[styles.sheetCommentAction, styles.sheetCommentDelete]}>Delete</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  )}
                  ListEmptyComponent={<Text style={styles.emptySheetText}>No comments yet.</Text>}
                />
              )}
              <View style={styles.sheetComposer}>
                <TextInput
                  value={sheetDraft}
                  onChangeText={setSheetDraft}
                  placeholder="Add a comment..."
                  placeholderTextColor="#8a8a8a"
                  style={styles.sheetInput}
                />
                <TouchableOpacity disabled={!sheetDraft.trim() || sheetSubmitting} onPress={onSubmitSheetComment}>
                  <Text style={[styles.sheetSend, (!sheetDraft.trim() || sheetSubmitting) && styles.sheetSendDisabled]}>Post</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {activeSheet === "share" && selectedSwipe ? (
            <View style={styles.sheetContent}>
              <View style={styles.sheetHeader}>
                <Text style={[styles.sheetTitle, styles.shareSheetTitle]}>Share</Text>
                <TouchableOpacity onPress={closeSheet}>
                  <Icon name="close" size={20} color="#f8fafc" />
                </TouchableOpacity>
              </View>
              <Text style={styles.shareSheetSubtitle}>
                Choose chats first, then use the other share options below.
              </Text>

              <View style={styles.sharePeoplePanel}>
                <View style={styles.sharePanelHeader}>
                  <Text style={styles.sharePanelTitle}>Chats</Text>
                  <Text style={styles.sharePanelMeta}>
                    {selectedShareTargets.length ? `${selectedShareTargets.length} selected` : "Tap chats to select"}
                  </Text>
                </View>
                <ShareTargetsList
                  title="Send to"
                  variant="dark"
                  scrollEnabled={false}
                  selectedTargetIds={selectedShareTargets.map((target) => target.key)}
                  onToggleTarget={(target) => {
                    setSelectedShareTargets((current) =>
                      current.some((item) => item.key === target.key)
                        ? current.filter((item) => item.key !== target.key)
                        : [...current, target],
                    );
                  }}
                />
              </View>
              <TouchableOpacity
                style={[
                  styles.shareSendButton,
                  !selectedShareTargets.length && styles.commentsButtonDisabled,
                ]}
                disabled={!selectedShareTargets.length}
                onPress={sendSwipeToSelectedChats}
              >
                <Text style={styles.shareSendButtonText}>
                  {selectedShareTargets.length ? `Send to ${selectedShareTargets.length}` : "Select chats"}
                </Text>
              </TouchableOpacity>

              <View style={styles.shareActionsPanel}>
                <Text style={styles.sharePanelTitle}>Other options</Text>
                <TouchableOpacity
                  style={styles.shareActionDark}
                  onPress={async () => {
                    closeSheet();
                    await handleShare(selectedSwipe.id);
                  }}
                >
                  <Icon name="sparkles-outline" size={20} color="#f8fafc" />
                  <Text style={styles.shareActionTextDark}>Add to your story</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.shareActionDark}
                  onPress={async () => {
                    const updated = await socialApi.toggleSwipeSave(selectedSwipe.id);
                    setSwipes((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
                    setSelectedSwipe(updated);
                    closeSheet();
                  }}
                >
                  <Icon name={selectedSwipe.saved ? "bookmark" : "bookmark-outline"} size={20} color="#f8fafc" />
                  <Text style={styles.shareActionTextDark}>{selectedSwipe.saved ? "Remove from saved" : "Save"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {activeSheet === "actions" && selectedSwipe ? (
            <ScrollView style={styles.sheetContent} contentContainerStyle={styles.actionsSheetContent}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Options</Text>
                <TouchableOpacity onPress={closeSheet}>
                  <Icon name="close" size={20} color="#111" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.shareAction} onPress={onMarkSwipeNotInterested}>
                <Icon name="eye-off-outline" size={20} color="#111" />
                <Text style={styles.shareActionText}>Not interested</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareAction} onPress={onMuteSwipeUser}>
                <Icon name="volume-mute-outline" size={20} color="#111" />
                <Text style={styles.shareActionText}>Mute @{selectedSwipe.user.username}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareAction} onPress={onBlockSwipeUser}>
                <Icon name="ban-outline" size={20} color="#b91c1c" />
                <Text style={[styles.shareActionText, styles.dangerText]}>Block @{selectedSwipe.user.username}</Text>
              </TouchableOpacity>
              <Text style={styles.reportTitle}>Report swipe</Text>
              <View style={styles.reasonWrap}>
                {reportReasons.map((reason) => (
                  <TouchableOpacity
                    key={reason}
                    style={[styles.reasonPill, selectedReason === reason && styles.reasonPillSelected]}
                    onPress={() => setSelectedReason(reason)}
                  >
                    <Text style={[styles.reasonText, selectedReason === reason && styles.reasonTextSelected]}>
                      {reason.replace("_", " ")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.reportInput}
                value={reportNote}
                onChangeText={setReportNote}
                placeholder="Additional context (optional)"
                placeholderTextColor="#8a8a8a"
                multiline
              />
              <TouchableOpacity style={styles.reportButton} onPress={onReportSwipe}>
                <Text style={styles.reportButtonText}>Submit report</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : null}
        </View>
      </Modal>

      <DraggableBottomSheet
        visible={activeSheet === "share" && !!selectedSwipe}
        onClose={closeSheet}
        snapPoints={[0.58, 0.78, 0.92]}
        initialSnapIndex={1}
        maxHeightRatio={0.94}
      >
        {selectedSwipe ? (
          <View style={[styles.sheetContent, styles.shareDraggableContent]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, styles.shareSheetTitle]}>Share</Text>
              <TouchableOpacity onPress={closeSheet}>
                <Icon name="close" size={20} color="#f8fafc" />
              </TouchableOpacity>
            </View>
            <Text style={styles.shareSheetSubtitle}>
              Choose chats first, then use the other share options below.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.shareScrollContent}>
              <View style={styles.sharePeoplePanel}>
                <View style={styles.sharePanelHeader}>
                  <Text style={styles.sharePanelTitle}>Chats</Text>
                  <Text style={styles.sharePanelMeta}>
                    {selectedShareTargets.length ? `${selectedShareTargets.length} selected` : "Tap chats to select"}
                  </Text>
                </View>
                <ShareTargetsList
                  title="Send to"
                  variant="dark"
                  scrollEnabled={false}
                  selectedTargetIds={selectedShareTargets.map((target) => target.key)}
                  onToggleTarget={(target) => {
                    setSelectedShareTargets((current) =>
                      current.some((item) => item.key === target.key)
                        ? current.filter((item) => item.key !== target.key)
                        : [...current, target],
                    );
                  }}
                />
              </View>
              <TouchableOpacity
                style={[
                  styles.shareSendButton,
                  !selectedShareTargets.length && styles.commentsButtonDisabled,
                ]}
                disabled={!selectedShareTargets.length}
                onPress={sendSwipeToSelectedChats}
              >
                <Text style={styles.shareSendButtonText}>
                  {selectedShareTargets.length ? `Send to ${selectedShareTargets.length}` : "Select chats"}
                </Text>
              </TouchableOpacity>

              <View style={styles.shareActionsPanel}>
                <Text style={styles.sharePanelTitle}>Other options</Text>
                <TouchableOpacity
                  style={styles.shareActionDark}
                  onPress={async () => {
                    closeSheet();
                    await handleShare(selectedSwipe.id);
                  }}
                >
                  <Icon name="sparkles-outline" size={20} color="#f8fafc" />
                  <Text style={styles.shareActionTextDark}>Add to your story</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.shareActionDark}
                  onPress={async () => {
                    const updated = await socialApi.toggleSwipeSave(selectedSwipe.id);
                    setSwipes((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
                    setSelectedSwipe(updated);
                    closeSheet();
                  }}
                >
                  <Icon name={selectedSwipe.saved ? "bookmark" : "bookmark-outline"} size={20} color="#f8fafc" />
                  <Text style={styles.shareActionTextDark}>{selectedSwipe.saved ? "Remove from saved" : "Save"}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        ) : null}
      </DraggableBottomSheet>

      <CommentThreadSheet
        visible={!!threadComment}
        contentType="swipe"
        contentId={selectedSwipe?.id || ""}
        comment={threadComment}
        onClose={() => setThreadComment(null)}
        onCommentUpdate={(updatedComment) =>
          setSheetComments((prev) =>
            prev.map((item) =>
              item.id === updatedComment.id
                ? { ...item, ...updatedComment, reelId: item.reelId }
                : item
            )
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000" },
  swipeItem: { justifyContent: "flex-end", backgroundColor: "#121212" },
  swipeMedia: { ...StyleSheet.absoluteFillObject },
  likeBurstOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaSoundHint: {
    position: "absolute",
    top: 58,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: "rgba(0,0,0,0.56)",
  },
  mediaSoundHintText: {
    color: "#fff",
    fontSize: 11.5,
    fontWeight: "800",
  },
  sensitiveBadge: {
    position: "absolute",
    left: 16,
    bottom: 56,
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
  topGradient: { ...StyleSheet.absoluteFillObject, bottom: undefined, height: 240 },
  bottomGradient: { ...StyleSheet.absoluteFillObject, top: undefined, height: 360 },
  overlay: {
    paddingHorizontal: 14,
    paddingBottom: 24,
    paddingTop: 35,
    flex: 1,
    justifyContent: "space-between",
  },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 16 },
  screenTitle: { color: "#fff", fontSize: 30, fontWeight: "900", letterSpacing: -0.8 },
  createButton: {
    overflow: "hidden",
    borderRadius: 999,
    shadowColor: "#7f00ff",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  createButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  createButtonText: { color: "#fff", fontWeight: "900", marginLeft: 5, fontSize: 12 },
  bottomRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  bottomTextBlock: { flex: 1, paddingRight: 10 },
  userRow: { flexDirection: "row", alignItems: "center" },
  userName: { color: "#fff", fontWeight: "900", fontSize: 15, marginRight: 5 },
  caption: { color: "#fff", marginTop: 8, fontSize: 14.5, lineHeight: 20, fontWeight: "600" },
  captionEntity: { color: "#a9c4ff", fontWeight: "800" },
  mentionLine: { color: "#d7e4ff", marginTop: 5, fontSize: 12.5, fontWeight: "700" },
  hashTags: { color: "#a9c4ff", marginTop: 5, fontSize: 12.5, fontWeight: "800" },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    marginTop: 8,
  },
  locationText: {
    color: "#fff",
    fontSize: 12.5,
    fontWeight: "700",
  },
  musicRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  musicText: { color: "#fff", marginLeft: 6, fontSize: 12.5, fontWeight: "700" },
  reelMetaRail: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  reelMetaChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.32)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reelMetaText: { color: "#fff", marginLeft: 5, fontSize: 11.5, fontWeight: "800" },
  actionRail: { alignItems: "center", marginBottom: 6 },
  actionButton: {
    alignItems: "center",
    marginBottom: 14,
    minWidth: 48,
    minHeight: 48,
    borderRadius: 24,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.28)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  actionText: { color: "#fff", fontSize: 11.5, marginTop: 3, fontWeight: "800" },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheetWrap: {
    marginTop: "auto",
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: height * 0.45,
    maxHeight: height * 0.8,
    paddingTop: 10,
  },
  shareSheetWrap: {
    backgroundColor: "#020617",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#d1d5db",
    marginBottom: 10,
  },
  shareSheetHandle: {
    backgroundColor: "rgba(148,163,184,0.48)",
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  shareDraggableContent: {
    backgroundColor: "#020617",
    paddingTop: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },
  shareSheetTitle: { color: "#f8fafc" },
  shareSheetSubtitle: {
    color: "#94a3b8",
    fontSize: 11.5,
    marginBottom: 12,
  },
  shareScrollContent: {
    paddingBottom: 24,
  },
  sheetLink: { color: "#2563eb", fontWeight: "700" },
  sheetLoader: { paddingVertical: 24, alignItems: "center" },
  sheetListContent: { paddingBottom: 12 },
  sheetCommentRow: { flexDirection: "row", marginBottom: 14 },
  sheetCommentAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#e5e7eb" },
  sheetCommentAvatarImage: { borderRadius: 17 },
  sheetCommentBody: { flex: 1, marginLeft: 10 },
  sheetCommentTop: { flexDirection: "row", alignItems: "center" },
  sheetCommentUser: { fontWeight: "700", color: "#111827", fontSize: 13.5 },
  sheetCommentTime: { marginLeft: 8, color: "#6b7280", fontSize: 11.5 },
  sheetCommentText: { marginTop: 2, color: "#111827", lineHeight: 19 },
  sheetCommentActions: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  sheetCommentAction: { color: "#4b5563", fontWeight: "600", marginRight: 14, fontSize: 12.5 },
  sheetCommentDelete: { color: "#b91c1c" },
  emptySheetText: { textAlign: "center", color: "#6b7280", paddingVertical: 30 },
  sheetComposer: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  sheetInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 21,
    paddingHorizontal: 14,
    color: "#111827",
  },
  sheetSend: { color: "#2563eb", fontWeight: "700", paddingHorizontal: 12 },
  sheetSendDisabled: { color: "#9ca3af" },
  sharePeoplePanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148,163,184,0.22)",
    backgroundColor: "rgba(15,23,42,0.92)",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sharePanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sharePanelTitle: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "800",
  },
  sharePanelMeta: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "600",
  },
  shareAction: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  shareActionText: { marginLeft: 12, color: "#111827", fontWeight: "600", fontSize: 14 },
  shareActionsPanel: {
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148,163,184,0.22)",
    backgroundColor: "rgba(8,14,26,0.96)",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
  },
  shareActionDark: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148,163,184,0.18)",
  },
  shareActionTextDark: {
    marginLeft: 12,
    color: "#f8fafc",
    fontWeight: "600",
    fontSize: 14,
  },
  shareSendButton: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },
  shareSendButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  commentsButton: {
    marginTop: 14,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  commentsButtonDisabled: {
    opacity: 0.4,
  },
  commentsButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  actionsSheetContent: { paddingBottom: 24 },
  dangerText: { color: "#b91c1c" },
  reportTitle: { marginTop: 16, marginBottom: 10, color: "#111827", fontWeight: "800" },
  reasonWrap: { flexDirection: "row", flexWrap: "wrap" },
  reasonPill: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  reasonPillSelected: { borderColor: "#3345d1", backgroundColor: "#eef2ff" },
  reasonText: { color: "#4b5563", fontSize: 12.5 },
  reasonTextSelected: { color: "#3345d1", fontWeight: "700" },
  reportInput: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
    color: "#111827",
  },
  reportButton: {
    marginTop: 12,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#111827",
    justifyContent: "center",
    alignItems: "center",
  },
  reportButtonText: { color: "#fff", fontWeight: "700" },
});

export default SwipesScreen;
