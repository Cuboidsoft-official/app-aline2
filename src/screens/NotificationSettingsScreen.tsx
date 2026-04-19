import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import LinearGradient from "react-native-linear-gradient";
import Icon from "react-native-vector-icons/Ionicons";

import { API } from "../api/api";
import { Alert } from "../utils/appAlert";
import { useAppTheme } from "../theme/AppThemeContext";

const defaultSettings = {
  likes: true,
  comments: true,
  followers: true,
  stories: true,
  mentions: true,
  serviceRequests: true,
  messages: true,
  calls: true,
};

type NotificationPreferenceKey = keyof typeof defaultSettings;
type NotificationSettings = typeof defaultSettings;

const preferenceSections: ReadonlyArray<{
  title: string;
  description: string;
  items: ReadonlyArray<{
    key: NotificationPreferenceKey;
    label: string;
    description: string;
    icon: string;
  }>;
}> = [
  {
    title: "Social activity",
    description: "Updates from people reacting to your profile, posts, and conversations.",
    items: [
      {
        key: "likes",
        label: "Likes",
        description: "Post likes, story likes, and quick reactions.",
        icon: "heart-outline",
      },
      {
        key: "comments",
        label: "Comments",
        description: "New comments and replies across your content.",
        icon: "chatbubble-ellipses-outline",
      },
      {
        key: "followers",
        label: "New followers",
        description: "Alerts when someone starts following you.",
        icon: "person-add-outline",
      },
    ],
  },
  {
    title: "Messages and calls",
    description: "Stay reachable for chat replies and incoming call alerts across devices.",
    items: [
      {
        key: "messages",
        label: "Messages",
        description: "New direct messages and conversation replies.",
        icon: "mail-unread-outline",
      },
      {
        key: "calls",
        label: "Calls",
        description: "Incoming audio and video call alerts with ringtone.",
        icon: "call-outline",
      },
    ],
  },
  {
    title: "Stories and mentions",
    description: "Keep control over story replies, tags, and mention-based activity.",
    items: [
      {
        key: "stories",
        label: "Stories",
        description: "Story replies and story-related updates.",
        icon: "albums-outline",
      },
      {
        key: "mentions",
        label: "Mentions and tags",
        description: "Mentions, tags, and direct callouts from others.",
        icon: "at-outline",
      },
    ],
  },
  {
    title: "Services",
    description: "Operational alerts related to service requests and request changes.",
    items: [
      {
        key: "serviceRequests",
        label: "Service requests",
        description: "New requests, status changes, and related updates.",
        icon: "briefcase-outline",
      },
    ],
  },
];

