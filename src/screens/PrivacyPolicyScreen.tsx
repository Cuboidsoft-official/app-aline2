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
    body: ["We collect the information needed to create your account, deliver the service, and keep the platform safer."],
    bullets: [
      "Account details such as your name, email address, phone number, login data, and profile settings.",
      "Profile and seller details such as username, bio, interests, avatar, service listings, and account preferences.",
      "User content such as photos, videos, captions, comments, messages, voice notes, live-stream content, and reports.",
      "Device, network, and diagnostics data such as device model, operating system, app activity, IP address, push token, and crash logs.",
      "Location data only when you choose location-based features such as nearby discovery or location tagging.",
    ],
  },
  {
    title: "2. Permissions We Request",
    bullets: [
      "Camera access for profile photos, chat attachments, posts, stories, video calls, and live streams.",
      "Microphone access for voice notes, calls, live streams, and recorded audio or video.",
      "Photos and media access for selecting and uploading images and videos from your device.",
      "Notification access for messages, calls, account activity, and service updates.",
      "Location access only when you use features that need approximate or precise location.",
    ],
  },
  {
    title: "3. How We Use Your Information",
    bullets: [
      "Create and manage your account and support secure sign-in.",
      "Deliver chat, calling, social posting, live-streaming, and seller features.",
      "Personalize content, recommendations, and discovery inside the app.",
      "Detect abuse, spam, fraud, nudity, explicit content, and other policy violations.",
      "Send transactional notifications such as OTPs, message alerts, and call activity.",
      "Measure performance, investigate failures, and improve reliability, trust, and safety.",
    ],
  },
  {
    title: "4. Data Sharing",
    body: ["We do not sell your personal information."],
    bullets: [
      "With service providers that help us run hosting, storage, notifications, analytics, moderation, and customer support.",
      "With other users according to your privacy settings and the content, chat, call, seller, or live features you choose to use.",
      "When required for legal compliance, law enforcement requests, or to protect users, rights, and platform integrity.",
      "In connection with a merger, acquisition, financing, or transfer of assets, subject to applicable law.",
    ],
  },
  {
    title: "5. Safety And Moderation",
    body: [
      "To help keep Aline2 safer and support app-store compliance, uploaded content may be reviewed by automated safety systems before or after it is shared.",
      "These systems may analyze photos, videos, voice notes, posts, stories, live content, and chat attachments for nudity, explicit content, abuse, spam, or other violations.",
    ],
  },
  {
    title: "6. Data Retention And Security",
    body: [
      "We keep personal information for as long as it is reasonably needed to provide the service, comply with legal obligations, resolve disputes, and enforce our policies.",
      "We use administrative, technical, and organizational safeguards to protect data, but no system is completely secure.",
    ],
  },
  {
    title: "7. Your Choices And Rights",
    bullets: [
      "Access, update, or correct parts of your profile and account information.",
      "Delete your account using in-app controls or by contacting support.",
      "Manage profile privacy, audience settings, and permission access from your device settings.",
      "Control whether you receive notifications where your device and app settings allow it.",
      "Contact support if you need help with privacy or data-related requests.",
    ],
  },
  {
    title: "8. Children's Privacy",
    body: ["Aline2 is not intended for children under 13. If we learn that we collected personal information from a child under 13, we will take reasonable steps to delete it."],
  },
  {
    title: "9. Third-Party Services",
    body: ["Some features may rely on third-party services such as cloud hosting, media delivery, notifications, analytics, and authentication providers. Their handling of data is governed by their own terms and privacy notices."],
  },
  {
    title: "10. Changes To This Policy",
    body: ["We may update this Privacy Policy from time to time. When we make material changes, we will update the effective date and may provide additional notice inside the app or through other appropriate channels."],
  },
  {
    title: "11. Contact Us",
    body: ["If you have questions, requests, or privacy concerns, contact us at support@aline2.com."],
  },
];

const PrivacyPolicyScreen = ({ navigation }: any) => {
  const { colors, isDarkMode } = useAppTheme();
  const screenStyle = { backgroundColor: isDarkMode ? "#111827" : "#F9FAFB" };
  const headerStyle = { borderBottomColor: isDarkMode ? "#1F2937" : "#E5E7EB" };
  const headerTitleStyle = { color: isDarkMode ? colors.text : "#111827" };
  const cardStyle = { backgroundColor: isDarkMode ? "#111827" : "#FFFFFF" };
  const titleStyle = { color: isDarkMode ? colors.text : "#111827" };
  const dateStyle = { color: isDarkMode ? "#9CA3AF" : "#6B7280" };
  const bodyTextStyle = { color: isDarkMode ? "#D1D5DB" : "#374151" };
  const lightFooterStyle = { color: isDarkMode ? "#9CA3AF" : "#6B7280" };
  const bulletStyle = { color: isDarkMode ? colors.primary : "#7B3FE4" };

  return (
    <SafeAreaView style={[styles.container, screenStyle]}>
      <View style={[styles.header, headerStyle]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={isDarkMode ? colors.text : "#111827"} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, headerTitleStyle]}>Privacy Policy</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, cardStyle]}>
          <Text style={[styles.title, titleStyle]}>Privacy Policy</Text>
          <Text style={[styles.effectiveDate, dateStyle]}>Effective Date: 04-23-2026</Text>
          <Text style={[styles.paragraph, bodyTextStyle]}>
            This Privacy Policy explains what information Aline2 collects, how we use it, when it may be shared, and the choices you have when you use the app.
          </Text>

          {sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={[styles.sectionTitle, titleStyle]}>{section.title}</Text>
              {section.body?.map((line) => (
                <Text key={line} style={[styles.paragraph, bodyTextStyle]}>{line}</Text>
              ))}
              {section.bullets?.map((bullet) => (
                <View key={bullet} style={styles.bulletRow}>
                  <Text style={[styles.bullet, bulletStyle]}>*</Text>
                  <Text style={[styles.bulletText, bodyTextStyle]}>{bullet}</Text>
                </View>
              ))}
            </View>
          ))}

          <Text style={[styles.footer, lightFooterStyle]}>Copyright 2026 Aline2. All rights reserved.</Text>
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
