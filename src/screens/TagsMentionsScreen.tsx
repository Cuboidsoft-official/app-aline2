import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { useAppTheme } from "../theme/AppThemeContext";

const tagMentionOptions = [
  {
    value: "everyone",
    label: "Everyone",
    description: "Anyone can include you when they post.",
  },
  {
    value: "people_you_follow",
    label: "People you follow",
    description: "Only people you follow can tag or mention you.",
  },
  {
    value: "no_one",
    label: "No one",
    description: "Nobody else can tag or mention you.",
  },
] as const;

type TagMentionSetting = (typeof tagMentionOptions)[number]["value"];

const settingSections = [
  {
    key: "mentionsFrom",
    title: "Mentions",
    description: "Controls who can @mention you in captions, comments, and stories.",
  },
  {
    key: "tagsFrom",
    title: "Tags",
    description: "Controls who can tag you in posts.",
  },
] as const;

const TagsMentionsScreen = ({ navigation }: any) => {
  const { colors } = useAppTheme();
  const [settings, setSettings] = useState<{
    mentionsFrom: TagMentionSetting;
    tagsFrom: TagMentionSetting;
  }>({
    mentionsFrom: "everyone",
    tagsFrom: "everyone",
  });
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<null | "mentionsFrom" | "tagsFrom">(null);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get("/user/interaction-settings");
      setSettings({
        mentionsFrom: (res.data?.interactionPreferences?.mentionsFrom || "everyone") as TagMentionSetting,
        tagsFrom: (res.data?.interactionPreferences?.tagsFrom || "everyone") as TagMentionSetting,
      });
    } catch (error) {
      console.log("tag mention settings load error:", error);
      Alert.alert("Unable to load settings", "Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings])
  );

  const updateSetting = async (key: "mentionsFrom" | "tagsFrom", value: TagMentionSetting) => {
    if (savingKey || settings[key] === value) {
      return;
    }

    const previous = settings[key];
    setSettings((current) => ({ ...current, [key]: value }));
    setSavingKey(key);

    try {
      const res = await API.put("/user/interaction-settings", {
        [key]: value,
      });
      setSettings({
        mentionsFrom: (res.data?.interactionPreferences?.mentionsFrom || "everyone") as TagMentionSetting,
        tagsFrom: (res.data?.interactionPreferences?.tagsFrom || "everyone") as TagMentionSetting,
      });
    } catch (error) {
      console.log("tag mention settings update error:", error);
      setSettings((current) => ({ ...current, [key]: previous }));
      Alert.alert("Unable to update setting", "Please try again.");
    } finally {
      setSavingKey(null);
    }
  };

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
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Tags and mentions</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.helperCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.helper, { color: colors.mutedText }]}>
            These settings now decide who can include your account in posts, comments, and stories.
          </Text>
        </View>

        <View style={styles.list}>
          {settingSections.map((section) => (
            <View
              key={section.key}
              style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{section.title}</Text>
              <Text style={[styles.sectionDescription, { color: colors.mutedText }]}>
                {section.description}
              </Text>

              {tagMentionOptions.map((option) => {
                const selected = settings[section.key] === option.value;
                return (
                  <TouchableOpacity
                    key={`${section.key}-${option.value}`}
                    style={[styles.item, { borderBottomColor: colors.border }]}
                    onPress={() => updateSetting(section.key, option.value)}
                    disabled={Boolean(savingKey)}
                  >
                    <View style={styles.copy}>
                      <Text style={[styles.itemTitle, { color: colors.text }]}>{option.label}</Text>
                      <Text style={[styles.itemDescription, { color: colors.mutedText }]}>
                        {option.description}
                      </Text>
                    </View>
                    {selected ? (
                      <Icon name="checkmark-circle" size={22} color={colors.primary} />
                    ) : (
                      <Icon name="ellipse-outline" size={22} color={colors.border} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      {savingKey ? <ActivityIndicator style={styles.saving} size="small" color={colors.primary} /> : null}
    </SafeAreaView>
  );
};

export default TagsMentionsScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 32 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  headerSpacer: { width: 24 },
  helperCard: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14 },
  helper: { fontSize: 14, lineHeight: 20 },
  list: { paddingTop: 14, paddingBottom: 32 },
  sectionCard: { marginBottom: 18, borderWidth: 1, borderRadius: 20, overflow: "hidden", paddingTop: 18 },
  sectionDescription: { fontSize: 13, lineHeight: 18, marginBottom: 8, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4, paddingHorizontal: 16 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  copy: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: "600" },
  itemDescription: { marginTop: 6, fontSize: 13, lineHeight: 18 },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  saving: { marginTop: 8, marginBottom: 12 },
});