const NotificationSettingsScreen = ({ navigation }: any) => {
  const { colors, isDarkMode } = useAppTheme();
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<NotificationPreferenceKey | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get("/user/notification-settings");
      setSettings({
        ...defaultSettings,
        ...(res.data?.notificationPreferences || {}),
      });
    } catch (error) {
      console.log("notification settings error:", error);
      Alert.alert("Unable to load settings", "Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings]),
  );

  const updateSetting = async (key: NotificationPreferenceKey, value: boolean) => {
    const previous = settings[key];
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSavingKey(key);

    try {
      const res = await API.put("/user/notification-settings", {
        [key]: value,
      });
      setSettings({
        ...defaultSettings,
        ...(res.data?.notificationPreferences || {}),
      });
    } catch (error) {
      console.log("notification settings update error:", error);
      setSettings((prev) => ({ ...prev, [key]: previous }));
      Alert.alert("Unable to update setting", "Please try again.");
    } finally {
      setSavingKey(null);
    }
  };

  const enabledCount = useMemo(
    () => Object.values(settings).filter(Boolean).length,
    [settings],
  );

  const heroGradient = isDarkMode
    ? ["#1B223A", "#151D31", "#101826"]
    : ["#EEF7FF", "#F6F0FF", "#FFFFFF"];

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.headerButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerCopy}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>Control center</Text>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Notification settings</Text>
        </View>

        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={heroGradient} style={[styles.heroCard, { borderColor: colors.border }]}>
          <View style={styles.heroTopRow}>
            <View style={[styles.heroIconWrap, { backgroundColor: `${colors.primary}18` }]}>
              <Icon name="notifications-outline" size={24} color={colors.primary} />
            </View>
            <View style={[styles.heroBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.heroBadgeValue, { color: colors.text }]}>{enabledCount}/{Object.keys(defaultSettings).length}</Text>
              <Text style={[styles.heroBadgeLabel, { color: colors.mutedText }]}>enabled</Text>
            </View>
          </View>

          <Text style={[styles.heroTitle, { color: colors.text }]}>Choose what deserves your attention</Text>
          <Text style={[styles.heroText, { color: colors.mutedText }]}>
            Fine-tune the alerts that appear in your app so the inbox stays useful, focused, and easy to manage.
          </Text>
        </LinearGradient>

        <View style={[styles.noteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Icon name="sparkles-outline" size={18} color={colors.primary} />
          <Text style={[styles.noteText, { color: colors.mutedText }]}>
            Changes apply to live in-app alerts and phone push delivery for this account.
          </Text>
        </View>

        {preferenceSections.map((section) => (
          <View key={section.title} style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{section.title}</Text>
              <Text style={[styles.sectionDescription, { color: colors.mutedText }]}>
                {section.description}
              </Text>
            </View>

            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {section.items.map((item, index) => {
                const isEnabled = settings[item.key];
                const isSaving = savingKey === item.key;

                return (
                  <View
                    key={item.key}
                    style={[
                      styles.preferenceRow,
                      index < section.items.length - 1 && [
                        styles.preferenceDivider,
                        { borderBottomColor: colors.border },
                      ],
                    ]}
                  >
                    <View style={[styles.preferenceIconWrap, { backgroundColor: `${colors.primary}12` }]}>
                      <Icon name={item.icon} size={18} color={colors.primary} />
                    </View>

                    <View style={styles.preferenceCopy}>
                      <View style={styles.preferenceTitleRow}>
                        <Text style={[styles.preferenceTitle, { color: colors.text }]}>{item.label}</Text>
                        <View
                          style={[
                            styles.statusChip,
                            {
                              backgroundColor: isEnabled ? `${colors.primary}16` : colors.surface,
                              borderColor: isEnabled ? `${colors.primary}33` : colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusChipText,
                              { color: isEnabled ? colors.primary : colors.mutedText },
                            ]}
                          >
                            {isEnabled ? "On" : "Off"}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.preferenceDescription, { color: colors.mutedText }]}>
                        {item.description}
                      </Text>
                    </View>

                    <View style={styles.preferenceControl}>
                      {isSaving ? (
                        <ActivityIndicator size="small" color={colors.primary} style={styles.spinner} />
                      ) : null}
                      <Switch
                        value={isEnabled}
                        onValueChange={(value) => updateSetting(item.key, value)}
                        trackColor={{ false: colors.border, true: `${colors.primary}66` }}
                        thumbColor={isEnabled ? colors.primary : colors.card}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        <View style={[styles.footerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.footerTitle, { color: colors.text }]}>A cleaner notification flow</Text>
          <Text style={[styles.footerText, { color: colors.mutedText }]}>
            Keep the essentials on, turn down the noise, and let the inbox highlight what actually matters to you.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default NotificationSettingsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
    paddingHorizontal: 14,
  },
  headerEyebrow: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  headerTitle: {
    marginTop: 3,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  headerPlaceholder: {
    width: 42,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 36,
  },
  heroCard: {
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  heroBadge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  heroBadgeValue: {
    fontSize: 20,
    fontWeight: "800",
  },
  heroBadgeLabel: {
    marginTop: 2,
    fontSize: 11.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  heroTitle: {
    marginTop: 18,
    fontSize: 21,
    fontWeight: "800",
    lineHeight: 28,
    maxWidth: 270,
  },
  heroText: {
    marginTop: 8,
    fontSize: 13.5,
    lineHeight: 20,
    maxWidth: 300,
  },
  noteCard: {
    marginTop: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  noteText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 13,
    lineHeight: 19,
  },
  sectionBlock: {
    marginTop: 22,
  },
  sectionHeader: {
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  sectionDescription: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
  },
  sectionCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    overflow: "hidden",
  },
  preferenceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  preferenceDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  preferenceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  preferenceCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  preferenceTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  preferenceTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    paddingRight: 8,
  },
  statusChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  preferenceDescription: {
    marginTop: 6,
    fontSize: 12.5,
    lineHeight: 18,
  },
  preferenceControl: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 10,
  },
  spinner: {
    marginRight: 10,
  },
  footerCard: {
    marginTop: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  footerTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  footerText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
  },
});
