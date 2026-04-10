import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../theme/AppThemeContext";

type Section = {
  title: string;
  body?: string[];
  bullets?: string[];
};

const sections: Section[] = [
  {
    title: "1. Information We Collect",
    body: ["1.1 Personal Information"],
    bullets: ["Name", "Email address", "Phone number (optional)", "Profile details (bio, interests, etc.)"],
  },
  {
    title: "1.2 Device & Usage Information",
    bullets: ["Device type and OS", "IP address", "App usage data", "Log and analytics data"],
  },
  {
    title: "2. Permissions We Request",
    body: [
      "2.1 Location Access - Used for nearby brand recommendations and personalized content.",
      "2.2 Gallery / Media Access - Used for uploading profile pictures and portfolio content.",
      "2.3 Microphone Access - Used for audio messages, recordings, and live sessions.",
      "2.4 Contacts Access - Used to connect with known users and send collaboration invites.",
      "2.5 Notifications - Used to inform you about offers, updates, and activity.",
    ],
  },
  {
    title: "3. How We Use Your Information",
    bullets: [
      "Provide and improve services",
      "Connect users with brands",
      "Personalize user experience",
      "Enable communication",
      "Ensure platform safety",
    ],
  },
  {
    title: "4. Data Sharing",
    body: ["We do not sell your personal data."],
    bullets: ["Shared with brands (only with your consent)", "For legal compliance", "To ensure platform safety"],
  },
  {
    title: "5. Data Security",
    body: ["We use industry-standard measures to protect your data, but no system is completely secure."],
  },
  {
    title: "6. Your Rights",
    bullets: [
      "Access your data",
      "Update or correct information",
      "Delete your account",
      "Disable permissions",
      "Opt out of notifications",
    ],
  },
  {
    title: "7. Children's Privacy",
    body: ["Users must be at least 12 years old. Users under 18 should use the platform with parental guidance."],
  },
  {
    title: "8. Third-Party Services",
    body: ["We are not responsible for the privacy practices of third-party services."],
  },
  {
    title: "9. Changes to This Policy",
    body: ["We may update this policy at any time. Continued use of the platform means acceptance of updates."],
  },
  {
    title: "10. Contact Us",
    body: ["If you have any questions, contact us at support@aline2.com."],
  },
];

const PrivacyPolicyScreen = ({ navigation }: any) => {
  const { colors, isDarkMode } = useAppTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? "#111827" : "#f9f9f9" }]}> 
      <View style={[styles.header, { borderBottomColor: isDarkMode ? "#1f2937" : "#e5e7eb" }]}> 
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={isDarkMode ? colors.text : "#111827"} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDarkMode ? colors.text : "#111827" }]}>Privacy Policy</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: isDarkMode ? "#111827" : "#ffffff" }]}> 
          <Text style={[styles.title, { color: isDarkMode ? colors.text : "#111827" }]}>Privacy Policy</Text>
          <Text style={[styles.effectiveDate, { color: isDarkMode ? "#9ca3af" : "#6b7280" }]}>Effective Date: 02-18-2026</Text>
          <Text style={[styles.paragraph, { color: isDarkMode ? "#d1d5db" : "#374151" }]}>Welcome to Aline2. Your privacy is important to us, and we are committed to protecting your personal information.</Text>

          {sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={[styles.sectionTitle, { color: isDarkMode ? colors.text : "#111827" }]}>{section.title}</Text>
              {section.body?.map((line) => (
                <Text key={line} style={[styles.paragraph, { color: isDarkMode ? "#d1d5db" : "#374151" }]}>{line}</Text>
              ))}
              {section.bullets?.map((bullet) => (
                <View key={bullet} style={styles.bulletRow}>
                  <Text style={[styles.bullet, { color: isDarkMode ? colors.primary : "#7b3fe4" }]}>•</Text>
                  <Text style={[styles.bulletText, { color: isDarkMode ? "#d1d5db" : "#374151" }]}>{bullet}</Text>
                </View>
              ))}
            </View>
          ))}

          <Text style={[styles.footer, { color: isDarkMode ? "#9ca3af" : "#6b7280" }]}>© 2026 Aline2. All rights reserved.</Text>
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
  footer: {
    marginTop: 24,
    fontSize: 13,
  },
});

export default PrivacyPolicyScreen;
