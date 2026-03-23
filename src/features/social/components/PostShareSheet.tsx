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
  const [busy, setBusy] = useState<"share" | "save" | null>(null);

  const shareToStory = async () => {
    if (!post || busy) {
      return;
    }

    try {
      setBusy("share");
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
            {busy === "share" ? <ActivityIndicator size="small" color="#111" /> : null}
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionRow} disabled={!!busy} onPress={toggleSave}>
            <Icon name={post?.saved ? "bookmark" : "bookmark-outline"} size={20} color="#111" />
            <Text style={styles.actionText}>{post?.saved ? "Remove from saved" : "Save"}</Text>
            {busy === "save" ? <ActivityIndicator size="small" color="#111" /> : null}
          </TouchableOpacity>

          <ShareTargetsList
            onSend={(target) => {
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
