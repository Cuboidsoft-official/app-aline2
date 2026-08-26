import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
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
import AsyncStorage from "@react-native-async-storage/async-storage";

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
import { getStoredUser, getStoredUserId } from "../utils/authSession";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { normalizeMediaUrl } from "../utils/mediaUrls";
import { useAppTheme } from "../theme/AppThemeContext";
import { PHOTO_FILTER_LIST } from "../utils/photoFilters";
import { resolveMentionUserId } from "../utils/mentionLinks";
import { shouldShowVerifiedBadge } from "../utils/verificationBadges";
import { APP_BOTTOM_DOCK_BASE_HEIGHT } from "../components/AppBottomDock";
import AppAvatar from "../components/AppAvatar";
import FeaturedProfilesCarousel from "../components/FeaturedProfilesCarousel";
import VoiceRecorderButton from "../components/chat/VoiceRecorderButton";
import { downloadImageAsset } from "../utils/mediaDownload";
import { connectSocket, socket } from "../socket";
import { listLiveStreams } from "../utils/liveStreamApi";
import { APP_RELEASE_DATE, APP_VERSION } from "../config/appMeta";
import { FEED_VIDEO_SOUND_DEFAULT, isFeedVideoSoundOn, shouldMountFeedVideo, shouldMuteFeedVideo } from "../utils/feedMediaSound";
import { shouldTriggerFeedPrefetch } from "../utils/feedPrefetch";

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

const FEED_PAGE_SIZE = 10;
const FEED_FLATLIST_INITIAL_NUM_TO_RENDER = 6;
const FEED_FLATLIST_MAX_TO_RENDER_PER_BATCH = 6;
const FEED_FLATLIST_WINDOW_SIZE = 8;
const FEED_PREFETCH_TRIGGER_INDEX = 4;
const FEED_PREFETCH_BUFFER_ITEMS = 8;
const FEED_LOAD_MORE_DELAY_MS = 180;
const FEED_LOAD_MORE_THROTTLE_MS = 1200;
const FEED_MEDIA_ASPECT_RATIO = 4 / 5;
const FEED_INTEREST_STORAGE_KEY = "aline2.feed.interest.v1";

type FeedInterestProfile = {
  posts: Record<string, number>;
  authors: Record<string, number>;
  hashtags: Record<string, number>;
  types: Record<string, number>;
};

const emptyFeedInterestProfile = (): FeedInterestProfile => ({
  posts: {},
  authors: {},
  hashtags: {},
  types: {},
});

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

const normalizeMediaDurationMs = (value?: number): number => {
  const duration = Math.max(0, Number(value || 0));

  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  return duration <= 180 ? duration * 1000 : duration;
};

const getVideoDurationKey = (postId?: string, assetId?: string) =>
  `${String(postId || "")}:${String(assetId || "")}`;

const getMeasuredVideoDurationMs = (
  measuredDurations: Record<string, number>,
  postId?: string,
  assetId?: string,
): number => normalizeMediaDurationMs(measuredDurations[getVideoDurationKey(postId, assetId)]);

const getPostVideoLoopDurationMs = (
  post?: Post | null,
  carouselIndex = 0,
  measuredDurations: Record<string, number> = {},
): number => {
  if (!post?.media?.length) {
    return 0;
  }

  const activeAsset = post.media[Math.max(0, carouselIndex)];
  const activeDurationMs = activeAsset?.mediaType === "video"
    ? getMeasuredVideoDurationMs(measuredDurations, post.id, activeAsset.id) || normalizeMediaDurationMs(activeAsset.durationMs)
    : 0;
  if (activeDurationMs > 0) {
    return activeDurationMs;
  }

  const firstVideo = post.media.find((asset) =>
    asset.mediaType === "video"
    && (getMeasuredVideoDurationMs(measuredDurations, post.id, asset.id) > 0 || normalizeMediaDurationMs(asset.durationMs) > 0)
  );
  return getMeasuredVideoDurationMs(measuredDurations, post.id, firstVideo?.id) || normalizeMediaDurationMs(firstVideo?.durationMs);
};

const getPostAspectRatio = (
  post: Post,
  measuredRatios: Record<string, number> = {},
): number => {
  const primaryMedia = Array.isArray(post.media) ? post.media[0] : null;
  const key = getVideoDurationKey(post.id, primaryMedia?.id);
  const measured = measuredRatios[key];
  if (measured && Number.isFinite(measured) && measured > 0) {
    return Math.max(4 / 5, Math.min(16 / 9, measured));
  }

  const width = Number(primaryMedia?.width || 0);
  const height = Number(primaryMedia?.height || 0);
  const mediaRatio = width > 0 && height > 0 ? width / height : 0;

  if (!Number.isFinite(mediaRatio) || mediaRatio <= 0) {
    return FEED_MEDIA_ASPECT_RATIO;
  }

  return Math.max(4 / 5, Math.min(16 / 9, mediaRatio));
};

const bumpFeedInterestBucket = (bucket: Record<string, number>, key: string, amount: number) => {
  const normalizedKey = String(key || "").trim().toLowerCase();
  if (!normalizedKey) {
    return;
  }

  bucket[normalizedKey] = Math.min(1000, Math.max(0, Number(bucket[normalizedKey] || 0) + amount));
};

const decayFeedInterestProfile = (profile: FeedInterestProfile): FeedInterestProfile => {
  const decayBucket = (bucket: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(bucket)
        .map(([key, value]) => [key, Math.round(Number(value || 0) * 0.96 * 100) / 100] as const)
        .filter(([, value]) => value >= 0.2),
    );

  return {
    posts: decayBucket(profile.posts || {}),
    authors: decayBucket(profile.authors || {}),
    hashtags: decayBucket(profile.hashtags || {}),
    types: decayBucket(profile.types || {}),
  };
};

const scorePostForLocalInterest = (post: Post, profile: FeedInterestProfile): number => {
  const postKey = String(post.id || "").toLowerCase();
  const authorKey = String(post.user?.id || "").toLowerCase();
  const typeKey = String(post.type || post.postType || "post").toLowerCase();
  const hashtagScore = (post.hashtags || []).reduce(
    (total, tag) => total + Number(profile.hashtags[String(tag || "").toLowerCase()] || 0),
    0,
  );

  return Number(profile.posts[postKey] || 0) * 0.5
    + Number(profile.authors[authorKey] || 0) * 3
    + Number(profile.types[typeKey] || 0) * 1.2
    + hashtagScore * 1.6
    + Math.min(10, Number(post.likesCount || 0) * 0.02 + Number(post.commentsCount || 0) * 0.04 + Number(post.sharesCount || 0) * 0.08);
};

const rankFeedPostsByLocalInterest = (posts: Post[], profile: FeedInterestProfile): Post[] =>
  [...posts].sort((left, right) => {
    const scoreDiff = scorePostForLocalInterest(right, profile) - scorePostForLocalInterest(left, profile);
    if (Math.abs(scoreDiff) > 0.01) {
      return scoreDiff;
    }

    return Number(right.createdAt || 0) - Number(left.createdAt || 0);
  });

const getImageResizeMode = (
  asset: Post["media"][number] | undefined,
  frameAspectRatio: number,
): "contain" | "cover" => {
  const width = Number(asset?.width || 0);
  const height = Number(asset?.height || 0);
  const mediaRatio = width > 0 && height > 0 ? width / height : frameAspectRatio;

  if (mediaRatio > 0 && mediaRatio < 0.76) {
    return "contain";
  }

  return "cover";
};

