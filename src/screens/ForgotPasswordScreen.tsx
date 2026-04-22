import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Alert } from "../utils/appAlert";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";

import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { useAppTheme } from "../theme/AppThemeContext";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_SENDER_HINT = "Verification emails may currently arrive from our delivery inbox while Aline2 branded mail is being finalized.";

const showOtpComingSoon = () => {
  Alert.alert(
    "Coming soon",
    "Email OTP is being upgraded to Aline2-branded delivery and will be available again soon. Please use password login or Google sign-in for now.",
  );
};

const ForgotPasswordScreen = ({ navigation, route }: any) => {
  const { colors } = useAppTheme();
  const presetEmail = String(route?.params?.email || "").trim().toLowerCase();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState<"request" | "verify" | "reset">("request");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (presetEmail) {
      setEmail(presetEmail);
    }
  }, [presetEmail]);

  const normalizedEmail = useMemo(() => String(email || "").trim().toLowerCase(), [email]);

  const sendOtp = async () => {
    if (!normalizedEmail) {
      Alert.alert("Missing email", "Please enter your email address.");
      return;
    }

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }

    try {
      setLoading(true);
      const res = await API.post("/auth/send-otp", {
        email: normalizedEmail,
        purpose: "reset-password",
      });
      if (res?.data?.success) {
        setStep("verify");
        setOtp("");
        Alert.alert("OTP sent", "We sent a verification code to your email.");
        return;
      }

      Alert.alert("Unable to send OTP", res?.data?.message || "Please try again.");
    } catch (error: any) {
      if (String(error?.response?.data?.code || "").trim() === "OTP_NOT_CONFIGURED") {
        showOtpComingSoon();
        return;
      }

      Alert.alert("Unable to send OTP", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!normalizedEmail || String(otp || "").trim().length !== 6) {
      Alert.alert("Invalid OTP", "Please enter the 6 digit OTP sent to your email.");
      return;
    }

    try {
      setLoading(true);
      const res = await API.post("/auth/verify-otp", {
        email: normalizedEmail,
        otp: String(otp).trim(),
      });

      if (res?.data?.success) {
        if (res?.data?.nextStep === "reset_password") {
          setStep("reset");
          setPassword("");
          setConfirmPassword("");
          return;
        }

        Alert.alert("OTP verification failed", "The server returned an unexpected verification state. Please request a new OTP.");
        return;
      }

      Alert.alert("OTP verification failed", res?.data?.message || "Please try again.");
    } catch (error: any) {
      Alert.alert("OTP verification failed", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (!normalizedEmail || String(password || "").trim().length < 6) {
      Alert.alert("Weak password", "Please enter a password with at least 6 characters.");
      return;
    }

    if (String(password) !== String(confirmPassword)) {
      Alert.alert("Passwords do not match", "Please make sure both password fields match.");
      return;
    }

    try {
      setLoading(true);
      const res = await API.post("/auth/set-password", {
        email: normalizedEmail,
        password: password.trim(),
      });

      if (res?.data?.success) {
        Alert.alert("Password updated", "Your password has been reset successfully.", [
          {
            text: "Go to Login",
            onPress: () => navigation.replace("Login", { email: normalizedEmail }),
          },
        ]);
        return;
      }

      Alert.alert("Password reset failed", res?.data?.message || "Please try again.");
    } catch (error: any) {
      Alert.alert("Password reset failed", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const actionLabel =
    step === "request" ? "Send OTP" : step === "verify" ? "Verify OTP" : "Reset Password";

  const handlePrimaryAction = () => {
    if (step === "request") {
      sendOtp().catch(() => {});
      return;
    }

    if (step === "verify") {
      verifyOtp().catch(() => {});
      return;
    }

    resetPassword().catch(() => {});
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Forgot Password</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView style={styles.flexFill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.title, { color: colors.text }]}>Recover your account</Text>
          <Text style={[styles.subtitle, { color: colors.mutedText }]}>
            {step === "request"
              ? "Enter your email and we’ll send you a verification code."
              : step === "verify"
                ? "Enter the 6 digit OTP sent to your email."
                : "Create a new password for your account."}
          </Text>
          {step !== "reset" ? (
            <Text style={[styles.subtitle, { color: colors.mutedText }]}>{OTP_SENDER_HINT}</Text>
          ) : null}

          <TextInput
            placeholder="Email address"
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
            editable={!loading && step === "request"}
            placeholderTextColor={colors.placeholder}
          />

          {step === "verify" ? (
            <TextInput
              placeholder="Enter OTP"
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              maxLength={6}
              value={otp}
              onChangeText={setOtp}
              editable={!loading}
              placeholderTextColor={colors.placeholder}
            />
          ) : null}

          {step === "reset" ? (
            <>
              <TextInput
                placeholder="New password"
                style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                value={password}
                onChangeText={setPassword}
                editable={!loading}
                placeholderTextColor={colors.placeholder}
              />
              <TextInput
                placeholder="Confirm new password"
                style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!loading}
                placeholderTextColor={colors.placeholder}
              />
            </>
          ) : null}

          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={handlePrimaryAction} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{actionLabel}</Text>}
          </TouchableOpacity>

          {step === "verify" ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={() => sendOtp().catch(() => {})} disabled={loading}>
              <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Resend OTP</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.replace("Login", { email: normalizedEmail || presetEmail })} disabled={loading}>
            <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Back to Login</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ForgotPasswordScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  flexFill: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
  },
  headerSpacer: {
    width: 24,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111",
  },
  subtitle: {
    marginTop: 10,
    color: "#666",
    fontSize: 15,
    lineHeight: 22,
  },
  input: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#111",
    backgroundColor: "#FAFAFA",
  },
  primaryButton: {
    marginTop: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#7B4DFF",
    borderRadius: 14,
    paddingVertical: 15,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  secondaryButton: {
    marginTop: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: "#7B4DFF",
    fontWeight: "700",
    fontSize: 14,
  },
});
