import React, { useState } from "react";
import {
 View,
 Text,
 StyleSheet,
 TextInput,
 TouchableOpacity,
 ScrollView
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { monetizationDisabledMessage, productFlags } from "../config/productFlags";

type ComboOption = "Stories" | "Post" | "Reel" | "Video";
type ChargesMap = Record<ComboOption, number>;

const comboOptions: ComboOption[] = ["Stories", "Post", "Reel", "Video"];

function HowToEarnScreen({ navigation }:any) {
 const [selectedCombo, setSelectedCombo] = useState<ComboOption[]>([]);

 const [charges, setCharges] = useState<ChargesMap>({
  Stories: 500,
  Post: 1000,
  Reel: 1500,
  Video: 2500
 });

 // 👉 TOTAL CALCULATION
 const total = selectedCombo.reduce((sum, item) => {
  return sum + (charges[item] || 0);
 }, 0);

 const toggleCombo = (item: ComboOption) => {
  if (selectedCombo.includes(item)) {
   setSelectedCombo(selectedCombo.filter(i => i !== item));
  } else {
   setSelectedCombo([...selectedCombo, item]);
  }
 };

 const updateCharge = (key: ComboOption, value: string) => {
  setCharges({ ...charges, [key]: Number(value) });
 };

 if (!productFlags.sellerMonetizationInConsumerApp) {
  return (
   <View style={styles.disabledContainer}>
    <View style={styles.header}>
     <TouchableOpacity onPress={() => navigation.goBack()}>
      <Icon name="arrow-back" size={24} color="#fff" />
     </TouchableOpacity>
     <Text style={styles.headerTitle}>Business Tools</Text>
    </View>

    <View style={styles.disabledCard}>
     <Icon name="briefcase-outline" size={28} color="#ab2aeb" />
     <Text style={styles.disabledTitle}>Creator monetization is out of scope here</Text>
     <Text style={styles.disabledText}>{monetizationDisabledMessage}</Text>
    </View>
   </View>
  );
 }

 const InputField = ({ icon, placeholder }: { icon: string; placeholder: string }) => (
  <View style={styles.inputBox}>
   <Icon name={icon} size={18} color="#ab2aeb" />
   <TextInput
    placeholder={placeholder}
    placeholderTextColor="#999"
    style={styles.input}
   />
  </View>
 );

 return (
  <View style={{ flex: 1 }}>
   <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

    {/* HEADER */}
    <View style={styles.header}>
     <TouchableOpacity onPress={() => navigation.goBack()}>
      <Icon name="arrow-back" size={24} color="#fff" />
     </TouchableOpacity>
     <Text style={styles.headerTitle}>How to Earn</Text>
    </View>

    {/* GUIDE */}
    <View style={styles.guideBox}>
     <Text style={styles.guideTitle}>Start Earning Easily</Text>

     {[
      "Create your profile",
      "Set pricing",
      "Get paid collaborations"
     ].map((step, i) => (
      <View key={i} style={styles.stepRow}>
       <View style={styles.stepDot} />
       <Text style={styles.guideText}>{step}</Text>
      </View>
     ))}
    </View>

    {/* FORM */}
    <View style={styles.card}>

     <InputField icon="person-outline" placeholder="Profile Name" />
     <InputField icon="people-outline" placeholder="Followers Count" />
     <InputField icon="location-outline" placeholder="Address" />

     {/* CHARGES */}
     <Text style={styles.section}>Set Your Charges</Text>

     {comboOptions.map((item, i) => (
      <View key={i} style={styles.chargeRow}>
       <Text style={styles.chargeLabel}>{item}</Text>

       <TextInput
        style={styles.chargeInput}
        keyboardType="numeric"
        value={charges[item].toString()}
        onChangeText={(text) => updateCharge(item, text)}
       />
      </View>
     ))}

     {/* DROPDOWN */}
     <Text style={styles.section}>Select Services</Text>

     {comboOptions.map((item, i) => (
      <TouchableOpacity
       key={i}
       style={styles.optionRow}
       onPress={() => toggleCombo(item)}
      >
       <Text>{item}</Text>

       <Icon
        name={selectedCombo.includes(item) ? "checkbox" : "square-outline"}
        size={22}
        color="#ab2aeb"
       />
      </TouchableOpacity>
     ))}

     {/* BANK */}
     <InputField icon="card-outline" placeholder="Bank Details" />

     <View style={{ height: 80 }} /> {/* space for bottom bar */}

    </View>

   </ScrollView>

   {/* 🔥 STICKY TOTAL BAR */}
   <View style={styles.bottomBar}>
    <View>
     <Text style={styles.totalLabel}>Total Earnings</Text>
     <Text style={styles.total}>₹ {total}</Text>
    </View>

    <TouchableOpacity style={styles.submitBtn}>
     <Text style={styles.submitText}>Submit</Text>
    </TouchableOpacity>
   </View>

  </View>
 );
}

export default HowToEarnScreen;

const styles = StyleSheet.create({
 disabledContainer: {
  flex: 1,
  backgroundColor: "#f8f5ff",
 },

 container: {
  flex: 1,
  backgroundColor: "#f8f5ff",
 },
 disabledCard: {
  margin: 16,
  padding: 20,
  borderRadius: 18,
  backgroundColor: "#fff",
  borderWidth: 1,
  borderColor: "#E9D5FF",
 },
 disabledTitle: {
  marginTop: 12,
  color: "#111827",
  fontSize: 18,
  fontWeight: "bold",
 },
 disabledText: {
  marginTop: 8,
  color: "#4B5563",
  lineHeight: 21,
 },

 header: {
  backgroundColor: "#ab2aeb",
  paddingTop: 70,
  paddingBottom: 20,
  paddingHorizontal: 20,
  flexDirection: "row",
  alignItems: "center",
 },

 headerTitle: {
  color: "#fff",
  fontSize: 20,
  fontWeight: "bold",
  marginLeft: 15,
 },

 guideBox: {
  backgroundColor: "#fff",
  margin: 15,
  padding: 15,
  borderRadius: 15,
 },

 guideTitle: {
  fontWeight: "bold",
  color: "#ab2aeb",
 },

 stepRow: {
  flexDirection: "row",
  marginTop: 5,
 },

 stepDot: {
  width: 6,
  height: 6,
  backgroundColor: "#ab2aeb",
  borderRadius: 10,
  marginRight: 8,
  marginTop: 6,
 },

 guideText: {
  color: "#555",
 },

 card: {
  backgroundColor: "#fff",
  marginHorizontal: 15,
  borderRadius: 20,
  padding: 20,
 },

 inputBox: {
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "#f4f4f4",
  borderRadius: 12,
  paddingHorizontal: 12,
  marginTop: 12,
 },

 input: {
  flex: 1,
  padding: 12,
 },

 section: {
  marginTop: 20,
  fontWeight: "bold",
  color: "#ab2aeb",
 },

 chargeRow: {
  flexDirection: "row",
  justifyContent: "space-between",
  marginTop: 10,
 },

 chargeLabel: {
  fontWeight: "500",
 },

 chargeInput: {
  backgroundColor: "#f4f4f4",
  borderRadius: 8,
  paddingHorizontal: 10,
  minWidth: 80,
  textAlign: "center",
 },

 optionRow: {
  flexDirection: "row",
  justifyContent: "space-between",
  marginTop: 12,
 },

 /* 🔥 BOTTOM BAR */
 bottomBar: {
  position: "absolute",
  bottom: 0,
  width: "100%",
  backgroundColor: "#fff",
  padding: 15,
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  borderTopWidth: 0.5,
  borderColor: "#ddd",
 },

 totalLabel: {
  fontSize: 12,
  color: "#888",
 },

 total: {
  fontSize: 20,
  fontWeight: "bold",
  color: "#ab2aeb",
 },

 submitBtn: {
  backgroundColor: "#ab2aeb",
  paddingVertical: 10,
  paddingHorizontal: 20,
  borderRadius: 10,
 },

 submitText: {
  color: "#fff",
  fontWeight: "bold",
 },

});
