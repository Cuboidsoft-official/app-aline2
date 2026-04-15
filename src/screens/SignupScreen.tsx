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
import { useAppTheme } from "../theme/AppThemeContext";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SignupScreen = ({ navigation }: any) => {
  const { colors } = useAppTheme();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const goToLogin = (params?: Record<string, any>) => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.replace("Login", params);
  };

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
              onPress: () => navigation.replace("Login", { email: cleanEmail })
            }
          ]
        );
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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>

        <TouchableOpacity onPress={() => goToLogin()}>
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

        <View style={styles.bottomContainer}>
          <TouchableOpacity onPress={() => goToLogin()}>
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
  buttonDisabled: {
    opacity: 0.7,
  },

  nextText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
