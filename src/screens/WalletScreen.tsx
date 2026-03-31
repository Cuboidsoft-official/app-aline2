import React, { useCallback, useState } from "react";
import {
 View,
 Text,
 StyleSheet,
 TouchableOpacity,
 ScrollView,
 StatusBar,
 ActivityIndicator,
 Alert,
} from "react-native";

import Icon from "react-native-vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { API } from "../api/api";
import { monetizationDisabledMessage, productFlags } from "../config/productFlags";
import { formatCurrencyAmount, formatSummaryAmount } from "../utils/servicePricing";

type LedgerRequest = {
 _id: string;
 status?: string;
 createdAt?: string;
 pricing?: {
  amount?: number;
  currency?: string;
 };
 service?: {
  serviceName?: string;
 };
 user?: {
  name?: string;
  username?: string;
 };
};

function WalletScreen({ navigation }:any) {

 const [summary, setSummary] = useState<any>(null);
 const [recentRequests, setRecentRequests] = useState<LedgerRequest[]>([]);
 const [loading, setLoading] = useState(true);

 useFocusEffect(
  useCallback(() => {
   let active = true;

   const loadSummary = async () => {
    try {
     setLoading(true);
     const [summaryRes, requestsRes] = await Promise.all([
      API.get("/service-requests/summary", {
       params: { role: "seller" }
      }),
      API.get("/service-requests", {
       params: { role: "seller" }
      })
     ]);

     if (active) {
      setSummary(summaryRes.data?.summary || null);
      setRecentRequests((requestsRes.data?.requests || []).slice(0, 8));
     }
    } catch (error) {
     console.log("wallet summary error:", error);
     if (active) {
      Alert.alert("Error", "Failed to load seller earnings");
     }
    } finally {
     if (active) {
      setLoading(false);
     }
    }
   };

   loadSummary();

   return () => {
    active = false;
   };
  }, [])
 );

 if (!productFlags.sellerMonetizationInConsumerApp) {
  return (
   <ScrollView style={styles.container} contentContainerStyle={styles.readOnlyContainer} showsVerticalScrollIndicator={false}>
    <StatusBar barStyle="light-content" backgroundColor="#ab2aeb" />

    <View style={styles.header}>
     <View style={styles.headerRow}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
       <Icon name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>

      <Text style={styles.title}>Business Tools</Text>

      <View style={{ width: 24 }} />
     </View>
    </View>

    <View style={styles.readOnlyCard}>
     <Icon name="lock-closed-outline" size={26} color="#ab2aeb" />
     <Text style={styles.readOnlyTitle}>Payments are not handled in this app</Text>
     <Text style={styles.readOnlyText}>{monetizationDisabledMessage}</Text>
    </View>
   </ScrollView>
  );
 }

 return (
  <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
   <StatusBar barStyle="light-content" backgroundColor="#ab2aeb" />

   {/* HEADER */}
   <View style={styles.header}>
    <View style={styles.headerRow}>
     <TouchableOpacity onPress={() => navigation.goBack()}>
      <Icon name="arrow-back" size={24} color="#fff" />
     </TouchableOpacity>

     <Text style={styles.title}>Seller Earnings</Text>

     <View style={{ width: 24 }} />
    </View>

    {/* BALANCE */}
    <View style={styles.balanceBox}>
     <Text style={styles.balanceLabel}>Awaiting Settlement</Text>
     {loading ? (
      <ActivityIndicator color="#fff" style={{ marginVertical: 8 }} />
     ) : (
      <Text style={styles.balance}>
       {formatSummaryAmount(
        {
         settlementPendingAmount: summary?.settlementPendingAmount,
         settlementPendingAmountByCurrency: summary?.settlementPendingAmountByCurrency,
         settlementPendingDisplayCurrency: summary?.settlementPendingDisplayCurrency,
         displayCurrency: summary?.displayCurrency
        },
        "settlementPending"
       )}
      </Text>
     )}

     <View style={styles.addMoneyBtn}>
      <Icon name="checkmark-circle-outline" size={18} color="#fff" />
      <Text style={styles.addMoneyText}>Manual settlement workflow</Text>
     </View>
    </View>
   </View>

   <View style={styles.summaryStrip}>
    <View style={styles.summaryCard}>
     <Text style={styles.summaryLabel}>Paid</Text>
     <Text style={styles.summaryValue}>{summary?.paid || 0}</Text>
    </View>
    <View style={styles.summaryCard}>
     <Text style={styles.summaryLabel}>Confirmed</Text>
     <Text style={styles.summaryValue}>{summary?.confirmed || summary?.accepted || 0}</Text>
    </View>
    <View style={styles.summaryCard}>
     <Text style={styles.summaryLabel}>Completed</Text>
     <Text style={styles.summaryValue}>{summary?.completed || 0}</Text>
    </View>
   </View>

   <Text style={styles.sectionTitle}>Settlement status</Text>
   <View style={styles.infoBox}>
    <Text style={styles.infoText}>Customer payments are captured during booking checkout and tracked against each appointment.</Text>
    <Text style={[styles.infoText, styles.infoTextSecondary]}>Seller payouts are still reviewed and settled manually for this launch, so this screen shows earnings and settlement exposure instead of fake withdrawal controls.</Text>
   </View>

   <View style={styles.summaryStrip}>
    <View style={styles.summaryCard}>
     <Text style={styles.summaryLabel}>Gross Paid</Text>
     <Text style={styles.summaryValue}>{formatSummaryAmount(summary, "paid")}</Text>
    </View>
    <View style={styles.summaryCard}>
     <Text style={styles.summaryLabel}>Completed</Text>
     <Text style={styles.summaryValue}>{formatSummaryAmount(summary, "completed")}</Text>
    </View>
    <View style={styles.summaryCard}>
     <Text style={styles.summaryLabel}>Refund Review</Text>
     <Text style={styles.summaryValue}>{summary?.refund_needed || 0}</Text>
    </View>
   </View>

   <Text style={styles.sectionTitle}>Recent transactions</Text>
   <View style={styles.infoBox}>
    {recentRequests.length ? (
     recentRequests.map((request) => (
      <View key={request._id} style={styles.transactionRow}>
       <View style={styles.transactionMeta}>
        <Text style={styles.transactionTitle}>{request.service?.serviceName || "Appointment"}</Text>
        <Text style={styles.transactionSubtitle}>
         {request.user?.name || request.user?.username || "Customer"} • {String(request.status || "").replace(/_/g, " ")}
        </Text>
       </View>
       <Text style={styles.transactionAmount}>
        {formatCurrencyAmount(request.pricing?.amount || 0, request.pricing?.currency || "INR")}
       </Text>
      </View>
     ))
    ) : (
     <Text style={styles.infoText}>Paid and confirmed seller bookings will appear here as they move through completion and settlement review.</Text>
    )}
   </View>

  </ScrollView>
 );
}

