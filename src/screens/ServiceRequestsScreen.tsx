import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { formatCurrencyAmount, formatSummaryAmount } from "../utils/servicePricing";

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
  status: "pending" | "accepted" | "declined" | "completed" | "cancelled";
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

const DEFAULT_AVATAR = "https://cdn-icons-png.flaticon.com/512/149/149071.png";

const statusColorMap: Record<string, string> = {
  pending: "#D97706",
  accepted: "#2563EB",
  declined: "#DC2626",
  completed: "#059669",
  cancelled: "#6B7280",
};

const ServiceRequestsScreen = ({ navigation, route }: any) => {
  const mode = route?.params?.mode === "seller" ? "seller" : "user";
  const [requests, setRequests] = useState<ServiceRequestRecord[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [slotModalVisible, setSlotModalVisible] = useState(false);
  const [slotModalLoading, setSlotModalLoading] = useState(false);
  const [slotModalRequest, setSlotModalRequest] = useState<ServiceRequestRecord | null>(null);
  const [slotOptions, setSlotOptions] = useState<SlotOption[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [slotSubmitMode, setSlotSubmitMode] = useState<"accept" | "reschedule">("accept");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [requestsRes, summaryRes] = await Promise.all([
        API.get("/service-requests", { params: { role: mode } }),
        API.get("/service-requests/summary", { params: { role: mode } }),
      ]);

      setRequests((requestsRes.data?.requests || []) as ServiceRequestRecord[]);
      setSummary(summaryRes.data?.summary || null);
    } catch (error) {
      console.log("service requests fetch error:", error);
      Alert.alert("Error", "Failed to load service requests");
    } finally {
      setLoading(false);
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
      Alert.alert("Error", error?.response?.data?.message || "Failed to update request");
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
      Alert.alert("Error", "Failed to load seller slots");
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
          status: "accepted",
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
      Alert.alert("Error", error?.response?.data?.message || "Failed to update appointment");
    } finally {
      setUpdatingId("");
    }
  }, [closeSlotModal, fetchData, selectedSlot, slotModalRequest?._id, slotSubmitMode]);

  const renderActions = (item: ServiceRequestRecord) => {
    if (mode === "seller") {
      if (item.status === "pending") {
        return (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={() => updateStatus(item._id, "accepted")} disabled={updatingId === item._id}>
              <Text style={styles.actionBtnText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.rescheduleBtn]} onPress={() => openSlotModal(item, "accept")} disabled={updatingId === item._id}>
              <Text style={styles.actionBtnText}>Change Time</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.declineBtn]} onPress={() => updateStatus(item._id, "declined")} disabled={updatingId === item._id}>
              <Text style={styles.actionBtnText}>Decline</Text>
            </TouchableOpacity>
          </View>
        );
      }

      if (item.status === "accepted") {
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
    }

    if (mode === "user" && (item.status === "pending" || item.status === "accepted")) {
      return (
        <TouchableOpacity style={[styles.actionBtn, styles.cancelBtn]} onPress={() => updateStatus(item._id, "cancelled")} disabled={updatingId === item._id}>
          <Text style={styles.actionBtnText}>Cancel Request</Text>
        </TouchableOpacity>
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
    const appointmentLabel = item.status === "accepted" || item.status === "completed"
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
            <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
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

        <Text style={styles.timeText}>
          {new Date(item.createdAt).toLocaleString()}
        </Text>

        {renderActions(item)}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{mode === "seller" ? "Appointments" : "My Appointments"}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total</Text>
          <Text style={styles.summaryValue}>{summary?.total || 0}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>{mode === "seller" ? "Active Value" : "Active Spend"}</Text>
          <Text style={styles.summaryValue}>{formatSummaryAmount(summary, "active")}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>{mode === "seller" ? "Completed" : "Spent"}</Text>
          <Text style={styles.summaryValue}>{formatSummaryAmount(summary, "completed")}</Text>
        </View>
      </View>

      <FlatList
        data={requests}
        keyExtractor={(item) => item._id}
        renderItem={renderRequest}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No appointments yet</Text>
            <Text style={styles.emptyText}>
              {mode === "seller"
                ? "Appointment requests from users will appear here."
                : "Request an appointment with a seller to see it here."}
            </Text>
          </View>
        }
      />

      <Modal visible={slotModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {slotSubmitMode === "accept" ? "Pick a slot and accept" : "Reschedule appointment"}
            </Text>
            <Text style={styles.modalSubtitle}>
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
              <Text style={styles.modalEmptyText}>No bookable slots are available right now.</Text>
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
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default ServiceRequestsScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F8FC" },
  header: {
    paddingTop: 54,
    paddingBottom: 16,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee"
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#111" },
  summaryRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingTop: 16
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#fff",
    marginHorizontal: 4,
    borderRadius: 14,
    padding: 14
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
});
