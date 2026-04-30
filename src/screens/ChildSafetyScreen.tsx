import React, { useCallback } from "react";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";

import { Alert } from "../utils/appAlert";
import { useAppTheme } from "../theme/AppThemeContext";

type Section = {
  title: string;
  body?: string[];
  bullets?: string[];
};

const CHILD_SAFETY_EMAIL = "support@aline2.com";

const sections: Section[] = [
  {
    title: "1. Our commitment",
    body: [
      "At Aline2, we are committed to maintaining a safe environment for all users, especially minors.",
      "We have a zero-tolerance policy toward child sexual abuse and exploitation, including child sexual abuse material and any related grooming, trafficking, coercion, or exploitative behavior.",
    ],
  },
  {
    title: "2. What is strictly prohibited",
    bullets: [
      "Any sexual, exploitative, abusive, or harmful content involving minors.",
      "Any attempt to groom, solicit, threaten, blackmail, or exploit a minor on or through the platform.",
      "Any sharing, requesting, promotion, storage, or redistribution of child sexual abuse material.",
      "Any use of profile, chat, live, post, story, swipe, or seller features to endanger minors.",
    ],
  },
  {
    title: "3. Safety tools on Aline2",
    bullets: [
      "In-app reporting features for posts, stories, swipes, chats, profiles, and other inappropriate behavior.",
      "Blocking and account-control features so users can stop unsafe contact quickly.",
      "Review and moderation systems designed to identify abuse, explicit content, and policy violations.",
      "Escalation of urgent safety concerns to our internal review process for immediate action.",
    ],
  },
  {
    title: "4. Enforcement actions",
    bullets: [
      "Immediate review and removal of reported content when it violates our child-safety rules.",
      "Permanent suspension of accounts found to be sharing, requesting, or facilitating CSAE or CSAM.",
      "Preservation of relevant records when required for legal compliance, safety review, or law-enforcement cooperation.",
    ],
  },
  {
    title: "5. Reporting and cooperation",
    body: [
      "Users can report harmful or suspicious content directly within the app using the available reporting and blocking tools.",
      "We cooperate with law-enforcement authorities and comply with applicable child-safety laws and regulations when investigating credible threats, abuse, or illegal material.",
    ],
  },
  {
    title: "6. Contact for child safety concerns",
    body: [
      `If you need to report child safety concerns or believe a user, message, post, live stream, or media item puts a minor at risk, contact us at ${CHILD_SAFETY_EMAIL}.`,
    ],
  },
];

const ChildSafetyScreen = ({ navigation }: any) => {
  const { colors, isDarkMode } = useAppTheme();
  const screenStyle = { backgroundColor: isDarkMode ? "#111827" : "#F9FAFB" };
  const headerStyle = { borderBottomColor: isDarkMode ? "#1F2937" : "#E5E7EB" };
  const titleStyle = { color: isDarkMode ? colors.text : "#111827" };
  const mutedStyle = { color: isDarkMode ? "#9CA3AF" : "#6B7280" };
  const bodyStyle = { color: isDarkMode ? "#D1D5DB" : "#374151" };
  const cardStyle = { backgroundColor: isDarkMode ? "#111827" : "#FFFFFF" };

  const emailChildSafetyTeam = useCallback(async () => {
    const url = `mailto:${CHILD_SAFETY_EMAIL}?subject=${encodeURIComponent("Aline2 child safety concern")}`;

    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("Email unavailable", `Please contact ${CHILD_SAFETY_EMAIL} from your email app.`);
        return;
      }

      await Linking.openURL(url);
    } catch {
      Alert.alert("Email unavailable", `Please contact ${CHILD_SAFETY_EMAIL} from your email app.`);
    }
  }, []);

  return (
    <SafeAreaView style={[styles.container, screenStyle]}>
      <View style={[styles.header, headerStyle]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={isDarkMode ? colors.text : "#111827"} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, titleStyle]}>Child Safety Standards</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, cardStyle]}>
          <Text style={[styles.title, titleStyle]}>Child Safety Standards</Text>
          <Text style={[styles.effectiveDate, mutedStyle]}>Effective Date: 04-30-2026</Text>
          <Text style={[styles.paragraph, bodyStyle]}>
            Aline2 is committed to protecting minors and removing exploitative or abusive behavior from the platform as quickly as possible.
          </Text>

          {sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={[styles.sectionTitle, titleStyle]}>{section.title}</Text>
              {section.body?.map((line) => (
                <Text key={line} style={[styles.paragraph, bodyStyle]}>{line}</Text>
              ))}
              {section.bullets?.map((bullet) => (
                <View key={bullet} style={styles.bulletRow}>
                  <Text style={[styles.bullet, { color: colors.primary }]}>*</Text>
                  <Text style={[styles.bulletText, bodyStyle]}>{bullet}</Text>
                </View>
              ))}
            </View>
          ))}

          <TouchableOpacity style={[styles.emailButton, { backgroundColor: colors.primary }]} onPress={emailChildSafetyTeam}>
            <Icon name="mail-outline" size={18} color="#fff" />
            <Text style={styles.emailButtonText}>Email {CHILD_SAFETY_EMAIL}</Text>
          </TouchableOpacity>

          <Text style={[styles.footer, mutedStyle]}>Copyright 2026 Aline2. All rights reserved.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  content: {
    padding: 16,
  },
  card: {
    borderRadius: 18,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 6,
  },
  effectiveDate: {
    fontSize: 13,
    marginBottom: 16,
  },
  section: {
    marginTop: 18,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  bullet: {
    width: 16,
    fontSize: 16,
    lineHeight: 22,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
  },
  emailButton: {
    marginTop: 24,
    borderRadius: 14,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emailButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  footer: {
    marginTop: 24,
    fontSize: 13,
  },
});

export default ChildSafetyScreen;
