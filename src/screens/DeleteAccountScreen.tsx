import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { clearStoredSession } from "../utils/authSession";
import { useAppTheme } from "../theme/AppThemeContext";
import { clearPushToken } from "../utils/pushRegistration";

const reasonOptions = [
  { value: "privacy_concerns", label: "Privacy or trust concerns" },
  { value: "too_many_notifications", label: "Too many notifications" },
  { value: "not_useful_anymore", label: "I am not using Aline2 anymore" },
  { value: "created_duplicate_account", label: "I created another account" },
  { value: "technical_issues", label: "Technical or performance issues" },
  { value: "found_alternative", label: "I found a better alternative" },
  { value: "other", label: "Other reason" },
] as const;

const DeleteAccountScreen = ({ navigation }: any) => {
  const { colors, isDarkMode } = useAppTheme();
  const [password, setPassword] = useState("");
  const [confirmationText, setConfirmationText] = useState("");
  const [deletionReason, setDeletionReason] = useState("");
  const [deletionFeedback, setDeletionFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const trimmedConfirmationText = confirmationText.trim().toUpperCase();
  const canSubmit = useMemo(
    () => trimmedConfirmationText === "DELETE" && !!deletionReason && !loading,
    [deletionReason, loading, trimmedConfirmationText]
  );

  const deleteAccount = () => {
    if (!deletionReason) {
      setErrorMessage("Select a reason before deleting your account.");
      return;
    }

    if (deletionReason === "other" && deletionFeedback.trim().length < 10) {
      setErrorMessage("Please share a few more details so we can understand why you're leaving.");
      return;
    }

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
                confirmationText,
                deletionReason,
                deletionFeedback,
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

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.warningTitle, { color: colors.text }]}>Permanent account deletion</Text>
        <Text style={[styles.warningCopy, { color: colors.mutedText }]}>
          Before we delete the account, tell us why you are leaving. This feedback helps us fix the right issues and improve the product.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Why are you leaving?</Text>
        <View style={styles.reasonList}>
          {reasonOptions.map((option) => {
            const selected = deletionReason === option.value;

            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.reasonButton,
                  {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected
                      ? (isDarkMode ? "rgba(187, 48, 235, 0.18)" : "rgba(187, 48, 235, 0.10)")
                      : colors.surface,
                  },
                ]}
                onPress={() => {
                  setDeletionReason(option.value);
                  if (errorMessage) {
                    setErrorMessage("");
                  }
                }}
              >
                <Text style={[styles.reasonText, { color: colors.text }]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Anything we should know?</Text>
        <TextInput
          value={deletionFeedback}
          onChangeText={(value) => {
            setDeletionFeedback(value);
            if (errorMessage) {
              setErrorMessage("");
            }
          }}
          multiline
          textAlignVertical="top"
          placeholder="Tell us what went wrong, what felt missing, or what would have convinced you to stay."
          placeholderTextColor={colors.placeholder}
          style={[
            styles.textarea,
            { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
          ]}
        />

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Confirm deletion</Text>
        <Text style={[styles.warningCopy, { color: colors.mutedText }]}>
          Type DELETE below. If your account uses a password, enter it too. Your account data and related records will be removed.
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
          <Text style={[styles.requirementText, { color: deletionReason ? colors.text : colors.mutedText }]}>
            {deletionReason ? "Feedback reason selected" : "Select why you are leaving"}
          </Text>
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
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.deleteButtonText}>Send feedback and delete account</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

export default DeleteAccountScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  headerSpacer: { width: 24 },
  content: { padding: 20, paddingBottom: 40 },
  warningTitle: { fontSize: 22, fontWeight: "800" },
  warningCopy: { marginTop: 10, fontSize: 14, lineHeight: 21 },
  sectionTitle: { marginTop: 22, fontSize: 16, fontWeight: "700" },
  reasonList: { marginTop: 14, gap: 10 },
  reasonButton: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 },
  reasonText: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, marginTop: 18 },
  textarea: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, marginTop: 14, minHeight: 120 },
  requirementsCard: { marginTop: 18, borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
  requirementsTitle: { fontSize: 15, fontWeight: "700" },
  requirementText: { fontSize: 14, lineHeight: 20 },
  errorBanner: { marginTop: 18, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  errorText: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  deleteButton: { marginTop: 28, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  deleteButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 }
});
