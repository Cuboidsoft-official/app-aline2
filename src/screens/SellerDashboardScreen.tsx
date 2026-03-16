import React, {useState} from "react";
import {
View,
Text,
StyleSheet,
Image,
TouchableOpacity,
ScrollView
} from "react-native";

import Icon from "react-native-vector-icons/Ionicons";
import Tooltip from "react-native-walkthrough-tooltip";

const SellerDashboardScreen = ({navigation}: any) => {

const [expanded,setExpanded] = useState(false);
const [step,setStep] = useState(1);

const next = () => setStep(step + 1);
const close = () => setStep(0);

const description = `A Cardiology Specialist (Cardiologist) is a doctor who diagnoses, treats, and prevents diseases related to the heart and blood vessels. They focus on maintaining heart health and managing conditions such as heart attacks, high blood pressure, and heart rhythm disorders.

Specializations

• Interventional Cardiology
• Non-Invasive Cardiology
• Preventive Cardiology
• Pediatric Cardiology
• Electrophysiology (Heart Rhythm Specialist)
• Heart Failure & Transplant Cardiology
• Structural Heart Disease
• Cardiac Imaging (Echo, CT, MRI)
• Hypertension Management
• Coronary Artery Disease Treatment
• Angiography & Angioplasty
• Pacemaker & ICD Implantation
• Cholesterol & Lipid Disorders Treatment`;

return (

<View style={{flex:1,backgroundColor:"#fff"}}>

{/* HEADER */}

<View style={styles.header}>

<TouchableOpacity
onPress={()=>navigation.goBack()}
style={styles.headerBtn}
>
<Icon name="arrow-back" size={22} color="#000"/>
</TouchableOpacity>

<Text style={styles.headerTitle}>
Seller Profile
</Text>

{/* SETTINGS TOOLTIP */}

<Tooltip
isVisible={step === 1}
placement="bottom"
content={
<View>
<Text>Open seller settings here</Text>
<TouchableOpacity onPress={next}>
<Text style={styles.guideBtn}>Next</Text>
</TouchableOpacity>
</View>
}
>

<TouchableOpacity
style={styles.headerBtn}
onPress={()=>navigation.navigate("SellerSettingsScreen")}
>
<Icon name="settings-outline" size={22} color="#000"/>
</TouchableOpacity>

</Tooltip>

</View>


<ScrollView style={styles.container}>

{/* BANNER */}

<View style={styles.bannerContainer}>

<Image
source={{uri:"https://www.bcmch.org/asset/uploads/common/867349919655f1491613e4.webp"}}
style={styles.banner}
/>

<TouchableOpacity style={styles.editBanner}>
<Icon name="camera" size={18} color="#fff"/>
</TouchableOpacity>

</View>


{/* PROFILE */}

<View style={styles.profileSection}>

<Image
source={{uri:"https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQikGmpeh_S05yj5punOSDXG-utlTE1TRdFWQ&s"}}
style={styles.profile}
/>

<Text style={styles.name}>Cardiology Specialist</Text>

{/* BADGE TOOLTIP */}

<Tooltip
isVisible={step === 2}
placement="bottom"
content={
<View>
<Text>This badge shows you are verified</Text>
<TouchableOpacity onPress={next}>
<Text style={styles.guideBtn}>Next</Text>
</TouchableOpacity>
</View>
}
>

<View style={styles.verifyRow}>
<Text style={styles.sellerTag}>Verified Seller</Text>
<Icon name="checkmark-circle" size={18} color="#1DA1F2"/>
</View>

</Tooltip>

<Text style={styles.tagline}>
Heavy transport & logistics solutions 🚛
</Text>

</View>


{/* WALLET TOOLTIP */}

<Tooltip
isVisible={step === 3}
placement="top"
content={
<View>
<Text>This is your wallet balance</Text>
<TouchableOpacity onPress={next}>
<Text style={styles.guideBtn}>Next</Text>
</TouchableOpacity>
</View>
}
>

<View style={styles.walletCard}>

<View style={styles.walletLeft}>
<Icon name="wallet-outline" size={22} color="#7B4DFF"/>
<Text style={styles.walletTitle}>Seller Wallet</Text>
</View>

<Text style={styles.walletAmount}>₹12,500</Text>

</View>

</Tooltip>


{/* STATS */}

<View style={styles.stats}>

<View style={styles.statBox}>
<Text style={styles.statNumber}>4+</Text>
<Text style={styles.statLabel}>Years Exp.</Text>
</View>

<View style={styles.statBox}>
<Text style={styles.statNumber}>0.0</Text>
<Text style={styles.statLabel}>Rating</Text>
</View>

<View style={styles.statBox}>
<Text style={styles.statNumber}>0+</Text>
<Text style={styles.statLabel}>Clients</Text>
</View>

</View>


{/* ACTION BUTTONS */}

<View style={styles.actionRow}>

{/* ADD SERVICE TOOLTIP */}

<Tooltip
isVisible={step === 4}
placement="top"
content={
<View>
<Text>Add services for clients</Text>
<TouchableOpacity onPress={next}>
<Text style={styles.guideBtn}>Next</Text>
</TouchableOpacity>
</View>
}
>

<TouchableOpacity
style={styles.primaryBtn}
onPress={()=>navigation.navigate("AddServiceScreen")}
>

<Icon name="add" size={18} color="#fff"/>
<Text style={styles.btnText}> Add Service</Text>

</TouchableOpacity>

</Tooltip>


{/* APPOINTMENT TOOLTIP */}

<Tooltip
isVisible={step === 5}
placement="top"
content={
<View>
<Text>View all bookings here</Text>
<TouchableOpacity onPress={close}>
<Text style={styles.guideBtn}>Done</Text>
</TouchableOpacity>
</View>
}
>

<TouchableOpacity
style={styles.secondaryBtn}
onPress={()=>navigation.navigate("Appointments")}
>

<Icon name="calendar-outline" size={18} color="#333"/>
<Text style={styles.btnText2}> View Appointments</Text>

</TouchableOpacity>

</Tooltip>

</View>


{/* ABOUT SELLER */}

<View style={styles.section}>

<Text style={styles.sectionTitle}>About Seller</Text>

<Text
numberOfLines={expanded ? undefined : 3}
style={styles.desc}
>
{description}
</Text>

<TouchableOpacity onPress={()=>setExpanded(!expanded)}>
<Text style={styles.readMore}>
{expanded ? "Show Less" : "Read More"}
</Text>
</TouchableOpacity>

</View>


{/* SERVICES */}

<View style={styles.section}>

<View style={styles.serviceHeader}>

<Text style={styles.sectionTitle}>All Services</Text>

<TouchableOpacity
onPress={()=>navigation.navigate("AddService")}
>
<Text style={styles.addService}>
+ Add New
</Text>
</TouchableOpacity>

</View>

<View style={styles.emptyService}>

<Icon name="briefcase-outline" size={40} color="#bbb"/>

<Text style={styles.noService}>
No services added yet
</Text>

<Text style={styles.noServiceSub}>
Add your first service to start receiving bookings.
</Text>

</View>

</View>

</ScrollView>

</View>

);
};

