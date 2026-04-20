import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
  Modal,
  RefreshControl
} from "react-native";
import { Alert } from "../utils/appAlert";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { formatCurrencyAmount, formatSummaryAmount } from "../utils/servicePricing";
import { openRazorpayCheckout } from "../utils/razorpayCheckout";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { useAppTheme } from "../theme/AppThemeContext";

type RequestParty = {
  _id?: string;
  name?: string;
  username?: string;
  sellerName?: string;
  specialization?: string;
  profilePic?: string;
};

type ServiceRequestRecord = {
  _id: string;
  status: "pending" | "pending_payment" | "payment_failed" | "paid" | "accepted" | "confirmed" | "rescheduled" | "declined" | "completed" | "cancelled" | "refund_needed" | "refunded";
  createdAt: string;
  note?: string;
  responseNote?: string;
  appointmentStart?: string | null;
  appointmentEnd?: string | null;
  appointmentTimezone?: string;
  appointmentDurationMinutes?: number;
  pricing?: {
    label?: string;
    amount?: number;
    currency?: string;
    durationMinutes?: number;
  };
  paymentStatus?: "pending" | "failed" | "paid" | "refund_needed" | "refunded" | "not_required";
  user?: RequestParty;
  service?: {
    _id?: string;
    serviceName?: string;
    image?: string;
  };
  seller?: RequestParty & { _id?: string };
};

type SlotOption = {
  start: string;
  label?: string;
};

type MockPaymentState = {
  request: ServiceRequestRecord;
  amountLabel: string;
};

const DEFAULT_AVATAR = DEFAULT_AVATAR_URL;

const statusColorMap: Record<string, string> = {
  pending: "#D97706",
  pending_payment: "#D97706",
  payment_failed: "#DC2626",
  paid: "#7C3AED",
  accepted: "#2563EB",
  confirmed: "#2563EB",
  rescheduled: "#8B5CF6",
  declined: "#DC2626",
  completed: "#059669",
  cancelled: "#6B7280",
  refund_needed: "#EA580C",
  refunded: "#2563EB",
};

