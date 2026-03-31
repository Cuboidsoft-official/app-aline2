import React, { useCallback, useEffect, useState } from "react";
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
import { launchImageLibrary } from "react-native-image-picker";
import {
  errorCodes,
  isErrorWithCode,
  keepLocalCopy,
  pick,
  types,
  type DocumentPickerResponse,
} from "@react-native-documents/picker";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { getStoredToken } from "../utils/authSession";
import { uploadDocumentAsset, uploadImageAsset } from "../utils/uploadMedia";
import { DEFAULT_AVATAR_URL, DEFAULT_COVER_URL } from "../constants/defaultAssets";

const DEFAULT_COVER = DEFAULT_COVER_URL;
const DEFAULT_AVATAR = DEFAULT_AVATAR_URL;

type DocumentFile = {
  uri: string;
  name?: string | null;
  type?: string | null;
};

type ImageFile = DocumentFile;

type PickerSetter<T> = (value: T) => void;

type SellerRegistrationMode = "create" | "edit";

type SellerProfileResponse = {
  sellerName?: string;
  specialization?: string;
  bio?: string;
  experience?: string;
  clinicLink?: string;
  availabilityStatus?: boolean;
  degree?: string;
  license?: string;
  gst?: string;
  aadhaar?: string;
  pan?: string;
  degreeDoc?: string;
  licenseDoc?: string;
  aadhaarDoc?: string;
  panDoc?: string;
  idProof?: string;
  profilePic?: string;
  coverPic?: string;
  digilockerVerified?: boolean;
};

const toDocumentFile = (uri?: string): DocumentFile | null =>
  uri ? { uri, name: uri.split("/").pop() || "document" } : null;

const getDocumentPickerMessage = (error: unknown): string => {
  if (!isErrorWithCode(error)) {
    return "Document pick failed";
  }

  switch (error.code) {
    case errorCodes.OPERATION_CANCELED:
      return "";
    case errorCodes.IN_PROGRESS:
      return "The document picker is already open. Close it and try again.";
    case errorCodes.NULL_PRESENTER:
      return "Could not open the document picker right now. Try again in a moment.";
    case errorCodes.UNABLE_TO_OPEN_FILE_TYPE:
      return "This device could not open a picker for images or PDFs.";
    default:
      return error.message || "Document pick failed";
  }
};

