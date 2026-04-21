import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Alert } from "../../../utils/appAlert";
import Icon from "react-native-vector-icons/Ionicons";

import { socialApi } from "../socialApi";
import { ContentKind, ReportReason } from "../types";
import { toUserSafeMessage } from "../validation";
import { getStoredUserId } from "../../../utils/authSession";
import { useAppTheme } from "../../../theme/AppThemeContext";
import DraggableBottomSheet from "../../../components/DraggableBottomSheet";

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
  const { colors } = useAppTheme();
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
  const canModerateUser = Boolean(userId);

  return (
    <DraggableBottomSheet visible={visible} onClose={onClose} snapPoints={[0.44, 0.7, 0.88]}>
      <ScrollView style={styles.sheetContent} contentContainerStyle={styles.sheetContentInner}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>{displayTitle}</Text>
          <TouchableOpacity onPress={onClose}>
            <Icon name="close" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        {isOwner && contentType === "post" ? (
          <TouchableOpacity
            style={[styles.actionRow, { borderColor: colors.border }]}
            disabled={!!busyAction}
            onPress={() => runAction("archive", () => socialApi.archivePost(contentId))}
          >
            <Icon name="archive-outline" size={20} color={colors.text} />
            <Text style={[styles.actionText, { color: colors.text }]}>Archive post</Text>
            {busyAction === "archive" ? <ActivityIndicator size="small" color={colors.text} /> : null}
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.actionRow, { borderColor: colors.border }]}
              disabled={!!busyAction}
              onPress={() => runAction("not_interested", () => socialApi.markNotInterested(contentType, contentId))}
            >
              <Icon name="eye-off-outline" size={20} color={colors.text} />
              <Text style={[styles.actionText, { color: colors.text }]}>Not interested</Text>
              {busyAction === "not_interested" ? <ActivityIndicator size="small" color={colors.text} /> : null}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionRow, { borderColor: colors.border }]}
              disabled={!!busyAction || !canModerateUser}
              onPress={() => {
                if (!userId) {
                  return;
                }
                runAction("mute", () => socialApi.muteUser(userId));
              }}
            >
              <Icon name="volume-mute-outline" size={20} color={colors.text} />
              <Text style={[styles.actionText, { color: colors.text }]}>Mute {userLabel ? `@${userLabel}` : "user"}</Text>
              {busyAction === "mute" ? <ActivityIndicator size="small" color={colors.text} /> : null}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionRow, { borderColor: colors.border }]}
              disabled={!!busyAction || !canModerateUser}
              onPress={() => {
                if (!userId) {
                  return;
                }
                runAction("block", () => socialApi.blockUser(userId));
              }}
            >
              <Icon name="ban-outline" size={20} color="#b91c1c" />
              <Text style={[styles.actionText, styles.dangerText]}>Block {userLabel ? `@${userLabel}` : "user"}</Text>
              {busyAction === "block" ? <ActivityIndicator size="small" color="#b91c1c" /> : null}
            </TouchableOpacity>

            {!canModerateUser ? (
              <Text style={[styles.helperText, { color: colors.mutedText }]}>
                User moderation options are unavailable for this item until its owner details finish syncing.
              </Text>
            ) : null}

            <Text style={[styles.reportTitle, { color: colors.text }]}>Report {contentType}</Text>
            <View style={styles.reasonWrap}>
              {reportReasons.map((reason) => {
                const selected = selectedReason === reason;

                return (
                  <TouchableOpacity
                    key={reason}
                    style={[
                      styles.reasonPill,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                      selected && { borderColor: colors.primary, backgroundColor: `${colors.primary}18` },
                    ]}
                    disabled={!!busyAction}
                    onPress={() => setSelectedReason(reason)}
                  >
                    <Text style={[styles.reasonText, { color: selected ? colors.primary : colors.mutedText }, selected && styles.reasonTextSelected]}>
                      {reason.replace("_", " ")}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={[styles.noteInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Additional context (optional)"
              placeholderTextColor={colors.placeholder}
              value={note}
              onChangeText={setNote}
              editable={!busyAction}
              multiline
              maxLength={500}
            />

            <TouchableOpacity
              style={[styles.reportButton, { backgroundColor: colors.primary }, !!busyAction && styles.reportButtonDisabled]}
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
    </DraggableBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetContent: { flex: 1 },
  sheetContentInner: { paddingHorizontal: 16, paddingBottom: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "800" },
  actionRow: {
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
  },
  actionText: { marginLeft: 12, marginRight: "auto", fontWeight: "600", fontSize: 14 },
  dangerText: { color: "#b91c1c" },
  helperText: { marginTop: 8, fontSize: 13, lineHeight: 18 },
  reportTitle: { marginTop: 16, marginBottom: 10, fontWeight: "800" },
  reasonWrap: { flexDirection: "row", flexWrap: "wrap" },
  reasonPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  reasonText: { fontSize: 12.5 },
  reasonTextSelected: { fontWeight: "700" },
  noteInput: {
    minHeight: 90,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
  },
  reportButton: {
    marginTop: 12,
    height: 46,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  reportButtonDisabled: { opacity: 0.6 },
  reportButtonText: { color: "#fff", fontWeight: "700" },
});

export default ContentActionSheet;
