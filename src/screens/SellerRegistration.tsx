import React, { useState } from "react";
import {
View,
Text,
StyleSheet,
TextInput,
TouchableOpacity,
Image,
ScrollView,
Switch,
ActivityIndicator,
Alert
} from "react-native";

import { launchImageLibrary } from "react-native-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API } from "../api/api";

const SellerRegistration = ({ navigation }: any) => {

const [name,setName] = useState("");
const [specialization,setSpecialization] = useState("");
const [bio,setBio] = useState("");
const [clinicLink,setClinicLink] = useState("");
const [experience,setExperience] = useState("");
const [status,setStatus] = useState(true);

const [avatar,setAvatar] = useState(null);
const [cover,setCover] = useState(null);

const [loading,setLoading] = useState(false);


// PICK AVATAR
const pickAvatar = () => {

launchImageLibrary({mediaType:"photo"}, response => {

if(response.assets && response.assets.length > 0){
setAvatar(response.assets[0].uri);
}

});

};


// PICK COVER
const pickCover = () => {

launchImageLibrary({mediaType:"photo"}, response => {

if(response.assets && response.assets.length > 0){
setCover(response.assets[0].uri);
}

});

};


// REGISTER SELLER
const registerSeller = async () => {

if(!name || !specialization){

Alert.alert("Error","Please fill required fields");
return;

}

try{

setLoading(true);

const token = await AsyncStorage.getItem("token");

const sellerData = {

name,
specialization,
bio,
clinicLink,
experience,
status,
avatar,
cover

};

const res = await API.post(

"/seller/create",
sellerData,

{
headers:{
Authorization:`Bearer ${token}`
}
}

);

console.log("Seller Created:",res.data);

Alert.alert("Success","You are now a Seller!");

navigation.navigate("SellerDashboard");


}catch(error){

console.log("Seller Register Error:",error);

Alert.alert("Error","Unable to register seller");

}finally{

setLoading(false);

}

};


return(

<ScrollView style={styles.container}>

{/* COVER IMAGE */}

<TouchableOpacity onPress={pickCover}>

<Image
source={
cover
? {uri:cover}
: {uri:"https://via.placeholder.com/600x200"}
}
style={styles.cover}
/>

</TouchableOpacity>


{/* AVATAR */}

<View style={styles.avatarContainer}>

<TouchableOpacity onPress={pickAvatar}>

<Image
source={
avatar
? {uri:avatar}
: {uri:"https://via.placeholder.com/100"}
}
style={styles.avatar}
/>

</TouchableOpacity>

</View>


<View style={styles.form}>

<Text style={styles.title}>Become a Seller</Text>


<Text style={styles.label}>Seller Name</Text>

<TextInput
style={styles.input}
value={name}
onChangeText={setName}
placeholder="Enter seller name"
/>


<Text style={styles.label}>Specialization</Text>

<TextInput
style={styles.input}
value={specialization}
onChangeText={setSpecialization}
placeholder="IVF Specialist"
/>


<Text style={styles.label}>Bio</Text>

<TextInput
style={[styles.input,{height:80}]}
value={bio}
onChangeText={setBio}
placeholder="Write about yourself"
multiline
/>


<Text style={styles.label}>Clinic Link</Text>

<TextInput
style={styles.input}
value={clinicLink}
onChangeText={setClinicLink}
placeholder="clinic.link/dr.jane"
/>


<Text style={styles.label}>Years of Experience</Text>

<TextInput
style={styles.input}
value={experience}
onChangeText={setExperience}
keyboardType="numeric"
placeholder="0"
/>


<View style={styles.statusRow}>

<Text style={styles.label}>Status</Text>

<View style={styles.switchBox}>

<Text>I'm In</Text>

<Switch
value={status}
onValueChange={setStatus}
/>

<Text>I'm Out</Text>

</View>

</View>


{/* BUTTON */}

<TouchableOpacity
style={styles.button}
onPress={registerSeller}
disabled={loading}
>

{
loading
?
<ActivityIndicator color="#fff"/>
:
<Text style={styles.buttonText}>
Register as Seller
</Text>
}

</TouchableOpacity>

</View>

</ScrollView>

);

};

export default SellerRegistration;


const styles = StyleSheet.create({

container:{
flex:1,
backgroundColor:"#f5f5f5"
},

cover:{
height:180,
width:"100%"
},

avatarContainer:{
alignItems:"center",
marginTop:-45
},

avatar:{
width:90,
height:90,
borderRadius:45,
borderWidth:3,
borderColor:"#fff"
},

form:{
padding:20
},

title:{
fontSize:20,
fontWeight:"600",
textAlign:"center",
marginBottom:20
},

label:{
marginTop:10,
marginBottom:5,
fontWeight:"600"
},

input:{
backgroundColor:"#fff",
padding:12,
borderRadius:10,
borderWidth:1,
borderColor:"#ddd"
},

statusRow:{
marginTop:20
},

switchBox:{
flexDirection:"row",
alignItems:"center",
gap:10
},

button:{
backgroundColor:"#7B4DFF",
padding:15,
borderRadius:30,
alignItems:"center",
marginTop:30
},

buttonText:{
color:"#fff",
fontWeight:"600",
fontSize:16
}

});