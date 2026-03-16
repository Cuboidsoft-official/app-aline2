import React from "react";
import {View,Text,TouchableOpacity,Alert} from "react-native";

const DeleteAccountScreen = () => {

 const deleteAccount = ()=>{
  Alert.alert(
   "Delete account",
   "Are you sure?",
   [
    {text:"Cancel"},
    {text:"Delete",style:"destructive"}
   ]
  );
 };

 return(

  <View style={{flex:1,justifyContent:"center",alignItems:"center"}}>

   <TouchableOpacity onPress={deleteAccount}>
    <Text style={{color:"red",fontSize:18}}>
     Delete my account
    </Text>
   </TouchableOpacity>

  </View>

 );

};

export default DeleteAccountScreen;