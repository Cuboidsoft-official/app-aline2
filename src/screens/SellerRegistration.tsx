import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { launchImageLibrary } from "react-native-image-picker";
import { pick } from "@react-native-documents/picker";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";

const DEFAULT_COVER =
  "https://www.bcmch.org/asset/uploads/common/867349919655f1491613e4.webp";

const DEFAULT_AVATAR =
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQikGmpeh_S05yj5punOSDXG-utlTE1TRdFWQ&s";

const SellerRegistration = ({ navigation }: any) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [bio, setBio] = useState("");
  const [experience, setExperience] = useState("");
  const [clinicLink, setClinicLink] = useState("");
  const [status, setStatus] = useState(true);

  const [avatar, setAvatar] = useState<string | null>(null);
  const [cover, setCover] = useState<string | null>(null);

  const [degree, setDegree] = useState("");
  const [license, setLicense] = useState("");
  const [gst, setGst] = useState("");

  const [aadhaar, setAadhaar] = useState("");
  const [pan, setPan] = useState("");

  const [degreeDoc, setDegreeDoc] = useState<any>(null);
  const [licenseDoc, setLicenseDoc] = useState<any>(null);
  const [aadhaarDoc, setAadhaarDoc] = useState<any>(null);
  const [panDoc, setPanDoc] = useState<any>(null);
  const [idProof, setIdProof] = useState<any>(null);

  const [digilockerVerified, setDigilockerVerified] = useState(false);

  const pickImage = (setter: any) => {
    launchImageLibrary({ mediaType: "photo" }, response => {
      if (response?.didCancel) return;

      if (response?.errorCode) {
        Alert.alert("Error", "Image pick failed");
        return;
      }

      if (response?.assets?.length > 0) {
        setter(response.assets[0].uri);
      }
    });
  };

