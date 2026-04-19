import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Alert } from "../../../utils/appAlert";

import CommentThreadSheet from "./CommentThreadSheet";
import CommentAudioBubble from "./CommentAudioBubble";
import { socialApi } from "../socialApi";
import { Comment, CommentAudioFile, Post } from "../types";
import { toUserSafeMessage } from "../validation";
import VoiceRecorderButton from "../../../components/chat/VoiceRecorderButton";
import { normalizeMediaUrl } from "../../../utils/mediaUrls";

const formatAgo = (timestamp: number): string => {
  const mins = Math.max(1, Math.floor((Date.now() - timestamp) / (1000 * 60)));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

interface PostCommentsSheetProps {
  visible: boolean;
  post: Post | null;
  onClose: () => void;
  onPostUpdate: (post: Post) => void;
  onOpenFull: (postId: string) => void;
  showOpenFull?: boolean;
}

function PostCommentsSheet({
  visible,
  post,
  onClose,
  onPostUpdate,
  onOpenFull,
  showOpenFull = true,
}: PostCommentsSheetProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [threadComment, setThreadComment] = useState<Comment | null>(null);

  useEffect(() => {
    if (!visible || !post) {
      setComments([]);
      setDraft("");
      setLoading(false);
      setSubmitting(false);
      setBusyIds({});
      setThreadComment(null);
      return;
    }

    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        const nextComments = await socialApi.getPostComments(post.id);
        if (active) {
          setComments(nextComments);
        }
      } catch (error) {
        if (active) {
          Alert.alert("Could not load comments", toUserSafeMessage(error));
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
  }, [post, visible]);

  const commentsDisabled = !!post?.settings.disableComments;

  const submitComment = async (audioFile?: CommentAudioFile) => {
    if (!post || submitting) {
      return;
    }

    if (commentsDisabled) {
      Alert.alert("Comments unavailable", "Comments are turned off for this post.");
      return;
    }

    if (!draft.trim() && !audioFile?.uri) {
      return;
    }

    try {
      setSubmitting(true);
      const added = await socialApi.addPostComment(post.id, draft, undefined, audioFile);
      setComments((prev) => [added, ...prev]);
      onPostUpdate({ ...post, commentsCount: post.commentsCount + 1 });
      setDraft("");
    } catch (error) {
      Alert.alert("Could not comment", toUserSafeMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = async () => {
    await submitComment();
  };

  const onToggleLike = async (commentId: string) => {
    if (!post || busyIds[commentId]) {
      return;
    }

    try {
      setBusyIds((prev) => ({ ...prev, [commentId]: true }));
      const updated = await socialApi.togglePostCommentLike(post.id, commentId);
      setComments((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      Alert.alert("Could not update like", toUserSafeMessage(error));
    } finally {
      setBusyIds((prev) => ({ ...prev, [commentId]: false }));
    }
  };

  const onDelete = (comment: Comment) => {
    if (!post) {
      return;
    }

    Alert.alert("Delete comment", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const result = await socialApi.deletePostComment(post.id, comment.id);
            setComments((prev) => prev.filter((item) => item.id !== comment.id));
            onPostUpdate({
              ...post,
              commentsCount: Math.max(0, post.commentsCount - Math.max(1, result.deletedCount || 1)),
            });
          } catch (error) {
            Alert.alert("Could not delete comment", toUserSafeMessage(error));
          }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheetWrap}>
        <View style={styles.handle} />
        <View style={styles.sheetContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Comments</Text>
            {showOpenFull ? (
              <TouchableOpacity
                onPress={() => {
                  if (!post) {
                    return;
                  }
                  onClose();
                  onOpenFull(post.id);
                }}
              >
                <Text style={styles.headerLink}>Open full</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.headerLink}>Close</Text>
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <View style={styles.loader}>
              <ActivityIndicator size="small" color="#3345d1" />
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <View style={styles.commentRow}>
                  <Image source={{ uri: normalizeMediaUrl(item.user.avatarUrl) }} style={styles.avatar} />
                  <View style={styles.commentBody}>
                    <View style={styles.commentTop}>
                      <Text style={styles.username}>@{item.user.username}</Text>
                      <Text style={styles.time}>{formatAgo(item.createdAt)}</Text>
                    </View>
                    {item.text ? <Text style={styles.commentText}>{item.text}</Text> : null}
                    {item.audioUrl ? (
                      <CommentAudioBubble audioUrl={item.audioUrl} audioDuration={item.audioDuration} />
                    ) : null}
                    <View style={styles.actionRow}>
                      <TouchableOpacity onPress={() => onToggleLike(item.id)}>
                        <Text style={styles.actionText}>
                          {item.liked ? "Unlike" : "Like"}
                          {item.likesCount ? ` (${item.likesCount})` : ""}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          if (!post) {
                            return;
                          }
                          setThreadComment(item);
                        }}
                      >
                        <Text style={styles.actionText}>Reply</Text>
                      </TouchableOpacity>
                      {(item.replyCount || 0) > 0 ? (
                        <TouchableOpacity
                          onPress={() => {
                            if (!post) {
                              return;
                            }
                            setThreadComment(item);
                          }}
                        >
                          <Text style={styles.actionText}>View replies ({item.replyCount})</Text>
                        </TouchableOpacity>
                      ) : null}
                      {item.canDelete ? (
                        <TouchableOpacity onPress={() => onDelete(item)}>
                          <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
                        </TouchableOpacity>
                      ) : null}
                      {(item.likesCount || 0) > 0 ? (
                        <Text style={styles.metaText}>{item.likesCount} likes</Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>No comments yet.</Text>}
            />
          )}

          {commentsDisabled ? (
            <View style={styles.disabledComposer}>
              <Text style={styles.disabledComposerText}>Comments are turned off for this post.</Text>
            </View>
          ) : (
            <View style={styles.composer}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Add a comment..."
                placeholderTextColor="#8a8a8a"
                style={styles.input}
              />
              <TouchableOpacity disabled={!draft.trim() || submitting} onPress={onSubmit}>
                <Text style={[styles.sendText, (!draft.trim() || submitting) && styles.sendTextDisabled]}>Post</Text>
              </TouchableOpacity>
              <VoiceRecorderButton
                color="#2563eb"
                disabled={submitting}
                onSend={(voiceFile) => {
                  submitComment(voiceFile).catch((error) => {
                    Alert.alert("Could not send voice comment", toUserSafeMessage(error));
                  });
                }}
              />
            </View>
          )}
        </View>

        <CommentThreadSheet
          visible={!!threadComment}
          contentType="post"
          contentId={post?.id || ""}
          comment={threadComment}
          onClose={() => setThreadComment(null)}
          onCommentUpdate={(updatedComment) =>
            setComments((prev) => prev.map((item) => (item.id === updatedComment.id ? updatedComment : item)))
          }
        />
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
    minHeight: 360,
    maxHeight: "82%",
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
  sheetContent: { flex: 1, paddingHorizontal: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "800", color: "#111827" },
  headerLink: { color: "#2563eb", fontWeight: "700" },
  loader: { paddingVertical: 24, alignItems: "center" },
  listContent: { paddingBottom: 12 },
  commentRow: { flexDirection: "row", marginBottom: 14 },
  avatar: { width: 34, height: 34, borderRadius: 17, marginTop: 2 },
  commentBody: { flex: 1, marginLeft: 10 },
  commentTop: { flexDirection: "row", alignItems: "center" },
  username: { fontWeight: "700", color: "#111827", fontSize: 13.5 },
  time: { marginLeft: 8, color: "#6b7280", fontSize: 11.5 },
  commentText: { marginTop: 2, color: "#111827", lineHeight: 19 },
  actionRow: { flexDirection: "row", alignItems: "center", marginTop: 6, flexWrap: "wrap" },
  actionText: { color: "#4b5563", fontWeight: "600", marginRight: 14, fontSize: 12.5, marginBottom: 4 },
  metaText: { color: "#6b7280", fontSize: 12.5, marginBottom: 4 },
  deleteText: { color: "#b91c1c" },
  emptyText: { textAlign: "center", color: "#6b7280", paddingVertical: 30 },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  disabledComposer: {
    paddingTop: 12,
    paddingBottom: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  disabledComposerText: { textAlign: "center", color: "#6b7280" },
  input: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 21,
    paddingHorizontal: 14,
    color: "#111827",
  },
  sendText: { color: "#2563eb", fontWeight: "700", paddingHorizontal: 12 },
  sendTextDisabled: { color: "#9ca3af" },
});

export default PostCommentsSheet;
