import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView
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

  // ================= API =================

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
    }, [fetchSeller, fetchServices])
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

  const openSellerChat = (service?: SellerService) => {
    if (!canOpenSellerChat || !sellerUserId) {
      return;
    }

    navigation.navigate("SellerChatScreen", {
      sellerId,
      sellerUserId,
      serviceId: service?._id,
      serviceName: service?.serviceName
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
          }
        }
      ]
    );
  };

  // ================= UI =================

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
        <View style={styles.loaderWrap}>
          <Icon name="storefront-outline" size={38} color={colors.mutedText} />
          <Text style={[styles.loaderText, { color: colors.text }]}>Loading seller details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!seller) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
        <View style={styles.loaderWrap}>
          <Icon name="alert-circle-outline" size={38} color={colors.mutedText} />
          <Text style={[styles.loaderText, { color: colors.text }]}>Seller unavailable</Text>
          <Text style={[styles.inlineNotice, { color: colors.mutedText, textAlign: "center" }]}>
            {errorMessage || "This seller profile could not be loaded right now."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>

      {/* HEADER */}
      <View style={[styles.header, { backgroundColor: PRIMARY }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Seller Details</Text>

        <TouchableOpacity>
          <Icon name="ellipsis-vertical" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* PROFILE */}
        <View style={styles.profileSection}>

          <View style={[styles.avatarRing, { backgroundColor: colors.surface }]}>
            <Image
              source={{
                uri:
                  seller?.profilePic ||
                  DEFAULT_AVATAR_URL
              }}
              style={styles.avatar}
            />
          </View>

          <Text style={[styles.username, { color: colors.text }]}>
            {seller?.sellerName || "Loading..."}
          </Text>

          <Text style={[styles.bio, { color: colors.mutedText }]}>
            {seller?.bio || "No description available"}
          </Text>

        </View>

        {/* ACTION BUTTONS */}
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
          <Text style={[styles.inlineNotice, { color: colors.mutedText }]}>This seller profile is missing its linked account, so chat and block actions are temporarily unavailable.</Text>
        ) : seller?.availabilityStatus === false ? (
          <Text style={[styles.inlineNotice, { color: colors.mutedText }]}>Seller availability off hai, isliye chat aur request temporarily locked hain.</Text>
        ) : null}

        {/* SERVICES */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Services</Text>

          {services.length > 0 ? (

            services.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.serviceCard, { backgroundColor: colors.card, shadowColor: colors.border }]}
                activeOpacity={0.92}
                onPress={() => openSellerChat(item)}
              >

                <View>
                  <Text style={[styles.serviceName, { color: colors.text }]}>
                    {item.serviceName}
                  </Text>

                  <Text style={styles.servicePrice}>
                    {formatPrimaryServicePrice(item)}
                  </Text>

                  {!!getServicePricingOptions(item).slice(1, 3).length && (
                    <Text style={[styles.serviceMeta, { color: colors.mutedText }]}>
                      {getServicePricingOptions(item)
                        .slice(1, 3)
                        .map((option: { label?: string }) => option.label)
                        .join(" • ")}
                    </Text>
                  )}
                </View>

                <TouchableOpacity style={[styles.bookBtn, !canOpenSellerChat ? styles.bookBtnDisabled : null]} onPress={() => openSellerChat(item)} disabled={!canOpenSellerChat}>
                  <Text style={{ color: "#fff" }}>Request</Text>
                </TouchableOpacity>

              </TouchableOpacity>
            ))

          ) : (
            <Text style={[styles.emptyLabel, { color: colors.mutedText }]}>No services available</Text>
          )}

        </View>

        {/* MEDIA */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Media</Text>

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
            <Text style={[styles.emptyLabel, { color: colors.mutedText }]}>No media files</Text>
          )}

        </View>

        {/* SETTINGS */}
        <View style={[styles.optionBox, { backgroundColor: colors.card }]}>
          <Option icon="notifications-outline" title="Notifications" onPress={() => navigation.navigate("NotificationSettingsScreen")} colors={colors} />
          <Option icon="calendar-outline" title={canOpenSellerChat ? "Open booking chat" : "Booking chat locked"} onPress={() => openSellerChat()} colors={colors} />
          <Option icon="share-social-outline" title="Share seller profile" onPress={shareSellerProfile} colors={colors} />
        </View>

        {/* BLOCK */}
        <TouchableOpacity
          style={[styles.blockButton, { borderColor: colors.danger }]}
          onPress={blockSeller}
        >
          <Icon name="close-circle-outline" size={20} color={colors.danger} />
          <Text style={[styles.blockText, { color: colors.danger }]}>
            Block {seller?.sellerName || "Seller"}
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
};

