import React, { useCallback, useState } from "react";
import {
 View,
 Text,
 StyleSheet,
 TouchableOpacity,
 Image,
 Alert,
 ScrollView,
 StatusBar,
 ActivityIndicator
} from "react-native";

import Icon from "react-native-vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { API } from "../api/api";
import { formatSummaryAmount } from "../utils/servicePricing";

const paymentMethods = [
 {
  name: "PhonePe",
  icon: "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/phonepe-icon.png",
 },
 {
  name: "Google Pay",
  icon: "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/google-pay-icon.png",
 },
 {
  name: "Paytm",
  icon: "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/paytm-icon.png",
 },
];

type PaymentMethod = (typeof paymentMethods)[number]["name"];

function WalletScreen({ navigation }:any) {

 const [summary, setSummary] = useState<any>(null);
 const [loading, setLoading] = useState(true);

 useFocusEffect(
  useCallback(() => {
   let active = true;

   const loadSummary = async () => {
    try {
     setLoading(true);
     const res = await API.get("/service-requests/summary", {
      params: { role: "user" }
     });

     if (active) {
      setSummary(res.data?.summary || null);
     }
    } catch (error) {
     console.log("wallet summary error:", error);
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

 const handleRecharge = (method: PaymentMethod) => {
  Alert.alert("Not available yet", `${method} recharge depends on payment-gateway integration and is deferred for later.`);
 };

 return (
  <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
   <StatusBar barStyle="light-content" backgroundColor="#ab2aeb" />

   {/* HEADER */}
   <View style={styles.header}>
    <View style={styles.headerRow}>
     <TouchableOpacity onPress={() => navigation.goBack()}>
      <Icon name="arrow-back" size={24} color="#fff" />
     </TouchableOpacity>

     <Text style={styles.title}>My Wallet</Text>

     <View style={{ width: 24 }} />
    </View>

    {/* BALANCE */}
    <View style={styles.balanceBox}>
     <Text style={styles.balanceLabel}>Completed Request Value</Text>
     {loading ? (
      <ActivityIndicator color="#fff" style={{ marginVertical: 8 }} />
     ) : (
      <Text style={styles.balance}>{formatSummaryAmount(summary, "completed")}</Text>
     )}

     <TouchableOpacity style={styles.addMoneyBtn} onPress={() => Alert.alert("Deferred", "Wallet top-up and settlement require payment-provider integration and are intentionally deferred.")}>
      <Icon name="add-circle-outline" size={18} color="#fff" />
      <Text style={styles.addMoneyText}>Provider Needed</Text>
     </TouchableOpacity>
    </View>
   </View>

   <View style={styles.summaryStrip}>
    <View style={styles.summaryCard}>
     <Text style={styles.summaryLabel}>Pending</Text>
     <Text style={styles.summaryValue}>{summary?.pending || 0}</Text>
    </View>
    <View style={styles.summaryCard}>
     <Text style={styles.summaryLabel}>Accepted</Text>
     <Text style={styles.summaryValue}>{summary?.accepted || 0}</Text>
    </View>
    <View style={styles.summaryCard}>
     <Text style={styles.summaryLabel}>Completed</Text>
     <Text style={styles.summaryValue}>{summary?.completed || 0}</Text>
    </View>
   </View>

   {/* PAYMENT METHODS */}
   <Text style={styles.sectionTitle}>Deferred Payment Integrations</Text>

   {paymentMethods.map((item, index) => (
    <TouchableOpacity
     key={index}
     style={styles.paymentCard}
     onPress={() => handleRecharge(item.name)}
    >
     <View style={styles.left}>
      <Image source={{ uri: item.icon }} style={styles.paymentIcon} />
      <Text style={styles.paymentText}>{item.name}</Text>
     </View>

     <Icon name="chevron-forward" size={20} color="#aaa" />
    </TouchableOpacity>
   ))}

   <Text style={styles.sectionTitle}>What works now</Text>
   <View style={styles.infoBox}>
    <Text style={styles.infoText}>Service requests, pricing selection, seller responses, and completion tracking are live.</Text>
    <Text style={[styles.infoText, styles.infoTextSecondary]}>Wallet settlement, recharge, and payout flows stay deferred until payment-provider integration is approved.</Text>
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
});
