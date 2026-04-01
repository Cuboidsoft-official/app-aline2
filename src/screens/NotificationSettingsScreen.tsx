import React, { useCallback, useState } from "react";
import {View,Text,Switch,StyleSheet,ActivityIndicator,Alert,TouchableOpacity,ScrollView} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { useAppTheme } from "../theme/AppThemeContext";

const defaultSettings = {
 likes: true,
 comments: true,
 followers: true,
 stories: true,
 mentions: true,
 serviceRequests: true,
};

const settingItems = [
 { key: "likes", label: "Likes" },
 { key: "comments", label: "Comments" },
 { key: "followers", label: "New followers" },
 { key: "stories", label: "Stories" },
 { key: "mentions", label: "Mentions and tags" },
 { key: "serviceRequests", label: "Service requests" },
] as const;

const NotificationSettingsScreen = ({ navigation }: any) => {
 const { colors } = useAppTheme();
 const [settings, setSettings] = useState(defaultSettings);
 const [loading, setLoading] = useState(true);
 const [savingKey, setSavingKey] = useState<string | null>(null);

 const loadSettings = useCallback(async () => {
  try {
   setLoading(true);
   const res = await API.get("/user/notification-settings");
   setSettings({
    ...defaultSettings,
    ...(res.data?.notificationPreferences || {})
   });
  } catch (error) {
   console.log("notification settings error:", error);
   Alert.alert("Unable to load settings", "Please try again.");
  } finally {
   setLoading(false);
  }
 }, []);

 useFocusEffect(
  useCallback(() => {
   loadSettings();
  }, [loadSettings])
 );

 const updateSetting = async (key: keyof typeof defaultSettings, value: boolean) => {
  const previous = settings[key];
  setSettings((prev) => ({ ...prev, [key]: value }));
  setSavingKey(key);

  try {
   const res = await API.put("/user/notification-settings", {
    [key]: value
   });
   setSettings({
    ...defaultSettings,
    ...(res.data?.notificationPreferences || {}),
   });
  } catch (error) {
   console.log("notification settings update error:", error);
   setSettings((prev) => ({ ...prev, [key]: previous }));
   Alert.alert("Unable to update setting", "Please try again.");
  } finally {
   setSavingKey(null);
  }
 };

 if (loading) {
  return (
   <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
    <View style={styles.loader}>
     <ActivityIndicator size="large" color={colors.primary} />
    </View>
   </SafeAreaView>
  );
 }

 return(
  <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
   <View style={[styles.header, { borderBottomColor: colors.border }]}>
    <TouchableOpacity onPress={() => navigation.goBack()}>
     <Icon name="arrow-back" size={24} color={colors.text} />
    </TouchableOpacity>
    <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
    <View style={styles.headerSpacer} />
   </View>

   <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={[styles.helperCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
     <Text style={[styles.helper, { color: colors.mutedText }]}>
      These settings now control which in-app notifications are created for your account.
     </Text>
    </View>

    <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
     {settingItems.map((item) => (
      <View key={item.key} style={[styles.item, { borderBottomColor: colors.border }]}>
       <Text style={[styles.itemText, { color: colors.text }]}>{item.label}</Text>
       <View style={styles.switchWrap}>
        {savingKey === item.key ? <ActivityIndicator size="small" color={colors.primary} style={styles.spinner} /> : null}
        <Switch
         value={Boolean(settings[item.key])}
         onValueChange={(value) => updateSetting(item.key, value)}
        />
       </View>
      </View>
     ))}
    </View>
   </ScrollView>
  </SafeAreaView>
 );
};

export default NotificationSettingsScreen;

const styles = StyleSheet.create({
 container:{flex:1},
 content:{paddingHorizontal:20,paddingTop:18,paddingBottom:40},
 header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:20,paddingTop:12,paddingBottom:16,borderBottomWidth:1},
 headerTitle:{fontSize:18,fontWeight:"700"},
 headerSpacer:{width:24},
 helperCard:{borderWidth:1,borderRadius:18,paddingHorizontal:16,paddingVertical:14},
 helper:{fontSize:14,lineHeight:20},
 listCard:{marginTop:14,borderWidth:1,borderRadius:20,overflow:"hidden"},
 item:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingHorizontal:18,paddingVertical:18,borderBottomWidth:1},
 itemText:{fontSize:15,fontWeight:"500"},
 switchWrap:{flexDirection:"row",alignItems:"center"},
 spinner:{marginRight:10},
 loader:{flex:1,justifyContent:"center",alignItems:"center"}
});
