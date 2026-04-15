import React, { useCallback, useEffect, useRef } from "react";
import {
View,
Text,
StyleSheet,
StatusBar,
Animated,
Dimensions
} from "react-native";

import { API } from "../api/api";
import { clearStoredSession, getStoredToken } from "../utils/authSession";

const { height } = Dimensions.get("window");

const SplashScreen = ({ navigation }: any) => {

const scaleAnim = useRef(new Animated.Value(0.7)).current;
const bounceAnim = useRef(new Animated.Value(-120)).current;
const textAnim = useRef(new Animated.Value(50)).current;
const opacityAnim = useRef(new Animated.Value(0)).current;
const circleAnim = useRef(new Animated.Value(0)).current;

const checkLogin = useCallback(async () => {

const token = await getStoredToken();

setTimeout(async () => {

if(!token){
navigation.replace("Login");
return;
}

try {
 await API.get("/auth/profile", {
  headers: {
   Authorization: `Bearer ${token}`
  }
 });

 navigation.reset({
  index: 0,
  routes: [{ name: "MainApp" }],
 });
} catch (error: any) {
 console.log("Session validation failed:", error);
 console.log("Session validation error details:", {
  baseURL: API.defaults?.baseURL,
  requestUrl: error?.config?.url,
  method: error?.config?.method,
  status: error?.response?.status,
  responseData: error?.response?.data,
 });
 await clearStoredSession();
 navigation.replace("Login");
}

},3000);

}, [navigation]);

useEffect(() => {

Animated.parallel([

Animated.spring(bounceAnim,{
toValue:0,
friction:6,
useNativeDriver:true
}),

Animated.timing(scaleAnim,{
toValue:1,
duration:1000,
useNativeDriver:true
}),

Animated.timing(opacityAnim,{
toValue:1,
duration:1400,
useNativeDriver:true
}),

Animated.timing(textAnim,{
toValue:0,
duration:1200,
useNativeDriver:true
})

]).start();

Animated.loop(
Animated.timing(circleAnim,{
toValue:1,
duration:6000,
useNativeDriver:true
})
).start();

checkLogin();

},[bounceAnim, checkLogin, circleAnim, opacityAnim, scaleAnim, textAnim]);

const floatY = circleAnim.interpolate({
inputRange:[0,1],
outputRange:[-40,40]
});

return (

<View style={styles.container}>

<StatusBar backgroundColor="#041a28" barStyle="light-content"/>

{/* Floating Background Circle */}

<Animated.View
style={[
styles.circle,
{ transform:[{translateY:floatY}] }
]}
/>

<Animated.View
style={[
styles.circle2,
{ transform:[{translateY:Animated.multiply(floatY,-1)}] }
]}
/>

{/* Logo */}

<Animated.Image
source={{ uri:"https://aline2.com/asstes/images/logo/logo.jpeg" }}
style={[
styles.logo,
{
transform:[
{translateY:bounceAnim},
{scale:scaleAnim}
]
}
]}
/>

{/* Text */}

<Animated.View
style={{
opacity:opacityAnim,
transform:[{translateY:textAnim}]
}}
>

<Text style={styles.title}>Aline2</Text>

<Text style={styles.tagline}>
Let's connect together
</Text>

</Animated.View>

<Text style={styles.footer}>
Powered by Aline2
</Text>

</View>

);

};

export default SplashScreen;

const styles = StyleSheet.create({

container:{
flex:1,
backgroundColor:"#041a28",
justifyContent:"center",
alignItems:"center"
},

circle:{
position:"absolute",
width:250,
height:250,
borderRadius:200,
backgroundColor:"rgba(12,145,227,0.15)",
top:height*0.25,
left:-80
},

circle2:{
position:"absolute",
width:200,
height:200,
borderRadius:200,
backgroundColor:"rgba(171,42,235,0.15)",
bottom:height*0.2,
right:-60
},

logo:{
width:120,
height:120,
borderRadius:60,
borderWidth:3,
borderColor:"#fff",
marginBottom:20
},

title:{
fontSize:42,
color:"#fff",
fontWeight:"800",
letterSpacing:2,
textAlign:"center"
},

tagline:{
fontSize:16,
color:"#ccc",
marginTop:8,
textAlign:"center"
},

footer:{
position:"absolute",
bottom:40,
fontSize:12,
color:"#888"
}

});
