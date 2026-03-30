import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Alert
} from "react-native";

import Icon from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API } from "../api/api";
import { formatPrimaryServicePrice, getServicePricingOptions } from "../utils/servicePricing";
import { shareContentLink } from "../utils/shareLinks";

const PRIMARY = "#7B4DFF";

type SellerProfile = {
  _id?: string;
  user?: string | { _id?: string };
  sellerName?: string;
  profilePic?: string;
  bio?: string;
  clinicLink?: string;
  media?: string[];
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

  const { sellerId } = route.params;

  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [services, setServices] = useState<SellerService[]>([]);
  const [media, setMedia] = useState<string[]>([]);

  // ================= API =================

  const fetchSeller = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("token");

      const res = await API.get(`/seller/${sellerId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSeller(res.data.seller);
      setMedia(res.data.seller?.media || []);

    } catch (err) {
      console.log("Seller error:", err);
    }
  }, [sellerId]);

  const fetchServices = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("token");

      const res = await API.get(`/service/seller/${sellerId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setServices(res.data.services || []);

    } catch (err) {
      console.log("Service error:", err);
    }
  }, [sellerId]);

  useEffect(() => {
    fetchSeller();
    fetchServices();
  }, [fetchSeller, fetchServices]);

  const resolveSellerUserId = () => {
    const rawUserId = seller?.user;

    if (!rawUserId) {
      return null;
    }

    return typeof rawUserId === "string" ? rawUserId : rawUserId._id || null;
  };

  const openSellerChat = (service?: SellerService) => {
    const sellerUserId = resolveSellerUserId();

    if (!sellerUserId) {
      Alert.alert("Unavailable", "This seller profile is missing its linked user account.");
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
      await shareContentLink({
        originalUrl: seller?.clinicLink,
        title: seller?.sellerName || "Aline2 Seller",
        description: seller?.bio || "",
        fallbackMessage: seller?.sellerName
          ? `Check out ${seller.sellerName} on Aline2`
          : "Check out this seller on Aline2",
      });
    } catch (error) {
      console.log("seller share error:", error);
    }
  };

  const openFeatureInfo = (title: string, description: string) => {
    navigation.navigate("FeatureInfoScreen", {
      title,
      description,
    });
  };

  const blockSeller = async () => {
    const sellerUserId = resolveSellerUserId();

    if (!sellerUserId) {
      Alert.alert("Unavailable", "This seller profile is missing its linked user account.");
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
              const token = await AsyncStorage.getItem("token");
              await API.post(`/user/block/${sellerUserId}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
              });
              Alert.alert("Blocked", "This seller has been blocked.");
              navigation.goBack();
            } catch (error) {
              console.log("block seller error:", error);
              Alert.alert("Unable to block seller", "Please try again.");
            }
          }
        }
      ]
    );
  };

  // ================= UI =================

  return (
    <View style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>
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

          <View style={styles.avatarRing}>
            <Image
              source={{
                uri:
                  seller?.profilePic ||
                  "https://cdn-icons-png.flaticon.com/512/149/149071.png"
              }}
              style={styles.avatar}
            />
          </View>

          <Text style={styles.username}>
            {seller?.sellerName || "Loading..."}
          </Text>

          <Text style={styles.bio}>
            {seller?.bio || "No description available"}
          </Text>

        </View>

        {/* ACTION BUTTONS */}
        <View style={styles.actions}>

          <Action
            icon="call-outline"
            title="Call"
            onPress={() => openFeatureInfo("Voice Call", "Voice calling is not available in the current backend yet.")}
          />
          <Action
            icon="videocam-outline"
            title="Video"
            onPress={() => openFeatureInfo("Video Call", "Video calling is not available in the current backend yet.")}
          />
          <Action
            icon="chatbubble-outline"
            title="Chat"
            onPress={() => openSellerChat()}
          />
          <Action
            icon="share-social-outline"
            title="Share"
            onPress={shareSellerProfile}
          />

        </View>

        {/* SERVICES */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Services</Text>

          {services.length > 0 ? (

            services.map((item, index) => (
              <TouchableOpacity key={index} style={styles.serviceCard} activeOpacity={0.92} onPress={() => openSellerChat(item)}>

                <View>
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
                        .join(" • ")}
                    </Text>
                  )}
                </View>

                <TouchableOpacity style={styles.bookBtn} onPress={() => openSellerChat(item)}>
                  <Text style={{ color: "#fff" }}>Request</Text>
                </TouchableOpacity>

              </TouchableOpacity>
            ))

          ) : (
            <Text style={{ color: "#999" }}>No services available</Text>
          )}

        </View>

        {/* MEDIA */}
        <View style={styles.section}>
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
            <Text style={{ color: "#999" }}>No media files</Text>
          )}

        </View>

        {/* SETTINGS */}
        <View style={styles.optionBox}>
          <Option icon="notifications-outline" title="Notifications" onPress={() => navigation.navigate("NotificationSettingsScreen")} />
          <Option icon="color-palette-outline" title="Chat Theme" onPress={() => openFeatureInfo("Chat Theme", "Custom seller chat themes are not available yet, but this setting is now routed correctly.")} />
          <Option icon="time-outline" title="Disappearing Messages" onPress={() => openFeatureInfo("Disappearing Messages", "Disappearing messages need backend support before they can be enabled.")} />
          <Option icon="shield-checkmark-outline" title="Encryption" onPress={() => openFeatureInfo("Encryption", "End-to-end encryption details are not exposed by the current backend yet.")} />
        </View>

        {/* BLOCK */}
        <TouchableOpacity
          style={styles.blockButton}
          onPress={blockSeller}
        >
          <Icon name="close-circle-outline" size={20} color="#ef4444" />
          <Text style={styles.blockText}>
            Block {seller?.sellerName || "Seller"}
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
};

export default SellerDetailsScreen;





/* ================= COMPONENTS ================= */

const Action = ({
  icon,
  title,
  onPress
}: {
  icon: string;
  title: string;
  onPress?: () => void;
}) => (
  <TouchableOpacity style={styles.actionItem} onPress={onPress}>
    <View style={styles.actionIcon}>
      <Icon name={icon} size={24} color={PRIMARY} />
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
}) => (
  <TouchableOpacity style={styles.optionRow} onPress={onPress}>
    <Icon name={icon} size={22} style={{ marginRight: 15 }} />
    <Text style={{ flex: 1 }}>{title}</Text>
    <Icon name="chevron-forward" />
  </TouchableOpacity>
);





/* ================= STYLES ================= */

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#F6F7FB"
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 55,
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
    backgroundColor: "#E9E0FF"
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
    color: "#777",
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
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    elevation: 3
  },

  actionText: {
    marginTop: 6,
    fontSize: 12
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
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    alignItems: "center"
  },

  serviceName: {
    fontWeight: "700"
  },

  servicePrice: {
    color: PRIMARY,
    marginTop: 4
  },

  serviceMeta: {
    color: "#666",
    marginTop: 4,
    fontSize: 12
  },

  bookBtn: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10
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
    backgroundColor: "#fff",
    marginHorizontal: 18,
    borderRadius: 14
  },

  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderColor: "#f0f0f0"
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
    color: "#ef4444",
    marginLeft: 8,
    fontWeight: "600"
  }

});
