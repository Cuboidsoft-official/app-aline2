import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator
} from 'react-native';
import { API } from '../api/api';
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { setStoredSession } from "../utils/authSession";

const OtpVerifyScreen = ({ route, navigation }: any) => {

  const email = route?.params?.email || null;
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const verifyOtp = async () => {

    if (!email) {
      Alert.alert("Error", "Email not found. Please signup again.");
      return;
    }

    if (!otp || otp.length !== 6) {
      Alert.alert("Error", "Please enter valid 6 digit OTP");
      return;
    }

    if (loading) return;

    try {
      setLoading(true);

      console.log("Sending OTP verify request:", { email, otp });

      const res = await API.post("/auth/verify-otp", {
        email,
        otp: String(otp)
      });

      console.log("Verify Response:", res?.data);

      if (res?.data?.success) {

       setShowPasswordModal(true);

       setOtp('');

      } else {
        Alert.alert("Error", res?.data?.message || "Invalid OTP");
      }

    } catch (err: any) {

      console.log("Verify OTP Error Full:", err);
      console.log("Server Response:", err?.response?.data);

      Alert.alert(
        "Verification Failed",
        getReadableApiErrorMessage(
          err,
          "Server error. Please try again."
        )
      );

    } finally {
      setLoading(false);
    }
  };

const handleSetPassword = async () => {

  if (!password || password.length < 6) {
    Alert.alert("Error", "Password must be at least 6 characters");
    return;
  }

  if (password !== confirmPassword) {
    Alert.alert("Error", "Passwords do not match");
    return;
  }

  try {
    setPasswordLoading(true);

    const res = await API.post("/auth/set-password", {
      email,
      password
    });

    if (res?.data?.success) {
      const loginRes = await API.post("/auth/login", {
        email,
        password
      });

      if (!loginRes?.data?.success || !loginRes?.data?.token || !loginRes?.data?.user) {
        Alert.alert("Almost there", "Password was set, but we could not sign you in automatically. Please log in.");
        navigation.replace("Login", { email });
        return;
      }

      await setStoredSession({
        token: loginRes.data.token,
        user: loginRes.data.user
      });

      setShowPasswordModal(false);
      navigation.reset({
        index: 0,
        routes: [{ name: "MainApp" }]
      });
    } else {
      Alert.alert("Error", res?.data?.message || "Something went wrong");
    }

  } catch (error: any) {
    Alert.alert("Error", getReadableApiErrorMessage(error, "Server error"));
  } finally {
    setPasswordLoading(false);
  }
};

  return (
    <SafeAreaView style={styles.container}>

      <Text style={styles.title}>Verify OTP</Text>

      <Text style={styles.subtitle}>
        OTP sent to {email || "your email"}
      </Text>

      <TextInput
        ref={inputRef}
        placeholder="Enter 6 digit OTP"
        value={otp}
        onChangeText={setOtp}
        style={styles.input}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
      />

      <TouchableOpacity
        style={[styles.button, loading && { opacity: 0.7 }]}
        onPress={verifyOtp}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Verify</Text>
        )}
      </TouchableOpacity>

      {showPasswordModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>

            <Text style={styles.modalTitle}>Set Your Password</Text>

            <TextInput
              placeholder="Enter Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={styles.modalInput}
            />

            <TextInput
              placeholder="Confirm Password"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              style={styles.modalInput}
            />

            <TouchableOpacity
              style={styles.modalButton}
              onPress={handleSetPassword}
              disabled={passwordLoading}
            >
              {passwordLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalButtonText}>Save Password</Text>
              )}
            </TouchableOpacity>

          </View>
        </View>
      )}

    </SafeAreaView>
  );
};

export default OtpVerifyScreen;

const styles = StyleSheet.create({

  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
    justifyContent: 'flex-start'
  },

  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 10,
    marginTop: 60
  },

  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 25,
  },

  input: {
    height: 55,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 15,
    fontSize: 16,
    marginBottom: 25,
  },

  button: {
    height: 55,
    backgroundColor: 'black',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },

  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
modalOverlay: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.5)',
  justifyContent: 'center',
  alignItems: 'center',
},

modalContainer: {
  width: '85%',
  backgroundColor: '#fff',
  padding: 25,
  borderRadius: 20,
},

modalTitle: {
  fontSize: 18,
  fontWeight: 'bold',
  marginBottom: 20,
  textAlign: 'center'
},

modalInput: {
  borderWidth: 1,
  borderColor: '#ddd',
  borderRadius: 12,
  paddingHorizontal: 15,
  height: 50,
  marginBottom: 15,
},

modalButton: {
  backgroundColor: 'black',
  height: 50,
  borderRadius: 25,
  justifyContent: 'center',
  alignItems: 'center',
},

modalButtonText: {
  color: '#fff',
  fontWeight: '600',
}

});