const SellerRegistration = ({ navigation, route }: any) => {
  const mode: SellerRegistrationMode = route?.params?.mode === "edit" ? "edit" : "create";
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(mode === "edit");

  const [name, setName] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [bio, setBio] = useState("");
  const [experience, setExperience] = useState("");
  const [clinicLink, setClinicLink] = useState("");
  const [status, setStatus] = useState(true);

  const [avatar, setAvatar] = useState<string | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<ImageFile | null>(null);
  const [coverFile, setCoverFile] = useState<ImageFile | null>(null);

  const [degree, setDegree] = useState("");
  const [license, setLicense] = useState("");
  const [gst, setGst] = useState("");

  const [aadhaar, setAadhaar] = useState("");
  const [pan, setPan] = useState("");

  const [degreeDoc, setDegreeDoc] = useState<DocumentFile | null>(null);
  const [licenseDoc, setLicenseDoc] = useState<DocumentFile | null>(null);
  const [aadhaarDoc, setAadhaarDoc] = useState<DocumentFile | null>(null);
  const [panDoc, setPanDoc] = useState<DocumentFile | null>(null);
  const [idProof, setIdProof] = useState<DocumentFile | null>(null);

  const [digilockerVerified, setDigilockerVerified] = useState(false);

  const hydrateSellerProfile = useCallback((seller: SellerProfileResponse) => {
    setName(seller?.sellerName || "");
    setSpecialization(seller?.specialization || "");
    setBio(seller?.bio || "");
    setExperience(seller?.experience || "");
    setClinicLink(seller?.clinicLink || "");
    setStatus(Boolean(seller?.availabilityStatus));
    setAvatar(seller?.profilePic || null);
    setCover(seller?.coverPic || null);
    setDegree(seller?.degree || "");
    setLicense(seller?.license || "");
    setGst(seller?.gst || "");
    setAadhaar(seller?.aadhaar || "");
    setPan(seller?.pan || "");
    setDegreeDoc(toDocumentFile(seller?.degreeDoc));
    setLicenseDoc(toDocumentFile(seller?.licenseDoc));
    setAadhaarDoc(toDocumentFile(seller?.aadhaarDoc));
    setPanDoc(toDocumentFile(seller?.panDoc));
    setIdProof(toDocumentFile(seller?.idProof));
    setDigilockerVerified(Boolean(seller?.digilockerVerified));
  }, []);

  useEffect(() => {
    if (mode !== "edit") {
      return;
    }

    let active = true;

    const loadSellerProfile = async () => {
      try {
        setInitializing(true);
        const token = await getStoredToken();
        const res = await API.get("/seller/me", {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (active && res?.data?.seller) {
          hydrateSellerProfile(res.data.seller as SellerProfileResponse);
        }
      } catch (error: any) {
        console.log("seller edit load error:", error?.response?.data || error?.message);
        if (active) {
          Alert.alert("Error", "Failed to load seller profile");
          navigation.goBack();
        }
      } finally {
        if (active) {
          setInitializing(false);
        }
      }
    };

    loadSellerProfile();

    return () => {
      active = false;
    };
  }, [hydrateSellerProfile, mode, navigation]);

  const pickImage = (
    previewSetter: PickerSetter<string | null>,
    fileSetter: PickerSetter<ImageFile | null>,
  ) => {
    launchImageLibrary({ mediaType: "photo" }, response => {
      if (response?.didCancel) return;

      if (response?.errorCode) {
        Alert.alert("Error", "Image pick failed");
        return;
      }

      const asset = response.assets?.[0];
      if (asset?.uri) {
        previewSetter(asset.uri);
        fileSetter({
          uri: asset.uri,
          name: asset.fileName,
          type: asset.type,
        });
      }
    });
  };

  const normalizePickedDocument = useCallback(async (file: DocumentPickerResponse): Promise<DocumentFile> => {
    const fileName = file.name || `document_${Date.now()}`;

    if (file.isVirtual || String(file.uri || "").startsWith("content://")) {
      const convertVirtualFileToType = file.isVirtual
        ? file.convertibleToMimeTypes?.find((item) => item.mimeType === "application/pdf")?.mimeType ||
          file.convertibleToMimeTypes?.[0]?.mimeType
        : undefined;

      const [localCopy] = await keepLocalCopy({
        destination: "cachesDirectory",
        files: [
          {
            uri: file.uri,
            fileName,
            convertVirtualFileToType,
          },
        ],
      });

      if (!localCopy || localCopy.status !== "success") {
        throw new Error(localCopy?.copyError || "Unable to access the selected document.");
      }

      return {
        uri: localCopy.localUri,
        name: fileName,
        type: file.type,
      };
    }

    return {
      uri: file.uri,
      name: fileName,
      type: file.type,
    };
  }, []);

  const pickDocument = async (setter: PickerSetter<DocumentFile | null>) => {
    try {
      const [file] = await pick({
        mode: "import",
        allowMultiSelection: false,
        type: [types.allFiles]
      });

      if (!file?.uri) {
        throw new Error("No file was returned by the document picker.");
      }

      if (file.hasRequestedType === false) {
        Alert.alert("Unsupported file", "Please select a supported verification document.");
        return;
      }

      if (file.error) {
        throw new Error(file.error);
      }

      setter(await normalizePickedDocument(file));
    } catch (error) {
      const message = getDocumentPickerMessage(error);

      if (!message) {
        return;
      }

      if (isErrorWithCode(error)) {
        console.log("document picker error:", error.code, error.message);
      } else {
        console.log("document picker error:", error);
      }

      Alert.alert("Error", message);
    }
  };

  const renderUpload = (
    title: string,
    file: DocumentFile | null,
    setter: PickerSetter<DocumentFile | null>
  ) => (
    <TouchableOpacity
      style={styles.uploadBox}
      onPress={() => pickDocument(setter)}
      activeOpacity={0.8}
    >
      <Icon name="document" size={22} color="#7B4DFF" />
      <View style={styles.uploadContent}>
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
    if (digilockerVerified) {
      Alert.alert("Verified", "Your seller profile is already marked as DigiLocker verified.");
      return;
    }

    if (!aadhaar.trim() || !pan.trim()) {
      Alert.alert("Validation", "Please enter Aadhaar and PAN first");
      return;
    }

    Alert.alert(
      "Manual review required",
      "DigiLocker verification is not self-serve in this build. Submit your documents and the verification state will be updated after review."
    );
  };

  const submitSellerRegistration = async () => {
    try {
      if (!validateCurrentStep()) return;

      setLoading(true);

      const token = await getStoredToken();

      if (!token) {
        Alert.alert("Error", "User token not found. Please login again.");
        return;
      }

      const [
        uploadedProfilePic,
        uploadedCoverPic,
        uploadedDegreeDoc,
        uploadedLicenseDoc,
        uploadedAadhaarDoc,
        uploadedPanDoc,
        uploadedIdProof,
      ] = await Promise.all([
        avatarFile ? uploadImageAsset(avatarFile) : avatar || "",
        coverFile ? uploadImageAsset(coverFile) : cover || "",
        degreeDoc ? uploadDocumentAsset(degreeDoc) : "",
        licenseDoc ? uploadDocumentAsset(licenseDoc) : "",
        aadhaarDoc ? uploadDocumentAsset(aadhaarDoc) : "",
        panDoc ? uploadDocumentAsset(panDoc) : "",
        idProof ? uploadDocumentAsset(idProof) : "",
      ]);

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
        degreeDoc: uploadedDegreeDoc,
        licenseDoc: uploadedLicenseDoc,
        aadhaarDoc: uploadedAadhaarDoc,
        panDoc: uploadedPanDoc,
        idProof: uploadedIdProof,
        profilePic: uploadedProfilePic,
        coverPic: uploadedCoverPic
      };

      const endpoint = mode === "edit" ? "/seller/update" : "/seller/register";
      const method = mode === "edit" ? API.put : API.post;

      const res = await method(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (res?.data?.success) {
        Alert.alert(
          "Success",
          mode === "edit"
            ? "Seller profile updated successfully"
            : "Seller registration submitted successfully"
        );
        navigation.replace("SellerDashboardScreen");
      } else {
        Alert.alert(
          "Error",
          res?.data?.message || (mode === "edit" ? "Profile update failed" : "Registration failed")
        );
      }
    } catch (error: any) {
      console.log("seller register error:", error?.response?.data || error.message);

      Alert.alert(
        "Error",
        error?.response?.data?.message || (mode === "edit" ? "Seller update failed" : "Seller registration failed")
      );
    } finally {
      setLoading(false);
    }
  };

  if (initializing) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#7B4DFF" />
        <Text style={styles.loaderText}>
          Loading seller profile...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Icon name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          {mode === "edit" ? "Update Seller Profile" : "Seller Registration"}
        </Text>

        <View style={styles.headerSpacer} />
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
            onPress={() => pickImage(setCover, setCoverFile)}
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
            onPress={() => pickImage(setAvatar, setAvatarFile)}
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
                style={[styles.input, styles.bioInput]}
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
                  digilockerVerified && styles.digilockerBtnVerified
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
                DigiLocker status is controlled after document review. You can submit your
                documents here, but verification is no longer self-marked from the app.
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
                  <Text style={styles.buttonText}>
                    {mode === "edit" ? "Save Changes" : "Submit for Verification"}
                  </Text>
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
  loaderContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F6F7FB"
  },
  screen: {
    flex: 1,
  },
  loaderText: {
    marginTop: 12,
    color: "#666"
  },
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
  headerSpacer: {
    width: 30,
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
  bioInput: {
    height: 90,
    textAlignVertical: "top",
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
  uploadContent: {
    flex: 1,
    marginLeft: 12,
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
  digilockerBtnVerified: {
    backgroundColor: "#118B50",
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
