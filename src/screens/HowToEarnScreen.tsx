import React, { useCallback, useEffect, useMemo, useState } from "react";
import Clipboard from "@react-native-clipboard/clipboard";
import {
  ActivityIndicator,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";

import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { Alert } from "../utils/appAlert";
import { appConfig } from "../config/env";
import { getStoredUser } from "../utils/authSession";
import { openRazorpayCheckout } from "../utils/razorpayCheckout";
import { useAppTheme } from "../theme/AppThemeContext";
import AppBottomDock, { APP_BOTTOM_DOCK_BASE_HEIGHT } from "../components/AppBottomDock";

type EarnSection = "listedProfile" | "dropAd" | "searchProfile" | "listedAds" | "becomeSeller" | "howToEarn";

const FEATURE_AMOUNT = 100;
const FEATURE_DAYS = 30;
const DEFAULT_SECTION: EarnSection = "listedProfile";
const EARN_SECTIONS: EarnSection[] = ["listedProfile", "dropAd", "searchProfile", "listedAds", "becomeSeller", "howToEarn"];

const resolveInitialSection = (value?: string): EarnSection =>
  EARN_SECTIONS.includes(value as EarnSection) ? (value as EarnSection) : DEFAULT_SECTION;

const initialProfileForm = {
  followerCount: "",
  location: "",
  aline2Username: "",
  storyPrice: "",
  storyDurationHours: "24",
  photoPrice: "",
  photoDurationDays: "1",
  videoPricePerMinute: "",
  videoPricePerHour: "",
  videoSampleDurationMinutes: "1",
  promotionNotes: "",
};

const initialCompanyForm = {
  companyName: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  contentType: "",
  minimumFollowersCriteria: "",
  contentFormat: "template",
  preferredPlacement: "story",
  offeredPrice: "",
  productOrService: "",
  campaignGoal: "",
  location: "",
  targetAudience: "",
  mediaType: "mixed",
  storyBudget: "",
  photoBudget: "",
  videoBudgetPerMinute: "",
  videoBudgetPerHour: "",
  expectedVideoMinutes: "1",
  expectedVideoHours: "0",
  campaignDurationDays: "7",
  description: "",
};

const toNumber = (value: string) => {
  const parsed = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

function HowToEarnScreen({ navigation, route }: any) {
  const { colors, isDarkMode } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [activeSection, setActiveSection] = useState<EarnSection>(
    resolveInitialSection(route?.params?.section),
  );
  const [profileSearchQuery, setProfileSearchQuery] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [hasSellerAccount, setHasSellerAccount] = useState(false);
  const [featuredProfile, setFeaturedProfile] = useState<any>(null);
  const [featuredProfiles, setFeaturedProfiles] = useState<any[]>([]);
  const [companyAds, setCompanyAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingProfile, setSubmittingProfile] = useState(false);
  const [submittingCompany, setSubmittingCompany] = useState(false);
  const [profileForm, setProfileForm] = useState(initialProfileForm);
  const [companyForm, setCompanyForm] = useState(initialCompanyForm);

  useEffect(() => {
    setActiveSection(resolveInitialSection(route?.params?.section));
  }, [route?.params?.section]);

  const loadScreenData = useCallback(async () => {
    try {
      setLoading(true);
      const [walletRes, user, sellerRes, featureRes, profilesRes, adsRes] = await Promise.all([
        API.get("/wallet").catch(() => ({ data: null })),
        getStoredUser().catch(() => null),
        API.get("/seller/me").catch(() => ({ data: null })),
        API.get("/featured-profiles/me").catch(() => ({ data: null })),
        API.get("/featured-profiles", { params: { limit: 20 } }).catch(() => ({ data: null })),
        API.get("/company-ads", { params: { limit: 30 } }).catch(() => ({ data: null })),
      ]);

      const seller = sellerRes.data?.seller;
      const nextCode = String(
        walletRes.data?.referralCode || user?.referralCode || user?.inviteCode || user?.username || "",
      ).trim();
      const myFeature = featureRes.data?.featuredProfile || null;

      setReferralCode(nextCode);
      setHasSellerAccount(Boolean(seller?.onboardingCompleted || String(user?.category || "").toLowerCase() === "seller"));
      setFeaturedProfile(myFeature);
      setFeaturedProfiles(Array.isArray(profilesRes.data?.profiles) ? profilesRes.data.profiles : []);
      setCompanyAds(Array.isArray(adsRes.data?.ads) ? adsRes.data.ads : []);
      setProfileForm((current) => ({
        ...current,
        aline2Username: current.aline2Username || user?.username || myFeature?.aline2Username || "",
        followerCount: current.followerCount || String(myFeature?.followerCount || ""),
        location: current.location || myFeature?.location || "",
        storyPrice: current.storyPrice || String(myFeature?.storyPromotion?.price || ""),
        storyDurationHours: current.storyDurationHours || String(myFeature?.storyPromotion?.durationHours || 24),
        photoPrice: current.photoPrice || String(myFeature?.photoPromotion?.price || ""),
        photoDurationDays: current.photoDurationDays || String(myFeature?.photoPromotion?.durationDays || 1),
        videoPricePerMinute: current.videoPricePerMinute || String(myFeature?.videoPromotion?.pricePerMinute || ""),
        videoPricePerHour: current.videoPricePerHour || String(myFeature?.videoPromotion?.pricePerHour || ""),
        videoSampleDurationMinutes: current.videoSampleDurationMinutes || String(myFeature?.videoPromotion?.sampleDurationMinutes || 1),
        promotionNotes: current.promotionNotes || myFeature?.promotionNotes || "",
      }));
    } catch (error) {
      console.log("how to earn load error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadScreenData();
  }, [loadScreenData]));

  const referralMessage = useMemo(() => {
    const shareBase = (appConfig.publicShareBaseUrl || "https://aline2.com").replace(/\/+$/, "");
    const codeLine = referralCode ? `Use my referral code: ${referralCode}` : "Join me on Aline2.";
    return `${codeLine}\n${shareBase}`;
  }, [referralCode]);

  const isFeatureActive = String(featuredProfile?.status || "").toLowerCase() === "active"
    && String(featuredProfile?.paymentStatus || "").toLowerCase() === "paid";
  const featureExpiryLabel = featuredProfile?.expiresAt ? new Date(featuredProfile.expiresAt).toLocaleDateString() : "";
  const filteredFeaturedProfiles = useMemo(() => {
    const query = profileSearchQuery.trim().toLowerCase();

    if (!query) {
      return featuredProfiles;
    }

    return featuredProfiles.filter((item) => [
      item.name,
      item.username,
      item.aline2Username,
      item.location,
      item.sellerName,
    ].some((value) => String(value || "").toLowerCase().includes(query)));
  }, [featuredProfiles, profileSearchQuery]);

  const updateProfileForm = (key: keyof typeof initialProfileForm, value: string) => {
    setProfileForm((current) => ({ ...current, [key]: value }));
  };

  const updateCompanyForm = (key: keyof typeof initialCompanyForm, value: string) => {
    setCompanyForm((current) => ({ ...current, [key]: value }));
  };

  const activateFeaturedProfile = useCallback(async () => {
    if (submittingProfile) {
      return;
    }

    if (!profileForm.aline2Username.trim() || !profileForm.location.trim()) {
      Alert.alert("Missing details", "Add your Aline2 username and location.");
      return;
    }

    try {
      setSubmittingProfile(true);
      const orderRes = await API.post("/featured-profiles/order", {
        amount: FEATURE_AMOUNT,
        durationDays: FEATURE_DAYS,
        profileDetails: {
          followerCount: toNumber(profileForm.followerCount),
          location: profileForm.location,
          aline2Username: profileForm.aline2Username,
          storyPrice: toNumber(profileForm.storyPrice),
          storyDurationHours: toNumber(profileForm.storyDurationHours) || 24,
          postPrice: toNumber(profileForm.photoPrice),
          postDurationDays: toNumber(profileForm.photoDurationDays) || 1,
          reelPrice: toNumber(profileForm.videoPricePerMinute),
          reelDurationSeconds: toNumber(profileForm.videoSampleDurationMinutes) || 30,
          photoPrice: toNumber(profileForm.photoPrice),
          photoDurationDays: toNumber(profileForm.photoDurationDays) || 1,
          videoPricePerMinute: toNumber(profileForm.videoPricePerMinute),
          videoPricePerHour: toNumber(profileForm.videoPricePerHour),
          videoSampleDurationMinutes: toNumber(profileForm.videoSampleDurationMinutes) || 1,
          promotionNotes: profileForm.promotionNotes,
        },
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
      await loadScreenData();
      Alert.alert("Profile featured", "Your promotion profile is now listed with your rate card.");
    } catch (error) {
      console.log("feature profile payment error:", error);
      Alert.alert("Could not feature profile", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setSubmittingProfile(false);
    }
  }, [loadScreenData, profileForm, submittingProfile]);

  const createCompanyAd = useCallback(async () => {
    if (submittingCompany) {
      return;
    }

    if (!companyForm.companyName.trim() || !(companyForm.contentType.trim() || companyForm.productOrService.trim())) {
      Alert.alert("Missing details", "Add company name and content type.");
      return;
    }

    try {
      setSubmittingCompany(true);
      await API.post("/company-ads", {
        ...companyForm,
        contentType: companyForm.contentType.trim() || companyForm.productOrService.trim(),
        productOrService: companyForm.productOrService.trim() || companyForm.contentType.trim(),
        minimumFollowersCriteria: toNumber(companyForm.minimumFollowersCriteria),
        offeredPrice: toNumber(companyForm.offeredPrice),
        storyBudget: toNumber(companyForm.storyBudget),
        photoBudget: toNumber(companyForm.photoBudget),
        videoBudgetPerMinute: toNumber(companyForm.videoBudgetPerMinute),
        videoBudgetPerHour: toNumber(companyForm.videoBudgetPerHour),
        expectedVideoMinutes: toNumber(companyForm.expectedVideoMinutes) || 1,
        expectedVideoHours: toNumber(companyForm.expectedVideoHours),
        campaignDurationDays: toNumber(companyForm.campaignDurationDays) || 7,
      });
      setCompanyForm(initialCompanyForm);
      await loadScreenData();
      Alert.alert("Ad listed", "Company ad requirement is now visible in featured ads.");
    } catch (error) {
      console.log("company ad create error:", error);
      Alert.alert("Could not list ad", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setSubmittingCompany(false);
    }
  }, [companyForm, loadScreenData, submittingCompany]);

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

  const Field = useCallback(({
    label,
    value,
    onChangeText,
    placeholder,
    numeric,
    multiline,
  }: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    placeholder?: string;
    numeric?: boolean;
    multiline?: boolean;
  }) => (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || label}
        placeholderTextColor={colors.mutedText}
        keyboardType={numeric ? "numeric" : "default"}
        multiline={multiline}
        style={[
          styles.input,
          multiline && styles.textArea,
          { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      />
    </View>
  ), [colors.border, colors.mutedText, colors.surface, colors.text]);

  const renderProfileSection = () => (
    <View style={[styles.detailPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.panelHeader}>
        <View>
          <Text style={[styles.detailTitle, { color: colors.text }]}>Feature your profile</Text>
          <Text style={[styles.detailBody, { color: colors.mutedText }]}>
            Add your creator rate-card, pay INR {FEATURE_AMOUNT} one time, and get listed for brands.
          </Text>
        </View>
        <Icon name="sparkles-outline" size={22} color={colors.primary} />
      </View>

      <View style={[styles.featureStatusBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Icon name={isFeatureActive ? "checkmark-circle-outline" : "card-outline"} size={19} color={colors.primary} />
        <Text style={[styles.featureStatusText, { color: colors.text }]}>
          {isFeatureActive ? `Active${featureExpiryLabel ? ` till ${featureExpiryLabel}` : ""}` : "One-time listing payment pending"}
        </Text>
      </View>

      <Field label="Aline2 username" value={profileForm.aline2Username} onChangeText={(value) => updateProfileForm("aline2Username", value)} placeholder="@username" />
      <Field label="Location" value={profileForm.location} onChangeText={(value) => updateProfileForm("location", value)} placeholder="City, state" />
      <Field label="Followers" value={profileForm.followerCount} onChangeText={(value) => updateProfileForm("followerCount", value)} numeric />

      <View style={styles.twoCol}>
        <View style={styles.col}><Field label="Story price" value={profileForm.storyPrice} onChangeText={(value) => updateProfileForm("storyPrice", value)} numeric /></View>
        <View style={styles.col}><Field label="Story hours" value={profileForm.storyDurationHours} onChangeText={(value) => updateProfileForm("storyDurationHours", value)} numeric /></View>
      </View>
      <View style={styles.twoCol}>
        <View style={styles.col}><Field label="Post price" value={profileForm.photoPrice} onChangeText={(value) => updateProfileForm("photoPrice", value)} numeric /></View>
        <View style={styles.col}><Field label="Post days" value={profileForm.photoDurationDays} onChangeText={(value) => updateProfileForm("photoDurationDays", value)} numeric /></View>
      </View>
      <View style={styles.twoCol}>
        <View style={styles.col}><Field label="Reel price" value={profileForm.videoPricePerMinute} onChangeText={(value) => updateProfileForm("videoPricePerMinute", value)} numeric /></View>
        <View style={styles.col}><Field label="Reel seconds" value={profileForm.videoSampleDurationMinutes} onChangeText={(value) => updateProfileForm("videoSampleDurationMinutes", value)} numeric /></View>
      </View>
      <Field label="Promotion notes" value={profileForm.promotionNotes} onChangeText={(value) => updateProfileForm("promotionNotes", value)} multiline placeholder="Audience niche, languages, content rules..." />

      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={activateFeaturedProfile} disabled={submittingProfile || loading}>
        {submittingProfile ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="card-outline" size={18} color="#fff" />}
        <Text style={styles.primaryButtonText}>{isFeatureActive ? "Update and pay INR 100" : "Pay INR 100 and list"}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderCompanySection = () => (
    <View style={[styles.detailPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.detailTitle, { color: colors.text }]}>Drop an Ad</Text>
      <Text style={[styles.detailBody, { color: colors.mutedText }]}>
        Brands can post product or service promotion requirements for creators to discover.
      </Text>

      <Field label="Company name" value={companyForm.companyName} onChangeText={(value) => updateCompanyForm("companyName", value)} />
      <Field label="Content type" value={companyForm.contentType} onChangeText={(value) => updateCompanyForm("contentType", value)} placeholder="Beauty, food, app install, local business..." />
      <Field label="Minimum followers criteria" value={companyForm.minimumFollowersCriteria} onChangeText={(value) => updateCompanyForm("minimumFollowersCriteria", value)} numeric />

      <Text style={[styles.fieldLabel, { color: colors.mutedText, marginTop: 12 }]}>Content format</Text>
      <View style={styles.segmentRow}>
        {["template", "video"].map((type) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.segment,
              { borderColor: colors.border, backgroundColor: companyForm.contentFormat === type ? colors.primary : colors.surface },
            ]}
            onPress={() => updateCompanyForm("contentFormat", type)}
          >
            <Text style={[styles.segmentText, { color: companyForm.contentFormat === type ? "#fff" : colors.text }]}>{type}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.fieldLabel, { color: colors.mutedText, marginTop: 12 }]}>Preferred placement</Text>
      <View style={styles.segmentRow}>
        {["story", "post", "reel"].map((type) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.segment,
              { borderColor: colors.border, backgroundColor: companyForm.preferredPlacement === type ? colors.primary : colors.surface },
            ]}
            onPress={() => updateCompanyForm("preferredPlacement", type)}
          >
            <Text style={[styles.segmentText, { color: companyForm.preferredPlacement === type ? "#fff" : colors.text }]}>{type}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Field label="Offered price" value={companyForm.offeredPrice} onChangeText={(value) => updateCompanyForm("offeredPrice", value)} numeric />
      <Field label="Product or service" value={companyForm.productOrService} onChangeText={(value) => updateCompanyForm("productOrService", value)} />
      <Field label="Campaign goal" value={companyForm.campaignGoal} onChangeText={(value) => updateCompanyForm("campaignGoal", value)} placeholder="Launch, review, awareness..." />
      <Field label="Location" value={companyForm.location} onChangeText={(value) => updateCompanyForm("location", value)} />
      <Field label="Target audience" value={companyForm.targetAudience} onChangeText={(value) => updateCompanyForm("targetAudience", value)} />

      <View style={styles.segmentRow}>
        {["mixed", "story", "photo", "video"].map((type) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.segment,
              { borderColor: colors.border, backgroundColor: companyForm.mediaType === type ? colors.primary : colors.surface },
            ]}
            onPress={() => updateCompanyForm("mediaType", type)}
          >
            <Text style={[styles.segmentText, { color: companyForm.mediaType === type ? "#fff" : colors.text }]}>{type}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.twoCol}>
        <View style={styles.col}><Field label="Story budget" value={companyForm.storyBudget} onChangeText={(value) => updateCompanyForm("storyBudget", value)} numeric /></View>
        <View style={styles.col}><Field label="Photo budget" value={companyForm.photoBudget} onChangeText={(value) => updateCompanyForm("photoBudget", value)} numeric /></View>
      </View>
      <View style={styles.twoCol}>
        <View style={styles.col}><Field label="Video / min" value={companyForm.videoBudgetPerMinute} onChangeText={(value) => updateCompanyForm("videoBudgetPerMinute", value)} numeric /></View>
        <View style={styles.col}><Field label="Video / hour" value={companyForm.videoBudgetPerHour} onChangeText={(value) => updateCompanyForm("videoBudgetPerHour", value)} numeric /></View>
      </View>
      <View style={styles.twoCol}>
        <View style={styles.col}><Field label="Video minutes" value={companyForm.expectedVideoMinutes} onChangeText={(value) => updateCompanyForm("expectedVideoMinutes", value)} numeric /></View>
        <View style={styles.col}><Field label="Campaign days" value={companyForm.campaignDurationDays} onChangeText={(value) => updateCompanyForm("campaignDurationDays", value)} numeric /></View>
      </View>
      <Field label="Contact phone" value={companyForm.contactPhone} onChangeText={(value) => updateCompanyForm("contactPhone", value)} />
      <Field label="Contact email" value={companyForm.contactEmail} onChangeText={(value) => updateCompanyForm("contactEmail", value)} />
      <Field label="Ad brief" value={companyForm.description} onChangeText={(value) => updateCompanyForm("description", value)} multiline placeholder="Creative direction, deliverables, do/don't..." />

      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={createCompanyAd} disabled={submittingCompany || loading}>
        {submittingCompany ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="megaphone-outline" size={18} color="#fff" />}
        <Text style={styles.primaryButtonText}>List company ad</Text>
      </TouchableOpacity>
    </View>
  );

  const renderReferralSection = () => (
    <View style={[styles.detailPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.detailTitle, { color: colors.text }]}>Referral rewards</Text>
      <Text style={[styles.detailBody, { color: colors.mutedText }]}>
        Invite friends to Aline2. When they join and become active, rewards will be tracked in your wallet.
      </Text>
      <View style={[styles.referralBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.referralCopy}>
          <Text style={[styles.referralLabel, { color: colors.mutedText }]}>Your code</Text>
          <Text style={[styles.referralCode, { color: colors.text }]} numberOfLines={1}>{referralCode || "Not available"}</Text>
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

  const renderActiveSection = () => {
    if (activeSection === "listedProfile" || activeSection === "listedAds") return null;
    if (activeSection === "dropAd") return renderCompanySection();
    if (activeSection === "searchProfile") return renderProfileSection();
    if (activeSection === "becomeSeller") {
      return (
        <TouchableOpacity
          style={[styles.sellerLink, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 18 }]}
          onPress={() => navigation.navigate(hasSellerAccount ? "SellerDashboardScreen" : "SellerRegistration")}
        >
          <Icon name={hasSellerAccount ? "briefcase-outline" : "storefront-outline"} size={20} color={colors.primary} />
          <Text style={[styles.sellerLinkText, { color: colors.text }]}>
            {hasSellerAccount ? "Open seller dashboard" : "Become a seller"}
          </Text>
        </TouchableOpacity>
      );
    }
    if (activeSection === "howToEarn") return renderReferralSection();
    return renderProfileSection();
  };
  const showProfileList = activeSection === "listedProfile" || activeSection === "searchProfile";
  const showAdsList = activeSection === "listedAds" || activeSection === "dropAd";

  return (
    <View style={styles.screen}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={colors.background} />
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={23} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Promotions</Text>
          <View style={styles.headerButton} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: APP_BOTTOM_DOCK_BASE_HEIGHT + Math.max(insets.bottom, 10) + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.heroIcon, { backgroundColor: `${colors.primary}18` }]}>
              <Icon name="cash-outline" size={25} color={colors.primary} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={[styles.heroTitle, { color: colors.text }]}>Earn from brand promotions</Text>
              <Text style={[styles.heroText, { color: colors.mutedText }]}>
                Creators list their rates. Companies post ad budgets. Both lists stay discoverable here.
              </Text>
            </View>
          </View>

          <View style={styles.actionList}>
            {[
              { key: "listedProfile", icon: "list-outline", title: "Listed Profile", sub: "View creators with promotion pricing" },
              { key: "dropAd", icon: "megaphone-outline", title: "Drop an Ad", sub: "Create a campaign for creators" },
              { key: "becomeSeller", icon: "storefront-outline", title: "Become a Seller", sub: "Set post, story, and reel prices" },
            ].map((item) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.actionRow, { backgroundColor: colors.card, borderColor: activeSection === item.key ? colors.primary : colors.border }]}
                onPress={() => setActiveSection(item.key as EarnSection)}
              >
                <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}14` }]}>
                  <Icon name={item.icon} size={20} color={colors.primary} />
                </View>
                <View style={styles.actionCopy}>
                  <Text style={[styles.actionTitle, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[styles.actionSubtitle, { color: colors.mutedText }]}>{item.sub}</Text>
                </View>
                <Icon name="chevron-forward" size={18} color={colors.mutedText} />
              </TouchableOpacity>
            ))}
          </View>

          {renderActiveSection()}

          {showProfileList ? (
          <View style={styles.listSection}>
            <Text style={[styles.listTitle, { color: colors.text }]}>Featured profile list</Text>
            {activeSection === "searchProfile" ? (
              <Field
                label="Search profile"
                value={profileSearchQuery}
                onChangeText={setProfileSearchQuery}
                placeholder="Username, location, creator name"
              />
            ) : null}
            {filteredFeaturedProfiles.length ? filteredFeaturedProfiles.map((item) => (
              <TouchableOpacity
                key={item._id}
                style={[styles.marketCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => navigation.navigate("ProfilePreviewScreen", { userId: item.userId })}
              >
                <View style={styles.marketHeader}>
                  <View>
                    <Text style={[styles.marketTitle, { color: colors.text }]}>{item.name || item.aline2Username || "Aline2 creator"}</Text>
                    <Text style={[styles.marketMeta, { color: colors.mutedText }]}>
                      @{item.aline2Username || item.username || "creator"} - {item.location || "Location not set"}
                    </Text>
                  </View>
                  <Icon name="star" size={18} color={colors.primary} />
                </View>
                <Text style={[styles.rateLine, { color: colors.text }]}>
                  {Number(item.followerCount || 0).toLocaleString()} followers
                </Text>
                <Text style={[styles.rateLine, { color: colors.mutedText }]}>
                  Story INR {item.storyPromotion?.price || 0}/{item.storyPromotion?.durationHours || 24}h - Post INR {item.postPromotion?.price || item.photoPromotion?.price || 0}
                </Text>
                <Text style={[styles.rateLine, { color: colors.mutedText }]}>
                  Reel INR {item.reelPromotion?.price || item.videoPromotion?.pricePerMinute || 0}
                </Text>
              </TouchableOpacity>
            )) : (
              <Text style={[styles.emptyText, { color: colors.mutedText }]}>No featured creators yet.</Text>
            )}
          </View>
          ) : null}

          {showAdsList ? (
          <View style={styles.listSection}>
            <Text style={[styles.listTitle, { color: colors.text }]}>Featured ads list</Text>
            {companyAds.length ? companyAds.map((item) => (
              <TouchableOpacity
                key={item._id}
                style={[styles.marketCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => navigation.navigate("CompanyAdPreviewScreen", { companyAdId: item._id, ad: item })}
              >
                <View style={styles.marketHeader}>
                  <View style={styles.marketCopy}>
                    <Text style={[styles.marketTitle, { color: colors.text }]}>{item.productOrService}</Text>
                    <Text style={[styles.marketMeta, { color: colors.mutedText }]}>{item.companyName} - {item.location || "Any location"}</Text>
                  </View>
                  <Icon name="open-outline" size={18} color={colors.primary} />
                </View>
                <Text style={[styles.rateLine, { color: colors.mutedText }]}>
                  {item.contentType || "Campaign"} - {item.minimumFollowers || 0}+ followers - {item.contentFormat || "template"}
                </Text>
                <Text style={[styles.rateLine, { color: colors.mutedText }]}>
                  {item.preferredPlacement || "story"} - Offered INR {item.offeredPrice || item.storyBudget || item.photoBudget || item.videoBudgetPerMinute || 0}
                </Text>
              </TouchableOpacity>
            )) : (
              <Text style={[styles.emptyText, { color: colors.mutedText }]}>No company ad requirements yet.</Text>
            )}
          </View>
          ) : null}

          <TouchableOpacity
            style={[styles.sellerLink, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => navigation.navigate(hasSellerAccount ? "SellerDashboardScreen" : "SellerRegistration")}
          >
            <Icon name={hasSellerAccount ? "briefcase-outline" : "storefront-outline"} size={20} color={colors.primary} />
            <Text style={[styles.sellerLinkText, { color: colors.text }]}>
              {hasSellerAccount ? "Open seller dashboard" : "Become a seller"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
      <AppBottomDock navigation={navigation} />
    </View>
  );
}

export default HowToEarnScreen;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1 },
  scroll: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  content: { padding: 16, paddingBottom: 28 },
  hero: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  heroIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: 12 },
  heroCopy: { flex: 1 },
  heroTitle: { fontSize: 18, fontWeight: "900" },
  heroText: { marginTop: 4, fontSize: 13, lineHeight: 19 },
  actionList: { marginBottom: 16 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  actionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: 12 },
  actionCopy: { flex: 1, paddingRight: 10 },
  actionTitle: { fontSize: 15, fontWeight: "800" },
  actionSubtitle: { marginTop: 2, fontSize: 12, lineHeight: 17 },
  detailPanel: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 14, marginBottom: 18 },
  panelHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  detailTitle: { fontSize: 16, fontWeight: "800" },
  detailBody: { marginTop: 6, fontSize: 13, lineHeight: 19 },
  featureStatusBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
    marginBottom: 10,
    gap: 8,
  },
  featureStatusText: { flex: 1, fontSize: 13, fontWeight: "800" },
  field: { marginTop: 10 },
  fieldLabel: { fontSize: 12, fontWeight: "800", marginBottom: 5 },
  input: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, paddingHorizontal: 12, fontSize: 14 },
  textArea: { minHeight: 88, paddingTop: 11, textAlignVertical: "top" },
  twoCol: { flexDirection: "row", gap: 10 },
  col: { flex: 1 },
  segmentRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  segment: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  segmentText: { fontSize: 12, fontWeight: "900", textTransform: "capitalize" },
  primaryButton: {
    minHeight: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  primaryButtonText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  referralBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
    marginBottom: 12,
  },
  referralCopy: { flex: 1, paddingRight: 10 },
  referralLabel: { fontSize: 12, fontWeight: "700" },
  referralCode: { marginTop: 3, fontSize: 18, fontWeight: "900" },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  listSection: { marginBottom: 18 },
  listTitle: { fontSize: 16, fontWeight: "900", marginBottom: 10 },
  marketCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 13, marginBottom: 10 },
  marketHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  marketCopy: { flex: 1 },
  marketTitle: { fontSize: 15, fontWeight: "900" },
  marketMeta: { marginTop: 3, fontSize: 12, lineHeight: 17 },
  rateLine: { marginTop: 7, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  emptyText: { fontSize: 13, lineHeight: 19 },
  sellerLink: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sellerLinkText: { fontSize: 14, fontWeight: "900" },
});
