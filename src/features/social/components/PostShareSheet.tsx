import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Alert } from "../../../utils/appAlert";
import Icon from "react-native-vector-icons/Ionicons";

import ShareTargetsList, { ShareTarget } from "./ShareTargetsList";
import { socialApi } from "../socialApi";
import { Post } from "../types";
import { toUserSafeMessage } from "../validation";
import { createChatConversation, sendChatMessage } from "../../../utils/chatApi";
import { buildSharedPostMessage } from "../../../utils/chatPresentation";
import { shareContentLink } from "../../../utils/shareLinks";
import { appConfig } from "../../../config/env";
import { API } from "../../../api/api";

interface PostShareSheetProps {
  visible: boolean;
  post: Post | null;
  onClose: () => void;
  onPostUpdate: (post: Post) => void;
  onOpenStoryComposer: (post: Post) => void;
}

function PostShareSheet({
  visible,
  post,
  onClose,
  onPostUpdate,
  onOpenStoryComposer,
}: PostShareSheetProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedTargets, setSelectedTargets] = useState<ShareTarget[]>([]);

  useEffect(() => {
    if (!visible) {
      setSelectedTargets([]);
    }
  }, [visible]);

  const buildPostShareUrl = (targetPost: Post) => {
    const shareBase = (appConfig.publicShareBaseUrl || "https://aline2.com").replace(/\/+$/, "");
    const profileSlug =
      targetPost.user.username || targetPost.user.id || (targetPost.user as any)?._id || "";

    if (!profileSlug) {
      return shareBase;
    }

    const query = targetPost.id ? `?post=${encodeURIComponent(String(targetPost.id))}` : "";
    return `${shareBase}/profile/${encodeURIComponent(String(profileSlug))}${query}`;
  };

  const selectedTargetIds = useMemo(
    () => selectedTargets.map((target) => target.id),
    [selectedTargets],
  );

  const toggleTarget = (target: ShareTarget) => {
    setSelectedTargets((current) =>
      current.some((item) => item.id === target.id)
        ? current.filter((item) => item.id !== target.id)
        : [...current, target],
    );
  };

  const shareToStory = async () => {
    if (!post || busy) {
      return;
    }

    try {
      setBusy("story");
      const updated = await socialApi.sharePost(post.id);
      onPostUpdate(updated);
      onClose();
      onOpenStoryComposer(updated);
    } catch (error) {
      Alert.alert("Could not share post", toUserSafeMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const shareExternally = async () => {
    if (!post || busy) {
      return;
    }

    try {
      setBusy("external");
      await shareContentLink({
        originalUrl: buildPostShareUrl(post),
        title: `${post.user.username}'s post`,
        description: post.caption || "",
        fallbackMessage: `Check out @${post.user.username}'s post on Aline2`,
      });
      onClose();
    } catch (error) {
      Alert.alert("Could not share link", toUserSafeMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const toggleSave = async () => {
    if (!post || busy) {
      return;
    }

    try {
      setBusy("save");
      const updated = await socialApi.togglePostSave(post.id);
      onPostUpdate(updated);
      onClose();
    } catch (error) {
      Alert.alert("Could not save post", toUserSafeMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const shareToSelectedUsers = async () => {
    if (!post || busy || !selectedTargets.length) {
      return;
    }

    try {
      setBusy("send");
      const shareMessage = buildSharedPostMessage(post);
      const sendResults = await Promise.allSettled(
        selectedTargets.map(async (target) => {
          const conversation = await createChatConversation({
            receiverId: target.id,
            conversationType: "direct",
          });

          const conversationId = conversation?.conversation?._id;
          if (!conversationId) {
            throw new Error(`Could not open a conversation with @${target.username}.`);
          }

          await sendChatMessage({
            conversationId,
            text: shareMessage,
          });

          await API.post(`/posts/${post.id}/share`, {
            shareType: "conversation",
            conversationId,
          }).catch((error) => {
            console.log("post share count update error:", error);
          });

          return target;
        }),
      );

      const successCount = sendResults.filter((result) => result.status === "fulfilled").length;
      const failedCount = sendResults.length - successCount;

      if (!successCount) {
        const firstFailure = sendResults.find((result) => result.status === "rejected");
        throw firstFailure?.status === "rejected" ? firstFailure.reason : new Error("Could not send post.");
      }

      onPostUpdate({
        ...post,
        sharesCount: post.sharesCount + successCount,
      });

      if (failedCount > 0) {
        Alert.alert("Partially sent", `Sent to ${successCount} people. ${failedCount} failed.`);
      } else {
        Alert.alert("Sent", `Post sent to ${successCount} ${successCount === 1 ? "person" : "people"}.`);
      }

      setSelectedTargets([]);
      onClose();
    } catch (error) {
      Alert.alert("Could not send post", toUserSafeMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheetWrap}>
        <View style={styles.handle} />
        <View style={styles.sheetContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Share</Text>
            <TouchableOpacity onPress={onClose}>
              <Icon name="close" size={20} color="#111" />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>Choose people first, then use the other share options below.</Text>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <View style={styles.peoplePanel}>
              <View style={styles.peopleHeader}>
                <Text style={styles.sectionTitle}>People</Text>
                <Text style={styles.sectionMeta}>
                  {selectedTargets.length ? `${selectedTargets.length} selected` : "Tap profiles to select"}
                </Text>
              </View>

              <ShareTargetsList
                title="Send to"
                selectedTargetIds={selectedTargetIds}
                onToggleTarget={toggleTarget}
                scrollEnabled={false}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.sendButton,
                (!selectedTargets.length || !!busy) && styles.sendButtonDisabled,
              ]}
              disabled={!selectedTargets.length || !!busy}
              onPress={shareToSelectedUsers}
            >
              {busy === "send" ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.sendButtonText}>
                  {selectedTargets.length ? `Send to ${selectedTargets.length}` : "Select people"}
                </Text>
              )}
            </TouchableOpacity>

            <View style={styles.actionsPanel}>
              <Text style={styles.sectionTitle}>Other options</Text>

              <TouchableOpacity style={styles.actionRow} disabled={!!busy} onPress={shareToStory}>
                <Icon name="sparkles-outline" size={20} color="#111" />
                <Text style={styles.actionText}>Add to your story</Text>
                {busy === "story" ? <ActivityIndicator size="small" color="#111" /> : null}
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionRow} disabled={!!busy} onPress={shareExternally}>
                <Icon name="share-social-outline" size={20} color="#111" />
                <Text style={styles.actionText}>Share externally</Text>
                {busy === "external" ? <ActivityIndicator size="small" color="#111" /> : null}
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionRow} disabled={!!busy} onPress={toggleSave}>
                <Icon name={post?.saved ? "bookmark" : "bookmark-outline"} size={20} color="#111" />
                <Text style={styles.actionText}>{post?.saved ? "Remove from saved" : "Save"}</Text>
                {busy === "save" ? <ActivityIndicator size="small" color="#111" /> : null}
              </TouchableOpacity>
            </View>
          </ScrollView>
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
    minHeight: 220,
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
  sheetContent: { paddingHorizontal: 16, paddingBottom: 24, minHeight: 520, maxHeight: "86%" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "800", color: "#111827" },
  subtitle: {
    color: "#6b7280",
    fontSize: 12.5,
    marginBottom: 12,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  peoplePanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: "#fafafa",
  },
  peopleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  sectionMeta: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "600",
  },
  actionsPanel: {
    marginTop: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 4,
    backgroundColor: "#fff",
  },
  actionRow: {
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
  },
  actionText: { marginLeft: 12, marginRight: "auto", color: "#111827", fontWeight: "600", fontSize: 14 },
  sendButton: {
    marginTop: 14,
    minHeight: 48,
    borderRadius: 18,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  sendButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
});

export default PostShareSheet;
