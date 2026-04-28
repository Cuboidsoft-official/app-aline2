import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View
} from "react-native";
import { Alert } from "../utils/appAlert";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import LinearGradient from "react-native-linear-gradient";

import ContentActionSheet from "../features/social/components/ContentActionSheet";
import InteractiveText from "../features/social/components/InteractiveText";
import PostCommentsSheet from "../features/social/components/PostCommentsSheet";
import PostShareSheet from "../features/social/components/PostShareSheet";
import ProgressiveImage from "../features/social/components/ProgressiveImage";
import SocialVideo from "../features/social/components/SocialVideo";
import { socialApi } from "../features/social/socialApi";
import { CommentAudioFile, FeedResponse, Post, Story } from "../features/social/types";
import { dismissPublishQueueTask, getPublishQueueSnapshot, PublishQueueTask, subscribePublishQueue } from "../features/social/publishQueue";
import { toUserSafeMessage } from "../features/social/validation";
import { API } from "../api/api";
import { getStoredUser } from "../utils/authSession";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { useSegmentedMusicPlayback } from "../hooks/useSegmentedMusicPlayback";
import { normalizeMediaUrl } from "../utils/mediaUrls";
import { useAppTheme } from "../theme/AppThemeContext";
import { PHOTO_FILTER_LIST } from "../utils/photoFilters";
import { resolveMentionUserId } from "../utils/mentionLinks";
import { shouldShowVerifiedBadge } from "../utils/verificationBadges";
import { APP_BOTTOM_DOCK_BASE_HEIGHT } from "../components/AppBottomDock";
import AppAvatar from "../components/AppAvatar";
import VoiceRecorderButton from "../components/chat/VoiceRecorderButton";
import { downloadImageAsset } from "../utils/mediaDownload";
import { connectSocket, socket } from "../socket";
import { listLiveStreams } from "../utils/liveStreamApi";

let ColorMatrix: any;
try {
  ColorMatrix = require("react-native-color-matrix-image-filters").ColorMatrix;
} catch {
  ColorMatrix = null;
}

const initialFeed: FeedResponse = {
  stories: [],
  posts: [],
};

const FEED_ACCENT = "#9b4dff";

const getMusicPlaybackUrl = (music?: Post["music"]): string =>
  String(music?.audioUrl || music?.streamUrl || music?.previewUrl || "").trim();

const formatCount = (value: number): string => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }

  return `${value}`;
};

const formatCompactCoinBalance = (value: number): string => {
  const normalizedValue = Math.max(0, Number(value) || 0);

  if (normalizedValue >= 1000000) {
    return `${(normalizedValue / 1000000).toFixed(1)}M`;
  }

  if (normalizedValue >= 1000) {
    return `${(normalizedValue / 1000).toFixed(normalizedValue >= 10000 ? 0 : 1)}K`;
  }

  return `${Math.round(normalizedValue)}`;
};

