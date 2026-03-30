import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { API } from "../../../api/api";
import { SocialUser } from "../types";
import { getStoredUserId } from "../../../utils/authSession";

interface ShareTarget {
  id: string;
  username: string;
  name: string;
  avatarUrl: string;
  isVerified?: boolean;
}

interface ShareTargetsListProps {
  onSend: (target: ShareTarget) => Promise<void> | void;
}

function ShareTargetsList({ onSend }: ShareTargetsListProps) {
  const [targets, setTargets] = useState<ShareTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingTargetId, setSendingTargetId] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadTargets = async () => {
      try {
        setLoading(true);
        const [res, currentUserId] = await Promise.all([
          API.get("/auth/users"),
          getStoredUserId(),
        ]);
        const users = Array.isArray(res?.data?.users) ? res.data.users : [];

        if (!mounted) {
          return;
        }

        const nextTargets = users
          .map((user: SocialUser & { _id?: string; profilePic?: string; profileImage?: string }) => ({
            id: String(user?.id || user?._id || ""),
            username: String(user?.username || "").trim(),
            name: String(user?.name || user?.username || "User").trim(),
            avatarUrl: String(user?.avatarUrl || user?.profilePic || user?.profileImage || "").trim(),
            isVerified: !!user?.isVerified,
          }))
          .filter((user: ShareTarget) => user.id && user.username && user.id !== String(currentUserId || ""));

        setTargets(nextTargets);
      } catch (error) {
        console.log("share targets load error:", error);
        if (mounted) {
          setTargets([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadTargets();

    return () => {
      mounted = false;
    };
  }, []);

  const emptyMessage = useMemo(() => {
    if (loading) {
      return "";
    }

    return "No share targets available yet.";
  }, [loading]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Send to</Text>
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#111827" />
        </View>
      ) : null}
      <FlatList
        data={targets}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={emptyMessage ? <Text style={styles.emptyText}>{emptyMessage}</Text> : null}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Image
              source={{ uri: item.avatarUrl || "https://cdn-icons-png.flaticon.com/512/149/149071.png" }}
              style={styles.avatar}
            />
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.username} numberOfLines={1}>
              @{item.username}
            </Text>
            <TouchableOpacity
              style={[styles.sendButton, sendingTargetId === item.id && styles.sendButtonDisabled]}
              disabled={!!sendingTargetId}
              onPress={async () => {
                try {
                  setSendingTargetId(item.id);
                  await onSend(item);
                } finally {
                  setSendingTargetId("");
                }
              }}
            >
              {sendingTargetId === item.id ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.sendButtonText}>Send</Text>
              )}
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
  loadingWrap: { paddingVertical: 10 },
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
  emptyText: { color: "#6b7280", fontSize: 12.5, paddingVertical: 6 },
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
  sendButtonDisabled: { opacity: 0.75 },
  sendButtonText: { color: "#fff", fontWeight: "700", fontSize: 12 },
});

export default ShareTargetsList;
