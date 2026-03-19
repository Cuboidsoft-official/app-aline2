import React, { useEffect, useState, useCallback } from "react";
import {
View,
Text,
StyleSheet,
Image,
FlatList,
TextInput,
TouchableOpacity,
ImageBackground,
Modal,
SafeAreaView,
StatusBar
} from "react-native";

import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API } from "../api/api";
import { socket } from "../socket";

const ChatScreen = ({ navigation, route }) => {

const { userId, conversationId } = route.params || {};

const [user, setUser] = useState(null);
const [text, setText] = useState("");
const [showTools, setShowTools] = useState(false);
const [messages, setMessages] = useState([]);


useEffect(() => {

console.log("USER:", userId);
console.log("CONVERSATION:", conversationId);

if (userId) {
 fetchUser();
}

if (conversationId) {
 fetchMessages();
 socket.emit("joinConversation", conversationId);
}

socket.emit("userOnline", userId);

}, [userId, conversationId]);



/* SCREEN FOCUS → MESSAGES RELOAD */
useFocusEffect(
useCallback(() => {

 if (conversationId) {

  fetchMessages();

 }

}, [conversationId])
);



/* REALTIME MESSAGE LISTENER */
useEffect(() => {

socket.on("receiveMessage", (message) => {

 console.log("Realtime message:", message);

 setMessages(prev => {

  const exists = prev.find(m => m._id === message._id);

  if (exists) return prev;

  return [...prev, message];

 });

});

return () => {

 socket.off("receiveMessage");

};

}, []);


// FETCH USER
const fetchUser = async () => {

try {

const token = await AsyncStorage.getItem("token");

const res = await API.get(`/auth/user/${userId}`, {
headers: { Authorization: `Bearer ${token}` }
});

setUser(res.data.user);

} catch (err) {

console.log("User fetch error:", err?.response?.data || err);

}

};


// FETCH MESSAGES
const fetchMessages = async () => {

try {

const token = await AsyncStorage.getItem("token");

const res = await API.get(`/message/${conversationId}`, {
headers: { Authorization: `Bearer ${token}` }
});

console.log("MESSAGES:", res.data);

if (res?.data?.messages) {

console.log("Setting messages:", res.data.messages);

setMessages(res.data.messages);

}
} catch (err) {

console.log("Fetch messages error:", err?.response?.data || err);

}

};


// SEND MESSAGE
const sendMessage = async () => {

if (!text.trim()) return;

try {

const token = await AsyncStorage.getItem("token");

console.log("Sending message:", {
conversationId,
text
});

const res = await API.post(
"/message/send",
{
conversationId,
text,
messageType: "text"
},
{
headers: { Authorization: `Bearer ${token}` }
}
);

console.log("SEND RESPONSE:", res.data);

if (res?.data?.message) {

setMessages(prev => [...prev, res.data.message]);

socket.emit("sendMessage", {
conversationId,
message: res.data.message
});

}

setText("");

} catch (err) {

console.log("Send message error:", err?.response?.data || err);

}

};


// RENDER MESSAGE
const renderMessage = ({ item }) => {

const isMine =
item.sender === "me" ||
item.senderId === userId ||
item?.sender === userId;

return (

<View
style={[
styles.messageRow,
isMine ? { justifyContent: "flex-end" } : { justifyContent: "flex-start" }
]}
>

<View
style={[
styles.messageBubble,
isMine ? styles.myMessage : styles.otherMessage
]}
>

{item.messageType === "gif" ? (

<Image
source={{ uri: item.text }}
style={{ width: 200, height: 200, borderRadius: 10 }}
/>

) : (

<Text style={styles.messageText}>
{item.text || item.message || item.content}
</Text>

)}

</View>

</View>

);

};


const tools = [
{ id: "1", name: "Camera", icon: "camera" },
{ id: "2", name: "Gallery", icon: "image" },
{ id: "3", name: "Location", icon: "location" },
{ id: "4", name: "Contact", icon: "person" },
{ id: "5", name: "Document", icon: "document" },
{ id: "6", name: "Audio", icon: "musical-notes" },
{ id: "7", name: "GIF", icon: "happy" }
];

return (

<SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>

<StatusBar backgroundColor="#7b3fe4" barStyle="light-content" />


<View style={styles.header}>

<TouchableOpacity onPress={() => navigation.goBack()}>
<Icon name="arrow-back" size={24} color="#fff" />
</TouchableOpacity>

<TouchableOpacity
style={styles.userInfo}
activeOpacity={0.7}
onPress={() => navigation.navigate("ChatDetailsScreen", { userId })}
>

<Image
source={{
uri:
user?.profilePic ||
"https://cdn-icons-png.flaticon.com/512/149/149071.png"
}}
style={styles.avatar}
/>

<View>

<Text style={styles.username}>
{user?.username || user?.name || "Loading..."}
</Text>

<Text style={styles.status}>
online
</Text>

</View>

</TouchableOpacity>

<View style={styles.headerIcons}>

<TouchableOpacity style={{ marginRight: 15 }}>
<Icon name="videocam" size={22} color="#fff" />
</TouchableOpacity>

<TouchableOpacity style={{ marginRight: 15 }}>
<Icon name="call" size={20} color="#fff" />
</TouchableOpacity>

<TouchableOpacity>
<Icon name="ellipsis-vertical" size={20} color="#fff" />
</TouchableOpacity>

</View>

</View>


<ImageBackground
source={{
uri:
"https://img.freepik.com/free-vector/abstract-chat-box-shape-pattern-white-background_1017-59690.jpg"
}}
style={{ flex: 1 }}
resizeMode="cover"
>

<FlatList
data={messages}
extraData={messages}
keyExtractor={(item,index)=>item._id || item.id || index.toString()}
renderItem={renderMessage}
contentContainerStyle={{ padding: 12 }}
showsVerticalScrollIndicator={false}
/>

</ImageBackground>


<Modal visible={showTools} transparent animationType="slide">

<TouchableOpacity
style={styles.modalOverlay}
onPress={() => setShowTools(false)}
activeOpacity={1}
>

<View style={styles.toolboxContainer}>

<FlatList
data={tools}
numColumns={3}
keyExtractor={(item) => item.id}
renderItem={({ item }) => (

<TouchableOpacity style={styles.toolItem}>

<View style={styles.toolIcon}>
<Icon name={item.icon} size={26} color="#fff" />
</View>

<Text style={styles.toolText}>
{item.name}
</Text>

</TouchableOpacity>

)}
/>

</View>

</TouchableOpacity>

</Modal>


<View style={styles.inputContainer}>

<TouchableOpacity onPress={() => setShowTools(true)}>
<Icon name="add" size={28} color="#7b3fe4" />
</TouchableOpacity>

<View style={styles.inputBox}>

<TextInput
placeholder="Message"
placeholderTextColor="#888"
style={styles.input}
value={text}
onChangeText={setText}
/>

</View>

{text.length > 0 ? (

<TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
<Icon name="send" size={20} color="#fff" />
</TouchableOpacity>

) : (

<View style={{ flexDirection: "row" }}>

<TouchableOpacity style={{ marginRight: 15 }}>
<Icon name="camera" size={24} color="#7b3fe4" />
</TouchableOpacity>

<TouchableOpacity>
<Icon name="mic" size={24} color="#7b3fe4" />
</TouchableOpacity>

</View>

)}

</View>

</SafeAreaView>

);

};