const formatAgo = (timestamp: number): string => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "now";
  }

  const mins = Math.max(1, Math.floor((Date.now() - timestamp) / (1000 * 60)));

  if (mins < 60) {
    return `${mins}m`;
  }

  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.floor(hours / 24)}d`;
};

const getPostTypeTag = (post: Post): string => {
  if (post.type === "carousel") {
    return "Carousel Post";
  }

  return post.type === "video" ? "Video Post" : "Photo Post";
};

const showAvailabilityStatusModal = (nextStatus: boolean) => {
  Alert.alert(
    nextStatus ? "You're now able to get appointments" : "You're now marked as I am Out",
    nextStatus
      ? "You are visible to users for appointments and chat requests."
      : "You will not be visible to users for new appointments until you switch back in.",
  );
};

const formatPostMusicLabel = (music?: Post["music"]): string => {
  const trackName = String(music?.trackName || "").trim();
  const artistName = String(music?.artistName || "").trim();

  if (!trackName) {
    return "";
  }

  return artistName ? `${trackName} • ${artistName}` : trackName;
};

const getTrimmedMusicDurationMs = (
  music?: { duration?: number; startTime?: number; endTime?: number },
): number => {
  const explicitDurationMs = Math.max(0, Number(music?.duration || 0) * 1000);
  if (explicitDurationMs > 0) {
    return explicitDurationMs;
  }

  const startMs = Math.max(0, Number(music?.startTime || 0) * 1000);
  const endMs = Math.max(0, Number(music?.endTime || 0) * 1000);
  return endMs > startMs ? endMs - startMs : 0;
};

const getPostAspectRatio = (post: Post): number => {
  const primaryMedia = post.media[0];
  const assetRatio =
    primaryMedia?.width && primaryMedia?.height
      ? primaryMedia.width / Math.max(1, primaryMedia.height)
      : 1;

  return Math.min(1.91, Math.max(0.65, assetRatio || 1));
};

const getImageResizeMode = (
  asset: Post["media"][number] | undefined,
  frameAspectRatio: number,
): "contain" | "cover" => {
  const assetRatio =
    asset?.width && asset?.height
      ? asset.width / Math.max(1, asset.height)
      : frameAspectRatio;

  return Math.abs(assetRatio - frameAspectRatio) > 0.12 ? "contain" : "cover";
};

const buildMixedLatestFeedPosts = (items: Post[]): Post[] => {
  return Array.from(
    items.reduce((map, item) => {
      if (item?.id) {
        map.set(item.id, item);
      }
      return map;
    }, new Map<string, Post>()).values(),
  ).sort((left, right) => Number(right?.createdAt || 0) - Number(left?.createdAt || 0));
};

type CurrentUserSummary = {
  id: string;
  avatarUrl: string;
  username: string;
  name: string;
  followingIds: string[];
};

type FeedRelationshipKind = "self" | "follow" | "follow_back" | "following" | "message";

type SellerAccountSummary = {
  id: string;
  sellerName: string;
  availabilityStatus: boolean;
};

function FeedScreen({ navigation }: any) {
  const { width, height } = useWindowDimensions();
  const { colors, isDarkMode } = useAppTheme();
  const isScreenFocused = useIsFocused();
  const feedAccent = colors.primary || FEED_ACCENT;
  const feedAccentSoft = `${feedAccent}12`;
  const feedAccentBorder = `${feedAccent}30`;
  const [feed, setFeed] = useState<FeedResponse>(initialFeed);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isActionBusy, setIsActionBusy] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [activeSheet, setActiveSheet] = useState<null | "comments" | "share" | "actions">(null);
  const [currentUser, setCurrentUser] = useState<CurrentUserSummary | null>(null);
  const [sellerAccount, setSellerAccount] = useState<SellerAccountSummary | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [walletCoinBalance, setWalletCoinBalance] = useState(0);
  const [availabilityUpdating, setAvailabilityUpdating] = useState(false);
  const [liveStories, setLiveStories] = useState<any[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activePostId, setActivePostId] = useState<string>("");
  const [mutedPostIds, setMutedPostIds] = useState<Record<string, boolean>>({});
  const [carouselIndexByPostId, setCarouselIndexByPostId] = useState<Record<string, number>>({});
  const [likeBurstPostId, setLikeBurstPostId] = useState("");
  const [isVideoSoundEnabled, setIsVideoSoundEnabled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [publishTasks, setPublishTasks] = useState<PublishQueueTask[]>(() => getPublishQueueSnapshot());
  const slideAnim = useRef(new Animated.Value(0)).current;
  const hasFeedContentRef = useRef(false);
  const feedScrollTransitionRef = useRef(false);
  const feedScrollResumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastViewablePostIdRef = useRef("");
  const postTapRef = useRef<{ id: string; time: number; timeout: ReturnType<typeof setTimeout> | null }>({
    id: "",
    time: 0,
    timeout: null,
  });
  const isTabletLayout = width >= 768;
  const isCompactPhone = width < 360;
  const isMediumPhone = width < 430;
  const feedHorizontalInset = isTabletLayout ? 18 : isCompactPhone ? 8 : 10;
  const storyRailVerticalInset = isTabletLayout ? 12 : width < 360 ? 8 : 10;
  const storyItemWidth = isTabletLayout ? 86 : width < 360 ? 68 : 76;
  const storyRingSize = isTabletLayout ? 72 : width < 360 ? 58 : 64;
  const storyAvatarSize = storyRingSize - 7;
  const storyAddBadgeSize = width < 360 ? 16 : 18;
  const postCardRadius = isTabletLayout ? 16 : isCompactPhone ? 10 : 12;
  const postHeaderPadding = isTabletLayout ? 14 : isCompactPhone ? 10 : 11;
  const postBodyInset = postHeaderPadding + 2;
  const postActionButtonSize = isCompactPhone ? 32 : isMediumPhone ? 35 : 36;
  const postMediaWidth = Math.max(width - feedHorizontalInset * 2, 0);
  const defaultPostMediaHeight = Math.round(
    Math.min(
      isTabletLayout ? 540 : 420,
      Math.max(isCompactPhone ? 280 : 320, postMediaWidth * (isTabletLayout ? 0.76 : 0.92)),
    ),
  );
  const sidebarWidth = Math.min(width - (width < 360 ? 16 : 24), isTabletLayout ? 380 : width < 360 ? 312 : 340);
  const isCompactSidebar = width < 360;
  const isCompactHeader = width < 430;
  const hasSellerAccount = Boolean(sellerAccount);
  const usernameFontSize = isTabletLayout ? 13.6 : isCompactPhone ? 12.2 : 12.8;
  const postTimeFontSize = isTabletLayout ? 11.6 : isCompactPhone ? 10.1 : 10.6;
  const captionFontSize = isTabletLayout ? 13.2 : isCompactPhone ? 12.2 : 12.7;
  const captionLineHeight = isTabletLayout ? 19 : isCompactPhone ? 17 : 18;
  const supportingFontSize = isTabletLayout ? 11.8 : isCompactPhone ? 10.2 : 10.7;
  const composerFontSize = isTabletLayout ? 13.1 : isCompactPhone ? 11.8 : 12.4;
  const mediaChipFontSize = isTabletLayout ? 10.8 : isCompactPhone ? 9.8 : 10.2;

  const sidebarTranslateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-sidebarWidth - 24, 0],
  });
  const activePost = useMemo(
    () => feed.posts.find((item) => item.id === activePostId) || null,
    [activePostId, feed.posts],
  );
  const activePublishTask = publishTasks[0] || null;
  const completedPublishTaskIdsRef = useRef<Set<string>>(new Set());
  const activePostRawMusicUrl = getMusicPlaybackUrl(activePost?.music);
  const activePostMusicUrl = normalizeMediaUrl(activePostRawMusicUrl);
  const activePostMusicStartMs = Math.max(0, Number(activePost?.music?.startTime || 0) * 1000);
  const activePostMusicDurationMs = getTrimmedMusicDurationMs(activePost?.music);
  const activePostMusicTrackKey = activePost
    ? `${activePost.id}:${activePostMusicUrl}:${activePostMusicStartMs}:${activePostMusicDurationMs}`
    : "";
  const activePostShouldPlayMusic = !!activePostId
    && !mutedPostIds[activePostId]
    && !activeSheet
    && isScreenFocused
    && !!activePostMusicUrl;
  useSegmentedMusicPlayback({
    rawUrl: activePostRawMusicUrl,
    normalizedUrl: activePostMusicUrl,
    trackKey: activePostMusicTrackKey,
    startMs: activePostMusicStartMs,
    durationMs: activePostMusicDurationMs,
    shouldPlay: activePostShouldPlayMusic,
  });

  const readSellerAccount = useCallback(async (): Promise<SellerAccountSummary | null> => {
    try {
      const res = await API.get("/seller/me");
      const seller = res.data?.seller;

      if (!seller || seller.onboardingCompleted === false) {
        return null;
      }

      return {
        id: String(seller._id || seller.id || ""),
        sellerName: String(seller.sellerName || ""),
        availabilityStatus: Boolean(seller.availabilityStatus),
      };
    } catch (error: any) {
      if (error?.response?.status !== 404) {
        console.log("sidebar seller lookup error:", error?.response?.data || error.message);
      }

      return null;
    }
  }, []);

  const readUnreadNotificationCount = useCallback(async (): Promise<number> => {
    try {
      const res = await API.get("/notifications");
      return Number(res.data?.unreadCount) || 0;
    } catch (error) {
      console.log("feed unread notification lookup error:", error);
      return 0;
    }
  }, []);

  const menuSections = useMemo(
    () => [
      {
        title: "Account",
        data: [
          { icon: "person-outline", label: "My Profile", screen: "ProfileView" },
          { icon: "wallet-outline", label: "User Dashboard", screen: "WalletScreen" },
          { icon: "notifications-outline", label: "Notifications", screen: "NotificationScreen" },
        ],
      },
      {
        title: "Growth",
        data: [
          { icon: "megaphone-outline", label: "Promotions", screen: "HowToEarnScreen" },
          { icon: "cash-outline", label: "How to Earn", screen: "HowToEarnScreen" },
          hasSellerAccount
            ? { icon: "briefcase-outline", label: "Seller Workspace", screen: "SellerDashboardScreen" }
            : { icon: "storefront-outline", label: "Become a Seller", screen: "SellerRegistration" },
        ],
      },
      {
        title: "Support",
        data: [
          { icon: "settings-outline", label: "Settings", screen: "SettingsScreen" },
          { icon: "help-circle-outline", label: "Help & Support", screen: "HelpSupportScreen" },
        ],
      },
    ],
    [hasSellerAccount],
  );

  const readWalletBalance = useCallback(async (): Promise<number> => {
    try {
      const response = await API.get("/wallet");
      return Number(response?.data?.wallet?.balance || 0);
    } catch {
      return 0;
    }
  }, []);

  const loadFeedSnapshot = useCallback(async () => {
    const [data, storedUser, seller, unreadNotifications, liveStreamsResponse, walletBalance] = await Promise.all([
      socialApi.getFeed(),
      getStoredUser(),
      readSellerAccount(),
      readUnreadNotificationCount(),
      listLiveStreams().catch(() => ({ liveStreams: [] })),
      readWalletBalance(),
    ]);

    return {
      data,
      storedUser,
      seller,
      unreadNotifications,
      walletBalance,
      liveStories: Array.isArray(liveStreamsResponse?.liveStreams) ? liveStreamsResponse.liveStreams : [],
    };
  }, [readSellerAccount, readUnreadNotificationCount, readWalletBalance]);

  const applyFeedSnapshot = useCallback((snapshot: any) => {
    const { data, liveStories: nextLiveStories, seller, storedUser, unreadNotifications, walletBalance } = snapshot;

    setFeed({ ...data, posts: buildMixedLatestFeedPosts(data.posts) });
    setLiveStories(nextLiveStories);
    setPage(1);
    setHasMore(data.posts.length >= 20);
    setCurrentUser(
      storedUser
        ? {
          id: String(storedUser._id || storedUser.id || ""),
          avatarUrl: storedUser.profilePic || storedUser.avatarUrl || "",
          username: String(storedUser.username || ""),
          name: String(storedUser.name || ""),
          followingIds: Array.isArray(storedUser.following)
            ? storedUser.following.map((entry: any) => String(entry?._id || entry?.id || entry || "")).filter(Boolean)
            : [],
        }
        : null,
    );
    setSellerAccount(seller);
    setUnreadNotificationCount(unreadNotifications);
    setWalletCoinBalance(walletBalance);
    setErrorMessage("");
  }, []);

  const loadFeed = useCallback(async () => {
    const snapshot = await loadFeedSnapshot();
    applyFeedSnapshot(snapshot);
  }, [applyFeedSnapshot, loadFeedSnapshot]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const run = async () => {
        const shouldShowInitialLoader = !hasFeedContentRef.current;

        try {
          if (shouldShowInitialLoader) {
            setLoading(true);
          }

          const snapshot = await loadFeedSnapshot();
          if (active) {
            applyFeedSnapshot(snapshot);
          }
        } catch (error) {
          if (active) {
            if (shouldShowInitialLoader) {
              setFeed(initialFeed);
              setLiveStories([]);
            }
            setErrorMessage(getReadableApiErrorMessage(error, "Failed to load your feed."));
          }
        } finally {
          if (active) {
            setLoading(false);
            setRefreshing(false);
          }
        }
      };

      run();

      return () => {
        active = false;
      };
    }, [applyFeedSnapshot, loadFeedSnapshot]),
  );

  useEffect(() => {
    hasFeedContentRef.current = feed.posts.length > 0;
  }, [feed.posts.length]);

  useEffect(() => {
    return subscribePublishQueue(setPublishTasks);
  }, []);

  useEffect(() => {
    const completedTask = publishTasks.find(
      (task) => task.status === "success" && !completedPublishTaskIdsRef.current.has(task.id),
    );

    if (!completedTask) {
      return;
    }

    completedPublishTaskIdsRef.current.add(completedTask.id);
    loadFeed().catch(() => undefined);
  }, [loadFeed, publishTasks]);

  useEffect(() => {
    connectSocket().catch((error) => {
      console.log("feed socket connect error:", error);
    });

    const handleRealtimeNotification = () => {
      setUnreadNotificationCount((current) => current + 1);
      listLiveStreams()
        .then((response) => {
          setLiveStories(Array.isArray(response?.liveStreams) ? response.liveStreams : []);
        })
        .catch(() => {});
    };

    socket.on("receiveNotification", handleRealtimeNotification);

    return () => {
      socket.off("receiveNotification", handleRealtimeNotification);
    };
  }, []);

  useEffect(() => {
    if (!isScreenFocused || !feed.posts.length) {
      setActivePostId("");
      return;
    }

    setActivePostId((current) => (current && feed.posts.some((item) => item.id === current) ? current : feed.posts[0].id));
  }, [feed.posts, isScreenFocused]);

  useEffect(() => {
    return () => {
      if (postTapRef.current.timeout) {
        clearTimeout(postTapRef.current.timeout);
      }
      if (feedScrollResumeTimeoutRef.current) {
        clearTimeout(feedScrollResumeTimeoutRef.current);
      }
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadFeed();
    } finally {
      setRefreshing(false);
    }
  };

  const updatePost = (nextPost: Post) => {
    setFeed((prev) => ({
      ...prev,
      posts: prev.posts.map((item) => (item.id === nextPost.id ? nextPost : item)),
    }));
  };

  const handleLike = async (postId: string) => {
    if (isActionBusy[`like_${postId}`]) {
      return;
    }

    setIsActionBusy((prev) => ({ ...prev, [`like_${postId}`]: true }));
    try {
      const currentPost = feed.posts.find((item) => item.id === postId);
      const updated = await socialApi.togglePostLike(postId);
      const previewUsers = Array.isArray(currentPost?.likePreviewUsers) ? currentPost.likePreviewUsers : [];
      const nextPreviewUsers = updated?.liked
        ? [
            {
              id: currentUser?.id || "",
              username: currentUser?.username || "",
              name: currentUser?.name || "",
              avatarUrl: currentUser?.avatarUrl || DEFAULT_AVATAR_URL,
            },
            ...previewUsers.filter((user) => String(user?.id || "") !== String(currentUser?.id || "")),
          ].filter((user) => !!String(user?.id || "").trim()).slice(0, 3)
        : previewUsers.filter((user) => String(user?.id || "") !== String(currentUser?.id || "")).slice(0, 3);

      updatePost({
        ...updated,
        likePreviewUsers: nextPreviewUsers.length
          ? nextPreviewUsers
          : Array.isArray(updated?.likePreviewUsers)
            ? updated.likePreviewUsers
            : previewUsers,
      });
    } catch (error) {
      Alert.alert("Could not like post", toUserSafeMessage(error));
    } finally {
      setIsActionBusy((prev) => ({ ...prev, [`like_${postId}`]: false }));
    }
  };

  const handleSave = async (postId: string) => {
    if (isActionBusy[`save_${postId}`]) {
      return;
    }

    setIsActionBusy((prev) => ({ ...prev, [`save_${postId}`]: true }));
    try {
      const updated = await socialApi.togglePostSave(postId);
      updatePost(updated);
    } catch (error) {
      Alert.alert("Could not save post", toUserSafeMessage(error));
    } finally {
      setIsActionBusy((prev) => ({ ...prev, [`save_${postId}`]: false }));
    }
  };

  const togglePostMute = useCallback((postId: string) => {
    setMutedPostIds((prev) => ({ ...prev, [postId]: !prev[postId] }));
  }, []);

  const triggerLikeBurst = useCallback((postId: string) => {
    setLikeBurstPostId(postId);
    setTimeout(() => {
      setLikeBurstPostId((current) => (current === postId ? "" : current));
    }, 720);
  }, []);

  const restoreActiveVisiblePost = useCallback(() => {
    if (feedScrollResumeTimeoutRef.current) {
      clearTimeout(feedScrollResumeTimeoutRef.current);
      feedScrollResumeTimeoutRef.current = null;
    }

    feedScrollTransitionRef.current = false;

    if (!isScreenFocused || activeSheet) {
      setActivePostId("");
      return;
    }

    const nextActivePostId = lastViewablePostIdRef.current || feed.posts[0]?.id || "";
    setActivePostId(nextActivePostId);
  }, [activeSheet, feed.posts, isScreenFocused]);

  const pauseActiveVisiblePost = useCallback(() => {
    if (feedScrollResumeTimeoutRef.current) {
      clearTimeout(feedScrollResumeTimeoutRef.current);
      feedScrollResumeTimeoutRef.current = null;
    }

    feedScrollTransitionRef.current = true;
    setActivePostId("");
  }, []);

  const scheduleRestoreActiveVisiblePost = useCallback((delay = 80) => {
    if (feedScrollResumeTimeoutRef.current) {
      clearTimeout(feedScrollResumeTimeoutRef.current);
    }

    feedScrollResumeTimeoutRef.current = setTimeout(() => {
      restoreActiveVisiblePost();
    }, delay);
  }, [restoreActiveVisiblePost]);

  const handlePostMediaPress = (post: Post) => {
    const now = Date.now();
    const lastTap = postTapRef.current;
    const hasAudioLayer =
      post.media.some((asset) => asset.mediaType === "video")
      || !!getMusicPlaybackUrl(post.music)
      || !!getMusicPlaybackUrl(post.music);

    if (lastTap.id === post.id && now - lastTap.time < 260) {
      if (lastTap.timeout) {
        clearTimeout(lastTap.timeout);
      }
      postTapRef.current = { id: "", time: 0, timeout: null };
      triggerLikeBurst(post.id);
      handleLike(post.id).catch(() => undefined);
      return;
    }

    const timeout = setTimeout(() => {
      if (hasAudioLayer) {
        togglePostMute(post.id);
      }
      postTapRef.current = { id: "", time: 0, timeout: null };
    }, 260);

    postTapRef.current = {
      id: post.id,
      time: now,
      timeout,
    };
  };

  const getPostMediaHeight = useCallback((post: Post) => {
    const aspectRatio = getPostAspectRatio(post);
    const resolvedHeight = Math.round(postMediaWidth / aspectRatio);
    const minMediaHeight = Math.max(width < 360 ? 240 : 260, Math.round(postMediaWidth * 0.58));
    const maxMediaHeight = Math.round(
      Math.min(
        isTabletLayout ? height * 0.72 : height * 0.62,
        isTabletLayout ? 720 : 620,
      ),
    );

    return Math.max(
      minMediaHeight,
      Math.min(maxMediaHeight, resolvedHeight || defaultPostMediaHeight),
    );
  }, [defaultPostMediaHeight, height, isTabletLayout, postMediaWidth, width]);

  const submitComment = async (postId: string, audioFile?: CommentAudioFile) => {
    const draft = (commentDrafts[postId] || "").trim();
    if ((!draft && !audioFile?.uri) || isActionBusy[`comment_${postId}`]) {
      return;
    }

    setIsActionBusy((prev) => ({ ...prev, [`comment_${postId}`]: true }));

    try {
      await socialApi.addPostComment(postId, draft, undefined, audioFile);
      const latestPost = feed.posts.find((item) => item.id === postId);

      if (latestPost) {
        updatePost({
          ...latestPost,
          commentsCount: latestPost.commentsCount + 1,
        });
      }

      setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
    } catch (error) {
      Alert.alert(audioFile?.uri ? "Could not send voice comment" : "Could not comment", toUserSafeMessage(error));
    } finally {
      setIsActionBusy((prev) => ({ ...prev, [`comment_${postId}`]: false }));
    }
  };

  const handleCommentSubmit = async (postId: string) => {
    await submitComment(postId);
  };

  const handleDownload = async (post: Post) => {
    const primaryImage = post.media.find((asset) => asset.mediaType === "image");
    if (!primaryImage?.url || isActionBusy[`download_${post.id}`]) {
      return;
    }

    setIsActionBusy((prev) => ({ ...prev, [`download_${post.id}`]: true }));
    try {
      const fileUri = await downloadImageAsset(primaryImage.url, `aline2_post_${post.id}`);
      if (/^file:\/\//i.test(fileUri)) {
        Alert.alert("Downloaded", `Image saved to:\n${fileUri}`);
      } else {
        Alert.alert("Download ready", "The download or share sheet has been opened for this image.");
      }
    } catch (error) {
      const errorMessage = String((error as { message?: string })?.message || "");
      if (!errorMessage.toLowerCase().includes("cancel")) {
        Alert.alert("Could not download image", toUserSafeMessage(error));
      }
    } finally {
      setIsActionBusy((prev) => ({ ...prev, [`download_${post.id}`]: false }));
    }
  };

  const openPostDetail = useCallback((post: Post) => {
    if (String(post?.user?.id || "") !== String(currentUser?.id || "")) {
      return;
    }

    navigation.navigate("PostDetail", { postId: post.id });
  }, [currentUser?.id, navigation]);

  const openUserProfile = useCallback((userId: string) => {
    const normalizedUserId = String(userId || "");
    if (!normalizedUserId) {
      return;
    }

    if (normalizedUserId === String(currentUser?.id || "")) {
      navigation.navigate("Profile");
      return;
    }

    navigation.navigate("ProfilePreviewScreen", { userId: normalizedUserId });
  }, [currentUser?.id, navigation]);

  const openMentionProfile = useCallback(async (username: string) => {
    const normalizedUsername = String(username || "").replace(/^@/, "").trim();
    if (!normalizedUsername) {
      return;
    }

    const resolvedUserId = await resolveMentionUserId(normalizedUsername);
    if (!resolvedUserId) {
      Alert.alert("Profile unavailable", "This profile could not be opened right now.");
      return;
    }

    if (resolvedUserId === String(currentUser?.id || "")) {
      navigation.navigate("Profile");
      return;
    }

    navigation.navigate("ProfilePreviewScreen", { userId: resolvedUserId });
  }, [currentUser?.id, navigation]);

  const openHashtagResults = useCallback((tag: string) => {
    const normalizedTag = String(tag || "").replace(/^#/, "").trim();
    if (!normalizedTag) {
      return;
    }

    navigation.navigate("HashtagResultsScreen", { hashtag: normalizedTag });
  }, [navigation]);

  const openLocationSearch = useCallback((location: string) => {
    const normalizedLocation = String(location || "").trim();
    if (!normalizedLocation) {
      return;
    }

    navigation.navigate("Search", { initialQuery: normalizedLocation });
  }, [navigation]);

  const renderPostMetaChips = useCallback((item: Post, paddingHorizontal: number) => {
    const musicLabel = formatPostMusicLabel(item.music);
    const chips = [
      item.location
        ? (
          <TouchableOpacity key={`location_${item.id}`} style={styles.metaChip} onPress={() => openLocationSearch(item.location || "")}>
            <Icon name="location-outline" size={12} color={colors.mutedText} />
            <Text style={[styles.metaChipText, { color: colors.text }]} numberOfLines={1}>
              {item.location}
            </Text>
          </TouchableOpacity>
        )
        : null,
      musicLabel
        ? (
          <TouchableOpacity key={`music_${item.id}`} style={styles.metaChip} onPress={() => navigation.navigate("PostDetail", { postId: item.id })}>
            <Icon name="musical-notes-outline" size={12} color={colors.mutedText} />
            <Text style={[styles.metaChipText, { color: colors.text }]} numberOfLines={1}>
              {musicLabel}
            </Text>
          </TouchableOpacity>
        )
        : null,
      ...item.hashtags.slice(0, 3).map((tag) => (
        <TouchableOpacity key={`tag_${item.id}_${tag}`} style={styles.metaChip} onPress={() => openHashtagResults(tag)}>
          <Text style={[styles.metaChipText, { color: FEED_ACCENT }]} numberOfLines={1}>
            #{tag}
          </Text>
        </TouchableOpacity>
      )),
    ].filter(Boolean);

    if (!chips.length) {
      return null;
    }

    return (
      <View style={[styles.metaChipRow, { paddingHorizontal }]}>
        {chips}
      </View>
    );
  }, [colors.mutedText, colors.text, navigation, openHashtagResults, openLocationSearch]);

  const getFeedRelationship = useCallback((postUser: Post["user"]) => {
    const viewerId = String(currentUser?.id || "");
    const normalizedUserId = String(postUser?.id || "");

    if (!viewerId || !normalizedUserId || viewerId === normalizedUserId) {
      return { kind: "self" as FeedRelationshipKind, label: "" };
    }

    const viewerFollowingIds = Array.isArray(currentUser?.followingIds) ? currentUser.followingIds : [];
    const viewerFollows = typeof postUser?.viewerFollows === "boolean"
      ? postUser.viewerFollows
      : viewerFollowingIds.includes(normalizedUserId);
    const followsViewer = typeof postUser?.followsViewer === "boolean"
      ? postUser.followsViewer
      : Array.isArray(postUser?.followingIds)
        ? postUser.followingIds.includes(viewerId)
        : false;

    if (viewerFollows && followsViewer) {
      return { kind: "message" as FeedRelationshipKind, label: "Message" };
    }

    if (!viewerFollows && followsViewer) {
      return { kind: "follow_back" as FeedRelationshipKind, label: "Follow back" };
    }

    if (viewerFollows) {
      return { kind: "following" as FeedRelationshipKind, label: "Following" };
    }

    return { kind: "follow" as FeedRelationshipKind, label: "Follow" };
  }, [currentUser?.followingIds, currentUser?.id]);

  const handleFeedRelationshipPress = useCallback(async (postUser: Post["user"]) => {
    const relationship = getFeedRelationship(postUser);
    const normalizedUserId = String(postUser?.id || "");

    if (!normalizedUserId || relationship.kind === "self") {
      return;
    }

    if (relationship.kind === "message") {
      navigation.navigate("ChatScreen", {
        userId: normalizedUserId,
        conversationType: "direct",
      });
      return;
    }

    if (relationship.kind === "following") {
      openUserProfile(normalizedUserId);
      return;
    }

    const busyKey = `follow_${normalizedUserId}`;
    if (isActionBusy[busyKey]) {
      return;
    }

    try {
      setIsActionBusy((prev) => ({ ...prev, [busyKey]: true }));
      await API.post(`/auth/follow/${normalizedUserId}`);

      setCurrentUser((prev) => prev
        ? {
            ...prev,
            followingIds: Array.from(new Set([...(prev.followingIds || []), normalizedUserId])),
          }
        : prev);
      setFeed((prev) => ({
        ...prev,
        posts: prev.posts.map((post) =>
          post.user.id === normalizedUserId
            ? {
                ...post,
                user: {
                  ...post.user,
                  viewerFollows: true,
                  followerIds: Array.from(
                    new Set([...(post.user.followerIds || []), String(currentUser?.id || "")].filter(Boolean)),
                  ),
                },
              }
            : post,
        ),
      }));
    } catch (error) {
      Alert.alert("Follow failed", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setIsActionBusy((prev) => ({ ...prev, [busyKey]: false }));
    }
  }, [currentUser?.id, getFeedRelationship, isActionBusy, navigation, openUserProfile]);

  const renderFeedRelationshipButton = useCallback((postUser: Post["user"]) => {
    const relationship = getFeedRelationship(postUser);
    if (relationship.kind === "self") {
      return null;
    }

    const busyKey = `follow_${String(postUser?.id || "")}`;
    const isBusy = !!isActionBusy[busyKey];
    const isPrimary = relationship.kind === "follow" || relationship.kind === "follow_back";

    return (
      <TouchableOpacity
        activeOpacity={0.86}
        style={[
          styles.followBadge,
          isPrimary ? styles.followBadgePrimary : styles.followBadgeSecondary,
          {
            backgroundColor: isPrimary ? colors.primary : feedAccentSoft,
            borderColor: isPrimary ? colors.primary : feedAccentBorder,
          },
        ]}
        onPress={() => handleFeedRelationshipPress(postUser)}
        disabled={isBusy}
      >
        {isBusy ? (
          <ActivityIndicator size="small" color={isPrimary ? "#fff" : colors.primary} />
        ) : (
          <Text style={[styles.followBadgeText, { color: isPrimary ? "#fff" : colors.text }]}>
            {relationship.label}
          </Text>
        )}
      </TouchableOpacity>
    );
  }, [colors.primary, colors.text, feedAccentBorder, feedAccentSoft, getFeedRelationship, handleFeedRelationshipPress, isActionBusy]);

  const closeSheet = () => {
    setActiveSheet(null);
    setSelectedPost(null);
  };

  const animateMenu = useCallback((nextOpen: boolean) => {
    setMenuOpen(nextOpen);
    Animated.timing(slideAnim, {
      toValue: nextOpen ? 1 : 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  const toggleMenu = useCallback(() => {
    animateMenu(!menuOpen);
  }, [animateMenu, menuOpen]);

  const closeMenu = useCallback(() => {
    animateMenu(false);
  }, [animateMenu]);

  const openNotifications = useCallback(() => {
    setUnreadNotificationCount(0);
    navigation.navigate("NotificationScreen");
    API.put("/notifications/read-all").catch(() => {});
  }, [navigation]);

  const openWalletDashboard = useCallback(() => {
    navigation.navigate("WalletScreen");
  }, [navigation]);

  const navigateFromMenu = useCallback((screen: string) => {
    closeMenu();
    if (screen === "NotificationScreen") {
      setUnreadNotificationCount(0);
      API.put("/notifications/read-all").catch(() => {});
    }
    navigation.navigate(screen);
  }, [closeMenu, navigation]);

  const toggleSellerAvailability = useCallback(async (nextStatus: boolean) => {
    if (!sellerAccount || availabilityUpdating) {
      return;
    }

    const previousStatus = sellerAccount.availabilityStatus;
    setAvailabilityUpdating(true);
    setSellerAccount((current) =>
      current
        ? {
          ...current,
          availabilityStatus: nextStatus,
        }
        : current,
    );

    try {
      await API.put("/seller/update-availability", { availabilityStatus: nextStatus });
      showAvailabilityStatusModal(nextStatus);
    } catch (error) {
      setSellerAccount((current) =>
        current
          ? {
            ...current,
            availabilityStatus: previousStatus,
          }
          : current,
      );
      Alert.alert("Unable to update availability", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setAvailabilityUpdating(false);
    }
  }, [availabilityUpdating, sellerAccount]);

  const openPostComments = (postId: string) => {
    navigation.navigate("PostComments", { postId });
  };

  const openContentActions = (post: Post) => {
    setSelectedPost(post);
    setActiveSheet("actions");
  };

  const openPostCommentsSheet = (post: Post) => {
    setSelectedPost(post);
    setActiveSheet("comments");
  };

  const openPostShareSheet = (post: Post) => {
    setSelectedPost(post);
    setActiveSheet("share");
  };

  const renderStory = ({ item }: { item: Story }) => {
    const closeFriends = item.visibility === "close_friends";
    const storyAvatar = normalizeMediaUrl(item.user.avatarUrl || DEFAULT_AVATAR_URL);
    const ringSizeStyle = {
      width: storyRingSize,
      height: storyRingSize,
      borderRadius: storyRingSize / 2,
    };
    const ringInnerSize = Math.max(storyRingSize - (item.viewed ? 8 : 6), storyAvatarSize + 4);
    const ringInnerStyle = {
      width: ringInnerSize,
      height: ringInnerSize,
      borderRadius: ringInnerSize / 2,
    };
    const avatarStyle = {
      width: storyAvatarSize,
      height: storyAvatarSize,
      borderRadius: storyAvatarSize / 2,
    };
    const storyRingColors = closeFriends
      ? ["#34d399", "#22c55e", "#15803d"]
      : ["#f9ce34", "#f97316", "#ee2a7b", "#8b5cf6"];

    return (
      <TouchableOpacity
        style={[styles.storyItem, { width: storyItemWidth }]}
        onPress={() => navigation.navigate("StoryViewer", { storyId: item.id })}
      >
        {item.viewed ? (
          <View
            style={[
              styles.storyRing,
              styles.storyRingSeen,
              closeFriends && styles.storyRingCloseFriendsSeen,
              ringSizeStyle,
            ]}
          >
            <Image
              source={{ uri: storyAvatar }}
              style={[styles.storyAvatar, avatarStyle]}
            />
          </View>
        ) : (
          <LinearGradient
            colors={storyRingColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.storyRingGradient, ringSizeStyle]}
          >
            <View style={[styles.storyRingInner, ringInnerStyle, { backgroundColor: colors.card }]}>
              <Image
                source={{ uri: storyAvatar }}
                style={[styles.storyAvatar, avatarStyle]}
              />
            </View>
          </LinearGradient>
        )}
        <Text style={[styles.storyName, { color: colors.text }]} numberOfLines={1}>
          {item.user.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderPostMedia = (post: Post) => {
    const mediaHeight = getPostMediaHeight(post);
    const frameAspectRatio = postMediaWidth / Math.max(1, mediaHeight);
    const currentCarouselIndex = carouselIndexByPostId[post.id] || 0;
    const hasAttachedMusic = !!getMusicPlaybackUrl(post.music);
    const isMuted = !!mutedPostIds[post.id];
    const isPostActive = activePostId === post.id && isScreenFocused && !activeSheet;
    const renderSensitiveBadge = (label?: string) => (
      <View pointerEvents="none" style={styles.sensitiveBadge}>
        <Text style={styles.sensitiveBadgeText}>{label ? `${label} sensitive content` : "Sensitive content"}</Text>
      </View>
    );

    if (post.type !== "carousel") {
      const primaryMedia = post.media[0];
      if (!primaryMedia?.url) {
        return <View style={[styles.postImage, styles.mediaFallback, { width: postMediaWidth, height: mediaHeight }]} />;
      }

      if (primaryMedia?.mediaType === "video") {
        return (
          <View>
            <SocialVideo
              uri={normalizeMediaUrl(primaryMedia.url)}
              posterUri={normalizeMediaUrl(primaryMedia.thumbnailUrl || primaryMedia.url)}
              style={[styles.postImage, { width: postMediaWidth, height: mediaHeight }]}
              paused={!isPostActive}
              muted={isMuted || hasAttachedMusic}
              repeat
              resizeMode={getImageResizeMode(primaryMedia, frameAspectRatio)}
              contentBlurRadius={primaryMedia.sensitiveContent?.isSensitive ? 22 : 0}
            />
            {primaryMedia.sensitiveContent?.isSensitive ? renderSensitiveBadge(primaryMedia.sensitiveContent.label) : null}
          </View>
        );
      }

      const imageResizeMode = getImageResizeMode(primaryMedia, frameAspectRatio);
      const rawImage = (
        <View>
          <ProgressiveImage
            uri={normalizeMediaUrl(primaryMedia?.url)}
            previewUri={normalizeMediaUrl(primaryMedia?.thumbnailUrl || primaryMedia?.url)}
            style={[styles.postImage, { width: postMediaWidth, height: mediaHeight }]}
            resizeMode={imageResizeMode}
            contentBlurRadius={primaryMedia?.sensitiveContent?.isSensitive ? 22 : 0}
          />
          {primaryMedia?.sensitiveContent?.isSensitive ? renderSensitiveBadge(primaryMedia.sensitiveContent.label) : null}
        </View>
      );

      if (post.filterPreset && ColorMatrix && !primaryMedia?.sensitiveContent?.isSensitive) {
        const activeFilter = PHOTO_FILTER_LIST.find((f) => f.id === post.filterPreset);
        if (activeFilter && activeFilter.matrix) {
          return (
            <ColorMatrix matrix={activeFilter.matrix}>
              <Image
                source={{ uri: normalizeMediaUrl(primaryMedia?.url) }}
                style={[styles.postImage, { width: postMediaWidth, height: mediaHeight }]}
                resizeMode={imageResizeMode}
              />
            </ColorMatrix>
          );
        }
      }

      return rawImage;
    }

    return (
      <View style={styles.carouselWrap}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            const nextIndex = Math.round(
              Number(event?.nativeEvent?.contentOffset?.x || 0) / Math.max(1, postMediaWidth),
            );
            setCarouselIndexByPostId((prev) => ({ ...prev, [post.id]: nextIndex }));
          }}
        >
          {post.media.map((asset, index) => (
            asset.mediaType === "video" ? (
              <View key={asset.id}>
                <SocialVideo
                  uri={normalizeMediaUrl(asset.url)}
                  posterUri={normalizeMediaUrl(asset.thumbnailUrl || asset.url)}
                  style={[styles.postImage, { width: postMediaWidth, height: mediaHeight }]}
                  paused={!isPostActive || currentCarouselIndex !== index}
                  muted={isMuted || hasAttachedMusic}
                  repeat
                  resizeMode={getImageResizeMode(asset, frameAspectRatio)}
                  contentBlurRadius={asset.sensitiveContent?.isSensitive ? 22 : 0}
                />
                {asset.sensitiveContent?.isSensitive ? renderSensitiveBadge(asset.sensitiveContent.label) : null}
              </View>
            ) : (
              (() => {
                const imageResizeMode = getImageResizeMode(asset, frameAspectRatio);
                const rawImage = (
                  <View key={asset.id}>
                    <ProgressiveImage
                      uri={normalizeMediaUrl(asset.url)}
                      previewUri={normalizeMediaUrl(asset.thumbnailUrl || asset.url)}
                      style={[styles.postImage, { width: postMediaWidth, height: mediaHeight }]}
                      resizeMode={imageResizeMode}
                      contentBlurRadius={asset.sensitiveContent?.isSensitive ? 22 : 0}
                    />
                    {asset.sensitiveContent?.isSensitive ? renderSensitiveBadge(asset.sensitiveContent.label) : null}
                  </View>
                );

                if (post.filterPreset && ColorMatrix && !asset.sensitiveContent?.isSensitive) {
                  const activeFilter = PHOTO_FILTER_LIST.find((f) => f.id === post.filterPreset);
                  if (activeFilter && activeFilter.matrix) {
                    return (
                      <View key={asset.id}>
                        <ColorMatrix matrix={activeFilter.matrix}>
                          <Image
                            source={{ uri: normalizeMediaUrl(asset.url) }}
                            style={[styles.postImage, { width: postMediaWidth, height: mediaHeight }]}
                            resizeMode={imageResizeMode}
                          />
                        </ColorMatrix>
                      </View>
                    );
                  }
                }

                return rawImage;
              })()
            )
          ))}
        </ScrollView>
        <View style={styles.carouselIndicatorRow}>
          {post.media.map((asset, index) => (
            <View
              key={`${post.id}-indicator-${asset.id}`}
              style={[
                styles.carouselIndicatorDot,
                index === currentCarouselIndex && styles.carouselIndicatorDotActive,
              ]}
            />
          ))}
        </View>
      </View>
    );
  };

  const renderLiveStory = (item: any) => {
    const liveAvatar = normalizeMediaUrl(item?.hostUser?.profilePic || item?.hostSeller?.profilePic || DEFAULT_AVATAR_URL);
    const liveLabel = String(item?.hostDisplayName || item?.hostUser?.name || item?.hostUser?.username || "Live").trim();

    return (
      <TouchableOpacity
        key={`live-${item?._id}`}
        style={[styles.storyItem, { width: storyItemWidth }]}
        onPress={() =>
          navigation.navigate("LiveStreamScreen", {
            liveStreamId: item?._id,
            initialLiveStream: item,
            mode: item?.isHost ? "host" : "viewer",
          })
        }
      >
        <View
          style={[
            styles.storyRing,
            styles.liveStoryRing,
            { width: storyRingSize, height: storyRingSize, borderRadius: storyRingSize / 2 },
          ]}
        >
          <Image
            source={{ uri: liveAvatar }}
            style={[styles.storyAvatar, { width: storyAvatarSize, height: storyAvatarSize, borderRadius: storyAvatarSize / 2 }]}
          />
          <View style={styles.liveStoryBadge}>
            <Icon name="radio" size={10} color="#fff" />
            <Text style={styles.liveStoryBadgeText}>LIVE</Text>
          </View>
        </View>
        <Text style={[styles.storyName, { color: colors.text }]} numberOfLines={1}>
          {liveLabel}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderPostStickerOverlay = (post: Post) => {
    if (!post.stickers?.length) {
      return null;
    }

    return (
      <View pointerEvents="none" style={styles.postStickerLayer}>
        {post.stickers.map((sticker) => {
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
              <View key={sticker.id} style={[styles.postEmojiSticker, baseStyle]}>
                <Text
                  style={[
                    styles.postEmojiStickerText,
                    sticker.style?.fontSize ? { fontSize: sticker.style.fontSize } : null,
                  ]}
                >
                  {sticker.text}
                </Text>
              </View>
            );
          }

          return (
            <View
              key={sticker.id}
              style={[
                styles.postTextSticker,
                baseStyle,
                sticker.style?.backgroundColor ? { backgroundColor: sticker.style.backgroundColor } : null,
              ]}
            >
              <Text
                style={[
                  styles.postTextStickerText,
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

  const renderPost = ({ item }: { item: Post }) => {
    const hasVideoMedia = item.media.some((asset) => asset.mediaType === "video");
    const musicLabel = formatPostMusicLabel(item.music);
    const hasAttachedMusic = !!getMusicPlaybackUrl(item.music);
    const isMuted = !!mutedPostIds[item.id];
    const likeAvatarUrl =
      (item.liked ? currentUser?.avatarUrl : "") || item.user.avatarUrl || DEFAULT_AVATAR_URL;
    void musicLabel;
    void hasAttachedMusic;
    void isMuted;
    const tokens: string[] = [getPostTypeTag(item)];

    if (item.location) {
      tokens.push(`📍 ${item.location}`);
    }

    if (item.music) {
      tokens.push(`🎵 ${item.music}`);
    }

    const metaLine = tokens.join(" • ");

    return (
      <View
        style={[
          styles.postCard,
          {
            marginHorizontal: feedHorizontalInset,
            borderRadius: postCardRadius,
            backgroundColor: colors.card,
            borderColor: feedAccentBorder,
          },
        ]}
      >
        <View
          style={[
            styles.postHeader,
            {
              paddingHorizontal: postHeaderPadding,
              paddingTop: postHeaderPadding,
              paddingBottom: Math.max(10, postHeaderPadding - 3),
            },
          ]}
        >
          <TouchableOpacity style={styles.postHeaderIdentity} onPress={() => openUserProfile(item.user.id)}>
            <AppAvatar
              uri={item.user.avatarUrl || DEFAULT_AVATAR_URL}
              name={item.user.name || item.user.username}
              size={width < 360 ? 38 : 42}
              style={[styles.postAvatar, width < 360 && styles.postAvatarCompact]}
            />
            <View style={styles.userMeta}>
              <View style={[styles.row, styles.usernameRow]}>
                <Text
                  style={[styles.username, styles.usernameText, { color: colors.text, fontSize: usernameFontSize }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {item.user.username}
                </Text>
                {shouldShowVerifiedBadge(item.user) ? (
                  <Icon style={styles.verifiedIcon} name="checkmark-circle" color={FEED_ACCENT} size={16} />
                ) : null}
              </View>
              <Text style={[styles.postTime, { color: colors.mutedText }]}>{formatAgo(item.createdAt)}</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.postHeaderActions}>
            <TouchableOpacity
              style={[
                styles.moreButton,
                {
                  width: postActionButtonSize - 2,
                  height: postActionButtonSize - 2,
                  borderRadius: Math.round((postActionButtonSize - 2) / 2),
                  backgroundColor: "transparent",
                  borderColor: "transparent",
                },
              ]}
              onPress={() => openContentActions(item)}
            >
              <Icon name="ellipsis-horizontal" size={20} color={FEED_ACCENT} />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={String(item.user.id) === String(currentUser?.id || "") ? 0.95 : 1}
          disabled={String(item.user.id) !== String(currentUser?.id || "")}
          onPress={() => openPostDetail(item)}
        >
          {renderPostMedia(item)}
          {renderPostStickerOverlay(item)}
        </TouchableOpacity>

        <View style={[styles.actionsRow, { paddingHorizontal: postHeaderPadding }]}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              {
                width: postActionButtonSize,
                height: postActionButtonSize,
                borderRadius: Math.round(postActionButtonSize / 2),
                backgroundColor: "transparent",
                borderColor: "transparent",
              },
            ]}
            onPress={() => handleLike(item.id)}
          >
            <Icon name={item.liked ? "heart" : "heart-outline"} size={23} color={item.liked ? "#f3425f" : colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionButton,
              {
                width: postActionButtonSize,
                height: postActionButtonSize,
                borderRadius: Math.round(postActionButtonSize / 2),
                backgroundColor: "transparent",
                borderColor: "transparent",
              },
            ]}
            onPress={() => openPostCommentsSheet(item)}
          >
            <Icon name="chatbubble-outline" size={22} color={FEED_ACCENT} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionButton,
              {
                width: postActionButtonSize,
                height: postActionButtonSize,
                borderRadius: Math.round(postActionButtonSize / 3.2),
                backgroundColor: feedAccentSoft,
                borderColor: feedAccentBorder,
              },
            ]}
            onPress={() => openPostShareSheet(item)}
          >
            <Icon name="paper-plane-outline" size={22} color={FEED_ACCENT} />
          </TouchableOpacity>

          {hasVideoMedia ? (
            <TouchableOpacity
              style={[
                styles.actionButton,
                {
                  width: postActionButtonSize,
                  height: postActionButtonSize,
                  borderRadius: Math.round(postActionButtonSize / 3.2),
                  backgroundColor: feedAccentSoft,
                  borderColor: feedAccentBorder,
                },
              ]}
              onPress={() => setIsVideoSoundEnabled((current) => !current)}
            >
              <Icon
                name={isVideoSoundEnabled ? "volume-high-outline" : "volume-mute-outline"}
                size={22}
                color={FEED_ACCENT}
              />
            </TouchableOpacity>
          ) : null}

          <View style={styles.trailingActions}>
            {item.type === "photo" ? (
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.trailingActionButton,
                  {
                    width: postActionButtonSize,
                    height: postActionButtonSize,
                    borderRadius: Math.round(postActionButtonSize / 3.2),
                    backgroundColor: feedAccentSoft,
                    borderColor: feedAccentBorder,
                  },
                ]}
                onPress={() => handleDownload(item)}
              >
                {isActionBusy[`download_${item.id}`] ? (
                  <ActivityIndicator size="small" color={FEED_ACCENT} />
                ) : (
                  <Icon name="download-outline" size={21} color={FEED_ACCENT} />
                )}
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.trailingActionButton,
                {
                  width: postActionButtonSize,
                  height: postActionButtonSize,
                  borderRadius: Math.round(postActionButtonSize / 3.2),
                  backgroundColor: feedAccentSoft,
                  borderColor: feedAccentBorder,
                },
              ]}
              onPress={() => handleSave(item.id)}
            >
              <Icon name={item.saved ? "bookmark" : "bookmark-outline"} size={22} color={FEED_ACCENT} />
            </TouchableOpacity>
          </View>
        </View>

        {!item.settings.hideLikeCount ? (
          <Text style={[styles.likesText, { paddingHorizontal: postBodyInset, color: colors.text, fontSize: supportingFontSize + 1 }]}>
            {formatCount(item.likesCount)} likes
          </Text>
        ) : null}

        <InteractiveText
          style={[
            styles.caption,
            { paddingHorizontal: postBodyInset, color: colors.text, fontSize: captionFontSize, lineHeight: captionLineHeight },
          ]}
          prefix={(
            <Text style={[styles.captionUser, { color: colors.text }]} onPress={() => openUserProfile(item.user.id)}>
              {item.user.username}{" "}
            </Text>
          )}
          mentionStyle={[styles.inlineEntity, { color: feedAccent }]}
          hashtagStyle={[styles.inlineEntity, { color: feedAccent }]}
          onPressMention={(mention) => {
            void openMentionProfile(mention);
          }}
          onPressHashtag={openHashtagResults}
          text={item.caption}
        />

        {item.mentions.length ? (
          <InteractiveText
            style={[styles.tagLineMuted, { paddingHorizontal: postBodyInset, color: colors.mutedText, fontSize: supportingFontSize }]}
            mentionStyle={[styles.inlineEntity, { color: feedAccent }]}
            onPressMention={(mention) => {
              void openMentionProfile(mention);
            }}
            text={item.mentions.map((mention) => `@${mention}`).join(" ")}
          />
        ) : null}

        {renderPostMetaChips(item, postBodyInset)}
        <Text style={[styles.metaLine, { paddingHorizontal: postBodyInset, color: colors.mutedText }]} numberOfLines={1}>
          {metaLine}
        </Text>

        {false ? (
          <Text style={[styles.collabLine, { color: colors.text }]}>Collab post • {item.collaboratorIds.length} collaborators</Text>
        ) : null}

        <TouchableOpacity onPress={() => openPostCommentsSheet(item)}>
          <Text style={[styles.commentCount, { paddingHorizontal: postBodyInset, color: colors.mutedText, fontSize: supportingFontSize }]}>
            View all {item.commentsCount} comments
          </Text>
        </TouchableOpacity>

        {!item.settings.disableComments ? (
          <View
            style={[
              styles.commentComposer,
              {
                marginHorizontal: postBodyInset,
                borderColor: feedAccentBorder,
                backgroundColor: feedAccentSoft,
              },
            ]}
          >
            <TextInput
              value={commentDrafts[item.id] || ""}
              onChangeText={(text) => setCommentDrafts((prev) => ({ ...prev, [item.id]: text }))}
              style={[styles.commentInput, { color: colors.text, fontSize: composerFontSize }]}
              placeholder="Add a comment..."
              placeholderTextColor={colors.mutedText}
            />
            <TouchableOpacity onPress={() => handleCommentSubmit(item.id)}>
              <Text style={[styles.postButton, { color: FEED_ACCENT, fontSize: composerFontSize }]}>
                {isCompactPhone ? "Send" : "Post"}
              </Text>
            </TouchableOpacity>
            <VoiceRecorderButton
              color={FEED_ACCENT}
              disabled={isActionBusy[`comment_${item.id}`]}
              onSend={(voiceFile) => {
                submitComment(item.id, voiceFile).catch((error) => {
                  Alert.alert("Could not send voice comment", toUserSafeMessage(error));
                });
              }}
            />
          </View>
        ) : (
          <Text style={[styles.commentsDisabled, { paddingHorizontal: postBodyInset, color: colors.mutedText, fontSize: supportingFontSize }]}>
            Comments limited for this post
          </Text>
        )}
      </View>
    );
  };

  const renderInstagramPost = ({ item }: { item: Post }) => {
    const hasVideoMedia = item.media.some((asset) => asset.mediaType === "video");
    const musicLabel = formatPostMusicLabel(item.music);
    const hasAttachedMusic = !!getMusicPlaybackUrl(item.music);
    const isMuted = !!mutedPostIds[item.id];
    const likePreviewUsers =
      Array.isArray(item.likePreviewUsers) && item.likePreviewUsers.length
        ? item.likePreviewUsers.slice(0, 3)
        : [];
    const hasLikeSummary = !item.settings.hideLikeCount && item.likesCount > 0;
    const latestLiker =
      likePreviewUsers.find((likeUser) => String(likeUser?.id || "") !== String(currentUser?.id || ""))
      || likePreviewUsers[0]
      || null;
    const latestLikerName = String(latestLiker?.name || latestLiker?.username || "").trim();
    const likeSummaryLabel = latestLikerName
      ? item.likesCount > 1
        ? `Liked by ${latestLikerName} and ${Math.max(1, item.likesCount - 1)} others`
        : `Liked by ${latestLikerName}`
      : item.likesCount === 1
        ? "1 like"
        : `${formatCount(item.likesCount)} likes`;

    return (
      <View
        style={[
          styles.postCard,
          styles.instagramPostCard,
          {
            marginHorizontal: feedHorizontalInset,
            borderRadius: postCardRadius,
            backgroundColor: colors.card,
            borderColor: "rgba(15,23,42,0.08)",
          },
        ]}
      >
        <View
          style={[
            styles.postHeader,
            {
              paddingHorizontal: postHeaderPadding,
              paddingTop: postHeaderPadding,
              paddingBottom: Math.max(12, postHeaderPadding - 2),
            },
          ]}
        >
          <TouchableOpacity style={styles.postHeaderIdentity} onPress={() => openUserProfile(item.user.id)}>
            <Image
              source={{ uri: item.user.avatarUrl || DEFAULT_AVATAR_URL }}
              style={[styles.postAvatar, width < 360 && styles.postAvatarCompact]}
            />
            <View style={styles.userMeta}>
              <View style={[styles.row, styles.usernameRow]}>
                <Text
                  style={[styles.username, styles.usernameText, { color: colors.text }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {item.user.username}
                </Text>
                {shouldShowVerifiedBadge(item.user) ? (
                  <Icon style={styles.verifiedIcon} name="checkmark-circle" color={FEED_ACCENT} size={16} />
                ) : null}
              </View>
              <Text style={[styles.postTime, { color: colors.mutedText, fontSize: postTimeFontSize }]}>
                {formatAgo(item.createdAt)}
              </Text>
            </View>
          </TouchableOpacity>
          <View style={styles.postHeaderActions}>
            <TouchableOpacity
              style={[
                styles.moreButton,
                {
                  width: postActionButtonSize - 2,
                  height: postActionButtonSize - 2,
                  borderRadius: Math.round((postActionButtonSize - 2) / 2),
                  backgroundColor: "transparent",
                  borderColor: "transparent",
                },
              ]}
              onPress={() => openContentActions(item)}
            >
              <Icon name="ellipsis-horizontal" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View
          style={[
            styles.mediaFrame,
            {
              marginHorizontal: 0,
              borderRadius: 0,
              borderColor: "transparent",
              backgroundColor: isDarkMode ? "#050816" : "#f6f8fc",
            },
          ]}
        >
          <Pressable onPress={() => handlePostMediaPress(item)} style={styles.mediaPressSurface}>
            {renderPostMedia(item)}
            {renderPostStickerOverlay(item)}
            {likeBurstPostId === item.id ? (
              <View pointerEvents="none" style={styles.likeBurstOverlay}>
                <Icon name="heart" size={88} color="rgba(255,255,255,0.92)" />
              </View>
            ) : null}
            {(hasVideoMedia || hasAttachedMusic) ? (
              <View style={[styles.mediaSoundHint, isCompactPhone && styles.mediaSoundHintCompact]}>
                <Icon name={isMuted ? "volume-mute-outline" : "volume-high-outline"} size={16} color="#fff" />
                <Text style={[styles.mediaSoundHintText, { fontSize: mediaChipFontSize }]}>
                  {isMuted ? "Muted" : "Sound on"}
                </Text>
              </View>
            ) : null}
            {musicLabel ? (
              <View style={[styles.mediaMusicChip, isCompactPhone && styles.mediaMusicChipCompact]}>
                <Icon name="musical-notes" size={13} color="#fff" />
                <Text numberOfLines={1} style={[styles.mediaMusicChipText, { fontSize: mediaChipFontSize }]}>
                  {musicLabel}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <View style={[styles.actionsRow, { paddingHorizontal: postHeaderPadding }]}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              {
                width: postActionButtonSize,
                height: postActionButtonSize,
                borderRadius: Math.round(postActionButtonSize / 3.2),
                backgroundColor: feedAccentSoft,
                borderColor: feedAccentBorder,
              },
            ]}
            onPress={() => handleLike(item.id)}
          >
            <Icon name={item.liked ? "heart" : "heart-outline"} size={24} color={item.liked ? "#f3425f" : colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionButton,
              {
                width: postActionButtonSize,
                height: postActionButtonSize,
                borderRadius: Math.round(postActionButtonSize / 3.2),
                backgroundColor: feedAccentSoft,
                borderColor: feedAccentBorder,
              },
            ]}
            onPress={() => openPostCommentsSheet(item)}
          >
            <Icon name="chatbubble-outline" size={21} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionButton,
              {
                width: postActionButtonSize,
                height: postActionButtonSize,
                borderRadius: Math.round(postActionButtonSize / 2),
                backgroundColor: "transparent",
                borderColor: "transparent",
              },
            ]}
            onPress={() => openPostShareSheet(item)}
          >
            <Icon name="paper-plane-outline" size={21} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.trailingActions}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.trailingActionButton,
                {
                  width: postActionButtonSize,
                  height: postActionButtonSize,
                  borderRadius: Math.round(postActionButtonSize / 2),
                  backgroundColor: "transparent",
                  borderColor: "transparent",
                },
              ]}
              onPress={() => handleSave(item.id)}
            >
              <Icon name={item.saved ? "bookmark" : "bookmark-outline"} size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {hasLikeSummary ? (
          <View style={[styles.likeSummaryRow, { paddingHorizontal: postBodyInset }]}>
            {likePreviewUsers.length ? (
              <View style={styles.likePreviewStack}>
                {likePreviewUsers.map((likeUser, index) => (
                  <TouchableOpacity
                    key={`${item.id}_like_preview_${likeUser.id || index}`}
                    style={[
                      styles.likeSummaryAvatarButton,
                      styles.likeSummaryAvatarStackButton,
                      index > 0 ? styles.likeSummaryAvatarStackOverlap : null,
                    ]}
                    onPress={() => openUserProfile(likeUser.id || item.user.id)}
                    activeOpacity={0.85}
                  >
                    <AppAvatar
                      uri={likeUser.avatarUrl || DEFAULT_AVATAR_URL}
                      name={likeUser.name || likeUser.username}
                      size={22}
                      style={styles.likeSummaryAvatar}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <TouchableOpacity
              onPress={() => openUserProfile(latestLiker?.id || likePreviewUsers[0]?.id || item.user.id)}
              activeOpacity={0.8}
              style={styles.likeSummaryTextWrap}
            >
              <Text style={[styles.likesText, styles.likeSummaryText, { color: colors.text }]}>
                {likeSummaryLabel}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {item.caption ? (
          <InteractiveText
            style={[styles.caption, { paddingHorizontal: postBodyInset, color: colors.text }]}
            prefix={(
              <Text style={[styles.captionUser, { color: colors.text }]} onPress={() => openUserProfile(item.user.id)}>
                {item.user.username}{" "}
              </Text>
            )}
            mentionStyle={[styles.inlineEntity, { color: feedAccent }]}
            hashtagStyle={[styles.inlineEntity, { color: feedAccent }]}
            onPressMention={(mention) => {
              void openMentionProfile(mention);
            }}
            onPressHashtag={openHashtagResults}
            text={item.caption}
          />
        ) : null}

        

        {false ? (
          <Text style={[styles.collabLine, { color: colors.text }]}>Collab post • {item.collaboratorIds.length} collaborators</Text>
        ) : null}

        <TouchableOpacity onPress={() => openPostCommentsSheet(item)}>
          <Text style={[styles.commentCount, { paddingHorizontal: postBodyInset, color: colors.mutedText }]}>
            View all {item.commentsCount} comments
          </Text>
        </TouchableOpacity>

        {!item.settings.disableComments ? (
          <View
            style={[
              styles.commentComposer,
              {
                marginHorizontal: postBodyInset,
                borderColor: feedAccentBorder,
                backgroundColor: feedAccentSoft,
              },
            ]}
          >
            <TextInput
              value={commentDrafts[item.id] || ""}
              onChangeText={(text) => setCommentDrafts((prev) => ({ ...prev, [item.id]: text }))}
              style={[styles.commentInput, { color: colors.text }]}
              placeholder="Add a comment..."
              placeholderTextColor={colors.mutedText}
            />
            <TouchableOpacity onPress={() => handleCommentSubmit(item.id)}>
              <Text style={[styles.postButton, { color: FEED_ACCENT }]}>Post</Text>
            </TouchableOpacity>
            <VoiceRecorderButton
              color={FEED_ACCENT}
              disabled={isActionBusy[`comment_${item.id}`]}
              onSend={(voiceFile) => {
                submitComment(item.id, voiceFile).catch((error) => {
                  Alert.alert("Could not send voice comment", toUserSafeMessage(error));
                });
              }}
            />
          </View>
        ) : (
          <Text style={[styles.commentsDisabled, { paddingHorizontal: postBodyInset, color: colors.mutedText }]}>
            Comments limited for this post
          </Text>
        )}
      </View>
    );
  };
  void renderPost;

  const renderHeader = () => {
    const ownStory = feed.stories.find((item) => item.isOwner || (currentUser?.id && item.user.id === currentUser.id));
    const ownStoryOwnerId = ownStory?.user.id || currentUser?.id || "";
    const ownStoryAvatar = ownStory?.user.avatarUrl || currentUser?.avatarUrl || DEFAULT_AVATAR_URL;
    const visibleLiveStories = liveStories.filter((item) => String(item?.hostUser?._id || item?.hostUser?.id || "") !== String(currentUser?.id || ""));
    const headerSurfaceColor = isDarkMode ? colors.surface : colors.card;
    const headerBorderColor = isDarkMode ? feedAccentBorder : colors.border;
    const headerBrandColor = colors.text;
    const headerSublineColor = colors.mutedText;
    const utilityButtonBackground = isDarkMode ? "rgba(255,255,255,0.12)" : colors.surface;
    const utilityButtonBorder = isDarkMode ? "rgba(255,255,255,0.18)" : colors.border;
    const utilityIconColor = isDarkMode ? "#FFFFFF" : colors.text;

    return (
      <>
        {activePublishTask ? (
          <View
            style={[
              styles.publishQueueCard,
              {
                marginHorizontal: feedHorizontalInset,
                backgroundColor: colors.card,
                borderColor:
                  activePublishTask.status === "failed"
                    ? "rgba(239,68,68,0.28)"
                    : feedAccentBorder,
              },
            ]}
          >
            <View style={styles.publishQueueTopRow}>
              <View style={styles.publishQueueCopy}>
                <Text style={[styles.publishQueueTitle, { color: colors.text }]}>
                  {activePublishTask.label}
                </Text>
                <Text
                  style={[
                    styles.publishQueueMessage,
                    {
                      color:
                        activePublishTask.status === "failed"
                          ? (isDarkMode ? "#FCA5A5" : "#B91C1C")
                          : colors.mutedText,
                    },
                  ]}
                  numberOfLines={2}
                >
                  {activePublishTask.message}
                </Text>
              </View>
              {activePublishTask.status === "failed" ? (
                <TouchableOpacity
                  style={[styles.publishQueueDismiss, { borderColor: colors.border }]}
                  onPress={() => dismissPublishQueueTask(activePublishTask.id)}
                >
                  <Icon name="close" size={16} color={colors.text} />
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={[styles.publishQueueTrack, { backgroundColor: isDarkMode ? "rgba(255,255,255,0.12)" : "#E5E7EB" }]}>
              {activePublishTask.status === "failed" ? (
                <View
                  style={[
                    styles.publishQueueFill,
                    {
                      width: `${Math.max(8, Math.round(activePublishTask.progress * 100))}%`,
                      backgroundColor: "#EF4444",
                    },
                  ]}
                />
              ) : (
                <LinearGradient
                  colors={
                    activePublishTask.status === "success"
                      ? ["#EF4444", "#C026D3", "#10B981"]
                      : ["#EF4444", feedAccent, "#7C3AED"]
                  }
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[
                    styles.publishQueueFill,
                    styles.publishQueueGradientFill,
                    {
                      width: `${Math.max(8, Math.round(activePublishTask.progress * 100))}%`,
                    },
                  ]}
                />
              )}
            </View>
          </View>
        ) : null}

        <View style={styles.topBar}>
          <View
            style={[
              styles.topBarPanel,
              isCompactHeader && styles.topBarPanelCompact,
              { minHeight: isTabletLayout ? 70 : undefined },
              { backgroundColor: headerSurfaceColor, borderColor: headerBorderColor },
            ]}
          >
            <View style={styles.topLeft}>
              <TouchableOpacity style={styles.logoTapTarget} onPress={toggleMenu} activeOpacity={0.85}>
                <Image source={{ uri: "https://aline2.com/asstes/images/logo/logo.jpeg" }} style={styles.logo} />
              </TouchableOpacity>
              <View style={styles.brandCopy}>
                <Text
                  style={[styles.brand, isCompactHeader && styles.brandCompact, { color: headerBrandColor }]}
                  numberOfLines={1}
                >
                  Aline2
                </Text>
                <Text
                  style={[
                    styles.brandSubline,
                    isCompactHeader && styles.brandSublineCompact,
                    { color: headerSublineColor },
                  ]}
                  numberOfLines={1}
                >
                  For you today
                </Text>
              </View>
            </View>

            <View style={styles.topRight}>
              <TouchableOpacity
                style={[
                  styles.headerIconButton,
                  isCompactHeader && styles.headerIconButtonCompact,
                  { backgroundColor: "#F43F5E", borderColor: "rgba(255,255,255,0.22)" },
                ]}
                onPress={() => navigation.navigate("LiveStreamsScreen")}
              >
                <Icon name="radio-outline" size={isCompactHeader ? 18 : 20} color="#FFFFFF" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.headerIconGap,
                  isCompactHeader && styles.headerIconGapCompact,
                  styles.headerIconButton,
                  isCompactHeader && styles.headerIconButtonCompact,
                  { backgroundColor: utilityButtonBackground, borderColor: utilityButtonBorder },
                ]}
                onPress={() => navigation.navigate("Search")}
              >
                <Icon name="search-outline" size={isCompactHeader ? 18 : 20} color={utilityIconColor} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.headerIconGap,
                  isCompactHeader && styles.headerIconGapCompact,
                  styles.headerIconButton,
                  isCompactHeader && styles.headerIconButtonCompact,
                  { backgroundColor: utilityButtonBackground, borderColor: utilityButtonBorder },
                ]}
                onPress={openNotifications}
              >
                <Icon name="notifications-outline" size={isCompactHeader ? 18 : 20} color={utilityIconColor} />
                {unreadNotificationCount > 0 ? (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.headerIconGap,
                  isCompactHeader && styles.headerIconGapCompact,
                  styles.headerWalletButton,
                  isCompactHeader && styles.headerWalletButtonCompact,
                  { backgroundColor: utilityButtonBackground, borderColor: utilityButtonBorder },
                ]}
                onPress={openWalletDashboard}
              >
                <View style={styles.headerCoinBadge}>
                  <Icon name="logo-bitcoin" size={isCompactHeader ? 13 : 14} color="#B45309" />
                </View>
                <Text style={[styles.headerWalletValue, { color: utilityIconColor, fontSize: isCompactHeader ? 11 : 12 }]}>
                  {formatCompactCoinBalance(walletCoinBalance)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.storyRail,
            {
              marginHorizontal: feedHorizontalInset,
              marginBottom: storyRailVerticalInset,
              backgroundColor: colors.card,
              borderColor: feedAccentBorder,
            },
          ]}
        >
          <LinearGradient
            colors={[`${FEED_ACCENT}16`, "rgba(255,255,255,0)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.storyRailGlow}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[
              styles.storyListContent,
              { paddingHorizontal: Math.max(8, feedHorizontalInset - 4), paddingVertical: isTabletLayout ? 14 : 11 },
            ]}
          >
            <TouchableOpacity
              style={[styles.storyItem, { width: storyItemWidth }]}
              onPress={() => {
                if (ownStory) {
                  navigation.navigate("StoryViewer", { storyId: ownStory.id });
                  return;
                }

                navigation.navigate("Create", { initialTab: "story" });
              }}
            >
              <View
                style={[
                  styles.storyRing,
                  styles.storyRingSeen,
                  { width: storyRingSize, height: storyRingSize, borderRadius: storyRingSize / 2 },
                ]}
              >
                <Image
                  source={{ uri: ownStoryAvatar }}
                  style={[styles.storyAvatar, { width: storyAvatarSize, height: storyAvatarSize, borderRadius: storyAvatarSize / 2 }]}
                />
                <View
                  style={[
                    styles.storyAddBadge,
                    {
                      width: storyAddBadgeSize,
                      height: storyAddBadgeSize,
                      borderRadius: storyAddBadgeSize / 2,
                      borderColor: colors.background,
                    },
                  ]}
                >
                  <Icon name="add" size={13} color="#fff" />
                </View>
              </View>
              <Text style={[styles.storyName, { color: colors.text }]} numberOfLines={1}>
                Your story
              </Text>
            </TouchableOpacity>
            {visibleLiveStories.map((liveStream) => renderLiveStory(liveStream))}
            {feed.stories.filter((story) => story.user.id !== ownStoryOwnerId).map((story) => (
              <View key={story.id}>{renderStory({ item: story })}</View>
            ))}
          </ScrollView>
        </View>
      </>
    );
  };

  const sidebarDisplayName = currentUser?.name || currentUser?.username || "Aline2";
  const sidebarHandle = currentUser?.username
    ? `@${currentUser.username}`
    : sellerAccount?.sellerName || "Connect, share, and grow";
  const sidebarAvailabilityStatusStyle = sellerAccount?.availabilityStatus
    ? styles.sidebarStatusAvailable
    : styles.sidebarStatusUnavailable;
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 55,
    minimumViewTime: 120,
  }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item?: Post; isViewable?: boolean }> }) => {
    const firstVisiblePost = viewableItems.find((entry) => entry.isViewable && entry.item?.id)?.item;
    lastViewablePostIdRef.current = firstVisiblePost?.id || "";
    if (firstVisiblePost?.id && !feedScrollTransitionRef.current) {
      setActivePostId(firstVisiblePost.id);
    }
  }).current;

  if (loading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      <View style={styles.screenShell}>
        <FlatList
          data={feed.posts}
          keyExtractor={(item) => item.id}
          renderItem={renderInstagramPost}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.feedContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS === "android"}
          initialNumToRender={4}
          maxToRenderPerBatch={5}
          updateCellsBatchingPeriod={24}
          windowSize={5}
          decelerationRate="fast"
          scrollEventThrottle={16}
          keyboardDismissMode="on-drag"
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onScrollBeginDrag={pauseActiveVisiblePost}
          onMomentumScrollBegin={pauseActiveVisiblePost}
          onScrollEndDrag={() => scheduleRestoreActiveVisiblePost(140)}
          onMomentumScrollEnd={() => scheduleRestoreActiveVisiblePost(0)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{errorMessage ? "Feed unavailable" : "No posts yet"}</Text>
              <Text style={[styles.emptyText, { color: colors.mutedText }]}>{errorMessage || "Posts from people you follow will appear here."}</Text>
            </View>
          }
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (!loadingMore && hasMore) {
              const nextPage = page + 1;
              setLoadingMore(true);
              socialApi.getFeed(nextPage).then((data) => {
                if (data.posts.length === 0) {
                  setHasMore(false);
                } else {
                  setFeed((prev) => ({ ...prev, posts: buildMixedLatestFeedPosts([...prev.posts, ...data.posts]) }));
                  setPage(nextPage);
                  if (data.posts.length < 20) setHasMore(false);
                }
              }).catch(() => { }).finally(() => setLoadingMore(false));
            }
          }}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator size="small" color={colors.primary} style={styles.loadingMoreFooter} /> : null
          }
        />

        {menuOpen ? (
          <TouchableOpacity
            activeOpacity={1}
            style={styles.overlay}
            onPress={closeMenu}
          />
        ) : null}

        <Animated.View
          pointerEvents={menuOpen ? "auto" : "none"}
          style={[
            styles.sidebar,
            {
              width: sidebarWidth,
              backgroundColor: colors.card,
              transform: [{ translateX: sidebarTranslateX }],
            },
          ]}
        >
          <View
            style={[
              styles.sidebarHeader,
              isCompactSidebar && styles.sidebarHeaderCompact,
              {
                backgroundColor: FEED_ACCENT,
              },
            ]}
          >
            <View style={styles.sidebarHeaderTop}>
              <View style={styles.sidebarAvatarWrap}>
                <Image
                  source={{ uri: currentUser?.avatarUrl || "https://aline2.com/asstes/images/logo/logo.jpeg" }}
                  style={[styles.sidebarAvatar, isCompactSidebar && styles.sidebarAvatarCompact]}
                />
                {sellerAccount ? (
                  <View
                    style={[
                      styles.sidebarAvatarStatus,
                      sidebarAvailabilityStatusStyle,
                    ]}
                  />
                ) : null}
              </View>

              <TouchableOpacity style={styles.sidebarCloseButton} onPress={closeMenu} activeOpacity={0.8}>
                <Icon name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <Text style={styles.sidebarTitle} numberOfLines={1}>{sidebarDisplayName}</Text>
            <Text style={styles.sidebarSubtitle} numberOfLines={1}>{sidebarHandle}</Text>

            {sellerAccount ? (
              <View style={styles.sidebarAvailabilityCard}>
                <View style={styles.sidebarAvailabilityCopy}>
                  <Text style={styles.sidebarAvailabilityLabel}>Seller Availability</Text>
                  <View style={styles.sidebarAvailabilityState}>
                    <View
                      style={[
                        styles.sidebarAvailabilityDot,
                        sidebarAvailabilityStatusStyle,
                      ]}
                    />
                    <Text style={styles.sidebarAvailabilityValue}>
                      {sellerAccount.availabilityStatus ? "Available" : "Unavailable"}
                    </Text>
                  </View>
                </View>

                <Switch
                  value={sellerAccount.availabilityStatus}
                  onValueChange={toggleSellerAvailability}
                  disabled={availabilityUpdating}
                  thumbColor={sellerAccount.availabilityStatus ? "#fff" : "#F3F4F6"}
                  trackColor={{ false: "rgba(255,255,255,0.32)", true: "rgba(34,197,94,0.95)" }}
                  ios_backgroundColor="rgba(255,255,255,0.32)"
                />
              </View>
            ) : null}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sidebarContent}>
            <View style={[styles.sidebarReleaseCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={styles.sidebarReleaseCopy}>
                <Text style={[styles.sidebarReleaseLabel, { color: colors.mutedText }]}>App version</Text>
                <Text style={[styles.sidebarReleaseValue, { color: colors.text }]}>v0.0.1 • April 21, 2026</Text>
              </View>
              <TouchableOpacity
                style={[styles.sidebarReleaseButton, { backgroundColor: feedAccentSoft }]}
                onPress={() => navigateFromMenu("ReleaseNotesScreen")}
                activeOpacity={0.86}
              >
                <Icon name="document-text-outline" size={16} color={FEED_ACCENT} />
                <Text style={styles.sidebarReleaseButtonText}>Release Notes</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.sidebarGuideSection}>
              <Text style={[styles.sidebarSectionTitle, { color: colors.mutedText }]}>Guide</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.sidebarGuideVideo, { borderColor: colors.border, backgroundColor: colors.surface }]}
              >
                <View style={[styles.sidebarGuidePreview, { backgroundColor: feedAccentSoft }]}>
                  <View style={[styles.sidebarGuidePlayButton, { backgroundColor: FEED_ACCENT }]}>
                    <Icon name="play" size={18} color="#fff" />
                  </View>
                </View>

                <View style={styles.sidebarGuideCopy}>
                  <Text style={[styles.sidebarGuideTitle, { color: colors.text }]} numberOfLines={1}>
                    Aline2 Guide
                  </Text>
                  <Text style={[styles.sidebarGuideSubtitle, { color: colors.mutedText }]} numberOfLines={1}>
                    Quick start video
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {menuSections.map((section) => (
              <View key={section.title} style={styles.sidebarSection}>
                <Text style={[styles.sidebarSectionTitle, { color: colors.mutedText }]}>{section.title}</Text>
                {section.data.map((item) => (
                  <TouchableOpacity
                    key={item.label}
                    style={[styles.sidebarMenuItem, { borderColor: colors.border, backgroundColor: colors.surface }]}
                    onPress={() => navigateFromMenu(item.screen)}
                  >
                    <View style={[styles.sidebarMenuIconCircle, { backgroundColor: feedAccentSoft }]}>
                      <Icon name={item.icon} size={18} color={FEED_ACCENT} />
                    </View>
                    <Text style={[styles.sidebarMenuLabel, { color: colors.text }]}>{item.label}</Text>
                    <Icon name="chevron-forward" size={18} color={colors.mutedText} />
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </ScrollView>
        </Animated.View>
      </View>

      <PostCommentsSheet
        visible={activeSheet === "comments"}
        post={selectedPost}
        onClose={closeSheet}
        onPostUpdate={updatePost}
        onOpenFull={openPostComments}
        showOpenFull={false}
      />

      <PostShareSheet
        visible={activeSheet === "share"}
        post={selectedPost}
        onClose={closeSheet}
        onPostUpdate={updatePost}
        onOpenStoryComposer={(post) =>
          navigation.navigate("Create", {
            initialTab: "story",
            initialMedia:
              post.media[0]?.mediaType === "video"
                ? post.media[0]?.url
                : post.media[0]?.thumbnailUrl || post.media[0]?.url,
            initialMediaType: post.media[0]?.mediaType || "image",
          })
        }
      />

      {selectedPost ? (
        <ContentActionSheet
          visible={activeSheet === "actions"}
          contentType="post"
          contentId={selectedPost.id}
          userId={selectedPost.user.id}
          userLabel={selectedPost.user.username}
          title="Post options"
          onClose={closeSheet}
          onActionComplete={(action) => {
            if (action === "not_interested") {
              setFeed((prev) => ({
                ...prev,
                posts: prev.posts.filter((item) => item.id !== selectedPost.id),
              }));
            }

            if (action === "mute" || action === "block") {
              setFeed((prev) => ({
                ...prev,
                posts: prev.posts.filter((item) => item.user.id !== selectedPost.user.id),
              }));
            }

            if (action === "archive") {
              setFeed((prev) => ({
                ...prev,
                posts: prev.posts.filter((item) => item.id !== selectedPost.id),
              }));
            }
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  screenShell: { flex: 1 },
  feedContent: { paddingTop: 4, paddingBottom: 112 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyState: { paddingHorizontal: 24, paddingTop: 72, alignItems: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#111" },
  emptyText: { marginTop: 8, color: "#666", textAlign: "center", lineHeight: 20 },
  loadingMoreFooter: { paddingVertical: 28 },
  topBar: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 6,
  },
  topBarPanel: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 9,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  topBarPanelCompact: {
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  topLeft: { flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0 },
  logoTapTarget: { marginRight: 8, borderRadius: 12 },
  logo: { width: 42, height: 42, borderRadius: 12, marginRight: 8 },
  brandCopy: {
    flexShrink: 1,
    minWidth: 0,
    marginRight: 6,
  },
  brand: {
    fontSize: 24,
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: -0.8,
    fontFamily: Platform.select({ ios: "Georgia-Bold", android: "serif", default: undefined }),
  },
  brandCompact: { fontSize: 19 },
  brandSubline: { marginTop: 2, fontSize: 12.5, fontWeight: "700", letterSpacing: 0.3 },
  brandSublineCompact: { display: "none" },
  topRight: { flexDirection: "row", alignItems: "center", flexShrink: 0 },
  headerIconGap: { marginLeft: 8 },
  headerIconGapCompact: { marginLeft: 6 },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  headerWalletButton: {
    minWidth: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    flexDirection: "row",
    paddingHorizontal: 10,
  },
  headerIconButtonCompact: {
    width: 32,
    height: 32,
    borderRadius: 10,
  },
  headerWalletButtonCompact: {
    minWidth: 32,
    height: 32,
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  headerWalletValue: {
    marginLeft: 5,
    fontWeight: "800",
  },
  headerCoinBadge: {
    width: 18,
    height: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FDE68A",
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  notificationBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 19,
    height: 19,
    borderRadius: 9.5,
    paddingHorizontal: 5,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
  },
  notificationBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7, 12, 20, 0.28)",
    zIndex: 19,
  },
  sidebar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: APP_BOTTOM_DOCK_BASE_HEIGHT,
    zIndex: 20,
    elevation: 20,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 6, height: 0 },
  },
  sidebarHeader: {
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 18,
    borderBottomRightRadius: 28,
  },
  sidebarHeaderCompact: {
    paddingHorizontal: 16,
    paddingTop: 38,
  },
  sidebarHeaderTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  sidebarAvatarWrap: {
    position: "relative",
    alignSelf: "flex-start",
  },
  sidebarAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  sidebarAvatarCompact: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  sidebarAvatarStatus: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#fff",
  },
  sidebarStatusAvailable: {
    backgroundColor: "#22C55E",
  },
  sidebarStatusUnavailable: {
    backgroundColor: "#F97316",
  },
  sidebarCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  sidebarTitle: {
    marginTop: 12,
    fontSize: 21,
    fontWeight: "800",
    color: "#fff",
  },
  sidebarSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "rgba(255,255,255,0.88)",
  },
  sidebarAvailabilityCard: {
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.32)",
    flexDirection: "row",
    alignItems: "center",
  },
  sidebarAvailabilityCopy: {
    flex: 1,
    paddingRight: 10,
  },
  sidebarAvailabilityLabel: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  sidebarAvailabilityState: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  sidebarAvailabilityDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  sidebarAvailabilityValue: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 12,
    fontWeight: "600",
  },
  sidebarContent: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 12,
  },
  sidebarReleaseCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
  },
  sidebarReleaseCopy: {
    marginBottom: 12,
  },
  sidebarReleaseLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sidebarReleaseValue: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: "800",
  },
  sidebarReleaseButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sidebarReleaseButtonText: {
    marginLeft: 8,
    fontSize: 12.5,
    fontWeight: "800",
    color: FEED_ACCENT,
  },
  sidebarGuideSection: {
    marginBottom: 18,
  },
  sidebarGuideVideo: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    overflow: "hidden",
  },
  sidebarGuidePreview: {
    height: 86,
    justifyContent: "center",
    alignItems: "center",
  },
  sidebarGuidePlayButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
    paddingLeft: 2,
  },
  sidebarGuideCopy: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sidebarGuideTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  sidebarGuideSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
  },
  sidebarSection: {
    marginBottom: 18,
  },
  sidebarSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    marginBottom: 8,
    marginLeft: 8,
    textTransform: "uppercase",
  },
  sidebarMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 8,
  },
  sidebarMenuIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  sidebarMenuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  storyRail: {
    marginHorizontal: 14,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    overflow: "hidden",
  },
  storyRailGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  storyListContent: { paddingHorizontal: 10, paddingVertical: 12 },
  storyItem: { width: 90, alignItems: "center" },
  storyRing: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  storyRingGradient: {
    justifyContent: "center",
    alignItems: "center",
    padding: 3,
    shadowColor: "#ee2a7b",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  storyRingInner: {
    justifyContent: "center",
    alignItems: "center",
  },
  storyRingSeen: {
    borderColor: "#334155",
    backgroundColor: "rgba(15, 23, 42, 0.12)",
  },
  storyRingCloseFriendsSeen: {
    borderColor: "rgba(34, 197, 94, 0.7)",
  },
  liveStoryRing: {
    borderColor: "#fb7185",
    borderWidth: 2.5,
    shadowColor: "#fb7185",
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  storyAvatar: { width: 70, height: 70, borderRadius: 35 },
  storyAddBadge: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: FEED_ACCENT,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  liveStoryBadge: {
    position: "absolute",
    bottom: -3,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ef4444",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  liveStoryBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
    marginLeft: 3,
  },
  storyName: { marginTop: 7, fontSize: 12.5, color: "#272727", fontWeight: "700" },
  publishQueueCard: {
    marginTop: 8,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  publishQueueTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  publishQueueCopy: {
    flex: 1,
    paddingRight: 10,
  },
  publishQueueTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  publishQueueMessage: {
    marginTop: 4,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  publishQueueDismiss: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  publishQueueTrack: {
    marginTop: 10,
    height: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  publishQueueFill: {
    height: "100%",
    borderRadius: 999,
  },
  publishQueueGradientFill: {
    minWidth: 18,
  },
  postCard: {
    marginHorizontal: 14,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: "hidden",
  },
  instagramPostCard: {
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  postHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  postHeaderIdentity: { flexDirection: "row", alignItems: "center", flex: 1 },
  postHeaderActions: { flexDirection: "row", alignItems: "center", marginLeft: 8, gap: 6 },
  postAvatar: { width: 42, height: 42, borderRadius: 21 },
  postAvatarCompact: { width: 38, height: 38, borderRadius: 19 },
  userMeta: { marginLeft: 8, flexShrink: 1, minWidth: 0 },
  row: { flexDirection: "row", alignItems: "center" },
  usernameRow: { flexShrink: 1, minWidth: 0, paddingRight: 6 },
  username: { fontSize: 13, lineHeight: 16, fontWeight: "700", color: "#111" },
  usernameText: { flexShrink: 1 },
  verifiedIcon: { marginLeft: 5 },
  postTime: { fontSize: 10.5, color: "#666", marginTop: 1 },
  moreButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  carouselWrap: { width: "100%" },
  carouselIndicatorRow: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 14,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  carouselIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  carouselIndicatorDotActive: {
    width: 18,
    backgroundColor: "#fff",
  },
  sensitiveBadge: {
    position: "absolute",
    left: 12,
    bottom: 12,
    backgroundColor: "rgba(15,23,42,0.78)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sensitiveBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  mediaFallback: { backgroundColor: "#0f172a" },
  postImage: { height: 360 },
  mediaFrame: {
    marginTop: 2,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  mediaPressSurface: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#0b1120",
  },
  postStickerLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  postEmojiSticker: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  postEmojiStickerText: {
    fontSize: 22,
  },
  postTextSticker: {
    position: "absolute",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(15,23,42,0.56)",
  },
  postTextStickerText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  likeBurstOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaSoundHint: {
    position: "absolute",
    right: 12,
    top: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(0,0,0,0.56)",
  },
  mediaSoundHintCompact: {
    right: 10,
    top: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  mediaSoundHintText: {
    color: "#fff",
    fontSize: 11.5,
    fontWeight: "800",
  },
  mediaMusicChip: {
    position: "absolute",
    left: 12,
    bottom: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: "rgba(0,0,0,0.56)",
  },
  mediaMusicChipCompact: {
    left: 10,
    right: 10,
    bottom: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  mediaMusicChipText: {
    flex: 1,
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  actionsRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  actionButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  trailingActions: { marginLeft: "auto", flexDirection: "row", alignItems: "center" },
  trailingActionButton: { marginRight: 0, marginLeft: 6 },
  likesText: { fontWeight: "700", color: "#121212", fontSize: 12.5, paddingHorizontal: 18 },
  likeSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 1,
  },
  likePreviewStack: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 40,
  },
  likeSummaryAvatarButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: "hidden",
  },
  likeSummaryAvatarStackButton: {
    borderWidth: 1.5,
    borderColor: "#fff",
    backgroundColor: "#fff",
  },
  likeSummaryAvatarStackOverlap: {
    marginLeft: -7,
  },
  likeSummaryAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: 11,
  },
  likeSummaryText: {
    paddingHorizontal: 0,
    fontSize: 12.2,
  },
  likeSummaryTextWrap: {
    flexShrink: 1,
  },
  caption: { fontSize: 12.6, color: "#131313", paddingHorizontal: 18, paddingTop: 5, lineHeight: 18 },
  captionUser: { fontWeight: "700" },
  inlineEntity: { fontWeight: "700" },
  tagLine: { color: FEED_ACCENT, fontSize: 12.5, paddingHorizontal: 18, paddingTop: 7, fontWeight: "700" },
  tagLineMuted: { color: "#5a5a5a", fontSize: 11.5, paddingHorizontal: 18, paddingTop: 4 },
  metaChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 7,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(155,77,255,0.08)",
  },
  metaChipText: {
    flexShrink: 1,
    fontSize: 10.5,
    fontWeight: "600",
  },
  metaLine: { color: "#646464", fontSize: 10.6, paddingHorizontal: 18, paddingTop: 5 },
  collabLine: { color: "#2f2f2f", fontSize: 10.6, paddingHorizontal: 18, paddingTop: 4, fontWeight: "600" },
  commentCount: { color: "#787878", fontSize: 10.8, paddingHorizontal: 18, paddingTop: 7 },
  commentComposer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 18,
    marginTop: 6,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  followBadge: {
    minHeight: 30,
    minWidth: 74,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  followBadgePrimary: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  followBadgeSecondary: {},
  followBadgeText: {
    fontSize: 11.5,
    fontWeight: "700",
    textAlign: "center",
  },
  commentInput: { flex: 1, fontSize: 12, color: "#222", paddingVertical: 3 },
  postButton: { color: FEED_ACCENT, fontWeight: "700", fontSize: 11.5, paddingHorizontal: 8 },
  commentsDisabled: {
    color: "#707070",
    fontSize: 12,
    paddingHorizontal: 18,
    paddingTop: 9,
    paddingBottom: 14,
  },
});

export default FeedScreen;
