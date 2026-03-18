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
  ActivityIndicator
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { launchImageLibrary } from "react-native-image-picker";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";

const EditServiceScreen = ({ route, navigation }: any) => {
  const { service } = route.params;

  const [serviceName, setServiceName] = useState(service?.serviceName || "");
  const [description, setDescription] = useState(service?.description || "");
  const [eligibility, setEligibility] = useState(service?.eligibility || "");
  const [pricePerMin, setPricePerMin] = useState(
    service?.pricePerMin?.toString() || ""
  );
  const [pricePerMsg, setPricePerMsg] = useState(
    service?.pricePerMsg?.toString() || ""
  );
  const [packagePrice, setPackagePrice] = useState(
    service?.packagePrice?.toString() || ""
  );
  const [image, setImage] = useState(service?.image || null);

  const [loading, setLoading] = useState(false);

  const pickImage = () => {
    launchImageLibrary({ mediaType: "photo" }, res => {
      if (res?.didCancel) return;

      if (res?.errorCode) {
        Alert.alert("Error", "Image pick failed");
        return;
      }

      if (res?.assets && res.assets.length > 0) {
        setImage(res.assets[0].uri || null);
      }
    });
  };

  const handleUpdate = async () => {
    if (!serviceName.trim()) {
      Alert.alert("Error", "Service name required");
      return;
    }

    try {
      setLoading(true);

      const token = await AsyncStorage.getItem("token");

      if (!token) {
        Alert.alert("Error", "Please login again");
        return;
      }

      const payload = {
        serviceName: serviceName.trim(),
        description: description.trim(),
        eligibility: eligibility.trim(),
        pricePerMin: pricePerMin || "0",
        pricePerMsg: pricePerMsg || "0",
        packagePrice: packagePrice || "0",
        image: image || ""
      };

      const res = await API.put(`/service/update/${service._id}`, payload, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      console.log("UPDATE RES:", res?.data);

      if (res?.data?.success) {
        Alert.alert("Success", "Service updated successfully");
        navigation.goBack();
      } else {
        Alert.alert("Error", res?.data?.message || "Update failed");
      }
    } catch (err: any) {
      console.log("UPDATE ERROR:", err?.response?.data || err.message);

      Alert.alert(
        "Error",
        err?.response?.data?.message || "Update failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Edit Service</Text>

        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Service Image</Text>

          <TouchableOpacity style={styles.imageUpload} onPress={pickImage}>
            {image ? (
              <Image source={{ uri: image }} style={styles.serviceImage} />
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
          <Text style={styles.cardTitle}>Pricing</Text>

          <View style={styles.priceRow}>
            <View style={styles.priceBox}>
              <Text style={styles.priceLabel}>Call / Min</Text>
              <TextInput
                style={styles.priceInput}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#999"
                value={pricePerMin}
                onChangeText={setPricePerMin}
              />
            </View>

            <View style={styles.priceBox}>
              <Text style={styles.priceLabel}>Per Msg</Text>
              <TextInput
                style={styles.priceInput}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#999"
                value={pricePerMsg}
                onChangeText={setPricePerMsg}
              />
            </View>

            <View style={[styles.priceBox, { marginRight: 0 }]}>
              <Text style={styles.priceLabel}>Package</Text>
              <TextInput
                style={styles.priceInput}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#999"
                value={packagePrice}
                onChangeText={setPackagePrice}
              />
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Eligibility</Text>

          <TextInput
            style={styles.textarea}
            placeholder="Eligibility"
            placeholderTextColor="#999"
            multiline
            value={eligibility}
            onChangeText={setEligibility}
          />
        </View>

        <TouchableOpacity
          style={[styles.createBtn, loading && { opacity: 0.7 }]}
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
    </View>
  );
};

export default EditServiceScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7F8FC"
  },

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

  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111"
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

  cardTitle: {
    fontWeight: "700",
    marginBottom: 12,
    color: "#111",
    fontSize: 16
  },

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

  serviceImage: {
    width: "100%",
    height: "100%",
    borderRadius: 12
  },

  uploadText: {
    color: "#888",
    marginTop: 6
  },

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
    height: 100,
    textAlignVertical: "top",
    color: "#111"
  },

  priceRow: {
    flexDirection: "row"
  },

  priceBox: {
    flex: 1,
    marginRight: 10
  },

  priceLabel: {
    fontSize: 12,
    color: "#777",
    marginBottom: 4
  },

  priceInput: {
    backgroundColor: "#F3F4F8",
    padding: 12,
    borderRadius: 10,
    color: "#111"
  },

  createBtn: {
    backgroundColor: "#7B4DFF",
    margin: 20,
    padding: 18,
    borderRadius: 12,
    alignItems: "center"
  },

  createText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16
  }
});