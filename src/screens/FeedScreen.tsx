import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";

import ContentActionSheet from "../features/social/components/ContentActionSheet";
import PostCommentsSheet from "../features/social/components/PostCommentsSheet";
import PostShareSheet from "../features/social/components/PostShareSheet";
import SocialVideo from "../features/social/components/SocialVideo";
import { socialApi } from "../features/social/socialApi";
import { FeedResponse, Post, Story } from "../features/social/types";
import { toUserSafeMessage } from "../features/social/validation";
import { getStoredUser } from "../utils/authSession";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { normalizeMediaUrl } from "../utils/mediaUrls";
import { useAppTheme } from "../theme/AppThemeContext";
import { PHOTO_FILTER_LIST } from "../utils/photoFilters";
import { shouldShowVerifiedBadge } from "../utils/verificationBadges";

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

function FeedScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const { colors } = useAppTheme();
  const [feed, setFeed] = useState<FeedResponse>(initialFeed);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isActionBusy, setIsActionBusy] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [activeSheet, setActiveSheet] = useState<null | "comments" | "share" | "actions">(null);
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    avatarUrl: string;
    username: string;
    name: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isVideoSoundEnabled, setIsVideoSoundEnabled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const sidebarWidth = Math.min(width * 0.82, 330);

  const sidebarTranslateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-sidebarWidth - 24, 0],
  });

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
          { icon: "storefront-outline", label: "Become a Seller", screen: "SellerRegistration" },
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
    [],
  );

  const loadFeed = useCallback(async () => {
    const [data, storedUser] = await Promise.all([socialApi.getFeed(), getStoredUser()]);
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
    setErrorMessage("");
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const run = async () => {
        try {
          setLoading(true);
          const [data, storedUser] = await Promise.all([socialApi.getFeed(), getStoredUser()]);
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
    }, []),
  );

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

  const handleCommentSubmit = async (postId: string) => {
    const draft = (commentDrafts[postId] || "").trim();
    if (!draft || isActionBusy[`comment_${postId}`]) {
      return;
    }

    setIsActionBusy((prev) => ({ ...prev, [`comment_${postId}`]: true }));

    try {
      await socialApi.addPostComment(postId, draft);
      const latestPost = feed.posts.find((item) => item.id === postId);

      if (latestPost) {
        updatePost({
          ...latestPost,
          commentsCount: latestPost.commentsCount + 1,
        });
      }

      setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
    } catch (error) {
      Alert.alert("Could not comment", toUserSafeMessage(error));
    } finally {
      setIsActionBusy((prev) => ({ ...prev, [`comment_${postId}`]: false }));
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

  const navigateFromMenu = useCallback((screen: string) => {
    closeMenu();
    navigation.navigate(screen);
  }, [closeMenu, navigation]);

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
        style={styles.storyItem}
        onPress={() => navigation.navigate("StoryViewer", { storyId: item.id })}
      >
        <View style={[styles.storyRing, ringStyle, closeFriends && styles.storyRingCloseFriends]}>
          <Image source={{ uri: storyAvatar }} style={styles.storyAvatar} />
        </View>
        <Text style={[styles.storyName, { color: colors.text }]} numberOfLines={1}>
          {item.user.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderPostMedia = (post: Post) => {
    if (post.type !== "carousel") {
      const primaryMedia = post.media[0];
      if (!primaryMedia?.url) {
        return <View style={[styles.postImage, styles.mediaFallback, { width }]} />;
      }

      if (primaryMedia?.mediaType === "video") {
        return (
          <SocialVideo
            uri={normalizeMediaUrl(primaryMedia.url)}
            posterUri={normalizeMediaUrl(primaryMedia.thumbnailUrl || primaryMedia.url)}
            style={[styles.postImage, { width }]}
            muted={!isVideoSoundEnabled}
            repeat
          />
        );
      }

      const rawImage = (
        <Image
          source={{ uri: normalizeMediaUrl(primaryMedia?.url) }}
          style={[styles.postImage, { width }]}
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
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.carouselWrap}>
        {post.media.map((asset) => (
          asset.mediaType === "video" ? (
            <SocialVideo
              key={asset.id}
              uri={normalizeMediaUrl(asset.url)}
              posterUri={normalizeMediaUrl(asset.thumbnailUrl || asset.url)}
              style={[styles.postImage, { width }]}
              muted={!isVideoSoundEnabled}
              repeat
            />
          ) : (
            (() => {
              const rawImage = (
                <Image
                  key={asset.id}
                  source={{ uri: normalizeMediaUrl(asset.url) }}
                  style={[styles.postImage, { width }]}
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
    );
  };

  const renderPost = ({ item }: { item: Post }) => {
    const hasVideoMedia = item.media.some((asset) => asset.mediaType === "video");
    const tokens: string[] = [getPostTypeTag(item)];

    if (item.location) {
      tokens.push(`📍 ${item.location}`);
    }

    if (item.music) {
      tokens.push(`🎵 ${item.music}`);
    }

    const metaLine = tokens.join(" • ");

    return (
      <View style={[styles.postCard, { backgroundColor: colors.background }]}>
        <View style={styles.postHeader}>
          <TouchableOpacity style={styles.postHeaderIdentity} onPress={() => openUserProfile(item.user.id)}>
            <Image source={{ uri: item.user.avatarUrl || DEFAULT_AVATAR_URL }} style={styles.postAvatar} />
            <View style={styles.userMeta}>
              <View style={styles.row}>
                <Text style={[styles.username, { color: colors.text }]}>{item.user.username}</Text>
                {shouldShowVerifiedBadge(item.user) ? (
                  <Icon style={styles.verifiedIcon} name="checkmark-circle" color="#4ba8ff" size={14} />
                ) : null}
              </View>
              <Text style={[styles.postTime, { color: colors.mutedText }]}>{formatAgo(item.createdAt)}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.moreButton} onPress={() => openContentActions(item)}>
            <Icon name="ellipsis-horizontal" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          activeOpacity={String(item.user.id) === String(currentUser?.id || "") ? 0.95 : 1}
          disabled={String(item.user.id) !== String(currentUser?.id || "")}
          onPress={() => openPostDetail(item)}
        >
          {renderPostMedia(item)}
        </TouchableOpacity>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.iconButton} onPress={() => handleLike(item.id)}>
            <Icon name={item.liked ? "heart" : "heart-outline"} size={24} color={item.liked ? "#f3425f" : colors.text} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconButton} onPress={() => openPostCommentsSheet(item)}>
            <Icon name="chatbubble-outline" size={22} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconButton} onPress={() => openPostShareSheet(item)}>
            <Icon name="paper-plane-outline" size={22} color={colors.text} />
          </TouchableOpacity>

          {hasVideoMedia ? (
            <TouchableOpacity style={styles.iconButton} onPress={() => setIsVideoSoundEnabled((current) => !current)}>
              <Icon
                name={isVideoSoundEnabled ? "volume-high-outline" : "volume-mute-outline"}
                size={22}
                color={colors.text}
              />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={styles.bookmarkButton} onPress={() => handleSave(item.id)}>
            <Icon name={item.saved ? "bookmark" : "bookmark-outline"} size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {!item.settings.hideLikeCount ? (
          <Text style={[styles.likesText, { color: colors.text }]}>{formatCount(item.likesCount)} likes</Text>
        ) : null}

        <Text style={[styles.caption, { color: colors.text }]}>
          <Text style={[styles.captionUser, { color: colors.text }]} onPress={() => openUserProfile(item.user.id)}>
            {item.user.username}{" "}
          </Text>
          {item.caption}
        </Text>

        {item.hashtags.length ? (
          <Text style={[styles.tagLine, { color: colors.primary }]}>{item.hashtags.map((tag) => `#${tag}`).join(" ")}</Text>
        ) : null}

        {item.mentions.length ? (
          <Text style={[styles.tagLineMuted, { color: colors.mutedText }]}>{item.mentions.map((mention) => `@${mention}`).join(" ")}</Text>
        ) : null}

        <Text style={[styles.metaLine, { color: colors.mutedText }]}>{metaLine}</Text>

        {item.collaboratorIds.length ? (
          <Text style={[styles.collabLine, { color: colors.text }]}>Collab post • {item.collaboratorIds.length} collaborators</Text>
        ) : null}

        <TouchableOpacity onPress={() => openPostCommentsSheet(item)}>
          <Text style={[styles.commentCount, { color: colors.mutedText }]}>View all {item.commentsCount} comments</Text>
        </TouchableOpacity>

        {!item.settings.disableComments ? (
          <View style={[styles.commentComposer, { borderColor: colors.border }]}>
            <TextInput
              value={commentDrafts[item.id] || ""}
              onChangeText={(text) => setCommentDrafts((prev) => ({ ...prev, [item.id]: text }))}
              style={[styles.commentInput, { color: colors.text }]}
              placeholder="Add a comment..."
              placeholderTextColor={colors.mutedText}
            />
            <TouchableOpacity onPress={() => handleCommentSubmit(item.id)}>
              <Text style={[styles.postButton, { color: colors.primary }]}>Post</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={[styles.commentsDisabled, { color: colors.mutedText }]}>Comments limited for this post</Text>
        )}
      </View>
    );
  };

  const renderHeader = () => {
    const ownStory = feed.stories.find((item) => item.isOwner || (currentUser?.id && item.user.id === currentUser.id));
    const ownStoryOwnerId = ownStory?.user.id || currentUser?.id || "";
    const ownStoryAvatar = ownStory?.user.avatarUrl || currentUser?.avatarUrl || DEFAULT_AVATAR_URL;

    return (
      <>
        <View style={[styles.topBar, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <View style={styles.topLeft}>
            <TouchableOpacity style={styles.logoTapTarget} onPress={toggleMenu} activeOpacity={0.85}>
              <Image source={{ uri: "https://aline2.com/asstes/images/logo/logo.jpeg" }} style={styles.logo} />
            </TouchableOpacity>
            <Text style={[styles.brand, { color: colors.primary }]}>Aline2</Text>
          </View>

          <View style={styles.topRight}>
            <TouchableOpacity onPress={() => navigation.navigate("Search")}>
              <Icon name="search-outline" size={23} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerIconGap}
              onPress={() => navigation.navigate("NotificationScreen")}
            >
              <Icon name="notifications-outline" size={23} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.headerIconGap} onPress={() => navigation.navigate("WalletScreen")}>
              <Icon name="megaphone-outline" size={23} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyListContent}>
          <TouchableOpacity
            style={styles.storyItem}
            onPress={() => {
              if (ownStory) {
                navigation.navigate("StoryViewer", { storyId: ownStory.id });
                return;
              }

              navigation.navigate("Create", { initialTab: "story" });
            }}
          >
            <View style={[styles.storyRing, styles.storyRingSeen]}>
              <Image
                source={{ uri: ownStoryAvatar }}
                style={styles.storyAvatar}
              />
              <View style={[styles.storyAddBadge, { borderColor: colors.background }]}>
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
      </>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.screenShell}>
        <FlatList
          data={feed.posts}
          keyExtractor={(item) => item.id}
          renderItem={renderPost}
          ListHeaderComponent={renderHeader}
          showsVerticalScrollIndicator={false}
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
            loadingMore ? <ActivityIndicator size="small" color={colors.primary} style={{ paddingVertical: 20 }} /> : null
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
          <View style={[styles.sidebarHeader, { backgroundColor: colors.primary }]}>
            <Image
              source={{ uri: currentUser?.avatarUrl || "https://aline2.com/asstes/images/logo/logo.jpeg" }}
              style={styles.sidebarAvatar}
            />
            <Text style={styles.sidebarTitle}>Aline2</Text>
            <Text style={styles.sidebarSubtitle}>
              {currentUser?.username || currentUser?.name || "Connect, share, and grow"}
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sidebarContent}>
            {menuSections.map((section) => (
              <View key={section.title} style={styles.sidebarSection}>
                <Text style={[styles.sidebarSectionTitle, { color: colors.mutedText }]}>{section.title}</Text>
                {section.data.map((item) => (
                  <TouchableOpacity
                    key={item.label}
                    style={[styles.sidebarMenuItem, { borderColor: colors.border }]}
                    onPress={() => navigateFromMenu(item.screen)}
                  >
                    <View style={[styles.sidebarMenuIconCircle, { backgroundColor: `${colors.primary}18` }]}>
                      <Icon name={item.icon} size={18} color={colors.primary} />
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
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyState: { paddingHorizontal: 24, paddingTop: 72, alignItems: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#111" },
  emptyText: { marginTop: 8, color: "#666", textAlign: "center", lineHeight: 20 },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 40,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  topLeft: { flexDirection: "row", alignItems: "center" },
  logoTapTarget: { marginRight: 8, borderRadius: 18 },
  logo: { width: 34, height: 34, borderRadius: 17, marginRight: 8 },
  brand: { fontSize: 28, color: "#7b3fe4", fontWeight: "800" },
  topRight: { flexDirection: "row", alignItems: "center" },
  headerIconGap: { marginLeft: 14 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.34)",
    zIndex: 19,
  },
  sidebar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 20,
    elevation: 20,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 6, height: 0 },
  },
  sidebarHeader: {
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 22,
    borderBottomRightRadius: 24,
  },
  sidebarAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  sidebarTitle: {
    marginTop: 12,
    fontSize: 20,
    fontWeight: "800",
    color: "#fff",
  },
  sidebarSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "rgba(255,255,255,0.88)",
  },
  sidebarContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 28,
  },
  sidebarSection: {
    marginBottom: 16,
  },
  sidebarSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginBottom: 8,
    marginLeft: 6,
    textTransform: "uppercase",
  },
  sidebarMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
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
  storyListContent: { paddingHorizontal: 10, paddingVertical: 14 },
  storyItem: { width: 84, alignItems: "center" },
  storyRing: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  storyRingUnseen: { borderColor: "#f15181" },
  storyRingSeen: { borderColor: "#c9c9c9" },
  storyRingCloseFriends: { borderColor: "#22c55e" },
  storyAvatar: { width: 66, height: 66, borderRadius: 33 },
  storyAddBadge: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  storyName: { marginTop: 6, fontSize: 12, color: "#272727" },
  postCard: { marginBottom: 18 },
  postHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 9 },
  postHeaderIdentity: { flexDirection: "row", alignItems: "center", flex: 1 },
  postAvatar: { width: 36, height: 36, borderRadius: 18 },
  userMeta: { marginLeft: 9 },
  row: { flexDirection: "row", alignItems: "center" },
  username: { fontSize: 14, fontWeight: "700", color: "#111" },
  verifiedIcon: { marginLeft: 4 },
  postTime: { fontSize: 12, color: "#666", marginTop: 1 },
  moreButton: { marginLeft: "auto", padding: 2 },
  carouselWrap: { width: "100%" },
  mediaFallback: { backgroundColor: "#f3f3f3" },
  postImage: { height: 350, backgroundColor: "#f3f3f3" },
  actionsRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 9 },
  iconButton: { marginRight: 12 },
  bookmarkButton: { marginLeft: "auto" },
  likesText: { fontWeight: "700", color: "#121212", fontSize: 13, paddingHorizontal: 12 },
  caption: { fontSize: 13.5, color: "#131313", paddingHorizontal: 12, paddingTop: 4 },
  captionUser: { fontWeight: "700" },
  tagLine: { color: "#3345d1", fontSize: 12.5, paddingHorizontal: 12, paddingTop: 4 },
  tagLineMuted: { color: "#5a5a5a", fontSize: 12, paddingHorizontal: 12, paddingTop: 2 },
  metaLine: { color: "#646464", fontSize: 12, paddingHorizontal: 12, paddingTop: 4 },
  collabLine: { color: "#2f2f2f", fontSize: 12, paddingHorizontal: 12, paddingTop: 4, fontWeight: "600" },
  commentCount: { color: "#787878", fontSize: 12.5, paddingHorizontal: 12, paddingTop: 6 },
  commentComposer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    paddingTop: 8,
  },
  commentInput: { flex: 1, fontSize: 13, color: "#222" },
  postButton: { color: "#3a4ce3", fontWeight: "700", paddingHorizontal: 8 },
  commentsDisabled: {
    color: "#707070",
    fontSize: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
});

export default FeedScreen;
