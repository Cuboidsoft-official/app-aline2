import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "react-native-vector-icons/Ionicons";
import Tooltip from "react-native-walkthrough-tooltip";
import { API } from "../api/api";
import { formatPrimaryServicePrice, formatSummaryAmount } from "../utils/servicePricing";

const DEFAULT_COVER =
  "https://www.bcmch.org/asset/uploads/common/867349919655f1491613e4.webp";

const DEFAULT_AVATAR =
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQikGmpeh_S05yj5punOSDXG-utlTE1TRdFWQ&s";

const SellerDashboardScreen = ({ navigation }: any) => {
  const [expanded, setExpanded] = useState(false);
  const [step, setStep] = useState(1);
  const [services, setServices] = useState([]);
  const [serviceLoading, setServiceLoading] = useState(true);
  const [requestSummary, setRequestSummary] = useState<any>(null);
  const [recentRequests, setRecentRequests] = useState<any[]>([]);
  const [requestLoading, setRequestLoading] = useState(true);

  const [loading, setLoading] = useState(true);
  const [seller, setSeller] = useState<any>(null);

  const next = () => setStep(step + 1);
  const close = () => setStep(0);
  const showUnavailableFeature = (feature: string) => {
    Alert.alert("Not available yet", `${feature} is not implemented in the backend yet.`);
  };

const fetchServices = useCallback(async () => {
  try {
    const token = await AsyncStorage.getItem("token");

    const res = await API.get("/service/my-services", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    setServices(res.data.services || []);
  } catch (error) {
    console.log("services error:", error);
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
        const token = await AsyncStorage.getItem("token");

        await API.delete(`/service/delete/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        fetchServices();
      }
    }
  ]);
};

const handleShareService = async (item: any) => {
  await Share.share({
    message: `${item.serviceName}\n${item.description}`
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
  } catch (error) {
    console.log("request data error:", error);
  } finally {
    setRequestLoading(false);
  }
}, []);
  const fetchSellerProfile = useCallback(async () => {
    try {
      setLoading(true);

      const token = await AsyncStorage.getItem("token");

      if (!token) {
        Alert.alert("Error", "Please login again");
        navigation.goBack();
        return;
      }

      const res = await API.get("/seller/me", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (res?.data?.success) {
        setSeller(res.data.seller);
      } else {
        Alert.alert("Info", "Seller profile not found");
        navigation.replace("SellerRegistration");
      }
    } catch (error: any) {
      console.log("fetchSellerProfile error:", error?.response?.data || error.message);

      if (error?.response?.status === 404) {
        Alert.alert("Info", "Please complete seller registration first");
        navigation.replace("SellerRegistration");
        return;
      }

      Alert.alert("Error", "Failed to load seller profile");
    } finally {
      setLoading(false);
    }
  }, [navigation]);

  useEffect(() => {
    fetchSellerProfile();
    fetchServices();
    fetchRequestData();
  }, [fetchRequestData, fetchSellerProfile, fetchServices]);

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
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#7B4DFF" />
        <Text style={styles.loaderText}>Loading seller profile...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerBtn}
        >
          <Icon name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Seller Profile</Text>

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
            <Icon name="settings-outline" size={22} color="#000" />
          </TouchableOpacity>
        </Tooltip>
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
          <View style={styles.walletCard}>
            <View style={styles.walletLeft}>
              <Icon name="wallet-outline" size={22} color="#7B4DFF" />
              <Text style={styles.walletTitle}>Seller Wallet</Text>
            </View>

            <Text style={styles.walletAmount}>{formatSummaryAmount(requestSummary, "completed")}</Text>
          </View>
        </Tooltip>

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
          <Text style={styles.sectionTitle}>Recent Requests</Text>

          {requestLoading ? (
            <ActivityIndicator style={{ marginTop: 16 }} />
          ) : recentRequests.length === 0 ? (
            <Text style={styles.emptyRequestText}>No pending requests right now.</Text>
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
          <Text style={styles.sectionTitle}>About Seller</Text>

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
          <Text style={styles.sectionTitle}>Professional Details</Text>

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
           <Text style={styles.sectionTitle}>All Services</Text>

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
    </View>
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
