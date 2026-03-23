import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";

import { socialApi } from "../socialApi";
import { Comment, SwipeComment } from "../types";
import { toUserSafeMessage } from "../validation";

type ThreadComment = Comment | SwipeComment;
type ThreadContentType = "post" | "swipe";

const formatAgo = (timestamp: number): string => {
  const mins = Math.max(1, Math.floor((Date.now() - timestamp) / (1000 * 60)));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

interface CommentThreadSheetProps {
  visible: boolean;
  contentType: ThreadContentType;
  contentId: string;
  comment: ThreadComment | null;
  onClose: () => void;
  onCommentUpdate?: (comment: ThreadComment) => void;
}

function CommentThreadSheet({
  visible,
  contentType,
  contentId,
  comment,
  onClose,
  onCommentUpdate,
}: CommentThreadSheetProps) {
  const [replies, setReplies] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [threadComment, setThreadComment] = useState<ThreadComment | null>(comment);

  useEffect(() => {
    setThreadComment(comment);
  }, [comment]);

  const load = useCallback(async () => {
    if (!threadComment?.id) {
      throw new Error("Invalid comment");
    }

    const nextReplies = await socialApi.getCommentReplies(threadComment.id);
    setReplies(nextReplies);
  }, [threadComment?.id]);

  useEffect(() => {
    if (!visible || !threadComment?.id) {
      setReplies([]);
      setDraft("");
      setLoading(false);
      setRefreshing(false);
      setSubmitting(false);
      setBusyIds({});
      return;
    }

    let active = true;
    const run = async () => {
      try {
        setLoading(true);
        const nextReplies = await socialApi.getCommentReplies(threadComment.id);
        if (active) {
          setReplies(nextReplies);
        }
      } catch (error) {
        if (active) {
          Alert.alert("Could not load thread", toUserSafeMessage(error));
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
  }, [threadComment?.id, visible]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (error) {
      Alert.alert("Refresh failed", toUserSafeMessage(error));
    } finally {
      setRefreshing(false);
    }
  };

  const updateParentComment = (updater: (current: ThreadComment) => ThreadComment) => {
    setThreadComment((prev) => {
      if (!prev) {
        return prev;
      }
      const next = updater(prev);
      onCommentUpdate?.(next);
      return next;
    });
  };

  const onSubmit = async () => {
    if (!contentId || !threadComment?.id || !draft.trim() || submitting) {
      return;
    }

    try {
      setSubmitting(true);
      const added =
        contentType === "post"
          ? await socialApi.addPostComment(contentId, draft, threadComment.id)
          : await socialApi.addSwipeComment(contentId, draft, threadComment.id);

      setReplies((prev) => [...prev, added as unknown as Comment]);
      updateParentComment((current) => ({
        ...current,
        replyCount: (current.replyCount || 0) + 1,
      }));
      setDraft("");
    } catch (error) {
      Alert.alert("Could not send reply", toUserSafeMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const onToggleLike = async (commentId: string) => {
    if (busyIds[commentId]) {
      return;
    }

    try {
      setBusyIds((prev) => ({ ...prev, [commentId]: true }));
      const updated =
        contentType === "post"
          ? await socialApi.togglePostCommentLike(contentId, commentId)
          : await socialApi.toggleSwipeCommentLike(contentId, commentId);
      setReplies((prev) => prev.map((item) => (item.id === updated.id ? (updated as unknown as Comment) : item)));
    } catch (error) {
      Alert.alert("Could not update like", toUserSafeMessage(error));
    } finally {
      setBusyIds((prev) => ({ ...prev, [commentId]: false }));
    }
  };

  const onDelete = (commentId: string) => {
    Alert.alert("Delete reply", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            if (contentType === "post") {
              await socialApi.deletePostComment(contentId, commentId);
            } else {
              await socialApi.deleteSwipeComment(contentId, commentId);
            }
            setReplies((prev) => prev.filter((item) => item.id !== commentId));
            updateParentComment((current) => ({
              ...current,
              replyCount: Math.max(0, (current.replyCount || 0) - 1),
            }));
          } catch (error) {
            Alert.alert("Could not delete reply", toUserSafeMessage(error));
          }
        },
      },
    ]);
  };

  const title = useMemo(() => {
    if (!threadComment) {
      return "Replies";
    }

    return `${threadComment.replyCount || replies.length} replies`;
  }, [replies.length, threadComment]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheetWrap}>
        <View style={styles.handle} />
        <View style={styles.sheetContent}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Icon name="chevron-down" size={22} color="#111" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{title}</Text>
            <View style={styles.headerSpacer} />
          </View>

          {threadComment ? (
            <View style={styles.parentCard}>
              <Image source={{ uri: threadComment.user.avatarUrl }} style={styles.avatar} />
              <View style={styles.replyBody}>
                <View style={styles.replyTop}>
                  <Text style={styles.username}>@{threadComment.user.username}</Text>
                  <Text style={styles.time}>{formatAgo(threadComment.createdAt)}</Text>
                </View>
                <Text style={styles.replyText}>{threadComment.text}</Text>
                <Text style={styles.parentMeta}>{threadComment.replyCount || 0} replies</Text>
              </View>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.loader}>
              <ActivityIndicator size="small" color="#3345d1" />
            </View>
          ) : (
            <FlatList
              data={replies}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.replyRow}>
                  <Image source={{ uri: item.user.avatarUrl }} style={styles.avatar} />
                  <View style={styles.replyBody}>
                    <View style={styles.replyTop}>
                      <Text style={styles.username}>@{item.user.username}</Text>
                      <Text style={styles.time}>{formatAgo(item.createdAt)}</Text>
                    </View>
                    <Text style={styles.replyText}>{item.text}</Text>
                    <View style={styles.actionRow}>
                      <TouchableOpacity onPress={() => onToggleLike(item.id)}>
                        <Text style={styles.actionText}>{item.liked ? "Unlike" : "Like"}</Text>
                      </TouchableOpacity>
                      {item.canDelete ? (
                        <TouchableOpacity onPress={() => onDelete(item.id)}>
                          <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
                        </TouchableOpacity>
                      ) : null}
                      <Text style={styles.likesCount}>{item.likesCount} likes</Text>
                    </View>
                  </View>
                </View>
              )}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={<Text style={styles.emptyState}>No replies yet.</Text>}
            />
          )}

          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a reply..."
              placeholderTextColor="#8a8a8a"
              style={styles.input}
            />
            <TouchableOpacity disabled={!draft.trim() || submitting} onPress={onSubmit}>
              <Text style={[styles.sendText, (!draft.trim() || submitting) && styles.sendTextDisabled]}>Reply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheetWrap: {
    marginTop: "auto",
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 420,
    maxHeight: "88%",
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#d1d5db",
    marginBottom: 10,
  },
  sheetContent: { flex: 1, paddingHorizontal: 14 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#111" },
  headerSpacer: { width: 22 },
  loader: { paddingVertical: 24, alignItems: "center" },
  parentCard: {
    flexDirection: "row",
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#ececec",
    marginBottom: 12,
  },
  listContent: { paddingBottom: 88 },
  replyRow: { flexDirection: "row", marginBottom: 14 },
  avatar: { width: 36, height: 36, borderRadius: 18, marginTop: 2 },
  replyBody: { marginLeft: 10, flex: 1 },
  replyTop: { flexDirection: "row", alignItems: "center" },
  username: { fontWeight: "700", color: "#111", fontSize: 13.5 },
  time: { marginLeft: 8, color: "#7a7a7a", fontSize: 11.5 },
  replyText: { color: "#1f1f1f", marginTop: 2, lineHeight: 19 },
  parentMeta: { color: "#6b7280", marginTop: 8, fontSize: 12.5, fontWeight: "600" },
  actionRow: { flexDirection: "row", alignItems: "center", marginTop: 6, flexWrap: "wrap" },
  actionText: { color: "#444", fontWeight: "600", marginRight: 14, fontSize: 12.5, marginBottom: 4 },
  deleteText: { color: "#b91c1c" },
  likesCount: { color: "#888", fontSize: 12 },
  emptyState: { textAlign: "center", color: "#6b7280", marginTop: 48 },
  composer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 22,
    paddingHorizontal: 14,
    color: "#111",
  },
  sendText: { color: "#3345d1", fontWeight: "700", fontSize: 14, paddingHorizontal: 12 },
  sendTextDisabled: { color: "#9ca3af" },
});

export default CommentThreadSheet;
