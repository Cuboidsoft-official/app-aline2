import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Alert } from "../utils/appAlert";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";

import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { formatPrimaryServicePrice, getServicePricingOptions } from "../utils/servicePricing";
import { shareContentLink } from "../utils/shareLinks";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { appConfig } from "../config/env";
import { useAppTheme } from "../theme/AppThemeContext";

const PRIMARY = "#7B4DFF";
const PROFILE_BG = "#0A0F1C";
const PROFILE_PANEL = "#101827";
const PROFILE_PANEL_ALT = "#151F34";
const PROFILE_BORDER = "rgba(255,255,255,0.08)";
const PROFILE_MUTED = "#9AA6C1";

type SellerProfile = {
  _id?: string;
  user?: string | { _id?: string };
  sellerName?: string;
  profilePic?: string;
  bio?: string;
  clinicLink?: string;
  media?: string[];
  availabilityStatus?: boolean;
};

type SellerService = {
  _id?: string;
  serviceName?: string;
  pricePerMin?: number;
  pricePerHour?: number;
  pricePerMsg?: number;
  pricePerSession?: number;
  packagePrice?: number;
  pricingOptions?: Array<{
    model?: string;
    label?: string;
    amount?: number;
    isDefault?: boolean;
  }>;
  currency?: string;
  sessionDurationMinutes?: number;
};