export default SellerDashboardScreen;
const styles = StyleSheet.create({

    header:{
    height:90,
    backgroundColor:"#fff",
    flexDirection:"row",
    alignItems:"center",
    justifyContent:"space-between",
    paddingHorizontal:20,
    paddingTop:40,
    borderBottomWidth:1,
    borderBottomColor:"#eee"
    },

    headerTitle:{
    fontSize:18,
    fontWeight:"700"
    },

    headerBtn:{
    padding:6
    },

container:{
flex:1,
backgroundColor:"#fff"
},

bannerContainer:{
position:"relative"
},

banner:{
width:"100%",
height:220
},

editBanner:{
position:"absolute",
right:15,
bottom:15,
backgroundColor:"#00000070",
padding:10,
borderRadius:30
},

profileSection:{
alignItems:"center",
marginTop:-50
},

profile:{
width:100,
height:100,
borderRadius:50,
borderWidth:4,
borderColor:"#fff"
},

name:{
fontSize:22,
fontWeight:"700",
marginTop:8
},

verifyRow:{
flexDirection:"row",
alignItems:"center",
marginTop:4
},

sellerTag:{
backgroundColor:"#EDE7F6",
paddingHorizontal:10,
paddingVertical:4,
borderRadius:12,
marginRight:6,
fontSize:12
},

tagline:{
color:"#666",
marginTop:6
},

walletCard:{
flexDirection:"row",
justifyContent:"space-between",
alignItems:"center",
backgroundColor:"#F5F3FF",
margin:20,
padding:16,
borderRadius:12
},

walletLeft:{
flexDirection:"row",
alignItems:"center"
},

walletTitle:{
marginLeft:8,
fontWeight:"600"
},

walletAmount:{
fontWeight:"700",
fontSize:16,
color:"#7B4DFF"
},

stats:{
flexDirection:"row",
justifyContent:"space-around",
marginBottom:10
},

statBox:{
alignItems:"center"
},

statNumber:{
fontSize:18,
fontWeight:"700"
},

statLabel:{
color:"#777"
},

actionRow:{
flexDirection:"row",
paddingHorizontal:20,
marginTop:15
},

primaryBtn:{
flex:1,
backgroundColor:"#7B4DFF",
padding:14,
borderRadius:10,
flexDirection:"row",
justifyContent:"center",
alignItems:"center",
marginRight:10
},

secondaryBtn:{
flex:1,
backgroundColor:"#f1f1f1",
padding:14,
borderRadius:10,
flexDirection:"row",
justifyContent:"center",
alignItems:"center"
},

btnText:{
color:"#fff",
fontWeight:"600"
},

btnText2:{
fontWeight:"600"
},

section:{
paddingHorizontal:20,
marginTop:20
},

sectionTitle:{
fontSize:18,
fontWeight:"700"
},

desc:{
marginTop:8,
color:"#555",
lineHeight:20
},

readMore:{
color:"#7B4DFF",
marginTop:6,
fontWeight:"600"
},

serviceHeader:{
flexDirection:"row",
justifyContent:"space-between",
alignItems:"center"
},

addService:{
color:"#7B4DFF",
fontWeight:"600"
},

emptyService:{
alignItems:"center",
paddingVertical:30
},

noService:{
marginTop:10,
fontWeight:"600",
color:"#666"
},

noServiceSub:{
marginTop:4,
color:"#999",
fontSize:13
}

});