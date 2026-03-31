import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";

import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { useAppTheme } from "../theme/AppThemeContext";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";

type UserRow = {
  _id: string;
  name?: string;
  username?: string;
  profilePic?: string;
};

const DEFAULT_AVATAR = DEFAULT_AVATAR_URL;

function CloseFriendsScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [following, setFollowing] = useState<UserRow[]>([]);
  const [closeFriendIds, setCloseFriendIds] = useState<string[]>([]);

  const loadData = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const profileRes = await API.get("/auth/profile");
      const currentUserId = profileRes.data?.user?._id;

      if (!currentUserId) {
        setFollowing([]);
        setCloseFriendIds([]);
        setErrorMessage("Please log in again to manage close friends.");
        return;
      }

      const [followingRes, closeFriendsRes] = await Promise.all([
        API.get(`/auth/following/${currentUserId}`),
        API.get("/user/close-friends"),
      ]);

      const followingUsers = Array.isArray(followingRes.data?.following) ? followingRes.data.following : [];
      const currentCloseFriends = Array.isArray(closeFriendsRes.data?.closeFriends) ? closeFriendsRes.data.closeFriends : [];

      setFollowing(followingUsers);
      setCloseFriendIds(currentCloseFriends.map((item: UserRow) => item._id));
      setErrorMessage("");
    } catch (error) {
      console.log("close friends load error:", error);
      setErrorMessage(getReadableApiErrorMessage(error, "Unable to load close friends."));
      setFollowing([]);
      setCloseFriendIds([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const filteredFollowing = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return following;
    }

    return following.filter((item) => {
      const username = String(item.username || "").toLowerCase();
      const name = String(item.name || "").toLowerCase();
      return username.includes(normalizedQuery) || name.includes(normalizedQuery);
    });
  }, [following, query]);

  const toggleCloseFriend = async (userId: string) => {
    if (!userId || busyId) {
      return;
    }

    const isCloseFriend = closeFriendIds.includes(userId);

    try {
      setBusyId(userId);
      if (isCloseFriend) {
        await API.post("/user/close-friends/remove", { friendId: userId });
        setCloseFriendIds((prev) => prev.filter((id) => id !== userId));
      } else {
        await API.post("/user/close-friends/add", { friendId: userId });
        setCloseFriendIds((prev) => [...prev, userId]);
      }
      setErrorMessage("");
    } catch (error) {
      console.log("close friend toggle error:", error);
      Alert.alert("Unable to update close friends", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setBusyId("");
    }
  };

  const onRefresh = useCallback(async () => {
    await loadData(true);
  }, [loadData]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Close Friends</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={[styles.helper, { color: colors.mutedText }]}>
        Stories shared to close friends will only be visible to the people you select here.
      </Text>

      <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Icon name="search-outline" size={18} color={colors.mutedText} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search following"
          placeholderTextColor={colors.placeholder}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredFollowing}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Icon name="people-outline" size={40} color={colors.primary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {errorMessage ? "Close friends unavailable" : "No followed accounts yet"}
              </Text>
              <Text style={[styles.emptyCopy, { color: colors.mutedText }]}>
                {errorMessage || "Follow people first, then you can add them to your close friends list."}
              </Text>
              {errorMessage ? (
                <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={() => loadData()}>
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
          renderItem={({ item }) => {
            const isCloseFriend = closeFriendIds.includes(item._id);
            const isBusy = busyId === item._id;
            return (
              <View style={[styles.row, { borderBottomColor: colors.border }]}>
                <View style={styles.rowInfo}>
                  <Image source={{ uri: item.profilePic || DEFAULT_AVATAR }} style={styles.avatar} />
                  <View style={styles.rowCopy}>
                    <Text style={[styles.name, { color: colors.text }]}>{item.name || item.username || "Aline2 user"}</Text>
                    <Text style={[styles.username, { color: colors.mutedText }]}>
                      {item.username ? `@${item.username}` : "Following"}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    {
                      borderColor: isCloseFriend ? colors.primary : colors.border,
                      backgroundColor: isCloseFriend ? colors.primary : colors.surface,
                    },
                  ]}
                  onPress={() => toggleCloseFriend(item._id)}
                  disabled={isBusy}
                >
                  {isBusy ? (
                    <ActivityIndicator size="small" color={isCloseFriend ? "#fff" : colors.primary} />
                  ) : (
                    <Text style={[styles.actionText, isCloseFriend ? styles.actionTextSelected : styles.actionTextDefault]}>
                      {isCloseFriend ? "Selected" : "Add"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

export default CloseFriendsScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  headerSpacer: { width: 24 },
  helper: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
    fontSize: 14,
    lineHeight: 20,
  },
  searchWrap: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 46,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    paddingVertical: 10,
  },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 20, paddingBottom: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  rowInfo: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  rowCopy: { marginLeft: 12, flex: 1 },
  name: { fontSize: 15, fontWeight: "700" },
  username: { marginTop: 2, fontSize: 13 },
  actionButton: {
    minWidth: 84,
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  actionText: { fontSize: 13, fontWeight: "700" },
  actionTextDefault: { color: "#111827" },
  actionTextSelected: { color: "#fff" },
  emptyState: { paddingTop: 80, alignItems: "center" },
  emptyTitle: { marginTop: 12, fontSize: 18, fontWeight: "700" },
  emptyCopy: { marginTop: 8, fontSize: 14, lineHeight: 20, textAlign: "center" },
  retryButton: {
    marginTop: 16,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: {
    color: "#fff",
    fontWeight: "700",
  },
});
