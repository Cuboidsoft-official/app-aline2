import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert
} from 'react-native';

import { API } from '../api/api';
import { getReadableApiErrorMessage } from "../api/networkErrors";

const SignupScreen = ({ navigation }: any) => {

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const sendOtp = async () => {

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      Alert.alert("Error", "Please enter email");
      return;
    }
    if (!/\S+@\S+\.\S+/.test(cleanEmail)) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    if (loading) return;

    try {

      setLoading(true);

      const res = await API.post("/auth/send-otp", {
        email: cleanEmail
      });

      if (res?.data?.success) {

        Alert.alert("Success", "OTP Sent Successfully ✅");

        navigation.navigate("OtpVerify", {
          email: cleanEmail
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

      Alert.alert(
        "Network Error",
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
      <SafeAreaView style={styles.container}>

        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.backArrow}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>What's your email address?</Text>

        <Text style={styles.subtitle}>
          Enter the email address at which you can be contacted.
          {'\n'}No one will see this on your profile.
        </Text>

        <TextInput
          placeholder="Email address"
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          placeholderTextColor="#888"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TouchableOpacity
          style={[
            styles.nextButton,
            loading && { opacity: 0.7 }
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

        <TouchableOpacity
          style={styles.mobileButton}
          onPress={() =>
            navigation.navigate("FeatureInfoScreen", {
              title: "Mobile OTP Sign Up",
              description:
                "The current backend supports email OTP only. Mobile-number OTP can be added once SMS delivery is configured server-side.",
            })
          }
        >
          <Text style={styles.mobileText}>
            Sign up with mobile number
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

  mobileButton: {
    height: 55,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },

  mobileText: {
    fontSize: 15,
    color: '#333',
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
