import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";

import ContentActionSheet from "../../features/social/components/ContentActionSheet";
import PostCommentsSheet from "../../features/social/components/PostCommentsSheet";
import PostShareSheet from "../../features/social/components/PostShareSheet";
import SocialVideo from "../../features/social/components/SocialVideo";
import { socialApi } from "../../features/social/socialApi";
import { Post } from "../../features/social/types";
import { toUserSafeMessage } from "../../features/social/validation";
import { getStoredUserId } from "../../utils/authSession";
import { useAppTheme } from "../../theme/AppThemeContext";

function PostDetailScreen({ route, navigation }: any) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const postId = typeof route?.params?.postId === "string" ? route.params.postId : "";

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [busyLike, setBusyLike] = useState(false);
  const [busySave, setBusySave] = useState(false);
  const [activeSheet, setActiveSheet] = useState<null | "comments" | "share" | "actions">(null);

  const [caption, setCaption] = useState("");
  const [hideLikeCount, setHideLikeCount] = useState(false);
  const [disableComments, setDisableComments] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;

      const load = async () => {
        try {
          if (!postId) {
            throw new Error("Invalid post id");
          }

          const [data, nextUserId] = await Promise.all([socialApi.getPost(postId), getStoredUserId()]);

          if (!active) {
            return;
          }

          setPost(data);
          setCurrentUserId(nextUserId);
          setCaption(data.caption);
          setHideLikeCount(data.settings.hideLikeCount);
          setDisableComments(data.settings.disableComments);
        } catch (error) {
          if (active) {
            Alert.alert("Failed to load post", toUserSafeMessage(error));
            navigation.goBack();
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
    }, [navigation, postId]),
  );

  const saveChanges = async () => {
    if (!post || saving || post.user.id !== currentUserId) {
      return;
    }

    try {
      setSaving(true);
      const updated = await socialApi.updatePost(post.id, {
        caption,
        settings: {
          hideLikeCount,
          disableComments,
        },
      });

      setPost(updated);
      setEditing(false);
      Alert.alert("Updated", "Post updated successfully.");
    } catch (error) {
      Alert.alert("Could not update", toUserSafeMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const deletePost = async () => {
    if (!post || post.user.id !== currentUserId) {
      return;
    }

    Alert.alert("Delete post", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await socialApi.deletePost(post.id);
            navigation.goBack();
          } catch (error) {
            Alert.alert("Delete failed", toUserSafeMessage(error));
          }
        },
      },
    ]);
  };

  const toggleLike = async () => {
    if (!post || busyLike) {
      return;
    }

    try {
      setBusyLike(true);
      const updated = await socialApi.togglePostLike(post.id);
      setPost(updated);
    } catch (error) {
      Alert.alert("Could not update like", toUserSafeMessage(error));
    } finally {
      setBusyLike(false);
    }
  };

  const toggleSave = async () => {
    if (!post || busySave) {
      return;
    }

    try {
      setBusySave(true);
      const updated = await socialApi.togglePostSave(post.id);
      setPost(updated);
    } catch (error) {
      Alert.alert("Could not save post", toUserSafeMessage(error));
    } finally {
      setBusySave(false);
    }
  };

  const closeSheet = () => setActiveSheet(null);

  if (loading || !post) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const canManagePost = !!currentUserId && post.user.id === currentUserId;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={["top"]}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12), borderColor: colors.border, backgroundColor: colors.card }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Post Details</Text>
          <View style={styles.headerActions}>
            {!editing && post ? (
              <TouchableOpacity style={styles.headerActionGap} onPress={() => setActiveSheet("actions")}>
                <Icon name="ellipsis-horizontal" size={20} color={colors.text} />
              </TouchableOpacity>
            ) : null}
            {canManagePost ? (
              <TouchableOpacity onPress={() => (editing ? saveChanges() : setEditing(true))}>
                <Text style={[styles.editButton, { color: colors.primary }]}>{editing ? "Save" : "Edit"}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <ScrollView>
          {post.type === "carousel" ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {post.media.map((asset) => (
                asset.mediaType === "video" ? (
                  <SocialVideo
                    key={asset.id}
                    uri={asset.url}
                    posterUri={asset.thumbnailUrl}
                    style={styles.image}
                    controls
                  />
                ) : (
                  <Image
                    key={asset.id}
                    source={{ uri: asset.url }}
                    style={styles.image}
                  />
                )
              ))}
            </ScrollView>
          ) : (
            post.media[0]?.mediaType === "video" ? (
              <SocialVideo
                uri={post.media[0]?.url}
                posterUri={post.media[0]?.thumbnailUrl}
                style={styles.image}
                controls
              />
            ) : (
              <Image
                source={{ uri: post.media[0]?.url }}
                style={styles.image}
              />
            )
          )}

          <View style={styles.body}>
            <Text style={[styles.meta, { color: colors.mutedText }]}>Type: {post.type}</Text>
            {post.editedAt ? <Text style={[styles.meta, { color: colors.mutedText }]}>Edited</Text> : null}

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionIcon} onPress={toggleLike}>
                <Icon name={post.liked ? "heart" : "heart-outline"} size={24} color={post.liked ? "#ef476f" : colors.text} />
                {!post.settings.hideLikeCount ? <Text style={[styles.actionCount, { color: colors.text }]}>{post.likesCount}</Text> : null}
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionIcon} onPress={() => setActiveSheet("comments")}>
                <Icon name="chatbubble-outline" size={22} color={colors.text} />
                <Text style={[styles.actionCount, { color: colors.text }]}>{post.commentsCount}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionIcon} onPress={() => setActiveSheet("share")}>
                <Icon name="paper-plane-outline" size={22} color={colors.text} />
                <Text style={[styles.actionCount, { color: colors.text }]}>{post.sharesCount}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.bookmarkIcon} onPress={toggleSave}>
                <Icon name={post.saved ? "bookmark" : "bookmark-outline"} size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { color: colors.text }]}>Caption</Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: colors.border, color: colors.text, backgroundColor: editing ? colors.card : colors.surface },
                !editing && styles.inputReadOnly,
              ]}
              value={caption}
              onChangeText={setCaption}
              editable={editing}
              multiline
              placeholderTextColor={colors.placeholder}
            />

            <Text style={[styles.helperText, { color: colors.mutedText }]}>The current backend allows editing caption, hidden likes, and comment settings only.</Text>

            <Text style={[styles.label, { color: colors.text }]}>Location</Text>
            <View style={[styles.readOnlyField, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.readOnlyText, { color: colors.text }]}>{post.location || "Not set"}</Text>
            </View>

            <Text style={[styles.label, { color: colors.text }]}>Music</Text>
            <View style={[styles.readOnlyField, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.readOnlyText, { color: colors.text }]}>{post.music || "Not set"}</Text>
            </View>

            {post.hashtags.length ? (
              <>
                <Text style={[styles.label, { color: colors.text }]}>Hashtags</Text>
                <Text style={[styles.entityLine, { color: colors.primary }]}>{post.hashtags.map((tag) => `#${tag}`).join(" ")}</Text>
              </>
            ) : null}

            {post.mentions.length ? (
              <>
                <Text style={[styles.label, { color: colors.text }]}>Mentions</Text>
                <Text style={[styles.entityLine, { color: colors.mutedText }]}>{post.mentions.map((mention) => `@${mention}`).join(" ")}</Text>
              </>
            ) : null}

            <View style={styles.switchRow}>
              <Text style={[styles.switchLabel, { color: colors.text }]}>Hide like count</Text>
              <Switch value={hideLikeCount} onValueChange={setHideLikeCount} disabled={!editing} />
            </View>

            <View style={styles.switchRow}>
              <Text style={[styles.switchLabel, { color: colors.text }]}>Disable comments</Text>
              <Switch value={disableComments} onValueChange={setDisableComments} disabled={!editing} />
            </View>

            <TouchableOpacity style={[styles.commentsButton, { backgroundColor: colors.primary }]} onPress={() => setActiveSheet("comments")}>
              <Text style={styles.commentsButtonText}>Open comments ({post.commentsCount})</Text>
            </TouchableOpacity>

            {canManagePost ? (
              <TouchableOpacity style={[styles.deleteButton, { borderColor: colors.danger }]} onPress={deletePost}>
                <Text style={styles.deleteText}>Delete Post</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </ScrollView>
      </View>
      <PostCommentsSheet
        visible={activeSheet === "comments"}
        post={post}
        onClose={closeSheet}
        onPostUpdate={setPost}
        onOpenFull={(nextPostId) => navigation.navigate("PostComments", { postId: nextPostId })}
      />

      <PostShareSheet
        visible={activeSheet === "share"}
        post={post}
        onClose={closeSheet}
        onPostUpdate={setPost}
        onOpenStoryComposer={(nextPost) =>
          navigation.navigate("MainApp", {
            screen: "Create",
            params: {
              initialTab: "story",
              initialMedia:
                nextPost.media[0]?.mediaType === "video"
                  ? nextPost.media[0]?.url
                  : nextPost.media[0]?.thumbnailUrl || nextPost.media[0]?.url,
              initialMediaType: nextPost.media[0]?.mediaType || "image",
            },
          })
        }
      />

      <ContentActionSheet
        visible={activeSheet === "actions"}
        contentType="post"
        contentId={post.id}
        userId={post.user.id}
        userLabel={post.user.username}
        title="Post options"
        onClose={closeSheet}
        onActionComplete={(action) => {
          if (action === "archive") {
            navigation.goBack();
            return;
          }

          if (action === "not_interested" || action === "mute" || action === "block") {
            navigation.goBack();
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 18, fontWeight: "700", color: "#111" },
  headerActions: { flexDirection: "row", alignItems: "center" },
  headerActionGap: { marginRight: 10, padding: 2 },
  editButton: { fontSize: 15, color: "#3345d1", fontWeight: "700" },
  image: { width: "100%", height: 320, backgroundColor: "#f4f4f4" },
  body: { padding: 14 },
  meta: { color: "#666", fontSize: 12, marginBottom: 4 },
  actionRow: { flexDirection: "row", alignItems: "center", marginTop: 8, marginBottom: 10 },
  actionIcon: { flexDirection: "row", alignItems: "center", marginRight: 18 },
  actionCount: { marginLeft: 6, color: "#111", fontWeight: "700", fontSize: 13 },
  bookmarkIcon: { marginLeft: "auto" },
  label: { marginTop: 14, marginBottom: 6, fontSize: 13, fontWeight: "700", color: "#111" },
  helperText: {
    marginTop: 8,
    color: "#666",
    fontSize: 12,
    lineHeight: 18,
  },
  input: {
    minHeight: 92,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlignVertical: "top",
  },
  inputSingle: {
    height: 46,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  inputReadOnly: {
    backgroundColor: "#f8f8f8",
  },
  readOnlyField: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 10,
    justifyContent: "center",
    backgroundColor: "#f8f8f8",
  },
  readOnlyText: {
    color: "#222",
  },
  entityLine: {
    color: "#3345d1",
    lineHeight: 20,
  },
  switchRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  switchLabel: { color: "#222", fontWeight: "600" },
  commentsButton: {
    marginTop: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d9ddff",
    backgroundColor: "#eef0ff",
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  commentsButtonText: { color: "#2d3fb7", fontWeight: "700" },
  deleteButton: {
    marginTop: 24,
    backgroundColor: "#fee2e2",
    borderRadius: 10,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteText: { color: "#b91c1c", fontWeight: "700" },
});

export default PostDetailScreen;
