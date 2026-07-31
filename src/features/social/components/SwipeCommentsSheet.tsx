import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View
} from "react-native";
import { useKeyboardHandler } from "react-native-keyboard-controller";
import { runOnJS } from "react-native-reanimated";
import { Alert } from "../../../utils/appAlert";
import Icon from "react-native-vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { API } from "../../../api/api";
import MentionSuggestionList from "../../../components/MentionSuggestionList";

import CommentThreadSheet from "./CommentThreadSheet";
import CommentAudioBubble from "./CommentAudioBubble";
import InteractiveText from "./InteractiveText";
import { socialApi } from "../socialApi";
import { CommentAudioFile, Swipe, SwipeComment } from "../types";
import { toUserSafeMessage } from "../validation";
import VoiceRecorderButton from "../../../components/chat/VoiceRecorderButton";
import { normalizeMediaUrl } from "../../../utils/mediaUrls";
import { getActiveMentionQuery, insertMentionAtCursorEnd, mapMentionCandidate, MentionCandidate } from "../../../utils/mentionComposer";
import { resolveMentionUserId } from "../../../utils/mentionLinks";

const formatAgo = (timestamp: number): string => {
  const mins = Math.max(1, Math.floor((Date.now() - timestamp) / (1000 * 60)));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

interface SwipeCommentsSheetProps {
  visible: boolean;
  swipe: Swipe | null;
  onClose: () => void;
  onSwipeUpdate: (swipe: Swipe) => void;
  onOpenFull: (swipeId: string) => void;
  showOpenFull?: boolean;
}

function SwipeCommentsSheet({
  visible,
  swipe,
  onClose,
  onSwipeUpdate,
  onOpenFull,
  showOpenFull = true,
}: SwipeCommentsSheetProps) {
  const navigation = useNavigation<any>();
  const [comments, setComments] = useState<SwipeComment[]>([]);
  const [draft, setDraft] = useState("");
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [threadComment, setThreadComment] = useState<SwipeComment | null>(null);
  const [pendingVoice, setPendingVoice] = useState<CommentAudioFile | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const mentionQuery = getActiveMentionQuery(draft);

  useKeyboardHandler({
    onStart: (e) => {
      'worklet';
      runOnJS(setKeyboardHeight)(e.height);
    },
    onMove: (e) => {
      'worklet';
      runOnJS(setKeyboardHeight)(e.height);
    },
    onEnd: (e) => {
      'worklet';
      runOnJS(setKeyboardHeight)(e.height);
    },
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      },
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        setKeyboardHeight(0);
      },
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (mentionQuery === null) {
      setMentionSuggestions([]);
      return;
    }

    let mounted = true;
    const query = mentionQuery.trim();

    const loadMentions = async () => {
      try {
        const response = query
          ? await API.get("/auth/search", { params: { query } })
          : await API.get("/search/suggested/users", { params: { limit: 8 } });
        const users = Array.isArray(response?.data?.users) ? response.data.users : [];
        if (mounted) {
          setMentionSuggestions(users.map(mapMentionCandidate).filter(Boolean) as MentionCandidate[]);
        }
      } catch {
        if (mounted) {
          setMentionSuggestions([]);
        }
      }
    };

    const timeout = setTimeout(() => {
      loadMentions().catch(() => undefined);
    }, query ? 180 : 0);

    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, [mentionQuery]);

  const openMentionProfile = async (username: string) => {
    const userId = await resolveMentionUserId(username);
    if (userId) {
      navigation.navigate("ProfilePreviewScreen", { userId });
    }
  };

  useEffect(() => {
    if (!visible || !swipe) {
      setComments([]);
      setDraft("");
      setLoading(false);
      setSubmitting(false);
      setBusyIds({});
      setThreadComment(null);
      setPendingVoice(null);
      return;
    }

    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        const nextComments = await socialApi.getSwipeComments(swipe.id);
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
  }, [swipe, visible]);

  const submitComment = async (audioFile?: CommentAudioFile) => {
    if (!swipe || submitting) {
      return;
    }

    if (!draft.trim() && !audioFile?.uri) {
      return;
    }

    try {
      setSubmitting(true);
      const added = await socialApi.addSwipeComment(swipe.id, draft, undefined, audioFile);
      setComments((prev) => [added, ...prev]);
      onSwipeUpdate({ ...swipe, commentsCount: swipe.commentsCount + 1 });
      setDraft("");
      setPendingVoice(null);
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
    if (!swipe || busyIds[commentId]) {
      return;
    }

    try {
      setBusyIds((prev) => ({ ...prev, [commentId]: true }));
      const updated = await socialApi.toggleSwipeCommentLike(swipe.id, commentId);
      setComments((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      Alert.alert("Could not update like", toUserSafeMessage(error));
    } finally {
      setBusyIds((prev) => ({ ...prev, [commentId]: false }));
    }
  };

  const onDelete = (comment: SwipeComment) => {
    if (!swipe) {
      return;
    }

    Alert.alert("Delete comment", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const result = await socialApi.deleteSwipeComment(swipe.id, comment.id);
            setComments((prev) => prev.filter((item) => item.id !== comment.id));
            onSwipeUpdate({
              ...swipe,
              commentsCount: Math.max(0, swipe.commentsCount - Math.max(1, result.deletedCount || 1)),
            });
          } catch (error) {
            Alert.alert("Could not delete comment", toUserSafeMessage(error));
          }
        },
      },
    ]);
  };

  const { height: windowHeight } = useWindowDimensions();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheetWrap,
          {
            marginBottom: keyboardHeight,
            minHeight: keyboardHeight > 0 ? 220 : 360,
            maxHeight: keyboardHeight > 0 ? Math.max(240, windowHeight - keyboardHeight - 16) : "82%",
          },
        ]}
      >
        <View style={styles.handle} />
        <View style={styles.sheetContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Comments</Text>
            {showOpenFull ? (
              <TouchableOpacity
                onPress={() => {
                  if (!swipe) {
                    return;
                  }
                  onClose();
                  onOpenFull(swipe.id);
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
                    {item.text ? (
                      <InteractiveText
                        style={styles.commentText}
                        mentionStyle={styles.commentMentionText}
                        onPressMention={(mention) => {
                          openMentionProfile(mention).catch(() => undefined);
                        }}
                        text={item.text}
                      />
                    ) : null}
                    {item.audioUrl ? (
                      <CommentAudioBubble audioUrl={item.audioUrl} audioDuration={item.audioDuration} />
                    ) : null}
                    <View style={styles.actionRow}>
                      <TouchableOpacity onPress={() => onToggleLike(item.id)}>
                        <Text style={styles.actionText}>{item.liked ? "Unlike" : "Like"}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setThreadComment(item)}>
                        <Text style={styles.actionText}>Reply</Text>
                      </TouchableOpacity>
                      {(item.replyCount || 0) > 0 ? (
                        <TouchableOpacity onPress={() => setThreadComment(item)}>
                          <Text style={styles.actionText}>View replies ({item.replyCount})</Text>
                        </TouchableOpacity>
                      ) : null}
                      {item.canDelete ? (
                        <TouchableOpacity onPress={() => onDelete(item)}>
                          <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>No comments yet.</Text>}
            />
          )}

          <MentionSuggestionList
            visible={mentionQuery !== null}
            candidates={mentionSuggestions}
            onSelect={(candidate) => {
              setDraft((current) => insertMentionAtCursorEnd(current, candidate.username));
              setMentionSuggestions([]);
            }}
          />
          <View style={styles.composer}>
            {!pendingVoice ? (
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Add a comment..."
                placeholderTextColor="#8a8a8a"
                style={styles.input}
              />
            ) : null}
            {pendingVoice ? (
              <View style={styles.voicePreviewWrap}>
                <CommentAudioBubble audioUrl={pendingVoice.uri} audioDuration={pendingVoice.duration} />
                <TouchableOpacity style={styles.voiceDeleteButton} onPress={() => setPendingVoice(null)} disabled={submitting}>
                  <Icon name="close-circle" size={22} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ) : null}
            {draft.trim() || pendingVoice ? (
              <TouchableOpacity
                style={styles.sendIconButton}
                disabled={submitting}
                onPress={() => {
                  submitComment(pendingVoice || undefined).catch((error) => {
                    Alert.alert("Could not send comment", toUserSafeMessage(error));
                  });
                }}
              >
                <Icon name="send" size={17} color="#fff" />
              </TouchableOpacity>
            ) : (
              <VoiceRecorderButton
                color="#2563eb"
                disabled={submitting}
                onSend={(voiceFile) => setPendingVoice(voiceFile)}
              />
            )}
          </View>

          <CommentThreadSheet
            visible={!!threadComment}
            contentType="swipe"
            contentId={swipe?.id || ""}
            comment={threadComment}
            onClose={() => setThreadComment(null)}
            onCommentUpdate={(updatedComment) =>
              setComments((prev) =>
                prev.map((item) =>
                  item.id === updatedComment.id
                    ? { ...item, ...updatedComment, reelId: item.reelId }
                    : item
                )
              )
            }
          />
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
  keyboardAvoider: {
    flex: 1,
    justifyContent: "flex-end",
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
  deleteText: { color: "#b91c1c" },
  emptyText: { textAlign: "center", color: "#6b7280", paddingVertical: 30 },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
    paddingBottom: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  input: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 21,
    paddingHorizontal: 14,
    color: "#111827",
  },
  sendIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563eb",
  },
  voicePreviewWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  voiceDeleteButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  sendText: { color: "#2563eb", fontWeight: "700", paddingHorizontal: 12 },
  sendTextDisabled: { color: "#9ca3af" },
  commentMentionText: { color: "#2563eb", fontWeight: "800" },
});

export default SwipeCommentsSheet;
