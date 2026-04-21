import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";

import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { useAppTheme } from "../theme/AppThemeContext";

type HashtagPost = {
  _id: string;
  caption?: string;
  image?: string;
  postType?: string;
  likes?: number;
  comments?: number;
  hashtags?: string[];
  media?: Array<{
    url?: string;
    thumbnailUrl?: string;
    type?: string;
  }>;
  user?: {
    _id?: string;
    username?: string;
    name?: string;
    profilePic?: string;
  };
};

const DEFAULT_AVATAR = DEFAULT_AVATAR_URL;

const getPreviewUrl = (post: HashtagPost) =>
  post.media?.[0]?.thumbnailUrl || post.media?.[0]?.url || post.image || DEFAULT_AVATAR;

function HashtagResultsScreen({ route, navigation }: any) {
  const { colors } = useAppTheme();
  const hashtag = String(route?.params?.hashtag || "").replace(/^#/, "").trim();
  const [posts, setPosts] = useState<HashtagPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadPosts = useCallback(async () => {
    if (!hashtag) {
      setPosts([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const res = await API.get(`/search/hashtag/${encodeURIComponent(hashtag)}`);

      setPosts(res.data?.posts || []);
      setErrorMessage("");
    } catch (error) {
      console.log("hashtag results error:", error);
      setPosts([]);
      setErrorMessage(getReadableApiErrorMessage(error, "Could not load hashtag posts right now."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hashtag]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const run = async () => {
        if (!active) {
          return;
        }

        setLoading(true);
        await loadPosts();
      };

      run();

      return () => {
        active = false;
      };
    }, [loadPosts])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPosts();
  };

  const renderPost = ({ item }: { item: HashtagPost }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate("PostDetail", { postId: item._id })}
    >
      <View style={styles.cardHeader}>
        <Image
          source={{ uri: item.user?.profilePic || DEFAULT_AVATAR }}
          style={styles.avatar}
        />
        <View style={styles.cardMeta}>
          <Text style={styles.username}>{item.user?.username || item.user?.name || "creator"}</Text>
          <Text style={styles.postMeta}>{item.postType === "reel" ? "Swipes" : "Post"}</Text>
        </View>
      </View>

      <Image source={{ uri: getPreviewUrl(item) }} style={styles.preview} />

      {!!item.caption && (
        <Text style={styles.caption} numberOfLines={3}>
          {item.caption}
        </Text>
      )}

      {!!item.hashtags?.length && (
        <Text style={styles.tagLine} numberOfLines={1}>
          {item.hashtags.map((tag) => `#${tag}`).join(" ")}
        </Text>
      )}

      <View style={styles.metricRow}>
        <Text style={styles.metricText}>{item.likes || 0} likes</Text>
        <Text style={styles.metricText}>{item.comments || 0} comments</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#7B4DFF" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>#{hashtag || "hashtag"}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item) => item._id}
        renderItem={renderPost}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {errorMessage ? "Hashtag unavailable" : "No posts found"}
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedText }]}>
              {errorMessage || `There are no posts tagged with #${hashtag} yet.`}
            </Text>
            {errorMessage ? (
              <TouchableOpacity style={styles.retryButton} onPress={loadPosts}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
      />
    </SafeAreaView>
  );
}

export default HashtagResultsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F8FC"
  },
  header: {
    paddingBottom: 16,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee"
  },
  headerSpacer: {
    width: 24
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111"
  },
  listContent: {
    padding: 14,
    paddingBottom: 36
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    marginBottom: 14
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 12
  },
  cardMeta: {
    flex: 1
  },
  username: {
    fontWeight: "700",
    color: "#111"
  },
  postMeta: {
    marginTop: 3,
    color: "#666"
  },
  preview: {
    width: "100%",
    height: 240,
    borderRadius: 16,
    backgroundColor: "#ececec"
  },
  caption: {
    marginTop: 12,
    color: "#222",
    lineHeight: 20
  },
  tagLine: {
    marginTop: 8,
    color: "#7B4DFF",
    fontWeight: "600"
  },
  metricRow: {
    flexDirection: "row",
    marginTop: 12
  },
  metricText: {
    color: "#666",
    marginRight: 16
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 90,
    paddingHorizontal: 28
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111"
  },
  emptyText: {
    marginTop: 8,
    color: "#666",
    textAlign: "center",
    lineHeight: 20
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: "#7B4DFF",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  retryText: {
    color: "#fff",
    fontWeight: "700"
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  }
});
