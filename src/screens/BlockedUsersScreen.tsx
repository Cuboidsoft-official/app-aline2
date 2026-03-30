import React, { useCallback, useState } from "react";
import {View,Text,StyleSheet,FlatList,Image,TouchableOpacity,ActivityIndicator,Alert} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../theme/AppThemeContext";
import { useFocusEffect } from "@react-navigation/native";
import { API } from "../api/api";

type BlockedUser = {
 _id: string;
 name?: string;
 username?: string;
 profilePic?: string;
};

const BlockedUsersScreen = ({ navigation }: any) => {
 const { colors } = useAppTheme();
 const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
 const [loading, setLoading] = useState(true);

 const loadBlockedUsers = useCallback(async () => {
  try {
   setLoading(true);
   const res = await API.get("/user/blocked");
   setBlockedUsers(res.data?.users || []);
  } catch (error) {
   console.log("blocked users error:", error);
   setBlockedUsers([]);
  } finally {
   setLoading(false);
  }
 }, []);

 useFocusEffect(
  useCallback(() => {
   loadBlockedUsers();
  }, [loadBlockedUsers])
 );

 const unblockUser = async (userId: string) => {
  try {
   await API.delete(`/user/block/${userId}`);
   setBlockedUsers((prev) => prev.filter((item) => item._id !== userId));
   Alert.alert("Unblocked", "This account can interact with you again.");
  } catch (error) {
   console.log("unblock user error:", error);
   Alert.alert("Unable to unblock", "Please try again.");
  }
 };

 return(
  <View style={[styles.container, { backgroundColor: colors.background }]}>
   {loading ? (
    <View style={styles.loader}>
     <ActivityIndicator size="large" color={colors.primary} />
    </View>
   ) : null}
   <FlatList
    data={blockedUsers}
    keyExtractor={(item)=>item._id}
    ListEmptyComponent={
     <View style={styles.emptyState}>
      <Icon name="shield-outline" size={42} color={colors.primary} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No blocked users</Text>
      <Text style={[styles.emptyText, { color: colors.mutedText }]}>
       Accounts you block will appear here and can be unblocked at any time.
      </Text>
     </View>
    }
    renderItem={({item})=>(
     <View style={[styles.user, { borderBottomColor: colors.border }]}>
      <TouchableOpacity
       style={styles.userInfo}
       onPress={() => navigation.navigate("ProfilePreviewScreen", { userId: item._id })}
      >
       <Image
        source={{ uri: item.profilePic || "https://cdn-icons-png.flaticon.com/512/149/149071.png" }}
        style={styles.avatar}
       />
       <View style={styles.copy}>
        <Text style={{ color: colors.text, fontWeight: "600" }}>{item.name || item.username || "Blocked user"}</Text>
        <Text style={{ color: colors.mutedText }}>{item.username ? `@${item.username}` : "Aline2 account"}</Text>
       </View>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.unblockBtn, { borderColor: colors.border }]} onPress={() => unblockUser(item._id)}>
       <Text style={{ color: colors.text, fontWeight: "600" }}>Unblock</Text>
      </TouchableOpacity>
     </View>
    )}
   />
  </View>
 );
};

export default BlockedUsersScreen;

const styles = StyleSheet.create({
 container:{flex:1,padding:20,backgroundColor:"#fff"},
 loader:{flex:1,justifyContent:"center",alignItems:"center"},
 user:{paddingVertical:15,borderBottomWidth:1,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
 userInfo:{flexDirection:"row",alignItems:"center",flex:1},
 avatar:{width:48,height:48,borderRadius:24,marginRight:12},
 copy:{flex:1},
 unblockBtn:{borderWidth:1,borderRadius:12,paddingHorizontal:14,paddingVertical:10,marginLeft:12},
 emptyState:{paddingTop:80,alignItems:"center"},
 emptyTitle:{marginTop:12,fontSize:18,fontWeight:"700",color:"#111"},
 emptyText:{marginTop:8,fontSize:14,lineHeight:20,color:"#666",textAlign:"center"}
});
