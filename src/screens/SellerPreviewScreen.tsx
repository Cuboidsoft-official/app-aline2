import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { API } from "../api/api";
import Icon from "react-native-vector-icons/Ionicons";

const DEFAULT_COVER =
  "https://www.bcmch.org/asset/uploads/common/867349919655f1491613e4.webp";

const DEFAULT_AVATAR =
  "https://cdn-icons-png.flaticon.com/512/149/149071.png";

const PRIMARY = "#7B4DFF";

const SellerPreviewScreen = ({ route, navigation }: any) => {
  const { sellerId } = route.params;

  const [seller, setSeller] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("token");

      const sellerRes = await API.get(`/seller/${sellerId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const serviceRes = await API.get(`/service/seller/${sellerId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSeller(sellerRes.data.seller);
      setServices(serviceRes.data.services || []);
    } catch (error) {
      console.log("ERROR:", error);
      Alert.alert("Error", "Failed to load seller profile");
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resolveSellerUserId = () => {
    const rawUserId = seller?.user;

    if (!rawUserId) {
      return null;
    }

    if (typeof rawUserId === "string") {
      return rawUserId;
    }

    return rawUserId?._id || null;
  };

  const openSellerChat = (service?: any) => {
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

  const getPriceText = (item: any) => {
    if (item?.pricePerMin) return `₹${item.pricePerMin}/min`;
    if (item?.pricePerMsg) return `₹${item.pricePerMsg}/msg`;
    if (item?.packagePrice) return `₹${item.packagePrice}`;
    return "Price not available";
  };

  const getVerificationLabel = () => {
    if (!seller?.verificationStatus) return "Pending";
    if (seller?.verificationStatus === "approved") return "Verified";
    if (seller?.verificationStatus === "rejected") return "Rejected";
    return "Pending";
  };

  const getVerificationBg = () => {
    if (!seller?.verificationStatus) return "#FEF3C7";
    if (seller?.verificationStatus === "approved") return "#E7F8EE";
    if (seller?.verificationStatus === "rejected") return "#FEE2E2";
    return "#FEF3C7";
  };

  const getVerificationColor = () => {
    if (!seller?.verificationStatus) return "#D97706";
    if (seller?.verificationStatus === "approved") return "#16A34A";
    if (seller?.verificationStatus === "rejected") return "#DC2626";
    return "#D97706";
  };

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={PRIMARY} />
        <Text style={styles.loaderText}>Loading seller profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.main}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={20} color="#111" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Seller Profile</Text>

        <TouchableOpacity style={styles.headerBtn} onPress={fetchData}>
          <Icon name="refresh-outline" size={20} color="#111" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        {/* Banner */}
        <View style={styles.bannerWrap}>
          <Image
            source={{ uri: seller?.coverPic || DEFAULT_COVER }}
            style={styles.banner}
          />
          <View style={styles.bannerOverlay} />
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <Image
            source={{ uri: seller?.profilePic || DEFAULT_AVATAR }}
            style={styles.avatar}
          />

          <Text style={styles.name}>
            {seller?.sellerName || "Seller"}
          </Text>

          <View style={styles.badgeRow}>
            <View
              style={[
                styles.verifyBadge,
                { backgroundColor: getVerificationBg() }
              ]}
            >
              <Icon
                name="checkmark-circle"
                size={14}
                color={getVerificationColor()}
              />
              <Text
                style={[
                  styles.verifyText,
                  { color: getVerificationColor() }
                ]}
              >
                {getVerificationLabel()}
              </Text>
            </View>
          </View>

          {!!seller?.specialization && (
            <Text style={styles.tagline}>
              {seller.specialization}
            </Text>
          )}

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>
                {seller?.experience || "0"}
              </Text>
              <Text style={styles.statLabel}>Experience</Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statBox}>
              <Text style={styles.statNumber}>
                {services.length || 0}
              </Text>
              <Text style={styles.statLabel}>Services</Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statBox}>
              <Text style={styles.statNumber}>
                {seller?.availabilityStatus ? "Yes" : "No"}
              </Text>
              <Text style={styles.statLabel}>Available</Text>
            </View>
          </View>
        </View>



        <View  style={{ paddingHorizontal: 18 }}>
            {/* Profile Card ke niche ADD KAR */}
                    <TouchableOpacity
                      style={styles.chatBtn}
                      onPress={() => openSellerChat()}
                    >
                      <Icon name="chatbubble-ellipses-outline" size={18} color="#fff" />
                      <Text style={styles.chatBtnText}> Chat / Request Booking</Text>
                    </TouchableOpacity>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About Seller</Text>

          <View style={styles.card}>
            <Text style={styles.desc}>
              {seller?.bio || "No bio added"}
            </Text>
          </View>
        </View>

        {/* Professional Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Professional Details</Text>

          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Specialization</Text>
              <Text style={styles.infoValue}>{seller?.specialization || "N/A"}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Experience</Text>
              <Text style={styles.infoValue}>
                {seller?.experience ? `${seller.experience} Years` : "N/A"}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Degree</Text>
              <Text style={styles.infoValue}>{seller?.degree || "N/A"}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>License</Text>
              <Text style={styles.infoValue}>{seller?.license || "N/A"}</Text>
            </View>

            <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.infoLabel}>Availability</Text>
              <Text
                style={[
                  styles.infoValue,
                  { color: seller?.availabilityStatus ? "#16A34A" : "#DC2626" }
                ]}
              >
                {seller?.availabilityStatus ? "Available" : "Unavailable"}
              </Text>
            </View>
          </View>
        </View>

        {/* Services */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Services</Text>

          {services.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Icon name="briefcase-outline" size={38} color="#C4C4C4" />
              <Text style={styles.emptyTitle}>No services available</Text>
              <Text style={styles.emptySubTitle}>
                Seller has not added any service yet.
              </Text>
            </View>
          ) : (
            services.map((item: any) => (
              <View key={item._id} style={styles.serviceCard}>
                {!!item.image && (
                  <Image
                    source={{ uri: item.image }}
                    style={styles.serviceImage}
                  />
                )}

                <View style={styles.serviceContent}>
                  <View style={styles.serviceTopRow}>
                    <Text style={styles.serviceName}>
                      {item.serviceName}
                    </Text>

                    <View style={styles.pricePill}>
                      <Text style={styles.priceText}>
                        {getPriceText(item)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.serviceDesc}>
                    {item.description}
                  </Text>

                  <TouchableOpacity
                    style={styles.bookBtn}
                    onPress={() => openSellerChat(item)}
                  >
                    <Icon name="calendar-outline" size={17} color="#fff" />
                    <Text style={styles.bookText}> Request in Chat</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default SellerPreviewScreen;

const styles = StyleSheet.create({
  main: {
    flex: 1,
    backgroundColor: "#F8F8FC"
  },

  loaderContainer: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center"
  },

  loaderText: {
    marginTop: 12,
    fontSize: 14,
    color: "#666"
  },

  header: {
    height: 92,
    paddingTop: 42,
    paddingHorizontal: 18,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#EFEFEF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },

  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F6F6F8",
    alignItems: "center",
    justifyContent: "center"
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111"
  },

  bannerWrap: {
    position: "relative"
  },

  banner: {
    width: "100%",
    height: 240,
    backgroundColor: "#ECECEC"
  },

  bannerOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 100,
    backgroundColor: "rgba(0,0,0,0.15)"
  },

  profileCard: {
    marginTop: -60,
    marginHorizontal: 18,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 18,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4
  },

  avatar: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 4,
    borderColor: "#fff",
    backgroundColor: "#F3F3F3",
    marginTop: -6
  },

  name: {
    marginTop: 12,
    fontSize: 22,
    fontWeight: "800",
    color: "#111"
  },

  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8
  },

  verifyBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20
  },

  verifyText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "700"
  },

  tagline: {
    marginTop: 10,
    fontSize: 14,
    color: "#666",
    textAlign: "center"
  },

  statsRow: {
    width: "100%",
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#F1F1F1",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },

  statBox: {
    flex: 1,
    alignItems: "center"
  },

  statDivider: {
    width: 1,
    height: 34,
    backgroundColor: "#ECECEC"
  },

  statNumber: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111"
  },

  statLabel: {
    marginTop: 4,
    fontSize: 12,
    color: "#777"
  },

  section: {
    marginTop: 22,
    paddingHorizontal: 18
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111",
    marginBottom: 12
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#F0F0F0",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },

  desc: {
    color: "#555",
    lineHeight: 22,
    fontSize: 14
  },

  infoRow: {
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F1F1",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12
  },

  infoLabel: {
    flex: 1,
    color: "#666",
    fontSize: 14,
    fontWeight: "600"
  },

  infoValue: {
    flex: 1,
    textAlign: "right",
    color: "#111",
    fontSize: 14,
    fontWeight: "700"
  },

  emptyWrap: {
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingVertical: 36,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F0F0F0"
  },

  emptyTitle: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: "700",
    color: "#666"
  },

  emptySubTitle: {
    marginTop: 4,
    color: "#999",
    fontSize: 13,
    textAlign: "center"
  },

  serviceCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#F0F0F0",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2
  },

  serviceImage: {
    width: "100%",
    height: 170,
    backgroundColor: "#EFEFEF"
  },

  serviceContent: {
    padding: 14
  },

  serviceTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start"
  },

  serviceName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: "#111",
    paddingRight: 10
  },

  pricePill: {
    backgroundColor: "#F4F0FF",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6
  },

  priceText: {
    fontSize: 12,
    color: PRIMARY,
    fontWeight: "700"
  },

  serviceDesc: {
    marginTop: 8,
    color: "#666",
    fontSize: 13,
    lineHeight: 19
  },

  bookBtn: {
    marginTop: 14,
    height: 48,
    borderRadius: 12,
    backgroundColor: PRIMARY,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center"
  },

  bookText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700"
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
chatBtn: {
  marginTop: 16,
  height: 52,
  borderRadius: 14,
  backgroundColor: PRIMARY,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center"
},

chatBtnText: {
  color: "#fff",
  fontWeight: "700",
  fontSize: 15
},
});