const pickDocument = async (setter: any) => {
  try {
    const res = await pick({
      type: ["image/*", "application/pdf"]
    });

    const file = res[0];

    setter({
      uri: file.uri,
      name: file.name,
      type: file.type
    });

  } catch (error) {
    if (error?.code === "DOCUMENT_PICKER_CANCELED") return;
    Alert.alert("Error", "Document pick failed");
  }
};

  const renderUpload = (title: string, file: any, setter: any) => (
    <TouchableOpacity
      style={styles.uploadBox}
      onPress={() => pickDocument(setter)}
      activeOpacity={0.8}
    >
      <Icon name="document" size={22} color="#7B4DFF" />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.uploadText}>
          {file ? `${title} Uploaded ✓` : `Upload ${title}`}
        </Text>
        {!!file?.name && (
          <Text style={styles.fileName} numberOfLines={1}>
            {file.name}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const validateCurrentStep = () => {
    if (step === 1) {
      if (!name.trim()) {
        Alert.alert("Validation", "Please enter seller name");
        return false;
      }
      if (!specialization.trim()) {
        Alert.alert("Validation", "Please enter specialization");
        return false;
      }
    }

    if (step === 2) {
      if (!experience.trim()) {
        Alert.alert("Validation", "Please enter experience");
        return false;
      }
      if (!degree.trim()) {
        Alert.alert("Validation", "Please enter degree");
        return false;
      }
      if (!license.trim()) {
        Alert.alert("Validation", "Please enter license number");
        return false;
      }
    }

    if (step === 3) {
      if (!aadhaar.trim()) {
        Alert.alert("Validation", "Please enter Aadhaar number");
        return false;
      }
      if (!pan.trim()) {
        Alert.alert("Validation", "Please enter PAN number");
        return false;
      }
    }

    if (step === 4) {
      if (!degreeDoc || !licenseDoc || !aadhaarDoc || !panDoc || !idProof) {
        Alert.alert("Validation", "Please upload all required documents");
        return false;
      }
    }

    return true;
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;
    setStep(prev => prev + 1);
  };

  const handleDigiLockerVerify = async () => {
    if (!aadhaar.trim() || !pan.trim()) {
      Alert.alert("Validation", "Please enter Aadhaar and PAN first");
      return;
    }

    // UI demo only
    // Real DigiLocker verification needs official partner/API integration on backend
    setDigilockerVerified(true);
    Alert.alert("Success", "DigiLocker verification marked successfully");
  };

  const submitSellerRegistration = async () => {
    try {
      if (!validateCurrentStep()) return;

      setLoading(true);

      const token = await AsyncStorage.getItem("token");

      if (!token) {
        Alert.alert("Error", "User token not found. Please login again.");
        return;
      }

      // For now plain payload
      // Later convert to FormData when backend file upload is ready
      const payload = {
        sellerName: name,
        specialization,
        bio,
        experience,
        clinicLink,
        availabilityStatus: status,
        degree,
        license,
        gst,
        aadhaar,
        pan,
        degreeDoc: degreeDoc?.uri || "",
        licenseDoc: licenseDoc?.uri || "",
        aadhaarDoc: aadhaarDoc?.uri || "",
        panDoc: panDoc?.uri || "",
        idProof: idProof?.uri || "",
        profilePic: avatar,
        coverPic: cover,
        digilockerVerified
      };

      const res = await API.post("/seller/register", payload, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (res?.data?.success) {
        Alert.alert("Success", "Seller registration submitted successfully");
        navigation.replace("SellerDashboardScreen");
      } else {
        Alert.alert("Error", res?.data?.message || "Registration failed");
      }
    } catch (error: any) {
      console.log("seller register error:", error?.response?.data || error.message);

      Alert.alert(
        "Error",
        error?.response?.data?.message || "Seller registration failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Icon name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Seller Registration</Text>

        <View style={{ width: 30 }} />
      </View>

      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.coverContainer}>
          <Image
            source={{ uri: cover || DEFAULT_COVER }}
            style={styles.cover}
          />

          <TouchableOpacity
            style={styles.coverCamera}
            onPress={() => pickImage(setCover)}
          >
            <Icon name="camera" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.avatarContainer}>
          <Image
            source={{ uri: avatar || DEFAULT_AVATAR }}
            style={styles.avatar}
          />

          <TouchableOpacity
            style={styles.avatarCamera}
            onPress={() => pickImage(setAvatar)}
          >
            <Icon name="camera" size={16} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <Text style={styles.stepText}>Step {step} of 4</Text>

          {step === 1 && (
            <View>
              <Text style={styles.title}>Basic Information</Text>

              <Text style={styles.label}>Seller Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter seller name"
                placeholderTextColor="#999"
              />

              <Text style={styles.label}>Specialization</Text>
              <TextInput
                style={styles.input}
                value={specialization}
                onChangeText={setSpecialization}
                placeholder="Cardiology Specialist"
                placeholderTextColor="#999"
              />

              <Text style={styles.label}>Bio</Text>
              <TextInput
                style={[styles.input, { height: 90, textAlignVertical: "top" }]}
                multiline
                value={bio}
                onChangeText={setBio}
                placeholder="About you"
                placeholderTextColor="#999"
              />
            </View>
          )}

          {step === 2 && (
            <View>
              <Text style={styles.title}>Professional Details</Text>

              <Text style={styles.label}>Years of Experience</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={experience}
                onChangeText={setExperience}
                placeholder="5"
                placeholderTextColor="#999"
              />

              <Text style={styles.label}>Clinic Link</Text>
              <TextInput
                style={styles.input}
                value={clinicLink}
                onChangeText={setClinicLink}
                placeholder="clinic.link/dr"
                placeholderTextColor="#999"
              />

              <View style={styles.statusRow}>
                <Text style={styles.label}>Status</Text>

                <View style={styles.switchRow}>
                  <Text style={styles.switchText}>Out</Text>
                  <Switch value={status} onValueChange={setStatus} />
                  <Text style={styles.switchText}>In</Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Professional Verification</Text>

              <Text style={styles.label}>Degree</Text>
              <TextInput
                style={styles.input}
                value={degree}
                onChangeText={setDegree}
                placeholder="MBBS / MD"
                placeholderTextColor="#999"
              />

              <Text style={styles.label}>License Number</Text>
              <TextInput
                style={styles.input}
                value={license}
                onChangeText={setLicense}
                placeholder="Medical License"
                placeholderTextColor="#999"
              />

              <Text style={styles.label}>GST (Optional)</Text>
              <TextInput
                style={styles.input}
                value={gst}
                onChangeText={setGst}
                placeholder="GST"
                placeholderTextColor="#999"
              />
            </View>
          )}

          {step === 3 && (
            <View>
              <Text style={styles.title}>Government Verification</Text>

              <Text style={styles.label}>Aadhaar Number</Text>
              <TextInput
                style={styles.input}
                value={aadhaar}
                onChangeText={setAadhaar}
                placeholder="XXXX XXXX XXXX"
                placeholderTextColor="#999"
                keyboardType="numeric"
              />

              <Text style={styles.label}>PAN Number</Text>
              <TextInput
                style={styles.input}
                value={pan}
                onChangeText={text => setPan(text.toUpperCase())}
                placeholder="ABCDE1234F"
                placeholderTextColor="#999"
                autoCapitalize="characters"
              />

              <TouchableOpacity
                style={[
                  styles.digilockerBtn,
                  digilockerVerified && { backgroundColor: "#118B50" }
                ]}
                onPress={handleDigiLockerVerify}
              >
                <Icon name="shield-checkmark" size={18} color="#fff" />
                <Text style={styles.digilockerText}>
                  {digilockerVerified
                    ? "Verified with DigiLocker ✓"
                    : "Verify with DigiLocker"}
                </Text>
              </TouchableOpacity>

              <Text style={styles.noteText}>
                DigiLocker verification currently works as UI/demo flow. Real verification
                requires backend + official DigiLocker integration.
              </Text>
            </View>
          )}

          {step === 4 && (
            <View>
              <Text style={styles.title}>Upload Documents</Text>

              {renderUpload("Degree Certificate", degreeDoc, setDegreeDoc)}
              {renderUpload("License Document", licenseDoc, setLicenseDoc)}
              {renderUpload("Aadhaar Card", aadhaarDoc, setAadhaarDoc)}
              {renderUpload("PAN Card", panDoc, setPanDoc)}
              {renderUpload("Government ID", idProof, setIdProof)}
            </View>
          )}

          <View style={styles.stepButtons}>
            {step > 1 && (
              <TouchableOpacity
                style={styles.backStep}
                onPress={() => setStep(step - 1)}
                disabled={loading}
              >
                <Text style={styles.stepBtnText}>Back</Text>
              </TouchableOpacity>
            )}

            {step < 4 ? (
              <TouchableOpacity
                style={styles.nextStep}
                onPress={handleNext}
                disabled={loading}
              >
                <Text style={styles.stepBtnText}>Next</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.button}
                onPress={submitSellerRegistration}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Submit for Verification</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default SellerRegistration;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F6F7FB"
  },
  header: {
    height: 90,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingTop: 40
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginLeft: 10,
    color: "#111"
  },
  backBtn: {
    padding: 5
  },
  coverContainer: {
    position: "relative"
  },
  cover: {
    height: 200,
    width: "100%"
  },
  coverCamera: {
    position: "absolute",
    right: 15,
    bottom: 15,
    backgroundColor: "#00000080",
    padding: 10,
    borderRadius: 30
  },
  avatarContainer: {
    alignItems: "center",
    marginTop: -50
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: "#fff",
    backgroundColor: "#eee"
  },
  avatarCamera: {
    position: "absolute",
    bottom: 0,
    right: 140,
    backgroundColor: "#7B4DFF",
    padding: 8,
    borderRadius: 20
  },
  form: {
    padding: 20,
    paddingBottom: 40
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 25,
    color: "#111"
  },
  stepText: {
    textAlign: "center",
    fontWeight: "600",
    marginBottom: 10,
    color: "#666"
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 30,
    marginBottom: 15,
    color: "#111"
  },
  label: {
    marginTop: 12,
    marginBottom: 6,
    fontWeight: "600",
    color: "#444"
  },
  input: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    fontSize: 15,
    color: "#111"
  },
  statusRow: {
    marginTop: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  switchText: {
    color: "#444",
    marginHorizontal: 8,
    fontWeight: "500"
  },
  uploadBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginTop: 12
  },
  uploadText: {
    fontWeight: "600",
    color: "#444"
  },
  fileName: {
    marginTop: 4,
    color: "#777",
    fontSize: 12
  },
  digilockerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0A66C2",
    padding: 16,
    borderRadius: 12,
    marginTop: 20
  },
  digilockerText: {
    color: "#fff",
    fontWeight: "700",
    marginLeft: 10
  },
  noteText: {
    marginTop: 12,
    color: "#666",
    fontSize: 13,
    lineHeight: 20
  },
  stepButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 30,
    alignItems: "center"
  },
  nextStep: {
    backgroundColor: "#7B4DFF",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 10,
    minWidth: 90,
    alignItems: "center"
  },
  backStep: {
    backgroundColor: "#999",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 10,
    minWidth: 90,
    alignItems: "center"
  },
  stepBtnText: {
    color: "#fff",
    fontWeight: "700"
  },
  button: {
    backgroundColor: "#7B4DFF",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: "center",
    flex: 1,
    marginLeft: 12
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16
  }
});