import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";

import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { useAppTheme } from "../theme/AppThemeContext";

const HelpSupportScreen = ({ navigation }: any) => {
  const { colors } = useAppTheme();
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [supportEmail, setSupportEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadAccount = useCallback(async () => {
    try {
      const response = await API.get("/auth/account-center");
      setEmail(String(response.data?.account?.email || "").trim().toLowerCase());
    } catch (error) {
      console.log("help support account load error:", error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAccount();
    }, [loadAccount])
  );

  const submit = async () => {
    if (loading) {
      return;
    }

    try {
      setLoading(true);
      const response = await API.post("/auth/support/contact", {
        email,
        subject,
        message,
      });

      setSupportEmail(response.data?.supportEmail || null);
      setSubject("");
      setMessage("");
      Alert.alert(
        "Support request sent",
        response.data?.supportEmail
          ? `We’ve recorded your request and shared it with ${response.data.supportEmail}.`
          : "We’ve recorded your request and the team will follow up by email."
      );
    } catch (error) {
      Alert.alert("Unable to send request", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Help & Support</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView style={styles.flexFill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Contact support</Text>
            <Text style={[styles.helper, { color: colors.mutedText }]}>
              Use this form for login problems, profile issues, publishing bugs, payments, or anything blocking your account.
            </Text>
            {supportEmail ? (
              <Text style={[styles.helper, { color: colors.mutedText }]}>Support inbox: {supportEmail}</Text>
            ) : null}

            <Text style={[styles.label, { color: colors.text }]}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={colors.placeholder}
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            />

            <Text style={[styles.label, { color: colors.text }]}>Subject</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder="What do you need help with?"
              placeholderTextColor={colors.placeholder}
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            />

            <Text style={[styles.label, { color: colors.text }]}>Details</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              multiline
              textAlignVertical="top"
              placeholder="Tell us what happened, what screen you were on, and what you expected."
              placeholderTextColor={colors.placeholder}
              style={[styles.textarea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            />

            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: colors.primary }, loading && styles.submitButtonDisabled]}
              onPress={submit}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Send request</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  flexFill: { flex: 1 },
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
  content: { padding: 20 },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  helper: { marginTop: 8, fontSize: 13, lineHeight: 19 },
  label: { marginTop: 18, marginBottom: 8, fontSize: 14, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
    fontSize: 15,
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 14,
    minHeight: 140,
    fontSize: 15,
  },
  submitButton: {
    marginTop: 20,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});

export default HelpSupportScreen;
