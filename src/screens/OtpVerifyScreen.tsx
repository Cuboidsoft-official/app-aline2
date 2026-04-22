import React, { useRef, useState } from "react";
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
import { setStoredSession } from "../utils/authSession";
import { registerPushToken } from "../utils/pushRegistration";

const OTP_SENDER_HINT =
  "Verification emails may currently arrive from our delivery inbox while Aline2 branded mail is being finalized.";

const showOtpComingSoon = () => {
  Alert.alert(
    "Coming soon",
    "Email OTP is being upgraded to Aline2-branded delivery and will be available again soon. Please try again later or use another sign-in method.",
  );
};

const OtpVerifyScreen = ({ route, navigation }: any) => {
  const { colors } = useAppTheme();
  const email = String(route?.params?.email || "").trim().toLowerCase();
  const purpose = route?.params?.purpose === "login" ? "login" : "signup";
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const verifyOtp = async () => {
    if (!email) {
      Alert.alert("Missing email", "Please start again from the sign in screen.");
      navigation.replace(purpose === "login" ? "Login" : "Signup");
      return;
    }

    if (String(otp || "").trim().length !== 6) {
      Alert.alert("Invalid OTP", "Please enter the 6 digit code sent to your email.");
      return;
    }

    if (loading) {
      return;
    }

    try {
      setLoading(true);

      const res = await API.post("/auth/verify-otp", {
        email,
        otp: String(otp).trim(),
      });

      if (!res?.data?.success) {
        Alert.alert("Verification failed", res?.data?.message || "Invalid OTP");
        return;
      }

      const nextStep = String(res?.data?.nextStep || "").trim();

      if (nextStep === "authenticated" || (res?.data?.token && res?.data?.user)) {
        await setStoredSession({
          accessToken: res.data.accessToken || res.data.token,
          refreshToken: res.data.refreshToken,
          session: res.data.session,
          user: res.data.user,
        });
        registerPushToken().catch(() => {});

        navigation.reset({
          index: 0,
          routes: [{ name: "MainApp" }],
        });
        return;
      }

      if (nextStep === "reset_password") {
        navigation.replace("ForgotPassword", { email });
        return;
      }

      if (nextStep === "set_password" || purpose === "signup") {
        navigation.replace("SetupAccount", { email });
        return;
      }

      Alert.alert("Verification failed", "The server returned an unexpected verification state.");
    } catch (error: any) {
      Alert.alert("Verification failed", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (!email || resendLoading) {
      return;
    }

    try {
      setResendLoading(true);
      const res = await API.post("/auth/send-otp", {
        email,
        purpose,
      });

      if (res?.data?.success) {
        Alert.alert("OTP sent", res?.data?.message || "A fresh verification code has been sent.");
        inputRef.current?.focus();
        return;
      }

      Alert.alert("Unable to resend OTP", res?.data?.message || "Please try again.");
    } catch (error: any) {
      if (String(error?.response?.data?.code || "").trim() === "OTP_NOT_CONFIGURED") {
        showOtpComingSoon();
        return;
      }

      Alert.alert("Unable to resend OTP", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.orb, styles.orbTop, { backgroundColor: alpha(colors.primary, "22") }]} />
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
            <View style={[styles.logoRing, { borderColor: alpha(colors.primary, "4A") }]}>
              <Text style={styles.logoMark}>A2</Text>
            </View>
            <Text style={[styles.heroTitle, { color: colors.text }]}>Verify your email</Text>
            <Text style={[styles.heroSubtitle, { color: colors.mutedText }]}>
              {purpose === "login" ? "Use the OTP to sign in." : "Use the OTP to continue creating your account."}
            </Text>
          </View>

          <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.emailRow}>
              <Icon name="mail-outline" size={16} color={colors.primary} />
              <Text style={[styles.emailText, { color: colors.text }]} numberOfLines={1}>
                {email || "your email"}
              </Text>
            </View>

            <Text style={[styles.hintText, { color: colors.mutedText }]}>{OTP_SENDER_HINT}</Text>

            <TextInput
              ref={inputRef}
              placeholder="Enter 6 digit OTP"
              value={otp}
              onChangeText={(value) => setOtp(String(value || "").replace(/[^0-9]/g, ""))}
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              maxLength={6}
              autoFocus
              placeholderTextColor={colors.placeholder}
            />

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]}
              onPress={() => {
                verifyOtp().catch(() => {});
              }}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>{purpose === "login" ? "Log in with OTP" : "Verify and continue"}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: colors.border, backgroundColor: alpha(colors.surface, "E8") }]}
              onPress={() => {
                resendOtp().catch(() => {});
              }}
              disabled={resendLoading || loading}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
                {resendLoading ? "Sending..." : "Resend OTP"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default OtpVerifyScreen;

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
    top: -70,
    right: -40,
  },
  orbBottom: {
    width: 240,
    height: 240,
    bottom: -110,
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
    alignItems: "center",
    ...appShadows.card,
  },
  logoRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  logoMark: {
    color: "#FFFFFF",
    fontFamily: appFonts.bold,
    fontSize: 24,
    letterSpacing: 1.2,
  },
  heroTitle: {
    marginTop: appSpacing.md,
    ...appTypography.h2,
    textAlign: "center",
  },
  heroSubtitle: {
    marginTop: appSpacing.xs,
    ...appTypography.body,
    textAlign: "center",
  },
  panel: {
    marginTop: appSpacing.lg,
    borderWidth: 1,
    borderRadius: appRadii.xl,
    padding: appSpacing.lg,
    ...appShadows.card,
  },
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  emailText: {
    flex: 1,
    marginLeft: appSpacing.xs,
    ...appTypography.title,
  },
  hintText: {
    marginTop: appSpacing.sm,
    ...appTypography.caption,
  },
  input: {
    marginTop: appSpacing.lg,
    borderWidth: 1,
    borderRadius: appRadii.lg,
    paddingHorizontal: appSpacing.md,
    paddingVertical: Platform.OS === "ios" ? 16 : 14,
    fontFamily: appFonts.semibold,
    fontSize: 18,
    letterSpacing: 4,
    textAlign: "center",
  },
  primaryButton: {
    marginTop: appSpacing.lg,
    minHeight: 54,
    borderRadius: appRadii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
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
  buttonDisabled: {
    opacity: 0.7,
  },
});
