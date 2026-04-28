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

const roundAdPrice = (value: number) => Math.ceil(value / 50) * 50;

function HowToEarnScreen({ navigation }: any) {
  const { colors, isDarkMode } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [activeSection, setActiveSection] = useState<EarnSection>("companyAds");
  const [guideVisible, setGuideVisible] = useState(false);
  const [adPrice, setAdPrice] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [hasSellerAccount, setHasSellerAccount] = useState(false);
  const [hasAdsMembership, setHasAdsMembership] = useState(false);
  const [membershipLabel, setMembershipLabel] = useState("INR 100 membership required");

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadReferralCode = async () => {
        try {
          const [walletRes, user, sellerRes] = await Promise.all([
            API.get("/wallet").catch(() => ({ data: null })),
            getStoredUser().catch(() => null),
            API.get("/seller/me").catch(() => ({ data: null })),
          ]);
          const seller = sellerRes.data?.seller;
          const sellerPlanCode = String(seller?.subscriptionPlan?.code || seller?.premiumPlan || "").trim();
          const sellerPlanAmount = Number(seller?.subscriptionPlan?.amount || sellerPlanCode.replace(/\D/g, "")) || 0;
          const sellerReady = Boolean(seller?.onboardingCompleted);

          const nextCode = String(
            walletRes.data?.referralCode
              || user?.referralCode
              || user?.inviteCode
              || user?.username
              || "",
          ).trim();

          if (active) {
            setReferralCode(nextCode);
            setHasSellerAccount(Boolean(sellerReady || String(user?.category || "").toLowerCase() === "seller"));
            setHasAdsMembership(Boolean(sellerReady && sellerPlanAmount >= 100));
            setMembershipLabel(
              sellerReady && sellerPlanAmount >= 100
                ? `Membership active: INR ${sellerPlanAmount}`
                : "INR 100 membership required",
            );
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

  const adPackages = useMemo(() => {
    const basePrice = roundAdPrice(Math.max(299, Number(adPrice) || 299));

    return [
      {
        title: "Story mention",
        hint: "15 sec story, brand tag, swipe CTA",
        amount: `INR ${basePrice}`,
      },
      {
        title: "Feed post",
        hint: "Single post or carousel with caption mention",
        amount: `INR ${roundAdPrice(basePrice * 2)}`,
      },
      {
        title: "Reel / short video",
        hint: "Short video or talking format with mention",
        amount: `INR ${roundAdPrice(basePrice * 3)}`,
      },
      {
        title: "Combo package",
        hint: "1 story + 1 feed/reel for one campaign",
        amount: `INR ${roundAdPrice(basePrice * 4.25)}`,
      },
    ];
  }, [adPrice]);

  const openMembershipSetup = useCallback(() => {
    navigation.navigate("SellerRegistration", {
      mode: hasSellerAccount ? "edit" : "create",
      initialStep: 2,
    });
  }, [hasSellerAccount, navigation]);

  const requireAdsMembership = useCallback((section: EarnSection) => {
    setActiveSection(section);

    if (section === "referral" || hasAdsMembership) {
      return true;
    }

    Alert.alert(
      "Membership required",
      "An INR 100 membership is required to use Post an ad and List yourself for ads.",
      [
        { text: "Later", style: "cancel" },
        { text: hasSellerAccount ? "Open membership" : "Get membership", onPress: openMembershipSetup },
      ],
    );
    return false;
  }, [hasAdsMembership, hasSellerAccount, openMembershipSetup]);

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
    if (!hasAdsMembership) {
      Alert.alert(
        "Membership required",
        "Activate the INR 100 membership before saving an ad listing.",
        [
          { text: "Later", style: "cancel" },
          { text: hasSellerAccount ? "Open membership" : "Get membership", onPress: openMembershipSetup },
        ],
      );
      return;
    }

    const cleanPrice = adPrice.trim();

    if (!cleanPrice) {
      Alert.alert("Add price", "Enter your starting ad price.");
      return;
    }

    Alert.alert("Listing ready", `Your ad listing starts at INR ${cleanPrice}.`);
  };

  const renderMembershipLock = (title: string, body: string) => (
    <View style={[styles.detailPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.membershipBanner, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}28` }]}>
        <Icon name="lock-closed-outline" size={16} color={colors.primary} />
        <Text style={[styles.membershipBannerText, { color: colors.primary }]}>{membershipLabel}</Text>
      </View>
      <Text style={[styles.detailTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.detailBody, { color: colors.mutedText }]}>{body}</Text>
      <TouchableOpacity style={[styles.primaryButton, styles.membershipButton, { backgroundColor: colors.primary }]} onPress={openMembershipSetup}>
        <Text style={styles.primaryButtonText}>{hasSellerAccount ? "Open membership" : "Get INR 100 membership"}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSection = () => {
    if (activeSection === "companyAds") {
      if (!hasAdsMembership) {
        return renderMembershipLock(
          "Post an ad",
          "An active INR 100 membership is required to view and apply for company campaigns.",
        );
      }

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
              <View style={styles.campaignAside}>
                <Text style={[styles.campaignPayout, { color: colors.primary }]}>{item.payout}</Text>
                <TouchableOpacity
                  style={[styles.applyChip, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}28` }]}
                  onPress={() => Alert.alert("Application ready", `You can now apply for ${item.title}.`)}
                >
                  <Text style={[styles.applyChipText, { color: colors.primary }]}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      );
    }

    if (activeSection === "listAds") {
      if (!hasAdsMembership) {
        return renderMembershipLock(
          "List yourself for ads",
          "An INR 100 membership is required to publish your ad profile and show your rates.",
        );
      }

      return (
        <View style={[styles.detailPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.detailTitle, { color: colors.text }]}>List yourself for ads</Text>
          <Text style={[styles.detailBody, { color: colors.mutedText }]}>
            Set your starting price. Below is a preview of common deliverables and expected charges that brands will see.
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

          <View style={styles.packageList}>
            {adPackages.map((item) => (
              <View key={item.title} style={[styles.packageRow, { borderColor: colors.border }]}>
                <View style={styles.packageCopy}>
                  <Text style={[styles.packageTitle, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[styles.packageHint, { color: colors.mutedText }]}>{item.hint}</Text>
                </View>
                <Text style={[styles.packageAmount, { color: colors.primary }]}>{item.amount}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.helperNote, { color: colors.mutedText }]}>
            Clearly mention stories, feed posts, reels, combo packages, and prices so brands understand what each option costs.
          </Text>

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

        <View style={[styles.membershipBanner, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}24` }]}>
          <Icon name={hasAdsMembership ? "checkmark-circle-outline" : "lock-closed-outline"} size={16} color={colors.primary} />
          <Text style={[styles.membershipBannerText, { color: colors.text }]}>{membershipLabel}</Text>
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
            onPress={() => {
              void requireAdsMembership("companyAds");
            }}
          >
            <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}14` }]}>
              <Icon name="megaphone-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.actionCopy}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Post an ad</Text>
              <Text style={[styles.actionSubtitle, { color: colors.mutedText }]}>View company ad campaigns. INR 100 membership required.</Text>
            </View>
            <Icon name="chevron-down" size={18} color={colors.mutedText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              void requireAdsMembership("listAds");
            }}
          >
            <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}14` }]}>
              <Icon name="pricetag-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.actionCopy}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>List yourself for ads</Text>
              <Text style={[styles.actionSubtitle, { color: colors.mutedText }]}>Set deliverables, rates, and brand mention pricing.</Text>
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
  membershipBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    gap: 8,
  },
  membershipBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
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
  campaignAside: {
    alignItems: "flex-end",
  },
  applyChip: {
    marginTop: 8,
    minHeight: 30,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  applyChipText: {
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
  membershipButton: {
    marginTop: 14,
  },
  packageList: {
    marginBottom: 12,
  },
  packageRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    marginTop: 12,
  },
  packageCopy: {
    flex: 1,
    paddingRight: 12,
  },
  packageTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  packageHint: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
  },
  packageAmount: {
    fontSize: 13,
    fontWeight: "900",
  },
  helperNote: {
    marginBottom: 14,
    fontSize: 12,
    lineHeight: 18,
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
