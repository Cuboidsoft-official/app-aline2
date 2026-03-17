import React, { useState } from "react";
import {
 View,
 Text,
 StyleSheet,
 Image,
 ScrollView,
 TouchableOpacity,
 Animated,
 Dimensions
} from "react-native";

import Icon from "react-native-vector-icons/Ionicons";

const { width } = Dimensions.get("window");

function FeedScreen({ navigation }: any) {

 const [menuOpen, setMenuOpen] = useState(false);
 const slideAnim = useState(new Animated.Value(-width))[0];

 const toggleMenu = () => {
  Animated.timing(slideAnim, {
   toValue: menuOpen ? -width : 0,
   duration: 300,
   useNativeDriver: true,
  }).start();

  setMenuOpen(!menuOpen);
 };

 // ✅ Section Based Menu
 const menuSections = [
   {
     title: "Account",
     data: [
       { icon: "person-outline", label: "My Profile", screen: "ProfileView" },
       { icon: "wallet-outline", label: "My Balance", screen: "WalletScreen" },
     ],
   },
   {
     title: "Earnings",
     data: [
       { icon: "cash-outline", label: "How to Earn", screen: "HowToEarnScreen" },
       { icon: "gift-outline", label: "Referral Program", screen: "ReferralScreen" },
     ],
   },
   {
     title: "Business",
     data: [
       { icon: "storefront-outline", label: "Become a Seller", screen: "SellerScreen" },
     ],
   },
   {
     title: "Support",
     data: [
       { icon: "chatbubble-outline", label: "Feedback", screen: "FeedbackScreen" },
       { icon: "help-circle-outline", label: "Help Center", screen: "HelpScreen" },
     ],
   },
 ];

 const stories = ["You","Rahul","Reema","Amit","Rohit","Neha"];

 return (
  <View style={{ flex: 1 }}>

   {/* Overlay */}
   {menuOpen && (
    <TouchableOpacity style={styles.overlay} onPress={toggleMenu} />
   )}

   {/* ✅ PREMIUM SIDEBAR */}
   <Animated.View
    style={[
     styles.sidebar,
     { transform: [{ translateX: slideAnim }] },
    ]}
   >

    {/* Gradient Header */}
    <View style={styles.headerGradient}>
     <Image
      source={{ uri: "https://aline2.com/asstes/images/logo/logo.jpeg" }}
      style={styles.profileImg}
     />
     <Text style={styles.name}>Aline2</Text>
     <Text style={styles.tagline}>Earn • Connect • Grow</Text>
    </View>

    {/* User Card */}
    <View style={styles.userCard}>
     <Text style={styles.balanceText}>₹ 12,450</Text>
     <Text style={styles.balanceLabel}>Available Balance</Text>
    </View>

    {/* Sections */}
    <ScrollView showsVerticalScrollIndicator={false}>
     {menuSections.map((section, index) => (
      <View key={index} style={styles.section}>
       <Text style={styles.sectionTitle}>{section.title}</Text>

       {section.data.map((item, i) => (
        <TouchableOpacity key={i} style={styles.menuItem} onPress={()=>navigation.navigate(item.screen)}>
         <View style={styles.iconCircle}>
          <Icon name={item.icon} size={18} color="#ab2aeb" />
         </View>

         <Text style={styles.menuText}>{item.label}</Text>

         <Icon name="chevron-forward" size={18} color="#bbb" />
        </TouchableOpacity>
       ))}
      </View>
     ))}
    </ScrollView>

    {/* Logout */}
    <TouchableOpacity style={styles.logout}>
     <Icon name="log-out-outline" size={18} color="#fff" />
     <Text style={styles.logoutText}>Logout</Text>
    </TouchableOpacity>

   </Animated.View>

   {/* MAIN UI (UNCHANGED) */}
   <View style={styles.container}>

    {/* Header */}
    <View style={styles.header}>
     <View style={styles.headerLeft}>

      {/* CLICK LOGO */}
      <TouchableOpacity onPress={toggleMenu}>
       <Image
        source={{ uri: "https://aline2.com/asstes/images/logo/logo.jpeg" }}
        style={styles.logo}
       />
      </TouchableOpacity>

      <Text style={styles.title}>Aline2</Text>
     </View>

     <View style={styles.headerRight}>
      <Icon onPress={()=> navigation.navigate('Search')} name="search-outline" size={24} color="#333"/>
      <Icon
       onPress={() => navigation.navigate('NotificationScreen')}
       name="notifications-outline"
       size={24}
       color="#333"
       style={{marginLeft:15}}
      />
     </View>
    </View>

    <ScrollView showsVerticalScrollIndicator={false}>

     {/* Stories */}
     <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storyContainer}>
      {stories.map((name,i)=>(
       <View key={i} style={styles.story}>
        <Image
         source={{uri:"https://randomuser.me/api/portraits/men/1.jpg"}}
         style={styles.storyImage}
        />
        <Text style={styles.storyText}>{name}</Text>
       </View>
      ))}
     </ScrollView>

     {/* Post */}
     <View style={styles.post}>
      <View style={styles.postHeader}>
       <Image
        source={{uri:"https://randomuser.me/api/portraits/women/2.jpg"}}
        style={styles.postProfile}
       />
       <Text style={styles.postUser}>@reema</Text>
       <Icon name="ellipsis-horizontal" size={20} style={{marginLeft:"auto"}}/>
      </View>

      <Image source={{uri:"https://picsum.photos/500"}} style={styles.postImage}/>

      <View style={styles.postActions}>
       <TouchableOpacity><Icon name="heart-outline" size={24}/></TouchableOpacity>
       <TouchableOpacity><Icon name="chatbubble-outline" size={24}/></TouchableOpacity>
       <TouchableOpacity><Icon name="paper-plane-outline" size={24}/></TouchableOpacity>
       <TouchableOpacity style={{marginLeft:"auto"}}>
        <Icon name="bookmark-outline" size={24}/>
       </TouchableOpacity>
      </View>

      <Text style={styles.likes}>120 likes</Text>
     </View>

    </ScrollView>
   </View>
  </View>
 );
}

