import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
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
import { useAppTheme } from "../../../theme/AppThemeContext";
import DraggableBottomSheet from "../../../components/DraggableBottomSheet";

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
  const { colors, isDarkMode } = useAppTheme();
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
    <DraggableBottomSheet visible={visible} onClose={onClose} snapPoints={[0.42, 0.66, 0.88]}>
      <View style={styles.sheetContent}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Comments</Text>
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
              <Text style={[styles.headerLink, { color: colors.primary }]}>Open full</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.headerLink, { color: colors.primary }]}>Close</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="small" color={colors.primary} />
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
                    <Text style={[styles.username, { color: colors.text }]}>@{item.user.username}</Text>
                    <Text style={[styles.time, { color: colors.mutedText }]}>{formatAgo(item.createdAt)}</Text>
                  </View>
                  {item.text ? <Text style={[styles.commentText, { color: colors.text }]}>{item.text}</Text> : null}
                  {item.audioUrl ? (
                    <CommentAudioBubble audioUrl={item.audioUrl} audioDuration={item.audioDuration} />
                  ) : null}
                  <View style={styles.actionRow}>
                    <TouchableOpacity onPress={() => onToggleLike(item.id)}>
                      <Text style={[styles.actionText, { color: colors.mutedText }]}>
                        {item.liked ? "Unlike" : "Like"}
                        {item.likesCount ? ` (${item.likesCount})` : ""}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setThreadComment(item)}>
                      <Text style={[styles.actionText, { color: colors.mutedText }]}>Reply</Text>
                    </TouchableOpacity>
                    {(item.replyCount || 0) > 0 ? (
                      <TouchableOpacity onPress={() => setThreadComment(item)}>
                        <Text style={[styles.actionText, { color: colors.mutedText }]}>View replies ({item.replyCount})</Text>
                      </TouchableOpacity>
                    ) : null}
                    {item.canDelete ? (
                      <TouchableOpacity onPress={() => onDelete(item)}>
                        <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
                      </TouchableOpacity>
                    ) : null}
                    {(item.likesCount || 0) > 0 ? (
                      <Text style={[styles.metaText, { color: colors.mutedText }]}>{item.likesCount} likes</Text>
                    ) : null}
                  </View>
                </View>
              </View>
            )}
            ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.mutedText }]}>No comments yet.</Text>}
          />
        )}

        {commentsDisabled ? (
          <View style={[styles.disabledComposer, { borderColor: colors.border }]}>
            <Text style={[styles.disabledComposerText, { color: colors.mutedText }]}>Comments are turned off for this post.</Text>
          </View>
        ) : (
          <View style={[styles.composer, { borderColor: colors.border }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Add a comment..."
              placeholderTextColor={colors.placeholder}
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: isDarkMode ? colors.input : colors.surface,
                },
              ]}
            />
            <TouchableOpacity disabled={!draft.trim() || submitting} onPress={onSubmit}>
              <Text style={[styles.sendText, { color: colors.primary }, (!draft.trim() || submitting) && styles.sendTextDisabled]}>Post</Text>
            </TouchableOpacity>
            <VoiceRecorderButton
              color={colors.primary}
              disabled={submitting}
              onSend={(voiceFile) => {
                submitComment(voiceFile).catch((error) => {
                  Alert.alert("Could not send voice comment", toUserSafeMessage(error));
                });
              }}
            />
          </View>
        )}

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
    </DraggableBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetContent: { flex: 1, paddingHorizontal: 14 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
  },
  title: { fontSize: 16.5, fontWeight: "800" },
  headerLink: { fontWeight: "700", fontSize: 12.5 },
  loader: { paddingVertical: 24, alignItems: "center" },
  listContent: { paddingBottom: 12 },
  commentRow: { flexDirection: "row", marginBottom: 12 },
  avatar: { width: 32, height: 32, borderRadius: 16, marginTop: 2 },
  commentBody: { flex: 1, marginLeft: 9 },
  commentTop: { flexDirection: "row", alignItems: "center" },
  username: { fontWeight: "700", fontSize: 12.8 },
  time: { marginLeft: 8, fontSize: 10.8 },
  commentText: { marginTop: 2, lineHeight: 18, fontSize: 13 },
  actionRow: { flexDirection: "row", alignItems: "center", marginTop: 6, flexWrap: "wrap" },
  actionText: { fontWeight: "600", marginRight: 12, fontSize: 11.8, marginBottom: 4 },
  metaText: { fontSize: 11.8, marginBottom: 4 },
  deleteText: { color: "#b91c1c" },
  emptyText: { textAlign: "center", paddingVertical: 30 },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  disabledComposer: {
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  disabledComposerText: { textAlign: "center" },
  input: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 13,
    fontSize: 13,
  },
  sendText: { fontWeight: "700", paddingHorizontal: 12, fontSize: 12.5 },
  sendTextDisabled: { color: "#9ca3af" },
});

export default PostCommentsSheet;