const SellerDetailsScreen = ({ route, navigation }: any) => {
  const { colors } = useAppTheme();
  const { sellerId } = route.params;

  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [services, setServices] = useState<SellerService[]>([]);
  const [media, setMedia] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchSeller = useCallback(async () => {
    try {
      const res = await API.get(`/seller/${sellerId}`);
      setSeller(res.data.seller);
      setMedia(res.data.seller?.media || []);
      setErrorMessage("");
    } catch (err) {
      console.log("Seller error:", err);
      setSeller(null);
      setMedia([]);
      setErrorMessage(getReadableApiErrorMessage(err, "Failed to load seller profile."));
    }
  }, [sellerId]);

  const fetchServices = useCallback(async () => {
    try {
      const res = await API.get(`/service/seller/${sellerId}`);
      setServices(res.data.services || []);
    } catch (err) {
      console.log("Service error:", err);
      setServices([]);
      setErrorMessage((current) => current || getReadableApiErrorMessage(err, "Failed to load seller services."));
    }
  }, [sellerId]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        await Promise.all([fetchSeller(), fetchServices()]);
      } finally {
        setLoading(false);
      }
    };

    load().catch(() => {});
  }, [fetchSeller, fetchServices]);

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        try {
          setLoading(true);
          await Promise.all([fetchSeller(), fetchServices()]);
        } finally {
          setLoading(false);
        }
      };

      load().catch(() => {});
    }, [fetchSeller, fetchServices]),
  );

  const resolveSellerUserId = () => {
    const rawUserId = seller?.user;

    if (!rawUserId) {
      return null;
    }

    return typeof rawUserId === "string" ? rawUserId : rawUserId._id || null;
  };

  const sellerUserId = resolveSellerUserId();
  const canOpenSellerChat = Boolean(sellerUserId) && seller?.availabilityStatus !== false;
  const availabilityLabel = seller?.availabilityStatus === false ? "Away" : "Available";
  const profileSupportLine = seller?.availabilityStatus === false
    ? "Currently paused for new chat requests and fresh appointment traffic."
    : "Visible to users for appointment requests and profile discovery.";

  const openSellerChat = (service?: SellerService) => {
    if (!canOpenSellerChat || !sellerUserId) {
      return;
    }

    navigation.navigate("SellerChatScreen", {
      sellerId,
      sellerUserId,
      serviceId: service?._id,
      serviceName: service?.serviceName,
    });
  };

  const shareSellerProfile = async () => {
    try {
      const sellerProfileSlug =
        typeof seller?.user === "string"
          ? seller.user
          : seller?.user?._id;
      const shareBase = (appConfig.publicShareBaseUrl || "https://aline2.com").replace(/\/+$/, "");
      const profileUrl = sellerProfileSlug ? `${shareBase}/profile/${sellerProfileSlug}` : shareBase;

      await shareContentLink({
        originalUrl: profileUrl,
        title: seller?.sellerName || "Aline2 Seller",
        description: seller?.bio || "",
        fallbackMessage: seller?.sellerName
          ? `Check out ${seller.sellerName} on Aline2\n\n${profileUrl}`
          : "Check out this seller on Aline2",
      });
    } catch (error) {
      console.log("seller share error:", error);
    }
  };

  const blockSeller = async () => {
    if (!sellerUserId) {
      return;
    }

    Alert.alert(
      "Block seller",
      `Block ${seller?.sellerName || "this seller"}? You can unblock them later from Settings.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              await API.post(`/user/block/${sellerUserId}`, {});
              Alert.alert("Blocked", "This seller has been blocked.");
              navigation.goBack();
            } catch (error) {
              console.log("block seller error:", error);
              Alert.alert("Unable to block seller", getReadableApiErrorMessage(error, "Please try again."));
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: PROFILE_BG }]} edges={["top"]}>
        <View style={styles.loaderWrap}>
          <Icon name="storefront-outline" size={38} color={PROFILE_MUTED} />
          <Text style={styles.loaderText}>Loading seller details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!seller) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: PROFILE_BG }]} edges={["top"]}>
        <View style={styles.loaderWrap}>
          <Icon name="alert-circle-outline" size={38} color={PROFILE_MUTED} />
          <Text style={styles.loaderText}>Seller unavailable</Text>
          <Text style={styles.inlineNotice}>
            {errorMessage || "This seller profile could not be loaded right now."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: PROFILE_BG }]} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerEyebrow}>Aline2 Seller</Text>
          <Text style={styles.headerTitle}>Seller Profile</Text>
        </View>

        <TouchableOpacity style={styles.headerButton} onPress={shareSellerProfile}>
          <Icon name="share-social-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.avatarRing}>
              <Image
                source={{
                  uri: seller?.profilePic || DEFAULT_AVATAR_URL,
                }}
                style={styles.avatar}
              />
            </View>

            <TouchableOpacity
              style={styles.heroMiniAction}
              onPress={shareSellerProfile}
              activeOpacity={0.85}
            >
              <Icon name="paper-plane-outline" size={18} color="#F4F1FF" />
            </TouchableOpacity>
          </View>

          <Text style={styles.username}>
            {seller?.sellerName || "Loading..."}
          </Text>

          <View style={styles.heroBadgeRow}>
            <View style={[styles.heroBadge, seller?.availabilityStatus === false ? styles.heroBadgeMuted : styles.heroBadgeActive]}>
              <Icon
                name={seller?.availabilityStatus === false ? "moon-outline" : "flash-outline"}
                size={14}
                color={seller?.availabilityStatus === false ? "#F5D995" : "#A7F3D0"}
              />
              <Text style={styles.heroBadgeText}>{availabilityLabel}</Text>
            </View>

            <View style={styles.heroStatChip}>
              <Text style={styles.heroStatValue}>{services.length}</Text>
              <Text style={styles.heroStatLabel}>Services</Text>
            </View>

            <View style={styles.heroStatChip}>
              <Text style={styles.heroStatValue}>{media.length}</Text>
              <Text style={styles.heroStatLabel}>Media</Text>
            </View>
          </View>

          <Text style={styles.bio}>
            {seller?.bio || "No description available"}
          </Text>
          <Text style={styles.heroSupportText}>{profileSupportLine}</Text>
        </View>

        <View style={styles.actions}>
          <Action
            icon="calendar-outline"
            title="Request"
            onPress={() => openSellerChat()}
            disabled={!canOpenSellerChat}
            colors={colors}
          />
          <Action
            icon="chatbubble-outline"
            title="Chat"
            onPress={() => openSellerChat()}
            disabled={!canOpenSellerChat}
            colors={colors}
          />
          <Action
            icon="share-social-outline"
            title="Share"
            onPress={shareSellerProfile}
            colors={colors}
          />
          <Action
            icon="close-circle-outline"
            title="Block"
            onPress={blockSeller}
            disabled={!sellerUserId}
            colors={colors}
          />
        </View>

        {!sellerUserId ? (
          <Text style={styles.inlineNotice}>This seller profile is missing its linked account, so chat and block actions are temporarily unavailable.</Text>
        ) : seller?.availabilityStatus === false ? (
          <Text style={styles.inlineNotice}>Seller availability is off right now, so request and chat actions are locked until they are back.</Text>
        ) : null}

        <View style={styles.sectionShell}>
          <Text style={styles.sectionTitle}>Services</Text>

          {services.length > 0 ? (
            services.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.serviceCard}
                activeOpacity={0.92}
                onPress={() => openSellerChat(item)}
              >
                <View style={styles.serviceCopy}>
                  <Text style={styles.serviceName}>
                    {item.serviceName}
                  </Text>

                  <Text style={styles.servicePrice}>
                    {formatPrimaryServicePrice(item)}
                  </Text>

                  {!!getServicePricingOptions(item).slice(1, 3).length && (
                    <Text style={styles.serviceMeta}>
                      {getServicePricingOptions(item)
                        .slice(1, 3)
                        .map((option: { label?: string }) => option.label)
                        .join(" | ")}
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.bookBtn, !canOpenSellerChat ? styles.bookBtnDisabled : null]}
                  onPress={() => openSellerChat(item)}
                  disabled={!canOpenSellerChat}
                >
                  <Text style={styles.bookBtnText}>Request</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.emptyLabel}>No services available</Text>
          )}
        </View>

        <View style={styles.sectionShell}>
          <Text style={styles.sectionTitle}>Media</Text>

          {media.length > 0 ? (
            <View style={styles.mediaRow}>
              {media.slice(0, 6).map((item, index) => (
                <Image
                  key={index}
                  source={{ uri: item }}
                  style={styles.mediaBox}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.emptyLabel}>No media files</Text>
          )}
        </View>

        <View style={styles.optionBox}>
          <Option icon="notifications-outline" title="Notifications" onPress={() => navigation.navigate("NotificationSettingsScreen")} colors={colors} />
          <Option icon="calendar-outline" title={canOpenSellerChat ? "Open booking chat" : "Booking chat locked"} onPress={() => openSellerChat()} colors={colors} />
          <Option icon="share-social-outline" title="Share seller profile" onPress={shareSellerProfile} colors={colors} />
        </View>

        <TouchableOpacity
          style={styles.blockButton}
          onPress={blockSeller}
        >
          <Icon name="close-circle-outline" size={20} color="#FF7C8E" />
          <Text style={styles.blockText}>
            Block {seller?.sellerName || "Seller"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

export default SellerDetailsScreen;

const Action = ({
  icon,
  title,
  onPress,
  disabled = false,
}: {
  icon: string;
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  colors: Record<string, string>;
}) => (
  <TouchableOpacity style={[styles.actionItem, disabled ? styles.actionItemDisabled : null]} onPress={onPress} disabled={disabled}>
    <View style={[styles.actionIcon, disabled ? styles.actionIconDisabled : null]}>
      <Icon name={icon} size={22} color={disabled ? PROFILE_MUTED : "#F8F5FF"} />
    </View>
    <Text style={styles.actionText}>{title}</Text>
  </TouchableOpacity>
);

const Option = ({
  icon,
  title,
  onPress,
}: {
  icon: string;
  title: string;
  onPress?: () => void;
  colors: Record<string, string>;
}) => (
  <TouchableOpacity style={styles.optionRow} onPress={onPress}>
    <Icon name={icon} size={22} color={PROFILE_MUTED} style={{ marginRight: 15 }} />
    <Text style={styles.optionText}>{title}</Text>
    <Icon name="chevron-forward" color={PROFILE_MUTED} />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 28,
  },
  loaderWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  loaderText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "600",
    color: "#F7FAFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: PROFILE_BG,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PROFILE_PANEL_ALT,
    borderWidth: 1,
    borderColor: PROFILE_BORDER,
  },
  headerTitleWrap: {
    alignItems: "center",
  },
  headerEyebrow: {
    color: "#BFA7FF",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  headerTitle: {
    marginTop: 3,
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 30,
    padding: 22,
    backgroundColor: PROFILE_PANEL,
    borderWidth: 1,
    borderColor: PROFILE_BORDER,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  avatarRing: {
    padding: 5,
    borderRadius: 999,
    backgroundColor: "rgba(123, 77, 255, 0.2)",
  },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
  },
  heroMiniAction: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PROFILE_PANEL_ALT,
    borderWidth: 1,
    borderColor: PROFILE_BORDER,
  },
  username: {
    marginTop: 18,
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  heroBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 14,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
    marginBottom: 10,
  },
  heroBadgeActive: {
    backgroundColor: "rgba(34,197,94,0.14)",
  },
  heroBadgeMuted: {
    backgroundColor: "rgba(245,217,149,0.12)",
  },
  heroBadgeText: {
    marginLeft: 6,
    color: "#F5F8FF",
    fontSize: 12.5,
    fontWeight: "700",
  },
  heroStatChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
    marginBottom: 10,
    backgroundColor: PROFILE_PANEL_ALT,
    borderWidth: 1,
    borderColor: PROFILE_BORDER,
    flexDirection: "row",
    alignItems: "center",
  },
  heroStatValue: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  heroStatLabel: {
    marginLeft: 6,
    color: PROFILE_MUTED,
    fontSize: 12,
    fontWeight: "600",
  },
  bio: {
    marginTop: 6,
    color: "#F4F7FF",
    fontSize: 14,
    lineHeight: 21,
  },
  heroSupportText: {
    marginTop: 10,
    color: PROFILE_MUTED,
    fontSize: 12.5,
    lineHeight: 19,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 16,
  },
  actionItem: {
    width: "48.3%",
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 14,
    marginBottom: 12,
    backgroundColor: PROFILE_PANEL,
    borderWidth: 1,
    borderColor: PROFILE_BORDER,
  },
  actionItemDisabled: {
    opacity: 0.45,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: PRIMARY,
  },
  actionIconDisabled: {
    backgroundColor: PROFILE_PANEL_ALT,
  },
  actionText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "700",
    color: "#F8FAFF",
  },
  inlineNotice: {
    marginHorizontal: 18,
    marginTop: 4,
    lineHeight: 19,
    fontSize: 12.5,
    color: PROFILE_MUTED,
  },
  sectionShell: {
    marginTop: 20,
    marginHorizontal: 16,
    borderRadius: 26,
    padding: 16,
    backgroundColor: PROFILE_PANEL,
    borderWidth: 1,
    borderColor: PROFILE_BORDER,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 14,
  },
  serviceCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
    backgroundColor: PROFILE_PANEL_ALT,
    borderWidth: 1,
    borderColor: PROFILE_BORDER,
  },
  serviceCopy: {
    flex: 1,
    paddingRight: 10,
  },
  serviceName: {
    fontWeight: "700",
    color: "#F8FAFF",
    fontSize: 14,
  },
  servicePrice: {
    color: PRIMARY,
    marginTop: 6,
    fontSize: 13.5,
    fontWeight: "700",
  },
  serviceMeta: {
    marginTop: 6,
    fontSize: 12,
    color: PROFILE_MUTED,
    lineHeight: 18,
  },
  bookBtn: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  bookBtnDisabled: {
    opacity: 0.45,
  },
  bookBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
  mediaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  mediaBox: {
    width: "48.5%",
    height: 132,
    borderRadius: 18,
    marginBottom: 10,
    backgroundColor: PROFILE_PANEL_ALT,
  },
  optionBox: {
    marginTop: 20,
    marginHorizontal: 16,
    borderRadius: 24,
    backgroundColor: PROFILE_PANEL,
    borderWidth: 1,
    borderColor: PROFILE_BORDER,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: PROFILE_BORDER,
  },
  optionText: {
    flex: 1,
    color: "#F7FAFF",
    fontSize: 14,
  },
  blockButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 18,
    padding: 15,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,124,142,0.28)",
    backgroundColor: "rgba(255,124,142,0.08)",
  },
  blockText: {
    marginLeft: 8,
    fontWeight: "700",
    color: "#FFB8C3",
  },
  emptyLabel: {
    fontSize: 14,
    lineHeight: 20,
    color: PROFILE_MUTED,
  },
});
