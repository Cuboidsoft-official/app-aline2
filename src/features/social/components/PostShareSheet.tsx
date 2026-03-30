import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";

import ShareTargetsList from "./ShareTargetsList";
import { socialApi } from "../socialApi";
import { Post } from "../types";
import { toUserSafeMessage } from "../validation";
import { createChatConversation, sendChatMessage } from "../../../utils/chatApi";
import { createShortShareUrl, shareContentLink } from "../../../utils/shareLinks";
import { appConfig } from "../../../config/env";

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

  const buildPostShareUrl = (targetPost: Post) => {
    if (!appConfig.publicShareBaseUrl) {
      return "";
    }

    return `${appConfig.publicShareBaseUrl.replace(/\/+$/, "")}/post/${targetPost.id}`;
  };

  const buildPostShareMessage = async (targetPost: Post) => {
    const originalUrl = buildPostShareUrl(targetPost);
    const shortUrl = originalUrl
      ? await createShortShareUrl({
          originalUrl,
          title: `${targetPost.user.username}'s post`,
          description: targetPost.caption || "",
        })
      : null;

    const header = targetPost.caption
      ? `Check out @${targetPost.user.username}'s post on Aline2:\n\n${targetPost.caption}`
      : `Check out @${targetPost.user.username}'s post on Aline2.`;

    return [header, shortUrl || originalUrl].filter(Boolean).join("\n\n");
  };

  const shareToStory = async () => {
    if (!post || busy) {
      return;
    }

    try {
      setBusy("story");
      onClose();
      onOpenStoryComposer(post);
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

          <ShareTargetsList
            onSend={async (target) => {
              if (!post) {
                return;
              }

              const conversation = await createChatConversation({
                receiverId: target.id,
                conversationType: "direct",
              });

              const conversationId = conversation?.conversation?._id;
              if (!conversationId) {
                throw new Error("Could not open a conversation with this user.");
              }

              await sendChatMessage({
                conversationId,
                text: await buildPostShareMessage(post),
              });

              Alert.alert("Sent", `Post sent to @${target.username}.`);
              onClose();
            }}
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
  sheetContent: { paddingHorizontal: 16, paddingBottom: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "800", color: "#111827" },
  actionRow: {
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
  },
  actionText: { marginLeft: 12, marginRight: "auto", color: "#111827", fontWeight: "600", fontSize: 14 },
});

export default PostShareSheet;
