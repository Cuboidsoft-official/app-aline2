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
  View
} from "react-native";
import { Alert } from "../utils/appAlert";
import { SafeAreaView } from "react-native-safe-area-context";

import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { setStoredSession } from "../utils/authSession";
import { registerPushToken } from "../utils/pushRegistration";
import { useAppTheme } from "../theme/AppThemeContext";

const OTP_SENDER_HINT = "Verification emails may currently arrive from our delivery inbox while Aline2 branded mail is being finalized.";

const showOtpComingSoon = () => {
  Alert.alert(
    "Coming soon",
    "Email OTP is being upgraded to Aline2-branded delivery and will be available again soon. Please try again later or use another sign-in method.",
  );
};

const OtpVerifyScreen = ({ route, navigation }: any) => {
  const { colors } = useAppTheme();
  const email = route?.params?.email || null;
  const purpose = route?.params?.purpose === "login" ? "login" : "signup";
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const [resendLoading, setResendLoading] = useState(false);

  const verifyOtp = async () => {
    if (!email) {
      Alert.alert("Error", "Email not found. Please start again.");
      return;
    }

    if (String(otp || "").trim().length !== 6) {
      Alert.alert("Error", "Please enter a valid 6 digit OTP.");
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
        Alert.alert("Verification Failed", res?.data?.message || "Invalid OTP");
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
        registerPushToken().catch(() => { });

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

      const referralCode = String(route?.params?.referralCode || "").trim().toUpperCase();

      if (nextStep === "set_password" || purpose === "signup") {
        navigation.replace("CompleteProfile", { email, referralCode });
        return;
      }

      Alert.alert("Verification Failed", "The server returned an unexpected verification state.");
    } catch (error: any) {
      Alert.alert("Verification Failed", getReadableApiErrorMessage(error, "Please try again."));
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.flexFill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={[styles.backArrow, { color: colors.text }]}>← Back</Text>
          </TouchableOpacity>

          <Text style={[styles.title, { color: colors.text }]}>Verify OTP</Text>
          <Text style={[styles.subtitle, { color: colors.mutedText }]}>
            {purpose === "login" ? "Login code sent to " : "OTP sent to "} {email || "your email"}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedText }]}>{OTP_SENDER_HINT}</Text>

          <TextInput
            ref={inputRef}
            placeholder="Enter 6 digit OTP"
            value={otp}
            onChangeText={setOtp}
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            maxLength={6}
            autoFocus
            placeholderTextColor={colors.placeholder}
          />

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }, loading && styles.disabledButton]}
            onPress={verifyOtp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{purpose === "login" ? "Log in with OTP" : "Verify"}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={resendOtp} disabled={resendLoading || loading}>
            <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
              {resendLoading ? "Sending..." : "Resend OTP"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default OtpVerifyScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flexFill: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  backArrow: {
    fontSize: 17,
    fontWeight: "700",
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 10,
    marginTop: 18,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 25,
    lineHeight: 20,
  },
  input: {
    height: 55,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 15,
    fontSize: 16,
    marginBottom: 20,
  },
  button: {
    height: 55,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  disabledButton: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    marginTop: 14,
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
