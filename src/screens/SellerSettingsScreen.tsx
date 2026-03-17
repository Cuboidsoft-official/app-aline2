import React, {useState} from "react";
import {
View,
Text,
StyleSheet,
TouchableOpacity,
ScrollView,
Switch,
Image,
Alert
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";

const SellerSettingsScreen = ({navigation}: any) => {

const [isAvailable, setIsAvailable] = useState(true);

const deleteSellerProfile = () => {
Alert.alert(
"Delete Seller Profile",
"Are you sure you want to delete your seller profile?",
[
{ text: "Cancel", style: "cancel" },
{ text: "Delete", style: "destructive" }
]
);
};

return (

<SafeAreaView style={styles.container}>

{/* HEADER */}
<View style={styles.header}>
<TouchableOpacity onPress={() => navigation.goBack()}>
<Icon name="arrow-back" size={24} color="#000"/>
</TouchableOpacity>

<Text style={styles.headerTitle}>Seller Settings</Text>
</View>

<ScrollView showsVerticalScrollIndicator={false}>

{/* SELLER PROFILE */}
<Text style={styles.section}>Seller Profile</Text>

<TouchableOpacity
style={styles.item}
onPress={() => navigation.navigate("UpdateSellerProfile")}
>
<Text style={styles.text}>Update Profile</Text>
<Icon name="chevron-forward" size={20}/>
</TouchableOpacity>

<TouchableOpacity
style={styles.item}
onPress={() => navigation.navigate("UserProfile")}
>
<Text style={styles.text}>Switch to User Profile</Text>
<Icon name="person-outline" size={20}/>
</TouchableOpacity>


{/* AVAILABILITY */}
<Text style={styles.section}>Availability</Text>

<View style={styles.item}>
<Text style={styles.text}>Seller Availability</Text>

<Switch
value={isAvailable}
onValueChange={() => setIsAvailable(!isAvailable)}
thumbColor={isAvailable ? "#ab2aeb" : "#ccc"}
/>
</View>


{/* WALLET */}
<Text style={styles.section}>Seller Wallet</Text>

<TouchableOpacity
style={styles.item}
onPress={() => navigation.navigate("RechargeWallet")}
>
<Text style={styles.text}>Recharge Wallet</Text>
<Icon name="wallet-outline" size={20}/>
</TouchableOpacity>

{/* PAYMENT ICONS (FIXED PNG) */}
<View style={styles.paymentRow}>

<Image
 source={{ uri: "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/phonepe-icon.png" }}
 style={styles.paymentIcon}
/>

<Image
 source={{ uri: "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/google-pay-icon.png" }}
 style={styles.paymentIcon}
/>

<Image
 source={{ uri: "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/paytm-icon.png" }}
 style={styles.paymentIcon}
/>

</View>


{/* 🔥 ADS & PROMOTIONS */}
<Text style={styles.section}>Ads & Promotions</Text>

<TouchableOpacity
style={styles.item}
onPress={() => navigation.navigate("PromoteProfile")}
>
<View style={styles.row}>
<Icon name="trending-up-outline" size={20} color="#ab2aeb"/>
<Text style={styles.textSpacing}>Promote Profile</Text>
</View>

<Text style={styles.badge}>NEW</Text>
</TouchableOpacity>

<TouchableOpacity
style={styles.item}
onPress={() => navigation.navigate("BoostPost")}
>
<View style={styles.row}>
<Icon name="megaphone-outline" size={20} color="#ab2aeb"/>
<Text style={styles.textSpacing}>Boost Ads / Campaign</Text>
</View>

<Icon name="chevron-forward" size={20}/>
</TouchableOpacity>


{/* ACCOUNT */}
<Text style={styles.section}>Account</Text>

<TouchableOpacity style={styles.item} onPress={deleteSellerProfile}>
<Text style={styles.deleteText}>Delete Seller Profile</Text>
</TouchableOpacity>

</ScrollView>

</SafeAreaView>
);
};

export default SellerSettingsScreen;

const styles = StyleSheet.create({

container: {
flex: 1,
backgroundColor: "#fff"
},

header: {
flexDirection: "row",
alignItems: "center",
paddingHorizontal: 15,
paddingVertical: 12,
borderBottomWidth: 1,
borderColor: "#eee"
},

headerTitle: {
fontSize: 18,
fontWeight: "600",
marginLeft: 15
},

section: {
fontSize: 13,
color: "#888",
marginTop: 25,
marginLeft: 15,
marginBottom: 10
},

item: {
flexDirection: "row",
justifyContent: "space-between",
alignItems: "center",
paddingVertical: 15,
paddingHorizontal: 15,
borderBottomWidth: 1,
borderColor: "#eee"
},

text: {
fontSize: 16
},

textSpacing: {
fontSize: 16,
marginLeft: 10
},

deleteText: {
fontSize: 16,
color: "red"
},

row: {
flexDirection: "row",
alignItems: "center"
},

paymentRow: {
flexDirection: "row",
justifyContent: "space-around",
padding: 20
},
paymentRow: {
 flexDirection: "row",
 justifyContent: "space-between",
 paddingHorizontal: 20,
 paddingVertical: 15
},

paymentIcon: {
 width: 80,
 height: 35,
 resizeMode: "contain"
},
paymentIcon: {
width: 60,
height: 30,
resizeMode: "contain"
},

badge: {
backgroundColor: "#ab2aeb",
color: "#fff",
paddingHorizontal: 8,
paddingVertical: 3,
borderRadius: 6,
fontSize: 10,
fontWeight: "bold"
}

});