import React, { useState, useEffect } from "react";
import {
 View,
 Text,
 StyleSheet,
 TouchableOpacity,
 ScrollView,
 Switch,
 Alert
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API } from "../api/api";

const SettingsScreen = ({ navigation }: any) => {

 const isFocused = useIsFocused();

 const [isPrivate, setIsPrivate] = useState(false);
 const [darkMode, setDarkMode] = useState(false);
 const [loading, setLoading] = useState(false);

 // LOAD PRIVACY WHEN SCREEN OPENS
 useEffect(() => {

  const loadPrivacy = async () => {

   try {

    const token = await AsyncStorage.getItem("token");

    const res = await API.get(
     "/auth/me",
     {
      headers: { Authorization: `Bearer ${token}` }
     }
    );

    const value = res?.data?.user?.isPrivate ?? false;

    setIsPrivate(value);

    await AsyncStorage.setItem(
     "isPrivate",
     JSON.stringify(value)
    );

   } catch (err) {

    const saved = await AsyncStorage.getItem("isPrivate");

    if (saved) {
     setIsPrivate(JSON.parse(saved));
    }

   }

  };

  if (isFocused) {
   loadPrivacy();
  }

 }, [isFocused]);

 // LOGOUT
 const logout = async () => {
  await AsyncStorage.removeItem("token");
  navigation.replace("Login");
 };

 // PRIVATE PROFILE TOGGLE
 const togglePrivateProfile = async () => {

  if (loading) return;

  try {

   setLoading(true);

   const token = await AsyncStorage.getItem("token");

   const res = await API.post(
    "/auth/toggle-private",
    {},
    {
     headers: { Authorization: `Bearer ${token}` }
    }
   );

   const value = res?.data?.isPrivate ?? false;

   setIsPrivate(value);

   await AsyncStorage.setItem(
    "isPrivate",
    JSON.stringify(value)
   );

   Alert.alert(
    "Profile Updated",
    value
     ? "🔒 Your profile is now Private"
     : "🌍 Your profile is now Public"
   );

  } catch (error) {

   Alert.alert(
    "Error",
    "Unable to update profile privacy"
   );

  } finally {
   setLoading(false);
  }

 };

 return (

  <SafeAreaView style={styles.container}>
   <View style={styles.header}>
    <TouchableOpacity onPress={() => navigation.goBack()}>
     <Icon name="arrow-back" size={26}/>
    </TouchableOpacity>
    <Text style={styles.headerTitle}>
     Settings and Activity
    </Text>

   </View>

   <ScrollView showsVerticalScrollIndicator={false}>

    <Text style={styles.section}>Your account</Text>

    <View style={styles.item}>
     <Text style={styles.text}>Private account</Text>

     <Switch
      value={isPrivate}
      onValueChange={togglePrivateProfile}
      disabled={loading}
     />
    </View>

    <TouchableOpacity
     style={styles.item}
     onPress={() => navigation.navigate("BlockedUsersScreen")}
    >
     <Text style={styles.text}>Blocked users</Text>
     <Icon name="chevron-forward" size={20}/>
    </TouchableOpacity>

    <TouchableOpacity
     style={styles.item}
     onPress={() => navigation.navigate("NotificationSettingsScreen")}
    >
     <Text style={styles.text}>Notifications</Text>
     <Icon name="chevron-forward" size={20}/>
    </TouchableOpacity>

    <TouchableOpacity
     style={styles.item}
     onPress={() => navigation.navigate("AccountCenter")}
    >
     <Text style={styles.text}>Account center</Text>
     <Icon name="chevron-forward" size={20}/>
    </TouchableOpacity>

    <Text style={styles.section}>Seller</Text>

    <TouchableOpacity
     style={styles.item}
     onPress={() => navigation.navigate("SellerRegistration")}
    >
     <Text style={styles.vendorText}>Become a Seller</Text>
     <Icon name="storefront-outline" size={20}/>
    </TouchableOpacity>

    <TouchableOpacity
     style={styles.item}
     onPress={() => navigation.navigate("VendorDashboard")}
    >
     <Text style={styles.text}>Seller dashboard</Text>
     <Icon name="chevron-forward" size={20}/>
    </TouchableOpacity>

    <Text style={styles.section}>
     How others interact with you
    </Text>

    <TouchableOpacity
     style={styles.item}
     onPress={() => navigation.navigate("CommentSettings")}
    >
     <Text style={styles.text}>Comments</Text>
     <Icon name="chevron-forward" size={20}/>
    </TouchableOpacity>

    <TouchableOpacity
     style={styles.item}
     onPress={() => navigation.navigate("TagSettings")}
    >
     <Text style={styles.text}>Tags and mentions</Text>
     <Icon name="chevron-forward" size={20}/>
    </TouchableOpacity>

    <Text style={styles.section}>App settings</Text>

    <View style={styles.item}>
     <Text style={styles.text}>Dark mode</Text>
     <Switch
      value={darkMode}
      onValueChange={() => setDarkMode(!darkMode)}
     />
    </View>

    <Text style={styles.section}>Support</Text>

    <TouchableOpacity style={styles.item}>
     <Text style={styles.text}>Help & Support</Text>
     <Icon name="chevron-forward" size={20}/>
    </TouchableOpacity>

    <TouchableOpacity
     style={styles.item}
     onPress={() => navigation.navigate("DeleteAccountScreen")}
    >
     <Text style={styles.deleteText}>
      Delete account
     </Text>
    </TouchableOpacity>

    <TouchableOpacity
     style={styles.logout}
     onPress={logout}
    >
     <Text style={styles.logoutText}>
      Log out
     </Text>
    </TouchableOpacity>

   </ScrollView>

  </SafeAreaView>

 );
};

export default SettingsScreen;

const styles = StyleSheet.create({

 container:{
  flex:1,
  backgroundColor:"#fff"
 },

 header:{
  flexDirection:"row",
  alignItems:"center",
  paddingHorizontal:15,
  paddingVertical:10,
  borderBottomWidth:1,
  borderColor:"#eee",
  paddingTop:10
 },

 headerTitle:{
  fontSize:18,
  fontWeight:"600",
  marginLeft:15
 },

 section:{
  fontSize:13,
  color:"#888",
  marginTop:25,
  marginLeft:15,
  marginBottom:10
 },

 item:{
  flexDirection:"row",
  justifyContent:"space-between",
  alignItems:"center",
  paddingVertical:15,
  paddingHorizontal:15,
  borderBottomWidth:1,
  borderColor:"#eee"
 },

 text:{
  fontSize:16
 },

 vendorText:{
  fontSize:16,
  color:"#1877f2",
  fontWeight:"500"
 },

 deleteText:{
  fontSize:16,
  color:"red"
 },

 logout:{
  padding:20
 },

 logoutText:{
  color:"red",
  fontSize:16,
  fontWeight:"600",
  textAlign:"center"
 }

});

