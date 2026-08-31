import React, { useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Share,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { GallerySaveError, saveCapturedImageToGallery, saveMediaToGallery } from "../../utils/mediaDownload";

import { normalizeMediaUrl } from "../../utils/mediaUrls";
import ShareTargetsList, {
  ShareTarget,
} from "../../features/social/components/ShareTargetsList";
import {
  createChatConversation,
  sendChatMessage,
} from "../../utils/chatApi";
import Clipboard from "@react-native-clipboard/clipboard";
import { buildWhatsAppShareUrl, getChatMediaMessageType } from "../../utils/chatMediaShare";

interface MediaPreviewActionsModalProps {
  visible: boolean;
  onClose: () => void;
  mediaUrl: string | null | undefined;
  fileName?: string | null;
  mediaType?: "image" | "video";
  captureImage?: () => Promise<string>;
  onAddToStory?: () => void;
}

export const MediaPreviewActionsModal: React.FC<MediaPreviewActionsModalProps> = ({
  visible,
  onClose,
  mediaUrl,
  fileName,
  mediaType,
  captureImage,
  onAddToStory,
}) => {
  const [saving, setSaving] = useState(false);
  const [showAlineShare, setShowAlineShare] = useState(false);
  const [selectedTargets, setSelectedTargets] = useState<ShareTarget[]>([]);
  const [sharing, setSharing] = useState(false);

  if (!visible) return null;

  const targetUrl = normalizeMediaUrl(mediaUrl || "");
  const toggleTarget = (target: ShareTarget) => {
    setSelectedTargets((current) =>
      current.some((item) => item.key === target.key)
        ? current.filter((item) => item.key !== target.key)
        : [...current, target]
    );
  };
  const handleSendToUsers = async () => {
    if (!selectedTargets.length || sharing || !targetUrl) {
      return;
    }

    try {
      setSharing(true);

      const results = await Promise.allSettled(
        selectedTargets.map(async (target) => {
          const conversationId = String(
            (
              await createChatConversation({
                receiverId: target.id,
                conversationType: "direct",
              })
            )?.conversation?._id || ""
          );

          if (!conversationId) {
            throw new Error(
              `Could not open chat with ${target.name || "this user"}`
            );
          }

          await sendChatMessage({
            conversationId,
            text: "",
            mediaUrl: targetUrl,
            messageType: getChatMediaMessageType(targetUrl),
          });
        })
      );

      const successCount = results.filter(
        (result) => result.status === "fulfilled"
      ).length;

      if (!successCount) {
        throw new Error("Could not send the media.");
      }

      Alert.alert(
        "Sent",
        `Media sent to ${successCount} ${successCount === 1 ? "person" : "people"
        }.`
      );

      setSelectedTargets([]);
      setShowAlineShare(false);
      onClose();
    } catch (error: any) {
      console.log("In-app media share error:", error);

      Alert.alert(
        "Could not share",
        error?.message || "Unable to send this media."
      );
    } finally {
      setSharing(false);
    }
  };

  const handleSaveToGallery = async () => {
    if (!targetUrl) {
      Alert.alert("Error", "Media URL is unavailable.");
      return;
    }

    const permissionPromptTitle = "Access needed";
    const permissionPromptMessage =
      Platform.OS === "ios"
        ? "Allow Photos access so Aline2 can save this media to your library."
        : "Allow Files and media access so Aline2 can save this image or video to your device.";

    try {
      setSaving(true);
      if (mediaType === "image" && captureImage) {
        // Skip the network download entirely for images that are already
        // rendered on screen — capture the visible <Image> instead.
        await saveCapturedImageToGallery(captureImage);
      } else {
        await saveMediaToGallery(targetUrl, fileName || "aline2_post");
      }
      Alert.alert("Saved", "Media saved successfully to your Gallery.");
      onClose();
    } catch (error: any) {
      console.error("Save to Gallery error:", error?.code, error?.message, error);
      const message = error?.message || "Could not save media to your Gallery.";

      if (error instanceof GallerySaveError && error.code === "permission") {
        Alert.alert(permissionPromptTitle, permissionPromptMessage, [
          { text: "Cancel", style: "cancel" },
          {
            text: "Open Settings",
            onPress: () => {
              Linking.openSettings().catch(() => {
                Alert.alert(
                  "Settings unavailable",
                  "Please enable Photos or Files and media access in your device settings.",
                );
              });
            },
          },
        ]);
        return;
      }

      if (error instanceof GallerySaveError && ["download", "network", "timeout"].includes(error.code)) {
        Alert.alert("Error", message, [
          { text: "Cancel", style: "cancel" },
          { text: "Retry", onPress: () => handleSaveToGallery() },
        ]);
        return;
      }

      Alert.alert("Error", message);
    } finally {
      setSaving(false);
    }
  };

  const handleShare = () => {
    if (!targetUrl) {
      Alert.alert("Error", "Media URL is unavailable.");
      return;
    }

    setShowAlineShare(true);
  };

  const handleExternalShare = async () => {
    try {
      await Share.share({ title: "Share media", message: targetUrl, url: targetUrl });
    } catch (error) {
      console.log("External media share error:", error);
    }
  };

  const handleWhatsAppShare = async () => {
    const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(targetUrl)}`;
    try {
      if (await Linking.canOpenURL(whatsappUrl)) {
        await Linking.openURL(whatsappUrl);
      } else {
        await Linking.openURL(buildWhatsAppShareUrl(targetUrl));
      }
    } catch {
      Alert.alert("WhatsApp unavailable", "WhatsApp could not be opened on this device.");
    }
  };

  const handleCopyLink = async () => {
    await Clipboard.setString(targetUrl);
    Alert.alert("Copied", "Media link copied to clipboard.");
  };

  return (
    <>
      <Modal
        visible={visible && !showAlineShare}
        transparent
        animationType="slide"
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        >
          <TouchableOpacity activeOpacity={1} style={styles.sheetContainer}>
            <View style={styles.handleBar} />

            {/* Save to Gallery Option */}
            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleSaveToGallery}
              disabled={saving}
            >
              <View style={[styles.iconWrap, { backgroundColor: "#E6F4EA" }]}>
                {saving ? (
                  <ActivityIndicator size="small" color="#10B981" />
                ) : (
                  <Icon name="download-outline" size={22} color="#10B981" />
                )}
              </View>
              <View style={styles.textWrap}>
                <Text style={styles.actionTitle}>Save to Gallery</Text>
                <Text style={styles.actionSubtitle}>Download and save to your device</Text>
              </View>
              <Icon name="download-outline" size={20} color="#10B981" />
            </TouchableOpacity>

            {/* Share Option */}
            <TouchableOpacity style={styles.actionRow} onPress={handleShare}>
              <View style={[styles.iconWrap, { backgroundColor: "#E8F0FE" }]}>
                <Icon name="share-social-outline" size={22} color="#3B82F6" />
              </View>
              <View style={styles.textWrap}>
                <Text style={styles.actionTitle}>Share</Text>
                <Text style={styles.actionSubtitle}>Share this file with others</Text>
              </View>
              <Icon name="chevron-forward-outline" size={20} color="#3B82F6" />
            </TouchableOpacity>

            {/* Cancel Button */}
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showAlineShare}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAlineShare(false)}
      >
        <View style={styles.shareOverlay}>
          <View style={styles.shareSheet}>

            {/* Handle */}
            <View style={styles.shareHandle} />

            {/* Search / title area */}
            <View style={styles.shareHeader}>
              <Text style={styles.shareTitle}>
                Share
              </Text>

              <TouchableOpacity
                onPress={() => setShowAlineShare(false)}
              >
                <Icon
                  name="close"
                  size={24}
                  color="#111827"
                />
              </TouchableOpacity>
            </View>

            {/* Users */}
            <View style={styles.sharePeopleContainer}>
              <ShareTargetsList
                title=""
                selectedTargetIds={selectedTargets.map(
                  (target) => target.key
                )}
                onToggleTarget={toggleTarget}
                scrollEnabled={true}
              />
            </View>

            {/* Send */}
            <TouchableOpacity
              style={[
                styles.shareSendButton,
                !selectedTargets.length &&
                styles.shareSendButtonDisabled,
              ]}
              disabled={!selectedTargets.length || sharing}
              onPress={handleSendToUsers}
            >
              {sharing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.shareSendText}>
                  {selectedTargets.length
                    ? `Send to ${selectedTargets.length}`
                    : "Select people"}
                </Text>
              )}
            </TouchableOpacity>

            {/* Other share options */}
            <View style={styles.externalActions}>

              <TouchableOpacity style={styles.externalAction} onPress={onAddToStory} disabled={!onAddToStory}>
                <View style={styles.externalActionIcon}>
                  <Icon
                    name="add-circle-outline"
                    size={22}
                    color="#111827"
                  />
                </View>
                <Text style={styles.externalActionText}>
                  Add to Story
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.externalAction} onPress={handleExternalShare}>
                <Icon name="share-social-outline" size={25} />
                <Text>Share</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.externalAction} onPress={handleWhatsAppShare}>
                <Icon name="logo-whatsapp" size={25} />
                <Text>WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.externalAction} onPress={handleCopyLink}>
                <Icon name="link-outline" size={25} />
                <Text>Copy Link</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.externalAction} onPress={handleWhatsAppShare}>
                <Icon name="logo-whatsapp" size={25} />
                <Text>WhatsApp Status</Text>
              </TouchableOpacity>

            </View>

          </View>
        </View>
      </Modal>
    </>
  );
};

export default MediaPreviewActionsModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F1F5F9",
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  textWrap: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  actionSubtitle: {
    fontSize: 12.5,
    color: "#64748B",
    marginTop: 2,
  },
  cancelButton: {
    marginTop: 20,
    backgroundColor: "#F1F5F9",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#334155",
  },
  shareOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },

  shareSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: 25,
    maxHeight: "92%",
  },

  shareHandle: {
    width: 42,
    height: 4,
    borderRadius: 4,
    backgroundColor: "#9CA3AF",
    alignSelf: "center",
    marginBottom: 15,
  },

  shareHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },

  shareTitle: {
    fontSize: 21,
    fontWeight: "700",
    color: "#111827",
  },

  sharePeopleContainer: {
    minHeight: 300,
    maxHeight: 480,
  },

  shareSendButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: "#7B3FE4",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },

  shareSendButtonDisabled: {
    backgroundColor: "#CBD5E1",
  },

  shareSendText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  externalActions: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },

  externalAction: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 2,
  },

  externalActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },

  externalActionText: {
    fontSize: 10,
    lineHeight: 13,
    textAlign: "center",
    color: "#374151",
    maxWidth: 62,
  },
});
