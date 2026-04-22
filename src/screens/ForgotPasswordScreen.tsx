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
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";

import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { useAppTheme } from "../theme/AppThemeContext";
import { alpha, appFonts, appRadii, appShadows, appSpacing, appTypography } from "../theme/designSystem";
import { Alert } from "../utils/appAlert";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_SENDER_HINT =
  "Verification emails may currently arrive from our delivery inbox while Aline2 branded mail is being finalized.";

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

      if (!res?.data?.success) {
        Alert.alert("OTP verification failed", res?.data?.message || "Please try again.");
        return;
      }

      if (res?.data?.nextStep === "reset_password") {
        setStep("reset");
        setPassword("");
        setConfirmPassword("");
        return;
      }

      Alert.alert("OTP verification failed", "Please request a new OTP and try again.");
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
    step === "request" ? "Send OTP" : step === "verify" ? "Verify OTP" : "Reset password";

  const stepTitle =
    step === "request"
      ? "Recover your account"
      : step === "verify"
        ? "Check your email"
        : "Create a new password";

  const stepBody =
    step === "request"
      ? "Enter your email address and we will send you a verification code."
      : step === "verify"
        ? "Enter the 6 digit OTP sent to your email."
        : "Choose a new password to finish recovering your account.";

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
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.orb, styles.orbTop, { backgroundColor: alpha(colors.primary, "20") }]} />
      <View style={[styles.orb, styles.orbBottom, { backgroundColor: alpha("#0C91E3", "18") }]} />

      <KeyboardAvoidingView
        style={styles.flexFill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.flexFill}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={20} color={colors.text} />
            <Text style={[styles.backText, { color: colors.text }]}>Back</Text>
          </TouchableOpacity>

          <View style={[styles.heroCard, { backgroundColor: alpha(colors.card, "EC"), borderColor: alpha(colors.border, "90") }]}>
            <Text style={[styles.heroEyebrow, { color: colors.primary }]}>Account recovery</Text>
            <Text style={[styles.heroTitle, { color: colors.text }]}>{stepTitle}</Text>
            <Text style={[styles.heroSubtitle, { color: colors.mutedText }]}>{stepBody}</Text>
          </View>

          <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
                onChangeText={(value) => setOtp(String(value || "").replace(/[^0-9]/g, ""))}
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

            {step !== "reset" ? (
              <Text style={[styles.hintText, { color: colors.mutedText }]}>{OTP_SENDER_HINT}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]}
              onPress={handlePrimaryAction}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{actionLabel}</Text>}
            </TouchableOpacity>

            {step === "verify" ? (
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: colors.border, backgroundColor: alpha(colors.surface, "E8") }]}
                onPress={() => sendOtp().catch(() => {})}
                disabled={loading}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Resend OTP</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => navigation.replace("Login", { email: normalizedEmail || presetEmail })}
              disabled={loading}
            >
              <Text style={[styles.linkText, { color: colors.primary }]}>Back to Login</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ForgotPasswordScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flexFill: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: appSpacing.lg,
    paddingTop: appSpacing.sm,
    paddingBottom: appSpacing.xxl,
  },
  orb: {
    position: "absolute",
    borderRadius: 999,
  },
  orbTop: {
    width: 220,
    height: 220,
    top: -80,
    right: -30,
  },
  orbBottom: {
    width: 260,
    height: 260,
    bottom: -120,
    left: -60,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    paddingVertical: appSpacing.xs,
  },
  backText: {
    fontFamily: appFonts.semibold,
    fontSize: 15,
  },
  heroCard: {
    marginTop: appSpacing.md,
    borderWidth: 1,
    borderRadius: appRadii.xl,
    paddingHorizontal: appSpacing.lg,
    paddingVertical: appSpacing.xl,
    ...appShadows.card,
  },
  heroEyebrow: {
    ...appTypography.overline,
  },
  heroTitle: {
    marginTop: appSpacing.sm,
    ...appTypography.h2,
  },
  heroSubtitle: {
    marginTop: appSpacing.xs,
    ...appTypography.body,
  },
  panel: {
    marginTop: appSpacing.lg,
    borderWidth: 1,
    borderRadius: appRadii.xl,
    padding: appSpacing.lg,
    ...appShadows.card,
  },
  input: {
    borderWidth: 1,
    borderRadius: appRadii.lg,
    paddingHorizontal: appSpacing.md,
    paddingVertical: Platform.OS === "ios" ? 16 : 14,
    fontFamily: appFonts.regular,
    fontSize: 15,
    marginBottom: appSpacing.sm,
  },
  hintText: {
    ...appTypography.caption,
    marginBottom: appSpacing.sm,
  },
  primaryButton: {
    marginTop: appSpacing.sm,
    minHeight: 54,
    borderRadius: appRadii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontFamily: appFonts.bold,
    fontSize: 16,
  },
  secondaryButton: {
    marginTop: appSpacing.sm,
    minHeight: 52,
    borderRadius: appRadii.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontFamily: appFonts.semibold,
    fontSize: 15,
  },
  linkButton: {
    marginTop: appSpacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  linkText: {
    fontFamily: appFonts.semibold,
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
