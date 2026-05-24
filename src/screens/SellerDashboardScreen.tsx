import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Switch,
  useWindowDimensions,
} from "react-native";
import { Alert } from "../utils/appAlert";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { monetizationDisabledMessage, productFlags } from "../config/productFlags";
import { appConfig } from "../config/env";
import { formatPrimaryServicePrice, formatSummaryAmount } from "../utils/servicePricing";
import { shareContentLink } from "../utils/shareLinks";
import { DEFAULT_AVATAR_URL, DEFAULT_COVER_URL } from "../constants/defaultAssets";
import { useAppTheme } from "../theme/AppThemeContext";
import AppBottomDock, { APP_BOTTOM_DOCK_BASE_HEIGHT } from "../components/AppBottomDock";

const DEFAULT_COVER = DEFAULT_COVER_URL;
const DEFAULT_AVATAR = DEFAULT_AVATAR_URL;
const ACTIVE_APPOINTMENT_STATUSES = new Set(["paid", "accepted", "confirmed", "rescheduled", "completed"]);
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatRequestStatus = (value = "") =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());

const formatAppointmentSummary = (item: any) => {
  if (!item?.appointmentStart) {
    return "Waiting for appointment time";
  }

  const startDate = new Date(item.appointmentStart);
  if (Number.isNaN(startDate.getTime())) {
    return "Appointment time unavailable";
  }

  const baseLabel = startDate.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const durationMinutes = Number(item?.appointmentDurationMinutes) || 0;
  return durationMinutes > 0 ? `${baseLabel} • ${durationMinutes} min` : baseLabel;
};

const formatMinutesLabel = (minutes = 0) => {
  const date = new Date();
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
};

const getSummaryTotal = (summary: any, amountKey: string, totalsKey: string) => {
  const totals = Array.isArray(summary?.[totalsKey]) ? summary[totalsKey] : [];
  if (totals.length) {
    return totals.reduce((sum: number, item: any) => sum + (Number(item?.amount) || 0), 0);
  }

  return Number(summary?.[amountKey]) || 0;
};

const buildAvailabilityPreview = (seller: any) => {
  const weeklyAvailability = Array.isArray(seller?.weeklyAvailability) ? seller.weeklyAvailability : [];
  const enabledDays = weeklyAvailability
    .filter((entry: any) => entry?.enabled)
    .sort((a: any, b: any) => Number(a?.dayOfWeek) - Number(b?.dayOfWeek));

  if (!enabledDays.length) {
    return {
      title: "No booking hours shared yet",
      detail: "Turn on the days and timings you want buyers to book.",
    };
  }

  const firstWindow = enabledDays[0];
  const lastWindow = enabledDays[enabledDays.length - 1];

  return {
    title: `${DAY_LABELS[firstWindow.dayOfWeek]} - ${DAY_LABELS[lastWindow.dayOfWeek]}`,
    detail: `${formatMinutesLabel(firstWindow.startMinutes)} - ${formatMinutesLabel(firstWindow.endMinutes)}${seller?.availabilityTimezone ? ` • ${seller.availabilityTimezone}` : ""}`,
  };
};

const showAvailabilityStatusModal = (nextStatus: boolean) => {
  Alert.alert(
    nextStatus ? "You're now able to get appointments" : "You're now marked as I am Out",
    nextStatus
      ? "You are visible to users for appointments and chat requests."
      : "You will not be visible to users for new appointments until you switch back in.",
  );
};

