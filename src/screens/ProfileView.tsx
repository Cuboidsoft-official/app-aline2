import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
 View,
 Text,
 StyleSheet,
 Image,
 TouchableOpacity,
 FlatList,
 Alert,
 ActivityIndicator,
 RefreshControl
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";

import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { appConfig } from "../config/env";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { shareContentLink } from "../utils/shareLinks";
import { useAppTheme } from "../theme/AppThemeContext";

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
}

type ProfileTab = "posts" | "swipes" | "tagged";

const isReelPost = (post: ProfilePost) => post.postType === "reel";

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

 const [user, setUser] = useState<ProfileUser | null>(null);
 const [allPosts, setAllPosts] = useState<ProfilePost[]>([]);
 const [taggedPosts, setTaggedPosts] = useState<ProfilePost[]>([]);
 const [loading, setLoading] = useState(true);
 const [refreshing, setRefreshing] = useState(false);
 const [privateLoading, setPrivateLoading] = useState(false);
 const [errorMessage, setErrorMessage] = useState("");
 const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
 const [isPrivate, setIsPrivate] = useState(false);

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

const getPostPreviewUrl = (post: ProfilePost): string =>
  post.media?.[0]?.thumbnailUrl ||
  post.media?.[0]?.url ||
  post.image ||
  DEFAULT_AVATAR_URL;

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
   <Image
    source={{
     uri: getPostPreviewUrl(item)
    }}
    style={styles.postImage}
   />
  </TouchableOpacity>
 );

 const renderHeader = () => (
  <>
   <View style={[styles.topHeader, { paddingTop: Math.max(insets.top, 16), borderColor: colors.border }]}>

   <TouchableOpacity onPress={() => navigation.goBack()}>
     <Icon name="arrow-back" size={26} color={colors.text} />
    </TouchableOpacity>

    <Text
     numberOfLines={1}
     ellipsizeMode="tail"
     style={[styles.headerUsername, { color: colors.text }]}
    >
     {user?.name || "User Name"}
    </Text>

    <TouchableOpacity onPress={() => navigation.navigate("SettingsScreen")}>
     <Icon name="menu" size={28} color={colors.text} />
    </TouchableOpacity>

   </View>

   <View style={styles.header}>

    <View style={styles.profileCenter}>

     <Image
      source={{
        uri:
        user?.profilePic
         ? user.profilePic
         : DEFAULT_AVATAR_URL
      }}
      style={styles.profilePic}
     />

     <Text style={[styles.profileName, { color: colors.text }]}>
      {user?.name || "User Name"}
     </Text>

     {user?.username ? (
      <Text style={[styles.profileHandle, { color: colors.mutedText }]}>@{user.username}</Text>
     ) : null}

     {user?.isVerified ? (
      <View style={[styles.verifiedBadge, { backgroundColor: colors.primary }]}>
       <Icon name="checkmark-circle" size={16} color="#fff"/>
       <Text style={styles.verifiedText}>
        Verified account
       </Text>
      </View>
     ) : null}

    </View>

    <View style={styles.stats}>

     <View style={styles.stat}>
     <Text style={[styles.statNumber, { color: colors.text }]}>{totalPostCount}</Text>
      <Text style={[styles.statText, { color: colors.mutedText }]}>Posts</Text>
     </View>

     <TouchableOpacity
      style={styles.stat}
      onPress={() =>
       navigation.navigate("FollowersFollowingScreen", {
        userId: user?._id,
        type: "followers"
       })
      }
     >
     <Text style={[styles.statNumber, { color: colors.text }]}>{user?.followers?.length || 0}</Text>
     <Text style={[styles.statText, { color: colors.mutedText }]}>Followers</Text>
     </TouchableOpacity>

     <TouchableOpacity
      style={styles.stat}
      onPress={() =>
       navigation.navigate("FollowersFollowingScreen", {
        userId: user?._id,
        type: "following"
       })
      }
     >
     <Text style={[styles.statNumber, { color: colors.text }]}>{user?.following?.length || 0}</Text>
     <Text style={[styles.statText, { color: colors.mutedText }]}>Following</Text>
     </TouchableOpacity>

    </View>

   </View>

   <View style={styles.bioSection}>
    <Text style={[styles.name, { color: colors.text }]}>
     {user?.pronouns || ""} {user?.name || ""}
    </Text>

    <Text style={{ color: colors.text }}>{user?.bio || ""}</Text>

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

   <View style={styles.buttons}>

    <TouchableOpacity
     style={[styles.editBtn, { backgroundColor: isDarkMode ? colors.surface : colors.card, borderColor: colors.border }]}
     onPress={()=> navigation.navigate("Profile")}
    >
     <Text style={[styles.btnText, { color: colors.text }]}>Edit Profile</Text>
    </TouchableOpacity>

    <TouchableOpacity
     style={[styles.shareBtn, { backgroundColor: isDarkMode ? colors.surface : colors.card, borderColor: colors.border }]}
     onPress={handleShareProfile}
    >
     <Text style={[styles.btnText, { color: colors.text }]}>Share Profile</Text>
    </TouchableOpacity>

    <TouchableOpacity
     style={[
      styles.shareBtn,
      { backgroundColor: isDarkMode ? colors.surface : colors.card, borderColor: colors.border },
      isPrivate ? [styles.privateOnBtn, { borderColor: colors.primary, backgroundColor: colors.primary }] : null,
     ]}
     onPress={togglePrivateProfile}
     disabled={privateLoading}
    >
     <Text style={[styles.btnText, { color: isPrivate ? "#fff" : colors.text }]}>
      {privateLoading ? "Updating..." : isPrivate ? "Private" : "Public"}
     </Text>
   </TouchableOpacity>

  </View>

   <TouchableOpacity
    style={[styles.requestsBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
    onPress={() => navigation.navigate("ServiceRequestsScreen", { mode: "user" })}
   >
    <Icon name="briefcase-outline" size={18} color={colors.text} />
    <Text style={[styles.requestsBtnText, { color: colors.text }]}>My Requests</Text>
   </TouchableOpacity>

   <View style={styles.archiveRow}>
    <TouchableOpacity
     style={[styles.archiveButton, { borderColor: colors.border, backgroundColor: colors.card }]}
     onPress={() => navigation.navigate("PostArchive")}
    >
     <Icon name="archive-outline" size={18} color={colors.text} />
     <Text style={[styles.archiveButtonText, { color: colors.text }]}>Post Archive</Text>
    </TouchableOpacity>

    <TouchableOpacity
     style={[styles.archiveButton, { borderColor: colors.border, backgroundColor: colors.card }]}
     onPress={() => navigation.navigate("StoryArchive")}
    >
     <Icon name="time-outline" size={18} color={colors.text} />
     <Text style={[styles.archiveButtonText, { color: colors.text }]}>Story Archive</Text>
    </TouchableOpacity>
   </View>

   <View style={styles.tabs}>

    <TouchableOpacity
     style={styles.tab}
     onPress={() => setActiveTab("posts")}
    >
     <Text style={activeTab === "posts" ? [styles.activeTab, { color: colors.primary }] : [styles.tabText, { color: colors.mutedText }]}>
      POSTS
     </Text>
    </TouchableOpacity>

    <TouchableOpacity
     style={styles.tab}
     onPress={() => setActiveTab("swipes")}
    >
     <Text style={activeTab === "swipes" ? [styles.activeTab, { color: colors.primary }] : [styles.tabText, { color: colors.mutedText }]}>
      Swipes
     </Text>
    </TouchableOpacity>

    <TouchableOpacity
     style={styles.tab}
     onPress={() => setActiveTab("tagged")}
    >
     <Text style={activeTab === "tagged" ? [styles.activeTab, { color: colors.primary }] : [styles.tabText, { color: colors.mutedText }]}>
      TAGGED
     </Text>
    </TouchableOpacity>

   </View>
  </>
 );

 if (loading) {
  return (
   <View style={[styles.center, { backgroundColor: colors.background }]}>
    <ActivityIndicator size="large" color={colors.primary} />
   </View>
  );
 }

 if (!user && errorMessage) {
  return (
   <View style={[styles.center, { backgroundColor: colors.background, paddingHorizontal: 24 }]}>
    <Text style={[styles.emptyTitle, { color: colors.text }]}>Profile unavailable</Text>
    <Text style={[styles.emptyText, { color: colors.mutedText }]}>{errorMessage}</Text>
    <TouchableOpacity style={styles.retryButton} onPress={() => fetchProfile()}>
     <Text style={styles.retryButtonText}>Retry</Text>
    </TouchableOpacity>
   </View>
  );
 }

 return (
  <FlatList
   data={posts}
   renderItem={renderPost}
   keyExtractor={(item) => item._id}
   numColumns={3}
   extraData={activeTab}
   style={[styles.container, { backgroundColor: colors.background }]}
   contentContainerStyle={styles.listContent}
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
      <TouchableOpacity style={styles.retryButton} onPress={() => fetchProfile()}>
       <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
     ) : null}
    </View>
   }
   showsVerticalScrollIndicator={false}
   refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
  />
 );
};