export default SellerDetailsScreen;





/* ================= COMPONENTS ================= */

const Action = ({
  icon,
  title,
  onPress,
  disabled = false,
  colors,
}: {
  icon: string;
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  colors: Record<string, string>;
}) => (
  <TouchableOpacity style={[styles.actionItem, disabled ? styles.actionItemDisabled : null]} onPress={onPress} disabled={disabled}>
    <View style={[styles.actionIcon, { backgroundColor: colors.card }]}>
      <Icon name={icon} size={24} color={PRIMARY} />
    </View>
    <Text style={[styles.actionText, { color: colors.text }]}>{title}</Text>
  </TouchableOpacity>
);

const Option = ({
  icon,
  title,
  onPress,
  colors,
}: {
  icon: string;
  title: string;
  onPress?: () => void;
  colors: Record<string, string>;
}) => (
  <TouchableOpacity style={[styles.optionRow, { borderColor: colors.border }]} onPress={onPress}>
    <Icon name={icon} size={22} color={colors.mutedText} style={{ marginRight: 15 }} />
    <Text style={{ flex: 1, color: colors.text }}>{title}</Text>
    <Icon name="chevron-forward" color={colors.mutedText} />
  </TouchableOpacity>
);





/* ================= STYLES ================= */

const styles = StyleSheet.create({

  container: {
    flex: 1,
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
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 15,
    backgroundColor: PRIMARY
  },

  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600"
  },

  profileSection: {
    alignItems: "center",
    marginTop: 25
  },

  avatarRing: {
    padding: 4,
    borderRadius: 70,
  },

  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55
  },

  username: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 12
  },

  bio: {
    marginTop: 6,
    textAlign: "center",
    paddingHorizontal: 30
  },

  actions: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 30
  },

  actionItem: {
    alignItems: "center"
  },

  actionIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    elevation: 3
  },

  actionText: {
    marginTop: 6,
    fontSize: 12
  },
  actionItemDisabled: {
    opacity: 0.45
  },

  section: {
    marginTop: 30,
    paddingHorizontal: 18
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10
  },

  serviceCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    alignItems: "center",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  serviceName: {
    fontWeight: "700"
  },

  servicePrice: {
    color: PRIMARY,
    marginTop: 4
  },

  serviceMeta: {
    marginTop: 4,
    fontSize: 12
  },

  bookBtn: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10
  },
  bookBtnDisabled: {
    opacity: 0.45,
  },

  mediaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },

  mediaBox: {
    width: 100,
    height: 100,
    borderRadius: 10,
    margin: 5
  },

  optionBox: {
    marginTop: 30,
    marginHorizontal: 18,
    borderRadius: 14
  },

  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },

  blockButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    margin: 20,
    padding: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ef4444"
  },

  blockText: {
    marginLeft: 8,
    fontWeight: "600"
  },
  inlineNotice: {
    marginHorizontal: 20,
    marginTop: 8,
    lineHeight: 18,
    fontSize: 12
  },
  emptyLabel: {
    fontSize: 14,
    lineHeight: 20,
  },

});
