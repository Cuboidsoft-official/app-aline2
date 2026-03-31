import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
 View,
 Text,
 StyleSheet,
 Image,
 TouchableOpacity,
 FlatList,
 ActivityIndicator,
 Alert,
 RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";

import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { getStoredUserId } from "../utils/authSession";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { useAppTheme } from "../theme/AppThemeContext";

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
 const { colors } = useAppTheme();
 const insets = useSafeAreaInsets();

 const { userId } = route.params as { userId: string };

 const [user, setUser] = useState<any>(null);
 const [allPosts, setAllPosts] = useState<ProfilePreviewPost[]>([]);
 const [taggedPosts, setTaggedPosts] = useState<ProfilePreviewPost[]>([]);
 const [loading, setLoading] = useState(true);
 const [refreshing, setRefreshing] = useState(false);
 const [errorMessage, setErrorMessage] = useState("");
 const [activeTab, setActiveTab] = useState<ProfilePreviewTab>("posts");
 const [isFollowing, setIsFollowing] = useState(false);
 const [canViewPosts, setCanViewPosts] = useState(false);
 const [actionLoading, setActionLoading] = useState(false);
 const [suggestions, setSuggestions] = useState<any[]>([]);
const [showSuggestions, setShowSuggestions] = useState(true);
const [myFollowing, setMyFollowing] = useState<string[]>([]);
const suggestionListContentStyle = styles.suggestionListContent;

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

  setUser(profileUser);
  setAllPosts(profilePosts);
  setTaggedPosts(Array.isArray(taggedResult?.data?.posts) ? (taggedResult.data.posts as ProfilePreviewPost[]) : []);

  // 🔥 store my following list
  setMyFollowing((me?.following || []) as string[]);

  const amIFollowing = me?.following?.some(
   (id: string) => String(id) === String(userId)
  );

  setIsFollowing(!!amIFollowing);
  setCanViewPosts(accessGranted);
  setErrorMessage("");
 } catch (err) {
  console.log("Profile preview fetch error:", err);
  setUser(null);
  setAllPosts([]);
  setTaggedPosts([]);
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

const getPostPreviewUrl = (post: ProfilePreviewPost): string =>
 post.media?.[0]?.thumbnailUrl ||
 post.media?.[0]?.url ||
 post.image ||
 DEFAULT_AVATAR_URL;


const renderSuggestion = ({ item }: { item: any }) => (

 <TouchableOpacity
  style={[styles.suggestionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
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
   {item.name}
  </Text>

<TouchableOpacity
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
  style={styles.postCard}
  onPress={() => navigation.navigate("PostDetail", { postId: item._id })}
 >
  <Image
   source={{ uri: getPostPreviewUrl(item) }}
   style={styles.postImage}
  />
 </TouchableOpacity>
);

 if (loading) {
  return (
   <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]} edges={["top"]}>
    <ActivityIndicator size="large" color={colors.primary} />
   </SafeAreaView>
  );
 }

 if (!user) {
  return (
   <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]} edges={["top"]}>
    <Text style={[styles.emptyTitle, { color: colors.text }]}>Profile unavailable</Text>
    <Text style={[styles.emptyText, { color: colors.mutedText }]}>{errorMessage || "Please try again."}</Text>
    <TouchableOpacity
     style={[styles.followBtn, { backgroundColor: colors.primary, marginTop: 14, width: 180 }]}
     onPress={() => fetchProfile({ refresh: true }).catch(() => {})}
    >
     <Text style={styles.followText}>Retry</Text>
    </TouchableOpacity>
   </SafeAreaView>
  );
 }

 return (
  <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
   <View style={[styles.topHeader, { paddingTop: Math.max(insets.top, 12), borderColor: colors.border }]}>
    <TouchableOpacity onPress={() => navigation.goBack()}>
     <Icon name="arrow-back" size={26} color={colors.text} />
    </TouchableOpacity>

    <View style={styles.headerUserRow}>
     {user?.isPrivate ? (
      <Icon name="lock-closed-outline" size={14} style={styles.lockIcon} color={colors.mutedText} />
     ) : null}

     <Text numberOfLines={1} style={[styles.headerUsername, { color: colors.text }]}>
      {user?.username}
     </Text>
    </View>

    <View style={styles.headerSpacer} />
   </View>

   <View style={styles.header}>
    <Image
     source={{
      uri: user?.profilePic || DEFAULT_AVATAR_URL
     }}
     style={styles.profilePic}
    />

    <View style={styles.stats}>
     <View style={styles.stat}>
      <Text style={[styles.statNumber, { color: colors.text }]}>{totalPostCount}</Text>
      <Text style={[styles.statText, { color: colors.mutedText }]}>Posts</Text>
     </View>

     <TouchableOpacity
      style={styles.stat}
     onPress={() => {

      if(isPrivateLocked){
       Alert.alert("Private Profile","Follow to see followers");
       return;
      }

      navigation.navigate("FollowersFollowingScreen", {
       userId: user?._id,
       type: "followers"
      });

     }}
     >
     <Text style={[styles.statNumber, { color: colors.text }]}>{user?.followers?.length || 0}</Text>
     <Text style={[styles.statText, { color: colors.mutedText }]}>Followers</Text>
     </TouchableOpacity>

    <TouchableOpacity
     style={styles.stat}
     onPress={() => {

      if(isPrivateLocked){
       Alert.alert("Private Profile","Follow to see following");
       return;
      }

      navigation.navigate("FollowersFollowingScreen", {
       userId: user?._id,
       type: "following"
      });

     }}
    >
    <Text style={[styles.statNumber, { color: colors.text }]}>{user?.following?.length || 0}</Text>
    <Text style={[styles.statText, { color: colors.mutedText }]}>Following</Text>
    </TouchableOpacity>
    </View>
   </View>

   <View style={styles.bioSection}>
    <Text style={[styles.name, { color: colors.text }]}>{user?.name}</Text>
    <Text style={[styles.bio, { color: colors.mutedText }]}>{user?.bio}</Text>

    {user?.link && (
     <Text style={[styles.link, { color: colors.primary }]}>{user.link}</Text>
    )}
   </View>

   <View style={styles.buttons}>

   {isFollowing ? (
    <TouchableOpacity
     activeOpacity={0.7}
     style={[styles.unfollowBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
     onPress={unfollowUser}
     disabled={actionLoading}
    >
     <Text style={[styles.btnText, { color: colors.text }]}>Following</Text>
    </TouchableOpacity>
   ) : (
    <TouchableOpacity
     activeOpacity={0.7}
     style={[styles.followBtn, { backgroundColor: colors.primary }]}
     onPress={followUser}
     disabled={actionLoading}
    >
     <Text style={styles.followText}>
      {actionLoading ? "Loading..." : "Follow"}
     </Text>
    </TouchableOpacity>
   )}

 {!!user?._id && (
 <TouchableOpacity
   style={[styles.messageBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
   activeOpacity={0.7}
   onPress={() => navigation.navigate("ChatScreen", {
    userId: user?._id,
    conversationType: user?.category === "Seller" ? "seller" : "direct"
   })}
  >
   <Icon name="chatbubble-ellipses-outline" size={20} color={colors.text} />
    <Text style={[styles.messageText, { color: colors.text }]}>Message</Text>
  </TouchableOpacity>
 )}

   </View>

   <View style={styles.suggestionSection}>

 <View style={styles.suggestionHeader}>
  <Text style={[styles.suggestionTitle, { color: colors.text }]}>
   Discover People
  </Text>

  <TouchableOpacity
   onPress={() =>
    setShowSuggestions(!showSuggestions)
   }
  >
   <Icon
    name={showSuggestions ? "chevron-up" : "chevron-down"}
    size={22}
    color={colors.text}
   />
  </TouchableOpacity>
 </View>

 {showSuggestions && (

	  <FlatList
	   data={suggestions}
	   renderItem={renderSuggestion}
	   keyExtractor={(item) => item._id}
	   horizontal
	   showsHorizontalScrollIndicator={false}
	   contentContainerStyle={suggestionListContentStyle}
	  />

 )}

   </View>

   <View style={[styles.tabs, { borderColor: colors.border }]}>
    <TouchableOpacity
     style={styles.tab}
     onPress={() => {

      if(isPrivateLocked){
       Alert.alert("Private Profile","Follow to see content");
       return;
      }

      setActiveTab("posts");

     }}
    >
     <Icon
      name="grid-outline"
      size={22}
      color={activeTab === "posts" ? colors.text : colors.mutedText}
     />
    </TouchableOpacity>

    <TouchableOpacity
     style={styles.tab}
    onPress={() => {

     if(isPrivateLocked){
      Alert.alert("Private Profile","Follow to see content");
      return;
     }

     setActiveTab("swipes");

    }}
    >
     <Icon
      name="heart-outline"
      size={22}
      color={activeTab === "swipes" ? colors.text : colors.mutedText}
     />
    </TouchableOpacity>

    <TouchableOpacity
     style={styles.tab}
     onPress={() => {

      if(isPrivateLocked){
       Alert.alert("Private Profile","Follow to see content");
       return;
      }

      setActiveTab("tagged");

     }}
    >
     <Icon
      name="person-outline"
      size={22}
      color={activeTab === "tagged" ? colors.text : colors.mutedText}
    />
    </TouchableOpacity>
   </View>

  {isPrivateLocked ? (

   <View style={styles.privateContainer}>

    <Icon name="lock-closed" size={40} color={colors.mutedText} />

    <Text style={[styles.privateTitle, { color: colors.text }]}>
     This Account is Private
    </Text>

    <Text style={[styles.privateText, { color: colors.mutedText }]}>
     Follow this account to see their posts
    </Text>

   </View>

  ) : (

   <FlatList
   data={posts}
   renderItem={renderPost}
   keyExtractor={(item) => item._id}
   numColumns={3}
   extraData={activeTab}
   showsVerticalScrollIndicator={false}
   contentContainerStyle={styles.postsContent}
   refreshControl={
    <RefreshControl
     refreshing={refreshing}
     onRefresh={() => fetchProfile({ refresh: true }).catch(() => {})}
     tintColor={colors.primary}
    />
   }
   ListEmptyComponent={
    <View style={styles.emptyState}>
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
   }
   />

  )}
  </SafeAreaView>
 );
};

export default ProfilePreviewScreen;

const styles = StyleSheet.create({

 container:{
  flex:1,
  backgroundColor:"#fff"
 },

 topHeader:{
  flexDirection:"row",
  alignItems:"center",
  justifyContent:"space-between",
  paddingHorizontal:16,
  paddingTop:50,
  paddingBottom:12,
  borderBottomWidth:1,
  borderColor:"#eee"
 },

 headerUsername:{
  fontSize:18,
  fontWeight:"600",
  maxWidth:"90%",
  marginLeft:10,
 },

 header:{
  flexDirection:"row",
  paddingHorizontal:20,
  paddingVertical:18,
  alignItems:"center"
 },

 profilePic:{
  width:95,
  height:95,
  borderRadius:50,
  marginRight:20
 },

 stats:{
  flex:1,
  flexDirection:"row",
  justifyContent:"space-around"
 },

 stat:{
  alignItems:"center"
 },

 statNumber:{
  fontWeight:"bold",
  fontSize:18
 },

 statText:{
  color:"#444",
  marginTop:2
 },

 bioSection:{
  paddingHorizontal:20,
  marginBottom:8
 },

 name:{
  fontWeight:"bold",
  fontSize:15
 },

 bio:{
  color:"#444",
  marginTop:2
 },

 link:{
  color:"#1877f2",
  marginTop:2
 },

 buttons:{
  flexDirection:"row",
  paddingHorizontal:15,
  marginTop:10
 },

 followBtn:{
  backgroundColor:"#ab2aeb",
  paddingVertical:9,
  borderRadius:6,
  flex:1,
  marginRight:5,
  alignItems:"center"
 },

 followText:{
  color:"#fff",
  fontWeight:"600"
 },

 unfollowBtn:{
  borderWidth:1,
  borderColor:"#ccc",
  paddingVertical:9,
  borderRadius:6,
  flex:1,
  marginRight:5,
  alignItems:"center"
 },
headerUserRow:{
 flexDirection:"row",
 alignItems:"center"
},

headerSpacer:{
 width:26
},

lockIcon:{
 marginRight:1
},

 btnText:{
  fontWeight:"500"
 },

messageBtn:{
  borderWidth:1,
  borderColor:"#ccc",
  paddingVertical:9,
  borderRadius:6,
  flex:1,
  marginLeft:5,
  alignItems:"center",
  justifyContent:"center",
  flexDirection:"row"
 },
 messageText:{
  marginLeft:6
 },

 tabs:{
  flexDirection:"row",
  borderTopWidth:1,
  borderBottomWidth:1,
  borderColor:"#eee",
  marginTop:12
 },

 postsContent:{
  paddingBottom:32
 },

 tab:{
  flex:1,
  alignItems:"center",
  padding:10
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
  fontWeight:"700",
  color:"#111"
 },
 emptyText:{
  marginTop:8,
  textAlign:"center",
  color:"#666",
  lineHeight:20
 },

 center:{
  flex:1,
  justifyContent:"center",
  alignItems:"center"
 },
suggestionSection:{
 marginTop:15,
 marginBottom:10
},
suggestionListContent:{
 paddingHorizontal:15
},

suggestionHeader:{
 flexDirection:"row",
 justifyContent:"space-between",
 alignItems:"center",
 paddingHorizontal:15,
 marginBottom:10
},

suggestionTitle:{
 fontSize:16,
 fontWeight:"600"
},

suggestionCard:{
 width:140,
 backgroundColor:"#fff",
 borderRadius:12,
 padding:14,
 alignItems:"center",
 marginRight:12,
 borderWidth:1,
 borderColor:"#eee"
},

suggestionAvatar:{
 width:65,
 height:65,
 borderRadius:32,
 marginBottom:8
},

suggestionUsername:{
 fontWeight:"600",
 fontSize:14
},

suggestionName:{
 fontSize:12,
 color:"#777",
 marginBottom:10
},

followSuggestionBtn:{
 backgroundColor:"black",
 paddingVertical:6,
 paddingHorizontal:18,
 borderRadius:6
},

followSuggestionText:{
 color:"#fff",
 fontWeight:"600",
 fontSize:13
},
privateContainer:{
 alignItems:"center",
 justifyContent:"center",
 marginTop:60
},

privateTitle:{
 fontSize:18,
 fontWeight:"600",
 marginTop:10
},

privateText:{
 color:"#777",
 marginTop:5
}

});
