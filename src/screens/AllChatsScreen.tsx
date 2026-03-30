import React, { useCallback, useMemo, useState } from "react";
import {
View,
Text,
StyleSheet,
FlatList,
Image,
TouchableOpacity,
ActivityIndicator,
Alert
} from "react-native";

import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API } from "../api/api";
import Icon from "react-native-vector-icons/Ionicons";
import { getStoredUserId } from "../utils/authSession";
import { fetchChatConversations } from "../utils/chatApi";
import { getConversationPreview } from "../utils/chatPresentation";
import { useAppTheme } from "../theme/AppThemeContext";

interface ChatUser {
  _id: string;
  username?: string;
  name?: string;
  profilePic?: string;
  sellerProfile?: string;
}

interface SellerServiceSummary {
  _id?: string;
  serviceName?: string;
  seller?: {
    _id?: string;
    sellerName?: string;
    user?: string;
  } | null;
}

interface Conversation {
  _id: string;
  otherUser?: ChatUser | null;
  sellerUser?: ChatUser | null;
  service?: SellerServiceSummary | null;
  updatedAt?: string;
  lastMessageTime?: string;
  lastMessageText?: string;
  lastMessageType?: string;
  unreadCount?: number;
}

const AllChatsScreen = ({ navigation }: any) => {
  const { colors, isDarkMode } = useAppTheme();

  const [users,setUsers] = useState<ChatUser[]>([]);
const [conversations,setConversations] = useState<Conversation[]>([]);
const [loading,setLoading] = useState(true);
const [activeTab,setActiveTab] = useState("regular"); // regular / seller

const fetchChatData = useCallback(async ()=>{

 try{
  setLoading(true);

  const token = await AsyncStorage.getItem("token");
  const currentUserId = await getStoredUserId();
  const conversationType = activeTab === "seller" ? "seller" : "direct";

  const [usersRes, conversationsRes] = await Promise.all([
   API.get("/auth/users",{
    headers:{ Authorization:`Bearer ${token}` },
    params: activeTab === "seller"
     ? { category:"Seller" }
     : { excludeCategory:"Seller" }
   }),
   fetchChatConversations({ conversationType })
  ]);

  const fetchedUsers = ((usersRes?.data?.users || []) as ChatUser[]).filter(
   (user: ChatUser) => user?._id !== currentUserId
  );

  setUsers(fetchedUsers);
  setConversations((conversationsRes?.conversations || []) as Conversation[]);

 }catch(err){

  console.log("Chats Error:",err);

 }finally{

  setLoading(false);

 }

},[activeTab]);

useFocusEffect(
 useCallback(() => {
  fetchChatData();
 }, [fetchChatData])
);

const conversationMap = useMemo(() => {
 return new Map(
  conversations
   .filter((conversation): conversation is Conversation & { otherUser: ChatUser } => Boolean(conversation?.otherUser?._id))
   .map((conversation) => [conversation.otherUser._id, conversation] as const)
 );
}, [conversations]);

const orderedUsers = useMemo(() => {
 return [...users].sort((a,b)=>{
  const conversationA = conversationMap.get(a._id);
  const conversationB = conversationMap.get(b._id);
  const timeA = conversationA ? new Date(conversationA.updatedAt || conversationA.lastMessageTime || 0).getTime() : 0;
  const timeB = conversationB ? new Date(conversationB.updatedAt || conversationB.lastMessageTime || 0).getTime() : 0;

  if (timeA !== timeB) {
   return timeB - timeA;
  }

  return String(a?.username || a?.name || "").localeCompare(
   String(b?.username || b?.name || "")
  );
 });
}, [conversationMap, users]);

const orderedSellerConversations = useMemo(() => {
 return [...conversations]
  .filter((conversation) => conversation?.service || conversation?.sellerUser || conversation?.otherUser?.sellerProfile)
  .sort((a, b) => {
   const timeA = new Date(a.updatedAt || a.lastMessageTime || 0).getTime();
   const timeB = new Date(b.updatedAt || b.lastMessageTime || 0).getTime();
   return timeB - timeA;
  });
}, [conversations]);

	const handleCreateGroupPress = () => {
	 Alert.alert(
	  "Not available yet",
	  "Group chat is not implemented in the backend yet."
	 );
	};

	const renderChat = ({item}: { item: ChatUser })=>{
 const conversation = conversationMap.get(item._id);
 const subtitle = getConversationPreview(conversation)
  || (activeTab === "seller" ? "Tap to start seller conversation" : "Tap to start conversation");

 return(

 <TouchableOpacity
 style={[styles.chatCard, { borderColor: colors.border, backgroundColor: colors.card }]}
 onPress={()=>navigation.navigate("ChatScreen",{
  userId:item._id,
  conversationId:conversation?._id,
  conversationType: activeTab === "seller" ? "seller" : "direct"
 })}
 >

 <View style={styles.avatarContainer}>

 <Image
 source={{
 uri:item.profilePic || "https://cdn-icons-png.flaticon.com/512/149/149071.png"
 }}
 style={styles.avatar}
 />

 <View style={styles.onlineDot}/>

 </View>

 <View style={styles.chatInfo}>

 <Text style={[styles.username, { color: colors.text }]}>
 {item.username || item.name || "User"}
 </Text>

 <Text style={[styles.lastMessage, { color: colors.mutedText }]} numberOfLines={1}>
 {subtitle}
 </Text>

 </View>

 <View style={styles.chatMeta}>
  {!!conversation?.unreadCount && (
   <View style={styles.unreadBadge}>
    <Text style={styles.unreadText}>
     {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
    </Text>
   </View>
  )}

  <Icon name="chevron-forward-outline" size={20} color={colors.mutedText}/>
 </View>

 </TouchableOpacity>

 );

};

 const renderSellerConversation = ({ item }: { item: Conversation }) => {
  const sellerUserId = item?.sellerUser?._id || item?.otherUser?._id || "";
  const sellerId = item?.service?.seller?._id || item?.otherUser?.sellerProfile || "";
  const sellerName = item?.service?.seller?.sellerName || item?.otherUser?.username || item?.otherUser?.name || "Seller";
  const profilePic = item?.otherUser?.profilePic || item?.sellerUser?.profilePic || "https://cdn-icons-png.flaticon.com/512/149/149071.png";
  const subtitleParts = [
   item?.service?.serviceName ? `Service: ${item.service.serviceName}` : "",
   getConversationPreview(item),
  ].filter(Boolean);

  const handlePress = () => {
   if (!sellerUserId || !sellerId) {
    Alert.alert("Unavailable", "This seller conversation is missing profile details.");
    return;
   }

   navigation.navigate("SellerChatScreen", {
    sellerId,
    sellerUserId,
    conversationId: item._id,
    serviceId: item?.service?._id,
    serviceName: item?.service?.serviceName,
   });
  };

  return (
   <TouchableOpacity style={[styles.chatCard, { borderColor: colors.border, backgroundColor: colors.card }]} onPress={handlePress}>
    <View style={styles.avatarContainer}>
     <Image
      source={{
       uri: profilePic
      }}
      style={styles.avatar}
     />

     <View style={styles.onlineDot}/>
    </View>

    <View style={styles.chatInfo}>
     <Text style={[styles.username, { color: colors.text }]}>
      {sellerName}
     </Text>

     <Text style={[styles.lastMessage, { color: colors.mutedText }]} numberOfLines={2}>
      {subtitleParts.join(" • ") || "Tap to open seller conversation"}
     </Text>
    </View>

    <View style={styles.chatMeta}>
     {!!item?.unreadCount && (
      <View style={styles.unreadBadge}>
       <Text style={styles.unreadText}>
        {item.unreadCount > 99 ? "99+" : item.unreadCount}
       </Text>
      </View>
     )}

     <Icon name="chevron-forward-outline" size={20} color={colors.mutedText}/>
    </View>
   </TouchableOpacity>
  );
 };

 const listData = activeTab === "seller" ? orderedSellerConversations : orderedUsers;
 const renderListItem = activeTab === "seller" ? renderSellerConversation : renderChat;
 const keyExtractor = (item: ChatUser | Conversation) => item._id;

if(loading){

 return(

 <View style={[styles.center, { backgroundColor: colors.background }]}>
 <ActivityIndicator size="large" color={colors.primary}/>
 </View>

 );

}

return(

<View style={[styles.container, { backgroundColor: colors.background }]}>

{/* HEADER */}

<View style={styles.header}>

<Text style={[styles.headerTitle, { color: colors.text }]}>
Chats
</Text>

<View style={styles.headerActions}>

	<TouchableOpacity
	style={styles.headerActionButton}
	onPress={handleCreateGroupPress}
	>
<Icon name="people-outline" size={24} color={colors.text}/>
</TouchableOpacity>

<TouchableOpacity
onPress={()=>navigation.navigate("Search")}
>
<Icon name="search-outline" size={24} color={colors.text}/>
</TouchableOpacity>

</View>

</View>

{/* TABS */}

<View style={[styles.tabs, { backgroundColor: isDarkMode ? colors.surface : "#f2f2f2" }]}>

<TouchableOpacity
style={[
styles.tab,
activeTab === "regular" && styles.activeTab
]}
onPress={()=>setActiveTab("regular")}
>
<Text style={[
styles.tabText,
activeTab === "regular" && styles.activeTabText,
{ color: activeTab === "regular" ? "#fff" : colors.mutedText }
]}>
Regular Chats
</Text>
</TouchableOpacity>

<TouchableOpacity
style={[
styles.tab,
activeTab === "seller" && styles.activeTab
]}
onPress={()=>setActiveTab("seller")}
>
<Text style={[
styles.tabText,
activeTab === "seller" && styles.activeTabText,
{ color: activeTab === "seller" ? "#fff" : colors.mutedText }
]}>
Seller Chats
</Text>
</TouchableOpacity>

</View>

{/* CHAT LIST */}

<FlatList
data={listData}
keyExtractor={keyExtractor}
renderItem={renderListItem}
showsVerticalScrollIndicator={false}
ListEmptyComponent={
 <View style={styles.emptyState}>
  <Text style={[styles.emptyTitle, { color: colors.text }]}>
   {activeTab === "seller" ? "No seller chats yet" : "No chats yet"}
  </Text>
  <Text style={[styles.emptyText, { color: colors.mutedText }]}>
   {activeTab === "seller"
    ? "Start a seller conversation from a seller profile to see it here."
    : "Start a direct conversation from a user profile or this tab."}
  </Text>
 </View>
}
/>

{/* CREATE GROUP FLOAT BUTTON */}

	<TouchableOpacity
	style={styles.groupButton}
	onPress={handleCreateGroupPress}
	>

<Icon name="people" size={24} color="#fff"/>

</TouchableOpacity>

</View>

);

};

export default AllChatsScreen;

const styles = StyleSheet.create({

container:{
 flex:1,
 backgroundColor:"#fff",
 paddingTop:50
},

header:{
 flexDirection:"row",
 justifyContent:"space-between",
 alignItems:"center",
 paddingHorizontal:18,
 marginBottom:10,
 paddingBottom: 20,
},

headerTitle:{
 fontSize:24,
 fontWeight:"bold"
},

headerActions:{
 flexDirection:"row"
},

headerActionButton:{
 marginRight:15
},

tabs:{
 flexDirection:"row",
 marginHorizontal:15,
 marginBottom:10,
 backgroundColor:"#f2f2f2",
 borderRadius:10
},

tab:{
 flex:1,
 paddingVertical:10,
 alignItems:"center",
 borderRadius:10
},

activeTab:{
 backgroundColor:"#7b3fe4"
},

tabText:{
 fontSize:14,
 color:"#555"
},

activeTabText:{
 color:"#fff",
 fontWeight:"600"
},

chatCard:{
 flexDirection:"row",
 alignItems:"center",
 padding:15,
 borderBottomWidth:1,
 borderColor:"#eee"
},

avatarContainer:{
 position:"relative",
 marginRight:15
},

avatar:{
 width:55,
 height:55,
 borderRadius:28
},

onlineDot:{
 width:12,
 height:12,
 borderRadius:6,
 backgroundColor:"#22c55e",
 position:"absolute",
 bottom:2,
 right:2,
 borderWidth:2,
 borderColor:"#fff"
},

chatInfo:{
flex:1
},

chatMeta:{
 alignItems:"flex-end"
},

emptyState:{
 paddingHorizontal:24,
 paddingTop:48,
 alignItems:"center"
},

emptyTitle:{
 fontSize:16,
 fontWeight:"600",
 color:"#111"
},

emptyText:{
 marginTop:8,
 fontSize:13,
 lineHeight:18,
 color:"#666",
 textAlign:"center"
},

username:{
 fontSize:16,
 fontWeight:"600"
},

lastMessage:{
 color:"#777",
 marginTop:3,
 fontSize:13
},

unreadBadge:{
 minWidth:22,
 height:22,
 borderRadius:11,
 paddingHorizontal:6,
 alignItems:"center",
 justifyContent:"center",
 backgroundColor:"#7b3fe4",
 marginBottom:8
},

unreadText:{
 color:"#fff",
 fontSize:11,
 fontWeight:"700"
},

groupButton:{
 position:"absolute",
 bottom:25,
 right:25,
 backgroundColor:"#7b3fe4",
 width:55,
 height:55,
 borderRadius:28,
 justifyContent:"center",
 alignItems:"center",
 elevation:4
},

center:{
 flex:1,
 justifyContent:"center",
 alignItems:"center"
}

});
