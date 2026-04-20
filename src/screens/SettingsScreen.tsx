import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch
} from "react-native";
import { Alert } from "../utils/appAlert";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API } from "../api/api";
import { clearStoredSession, getStoredToken } from "../utils/authSession";
import { clearPushToken } from "../utils/pushRegistration";
import { useAppTheme } from "../theme/AppThemeContext";
import AppBottomDock, { APP_BOTTOM_DOCK_BASE_HEIGHT } from "../components/AppBottomDock";

const buildBankSummary = (account: {
  bankName?: string;
  bankAccountNumber?: string;
}) => {
  const bankName = String(account?.bankName || "").trim();
  const accountNumber = String(account?.bankAccountNumber || "").trim();
  const lastFour = accountNumber.slice(-4);

  if (!bankName && !lastFour) {
    return "Add your payout account";
  }

  if (!bankName) {
    return `Ending in ${lastFour}`;
  }

  if (!lastFour) {
    return bankName;
  }

  return `${bankName} • ${lastFour}`;
};

const SettingsScreen = ({ navigation }: any) => {

  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();

  const [isPrivate, setIsPrivate] = useState(false);
  const [bankSummary, setBankSummary] = useState("Add your payout account");
  const [loading, setLoading] = useState(false);
  const { colors, isDarkMode, setDarkModePreference } = useAppTheme();
  const itemStyle = { backgroundColor: colors.card, borderBottomColor: colors.border };
  const sectionStyle = { color: colors.mutedText };
  const chevronColor = colors.text;
  const switchTrackColor = { false: colors.border, true: `${colors.primary}66` };

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
        const profileUser = res?.data?.user || {};

        setIsPrivate(value);
        setBankSummary(buildBankSummary(profileUser));

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

    <View style={styles.screen}>
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Settings and Activity
        </Text>

      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: APP_BOTTOM_DOCK_BASE_HEIGHT + Math.max(insets.bottom, 10) + 24 }}
      >

        <Text style={[styles.section, sectionStyle]}>Your account</Text>

        <TouchableOpacity
          style={[styles.item, itemStyle]}
          onPress={() => navigation.navigate("AccountCenterScreen")}
        >
          <Text style={[styles.text, { color: colors.text }]}>Account Center</Text>
          <Icon name="chevron-forward" size={20} color={chevronColor} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, itemStyle]}
          onPress={() => navigation.navigate("Profile")}
        >
          <View style={styles.itemCopy}>
            <Text style={[styles.text, { color: colors.text }]}>Bank account setup</Text>
            <Text style={[styles.itemHint, { color: colors.mutedText }]}>{bankSummary}</Text>
          </View>
          <Icon name="chevron-forward" size={20} color={chevronColor} />
        </TouchableOpacity>

        <View style={[styles.item, itemStyle]}>
          <Text style={[styles.text, { color: colors.text }]}>Private account</Text>

          <Switch
            value={isPrivate}
            onValueChange={togglePrivateProfile}
            disabled={loading}
            trackColor={switchTrackColor}
            thumbColor={isPrivate ? colors.primary : colors.card}
          />
        </View>

        <TouchableOpacity
          style={[styles.item, itemStyle]}
          onPress={() => navigation.navigate("BlockedUsersScreen")}
        >
          <Text style={[styles.text, { color: colors.text }]}>Blocked users</Text>
          <Icon name="chevron-forward" size={20} color={chevronColor} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, itemStyle]}
          onPress={() => navigation.navigate("CloseFriendsScreen")}
        >
          <Text style={[styles.text, { color: colors.text }]}>Close friends</Text>
          <Icon name="chevron-forward" size={20} color={chevronColor} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, itemStyle]}
          onPress={() => navigation.navigate("PostArchive")}
        >
          <Text style={[styles.text, { color: colors.text }]}>Post archive</Text>
          <Icon name="chevron-forward" size={20} color={chevronColor} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, itemStyle]}
          onPress={() => navigation.navigate("StoryArchive")}
        >
          <Text style={[styles.text, { color: colors.text }]}>Story archive</Text>
          <Icon name="chevron-forward" size={20} color={chevronColor} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, itemStyle]}
          onPress={() => navigation.navigate("SavedPosts")}
        >
          <Text style={[styles.text, { color: colors.text }]}>Saved posts</Text>
          <Icon name="chevron-forward" size={20} color={chevronColor} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, itemStyle]}
          onPress={() => navigation.navigate("NotificationSettingsScreen")}
        >
          <Text style={[styles.text, { color: colors.text }]}>Notifications</Text>
          <Icon name="chevron-forward" size={20} color={chevronColor} />
        </TouchableOpacity>

        <Text style={[styles.section, sectionStyle]}>Seller</Text>

        <TouchableOpacity
          style={[styles.item, itemStyle]}
          onPress={() => navigation.navigate("SellerRegistration")}
        >
          <Text style={[styles.vendorText, { color: colors.primary }]}>Become a Seller</Text>
          <Icon name="storefront-outline" size={20} color={colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, itemStyle]}
          onPress={() => navigation.navigate("SellerDashboardScreen")}
        >
          <Text style={[styles.text, { color: colors.text }]}>Seller dashboard</Text>
          <Icon name="chevron-forward" size={20} color={chevronColor} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, itemStyle]}
          onPress={() => navigation.navigate("ServiceRequestsScreen", { mode: "user" })}
        >
          <Text style={[styles.text, { color: colors.text }]}>My service requests</Text>
          <Icon name="chevron-forward" size={20} color={chevronColor} />
        </TouchableOpacity>

        <Text style={[styles.section, sectionStyle]}>
          How others interact with you
        </Text>

        <TouchableOpacity
          style={[styles.item, itemStyle]}
          onPress={() => navigation.navigate("CommentControlsScreen")}
        >
          <Text style={[styles.text, { color: colors.text }]}>Comments</Text>
          <Icon name="chevron-forward" size={20} color={chevronColor} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, itemStyle]}
          onPress={() => navigation.navigate("TagsMentionsScreen")}
        >
          <Text style={[styles.text, { color: colors.text }]}>Tags and mentions</Text>
          <Icon name="chevron-forward" size={20} color={chevronColor} />
        </TouchableOpacity>

        <Text style={[styles.section, sectionStyle]}>App settings</Text>

        <View style={[styles.item, itemStyle]}>
          <Text style={[styles.text, { color: colors.text }]}>Dark mode</Text>
          <Switch
            value={isDarkMode}
            onValueChange={toggleDarkMode}
            trackColor={switchTrackColor}
            thumbColor={isDarkMode ? colors.primary : colors.card}
          />
        </View>

        <TouchableOpacity
          style={[styles.item, itemStyle]}
          onPress={() => navigation.navigate("HelpSupportScreen")}
        >
          <Text style={[styles.text, { color: colors.text }]}>Help & Support</Text>
          <Icon name="chevron-forward" size={20} color={chevronColor} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, itemStyle]}
          onPress={() => navigation.navigate("PrivacyPolicyScreen")}
        >
          <Text style={[styles.text, { color: colors.text }]}>Privacy Policy</Text>
          <Icon name="chevron-forward" size={20} color={chevronColor} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.item,
            styles.deleteItem,
            {
              backgroundColor: isDarkMode ? "rgba(255,59,48,0.12)" : "#FFF5F5",
              borderBottomColor: isDarkMode ? "rgba(255,105,97,0.4)" : "#F3B4B4",
            },
          ]}
          onPress={() => navigation.navigate("DeleteAccountScreen")}
        >
          <View style={styles.deleteCopy}>
            <Text style={[styles.deleteText, { color: colors.danger }]}>
              Delete account
            </Text>
            <Text style={[styles.deleteHint, { color: colors.mutedText }]}>
              Share feedback, confirm deletion, and permanently remove your account.
            </Text>
          </View>
          <Icon name="chevron-forward" size={20} color={colors.danger} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.logout}
          onPress={logout}
        >
          <Text style={[styles.logoutText, { color: colors.danger }]}>
            Log out
          </Text>
        </TouchableOpacity>

      </ScrollView>

    </SafeAreaView>
    <AppBottomDock navigation={navigation} />
    </View>

  );
};

export default SettingsScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

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
  itemCopy: {
    flex: 1,
    paddingRight: 16,
  },
  itemHint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
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
