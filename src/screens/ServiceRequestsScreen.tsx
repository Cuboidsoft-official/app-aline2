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
  pricing?: {
    label?: string;
    amount?: number;
    currency?: string;
    durationMinutes?: number;
  };
  user?: RequestParty;
  seller?: RequestParty;
  service?: {
    serviceName?: string;
    image?: string;
  };
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

  const renderActions = (item: ServiceRequestRecord) => {
    if (mode === "seller") {
      if (item.status === "pending") {
        return (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={() => updateStatus(item._id, "accepted")} disabled={updatingId === item._id}>
              <Text style={styles.actionBtnText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.declineBtn]} onPress={() => updateStatus(item._id, "declined")} disabled={updatingId === item._id}>
              <Text style={styles.actionBtnText}>Decline</Text>
            </TouchableOpacity>
          </View>
        );
      }

      if (item.status === "accepted") {
        return (
          <TouchableOpacity style={[styles.actionBtn, styles.completeBtn]} onPress={() => updateStatus(item._id, "completed")} disabled={updatingId === item._id}>
            <Text style={styles.actionBtnText}>Mark Completed</Text>
          </TouchableOpacity>
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
        <Text style={styles.headerTitle}>{mode === "seller" ? "Appointments" : "My Requests"}</Text>
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
            <Text style={styles.emptyTitle}>No requests yet</Text>
            <Text style={styles.emptyText}>
              {mode === "seller"
                ? "Service requests from users will appear here."
                : "Book a seller service to create your first request."}
            </Text>
          </View>
        }
      />
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
  declineBtn: { backgroundColor: "#DC2626", marginLeft: 8 },
  completeBtn: { backgroundColor: "#059669" },
  cancelBtn: { backgroundColor: "#6B7280" },
  actionBtnText: { color: "#fff", fontWeight: "700" },
  emptyState: { alignItems: "center", paddingTop: 80, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#111" },
  emptyText: { marginTop: 8, color: "#666", textAlign: "center", lineHeight: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" }
});