const SellerDashboardScreen = ({ navigation }: any) => {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
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
  const [availabilityUpdating, setAvailabilityUpdating] = useState(false);
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
      API.get("/service-requests", { params: { role: "seller" } })
    ]);

    const nextRequests = Array.isArray(requestsRes.data?.requests) ? requestsRes.data.requests : [];
    const prioritizedRequests = nextRequests
      .filter((item: any) => ACTIVE_APPOINTMENT_STATUSES.has(String(item?.status || "")))
      .concat(nextRequests.filter((item: any) => !ACTIVE_APPOINTMENT_STATUSES.has(String(item?.status || ""))));

    setRequestSummary(summaryRes.data?.summary || null);
    setRecentRequests(prioritizedRequests.slice(0, 4));
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
        if (!res.data.seller?.onboardingCompleted) {
          navigation.replace("SellerRegistration", { mode: "create", initialStep: 3 });
          return;
        }
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

  const availabilityPreview = buildAvailabilityPreview(seller);
  const isCompactLayout = width < 380;
  const pendingPayoutAmount = getSummaryTotal(
    requestSummary,
    "settlementPendingAmount",
    "settlementPendingAmountByCurrency",
  );
  const paidSellerAmount = getSummaryTotal(requestSummary, "paidAmount", "paidAmountByCurrency");
  const sellerRevenueKey = pendingPayoutAmount > 0 ? "settlementPending" : paidSellerAmount > 0 ? "paid" : "completed";
  const dashboardRevenueKey = productFlags.sellerMonetizationInConsumerApp ? sellerRevenueKey : "completed";
  const sellerRevenueTitle = pendingPayoutAmount > 0 ? "Pending Payout" : "Seller Earnings";
  const sellerRevenueHint = pendingPayoutAmount > 0 ? "2-day hold active" : "80% seller share";
  const heroStatusColor = seller?.availabilityStatus ? "#22C55E" : "#F59E0B";
  const heroStatusLabel = seller?.availabilityStatus ? "I am In" : "I am Out";
  const heroStatusCopy = seller?.availabilityStatus
    ? "Users can discover you and start chats right now."
    : "Your profile stays visible, but buyer messaging stays paused.";
  const sellerHandle = String(seller?.user?.username || "").trim()
    ? `@${String(seller?.user?.username || "").trim()}`
    : "Aline2 seller";
  const sellerMetricCards = [
    {
      label: "Experience",
      value: seller?.experience ? `${seller.experience}` : "0",
      detail: "Years",
    },
    {
      label: "Services",
      value: `${services.length || 0}`,
      detail: "Live",
    },
    {
      label: "Appointments",
      value: `${recentRequests.length || 0}`,
      detail: "Recent",
    },
    {
      label: "Coins",
      value: `${Number(seller?.sellerCoins || 0)}`,
      detail: "Credits",
    },
  ];

  const toggleSellerAvailability = useCallback(async (nextStatus: boolean) => {
    if (!seller || availabilityUpdating) {
      return;
    }

    const previousStatus = Boolean(seller?.availabilityStatus);
    setAvailabilityUpdating(true);
    setSeller((current: any) => (current ? { ...current, availabilityStatus: nextStatus } : current));

    try {
      await API.put("/seller/update-availability", { availabilityStatus: nextStatus });
      showAvailabilityStatusModal(nextStatus);
    } catch (error) {
      setSeller((current: any) => (current ? { ...current, availabilityStatus: previousStatus } : current));
      Alert.alert("Unable to update status", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setAvailabilityUpdating(false);
    }
  }, [availabilityUpdating, seller]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <SafeAreaView style={[styles.loaderContainer, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loaderText, { color: colors.mutedText }]}>Loading seller profile...</Text>
        </SafeAreaView>
        <AppBottomDock navigation={navigation} activeRouteName="ProfileView" />
      </View>
    );
  }

  if (!seller) {
    return (
      <View style={styles.screen}>
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
        <AppBottomDock navigation={navigation} activeRouteName="ProfileView" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[styles.headerBtn, { backgroundColor: colors.surface }]}
          >
            <Icon name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.headerTitleGroup}>
            <Text style={[styles.headerEyebrow, { color: colors.primary }]}>Workspace</Text>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Seller Dashboard</Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.headerBtn, { backgroundColor: colors.surface }]}
              onPress={() =>
                navigation.navigate("SellerSettingsScreen", {
                  seller
                })
              }
            >
              <Icon name="settings-outline" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={[styles.container, { backgroundColor: colors.background }]}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.contentContainer, { paddingBottom: APP_BOTTOM_DOCK_BASE_HEIGHT + 40 }]}
        >
        <View style={[styles.bannerContainer, { marginHorizontal: isCompactLayout ? 12 : 18 }]}>
          <Image
            source={{ uri: seller?.coverPic || DEFAULT_COVER }}
            style={[styles.banner, { height: isCompactLayout ? 210 : 244 }]}
          />
          <View style={styles.bannerOverlay} />

          <TouchableOpacity
            style={[styles.editBanner, { backgroundColor: "rgba(10,15,28,0.68)" }]}
            onPress={() =>
              navigation.navigate("SellerSettingsScreen", {
                seller
              })
            }
          >
            <Icon name="camera" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.profileSection,
            {
              marginHorizontal: isCompactLayout ? 12 : 18,
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <Image
            source={{ uri: seller?.profilePic || DEFAULT_AVATAR }}
            style={[styles.profile, { borderColor: colors.card }]}
          />

          <Text style={[styles.name, { color: colors.text }]}>
            {seller?.sellerName || "Seller Profile"}
          </Text>
          <Text style={[styles.profileHandle, { color: colors.mutedText }]}>
            {sellerHandle}
          </Text>

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

          {!!seller?.specialization && (
            <Text style={[styles.tagline, { color: colors.mutedText }]}>{seller.specialization}</Text>
          )}

          <View style={[styles.heroStatusCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.heroStatusCopy}>
              <View style={styles.heroStatusRow}>
                <View style={[styles.heroStatusDot, { backgroundColor: heroStatusColor }]} />
                <Text style={[styles.heroStatusLabel, { color: colors.text }]}>{heroStatusLabel}</Text>
              </View>
              <Text style={[styles.heroStatusText, { color: colors.mutedText }]}>
                {heroStatusCopy}
              </Text>
            </View>

            <Switch
              value={Boolean(seller?.availabilityStatus)}
              onValueChange={toggleSellerAvailability}
              disabled={availabilityUpdating}
              thumbColor="#FFFFFF"
              trackColor={{ false: `${colors.border}`, true: `${colors.primary}` }}
              ios_backgroundColor={colors.border}
            />
          </View>

          <View style={styles.statusChipRow}>
            <View style={[styles.statusChip, { backgroundColor: `${colors.primary}14` }]}>
              <Text style={[styles.statusChipText, { color: colors.primary }]}>Buyer visibility</Text>
            </View>
            <View style={[styles.statusChip, { backgroundColor: seller?.availabilityStatus ? "rgba(34,197,94,0.14)" : "rgba(245,158,11,0.14)" }]}>
              <Text style={[styles.statusChipText, { color: heroStatusColor }]}>
                {seller?.availabilityStatus ? "Chat unlocked" : "Chat paused"}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.metricGrid, { marginHorizontal: isCompactLayout ? 12 : 18 }]}>
          {sellerMetricCards.map((metric) => (
            <View key={metric.label} style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.metricValue, { color: colors.text }]}>{metric.value}</Text>
              <Text style={[styles.metricLabel, { color: colors.mutedText }]}>{metric.label}</Text>
              <Text style={[styles.metricDetail, { color: colors.primary }]}>{metric.detail}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.walletCard, { backgroundColor: colors.card, borderColor: colors.border, marginHorizontal: isCompactLayout ? 12 : 18 }]}>
          <View style={styles.walletLeft}>
            <View style={[styles.walletIconWrap, { backgroundColor: `${colors.primary}14` }]}>
              <Icon name="wallet-outline" size={22} color={colors.primary} />
            </View>
            <View>
              <Text style={[styles.walletEyebrow, { color: colors.mutedText }]}>Revenue snapshot</Text>
              <Text style={[styles.walletTitle, { color: colors.text }]}>
                {productFlags.sellerMonetizationInConsumerApp ? sellerRevenueTitle : "Completed Request Value"}
              </Text>
              {productFlags.sellerMonetizationInConsumerApp ? (
                <Text style={[styles.walletHint, { color: colors.mutedText }]}>{sellerRevenueHint}</Text>
              ) : null}
            </View>
          </View>

          <Text style={[styles.walletAmount, { color: colors.text }]}>{formatSummaryAmount(requestSummary, dashboardRevenueKey)}</Text>
        </View>

        {!productFlags.sellerMonetizationInConsumerApp ? (
          <View style={[styles.readOnlyInfoCard, { backgroundColor: colors.card, borderColor: colors.border, marginHorizontal: isCompactLayout ? 12 : 18 }]}>
            <Icon name="information-circle-outline" size={18} color="#6b7280" />
            <Text style={[styles.readOnlyInfoText, { color: colors.mutedText }]}>{monetizationDisabledMessage}</Text>
          </View>
        ) : null}

        <View style={[styles.actionRow, { marginHorizontal: isCompactLayout ? 12 : 18 }]}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() =>
              navigation.navigate("AddServiceScreen", {
                seller
              })
            }
          >
            <Icon name="add" size={18} color="#fff" />
            <Text style={styles.btnText}> Add Service</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => navigation.navigate("ServiceRequestsScreen", { mode: "seller" })}
          >
            <Icon name="calendar-outline" size={18} color={colors.text} />
            <Text style={[styles.btnText2, { color: colors.text }]}> View Appointments</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.availabilityCard, { backgroundColor: colors.card, borderColor: colors.border, marginHorizontal: isCompactLayout ? 12 : 18 }]}>
          <View style={styles.availabilityCardHeader}>
            <View>
              <Text style={[styles.availabilityCardTitle, { color: colors.text }]}>Booking Availability</Text>
              <Text style={[styles.availabilityCardState, { color: seller?.availabilityStatus ? "#16A34A" : "#B45309" }]}>
                {seller?.availabilityStatus ? "Visible to buyers" : "Hidden from buyers"}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.availabilityEditButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => navigation.navigate("SellerSettingsScreen", { seller })}
            >
              <Text style={[styles.availabilityEditText, { color: colors.primary }]}>Edit</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.availabilityCardBody, { color: colors.text }]}>
            {availabilityPreview.title}
          </Text>
          <Text style={[styles.availabilityCardHint, { color: colors.mutedText }]}>
            {availabilityPreview.detail}
          </Text>
          <Text style={[styles.availabilityCardFootnote, { color: colors.mutedText }]}>
            Buyers see these seller-set slots when booking an appointment.
          </Text>
        </View>

        <View style={[styles.section, { paddingHorizontal: isCompactLayout ? 12 : 18 }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>My Appointments</Text>
            <TouchableOpacity onPress={() => navigation.navigate("ServiceRequestsScreen", { mode: "seller" })}>
              <Text style={styles.sectionLink}>View All</Text>
            </TouchableOpacity>
          </View>

          {requestLoading ? (
            <ActivityIndicator style={{ marginTop: 16 }} />
          ) : requestError ? (
            <Text style={[styles.emptyRequestText, { color: colors.mutedText }]}>{requestError}</Text>
          ) : recentRequests.length === 0 ? (
            <Text style={[styles.emptyRequestText, { color: colors.mutedText }]}>No appointments right now.</Text>
          ) : (
            recentRequests.map((item: any) => (
              <View key={item._id} style={[styles.requestCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.requestTitle, { color: colors.text }]}>{item.service?.serviceName || "Service request"}</Text>
                  <Text style={[styles.requestSubtitle, { color: colors.mutedText }]}>{item.user?.name || item.user?.username || "Client"}</Text>
                  <Text style={[styles.requestMeta, { color: colors.mutedText }]}>{formatAppointmentSummary(item)}</Text>
                  <Text style={[styles.requestStatus, { color: colors.primary }]}>{formatRequestStatus(item?.status)}</Text>
                </View>
                <Text style={[styles.requestPrice, { color: colors.text }]}>
                  {formatPrimaryServicePrice({ pricingOptions: [item.pricing], currency: item.pricing?.currency })}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={[styles.section, { paddingHorizontal: isCompactLayout ? 12 : 18 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>About Seller</Text>

          <Text
            numberOfLines={expanded ? undefined : 3}
            style={[styles.desc, { color: colors.mutedText }]}
          >
            {seller?.bio?.trim()
              ? seller.bio
              : "No seller bio added yet."}
          </Text>

          {!!seller?.bio && seller.bio.length > 120 && (
            <TouchableOpacity onPress={() => setExpanded(!expanded)}>
              <Text style={[styles.readMore, { color: colors.primary }]}>
                {expanded ? "Show Less" : "Read More"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.section, { paddingHorizontal: isCompactLayout ? 12 : 18 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Professional Details</Text>

          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.infoLabel, { color: colors.mutedText }]}>Specialization</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {seller?.specialization || "N/A"}
              </Text>
            </View>

            <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.infoLabel, { color: colors.mutedText }]}>Experience</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {seller?.experience ? `${seller.experience} Years` : "N/A"}
              </Text>
            </View>

            <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.infoLabel, { color: colors.mutedText }]}>Clinic Link</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {seller?.clinicLink || "N/A"}
              </Text>
            </View>

            <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.infoLabel, { color: colors.mutedText }]}>Degree</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {seller?.degree || "N/A"}
              </Text>
            </View>

            <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.infoLabel, { color: colors.mutedText }]}>License</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {seller?.license || "N/A"}
              </Text>
            </View>

            <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.infoLabel, { color: colors.mutedText }]}>Status</Text>
              <Text style={[styles.infoValue, { color: heroStatusColor }]}>
                {seller?.availabilityStatus ? "In" : "Out"}
              </Text>
            </View>

            <View style={[styles.infoRow, { borderBottomColor: "transparent" }]}>
              <Text style={[styles.infoLabel, { color: colors.mutedText }]}>DigiLocker</Text>
              <Text
                style={[
                  styles.infoValue,
                  { textAlign: "right" },
                  { color: seller?.digilockerVerified ? "#16A34A" : "#DC2626" }
                ]}
              >
                {seller?.digilockerVerified ? "Verified" : "Not Verified"}
              </Text>
            </View>
          </View>
        </View>

       <View style={[styles.section, { paddingHorizontal: isCompactLayout ? 12 : 18 }]}>
         <View style={styles.serviceHeader}>
           <Text style={[styles.sectionTitle, { color: colors.text }]}>All Services</Text>

           <TouchableOpacity
             onPress={() =>
               navigation.navigate("AddServiceScreen", {
                 seller
               })
             }
           >
             <Text style={[styles.addService, { color: colors.primary }]}>+ Add New</Text>
           </TouchableOpacity>
         </View>

         {/* LOADING */}
         {serviceLoading ? (
           <ActivityIndicator style={{ marginTop: 20 }} />
         ) : serviceError ? (
           <Text style={[styles.noServiceSub, { color: colors.mutedText }]}>{serviceError}</Text>
         ) : services.length === 0 ? (
           <View style={[styles.emptyService, { backgroundColor: colors.card, borderColor: colors.border }]}>
             <Icon name="briefcase-outline" size={40} color={colors.mutedText} />
             <Text style={[styles.noService, { color: colors.text }]}>No services added yet</Text>
             <Text style={[styles.noServiceSub, { color: colors.mutedText }]}>
               Add your first service to start receiving bookings.
             </Text>
           </View>
         ) : (
           services.map((item: any) => (
             <View key={item._id} style={[styles.serviceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>

               {!!item.image && (
                 <Image
                   source={{ uri: item.image }}
                   style={styles.serviceImage}
                 />
               )}

               <Text style={[styles.serviceName, { color: colors.text }]}>{item.serviceName}</Text>

               <Text numberOfLines={2} style={[styles.serviceDesc, { color: colors.mutedText }]}>
                 {item.description}
               </Text>

               {/* PRICE */}
               <View style={{ flexDirection: "row", marginTop: 6 }}>
                 <Text style={[styles.priceTag, { backgroundColor: colors.surface, color: colors.primary }]}>{formatPrimaryServicePrice(item)}</Text>
               </View>

               {/* ACTIONS */}
               <View style={styles.serviceActions}>

                 <TouchableOpacity
                   onPress={() =>
                     navigation.navigate("EditServiceScreen", { service: item })
                   }
                 >
                   <Icon name="create-outline" size={20} color={colors.text} />
                 </TouchableOpacity>

                 <TouchableOpacity
                   onPress={() => handleDeleteService(item._id)}
                 >
                   <Icon name="trash-outline" size={20} color="#EF4444" />
                 </TouchableOpacity>

                 <TouchableOpacity
                   onPress={() => handleShareService(item)}
                 >
                   <Icon name="share-social-outline" size={20} color={colors.text} />
                 </TouchableOpacity>

               </View>

             </View>
           ))
         )}
       </View>
        </ScrollView>
      </SafeAreaView>
      <AppBottomDock navigation={navigation} activeRouteName="ProfileView" />
    </View>
  );
};

export default SellerDashboardScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 40,
    borderBottomWidth: 1,
    borderBottomColor: "#eee"
  },

  headerTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#111"
  },
  headerTitleGroup: {
    flex: 1,
    paddingHorizontal: 14,
  },
  headerEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  container: {
    flex: 1,
    backgroundColor: "#fff"
  },
  contentContainer: {
    paddingTop: 12,
  },

  bannerContainer: {
    position: "relative",
    borderRadius: 28,
    overflow: "hidden",
  },

  banner: {
    width: "100%",
    height: 220
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6,10,18,0.28)",
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
    marginTop: -58,
    marginBottom: 6,
    paddingHorizontal: 18,
    paddingTop: 0,
    paddingBottom: 18,
    borderRadius: 28,
    borderWidth: 1,
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
  profileHandle: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "600",
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
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  heroStatusCard: {
    width: "100%",
    marginTop: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  heroStatusCopy: {
    flex: 1,
    paddingRight: 14,
  },
  heroStatusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  heroStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  heroStatusLabel: {
    fontSize: 15,
    fontWeight: "800",
  },
  heroStatusText: {
    marginTop: 6,
    fontSize: 12.5,
    lineHeight: 18,
  },
  statusChipRow: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: "800",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  metricCard: {
    width: "48.5%",
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  metricLabel: {
    marginTop: 8,
    fontSize: 12.5,
    fontWeight: "700",
  },
  metricDetail: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "800",
  },

  walletCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 18,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },

  walletLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 12,
  },
  walletIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  walletEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  walletTitle: {
    fontWeight: "600",
    color: "#111"
  },
  walletHint: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
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
    marginTop: 16
  },
  availabilityCard: {
    marginHorizontal: 20,
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  availabilityCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  availabilityCardTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  availabilityCardState: {
    marginTop: 4,
    fontSize: 12.5,
    fontWeight: "700",
  },
  availabilityEditButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  availabilityEditText: {
    fontSize: 12.5,
    fontWeight: "700",
  },
  availabilityCardBody: {
    marginTop: 14,
    fontSize: 15,
    fontWeight: "700",
  },
  availabilityCardHint: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
  },
  availabilityCardFootnote: {
    marginTop: 10,
    fontSize: 12.5,
    lineHeight: 18,
  },

  primaryBtn: {
    flex: 1,
    backgroundColor: "#7B4DFF",
    padding: 14,
    borderRadius: 16,
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
    borderRadius: 16,
    borderWidth: 1,
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
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionLink: {
    color: "#7B4DFF",
    fontWeight: "700",
    fontSize: 13,
  },

  desc: {
    marginTop: 8,
    color: "#555",
    lineHeight: 20
  },
  requestCard: {
    marginTop: 12,
    backgroundColor: "#FAFAFA",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
  },
  requestTitle: {
    fontWeight: "700",
    color: "#111"
  },
  requestSubtitle: {
    marginTop: 4,
    color: "#666"
  },
  requestMeta: {
    marginTop: 6,
    color: "#5B4B76",
    fontSize: 12,
    fontWeight: "600",
  },
  requestStatus: {
    marginTop: 4,
    color: "#7B4DFF",
    fontSize: 12,
    fontWeight: "700",
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
    borderRadius: 18,
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
    paddingVertical: 30,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 18,
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
  borderRadius: 18,
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
