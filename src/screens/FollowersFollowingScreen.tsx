import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";

import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import AppAvatar from "../components/AppAvatar";
import { useAppTheme } from "../theme/AppThemeContext";
import { shouldShowVerifiedBadge } from "../utils/verificationBadges";

type FollowTab = "followers" | "following";

interface FollowUser {
 _id: string;
 username?: string;
 name?: string;
 profilePic?: string;
 isVerified?: boolean;
}

type ExpectedIdsByTab = Partial<Record<FollowTab, unknown[]>>;

export const normalizeIdList = (list: unknown): string[] => {
 if (!Array.isArray(list)) {
  return [];
 }

 const seen = new Set<string>();
 const ids: string[] = [];

 for (const entry of list) {
  const id = String(
   typeof entry === "object" && entry
    ? (entry as any)._id || (entry as any).id
    : entry || "",
  ).trim();

  if (!id || seen.has(id)) {
   continue;
  }

  seen.add(id);
  ids.push(id);
 }

 return ids;
};

const getSearchableText = (user: FollowUser) =>
 `${user.username || ""} ${user.name || ""}`.trim().toLowerCase();

export const normalizeFollowUsers = (list: unknown): FollowUser[] => {
 if (!Array.isArray(list)) {
  return [];
 }

 const seen = new Set<string>();
 const normalized: FollowUser[] = [];

 for (const entry of list) {
  if (!entry || typeof entry !== "object") {
   continue;
  }

  const user = entry as FollowUser;
  const id = String(user._id || "").trim();

  if (!id || seen.has(id)) {
   continue;
  }

  seen.add(id);
  normalized.push({
   _id: id,
   username: user.username,
   name: user.name,
   profilePic: user.profilePic,
   isVerified: user.isVerified,
  });
 }

 return normalized;
};

export const filterFollowUsersByExpectedIds = (users: FollowUser[], expectedIds: string[] | null | undefined): FollowUser[] => {
 if (!Array.isArray(expectedIds)) {
  return users;
 }

 return expectedIds
  .map((id) => users.find((user) => user._id === id))
  .filter((user): user is FollowUser => !!user);
};

