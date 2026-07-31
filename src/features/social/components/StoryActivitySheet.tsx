import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Alert } from "../../../utils/appAlert";
import Icon from "react-native-vector-icons/Ionicons";

import { socialApi } from "../socialApi";
import { Comment, SocialUser, Story, StoryViewerEntry, Visibility } from "../types";
import { toUserSafeMessage } from "../validation";

type ActivityTab = "views" | "likes" | "replies";

const formatAgo = (timestamp: number): string => {
  const mins = Math.max(1, Math.floor((Date.now() - timestamp) / (1000 * 60)));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

interface StoryActivitySheetProps {
  visible: boolean;
  storyId: string;
  initialTab?: ActivityTab;
  onClose: () => void;
  onStoryUpdate?: (story: Story) => void;
}

function StoryActivitySheet({
  visible,
  storyId,
  initialTab = "views",
  onClose,
  onStoryUpdate,
}: StoryActivitySheetProps) {
  const [story, setStory] = useState<Story | null>(null);
  const [viewers, setViewers] = useState<StoryViewerEntry[]>([]);
  const [likers, setLikers] = useState<SocialUser[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentReplies, setCommentReplies] = useState<Record<string, Comment[]>>({});
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [replyTarget, setReplyTarget] = useState<Comment | null>(null);
  const [draft, setDraft] = useState("");
  const [activeTab, setActiveTab] = useState<ActivityTab>(initialTab);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const onStoryUpdateRef = useRef(onStoryUpdate);

  useEffect(() => {
    onStoryUpdateRef.current = onStoryUpdate;
  }, [onStoryUpdate]);

  useEffect(() => {
    if (visible) {
      setActiveTab(initialTab);
    }
  }, [initialTab, visible]);

  const load = useCallback(async () => {
    if (!storyId) {
      throw new Error("Invalid story id");
    }

    const nextStory = await socialApi.getStory(storyId);
    if (!nextStory.isOwner) {
      throw new Error("Story activity is only available for your own stories.");
    }

    const [viewersResult, likersResult, commentsResult] = await Promise.allSettled([
      socialApi.getStoryViewers(storyId),
      socialApi.getStoryLikers(storyId),
      socialApi.getStoryReplies(storyId),
    ]);
    const nextViewers = viewersResult.status === "fulfilled" ? viewersResult.value : [];
    const nextLikers = likersResult.status === "fulfilled" ? likersResult.value : [];
    const nextComments = commentsResult.status === "fulfilled" ? commentsResult.value : [];

    setStory(nextStory);
    setViewers(nextViewers);
    setLikers(nextLikers);
    setComments(nextComments);
    setErrorMessage(
      viewersResult.status === "rejected" && likersResult.status === "rejected" && commentsResult.status === "rejected"
        ? "Story settings loaded, but activity could not be loaded right now."
        : "",
    );
    onStoryUpdateRef.current?.(nextStory);
  }, [storyId]);

  useEffect(() => {
    if (!visible) {
      setStory(null);
      setViewers([]);
      setLikers([]);
      setComments([]);
      setCommentReplies({});
      setExpandedIds({});
      setReplyTarget(null);
      setDraft("");
      setLoading(false);
      setRefreshing(false);
      setSubmitting(false);
      setBusyIds({});
      setErrorMessage("");
      return;
    }

    let active = true;
    const run = async () => {
      try {
        setLoading(true);
        await load();
      } catch (error) {
        if (active) {
          setErrorMessage(toUserSafeMessage(error));
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
  }, [load, visible]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (error) {
      setErrorMessage(toUserSafeMessage(error));
    } finally {
      setRefreshing(false);
    }
  };

  const syncComment = (updated: Comment) => {
    setComments((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    setCommentReplies((prev) => {
      const next: Record<string, Comment[]> = {};
      Object.entries(prev).forEach(([parentId, replies]) => {
        next[parentId] = replies.map((item) => (item.id === updated.id ? updated : item));
      });
      return next;
    });
  };

  const updateStory = (updater: (current: Story) => Story) => {
    setStory((prev) => {
      if (!prev) {
        return prev;
      }
      const next = updater(prev);
      onStoryUpdateRef.current?.(next);
      return next;
    });
  };

  const updateStorySettings = async (input: { visibility?: Visibility; allowReplies?: boolean; allowSharing?: boolean }) => {
    if (!story || savingSettings) {
      return;
    }

    try {
      setSavingSettings(true);
      const updated = await socialApi.updateStory(story.id, input);
      setStory(updated);
      onStoryUpdateRef.current?.(updated);
    } catch (error) {
      Alert.alert("Could not update story settings", toUserSafeMessage(error));
    } finally {
      setSavingSettings(false);
    }
  };

  const cycleVisibility = async () => {
    if (!story) {
      return;
    }

    const order: Visibility[] = ["public", "friends", "close_friends"];
    const currentIndex = order.indexOf(story.visibility === "custom" ? "public" : story.visibility);
    const nextVisibility = order[(currentIndex + 1) % order.length];
    await updateStorySettings({ visibility: nextVisibility });
  };

  const onToggleReplies = async (comment: Comment) => {
    if (!comment.replyCount) {
      return;
    }

    const isExpanded = expandedIds[comment.id];
    if (isExpanded) {
      setExpandedIds((prev) => ({ ...prev, [comment.id]: false }));
      return;
    }

    if (!commentReplies[comment.id]) {
      try {
        setBusyIds((prev) => ({ ...prev, [comment.id]: true }));
        const replies = await socialApi.getCommentReplies(comment.id);
        setCommentReplies((prev) => ({ ...prev, [comment.id]: replies }));
      } catch (error) {
        Alert.alert("Could not load thread", toUserSafeMessage(error));
        return;
      } finally {
        setBusyIds((prev) => ({ ...prev, [comment.id]: false }));
      }
    }

    setExpandedIds((prev) => ({ ...prev, [comment.id]: true }));
  };

  const onSubmit = async () => {
    if (!storyId || submitting || !draft.trim()) {
      return;
    }

    try {
      setSubmitting(true);
      const added = await socialApi.addStoryReply(storyId, draft, replyTarget?.id);
      setDraft("");

      if (replyTarget) {
        setCommentReplies((prev) => ({
          ...prev,
          [replyTarget.id]: [...(prev[replyTarget.id] || []), added],
        }));
        setExpandedIds((prev) => ({ ...prev, [replyTarget.id]: true }));
        setComments((prev) =>
          prev.map((item) =>
            item.id === replyTarget.id ? { ...item, replyCount: (item.replyCount || 0) + 1 } : item,
          ),
        );
      } else {
        setComments((prev) => [added, ...prev]);
      }

      updateStory((current) => ({ ...current, replyCount: (current.replyCount || 0) + 1 }));
      setReplyTarget(null);
      setActiveTab("replies");
    } catch (error) {
      Alert.alert("Could not send reply", toUserSafeMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const onLikeReply = async (commentId: string) => {
    if (!storyId || busyIds[`like_${commentId}`]) {
      return;
    }

    try {
      setBusyIds((prev) => ({ ...prev, [`like_${commentId}`]: true }));
      const updated = await socialApi.toggleStoryReplyLike(storyId, commentId);
      syncComment(updated);
    } catch (error) {
      Alert.alert("Could not update like", toUserSafeMessage(error));
    } finally {
      setBusyIds((prev) => ({ ...prev, [`like_${commentId}`]: false }));
    }
  };

  const onDeleteReply = (comment: Comment) => {
    if (!storyId) {
      return;
    }

    Alert.alert("Delete reply", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const result = await socialApi.deleteStoryReply(storyId, comment.id);
            setComments((prev) => prev.filter((item) => item.id !== comment.id));
            setCommentReplies((prev) => {
              const next: Record<string, Comment[]> = {};
              Object.entries(prev).forEach(([parentId, replies]) => {
                next[parentId] = replies.filter((item) => item.id !== comment.id);
              });
              return next;
            });
            updateStory((current) => ({
              ...current,
              replyCount: Math.max(0, (current.replyCount || 0) - Math.max(1, result.deletedCount || 1)),
            }));
            if (replyTarget?.id === comment.id) {
              setReplyTarget(null);
            }
          } catch (error) {
            Alert.alert("Could not delete reply", toUserSafeMessage(error));
          }
        },
      },
    ]);
  };

  const renderReplyCard = (item: Comment, nested = false) => (
    <View style={styles.replyCard}>
      <Image source={{ uri: item.user.avatarUrl }} style={nested ? styles.replyAvatarSmall : styles.replyAvatar} />
      <View style={styles.replyBody}>
        <View style={styles.replyHeaderRow}>
          <Text style={styles.replyUser}>@{item.user.username}</Text>
          <Text style={styles.replyTime}>{formatAgo(item.createdAt)}</Text>
        </View>
        <Text style={styles.replyText}>{item.text}</Text>
        <View style={styles.replyActionsRow}>
          <TouchableOpacity onPress={() => onLikeReply(item.id)}>
            <Text style={styles.replyAction}>{item.liked ? "Unlike" : "Like"}</Text>
          </TouchableOpacity>
          {!nested ? (
            <TouchableOpacity onPress={() => setReplyTarget(item)}>
              <Text style={styles.replyAction}>Reply</Text>
            </TouchableOpacity>
          ) : null}
          {item.canDelete ? (
            <TouchableOpacity onPress={() => onDeleteReply(item)}>
              <Text style={[styles.replyAction, styles.deleteAction]}>Delete</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={styles.likesText}>{item.likesCount} likes</Text>
        </View>
        {!nested && (item.replyCount || 0) > 0 ? (
          <TouchableOpacity style={styles.threadButton} onPress={() => onToggleReplies(item)}>
            <Text style={styles.threadButtonText}>
              {expandedIds[item.id] ? "Hide replies" : `View replies (${item.replyCount})`}
            </Text>
          </TouchableOpacity>
        ) : null}
        {!nested && expandedIds[item.id] ? (
          <View style={styles.threadWrap}>
            {(commentReplies[item.id] || []).map((reply) => (
              <View key={reply.id} style={styles.threadRow}>
                {renderReplyCard(reply, true)}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <View style={styles.sheetWrap}>
          <View style={styles.handle} />
          <View style={styles.sheetContent}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Icon name="chevron-down" size={22} color="#111" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Story activity</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.summaryRow}>
            <TouchableOpacity
              style={[styles.summaryCard, activeTab === "views" && styles.summaryCardActive]}
              onPress={() => setActiveTab("views")}
            >
              <Text style={styles.summaryTitle}>Views</Text>
              <Text style={styles.summaryValue}>{story?.viewCount || viewers.length}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.summaryCard, activeTab === "likes" && styles.summaryCardActive]}
              onPress={() => setActiveTab("likes")}
            >
              <Text style={styles.summaryTitle}>Likes</Text>
              <Text style={styles.summaryValue}>{likers.length}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.summaryCard, activeTab === "replies" && styles.summaryCardActive]}
              onPress={() => setActiveTab("replies")}
            >
              <Text style={styles.summaryTitle}>Replies</Text>
              <Text style={styles.summaryValue}>{story?.replyCount || comments.length}</Text>
            </TouchableOpacity>
          </View>

          {story ? (
            <View style={styles.settingsCard}>
              <View style={styles.settingsHeaderRow}>
                <Text style={styles.settingsTitle}>Story settings</Text>
                {savingSettings ? <ActivityIndicator size="small" color="#3345d1" /> : null}
              </View>
              <View style={styles.settingsActionsRow}>
                <TouchableOpacity style={styles.settingChip} onPress={() => updateStorySettings({ allowReplies: !story.allowReplies })}>
                  <Text style={styles.settingChipLabel}>{story.allowReplies ? "Replies on" : "Replies off"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.settingChip} onPress={() => updateStorySettings({ allowSharing: !story.allowSharing })}>
                  <Text style={styles.settingChipLabel}>{story.allowSharing ? "Sharing on" : "Sharing off"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.settingChip} onPress={cycleVisibility}>
                  <Text style={styles.settingChipLabel}>
                    Audience: {story.visibility === "close_friends" ? "Close friends" : story.visibility === "friends" ? "Friends" : "Public"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.loader}>
              <ActivityIndicator size="small" color="#3345d1" />
            </View>
          ) : errorMessage ? (
            <View style={styles.errorState}>
              <Text style={styles.errorTitle}>Story activity unavailable</Text>
              <Text style={styles.errorText}>{errorMessage}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={async () => {
                  try {
                    setLoading(true);
                    setErrorMessage("");
                    await load();
                  } catch (error) {
                    setErrorMessage(toUserSafeMessage(error));
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : activeTab === "replies" ? (
            <>
              <FlatList
                data={comments}
                keyExtractor={(item) => item.id}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={
                  replyTarget ? (
                    <View style={styles.replyingToRow}>
                      <Text style={styles.replyingToText}>Replying to @{replyTarget.user.username}</Text>
                      <TouchableOpacity onPress={() => setReplyTarget(null)}>
                        <Icon name="close" size={16} color="#4b5563" />
                      </TouchableOpacity>
                    </View>
                  ) : null
                }
                ListEmptyComponent={<Text style={styles.emptyState}>No replies yet.</Text>}
                renderItem={({ item }) => renderReplyCard(item)}
              />
              <View style={styles.composerWrap}>
                <View style={styles.composer}>
                  <TextInput
                    style={styles.input}
                    value={draft}
                    onChangeText={setDraft}
                    placeholder={replyTarget ? `Reply to @${replyTarget.user.username}` : "Send a reply"}
                    placeholderTextColor="#8b8b8b"
                    multiline
                  />
                  <TouchableOpacity disabled={!draft.trim() || submitting} onPress={onSubmit}>
                    <Text style={[styles.sendText, (!draft.trim() || submitting) && styles.sendTextDisabled]}>
                      Send
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          ) : activeTab === "views" ? (
            <FlatList<StoryViewerEntry>
              data={viewers}
              keyExtractor={(item) => item.user.id}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={<Text style={styles.emptyState}>No viewers yet.</Text>}
              renderItem={({ item }) => (
                <View style={styles.metricRow}>
                  <Image source={{ uri: item.user.avatarUrl }} style={styles.metricAvatar} />
                  <View style={styles.metricMeta}>
                    <Text style={styles.metricUser}>@{item.user.username}</Text>
                    <Text style={styles.metricTime}>Viewed {formatAgo(item.viewedAt)} ago</Text>
                  </View>
                  {item.liked ? <Icon name="heart" size={16} color="#ef476f" /> : null}
                </View>
              )}
            />
          ) : (
            <FlatList<SocialUser>
              data={likers}
              keyExtractor={(item) => item.id}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={<Text style={styles.emptyState}>No likes yet.</Text>}
              renderItem={({ item }) => (
                <View style={styles.metricRow}>
                  <Image source={{ uri: item.avatarUrl }} style={styles.metricAvatar} />
                  <View style={styles.metricMeta}>
                    <Text style={styles.metricUser}>@{item.username}</Text>
                    <Text style={styles.metricTime}>Liked this story</Text>
                  </View>
                  <Icon name="heart" size={16} color="#ef476f" />
                </View>
              )}
            />
          )}
          </View>
        </View>
      </KeyboardAvoidingView>
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
    minHeight: 480,
    maxHeight: "90%",
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
  summaryRow: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 12,
  },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ececec",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  summaryCardActive: {
    borderColor: "#c7d2fe",
    backgroundColor: "#eef2ff",
  },
  summaryTitle: { color: "#666", fontWeight: "600", fontSize: 12.5 },
  summaryValue: { color: "#111", fontSize: 20, fontWeight: "800", marginTop: 8 },
  settingsCard: {
    borderWidth: 1,
    borderColor: "#ececec",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    backgroundColor: "#fafafa",
  },
  settingsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  settingsTitle: { color: "#111", fontWeight: "800", fontSize: 14 },
  settingsActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  settingChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  settingChipLabel: { color: "#374151", fontWeight: "700", fontSize: 12.5 },
  loader: { paddingVertical: 24, alignItems: "center" },
  errorState: {
    paddingVertical: 40,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  errorTitle: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 16,
  },
  errorText: {
    marginTop: 8,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: "#3345d1",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  listContent: { paddingBottom: 100 },
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#ececec",
    paddingVertical: 12,
  },
  metricAvatar: { width: 42, height: 42, borderRadius: 21 },
  metricMeta: { marginLeft: 10, flex: 1 },
  metricUser: { color: "#111", fontWeight: "700" },
  metricTime: { color: "#777", marginTop: 2, fontSize: 12 },
  replyCard: { flexDirection: "row" },
  replyAvatar: { width: 36, height: 36, borderRadius: 18, marginTop: 2 },
  replyAvatarSmall: { width: 30, height: 30, borderRadius: 15, marginTop: 2 },
  replyBody: { marginLeft: 10, flex: 1 },
  replyHeaderRow: { flexDirection: "row", alignItems: "center" },
  replyUser: { fontWeight: "700", color: "#111", fontSize: 13.5 },
  replyTime: { marginLeft: 8, color: "#7a7a7a", fontSize: 11.5 },
  replyText: { color: "#1f1f1f", marginTop: 2, lineHeight: 19 },
  replyActionsRow: { flexDirection: "row", alignItems: "center", marginTop: 6, flexWrap: "wrap" },
  replyAction: { color: "#444", fontWeight: "600", marginRight: 14, fontSize: 12.5, marginBottom: 4 },
  deleteAction: { color: "#b91c1c" },
  likesText: { color: "#888", fontSize: 12 },
  threadButton: { marginTop: 6 },
  threadButtonText: { color: "#3345d1", fontWeight: "700", fontSize: 12.5 },
  threadWrap: {
    marginTop: 10,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderColor: "#e5e7eb",
  },
  threadRow: { marginBottom: 10 },
  replyingToRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  replyingToText: { color: "#374151", fontWeight: "600" },
  composerWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 14,
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 88,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#111827",
  },
  sendText: { color: "#3345d1", fontWeight: "700", paddingHorizontal: 12 },
  sendTextDisabled: { color: "#9ca3af" },
  emptyState: { textAlign: "center", color: "#6b7280", marginTop: 48 },
});

export default StoryActivitySheet;
