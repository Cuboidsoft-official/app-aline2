import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Image,
  Alert,
  ActivityIndicator
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API } from "../api/api"; // ✅ USE THIS
import { monetizationDisabledMessage, productFlags } from "../config/productFlags";

type ApiLikeError = {
  response?: { data?: unknown };
  message?: string;
};

type WeeklyAvailabilityEntry = {
  dayOfWeek: number;
  enabled: boolean;
  startMinutes: number;
  endMinutes: number;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const buildDefaultWeeklyAvailability = (): WeeklyAvailabilityEntry[] =>
  DAY_LABELS.map((_, dayOfWeek) => ({
    dayOfWeek,
    enabled: dayOfWeek >= 1 && dayOfWeek <= 5,
    startMinutes: 600,
    endMinutes: 1080,
  }));

const formatMinutes = (minutes: number) => {
  const date = new Date();
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
};

const SellerSettingsScreen = ({ navigation }: any) => {

  const [isAvailable, setIsAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [availabilityTimezone, setAvailabilityTimezone] = useState("Asia/Kolkata");
  const [weeklyAvailability, setWeeklyAvailability] = useState<WeeklyAvailabilityEntry[]>(buildDefaultWeeklyAvailability());

  // ✅ FETCH SELLER
  const fetchSeller = async () => {
    try {
      setLoading(true);

      const token = await AsyncStorage.getItem("token");

      const res = await API.get("/seller/me", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      setIsAvailable(res.data.seller.availabilityStatus);
      setAvailabilityTimezone(res.data.seller?.availabilityTimezone || "Asia/Kolkata");
      setWeeklyAvailability(
        Array.isArray(res.data.seller?.weeklyAvailability) && res.data.seller.weeklyAvailability.length
          ? (res.data.seller.weeklyAvailability as WeeklyAvailabilityEntry[])
          : buildDefaultWeeklyAvailability()
      );

    } catch (error) {
      const apiError = error as ApiLikeError;
      console.log("FETCH ERROR:", apiError.response?.data || apiError.message);
      Alert.alert("Error", "Failed to load seller data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSeller();
  }, []);

  // ✅ TOGGLE AVAILABILITY
  const toggleAvailability = async () => {
    try {
      const token = await AsyncStorage.getItem("token");

      const newStatus = !isAvailable;
      setIsAvailable(newStatus);

      const res = await API.put(
        "/seller/update-availability",
        { availabilityStatus: newStatus },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      console.log("SUCCESS:", res.data);

      Alert.alert(
        "Updated",
        newStatus ? "You are now Available" : "You are now Unavailable"
      );

    } catch (error) {
      const apiError = error as ApiLikeError;
      console.log("ERROR:", apiError.response?.data || apiError.message);

      setIsAvailable(!isAvailable); // rollback

      Alert.alert("Error", "Update failed");
    }
  };

  const toggleWeekday = (dayOfWeek: number) => {
    setWeeklyAvailability((current) =>
      current.map((entry) =>
        entry.dayOfWeek === dayOfWeek
          ? { ...entry, enabled: !entry.enabled }
          : entry
      )
    );
  };

  const saveAvailabilitySchedule = async () => {
    try {
      setSavingSchedule(true);
      const token = await AsyncStorage.getItem("token");

      await API.put(
        "/seller/availability-schedule",
        {
          availabilityTimezone,
          weeklyAvailability,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      Alert.alert("Saved", "Your weekly availability has been updated.");
    } catch (error) {
      const apiError = error as ApiLikeError;
      console.log("SCHEDULE ERROR:", apiError.response?.data || apiError.message);
      Alert.alert("Error", "Failed to update availability schedule");
    } finally {
      setSavingSchedule(false);
    }
  };

  const deleteSellerProfile = () => {
    Alert.alert(
      "Delete Seller Profile",
      "Are you sure you want to delete your seller profile?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive" }
      ]
    );
  };

  const showUnavailableFeature = (feature: string) => {
    Alert.alert("Not available yet", `${feature} is not implemented in the backend yet.`);
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#ab2aeb" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Seller Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* PROFILE */}
        <Text style={styles.section}>Seller Profile</Text>

        <TouchableOpacity
          style={styles.item}
          onPress={() => navigation.navigate("SellerRegistration", { mode: "edit" })}
        >
          <Text style={styles.text}>Update Profile</Text>
          <Icon name="chevron-forward" size={20} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.item}
          onPress={() => navigation.navigate("Profile")}
        >
          <Text style={styles.text}>Switch to User Profile</Text>
          <Icon name="person-outline" size={20} />
        </TouchableOpacity>

        {/* AVAILABILITY */}
        <Text style={styles.section}>Availability</Text>

        <View style={styles.item}>
          <Text style={styles.text}>Seller Availability</Text>

          <Switch
            value={isAvailable}
            onValueChange={toggleAvailability}
            thumbColor={isAvailable ? "#ab2aeb" : "#ccc"}
          />
        </View>

        <View style={styles.scheduleCard}>
          <Text style={styles.scheduleTitle}>Weekly Booking Schedule</Text>
          <Text style={styles.scheduleSubtitle}>
            Buyers will see slots only on the enabled days below. Working hours are currently {formatMinutes(600)} to {formatMinutes(1080)} in {availabilityTimezone}.
          </Text>

          {weeklyAvailability
            .slice()
            .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
            .map((entry) => (
              <View key={entry.dayOfWeek} style={styles.scheduleRow}>
                <View>
                  <Text style={styles.scheduleDay}>{DAY_LABELS[entry.dayOfWeek]}</Text>
                  <Text style={styles.scheduleHours}>
                    {formatMinutes(entry.startMinutes)} - {formatMinutes(entry.endMinutes)}
                  </Text>
                </View>

                <Switch
                  value={entry.enabled}
                  onValueChange={() => toggleWeekday(entry.dayOfWeek)}
                  thumbColor={entry.enabled ? "#ab2aeb" : "#ccc"}
                />
              </View>
            ))}

          <TouchableOpacity
            style={[styles.scheduleSaveButton, savingSchedule && styles.scheduleSaveButtonDisabled]}
            onPress={saveAvailabilitySchedule}
            disabled={savingSchedule}
          >
            <Text style={styles.scheduleSaveText}>
              {savingSchedule ? "Saving..." : "Save Schedule"}
            </Text>
          </TouchableOpacity>
        </View>

        {productFlags.sellerMonetizationInConsumerApp ? (
          <>
            <Text style={styles.section}>Seller Wallet</Text>

            <TouchableOpacity
              style={styles.item}
              onPress={() => navigation.navigate("WalletScreen")}
            >
              <Text style={styles.text}>Recharge Wallet</Text>
              <Icon name="wallet-outline" size={20} />
            </TouchableOpacity>

            <View style={styles.paymentRow}>
              <Image source={{ uri: "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/phonepe-icon.png" }} style={styles.paymentIcon}/>
              <Image source={{ uri: "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/google-pay-icon.png" }} style={styles.paymentIcon}/>
              <Image source={{ uri: "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/paytm-icon.png" }} style={styles.paymentIcon}/>
            </View>

            <Text style={styles.section}>Ads & Promotions</Text>

            <TouchableOpacity
              style={styles.item}
              onPress={() => showUnavailableFeature("Profile promotion")}
            >
              <View style={styles.row}>
                <Icon name="trending-up-outline" size={20} color="#ab2aeb" />
                <Text style={styles.textSpacing}>Promote Profile</Text>
              </View>
              <Text style={styles.badge}>NEW</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.item}
              onPress={() => showUnavailableFeature("Campaign boosting")}
            >
              <View style={styles.row}>
                <Icon name="megaphone-outline" size={20} color="#ab2aeb" />
                <Text style={styles.textSpacing}>Boost Ads / Campaign</Text>
              </View>
              <Icon name="chevron-forward" size={20} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.section}>Business Tools</Text>
            <View style={styles.infoCard}>
              <Icon name="information-circle-outline" size={18} color="#6b7280" />
              <Text style={styles.infoText}>{monetizationDisabledMessage}</Text>
            </View>
          </>
        )}

        {/* ACCOUNT */}
        <Text style={styles.section}>Account</Text>

        <TouchableOpacity style={styles.item} onPress={deleteSellerProfile}>
          <Text style={styles.deleteText}>Delete Seller Profile</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
};

export default SellerSettingsScreen;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    borderBottomWidth: 1,
    borderColor: "#eee"
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginLeft: 15
  },

  section: {
    fontSize: 13,
    color: "#888",
    marginTop: 25,
    marginLeft: 15,
    marginBottom: 10
  },

  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    borderBottomWidth: 1,
    borderColor: "#eee"
  },

  text: { fontSize: 16 },

  textSpacing: {
    fontSize: 16,
    marginLeft: 10
  },

  deleteText: {
    fontSize: 16,
    color: "red"
  },

  row: {
    flexDirection: "row",
    alignItems: "center"
  },

  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 15
  },
  infoCard: {
    marginHorizontal: 15,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "flex-start"
  },
  infoText: {
    flex: 1,
    marginLeft: 10,
    color: "#4B5563",
    lineHeight: 20
  },
  scheduleCard: {
    marginHorizontal: 15,
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E9DFFF",
    backgroundColor: "#FAF7FF"
  },
  scheduleTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2E1065"
  },
  scheduleSubtitle: {
    marginTop: 8,
    color: "#5B4B76",
    lineHeight: 19
  },
  scheduleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEE7FF"
  },
  scheduleDay: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827"
  },
  scheduleHours: {
    marginTop: 3,
    color: "#6B7280"
  },
  scheduleSaveButton: {
    marginTop: 14,
    backgroundColor: "#7B4DFF",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center"
  },
  scheduleSaveButtonDisabled: {
    opacity: 0.7
  },
  scheduleSaveText: {
    color: "#fff",
    fontWeight: "700"
  },

  paymentIcon: {
    width: 60,
    height: 30,
    resizeMode: "contain"
  },

  badge: {
    backgroundColor: "#ab2aeb",
    color: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontSize: 10,
    fontWeight: "bold"
  },

  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  }
});
