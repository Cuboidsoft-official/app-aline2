import React, { useState } from "react";
import {View,Text,TouchableOpacity,Alert,StyleSheet,TextInput,ActivityIndicator} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { clearStoredSession } from "../utils/authSession";
import { useAppTheme } from "../theme/AppThemeContext";

const DeleteAccountScreen = ({ navigation }: any) => {
 const { colors } = useAppTheme();
 const [password, setPassword] = useState("");
 const [confirmationText, setConfirmationText] = useState("");
 const [loading, setLoading] = useState(false);

 const deleteAccount = ()=>{
  Alert.alert(
   "Delete account",
   "This permanently removes your account data, conversations, posts, services, and related records. This action cannot be undone.",
   [
    {text:"Cancel", style:"cancel"},
    {
     text:"Delete",
     style:"destructive",
     onPress: async () => {
      try {
       setLoading(true);
       const res = await API.post("/user/account/delete", {
        password,
        confirmationText
       });

       if (!res.data?.success) {
        Alert.alert("Unable to delete account", res.data?.message || "Please try again.");
        return;
       }

       await clearStoredSession();
       navigation.reset({
        index: 0,
        routes: [{ name: "Login" }]
       });
      } catch (error: any) {
       Alert.alert(
        "Unable to delete account",
        error?.response?.data?.message || "Please try again."
       );
      } finally {
       setLoading(false);
      }
     }
    }
   ]
  );
 };

 return(
  <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
   <View style={[styles.header, { borderBottomColor: colors.border }]}>
    <TouchableOpacity onPress={() => navigation.goBack()}>
     <Icon name="arrow-back" size={24} color={colors.text} />
    </TouchableOpacity>
    <Text style={[styles.headerTitle, { color: colors.text }]}>Delete Account</Text>
    <View style={styles.headerSpacer} />
   </View>

   <View style={styles.content}>
    <Text style={[styles.warningTitle, { color: colors.text }]}>Permanent account deletion</Text>
    <Text style={[styles.warningCopy, { color: colors.mutedText }]}>
     To prevent accidental deletion, enter your current password and type DELETE below. Your account data and related records will be removed.
    </Text>

    <TextInput
     secureTextEntry
     value={password}
     onChangeText={setPassword}
     placeholder="Current password"
     placeholderTextColor={colors.placeholder}
     style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
    />

    <TextInput
     value={confirmationText}
     onChangeText={setConfirmationText}
     placeholder='Type DELETE'
     autoCapitalize="characters"
     placeholderTextColor={colors.placeholder}
     style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
    />

    <TouchableOpacity
     style={[styles.deleteButton, { backgroundColor: loading ? "#d37f7f" : "#d62828" }]}
     onPress={deleteAccount}
     disabled={loading}
    >
     {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.deleteButtonText}>Delete my account</Text>}
    </TouchableOpacity>
   </View>
  </SafeAreaView>
 );
};

export default DeleteAccountScreen;

const styles = StyleSheet.create({
 container:{flex:1},
 header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:20,paddingTop:12,paddingBottom:16,borderBottomWidth:1},
 headerTitle:{fontSize:18,fontWeight:"700"},
 headerSpacer:{width:24},
 content:{padding:20},
 warningTitle:{fontSize:22,fontWeight:"800"},
 warningCopy:{marginTop:10,fontSize:14,lineHeight:21},
 input:{borderWidth:1,borderRadius:14,paddingHorizontal:16,paddingVertical:14,fontSize:15,marginTop:18},
 deleteButton:{marginTop:28,borderRadius:14,paddingVertical:16,alignItems:"center"},
 deleteButtonText:{color:"#fff",fontWeight:"700",fontSize:15}
});
