import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";

import {
  APP_BUG_FIXES,
  APP_FEATURE_SECTIONS,
  APP_RELEASE_DATE,
  APP_RELEASE_HIGHLIGHTS,
  APP_RELEASE_TITLE,
  APP_UPCOMING_CHANGES,
  APP_VERSION,
} from "../config/appMeta";
import { useAppTheme } from "../theme/AppThemeContext";

const ReleaseNotesScreen = ({ navigation }: any) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: colors.card }]} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Release Notes</Text>
          <Text style={[styles.headerSubtitle, { color: colors.mutedText }]}>Version {APP_VERSION}</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 32 }]}
      >
        <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.heroEyebrow, { color: colors.primary }]}>Current release</Text>
          <Text style={[styles.heroTitle, { color: colors.text }]}>{APP_RELEASE_TITLE}</Text>
          <Text style={[styles.heroMeta, { color: colors.mutedText }]}>
            v{APP_VERSION} • {APP_RELEASE_DATE}
          </Text>
          {APP_RELEASE_HIGHLIGHTS.map((item) => (
            <View key={item} style={styles.bulletRow}>
              <View style={[styles.bulletDot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.bulletText, { color: colors.text }]}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Feature catalog</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.mutedText }]}>
            Current app capabilities from basic onboarding to advanced creator, calling, and seller flows.
          </Text>
          {APP_FEATURE_SECTIONS.map((section) => (
            <View key={section.title} style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{section.title}</Text>
              {section.items.map((item) => (
                <View key={item} style={styles.bulletRow}>
                  <View style={[styles.bulletDot, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.bulletText, { color: colors.text }]}>{item}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Bug fixes in this version</Text>
          {APP_BUG_FIXES.map((item) => (
            <View key={item} style={[styles.sectionCard, styles.tightCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.bulletRow}>
                <View style={[styles.bulletDot, styles.successDot]} />
                <Text style={[styles.bulletText, { color: colors.text }]}>{item}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Upcoming changes</Text>
          {APP_UPCOMING_CHANGES.map((item) => (
            <View key={item} style={[styles.sectionCard, styles.tightCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.bulletRow}>
                <View style={[styles.bulletDot, styles.upcomingDot]} />
                <Text style={[styles.bulletText, { color: colors.text }]}>{item}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default ReleaseNotesScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    marginLeft: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: "800",
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12.5,
    fontWeight: "600",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  heroTitle: {
    marginTop: 8,
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "900",
  },
  heroMeta: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "600",
  },
  section: {
    marginTop: 22,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  sectionSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
  },
  sectionCard: {
    marginTop: 12,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  tightCard: {
    paddingVertical: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 8,
    textTransform: "capitalize",
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 8,
  },
  bulletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 7,
    marginRight: 10,
  },
  successDot: {
    backgroundColor: "#22c55e",
  },
  upcomingDot: {
    backgroundColor: "#f59e0b",
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
});
