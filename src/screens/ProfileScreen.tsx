import React, { Dispatch, SetStateAction, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert
} from 'react-native';

import { API } from '../api/api';
import { launchImageLibrary } from "react-native-image-picker";
import Icon from "react-native-vector-icons/Ionicons";
import { getStoredUser, getStoredToken, setStoredSession } from "../utils/authSession";
import { uploadImageAsset } from "../utils/uploadMedia";

const ProfileScreen = ({ navigation }: any) => {

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
          username,
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
        const storedUser = await getStoredUser();
        await setStoredSession({
          token,
          user: {
            ...(storedUser || {}),
            name,
            username,
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
      const message =
        typeof err === "object" && err !== null
          ? ((err as { response?: { data?: unknown }; message?: string }).response?.data ||
            (err as { message?: string }).message)
          : err;
      console.log("Update error:", message);
      Alert.alert("Error", "Update failed");
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
    <SafeAreaView style={styles.container}>

      {/* Header */}
      <View style={styles.headerContainer}>

           <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} />
           </TouchableOpacity>

        <Text style={styles.header}>Edit Profile</Text>

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
                  "https://cdn-icons-png.flaticon.com/512/149/149071.png"
              }}
              style={styles.profileImage}
            />

            <TouchableOpacity onPress={pickImage}>
              <Text style={styles.changePhoto}>
                Change profile photo
              </Text>
            </TouchableOpacity>

          </View>

          {renderInput("Name", name, setName)}
          {renderInput("Username", username, setUsername)}
          {renderInput("Bio", bio, setBio, true)}
          {renderInput("Interests (comma separated)", interests, setInterests, true)}
          {renderInput("Pronouns", pronouns, setPronouns)}
          {renderInput("Gender", gender, setGender)}
          {renderInput("Link", link, setLink)}
          {renderReadonlyField("Account Type", accountTypeLabel)}
          <Text style={styles.helperText}>
            Account type is managed server-side, so special account states are assigned outside the app.
          </Text>

        </ScrollView>


        {/* Save Button */}

        <View style={styles.bottomContainer}>

          <TouchableOpacity
            style={[
              styles.saveButton,
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
  multiline = false
) => (
  <View style={styles.inputGroup}>

    <Text style={styles.label}>{label}</Text>

    <TextInput
      style={[
        styles.input,
        multiline && styles.multilineInput
      ]}
      value={value}
      onChangeText={setter}
      placeholder={`Enter ${label}`}
      placeholderTextColor="#888"
      multiline={multiline}
    />

  </View>
);

const renderReadonlyField = (label: string, value: string) => (
  <View style={styles.inputGroup}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.readonlyField}>
      <Text style={styles.readonlyValue}>{value}</Text>
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
