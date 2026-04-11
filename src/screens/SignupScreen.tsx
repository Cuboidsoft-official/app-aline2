import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert
} from 'react-native';
import { SafeAreaView } from "react-native-safe-area-context";

import { API } from '../api/api';
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { isGoogleCancelledError, loginWithGoogle } from "../utils/googleAuth";
import { useAppTheme } from "../theme/AppThemeContext";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_SENDER_HINT = "Verification emails may currently arrive from our delivery inbox while Aline2 branded mail is being finalized.";

const showOtpComingSoon = () => {
  Alert.alert(
    "Coming soon",
    "Email OTP is being upgraded to Aline2-branded delivery and will be available again soon. Please use Google sign-in for now.",
  );
};

const SignupScreen = ({ navigation }: any) => {
  const { colors } = useAppTheme();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const sendOtp = async () => {

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      Alert.alert("Error", "Please enter email");
      return;
    }
    if (!EMAIL_REGEX.test(cleanEmail)) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    if (loading) return;

    try {

      setLoading(true);

      const res = await API.post("/auth/send-otp", {
        email: cleanEmail,
        purpose: "signup"
      });

      if (res?.data?.success) {
        navigation.navigate("OtpVerify", {
          email: cleanEmail,
          purpose: "signup",
        });

      } else {
        Alert.alert("Error", res?.data?.message || "Failed to send OTP");
      }

    } catch (err: any) {

      console.log("OTP Error:", err?.response?.data || err.message);

      const status = err?.response?.status;
      const code = err?.response?.data?.code;
      if (status === 409 && code === "ACCOUNT_EXISTS") {
        Alert.alert(
          "Account Found",
          "This email is already registered. Please login.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Go to Login",
              onPress: () => navigation.navigate("Login", { email: cleanEmail })
            }
          ]
        );
        return;
      }

      if (String(err?.response?.data?.code || "").trim() === "OTP_NOT_CONFIGURED") {
        showOtpComingSoon();
        return;
      }

      Alert.alert(
        "Unable to send OTP",
        getReadableApiErrorMessage(err, "Something went wrong. Try again.")
      );

    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    try {
      setGoogleLoading(true);
      const result = await loginWithGoogle();

      if (result.cancelled) {
        return;
      }

      navigation.reset({
        index: 0,
        routes: [{ name: "MainApp" }],
      });
    } catch (error: any) {
      if (isGoogleCancelledError(error)) {
        return;
      }

      Alert.alert("Google sign up failed", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>

        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={[styles.backArrow, { color: colors.text }]}>← Back</Text>
        </TouchableOpacity>

        <Text style={[styles.title, { color: colors.text }]}>What's your email address?</Text>

        <Text style={[styles.subtitle, { color: colors.mutedText }]}>
          Enter the email address at which you can be contacted.
          {'\n'}No one will see this on your profile.
        </Text>

        <TextInput
          placeholder="Email address"
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
            styles.nextButton,
            { backgroundColor: colors.primary },
            loading && styles.buttonDisabled
          ]}
          onPress={sendOtp}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.nextText}>Next</Text>
          )}
        </TouchableOpacity>

        <Text style={[styles.supportedHint, { color: colors.mutedText }]}>Supported sign up: Google now, email OTP when available</Text>
        <Text style={[styles.supportedHint, { color: colors.mutedText }]}>{OTP_SENDER_HINT}</Text>

        <TouchableOpacity
          style={[styles.googleButton, { borderColor: colors.border, backgroundColor: colors.card }, googleLoading && styles.buttonDisabled]}
          onPress={handleGoogleSignup}
          disabled={googleLoading}
        >
          <Text style={[styles.googleText, { color: colors.text }]}>
            {googleLoading ? "Connecting Google..." : "Continue with Google"}
          </Text>
        </TouchableOpacity>

        <View style={styles.bottomContainer}>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginText}>
              I already have an account
            </Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

export default SignupScreen;
const styles = StyleSheet.create({

  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },

  backArrow: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333'
  },

  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
  },

  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 25,
    lineHeight: 20,
  },

  input: {
    height: 55,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 15,
    fontSize: 16,
    marginBottom: 20,
  },

  nextButton: {
    height: 55,
    backgroundColor: 'black',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },

  nextText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  supportedHint: {
    textAlign: 'center',
    color: '#666',
    fontSize: 13,
    marginBottom: 12,
  },

  googleButton: {
    height: 55,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#fff',
  },

  googleText: {
    fontSize: 15,
    color: '#222',
    fontWeight: '600',
  },

  buttonDisabled: {
    opacity: 0.7,
  },

  bottomContainer: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
  },

  loginText: {
    color: '#ab2aeb',
    fontSize: 15,
    fontWeight: '500',
  }

});
