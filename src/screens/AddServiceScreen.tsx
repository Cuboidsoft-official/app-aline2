import React, {useState} from "react";
import {
View,
Text,
StyleSheet,
TextInput,
TouchableOpacity,
ScrollView,
Image
} from "react-native";

import Icon from "react-native-vector-icons/Ionicons";

const AddServiceScreen = ({navigation}:any) => {

const [serviceName,setServiceName] = useState("");
const [description,setDescription] = useState("");
const [eligibility,setEligibility] = useState("");
const [pricePerMin,setPricePerMin] = useState("");
const [pricePerMsg,setPricePerMsg] = useState("");
const [packagePrice,setPackagePrice] = useState("");
const [image,setImage] = useState(null);

return (

<View style={styles.screen}>

{/* HEADER */}

<View style={styles.header}>

<TouchableOpacity onPress={()=>navigation.goBack()}>
<Icon name="arrow-back" size={24}/>
</TouchableOpacity>

<Text style={styles.headerTitle}>Create Service</Text>

<View style={{width:24}}/>

</View>


<ScrollView
showsVerticalScrollIndicator={false}
contentContainerStyle={{paddingBottom:40}}
>

{/* IMAGE CARD */}

<View style={styles.card}>

<Text style={styles.cardTitle}>Service Image</Text>

<TouchableOpacity style={styles.imageUpload}>

{image ? (
<Image source={{uri:image}} style={styles.serviceImage}/>
) : (
<>
<Icon name="image-outline" size={40} color="#999"/>
<Text style={styles.uploadText}>Upload Image</Text>
</>
)}

</TouchableOpacity>

</View>


{/* SERVICE DETAILS */}

<View style={styles.card}>

<Text style={styles.cardTitle}>Service Details</Text>

<TextInput
style={styles.input}
placeholder="Service name"
value={serviceName}
onChangeText={setServiceName}
/>

<TextInput
style={styles.textarea}
placeholder="Describe your service..."
multiline
value={description}
onChangeText={setDescription}
/>

</View>


{/* PRICING */}

<View style={styles.card}>

<Text style={styles.cardTitle}>Pricing</Text>

<View style={styles.priceRow}>

<View style={styles.priceBox}>
<Text style={styles.priceLabel}>Call / Min</Text>
<TextInput
style={styles.priceInput}
keyboardType="numeric"
placeholder="₹"
value={pricePerMin}
onChangeText={setPricePerMin}
/>
</View>

<View style={styles.priceBox}>
<Text style={styles.priceLabel}>Per Msg</Text>
<TextInput
style={styles.priceInput}
keyboardType="numeric"
placeholder="₹"
value={pricePerMsg}
onChangeText={setPricePerMsg}
/>
</View>

<View style={styles.priceBox}>
<Text style={styles.priceLabel}>Package</Text>
<TextInput
style={styles.priceInput}
keyboardType="numeric"
placeholder="₹"
value={packagePrice}
onChangeText={setPackagePrice}
/>
</View>

</View>

</View>


{/* ELIGIBILITY */}

<View style={styles.card}>

<Text style={styles.cardTitle}>Eligibility</Text>

<TextInput
style={styles.textarea}
placeholder="Who can use this service?"
multiline
value={eligibility}
onChangeText={setEligibility}
/>

</View>


{/* CREATE BUTTON */}

<TouchableOpacity style={styles.createBtn}>

<Text style={styles.createText}>
Create Service
</Text>

</TouchableOpacity>

</ScrollView>

</View>

);

};

export default AddServiceScreen;


const styles = StyleSheet.create({

screen:{
flex:1,
backgroundColor:"#F7F8FC"
},

header:{
height:90,
paddingTop:40,
paddingHorizontal:20,
flexDirection:"row",
alignItems:"center",
justifyContent:"space-between",
backgroundColor:"#fff",
borderBottomWidth:1,
borderBottomColor:"#eee"
},

headerTitle:{
fontSize:18,
fontWeight:"700"
},

card:{
backgroundColor:"#fff",
marginHorizontal:20,
marginTop:20,
borderRadius:16,
padding:18,
shadowColor:"#000",
shadowOpacity:0.05,
shadowRadius:10,
elevation:3
},

cardTitle:{
fontSize:16,
fontWeight:"700",
marginBottom:14
},

imageUpload:{
height:150,
borderRadius:12,
borderWidth:1,
borderColor:"#E6E6E6",
justifyContent:"center",
alignItems:"center"
},

serviceImage:{
width:"100%",
height:"100%",
borderRadius:12
},

uploadText:{
marginTop:6,
color:"#888"
},

input:{
backgroundColor:"#F3F4F8",
padding:14,
borderRadius:10,
marginBottom:12
},

textarea:{
backgroundColor:"#F3F4F8",
padding:14,
borderRadius:10,
height:110,
textAlignVertical:"top"
},

priceRow:{
flexDirection:"row",
justifyContent:"space-between"
},

priceBox:{
flex:1,
marginRight:10
},

priceLabel:{
fontSize:12,
color:"#777",
marginBottom:4
},

priceInput:{
backgroundColor:"#F3F4F8",
borderRadius:10,
padding:12
},

createBtn:{
backgroundColor:"#7B4DFF",
marginHorizontal:20,
marginTop:30,
padding:18,
borderRadius:14,
alignItems:"center",
shadowColor:"#7B4DFF",
shadowOpacity:0.4,
shadowRadius:10
},

createText:{
color:"#fff",
fontWeight:"700",
fontSize:16
}

});