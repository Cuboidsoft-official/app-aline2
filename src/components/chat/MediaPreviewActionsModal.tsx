import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
  ActivityIndicator,
  Alert,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { downloadImageAsset } from "../../utils/mediaDownload";
import { normalizeMediaUrl } from "../../utils/mediaUrls";

interface MediaPreviewActionsModalProps {
  visible: boolean;
  onClose: () => void;
  mediaUrl: string | null | undefined;
  fileName?: string | null;
}

export const MediaPreviewActionsModal: React.FC<MediaPreviewActionsModalProps> = ({
  visible,
  onClose,
  mediaUrl,
  fileName,
}) => {
  const [saving, setSaving] = useState(false);

  if (!visible) return null;

  const targetUrl = normalizeMediaUrl(mediaUrl || "");

  const handleSaveToGallery = async () => {
    if (!targetUrl) {
      Alert.alert("Error", "Media URL is unavailable.");
      return;
    }
    try {
      setSaving(true);
      await downloadImageAsset(targetUrl, fileName || "download");
      Alert.alert("Saved", "Media saved successfully.");
      onClose();
    } catch (error: any) {
      console.log("Save to gallery error:", error);
      const userMessage = String(error?.message || "Could not save to gallery.");
      if (!userMessage.toLowerCase().includes("cancel")) {
        Alert.alert("Error", userMessage);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (!targetUrl) {
      Alert.alert("Error", "Media URL is unavailable.");
      return;
    }
    try {
      await Share.share({
        title: fileName || "Share File",
        message: targetUrl,
        url: targetUrl,
      });
      onClose();
    } catch (error) {
      console.log("Share error:", error);
    }
  };

  return (
    <Modal
      visible={visible}
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
});
