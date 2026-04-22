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

const USERNAME_REGEX = /^(?!.*[.]{2})(?!.*[_]{2})[a-z0-9._]{3,30}$/;
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
  const [showPasswordCard, setShowPasswordCard] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");

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

      if (nextStep === "set_password" || purpose === "signup") {
        setShowPasswordCard(true);
        setOtp("");
        return;
      }

      Alert.alert("Verification Failed", "The server returned an unexpected verification state.");
    } catch (error: any) {
      Alert.alert("Verification Failed", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async () => {
    if (!password || password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }

    try {
      setPasswordLoading(true);

      const cleanName = name.trim();
      const cleanUsername = username.trim().toLowerCase();

      if (!cleanName || cleanName.length < 2) {
        Alert.alert("Error", "Please enter your name (at least 2 characters).");
        return;
      }

      if (!cleanUsername || cleanUsername.length < 3) {
        Alert.alert("Error", "Please choose a username with at least 3 characters.");
        return;
      }

      if (!USERNAME_REGEX.test(cleanUsername)) {
        Alert.alert("Error", "Username must be 3 to 30 characters using lowercase letters, numbers, dots, or underscores, without double dots or underscores.");
        return;
      }

      const res = await API.post("/auth/set-password", {
        email,
        password,
        name: cleanName,
        username: cleanUsername,
      });

      if (!res?.data?.success) {
        Alert.alert("Error", res?.data?.message || "Something went wrong.");
        return;
      }

      const loginRes = await API.post("/auth/login", { email, password });

      if (!loginRes?.data?.success || !loginRes?.data?.user) {
        Alert.alert("Almost there", "Password was set, but we could not sign you in automatically. Please log in.");
        navigation.replace("Login", { email });
        return;
      }

      await setStoredSession({
        accessToken: loginRes.data.accessToken || loginRes.data.token,
        refreshToken: loginRes.data.refreshToken,
        session: loginRes.data.session,
        user: loginRes.data.user,
      });

      registerPushToken().catch(() => { });

      navigation.reset({
        index: 0,
        routes: [{ name: "MainApp" }],
      });
    } catch (error: any) {
      Alert.alert("Error", getReadableApiErrorMessage(error, "Server error"));
    } finally {
      setPasswordLoading(false);
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
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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

          {!showPasswordCard ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={resendOtp} disabled={resendLoading || loading}>
              <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
                {resendLoading ? "Sending..." : "Resend OTP"}
              </Text>
            </TouchableOpacity>
          ) : null}

          {showPasswordCard ? (
            <View style={[styles.passwordCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.passwordCardTitle, { color: colors.text }]}>Complete your profile</Text>
              <Text style={[styles.passwordCardSubtitle, { color: colors.mutedText }]}>
                Choose a name and username, then set a password to finish signing up.
              </Text>

              <TextInput
                placeholder="Full name"
                value={name}
                onChangeText={setName}
                style={[styles.modalInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
                placeholderTextColor={colors.placeholder}
                autoCapitalize="words"
                textContentType="name"
              />

              <TextInput
                placeholder="Username"
                value={username}
                onChangeText={(text) => setUsername(text.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                style={[styles.modalInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
                placeholderTextColor={colors.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="username"
              />

              <TextInput
                placeholder="Enter password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                style={[styles.modalInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
                placeholderTextColor={colors.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
              />

              <TextInput
                placeholder="Confirm password"
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                style={[styles.modalInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
                placeholderTextColor={colors.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
              />

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }, passwordLoading && styles.disabledButton]}
                onPress={handleSetPassword}
                disabled={passwordLoading}
              >
                {passwordLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save password</Text>}
              </TouchableOpacity>
            </View>
          ) : null}
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
  passwordCard: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
  },
  secondaryButton: {
    marginTop: 14,
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  passwordCardTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  passwordCardSubtitle: {
    marginTop: 6,
    marginBottom: 16,
    fontSize: 13,
    lineHeight: 18,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 15,
    height: 50,
    marginBottom: 15,
  },
  modalButton: {
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
  },
});
