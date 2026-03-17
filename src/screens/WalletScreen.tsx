import React, { useState } from "react";
import {
 View,
 Text,
 StyleSheet,
 TouchableOpacity,
 Image,
 Alert,
 ScrollView,
 StatusBar
} from "react-native";

import Icon from "react-native-vector-icons/Ionicons";

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

function WalletScreen({ navigation }:any) {

 const [balance, setBalance] = useState(12450);

 const handleRecharge = (method) => {
  Alert.alert("Recharge", `Recharge using ${method}`);
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
     <Text style={styles.balanceLabel}>Available Balance</Text>
     <Text style={styles.balance}>₹ {balance}</Text>

     <TouchableOpacity style={styles.addMoneyBtn}>
      <Icon name="add-circle-outline" size={18} color="#fff" />
      <Text style={styles.addMoneyText}>Add Money</Text>
     </TouchableOpacity>
    </View>
   </View>

   {/* PAYMENT METHODS */}
   <Text style={styles.sectionTitle}>Recharge Options</Text>

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

   {/* QUICK ADD */}
   <Text style={styles.sectionTitle}>Quick Add</Text>

   <View style={styles.quickRow}>
    {[100, 200, 500, 1000].map((amt) => (
     <TouchableOpacity
      key={amt}
      style={styles.quickBtn}
      onPress={() => setBalance(balance + amt)}
     >
      <Text style={styles.quickText}>₹{amt}</Text>
     </TouchableOpacity>
    ))}
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

 /* QUICK ADD */
 quickRow: {
  flexDirection: "row",
  justifyContent: "space-around",
  margin: 20,
 },

 quickBtn: {
  backgroundColor: "#fff",
  paddingVertical: 14,
  paddingHorizontal: 18,
  borderRadius: 12,
  elevation: 3,
 },

 quickText: {
  fontWeight: "bold",
  color: "#ab2aeb",
 },
});