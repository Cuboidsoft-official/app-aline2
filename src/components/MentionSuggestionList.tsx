import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { normalizeMediaUrl } from "../utils/mediaUrls";
import { MentionCandidate } from "../utils/mentionComposer";

type MentionSuggestionListProps = {
  visible: boolean;
  candidates: MentionCandidate[];
  onSelect: (candidate: MentionCandidate) => void;
};

export default function MentionSuggestionList({ visible, candidates, onSelect }: MentionSuggestionListProps) {
  if (!visible || !candidates.length) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      {candidates.slice(0, 5).map((candidate) => (
        <TouchableOpacity
          key={`${candidate.id}-${candidate.username}`}
          style={styles.row}
          activeOpacity={0.84}
          onPress={() => onSelect(candidate)}
        >
          <Image
            source={{ uri: normalizeMediaUrl(candidate.avatarUrl || DEFAULT_AVATAR_URL) }}
            style={styles.avatar}
          />
          <View style={styles.body}>
            <Text style={styles.username} numberOfLines={1}>@{candidate.username}</Text>
            <Text style={styles.name} numberOfLines={1}>{candidate.name || "Aline2 user"}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#dbe3ef",
    overflow: "hidden",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#e5e7eb",
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  username: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "800",
  },
  name: {
    color: "#6b7280",
    fontSize: 11.5,
    marginTop: 1,
  },
});
