import React from "react";
import {View,Text,StyleSheet,FlatList} from "react-native";

const BlockedUsersScreen = () => {

 const blockedUsers = [
  {id:1,name:"John"},
  {id:2,name:"Alex"}
 ];

 return(
  <View style={styles.container}>
   <FlatList
    data={blockedUsers}
    keyExtractor={(item)=>item.id.toString()}
    renderItem={({item})=>(
     <View style={styles.user}>
      <Text>{item.name}</Text>
     </View>
    )}
   />
  </View>
 );
};

export default BlockedUsersScreen;

const styles = StyleSheet.create({
 container:{flex:1,padding:20},
 user:{padding:15,borderBottomWidth:1}
});