const getMediaFrameTransformStyle = (
  asset: Post["media"][number] | undefined,
  width: number,
  height: number,
) => {
  const transform = asset?.frameTransform;
  if (!transform || (!transform.scale && !transform.translateX && !transform.translateY)) {
    return undefined;
  }
  const scale = Math.max(1, Math.min(4, Number(transform?.scale || 1)));
  const translateX = Math.max(-1, Math.min(1, Number(transform?.translateX || 0))) * width;
  const translateY = Math.max(-1, Math.min(1, Number(transform?.translateY || 0))) * height;

  if (scale === 1 && translateX === 0 && translateY === 0) {
    return undefined;
  }

  return {
    transform: [
      { translateX },
      { translateY },
      { scale },
    ],
  };
};

const mergeFeedPostsPreserveOrder = (existing: Post[], incoming: Post[]): Post[] => {
  const merged: Post[] = [...existing];
  const seenIds = new Set(existing.map((post) => String(post?.id || "")).filter(Boolean));

  for (const post of incoming) {
    const normalizedId = String(post?.id || "");
    if (!normalizedId || seenIds.has(normalizedId)) {
      continue;
    }

    seenIds.add(normalizedId);
    merged.push(post);
  }

  return merged;
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

const shuffleFeedPosts = (items: Post[]): Post[] => {
  const shuffledItems = [...items];

  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffledItems[index], shuffledItems[swapIndex]] = [shuffledItems[swapIndex], shuffledItems[index]];
  }

  return shuffledItems;
};

type CurrentUserSummary = {
  id: string;
  avatarUrl: string;
  username: string;
  name: string;
  email?: string;
  followingIds: string[];
};

type FeedRelationshipKind = "self" | "follow" | "follow_back" | "following" | "message";

type SellerAccountSummary = {
  id: string;
  sellerName: string;
  availabilityStatus: boolean;
};

