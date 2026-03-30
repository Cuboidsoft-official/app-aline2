import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
 View,
 Text,
 StyleSheet,
 Image,
 TouchableOpacity,
 FlatList,
 Alert,
 ActivityIndicator
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
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
 pronouns?: string;
 bio?: string;
 interests?: string[];
 link?: string;
 profilePic?: string;
 followers?: string[];
 following?: string[];
 isPrivate?: boolean;
}

const getErrorMessage = (error: unknown) => {
 if (typeof error === "object" && error !== null) {
  const maybeError = error as { response?: { data?: { message?: string } }; message?: string };
  return maybeError.response?.data?.message || maybeError.message || "Unknown error";
 }

 return "Unknown error";
};

const ProfileScreen = ({navigation}: any) => {
 const { colors, isDarkMode } = useAppTheme();

 const [user, setUser] = useState<ProfileUser | null>(null);
 const [allPosts, setAllPosts] = useState<ProfilePost[]>([]);
 const [loading, setLoading] = useState(true);
 const [privateLoading, setPrivateLoading] = useState(false);
 const [activeTab, setActiveTab] = useState("posts");
 const [isPrivate, setIsPrivate] = useState(false);

 const fetchProfile = useCallback(async () => {

  try {
   const token = await AsyncStorage.getItem("token");
   const profileRes = await API.get("/auth/profile", {
    headers: {
     Authorization: `Bearer ${token}`
    }
   });

   const profileUser = (profileRes.data.user || null) as ProfileUser | null;
   setUser(profileUser);
   setIsPrivate(!!profileUser?.isPrivate);

   if (profileUser?._id) {
    const postsRes = await API.get(`/posts/user/${profileUser._id}`, {
     headers: {
      Authorization: `Bearer ${token}`
     }
    });

    setAllPosts((postsRes.data.posts || []) as ProfilePost[]);
   } else {
    setAllPosts([]);
   }

  } catch (error) {
   console.log("Profile Error:", getErrorMessage(error));
  } finally {
   setLoading(false);
  }

 }, []);

 useEffect(() => {
  fetchProfile();
 }, [fetchProfile]);

 const posts = useMemo(() => {
  if (activeTab === "swipes") {
   return allPosts.filter((post) => post.postType === "reel");
  }

  if (activeTab === "tagged") {
   return [];
  }

  return allPosts.filter((post) => post.postType !== "reel");
 }, [activeTab, allPosts]);

 const totalPostCount = useMemo(
  () => allPosts.filter((post) => post.postType !== "reel").length,
  [allPosts],
 );

 const getPostPreviewUrl = (post: ProfilePost): string =>
  post.media?.[0]?.thumbnailUrl ||
  post.media?.[0]?.url ||
  post.image ||
  "https://picsum.photos/300";

 const togglePrivateProfile = async () => {
  if (privateLoading) {
   return;
  }

  try {
   setPrivateLoading(true);
   const token = await AsyncStorage.getItem("token");

   const res = await API.post(
    "/auth/toggle-private",
    {},
    { headers: { Authorization: `Bearer ${token}` } }
   );

   const nextValue = !!res?.data?.isPrivate;
   setIsPrivate(nextValue);

   Alert.alert(
    "Profile Updated",
    nextValue ? "Your profile is now Private" : "Your profile is now Public"
   );
  } catch (error) {
   Alert.alert("Error", "Unable to change profile privacy");
   console.log("Private Toggle Error:", getErrorMessage(error));
  } finally {
   setPrivateLoading(false);
  }
 };

 const handleShareProfile = async () => {
  try {
   await shareContentLink({
    originalUrl: user?.link,
    title: user?.name || "Aline2 Profile",
    description: user?.bio || "",
    fallbackMessage: user?.name
     ? `Check out ${user.name}'s profile on Aline2`
     : "Check out this profile on Aline2",
   });
  } catch (error) {
   console.log("Profile share error:", getErrorMessage(error));
   Alert.alert("Error", "Unable to share profile right now");
  }
 };

 const renderPost = ({ item }: { item: ProfilePost }) => (
  <TouchableOpacity
   activeOpacity={0.9}
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
   <View style={styles.topHeader}>

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
         : "https://cdn-icons-png.flaticon.com/512/149/149071.png"
      }}
      style={styles.profilePic}
     />

     <Text style={[styles.profileName, { color: colors.text }]}>
      {user?.name || "User Name"}
     </Text>

     <View style={styles.verifiedBadge}>
      <Icon name="checkmark-circle" size={16} color="#fff"/>
      <Text style={styles.verifiedText}>
       Verified with aline2
      </Text>
     </View>

    </View>

    <View style={styles.stats}>

     <View style={styles.stat}>
      <Text style={styles.statNumber}>{totalPostCount}</Text>
      <Text style={styles.statText}>Posts</Text>
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
     <Text style={styles.statNumber}>{user?.followers?.length || 0}</Text>
     <Text style={styles.statText}>Followers</Text>
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
     <Text style={styles.statNumber}>{user?.following?.length || 0}</Text>
     <Text style={styles.statText}>Following</Text>
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
       <View key={interest} style={[styles.interestChip, { backgroundColor: isDarkMode ? colors.surface : "#F1ECFF" }]}>
        <Text style={[styles.interestText, { color: colors.text }]}>{interest}</Text>
       </View>
      ))}
     </View>
    )}

   </View>

   <View style={styles.buttons}>

    <TouchableOpacity
     style={[styles.editBtn, { backgroundColor: isDarkMode ? colors.surface : "#EFEFEF" }]}
     onPress={()=> navigation.navigate("Profile")}
    >
     <Text style={[styles.btnText, { color: colors.text }]}>Edit Profile</Text>
    </TouchableOpacity>

    <TouchableOpacity style={[styles.shareBtn, { backgroundColor: isDarkMode ? colors.surface : "#EFEFEF" }]} onPress={handleShareProfile}>
     <Text style={[styles.btnText, { color: colors.text }]}>Share Profile</Text>
    </TouchableOpacity>

    <TouchableOpacity
     style={[styles.shareBtn, { backgroundColor: isDarkMode ? colors.surface : "#EFEFEF" }, isPrivate ? styles.privateOnBtn : null]}
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

 return (
  <FlatList
   data={posts}
   renderItem={renderPost}
   keyExtractor={(item) => item._id}
   numColumns={3}
   style={[styles.container, { backgroundColor: colors.background }]}
   contentContainerStyle={styles.listContent}
   ListHeaderComponent={renderHeader}
   showsVerticalScrollIndicator={false}
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
  paddingTop:50,
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
  width:"33.33%",
  height:130
 },

 center:{
  flex:1,
  justifyContent:"center",
  alignItems:"center"
 }

});
