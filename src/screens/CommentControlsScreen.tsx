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

const options = [
  {
    value: "everyone",
    label: "Everyone",
    description: "Anyone who can see your content can leave comments.",
  },
  {
    value: "people_you_follow",
    label: "People you follow",
    description: "Only accounts you follow can comment on your posts and stories.",
  },
  {
    value: "followers",
    label: "Followers",
    description: "Only people following you can comment.",
  },
  {
    value: "no_one",
    label: "No one",
    description: "Turn off comments from everyone except yourself.",
  },
] as const;

type CommentSetting = (typeof options)[number]["value"];

const CommentControlsScreen = ({ navigation }: any) => {
  const { colors } = useAppTheme();
  const [value, setValue] = useState<CommentSetting>("everyone");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get("/user/interaction-settings");
      setValue((res.data?.interactionPreferences?.commentsFrom || "everyone") as CommentSetting);
    } catch (error) {
      console.log("comment settings load error:", error);
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

  const updateValue = async (nextValue: CommentSetting) => {
    if (saving || nextValue === value) {
      return;
    }

    const previous = value;
    setValue(nextValue);
    setSaving(true);

    try {
      const res = await API.put("/user/interaction-settings", {
        commentsFrom: nextValue,
      });
      setValue((res.data?.interactionPreferences?.commentsFrom || nextValue) as CommentSetting);
    } catch (error) {
      console.log("comment settings update error:", error);
      setValue(previous);
      Alert.alert("Unable to update setting", "Please try again.");
    } finally {
      setSaving(false);
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Comments</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.helperCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.helper, { color: colors.mutedText }]}>
            Choose who can comment on your posts and story replies across the app.
          </Text>
        </View>

        <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {options.map((option) => {
            const selected = value === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.item, { borderBottomColor: colors.border }]}
                onPress={() => updateValue(option.value)}
                disabled={saving}
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
      </ScrollView>

      {saving ? <ActivityIndicator style={styles.saving} size="small" color={colors.primary} /> : null}
    </SafeAreaView>
  );
};

export default CommentControlsScreen;

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
  listCard: { marginTop: 14, borderWidth: 1, borderRadius: 20, overflow: "hidden" },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 18,
    borderBottomWidth: 1,
  },
  copy: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: "600" },
  itemDescription: { marginTop: 6, fontSize: 13, lineHeight: 18 },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  saving: { marginTop: 12, marginBottom: 12 },
});
