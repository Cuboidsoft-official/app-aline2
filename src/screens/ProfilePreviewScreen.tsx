import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
 View,
 Text,
 StyleSheet,
 Image,
 TouchableOpacity,
 FlatList,
 ActivityIndicator,
 Alert
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { getStoredUserId } from "../utils/authSession";

type ProfilePreviewPost = {
 _id: string;
 image?: string;
 postType?: string;
 media?: Array<{
  url?: string;
  thumbnailUrl?: string;
 }>;
};

const ProfilePreviewScreen = ({ route, navigation }: { route: any; navigation: any }) => {

 const { userId } = route.params as { userId: string };

 const [user, setUser] = useState<any>(null);
 const [allPosts, setAllPosts] = useState<ProfilePreviewPost[]>([]);
 const [taggedPosts, setTaggedPosts] = useState<ProfilePreviewPost[]>([]);
 const [loading, setLoading] = useState(true);
 const [activeTab, setActiveTab] = useState("posts");
 const [isFollowing, setIsFollowing] = useState(false);
 const [canViewPosts, setCanViewPosts] = useState(false);
 const [actionLoading, setActionLoading] = useState(false);
 const [suggestions, setSuggestions] = useState<any[]>([]);
const [showSuggestions, setShowSuggestions] = useState(true);
const [myFollowing, setMyFollowing] = useState<string[]>([]);
const suggestionListContentStyle = styles.suggestionListContent;


const fetchProfile = useCallback(async () => {
 try {

  const token = await AsyncStorage.getItem("token");

  const res = await API.get(`/auth/user/${userId}`, {
   headers: { Authorization: `Bearer ${token}` }
  });

  const profileUser = res.data.user;
  const me = res.data.me;
  const profilePosts = Array.isArray(res.data.posts) ? (res.data.posts as ProfilePreviewPost[]) : [];
  const taggedRes = await API.get(`/posts/tagged/${userId}`, {
   headers: { Authorization: `Bearer ${token}` }
  });
  const accessGranted = Boolean(res.data?.canViewPosts);

  setUser(profileUser);
  setAllPosts(profilePosts);
  setTaggedPosts(Array.isArray(taggedRes.data.posts) ? (taggedRes.data.posts as ProfilePreviewPost[]) : []);

  // 🔥 store my following list
  setMyFollowing((me?.following || []) as string[]);

  const amIFollowing = me?.following?.some(
   (id: string) => String(id) === String(userId)
  );

  setIsFollowing(!!amIFollowing);
  setCanViewPosts(accessGranted);
 } catch (err) {
  console.log(err);
 } finally {
  setLoading(false);
 }
}, [userId]);

const fetchSuggestions = useCallback(async () => {

 try {

  const token = await AsyncStorage.getItem("token");
  const currentUserId = await getStoredUserId();

  const res = await API.get("/auth/users", {
   headers: { Authorization: `Bearer ${token}` }
  });

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
 fetchProfile();
 fetchSuggestions();
}, [fetchProfile, fetchSuggestions]);

const isPrivateLocked =
 user?.isPrivate === true && canViewPosts === false;

const posts = useMemo(() => {
 if (activeTab === "swipes") {
  return allPosts.filter((post) => post.postType === "reel");
 }

 if (activeTab === "tagged") {
  return taggedPosts.filter((post) => post.postType !== "reel");
 }

 return allPosts.filter((post) => post.postType !== "reel");
}, [activeTab, allPosts, taggedPosts]);

const totalPostCount = useMemo(
 () => allPosts.filter((post) => post.postType !== "reel").length,
 [allPosts],
);

const getPostPreviewUrl = (post: ProfilePreviewPost): string =>
 post.media?.[0]?.thumbnailUrl ||
 post.media?.[0]?.url ||
 post.image ||
 "https://picsum.photos/300";


const renderSuggestion = ({ item }: { item: any }) => (

 <TouchableOpacity
  style={styles.suggestionCard}
  onPress={() =>
   navigation.push("ProfilePreviewScreen", {
    userId: item._id
   })
  }
 >

  <Image
   source={{
    uri:
     item.profilePic ||
     "https://cdn-icons-png.flaticon.com/512/149/149071.png"
   }}
   style={styles.suggestionAvatar}
  />

  <Text numberOfLines={1} style={styles.suggestionUsername}>
   {item.username}
  </Text>

  <Text numberOfLines={1} style={styles.suggestionName}>
   {item.name}
  </Text>

<TouchableOpacity
 style={styles.followSuggestionBtn}
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

  const token = await AsyncStorage.getItem("token");

  await API.post(
   `/auth/follow/${userId}`,
   {},
   { headers: { Authorization: `Bearer ${token}` } }
  );

  setTimeout(() => {
   fetchProfile();
  }, 500);

  Alert.alert("Success ✅", "You are now following");

 } catch {

  Alert.alert("Error", "Something went wrong");

 } finally {
  setActionLoading(false);
 }
};

const toggleSuggestionFollow = async (targetUserId: string) => {

 try {

  const token = await AsyncStorage.getItem("token");

  await API.post(
   `/auth/follow/${targetUserId}`,
   {},
   { headers: { Authorization: `Bearer ${token}` } }
  );

  // suggestion list se remove
  setSuggestions(prev =>
   prev.filter((suggestedUser) => suggestedUser._id !== targetUserId)
  );

  fetchProfile();

 } catch (err: any) {

  console.log("Follow Error:", err.response?.data || err);

  Alert.alert("Error", "Action failed");

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

      const token = await AsyncStorage.getItem("token");

      await API.post(
       `/auth/unfollow/${userId}`,
       {},
       { headers: { Authorization: `Bearer ${token}` } }
      );

      await fetchProfile();

      Alert.alert("Done ✅", "Unfollowed");

     } catch {

      Alert.alert("Error", "Something went wrong");

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
   <View style={styles.center}>
    <ActivityIndicator size="large" />
   </View>
  );
 }

 return (
  <View style={styles.container}>

   <View style={styles.topHeader}>
    <TouchableOpacity onPress={() => navigation.goBack()}>
     <Icon name="arrow-back" size={26} />
    </TouchableOpacity>

<View style={styles.headerUserRow}>
  {user?.isPrivate && (
    <Icon name="lock-closed-outline" size={14} style={styles.lockIcon} />
  )}

  <Text numberOfLines={1} style={styles.headerUsername}>
    {user?.username}
  </Text>
</View>

    <TouchableOpacity
      onPress={() =>
        navigation.navigate("FeatureInfoScreen", {
          title: "Profile Actions",
          description: "More profile actions will appear here once moderation and blocking flows are connected end to end."
        })
      }
    >
      <Icon name="menu" size={26} />
    </TouchableOpacity>
   </View>

   <View style={styles.header}>
    <Image
     source={{
      uri:
       user?.profilePic ||
       "https://cdn-icons-png.flaticon.com/512/149/149071.png"
     }}
     style={styles.profilePic}
    />

    <View style={styles.stats}>
     <View style={styles.stat}>
      <Text style={styles.statNumber}>{totalPostCount}</Text>
      <Text style={styles.statText}>Posts</Text>
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
     <Text style={styles.statNumber}>{user?.followers?.length || 0}</Text>
     <Text style={styles.statText}>Followers</Text>
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
    <Text style={styles.statNumber}>{user?.following?.length || 0}</Text>
    <Text style={styles.statText}>Following</Text>
    </TouchableOpacity>
    </View>
   </View>

   <View style={styles.bioSection}>
    <Text style={styles.name}>{user?.name}</Text>
    <Text style={styles.bio}>{user?.bio}</Text>

    {user?.link && (
     <Text style={styles.link}>{user.link}</Text>
    )}
   </View>

<View style={styles.buttons}>

   {isFollowing ? (
    <TouchableOpacity
     activeOpacity={0.7}
     style={styles.unfollowBtn}
     onPress={unfollowUser}
     disabled={actionLoading}
    >
     <Text style={styles.btnText}>Following</Text>
    </TouchableOpacity>
   ) : (
    <TouchableOpacity
     activeOpacity={0.7}
     style={styles.followBtn}
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
   style={styles.messageBtn}
   activeOpacity={0.7}
   onPress={() => navigation.navigate("ChatScreen", {
    userId: user?._id,
    conversationType: user?.category === "Seller" ? "seller" : "direct"
   })}
  >
   <Icon name="chatbubble-ellipses-outline" size={20} color="#000" />
    <Text style={styles.messageText}>Message</Text>
  </TouchableOpacity>
 )}

</View>

<View style={styles.suggestionSection}>

 <View style={styles.suggestionHeader}>
  <Text style={styles.suggestionTitle}>
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

   <View style={styles.tabs}>
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
      color={activeTab === "posts" ? "#000" : "#888"}
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
      color={activeTab === "swipes" ? "#000" : "#888"}
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
      color={activeTab === "tagged" ? "#000" : "#888"}
    />
    </TouchableOpacity>
   </View>

  {isPrivateLocked ? (

   <View style={styles.privateContainer}>

    <Icon name="lock-closed" size={40} color="#555" />

    <Text style={styles.privateTitle}>
     This Account is Private
    </Text>

    <Text style={styles.privateText}>
     Follow this account to see their posts
    </Text>

   </View>

  ) : (

   <FlatList
   data={posts}
   renderItem={renderPost}
   keyExtractor={(item) => item._id}
   numColumns={3}
   showsVerticalScrollIndicator={false}
   ListEmptyComponent={
    <View style={styles.emptyState}>
     <Text style={styles.emptyTitle}>
      {activeTab === "tagged" ? "No tagged posts yet" : activeTab === "swipes" ? "No swipes yet" : "No posts yet"}
     </Text>
     <Text style={styles.emptyText}>
      {activeTab === "tagged"
       ? "Posts that tag this account will show here."
       : activeTab === "swipes"
        ? "Swipe posts will appear here."
        : "Posts from this account will appear here."}
     </Text>
    </View>
   }
   />

  )}

  </View>
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

 tab:{
  flex:1,
  alignItems:"center",
  padding:10
 },

 postImage:{
  width:"33.33%",
  height:130
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
