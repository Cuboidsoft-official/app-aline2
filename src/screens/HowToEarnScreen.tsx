import React, { useCallback, useMemo, useState } from "react";
import Clipboard from "@react-native-clipboard/clipboard";
import {
  Modal,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Alert } from "../utils/appAlert";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { appConfig } from "../config/env";
import { useAppTheme } from "../theme/AppThemeContext";
import { getStoredUser } from "../utils/authSession";
import AppBottomDock, { APP_BOTTOM_DOCK_BASE_HEIGHT } from "../components/AppBottomDock";

type EarnSection = "companyAds" | "listAds" | "referral";

const companyAds = [
  {
    title: "Beauty brand campaign",
    meta: "Story + short product mention",
    payout: "From INR 499",
  },
  {
    title: "Local service promotion",
    meta: "Feed post with clear call to action",
    payout: "From INR 799",
  },
  {
    title: "Creator spotlight",
    meta: "Profile feature for active creators",
    payout: "Invite based",
  },
];

function HowToEarnScreen({ navigation }: any) {
  const { colors, isDarkMode } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [activeSection, setActiveSection] = useState<EarnSection>("companyAds");
  const [guideVisible, setGuideVisible] = useState(false);
  const [adPrice, setAdPrice] = useState("");
  const [referralCode, setReferralCode] = useState("");

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadReferralCode = async () => {
        try {
          const [walletRes, user] = await Promise.all([
            API.get("/wallet").catch(() => ({ data: null })),
            getStoredUser().catch(() => null),
          ]);

          const nextCode = String(
            walletRes.data?.referralCode
              || user?.referralCode
              || user?.inviteCode
              || user?.username
              || "",
          ).trim();

          if (active) {
            setReferralCode(nextCode);
          }
        } catch (error) {
          console.log("how to earn referral load error:", error);
        }
      };

      loadReferralCode();

      return () => {
        active = false;
      };
    }, []),
  );

  const referralMessage = useMemo(() => {
    const shareBase = (appConfig.publicShareBaseUrl || "https://aline2.com").replace(/\/+$/, "");
    const codeLine = referralCode ? `Use my referral code: ${referralCode}` : "Join me on Aline2.";
    return `${codeLine}\n${shareBase}`;
  }, [referralCode]);

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

  const saveAdListing = () => {
    const cleanPrice = adPrice.trim();

    if (!cleanPrice) {
      Alert.alert("Add price", "Enter your starting ad price.");
      return;
    }

    Alert.alert("Listing ready", `Your ad listing starts at INR ${cleanPrice}.`);
  };

  const renderSection = () => {
    if (activeSection === "companyAds") {
      return (
        <View style={[styles.detailPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.detailTitle, { color: colors.text }]}>Company ad list</Text>
          <Text style={[styles.detailBody, { color: colors.mutedText }]}>
            Campaigns listed by companies will appear here. Pick one, review the brief, and apply.
          </Text>

          {companyAds.map((item) => (
            <View key={item.title} style={[styles.campaignRow, { borderColor: colors.border }]}>
              <View style={styles.campaignCopy}>
                <Text style={[styles.campaignTitle, { color: colors.text }]}>{item.title}</Text>
                <Text style={[styles.campaignMeta, { color: colors.mutedText }]}>{item.meta}</Text>
              </View>
              <Text style={[styles.campaignPayout, { color: colors.primary }]}>{item.payout}</Text>
            </View>
          ))}
        </View>
      );
    }

    if (activeSection === "listAds") {
      return (
        <View style={[styles.detailPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.detailTitle, { color: colors.text }]}>List yourself for ads</Text>
          <Text style={[styles.detailBody, { color: colors.mutedText }]}>
            Set your starting price so brands know your ad rate.
          </Text>

          <View style={[styles.priceBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.pricePrefix, { color: colors.mutedText }]}>INR</Text>
            <TextInput
              value={adPrice}
              onChangeText={setAdPrice}
              keyboardType="numeric"
              placeholder="Your price"
              placeholderTextColor={colors.placeholder}
              style={[styles.priceInput, { color: colors.text }]}
            />
          </View>

          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={saveAdListing}>
            <Text style={styles.primaryButtonText}>Save listing</Text>
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
        <TouchableOpacity
          activeOpacity={0.9}
          style={[styles.videoCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setGuideVisible(true)}
        >
          <View style={[styles.videoPreview, { backgroundColor: `${colors.primary}14` }]}>
            <View style={[styles.playButton, { backgroundColor: colors.primary }]}>
              <Icon name="play" size={24} color="#fff" />
            </View>
          </View>
          <View style={styles.videoCopy}>
            <Text style={[styles.videoTitle, { color: colors.text }]}>How to earn on Aline2</Text>
            <Text style={[styles.videoDescription, { color: colors.mutedText }]}>
              Watch a short guide on seller setup, ads, listings, and referrals.
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.actionList}>
          <TouchableOpacity
            style={[styles.actionRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => navigation.navigate("SellerRegistration")}
          >
            <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}14` }]}>
              <Icon name="storefront-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.actionCopy}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Become a seller</Text>
              <Text style={[styles.actionSubtitle, { color: colors.mutedText }]}>Create your seller account.</Text>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.mutedText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setActiveSection("companyAds")}
          >
            <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}14` }]}>
              <Icon name="megaphone-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.actionCopy}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Post an ad</Text>
              <Text style={[styles.actionSubtitle, { color: colors.mutedText }]}>View company ad campaigns.</Text>
            </View>
            <Icon name="chevron-down" size={18} color={colors.mutedText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setActiveSection("listAds")}
          >
            <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}14` }]}>
              <Icon name="pricetag-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.actionCopy}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>List yourself for ads</Text>
              <Text style={[styles.actionSubtitle, { color: colors.mutedText }]}>Set your ad price.</Text>
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

      <Modal visible={guideVisible} transparent animationType="fade" onRequestClose={() => setGuideVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setGuideVisible(false)}>
              <Icon name="close" size={20} color={colors.text} />
            </TouchableOpacity>
            <View style={[styles.modalVideo, { backgroundColor: `${colors.primary}14` }]}>
              <View style={[styles.playButton, { backgroundColor: colors.primary }]}>
                <Icon name="play" size={24} color="#fff" />
              </View>
            </View>
            <Text style={[styles.modalTitle, { color: colors.text }]}>How to earn on Aline2</Text>
            <Text style={[styles.modalBody, { color: colors.mutedText }]}>
              This guide will explain seller setup, company ads, creator ad listings, and referral rewards.
            </Text>
          </View>
        </View>
      </Modal>
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
  campaignRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    marginTop: 12,
  },
  campaignCopy: {
    flex: 1,
    paddingRight: 10,
  },
  campaignTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  campaignMeta: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
  },
  campaignPayout: {
    fontSize: 12,
    fontWeight: "800",
  },
  priceBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    marginTop: 14,
    marginBottom: 12,
  },
  pricePrefix: {
    fontSize: 13,
    fontWeight: "800",
    marginRight: 8,
  },
  priceInput: {
    flex: 1,
    minHeight: 46,
    fontSize: 15,
    fontWeight: "700",
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 20,
    overflow: "hidden",
  },
  modalClose: {
    position: "absolute",
    right: 10,
    top: 10,
    zIndex: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.82)",
  },
  modalVideo: {
    height: 190,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    paddingHorizontal: 16,
    paddingTop: 16,
    fontSize: 17,
    fontWeight: "800",
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingTop: 7,
    paddingBottom: 18,
    fontSize: 13,
    lineHeight: 20,
  },
});
