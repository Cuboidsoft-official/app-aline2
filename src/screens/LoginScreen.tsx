import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
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

import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { useAppTheme } from "../theme/AppThemeContext";
import { alpha, appFonts, appRadii, appShadows, appSpacing, appTypography } from "../theme/designSystem";
import { Alert } from "../utils/appAlert";
import { setStoredSession } from "../utils/authSession";
import { registerPushToken } from "../utils/pushRegistration";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGO_URI = "https://aline2.com/asstes/images/logo/logo.jpeg";

const LoginScreen = ({ navigation, route }: any) => {
  const { colors } = useAppTheme();
  const presetEmail = String(route?.params?.email || "").trim().toLowerCase();
  const [email, setEmail] = useState(presetEmail);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);

  useEffect(() => {
    if (presetEmail) {
      setEmail(presetEmail);
    }
  }, [presetEmail]);

  const handleMissingPassword = () => {
    const normalizedEmail = String(email || "").trim().toLowerCase();

    Alert.alert(
      "Password not set",
      "This account does not have a password yet. Use email OTP once to create or reset it safely.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Use email OTP",
          onPress: () => navigation.navigate("ForgotPassword", { email: normalizedEmail }),
        },
      ],
    );
  };

  const handleLogin = async () => {
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail || !password) {
      Alert.alert("Missing credentials", "Please enter email and password.");
      return;
    }

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }

    if (loading) {
      return;
    }

    try {
      setLoading(true);

      const res = await API.post("/auth/login", {
        email: normalizedEmail,
        password,
      });

      if (!res?.data?.success) {
        Alert.alert("Login failed", res?.data?.message || "Login failed");
        return;
      }

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
    } catch (error: any) {
      if (["password_missing", "PASSWORD_NOT_SET"].includes(String(error?.response?.data?.reason || error?.response?.data?.code || "").trim())) {
        handleMissingPassword();
        return;
      }

      Alert.alert("Login failed", getReadableApiErrorMessage(error, "Something went wrong."));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailOtpLogin = async () => {
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanEmail) {
      Alert.alert("Missing email", "Enter your email first to receive a login OTP.");
      return;
    }

    if (!EMAIL_REGEX.test(cleanEmail)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }

    try {
      setOtpLoading(true);
      const res = await API.post("/auth/send-otp", {
        email: cleanEmail,
        purpose: "login",
      });

      if (res?.data?.success) {
        navigation.navigate("OtpVerify", {
          email: cleanEmail,
          purpose: "login",
        });
        return;
      }

      Alert.alert("Unable to send OTP", res?.data?.message || "Please try again.");
    } catch (error: any) {
      Alert.alert("Unable to send OTP", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.orb, styles.orbTop, { backgroundColor: alpha(colors.primary, "24") }]} />
      <View style={[styles.orb, styles.orbBottom, { backgroundColor: alpha("#0C91E3", "1E") }]} />

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
          <View style={[styles.heroCard, { backgroundColor: alpha(colors.card, "EC"), borderColor: alpha(colors.border, "90") }]}>
            <Image source={{ uri: LOGO_URI }} style={styles.logo} />
            <Text style={[styles.heroTitle, { color: colors.text }]}>Welcome back</Text>
            <Text style={[styles.heroSubtitle, { color: colors.mutedText }]}>
              Sign in to continue your social, seller, and appointment experience.
            </Text>
          </View>

          <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.formTitle, { color: colors.text }]}>Log in</Text>

            <TextInput
              placeholder="Email address"
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={email}
              onChangeText={setEmail}
              placeholderTextColor={colors.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
            />

            <TextInput
              placeholder="Password"
              secureTextEntry
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={password}
              onChangeText={setPassword}
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
            />

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]}
              onPress={() => {
                handleLogin().catch(() => {});
              }}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Log in</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate("ForgotPassword", { email })}>
              <Text style={[styles.linkText, { color: colors.primary }]}>Forgot password?</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => {
              handleEmailOtpLogin().catch(() => {});
            }} disabled={otpLoading}>
              <Text style={[styles.linkText, { color: colors.text }]}>
                {otpLoading ? "Sending OTP..." : "Use email OTP instead"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: colors.border, backgroundColor: alpha(colors.surface, "E8") }]}
              onPress={() => navigation.navigate("Signup")}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Create new account</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default LoginScreen;

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
    paddingVertical: appSpacing.xl,
  },
  orb: {
    position: "absolute",
    borderRadius: 999,
  },
  orbTop: {
    width: 240,
    height: 240,
    top: -70,
    right: -40,
  },
  orbBottom: {
    width: 280,
    height: 280,
    bottom: -110,
    left: -70,
  },
  heroCard: {
    marginTop: appSpacing.lg,
    borderWidth: 1,
    borderRadius: appRadii.xl,
    paddingHorizontal: appSpacing.lg,
    paddingVertical: appSpacing.xl,
    alignItems: "center",
    ...appShadows.card,
  },
  logo: {
    width: 76,
    height: 76,
    borderRadius: 38,
    marginBottom: appSpacing.md,
  },
  heroTitle: {
    ...appTypography.h2,
    textAlign: "center",
  },
  heroSubtitle: {
    marginTop: appSpacing.xs,
    ...appTypography.body,
    textAlign: "center",
  },
  formCard: {
    marginTop: appSpacing.lg,
    borderWidth: 1,
    borderRadius: appRadii.xl,
    padding: appSpacing.lg,
    ...appShadows.card,
  },
  formTitle: {
    ...appTypography.h3,
    marginBottom: appSpacing.md,
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
  primaryButton: {
    marginTop: appSpacing.xs,
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
  linkText: {
    textAlign: "center",
    marginTop: appSpacing.md,
    fontFamily: appFonts.semibold,
    fontSize: 14,
  },
  secondaryButton: {
    marginTop: appSpacing.lg,
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
