import React, { useEffect, useState } from 'react';
import { API } from '../api/api';
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { setStoredSession } from "../utils/authSession";
import { registerPushToken } from "../utils/pushRegistration";
import { isGoogleCancelledError, loginWithGoogle } from "../utils/googleAuth";

import {
  Alert,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
} from 'react-native';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_SENDER_HINT = "Verification emails may currently arrive from our delivery inbox while Aline2 branded mail is being finalized.";

const showOtpComingSoon = () => {
  Alert.alert(
    "Coming soon",
    "Email OTP is being upgraded to Aline2-branded delivery and will be available again soon. Please use password login or Google sign-in for now.",
  );
};

const LoginScreen = ({ navigation, route }: any) => {
  const presetEmail = route?.params?.email || '';

  const [email, setEmail] = useState(presetEmail || '');
  const [password, setPassword] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (presetEmail) {
      setEmail(String(presetEmail).trim().toLowerCase());
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

    if (!email || !password) {
      Alert.alert("Missing credentials", "Please enter email and password.");
      return;
    }

    if (!EMAIL_REGEX.test(String(email || "").trim().toLowerCase())) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }

    try {
      const res = await API.post("/auth/login", { email, password });

      if (res?.data?.success) {
        await setStoredSession({
          accessToken: res.data.accessToken || res.data.token,
          refreshToken: res.data.refreshToken,
          session: res.data.session,
          user: res.data.user,
        });

        registerPushToken().catch(() => { });

        navigation.replace("MainApp");

      } else {
        Alert.alert("Login failed", res?.data?.message || "Login failed");
      }

    } catch (error: any) {
      console.log("LOGIN ERROR:", error);
      console.log("LOGIN ERROR DETAILS:", {
        baseURL: API.defaults?.baseURL,
        requestUrl: error?.config?.url,
        method: error?.config?.method,
        status: error?.response?.status,
        responseData: error?.response?.data,
      });

      if (["password_missing", "PASSWORD_NOT_SET"].includes(String(error?.response?.data?.reason || error?.response?.data?.code || "").trim())) {
        handleMissingPassword();
        return;
      }

      Alert.alert("Login failed", getReadableApiErrorMessage(error, "Something went wrong"));
    }
  };

  const handleEmailOtpLogin = async () => {
    const cleanEmail = String(email || '').trim().toLowerCase();

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
      if (String(error?.response?.data?.code || "").trim() === "OTP_NOT_CONFIGURED") {
        showOtpComingSoon();
        return;
      }

      Alert.alert("Unable to send OTP", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
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

      Alert.alert("Google login failed", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>

      {/* Top Section */}
      <View style={styles.topSection}>
        <Image
          style={styles.logoImg}
          source={{ uri: 'https://aline2.com/asstes/images/logo/logo.jpeg' }}
        />
        <Text style={styles.logoText}>Aline2</Text>
        <Text style={styles.subtitle}>Let's connect together</Text>
      </View>

      {/* Card Section */}
      <View style={styles.card}>

        <TextInput
          placeholder="Email address"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholderTextColor="#999"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
        />

        <TextInput
          placeholder="Password"
          secureTextEntry
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholderTextColor="#999"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
        />

        <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
          <Text style={styles.loginText}>Log in</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate("ForgotPassword", { email })}>
          <Text style={styles.forgot}>Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleEmailOtpLogin} disabled={otpLoading}>
          <Text style={styles.forgot}>{otpLoading ? "Sending OTP..." : "Use email OTP instead"}</Text>
        </TouchableOpacity>

        <Text style={styles.supportedHint}>Supported sign in: password, Google, or email OTP when available</Text>
        <Text style={styles.supportedHint}>{OTP_SENDER_HINT}</Text>

        <View style={styles.divider} />

        <TouchableOpacity
          style={[styles.googleButton, googleLoading && styles.buttonDisabled]}
          onPress={handleGoogleLogin}
          disabled={googleLoading}
        >
          <Text style={styles.googleText}>
            {googleLoading ? "Connecting Google..." : "Continue with Google"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signupButton} onPress={() => navigation.navigate('Signup')}>
          <Text style={styles.signupText}>Create new account</Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c91e3', // Instagram-like gradient could be added later
  },

  topSection: {
    flex: 1,
    backgroundColor: '#041a28',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },

  logoImg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 15,
    borderWidth: 2,
    borderColor: '#fff',
  },

  logoText: {
    fontSize: 38,
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 2,
  },

  subtitle: {
    fontSize: 16,
    color: '#ccc',
    marginTop: 8,
  },

  card: {
    flex: 2,
    backgroundColor: '#fff',
    marginTop: -50,
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    paddingHorizontal: 25,
    paddingVertical: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 5,
  },

  input: {
    backgroundColor: '#f2f2f2',
    borderRadius: 15,
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginBottom: 15,
    fontSize: 16,
    color: '#333',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },

  loginButton: {
    backgroundColor: '#ab2aeb',
    paddingVertical: 15,
    borderRadius: 30,
    alignItems: 'center',
    marginBottom: 15,
    shadowColor: "#ab2aeb",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },

  loginText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },

  forgot: {
    textAlign: 'center',
    marginBottom: 12,
    color: '#555',
    fontWeight: '500',
  },

  supportedHint: {
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
    fontSize: 13,
  },

  divider: {
    height: 1,
    backgroundColor: '#ddd',
    marginVertical: 15,
  },

  googleButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    paddingVertical: 15,
    borderRadius: 30,
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#fff',
  },

  googleText: {
    color: '#222',
    fontWeight: '600',
    fontSize: 15,
  },

  buttonDisabled: {
    opacity: 0.7,
  },

  signupButton: {
    borderWidth: 1,
    borderColor: '#ab2aeb',
    paddingVertical: 15,
    borderRadius: 30,
    alignItems: 'center',
  },

  signupText: {
    color: '#ab2aeb',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
