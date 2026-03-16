import React,{useState} from "react";
import {View,Text,Switch,StyleSheet} from "react-native";

const NotificationSettingsScreen = () => {

 const [likes,setLikes]=useState(true);
 const [comments,setComments]=useState(true);
 const [followers,setFollowers]=useState(false);

 return(

  <View style={styles.container}>

   <View style={styles.item}>
    <Text>Likes</Text>
    <Switch value={likes} onValueChange={setLikes}/>
   </View>

   <View style={styles.item}>
    <Text>Comments</Text>
    <Switch value={comments} onValueChange={setComments}/>
   </View>

   <View style={styles.item}>
    <Text>New Followers</Text>
    <Switch value={followers} onValueChange={setFollowers}/>
   </View>

  </View>

 );
};

export default NotificationSettingsScreen;

const styles = StyleSheet.create({
 container:{flex:1,padding:20},
 item:{flexDirection:"row",justifyContent:"space-between",marginBottom:20}
});