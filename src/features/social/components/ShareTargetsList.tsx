import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { useAppTheme } from "../../../theme/AppThemeContext";
import { fetchChatConversations } from "../../../utils/chatApi";
import AppAvatar from "../../../components/AppAvatar";

export interface ShareTarget {
  key: string;
  id: string;
  kind: "user" | "group";
  username: string;
  name: string;
  avatarUrl: string;
  isVerified?: boolean;
  conversationId?: string;
  conversationType?: "direct" | "seller" | "group";
  subtitle?: string;
}

interface ShareTargetsListProps {
  selectedTargetIds: string[];
  onToggleTarget: (target: ShareTarget) => void;
  title?: string;
  scrollEnabled?: boolean;
  variant?: "default" | "dark";
}

function ShareTargetsList({
  selectedTargetIds,
  onToggleTarget,
  title = "Send to",
  scrollEnabled = true,
  variant = "default",
}: ShareTargetsListProps) {
  const { colors } = useAppTheme();
  const [targets, setTargets] = useState<ShareTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);

  useEffect(() => {
    let mounted = true;

    const loadTargets = async () => {
      try {
        setLoading(true);
        const [res, chatRes, currentUserId] = await Promise.all([
          API.get("/auth/users"),
          fetchChatConversations().catch(() => ({ conversations: [] })),
          getStoredUserId(),
        ]);
        const users = Array.isArray(res?.data?.users) ? res.data.users : [];
        const conversations = Array.isArray(chatRes?.conversations) ? chatRes.conversations : [];

        if (!mounted) {
          return;
        }

        const nextTargets = users
          .map((user: SocialUser & { _id?: string; profilePic?: string; profileImage?: string }) => ({
            key: `user:${String(user?.id || user?._id || "")}`,
            id: String(user?.id || user?._id || ""),
            kind: "user" as const,
            username: String(user?.username || "").trim(),
            name: String(user?.name || user?.username || "User").trim(),
            avatarUrl: String(user?.avatarUrl || user?.profilePic || user?.profileImage || "").trim(),
            isVerified: shouldShowVerifiedBadge(user),
            subtitle: user?.username ? `@${String(user.username).trim()}` : "Direct chat",
          }))
          .filter((user: ShareTarget) => user.id && user.username && user.id !== String(currentUserId || ""));

        const groupTargets = conversations
          .filter((conversation: any) => String(conversation?.conversationType || "") === "group" && String(conversation?._id || "").trim())
          .map((conversation: any) => ({
            key: `group:${String(conversation._id)}`,
            id: String(conversation._id),
            kind: "group" as const,
            username: "",
            name: String(conversation?.groupName || "Group").trim(),
            avatarUrl: String(conversation?.groupAvatar || "").trim(),
            conversationId: String(conversation?._id || ""),
            conversationType: "group" as const,
            subtitle: `${Number(conversation?.memberCount || conversation?.members?.length || 0)} members`,
          }));

        setTargets([...groupTargets, ...nextTargets]);
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
      return "No matching chats found.";
    }

    return "No share targets available yet.";
  }, [deferredSearchQuery, loading]);

  const filteredTargets = useMemo(() => {
    const searchValue = deferredSearchQuery.trim().toLowerCase();
    if (!searchValue) {
      return targets;
    }

      return targets.filter((target) => {
      const combined = `${target.name} ${target.username} ${target.subtitle || ""}`.toLowerCase();
      return combined.includes(searchValue);
    });
  }, [deferredSearchQuery, targets]);

  const isDarkVariant = variant === "dark";
  const titleColor = isDarkVariant ? "#F8FAFC" : colors.text;
  const mutedColor = isDarkVariant ? "#94A3B8" : colors.mutedText;
  const searchBorderColor = isDarkVariant ? "rgba(148, 163, 184, 0.22)" : colors.border;
  const searchBackgroundColor = isDarkVariant ? "rgba(15, 23, 42, 0.92)" : colors.card;
  const searchTextColor = isDarkVariant ? "#F8FAFC" : colors.text;
  const placeholderColor = isDarkVariant ? "#64748B" : colors.placeholder;
  const checkBorderColor = isDarkVariant ? "rgba(148, 163, 184, 0.55)" : "#cbd5e1";
  const checkBackgroundColor = isDarkVariant ? "rgba(15, 23, 42, 0.94)" : "#fff";
  const selectedCheckColor = isDarkVariant ? "#2563EB" : "#111827";
  const avatarFallbackBackground = isDarkVariant ? "#1E293B" : "#e5e7eb";
  const avatarFallbackTextColor = isDarkVariant ? "#F8FAFC" : "#1f2937";

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
      <View style={[styles.searchWrap, { borderColor: searchBorderColor, backgroundColor: searchBackgroundColor }]}>
        <Icon name="search" size={16} color={mutedColor} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search chats"
          placeholderTextColor={placeholderColor}
          style={[styles.searchInput, { color: searchTextColor }]}
        />
      </View>
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={titleColor} />
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
        ListEmptyComponent={emptyMessage ? <Text style={[styles.emptyText, { color: mutedColor }]}>{emptyMessage}</Text> : null}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.86} onPress={() => onToggleTarget(item)}>
            <View style={styles.avatarWrap}>
              <AppAvatar
                uri={normalizeMediaUrl(item.avatarUrl || DEFAULT_AVATAR_URL)}
                name={item.name || item.username || "Chat"}
                size={62}
                style={styles.avatar}
                backgroundColor={avatarFallbackBackground}
                textColor={avatarFallbackTextColor}
              />
              <View
                style={[
                  styles.checkCircle,
                  {
                    borderColor: checkBorderColor,
                    backgroundColor: checkBackgroundColor,
                  },
                  selectedTargetIds.includes(item.key) ? [styles.checkCircleSelected, { backgroundColor: selectedCheckColor, borderColor: selectedCheckColor }] : null,
                ]}
              >
                {selectedTargetIds.includes(item.key) ? <Icon name="checkmark" size={12} color="#fff" /> : null}
              </View>
            </View>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: titleColor }]} numberOfLines={1}>
                {item.name}
              </Text>
              {item.kind === "group"
                ? <Icon name="people" size={12} color={isDarkVariant ? "#60A5FA" : colors.primary} />
                : item.isVerified
                  ? <Icon name="checkmark-circle" size={12} color="#2563eb" />
                  : null}
            </View>
            <Text style={[styles.username, { color: mutedColor }]} numberOfLines={1}>
              {item.kind === "group" ? item.subtitle || "Group chat" : item.subtitle || `@${item.username}`}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 12 },
  title: { fontWeight: "700", fontSize: 13, marginBottom: 10 },
  searchWrap: {
    height: 42,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
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
  name: { fontWeight: "700", fontSize: 12.5, marginRight: 4, maxWidth: "86%" },
  username: { marginTop: 2, fontSize: 11.5, textAlign: "center", maxWidth: "100%" },
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
