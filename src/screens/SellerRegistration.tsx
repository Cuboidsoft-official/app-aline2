import React, { useState } from "react";
import {
View,
Text,
StyleSheet,
TextInput,
TouchableOpacity,
Image,
ScrollView,
Switch
} from "react-native";

import { launchImageLibrary } from "react-native-image-picker";
import Icon from "react-native-vector-icons/Ionicons";

const DEFAULT_COVER =
"https://www.bcmch.org/asset/uploads/common/867349919655f1491613e4.webp";

const DEFAULT_AVATAR =
"https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQikGmpeh_S05yj5punOSDXG-utlTE1TRdFWQ&s";

const SellerRegistration = ({ navigation }) => {

const [step,setStep] = useState(1);

const [name,setName] = useState("");
const [specialization,setSpecialization] = useState("");
const [bio,setBio] = useState("");
const [experience,setExperience] = useState("");
const [clinicLink,setClinicLink] = useState("");
const [status,setStatus] = useState(true);

const [avatar,setAvatar] = useState(null);
const [cover,setCover] = useState(null);

const [degree,setDegree] = useState("");
const [license,setLicense] = useState("");
const [gst,setGst] = useState("");

const [aadhaar,setAadhaar] = useState("");
const [pan,setPan] = useState("");

const [degreeDoc,setDegreeDoc] = useState(null);
const [licenseDoc,setLicenseDoc] = useState(null);
const [aadhaarDoc,setAadhaarDoc] = useState(null);
const [panDoc,setPanDoc] = useState(null);
const [idProof,setIdProof] = useState(null);

const [digilockerVerified,setDigilockerVerified] = useState(false);

const pickImage = (setter) => {

launchImageLibrary(
{mediaType:"photo"},
(response)=>{

if(response?.assets?.length > 0){
setter(response.assets[0].uri);
}

});

};

const renderUpload = (title,file,setter) => (

<TouchableOpacity
style={styles.uploadBox}
onPress={()=>pickImage(setter)}
>

<Icon name="document" size={22} color="#7B4DFF"/>

<Text style={styles.uploadText}>
{file ? `${title} Uploaded ✓` : `Upload ${title}`}
</Text>

</TouchableOpacity>

);

return(

<View style={{flex:1}}>

<View style={styles.header}>

<TouchableOpacity
onPress={()=>navigation.goBack()}
style={styles.backBtn}
>
<Icon name="arrow-back" size={22} color="#000"/>
</TouchableOpacity>

<Text style={styles.headerTitle}>
Seller Registration
</Text>

<View style={{width:30}}/>

</View>

<ScrollView style={styles.container}>

<View style={styles.coverContainer}>

<Image
source={{uri: cover || DEFAULT_COVER}}
style={styles.cover}
/>

<TouchableOpacity
style={styles.coverCamera}
onPress={()=>pickImage(setCover)}
>
<Icon name="camera" size={20} color="#fff"/>
</TouchableOpacity>

</View>

<View style={styles.avatarContainer}>

<Image
source={{uri: avatar || DEFAULT_AVATAR}}
style={styles.avatar}
/>

<TouchableOpacity
style={styles.avatarCamera}
onPress={()=>pickImage(setAvatar)}
>
<Icon name="camera" size={16} color="#fff"/>
</TouchableOpacity>

</View>

<View style={styles.form}>

<Text style={styles.stepText}>Step {step} of 4</Text>

{/* STEP 1 */}

{step === 1 && (

<View>

<Text style={styles.title}>Basic Information</Text>

<Text style={styles.label}>Seller Name</Text>
<TextInput
style={styles.input}
value={name}
onChangeText={setName}
placeholder="Enter name"
/>

<Text style={styles.label}>Specialization</Text>
<TextInput
style={styles.input}
value={specialization}
onChangeText={setSpecialization}
placeholder="Cardiology Specialist"
/>

<Text style={styles.label}>Bio</Text>
<TextInput
style={[styles.input,{height:90}]}
multiline
value={bio}
onChangeText={setBio}
placeholder="About you"
/>

</View>

)}

{/* STEP 2 */}

{step === 2 && (

<View>

<Text style={styles.title}>Professional Details</Text>

<Text style={styles.label}>Years of Experience</Text>
<TextInput
style={styles.input}
keyboardType="numeric"
value={experience}
onChangeText={setExperience}
placeholder="5"
/>

<Text style={styles.label}>Clinic Link</Text>
<TextInput
style={styles.input}
value={clinicLink}
onChangeText={setClinicLink}
placeholder="clinic.link/dr"
/>

<View style={styles.statusRow}>

<Text style={styles.label}>Status</Text>

<View style={styles.switchRow}>

<Text>Out</Text>

<Switch
value={status}
onValueChange={setStatus}
/>

<Text>In</Text>

</View>

</View>

<Text style={styles.sectionTitle}>Professional Verification</Text>

<Text style={styles.label}>Degree</Text>
<TextInput
style={styles.input}
value={degree}
onChangeText={setDegree}
placeholder="MBBS / MD"
/>

<Text style={styles.label}>License Number</Text>
<TextInput
style={styles.input}
value={license}
onChangeText={setLicense}
placeholder="Medical License"
/>

<Text style={styles.label}>GST (Optional)</Text>
<TextInput
style={styles.input}
value={gst}
onChangeText={setGst}
placeholder="GST"
/>

</View>

)}

{/* STEP 3 */}

{step === 3 && (

<View>

<Text style={styles.title}>Government Verification</Text>

<Text style={styles.label}>Aadhaar Number</Text>
<TextInput
style={styles.input}
value={aadhaar}
onChangeText={setAadhaar}
placeholder="XXXX XXXX XXXX"
keyboardType="numeric"
/>

<Text style={styles.label}>PAN Number</Text>
<TextInput
style={styles.input}
value={pan}
onChangeText={setPan}
placeholder="ABCDE1234F"
/>

<TouchableOpacity
style={styles.digilockerBtn}
onPress={()=>setDigilockerVerified(true)}
>

<Icon name="shield-checkmark" size={18} color="#fff"/>

<Text style={styles.digilockerText}>
{digilockerVerified ? "Verified with DigiLocker ✓" : "Verify with DigiLocker"}
</Text>

</TouchableOpacity>

</View>

)}

{/* STEP 4 */}

{step === 4 && (

<View>

<Text style={styles.title}>Upload Documents</Text>

{renderUpload("Degree Certificate",degreeDoc,setDegreeDoc)}
{renderUpload("License Document",licenseDoc,setLicenseDoc)}
{renderUpload("Aadhaar Card",aadhaarDoc,setAadhaarDoc)}
{renderUpload("PAN Card",panDoc,setPanDoc)}
{renderUpload("Government ID",idProof,setIdProof)}

</View>

)}

<View style={styles.stepButtons}>

{step > 1 && (
<TouchableOpacity
style={styles.backStep}
onPress={()=>setStep(step-1)}
>
<Text style={{color:"#fff"}}>Back</Text>
</TouchableOpacity>
)}

{step < 4 ? (

<TouchableOpacity
style={styles.nextStep}
onPress={()=>setStep(step+1)}
>
<Text style={{color:"#fff"}}>Next</Text>
</TouchableOpacity>

) : (

<TouchableOpacity
style={styles.button}
onPress={() => navigation.replace("SellerDashboardScreen")}
>
<Text style={styles.buttonText}>
Submit for Verification
</Text>
</TouchableOpacity>

)}

</View>

</View>

</ScrollView>

</View>

);

};

