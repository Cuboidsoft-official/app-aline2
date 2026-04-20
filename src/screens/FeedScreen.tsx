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
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createSound } from "react-native-nitro-sound";
import Icon from "react-native-vector-icons/Ionicons";
import LinearGradient from "react-native-linear-gradient";

import ContentActionSheet from "../features/social/components/ContentActionSheet";
import PostCommentsSheet from "../features/social/components/PostCommentsSheet";
import PostShareSheet from "../features/social/components/PostShareSheet";
import SocialVideo from "../features/social/components/SocialVideo";
import { socialApi } from "../features/social/socialApi";
import { CommentAudioFile, FeedResponse, Post, Story } from "../features/social/types";
import { toUserSafeMessage } from "../features/social/validation";
import { API } from "../api/api";
import { getStoredUser } from "../utils/authSession";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { normalizeMediaUrl } from "../utils/mediaUrls";
import { useAppTheme } from "../theme/AppThemeContext";
import { PHOTO_FILTER_LIST } from "../utils/photoFilters";
import { shouldShowVerifiedBadge } from "../utils/verificationBadges";
import { APP_BOTTOM_DOCK_BASE_HEIGHT } from "../components/AppBottomDock";
import VoiceRecorderButton from "../components/chat/VoiceRecorderButton";
import { downloadImageAsset } from "../utils/mediaDownload";
import { connectSocket, socket } from "../socket";

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

const formatCount = (value: number): string => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }

  return `${value}`;
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
    return `${post.media.length} items`;
  }

  return post.type === "video" ? "Video" : "Photo";
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

const getPostAspectRatio = (post: Post): number => {
  const primaryMedia = post.media[0];
  const assetRatio =
    primaryMedia?.width && primaryMedia?.height
      ? primaryMedia.width / Math.max(1, primaryMedia.height)
      : 1;

  return Math.min(1.91, Math.max(0.8, assetRatio || 1));
};

type CurrentUserSummary = {
  id: string;
  avatarUrl: string;
  username: string;
  name: string;
};

type SellerAccountSummary = {
  id: string;
  sellerName: string;
  availabilityStatus: boolean;
};

function FeedScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const { colors, isDarkMode } = useAppTheme();
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
  const [availabilityUpdating, setAvailabilityUpdating] = useState(false);
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
  const slideAnim = useRef(new Animated.Value(0)).current;
  const postMusicPlayerRef = useRef(createSound());
  const postMusicTrackKeyRef = useRef("");
  const postMusicEndMsRef = useRef(0);
  const postTapRef = useRef<{ id: string; time: number; timeout: ReturnType<typeof setTimeout> | null }>({
    id: "",
    time: 0,
    timeout: null,
  });
  const isTabletLayout = width >= 768;
  const feedHorizontalInset = isTabletLayout ? 18 : width < 360 ? 10 : 14;
  const storyRailVerticalInset = isTabletLayout ? 12 : width < 360 ? 8 : 10;
  const storyItemWidth = isTabletLayout ? 86 : width < 360 ? 68 : 76;
  const storyRingSize = isTabletLayout ? 72 : width < 360 ? 58 : 64;
  const storyAvatarSize = storyRingSize - 7;
  const storyAddBadgeSize = width < 360 ? 16 : 18;
  const postCardRadius = isTabletLayout ? 18 : width < 360 ? 12 : 14;
  const postHeaderPadding = isTabletLayout ? 18 : width < 360 ? 13 : 15;
  const postBodyInset = postHeaderPadding + 2;
  const postActionButtonSize = width < 360 ? 38 : 40;
  const postMediaWidth = Math.max(width - feedHorizontalInset * 2, 0);
  const defaultPostMediaHeight = Math.round(
    Math.min(
      isTabletLayout ? 540 : 420,
      Math.max(width < 360 ? 280 : 320, postMediaWidth * (isTabletLayout ? 0.76 : 0.92)),
    ),
  );
  const sidebarWidth = Math.min(width - (width < 360 ? 16 : 24), isTabletLayout ? 380 : width < 360 ? 312 : 340);
  const isCompactSidebar = width < 360;
  const isCompactHeader = width < 430;
  const hasSellerAccount = Boolean(sellerAccount);

  const sidebarTranslateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-sidebarWidth - 24, 0],
  });
  const activePost = useMemo(
    () => feed.posts.find((item) => item.id === activePostId) || null,
    [activePostId, feed.posts],
  );
  const activePostMusicUrl = normalizeMediaUrl(activePost?.music?.previewUrl || "");
  const activePostMusicStartMs = Math.max(0, Number(activePost?.music?.startTime || 0) * 1000);
  const activePostMusicDurationMs = Math.max(0, Number(activePost?.music?.duration || 0) * 1000);
  const activePostMusicTrackKey = activePost
    ? `${activePost.id}:${activePostMusicUrl}:${activePostMusicStartMs}:${activePostMusicDurationMs}`
    : "";

  const readSellerAccount = useCallback(async (): Promise<SellerAccountSummary | null> => {
    try {
      const res = await API.get("/seller/me");
      const seller = res.data?.seller;

      if (!seller) {
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
          { icon: "wallet-outline", label: "My Balance", screen: "WalletScreen" },
          { icon: "notifications-outline", label: "Notifications", screen: "NotificationScreen" },
        ],
      },
      {
        title: "Growth",
        data: [
          { icon: "megaphone-outline", label: "Promotions", screen: "WalletScreen" },
          { icon: "cash-outline", label: "How to Earn", screen: "HowToEarnScreen" },
          hasSellerAccount
            ? { icon: "briefcase-outline", label: "Seller Dashboard", screen: "SellerDashboardScreen" }
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

  const loadFeed = useCallback(async () => {
    const [data, storedUser, seller, unreadNotifications] = await Promise.all([
      socialApi.getFeed(),
      getStoredUser(),
      readSellerAccount(),
      readUnreadNotificationCount(),
    ]);
    setFeed(data);
    setPage(1);
    setHasMore(data.posts.length >= 20);
    setCurrentUser(
      storedUser
        ? {
          id: String(storedUser._id || storedUser.id || ""),
          avatarUrl: storedUser.profilePic || storedUser.avatarUrl || "",
          username: String(storedUser.username || ""),
          name: String(storedUser.name || ""),
        }
        : null,
    );
    setSellerAccount(seller);
    setUnreadNotificationCount(unreadNotifications);
    setErrorMessage("");
  }, [readSellerAccount, readUnreadNotificationCount]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const run = async () => {
        try {
          setLoading(true);
          const [data, storedUser, seller, unreadNotifications] = await Promise.all([
            socialApi.getFeed(),
            getStoredUser(),
            readSellerAccount(),
            readUnreadNotificationCount(),
          ]);
          if (active) {
            setFeed(data);
            setCurrentUser(
              storedUser
                ? {
                  id: String(storedUser._id || storedUser.id || ""),
                  avatarUrl: storedUser.profilePic || storedUser.avatarUrl || "",
                  username: String(storedUser.username || ""),
                  name: String(storedUser.name || ""),
                }
                : null,
            );
            setSellerAccount(seller);
            setUnreadNotificationCount(unreadNotifications);
            setErrorMessage("");
          }
        } catch (error) {
          if (active) {
            setFeed(initialFeed);
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
    }, [readSellerAccount, readUnreadNotificationCount]),
  );

  useEffect(() => {
    connectSocket().catch((error) => {
      console.log("feed socket connect error:", error);
    });

    const handleRealtimeNotification = () => {
      setUnreadNotificationCount((current) => current + 1);
    };

    socket.on("receiveNotification", handleRealtimeNotification);

    return () => {
      socket.off("receiveNotification", handleRealtimeNotification);
    };
  }, []);

  useEffect(() => {
    if (!feed.posts.length) {
      setActivePostId("");
      return;
    }

    setActivePostId((current) => (current && feed.posts.some((item) => item.id === current) ? current : feed.posts[0].id));
  }, [feed.posts]);

  useEffect(() => {
    const player = postMusicPlayerRef.current;

    player.setSubscriptionDuration(0.1);
    player.addPlayBackListener((event: any) => {
      const playbackEndMs = postMusicEndMsRef.current;
      const currentPosition = Math.max(0, Number(event?.currentPosition || 0));

      if (playbackEndMs > 0 && currentPosition >= playbackEndMs) {
        postMusicEndMsRef.current = 0;
        player.pausePlayer().catch(() => undefined);
      }
    });
    player.addPlaybackEndListener(() => {
      postMusicEndMsRef.current = 0;
    });

    return () => {
      if (postTapRef.current.timeout) {
        clearTimeout(postTapRef.current.timeout);
      }

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

      player.stopPlayer().catch(() => undefined);
      player.dispose();
    };
  }, []);

  useEffect(() => {
    const player = postMusicPlayerRef.current;
    const isMuted = !activePostId || !!mutedPostIds[activePostId];
    const shouldPlayMusic = !!activePostMusicUrl && !isMuted && !activeSheet;

    const stopMusic = async () => {
      postMusicTrackKeyRef.current = "";
      postMusicEndMsRef.current = 0;

      try {
        await player.stopPlayer();
      } catch {
        // noop
      }
    };

    if (!shouldPlayMusic) {
      stopMusic().catch(() => undefined);
      return;
    }

    if (postMusicTrackKeyRef.current === activePostMusicTrackKey) {
      player.resumePlayer().catch(() => undefined);
      return;
    }

    let cancelled = false;

    const playMusic = async () => {
      await stopMusic();
      if (cancelled || !activePostMusicUrl) {
        return;
      }

      postMusicTrackKeyRef.current = activePostMusicTrackKey;
      postMusicEndMsRef.current =
        activePostMusicDurationMs > 0 ? activePostMusicStartMs + activePostMusicDurationMs : 0;

      await player.startPlayer(activePostMusicUrl);
      await player.seekToPlayer(activePostMusicStartMs);
      await player.setVolume(1);
    };

    playMusic().catch((error) => {
      console.log("feed music playback error", error);
      stopMusic().catch(() => undefined);
    });

    return () => {
      cancelled = true;
    };
  }, [
    activePostId,
    activePostMusicDurationMs,
    activePostMusicStartMs,
    activePostMusicTrackKey,
    activePostMusicUrl,
    activeSheet,
    mutedPostIds,
  ]);

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
      const updated = await socialApi.togglePostLike(postId);
      updatePost(updated);
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

  const handlePostMediaPress = (post: Post) => {
    const now = Date.now();
    const lastTap = postTapRef.current;
    const hasAudioLayer = post.media.some((asset) => asset.mediaType === "video") || !!post.music?.previewUrl;

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

    return Math.max(
      width < 360 ? 280 : 320,
      Math.min(isTabletLayout ? 620 : 560, resolvedHeight || defaultPostMediaHeight),
    );
  }, [defaultPostMediaHeight, isTabletLayout, postMediaWidth, width]);

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
        Alert.alert("Opened image", "The image was opened in your browser or download app.");
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
    const ringStyle = item.viewed ? styles.storyRingSeen : styles.storyRingUnseen;
    const closeFriends = item.visibility === "close_friends";
    const storyAvatar = normalizeMediaUrl(item.user.avatarUrl || DEFAULT_AVATAR_URL);

    return (
      <TouchableOpacity
        style={[styles.storyItem, { width: storyItemWidth }]}
        onPress={() => navigation.navigate("StoryViewer", { storyId: item.id })}
      >
        <View
          style={[
            styles.storyRing,
            ringStyle,
            closeFriends && styles.storyRingCloseFriends,
            { width: storyRingSize, height: storyRingSize, borderRadius: storyRingSize / 2 },
          ]}
        >
          <Image
            source={{ uri: storyAvatar }}
            style={[styles.storyAvatar, { width: storyAvatarSize, height: storyAvatarSize, borderRadius: storyAvatarSize / 2 }]}
          />
        </View>
        <Text style={[styles.storyName, { color: colors.text }]} numberOfLines={1}>
          {item.user.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderPostMedia = (post: Post) => {
    const mediaHeight = getPostMediaHeight(post);
    const currentCarouselIndex = carouselIndexByPostId[post.id] || 0;
    const hasAttachedMusic = !!post.music?.previewUrl;
    const isMuted = !!mutedPostIds[post.id];

    if (post.type !== "carousel") {
      const primaryMedia = post.media[0];
      if (!primaryMedia?.url) {
        return <View style={[styles.postImage, styles.mediaFallback, { width: postMediaWidth, height: mediaHeight }]} />;
      }

      if (primaryMedia?.mediaType === "video") {
        return (
          <SocialVideo
            uri={normalizeMediaUrl(primaryMedia.url)}
            posterUri={normalizeMediaUrl(primaryMedia.thumbnailUrl || primaryMedia.url)}
            style={[styles.postImage, { width: postMediaWidth, height: mediaHeight }]}
            muted={isMuted || hasAttachedMusic}
            repeat
          />
        );
      }

      const rawImage = (
        <Image
          source={{ uri: normalizeMediaUrl(primaryMedia?.url) }}
          style={[styles.postImage, { width: postMediaWidth, height: mediaHeight }]}
          resizeMode="cover"
        />
      );

      if (post.filterPreset && ColorMatrix) {
        const activeFilter = PHOTO_FILTER_LIST.find((f) => f.id === post.filterPreset);
        if (activeFilter && activeFilter.matrix) {
          return <ColorMatrix matrix={activeFilter.matrix}>{rawImage}</ColorMatrix>;
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
          {post.media.map((asset) => (
            asset.mediaType === "video" ? (
              <SocialVideo
                key={asset.id}
                uri={normalizeMediaUrl(asset.url)}
                posterUri={normalizeMediaUrl(asset.thumbnailUrl || asset.url)}
                style={[styles.postImage, { width: postMediaWidth, height: mediaHeight }]}
                muted={isMuted || hasAttachedMusic}
                repeat
              />
            ) : (
              (() => {
                const rawImage = (
                  <Image
                    key={asset.id}
                    source={{ uri: normalizeMediaUrl(asset.url) }}
                    style={[styles.postImage, { width: postMediaWidth, height: mediaHeight }]}
                    resizeMode="cover"
                  />
                );

                if (post.filterPreset && ColorMatrix) {
                  const activeFilter = PHOTO_FILTER_LIST.find((f) => f.id === post.filterPreset);
                  if (activeFilter && activeFilter.matrix) {
                    return (
                      <View key={asset.id}>
                        <ColorMatrix matrix={activeFilter.matrix}>{rawImage}</ColorMatrix>
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
    const hasAttachedMusic = !!item.music?.previewUrl;
    const isMuted = !!mutedPostIds[item.id];
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
              <View style={styles.row}>
                <Text style={[styles.username, { color: colors.text }]}>{item.user.username}</Text>
                {shouldShowVerifiedBadge(item.user) ? (
                  <Icon style={styles.verifiedIcon} name="checkmark-circle" color={FEED_ACCENT} size={16} />
                ) : null}
              </View>
              <Text style={[styles.postTime, { color: colors.mutedText }]}>{formatAgo(item.createdAt)}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.moreButton,
              {
                width: postActionButtonSize - 2,
                height: postActionButtonSize - 2,
                borderRadius: Math.round((postActionButtonSize - 2) / 3),
                backgroundColor: feedAccentSoft,
                borderColor: feedAccentBorder,
              },
            ]}
            onPress={() => openContentActions(item)}
          >
            <Icon name="ellipsis-horizontal" size={20} color={FEED_ACCENT} />
          </TouchableOpacity>
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
          <Text style={[styles.likesText, { paddingHorizontal: postBodyInset, color: colors.text }]}>
            {formatCount(item.likesCount)} likes
          </Text>
        ) : null}

        <Text style={[styles.caption, { paddingHorizontal: postBodyInset, color: colors.text }]}>
          <Text style={[styles.captionUser, { color: colors.text }]} onPress={() => openUserProfile(item.user.id)}>
            {item.user.username}{" "}
          </Text>
          {item.caption}
        </Text>

        {item.hashtags.length ? (
          <Text style={[styles.tagLine, { paddingHorizontal: postBodyInset, color: FEED_ACCENT }]}>
            {item.hashtags.map((tag) => `#${tag}`).join(" ")}
          </Text>
        ) : null}

        {item.mentions.length ? (
          <Text style={[styles.tagLineMuted, { paddingHorizontal: postBodyInset, color: colors.mutedText }]}>
            {item.mentions.map((mention) => `@${mention}`).join(" ")}
          </Text>
        ) : null}

        <Text style={[styles.metaLine, { paddingHorizontal: postBodyInset, color: colors.mutedText }]}>{metaLine}</Text>

        {item.collaboratorIds.length ? (
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

  const renderInstagramPost = ({ item }: { item: Post }) => {
    const hasVideoMedia = item.media.some((asset) => asset.mediaType === "video");
    const musicLabel = formatPostMusicLabel(item.music);
    const hasAttachedMusic = !!item.music?.previewUrl;
    const isMuted = !!mutedPostIds[item.id];
    const metaLine = [getPostTypeTag(item), musicLabel ? `🎵 ${musicLabel}` : null].filter(Boolean).join(" • ");

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
              <View style={styles.row}>
                <Text style={[styles.username, { color: colors.text }]}>{item.user.username}</Text>
                {shouldShowVerifiedBadge(item.user) ? (
                  <Icon style={styles.verifiedIcon} name="checkmark-circle" color={FEED_ACCENT} size={16} />
                ) : null}
              </View>
              <Text style={[styles.postTime, { color: colors.mutedText }]}>
                {item.location ? `${item.location} • ` : ""}{formatAgo(item.createdAt)}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.moreButton,
              {
                width: postActionButtonSize - 2,
                height: postActionButtonSize - 2,
                borderRadius: Math.round((postActionButtonSize - 2) / 3),
                backgroundColor: feedAccentSoft,
                borderColor: feedAccentBorder,
              },
            ]}
            onPress={() => openContentActions(item)}
          >
            <Icon name="ellipsis-horizontal" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <Pressable onPress={() => handlePostMediaPress(item)} style={styles.mediaPressSurface}>
          {renderPostMedia(item)}
          {renderPostStickerOverlay(item)}
          {likeBurstPostId === item.id ? (
            <View pointerEvents="none" style={styles.likeBurstOverlay}>
              <Icon name="heart" size={88} color="rgba(255,255,255,0.92)" />
            </View>
          ) : null}
          {(hasVideoMedia || hasAttachedMusic) ? (
            <View style={styles.mediaSoundHint}>
              <Icon name={isMuted ? "volume-mute-outline" : "volume-high-outline"} size={16} color="#fff" />
              <Text style={styles.mediaSoundHintText}>{isMuted ? "Muted" : "Sound on"}</Text>
            </View>
          ) : null}
          {musicLabel ? (
            <View style={styles.mediaMusicChip}>
              <Icon name="musical-notes" size={13} color="#fff" />
              <Text numberOfLines={1} style={styles.mediaMusicChipText}>{musicLabel}</Text>
            </View>
          ) : null}
        </Pressable>

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
            <Icon name="chatbubble-outline" size={22} color={colors.text} />
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
            <Icon name="paper-plane-outline" size={22} color={colors.text} />
          </TouchableOpacity>

          {(hasVideoMedia || hasAttachedMusic) ? (
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
              onPress={() => togglePostMute(item.id)}
            >
              <Icon name={isMuted ? "volume-mute-outline" : "volume-high-outline"} size={22} color={FEED_ACCENT} />
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
          <Text style={[styles.likesText, { paddingHorizontal: postBodyInset, color: colors.text }]}>
            {formatCount(item.likesCount)} likes
          </Text>
        ) : null}

        <Text style={[styles.caption, { paddingHorizontal: postBodyInset, color: colors.text }]}>
          <Text style={[styles.captionUser, { color: colors.text }]} onPress={() => openUserProfile(item.user.id)}>
            {item.user.username}{" "}
          </Text>
          {item.caption}
        </Text>

        {item.hashtags.length ? (
          <Text style={[styles.tagLine, { paddingHorizontal: postBodyInset, color: FEED_ACCENT }]}>
            {item.hashtags.map((tag) => `#${tag}`).join(" ")}
          </Text>
        ) : null}

        {item.mentions.length ? (
          <Text style={[styles.tagLineMuted, { paddingHorizontal: postBodyInset, color: colors.mutedText }]}>
            {item.mentions.map((mention) => `@${mention}`).join(" ")}
          </Text>
        ) : null}

        {metaLine ? (
          <Text style={[styles.metaLine, { paddingHorizontal: postBodyInset, color: colors.mutedText }]}>{metaLine}</Text>
        ) : null}

        {item.collaboratorIds.length ? (
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

    return (
      <>
        <View style={styles.topBar}>
          <View
            style={[
              styles.topBarPanel,
              isCompactHeader && styles.topBarPanelCompact,
              { minHeight: isTabletLayout ? 70 : undefined },
              { backgroundColor: isDarkMode ? colors.surface : "#111827", borderColor: isDarkMode ? feedAccentBorder : "#1f2937" },
            ]}
          >
            <View style={styles.topLeft}>
              <TouchableOpacity style={styles.logoTapTarget} onPress={toggleMenu} activeOpacity={0.85}>
                <Image source={{ uri: "https://aline2.com/asstes/images/logo/logo.jpeg" }} style={styles.logo} />
              </TouchableOpacity>
              <View style={styles.brandCopy}>
                <Text
                  style={[styles.brand, isCompactHeader && styles.brandCompact, { color: "#FFFFFF" }]}
                  numberOfLines={1}
                >
                  Aline2
                </Text>
                <Text
                  style={[
                    styles.brandSubline,
                    isCompactHeader && styles.brandSublineCompact,
                    { color: "rgba(255,255,255,0.78)" },
                  ]}
                  numberOfLines={1}
                >
                  For you today
                </Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.88}
              style={[
                styles.promoteButton,
                isCompactHeader && styles.promoteButtonCompact,
                { backgroundColor: feedAccentSoft, borderColor: feedAccentBorder },
              ]}
              onPress={() => navigation.navigate("HowToEarnScreen")}
            >
              <Icon name="megaphone-outline" size={18} color={FEED_ACCENT} />
              <Text
                style={[
                  styles.promoteButtonText,
                  isCompactHeader && styles.promoteButtonTextCompact,
                  { color: FEED_ACCENT },
                ]}
              >
                Promote
              </Text>
            </TouchableOpacity>

            <View style={styles.topRight}>
              <TouchableOpacity
                style={[
                  styles.headerIconButton,
                  isCompactHeader && styles.headerIconButtonCompact,
                  { backgroundColor: feedAccentSoft, borderColor: feedAccentBorder },
                ]}
                onPress={() => navigation.navigate("LiveStreamsScreen")}
              >
                <Icon name="radio-outline" size={isCompactHeader ? 18 : 20} color={FEED_ACCENT} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.headerIconGap,
                  isCompactHeader && styles.headerIconGapCompact,
                  styles.headerIconButton,
                  isCompactHeader && styles.headerIconButtonCompact,
                  { backgroundColor: feedAccentSoft, borderColor: feedAccentBorder },
                ]}
                onPress={() => navigation.navigate("Search")}
              >
                <Icon name="search-outline" size={isCompactHeader ? 18 : 20} color={FEED_ACCENT} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.headerIconGap,
                  isCompactHeader && styles.headerIconGapCompact,
                  styles.headerIconButton,
                  isCompactHeader && styles.headerIconButtonCompact,
                  { backgroundColor: feedAccentSoft, borderColor: feedAccentBorder },
                ]}
                onPress={openNotifications}
              >
                <Icon name="notifications-outline" size={isCompactHeader ? 18 : 20} color={FEED_ACCENT} />
                {unreadNotificationCount > 0 ? (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                    </Text>
                  </View>
                ) : null}
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
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 65 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item?: Post; isViewable?: boolean }> }) => {
    const firstVisiblePost = viewableItems.find((entry) => entry.isViewable && entry.item?.id)?.item;
    if (firstVisiblePost?.id) {
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
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
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
                  setFeed((prev) => ({ ...prev, posts: [...prev.posts, ...data.posts] }));
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
  feedContent: { paddingTop: 4, paddingBottom: 124 },
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
  promoteButton: {
    minHeight: 36,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    marginHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  promoteButtonCompact: {
    minHeight: 32,
    paddingHorizontal: 8,
    marginHorizontal: 4,
  },
  promoteButtonText: {
    marginLeft: 5,
    fontSize: 13,
    fontWeight: "800",
  },
  promoteButtonTextCompact: {
    marginLeft: 4,
    fontSize: 11.5,
  },
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
  headerIconButtonCompact: {
    width: 32,
    height: 32,
    borderRadius: 10,
  },
  notificationBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
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
  storyRingUnseen: { borderColor: FEED_ACCENT },
  storyRingSeen: { borderColor: "#d4dde9" },
  storyRingCloseFriends: { borderColor: "#22c55e" },
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
  storyName: { marginTop: 7, fontSize: 12.5, color: "#272727", fontWeight: "700" },
  postCard: {
    marginHorizontal: 14,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: "hidden",
  },
  instagramPostCard: {
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  postHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 15, paddingBottom: 12 },
  postHeaderIdentity: { flexDirection: "row", alignItems: "center", flex: 1 },
  postAvatar: { width: 52, height: 52, borderRadius: 26 },
  postAvatarCompact: { width: 46, height: 46, borderRadius: 23 },
  userMeta: { marginLeft: 11, flexShrink: 1 },
  row: { flexDirection: "row", alignItems: "center" },
  username: { fontSize: 17, fontWeight: "700", color: "#111" },
  verifiedIcon: { marginLeft: 5 },
  postTime: { fontSize: 13.5, color: "#666", marginTop: 3 },
  moreButton: {
    marginLeft: "auto",
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
  mediaFallback: { backgroundColor: "#f3f3f3" },
  postImage: { height: 360, backgroundColor: "#f3f3f3" },
  mediaPressSurface: { position: "relative" },
  postStickerLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  postEmojiSticker: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  postEmojiStickerText: {
    fontSize: 30,
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
    right: 14,
    top: 14,
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
  mediaMusicChip: {
    position: "absolute",
    left: 14,
    bottom: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(0,0,0,0.56)",
  },
  mediaMusicChipText: {
    flex: 1,
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  actionsRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  actionButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  trailingActions: { marginLeft: "auto", flexDirection: "row", alignItems: "center" },
  trailingActionButton: { marginRight: 0, marginLeft: 8 },
  likesText: { fontWeight: "700", color: "#121212", fontSize: 15, paddingHorizontal: 18 },
  caption: { fontSize: 15.5, color: "#131313", paddingHorizontal: 18, paddingTop: 7, lineHeight: 23 },
  captionUser: { fontWeight: "700" },
  tagLine: { color: FEED_ACCENT, fontSize: 13.5, paddingHorizontal: 18, paddingTop: 7, fontWeight: "700" },
  tagLineMuted: { color: "#5a5a5a", fontSize: 13, paddingHorizontal: 18, paddingTop: 4 },
  metaLine: { color: "#646464", fontSize: 13, paddingHorizontal: 18, paddingTop: 7 },
  collabLine: { color: "#2f2f2f", fontSize: 13, paddingHorizontal: 18, paddingTop: 5, fontWeight: "600" },
  commentCount: { color: "#787878", fontSize: 13, paddingHorizontal: 18, paddingTop: 9 },
  commentComposer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 18,
    marginTop: 10,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  commentInput: { flex: 1, fontSize: 14.5, color: "#222", paddingVertical: 6 },
  postButton: { color: FEED_ACCENT, fontWeight: "700", fontSize: 14, paddingHorizontal: 8 },
  commentsDisabled: {
    color: "#707070",
    fontSize: 13,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 16,
  },
});

export default FeedScreen;
