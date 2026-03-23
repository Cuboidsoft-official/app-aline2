import React, { useCallback, useEffect, useState } from "react";
import {
View,
Text,
StyleSheet,
Image,
TouchableOpacity,
ScrollView
} from "react-native";

import Icon from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API } from "../api/api";

const ChatDetailsScreen = ({ route, navigation }) => {

const { userId } = route.params;
const [user,setUser] = useState(null);
const [media,setMedia] = useState([]);

const fetchUser = useCallback(async ()=>{

 try{

  const token = await AsyncStorage.getItem("token");

  const res = await API.get(`/auth/user/${userId}`,{
   headers:{ Authorization:`Bearer ${token}` }
  });

  setUser(res.data.user);

  // agar future me media aaye backend se
  setMedia(res.data.user?.media || []);

 }catch(err){
  console.log(err);
 }

}, [userId]);

useEffect(()=>{
 fetchUser();
},[fetchUser]);

return(

<View style={styles.container}>

{/* HEADER */}

<View style={styles.header}>

<TouchableOpacity onPress={()=>navigation.goBack()}>
<Icon name="arrow-back" size={24} color="#fff"/>
</TouchableOpacity>

<Text style={styles.headerTitle}>
User Details
</Text>

<TouchableOpacity>
<Icon name="ellipsis-vertical" size={22} color="#fff"/>
</TouchableOpacity>

</View>

<ScrollView showsVerticalScrollIndicator={false}>

{/* PROFILE */}

<View style={styles.profileSection}>

<View style={styles.avatarRing}>

<Image
 source={{
  uri:user?.profilePic || "https://cdn-icons-png.flaticon.com/512/149/149071.png"
 }}
 style={styles.avatar}
/>

</View>

<Text style={styles.username}>
 {user?.name || user?.username}
</Text>

<Text style={styles.phone}>
 {user?.phone || "No phone number"}
</Text>

</View>

{/* ACTION BUTTONS */}

<View style={styles.actions}>

<Action icon="call-outline" title="Audio"/>

<Action icon="videocam-outline" title="Video"/>

<Action icon="search-outline" title="Search"/>

<Action icon="close-circle-outline" title="Block"/>

</View>

{/* MEDIA SECTION */}

<View style={styles.mediaSection}>

<Text style={styles.sectionTitle}>
Media
</Text>

{media.length > 0 ? (

<View style={styles.mediaRow}>

{media.slice(0,4).map((item,index)=>(
<Image
 key={index}
 source={{uri:item}}
 style={styles.mediaBox}
/>
))}

</View>

) : (

<View style={styles.noMediaBox}>

<Icon name="images-outline" size={30} color="#aaa"/>

<Text style={styles.noMediaText}>
No media files
</Text>

</View>

)}

</View>

{/* SETTINGS */}

<View style={styles.optionBox}>

<Option icon="notifications-outline" title="Notifications"/>
<Option icon="color-palette-outline" title="Chat theme"/>
<Option icon="time-outline" title="Disappearing messages"/>
<Option icon="shield-checkmark-outline" title="Encryption"/>

</View>

{/* BLOCK */}

<TouchableOpacity style={styles.blockButton}>

<Icon name="close-circle-outline" size={20} color="#ef4444"/>

<Text style={styles.blockText}>
Block {user?.name || "User"}
</Text>

</TouchableOpacity>

</ScrollView>

</View>

);

};

const Action = ({icon,title})=>{

return(

<TouchableOpacity style={styles.actionItem}>

<View style={styles.actionIcon}>

<Icon name={icon} size={24} color="#7b3fe4"/>

</View>

<Text style={styles.actionText}>
{title}
</Text>

</TouchableOpacity>

);

};

const Option = ({icon,title})=>{

return(

<TouchableOpacity style={styles.optionRow}>

<Icon name={icon} size={22} style={{marginRight:15}}/>

<Text style={{flex:1}}>
{title}
</Text>

<Icon name="chevron-forward"/>

</TouchableOpacity>

);

};

export default ChatDetailsScreen;

const styles = StyleSheet.create({

container:{
 flex:1,
 backgroundColor:"#f6f7fb"
},

header:{
 flexDirection:"row",
 alignItems:"center",
 justifyContent:"space-between",
 paddingHorizontal:18,
 paddingTop:55,
 paddingBottom:15,
 backgroundColor:"#7b3fe4"
},

headerTitle:{
 color:"#fff",
 fontSize:18,
 fontWeight:"600"
},

profileSection:{
 alignItems:"center",
 marginTop:25
},

avatarRing:{
 padding:4,
 borderRadius:70,
 backgroundColor:"#e9e0ff"
},

avatar:{
 width:110,
 height:110,
 borderRadius:55
},

username:{
 fontSize:22,
 fontWeight:"700",
 marginTop:12
},

phone:{
 color:"#777",
 marginTop:4
},

actions:{
 flexDirection:"row",
 justifyContent:"space-around",
 marginTop:30
},

actionItem:{
 alignItems:"center"
},

actionIcon:{
 width:60,
 height:60,
 borderRadius:30,
 backgroundColor:"#fff",
 justifyContent:"center",
 alignItems:"center",
 shadowColor:"#000",
 shadowOpacity:0.05,
 shadowRadius:6,
 elevation:2
},

actionText:{
 marginTop:6,
 fontSize:12
},

mediaSection:{
 marginTop:35,
 paddingHorizontal:20
},

sectionTitle:{
 fontSize:16,
 fontWeight:"600",
 marginBottom:10
},

mediaRow:{
 flexDirection:"row",
 justifyContent:"space-between"
},

mediaBox:{
 width:70,
 height:70,
 borderRadius:10
},

noMediaBox:{
 alignItems:"center",
 justifyContent:"center",
 paddingVertical:25
},

noMediaText:{
 marginTop:8,
 fontSize:13,
 color:"#999"
},

optionBox:{
 marginTop:35,
 backgroundColor:"#fff",
 marginHorizontal:18,
 borderRadius:14
},

optionRow:{
 flexDirection:"row",
 alignItems:"center",
 padding:16,
 borderBottomWidth:1,
 borderColor:"#f0f0f0"
},

blockButton:{
 flexDirection:"row",
 justifyContent:"center",
 alignItems:"center",
 margin:20,
 padding:15,
 borderRadius:14,
 borderWidth:1,
 borderColor:"#ef4444"
},

blockText:{
 color:"#ef4444",
 marginLeft:8,
 fontWeight:"600"
}

});
