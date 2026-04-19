import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  TextInput,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";

import { API } from "../../../api/api";
import { SocialUser } from "../types";
import { getStoredUserId } from "../../../utils/authSession";
import { DEFAULT_AVATAR_URL } from "../../../constants/defaultAssets";
import { shouldShowVerifiedBadge } from "../../../utils/verificationBadges";
import { normalizeMediaUrl } from "../../../utils/mediaUrls";

export interface ShareTarget {
  id: string;
  username: string;
  name: string;
  avatarUrl: string;
  isVerified?: boolean;
}

interface ShareTargetsListProps {
  selectedTargetIds: string[];
  onToggleTarget: (target: ShareTarget) => void;
  title?: string;
  scrollEnabled?: boolean;
}

function ShareTargetsList({
  selectedTargetIds,
  onToggleTarget,
  title = "Send to",
  scrollEnabled = true,
}: ShareTargetsListProps) {
  const [targets, setTargets] = useState<ShareTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);

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
            isVerified: shouldShowVerifiedBadge(user),
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

    if (deferredSearchQuery.trim()) {
      return "No matching people found.";
    }

    return "No share targets available yet.";
  }, [deferredSearchQuery, loading]);

  const filteredTargets = useMemo(() => {
    const searchValue = deferredSearchQuery.trim().toLowerCase();
    if (!searchValue) {
      return targets;
    }

    return targets.filter((target) => {
      const combined = `${target.name} ${target.username}`.toLowerCase();
      return combined.includes(searchValue);
    });
  }, [deferredSearchQuery, targets]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.searchWrap}>
        <Icon name="search" size={16} color="#6b7280" />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search people"
          placeholderTextColor="#9ca3af"
          style={styles.searchInput}
        />
      </View>
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#111827" />
        </View>
      ) : null}
      <FlatList
        data={filteredTargets}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={scrollEnabled}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        numColumns={4}
        ListEmptyComponent={emptyMessage ? <Text style={styles.emptyText}>{emptyMessage}</Text> : null}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.86} onPress={() => onToggleTarget(item)}>
            <View style={styles.avatarWrap}>
              <Image
                source={{ uri: normalizeMediaUrl(item.avatarUrl || DEFAULT_AVATAR_URL) }}
                style={styles.avatar}
              />
              <View
                style={[
                  styles.checkCircle,
                  selectedTargetIds.includes(item.id) && styles.checkCircleSelected,
                ]}
              >
                {selectedTargetIds.includes(item.id) ? <Icon name="checkmark" size={12} color="#fff" /> : null}
              </View>
            </View>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              {item.isVerified ? <Icon name="checkmark-circle" size={12} color="#2563eb" /> : null}
            </View>
            <Text style={styles.username} numberOfLines={1}>
              @{item.username}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 12 },
  title: { color: "#111827", fontWeight: "700", fontSize: 13, marginBottom: 10 },
  searchWrap: {
    height: 42,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d1d5db",
    backgroundColor: "#f9fafb",
    paddingHorizontal: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    color: "#111827",
    fontSize: 14,
    paddingVertical: 0,
  },
  loadingWrap: { paddingVertical: 10 },
  listContent: { paddingBottom: 8 },
  card: {
    width: "25%",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  avatarWrap: {
    position: "relative",
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#e5e7eb",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    maxWidth: "100%",
  },
  name: { color: "#111827", fontWeight: "700", fontSize: 12.5, marginRight: 4, maxWidth: "86%" },
  username: { marginTop: 2, color: "#6b7280", fontSize: 11.5, textAlign: "center", maxWidth: "100%" },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    right: -2,
    bottom: -2,
    backgroundColor: "#fff",
  },
  checkCircleSelected: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  emptyText: { color: "#6b7280", fontSize: 12.5, paddingVertical: 6 },
});

export default ShareTargetsList;
