import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView
} from "react-native";

import Icon from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API } from "../api/api";

const PRIMARY = "#7B4DFF";

const SellerDetailsScreen = ({ route, navigation }) => {

  const { sellerId } = route.params;

  const [seller, setSeller] = useState(null);
  const [services, setServices] = useState([]);
  const [media, setMedia] = useState([]);

  useEffect(() => {
    fetchSeller();
    fetchServices();
  }, []);

  // ================= API =================

  const fetchSeller = async () => {
    try {
      const token = await AsyncStorage.getItem("token");

      const res = await API.get(`/seller/${sellerId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSeller(res.data.seller);
      setMedia(res.data.seller?.media || []);

    } catch (err) {
      console.log("Seller error:", err);
    }
  };

  const fetchServices = async () => {
    try {
      const token = await AsyncStorage.getItem("token");

      const res = await API.get(`/service/seller/${sellerId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setServices(res.data.services || []);

    } catch (err) {
      console.log("Service error:", err);
    }
  };

  // ================= UI =================

  return (
    <View style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Seller Details</Text>

        <TouchableOpacity>
          <Icon name="ellipsis-vertical" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* PROFILE */}
        <View style={styles.profileSection}>

          <View style={styles.avatarRing}>
            <Image
              source={{
                uri:
                  seller?.profilePic ||
                  "https://cdn-icons-png.flaticon.com/512/149/149071.png"
              }}
              style={styles.avatar}
            />
          </View>

          <Text style={styles.username}>
            {seller?.sellerName || "Loading..."}
          </Text>

          <Text style={styles.bio}>
            {seller?.bio || "No description available"}
          </Text>

        </View>

        {/* ACTION BUTTONS */}
        <View style={styles.actions}>

          <Action icon="call-outline" title="Call" />
          <Action icon="videocam-outline" title="Video" />
          <Action icon="chatbubble-outline" title="Chat" />
          <Action icon="share-social-outline" title="Share" />

        </View>

        {/* SERVICES */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Services</Text>

          {services.length > 0 ? (

            services.map((item, index) => (
              <View key={index} style={styles.serviceCard}>

                <View>
                  <Text style={styles.serviceName}>
                    {item.serviceName}
                  </Text>

                  <Text style={styles.servicePrice}>
                    ₹{item.pricePerMin || item.pricePerMsg || item.packagePrice}
                  </Text>
                </View>

                <TouchableOpacity style={styles.bookBtn}>
                  <Text style={{ color: "#fff" }}>Book</Text>
                </TouchableOpacity>

              </View>
            ))

          ) : (
            <Text style={{ color: "#999" }}>No services available</Text>
          )}

        </View>

        {/* MEDIA */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Media</Text>

          {media.length > 0 ? (
            <View style={styles.mediaRow}>
              {media.slice(0, 6).map((item, index) => (
                <Image
                  key={index}
                  source={{ uri: item }}
                  style={styles.mediaBox}
                />
              ))}
            </View>
          ) : (
            <Text style={{ color: "#999" }}>No media files</Text>
          )}

        </View>

        {/* SETTINGS */}
        <View style={styles.optionBox}>
          <Option icon="notifications-outline" title="Notifications" />
          <Option icon="color-palette-outline" title="Chat Theme" />
          <Option icon="time-outline" title="Disappearing Messages" />
          <Option icon="shield-checkmark-outline" title="Encryption" />
        </View>

        {/* BLOCK */}
        <TouchableOpacity style={styles.blockButton}>
          <Icon name="close-circle-outline" size={20} color="#ef4444" />
          <Text style={styles.blockText}>
            Block {seller?.sellerName || "Seller"}
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
};

export default SellerDetailsScreen;





/* ================= COMPONENTS ================= */

const Action = ({ icon, title }) => (
  <TouchableOpacity style={styles.actionItem}>
    <View style={styles.actionIcon}>
      <Icon name={icon} size={24} color={PRIMARY} />
    </View>
    <Text style={styles.actionText}>{title}</Text>
  </TouchableOpacity>
);

const Option = ({ icon, title }) => (
  <TouchableOpacity style={styles.optionRow}>
    <Icon name={icon} size={22} style={{ marginRight: 15 }} />
    <Text style={{ flex: 1 }}>{title}</Text>
    <Icon name="chevron-forward" />
  </TouchableOpacity>
);





/* ================= STYLES ================= */

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#F6F7FB"
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 55,
    paddingBottom: 15,
    backgroundColor: PRIMARY
  },

  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600"
  },

  profileSection: {
    alignItems: "center",
    marginTop: 25
  },

  avatarRing: {
    padding: 4,
    borderRadius: 70,
    backgroundColor: "#E9E0FF"
  },

  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55
  },

  username: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 12
  },

  bio: {
    color: "#777",
    marginTop: 6,
    textAlign: "center",
    paddingHorizontal: 30
  },

  actions: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 30
  },

  actionItem: {
    alignItems: "center"
  },

  actionIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    elevation: 3
  },

  actionText: {
    marginTop: 6,
    fontSize: 12
  },

  section: {
    marginTop: 30,
    paddingHorizontal: 18
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10
  },

  serviceCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    alignItems: "center"
  },

  serviceName: {
    fontWeight: "700"
  },

  servicePrice: {
    color: PRIMARY,
    marginTop: 4
  },

  bookBtn: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10
  },

  mediaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },

  mediaBox: {
    width: 100,
    height: 100,
    borderRadius: 10,
    margin: 5
  },

  optionBox: {
    marginTop: 30,
    backgroundColor: "#fff",
    marginHorizontal: 18,
    borderRadius: 14
  },

  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderColor: "#f0f0f0"
  },

  blockButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    margin: 20,
    padding: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ef4444"
  },

  blockText: {
    color: "#ef4444",
    marginLeft: 8,
    fontWeight: "600"
  }

});