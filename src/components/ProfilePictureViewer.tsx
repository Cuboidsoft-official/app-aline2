import React from "react";
import {
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";

import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";

type ProfilePictureViewerProps = {
  visible: boolean;
  imageUri?: string | null;
  name?: string | null;
  onClose: () => void;
};

const getInitial = (value?: string | null) =>
  (String(value || "").trim().charAt(0) || "A").toUpperCase();

function ProfilePictureViewer({
  visible,
  imageUri,
  name,
  onClose,
}: ProfilePictureViewerProps) {
  const resolvedUri = imageUri || DEFAULT_AVATAR_URL;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.closeRow}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Icon name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.viewer}
          activeOpacity={1}
          onPress={(event) => event.stopPropagation()}
        >
          {resolvedUri ? (
            <Image source={{ uri: resolvedUri }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>{getInitial(name)}</Text>
            </View>
          )}
        </TouchableOpacity>

        {!!name && <Text style={styles.name} numberOfLines={1}>{name}</Text>}
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  closeRow: {
    position: "absolute",
    top: 54,
    right: 22,
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  viewer: {
    width: 270,
    height: 270,
    borderRadius: 135,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.28)",
    overflow: "hidden",
    backgroundColor: "#111827",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1F2937",
  },
  placeholderText: {
    color: "#FFFFFF",
    fontSize: 92,
    fontWeight: "900",
  },
  name: {
    marginTop: 22,
    maxWidth: "88%",
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
});

export default ProfilePictureViewer;
