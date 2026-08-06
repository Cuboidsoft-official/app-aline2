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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { Alert } from "../utils/appAlert";
import { setStoredSession } from "../utils/authSession";
import { registerPushToken } from "../utils/pushRegistration";
import { useAppTheme } from "../theme/AppThemeContext";

const USERNAME_REGEX = /^(?!.*[.]{2})(?!.*[_]{2})[a-z0-9._]{3,30}$/;

const CompleteProfileScreen = ({ route, navigation }: any) => {
  const { colors } = useAppTheme();
  const email = String(route?.params?.email || "").trim().toLowerCase();
  const initialReferralCode = String(route?.params?.referralCode || "").trim().toUpperCase();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referralCode, setReferralCode] = useState(initialReferralCode);
  const [loading, setLoading] = useState(false);

  const handleSetPassword = async () => {
    if (!email) {
      Alert.alert("Error", "Email not found. Please start signup again.");
      navigation.replace("Signup");
      return;
    }

    const cleanName = name.trim();
    const cleanUsername = username.trim().toLowerCase();
    const cleanReferralCode = referralCode.trim().toUpperCase();

    if (!cleanName || cleanName.length < 2) {
      Alert.alert("Error", "Please enter your name (at least 2 characters).");
      return;
    }

    if (!cleanUsername || cleanUsername.length < 3) {
      Alert.alert("Error", "Please choose a username with at least 3 characters.");
      return;
    }

    if (!USERNAME_REGEX.test(cleanUsername)) {
      Alert.alert(
        "Error",
        "Username must be 3 to 30 characters using lowercase letters, numbers, dots, or underscores, without double dots or underscores.",
      );
      return;
    }

    if (!password || password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }

    if (loading) {
      return;
    }

    try {
      setLoading(true);

      const res = await API.post("/auth/set-password", {
        email,
        password,
        name: cleanName,
        username: cleanUsername,
        referralCode: cleanReferralCode,
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

      registerPushToken().catch(() => {});

      navigation.reset({
        index: 0,
        routes: [{ name: "MainApp" }],
      });
    } catch (error: any) {
      Alert.alert("Error", getReadableApiErrorMessage(error, "Server error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.flexFill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.title, { color: colors.text }]}>Complete your profile</Text>
          <Text style={[styles.subtitle, { color: colors.mutedText }]}>
            Choose a name and username, then set a password to finish signing up.
          </Text>

          <TextInput
            placeholder="Full name"
            value={name}
            onChangeText={setName}
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            placeholderTextColor={colors.placeholder}
            autoCapitalize="words"
            textContentType="name"
            returnKeyType="next"
          />

          <TextInput
            placeholder="Username"
            value={username}
            onChangeText={(text) => setUsername(text.toLowerCase().replace(/[^a-z0-9_.]/g, ""))}
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            returnKeyType="next"
          />

          <TextInput
            placeholder="Enter password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
            returnKeyType="next"
          />

          <TextInput
            placeholder="Confirm password"
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            returnKeyType="next"
          />

          <TextInput
            placeholder="Referral Code (Optional)"
            value={referralCode}
            onChangeText={setReferralCode}
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            placeholderTextColor={colors.placeholder}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleSetPassword}
          />

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }, loading && styles.disabledButton]}
            onPress={handleSetPassword}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save password</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default CompleteProfileScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flexFill: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 42,
    paddingBottom: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 24,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 15,
    height: 52,
    marginBottom: 14,
    fontSize: 15,
  },
  button: {
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  disabledButton: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
