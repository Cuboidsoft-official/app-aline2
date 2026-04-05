import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, Alert, StyleSheet, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { clearStoredSession } from "../utils/authSession";
import { useAppTheme } from "../theme/AppThemeContext";
import { clearPushToken } from "../utils/pushRegistration";

const DeleteAccountScreen = ({ navigation }: any) => {
  const { colors, isDarkMode } = useAppTheme();
  const [password, setPassword] = useState("");
  const [confirmationText, setConfirmationText] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const trimmedConfirmationText = confirmationText.trim().toUpperCase();
  const canSubmit = useMemo(
    () => trimmedConfirmationText === "DELETE" && !loading,
    [loading, trimmedConfirmationText]
  );

  const deleteAccount = () => {
    if (trimmedConfirmationText !== "DELETE") {
      setErrorMessage('Type "DELETE" exactly to confirm account deletion.');
      return;
    }

    Alert.alert(
      "Delete account",
      "This permanently removes your account data, conversations, posts, services, and related records. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setErrorMessage("");
              setLoading(true);
              const res = await API.post("/user/account/delete", {
                password,
                confirmationText
              });

              if (!res.data?.success) {
                Alert.alert("Unable to delete account", res.data?.message || "Please try again.");
                return;
              }

              await clearPushToken();
              await clearStoredSession();
              navigation.reset({
                index: 0,
                routes: [{ name: "Login" }]
              });
            } catch (error: any) {
              setErrorMessage(getReadableApiErrorMessage(error, "Please try again."));
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Delete Account</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <Text style={[styles.warningTitle, { color: colors.text }]}>Permanent account deletion</Text>
        <Text style={[styles.warningCopy, { color: colors.mutedText }]}>
          To prevent accidental deletion, type DELETE below. If your account uses a password, enter it too. Your account data and related records will be removed.
        </Text>

        <TextInput
          secureTextEntry
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (errorMessage) {
              setErrorMessage("");
            }
          }}
          placeholder="Current password if set"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
        />

        <TextInput
          value={confirmationText}
          onChangeText={(value) => {
            setConfirmationText(value);
            if (errorMessage) {
              setErrorMessage("");
            }
          }}
          placeholder='Type DELETE'
          autoCapitalize="characters"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
        />

        <View style={[styles.requirementsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.requirementsTitle, { color: colors.text }]}>Before we delete your account</Text>
          <Text style={[styles.requirementText, { color: password.trim() ? colors.text : colors.mutedText }]}>
            {password.trim() ? "Password entered for password-based account" : "Password is optional for Google-only accounts"}
          </Text>
          <Text style={[styles.requirementText, { color: trimmedConfirmationText === "DELETE" ? colors.text : colors.mutedText }]}>
            {trimmedConfirmationText === "DELETE" ? 'Confirmation phrase ready' : 'Type "DELETE" exactly'}
          </Text>
        </View>

        {errorMessage ? (
          <View style={[styles.errorBanner, { backgroundColor: isDarkMode ? "#3b1f24" : "#FEE2E2", borderColor: isDarkMode ? "#7f1d1d" : "#FCA5A5" }]}>
            <Text style={[styles.errorText, { color: isDarkMode ? "#FECACA" : "#991B1B" }]}>{errorMessage}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.deleteButton, { backgroundColor: canSubmit ? "#d62828" : "#d37f7f" }]}
          onPress={deleteAccount}
          disabled={!canSubmit}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.deleteButtonText}>Delete my account</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default DeleteAccountScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  headerSpacer: { width: 24 },
  content: { padding: 20 },
  warningTitle: { fontSize: 22, fontWeight: "800" },
  warningCopy: { marginTop: 10, fontSize: 14, lineHeight: 21 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, marginTop: 18 },
  requirementsCard: { marginTop: 18, borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
  requirementsTitle: { fontSize: 15, fontWeight: "700" },
  requirementText: { fontSize: 14, lineHeight: 20 },
  errorBanner: { marginTop: 18, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  errorText: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  deleteButton: { marginTop: 28, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  deleteButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 }
});
