import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl
} from "react-native";
import { Alert } from "../utils/appAlert";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import LinearGradient from "react-native-linear-gradient";

import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { appConfig } from "../config/env";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { shareContentLink } from "../utils/shareLinks";
import { useAppTheme } from "../theme/AppThemeContext";
import { normalizeMediaUrl } from "../utils/mediaUrls";
import { shouldShowVerifiedBadge } from "../utils/verificationBadges";
import AppBottomDock, { APP_BOTTOM_DOCK_BASE_HEIGHT } from "../components/AppBottomDock";

interface ProfilePost {
 _id: string;
 image?: string;
 postType?: string;
 media?: Array<{
  url?: string;
  thumbnailUrl?: string;
 }>;
}

interface ProfileUser {
 _id: string;
 name?: string;
 username?: string;
 pronouns?: string;
 bio?: string;
 interests?: string[];
 link?: string;
 profilePic?: string;
 isVerified?: boolean;
 followers?: string[];
 following?: string[];
 isPrivate?: boolean;
 category?: string;
}

type ProfileTab = "posts" | "swipes" | "tagged";

const isReelPost = (post: ProfilePost) => post.postType === "reel";
const MAIN_TAB_ROUTES = ["Feed", "Swipes", "Create", "Chats", "ProfileView"];

const hasMainTabParent = (navigation: any) => {
 let currentNavigation = navigation;

 while (currentNavigation?.getParent) {
  currentNavigation = currentNavigation.getParent();

  const routeNames = currentNavigation?.getState?.()?.routeNames;
  if (
   Array.isArray(routeNames)
   && MAIN_TAB_ROUTES.every((routeName) => routeNames.includes(routeName))
  ) {
   return true;
  }
 }

 return false;
};

const getErrorMessage = (error: unknown) => {
 if (typeof error === "object" && error !== null) {
  const maybeError = error as { response?: { data?: { message?: string } }; message?: string };
  return maybeError.response?.data?.message || maybeError.message || "Unknown error";
 }

 return "Unknown error";
};