const FollowersFollowingScreen = ({ route, navigation }: { route: any; navigation: any }) => {
 const { colors } = useAppTheme();
 const { userId, type, expectedIds: routeExpectedIds, expectedIdsByTab: routeExpectedIdsByTab } = route.params as {
  userId: string;
  type: FollowTab;
  expectedIds?: unknown[];
  expectedIdsByTab?: ExpectedIdsByTab;
 };
 const expectedIdsByTab = useMemo(() => {
  const byTab = routeExpectedIdsByTab || {};
  return {
   followers: Array.isArray(byTab.followers)
    ? normalizeIdList(byTab.followers)
    : type === "followers"
     ? normalizeIdList(routeExpectedIds)
     : null,
   following: Array.isArray(byTab.following)
    ? normalizeIdList(byTab.following)
    : type === "following"
     ? normalizeIdList(routeExpectedIds)
     : null,
  };
 }, [routeExpectedIds, routeExpectedIdsByTab, type]);
 const [users, setUsers] = useState<FollowUser[]>([]);
 const [activeTab, setActiveTab] = useState<FollowTab>(type);
 const [search, setSearch] = useState("");
 const [loading, setLoading] = useState(true);
 const [refreshing, setRefreshing] = useState(false);
 const [errorMessage, setErrorMessage] = useState("");

 const filteredUsers = useMemo(() => {
  const normalizedQuery = search.trim().toLowerCase();

  if (!normalizedQuery) {
   return users;
  }

  return users.filter((user) => getSearchableText(user).includes(normalizedQuery));
 }, [search, users]);

 const fetchUsers = useCallback(async (tabType: FollowTab, isRefreshing = false) => {
  if (isRefreshing) {
   setRefreshing(true);
  } else {
   setLoading(true);
  }

  try {
   const res = await API.get(`/auth/${tabType}/${userId}`);
   const list = tabType === "followers" ? res.data?.followers : res.data?.following;
   const normalizedUsers = normalizeFollowUsers(list);
   const expectedIds = expectedIdsByTab[tabType];
   const relationshipUsers = filterFollowUsersByExpectedIds(normalizedUsers, expectedIds);

   setUsers(relationshipUsers);
   setErrorMessage("");
  } catch (error) {
   setUsers([]);
   setErrorMessage(getReadableApiErrorMessage(error, `Unable to load ${tabType} right now.`));
  } finally {
   if (isRefreshing) {
    setRefreshing(false);
   } else {
    setLoading(false);
   }
  }
 }, [expectedIdsByTab, userId]);

 useEffect(() => {
  fetchUsers(activeTab).catch(() => {});
 }, [activeTab, fetchUsers]);

 const renderUser = ({ item }: { item: FollowUser }) => (
  <TouchableOpacity
   activeOpacity={0.8}
   style={[styles.userItem, { borderColor: colors.border }]}
   onPress={() =>
    navigation.navigate("ProfilePreviewScreen", {
     userId: item._id,
    })
   }
  >
   <AppAvatar
    uri={item.profilePic || DEFAULT_AVATAR_URL}
     name={item.username || item.name || (item as any)?.email || "User"}
    size={44}
    style={styles.avatar}
    backgroundColor={colors.surface}
    textColor={colors.primary}
   />

   <View style={styles.userMeta}>
    <View style={styles.userTitleRow}>
     <Text numberOfLines={1} style={[styles.username, { color: colors.text }]}>
      {item.username || "unknown"}
     </Text>

     {shouldShowVerifiedBadge(item) ? (
      <Icon name="checkmark-circle" size={15} color={colors.primary} style={styles.verifiedIcon} />
     ) : null}
    </View>

    {item.name ? (
     <Text numberOfLines={1} style={[styles.name, { color: colors.mutedText }]}>
      {item.name}
     </Text>
    ) : null}
   </View>

   <Icon name="chevron-forward" size={18} color={colors.mutedText} />
  </TouchableOpacity>
 );

 if (loading) {
  return (
   <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]} edges={["top"]}>
    <ActivityIndicator size="large" color={colors.primary} />
   </SafeAreaView>
  );
 }

 return (
  <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
   <View style={[styles.header, { borderColor: colors.border }]}>
    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconBtn}>
     <Icon name="arrow-back" size={24} color={colors.text} />
    </TouchableOpacity>

    <Text style={[styles.headerTitle, { color: colors.text }]}>Connections</Text>

    <View style={styles.headerSpacer} />
   </View>

   <View style={[styles.tabs, { borderColor: colors.border }]}>
    {(["followers", "following"] as const).map((tab) => {
     const isActive = activeTab === tab;

     return (
      <TouchableOpacity
       key={tab}
       activeOpacity={0.8}
       style={[styles.tab, isActive && { borderBottomColor: colors.primary }]}
       onPress={() => setActiveTab(tab)}
      >
       <Text
        style={[
         styles.tabLabel,
         {
          color: isActive ? colors.text : colors.tabInactive,
          fontWeight: isActive ? "700" : "500",
         },
        ]}
       >
        {tab === "followers" ? "Followers" : "Following"}
       </Text>
      </TouchableOpacity>
     );
    })}
   </View>

   <View style={[styles.searchContainer, { backgroundColor: colors.input, borderColor: colors.border }]}>
    <Icon name="search" size={18} color={colors.placeholder} />
    <TextInput
     placeholder={`Search ${activeTab}`}
     placeholderTextColor={colors.placeholder}
     value={search}
     onChangeText={setSearch}
     style={[styles.searchInput, { color: colors.text }]}
    />
   </View>

   {errorMessage ? (
    <View style={[styles.messageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
     <Text style={[styles.messageTitle, { color: colors.text }]}>Couldn’t load {activeTab}</Text>
     <Text style={[styles.messageBody, { color: colors.mutedText }]}>{errorMessage}</Text>
     <TouchableOpacity
      activeOpacity={0.8}
      style={[styles.retryButton, { backgroundColor: colors.primary }]}
      onPress={() => fetchUsers(activeTab).catch(() => {})}
     >
      <Text style={styles.retryButtonText}>Retry</Text>
     </TouchableOpacity>
    </View>
   ) : null}

   {!errorMessage && filteredUsers.length === 0 ? (
    <View style={styles.emptyState}>
     <Icon name="people-outline" size={34} color={colors.mutedText} />
     <Text style={[styles.emptyTitle, { color: colors.text }]}>
      {search.trim() ? "No matches found" : `No ${activeTab} yet`}
     </Text>
     <Text style={[styles.emptyBody, { color: colors.mutedText }]}>
      {search.trim()
       ? "Try a different username or name."
       : activeTab === "followers"
        ? "This account doesn’t have any visible followers yet."
        : "This account isn’t following anyone visible yet."}
     </Text>
    </View>
   ) : null}

   {!errorMessage && filteredUsers.length > 0 ? (
    <FlatList
     data={filteredUsers}
     renderItem={renderUser}
     keyExtractor={(item) => item._id}
     refreshControl={
      <RefreshControl
       refreshing={refreshing}
       onRefresh={() => fetchUsers(activeTab, true).catch(() => {})}
       tintColor={colors.primary}
      />
     }
     keyboardShouldPersistTaps="handled"
     contentContainerStyle={styles.listContent}
     showsVerticalScrollIndicator={false}
    />
   ) : null}
  </SafeAreaView>
 );
};

