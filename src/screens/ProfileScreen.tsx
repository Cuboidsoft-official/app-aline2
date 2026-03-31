import React, { Dispatch, SetStateAction, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert
} from 'react-native';
import { SafeAreaView } from "react-native-safe-area-context";

import { API } from '../api/api';
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { launchImageLibrary } from "react-native-image-picker";
import Icon from "react-native-vector-icons/Ionicons";
import { getStoredRefreshToken, getStoredSessionMeta, getStoredUser, getStoredToken, setStoredSession } from "../utils/authSession";
import { uploadImageAsset } from "../utils/uploadMedia";
import { useAppTheme } from "../theme/AppThemeContext";

const ProfileScreen = ({ navigation }: any) => {
  const { colors } = useAppTheme();

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [gender, setGender] = useState('');
  const [link, setLink] = useState('');
  const [category, setCategory] = useState('');
  const [profilePic, setProfilePic] = useState('');

  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  const accountTypeLabel = category === "Seller" ? "Seller" : "Member";


  useEffect(() => {
    fetchUser();
  }, []);

    const pickImage = async () => {

      const result = await launchImageLibrary({
        mediaType: "photo",
        quality: 0.7
      });

      if (result.didCancel) return;

      const image = result.assets?.[0];

      if (!image?.uri) {
        return;
      }

      setProfilePic(image.uri);

    };


  const fetchUser = async () => {
    try {

      const token = await getStoredToken();

      const res = await API.get("/auth/profile", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const user = res.data.user;

      setName(user.name || "");
      setUsername(user.username || "");
      setBio(user.bio || "");
      setInterests(Array.isArray(user.interests) ? user.interests.join(", ") : "");
      setPronouns(user.pronouns || "");
      setGender(user.gender || "");
      setLink(user.link || "");
      setCategory(user.category || "");
      setProfilePic(user.profilePic || "");

    } catch (err) {
      console.log("Profile load error", err);
    } finally {
      setPageLoading(false);
    }
  };


  const updateProfile = async () => {

    try {

      setLoading(true);

      const token = await getStoredToken();

      if (!token) {
        Alert.alert("Error", "Login again");
        return;
      }

      const resolvedProfilePic = profilePic.startsWith("http")
        ? profilePic
        : profilePic
          ? await uploadImageAsset({
              uri: profilePic,
              fileName: `profile_${Date.now()}.jpg`,
              type: "image/jpeg"
            })
          : "";

      const res = await API.post(
        "/auth/update-profile",
        {
          name,
          username: username.trim().toLowerCase(),
          bio,
          interests: interests.split(",").map((item) => item.trim()).filter(Boolean),
          pronouns,
          gender,
          link,
          profilePic: resolvedProfilePic
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (res.data.success) {
        const [storedUser, refreshToken, session] = await Promise.all([
          getStoredUser(),
          getStoredRefreshToken(),
          getStoredSessionMeta(),
        ]);
        await setStoredSession({
          accessToken: token,
          refreshToken,
          session,
          user: {
            ...(storedUser || {}),
            name,
            username: username.trim().toLowerCase(),
            bio,
            interests: interests.split(",").map((item) => item.trim()).filter(Boolean),
            pronouns,
            gender,
            link,
            category,
            profilePic: resolvedProfilePic
          }
        });
        Alert.alert("Success", "Profile updated");
        navigation.goBack();
      }

    } catch (err: unknown) {
      console.log("Update error:", err);
      Alert.alert("Update failed", getReadableApiErrorMessage(err, "Please try again."));
    } finally {
      setLoading(false);
    }

  };


  if (pageLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }


  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={styles.headerContainer}>

           <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={colors.text} />
           </TouchableOpacity>

        <Text style={[styles.header, { color: colors.text }]}>Edit Profile</Text>

        <View style={styles.headerSpacer} />

      </View>


      <KeyboardAvoidingView
        style={styles.flexFill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >

          {/* Profile Image */}

          <View style={styles.imageContainer}>

            <Image
              source={{
                uri:
                  profilePic ||
                  "https://aline2.com/asstes/images/logo/logo.jpeg"
              }}
              style={styles.profileImage}
            />

            <TouchableOpacity onPress={pickImage}>
              <Text style={[styles.changePhoto, { color: colors.primary }]}>
                Change profile photo
              </Text>
            </TouchableOpacity>

          </View>

          {renderInput("Name", name, setName, false, colors)}
          {renderInput("Username", username, (value) => setUsername(String(value || "").toLowerCase().replace(/\s+/g, "")), false, colors)}
          {renderInput("Bio", bio, setBio, true, colors)}
          {renderInput("Interests (comma separated)", interests, setInterests, true, colors)}
          {renderInput("Pronouns", pronouns, setPronouns, false, colors)}
          {renderInput("Gender", gender, setGender, false, colors)}
          {renderInput("Link", link, setLink, false, colors)}
          {renderReadonlyField("Account Type", accountTypeLabel, colors)}
          <Text style={[styles.helperText, { color: colors.mutedText }]}>
            Account type is managed server-side, so special account states are assigned outside the app.
          </Text>
          <Text style={[styles.helperText, { color: colors.mutedText }]}>
            Usernames use 3-30 lowercase letters, numbers, dots, or underscores.
          </Text>

        </ScrollView>


        {/* Save Button */}

        <View style={styles.bottomContainer}>

          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: colors.primary },
              loading && styles.saveButtonDisabled
            ]}
            onPress={updateProfile}
            disabled={loading}
          >

            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveText}>
                Save Changes
              </Text>
            )}

          </TouchableOpacity>

        </View>

      </KeyboardAvoidingView>

    </SafeAreaView>
  );
};



