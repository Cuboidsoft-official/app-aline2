import React from "react";
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface ShareTarget {
  id: string;
  username: string;
  name: string;
  avatarUrl: string;
}

const mockTargets: ShareTarget[] = [
  {
    id: "share_u1",
    username: "maya.stone",
    name: "Maya",
    avatarUrl: "https://randomuser.me/api/portraits/women/12.jpg",
  },
  {
    id: "share_u2",
    username: "noah.k",
    name: "Noah",
    avatarUrl: "https://randomuser.me/api/portraits/men/32.jpg",
  },
  {
    id: "share_u3",
    username: "zara.lee",
    name: "Zara",
    avatarUrl: "https://randomuser.me/api/portraits/women/25.jpg",
  },
  {
    id: "share_u4",
    username: "dev.ryan",
    name: "Ryan",
    avatarUrl: "https://randomuser.me/api/portraits/men/18.jpg",
  },
  {
    id: "share_u5",
    username: "ava.m",
    name: "Ava",
    avatarUrl: "https://randomuser.me/api/portraits/women/45.jpg",
  },
];

interface ShareTargetsListProps {
  onSend: (target: ShareTarget) => void;
}

function ShareTargetsList({ onSend }: ShareTargetsListProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Send to</Text>
      <FlatList
        data={mockTargets}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.username} numberOfLines={1}>
              @{item.username}
            </Text>
            <TouchableOpacity style={styles.sendButton} onPress={() => onSend(item)}>
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 12 },
  title: { color: "#111827", fontWeight: "700", fontSize: 13, marginBottom: 10 },
  listContent: { paddingRight: 8 },
  card: {
    width: 92,
    marginRight: 10,
    alignItems: "center",
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#e5e7eb",
  },
  name: { marginTop: 8, color: "#111827", fontWeight: "700", fontSize: 12.5 },
  username: { marginTop: 2, color: "#6b7280", fontSize: 11.5 },
  sendButton: {
    marginTop: 8,
    minWidth: 62,
    height: 30,
    borderRadius: 999,
    backgroundColor: "#111827",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  sendButtonText: { color: "#fff", fontWeight: "700", fontSize: 12 },
});

export default ShareTargetsList;