export default WalletScreen;

const styles = StyleSheet.create({

 container: {
  flex: 1,
  backgroundColor: "#f8f5ff",
 },
 readOnlyContainer: {
  paddingBottom: 32,
 },

 /* HEADER */
 header: {
  backgroundColor: "#ab2aeb",
  paddingTop: 50,
  paddingBottom: 30,
  paddingHorizontal: 20,
  borderBottomLeftRadius: 25,
  borderBottomRightRadius: 25,
 },

 headerRow: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
 },

 title: {
  color: "#fff",
  fontSize: 20,
  fontWeight: "bold",
 },

 /* BALANCE BOX */
 balanceBox: {
  marginTop: 25,
  backgroundColor: "rgba(255,255,255,0.15)",
  padding: 20,
  borderRadius: 15,
  alignItems: "center",
 },

 balanceLabel: {
  color: "#eee",
  fontSize: 13,
 },

 balance: {
  fontSize: 30,
  fontWeight: "bold",
  color: "#fff",
  marginVertical: 8,
 },

 addMoneyBtn: {
  flexDirection: "row",
  backgroundColor: "#fff",
  paddingVertical: 8,
  paddingHorizontal: 18,
  borderRadius: 25,
  alignItems: "center",
 },

 addMoneyText: {
  color: "#ab2aeb",
  marginLeft: 5,
  fontWeight: "bold",
 },

 /* SECTION */
 sectionTitle: {
  marginLeft: 20,
  marginTop: 20,
  fontWeight: "bold",
  color: "#555",
  fontSize: 15,
 },
 summaryStrip: {
  flexDirection: "row",
  marginHorizontal: 15,
  marginTop: 18
 },
 summaryCard: {
  flex: 1,
  backgroundColor: "#fff",
  padding: 14,
  borderRadius: 14,
  marginHorizontal: 5,
  alignItems: "center"
 },
 summaryLabel: {
  color: "#666",
  fontSize: 12
 },
 summaryValue: {
  color: "#ab2aeb",
  fontWeight: "700",
  fontSize: 18,
  marginTop: 6
 },

 /* PAYMENT CARD */
 paymentCard: {
  backgroundColor: "#fff",
  marginHorizontal: 15,
  marginTop: 12,
  padding: 16,
  borderRadius: 14,
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  elevation: 3,
 },

 left: {
  flexDirection: "row",
  alignItems: "center",
 },

 paymentIcon: {
  width: 35,
  height: 35,
  marginRight: 12,
 },

 paymentText: {
  fontSize: 16,
  fontWeight: "500",
 },

 infoBox: {
  backgroundColor: "#fff",
  marginHorizontal: 15,
  marginTop: 12,
  padding: 16,
  borderRadius: 14
 },
 infoText: {
  color: "#444",
  lineHeight: 20
 },
 infoTextSecondary: {
  marginTop: 8,
  color: "#777"
 },
 transactionRow: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingVertical: 10,
  borderBottomWidth: 1,
  borderBottomColor: "#F1F1F4"
 },
 transactionMeta: {
  flex: 1,
  paddingRight: 12
 },
 transactionTitle: {
  color: "#1F2937",
  fontWeight: "700"
 },
 transactionSubtitle: {
  marginTop: 4,
  color: "#6B7280",
  textTransform: "capitalize"
 },
 transactionAmount: {
  color: "#7C3AED",
  fontWeight: "700"
 },
 readOnlyCard: {
  marginHorizontal: 20,
  marginTop: 24,
  padding: 20,
  borderRadius: 18,
  backgroundColor: "#fff",
  borderWidth: 1,
  borderColor: "#E9D5FF"
 },
 readOnlyTitle: {
  marginTop: 12,
  color: "#111827",
  fontSize: 18,
  fontWeight: "bold"
 },
 readOnlyText: {
  marginTop: 8,
  color: "#4B5563",
  lineHeight: 21
 },
});