export default SellerRegistration;
const styles = StyleSheet.create({

container:{
flex:1,
backgroundColor:"#F6F7FB"
},

header:{
height:90,
backgroundColor:"#fff",
flexDirection:"row",
alignItems:"center",
paddingHorizontal:20,
borderBottomWidth:1,
borderBottomColor:"#eee",
paddingTop:40
},

headerTitle:{
fontSize:20,
fontWeight:"700",
marginLeft:10
},

backBtn:{
padding:5
},

coverContainer:{
position:"relative"
},

cover:{
height:200,
width:"100%"
},

coverCamera:{
position:"absolute",
right:15,
bottom:15,
backgroundColor:"#00000080",
padding:10,
borderRadius:30
},

avatarContainer:{
alignItems:"center",
marginTop:-50
},

avatar:{
width:100,
height:100,
borderRadius:50,
borderWidth:4,
borderColor:"#fff",
backgroundColor:"#eee"
},

avatarCamera:{
position:"absolute",
bottom:0,
right:140,
backgroundColor:"#7B4DFF",
padding:8,
borderRadius:20
},

form:{
padding:20
},

title:{
fontSize:22,
fontWeight:"700",
textAlign:"center",
marginBottom:25
},

stepText:{
textAlign:"center",
fontWeight:"600",
marginBottom:10
},

sectionTitle:{
fontSize:18,
fontWeight:"700",
marginTop:30,
marginBottom:15
},

label:{
marginTop:12,
marginBottom:6,
fontWeight:"600",
color:"#444"
},

input:{
backgroundColor:"#fff",
padding:14,
borderRadius:12,
borderWidth:1,
borderColor:"#e5e7eb",
fontSize:15
},

statusRow:{
marginTop:20,
flexDirection:"row",
justifyContent:"space-between",
alignItems:"center"
},

switchRow:{
flexDirection:"row",
alignItems:"center",
gap:10
},

uploadBox:{
flexDirection:"row",
alignItems:"center",
backgroundColor:"#fff",
padding:18,
borderRadius:12,
borderWidth:1,
borderColor:"#e5e7eb",
marginTop:12
},

uploadText:{
marginLeft:12,
fontWeight:"600",
color:"#444"
},

digilockerBtn:{
flexDirection:"row",
alignItems:"center",
justifyContent:"center",
backgroundColor:"#0A66C2",
padding:16,
borderRadius:12,
marginTop:20
},

digilockerText:{
color:"#fff",
fontWeight:"700",
marginLeft:10
},

stepButtons:{
flexDirection:"row",
justifyContent:"space-between",
marginTop:30
},

nextStep:{
backgroundColor:"#7B4DFF",
padding:10,
paddingHorizontal: 20,
borderRadius:10
},

backStep:{
backgroundColor:"#999",
padding:16,
borderRadius:10,
padding:10,
paddingHorizontal: 20,
borderRadius:10
},

button:{
backgroundColor:"#7B4DFF",
padding:18,
borderRadius:40,
alignItems:"center",

padding:10,
paddingHorizontal: 20,
borderRadius:10
},

buttonText:{
color:"#fff",
fontWeight:"700",
fontSize:16
}

});