export default ChatScreen;

const styles = StyleSheet.create({

header:{
backgroundColor:"#7b3fe4",
flexDirection:"row",
alignItems:"center",
paddingHorizontal:12,
paddingTop:StatusBar.currentHeight + 50,
paddingBottom:15
},

userInfo:{
flexDirection:"row",
alignItems:"center",
marginLeft:12,
flex:1
},

avatar:{
width:40,
height:40,
borderRadius:20,
marginRight:10
},

username:{
color:"#fff",
fontSize:16,
fontWeight:"600"
},

status:{
color:"#e6d9ff",
fontSize:12
},

headerIcons:{
flexDirection:"row",
alignItems:"center"
},

messageRow:{
flexDirection:"row",
marginVertical:4
},

messageBubble:{
padding:12,
borderRadius:16,
maxWidth:"75%"
},

messageText:{
fontSize:15
},

myMessage:{
backgroundColor:"#e7dbff"
},

otherMessage:{
backgroundColor:"#fff"
},

inputContainer:{
flexDirection:"row",
alignItems:"center",
padding:10,
backgroundColor:"#fff",
borderTopWidth:1,
borderColor:"#eee"
},

inputBox:{
flex:1,
backgroundColor:"#f2f2f2",
borderRadius:25,
marginHorizontal:10,
paddingHorizontal:15
},

input:{
height:40
},

sendBtn:{
backgroundColor:"#7b3fe4",
padding:10,
borderRadius:25
},

modalOverlay:{
flex:1,
backgroundColor:"rgba(0,0,0,0.25)",
justifyContent:"flex-end"
},

toolboxContainer:{
backgroundColor:"#fff",
borderTopLeftRadius:28,
borderTopRightRadius:28,
paddingTop:25,
paddingBottom:40,
paddingHorizontal:10
},

toolItem:{
flex:1,
alignItems:"center",
marginBottom:25
},

toolIcon:{
width:56,
height:56,
borderRadius:28,
backgroundColor:"#7b3fe4",
justifyContent:"center",
alignItems:"center",
marginBottom:6
},

toolText:{
fontSize:13,
color:"#333"
}

});