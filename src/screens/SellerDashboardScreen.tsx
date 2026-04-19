import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator
} from "react-native";
import { Alert } from "../utils/appAlert";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "react-native-vector-icons/Ionicons";
import Tooltip from "react-native-walkthrough-tooltip";
import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { monetizationDisabledMessage, productFlags } from "../config/productFlags";
import { appConfig } from "../config/env";
import { formatPrimaryServicePrice, formatSummaryAmount } from "../utils/servicePricing";
import { shareContentLink } from "../utils/shareLinks";
import { DEFAULT_AVATAR_URL, DEFAULT_COVER_URL } from "../constants/defaultAssets";
import { useAppTheme } from "../theme/AppThemeContext";

const DEFAULT_COVER = DEFAULT_COVER_URL;
const DEFAULT_AVATAR = DEFAULT_AVATAR_URL;

const SellerDashboardScreen = ({ navigation }: any) => {
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const [step, setStep] = useState(0);
  const [services, setServices] = useState([]);
  const [serviceLoading, setServiceLoading] = useState(true);
  const [serviceError, setServiceError] = useState("");
  const [requestSummary, setRequestSummary] = useState<any>(null);
  const [recentRequests, setRecentRequests] = useState<any[]>([]);
  const [requestLoading, setRequestLoading] = useState(true);
  const [requestError, setRequestError] = useState("");

  const [loading, setLoading] = useState(true);
  const [seller, setSeller] = useState<any>(null);
  const [sellerError, setSellerError] = useState("");

  const next = () => setStep(step + 1);
  const close = async () => {
    setStep(0);
    await AsyncStorage.setItem("sellerDashboardGuideSeen", "true");
  };
  const startGuide = () => setStep(1);
const fetchServices = useCallback(async () => {
  try {
    setServiceLoading(true);

    const res = await API.get("/service/my-services");

    setServices(res.data.services || []);
    setServiceError("");
  } catch (error) {
    console.log("services error:", error);
    setServices([]);
    setServiceError(getReadableApiErrorMessage(error, "Failed to load services."));
  } finally {
    setServiceLoading(false);
  }
}, []);
const handleDeleteService = (id: string) => {
  Alert.alert("Delete Service", "Are you sure?", [
    { text: "Cancel" },
    {
      text: "Delete",
      onPress: async () => {
        try {
          await API.delete(`/service/delete/${id}`);
          fetchServices().catch(() => {});
        } catch (error) {
          Alert.alert("Unable to delete service", getReadableApiErrorMessage(error, "Please try again."));
        }
      }
    }
  ]);
};

const handleShareService = async (item: any) => {
  const sellerProfileSlug = seller?.user?.username || seller?.user?._id;
  const shareBase = (appConfig.publicShareBaseUrl || "https://aline2.com").replace(/\/+$/, "");
  const profileUrl = sellerProfileSlug ? `${shareBase}/profile/${sellerProfileSlug}` : shareBase;

  await shareContentLink({
    originalUrl: profileUrl,
    title: item?.serviceName || "Aline2 Service",
    description: item?.description || "",
    fallbackMessage: [
      item?.serviceName || "Aline2 Service",
      item?.description || "",
      seller?.sellerName ? `Offered by ${seller.sellerName}` : "",
      profileUrl,
    ].filter(Boolean).join("\n")
  });
};
const fetchRequestData = useCallback(async () => {
  try {
    setRequestLoading(true);
    const [summaryRes, requestsRes] = await Promise.all([
      API.get("/service-requests/summary", { params: { role: "seller" } }),
      API.get("/service-requests", { params: { role: "seller", status: "pending" } })
    ]);

    setRequestSummary(summaryRes.data?.summary || null);
    setRecentRequests((requestsRes.data?.requests || []).slice(0, 3));
    setRequestError("");
  } catch (error) {
    console.log("request data error:", error);
    setRequestSummary(null);
    setRecentRequests([]);
    setRequestError(getReadableApiErrorMessage(error, "Failed to load appointment data."));
  } finally {
    setRequestLoading(false);
  }
}, []);
  const fetchSellerProfile = useCallback(async () => {
    try {
      setLoading(true);

      const res = await API.get("/seller/me");

      if (res?.data?.success) {
        setSeller(res.data.seller);
        setSellerError("");
      } else {
        navigation.replace("SellerRegistration");
      }
    } catch (error: any) {
      console.log("fetchSellerProfile error:", error?.response?.data || error.message);

      if (error?.response?.status === 404) {
        navigation.replace("SellerRegistration");
        return;
      }

      setSeller(null);
      setSellerError(getReadableApiErrorMessage(error, "Failed to load seller profile."));
    } finally {
      setLoading(false);
    }
  }, [navigation]);

  useEffect(() => {
    fetchSellerProfile();
    fetchServices();
    fetchRequestData();
  }, [fetchRequestData, fetchSellerProfile, fetchServices]);

  useFocusEffect(
    useCallback(() => {
      fetchSellerProfile().catch(() => {});
      fetchServices().catch(() => {});
      fetchRequestData().catch(() => {});
    }, [fetchRequestData, fetchSellerProfile, fetchServices])
  );

  useEffect(() => {
    let active = true;

    const loadGuideState = async () => {
      const seenGuide = await AsyncStorage.getItem("sellerDashboardGuideSeen");
      if (active && seenGuide !== "true") {
        setStep(1);
      }
    };

    loadGuideState().catch((error) => {
      console.log("seller dashboard guide state error:", error);
    });

    return () => {
      active = false;
    };
  }, []);

  const getVerificationLabel = () => {
    if (!seller?.verificationStatus) return "Pending";

    if (seller.verificationStatus === "approved") return "Verified Seller";
    if (seller.verificationStatus === "rejected") return "Rejected";
    return "Pending Verification";
  };

  const getVerificationColor = () => {
    if (!seller?.verificationStatus) return "#F59E0B";

    if (seller.verificationStatus === "approved") return "#1DA1F2";
    if (seller.verificationStatus === "rejected") return "#EF4444";
    return "#F59E0B";
  };

  const getTagBg = () => {
    if (!seller?.verificationStatus) return "#FEF3C7";

    if (seller.verificationStatus === "approved") return "#E0F2FE";
    if (seller.verificationStatus === "rejected") return "#FEE2E2";
    return "#FEF3C7";
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.loaderContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loaderText, { color: colors.mutedText }]}>Loading seller profile...</Text>
      </SafeAreaView>
    );
  }

  if (!seller) {
    return (
      <SafeAreaView style={[styles.loaderContainer, { backgroundColor: colors.background }]}>
        <Icon name="storefront-outline" size={42} color={colors.mutedText} />
        <Text style={[styles.loaderText, { color: colors.text, marginTop: 16 }]}>Seller profile unavailable</Text>
        <Text style={[styles.errorBody, { color: colors.mutedText }]}>
          {sellerError || "We couldn't load your seller profile right now."}
        </Text>
        <TouchableOpacity
          style={[styles.primaryBtn, { marginTop: 18, backgroundColor: colors.primary }]}
          onPress={() => fetchSellerProfile().catch(() => {})}
        >
          <Text style={styles.btnText}>Try Again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerBtn}
        >
          <Icon name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.text }]}>Seller Profile</Text>

        <Tooltip
          isVisible={step === 1}
          placement="bottom"
          content={
            <View>
              <Text>Open seller settings here</Text>
              <TouchableOpacity onPress={next}>
                <Text style={styles.guideBtn}>Next</Text>
              </TouchableOpacity>
            </View>
            }
          >
            <TouchableOpacity
              style={styles.headerBtn}
            onPress={() =>
              navigation.navigate("SellerSettingsScreen", {
                seller
              })
            }
          >
            <Icon name="settings-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </Tooltip>
        <TouchableOpacity style={styles.headerBtn} onPress={startGuide}>
          <Icon name="help-circle-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.bannerContainer}>
          <Image
            source={{ uri: seller?.coverPic || DEFAULT_COVER }}
            style={styles.banner}
          />

          <TouchableOpacity
            style={styles.editBanner}
            onPress={() =>
              navigation.navigate("SellerSettingsScreen", {
                seller
              })
            }
          >
            <Icon name="camera" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.profileSection}>
          <Image
            source={{ uri: seller?.profilePic || DEFAULT_AVATAR }}
            style={styles.profile}
          />

          <Text style={styles.name}>
            {seller?.sellerName || "Seller Profile"}
          </Text>

          <Tooltip
            isVisible={step === 2}
            placement="bottom"
            content={
              <View>
                <Text>This badge shows your seller verification status</Text>
                <TouchableOpacity onPress={next}>
                  <Text style={styles.guideBtn}>Next</Text>
                </TouchableOpacity>
              </View>
            }
          >
            <View style={styles.verifyRow}>
              <Text
                style={[
                  styles.sellerTag,
                  { backgroundColor: getTagBg(), color: "#333" }
                ]}
              >
                {getVerificationLabel()}
              </Text>
              <Icon
                name="checkmark-circle"
                size={18}
                color={getVerificationColor()}
              />
            </View>
          </Tooltip>

          {!!seller?.specialization && (
            <Text style={styles.tagline}>{seller.specialization}</Text>
          )}
        </View>

        <Tooltip
          isVisible={step === 3}
          placement="top"
          content={
            <View>
              <Text>This is your seller wallet balance</Text>
              <TouchableOpacity onPress={next}>
                <Text style={styles.guideBtn}>Next</Text>
              </TouchableOpacity>
            </View>
          }
        >
          <View style={[styles.walletCard, { backgroundColor: colors.card }]}>
            <View style={styles.walletLeft}>
              <Icon name="wallet-outline" size={22} color={colors.primary} />
              <Text style={[styles.walletTitle, { color: colors.text }]}>
                {productFlags.sellerMonetizationInConsumerApp ? "Seller Wallet" : "Completed Request Value"}
              </Text>
            </View>

            <Text style={[styles.walletAmount, { color: colors.text }]}>{formatSummaryAmount(requestSummary, "completed")}</Text>
          </View>
        </Tooltip>

        {!productFlags.sellerMonetizationInConsumerApp ? (
          <View style={styles.readOnlyInfoCard}>
            <Icon name="information-circle-outline" size={18} color="#6b7280" />
            <Text style={styles.readOnlyInfoText}>{monetizationDisabledMessage}</Text>
          </View>
        ) : null}

        <View style={styles.stats}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>
              {seller?.experience ? seller.experience : "0"}
            </Text>
            <Text style={styles.statLabel}>Years Exp.</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statNumber}>0.0</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statNumber}>0+</Text>
            <Text style={styles.statLabel}>Clients</Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <Tooltip
            isVisible={step === 4}
            placement="top"
            content={
              <View>
                <Text>Add services for clients</Text>
                <TouchableOpacity onPress={next}>
                  <Text style={styles.guideBtn}>Next</Text>
                </TouchableOpacity>
              </View>
            }
          >
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() =>
                navigation.navigate("AddServiceScreen", {
                  seller
                })
              }
            >
              <Icon name="add" size={18} color="#fff" />
              <Text style={styles.btnText}> Add Service</Text>
            </TouchableOpacity>
          </Tooltip>

          <Tooltip
            isVisible={step === 5}
            placement="top"
            content={
              <View>
                <Text>View all bookings here</Text>
                <TouchableOpacity onPress={close}>
                  <Text style={styles.guideBtn}>Done</Text>
                </TouchableOpacity>
              </View>
            }
          >
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => navigation.navigate("ServiceRequestsScreen", { mode: "seller" })}
            >
              <Icon name="calendar-outline" size={18} color="#333" />
              <Text style={styles.btnText2}> View Appointments</Text>
            </TouchableOpacity>
          </Tooltip>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Requests</Text>

          {requestLoading ? (
            <ActivityIndicator style={{ marginTop: 16 }} />
          ) : requestError ? (
            <Text style={[styles.emptyRequestText, { color: colors.mutedText }]}>{requestError}</Text>
          ) : recentRequests.length === 0 ? (
            <Text style={[styles.emptyRequestText, { color: colors.mutedText }]}>No pending requests right now.</Text>
          ) : (
            recentRequests.map((item: any) => (
              <View key={item._id} style={styles.requestCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.requestTitle}>{item.service?.serviceName || "Service request"}</Text>
                  <Text style={styles.requestSubtitle}>{item.user?.name || item.user?.username || "Client"}</Text>
                </View>
                <Text style={styles.requestPrice}>
                  {formatPrimaryServicePrice({ pricingOptions: [item.pricing], currency: item.pricing?.currency })}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>About Seller</Text>

          <Text
            numberOfLines={expanded ? undefined : 3}
            style={styles.desc}
          >
            {seller?.bio?.trim()
              ? seller.bio
              : "No seller bio added yet."}
          </Text>

          {!!seller?.bio && seller.bio.length > 120 && (
            <TouchableOpacity onPress={() => setExpanded(!expanded)}>
              <Text style={styles.readMore}>
                {expanded ? "Show Less" : "Read More"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Professional Details</Text>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Specialization</Text>
              <Text style={styles.infoValue}>
                {seller?.specialization || "N/A"}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Experience</Text>
              <Text style={styles.infoValue}>
                {seller?.experience ? `${seller.experience} Years` : "N/A"}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Clinic Link</Text>
              <Text style={styles.infoValue}>
                {seller?.clinicLink || "N/A"}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Degree</Text>
              <Text style={styles.infoValue}>
                {seller?.degree || "N/A"}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>License</Text>
              <Text style={styles.infoValue}>
                {seller?.license || "N/A"}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Status</Text>
              <Text style={styles.infoValue}>
                {seller?.availabilityStatus ? "In" : "Out"}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>DigiLocker</Text>
              <Text
                style={[
                  styles.infoValue,
                  { color: seller?.digilockerVerified ? "#16A34A" : "#DC2626" }
                ]}
              >
                {seller?.digilockerVerified ? "Verified" : "Not Verified"}
              </Text>
            </View>
          </View>
        </View>

       <View style={styles.section}>
         <View style={styles.serviceHeader}>
           <Text style={[styles.sectionTitle, { color: colors.text }]}>All Services</Text>

           <TouchableOpacity
             onPress={() =>
               navigation.navigate("AddServiceScreen", {
                 seller
               })
             }
           >
             <Text style={styles.addService}>+ Add New</Text>
           </TouchableOpacity>
         </View>

         {/* LOADING */}
         {serviceLoading ? (
           <ActivityIndicator style={{ marginTop: 20 }} />
         ) : serviceError ? (
           <Text style={[styles.noServiceSub, { color: colors.mutedText }]}>{serviceError}</Text>
         ) : services.length === 0 ? (
           <View style={styles.emptyService}>
             <Icon name="briefcase-outline" size={40} color="#bbb" />
             <Text style={styles.noService}>No services added yet</Text>
             <Text style={styles.noServiceSub}>
               Add your first service to start receiving bookings.
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

               <Text style={styles.serviceName}>{item.serviceName}</Text>

               <Text numberOfLines={2} style={styles.serviceDesc}>
                 {item.description}
               </Text>

               {/* PRICE */}
               <View style={{ flexDirection: "row", marginTop: 6 }}>
                 <Text style={styles.priceTag}>{formatPrimaryServicePrice(item)}</Text>
               </View>

               {/* ACTIONS */}
               <View style={styles.serviceActions}>

                 <TouchableOpacity
                   onPress={() =>
                     navigation.navigate("EditServiceScreen", { service: item })
                   }
                 >
                   <Icon name="create-outline" size={20} color="#333" />
                 </TouchableOpacity>

                 <TouchableOpacity
                   onPress={() => handleDeleteService(item._id)}
                 >
                   <Icon name="trash-outline" size={20} color="#EF4444" />
                 </TouchableOpacity>

                 <TouchableOpacity
                   onPress={() => handleShareService(item)}
                 >
                   <Icon name="share-social-outline" size={20} color="#333" />
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

export default SellerDashboardScreen;

const styles = StyleSheet.create({
  loaderContainer: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center"
  },

  loaderText: {
    marginTop: 12,
    fontSize: 15,
    color: "#666"
  },
  errorBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    paddingHorizontal: 28,
  },

  header: {
    height: 90,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 40,
    borderBottomWidth: 1,
    borderBottomColor: "#eee"
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111"
  },

  headerBtn: {
    padding: 6
  },

  container: {
    flex: 1,
    backgroundColor: "#fff"
  },

  bannerContainer: {
    position: "relative"
  },

  banner: {
    width: "100%",
    height: 220
  },

  editBanner: {
    position: "absolute",
    right: 15,
    bottom: 15,
    backgroundColor: "#00000070",
    padding: 10,
    borderRadius: 30
  },

  profileSection: {
    alignItems: "center",
    marginTop: -50
  },

  profile: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: "#fff"
  },

  name: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 8,
    color: "#111"
  },

  verifyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4
  },

  sellerTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
    fontSize: 12,
    fontWeight: "600"
  },

  tagline: {
    color: "#666",
    marginTop: 6,
    textAlign: "center",
    paddingHorizontal: 20
  },

  walletCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F5F3FF",
    margin: 20,
    padding: 16,
    borderRadius: 12
  },

  walletLeft: {
    flexDirection: "row",
    alignItems: "center"
  },

  walletTitle: {
    marginLeft: 8,
    fontWeight: "600",
    color: "#111"
  },

  walletAmount: {
    fontWeight: "700",
    fontSize: 16,
    color: "#7B4DFF"
  },
  readOnlyInfoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginHorizontal: 20,
    marginTop: -4,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F8FAFC"
  },
  readOnlyInfoText: {
    flex: 1,
    marginLeft: 10,
    color: "#4B5563",
    lineHeight: 20,
    fontSize: 13
  },

  stats: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 10
  },

  statBox: {
    alignItems: "center"
  },

  statNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111"
  },

  statLabel: {
    color: "#777"
  },

  actionRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    marginTop: 15
  },

  primaryBtn: {
    flex: 1,
    backgroundColor: "#7B4DFF",
    padding: 14,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    paddingHorizontal: 20
  },

  secondaryBtn: {
    flex: 1,
    backgroundColor: "#f1f1f1",
    padding: 14,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center"
  },

  btnText: {
    color: "#fff",
    fontWeight: "600"
  },

  btnText2: {
    fontWeight: "600",
    color: "#333"
  },

  section: {
    paddingHorizontal: 20,
    marginTop: 20
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111"
  },

  desc: {
    marginTop: 8,
    color: "#555",
    lineHeight: 20
  },
  requestCard: {
    marginTop: 12,
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center"
  },
  requestTitle: {
    fontWeight: "700",
    color: "#111"
  },
  requestSubtitle: {
    marginTop: 4,
    color: "#666"
  },
  requestPrice: {
    color: "#7B4DFF",
    fontWeight: "700",
    marginLeft: 10
  },
  emptyRequestText: {
    marginTop: 12,
    color: "#777"
  },

  readMore: {
    color: "#7B4DFF",
    marginTop: 6,
    fontWeight: "600"
  },

  infoCard: {
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#eee"
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee"
  },

  infoLabel: {
    color: "#666",
    fontWeight: "600",
    flex: 1
  },

  infoValue: {
    color: "#111",
    fontWeight: "500",
    flex: 1,
    textAlign: "right"
  },

  serviceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },

  addService: {
    color: "#7B4DFF",
    fontWeight: "600"
  },

  emptyService: {
    alignItems: "center",
    paddingVertical: 30
  },

  noService: {
    marginTop: 10,
    fontWeight: "600",
    color: "#666"
  },

  noServiceSub: {
    marginTop: 4,
    color: "#999",
    fontSize: 13,
    textAlign: "center"
  },

  guideBtn: {
    marginTop: 10,
    color: "#7B4DFF",
    fontWeight: "700"
  },
serviceCard: {
  backgroundColor: "#FAFAFA",
  borderRadius: 12,
  padding: 12,
  marginTop: 12,
  borderWidth: 1,
  borderColor: "#eee"
},

serviceImage: {
  width: "100%",
  height: 120,
  borderRadius: 10,
  marginBottom: 8
},

serviceName: {
  fontWeight: "700",
  fontSize: 15
},

serviceDesc: {
  color: "#666",
  fontSize: 13,
  marginTop: 4
},

priceTag: {
  backgroundColor: "#eee",
  paddingHorizontal: 6,
  paddingVertical: 3,
  borderRadius: 6,
  marginRight: 6,
  fontSize: 11
},

serviceActions: {
  flexDirection: "row",
  justifyContent: "space-between",
  marginTop: 10
}
});
