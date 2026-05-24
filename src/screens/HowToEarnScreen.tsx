import React, { useCallback, useMemo, useState } from "react";
import Clipboard from "@react-native-clipboard/clipboard";
import {
  ActivityIndicator,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Alert } from "../utils/appAlert";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";

import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { appConfig } from "../config/env";
import { getStoredUser } from "../utils/authSession";
import { openRazorpayCheckout } from "../utils/razorpayCheckout";
import { useAppTheme } from "../theme/AppThemeContext";
import AppBottomDock, { APP_BOTTOM_DOCK_BASE_HEIGHT } from "../components/AppBottomDock";

type EarnSection = "referral" | "feature";

const FEATURE_AMOUNT = 100;
const FEATURE_DAYS = 30;

function HowToEarnScreen({ navigation }: any) {
  const { colors, isDarkMode } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [activeSection, setActiveSection] = useState<EarnSection>("referral");
  const [referralCode, setReferralCode] = useState("");
  const [hasSellerAccount, setHasSellerAccount] = useState(false);
  const [featuredProfile, setFeaturedProfile] = useState<any>(null);
  const [loadingFeature, setLoadingFeature] = useState(true);
  const [activatingFeature, setActivatingFeature] = useState(false);

  const loadScreenData = useCallback(async () => {
    try {
      setLoadingFeature(true);
      const [walletRes, user, sellerRes, featureRes] = await Promise.all([
        API.get("/wallet").catch(() => ({ data: null })),
        getStoredUser().catch(() => null),
        API.get("/seller/me").catch(() => ({ data: null })),
        API.get("/featured-profiles/me").catch(() => ({ data: null })),
      ]);
      const seller = sellerRes.data?.seller;
      const sellerReady = Boolean(seller?.onboardingCompleted);
      const nextCode = String(
        walletRes.data?.referralCode
          || user?.referralCode
          || user?.inviteCode
          || user?.username
          || "",
      ).trim();

      setReferralCode(nextCode);
      setHasSellerAccount(Boolean(sellerReady || String(user?.category || "").toLowerCase() === "seller"));
      setFeaturedProfile(featureRes.data?.featuredProfile || null);
    } catch (error) {
      console.log("how to earn load error:", error);
    } finally {
      setLoadingFeature(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadScreenData();
    }, [loadScreenData]),
  );

  const referralMessage = useMemo(() => {
    const shareBase = (appConfig.publicShareBaseUrl || "https://aline2.com").replace(/\/+$/, "");
    const codeLine = referralCode ? `Use my referral code: ${referralCode}` : "Join me on Aline2.";
    return `${codeLine}\n${shareBase}`;
  }, [referralCode]);

  const isFeatureActive = String(featuredProfile?.status || "").toLowerCase() === "active"
    && String(featuredProfile?.paymentStatus || "").toLowerCase() === "paid";
  const featureExpiresAt = featuredProfile?.expiresAt || "";
  const featureExpiryLabel = featureExpiresAt ? new Date(featureExpiresAt).toLocaleDateString() : "";

  const copyReferralCode = () => {
    if (!referralCode) {
      Alert.alert("Referral code", "Your referral code is not available yet.");
      return;
    }

    Clipboard.setString(referralCode);
    Alert.alert("Copied", "Referral code copied.");
  };

  const shareReferralCode = async () => {
    try {
      await Share.share({ message: referralMessage });
    } catch (error) {
      console.log("share referral failed:", error);
    }
  };

  const activateFeaturedProfile = useCallback(async () => {
    if (activatingFeature || isFeatureActive) {
      return;
    }

    try {
      setActivatingFeature(true);
      const orderRes = await API.post("/featured-profiles/order", {
        amount: FEATURE_AMOUNT,
        durationDays: FEATURE_DAYS,
      });
      const order = orderRes.data?.featuredProfile;
      const payment = orderRes.data?.payment;
      const featuredProfileId = String(order?._id || "");

      if (!featuredProfileId || !payment) {
        throw new Error("Could not create featured profile order.");
      }

      const checkoutResult = await openRazorpayCheckout(payment);
      const verifyRes = await API.post(`/featured-profiles/${featuredProfileId}/verify`, checkoutResult);

      if (!verifyRes.data?.featuredProfile || verifyRes.data.featuredProfile.paymentStatus !== "paid") {
        throw new Error("Payment completed but profile feature was not confirmed.");
      }

      setFeaturedProfile(verifyRes.data.featuredProfile);
      setActiveSection("feature");
      Alert.alert("Profile featured", "Your profile is now featured for this month.");
    } catch (error) {
      console.log("feature profile payment error:", error);
      Alert.alert("Could not feature profile", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setActivatingFeature(false);
    }
  }, [activatingFeature, isFeatureActive]);

  const renderSection = () => {
    if (activeSection === "feature") {
      return (
        <View style={[styles.detailPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.detailTitle, { color: colors.text }]}>Feature your profile</Text>
          <Text style={[styles.detailBody, { color: colors.mutedText }]}>
            Pay INR {FEATURE_AMOUNT}/month to show your profile inside feed and search. It becomes visible only after payment success.
          </Text>

          <View style={[styles.featureStatusBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Icon
              name={isFeatureActive ? "checkmark-circle-outline" : "sparkles-outline"}
              size={19}
              color={colors.primary}
            />
            <Text style={[styles.featureStatusText, { color: colors.text }]}>
              {isFeatureActive
                ? `Active${featureExpiryLabel ? ` till ${featureExpiryLabel}` : ""}`
                : "Not active yet"}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: isFeatureActive ? colors.surface : colors.primary }]}
            onPress={activateFeaturedProfile}
            disabled={activatingFeature || loadingFeature || isFeatureActive}
          >
            {activatingFeature || loadingFeature ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Icon name={isFeatureActive ? "checkmark-circle-outline" : "card-outline"} size={18} color={isFeatureActive ? colors.primary : "#fff"} />
                <Text style={[styles.primaryButtonText, isFeatureActive ? { color: colors.primary } : null]}>
                  {isFeatureActive ? "Profile featured" : "Pay and feature profile"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={[styles.detailPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.detailTitle, { color: colors.text }]}>Referral rewards</Text>
        <Text style={[styles.detailBody, { color: colors.mutedText }]}>
          Invite friends to Aline2. When they join and become active, your reward benefits will be tracked in your wallet.
        </Text>

        <View style={[styles.referralBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.referralCopy}>
            <Text style={[styles.referralLabel, { color: colors.mutedText }]}>Your code</Text>
            <Text style={[styles.referralCode, { color: colors.text }]} numberOfLines={1}>
              {referralCode || "Not available"}
            </Text>
          </View>
          <TouchableOpacity style={[styles.iconButton, { backgroundColor: colors.primary }]} onPress={copyReferralCode}>
            <Icon name="copy-outline" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={shareReferralCode}>
          <Icon name="share-social-outline" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>Share referral</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={colors.background} />

        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={23} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>How to Earn</Text>
          <View style={styles.headerButton} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: APP_BOTTOM_DOCK_BASE_HEIGHT + Math.max(insets.bottom, 10) + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.videoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.videoPreview, { backgroundColor: `${colors.primary}14` }]}>
              <View style={[styles.playButton, { backgroundColor: colors.primary }]}>
                <Icon name="play" size={24} color="#fff" />
              </View>
            </View>
            <View style={styles.videoCopy}>
              <Text style={[styles.videoTitle, { color: colors.text }]}>How to earn on Aline2</Text>
              <Text style={[styles.videoDescription, { color: colors.mutedText }]}>
                Earn through referrals, seller setup, and featured profile promotion.
              </Text>
            </View>
          </View>

          <View style={styles.actionList}>
            <TouchableOpacity
              style={[styles.actionRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => navigation.navigate(hasSellerAccount ? "SellerDashboardScreen" : "SellerRegistration")}
            >
              <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}14` }]}>
                <Icon name={hasSellerAccount ? "briefcase-outline" : "storefront-outline"} size={20} color={colors.primary} />
              </View>
              <View style={styles.actionCopy}>
                <Text style={[styles.actionTitle, { color: colors.text }]}>{hasSellerAccount ? "Seller dashboard" : "Become a seller"}</Text>
                <Text style={[styles.actionSubtitle, { color: colors.mutedText }]}>
                  {hasSellerAccount ? "Manage your bookings, profile, and services." : "Create your seller account."}
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} color={colors.mutedText} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setActiveSection("feature")}
            >
              <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}14` }]}>
                <Icon name="sparkles-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.actionCopy}>
                <Text style={[styles.actionTitle, { color: colors.text }]}>Feature your profile</Text>
                <Text style={[styles.actionSubtitle, { color: colors.mutedText }]}>
                  INR {FEATURE_AMOUNT}/month. Visible after payment success.
                </Text>
              </View>
              <Icon name="chevron-down" size={18} color={colors.mutedText} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setActiveSection("referral")}
            >
              <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}14` }]}>
                <Icon name="gift-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.actionCopy}>
                <Text style={[styles.actionTitle, { color: colors.text }]}>Referral rewards</Text>
                <Text style={[styles.actionSubtitle, { color: colors.mutedText }]}>Share and earn benefits.</Text>
              </View>
              <Icon name="chevron-down" size={18} color={colors.mutedText} />
            </TouchableOpacity>
          </View>

          {renderSection()}
        </ScrollView>
      </SafeAreaView>
      <AppBottomDock navigation={navigation} />
    </View>
  );
}

export default HowToEarnScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  videoCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 16,
  },
  videoPreview: {
    height: 150,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 3,
  },
  videoCopy: {
    padding: 14,
  },
  videoTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  videoDescription: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
  },
  actionList: {
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  actionCopy: {
    flex: 1,
    paddingRight: 10,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  actionSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
  },
  detailPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 14,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  detailBody: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
  },
  featureStatusBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
    marginBottom: 12,
    gap: 8,
  },
  featureStatusText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  referralBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
    marginBottom: 12,
  },
  referralCopy: {
    flex: 1,
    paddingRight: 10,
  },
  referralLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  referralCode: {
    marginTop: 3,
    fontSize: 18,
    fontWeight: "900",
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