const ProfileScreen = ({navigation}: any) => {
 const { colors, isDarkMode } = useAppTheme();
 const insets = useSafeAreaInsets();
 const isInsideTabNavigator = useMemo(() => hasMainTabParent(navigation), [navigation]);

 const [user, setUser] = useState<ProfileUser | null>(null);
 const [allPosts, setAllPosts] = useState<ProfilePost[]>([]);
 const [taggedPosts, setTaggedPosts] = useState<ProfilePost[]>([]);
 const [loading, setLoading] = useState(true);
 const [refreshing, setRefreshing] = useState(false);
 const [privateLoading, setPrivateLoading] = useState(false);
 const [errorMessage, setErrorMessage] = useState("");
 const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
 const [isPrivate, setIsPrivate] = useState(false);
 const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

 const fetchProfile = useCallback(async (showRefreshing = false) => {

 try {
   if (showRefreshing) {
    setRefreshing(true);
   } else {
    setLoading(true);
   }
   const profileRes = await API.get("/auth/profile");

   const profileUser = (profileRes.data.user || null) as ProfileUser | null;
   setUser(profileUser);
   setIsPrivate(!!profileUser?.isPrivate);

   if (profileUser?._id) {
    const [postsRes, taggedRes] = await Promise.allSettled([
      API.get(`/posts/user/${profileUser._id}`),
      API.get(`/posts/tagged/${profileUser._id}`),
    ]);

    setAllPosts(
      postsRes.status === "fulfilled" ? ((postsRes.value.data.posts || []) as ProfilePost[]) : [],
    );
    setTaggedPosts(
      taggedRes.status === "fulfilled" ? ((taggedRes.value.data.posts || []) as ProfilePost[]) : [],
    );
   } else {
    setAllPosts([]);
    setTaggedPosts([]);
   }

   setErrorMessage("");

  } catch (error) {
   console.log("Profile Error:", getErrorMessage(error));
   setUser(null);
   setAllPosts([]);
   setTaggedPosts([]);
   setErrorMessage(getReadableApiErrorMessage(error, "Could not load your profile right now."));
  } finally {
   setLoading(false);
   setRefreshing(false);
  }

 }, []);

 useEffect(() => {
  fetchProfile();
 }, [fetchProfile]);

 useEffect(() => {
  setAvatarLoadFailed(false);
 }, [user?.profilePic]);

 useFocusEffect(
  useCallback(() => {
   fetchProfile().catch(() => {});
  }, [fetchProfile]),
 );

 const onRefresh = useCallback(async () => {
  await fetchProfile(true);
 }, [fetchProfile]);

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
  const profileName = user?.name || "User Name";
 const profileHandle = user?.username ? `@${user.username}` : "Complete your profile";
 const profileMeta = [user?.pronouns].filter(Boolean).join(" | ");
 const profileInitial = (profileName.trim().charAt(0) || "U").toUpperCase();
 const showProfileImage = Boolean(user?.profilePic) && !avatarLoadFailed;
 const screenGradient = isDarkMode
  ? ["#120A20", "#1A1030", "#0F1322"]
  : ["#FBF7FF", "#F4ECFF", "#F8FAFF"];
 const heroGradient = isDarkMode
  ? ["rgba(155,77,255,0.28)", "rgba(155,77,255,0.10)", "rgba(255,255,255,0.02)"]
  : ["rgba(155,77,255,0.18)", "rgba(155,77,255,0.08)", "rgba(255,255,255,0.84)"];
 const statItems = [
  { key: "posts", label: "Posts", value: totalPostCount, onPress: undefined },
  {
   key: "followers",
   label: "Followers",
   value: user?.followers?.length || 0,
   onPress: () =>
    navigation.navigate("FollowersFollowingScreen", {
     userId: user?._id,
     type: "followers"
    }),
  },
  {
   key: "following",
   label: "Following",
   value: user?.following?.length || 0,
   onPress: () =>
    navigation.navigate("FollowersFollowingScreen", {
     userId: user?._id,
     type: "following"
    }),
  },
 ];

const getPostPreviewUrl = (post: ProfilePost): string =>
  normalizeMediaUrl(
    post.media?.[0]?.thumbnailUrl ||
      post.media?.[0]?.url ||
      post.image ||
      "",
  );

 const togglePrivateProfile = async () => {
  if (privateLoading) {
   return;
  }

 try {
   setPrivateLoading(true);
   const res = await API.post("/auth/toggle-private");

   const nextValue = !!res?.data?.isPrivate;
   setIsPrivate(nextValue);

   Alert.alert(
    "Profile Updated",
    nextValue ? "Your profile is now Private" : "Your profile is now Public"
   );
 } catch (error) {
   Alert.alert("Error", getReadableApiErrorMessage(error, "Unable to change profile privacy."));
   console.log("Private Toggle Error:", getErrorMessage(error));
  } finally {
   setPrivateLoading(false);
  }
 };

 const handleShareProfile = async () => {
  try {
   const profileSlug = user?.username ? user.username : user?._id;
   const shareBase = (appConfig.publicShareBaseUrl || "https://aline2.com").replace(/\/+$/, "");
   const profileUrl = profileSlug ? `${shareBase}/profile/${profileSlug}` : shareBase;

   await shareContentLink({
    originalUrl: profileUrl,
    title: user?.name || "Aline2 Profile",
    description: user?.bio || "",
    fallbackMessage: user?.name
     ? `Check out ${user.name}'s profile on Aline2\n\n${profileUrl}`
     : `Check out this profile on Aline2\n\n${profileUrl}`,
   });
  } catch (error) {
   console.log("Profile share error:", getErrorMessage(error));
   Alert.alert("Error", "Unable to share profile right now");
  }
 };

 const renderPost = ({ item }: { item: ProfilePost }) => (
  <TouchableOpacity
   activeOpacity={0.9}
   style={styles.postCard}
   onPress={() => navigation.navigate("PostDetail", { postId: item._id })}
  >
   {getPostPreviewUrl(item) ? (
    <Image
     source={{
      uri: getPostPreviewUrl(item)
     }}
     style={styles.postImage}
    />
   ) : (
    <View style={[styles.postImage, styles.postFallback]}>
      <Icon name="image-outline" size={22} color={colors.mutedText} />
    </View>
   )}
  </TouchableOpacity>
 );

 const renderHeader = () => (
  <>
   <View style={[styles.topHeader, { paddingTop: Math.max(insets.top, 16) }]}>

   <TouchableOpacity style={[styles.iconButton, { backgroundColor: isDarkMode ? colors.surface : colors.card, borderColor: colors.border }]} onPress={() => navigation.goBack()}>
     <Icon name="arrow-back" size={26} color={colors.text} />
    </TouchableOpacity>

    <View style={styles.headerTitleGroup}>
     <Text
      numberOfLines={1}
      ellipsizeMode="tail"
      style={[styles.headerUsername, { color: colors.text }]}
     >
      {profileName}
     </Text>
     <Text numberOfLines={1} style={[styles.headerSubtext, { color: colors.mutedText }]}>
      {profileHandle}
     </Text>
    </View>

    <TouchableOpacity
     style={[styles.iconButton, { backgroundColor: isDarkMode ? colors.surface : colors.card, borderColor: colors.border }]}
     onPress={() => navigation.navigate("SettingsScreen")}
    >
     <Icon name="menu" size={24} color={colors.text} />
    </TouchableOpacity>

   </View>

   <LinearGradient
    colors={heroGradient}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={[styles.heroSection, { borderColor: colors.border, backgroundColor: colors.card }]}
   >
    <View style={styles.profileCenter}>
     <View style={[styles.profileRing, { borderColor: colors.border, backgroundColor: isDarkMode ? colors.surface : colors.card }]}>
      {showProfileImage ? (
       <Image
        source={{
         uri: user?.profilePic || DEFAULT_AVATAR_URL
        }}
        style={styles.profilePic}
        onError={() => setAvatarLoadFailed(true)}
       />
      ) : (
       <View style={[styles.profilePlaceholder, { backgroundColor: `${colors.primary}18` }]}>
        <Text style={[styles.profilePlaceholderText, { color: colors.primary }]}>{profileInitial}</Text>
       </View>
      )}
     </View>

     <Text style={[styles.profileName, { color: colors.text }]}>
      {profileName}
     </Text>

     <Text style={[styles.profileHandle, { color: colors.mutedText }]}>{profileHandle}</Text>

     <View style={styles.profileBadgeRow}>
      {shouldShowVerifiedBadge(user) ? (
       <View style={[styles.verifiedBadge, { backgroundColor: colors.primary }]}>
        <Icon name="checkmark-circle" size={16} color="#fff"/>
        <Text style={styles.verifiedText}>
         Verified
        </Text>
       </View>
      ) : null}

      <View
       style={[
        styles.privacyBadge,
        {
         backgroundColor: isPrivate ? colors.primary : isDarkMode ? colors.surface : colors.card,
         borderColor: isPrivate ? colors.primary : colors.border,
        },
       ]}
      >
       <Icon name={isPrivate ? "lock-closed" : "globe-outline"} size={14} color={isPrivate ? "#fff" : colors.text} />
       <Text style={[styles.privacyBadgeText, { color: isPrivate ? "#fff" : colors.text }]}>
        {isPrivate ? "Private profile" : "Public profile"}
       </Text>
      </View>
     </View>
    </View>

    <View style={[styles.statsBand, { backgroundColor: isDarkMode ? colors.surface : colors.card, borderColor: colors.border }]}>
     {statItems.map((item, index) => {
      const content = (
       <>
        <Text style={[styles.statNumber, { color: colors.text }]}>{item.value}</Text>
        <Text style={[styles.statText, { color: colors.mutedText }]}>{item.label}</Text>
       </>
      );

      if (item.onPress) {
       return (
        <TouchableOpacity key={item.key} style={[styles.stat, index < statItems.length - 1 && [styles.statDivider, { borderRightColor: colors.border }]]} onPress={item.onPress}>
         {content}
        </TouchableOpacity>
       );
      }

      return (
       <View key={item.key} style={[styles.stat, index < statItems.length - 1 && [styles.statDivider, { borderRightColor: colors.border }]]}>
        {content}
       </View>
      );
     })}
    </View>
   </LinearGradient>

   <View style={[styles.contentSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
    {!!(user?.bio || profileMeta || user?.interests?.length) && (
     <View style={styles.bioSection}>
      {profileMeta ? (
       <Text style={[styles.metaLine, { color: colors.mutedText }]}>{profileMeta}</Text>
      ) : null}

      {user?.bio ? (
       <Text style={[styles.bioText, { color: colors.text }]}>{user.bio}</Text>
      ) : null}

      {user?.link ? (
       <Text style={[styles.link, { color: colors.primary }]}>{user.link}</Text>
      ) : null}

      {!!user?.interests?.length && (
       <View style={styles.interestsRow}>
        {user.interests.map((interest) => (
         <View
          key={interest}
          style={[
           styles.interestChip,
           {
            backgroundColor: isDarkMode ? colors.surface : colors.card,
            borderColor: colors.border,
           },
          ]}
         >
          <Text style={[styles.interestText, { color: colors.primary }]}>{interest}</Text>
         </View>
        ))}
       </View>
      )}
     </View>
    )}

    <View style={styles.buttons}>
     <TouchableOpacity
      style={[styles.primaryAction, { backgroundColor: colors.primary }]}
      onPress={()=> navigation.navigate("Profile")}
     >
      <Icon name="create-outline" size={16} color="#fff" />
      <Text style={styles.primaryActionText}>Edit Profile</Text>
     </TouchableOpacity>

     <TouchableOpacity
      style={[styles.secondaryAction, { backgroundColor: isDarkMode ? colors.surface : colors.card, borderColor: colors.border }]}
      onPress={handleShareProfile}
     >
      <Icon name="share-social-outline" size={16} color={colors.text} />
      <Text style={[styles.secondaryActionText, { color: colors.text }]}>Share</Text>
     </TouchableOpacity>

     <TouchableOpacity
      style={[
       styles.secondaryAction,
       { backgroundColor: isDarkMode ? colors.surface : colors.card, borderColor: colors.border },
       isPrivate ? [styles.privateOnBtn, { borderColor: colors.primary, backgroundColor: `${colors.primary}16` }] : null,
      ]}
      onPress={togglePrivateProfile}
      disabled={privateLoading}
     >
      <Icon name={isPrivate ? "lock-closed-outline" : "globe-outline"} size={16} color={isPrivate ? colors.primary : colors.text} />
      <Text style={[styles.secondaryActionText, { color: isPrivate ? colors.primary : colors.text }]}>
       {privateLoading ? "Updating" : isPrivate ? "Private" : "Public"}
      </Text>
     </TouchableOpacity>
    </View>

    <View style={styles.quickGrid}>
     <TouchableOpacity
      style={[styles.quickAction, { borderColor: colors.border, backgroundColor: isDarkMode ? colors.surface : colors.card }]}
      onPress={() => navigation.navigate("WalletScreen")}
     >
      <Icon name="wallet-outline" size={16} color={colors.text} />
      <Text style={[styles.quickActionText, { color: colors.text }]}>
       User Dashboard
      </Text>
     </TouchableOpacity>

     <TouchableOpacity
      style={[styles.quickAction, { borderColor: colors.border, backgroundColor: isDarkMode ? colors.surface : colors.card }]}
      onPress={() => navigation.navigate("SavedPosts")}
     >
      <Icon name="bookmark-outline" size={18} color={colors.text} />
      <Text style={[styles.quickActionText, { color: colors.text }]}>Saved Posts</Text>
     </TouchableOpacity>

     <TouchableOpacity
      style={[styles.quickAction, { borderColor: colors.border, backgroundColor: isDarkMode ? colors.surface : colors.card }]}
      onPress={() => navigation.navigate("PostArchive")}
     >
      <Icon name="archive-outline" size={18} color={colors.text} />
      <Text style={[styles.quickActionText, { color: colors.text }]}>Post Archive</Text>
     </TouchableOpacity>

     <TouchableOpacity
      style={[styles.quickAction, { borderColor: colors.border, backgroundColor: isDarkMode ? colors.surface : colors.card }]}
      onPress={() => navigation.navigate("StoryArchive")}
     >
      <Icon name="time-outline" size={18} color={colors.text} />
      <Text style={[styles.quickActionText, { color: colors.text }]}>Story Archive</Text>
     </TouchableOpacity>
    </View>
   </View>

   <View style={[styles.tabs, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    {[
     { key: "posts", label: "Posts", icon: "grid-outline" },
    { key: "swipes", label: "Swipes", icon: "flame-outline" },
     { key: "tagged", label: "Tagged", icon: "pricetag-outline" },
    ].map((tabItem) => {
     const isActive = activeTab === tabItem.key;

     return (
      <TouchableOpacity
       key={tabItem.key}
       style={[
        styles.tab,
        {
         backgroundColor: isActive ? (isDarkMode ? colors.surface : colors.card) : "transparent",
         borderColor: isActive ? colors.border : "transparent",
        },
       ]}
       onPress={() => setActiveTab(tabItem.key as ProfileTab)}
      >
       <Icon name={tabItem.icon} size={16} color={isActive ? colors.primary : colors.mutedText} />
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
     <View style={[styles.center, { backgroundColor: "transparent" }]}>
      <ActivityIndicator size="large" color={colors.primary} />
     </View>
     {!isInsideTabNavigator ? <AppBottomDock navigation={navigation} activeRouteName="ProfileView" /> : null}
    </View>
   );
  }

 if (!user && errorMessage) {
  return (
   <View style={styles.screen}>
    <LinearGradient colors={screenGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
     <View style={[styles.center, { backgroundColor: "transparent", paddingHorizontal: 24 }]}>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>Profile unavailable</Text>
      <Text style={[styles.emptyText, { color: colors.mutedText }]}>{errorMessage}</Text>
      <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={() => fetchProfile()}>
        <Text style={styles.retryButtonText}>Retry</Text>
       </TouchableOpacity>
     </View>
     {!isInsideTabNavigator ? <AppBottomDock navigation={navigation} activeRouteName="ProfileView" /> : null}
    </View>
   );
  }

 return (
  <View style={styles.screen}>
   <LinearGradient colors={screenGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
   <FlatList
    data={posts}
    renderItem={renderPost}
    keyExtractor={(item) => item._id}
    numColumns={3}
    extraData={activeTab}
    style={styles.container}
    contentContainerStyle={[
      styles.listContent,
      {
        paddingBottom: isInsideTabNavigator
          ? Math.max(insets.bottom, 10) + 28
          : APP_BOTTOM_DOCK_BASE_HEIGHT + Math.max(insets.bottom, 10) + 56,
      },
    ]}
    ListHeaderComponent={renderHeader}
    ListEmptyComponent={
     <View style={styles.emptyState}>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
       {activeTab === "tagged" ? "No tagged posts yet" : activeTab === "swipes" ? "No swipes yet" : "No posts yet"}
      </Text>
      <Text style={[styles.emptyText, { color: colors.mutedText }]}>
       {errorMessage
        ? errorMessage
        : activeTab === "tagged"
        ? "Posts where you are tagged will show up here."
        : activeTab === "swipes"
         ? "Your short video posts will appear here."
         : "Share photos and videos to build your profile."}
      </Text>
      {errorMessage ? (
        <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={() => fetchProfile()}>
         <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
     </View>
    }
    showsVerticalScrollIndicator={false}
     refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    />
    {!isInsideTabNavigator ? <AppBottomDock navigation={navigation} activeRouteName="ProfileView" /> : null}
   </View>
  );
 };

export default ProfileScreen;

const styles = StyleSheet.create({
 screen:{
  flex:1
 },

 container:{
  flex:1,
  backgroundColor:"transparent"
 },
 listContent:{
  paddingBottom:128
 },

 topHeader:{
  flexDirection:"row",
  alignItems:"center",
  justifyContent:"space-between",
  paddingHorizontal:14,
  paddingBottom:12,
 },
 iconButton:{
  width:40,
  height:40,
  borderRadius:20,
  borderWidth:StyleSheet.hairlineWidth,
  alignItems:"center",
  justifyContent:"center"
 },
 headerTitleGroup:{
  flex:1,
  alignItems:"center",
  paddingHorizontal:12
 },

 headerUsername:{
  fontSize:18,
  fontWeight:"700",
  maxWidth:"100%"
 },
 headerSubtext:{
  marginTop:2,
  fontSize:12,
  fontWeight:"600"
 },

 heroSection:{
  marginHorizontal:14,
  marginTop:8,
  paddingHorizontal:20,
  paddingTop:22,
  paddingBottom:22,
  borderRadius:30,
  borderWidth:StyleSheet.hairlineWidth,
  shadowColor:"#0F172A",
  shadowOpacity:0.08,
  shadowRadius:18,
  shadowOffset:{ width:0, height:10 },
  elevation:4
 },

 profileCenter:{
  alignItems:"center"
 },
 profileRing:{
  width:124,
  height:124,
  borderRadius:62,
  borderWidth:1,
  alignItems:"center",
  justifyContent:"center",
  marginBottom:4
 },

 profilePic:{
  width:110,
  height:110,
  borderRadius:60
 },
 profilePlaceholder:{
  width:110,
  height:110,
  borderRadius:60,
  alignItems:"center",
  justifyContent:"center"
 },
 profilePlaceholderText:{
  fontSize:42,
  fontWeight:"800"
 },

 profileName:{
  fontSize:22,
  fontWeight:"700",
  marginTop:10
 },

 profileHandle:{
  marginTop:6,
  fontSize:14,
  fontWeight:"500"
 },
 profileBadgeRow:{
  flexDirection:"row",
  alignItems:"center",
  justifyContent:"center",
  flexWrap:"wrap",
  marginTop:10
 },

 verifiedBadge:{
  flexDirection:"row",
  alignItems:"center",
  paddingHorizontal:12,
  paddingVertical:6,
  borderRadius:20,
  marginRight:8,
  marginBottom:8
 },

 verifiedText:{
  color:"#fff",
  marginLeft:5,
  fontSize:12,
  fontWeight:"600"
 },
 privacyBadge:{
  flexDirection:"row",
  alignItems:"center",
  borderWidth:1,
  paddingHorizontal:12,
  paddingVertical:6,
  borderRadius:20,
  marginBottom:8
 },
 privacyBadgeText:{
  marginLeft:6,
  fontSize:12,
  fontWeight:"700"
 },

 statsBand:{
  flexDirection:"row",
  justifyContent:"space-between",
  width:"100%",
  marginTop:22,
  borderWidth:1,
  borderRadius:20,
  overflow:"hidden"
 },

 stat:{
  flex:1,
  alignItems:"center",
  justifyContent:"center",
  paddingVertical:16
 },
 statDivider:{
  borderRightWidth:StyleSheet.hairlineWidth
 },

 statNumber:{
  fontWeight:"bold",
  fontSize:20
 },

 statText:{
  marginTop:4,
  color:"#444",
  fontSize:12,
  fontWeight:"600"
 },

bioSection: {
  alignItems: "center",
  justifyContent: "center",
},

 contentSection:{
  marginHorizontal:14,
  marginTop:14,
  paddingHorizontal:20,
  paddingTop:18,
  paddingBottom:10,
  borderWidth:StyleSheet.hairlineWidth,
  borderRadius:28,
  shadowColor:"#0F172A",
  shadowOpacity:0.05,
  shadowRadius:16,
  shadowOffset:{ width:0, height:8 },
  elevation:3
 },

 metaLine:{
  fontSize:13,
  fontWeight:"600",
  textAlign:"center"
 },
 bioText:{
  marginTop:8,
  fontSize:14,
  lineHeight:22,
  textAlign:"center"
 },

 link:{
  marginTop:10,
  fontWeight:"600"
 },
 interestsRow:{
  flexDirection:"row",
  flexWrap:"wrap",
  justifyContent:"center",
  marginTop:14
 },
 interestChip:{
  borderWidth:1,
  borderRadius:999,
  paddingHorizontal:12,
  paddingVertical:7,
  marginRight:8,
  marginBottom:8
 },
 interestText:{
  fontWeight:"600",
  fontSize:12
 },

 buttons:{
  flexDirection:"row",
  paddingTop:16,
  gap:8
 },

 primaryAction:{
  minHeight:42,
  borderRadius:12,
  flex:1.2,
  alignItems:"center",
  justifyContent:"center",
  flexDirection:"row"
 },
 primaryActionText:{
  color:"#fff",
  fontWeight:"700",
  marginLeft:6,
  fontSize:13
 },

 secondaryAction:{
  minHeight:42,
  borderWidth:1,
  borderRadius:12,
  flex:1,
  alignItems:"center",
  justifyContent:"center",
  flexDirection:"row"
 },
 privateOnBtn:{
  borderWidth:1
 },
 secondaryActionText:{
  fontWeight:"700",
  marginLeft:5,
  fontSize:12
 },

 quickGrid:{
  flexDirection:"row",
  flexWrap:"wrap",
  justifyContent:"space-between",
  marginTop:16
 },
 quickAction:{
  width:"48.5%",
  borderWidth:1,
  borderRadius:14,
  paddingVertical:12,
  paddingHorizontal:10,
  marginBottom:12,
  alignItems:"center",
  justifyContent:"center",
  flexDirection:"row"
 },
 quickActionText:{
  marginLeft:6,
  fontWeight:"600",
  fontSize:12
 },

 tabs:{
  flexDirection:"row",
  marginTop:14,
  marginHorizontal:14,
  marginBottom:8,
  padding:5,
  borderWidth:StyleSheet.hairlineWidth,
  borderRadius:22
 },

 tab:{
  flex:1,
  flexDirection:"row",
  alignItems:"center",
  justifyContent:"center",
  paddingVertical:10,
  borderRadius:12,
  borderWidth:1
 },

 tabText:{
  color:"#888",
  marginLeft:6,
  fontWeight:"600"
 },

 activeTab:{
  color:"#000",
  marginLeft:6,
  fontWeight:"700"
 },

 postImage:{
   width:"100%",
  aspectRatio:1,
  borderRadius:6
 },
 postCard:{
  width:"33.3333%",
  padding:2
 },
 postFallback:{
  alignItems:"center",
  justifyContent:"center",
  backgroundColor:"#F3F4F6"
 },
 emptyState:{
  paddingHorizontal:24,
  paddingVertical:36,
  alignItems:"center"
 },
 emptyTitle:{
  fontSize:16,
  fontWeight:"700"
 },
 emptyText:{
  marginTop:8,
  textAlign:"center",
  lineHeight:20
 },
 retryButton:{
   marginTop:16,
   borderRadius:999,
   paddingHorizontal:16,
   paddingVertical:10
 },
 retryButtonText:{
  color:"#fff",
  fontWeight:"700"
 },

 center:{
  flex:1,
  justifyContent:"center",
  alignItems:"center"
 }

});
