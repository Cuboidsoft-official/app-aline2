import React, { useCallback, useEffect, useState } from "react";
import {
 ActivityIndicator,
 Image,
 ScrollView,
 StatusBar,
 StyleSheet,
 Text,
 TouchableOpacity,
 View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";

import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { DEFAULT_AVATAR_URL, DEFAULT_COVER_URL } from "../constants/defaultAssets";
import { useAppTheme } from "../theme/AppThemeContext";

const SellerPreviewScreen = ({ route, navigation }: any) => {
 const { colors, isDarkMode } = useAppTheme();
 const { sellerId } = route.params;

 const [seller, setSeller] = useState<any>(null);
 const [services, setServices] = useState<any[]>([]);
 const [loading, setLoading] = useState(true);
 const [errorMessage, setErrorMessage] = useState("");

 const fetchData = useCallback(async () => {
  try {
   setLoading(true);

   const [sellerRes, serviceRes] = await Promise.all([
    API.get(`/seller/${sellerId}`),
    API.get(`/service/seller/${sellerId}`),
   ]);

   setSeller(sellerRes.data?.seller || null);
   setServices(Array.isArray(serviceRes.data?.services) ? serviceRes.data.services : []);
   setErrorMessage("");
  } catch (error) {
   console.log("seller preview error:", error);
   setSeller(null);
   setServices([]);
   setErrorMessage(getReadableApiErrorMessage(error, "Failed to load seller profile."));
  } finally {
   setLoading(false);
  }
 }, [sellerId]);

 useEffect(() => {
  fetchData();
 }, [fetchData]);

 useFocusEffect(
  useCallback(() => {
   fetchData().catch(() => {});
  }, [fetchData]),
 );

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

 const sellerUserId = resolveSellerUserId();

 const openSellerChat = (service?: any) => {
  if (!sellerUserId) {
   return;
  }

  navigation.navigate("SellerChatScreen", {
   sellerId,
   sellerUserId,
   serviceId: service?._id,
   serviceName: service?.serviceName,
  });
 };

 const getPriceText = (item: any) => {
  if (item?.pricePerMin) return `₹${item.pricePerMin}/min`;
  if (item?.pricePerMsg) return `₹${item.pricePerMsg}/msg`;
  if (item?.packagePrice) return `₹${item.packagePrice}`;
  if (item?.pricePerHour) return `₹${item.pricePerHour}/hour`;
  if (item?.pricePerSession) return `₹${item.pricePerSession}/session`;
  return "Price not available";
 };

 const getVerificationLabel = () => {
  if (!seller?.verificationStatus) return "Pending";
  if (seller?.verificationStatus === "approved") return "Verified";
  if (seller?.verificationStatus === "rejected") return "Rejected";
  return "Pending";
 };

 const getVerificationBg = () => {
  if (!seller?.verificationStatus) return isDarkMode ? "#5B4300" : "#FEF3C7";
  if (seller?.verificationStatus === "approved") return isDarkMode ? "#143322" : "#E7F8EE";
  if (seller?.verificationStatus === "rejected") return isDarkMode ? "#4A1D1D" : "#FEE2E2";
  return isDarkMode ? "#5B4300" : "#FEF3C7";
 };

 const getVerificationColor = () => {
  if (!seller?.verificationStatus) return isDarkMode ? "#FBBF24" : "#D97706";
  if (seller?.verificationStatus === "approved") return "#16A34A";
  if (seller?.verificationStatus === "rejected") return "#DC2626";
  return isDarkMode ? "#FBBF24" : "#D97706";
 };

 if (loading) {
  return (
   <SafeAreaView style={[styles.loaderContainer, { backgroundColor: colors.background }]} edges={["top"]}>
    <ActivityIndicator size="large" color={colors.primary} />
    <Text style={[styles.loaderText, { color: colors.mutedText }]}>Loading seller profile...</Text>
   </SafeAreaView>
  );
 }

 if (!seller) {
  return (
   <SafeAreaView style={[styles.loaderContainer, { backgroundColor: colors.background }]} edges={["top"]}>
    <Icon name="storefront-outline" size={44} color={colors.mutedText} />
    <Text style={[styles.errorTitle, { color: colors.text }]}>Seller unavailable</Text>
    <Text style={[styles.errorBody, { color: colors.mutedText }]}>
     {errorMessage || "This seller profile could not be loaded right now."}
    </Text>
    <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={() => fetchData().catch(() => {})}>
     <Text style={styles.retryButtonText}>Retry</Text>
    </TouchableOpacity>
   </SafeAreaView>
  );
 }

 return (
  <SafeAreaView style={[styles.main, { backgroundColor: colors.background }]} edges={["top"]}>
   <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={colors.card} />

   <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
    <TouchableOpacity style={[styles.headerBtn, { backgroundColor: colors.surface }]} onPress={() => navigation.goBack()}>
     <Icon name="arrow-back" size={20} color={colors.text} />
    </TouchableOpacity>

    <Text style={[styles.headerTitle, { color: colors.text }]}>Seller Profile</Text>

    <TouchableOpacity style={[styles.headerBtn, { backgroundColor: colors.surface }]} onPress={() => fetchData().catch(() => {})}>
     <Icon name="refresh-outline" size={20} color={colors.text} />
    </TouchableOpacity>
   </View>

   <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
    <View style={styles.bannerWrap}>
     <Image source={{ uri: seller?.coverPic || DEFAULT_COVER_URL }} style={[styles.banner, { backgroundColor: colors.surface }]} />
     <View style={[styles.bannerOverlay, { backgroundColor: isDarkMode ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.15)" }]} />
    </View>

    <View style={[styles.profileCard, { backgroundColor: colors.card, shadowColor: isDarkMode ? "#000" : "#111827" }]}>
     <Image source={{ uri: seller?.profilePic || DEFAULT_AVATAR_URL }} style={[styles.avatar, { borderColor: colors.card, backgroundColor: colors.surface }]} />

     <Text style={[styles.name, { color: colors.text }]}>{seller?.sellerName || "Seller"}</Text>

     <View style={styles.badgeRow}>
      <View style={[styles.verifyBadge, { backgroundColor: getVerificationBg() }]}>
       <Icon name="checkmark-circle" size={14} color={getVerificationColor()} />
       <Text style={[styles.verifyText, { color: getVerificationColor() }]}>{getVerificationLabel()}</Text>
      </View>
     </View>

     {!!seller?.specialization && (
      <Text style={[styles.tagline, { color: colors.mutedText }]}>{seller.specialization}</Text>
     )}

     <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
      <View style={styles.statBox}>
       <Text style={[styles.statNumber, { color: colors.text }]}>{seller?.experience || "0"}</Text>
       <Text style={[styles.statLabel, { color: colors.mutedText }]}>Experience</Text>
      </View>

      <View style={[styles.statDivider, { backgroundColor: colors.border }]} />

      <View style={styles.statBox}>
       <Text style={[styles.statNumber, { color: colors.text }]}>{services.length || 0}</Text>
       <Text style={[styles.statLabel, { color: colors.mutedText }]}>Services</Text>
      </View>

      <View style={[styles.statDivider, { backgroundColor: colors.border }]} />

      <View style={styles.statBox}>
       <Text style={[styles.statNumber, { color: colors.text }]}>{seller?.availabilityStatus ? "Yes" : "No"}</Text>
       <Text style={[styles.statLabel, { color: colors.mutedText }]}>Available</Text>
      </View>
     </View>
    </View>

    <View style={styles.chatSection}>
     <TouchableOpacity
      style={[styles.chatBtn, { backgroundColor: colors.primary }, !sellerUserId ? styles.chatBtnDisabled : null]}
      onPress={() => openSellerChat()}
      disabled={!sellerUserId}
     >
      <Icon name="chatbubble-ellipses-outline" size={18} color="#fff" />
      <Text style={styles.chatBtnText}>{sellerUserId ? " Chat / Request Booking" : " Chat unavailable"}</Text>
     </TouchableOpacity>
     {!sellerUserId ? (
      <Text style={[styles.inlineNotice, { color: colors.mutedText }]}>
       This seller profile is missing its linked account, so chat is temporarily unavailable.
      </Text>
     ) : null}
    </View>

    <View style={styles.section}>
     <Text style={[styles.sectionTitle, { color: colors.text }]}>About Seller</Text>
     <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.desc, { color: colors.mutedText }]}>{seller?.bio || "No bio added"}</Text>
     </View>
    </View>

    <View style={styles.section}>
     <Text style={[styles.sectionTitle, { color: colors.text }]}>Professional Details</Text>
     <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
       <Text style={[styles.infoLabel, { color: colors.mutedText }]}>Specialization</Text>
       <Text style={[styles.infoValue, { color: colors.text }]}>{seller?.specialization || "N/A"}</Text>
      </View>

      <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
       <Text style={[styles.infoLabel, { color: colors.mutedText }]}>Experience</Text>
       <Text style={[styles.infoValue, { color: colors.text }]}>{seller?.experience ? `${seller.experience} Years` : "N/A"}</Text>
      </View>

      <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
       <Text style={[styles.infoLabel, { color: colors.mutedText }]}>Degree</Text>
       <Text style={[styles.infoValue, { color: colors.text }]}>{seller?.degree || "N/A"}</Text>
      </View>

      <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
       <Text style={[styles.infoLabel, { color: colors.mutedText }]}>License</Text>
       <Text style={[styles.infoValue, { color: colors.text }]}>{seller?.license || "N/A"}</Text>
      </View>

      <View style={styles.infoRowLast}>
       <Text style={[styles.infoLabel, { color: colors.mutedText }]}>Availability</Text>
       <Text style={[styles.infoValue, { color: seller?.availabilityStatus ? "#16A34A" : colors.danger }]}>
        {seller?.availabilityStatus ? "Available" : "Unavailable"}
       </Text>
      </View>
     </View>
    </View>

    <View style={styles.section}>
     <Text style={[styles.sectionTitle, { color: colors.text }]}>Available Services</Text>

     {services.length === 0 ? (
      <View style={[styles.emptyWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
       <Icon name="briefcase-outline" size={38} color={colors.mutedText} />
       <Text style={[styles.emptyTitle, { color: colors.text }]}>No services available</Text>
       <Text style={[styles.emptySubTitle, { color: colors.mutedText }]}>
        Seller has not added any service yet.
       </Text>
      </View>
     ) : (
      services.map((item: any) => (
       <View key={item._id} style={[styles.serviceCard, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: isDarkMode ? "#000" : "#111827" }]}>
        {!!item.image && <Image source={{ uri: item.image }} style={styles.serviceImage} />}

        <View style={styles.serviceContent}>
         <View style={styles.serviceTopRow}>
          <Text style={[styles.serviceName, { color: colors.text }]}>{item.serviceName}</Text>

          <View style={[styles.pricePill, { backgroundColor: isDarkMode ? colors.surface : "#F4F0FF" }]}>
           <Text style={[styles.priceText, { color: colors.primary }]}>{getPriceText(item)}</Text>
          </View>
         </View>

         <Text style={[styles.serviceDesc, { color: colors.mutedText }]}>{item.description}</Text>

         <TouchableOpacity style={[styles.bookBtn, { backgroundColor: colors.primary }]} onPress={() => openSellerChat(item)}>
          <Icon name="calendar-outline" size={17} color="#fff" />
          <Text style={styles.bookText}> Request in Chat</Text>
         </TouchableOpacity>
        </View>
       </View>
      ))
     )}
    </View>
   </ScrollView>
  </SafeAreaView>
 );
};

export default SellerPreviewScreen;

const styles = StyleSheet.create({
 main: {
  flex: 1,
 },
 scrollContent: {
  paddingBottom: 30,
 },
 loaderContainer: {
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingHorizontal: 28,
 },
 loaderText: {
  marginTop: 12,
  fontSize: 14,
 },
 errorTitle: {
  marginTop: 16,
  fontSize: 18,
  fontWeight: "800",
 },
 errorBody: {
  marginTop: 8,
  fontSize: 14,
  lineHeight: 21,
  textAlign: "center",
 },
 retryButton: {
  marginTop: 18,
  borderRadius: 14,
  paddingHorizontal: 18,
  paddingVertical: 12,
 },
 retryButtonText: {
  color: "#fff",
  fontWeight: "700",
 },
 header: {
  height: 92,
  paddingTop: 42,
  paddingHorizontal: 18,
  borderBottomWidth: 1,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
 },
 headerBtn: {
  width: 38,
  height: 38,
  borderRadius: 19,
  alignItems: "center",
  justifyContent: "center",
 },
 headerTitle: {
  fontSize: 18,
  fontWeight: "800",
 },
 bannerWrap: {
  position: "relative",
 },
 banner: {
  width: "100%",
  height: 240,
 },
 bannerOverlay: {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  height: 100,
  backgroundColor: "rgba(0,0,0,0.15)",
 },
 profileCard: {
  marginTop: -60,
  marginHorizontal: 18,
  borderRadius: 24,
  padding: 18,
  alignItems: "center",
  shadowOpacity: 0.06,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
 },
 avatar: {
  width: 108,
  height: 108,
  borderRadius: 54,
  borderWidth: 4,
  marginTop: -6,
 },
 name: {
  marginTop: 12,
  fontSize: 22,
  fontWeight: "800",
 },
 badgeRow: {
  flexDirection: "row",
  alignItems: "center",
  marginTop: 8,
 },
 verifyBadge: {
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 20,
 },
 verifyText: {
  marginLeft: 6,
  fontSize: 12,
  fontWeight: "700",
 },
 tagline: {
  marginTop: 10,
  fontSize: 14,
  textAlign: "center",
 },
 statsRow: {
  width: "100%",
  marginTop: 18,
  paddingTop: 14,
  borderTopWidth: 1,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
 },
 statBox: {
  flex: 1,
  alignItems: "center",
 },
 statDivider: {
  width: 1,
  height: 34,
 },
 statNumber: {
  fontSize: 18,
  fontWeight: "800",
 },
 statLabel: {
  marginTop: 4,
  fontSize: 12,
 },
 chatSection: {
  paddingHorizontal: 18,
 },
 chatBtn: {
  marginTop: 16,
  height: 52,
  borderRadius: 14,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
 },
 chatBtnDisabled: {
  opacity: 0.55,
 },
 chatBtnText: {
  color: "#fff",
  fontWeight: "700",
  fontSize: 15,
 },
 inlineNotice: {
  marginTop: 10,
  fontSize: 12,
  lineHeight: 18,
 },
 section: {
  marginTop: 22,
  paddingHorizontal: 18,
 },
 sectionTitle: {
  fontSize: 18,
  fontWeight: "800",
  marginBottom: 12,
 },
 card: {
  borderRadius: 18,
  padding: 14,
  borderWidth: 1,
  shadowOpacity: 0.03,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
 },
 desc: {
  lineHeight: 22,
  fontSize: 14,
 },
 infoRow: {
  minHeight: 52,
  borderBottomWidth: 1,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingVertical: 12,
 },
 infoRowLast: {
  minHeight: 52,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingVertical: 12,
 },
 infoLabel: {
  flex: 1,
  fontSize: 14,
  fontWeight: "600",
 },
 infoValue: {
  flex: 1,
  textAlign: "right",
  fontSize: 14,
  fontWeight: "700",
 },
 emptyWrap: {
  borderRadius: 18,
  paddingVertical: 36,
  alignItems: "center",
  borderWidth: 1,
 },
 emptyTitle: {
  marginTop: 12,
  fontSize: 15,
  fontWeight: "700",
 },
 emptySubTitle: {
  marginTop: 4,
  fontSize: 13,
  textAlign: "center",
 },
 serviceCard: {
  borderRadius: 18,
  marginBottom: 16,
  overflow: "hidden",
  borderWidth: 1,
  shadowOpacity: 0.03,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
 },
 serviceImage: {
  width: "100%",
  height: 170,
 },
 serviceContent: {
  padding: 14,
 },
 serviceTopRow: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "flex-start",
 },
 serviceName: {
  flex: 1,
  fontSize: 16,
  fontWeight: "800",
  paddingRight: 10,
 },
 pricePill: {
  borderRadius: 20,
  paddingHorizontal: 10,
  paddingVertical: 6,
 },
 priceText: {
  fontSize: 12,
  fontWeight: "700",
 },
 serviceDesc: {
  marginTop: 8,
  fontSize: 13,
  lineHeight: 19,
 },
 bookBtn: {
  marginTop: 14,
  height: 48,
  borderRadius: 12,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
 },
 bookText: {
  color: "#fff",
  fontSize: 14,
  fontWeight: "700",
 },
});
