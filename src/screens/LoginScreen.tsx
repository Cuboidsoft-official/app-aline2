import React, { useEffect, useState } from 'react';
import { API } from '../api/api';
import { setStoredSession } from "../utils/authSession";

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

const LoginScreen = ({ navigation, route }: any) => {
  const presetEmail = route?.params?.email || '';

  const [email, setEmail] = useState(presetEmail || '');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (presetEmail) {
      setEmail(String(presetEmail).trim().toLowerCase());
    }
  }, [presetEmail]);

  const handleLogin = async () => {

    if (!email || !password) {
      Alert.alert("Missing credentials", "Please enter email and password.");
      return;
    }

    try {
      const res = await API.post("/auth/login", { email, password });

      if (res?.data?.success) {
        await setStoredSession({
          token: res.data.token,
          user: res.data.user,
        });

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
      Alert.alert("Login failed", error?.response?.data?.message || error?.message || "Something went wrong");
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
        />

        <TextInput
          placeholder="Password"
          secureTextEntry
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholderTextColor="#999"
        />

        <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
          <Text style={styles.loginText}>Log in</Text>
        </TouchableOpacity>

        <TouchableOpacity>
          <Text style={styles.forgot}>Forgot password?</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

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
    marginBottom: 20,
    color: '#555',
    fontWeight: '500',
  },

  divider: {
    height: 1,
    backgroundColor: '#ddd',
    marginVertical: 15,
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