export default ProfileScreen;

const styles = StyleSheet.create({

 container:{
  flex:1,
  backgroundColor:"#fff"
 },
 listContent:{
  paddingBottom:24
 },

 topHeader:{
  flexDirection:"row",
  alignItems:"center",
  justifyContent:"space-between",
  paddingHorizontal:15,
  paddingTop:16,
  paddingBottom:10,
  borderBottomWidth:1,
  borderColor:"#eee"
 },

 headerUsername:{
  fontSize:18,
  fontWeight:"600",
  maxWidth:"60%"
 },

 header:{
  alignItems:"center",
  padding:20
 },

 profileCenter:{
  alignItems:"center"
 },

 profilePic:{
  width:110,
  height:110,
  borderRadius:60
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

 verifiedBadge:{
  flexDirection:"row",
  alignItems:"center",
  backgroundColor:"#a020f0",
  paddingHorizontal:10,
  paddingVertical:4,
  borderRadius:20,
  marginTop:5
 },

 verifiedText:{
  color:"#fff",
  marginLeft:5,
  fontSize:12,
  fontWeight:"600"
 },

 stats:{
  flexDirection:"row",
  justifyContent:"space-around",
  width:"100%",
  marginTop:20
 },

 stat:{
  alignItems:"center"
 },

 statNumber:{
  fontWeight:"bold",
  fontSize:18
 },

 statText:{
  color:"#444"
 },

bioSection: {
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 20,
},

 name:{
  fontWeight:"bold",
  fontSize:15,
  marginBottom:3
 },

 link:{
  color:"#1877f2",
  marginTop:2
 },
 interestsRow:{
  flexDirection:"row",
  flexWrap:"wrap",
  justifyContent:"center",
  marginTop:10
 },
 interestChip:{
  backgroundColor:"#F1EDFF",
  borderRadius:16,
  paddingHorizontal:10,
  paddingVertical:6,
  marginRight:8,
  marginBottom:8
 },
 interestText:{
  color:"#6847E3",
  fontWeight:"600",
  fontSize:12
 },

 buttons:{
  flexDirection:"row",
  padding:15
 },

 editBtn:{
  borderWidth:1,
  borderColor:"#ccc",
  padding:8,
  borderRadius:6,
  flex:1,
  marginRight:5,
  alignItems:"center"
 },

 shareBtn:{
  borderWidth:1,
  borderColor:"#ccc",
  padding:8,
  borderRadius:6,
  flex:1,
  marginLeft:5,
  alignItems:"center"
 },
 privateOnBtn:{
  borderColor:"#8bbdff",
  backgroundColor:"#eef6ff"
 },

 btnText:{
  fontWeight:"500"
 },
 requestsBtn:{
  marginHorizontal:20,
  marginBottom:14,
  backgroundColor:"#f1f1f1",
  borderRadius:12,
  paddingVertical:12,
  alignItems:"center",
  justifyContent:"center",
  flexDirection:"row"
 },
 requestsBtnText:{
  marginLeft:8,
  color:"#333",
  fontWeight:"600"
 },
 archiveRow:{
  flexDirection:"row",
  paddingHorizontal:20,
  gap:10,
  marginBottom:14
 },
 archiveButton:{
  flex:1,
  borderWidth:1,
  borderRadius:12,
  paddingVertical:12,
  alignItems:"center",
  justifyContent:"center",
  flexDirection:"row"
 },
 archiveButtonText:{
  marginLeft:8,
  fontWeight:"600"
 },

 tabs:{
  flexDirection:"row",
  borderTopWidth:1,
  borderColor:"#eee",
  borderBottomWidth:1
 },

 tab:{
  flex:1,
  alignItems:"center",
  padding:10
 },

 tabText:{
  color:"#888"
 },

 activeTab:{
  color:"#000",
  fontWeight:"bold"
 },

 postImage:{
  width:"100%",
  aspectRatio:1
 },
 postCard:{
  width:"33.3333%",
  padding:1
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
  backgroundColor:"#7B4DFF",
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