const renderInput = (
  label: string,
  value: string,
  setter: Dispatch<SetStateAction<string>>,
  multiline = false,
  colors: { text: string; border: string; surface: string; placeholder: string }
) => (
  <View style={styles.inputGroup}>

    <Text style={[styles.label, { color: colors.text }]}>{label}</Text>

    <TextInput
      style={[
        styles.input,
        multiline && styles.multilineInput,
        {
          color: colors.text,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }
      ]}
      value={value}
      onChangeText={setter}
      placeholder={`Enter ${label}`}
      placeholderTextColor={colors.placeholder}
      multiline={multiline}
    />

  </View>
);

const renderReadonlyField = (
  label: string,
  value: string,
  colors: { text: string; border: string; surface: string }
) => (
  <View style={styles.inputGroup}>
    <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    <View style={[styles.readonlyField, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text style={[styles.readonlyValue, { color: colors.text }]}>{value}</Text>
    </View>
  </View>
);


export default ProfileScreen;

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#fff',
  },

  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    paddingTop: 50,
  },

  header: {
    fontSize: 18,
    fontWeight: '600'
  },

  headerSpacer: {
    width: 20
  },

  flexFill: {
    flex: 1
  },

  scrollContent: {
    paddingBottom: 120
  },

  imageContainer: {
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 10
  },

  profileImage: {
    width: 110,
    height: 110,
    borderRadius: 60,
    marginBottom: 10
  },

  changePhoto: {
    color: '#0095f6',
    fontWeight: '600',
    fontSize: 14
  },

  inputGroup: {
    marginBottom: 20,
    paddingHorizontal: 20
  },

  label: {
    fontSize: 13,
    marginBottom: 5,
    color: '#444'
  },
  helperText: {
    paddingHorizontal: 20,
    marginTop: -8,
    marginBottom: 20,
    color: '#777',
    fontSize: 12,
    lineHeight: 18,
  },

  input: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    paddingHorizontal: 15,
    height: 50,
    fontSize: 15,
    backgroundColor: '#fafafa'
  },

  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    padding: 15,
    borderTopWidth: 1,
    borderColor: '#eee'
  },

  saveButton: {
    backgroundColor: '#000',
    height: 55,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center'
  },

  saveButtonDisabled: {
    opacity: 0.7
  },

  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },

  multilineInput: {
    height: 90
  },

  readonlyField: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    paddingHorizontal: 15,
    minHeight: 50,
    justifyContent: 'center',
    backgroundColor: '#f3f3f3'
  },

  readonlyValue: {
    fontSize: 15,
    color: '#444',
    fontWeight: '500'
  }

});
