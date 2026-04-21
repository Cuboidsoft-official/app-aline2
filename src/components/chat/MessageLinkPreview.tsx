import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../../theme/AppThemeContext";
import { normalizeMediaUrl } from "../../utils/mediaUrls";

type LinkPreview = {
  url?: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  hostname?: string;
};

type MessageLinkPreviewProps = {
  preview: LinkPreview | null | undefined;
  isMine?: boolean;
  onPress?: () => void;
};

const MessageLinkPreview = ({ preview, isMine = false, onPress }: MessageLinkPreviewProps) => {
  const { colors } = useAppTheme();
  if (!preview?.url) {
    return null;
  }

  const imageUrl = normalizeMediaUrl(preview.image || "");
  const borderColor = isMine ? "rgba(255,255,255,0.24)" : colors.border;
  const titleColor = isMine ? "#fff" : colors.text;
  const metaColor = isMine ? "rgba(255,255,255,0.72)" : colors.mutedText || colors.placeholder;

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={onPress}
      style={[
        styles.card,
        {
          borderColor,
          backgroundColor: isMine ? "rgba(255,255,255,0.12)" : colors.card,
        },
      ]}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
      ) : null}

      <View style={styles.body}>
        <View style={styles.siteRow}>
          <Icon name="link-outline" size={14} color={metaColor} />
          <Text style={[styles.siteName, { color: metaColor }]} numberOfLines={1}>
            {preview.siteName || preview.hostname || preview.url}
          </Text>
        </View>

        {!!preview.title ? (
          <Text style={[styles.title, { color: titleColor }]} numberOfLines={2}>
            {preview.title}
          </Text>
        ) : null}

        {!!preview.description ? (
          <Text style={[styles.description, { color: metaColor }]} numberOfLines={3}>
            {preview.description}
          </Text>
        ) : null}

        <Text style={[styles.url, { color: metaColor }]} numberOfLines={1}>
          {preview.url}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export default MessageLinkPreview;

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: 138,
  },
  body: {
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  siteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  siteName: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  title: {
    marginTop: 7,
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: "800",
  },
  description: {
    marginTop: 5,
    fontSize: 12.5,
    lineHeight: 17,
  },
  url: {
    marginTop: 7,
    fontSize: 11.5,
  },
});