export default FeedScreen;
const styles = StyleSheet.create({

 container:{
  flex:1,
  backgroundColor:"#fff"
 },

 header:{
  flexDirection:"row",
  justifyContent:"space-between",
  alignItems:"center",
  paddingHorizontal:15,
  paddingVertical:12,
  borderBottomWidth:0.5,
  borderColor:"#ddd",
  paddingTop: 40,
  marginBottom: 10,
 },

 headerLeft:{
  flexDirection:"row",
  alignItems:"center"
 },
sidebar: {
 position: "absolute",
 width: width * 0.8,
 height: "100%",
 backgroundColor: "#fff",
 zIndex: 10,
 elevation: 20,
},

overlay: {
 position: "absolute",
 width: "100%",
 height: "100%",
 backgroundColor: "rgba(0,0,0,0.4)",
},

headerGradient: {
 backgroundColor: "#ab2aeb",
 padding: 20,
 borderBottomLeftRadius: 25,
 borderBottomRightRadius: 25,
 alignItems: "center",
},

profileImg: {
 width: 70,
 height: 70,
 borderRadius: 40,
 borderWidth: 2,
 borderColor: "#fff",
},

name: {
 color: "#fff",
 fontSize: 18,
 fontWeight: "bold",
 marginTop: 8,
},

tagline: {
 color: "#ddd",
 fontSize: 12,
},

userCard: {
 backgroundColor: "#fff",
 margin: 15,
 padding: 15,
 borderRadius: 15,
 elevation: 4,
 alignItems: "center",
},

balanceText: {
 fontSize: 22,
 fontWeight: "bold",
 color: "#ab2aeb",
},

balanceLabel: {
 fontSize: 12,
 color: "#888",
},

section: {
 marginHorizontal: 15,
 marginBottom: 10,
},

sectionTitle: {
 fontSize: 12,
 color: "#888",
 marginBottom: 5,
},

menuItem: {
 flexDirection: "row",
 alignItems: "center",
 padding: 12,
 borderRadius: 10,
},

iconCircle: {
 width: 35,
 height: 35,
 borderRadius: 20,
 backgroundColor: "#f3efff",
 justifyContent: "center",
 alignItems: "center",
 marginRight: 10,
},

menuText: {
 flex: 1,
 fontSize: 16,
},

logout: {
 backgroundColor: "#ab2aeb",
 margin: 20,
 padding: 15,
 borderRadius: 30,
 flexDirection: "row",
 justifyContent: "center",
 alignItems: "center",
},

logoutText: {
 color: "#fff",
 marginLeft: 10,
 fontWeight: "bold",
},

 logo:{
  width:40,
  height:40,
  borderRadius:20,
  marginRight:8
 },

 title:{
  fontSize:28,
  fontWeight:"bold",
  color:"#7b3fe4"
 },

 headerRight:{
  flexDirection:"row",
  alignItems:"center"
 },

 storyContainer:{
  paddingVertical:12,
  paddingLeft:10
 },

 story:{
  alignItems:"center",
  marginRight:15
 },

 storyImage:{
  width:70,
  height:70,
  borderRadius:40,
  borderWidth:2,
  borderColor:"#a64bf4"
 },

 storyText:{
  fontSize:12,
  marginTop:4
 },

 post:{
  marginBottom:20
 },

 postHeader:{
  flexDirection:"row",
  alignItems:"center",
  padding:10
 },

 postProfile:{
  width:36,
  height:36,
  borderRadius:20,
  marginRight:8
 },

 postUser:{
  fontWeight:"bold",
  fontSize:14
 },

 postImage:{
  width:"100%",
  height:300
 },

 postActions:{
  flexDirection:"row",
  padding:10,
  gap:15
 },

 likes:{
  fontWeight:"bold",
  paddingHorizontal:10
 }

});