const formatStatusLabel = (status = "") =>
  String(status || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .replace("Accepted", "Confirmed");

const ServiceRequestsScreen = ({ navigation, route }: any) => {
  const { colors } = useAppTheme();
  const mode = route?.params?.mode === "seller" ? "seller" : "user";
  const [requests, setRequests] = useState<ServiceRequestRecord[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [slotModalVisible, setSlotModalVisible] = useState(false);
  const [slotModalLoading, setSlotModalLoading] = useState(false);
  const [slotModalRequest, setSlotModalRequest] = useState<ServiceRequestRecord | null>(null);
  const [slotOptions, setSlotOptions] = useState<SlotOption[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [slotSubmitMode, setSlotSubmitMode] = useState<"accept" | "reschedule">("accept");
  const [mockPaymentState, setMockPaymentState] = useState<MockPaymentState | null>(null);

  const fetchData = useCallback(async ({ refresh = false } = {}) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const [requestsRes, summaryRes] = await Promise.all([
        API.get("/service-requests", { params: { role: mode } }),
        API.get("/service-requests/summary", { params: { role: mode } }),
      ]);

      setRequests((requestsRes.data?.requests || []) as ServiceRequestRecord[]);
      setSummary(summaryRes.data?.summary || null);
      setErrorMessage("");
    } catch (error) {
      console.log("service requests fetch error:", error);
      setRequests([]);
      setSummary(null);
      setErrorMessage(getReadableApiErrorMessage(error, "Failed to load service requests."));
    } finally {
      if (refresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [mode]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const updateStatus = useCallback(async (requestId: string, status: string) => {
    try {
      setUpdatingId(requestId);
      await API.put(`/service-requests/${requestId}/status`, { status });
      await fetchData();
    } catch (error: any) {
      console.log("service request update error:", error?.response?.data || error);
      Alert.alert("Error", getReadableApiErrorMessage(error, "Failed to update request"));
    } finally {
      setUpdatingId("");
    }
  }, [fetchData]);

  const formatAppointmentText = useCallback((item: ServiceRequestRecord) => {
    if (!item.appointmentStart) {
      return "";
    }

    const date = new Date(item.appointmentStart);
    const slotText = date.toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    if (item.appointmentDurationMinutes) {
      return `${slotText} (${item.appointmentDurationMinutes} min)`;
    }

    return slotText;
  }, []);

  const openSlotModal = useCallback(async (item: ServiceRequestRecord, nextMode: "accept" | "reschedule") => {
    try {
      setSlotModalVisible(true);
      setSlotModalLoading(true);
      setSlotModalRequest(item);
      setSlotSubmitMode(nextMode);

      const sellerId = item.seller?._id;
      const serviceId = item.service?._id;

      if (!sellerId || !serviceId) {
        setSlotOptions([]);
        setSelectedSlot("");
        return;
      }

      const res = await API.get(`/seller/${sellerId}/slots`, {
        params: { serviceId },
      });

      const nextSlots = Array.isArray(res.data?.slots) ? (res.data.slots as SlotOption[]) : [];
      setSlotOptions(nextSlots);
      setSelectedSlot(nextSlots[0]?.start || "");
    } catch (error) {
      console.log("slot modal fetch error:", error);
      setSlotOptions([]);
      setSelectedSlot("");
      Alert.alert("Error", getReadableApiErrorMessage(error, "Failed to load seller slots"));
    } finally {
      setSlotModalLoading(false);
    }
  }, []);

  const closeSlotModal = useCallback(() => {
    setSlotModalVisible(false);
    setSlotModalLoading(false);
    setSlotModalRequest(null);
    setSlotOptions([]);
    setSelectedSlot("");
    setSlotSubmitMode("accept");
  }, []);

  const submitSlotUpdate = useCallback(async () => {
    if (!slotModalRequest?._id || !selectedSlot) {
      return;
    }

    try {
      setUpdatingId(slotModalRequest._id);
      if (slotSubmitMode === "accept") {
        await API.put(`/service-requests/${slotModalRequest._id}/status`, {
          status: "confirmed",
          appointmentStart: selectedSlot,
          appointmentTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
        });
      } else {
        await API.put(`/service-requests/${slotModalRequest._id}/schedule`, {
          appointmentStart: selectedSlot,
          appointmentTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
        });
      }

      closeSlotModal();
      await fetchData();
    } catch (error: any) {
      console.log("slot submit error:", error?.response?.data || error);
      Alert.alert("Error", getReadableApiErrorMessage(error, "Failed to update appointment"));
    } finally {
      setUpdatingId("");
    }
  }, [closeSlotModal, fetchData, selectedSlot, slotModalRequest?._id, slotSubmitMode]);

  const payNow = useCallback(async (item: ServiceRequestRecord) => {
    try {
      setUpdatingId(item._id);
      const orderRes = await API.post(`/service-requests/${item._id}/payment/order`);
      const payment = orderRes.data?.payment;
      if (!payment) {
        throw new Error("Payment payload is missing");
      }

      if (payment?.isMock) {
        setMockPaymentState({
          request: item,
          amountLabel: item.pricing?.amount
            ? formatCurrencyAmount(item.pricing.amount, item.pricing.currency || "INR")
            : "Quoted later",
        });
        return;
      }

      const checkoutResult = await openRazorpayCheckout(payment);
      await API.post(`/service-requests/${item._id}/payment/verify`, checkoutResult);
      await fetchData();
      Alert.alert("Payment Complete", "Your booking has been paid and sent to the seller.");
    } catch (error: any) {
      const message = getReadableApiErrorMessage(
        error,
        error?.description || error?.message || "Failed to complete payment",
      );
      if (/cancel/i.test(message)) {
        Alert.alert("Payment Pending", "You can come back and pay for this booking at any time.");
      } else {
        Alert.alert("Error", message);
      }
    } finally {
      setUpdatingId("");
    }
  }, [fetchData]);

  const completeMockPayment = useCallback(async () => {
    if (!mockPaymentState?.request?._id) {
      return;
    }

    try {
      setUpdatingId(mockPaymentState.request._id);
      await API.post(`/service-requests/${mockPaymentState.request._id}/payment/verify`, {
        testMode: true,
        testPaymentId: `manual_test_pay_${Date.now()}`,
      });
      setMockPaymentState(null);
      await fetchData();
      Alert.alert("Payment Complete", "Test booking payment is marked complete and the seller has been notified.");
    } catch (error: any) {
      Alert.alert("Error", getReadableApiErrorMessage(error, "Failed to complete test payment"));
    } finally {
      setUpdatingId("");
    }
  }, [fetchData, mockPaymentState]);

  const renderActions = (item: ServiceRequestRecord) => {
    if (mode === "seller") {
      if (item.status === "pending" || item.status === "paid") {
        return (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={() => updateStatus(item._id, "confirmed")} disabled={updatingId === item._id}>
              <Text style={styles.actionBtnText}>{item.status === "paid" ? "Confirm" : "Accept"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.rescheduleBtn]} onPress={() => openSlotModal(item, "accept")} disabled={updatingId === item._id}>
              <Text style={styles.actionBtnText}>Change Time</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.declineBtn]} onPress={() => updateStatus(item._id, item.status === "paid" ? "refund_needed" : "declined")} disabled={updatingId === item._id}>
              <Text style={styles.actionBtnText}>{item.status === "paid" ? "Refund Review" : "Decline"}</Text>
            </TouchableOpacity>
          </View>
        );
      }

      if (item.status === "accepted" || item.status === "confirmed") {
        return (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, styles.rescheduleBtn]} onPress={() => openSlotModal(item, "reschedule")} disabled={updatingId === item._id}>
              <Text style={styles.actionBtnText}>Reschedule</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.completeBtn]} onPress={() => updateStatus(item._id, "completed")} disabled={updatingId === item._id}>
              <Text style={styles.actionBtnText}>Mark Completed</Text>
            </TouchableOpacity>
          </View>
        );
      }

      if (item.status === "refund_needed") {
        return (
          <TouchableOpacity style={[styles.actionBtn, styles.completeBtn]} onPress={() => updateStatus(item._id, "refunded")} disabled={updatingId === item._id}>
            <Text style={styles.actionBtnText}>Mark Refunded</Text>
          </TouchableOpacity>
        );
      }
    }

    if (mode === "user" && (item.status === "pending_payment" || item.status === "payment_failed")) {
      return (
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={() => payNow(item)} disabled={updatingId === item._id}>
            <Text style={styles.actionBtnText}>Pay Now</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.cancelBtn]} onPress={() => updateStatus(item._id, "cancelled")} disabled={updatingId === item._id}>
            <Text style={styles.actionBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (mode === "user" && (item.status === "paid" || item.status === "accepted" || item.status === "confirmed")) {
      return (
        <TouchableOpacity style={[styles.actionBtn, styles.cancelBtn]} onPress={() => updateStatus(item._id, "cancelled")} disabled={updatingId === item._id}>
          <Text style={styles.actionBtnText}>Cancel Booking</Text>
        </TouchableOpacity>
      );
    }

    if (mode === "user" && item.status === "rescheduled") {
      return (
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={() => updateStatus(item._id, "confirmed")} disabled={updatingId === item._id}>
            <Text style={styles.actionBtnText}>Accept New Time</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.cancelBtn]} onPress={() => updateStatus(item._id, "cancelled")} disabled={updatingId === item._id}>
            <Text style={styles.actionBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  const renderRequest = ({ item }: { item: ServiceRequestRecord }) => {
    const counterpart = mode === "seller" ? item.user : item.seller;
    const displayName = counterpart?.sellerName || counterpart?.name || counterpart?.username || "Aline2 user";
    const priceText = item.pricing?.amount
      ? formatCurrencyAmount(item.pricing.amount, item.pricing.currency || "INR")
      : "Quoted later";
    const statusColor = statusColorMap[item.status] || "#6B7280";
    const appointmentText = formatAppointmentText(item);
    const appointmentLabel = item.status === "accepted" || item.status === "confirmed" || item.status === "completed"
      ? "Scheduled for"
      : "Preferred slot";

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Image source={{ uri: counterpart?.profilePic || DEFAULT_AVATAR }} style={styles.avatar} />
          <View style={styles.cardMeta}>
            <Text style={styles.cardTitle}>{item.service?.serviceName || "Service request"}</Text>
            <Text style={styles.cardSubtitle}>{displayName}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: `${statusColor}18` }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{formatStatusLabel(item.status)}</Text>
          </View>
        </View>

        <Text style={styles.priceText}>
          {priceText}
          {item.pricing?.label ? ` / ${item.pricing.label.toLowerCase()}` : ""}
        </Text>

        {!!item.pricing?.durationMinutes && (
          <Text style={styles.metaLine}>Duration: {item.pricing.durationMinutes} min</Text>
        )}

        {!!appointmentText && (
          <Text style={styles.metaLine}>
            {appointmentLabel}: {appointmentText}
          </Text>
        )}

        {!!item.note && <Text style={styles.noteText}>Note: {item.note}</Text>}
        {!!item.responseNote && <Text style={styles.noteText}>Response: {item.responseNote}</Text>}
        {!!item.paymentStatus && (
          <Text style={styles.metaLine}>
            Payment: {formatStatusLabel(item.paymentStatus)}
          </Text>
        )}

        <Text style={styles.timeText}>
          {new Date(item.createdAt).toLocaleString()}
        </Text>

        {renderActions(item)}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{mode === "seller" ? "Appointments" : "My Appointments"}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.mutedText }]}>Total</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{summary?.total || 0}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.mutedText }]}>{mode === "seller" ? "Gross Paid" : "Paid"}</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{formatSummaryAmount(summary, "paid")}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.mutedText }]}>{mode === "seller" ? "Completed" : "Spent"}</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{formatSummaryAmount(summary, "completed")}</Text>
        </View>
      </View>

      <FlatList
        data={requests}
        keyExtractor={(item) => item._id}
        renderItem={renderRequest}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              fetchData({ refresh: true }).catch((error) => {
                console.log("service requests refresh error:", error);
              });
            }}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {errorMessage ? "Appointments unavailable" : "No appointments yet"}
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedText }]}>
              {errorMessage || (mode === "seller"
                ? "Appointment requests from users will appear here."
                : "Request an appointment with a seller to see it here.")}
            </Text>
          </View>
        }
      />

      <Modal visible={slotModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {slotSubmitMode === "accept" ? "Pick a slot and accept" : "Reschedule appointment"}
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedText }]}>
              {slotModalRequest?.service?.serviceName || "Appointment"}
            </Text>

            {slotModalLoading ? (
              <ActivityIndicator size="large" color="#7B4DFF" />
            ) : slotOptions.length ? (
              <View style={styles.slotList}>
                {slotOptions.map((slot) => {
                  const isSelected = selectedSlot === slot.start;
                  return (
                    <TouchableOpacity
                      key={slot.start}
                      style={[styles.slotChip, isSelected && styles.slotChipActive]}
                      onPress={() => setSelectedSlot(slot.start)}
                    >
                      <Text style={[styles.slotChipText, isSelected && styles.slotChipTextActive]}>
                        {slot.label || new Date(slot.start).toLocaleString()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text style={[styles.modalEmptyText, { color: colors.mutedText }]}>No bookable slots are available right now.</Text>
            )}

            <TouchableOpacity
              style={[styles.modalPrimaryButton, (!selectedSlot || slotModalLoading || !slotOptions.length) && styles.modalPrimaryButtonDisabled]}
              onPress={() => {
                submitSlotUpdate().catch((error) => {
                  console.log("slot submit error:", error);
                });
              }}
              disabled={!selectedSlot || slotModalLoading || !slotOptions.length}
            >
              <Text style={styles.modalPrimaryButtonText}>
                {slotSubmitMode === "accept" ? "Schedule & Accept" : "Save New Time"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={closeSlotModal}>
              <Text style={[styles.modalCancelText, { color: colors.mutedText }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!mockPaymentState} transparent animationType="fade" onRequestClose={() => setMockPaymentState(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Payment Required</Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedText }]}>
              Live payment gateway abhi configured nahi hai. Testing ke liye demo payment continue karke booking confirm kar sakte ho.
            </Text>
            <View style={styles.mockPaymentCard}>
              <Text style={styles.mockPaymentLabel}>{mockPaymentState?.request?.service?.serviceName || "Appointment"}</Text>
              <Text style={styles.mockPaymentAmount}>{mockPaymentState?.amountLabel || "Quoted later"}</Text>
            </View>
            <TouchableOpacity
              style={[styles.modalPrimaryButton, updatingId === mockPaymentState?.request?._id && styles.modalPrimaryButtonDisabled]}
              onPress={() => {
                completeMockPayment().catch((error) => {
                  console.log("mock payment error:", error);
                });
              }}
              disabled={updatingId === mockPaymentState?.request?._id}
            >
              <Text style={styles.modalPrimaryButtonText}>Pay & Book for Testing</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMockPaymentState(null)} disabled={updatingId === mockPaymentState?.request?._id}>
              <Text style={[styles.modalCancelText, { color: colors.mutedText }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default ServiceRequestsScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F8FC" },
  header: {
    paddingTop: 12,
    paddingBottom: 16,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#111" },
  summaryRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingTop: 16
  },
  summaryCard: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  summaryLabel: { color: "#666", fontSize: 12, marginBottom: 6 },
  summaryValue: { color: "#111", fontSize: 17, fontWeight: "700" },
  listContent: { padding: 14, paddingBottom: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14
  },
  cardHeader: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
  cardMeta: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#111" },
  cardSubtitle: { marginTop: 3, color: "#666" },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusText: { fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  priceText: { marginTop: 14, fontSize: 15, fontWeight: "700", color: "#6B46FF" },
  metaLine: { marginTop: 6, color: "#666" },
  noteText: { marginTop: 8, color: "#444", lineHeight: 18 },
  timeText: { marginTop: 10, color: "#888", fontSize: 12 },
  actionRow: { flexDirection: "row", marginTop: 14 },
  actionBtn: { marginTop: 14, borderRadius: 12, paddingVertical: 10, alignItems: "center", flex: 1 },
  acceptBtn: { backgroundColor: "#2563EB", marginRight: 8 },
  rescheduleBtn: { backgroundColor: "#7C3AED", marginHorizontal: 4 },
  declineBtn: { backgroundColor: "#DC2626", marginLeft: 8 },
  completeBtn: { backgroundColor: "#059669" },
  cancelBtn: { backgroundColor: "#6B7280" },
  actionBtnText: { color: "#fff", fontWeight: "700" },
  emptyState: { alignItems: "center", paddingTop: 80, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#111" },
  emptyText: { marginTop: 8, color: "#666", textAlign: "center", lineHeight: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17,24,39,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  modalSubtitle: {
    marginTop: 6,
    color: "#6B7280",
    marginBottom: 14,
  },
  slotList: {
    marginTop: 4,
  },
  slotChip: {
    borderWidth: 1,
    borderColor: "#DDD6FE",
    backgroundColor: "#F5F3FF",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  slotChipActive: {
    borderColor: "#7C3AED",
    backgroundColor: "#7C3AED",
  },
  slotChipText: {
    color: "#4C1D95",
    fontWeight: "600",
  },
  slotChipTextActive: {
    color: "#fff",
  },
  modalEmptyText: {
    color: "#6B7280",
    lineHeight: 20,
  },
  modalPrimaryButton: {
    marginTop: 16,
    backgroundColor: "#7C3AED",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalPrimaryButtonDisabled: {
    opacity: 0.5,
  },
  modalPrimaryButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  modalCancelText: {
    marginTop: 12,
    color: "#6B7280",
    textAlign: "center",
    fontWeight: "600",
  },
  mockPaymentCard: {
    marginTop: 8,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#F5F3FF",
  },
  mockPaymentLabel: {
    color: "#5B21B6",
    fontSize: 12,
    fontWeight: "700",
  },
  mockPaymentAmount: {
    marginTop: 4,
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
  },
});
