import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions
} from "react-native";
import { Alert } from "../utils/appAlert";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import LinearGradient from "react-native-linear-gradient";

import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { getStoredUserId } from "../utils/authSession";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { useAppTheme } from "../theme/AppThemeContext";
import { normalizeMediaUrl } from "../utils/mediaUrls";
import AppBottomDock, { APP_BOTTOM_DOCK_BASE_HEIGHT } from "../components/AppBottomDock";

type ProfilePreviewPost = {
 _id: string;
 image?: string;
 postType?: string;
 media?: Array<{
  url?: string;
  thumbnailUrl?: string;
  }>;
};

type ProfilePreviewTab = "posts" | "swipes" | "tagged";

const isReelPost = (post: ProfilePreviewPost) => post.postType === "reel";

const ProfilePreviewScreen = ({ route, navigation }: { route: any; navigation: any }) => {
 const { colors, isDarkMode } = useAppTheme();
 const insets = useSafeAreaInsets();
 const { width } = useWindowDimensions();

 const { userId } = route.params as { userId: string };

 const [user, setUser] = useState<any>(null);
 const [allPosts, setAllPosts] = useState<ProfilePreviewPost[]>([]);
 const [taggedPosts, setTaggedPosts] = useState<ProfilePreviewPost[]>([]);
 const [loading, setLoading] = useState(true);
 const [refreshing, setRefreshing] = useState(false);
 const [errorMessage, setErrorMessage] = useState("");
 const [activeTab, setActiveTab] = useState<ProfilePreviewTab>("posts");
 const [isFollowing, setIsFollowing] = useState(false);
 const [isMutualConnection, setIsMutualConnection] = useState(false);
 const [canViewPosts, setCanViewPosts] = useState(false);
 const [actionLoading, setActionLoading] = useState(false);
 const [suggestions, setSuggestions] = useState<any[]>([]);
const [showSuggestions, setShowSuggestions] = useState(true);
const [myFollowing, setMyFollowing] = useState<string[]>([]);
 const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
 const suggestionListContentStyle = styles.suggestionListContent;
 const isCompact = width < 360;
 const sectionWidth = Math.min(width - 24, 540);
 const sectionPadding = isCompact ? 16 : 20;
 const headerButtonSize = isCompact ? 42 : 46;
 const gridGap = isCompact ? 4 : 6;
 const gridColumns = 3;
 const gridContentWidth = Math.min(width - 24, 540);
 const gridSideInset = Math.max(12, Math.floor((width - gridContentWidth) / 2));
 const postCardSize = Math.floor((gridContentWidth - gridGap * (gridColumns - 1)) / gridColumns);
 const suggestionCardWidth = Math.min(158, Math.max(132, Math.floor(width * 0.36)));
 const centerScreenStyle = { backgroundColor: "transparent" };
 const retryButtonStyle = { backgroundColor: colors.primary, marginTop: 14, width: 180 };
 const headerButtonStyle = {
  width: headerButtonSize,
  height: headerButtonSize,
  borderRadius: headerButtonSize / 2,
  backgroundColor: isDarkMode ? colors.surface : colors.card,
  borderColor: colors.border,
 };
 const headerSpacerStyle = { width: headerButtonSize, height: headerButtonSize };
 const headerTopStyle = { width: sectionWidth, paddingTop: 6, borderColor: colors.border };
 const heroSectionStyle = {
  width: sectionWidth,
  paddingHorizontal: sectionPadding,
  borderColor: colors.border,
  backgroundColor: isDarkMode ? colors.card : "rgba(255,255,255,0.76)",
 };
 const profileAssetStyle = {
  width: isCompact ? 98 : 108,
  height: isCompact ? 98 : 108,
  borderRadius: isCompact ? 49 : 54,
 };
 const profileRingStyle = {
  width: isCompact ? 112 : 124,
  height: isCompact ? 112 : 124,
  borderRadius: isCompact ? 56 : 62,
  borderColor: colors.border,
  backgroundColor: isDarkMode ? colors.surface : colors.card,
 };
 const profilePlaceholderStyle = {
  ...profileAssetStyle,
  backgroundColor: `${colors.primary}18`,
 };
 const tabsContainerStyle = {
  width: sectionWidth,
  borderColor: colors.border,
  backgroundColor: isDarkMode ? colors.surface : colors.card,
 };
const fetchProfile = useCallback(async ({ refresh = false }: { refresh?: boolean } = {}) => {
 try {
  if (refresh) {
   setRefreshing(true);
  } else {
   setLoading(true);
  }

  const [res, taggedResult] = await Promise.all([
   API.get(`/auth/user/${userId}`),
   API.get(`/posts/tagged/${userId}`).catch((error) => {
    console.log("Tagged profile posts error:", error);
    return null;
   }),
  ]);

  const profileUser = res.data.user;
  const me = res.data.me;
  const profilePosts = Array.isArray(res.data.posts) ? (res.data.posts as ProfilePreviewPost[]) : [];
  const accessGranted = Boolean(res.data?.canViewPosts);
  const currentUserId = String(me?._id || me?.id || "");

  setUser(profileUser);
  setAllPosts(profilePosts);
  setTaggedPosts(Array.isArray(taggedResult?.data?.posts) ? (taggedResult.data.posts as ProfilePreviewPost[]) : []);

  // 🔥 store my following list
  setMyFollowing((me?.following || []) as string[]);

  const amIFollowing = me?.following?.some(
   (id: string) => String(id) === String(userId)
  );
  const followsMe = Array.isArray(profileUser?.following)
   ? profileUser.following.some((id: string) => String(id) === currentUserId)
   : false;

  setIsFollowing(!!amIFollowing);
  setIsMutualConnection(Boolean(amIFollowing && followsMe));
  setCanViewPosts(accessGranted);
  setErrorMessage("");
 } catch (err) {
  console.log("Profile preview fetch error:", err);
  setUser(null);
  setAllPosts([]);
  setTaggedPosts([]);
  setIsMutualConnection(false);
  setErrorMessage(getReadableApiErrorMessage(err, "Failed to load this profile."));
 } finally {
  if (refresh) {
   setRefreshing(false);
  } else {
   setLoading(false);
  }
 }
}, [userId]);

const fetchSuggestions = useCallback(async () => {

 try {

  const currentUserId = await getStoredUserId();

  const res = await API.get("/auth/users");

  const allUsers = res.data.users || [];

  const filteredUsers = allUsers.filter((suggestionUser: any) => {

   const isMe = suggestionUser._id === currentUserId;
   const isProfileUser = suggestionUser._id === userId;

   // 🔥 correct follow check
   const alreadyFollowing = myFollowing.includes(suggestionUser._id);

   return !isMe && !isProfileUser && !alreadyFollowing;

  });

  setSuggestions(filteredUsers.slice(0,10));

 } catch (error) {

  console.log("Suggestion Error:", error);

 }

}, [myFollowing, userId]);

useEffect(() => {
 fetchProfile().catch(() => {});
}, [fetchProfile]);

useEffect(() => {
 fetchSuggestions();
}, [fetchSuggestions]);

useEffect(() => {
 setAvatarLoadFailed(false);
}, [user?.profilePic]);

useFocusEffect(
 useCallback(() => {
  fetchProfile({ refresh: true }).catch(() => {});
 }, [fetchProfile])
);

const isPrivateLocked =
 user?.isPrivate === true && canViewPosts === false;

const posts = useMemo(() => {
 if (activeTab === "swipes") {
  return allPosts.filter((post) => isReelPost(post));
 }

 if (activeTab === "tagged") {
  return taggedPosts;
 }

 return allPosts.filter((post) => !isReelPost(post));
}, [activeTab, allPosts, taggedPosts]);

const totalPostCount = useMemo(
 () => allPosts.filter((post) => !isReelPost(post)).length,
 [allPosts],
);

const profileName = user?.name || user?.username || "Profile";
const profileHandle = user?.username ? `@${user.username}` : "Aline2 member";
const profileInitial = (profileName.trim().charAt(0) || "P").toUpperCase();
const showProfileImage = Boolean(user?.profilePic) && !avatarLoadFailed;
const screenGradient = isDarkMode
 ? ["#0D1018", "#131827", "#0E1220"]
 : ["#FBFCFF", "#F6F1FF", "#EEF6FF"];
const heroGradient = isDarkMode
 ? ["rgba(123,77,255,0.24)", "rgba(76,167,255,0.10)", "rgba(255,255,255,0.02)"]
 : ["rgba(123,77,255,0.14)", "rgba(103,181,255,0.10)", "rgba(255,255,255,0.78)"];
const statItems = [
 { key: "posts", label: "Posts", value: totalPostCount },
 { key: "followers", label: "Followers", value: user?.followers?.length || 0 },
 { key: "following", label: "Following", value: user?.following?.length || 0 },
];
const previewData = isPrivateLocked ? [] : posts;
const getPostPreviewUrl = (post: ProfilePreviewPost): string =>
 normalizeMediaUrl(
  post.media?.[0]?.thumbnailUrl ||
   post.media?.[0]?.url ||
   post.image ||
   "",
 );


const renderSuggestion = ({ item }: { item: any }) => (
 <TouchableOpacity
  activeOpacity={0.88}
  style={[
   styles.suggestionCard,
   {
    width: suggestionCardWidth,
    backgroundColor: colors.card,
    borderColor: colors.border,
   },
  ]}
  onPress={() =>
   navigation.push("ProfilePreviewScreen", {
    userId: item._id
   })
  }
 >
  <Image
   source={{
    uri: item.profilePic || DEFAULT_AVATAR_URL
   }}
   style={styles.suggestionAvatar}
  />

  <Text numberOfLines={1} style={[styles.suggestionUsername, { color: colors.text }]}>
   {item.username}
  </Text>

  <Text numberOfLines={1} style={[styles.suggestionName, { color: colors.mutedText }]}>
   {item.name || "Aline2 member"}
  </Text>

  <TouchableOpacity
   activeOpacity={0.82}
   style={[styles.followSuggestionBtn, { backgroundColor: colors.primary }]}
   onPress={() => toggleSuggestionFollow(item._id)}
  >
   <Text style={styles.followSuggestionText}>
    Follow
   </Text>
  </TouchableOpacity>
 </TouchableOpacity>
);

const followUser = async () => {
 try {

  setActionLoading(true);
  await API.post(`/auth/follow/${userId}`);
  await Promise.all([
   fetchProfile(),
   fetchSuggestions(),
  ]);
 } catch (error) {
  Alert.alert("Follow failed", getReadableApiErrorMessage(error, "Please try again."));

 } finally {
  setActionLoading(false);
 }
};

const toggleSuggestionFollow = async (targetUserId: string) => {

 try {

  await API.post(`/auth/follow/${targetUserId}`);

  // suggestion list se remove
  setSuggestions(prev =>
   prev.filter((suggestedUser) => suggestedUser._id !== targetUserId)
  );

  await fetchProfile();

 } catch (error) {
  console.log("Follow Error:", error);
  Alert.alert("Follow failed", getReadableApiErrorMessage(error, "Please try again."));

 }

};

const unfollowUser = async () => {

 Alert.alert(
  "Unfollow",
  "Are you sure?",
  [
   { text: "Cancel", style: "cancel" },

   {
    text: "Unfollow",
    style: "destructive",

    onPress: async () => {

     try {

      setActionLoading(true);
      await API.post(`/auth/unfollow/${userId}`);
      await Promise.all([
       fetchProfile(),
       fetchSuggestions(),
      ]);
     } catch (error) {
      Alert.alert("Unfollow failed", getReadableApiErrorMessage(error, "Please try again."));

     } finally {
      setActionLoading(false);
     }

    }
   }
  ]
 );
};

const renderPost = ({ item }: { item: any }) => (
 <TouchableOpacity
  activeOpacity={0.9}
  style={[styles.postCard, { width: postCardSize }]}
  onPress={() => navigation.navigate("PostDetail", { postId: item._id })}
 >
  {getPostPreviewUrl(item) ? (
   <Image
    source={{ uri: getPostPreviewUrl(item) }}
    style={styles.postImage}
   />
  ) : (
   <View style={[styles.postImage, styles.postFallback, { backgroundColor: isDarkMode ? colors.surface : colors.card }]}>
    <Icon name="image-outline" size={20} color={colors.mutedText} />
   </View>
  )}
 </TouchableOpacity>
);

const renderProfileHeader = () => (
 <>
  <View
   style={[
    styles.topHeader,
    headerTopStyle,
   ]}
  >
   <TouchableOpacity
    style={[
     styles.iconButton,
     headerButtonStyle,
    ]}
    onPress={() => navigation.goBack()}
   >
    <Icon name="arrow-back" size={22} color={colors.text} />
   </TouchableOpacity>

   <View style={styles.headerTitleGroup}>
    <View style={styles.headerUserRow}>
     {user?.isPrivate ? (
      <Icon name="lock-closed-outline" size={13} style={styles.lockIcon} color={colors.mutedText} />
     ) : null}
     <Text numberOfLines={1} style={[styles.headerUsername, { color: colors.text }]}>
      {profileHandle}
     </Text>
    </View>
    <Text numberOfLines={1} style={[styles.headerName, { color: colors.mutedText }]}>
     {profileName}
    </Text>
   </View>

   <View style={[styles.headerSpacer, headerSpacerStyle]} />
  </View>

  <LinearGradient
    colors={heroGradient}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
     style={[styles.heroSection, heroSectionStyle]}
    >
     <View style={styles.profileCenter}>
      <View style={[styles.profileRing, profileRingStyle]}>
       {showProfileImage ? (
        <Image
         source={{
          uri: user?.profilePic || DEFAULT_AVATAR_URL
         }}
         style={[styles.profilePic, profileAssetStyle]}
         onError={() => setAvatarLoadFailed(true)}
        />
       ) : (
        <View style={[styles.profilePlaceholder, profilePlaceholderStyle]}>
         <Text style={[styles.profilePlaceholderText, { color: colors.primary }]}>{profileInitial}</Text>
        </View>
       )}
    </View>

    <Text style={[styles.profileName, { color: colors.text }]}>{profileName}</Text>
    <Text style={[styles.profileHandleText, { color: colors.mutedText }]}>{profileHandle}</Text>

    <View style={styles.profileBadgeRow}>
     <View
      style={[
       styles.privacyBadge,
       {
        backgroundColor: user?.isPrivate ? `${colors.primary}18` : isDarkMode ? colors.surface : colors.card,
        borderColor: user?.isPrivate ? colors.primary : colors.border,
       },
      ]}
     >
      <Icon name={user?.isPrivate ? "lock-closed-outline" : "globe-outline"} size={14} color={user?.isPrivate ? colors.primary : colors.text} />
      <Text style={[styles.privacyBadgeText, { color: user?.isPrivate ? colors.primary : colors.text }]}>
       {user?.isPrivate ? "Private account" : "Public account"}
      </Text>
     </View>
    </View>
   </View>

    <View style={[styles.statsBand, { backgroundColor: isDarkMode ? colors.surface : colors.card, borderColor: colors.border }]}>
    {statItems.map((item, index) => {
     const statContent = (
      <>
       <Text style={[styles.statNumber, { color: colors.text }]}>{item.value}</Text>
       <Text style={[styles.statText, { color: colors.mutedText }]}>{item.label}</Text>
      </>
     );

     if (item.key === "followers") {
      return (
       <TouchableOpacity
        key={item.key}
        style={[styles.stat, index < statItems.length - 1 && [styles.statDivider, { borderRightColor: colors.border }]]}
        onPress={() => {
         if (isPrivateLocked) {
          Alert.alert("Private Profile", "Follow to see followers");
          return;
         }

         navigation.navigate("FollowersFollowingScreen", {
          userId: user?._id,
          type: "followers"
         });
        }}
       >
        {statContent}
       </TouchableOpacity>
      );
     }

     if (item.key === "following") {
      return (
       <TouchableOpacity
        key={item.key}
        style={[styles.stat, index < statItems.length - 1 && [styles.statDivider, { borderRightColor: colors.border }]]}
        onPress={() => {
         if (isPrivateLocked) {
          Alert.alert("Private Profile", "Follow to see following");
          return;
         }

         navigation.navigate("FollowersFollowingScreen", {
          userId: user?._id,
          type: "following"
         });
        }}
       >
        {statContent}
       </TouchableOpacity>
      );
     }

     return (
      <View key={item.key} style={[styles.stat, index < statItems.length - 1 && [styles.statDivider, { borderRightColor: colors.border }]]}>
       {statContent}
      </View>
     );
    })}
   </View>
  </LinearGradient>

  <View style={[styles.contentSection, { width: sectionWidth, paddingHorizontal: sectionPadding }]}>
   <View style={styles.bioSection}>
     {user?.name ? <Text style={[styles.name, { color: colors.text }]}>{user.name}</Text> : null}
     {user?.bio ? <Text style={[styles.bio, { color: colors.mutedText }]}>{user.bio}</Text> : null}
    {user?.link ? (
     <Text style={[styles.link, { color: colors.primary }]}>{user.link}</Text>
    ) : null}
   </View>

    <View style={[styles.buttons, isCompact && styles.buttonsCompact]}>
     {isFollowing ? (
      <TouchableOpacity
       activeOpacity={0.7}
       style={[styles.secondaryAction, { borderColor: colors.border, backgroundColor: isDarkMode ? colors.surface : colors.card }]}
       onPress={unfollowUser}
       disabled={actionLoading}
      >
      <Text style={[styles.secondaryActionText, { color: colors.text }]}>Following</Text>
     </TouchableOpacity>
    ) : (
      <TouchableOpacity
       activeOpacity={0.7}
       style={[styles.primaryAction, { backgroundColor: colors.primary }]}
        onPress={followUser}
        disabled={actionLoading}
       >
       <Icon name="person-add-outline" size={18} color="#fff" />
       <Text style={styles.primaryActionText}>
        {actionLoading ? "Loading..." : "Follow"}
       </Text>
      </TouchableOpacity>
    )}

    {!!user?._id && isMutualConnection && (
      <TouchableOpacity
       style={[styles.secondaryAction, { borderColor: colors.border, backgroundColor: isDarkMode ? colors.surface : colors.card }]}
       activeOpacity={0.7}
       onPress={() => navigation.navigate("ChatScreen", {
        userId: user?._id,
       conversationType: user?.category === "Seller" ? "seller" : "direct"
      })}
     >
      <Icon name="chatbubble-ellipses-outline" size={18} color={colors.text} />
      <Text style={[styles.secondaryActionText, { color: colors.text }]}>Message</Text>
     </TouchableOpacity>
    )}
   </View>

   {!!suggestions.length && (
    <View style={[styles.suggestionSection, { borderColor: colors.border, backgroundColor: isDarkMode ? colors.surface : colors.card }]}>
      <View style={styles.suggestionHeader}>
       <Text style={[styles.suggestionTitle, { color: colors.text }]}>
        Discover People
      </Text>

      <TouchableOpacity onPress={() => setShowSuggestions(!showSuggestions)}>
       <Icon
        name={showSuggestions ? "chevron-up" : "chevron-down"}
        size={22}
        color={colors.text}
       />
      </TouchableOpacity>
     </View>

     {showSuggestions ? (
      <FlatList
       data={suggestions}
       renderItem={renderSuggestion}
       keyExtractor={(item) => item._id}
       horizontal
       nestedScrollEnabled
       showsHorizontalScrollIndicator={false}
        contentContainerStyle={suggestionListContentStyle}
      />
     ) : null}
    </View>
   )}
  </View>

  <View style={[styles.tabs, tabsContainerStyle]}>
   {[
     { key: "posts", icon: "grid-outline", label: "Posts" },
     { key: "swipes", icon: "play-circle-outline", label: "Swipes" },
    { key: "tagged", icon: "pricetag-outline", label: "Tagged" },
   ].map((tabItem) => {
     const isActive = activeTab === tabItem.key;
     const tabSurfaceStyle = {
      backgroundColor: isActive ? (isDarkMode ? colors.surface : colors.card) : "transparent",
      borderColor: isActive ? colors.border : "transparent",
     };

     return (
       <TouchableOpacity
        key={tabItem.key}
        style={[styles.tab, tabSurfaceStyle]}
        onPress={() => {
         if (isPrivateLocked) {
          Alert.alert("Private Profile", "Follow to see content");
          return;
         }

         setActiveTab(tabItem.key as ProfilePreviewTab);
        }}
       >
        <Icon
         name={tabItem.icon}
         size={17}
         color={isActive ? colors.primary : colors.mutedText}
        />
        <Text style={isActive ? [styles.activeTab, { color: colors.primary }] : [styles.tabText, { color: colors.mutedText }]}>
          {tabItem.label}
        </Text>
       </TouchableOpacity>
     );
    })}
  </View>
 </>
);

 if (loading) {
  return (
   <View style={styles.screen}>
    <LinearGradient colors={screenGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
     <SafeAreaView style={[styles.center, centerScreenStyle]} edges={["top"]}>
     <ActivityIndicator size="large" color={colors.primary} />
    </SafeAreaView>
   </View>
  );
 }

 if (!user) {
  return (
   <View style={styles.screen}>
    <LinearGradient colors={screenGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
     <SafeAreaView style={[styles.center, centerScreenStyle]} edges={["top"]}>
     <Text style={[styles.emptyTitle, { color: colors.text }]}>Profile unavailable</Text>
     <Text style={[styles.emptyText, { color: colors.mutedText }]}>{errorMessage || "Please try again."}</Text>
     <TouchableOpacity
       style={[styles.followBtn, retryButtonStyle]}
      onPress={() => fetchProfile({ refresh: true }).catch(() => {})}
     >
      <Text style={styles.followText}>Retry</Text>
     </TouchableOpacity>
    </SafeAreaView>
   </View>
  );
 }

 return (
  <View style={styles.screen}>
   <LinearGradient colors={screenGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
   <SafeAreaView style={styles.container} edges={["top"]}>
    <FlatList
     data={previewData}
     renderItem={renderPost}
     keyExtractor={(item) => item._id}
      numColumns={3}
      extraData={activeTab}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      columnWrapperStyle={[styles.postRow, { gap: gridGap, paddingHorizontal: gridSideInset, marginBottom: gridGap }]}
      contentContainerStyle={[
        styles.postsContent,
        { paddingBottom: APP_BOTTOM_DOCK_BASE_HEIGHT + Math.max(insets.bottom, 10) + 40 },
      ]}
      ListHeaderComponent={renderProfileHeader}
     refreshControl={
      <RefreshControl
       refreshing={refreshing}
       onRefresh={() => fetchProfile({ refresh: true }).catch(() => {})}
       tintColor={colors.primary}
      />
     }
     ListEmptyComponent={
       isPrivateLocked ? (
        <View style={[styles.privateContainer, { width: sectionWidth, backgroundColor: isDarkMode ? colors.surface : colors.card, borderColor: colors.border }]}>
        <View style={[styles.privateIconWrap, { backgroundColor: `${colors.primary}16` }]}>
         <Icon name="lock-closed" size={28} color={colors.primary} />
        </View>

        <Text style={[styles.privateTitle, { color: colors.text }]}>
         This account is private
        </Text>

        <Text style={[styles.privateText, { color: colors.mutedText }]}>
         Follow this account to see posts, followers, and activity.
        </Text>
       </View>
       ) : (
        <View style={[styles.emptyState, { width: sectionWidth }]}>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
         {errorMessage
          ? "Content unavailable"
          : activeTab === "tagged"
           ? "No tagged posts yet"
           : activeTab === "swipes"
            ? "No swipes yet"
            : "No posts yet"}
        </Text>
        <Text style={[styles.emptyText, { color: colors.mutedText }]}>
         {errorMessage || (activeTab === "tagged"
          ? "Posts that tag this account will show here."
          : activeTab === "swipes"
           ? "Swipe posts will appear here."
           : "Posts from this account will appear here.")}
        </Text>
       </View>
      )
     }
    />
   </SafeAreaView>
   <AppBottomDock navigation={navigation} activeRouteName="ProfileView" />
  </View>
 );
};

export default ProfilePreviewScreen;

const styles = StyleSheet.create({
 screen: {
  flex: 1
 },

 container: {
  flex: 1,
  backgroundColor: "transparent"
 },

 topHeader: {
  alignSelf: "center",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingHorizontal: 2,
  paddingBottom: 10,
  borderBottomWidth: StyleSheet.hairlineWidth,
 },
 iconButton: {
  borderWidth: StyleSheet.hairlineWidth,
  alignItems: "center",
  justifyContent: "center"
 },
 headerTitleGroup: {
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 12
 },
 headerUserRow: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  maxWidth: "100%"
 },
 headerUsername: {
  fontSize: 17,
  fontWeight: "700",
  maxWidth: "92%"
 },
 headerName: {
  marginTop: 4,
  fontSize: 12.5,
  fontWeight: "600"
 },
 headerSpacer: {},
 lockIcon: {
  marginRight: 4
 },

 heroSection: {
  alignSelf: "center",
  marginTop: 6,
  paddingTop: 18,
  paddingBottom: 20,
  borderWidth: StyleSheet.hairlineWidth,
  borderRadius: 24
 },
 profileCenter: {
  alignItems: "center"
 },
 profileRing: {
  borderWidth: 1,
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 8
 },
 profilePic: {},
 profilePlaceholder: {
  alignItems: "center",
  justifyContent: "center"
 },
 profilePlaceholderText: {
  fontSize: 36,
  fontWeight: "800"
 },
 profileName: {
  fontSize: 24,
  fontWeight: "800",
  textAlign: "center"
 },
 profileHandleText: {
  marginTop: 6,
  fontSize: 14,
  fontWeight: "500",
  textAlign: "center"
 },
 profileBadgeRow: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 14
 },
 privacyBadge: {
  flexDirection: "row",
  alignItems: "center",
  borderWidth: 1,
  paddingHorizontal: 12,
  paddingVertical: 7,
  borderRadius: 999
 },
 privacyBadgeText: {
  marginLeft: 6,
  fontSize: 12,
  fontWeight: "700"
 },

 statsBand: {
  flexDirection: "row",
  width: "100%",
  justifyContent: "space-between",
  marginTop: 22,
  borderWidth: 1,
  borderRadius: 18,
  overflow: "hidden"
 },
 stat: {
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: 16
 },
 statDivider: {
  borderRightWidth: StyleSheet.hairlineWidth
 },
 statNumber: {
  fontWeight: "800",
  fontSize: 20
 },
 statText: {
  marginTop: 4,
  fontSize: 12.5,
  fontWeight: "600"
 },

 contentSection: {
  alignSelf: "center",
  paddingTop: 18
 },
 bioSection: {
  alignItems: "center",
  marginBottom: 4
 },
 name: {
  fontWeight: "700",
  fontSize: 16
 },
 bio: {
  marginTop: 8,
  textAlign: "center",
  lineHeight: 21,
  maxWidth: 420
 },
 link: {
  marginTop: 10,
  fontWeight: "600"
 },

 buttons: {
  flexDirection: "row",
  marginTop: 18,
  gap: 10
 },
 buttonsCompact: {
  flexDirection: "column"
 },
 primaryAction: {
  minHeight: 48,
  borderRadius: 14,
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "row",
  paddingHorizontal: 14
 },
 followBtn: {
  backgroundColor: "#ab2aeb",
  minHeight: 48,
  borderRadius: 14,
  alignItems: "center",
  justifyContent: "center"
 },
 followText: {
  color: "#fff",
  fontWeight: "700"
 },
 primaryActionText: {
  color: "#fff",
  fontWeight: "700",
  marginLeft: 8
 },
 secondaryAction: {
  minHeight: 48,
  borderWidth: 1,
  borderRadius: 14,
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "row",
  paddingHorizontal: 14
 },
 secondaryActionText: {
  marginLeft: 6,
  fontWeight: "700"
 },

 suggestionSection: {
  marginTop: 18,
  marginBottom: 10,
  borderWidth: 1,
  borderRadius: 18,
  paddingVertical: 14
 },
 suggestionListContent: {
  paddingHorizontal: 16,
  paddingRight: 6
 },
 suggestionHeader: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingHorizontal: 16,
  marginBottom: 10
 },
 suggestionTitle: {
  fontSize: 16,
  fontWeight: "700"
 },
 suggestionCard: {
  borderRadius: 18,
  paddingHorizontal: 14,
  paddingTop: 16,
  paddingBottom: 14,
  alignItems: "center",
  marginRight: 12,
  borderWidth: 1
 },
 suggestionAvatar: {
  width: 68,
  height: 68,
  borderRadius: 34,
  marginBottom: 10
 },
 suggestionUsername: {
  fontWeight: "700",
  fontSize: 14
 },
 suggestionName: {
  fontSize: 12,
  marginTop: 4,
  marginBottom: 12
 },
 followSuggestionBtn: {
  minHeight: 34,
  paddingVertical: 7,
  paddingHorizontal: 18,
  borderRadius: 12,
  alignItems: "center",
  justifyContent: "center"
 },
 followSuggestionText: {
  color: "#fff",
  fontWeight: "700",
  fontSize: 13
 },

 tabs: {
  alignSelf: "center",
  flexDirection: "row",
  borderWidth: StyleSheet.hairlineWidth,
  marginTop: 10,
  marginBottom: 8,
  padding: 4,
  borderRadius: 18
 },
 tab: {
  flex: 1,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 44,
  paddingVertical: 10,
  borderRadius: 12,
  borderWidth: 1
 },
 tabText: {
  marginLeft: 6,
  fontSize: 13,
  fontWeight: "600"
 },
 activeTab: {
  marginLeft: 6,
  fontSize: 13,
  fontWeight: "700"
 },

 postsContent: {
  paddingBottom: 32
 },
 postRow: {
  justifyContent: "flex-start"
 },
 postCard: {
  marginBottom: 0
 },
 postImage: {
  width: "100%",
  aspectRatio: 1,
  borderRadius: 10
 },
 postFallback: {
  alignItems: "center",
  justifyContent: "center"
 },

 emptyState: {
  paddingHorizontal: 24,
  paddingVertical: 36,
  alignItems: "center"
 },
 emptyTitle: {
  fontSize: 16,
  fontWeight: "700",
  color: "#111"
 },
 emptyText: {
  marginTop: 8,
  textAlign: "center",
  color: "#666",
  lineHeight: 20
 },
 center: {
  flex: 1,
  justifyContent: "center",
  alignItems: "center"
 },

 privateContainer: {
  alignItems: "center",
  justifyContent: "center",
  marginTop: 40,
  marginHorizontal: 20,
  paddingHorizontal: 24,
  paddingVertical: 28,
  borderWidth: 1,
  borderRadius: 22
 },
 privateIconWrap: {
  width: 60,
  height: 60,
  borderRadius: 30,
  alignItems: "center",
  justifyContent: "center"
 },
 privateTitle: {
  fontSize: 18,
  fontWeight: "700",
  marginTop: 14
 },
 privateText: {
  color: "#777",
  marginTop: 8,
  textAlign: "center",
  lineHeight: 20
 },

});
