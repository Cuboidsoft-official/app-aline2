import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";

import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { Alert } from "../utils/appAlert";
import { useAppTheme } from "../theme/AppThemeContext";
import AppBottomDock, { APP_BOTTOM_DOCK_BASE_HEIGHT } from "../components/AppBottomDock";

function CompanyAdPreviewScreen({ navigation, route }: any) {
  const { colors, isDarkMode } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [ad, setAd] = useState<any>(route?.params?.ad || null);
  const [loading, setLoading] = useState(Boolean(route?.params?.companyAdId && !route?.params?.ad));
  const companyAdId = String(route?.params?.companyAdId || ad?._id || "");

  const loadAd = useCallback(async () => {
    if (!companyAdId) {
      return;
    }

    try {
      setLoading(true);
      const res = await API.get(`/company-ads/${companyAdId}`);
      setAd(res.data?.ad || null);
    } catch (error) {
      Alert.alert("Ad unavailable", getReadableApiErrorMessage(error, "This company ad could not be opened."));
    } finally {
      setLoading(false);
    }
  }, [companyAdId]);

  useFocusEffect(useCallback(() => {
    loadAd();
  }, [loadAd]));

  const trackTap = async () => {
    if (!companyAdId) {
      return;
    }

    try {
      await API.post(`/company-ads/${companyAdId}/track`, { action: "tap" });
      Alert.alert("Interest saved", "This ad tap has been tracked.");
    } catch (error) {
      Alert.alert("Could not track", getReadableApiErrorMessage(error, "Please try again."));
    }
  };

  const Row = ({ icon, label, value }: { icon: string; label: string; value: string }) => (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: `${colors.primary}14` }]}>
        <Icon name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowLabel, { color: colors.mutedText }]}>{label}</Text>
        <Text style={[styles.rowValue, { color: colors.text }]}>{value || "Not provided"}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={colors.background} />
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={23} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Ad Preview</Text>
          <View style={styles.headerButton} />
        </View>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.content, { paddingBottom: APP_BOTTOM_DOCK_BASE_HEIGHT + Math.max(insets.bottom, 10) + 32 }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.heroIcon, { backgroundColor: `${colors.primary}18` }]}>
                <Icon name="megaphone-outline" size={28} color={colors.primary} />
              </View>
              <Text style={[styles.company, { color: colors.mutedText }]}>{ad?.companyName || "Company"}</Text>
              <Text style={[styles.title, { color: colors.text }]}>{ad?.productOrService || "Promotion requirement"}</Text>
              <Text style={[styles.subtitle, { color: colors.mutedText }]}>
                {ad?.campaignGoal || "Open promotion brief for creators."}
              </Text>
            </View>

            <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.panelTitle, { color: colors.text }]}>Campaign</Text>
              <Row icon="albums-outline" label="Content type" value={ad?.contentType || ad?.productOrService || ""} />
              <Row icon="people-outline" label="Minimum followers" value={`${ad?.minimumFollowers || 0}+`} />
              <Row icon="film-outline" label="Content format" value={ad?.contentFormat || "template"} />
              <Row icon="navigate-outline" label="Placement" value={ad?.preferredPlacement || "story"} />
              <Row icon="cash-outline" label="Offered price" value={`INR ${ad?.offeredPrice || ad?.storyBudget || ad?.photoBudget || ad?.videoBudgetPerMinute || 0}`} />
              <Row icon="calendar-outline" label="Campaign duration" value={`${ad?.campaignDurationDays || 7} days`} />
            </View>

            <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.panelTitle, { color: colors.text }]}>Brief</Text>
              <Row icon="location-outline" label="Location" value={ad?.location || "Any location"} />
              <Row icon="people-outline" label="Target audience" value={ad?.targetAudience || ""} />
              <Row icon="film-outline" label="Media type" value={ad?.mediaType || ad?.preferredPlacement || "mixed"} />
              <Text style={[styles.description, { color: colors.mutedText }]}>
                {ad?.description || "No detailed brief added yet."}
              </Text>
            </View>

            <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.panelTitle, { color: colors.text }]}>Contact</Text>
              <Row icon="person-outline" label="Contact name" value={ad?.contactName || ""} />
              <Row icon="call-outline" label="Phone" value={ad?.contactPhone || ""} />
              <Row icon="mail-outline" label="Email" value={ad?.contactEmail || ""} />
            </View>

            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={trackTap}>
              <Icon name="checkmark-circle-outline" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>Mark interested</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </SafeAreaView>
      <AppBottomDock navigation={navigation} />
    </View>
  );
}

export default CompanyAdPreviewScreen;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1 },
  scroll: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16 },
  hero: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 18, alignItems: "flex-start", marginBottom: 14 },
  heroIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  company: { fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  title: { marginTop: 5, fontSize: 22, fontWeight: "900" },
  subtitle: { marginTop: 8, fontSize: 14, lineHeight: 20 },
  panel: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 14, marginBottom: 14 },
  panelTitle: { fontSize: 16, fontWeight: "900", marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 11 },
  rowIcon: { width: 36, height: 36, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 10 },
  rowCopy: { flex: 1 },
  rowLabel: { fontSize: 12, fontWeight: "800" },
  rowValue: { marginTop: 2, fontSize: 14, fontWeight: "800" },
  description: { marginTop: 12, fontSize: 13, lineHeight: 20 },
  primaryButton: {
    minHeight: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryButtonText: { color: "#fff", fontSize: 14, fontWeight: "900" },
});
