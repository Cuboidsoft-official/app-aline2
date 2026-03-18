import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { API } from "../api/api";
import Icon from "react-native-vector-icons/Ionicons";

const DEFAULT_COVER =
  "https://www.bcmch.org/asset/uploads/common/867349919655f1491613e4.webp";

const DEFAULT_AVATAR =
  "https://cdn-icons-png.flaticon.com/512/149/149071.png";

const SellerPreviewScreen = ({ route, navigation }: any) => {
  const { sellerId } = route.params;

  const [seller, setSeller] = useState<any>(null);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = await AsyncStorage.getItem("token");

      // 🔥 Seller Profile
      const sellerRes = await API.get(`/seller/${sellerId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // 🔥 Services
      const serviceRes = await API.get(
        `/service/seller/${sellerId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setSeller(sellerRes.data.seller);
      setServices(serviceRes.data.services || []);

    } catch (error) {
      console.log("ERROR:", error);
      Alert.alert("Error", "Failed to load seller profile");
    } finally {
      setLoading(false);
    }
  };

  const handleBook = async (service: any) => {
    try {
      const token = await AsyncStorage.getItem("token");

      if (!token) {
        Alert.alert("Login Required");
        return;
      }

      await API.post(
        "/booking/create",
        {
          sellerId,
          serviceId: service._id
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      Alert.alert("Success", "Appointment Booked");

    } catch (error) {
      console.log(error);
      Alert.alert("Error", "Booking failed");
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7B4DFF" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={22} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Seller Profile</Text>

        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* COVER */}
        <Image
          source={{ uri: seller?.coverPic || DEFAULT_COVER }}
          style={styles.banner}
        />

        {/* PROFILE */}
        <View style={styles.profileSection}>
          <Image
            source={{ uri: seller?.profilePic || DEFAULT_AVATAR }}
            style={styles.avatar}
          />

          <Text style={styles.name}>
            {seller?.sellerName || "Seller"}
          </Text>

          {!!seller?.specialization && (
            <Text style={styles.tagline}>
              {seller.specialization}
            </Text>
          )}
        </View>

        {/* ABOUT */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.desc}>
            {seller?.bio || "No bio added"}
          </Text>
        </View>

        {/* SERVICES */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Services</Text>

          {services.length === 0 ? (
            <Text style={styles.emptyText}>
              No services available
            </Text>
          ) : (
            services.map((item: any) => (
              <View key={item._id} style={styles.serviceCard}>

                {!!item.image && (
                  <Image
                    source={{ uri: item.image }}
                    style={styles.serviceImage}
                  />
                )}

                <Text style={styles.serviceName}>
                  {item.serviceName}
                </Text>

                <Text style={styles.serviceDesc}>
                  {item.description}
                </Text>

                {/* PRICE */}
                <Text style={styles.price}>
                  ₹{item.pricePerMin || item.packagePrice || 0}
                </Text>

                {/* BOOK BUTTON */}
                <TouchableOpacity
                  style={styles.bookBtn}
                  onPress={() => handleBook(item)}
                >
                  <Text style={styles.bookText}>
                    Book Appointment
                  </Text>
                </TouchableOpacity>

              </View>
            ))
          )}
        </View>

      </ScrollView>
    </View>
  );
};

export default SellerPreviewScreen;

const styles = StyleSheet.create({
  header: {
    height: 90,
    paddingTop: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderColor: "#eee"
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "700"
  },

  banner: {
    width: "100%",
    height: 200
  },

  profileSection: {
    alignItems: "center",
    marginTop: -50
  },

  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: "#fff"
  },

  name: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 8
  },

  tagline: {
    color: "#666",
    marginTop: 4
  },

  section: {
    padding: 20
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700"
  },

  desc: {
    marginTop: 8,
    color: "#555"
  },

  emptyText: {
    marginTop: 10,
    color: "#666"
  },

  serviceCard: {
    backgroundColor: "#FAFAFA",
    padding: 12,
    borderRadius: 10,
    marginTop: 12
  },

  serviceImage: {
    width: "100%",
    height: 120,
    borderRadius: 8
  },

  serviceName: {
    fontWeight: "700",
    marginTop: 6
  },

  serviceDesc: {
    color: "#666",
    fontSize: 13
  },

  price: {
    marginTop: 6,
    fontWeight: "700"
  },

  bookBtn: {
    backgroundColor: "#7B4DFF",
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    alignItems: "center"
  },

  bookText: {
    color: "#fff",
    fontWeight: "600"
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  }
});