import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Alert } from "../../utils/appAlert";
import Icon from "react-native-vector-icons/Ionicons";

import { socialApi } from "../../features/social/socialApi";
import { Post } from "../../features/social/types";
import { toUserSafeMessage } from "../../features/social/validation";
import { useAppTheme } from "../../theme/AppThemeContext";
import { openPostInFeed } from "../../utils/socialNavigation";

const getSavedPostTypeLabel = (post: Post) => {
  if (post.type === "carousel") {
    return "Carousel Post";
  }

  return post.type === "video" ? "Video Post" : "Photo Post";
};

function SavedPostsScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadSavedPosts = useCallback(async () => {
    const data = await socialApi.getSavedPosts();
    setPosts(data);
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const data = await socialApi.getSavedPosts();
        if (active) {
          setPosts(data);
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
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadSavedPosts();
    } finally {
      setRefreshing(false);
    }
  };

  const removeSavedPost = async (postId: string) => {
    try {
      await socialApi.togglePostSave(postId);
      setPosts((prev) => prev.filter((item) => item.id !== postId));
    } catch (error) {
      Alert.alert("Could not update saved post", toUserSafeMessage(error));
    }
  };

  const renderPostItem = ({ item }: { item: Post }) => {
    const primaryMedia = item.media[0];
    const mediaUri = primaryMedia?.thumbnailUrl || primaryMedia?.url;

    return (
      <TouchableOpacity
        style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}
        onPress={() => openPostInFeed(navigation, { postId: item.id })}
        activeOpacity={0.86}
      >
        {mediaUri ? <Image source={{ uri: mediaUri }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbPlaceholder]} />}

        <View style={styles.cardBody}>
          <Text style={[styles.type, { color: colors.primary }]}>{getSavedPostTypeLabel(item)}</Text>
          <Text style={[styles.meta, { color: colors.mutedText }]}>Saved {new Date(item.createdAt).toLocaleDateString()}</Text>
          <Text style={[styles.statsLine, { color: colors.mutedText }]}>
            {item.likesCount} likes • {item.commentsCount} comments • {item.sharesCount} shares
          </Text>
          <Text numberOfLines={2} style={[styles.captionPreview, { color: colors.text }]}>
            {item.caption || "Untitled post"}
          </Text>
        </View>

        <TouchableOpacity style={styles.actionIcon} onPress={() => removeSavedPost(item.id)}>
          <Icon name="bookmark" size={21} color={colors.primary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Saved Posts</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderPostItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <Text style={[styles.helperText, { color: colors.mutedText }]}>
            Your saved posts stay private to you. Tap any card to open it, or tap the bookmark to remove it from this list.
          </Text>
        }
        ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.mutedText }]}>No saved posts yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    paddingTop: 44,
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 18, fontWeight: "700" },
  headerSpacer: { width: 20 },
  listContent: { padding: 12, paddingBottom: 28, flexGrow: 1 },
  helperText: { fontSize: 12.5, lineHeight: 18, marginBottom: 12 },
  emptyText: { textAlign: "center", marginTop: 48, fontSize: 14 },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    flexDirection: "row",
    marginBottom: 10,
    alignItems: "center",
  },
  thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: "#e5e7eb" },
  thumbPlaceholder: { backgroundColor: "#1e293b" },
  cardBody: { flex: 1, marginLeft: 10 },
  type: { fontSize: 12, fontWeight: "700" },
  meta: { fontSize: 11.5, marginTop: 2 },
  statsLine: { fontSize: 11.5, marginTop: 6, fontWeight: "600" },
  captionPreview: { marginTop: 8, fontSize: 13 },
  actionIcon: { marginLeft: 10, paddingVertical: 6 },
});

export default SavedPostsScreen;
