import React, { useCallback, useEffect, useState } from "react";
import {
 View,
 Text,
 StyleSheet,
 FlatList,
 Image,
 TouchableOpacity,
 ActivityIndicator,
 TextInput
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";

type FollowTab = "followers" | "following";

interface FollowUser {
 _id: string;
 username?: string;
 name?: string;
 profilePic?: string;
}

const FollowersFollowingScreen = ({ route, navigation }: { route: any; navigation: any }) => {

 const { userId, type } = route.params as { userId: string; type: FollowTab };

 const [users, setUsers] = useState<FollowUser[]>([]);
 const [filteredUsers, setFilteredUsers] = useState<FollowUser[]>([]);
 const [activeTab, setActiveTab] = useState<FollowTab>(type);
 const [search, setSearch] = useState("");
 const [loading, setLoading] = useState(true);

 const fetchUsers = useCallback(async (tabType: FollowTab) => {

  try {

   const token = await AsyncStorage.getItem("token");

   const res = await API.get(`/auth/${tabType}/${userId}`, {
    headers: { Authorization: `Bearer ${token}` }
   });

   console.log("FOLLOW API:", res.data);

   const list =
    tabType === "followers"
     ? res.data.followers
     : res.data.following;

   setUsers((list || []) as FollowUser[]);
   setFilteredUsers((list || []) as FollowUser[]);

  } catch (err) {
   console.log("FOLLOW ERROR:", err);
  } finally {
   setLoading(false);
  }

 }, [userId]);

 useEffect(() => {
  fetchUsers(activeTab);
 }, [activeTab, fetchUsers]);

 const handleSearch = (text: string) => {

  setSearch(text);

  const filtered = users.filter((u) =>
   u.username?.toLowerCase().includes(text.toLowerCase())
  );

  setFilteredUsers(filtered);
 };

 const renderUser = ({ item }: { item: FollowUser }) => (

  <TouchableOpacity
   style={styles.userItem}
   onPress={() =>
    navigation.navigate("ProfilePreviewScreen", {
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
    style={styles.avatar}
   />

   <View style={styles.userMeta}>
    <Text style={styles.username}>{item.username}</Text>
    <Text style={styles.name}>{item.name}</Text>
   </View>

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

   {/* HEADER */}

   <View style={styles.header}>

    <TouchableOpacity onPress={() => navigation.goBack()}>
     <Icon name="arrow-back" size={26} />
    </TouchableOpacity>

    <Text style={styles.headerTitle}>Connections</Text>

    <View style={styles.headerSpacer} />

   </View>

   {/* TABS */}

   <View style={styles.tabs}>

    <TouchableOpacity
     style={styles.tab}
     onPress={() => setActiveTab("followers")}
    >
     <Text
      style={
       activeTab === "followers"
        ? styles.activeTab
        : styles.inactiveTab
      }
     >
      Followers
     </Text>
    </TouchableOpacity>

    <TouchableOpacity
     style={styles.tab}
     onPress={() => setActiveTab("following")}
    >
     <Text
      style={
       activeTab === "following"
        ? styles.activeTab
        : styles.inactiveTab
      }
     >
      Following
     </Text>
    </TouchableOpacity>

   </View>

   {/* SEARCH */}

   <View style={styles.searchContainer}>

    <Icon name="search" size={18} color="#666" />

    <TextInput
     placeholder="Search"
     value={search}
     onChangeText={handleSearch}
     style={styles.searchInput}
    />

   </View>

   {/* USER LIST */}

   <FlatList
    data={filteredUsers}
    renderItem={renderUser}
    keyExtractor={(item) => item._id}
    showsVerticalScrollIndicator={false}
   />

  </View>
 );
};

export default FollowersFollowingScreen;

const styles = StyleSheet.create({

 container:{
  flex:1,
  backgroundColor:"#fff"
 },

 header:{
  flexDirection:"row",
  alignItems:"center",
  justifyContent:"space-between",
  paddingTop:50,
  paddingHorizontal:15,
  paddingBottom:10,
  borderBottomWidth:1,
  borderColor:"#eee"
 },

 headerTitle:{
  fontSize:18,
  fontWeight:"600"
 },

 tabs:{
  flexDirection:"row",
  borderBottomWidth:1,
  borderColor:"#eee"
 },

 tab:{
  flex:1,
  alignItems:"center",
  padding:12
 },

 activeTab:{
  fontWeight:"bold",
  fontSize:15
 },

 inactiveTab:{
  color:"#777"
 },

 searchContainer:{
  flexDirection:"row",
  alignItems:"center",
  backgroundColor:"#f2f2f2",
  margin:10,
  borderRadius:8,
  paddingHorizontal:10
 },

 searchInput:{
  flex:1,
  padding:8,
  marginLeft:6
 },

 userItem:{
  flexDirection:"row",
  alignItems:"center",
  padding:15
 },

 userMeta:{
  flex:1
 },

 avatar:{
  width:50,
  height:50,
  borderRadius:25,
  marginRight:15
 },

 username:{
  fontWeight:"600"
 },

 name:{
  color:"#666"
 },

 center:{
  flex:1,
  justifyContent:"center",
  alignItems:"center"
 },

 headerSpacer:{
  width:26
 }

});
