import React, { useState } from "react";
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

const SignupScreen = ({ navigation }: any) => {
  const { colors } = useAppTheme();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const goToLogin = (params?: Record<string, any>) => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.replace("Login", params);
  };

  const sendOtp = async () => {
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanEmail) {
      Alert.alert("Missing email", "Please enter your email address.");
      return;
    }

    if (!EMAIL_REGEX.test(cleanEmail)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }

    if (loading) {
      return;
    }

    try {
      setLoading(true);

      const res = await API.post("/auth/send-otp", {
        email: cleanEmail,
        purpose: "signup",
      });

      if (res?.data?.success) {
        navigation.navigate("OtpVerify", {
          email: cleanEmail,
          purpose: "signup",
        });
        return;
      }

      Alert.alert("Unable to send OTP", res?.data?.message || "Failed to send OTP.");
    } catch (err: any) {
      const status = err?.response?.status;
      const code = err?.response?.data?.code;

      if (status === 409 && code === "ACCOUNT_EXISTS") {
        Alert.alert(
          "Account found",
          "This email is already registered. Please log in instead.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Go to Login",
              onPress: () => navigation.replace("Login", { email: cleanEmail }),
            },
          ],
        );
        return;
      }

      Alert.alert("Unable to send OTP", getReadableApiErrorMessage(err, "Something went wrong. Try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.orb, styles.orbTop, { backgroundColor: alpha(colors.primary, "22") }]} />
      <View style={[styles.orb, styles.orbBottom, { backgroundColor: alpha("#0C91E3", "1C") }]} />

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
          <TouchableOpacity style={styles.backButton} onPress={() => goToLogin()}>
            <Icon name="arrow-back" size={20} color={colors.text} />
            <Text style={[styles.backText, { color: colors.text }]}>Back</Text>
          </TouchableOpacity>

          <View style={[styles.heroCard, { backgroundColor: alpha(colors.card, "EC"), borderColor: alpha(colors.border, "90") }]}>
            <Text style={[styles.heroEyebrow, { color: colors.primary }]}>New account</Text>
            <Text style={[styles.heroTitle, { color: colors.text }]}>Start with your email</Text>
            <Text style={[styles.heroSubtitle, { color: colors.mutedText }]}>
              We will send a one-time code, then you can set your password and basic profile details.
            </Text>
          </View>

          <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.formLabel, { color: colors.text }]}>Email address</Text>
            <TextInput
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
              placeholderTextColor={colors.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
            />

            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: colors.primary },
                loading && styles.buttonDisabled,
              ]}
              onPress={() => {
                sendOtp().catch(() => {});
              }}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Send OTP</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: colors.border, backgroundColor: alpha(colors.surface, "E8") }]}
              onPress={() => goToLogin()}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>I already have an account</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default SignupScreen;

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
    width: 250,
    height: 250,
    bottom: -120,
    left: -50,
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
  formCard: {
    marginTop: appSpacing.lg,
    borderWidth: 1,
    borderRadius: appRadii.xl,
    padding: appSpacing.lg,
    ...appShadows.card,
  },
  formLabel: {
    ...appTypography.label,
    marginBottom: appSpacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: appRadii.lg,
    paddingHorizontal: appSpacing.md,
    paddingVertical: Platform.OS === "ios" ? 16 : 14,
    fontFamily: appFonts.regular,
    fontSize: 15,
  },
  primaryButton: {
    marginTop: appSpacing.lg,
    minHeight: 54,
    borderRadius: appRadii.pill,
    justifyContent: "center",
    alignItems: "center",
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
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryButtonText: {
    fontFamily: appFonts.semibold,
    fontSize: 15,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
