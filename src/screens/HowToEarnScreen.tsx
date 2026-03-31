import React from "react";
import {
 View,
 Text,
 StyleSheet,
 TouchableOpacity,
 ScrollView,
 StatusBar,
 Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { monetizationDisabledMessage, productFlags } from "../config/productFlags";
import { useAppTheme } from "../theme/AppThemeContext";

const supportEmail = "support@aline2.app";

const moneyPoints = [
 "Complete your seller profile so buyers can trust your services.",
 "Keep your service catalog, pricing, and availability accurate.",
 "Track paid bookings and settlement review from the earnings screen.",
];

function HowToEarnScreen({ navigation }: any) {
 const { colors, isDarkMode } = useAppTheme();

 const openSupport = async () => {
  const mailtoUrl = `mailto:${supportEmail}?subject=Aline2%20seller%20business%20tools`;

  try {
   await Linking.openURL(mailtoUrl);
  } catch (error) {
   console.log("open support mail failed:", error);
  }
 };

 const renderDisabledState = () => (
  <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
   <View style={[styles.iconWrap, { backgroundColor: isDarkMode ? "#221B3A" : "#F2EDFF" }]}>
    <Icon name="briefcase-outline" size={28} color={colors.primary} />
   </View>
   <Text style={[styles.title, { color: colors.text }]}>Business tools are limited in this build</Text>
   <Text style={[styles.description, { color: colors.mutedText }]}>{monetizationDisabledMessage}</Text>
   <TouchableOpacity
    style={[styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
    onPress={() => navigation.goBack()}
   >
    <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Go back</Text>
   </TouchableOpacity>
  </View>
 );

 const renderEnabledState = () => (
  <>
   <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text style={[styles.title, { color: colors.text }]}>Seller business tools</Text>
    <Text style={[styles.description, { color: colors.mutedText }]}>
     Use this app to manage your seller profile, publish services, and follow paid booking activity. Seller payouts remain manually reviewed for this launch, so the live earnings screen is the source of truth.
    </Text>
   </View>

   <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text style={[styles.sectionTitle, { color: colors.text }]}>What to focus on</Text>
    {moneyPoints.map((point) => (
     <View key={point} style={styles.pointRow}>
      <Icon name="checkmark-circle-outline" size={18} color={colors.primary} />
      <Text style={[styles.pointText, { color: colors.mutedText }]}>{point}</Text>
     </View>
    ))}
   </View>

   <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text style={[styles.sectionTitle, { color: colors.text }]}>Open a real tool</Text>

    <TouchableOpacity
     style={[styles.primaryButton, { backgroundColor: colors.primary }]}
     onPress={() => navigation.navigate("SellerDashboardScreen")}
    >
     <Text style={styles.primaryButtonText}>Manage services</Text>
    </TouchableOpacity>

    <TouchableOpacity
     style={[styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
     onPress={() => navigation.navigate("WalletScreen")}
    >
     <Text style={[styles.secondaryButtonText, { color: colors.text }]}>View seller earnings</Text>
    </TouchableOpacity>

    <TouchableOpacity
     style={[styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
     onPress={() => navigation.navigate("SellerRegistration")}
    >
     <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Edit seller profile</Text>
    </TouchableOpacity>

    <TouchableOpacity
     style={[styles.tertiaryButton, { borderColor: colors.border }]}
     onPress={openSupport}
    >
     <Text style={[styles.tertiaryButtonText, { color: colors.primary }]}>Contact support</Text>
    </TouchableOpacity>
   </View>
  </>
 );

 return (
  <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
   <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={colors.background} />

   <View style={[styles.header, { borderBottomColor: colors.border }]}>
    <TouchableOpacity onPress={() => navigation.goBack()}>
     <Icon name="arrow-back" size={24} color={colors.text} />
    </TouchableOpacity>
    <Text style={[styles.headerTitle, { color: colors.text }]}>Business Tools</Text>
    <View style={styles.headerSpacer} />
   </View>

   <ScrollView
    style={styles.scroll}
    contentContainerStyle={styles.content}
    showsVerticalScrollIndicator={false}
   >
    {productFlags.sellerMonetizationInConsumerApp ? renderEnabledState() : renderDisabledState()}
   </ScrollView>
  </SafeAreaView>
 );
}

export default HowToEarnScreen;

const styles = StyleSheet.create({
 container: {
  flex: 1,
 },
 scroll: {
  flex: 1,
 },
 header: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingHorizontal: 18,
  paddingVertical: 14,
  borderBottomWidth: 1,
 },
 headerTitle: {
  fontSize: 18,
  fontWeight: "700",
 },
 headerSpacer: {
  width: 24,
 },
 content: {
  padding: 18,
  gap: 16,
 },
 card: {
  borderWidth: 1,
  borderRadius: 18,
  padding: 18,
 },
 iconWrap: {
  width: 56,
  height: 56,
  borderRadius: 28,
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 16,
 },
 title: {
  fontSize: 21,
  fontWeight: "800",
 },
 description: {
  marginTop: 10,
  fontSize: 14,
  lineHeight: 21,
 },
 sectionTitle: {
  fontSize: 16,
  fontWeight: "700",
  marginBottom: 12,
 },
 pointRow: {
  flexDirection: "row",
  alignItems: "flex-start",
  gap: 10,
  marginBottom: 12,
 },
 pointText: {
  flex: 1,
  fontSize: 14,
  lineHeight: 21,
 },
 primaryButton: {
  borderRadius: 14,
  paddingVertical: 14,
  alignItems: "center",
  marginBottom: 12,
 },
 primaryButtonText: {
  color: "#fff",
  fontSize: 15,
  fontWeight: "700",
 },
 secondaryButton: {
  borderWidth: 1,
  borderRadius: 14,
  paddingVertical: 14,
  alignItems: "center",
  marginTop: 12,
 },
 secondaryButtonText: {
  fontSize: 15,
  fontWeight: "600",
 },
 tertiaryButton: {
  marginTop: 12,
  borderWidth: 1,
  borderRadius: 14,
  paddingVertical: 14,
  alignItems: "center",
  borderStyle: "dashed",
 },
 tertiaryButtonText: {
  fontSize: 15,
  fontWeight: "700",
 },
});
