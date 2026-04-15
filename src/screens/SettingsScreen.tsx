import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API } from "../api/api";
import { clearStoredSession, getStoredToken } from "../utils/authSession";
import { clearPushToken } from "../utils/pushRegistration";
import { useAppTheme } from "../theme/AppThemeContext";

const SettingsScreen = ({ navigation }: any) => {

  const isFocused = useIsFocused();

  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const { colors, isDarkMode, setDarkModePreference } = useAppTheme();

  // LOAD PRIVACY WHEN SCREEN OPENS
  useEffect(() => {

    const loadPrivacy = async () => {

      try {

        const token = await getStoredToken();

        const res = await API.get(
          "/auth/profile",
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );

        const value = res?.data?.user?.isPrivate ?? false;

        setIsPrivate(value);

        await AsyncStorage.setItem(
          "isPrivate",
          JSON.stringify(value)
        );

      } catch {

        const saved = await AsyncStorage.getItem("isPrivate");

        if (saved) {
          setIsPrivate(JSON.parse(saved));
        }

      }
    };

    if (isFocused) {
      loadPrivacy();
    }

  }, [isFocused]);

  // LOGOUT
  const logout = async () => {
    const token = await getStoredToken();
    if (token) {
      try {
        await API.post("/auth/logout", {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (error) {
        console.log("logout API error:", error);
      }
    }
    await clearPushToken();
    await clearStoredSession();
    navigation.replace("Login");
  };

  // PRIVATE PROFILE TOGGLE
  const togglePrivateProfile = async () => {

    if (loading) return;

    try {

      setLoading(true);

      const token = await getStoredToken();

      const res = await API.post(
        "/auth/toggle-private",
        {},
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const value = res?.data?.isPrivate ?? false;

      setIsPrivate(value);

      await AsyncStorage.setItem(
        "isPrivate",
        JSON.stringify(value)
      );

      Alert.alert(
        "Profile Updated",
        value
          ? "🔒 Your profile is now Private"
          : "🌍 Your profile is now Public"
      );

    } catch {

      Alert.alert(
        "Error",
        "Unable to update profile privacy"
      );

    } finally {
      setLoading(false);
    }

  };

  const toggleDarkMode = async () => {
    const nextValue = !isDarkMode;
    await setDarkModePreference(nextValue);
    Alert.alert("Theme updated", nextValue ? "Dark mode preference saved." : "Light mode preference saved.");
  };

  return (

    <SafeAreaView style={[styles.container, isDarkMode ? styles.containerDark : null]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={26} color={isDarkMode ? colors.text : "#111"} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isDarkMode ? styles.headerTitleDark : null]}>
          Settings and Activity
        </Text>

      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        <Text style={[styles.section, isDarkMode ? styles.sectionDark : null]}>Your account</Text>

        <TouchableOpacity
          style={[styles.item, isDarkMode ? styles.itemDark : null]}
          onPress={() => navigation.navigate("AccountCenterScreen")}
        >
          <Text style={[styles.text, isDarkMode ? styles.textDark : null]}>Account Center</Text>
          <Icon name="chevron-forward" size={20} color={isDarkMode ? colors.text : "#111"} />
        </TouchableOpacity>

        <View style={[styles.item, isDarkMode ? styles.itemDark : null]}>
          <Text style={[styles.text, isDarkMode ? styles.textDark : null]}>Private account</Text>

          <Switch
            value={isPrivate}
            onValueChange={togglePrivateProfile}
            disabled={loading}
          />
        </View>

        <TouchableOpacity
          style={[styles.item, isDarkMode ? styles.itemDark : null]}
          onPress={() => navigation.navigate("BlockedUsersScreen")}
        >
          <Text style={[styles.text, isDarkMode ? styles.textDark : null]}>Blocked users</Text>
          <Icon name="chevron-forward" size={20} color={isDarkMode ? colors.text : "#111"} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, isDarkMode ? styles.itemDark : null]}
          onPress={() => navigation.navigate("CloseFriendsScreen")}
        >
          <Text style={[styles.text, isDarkMode ? styles.textDark : null]}>Close friends</Text>
          <Icon name="chevron-forward" size={20} color={isDarkMode ? colors.text : "#111"} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, isDarkMode ? styles.itemDark : null]}
          onPress={() => navigation.navigate("PostArchive")}
        >
          <Text style={[styles.text, isDarkMode ? styles.textDark : null]}>Post archive</Text>
          <Icon name="chevron-forward" size={20} color={isDarkMode ? colors.text : "#111"} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, isDarkMode ? styles.itemDark : null]}
          onPress={() => navigation.navigate("StoryArchive")}
        >
          <Text style={[styles.text, isDarkMode ? styles.textDark : null]}>Story archive</Text>
          <Icon name="chevron-forward" size={20} color={isDarkMode ? colors.text : "#111"} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, isDarkMode ? styles.itemDark : null]}
          onPress={() => navigation.navigate("SavedPosts")}
        >
          <Text style={[styles.text, isDarkMode ? styles.textDark : null]}>Saved posts</Text>
          <Icon name="chevron-forward" size={20} color={isDarkMode ? colors.text : "#111"} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, isDarkMode ? styles.itemDark : null]}
          onPress={() => navigation.navigate("NotificationSettingsScreen")}
        >
          <Text style={[styles.text, isDarkMode ? styles.textDark : null]}>Notifications</Text>
          <Icon name="chevron-forward" size={20} color={isDarkMode ? colors.text : "#111"} />
        </TouchableOpacity>

        <Text style={[styles.section, isDarkMode ? styles.sectionDark : null]}>Seller</Text>

        <TouchableOpacity
          style={[styles.item, isDarkMode ? styles.itemDark : null]}
          onPress={() => navigation.navigate("SellerRegistration")}
        >
          <Text style={styles.vendorText}>Become a Seller</Text>
          <Icon name="storefront-outline" size={20} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, isDarkMode ? styles.itemDark : null]}
          onPress={() => navigation.navigate("SellerDashboardScreen")}
        >
          <Text style={[styles.text, isDarkMode ? styles.textDark : null]}>Seller dashboard</Text>
          <Icon name="chevron-forward" size={20} color={isDarkMode ? colors.text : "#111"} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, isDarkMode ? styles.itemDark : null]}
          onPress={() => navigation.navigate("ServiceRequestsScreen", { mode: "user" })}
        >
          <Text style={[styles.text, isDarkMode ? styles.textDark : null]}>My service requests</Text>
          <Icon name="chevron-forward" size={20} color={isDarkMode ? colors.text : "#111"} />
        </TouchableOpacity>

        <Text style={[styles.section, isDarkMode ? styles.sectionDark : null]}>
          How others interact with you
        </Text>

        <TouchableOpacity
          style={[styles.item, isDarkMode ? styles.itemDark : null]}
          onPress={() => navigation.navigate("CommentControlsScreen")}
        >
          <Text style={[styles.text, isDarkMode ? styles.textDark : null]}>Comments</Text>
          <Icon name="chevron-forward" size={20} color={isDarkMode ? colors.text : "#111"} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, isDarkMode ? styles.itemDark : null]}
          onPress={() => navigation.navigate("TagsMentionsScreen")}
        >
          <Text style={[styles.text, isDarkMode ? styles.textDark : null]}>Tags and mentions</Text>
          <Icon name="chevron-forward" size={20} color={isDarkMode ? colors.text : "#111"} />
        </TouchableOpacity>

        <Text style={[styles.section, isDarkMode ? styles.sectionDark : null]}>App settings</Text>

        <View style={[styles.item, isDarkMode ? styles.itemDark : null]}>
          <Text style={[styles.text, isDarkMode ? styles.textDark : null]}>Dark mode</Text>
          <Switch
            value={isDarkMode}
            onValueChange={toggleDarkMode}
          />
        </View>

        <TouchableOpacity
          style={[styles.item, isDarkMode ? styles.itemDark : null]}
          onPress={() => navigation.navigate("HelpSupportScreen")}
        >
          <Text style={[styles.text, isDarkMode ? styles.textDark : null]}>Help & Support</Text>
          <Icon name="chevron-forward" size={20} color={isDarkMode ? colors.text : "#111"} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, isDarkMode ? styles.itemDark : null]}
          onPress={() => navigation.navigate("PrivacyPolicyScreen")}
        >
          <Text style={[styles.text, isDarkMode ? styles.textDark : null]}>Privacy Policy</Text>
          <Icon name="chevron-forward" size={20} color={isDarkMode ? colors.text : "#111"} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, styles.deleteItem, isDarkMode ? styles.itemDark : null]}
          onPress={() => navigation.navigate("DeleteAccountScreen")}
        >
          <View style={styles.deleteCopy}>
            <Text style={styles.deleteText}>
              Delete account
            </Text>
            <Text style={[styles.deleteHint, { color: isDarkMode ? "#D1D5DB" : "#6B7280" }]}>
              Share feedback, confirm deletion, and permanently remove your account.
            </Text>
          </View>
          <Icon name="chevron-forward" size={20} color={isDarkMode ? "#FCA5A5" : "#B91C1C"} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.logout}
          onPress={logout}
        >
          <Text style={styles.logoutText}>
            Log out
          </Text>
        </TouchableOpacity>

      </ScrollView>

    </SafeAreaView>

  );
};

export default SettingsScreen;

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#fff"
  },
  containerDark: {
    backgroundColor: "#111827"
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#eee",
    paddingTop: 10
  },
  headerTitleDark: {
    color: "#fff"
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
  sectionDark: {
    color: "#9CA3AF"
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
  itemDark: {
    borderColor: "#1F2937",
    backgroundColor: "#111827"
  },
  deleteItem: {
    borderColor: "#F3B4B4",
    backgroundColor: "#FFF5F5"
  },

  text: {
    fontSize: 16
  },
  textDark: {
    color: "#fff"
  },

  vendorText: {
    fontSize: 16,
    color: "#1877f2",
    fontWeight: "500"
  },

  deleteText: {
    fontSize: 16,
    color: "red"
  },
  deleteCopy: {
    flex: 1,
    paddingRight: 16
  },
  deleteHint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18
  },

  logout: {
    padding: 20
  },

  logoutText: {
    color: "red",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center"
  }

});
