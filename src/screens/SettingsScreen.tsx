import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Alert } from "../utils/appAlert";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { API } from "../api/api";
import AppBottomDock, { APP_BOTTOM_DOCK_BASE_HEIGHT } from "../components/AppBottomDock";
import { APP_VERSION } from "../config/appMeta";
import { alpha, appFonts, appShadows } from "../theme/designSystem";
import { useAppTheme } from "../theme/AppThemeContext";
import { clearStoredSession, getStoredToken } from "../utils/authSession";
import { clearPushToken } from "../utils/pushRegistration";

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

  return `${bankName} - ${lastFour}`;
};

const SettingsScreen = ({ navigation }: any) => {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { colors, isDarkMode, setDarkModePreference } = useAppTheme();

  const [isPrivate, setIsPrivate] = useState(false);
  const [bankSummary, setBankSummary] = useState("Add your payout account");
  const [hasSellerAccount, setHasSellerAccount] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadPrivacy = async () => {
      try {
        const token = await getStoredToken();
        const res = await API.get("/auth/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const value = res?.data?.user?.isPrivate ?? false;
        const profileUser = res?.data?.user || {};

        setIsPrivate(value);
        setBankSummary(buildBankSummary(profileUser));
        setHasSellerAccount(String(profileUser?.category || "").toLowerCase() === "seller");

        await AsyncStorage.setItem("isPrivate", JSON.stringify(value));
      } catch {
        const saved = await AsyncStorage.getItem("isPrivate");

        if (saved) {
          setIsPrivate(JSON.parse(saved));
        }
      }
    };

    if (isFocused) {
      loadPrivacy().catch(() => {});
    }
  }, [isFocused]);

  const logout = async () => {
    const token = await getStoredToken();

    if (token) {
      try {
        await API.post(
          "/auth/logout",
          {},
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
      } catch (error) {
        console.log("logout API error:", error);
      }
    }

    await clearPushToken();
    await clearStoredSession();
    navigation.replace("Login");
  };

  const togglePrivateProfile = async () => {
    if (loading) {
      return;
    }

    try {
      setLoading(true);

      const token = await getStoredToken();
      const res = await API.post(
        "/auth/toggle-private",
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const value = res?.data?.isPrivate ?? false;

      setIsPrivate(value);
      await AsyncStorage.setItem("isPrivate", JSON.stringify(value));

      Alert.alert("Profile Updated", value ? "Your profile is now private." : "Your profile is now public.");
    } catch {
      Alert.alert("Error", "Unable to update profile privacy");
    } finally {
      setLoading(false);
    }
  };

  const toggleDarkMode = async () => {
    const nextValue = !isDarkMode;
    await setDarkModePreference(nextValue);
    Alert.alert("Theme updated", nextValue ? "Dark mode preference saved." : "Light mode preference saved.");
  };

  const renderActionRow = ({
    title,
    hint,
    icon,
    onPress,
    accentColor,
    trailing,
    last = false,
  }: {
    title: string;
    hint?: string;
    icon: string;
    onPress?: () => void;
    accentColor?: string;
    trailing?: React.ReactNode;
    last?: boolean;
  }) => {
    const rowAccent = accentColor || colors.primary;

    return (
      <TouchableOpacity
        activeOpacity={onPress ? 0.82 : 1}
        disabled={!onPress}
        onPress={onPress}
        style={[
          styles.row,
          { borderBottomColor: last ? "transparent" : alpha(colors.border, isDarkMode ? "55" : "A6") },
        ]}
      >
        <View style={styles.rowLead}>
          <View style={[styles.rowIconWrap, { backgroundColor: alpha(rowAccent, isDarkMode ? "22" : "16") }]}>
            <Icon name={icon} size={17} color={rowAccent} />
          </View>
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
            {hint ? <Text style={[styles.rowHint, { color: colors.mutedText }]}>{hint}</Text> : null}
          </View>
        </View>
        {trailing || <Icon name="chevron-forward" size={18} color={colors.tabInactive || colors.mutedText} />}
      </TouchableOpacity>
    );
  };

  const renderSwitchRow = ({
    title,
    hint,
    icon,
    value,
    onValueChange,
    disabled = false,
    last = false,
  }: {
    title: string;
    hint?: string;
    icon: string;
    value: boolean;
    onValueChange: () => void;
    disabled?: boolean;
    last?: boolean;
  }) =>
    renderActionRow({
      title,
      hint,
      icon,
      last,
      trailing: (
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ false: colors.border, true: alpha(colors.primary, "66") }}
          thumbColor={value ? colors.primary : colors.card}
        />
      ),
    });

  const sellerTitle = hasSellerAccount ? "Seller tools" : "Seller setup";
  const sellerSubtitle = hasSellerAccount
    ? "Manage your seller workspace and incoming requests."
    : "Start selling and set up your service profile from here.";
  const heroSubtitle = hasSellerAccount
    ? "All account controls, privacy, and seller tools in one place."
    : "Manage your account, privacy, and app preferences from one place.";

  return (
    <View style={styles.screen}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: alpha(colors.border, isDarkMode ? "55" : "96") }]}>
          <TouchableOpacity
            activeOpacity={0.82}
            style={[styles.headerButton, { backgroundColor: alpha(colors.card, isDarkMode ? "D8" : "F2"), borderColor: alpha(colors.border, isDarkMode ? "72" : "B6") }]}
            onPress={() => navigation.goBack()}
          >
            <Icon name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.headerCopy}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Settings and Activity</Text>
            <Text style={[styles.headerSubtitle, { color: colors.mutedText }]}>
              {hasSellerAccount ? "Seller account active" : "Personal account controls"}
            </Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: APP_BOTTOM_DOCK_BASE_HEIGHT + Math.max(insets.bottom, 10) + 26,
          }}
        >
          <View
            style={[
              styles.heroCard,
              appShadows.card,
              {
                backgroundColor: colors.card,
                borderColor: alpha(colors.border, isDarkMode ? "72" : "AA"),
              },
            ]}
          >
            <View style={styles.heroBadgeRow}>
              <View style={[styles.heroBadge, { backgroundColor: alpha(colors.primary, isDarkMode ? "26" : "16") }]}>
                <Text style={[styles.heroBadgeText, { color: colors.primary }]}>
                  {hasSellerAccount ? "Seller + User" : "User"}
                </Text>
              </View>
              <View style={[styles.heroBadge, { backgroundColor: alpha(isPrivate ? colors.primary : colors.mutedText, isDarkMode ? "20" : "12") }]}>
                <Text style={[styles.heroBadgeText, { color: isPrivate ? colors.primary : colors.mutedText }]}>
                  {isPrivate ? "Private profile" : "Public profile"}
                </Text>
              </View>
            </View>

            <Text style={[styles.heroTitle, { color: colors.text }]}>Your account hub</Text>
            <Text style={[styles.heroText, { color: colors.mutedText }]}>{heroSubtitle}</Text>

            <View style={styles.heroStats}>
              <View style={[styles.statCard, { backgroundColor: alpha(colors.primary, isDarkMode ? "1A" : "10"), borderColor: alpha(colors.primary, isDarkMode ? "36" : "24") }]}>
                <Text style={[styles.statLabel, { color: colors.mutedText }]}>Bank setup</Text>
                <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={2}>
                  {bankSummary}
                </Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: alpha(colors.surface, isDarkMode ? "F0" : "F7"), borderColor: alpha(colors.border, isDarkMode ? "70" : "B4") }]}>
                <Text style={[styles.statLabel, { color: colors.mutedText }]}>Theme</Text>
                <Text style={[styles.statValue, { color: colors.text }]}>{isDarkMode ? "Dark mode on" : "Light mode on"}</Text>
              </View>
            </View>
          </View>

          <View style={[styles.sectionCard, appShadows.card, { backgroundColor: colors.card, borderColor: alpha(colors.border, isDarkMode ? "70" : "AA") }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Your account</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.mutedText }]}>Core account controls for both users and sellers.</Text>
            {renderActionRow({
              title: "Account Center",
              hint: "Password, security, and account management",
              icon: "person-circle-outline",
              onPress: () => navigation.navigate("AccountCenterScreen"),
            })}
            {renderActionRow({
              title: "Bank account setup",
              hint: bankSummary,
              icon: "card-outline",
              onPress: () => navigation.navigate("Profile"),
            })}
            {renderActionRow({
              title: "Wallet and appointments",
              hint: "Add money, use referral wallet, and open your booking dashboard",
              icon: "wallet-outline",
              onPress: () => navigation.navigate("WalletScreen"),
            })}
            {renderSwitchRow({
              title: "Private account",
              hint: "Control who can view your profile and activity",
              icon: "lock-closed-outline",
              value: isPrivate,
              onValueChange: togglePrivateProfile,
              disabled: loading,
            })}
            {renderActionRow({
              title: "Notifications",
              hint: "Calls, chats, activity, and reminders",
              icon: "notifications-outline",
              onPress: () => navigation.navigate("NotificationSettingsScreen"),
              last: true,
            })}
          </View>

          <View style={[styles.sectionCard, appShadows.card, { backgroundColor: colors.card, borderColor: alpha(colors.border, isDarkMode ? "70" : "AA") }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Privacy and library</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.mutedText }]}>Manage who can interact with you and what you have saved.</Text>
            {renderActionRow({
              title: "Blocked users",
              hint: "Review people you have blocked",
              icon: "ban-outline",
              onPress: () => navigation.navigate("BlockedUsersScreen"),
            })}
            {renderActionRow({
              title: "Close friends",
              hint: "Update your private sharing circle",
              icon: "people-outline",
              onPress: () => navigation.navigate("CloseFriendsScreen"),
            })}
            {renderActionRow({
              title: "Post archive",
              hint: "Access hidden and archived posts",
              icon: "archive-outline",
              onPress: () => navigation.navigate("PostArchive"),
            })}
            {renderActionRow({
              title: "Story archive",
              hint: "See your archived stories",
              icon: "albums-outline",
              onPress: () => navigation.navigate("StoryArchive"),
            })}
            {renderActionRow({
              title: "Saved posts",
              hint: "Open your saved collection",
              icon: "bookmark-outline",
              onPress: () => navigation.navigate("SavedPosts"),
              last: true,
            })}
          </View>

          <View style={[styles.sectionCard, appShadows.card, { backgroundColor: colors.card, borderColor: alpha(colors.border, isDarkMode ? "70" : "AA") }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{sellerTitle}</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.mutedText }]}>{sellerSubtitle}</Text>
            {renderActionRow({
              title: hasSellerAccount ? "Seller dashboard" : "Become a Seller",
              hint: hasSellerAccount ? "Orders, services, and earnings overview" : "Create your seller profile and offer services",
              icon: hasSellerAccount ? "grid-outline" : "storefront-outline",
              onPress: () => navigation.navigate(hasSellerAccount ? "SellerDashboardScreen" : "SellerRegistration"),
              accentColor: hasSellerAccount ? colors.primary : "#2C7BE5",
            })}
            {renderActionRow({
              title: "My service requests",
              hint: "Track the requests you have sent to sellers",
              icon: "briefcase-outline",
              onPress: () => navigation.navigate("ServiceRequestsScreen", { mode: "user" }),
              accentColor: hasSellerAccount ? "#14B8A6" : colors.primary,
              last: true,
            })}
          </View>

          <View style={[styles.sectionCard, appShadows.card, { backgroundColor: colors.card, borderColor: alpha(colors.border, isDarkMode ? "70" : "AA") }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>App preferences</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.mutedText }]}>Theme, support, legal details, and app version.</Text>
            {renderSwitchRow({
              title: "Dark mode",
              hint: "Keep the app aligned with your preferred theme",
              icon: "moon-outline",
              value: isDarkMode,
              onValueChange: toggleDarkMode,
            })}
            {renderActionRow({
              title: "Help and Support",
              hint: "Reach support and get help with your account",
              icon: "help-buoy-outline",
              onPress: () => navigation.navigate("HelpSupportScreen"),
            })}
            {renderActionRow({
              title: "Privacy Policy",
              hint: "Review how your data is handled",
              icon: "document-text-outline",
              onPress: () => navigation.navigate("PrivacyPolicyScreen"),
            })}
            {renderActionRow({
              title: "Release notes",
              hint: `Version ${APP_VERSION}`,
              icon: "sparkles-outline",
              onPress: () => navigation.navigate("ReleaseNotesScreen"),
              last: true,
            })}
          </View>

          <View style={[styles.dangerCard, { backgroundColor: alpha(colors.danger, isDarkMode ? "12" : "0C"), borderColor: alpha(colors.danger, isDarkMode ? "42" : "30") }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Account actions</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.mutedText }]}>Use these options carefully.</Text>
            {renderActionRow({
              title: "Delete account",
              hint: "Permanently remove your account after confirmation",
              icon: "trash-outline",
              onPress: () => navigation.navigate("DeleteAccountScreen"),
              accentColor: colors.danger,
              last: true,
            })}

            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.logoutButton, { backgroundColor: colors.danger }]}
              onPress={logout}
            >
              <Icon name="log-out-outline" size={18} color="#fff" />
              <Text style={styles.logoutButtonText}>Log out</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>

      <AppBottomDock navigation={navigation} activeRouteName="ProfileView" />
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
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  headerCopy: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontFamily: appFonts.bold,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: appFonts.medium,
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
  },
  heroBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  heroBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
    marginBottom: 8,
  },
  heroBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appFonts.semibold,
  },
  heroTitle: {
    marginTop: 14,
    fontSize: 24,
    lineHeight: 30,
    fontFamily: appFonts.bold,
  },
  heroText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: appFonts.regular,
  },
  heroStats: {
    flexDirection: "row",
    marginTop: 18,
    marginHorizontal: -6,
  },
  statCard: {
    flex: 1,
    minHeight: 88,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    justifyContent: "space-between",
    marginHorizontal: 6,
  },
  statLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appFonts.medium,
  },
  statValue: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: appFonts.semibold,
  },
  sectionCard: {
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 2,
    marginBottom: 16,
  },
  dangerCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontFamily: appFonts.bold,
  },
  sectionSubtitle: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: appFonts.regular,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 72,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLead: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 12,
  },
  rowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rowCopy: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: appFonts.semibold,
  },
  rowHint: {
    marginTop: 4,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: appFonts.regular,
  },
  logoutButton: {
    marginTop: 16,
    borderRadius: 18,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  logoutButtonText: {
    marginLeft: 8,
    color: "#fff",
    fontSize: 15,
    lineHeight: 20,
    fontFamily: appFonts.semibold,
  },
});
