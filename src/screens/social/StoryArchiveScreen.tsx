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
import { Story } from "../../features/social/types";
import { toUserSafeMessage } from "../../features/social/validation";

function StoryArchiveScreen({ navigation }: any) {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadArchive = useCallback(async () => {
    const data = await socialApi.getStoryArchive();
    setStories(data);
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const data = await socialApi.getStoryArchive();
        if (active) {
          setStories(data);
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
      await loadArchive();
    } finally {
      setRefreshing(false);
    }
  };

  const deleteStory = (storyId: string) => {
    Alert.alert("Delete story", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await socialApi.deleteStory(storyId);
            setStories((prev) => prev.filter((item) => item.id !== storyId));
          } catch (error) {
            Alert.alert("Could not delete", toUserSafeMessage(error));
          }
        },
      },
    ]);
  };

  const restoreStory = (storyId: string) => {
    Alert.alert("Restore story", "This story will return to your archive feed history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Restore",
        onPress: async () => {
          try {
            await socialApi.restoreStory(storyId);
            setStories((prev) => prev.filter((item) => item.id !== storyId));
          } catch (error) {
            Alert.alert("Could not restore", toUserSafeMessage(error));
          }
        },
      },
    ]);
  };

  const renderStoryItem = ({ item }: { item: Story }) => {
    return (
      <View style={styles.card}>
        {item.media ? <Image source={{ uri: item.media.url }} style={styles.thumb} /> : <View style={[styles.thumb, styles.textThumb]} />}

        <View style={styles.cardBody}>
          <Text style={styles.type}>{item.type.toUpperCase()}</Text>
          <Text style={styles.meta}>{item.visibility === "close_friends" ? "Close friends" : "Public"}</Text>
          <Text style={styles.statsLine}>
            {(item.viewCount || 0)} views • {(item.replyCount || 0)} replies • {(item.reactionCount || 0)} likes
          </Text>
          <Text numberOfLines={2} style={styles.contentPreview}>
            {item.text || item.poll?.question || item.question?.prompt || item.linkUrl || "Media story"}
          </Text>
        </View>

        <View style={styles.actionCol}>
          <TouchableOpacity style={styles.restoreIcon} onPress={() => restoreStory(item.id)}>
            <Icon name="refresh-outline" size={20} color="#2563eb" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteIcon} onPress={() => deleteStory(item.id)}>
            <Icon name="trash-outline" size={20} color="#b91c1c" />
          </TouchableOpacity>
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>Story Archive</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={stories}
        keyExtractor={(item) => item.id}
        renderItem={renderStoryItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={<Text style={styles.helperText}>Archived stories are private to you. Restore them to bring them back, or delete them permanently.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    paddingTop: 44,
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 18, fontWeight: "700", color: "#111" },
  headerSpacer: { width: 20 },
  listContent: { padding: 12 },
  helperText: {
    color: "#666",
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: "#e7e7e7",
    borderRadius: 12,
    padding: 10,
    flexDirection: "row",
    marginBottom: 10,
    alignItems: "center",
  },
  thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: "#e5e7eb" },
  textThumb: { backgroundColor: "#dbeafe" },
  cardBody: { flex: 1, marginLeft: 10 },
  type: { fontSize: 12, color: "#3345d1", fontWeight: "700" },
  meta: { fontSize: 11.5, color: "#666", marginTop: 2 },
  statsLine: { fontSize: 11.5, color: "#4b5563", marginTop: 6, fontWeight: "600" },
  contentPreview: { marginTop: 8, color: "#222", fontSize: 13 },
  actionCol: { marginLeft: 10, alignItems: "center" },
  restoreIcon: { marginBottom: 8 },
  deleteIcon: { marginTop: 4 },
});

export default StoryArchiveScreen;
