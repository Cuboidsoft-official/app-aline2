import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator
} from "react-native";
import { Alert } from "../utils/appAlert";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { monetizationDisabledMessage, productFlags } from "../config/productFlags";
import { useAppTheme } from "../theme/AppThemeContext";

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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const buildSellerBankSummary = (seller: {
  bankName?: string;
  bankAccountNumber?: string;
}) => {
  const bankName = String(seller?.bankName || "").trim();
  const accountNumber = String(seller?.bankAccountNumber || "").trim();
  const lastFour = accountNumber.slice(-4);

  if (!bankName && !lastFour) {
    return "Add your seller payout account";
  }

  if (!bankName) {
    return `Ending in ${lastFour}`;
  }

  if (!lastFour) {
    return bankName;
  }

  return `${bankName} • ${lastFour}`;
};

const showAvailabilityStatusModal = (nextStatus: boolean) => {
  Alert.alert(
    nextStatus ? "You're now able to get appointments" : "You're now marked as I am Out",
    nextStatus
      ? "You are visible to users for appointments and chat requests."
      : "You will not be visible to users for new appointments until you switch back in.",
  );
};

const SellerSettingsScreen = ({ navigation }: any) => {
  const { colors } = useAppTheme();

  const [isAvailable, setIsAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [availabilityTimezone, setAvailabilityTimezone] = useState("Asia/Kolkata");
  const [weeklyAvailability, setWeeklyAvailability] = useState<WeeklyAvailabilityEntry[]>(buildDefaultWeeklyAvailability());
  const [bankSummary, setBankSummary] = useState("Add your seller payout account");

  // ✅ FETCH SELLER
  const fetchSeller = async () => {
    try {
      setLoading(true);

      const res = await API.get("/seller/me");

      setIsAvailable(res.data.seller.availabilityStatus);
      setAvailabilityTimezone(res.data.seller?.availabilityTimezone || "Asia/Kolkata");
      setWeeklyAvailability(
        Array.isArray(res.data.seller?.weeklyAvailability) && res.data.seller.weeklyAvailability.length
          ? (res.data.seller.weeklyAvailability as WeeklyAvailabilityEntry[])
          : buildDefaultWeeklyAvailability()
      );
      setBankSummary(buildSellerBankSummary(res.data.seller || {}));

    } catch (error) {
      const apiError = error as ApiLikeError;
      console.log("FETCH ERROR:", apiError.response?.data || apiError.message);
      Alert.alert("Unable to load seller data", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSeller();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      fetchSeller().catch(() => {});
    }, [])
  );

  // ✅ TOGGLE AVAILABILITY
  const toggleAvailability = async () => {
    try {
      const newStatus = !isAvailable;
      setIsAvailable(newStatus);

      const res = await API.put("/seller/update-availability", { availabilityStatus: newStatus });

      console.log("SUCCESS:", res.data);

      showAvailabilityStatusModal(newStatus);

    } catch (error) {
      const apiError = error as ApiLikeError;
      console.log("ERROR:", apiError.response?.data || apiError.message);

      setIsAvailable(!isAvailable); // rollback

      Alert.alert("Unable to update availability", getReadableApiErrorMessage(error, "Please try again."));
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

  const adjustWeekdayTime = (dayOfWeek: number, field: "startMinutes" | "endMinutes", deltaMinutes: number) => {
    setWeeklyAvailability((current) =>
      current.map((entry) => {
        if (entry.dayOfWeek !== dayOfWeek) {
          return entry;
        }

        if (field === "startMinutes") {
          const nextStart = clamp(entry.startMinutes + deltaMinutes, 0, entry.endMinutes - 30);
          return {
            ...entry,
            startMinutes: nextStart,
          };
        }

        const nextEnd = clamp(entry.endMinutes + deltaMinutes, entry.startMinutes + 30, 1440);
        return {
          ...entry,
          endMinutes: nextEnd,
        };
      })
    );
  };

  const saveAvailabilitySchedule = async () => {
    try {
      setSavingSchedule(true);
      await API.put("/seller/availability-schedule", {
        availabilityTimezone,
        weeklyAvailability,
      });

      Alert.alert("Saved", "Your weekly availability has been updated.");
    } catch (error) {
      const apiError = error as ApiLikeError;
      console.log("SCHEDULE ERROR:", apiError.response?.data || apiError.message);
      Alert.alert("Unable to update schedule", getReadableApiErrorMessage(error, "Please try again."));
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

  if (loading) {
    return (
      <View style={[styles.loader, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>

      {/* HEADER */}
      <View style={[styles.header, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.text }]}>Seller Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* PROFILE */}
        <Text style={[styles.section, { color: colors.mutedText }]}>Seller Profile</Text>

        <TouchableOpacity
          style={[styles.item, { borderColor: colors.border }]}
          onPress={() => navigation.navigate("SellerRegistration", { mode: "edit" })}
        >
          <Text style={[styles.text, { color: colors.text }]}>Update Profile</Text>
          <Icon name="chevron-forward" size={20} color={colors.mutedText} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, { borderColor: colors.border }]}
          onPress={() => navigation.navigate("Profile")}
        >
          <Text style={[styles.text, { color: colors.text }]}>Switch to User Profile</Text>
          <Icon name="person-outline" size={20} color={colors.mutedText} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, { borderColor: colors.border }]}
          onPress={() => navigation.navigate("SellerRegistration", { mode: "edit", initialStep: 4 })}
        >
          <View style={styles.itemCopy}>
            <Text style={[styles.text, { color: colors.text }]}>Bank account setup</Text>
            <Text style={[styles.itemHint, { color: colors.mutedText }]}>{bankSummary}</Text>
          </View>
          <Icon name="card-outline" size={20} color={colors.mutedText} />
        </TouchableOpacity>

        {/* AVAILABILITY */}
        <Text style={[styles.section, { color: colors.mutedText }]}>Availability</Text>

        <View style={[styles.item, { borderColor: colors.border }]}>
          <Text style={[styles.text, { color: colors.text }]}>Seller Availability</Text>

          <Switch
            value={isAvailable}
            onValueChange={toggleAvailability}
            thumbColor={isAvailable ? colors.primary : "#ccc"}
          />
        </View>

        <View style={[styles.scheduleCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.scheduleTitle, { color: colors.text }]}>Weekly Booking Schedule</Text>
          <Text style={[styles.scheduleSubtitle, { color: colors.mutedText }]}>
            Buyers will see slots only on the enabled days below. Working hours are currently {formatMinutes(600)} to {formatMinutes(1080)} in {availabilityTimezone}.
          </Text>

          {weeklyAvailability
            .slice()
            .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
            .map((entry) => (
              <View key={entry.dayOfWeek} style={[styles.scheduleRow, { borderBottomColor: colors.border }]}>
                <View style={styles.scheduleMeta}>
                  <Text style={[styles.scheduleDay, { color: colors.text }]}>{DAY_LABELS[entry.dayOfWeek]}</Text>
                  <Text style={[styles.scheduleHours, { color: colors.mutedText }]}>
                    {formatMinutes(entry.startMinutes)} - {formatMinutes(entry.endMinutes)}
                  </Text>
                  <View style={styles.timeAdjustRow}>
                    <Text style={[styles.timeAdjustLabel, { color: colors.mutedText }]}>Start</Text>
                    <TouchableOpacity
                      style={[styles.timeAdjustButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
                      onPress={() => adjustWeekdayTime(entry.dayOfWeek, "startMinutes", -30)}
                    >
                      <Text style={[styles.timeAdjustButtonText, { color: colors.primary }]}>-30m</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.timeAdjustButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
                      onPress={() => adjustWeekdayTime(entry.dayOfWeek, "startMinutes", 30)}
                    >
                      <Text style={[styles.timeAdjustButtonText, { color: colors.primary }]}>+30m</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.timeAdjustRow}>
                    <Text style={[styles.timeAdjustLabel, { color: colors.mutedText }]}>End</Text>
                    <TouchableOpacity
                      style={[styles.timeAdjustButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
                      onPress={() => adjustWeekdayTime(entry.dayOfWeek, "endMinutes", -30)}
                    >
                      <Text style={[styles.timeAdjustButtonText, { color: colors.primary }]}>-30m</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.timeAdjustButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
                      onPress={() => adjustWeekdayTime(entry.dayOfWeek, "endMinutes", 30)}
                    >
                      <Text style={[styles.timeAdjustButtonText, { color: colors.primary }]}>+30m</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <Switch
                  value={entry.enabled}
                  onValueChange={() => toggleWeekday(entry.dayOfWeek)}
                  thumbColor={entry.enabled ? colors.primary : "#ccc"}
                />
              </View>
            ))}

          <TouchableOpacity
            style={[styles.scheduleSaveButton, { backgroundColor: colors.primary }, savingSchedule && styles.scheduleSaveButtonDisabled]}
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
              <Text style={styles.text}>Seller Earnings</Text>
              <Icon name="wallet-outline" size={20} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.section}>Business Tools</Text>
            <View style={styles.infoCard}>
              <Icon name="information-circle-outline" size={18} color="#6b7280" />
              <Text style={[styles.infoText, { color: colors.mutedText }]}>{monetizationDisabledMessage}</Text>
            </View>
          </>
        )}

        {/* ACCOUNT */}
        <Text style={[styles.section, { color: colors.mutedText }]}>Account</Text>

        <TouchableOpacity style={[styles.item, { borderColor: colors.border }]} onPress={deleteSellerProfile}>
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
  itemCopy: {
    flex: 1,
    paddingRight: 16,
  },
  itemHint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
  },

  deleteText: {
    fontSize: 16,
    color: "red"
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
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEE7FF"
  },
  scheduleMeta: {
    flex: 1,
    paddingRight: 12,
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
  timeAdjustRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  timeAdjustLabel: {
    width: 42,
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "600",
  },
  timeAdjustButton: {
    borderWidth: 1,
    borderColor: "#D8CCFF",
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 8,
  },
  timeAdjustButtonText: {
    color: "#5B21B6",
    fontSize: 12,
    fontWeight: "700",
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

  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  }
});
