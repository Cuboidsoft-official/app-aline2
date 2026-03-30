import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import Icon from "react-native-vector-icons/Ionicons";

import ContentActionSheet from "../features/social/components/ContentActionSheet";
import PostCommentsSheet from "../features/social/components/PostCommentsSheet";
import PostShareSheet from "../features/social/components/PostShareSheet";
import SocialVideo from "../features/social/components/SocialVideo";
import { socialApi } from "../features/social/socialApi";
import { FeedResponse, Post, Story } from "../features/social/types";
import { toUserSafeMessage } from "../features/social/validation";
import { getStoredUser } from "../utils/authSession";

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
  const [feed, setFeed] = useState<FeedResponse>(initialFeed);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isActionBusy, setIsActionBusy] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [activeSheet, setActiveSheet] = useState<null | "comments" | "share" | "actions">(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; avatarUrl: string } | null>(null);

  const loadFeed = useCallback(async () => {
    const [data, storedUser] = await Promise.all([socialApi.getFeed(), getStoredUser()]);
    setFeed(data);
    setCurrentUser(
      storedUser
        ? {
            id: String(storedUser._id || storedUser.id || ""),
            avatarUrl: storedUser.profilePic || storedUser.avatarUrl || "",
          }
        : null,
    );
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
                  }
                : null,
            );
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

  const openPostDetail = (postId: string) => {
    navigation.navigate("PostDetail", { postId });
  };

  const closeSheet = () => {
    setActiveSheet(null);
    setSelectedPost(null);
  };

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

    return (
      <TouchableOpacity
        style={styles.storyItem}
        onPress={() => navigation.navigate("StoryViewer", { storyId: item.id })}
      >
        <View style={[styles.storyRing, ringStyle, closeFriends && styles.storyRingCloseFriends]}>
          <Image source={{ uri: item.user.avatarUrl }} style={styles.storyAvatar} />
        </View>
        <Text style={styles.storyName} numberOfLines={1}>
          {item.user.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderPostMedia = (post: Post) => {
    if (post.type !== "carousel") {
      const primaryMedia = post.media[0];
      if (primaryMedia?.mediaType === "video") {
        return (
          <SocialVideo
            uri={primaryMedia.url}
            posterUri={primaryMedia.thumbnailUrl}
            style={[styles.postImage, { width }]}
            muted
            repeat
          />
        );
      }

      return (
        <Image
          source={{ uri: primaryMedia?.url }}
          style={[styles.postImage, { width }]}
        />
      );
    }

    return (
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.carouselWrap}>
        {post.media.map((asset) => (
          asset.mediaType === "video" ? (
            <SocialVideo
              key={asset.id}
              uri={asset.url}
              posterUri={asset.thumbnailUrl}
              style={[styles.postImage, { width }]}
              muted
              repeat
            />
          ) : (
            <Image
              key={asset.id}
              source={{ uri: asset.url }}
              style={[styles.postImage, { width }]}
            />
          )
        ))}
      </ScrollView>
    );
  };

  const renderPost = ({ item }: { item: Post }) => {
    const tokens: string[] = [getPostTypeTag(item)];

    if (item.location) {
      tokens.push(`📍 ${item.location}`);
    }

    if (item.music) {
      tokens.push(`🎵 ${item.music}`);
    }

    const metaLine = tokens.join(" • ");

    return (
      <View style={styles.postCard}>
        <View style={styles.postHeader}>
          <Image source={{ uri: item.user.avatarUrl }} style={styles.postAvatar} />
          <View style={styles.userMeta}>
            <View style={styles.row}>
              <Text style={styles.username}>{item.user.username}</Text>
              {item.user.isVerified ? (
                <Icon style={styles.verifiedIcon} name="checkmark-circle" color="#4ba8ff" size={14} />
              ) : null}
            </View>
            <Text style={styles.postTime}>{formatAgo(item.createdAt)}</Text>
          </View>
          <TouchableOpacity style={styles.moreButton} onPress={() => openContentActions(item)}>
            <Icon name="ellipsis-horizontal" size={20} color="#141414" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity activeOpacity={0.95} onPress={() => openPostDetail(item.id)}>
          {renderPostMedia(item)}
        </TouchableOpacity>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.iconButton} onPress={() => handleLike(item.id)}>
            <Icon name={item.liked ? "heart" : "heart-outline"} size={24} color={item.liked ? "#f3425f" : "#111"} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconButton} onPress={() => openPostCommentsSheet(item)}>
            <Icon name="chatbubble-outline" size={22} color="#111" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconButton} onPress={() => openPostShareSheet(item)}>
            <Icon name="paper-plane-outline" size={22} color="#111" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.bookmarkButton} onPress={() => handleSave(item.id)}>
            <Icon name={item.saved ? "bookmark" : "bookmark-outline"} size={22} color="#111" />
          </TouchableOpacity>
        </View>

        {!item.settings.hideLikeCount ? (
          <Text style={styles.likesText}>{formatCount(item.likesCount)} likes</Text>
        ) : null}

        <Text style={styles.caption}>
          <Text style={styles.captionUser}>{item.user.username} </Text>
          {item.caption}
        </Text>

        {item.hashtags.length ? (
          <Text style={styles.tagLine}>{item.hashtags.map((tag) => `#${tag}`).join(" ")}</Text>
        ) : null}

        {item.mentions.length ? (
          <Text style={styles.tagLineMuted}>{item.mentions.map((mention) => `@${mention}`).join(" ")}</Text>
        ) : null}

        <Text style={styles.metaLine}>{metaLine}</Text>

        {item.collaboratorIds.length ? (
          <Text style={styles.collabLine}>Collab post • {item.collaboratorIds.length} collaborators</Text>
        ) : null}

        <TouchableOpacity onPress={() => openPostCommentsSheet(item)}>
          <Text style={styles.commentCount}>View all {item.commentsCount} comments</Text>
        </TouchableOpacity>

        {!item.settings.disableComments ? (
          <View style={styles.commentComposer}>
            <TextInput
              value={commentDrafts[item.id] || ""}
              onChangeText={(text) => setCommentDrafts((prev) => ({ ...prev, [item.id]: text }))}
              style={styles.commentInput}
              placeholder="Add a comment..."
              placeholderTextColor="#777"
            />
            <TouchableOpacity onPress={() => handleCommentSubmit(item.id)}>
              <Text style={styles.postButton}>Post</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.commentsDisabled}>Comments limited for this post</Text>
        )}
      </View>
    );
  };

  const renderHeader = () => {
    const ownStory = feed.stories.find((item) => item.isOwner || (currentUser?.id && item.user.id === currentUser.id));
    const ownStoryOwnerId = ownStory?.user.id || currentUser?.id || "";
    const ownStoryAvatar = ownStory?.user.avatarUrl || currentUser?.avatarUrl || "https://cdn-icons-png.flaticon.com/512/149/149071.png";

    return (
      <>
      <View style={styles.topBar}>
        <View style={styles.topLeft}>
          <Image source={{ uri: "https://aline2.com/asstes/images/logo/logo.jpeg" }} style={styles.logo} />
          <Text style={styles.brand}>Aline2</Text>
        </View>

        <View style={styles.topRight}>
          <TouchableOpacity onPress={() => navigation.navigate("Search")}>
            <Icon name="search-outline" size={23} color="#111" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerIconGap}
            onPress={() => navigation.navigate("NotificationScreen")}
          >
            <Icon name="notifications-outline" size={23} color="#111" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.headerIconGap} onPress={() => navigation.navigate("Swipes")}>
            <Icon name="play-circle-outline" size={23} color="#111" />
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
            <View style={styles.storyAddBadge}>
              <Icon name="add" size={13} color="#fff" />
            </View>
          </View>
        <Text style={styles.storyName} numberOfLines={1}>
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
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#7b3fe4" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={feed.posts}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
        ListHeaderComponent={renderHeader}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />

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
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
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
  logo: { width: 34, height: 34, borderRadius: 17, marginRight: 8 },
  brand: { fontSize: 28, color: "#7b3fe4", fontWeight: "800" },
  topRight: { flexDirection: "row", alignItems: "center" },
  headerIconGap: { marginLeft: 14 },
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
  postAvatar: { width: 36, height: 36, borderRadius: 18 },
  userMeta: { marginLeft: 9 },
  row: { flexDirection: "row", alignItems: "center" },
  username: { fontSize: 14, fontWeight: "700", color: "#111" },
  verifiedIcon: { marginLeft: 4 },
  postTime: { fontSize: 12, color: "#666", marginTop: 1 },
  moreButton: { marginLeft: "auto", padding: 2 },
  carouselWrap: { width: "100%" },
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
