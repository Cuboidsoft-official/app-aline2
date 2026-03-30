import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";

import { socialApi } from "../socialApi";
import { ContentKind, ReportReason } from "../types";
import { toUserSafeMessage } from "../validation";
import { getStoredUserId } from "../../../utils/authSession";

const reportReasons: ReportReason[] = [
  "spam",
  "violence",
  "harassment",
  "nudity",
  "hate_speech",
  "false_information",
  "other",
];

type ActionKind = "archive" | "not_interested" | "mute" | "block" | "report";

interface ContentActionSheetProps {
  visible: boolean;
  contentType: ContentKind;
  contentId: string;
  userId?: string;
  userLabel?: string;
  title?: string;
  onClose: () => void;
  onActionComplete?: (action: ActionKind) => void;
}

function ContentActionSheet({
  visible,
  contentType,
  contentId,
  userId,
  userLabel,
  title,
  onClose,
  onActionComplete,
}: ContentActionSheetProps) {
  const [note, setNote] = useState("");
  const [selectedReason, setSelectedReason] = useState<ReportReason>("spam");
  const [busyAction, setBusyAction] = useState<ActionKind | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");

  useEffect(() => {
    let active = true;

    const loadCurrentUserId = async () => {
      const nextUserId = await getStoredUserId();
      if (active) {
        setCurrentUserId(String(nextUserId || ""));
      }
    };

    loadCurrentUserId();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      setNote("");
      setSelectedReason("spam");
      setBusyAction(null);
    }
  }, [visible]);

  const runAction = async (action: ActionKind, runner: () => Promise<void>) => {
    if (busyAction) {
      return;
    }

    try {
      setBusyAction(action);
      await runner();
      if (action === "report") {
        Alert.alert("Reported", "Thanks for your report.");
      }
      onActionComplete?.(action);
      onClose();
    } catch (error) {
      Alert.alert("Action failed", toUserSafeMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  const displayTitle =
    title || (contentType === "story" ? "Story options" : contentType === "swipe" ? "Swipe options" : "Post options");
  const isOwner = !!userId && !!currentUserId && String(userId) === String(currentUserId);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheetWrap}>
        <View style={styles.handle} />
        <ScrollView style={styles.sheetContent} contentContainerStyle={styles.sheetContentInner}>
          <View style={styles.header}>
            <Text style={styles.title}>{displayTitle}</Text>
            <TouchableOpacity onPress={onClose}>
              <Icon name="close" size={20} color="#111" />
            </TouchableOpacity>
          </View>

          {isOwner && contentType === "post" ? (
            <TouchableOpacity
              style={styles.actionRow}
              disabled={!!busyAction}
              onPress={() => runAction("archive", () => socialApi.archivePost(contentId))}
            >
              <Icon name="archive-outline" size={20} color="#111" />
              <Text style={styles.actionText}>Archive post</Text>
              {busyAction === "archive" ? <ActivityIndicator size="small" color="#111" /> : null}
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={styles.actionRow}
                disabled={!!busyAction}
                onPress={() => runAction("not_interested", () => socialApi.markNotInterested(contentType, contentId))}
              >
                <Icon name="eye-off-outline" size={20} color="#111" />
                <Text style={styles.actionText}>Not interested</Text>
                {busyAction === "not_interested" ? <ActivityIndicator size="small" color="#111" /> : null}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionRow}
                disabled={!!busyAction || !userId}
                onPress={() => {
                  if (!userId) {
                    Alert.alert("Unavailable", "User action is not available for this item.");
                    return;
                  }
                  runAction("mute", () => socialApi.muteUser(userId));
                }}
              >
                <Icon name="volume-mute-outline" size={20} color="#111" />
                <Text style={styles.actionText}>Mute {userLabel ? `@${userLabel}` : "user"}</Text>
                {busyAction === "mute" ? <ActivityIndicator size="small" color="#111" /> : null}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionRow}
                disabled={!!busyAction || !userId}
                onPress={() => {
                  if (!userId) {
                    Alert.alert("Unavailable", "User action is not available for this item.");
                    return;
                  }
                  runAction("block", () => socialApi.blockUser(userId));
                }}
              >
                <Icon name="ban-outline" size={20} color="#b91c1c" />
                <Text style={[styles.actionText, styles.dangerText]}>Block {userLabel ? `@${userLabel}` : "user"}</Text>
                {busyAction === "block" ? <ActivityIndicator size="small" color="#b91c1c" /> : null}
              </TouchableOpacity>

              <Text style={styles.reportTitle}>Report {contentType}</Text>
              <View style={styles.reasonWrap}>
                {reportReasons.map((reason) => (
                  <TouchableOpacity
                    key={reason}
                    style={[styles.reasonPill, selectedReason === reason && styles.reasonPillSelected]}
                    disabled={!!busyAction}
                    onPress={() => setSelectedReason(reason)}
                  >
                    <Text style={[styles.reasonText, selectedReason === reason && styles.reasonTextSelected]}>
                      {reason.replace("_", " ")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={styles.noteInput}
                placeholder="Additional context (optional)"
                placeholderTextColor="#8a8a8a"
                value={note}
                onChangeText={setNote}
                editable={!busyAction}
                multiline
                maxLength={500}
              />

              <TouchableOpacity
                style={[styles.reportButton, !!busyAction && styles.reportButtonDisabled]}
                disabled={!!busyAction}
                onPress={() =>
                  runAction("report", () => socialApi.reportContent(contentType, contentId, selectedReason, note))
                }
              >
                <Text style={styles.reportButtonText}>Submit report</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
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
  sheetContent: { flex: 1 },
  sheetContentInner: { paddingHorizontal: 16, paddingBottom: 24 },
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
  dangerText: { color: "#b91c1c" },
  reportTitle: { marginTop: 16, marginBottom: 10, color: "#111827", fontWeight: "800" },
  reasonWrap: { flexDirection: "row", flexWrap: "wrap" },
  reasonPill: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  reasonPillSelected: { borderColor: "#3345d1", backgroundColor: "#eef2ff" },
  reasonText: { color: "#4b5563", fontSize: 12.5 },
  reasonTextSelected: { color: "#3345d1", fontWeight: "700" },
  noteInput: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
    color: "#111827",
  },
  reportButton: {
    marginTop: 12,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#111827",
    justifyContent: "center",
    alignItems: "center",
  },
  reportButtonDisabled: { opacity: 0.6 },
  reportButtonText: { color: "#fff", fontWeight: "700" },
});

export default ContentActionSheet;
