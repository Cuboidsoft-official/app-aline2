import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../theme/AppThemeContext";

const FeatureInfoScreen = ({ navigation, route }: any) => {
  const { colors, isDarkMode } = useAppTheme();
  const title = route?.params?.title || "Coming Soon";
  const description =
    route?.params?.description ||
    "This feature is being prepared and will be available in a future update.";
  const primaryLabel = route?.params?.primaryLabel || "";
  const primaryRoute = route?.params?.primaryRoute || "";
  const primaryParams = route?.params?.primaryParams || undefined;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <View style={[styles.iconWrap, { backgroundColor: isDarkMode ? "#221B3A" : "#F2EDFF" }]}>
          <Icon name="construct-outline" size={34} color={colors.primary} />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.description, { color: colors.mutedText }]}>{description}</Text>

        {primaryLabel && primaryRoute ? (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate(primaryRoute, primaryParams)}
          >
            <Text style={styles.primaryButtonText}>{primaryLabel}</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()}>
          <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default FeatureInfoScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 56,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111",
  },
  headerSpacer: {
    width: 24,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2EDFF",
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111",
    textAlign: "center",
  },
  description: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: "#666",
    textAlign: "center",
  },
  primaryButton: {
    marginTop: 24,
    backgroundColor: "#7B4DFF",
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  secondaryButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: "#7B4DFF",
    fontWeight: "700",
    fontSize: 14,
  },
});