function FeedScreen({ navigation, route }: any) {
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
  const [featuredCarouselIndex, setFeaturedCarouselIndex] = useState(3);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [walletCoinBalance, setWalletCoinBalance] = useState(0);
  const [availabilityUpdating, setAvailabilityUpdating] = useState(false);
  const [liveStories, setLiveStories] = useState<any[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activePostId, setActivePostId] = useState<string>("");
  const [measuredVideoDurations, setMeasuredVideoDurations] = useState<Record<string, number>>({});
  const [measuredVideoAspectRatios, setMeasuredVideoAspectRatios] = useState<Record<string, number>>({});
  const [mutedPostIds, setMutedPostIds] = useState<Record<string, boolean>>({});
  const [expandedCaptionIds, setExpandedCaptionIds] = useState<Record<string, boolean>>({});
  const [carouselIndexByPostId, setCarouselIndexByPostId] = useState<Record<string, number>>({});
  const [likeBurstPostId, setLikeBurstPostId] = useState("");
  const [isVideoSoundEnabled, setIsVideoSoundEnabled] = useState(FEED_VIDEO_SOUND_DEFAULT);
  const [menuOpen, setMenuOpen] = useState(false);
  const [publishTasks, setPublishTasks] = useState<PublishQueueTask[]>(() => getPublishQueueSnapshot());
  const slideAnim = useRef(new Animated.Value(0)).current;
  const feedListRef = useRef<FlatList<any> | null>(null);
  const hasFeedContentRef = useRef(false);
  const feedMetaSnapshotRef = useRef<{
    liveStories: any[];
    sellerAccount: SellerAccountSummary | null;
    unreadNotificationCount: number;
    walletCoinBalance: number;
  }>({
    liveStories: [],
    sellerAccount: null,
    unreadNotificationCount: 0,
    walletCoinBalance: 0,
  });
  const feedLoadMoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedLoadMoreRequestRef = useRef(false);
  const feedLastLoadMoreAtRef = useRef(0);
  const feedInterestRef = useRef<FeedInterestProfile>(emptyFeedInterestProfile());
  const activePostDwellRef = useRef<{ postId: string; startedAt: number }>({ postId: "", startedAt: 0 });
  const [_feedInterestVersion, setFeedInterestVersion] = useState(0);
  const loadedFeedScopeRef = useRef("");
  const lastViewablePostIdRef = useRef("");
  const postTapRef = useRef<{ id: string; time: number; timeout: ReturnType<typeof setTimeout> | null }>({
    id: "",
    time: 0,
    timeout: null,
  });
  const carouselScrollRefs = useRef<Record<string, ScrollView | null>>({});
  const carouselGestureStartRef = useRef<Record<string, { x: number; y: number }>>({});
  const carouselGestureIntentRef = useRef<Record<string, "horizontal" | "vertical" | "unknown">>({});
  const homeReloadHandledRef = useRef("");
  const isTabletLayout = width >= 768;
  const focusedPostId = String(route?.params?.postId || "").trim();
  const focusUserId = String(route?.params?.userId || "").trim();
  const isFocusedPostFeed = Boolean(focusUserId);
  const feedScopeKey = isFocusedPostFeed ? `user:${focusUserId}` : "home";
  const feedListItems = useMemo(() => {
    if (isFocusedPostFeed || !feed.posts.length) {
      return feed.posts;
    }

    const insertionIndex = Math.min(Math.max(1, featuredCarouselIndex), feed.posts.length);
    const nextItems: any[] = [...feed.posts];
    nextItems.splice(insertionIndex, 0, { id: "featured-profiles-carousel", __featuredProfiles: true });
    return nextItems;
  }, [feed.posts, featuredCarouselIndex, isFocusedPostFeed]);

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
  const homeReloadNonce = String(route?.params?.reloadNonce || "").trim();
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
  const activePublishTask = publishTasks[0] || null;
  const completedPublishTaskIdsRef = useRef<Set<string>>(new Set());
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
          { icon: "wallet-outline", label: "User Wallet", screen: "WalletScreen" },
          { icon: "notifications-outline", label: "Notifications", screen: "NotificationScreen" },
          { icon: "trophy-outline", label: "Leaderboard", screen: "LeaderboardScreen" },
        ],
      },
      {
        title: "Growth",
        data: [
          { icon: "star-outline", label: "Feature Your Profile", screen: "HowToEarnScreen", params: { section: "searchProfile" } },
          { icon: "newspaper-outline", label: "Listed Ads", screen: "HowToEarnScreen", params: { section: "listedAds" } },
          { icon: "gift-outline", label: "Refer and Earn", screen: "HowToEarnScreen", params: { section: "howToEarn" } },
          { icon: "cash-outline", label: "How to Earn", screen: "HowToEarnScreen", params: { section: "howToEarn" } },
          { icon: "megaphone-outline", label: "Promotions", screen: "HowToEarnScreen" },
          hasSellerAccount
            ? { icon: "briefcase-outline", label: "Seller Workspace", screen: "SellerDashboardScreen" }
            : { icon: "storefront-outline", label: "Become a Seller", screen: "SellerRegistration" },
        ],
      },
      {
        title: "Support",
        data: [
          { icon: "settings-outline", label: "Settings", screen: "SettingsScreen" },
          { icon: "chatbox-ellipses-outline", label: "Suggestion / Feedback", screen: "FeedbackScreen" },
          { icon: "shield-alert-outline", label: "Customer Support (Report Fraud)", screen: "CustomerSupportScreen" },
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

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(FEED_INTEREST_STORAGE_KEY)
      .then((value) => {
        if (!mounted || !value) {
          return;
        }

        const parsed = JSON.parse(value);
        feedInterestRef.current = {
          ...emptyFeedInterestProfile(),
          ...(parsed && typeof parsed === "object" ? parsed : {}),
        };
        setFeedInterestVersion((version) => version + 1);
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  const persistFeedInterestProfile = useCallback((nextProfile: FeedInterestProfile) => {
    feedInterestRef.current = nextProfile;
    setFeedInterestVersion((version) => version + 1);
    AsyncStorage.setItem(FEED_INTEREST_STORAGE_KEY, JSON.stringify(nextProfile)).catch(() => undefined);
  }, []);

  const trackFeedInterest = useCallback((post: Post | undefined | null, action: "view" | "like" | "comment" | "share" | "profile", amount?: number) => {
    if (!post?.id || isFocusedPostFeed) {
      return;
    }

    const weightByAction = {
      view: 0.75,
      like: 8,
      comment: 11,
      share: 14,
      profile: 10,
    };
    const weight = Math.max(0, amount ?? weightByAction[action]);
    const nextProfile = decayFeedInterestProfile(feedInterestRef.current);

    bumpFeedInterestBucket(nextProfile.posts, post.id, weight * 0.6);
    bumpFeedInterestBucket(nextProfile.authors, post.user?.id, weight);
    bumpFeedInterestBucket(nextProfile.types, post.type || post.postType || "post", weight * 0.35);
    (post.hashtags || []).slice(0, 8).forEach((tag) => {
      bumpFeedInterestBucket(nextProfile.hashtags, tag, weight * 0.8);
    });

    persistFeedInterestProfile(nextProfile);
  }, [isFocusedPostFeed, persistFeedInterestProfile]);

  const personalizeFeedPosts = useCallback((posts: Post[]) => {
    if (isFocusedPostFeed || !posts.length) {
      return posts;
    }

    return [...posts];
  }, [isFocusedPostFeed]);

  const loadFeedSnapshot = useCallback(async (options: { lightweight?: boolean } = {}) => {
    if (isFocusedPostFeed) {
      const [data, storedUser] = await Promise.all([
        focusUserId ? socialApi.getUserFeed(focusUserId) : socialApi.getFeed(),
        getStoredUser(),
      ]);

      return {
        data,
        storedUser,
        seller: null,
        unreadNotifications: 0,
        walletBalance: 0,
        liveStories: [],
      };
    }

    if (options.lightweight) {
      const [data, storedUser] = await Promise.all([
        socialApi.getFeed(),
        getStoredUser(),
      ]);
      const metaSnapshot = feedMetaSnapshotRef.current;

      return {
        data,
        storedUser,
        seller: metaSnapshot.sellerAccount,
        unreadNotifications: metaSnapshot.unreadNotificationCount,
        walletBalance: metaSnapshot.walletCoinBalance,
        liveStories: metaSnapshot.liveStories,
      };
    }

    const [data, storedUser, seller, unreadNotifications, liveStreamsResponse, walletBalance] = await Promise.all([
      focusUserId ? socialApi.getUserFeed(focusUserId) : socialApi.getFeed(1, FEED_PAGE_SIZE),
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
  }, [
    focusUserId,
    isFocusedPostFeed,
    readSellerAccount,
    readUnreadNotificationCount,
    readWalletBalance,
  ]);

  const applyFeedSnapshot = useCallback((snapshot: any, options: { shufflePosts?: boolean; preserveActivePostId?: string } = {}) => {
    const { data, liveStories: nextLiveStories, seller, storedUser, unreadNotifications, walletBalance } = snapshot;
    const responsePosts = Array.isArray(data?.posts) ? data.posts : [];
    const nextPosts = buildGroupedFeedPosts(responsePosts);
    const preserveActivePostId = String(options.preserveActivePostId || focusedPostId || "").trim();

    const orderedPosts = preserveActivePostId
      ? mergeFeedPostsPreserveOrder(
          nextPosts.filter((post) => post.id === preserveActivePostId),
          nextPosts.filter((post) => post.id !== preserveActivePostId),
        )
      : personalizeFeedPosts(nextPosts);

    setFeed({
      ...data,
      posts: options.shufflePosts && !isFocusedPostFeed
        ? shuffleFeedPosts(orderedPosts)
        : orderedPosts,
    });
    setLiveStories(nextLiveStories);
    setPage(1);
    setHasMore(responsePosts.length >= FEED_PAGE_SIZE);
    setCurrentUser(
      storedUser
        ? {
          id: String(storedUser._id || storedUser.id || ""),
          avatarUrl: storedUser.profilePic || storedUser.avatarUrl || "",
          username: String(storedUser.username || ""),
          name: String(storedUser.name || ""),
          email: String(storedUser.email || ""),
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
  }, [focusedPostId, isFocusedPostFeed, personalizeFeedPosts]);

  // Live re-sorting on interest updates is disabled to prevent posts from jumping/changing order while scrolling.
  // Feed order remains stable until the user explicitly refreshes or reloads.

  const loadFeed = useCallback(async (options: { shufflePosts?: boolean; lightweight?: boolean; preserveActivePostId?: string } = {}) => {
    feedLoadMoreRequestRef.current = false;
    feedLastLoadMoreAtRef.current = 0;
    if (feedLoadMoreTimeoutRef.current) {
      clearTimeout(feedLoadMoreTimeoutRef.current);
      feedLoadMoreTimeoutRef.current = null;
    }
    const snapshot = await loadFeedSnapshot({ lightweight: options.lightweight });
    applyFeedSnapshot(snapshot, options);
    loadedFeedScopeRef.current = feedScopeKey;
  }, [applyFeedSnapshot, feedScopeKey, loadFeedSnapshot]);

  const loadMoreFeed = useCallback(() => {
    try {
      if (isFocusedPostFeed || loadingMore || !hasMore || feedLoadMoreRequestRef.current) {
        return;
      }

      const now = Date.now();
      if (now - feedLastLoadMoreAtRef.current < FEED_LOAD_MORE_THROTTLE_MS) {
        return;
      }

      feedLastLoadMoreAtRef.current = now;
      feedLoadMoreRequestRef.current = true;
      if (feedLoadMoreTimeoutRef.current) {
        clearTimeout(feedLoadMoreTimeoutRef.current);
      }

      feedLoadMoreTimeoutRef.current = setTimeout(() => {
        const nextPage = Number(page || 1) + 1;
        setLoadingMore(true);
        socialApi.getFeed(nextPage, FEED_PAGE_SIZE)
          .then((data) => {
            const nextPosts = Array.isArray(data?.posts) ? data.posts : [];
            if (!nextPosts.length) {
              setHasMore(false);
              return;
            }

            setFeed((prev) => {
              const existingIds = new Set((Array.isArray(prev?.posts) ? prev.posts : []).map((post) => String(post?.id || "")).filter(Boolean));
              const uniqueNextPosts = nextPosts.filter((post) => {
                const id = String(post?.id || "");
                return !!id && !existingIds.has(id);
              });

              if (!uniqueNextPosts.length) {
                setHasMore(false);
                return prev;
              }

              return {
                ...prev,
                posts: mergeFeedPostsPreserveOrder(Array.isArray(prev?.posts) ? prev.posts : [], uniqueNextPosts),
              };
            });
            setPage(nextPage);
            if (nextPosts.length < FEED_PAGE_SIZE) {
              setHasMore(false);
            }
          })
          .catch((error) => {
            console.log("feed load more error:", error);
          })
          .finally(() => {
            feedLoadMoreRequestRef.current = false;
            feedLoadMoreTimeoutRef.current = null;
            setLoadingMore(false);
          });
      }, FEED_LOAD_MORE_DELAY_MS);
    } catch (error) {
      console.log("feed load more trigger crashed:", error);
      feedLoadMoreRequestRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, isFocusedPostFeed, loadingMore, page]);

  useEffect(() => {
    let active = true;

    const ensureFocusedPostVisible = async () => {
      if (!focusedPostId || feed.posts.some((item) => item.id === focusedPostId)) {
        return;
      }

      try {
        const post = await socialApi.getPost(focusedPostId);
        if (active) {
          setFeed((prev) => ({
            ...prev,
            posts: buildMixedLatestFeedPosts([post, ...prev.posts]),
          }));
        }
      } catch (error) {
        console.log("focused post lookup error:", error);
      }
    };

    ensureFocusedPostVisible();

    return () => {
      active = false;
    };
  }, [focusedPostId, feed.posts]);

  const focusedPostScrolledRef = useRef("");

  useEffect(() => {
    if (!focusedPostId || !feed.posts.length || focusedPostScrolledRef.current === focusedPostId) {
      return;
    }

    const targetIndex = feedListItems.findIndex((item) => item.id === focusedPostId);
    if (targetIndex < 0) {
      return;
    }

    focusedPostScrolledRef.current = focusedPostId;
    setActivePostId(focusedPostId);
    requestAnimationFrame(() => {
      feedListRef.current?.scrollToIndex?.({ index: targetIndex, animated: false });
    });
  }, [focusedPostId, feed.posts.length, feedListItems]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const runInitialFeedLoad = async () => {
        // Already loaded for this scope → DO NOTHING
        if (
          loadedFeedScopeRef.current === feedScopeKey &&
          hasFeedContentRef.current
        ) {
          return;
        }

        try {
          setLoading(true);

          const snapshot = await loadFeedSnapshot();

          if (!active) {
            return;
          }

          applyFeedSnapshot(snapshot);

          loadedFeedScopeRef.current = feedScopeKey;
          hasFeedContentRef.current =
            Array.isArray(snapshot?.data?.posts) &&
            snapshot.data.posts.length > 0;

        } catch (error) {
          if (!active) {
            return;
          }

          console.log("Initial feed load error:", error);

          setErrorMessage(
            getReadableApiErrorMessage(
              error,
              "Failed to load your feed."
            )
          );
        } finally {
          if (active) {
            setLoading(false);
            setRefreshing(false);
          }
        }
      };

      runInitialFeedLoad();

      return () => {
        active = false;
        setActivePostId("");
      };
    }, [feedScopeKey])
  );

  useEffect(() => {
    const previous = activePostDwellRef.current;
    if (previous.postId && previous.startedAt) {
      const dwellMs = Date.now() - previous.startedAt;
      if (dwellMs >= 2000) {
        trackFeedInterest(
          feed.posts.find((post) => post.id === previous.postId),
          "view",
          Math.min(12, dwellMs / 3000),
        );
      }
    }

    activePostDwellRef.current = {
      postId: activePostId,
      startedAt: activePostId && isScreenFocused && !activeSheet ? Date.now() : 0,
    };

    return () => {
      const current = activePostDwellRef.current;
      if (current.postId && current.startedAt) {
        const dwellMs = Date.now() - current.startedAt;
        if (dwellMs >= 2000) {
          trackFeedInterest(
            feed.posts.find((post) => post.id === current.postId),
            "view",
            Math.min(12, dwellMs / 3000),
          );
        }
      }
      activePostDwellRef.current = { postId: "", startedAt: 0 };
    };
  }, [activePostId, activeSheet, feed.posts, isScreenFocused, trackFeedInterest]);

  useEffect(() => {
    feedMetaSnapshotRef.current = {
      liveStories,
      sellerAccount,
      unreadNotificationCount,
      walletCoinBalance,
    };
  }, [liveStories, sellerAccount, unreadNotificationCount, walletCoinBalance]);

  useEffect(() => {
    hasFeedContentRef.current = feed.posts.length > 0;
  }, [feed.posts.length]);

  useEffect(() => {
    if (isFocusedPostFeed || feed.posts.length < 3) {
      return;
    }

    setFeaturedCarouselIndex((currentIndex) => {
      const maxInsertionIndex = Math.min(feed.posts.length - 1, 7);
      const minInsertionIndex = Math.min(2, maxInsertionIndex);

      if (currentIndex >= minInsertionIndex && currentIndex <= maxInsertionIndex) {
        return currentIndex;
      }

      return minInsertionIndex + Math.floor(Math.random() * Math.max(1, maxInsertionIndex - minInsertionIndex + 1));
    });
  }, [feed.posts.length, isFocusedPostFeed]);

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

    const handleRealtimeNotification = async (payload: any) => {
      const receiverId = String(payload?.receiver?._id || payload?.receiver?.id || payload?.receiver || payload?.receiverId || "").trim();
      const currentUserId = String(await getStoredUserId() || "").trim();

      if (receiverId && currentUserId && receiverId !== currentUserId) {
        return;
      }

      setUnreadNotificationCount((current) => current + 1);
      listLiveStreams()
        .then((response) => {
          setLiveStories(Array.isArray(response?.liveStreams) ? response.liveStreams : []);
        })
        .catch(() => { });
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
      if (feedLoadMoreTimeoutRef.current) {
        clearTimeout(feedLoadMoreTimeoutRef.current);
        feedLoadMoreTimeoutRef.current = null;
        feedLoadMoreRequestRef.current = false;
      }
    };
  }, []);

  const onRefresh = useCallback(async () => {
    const postIdBeforeRefresh = focusedPostId || activePostId || lastViewablePostIdRef.current || feed.posts[0]?.id || "";
    setRefreshing(true);
    try {
      await loadFeed({
        lightweight: true,
        preserveActivePostId: postIdBeforeRefresh,
      });
      if (postIdBeforeRefresh) {
        setActivePostId(postIdBeforeRefresh);
      }
    } finally {
      setRefreshing(false);
      if (postIdBeforeRefresh) {
        requestAnimationFrame(() => setActivePostId(postIdBeforeRefresh));
      }
    }
  }, [activePostId, feed.posts, focusedPostId, loadFeed]);

  useEffect(() => {
    if (!homeReloadNonce || !isScreenFocused || homeReloadHandledRef.current === homeReloadNonce) {
      return;
    }

    homeReloadHandledRef.current = homeReloadNonce;
    setActivePostId("");
    feedListRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    setRefreshing(true);
    loadFeed({ lightweight: true, shufflePosts: true })
      .catch((error) => {
        setErrorMessage(getReadableApiErrorMessage(error, "Failed to reload your feed."));
      })
      .finally(() => {
        setRefreshing(false);
        requestAnimationFrame(() => feedListRef.current?.scrollToOffset?.({ offset: 0, animated: true }));
      });
  }, [homeReloadNonce, isScreenFocused, loadFeed]);

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

    const currentPost = feed.posts.find((item) => item.id === postId);
    trackFeedInterest(currentPost, "like");
    setIsActionBusy((prev) => ({ ...prev, [`like_${postId}`]: true }));
    try {
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
    setMutedPostIds((prev) => {
      const nextMuted = !prev[postId];
      return { ...prev, [postId]: nextMuted };
    });
  }, []);

  const handlePostAudioToggle = useCallback((post: Post) => {
    const hasVideoMedia = post.media.some((asset) => asset.mediaType === "video");
    const isMuted = !!mutedPostIds[post.id];

    if (isMuted) {
      togglePostMute(post.id);
      if (hasVideoMedia) {
        setIsVideoSoundEnabled(true);
      }
      return;
    }

    if (hasVideoMedia) {
      setIsVideoSoundEnabled((current) => !current);
    }
  }, [mutedPostIds, togglePostMute]);

  const triggerLikeBurst = useCallback((postId: string) => {
    setLikeBurstPostId(postId);
    setTimeout(() => {
      setLikeBurstPostId((current) => (current === postId ? "" : current));
    }, 720);
  }, []);

  const handlePostMediaPress = (post: Post) => {
    const now = Date.now();
    console.log("🔥 POST IMAGE TAPPED", post.id);
    const lastTap = postTapRef.current;
    const hasAudioLayer = post.media.some((asset) => asset.mediaType === "video");

    if (lastTap.id === post.id && now - lastTap.time < 260) {
      if (lastTap.timeout) {
        clearTimeout(lastTap.timeout);
      }
      postTapRef.current = { id: "", time: 0, timeout: null };
      triggerLikeBurst(post.id);
      handleLike(post.id).catch(() => undefined);
      return;
    }

    if (hasAudioLayer) {
      togglePostMute(post.id);
    }

    const timeout = setTimeout(() => {
      postTapRef.current = { id: "", time: 0, timeout: null };
    }, 260);

    postTapRef.current = {
      id: post.id,
      time: now,
      timeout,
    };
  };

  const getPostMediaHeight = useCallback((post: Post) => {
    return Math.round(postMediaWidth / getPostAspectRatio(post, measuredVideoAspectRatios));
  }, [measuredVideoAspectRatios, postMediaWidth]);

  const handleFeedVideoLoaded = useCallback((postId: string, assetId: string | undefined, event: any) => {
    const durationSeconds = Number(event?.duration || event?.nativeEvent?.duration || 0);
    const durationMs = Number.isFinite(durationSeconds) && durationSeconds > 0
      ? Math.round(durationSeconds * 1000)
      : 0;

    const naturalSize = event?.naturalSize || event?.nativeEvent?.naturalSize;
    const videoWidth = Number(naturalSize?.width || 0);
    const videoHeight = Number(naturalSize?.height || 0);

    if (videoWidth > 0 && videoHeight > 0) {
      const ratio = videoWidth / videoHeight;
      setMeasuredVideoAspectRatios((prev) => {
        const key = getVideoDurationKey(postId, assetId);
        if (prev[key] && Math.abs(prev[key] - ratio) < 0.05) {
          return prev;
        }
        return { ...prev, [key]: ratio };
      });
    }

    if (durationMs <= 0) {
      return;
    }

    setMeasuredVideoDurations((prev) => {
      const key = getVideoDurationKey(postId, assetId);
      if (Math.abs(Number(prev[key] || 0) - durationMs) < 250) {
        return prev;
      }

      return { ...prev, [key]: durationMs };
    });
  }, []);

  const submitComment = async (postId: string, audioFile?: CommentAudioFile) => {
    const draft = (commentDrafts[postId] || "").trim();
    if ((!draft && !audioFile?.uri) || isActionBusy[`comment_${postId}`]) {
      return;
    }

    trackFeedInterest(feed.posts.find((item) => item.id === postId), "comment");
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
    trackFeedInterest(post, "view", 3);
    setActivePostId(post.id);
  }, [trackFeedInterest]);

  const openUserProfile = useCallback((userId: string) => {
    const normalizedUserId = String(userId || "");
    if (!normalizedUserId) {
      return;
    }

    trackFeedInterest(feed.posts.find((post) => String(post.user?.id || "") === normalizedUserId), "profile");
    if (normalizedUserId === String(currentUser?.id || "")) {
      navigation.navigate("Profile");
      return;
    }

    navigation.navigate("ProfilePreviewScreen", { userId: normalizedUserId });
  }, [currentUser?.id, feed.posts, navigation, trackFeedInterest]);

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
  }, [colors.mutedText, colors.text, openHashtagResults, openLocationSearch]);

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
    slideAnim.stopAnimation();

    if (nextOpen) {
      setMenuOpen(true);
    }

    Animated.timing(slideAnim, {
      toValue: nextOpen ? 1 : 0,
      duration: nextOpen ? 140 : 120,
      easing: nextOpen ? Easing.out(Easing.quad) : Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !nextOpen) {
        setMenuOpen(false);
      }
    });
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
    API.put("/notifications/read-all").catch(() => { });
  }, [navigation]);

  const openWalletDashboard = useCallback(() => {
    navigation.navigate("WalletScreen");
  }, [navigation]);

  const navigateFromMenu = useCallback((target: any) => {
    const screen = typeof target === "string" ? target : target?.screen;
    const params = typeof target === "string" ? undefined : target?.params;

    if (!screen) {
      return;
    }

    closeMenu();
    if (screen === "NotificationScreen") {
      setUnreadNotificationCount(0);
      API.put("/notifications/read-all").catch(() => { });
    }
    navigation.navigate(screen, params);
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
    trackFeedInterest(post, "comment", 5);
    setSelectedPost(post);
    setActiveSheet("comments");
  };

  const openPostShareSheet = (post: Post) => {
    trackFeedInterest(post, "share");
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
        style={[styles.storyItem, { width: storyItemWidth }]}>
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

  const buildGroupedFeedPosts = (items: Post[]): Post[] => {
    if (!Array.isArray(items) || !items.length) {
      return [];
    }

    const groups: Post[] = [];

    // API is returning each image as a separate post.
    // We therefore group consecutive media posts belonging
    // to the same user.

    for (const item of items) {
      if (!item?.id) {
        continue;
      }

      const media = Array.isArray(item.media)
        ? item.media
        : [];

      // Nothing to group if this post has no media.
      if (!media.length) {
        groups.push(item);
        continue;
      }

      const previous = groups[groups.length - 1];

      const currentUserId = String(
        item?.user?.id ||
        (item?.user as any)?._id ||
        item?.user?.username ||
        ""
      ).trim();

      const previousUserId = String(
        previous?.user?.id ||
        (previous?.user as any)?._id ||
        previous?.user?.username ||
        ""
      ).trim();

      const previousMedia = Array.isArray(previous?.media)
        ? previous.media
        : [];

      /*
       * Group only when:
       *
       * 1. There is a previous post
       * 2. Same user
       * 3. Previous post has media
       * 4. Current post has media
       */
      const shouldGroup =
        !!previous &&
        !!currentUserId &&
        !!previousUserId &&
        currentUserId === previousUserId &&
        previousMedia.length > 0;

      if (!shouldGroup) {
        groups.push({
          ...item,
          media: [...media],
        });

        continue;
      }

      /*
       * Prevent duplicate media IDs.
       */
      const existingMediaIds = new Set(
        previousMedia.map((asset) => String(asset?.id))
      );

      const additionalMedia = media.filter(
        (asset) =>
          asset?.id &&
          !existingMediaIds.has(String(asset.id))
      );

      groups[groups.length - 1] = {
        ...previous,

        media: [
          ...previousMedia,
          ...additionalMedia,
        ],

        /*
         * Keep newest timestamp for ordering.
         */
        createdAt:
          Number(item.createdAt || 0) >
            Number(previous.createdAt || 0)
            ? item.createdAt
            : previous.createdAt,
      };
    }

    return groups.sort(
      (a, b) =>
        Number(b?.createdAt || 0) -
        Number(a?.createdAt || 0),
    );
  };

  const renderPostMedia = (post: Post, postIndex?: number) => {
    const mediaHeight = getPostMediaHeight(post);
    if (!Array.isArray(post.media) || !post.media.length) {
      return <View style={[styles.postImage, styles.mediaFallback, { width: postMediaWidth, height: mediaHeight }]} />;
    }

    const frameAspectRatio = postMediaWidth / Math.max(1, mediaHeight);
    const currentCarouselIndex = carouselIndexByPostId[post.id] || 0;
    const isMuted = !!mutedPostIds[post.id];

    const postIndexInFeed = feedListItems.findIndex((p) => p.id === post.id);
    const activePostIndexInFeed = feedListItems.findIndex((p) => p.id === activePostId);
    const effectiveActiveIndex = activePostIndexInFeed >= 0 ? activePostIndexInFeed : 0;
    const effectivePostIndex = postIndexInFeed >= 0 ? postIndexInFeed : typeof postIndex === "number" ? postIndex : 0;

    const isPostActive = (activePostId ? activePostId === post.id : effectivePostIndex === 0) && isScreenFocused && !activeSheet;
    const isPreloadTarget = false;

    const shouldPreloadVideo = isPreloadTarget;
    const shouldMountVideo = (isCarouselItemActive = true) =>
      shouldMountFeedVideo({
        isPostActive,
        isCarouselItemActive,
        isScreenFocused,
        isScrolling: false,
      });
    const renderSensitiveBadge = (label?: string) => (
      <View pointerEvents="none" style={styles.sensitiveBadge}>
        <Text style={styles.sensitiveBadgeText}>{label ? `${label} sensitive content` : 'Sensitive content'}</Text>
      </View>
    );

    const isCarousel = Array.isArray(post.media) && post.media.length > 1;
    if (!isCarousel) {
      const primaryMedia = post.media[0];
      if (!primaryMedia?.url) {
        return <View style={[styles.postImage, styles.mediaFallback, { width: postMediaWidth, height: mediaHeight }]} />;
      }

      if (primaryMedia?.mediaType === 'video') {
        const shouldShowActiveVideo = shouldMountVideo(true);
        return (
          <View style={[styles.postImage, { width: postMediaWidth, height: mediaHeight, overflow: 'hidden' }]}>

            <View style={[StyleSheet.absoluteFillObject, getMediaFrameTransformStyle(primaryMedia, postMediaWidth, mediaHeight)]}>
              <SocialVideo
                uri={normalizeMediaUrl(primaryMedia.url)}
                posterUri={normalizeMediaUrl(primaryMedia.thumbnailUrl || '')}
                style={StyleSheet.absoluteFill}
                paused={!shouldShowActiveVideo}
                preload={shouldPreloadVideo && shouldShowActiveVideo}
                muted={shouldMuteFeedVideo({
                  isPostActive: shouldShowActiveVideo,
                  isVideoSoundEnabled,
                  isPostMuted: isMuted,
                })}
                repeat
                restartKey={post.id}
                onLoad={(event) => handleFeedVideoLoaded(post.id, primaryMedia.id, event)}
                resizeMode={getImageResizeMode(primaryMedia, frameAspectRatio)}
                contentBlurRadius={primaryMedia.sensitiveContent?.isSensitive ? 22 : 0}
                showBufferingLoader={false}
              />
            </View>
            {primaryMedia.sensitiveContent?.isSensitive ? renderSensitiveBadge(primaryMedia.sensitiveContent.label) : null}
          </View>
        );
      }

      const imageResizeMode = getImageResizeMode(primaryMedia, frameAspectRatio);
      const rawImage = (
        <View style={[styles.postImage, { width: postMediaWidth, height: mediaHeight, overflow: 'hidden' }]}>

          <View style={[StyleSheet.absoluteFillObject, getMediaFrameTransformStyle(primaryMedia, postMediaWidth, mediaHeight)]}>
            <ProgressiveImage
              uri={normalizeMediaUrl(primaryMedia?.url)}
              previewUri={normalizeMediaUrl(primaryMedia?.thumbnailUrl || primaryMedia?.url)}
              style={StyleSheet.absoluteFill}
              resizeMode={imageResizeMode}
              contentBlurRadius={primaryMedia?.sensitiveContent?.isSensitive ? 22 : 0}
            />
          </View>
          {primaryMedia?.sensitiveContent?.isSensitive ? renderSensitiveBadge(primaryMedia.sensitiveContent.label) : null}
        </View>
      );

      if (post.filterPreset && ColorMatrix && !primaryMedia?.sensitiveContent?.isSensitive) {
        const activeFilter = PHOTO_FILTER_LIST.find((f) => f.id === post.filterPreset);
        if (activeFilter && activeFilter.matrix) {
          return (
            <ColorMatrix matrix={activeFilter.matrix}>
              {rawImage}
            </ColorMatrix>
          );
        }
      }

      return rawImage;
    }

    const carouselSlides = post.media.map((asset, index) => ({
      asset,
      sourceIndex: index,
      key: `media-${asset.id || index}`,
    }));

    return (
      <View style={styles.carouselWrap}>
        <ScrollView
          ref={(node) => {
            carouselScrollRefs.current[post.id] = node;
          }}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          scrollEventThrottle={16}
          decelerationRate="fast"
          onMomentumScrollEnd={(event) => {
            const nextIndex = Math.max(
              0,
              Math.min(
                post.media.length - 1,
                Math.round(Number(event?.nativeEvent?.contentOffset?.x || 0) / Math.max(1, postMediaWidth)),
              ),
            );
            setCarouselIndexByPostId((prev) => ({ ...prev, [post.id]: nextIndex }));
          }}
          onScrollEndDrag={(event) => {
            const nextIndex = Math.max(
              0,
              Math.min(
                post.media.length - 1,
                Math.round(Number(event?.nativeEvent?.contentOffset?.x || 0) / Math.max(1, postMediaWidth)),
              ),
            );
            setCarouselIndexByPostId((prev) => ({ ...prev, [post.id]: nextIndex }));
          }}
        >
          {carouselSlides.map(({ asset, sourceIndex, key }) => {
            const directDistance = Math.abs(sourceIndex - currentCarouselIndex);
            const circularDistance = Math.min(directDistance, post.media.length - directDistance);
            const shouldRenderCarouselAsset = circularDistance <= 1;
            if (!shouldRenderCarouselAsset) {
              return (
                <View
                  key={`${post.id}-${key}`}
                  style={[styles.postImage, styles.mediaFallback, { width: postMediaWidth, height: mediaHeight }]} />
              );
            }

            return asset.mediaType === "video" ? (
              <View key={`${post.id}-${key}`} style={[styles.postImage, { width: postMediaWidth, height: mediaHeight, overflow: "hidden" }]}>

                <View style={[StyleSheet.absoluteFillObject, getMediaFrameTransformStyle(asset, postMediaWidth, mediaHeight)]}>
                  <SocialVideo
                    uri={normalizeMediaUrl(asset.url)}
                    posterUri={normalizeMediaUrl(asset.thumbnailUrl || "")}
                    style={StyleSheet.absoluteFill}
                    paused={!shouldMountVideo(currentCarouselIndex === sourceIndex)}
                    preload={shouldPreloadVideo && currentCarouselIndex === sourceIndex && shouldMountVideo(currentCarouselIndex === sourceIndex)}
                    muted={shouldMuteFeedVideo({
                      isPostActive: shouldMountVideo(currentCarouselIndex === sourceIndex),
                      isCarouselItemActive: currentCarouselIndex === sourceIndex,
                      isVideoSoundEnabled,
                      isPostMuted: isMuted,
                    })}
                    repeat
                    restartKey={`${post.id}:${asset.id}`}
                    onLoad={(event) => handleFeedVideoLoaded(post.id, asset.id, event)}
                    resizeMode={getImageResizeMode(asset, frameAspectRatio)}
                    contentBlurRadius={asset.sensitiveContent?.isSensitive ? 22 : 0}
                    showBufferingLoader={false}
                  />
                </View>
                {asset.sensitiveContent?.isSensitive ? renderSensitiveBadge(asset.sensitiveContent.label) : null}
              </View>
            ) : (
              (() => {
                const imageResizeMode = getImageResizeMode(asset, frameAspectRatio);
                const rawImage = (
                  <View key={`${post.id}-${key}`} style={[styles.postImage, { width: postMediaWidth, height: mediaHeight, overflow: "hidden" }]}>

                    <View style={[StyleSheet.absoluteFillObject, getMediaFrameTransformStyle(asset, postMediaWidth, mediaHeight)]}>
                      <ProgressiveImage
                        uri={normalizeMediaUrl(asset.url)}
                        previewUri={normalizeMediaUrl(asset.thumbnailUrl || asset.url)}
                        style={StyleSheet.absoluteFill}
                        resizeMode={imageResizeMode}
                        contentBlurRadius={asset.sensitiveContent?.isSensitive ? 22 : 0}
                      />
                    </View>
                    {asset.sensitiveContent?.isSensitive ? renderSensitiveBadge(asset.sensitiveContent.label) : null}
                  </View>
                );

                if (post.filterPreset && ColorMatrix && !asset.sensitiveContent?.isSensitive) {
                  const activeFilter = PHOTO_FILTER_LIST.find((f) => f.id === post.filterPreset);
                  if (activeFilter && activeFilter.matrix) {
                    return (
                      <View key={`${post.id}-${key}`}>
                        <ColorMatrix matrix={activeFilter.matrix}>
                          {rawImage}
                        </ColorMatrix>
                      </View>
                    );
                  }
                }

                return rawImage;
              })()
            );
          })}
        </ScrollView>
        {post.media.length > 1 ? (
          <View style={styles.carouselBadge}>
            <Text style={styles.carouselBadgeText}>
              {currentCarouselIndex + 1}/{post.media.length}
            </Text>
          </View>
        ) : null}
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
        style={[styles.storyItem, { width: storyItemWidth }]}>
        <View
          style={[
            styles.storyRing,
            styles.liveStoryRing,
            { width: storyRingSize, height: storyRingSize, borderRadius: storyRingSize / 2 },
          ]}
        >
          <Image
            source={{ uri: liveAvatar }}
            style={[styles.storyAvatar, { width: storyAvatarSize, height: storyAvatarSize, borderRadius: storyAvatarSize / 2 }]}>
          </Image>
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
                  sticker.style?.fontStyle ? { fontStyle: sticker.style.fontStyle } : null,
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

  const handleFeedViewableChange = useCallback((
    payload?: { viewableItems?: Array<{ index?: number | null; item?: Post }> },
  ) => {
    try {
      const viewableItems = Array.isArray(payload?.viewableItems) ? payload.viewableItems : [];
      if (!viewableItems.length) {
        return;
      }

      const highestVisibleIndex = viewableItems.reduce((maxIndex, entry) => {
        const index = typeof entry?.index === "number" ? entry.index : -1;
        return Math.max(maxIndex, index);
      }, -1);

      const firstVisible = viewableItems[0];
      const visiblePostId = firstVisible?.item?.id ? String(firstVisible.item.id) : "";
      if (visiblePostId) {
        lastViewablePostIdRef.current = visiblePostId;
      }

      const totalPosts = Array.isArray(feed?.posts) ? feed.posts.length : 0;
      if (!shouldTriggerFeedPrefetch({
        highestVisibleIndex,
        totalPosts,
        triggerIndex: FEED_PREFETCH_TRIGGER_INDEX,
        bufferSize: FEED_PREFETCH_BUFFER_ITEMS,
        pageSize: FEED_PAGE_SIZE,
      })) {
        return;
      }

      loadMoreFeed();
    } catch (error) {
      console.log("feed viewability crash guard:", error);
    }
  }, [feed?.posts?.length, loadMoreFeed]);

  const renderPost = useCallback(({ item, index }: { item: any; index: number }) => {
    if (!item) {
      return null;
    }

    if (item.__featuredProfiles) {
      return (
        <View style={{ marginHorizontal: feedHorizontalInset, marginBottom: 12 }}>
          <FeaturedProfilesCarousel
            navigation={navigation}
            title="Featured profiles to follow"
            compact
            limit={12}
          />
        </View>
      );
    }

    const media = Array.isArray(item.media) ? item.media : [];
    const user = item.user || {};
    const safeSettings = item.settings || {};
    const hasVideoMedia = media.some((asset: any) => asset?.mediaType === "video");
    const isMuted = !!mutedPostIds[item.id];
    void isMuted;
    const likePreviewUsers = Array.isArray(item.likePreviewUsers) && item.likePreviewUsers.length
      ? item.likePreviewUsers.slice(0, 3)
      : [];
    const latestLiker =
      likePreviewUsers.find((likeUser: any) => String(likeUser?.id || "") !== String(currentUser?.id || ""))
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
    const tokens: string[] = [getPostTypeTag(item)];

    if (item.location) {
      tokens.push(`📍 ${item.location}`);
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
          <TouchableOpacity style={styles.postHeaderIdentity} onPress={() => openUserProfile(String(user.id || ""))}>
            <AppAvatar
              uri={user.avatarUrl || DEFAULT_AVATAR_URL}
              name={user.name || user.username || "User"}
              size={width < 360 ? 38 : 42}
              style={[styles.postAvatar, width < 360 && styles.postAvatarCompact]}
            />
            <View style={styles.userMeta}>
              <View style={[styles.row, styles.usernameRow]}>
                <Text
                  style={[styles.username, styles.usernameText, { color: colors.text, fontSize: usernameFontSize }]}
                >
                  {user.username || "User"}
                </Text>
                {shouldShowVerifiedBadge(user) ? (
                  <Icon style={styles.verifiedIcon} name="checkmark-circle" color={FEED_ACCENT} size={16} />
                ) : null}
              </View>
              {item.location ? (
                <TouchableOpacity onPress={() => openHashtagResults(item.location!)} activeOpacity={0.75}>
                  <Text style={[styles.postLocationText, { color: colors.mutedText }]}>
                    {item.location}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </TouchableOpacity>
          <View style={styles.postHeaderActions}>
            {renderFeedRelationshipButton(user)}
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

        <TouchableOpacity
          activeOpacity={String(user.id || "") === String(currentUser?.id || "") ? 0.95 : 1}
          disabled={String(user.id || "") !== String(currentUser?.id || "")}
          onPress={() => openPostDetail(item)}
        >
          {renderPostMedia(item, index)}
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
              onPress={() => handlePostAudioToggle(item)}
            >
              <Icon
                name={isFeedVideoSoundOn({
                  isVideoSoundEnabled,
                  isPostMuted: isMuted,
                }) ? "volume-high-outline" : "volume-mute-outline"}
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

        {!safeSettings.hideLikeCount ? (
          <View style={[styles.likeSummaryRow, { paddingHorizontal: postBodyInset }]}>
            {likePreviewUsers.length ? (
              <View style={styles.likePreviewStack}>
                {likePreviewUsers.map((likeUser: any, index: number) => (
                  <TouchableOpacity
                    key={`${item.id}_like_preview_${likeUser.id || index}`}
                    style={[
                      styles.likeSummaryAvatarButton,
                      styles.likeSummaryAvatarStackButton,
                      index > 0 ? styles.likeSummaryAvatarStackOverlap : null,
                    ]}
                    onPress={() => openUserProfile(String(likeUser?.id || item.user?.id || ""))}
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
            <Text style={[styles.likesText, { color: colors.text, fontSize: supportingFontSize + 1 }]}>
              {likeSummaryLabel}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.metaLineText, { paddingHorizontal: postBodyInset, color: colors.mutedText, fontSize: supportingFontSize }]}>
          {metaLine}
        </Text>

        <InteractiveText
          style={[
            styles.caption,
            { paddingHorizontal: postBodyInset, color: colors.text, fontSize: captionFontSize, lineHeight: captionLineHeight },
          ]}
          prefix={(
            <Text style={[styles.captionUser, { color: colors.text }]} onPress={() => openUserProfile(String(user.id || ""))}>
              {user.username || "User"}{" "}
            </Text>
          )}
          mentionStyle={[styles.inlineEntity, { color: feedAccent }]}
          hashtagStyle={[styles.inlineEntity, { color: feedAccent }]}
          text={item.caption || ""}
          onPressMention={openMentionProfile}
          onPressHashtag={openHashtagResults}
        />
      </View>
    );
  }, [
    activePostId,
    activeSheet,
    captionFontSize,
    captionLineHeight,
    colors,
    currentUser?.id,
    feedAccent,
    feedAccentBorder,
    feedAccentSoft,
    feedHorizontalInset,
    feedListItems,
    getPostTypeTag,
    handleDownload,
    handleLike,
    handlePostAudioToggle,
    openPostCommentsSheet,
    openPostShareSheet,
    handleSave,
    isActionBusy,
    isFeedVideoSoundOn,
    isScreenFocused,
    isVideoSoundEnabled,
    mutedPostIds,
    navigation,
    openHashtagResults,
    openLocationSearch,
    openMentionProfile,
    openPostDetail,
    openUserProfile,
    openContentActions,
    postActionButtonSize,
    postBodyInset,
    postCardRadius,
    postHeaderPadding,
    renderFeedRelationshipButton,
    renderPostMedia,
    renderPostStickerOverlay,
    shouldShowVerifiedBadge,
    supportingFontSize,
    usernameFontSize,
    width,
  ]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <FlatList
        ref={feedListRef}
        data={feedListItems}
        keyExtractor={(item: any, index: number) => String(item?.id ?? item?._id ?? `feed-item-${index}`)}
        renderItem={renderPost}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={Platform.OS === "android"}
        initialNumToRender={FEED_FLATLIST_INITIAL_NUM_TO_RENDER}
        maxToRenderPerBatch={FEED_FLATLIST_MAX_TO_RENDER_PER_BATCH}
        updateCellsBatchingPeriod={50}
        windowSize={FEED_FLATLIST_WINDOW_SIZE}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        onScroll={({ nativeEvent }) => {
          const offsetY = Number(nativeEvent?.contentOffset?.y ?? 0);
          if (offsetY > 0 && typeof nativeEvent?.contentSize?.height === "number") {
            lastViewablePostIdRef.current = feedListItems[0]?.id || lastViewablePostIdRef.current;
          }
        }}
        onEndReached={loadMoreFeed}
        onEndReachedThreshold={0.45}
        onViewableItemsChanged={handleFeedViewableChange}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60, minimumViewTime: 200 }}
        ListHeaderComponent={
          <View style={styles.feedHeaderSpacer} />
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
};

const styles: any = {
  safeArea: { flex: 1 },
  listContent: { paddingBottom: 30 },
  feedHeaderSpacer: { height: 8 },
  footerLoader: { paddingVertical: 18, alignItems: "center" },
  postCard: { marginBottom: 14 },
  postHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  postHeaderIdentity: { flexDirection: "row", alignItems: "center", flex: 1 },
  userMeta: { marginLeft: 10, flex: 1 },
  row: { flexDirection: "row", alignItems: "center" },
  usernameRow: { marginBottom: 2 },
  username: { fontWeight: "700" },
  usernameText: { flexShrink: 1 },
  verifiedIcon: { marginLeft: 4 },
  postLocationText: { fontSize: 12 },
  postHeaderActions: { flexDirection: "row", alignItems: "center" },
  moreButton: { justifyContent: "center", alignItems: "center" },
  actionButton: { justifyContent: "center", alignItems: "center" },
  trailingActions: { flexDirection: "row", alignItems: "center", marginLeft: "auto" },
  trailingActionButton: { marginLeft: 8 },
  likesText: { fontWeight: "700", marginTop: 8, marginBottom: 6 },
  metaLineText: { marginBottom: 6 },
  caption: { marginBottom: 8 },
  captionUser: { fontWeight: "700" },
  inlineEntity: { fontWeight: "700" },
  postAvatar: { borderRadius: 999 },
  postAvatarCompact: { marginRight: 2 },
  followBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  followBadgePrimary: {},
  followBadgeSecondary: {},
  followBadgeText: { fontSize: 11, fontWeight: "700" },
  likeSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    marginBottom: 2,
    gap: 8,
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
  storyItem: { alignItems: "center", justifyContent: "center" },
  storyRing: { alignItems: "center", justifyContent: "center" },
  storyRingSeen: { borderWidth: 1, borderColor: "transparent" },
  storyRingCloseFriendsSeen: {},
  storyRingGradient: { alignItems: "center", justifyContent: "center" },
  storyRingInner: { alignItems: "center", justifyContent: "center" },
  storyAvatar: { resizeMode: "cover" },
  storyName: { marginTop: 6, fontSize: 11, textAlign: "center" },
  postImage: { overflow: "hidden" },
  mediaFallback: { backgroundColor: "#ececec" },
  carouselWrap: { position: "relative" },
  carouselBadge: {
    position: "absolute",
    right: 12,
    top: 12,
    backgroundColor: "rgba(15,23,42,0.72)",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    minWidth: 42,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  carouselIndicatorRow: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
  },
  carouselIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.48)",
    marginHorizontal: 3,
  },
  carouselIndicatorDotActive: {
    width: 18,
    borderRadius: 6,
    backgroundColor: "#fff",
  },
  postStickerLayer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  postEmojiSticker: { position: "absolute" },
  postEmojiStickerText: { fontWeight: "700" },
  postTextSticker: { position: "absolute" },
  postTextStickerText: { fontWeight: "700" },
  actionsRow: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  metaChipRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  metaChip: { flexDirection: "row", alignItems: "center", borderRadius: 999, paddingVertical: 4, paddingHorizontal: 8, marginRight: 6, marginBottom: 6 },
  metaChipText: { fontSize: 12, marginLeft: 4 },
  sensitiveBadge: { position: "absolute", left: 12, top: 12, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 999 },
  sensitiveBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
};

export default FeedScreen;

