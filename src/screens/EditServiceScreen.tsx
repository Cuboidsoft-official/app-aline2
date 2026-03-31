import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { launchImageLibrary } from "react-native-image-picker";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { uploadImageAsset } from "../utils/uploadMedia";
import { useAppTheme } from "../theme/AppThemeContext";

type SelectedImage = {
  uri: string;
  fileName?: string;
  type?: string;
};

const PRICING_MODES = [
  { key: "per_minute", label: "Per Minute" },
  { key: "per_hour", label: "Per Hour" },
  { key: "per_message", label: "Per Message" },
  { key: "per_session", label: "Per Session" },
  { key: "package", label: "Package" },
];

const EditServiceScreen = ({ route, navigation }: any) => {
  const { colors } = useAppTheme();
  const { service } = route.params;

  const [serviceName, setServiceName] = useState(service?.serviceName || "");
  const [description, setDescription] = useState(service?.description || "");
  const [eligibility, setEligibility] = useState(service?.eligibility || "");
  const [pricePerMin, setPricePerMin] = useState(service?.pricePerMin?.toString() || "");
  const [pricePerHour, setPricePerHour] = useState(service?.pricePerHour?.toString() || "");
  const [pricePerMsg, setPricePerMsg] = useState(service?.pricePerMsg?.toString() || "");
  const [pricePerSession, setPricePerSession] = useState(service?.pricePerSession?.toString() || "");
  const [packagePrice, setPackagePrice] = useState(service?.packagePrice?.toString() || "");
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(service?.sessionDurationMinutes?.toString() || "");
  const [availabilityNotes, setAvailabilityNotes] = useState(service?.availabilityNotes || "");
  const [pricingModel, setPricingModel] = useState(service?.pricingModel || "per_minute");
  const [imagePreviewUri, setImagePreviewUri] = useState<string | null>(service?.image || null);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const hasAtLeastOnePrice = () =>
    [pricePerMin, pricePerHour, pricePerMsg, pricePerSession, packagePrice].some(
      (value) => Number(value) > 0,
    );

  const pickImage = () => {
    launchImageLibrary({ mediaType: "photo" }, res => {
      if (res?.didCancel) return;
      if (res?.errorCode) {
        Alert.alert("Error", "Image pick failed");
        return;
      }

      if (res?.assets && res.assets.length > 0 && res.assets[0].uri) {
        setSelectedImage({
          uri: res.assets[0].uri,
          fileName: res.assets[0].fileName,
          type: res.assets[0].type,
        });
        setImagePreviewUri(res.assets[0].uri);
      }
    });
  };

  const handleUpdate = async () => {
    if (!serviceName.trim()) {
      Alert.alert("Error", "Service name required");
      return;
    }

    if (!description.trim()) {
      Alert.alert("Error", "Service description required");
      return;
    }

    if (!eligibility.trim()) {
      Alert.alert("Error", "Eligibility details required");
      return;
    }

    if (!hasAtLeastOnePrice()) {
      Alert.alert("Error", "Please keep at least one pricing option");
      return;
    }

    if (pricingModel === "per_session" && Number(sessionDurationMinutes) <= 0) {
      Alert.alert("Error", "Please enter session duration for per-session pricing");
      return;
    }

    try {
      setLoading(true);

      const imageUrl = selectedImage
        ? await uploadImageAsset(selectedImage)
        : imagePreviewUri || "";

      const payload = {
        serviceName: serviceName.trim(),
        description: description.trim(),
        eligibility: eligibility.trim(),
        pricePerMin: pricePerMin || "0",
        pricePerHour: pricePerHour || "0",
        pricePerMsg: pricePerMsg || "0",
        pricePerSession: pricePerSession || "0",
        packagePrice: packagePrice || "0",
        pricingModel,
        sessionDurationMinutes: sessionDurationMinutes || "0",
        availabilityNotes: availabilityNotes.trim(),
        currency: service?.currency || "INR",
        image: imageUrl
      };

      const res = await API.put(`/service/update/${service._id}`, payload);

      if (res?.data?.success) {
        setErrorMessage("");
        Alert.alert("Success", "Service updated successfully");
        navigation.goBack();
      } else {
        setErrorMessage(res?.data?.message || "Update failed");
        Alert.alert("Error", res?.data?.message || "Update failed");
      }
    } catch (err: any) {
      console.log("UPDATE ERROR:", err?.response?.data || err.message);
      const nextMessage = getReadableApiErrorMessage(err, "Update failed");
      setErrorMessage(nextMessage);
      Alert.alert("Error", nextMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Service</Text>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerTitle}>Service issue</Text>
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
          </View>
        ) : null}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Service Image</Text>

          <TouchableOpacity style={styles.imageUpload} onPress={pickImage}>
            {imagePreviewUri ? (
              <Image source={{ uri: imagePreviewUri }} style={styles.serviceImage} />
            ) : (
              <>
                <Icon name="image-outline" size={40} color="#999" />
                <Text style={styles.uploadText}>Upload Image</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Service Details</Text>

          <TextInput
            style={styles.input}
            placeholder="Service name"
            placeholderTextColor="#999"
            value={serviceName}
            onChangeText={setServiceName}
          />

          <TextInput
            style={styles.textarea}
            placeholder="Description"
            placeholderTextColor="#999"
            multiline
            value={description}
            onChangeText={setDescription}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pricing Model</Text>

          <View style={styles.pricingModeRow}>
            {PRICING_MODES.map((mode) => (
              <TouchableOpacity
                key={mode.key}
                style={[
                  styles.modeChip,
                  pricingModel === mode.key && styles.modeChipActive
                ]}
                onPress={() => setPricingModel(mode.key)}
              >
                <Text
                  style={[
                    styles.modeChipText,
                    pricingModel === mode.key && styles.modeChipTextActive
                  ]}
                >
                  {mode.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.priceRow}>
            <View style={styles.priceBox}>
              <Text style={styles.priceLabel}>Per Min</Text>
              <TextInput style={styles.priceInput} keyboardType="numeric" placeholder="0" placeholderTextColor="#999" value={pricePerMin} onChangeText={setPricePerMin} />
            </View>

            <View style={styles.priceBox}>
              <Text style={styles.priceLabel}>Per Hour</Text>
              <TextInput style={styles.priceInput} keyboardType="numeric" placeholder="0" placeholderTextColor="#999" value={pricePerHour} onChangeText={setPricePerHour} />
            </View>

            <View style={[styles.priceBox, styles.priceBoxLast]}>
              <Text style={styles.priceLabel}>Per Msg</Text>
              <TextInput style={styles.priceInput} keyboardType="numeric" placeholder="0" placeholderTextColor="#999" value={pricePerMsg} onChangeText={setPricePerMsg} />
            </View>
          </View>

          <View style={[styles.priceRow, styles.secondPriceRow]}>
            <View style={styles.priceBox}>
              <Text style={styles.priceLabel}>Per Session</Text>
              <TextInput style={styles.priceInput} keyboardType="numeric" placeholder="0" placeholderTextColor="#999" value={pricePerSession} onChangeText={setPricePerSession} />
            </View>

            <View style={styles.priceBox}>
              <Text style={styles.priceLabel}>Session Min</Text>
              <TextInput style={styles.priceInput} keyboardType="numeric" placeholder="30" placeholderTextColor="#999" value={sessionDurationMinutes} onChangeText={setSessionDurationMinutes} />
            </View>

            <View style={[styles.priceBox, styles.priceBoxLast]}>
              <Text style={styles.priceLabel}>Package</Text>
              <TextInput style={styles.priceInput} keyboardType="numeric" placeholder="0" placeholderTextColor="#999" value={packagePrice} onChangeText={setPackagePrice} />
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Eligibility & Availability</Text>

          <TextInput
            style={styles.textarea}
            placeholder="Eligibility"
            placeholderTextColor="#999"
            multiline
            value={eligibility}
            onChangeText={setEligibility}
          />

          <TextInput
            style={[styles.textarea, styles.notesInput]}
            placeholder="Availability notes"
            placeholderTextColor="#999"
            multiline
            value={availabilityNotes}
            onChangeText={setAvailabilityNotes}
          />
        </View>

        <TouchableOpacity
          style={[styles.createBtn, loading && styles.createBtnDisabled]}
          onPress={handleUpdate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createText}>Update Service</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default EditServiceScreen;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F8FC" },
  header: {
    height: 90,
    paddingTop: 40,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee"
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#111" },
  headerSpacer: { width: 24 },
  scrollContent: { paddingBottom: 40 },
  errorBanner: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  errorBannerTitle: {
    color: "#991B1B",
    fontWeight: "800",
    marginBottom: 4
  },
  errorBannerText: {
    color: "#B91C1C",
    lineHeight: 19
  },
  card: {
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 16,
    padding: 18,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10
  },
  cardTitle: { fontWeight: "700", marginBottom: 12, color: "#111", fontSize: 16 },
  imageUpload: {
    height: 150,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    backgroundColor: "#FAFAFA"
  },
  serviceImage: { width: "100%", height: "100%", borderRadius: 12 },
  uploadText: { color: "#888", marginTop: 6 },
  input: {
    backgroundColor: "#F3F4F8",
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
    color: "#111"
  },
  textarea: {
    backgroundColor: "#F3F4F8",
    padding: 14,
    borderRadius: 10,
    color: "#111",
    minHeight: 100,
    textAlignVertical: "top"
  },
  notesInput: {
    marginTop: 12,
    minHeight: 80
  },
  pricingModeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 14
  },
  modeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "#F2F4F8",
    marginRight: 8,
    marginBottom: 8
  },
  modeChipActive: {
    backgroundColor: "#7B4DFF"
  },
  modeChipText: {
    color: "#555",
    fontSize: 12,
    fontWeight: "600"
  },
  modeChipTextActive: {
    color: "#fff"
  },
  priceRow: {
    flexDirection: "row",
    gap: 12
  },
  secondPriceRow: {
    marginTop: 12
  },
  priceBox: {
    flex: 1
  },
  priceBoxLast: {
    marginRight: 0
  },
  priceLabel: {
    marginBottom: 8,
    color: "#666",
    fontSize: 12,
    fontWeight: "600"
  },
  priceInput: {
    backgroundColor: "#F3F4F8",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "#111"
  },
  createBtn: {
    marginHorizontal: 20,
    marginTop: 24,
    backgroundColor: "#7B4DFF",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15
  },
  createBtnDisabled: {
    opacity: 0.7
  },
  createText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16
  }
});