export default FollowersFollowingScreen;

const styles = StyleSheet.create({
 container: {
  flex: 1,
 },
 center: {
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
 },
 header: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingHorizontal: 16,
  paddingBottom: 12,
  borderBottomWidth: StyleSheet.hairlineWidth,
 },
 headerIconBtn: {
  width: 32,
  height: 32,
  alignItems: "center",
  justifyContent: "center",
 },
 headerTitle: {
  fontSize: 18,
  fontWeight: "700",
 },
 headerSpacer: {
  width: 32,
 },
 tabs: {
  flexDirection: "row",
  borderBottomWidth: StyleSheet.hairlineWidth,
 },
 tab: {
  flex: 1,
  alignItems: "center",
  paddingVertical: 14,
  borderBottomWidth: 2,
  borderBottomColor: "transparent",
 },
 tabLabel: {
  fontSize: 15,
 },
 searchContainer: {
  flexDirection: "row",
  alignItems: "center",
  marginHorizontal: 16,
  marginTop: 16,
  marginBottom: 8,
  paddingHorizontal: 12,
  borderRadius: 14,
  borderWidth: StyleSheet.hairlineWidth,
 },
 searchInput: {
  flex: 1,
  paddingVertical: 12,
  marginLeft: 8,
  fontSize: 15,
 },
 listContent: {
  paddingHorizontal: 16,
  paddingBottom: 32,
 },
 userItem: {
  flexDirection: "row",
  alignItems: "center",
  paddingVertical: 14,
  borderBottomWidth: StyleSheet.hairlineWidth,
 },
 avatar: {
  width: 52,
  height: 52,
  borderRadius: 26,
  marginRight: 14,
 },
 userMeta: {
  flex: 1,
 },
 userTitleRow: {
  flexDirection: "row",
  alignItems: "center",
 },
 username: {
  flexShrink: 1,
  fontSize: 15,
  fontWeight: "700",
 },
 verifiedIcon: {
  marginLeft: 6,
 },
 name: {
  marginTop: 2,
  fontSize: 13,
 },
 messageCard: {
  marginHorizontal: 16,
  marginTop: 12,
  padding: 16,
  borderRadius: 16,
  borderWidth: StyleSheet.hairlineWidth,
 },
 messageTitle: {
  fontSize: 16,
  fontWeight: "700",
 },
 messageBody: {
  marginTop: 6,
  fontSize: 14,
  lineHeight: 20,
 },
 retryButton: {
  alignSelf: "flex-start",
  marginTop: 14,
  borderRadius: 999,
  paddingHorizontal: 16,
  paddingVertical: 10,
 },
 retryButtonText: {
  color: "#FFFFFF",
  fontWeight: "700",
 },
 emptyState: {
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 28,
 },
 emptyTitle: {
  marginTop: 14,
  fontSize: 18,
  fontWeight: "700",
  textAlign: "center",
 },
 emptyBody: {
  marginTop: 8,
  fontSize: 14,
  lineHeight: 21,
  textAlign: "center",
 },
});
