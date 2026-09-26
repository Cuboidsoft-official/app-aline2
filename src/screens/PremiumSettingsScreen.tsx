import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { CountryPicker } from "react-native-country-codes-picker";
import type { CountryItem } from "react-native-country-codes-picker";
import { Alert } from "../utils/appAlert";
import { API } from "../api/api";
import AppBottomDock, { APP_BOTTOM_DOCK_BASE_HEIGHT } from "../components/AppBottomDock";
import { alpha, appFonts, appShadows } from "../theme/designSystem";
import { useAppTheme } from "../theme/AppThemeContext";
import { currencyForCountry } from "../utils/countryCurrency";

// ─── Types ────────────────────────────────────────────────────────────────────

type CountryPricingEntry = {
  _id?: string;
  countryCode: string;   // ISO 3166-1 alpha-2, e.g. "IN"
  countryName: string;   // display name, e.g. "India"
  flag: string;          // emoji flag, e.g. "🇮🇳"
  currency: string;      // ISO 4217, e.g. "INR"
  amount: string;        // string for TextInput; converted to Number on save
  enabled: boolean;
};

type PremiumSettingsShape = {
  premiumContentEnabled: boolean;
  countryPricing: CountryPricingEntry[];
  minPriceINR: number;
  maxPriceINR: number;
  defaultTier: "one_time" | "subscription";
  platformFeePercent: number;
  signedUrlTtlSeconds: number;
  updatedAt: string | null;
};

const DEFAULT_SETTINGS: PremiumSettingsShape = {
  premiumContentEnabled: false,
  countryPricing: [],
  minPriceINR: 1,
  maxPriceINR: 9999,
  defaultTier: "one_time",
  platformFeePercent: 10,
  signedUrlTtlSeconds: 0,
  updatedAt: null,
};

/** Derive emoji flag from an ISO 3166-1 alpha-2 code without any package. */
function flagFromCode(code: string): string {
  if (!code || code.length !== 2) return "🏳️";
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(c.charCodeAt(0) + 127397))
    .join("");
}

function serverEntryToLocal(e: any): CountryPricingEntry {
  const code = String(e.countryCode || "").toUpperCase();
  return {
    _id: String(e._id || ""),
    countryCode: code,
    countryName: e.countryName || code,
    flag: e.flag || flagFromCode(code),
    currency: String(e.currency || "").toUpperCase(),
    amount: String(e.amount ?? ""),
    enabled: e.enabled !== false,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

const PremiumSettingsScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { colors, isDarkMode } = useAppTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [draft, setDraft] = useState<PremiumSettingsShape>(DEFAULT_SETTINGS);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  // Country picker modal state
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  // When replacing an existing entry: its index; -1 = adding new
  const [pickerTargetIndex, setPickerTargetIndex] = useState<number>(-1);

  // ─── Load ────────────────────────────────────────────────────────────────

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const res = await API.get("/admin/premium-settings");
      const s = res?.data?.settings;
      if (s) {
        setDraft({
          premiumContentEnabled: s.premiumContentEnabled ?? false,
          countryPricing: (s.countryPricing || []).map(serverEntryToLocal),
          minPriceINR: s.minPriceINR ?? 1,
          maxPriceINR: s.maxPriceINR ?? 9999,
          defaultTier: s.defaultTier ?? "one_time",
          platformFeePercent: s.platformFeePercent ?? 10,
          signedUrlTtlSeconds: s.signedUrlTtlSeconds ?? 0,
          updatedAt: s.updatedAt || null,
        });
        setLastUpdatedAt(s.updatedAt || null);
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const msg =
        status === 403
          ? "Admin access required to view these settings."
          : status === 401
          ? "Session expired. Please log in again."
          : err?.response?.data?.message || "Failed to load premium settings.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // ─── Validation ──────────────────────────────────────────────────────────

  const validateDraft = (): string | null => {
    const min = Number(draft.minPriceINR);
    const max = Number(draft.maxPriceINR);
    const fee = Number(draft.platformFeePercent);
    const ttl = Number(draft.signedUrlTtlSeconds);

    if (!Number.isFinite(min) || min < 1) return "Minimum price must be at least ₹1.";
    if (!Number.isFinite(max) || max < min) return "Maximum price must be ≥ minimum price.";
    if (!Number.isFinite(fee) || fee < 0 || fee > 100) return "Platform fee must be 0–100%.";
    if (!Number.isFinite(ttl) || ttl < 0) return "Signed URL TTL cannot be negative.";

    const seenCodes = new Set<string>();
    for (let i = 0; i < draft.countryPricing.length; i++) {
      const entry = draft.countryPricing[i];
      const code = entry.countryCode.trim().toUpperCase();
      const currency = entry.currency.trim().toUpperCase();
      const amount = Number(entry.amount);

      if (!/^[A-Z]{2}$/.test(code)) {
        return `Country [${i + 1}]: invalid country code "${entry.countryCode}" — must be 2 letters.`;
      }
      if (!/^[A-Z]{3}$/.test(currency)) {
        return `Country [${i + 1}] (${code}): invalid currency "${entry.currency}" — must be 3 letters.`;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return `Country [${i + 1}] (${code}): amount must be a positive number.`;
      }
      if (seenCodes.has(code)) {
        return `Duplicate country code "${code}". Each country may appear only once.`;
      }
      seenCodes.add(code);
    }

    return null;
  };

  // ─── Save ────────────────────────────────────────────────────────────────

  const saveSettings = async () => {
    if (saving) return;

    const validationError = validateDraft();
    if (validationError) {
      Alert.alert("Invalid input", validationError);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        premiumContentEnabled: draft.premiumContentEnabled,
        minPriceINR: Number(draft.minPriceINR),
        maxPriceINR: Number(draft.maxPriceINR),
        defaultTier: draft.defaultTier,
        platformFeePercent: Number(draft.platformFeePercent),
        signedUrlTtlSeconds: Number(draft.signedUrlTtlSeconds),
        countryPricing: draft.countryPricing.map((e) => ({
          countryCode: e.countryCode.trim().toUpperCase(),
          currency: e.currency.trim().toUpperCase(),
          amount: Number(e.amount),
          enabled: e.enabled,
        })),
      };
      const res = await API.put("/admin/premium-settings", payload);
      const updated = res?.data?.settings;
      if (updated) {
        setDraft({
          premiumContentEnabled: updated.premiumContentEnabled ?? false,
          countryPricing: (updated.countryPricing || []).map(serverEntryToLocal),
          minPriceINR: updated.minPriceINR ?? 1,
          maxPriceINR: updated.maxPriceINR ?? 9999,
          defaultTier: updated.defaultTier ?? "one_time",
          platformFeePercent: updated.platformFeePercent ?? 10,
          signedUrlTtlSeconds: updated.signedUrlTtlSeconds ?? 0,
          updatedAt: updated.updatedAt || null,
        });
        setLastUpdatedAt(updated.updatedAt || null);
      }
      Alert.alert("Saved", "Premium settings updated successfully.");
    } catch (err: any) {
      const status = err?.response?.status;
      const msg =
        status === 403
          ? "Admin access required."
          : status === 400
          ? err?.response?.data?.message || "Validation failed."
          : status === 401
          ? "Session expired. Please log in again."
          : err?.response?.data?.message || "Failed to save settings.";
      Alert.alert("Save failed", msg);
    } finally {
      setSaving(false);
    }
  };

  // ─── Country picker helpers ───────────────────────────────────────────────

  const openPickerForNew = () => {
    setPickerTargetIndex(-1);
    setShowCountryPicker(true);
  };

  const onCountrySelected = (item: CountryItem) => {
    setShowCountryPicker(false);

    const code = item.code.toUpperCase();
    const name = item.name?.en || code;
    const flag = item.flag || flagFromCode(code);
    const currency = currencyForCountry(code);

    if (pickerTargetIndex === -1) {
      // Check for duplicate before adding
      const alreadyExists = draft.countryPricing.some(
        (e) => e.countryCode.toUpperCase() === code,
      );
      if (alreadyExists) {
        Alert.alert(
          "Duplicate country",
          `${flag} ${name} (${code}) is already in the pricing list.`,
        );
        return;
      }
      setDraft((d) => ({
        ...d,
        countryPricing: [
          ...d.countryPricing,
          { countryCode: code, countryName: name, flag, currency, amount: "", enabled: true },
        ],
      }));
    }
  };

  const removeCountry = (index: number) => {
    setDraft((d) => ({
      ...d,
      countryPricing: d.countryPricing.filter((_, i) => i !== index),
    }));
  };

  const updateCountryAmount = (index: number, value: string) => {
    setDraft((d) => {
      const next = [...d.countryPricing];
      next[index] = { ...next[index], amount: value };
      return { ...d, countryPricing: next };
    });
  };

  const updateCountryEnabled = (index: number, value: boolean) => {
    setDraft((d) => {
      const next = [...d.countryPricing];
      next[index] = { ...next[index], enabled: value };
      return { ...d, countryPricing: next };
    });
  };

  const updateCountryCurrency = (index: number, value: string) => {
    setDraft((d) => {
      const next = [...d.countryPricing];
      next[index] = { ...next[index], currency: value.toUpperCase().slice(0, 3) };
      return { ...d, countryPricing: next };
    });
  };

  // ─── Render helpers ───────────────────────────────────────────────────────

  const cardStyle = [
    styles.card,
    appShadows.card,
    {
      backgroundColor: colors.card,
      borderColor: alpha(colors.border, isDarkMode ? "72" : "AA"),
    },
  ];

  const renderSectionHeader = (title: string) => (
    <Text style={[styles.sectionHeader, { color: colors.mutedText }]}>
      {title.toUpperCase()}
    </Text>
  );

  const renderRow = (
    label: string,
    hint: string | undefined,
    control: React.ReactNode,
    last = false,
  ) => (
    <View
      style={[
        styles.row,
        { borderBottomColor: last ? "transparent" : alpha(colors.border, isDarkMode ? "55" : "A6") },
      ]}
    >
      <View style={styles.rowLabel}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{label}</Text>
        {hint ? <Text style={[styles.rowHint, { color: colors.mutedText }]}>{hint}</Text> : null}
      </View>
      <View style={styles.rowControl}>{control}</View>
    </View>
  );

  const renderNumInput = (value: number, onChange: (n: number) => void) => (
    <TextInput
      style={[
        styles.numInput,
        {
          color: colors.text,
          borderColor: alpha(colors.border, isDarkMode ? "88" : "CC"),
          backgroundColor: alpha(colors.background, "CC"),
        },
      ]}
      keyboardType="numeric"
      value={String(value)}
      onChangeText={(t) => {
        const n = Number(t);
        if (Number.isFinite(n)) onChange(n);
      }}
      selectTextOnFocus
    />
  );

  // ─── Loading / error states ───────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedText }]}>
            Loading Premium Feature Settings…
          </Text>
        </SafeAreaView>
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
          <View
            style={[
              styles.header,
              {
                backgroundColor: colors.background,
                borderBottomColor: alpha(colors.border, isDarkMode ? "55" : "96"),
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.82}
              style={[
                styles.headerButton,
                {
                  backgroundColor: alpha(colors.card, isDarkMode ? "D8" : "F2"),
                  borderColor: alpha(colors.border, isDarkMode ? "72" : "B6"),
                },
              ]}
              onPress={() => navigation.goBack()}
            >
              <Icon name="arrow-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Premium Settings</Text>
          </View>
          <View style={styles.centered}>
            <Icon name="lock-closed-outline" size={44} color={colors.mutedText} />
            <Text style={[styles.errorText, { color: colors.mutedText }]}>{errorMessage}</Text>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: colors.primary }]}
              onPress={loadSettings}
              activeOpacity={0.82}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────

  return (
    <View style={styles.screen}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>

        {/* Header */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: colors.background,
              borderBottomColor: alpha(colors.border, isDarkMode ? "55" : "96"),
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.82}
            style={[
              styles.headerButton,
              {
                backgroundColor: alpha(colors.card, isDarkMode ? "D8" : "F2"),
                borderColor: alpha(colors.border, isDarkMode ? "72" : "B6"),
              },
            ]}
            onPress={() => navigation.goBack()}
          >
            <Icon name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Premium Settings</Text>
            <Text style={[styles.headerSubtitle, { color: colors.mutedText }]}>
              Admin-only feature configuration
            </Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: APP_BOTTOM_DOCK_BASE_HEIGHT + Math.max(insets.bottom, 10) + 26,
          }}
        >

          {/* Feature Switch */}
          {renderSectionHeader("Feature Switch")}
          <View style={cardStyle}>
            {renderRow(
              "Premium Content",
              draft.premiumContentEnabled ? "Globally ON — creation enabled" : "Globally OFF — new premium content blocked",
              <Switch
                value={draft.premiumContentEnabled}
                onValueChange={(v) => setDraft((d) => ({ ...d, premiumContentEnabled: v }))}
                trackColor={{ false: colors.border, true: alpha(colors.primary, "66") }}
                thumbColor={draft.premiumContentEnabled ? colors.primary : colors.card}
              />,
              true,
            )}
          </View>
          {!draft.premiumContentEnabled && (
            <View style={[styles.warningBanner, { backgroundColor: alpha("#F59E0B", isDarkMode ? "22" : "18"), borderColor: alpha("#F59E0B", "44") }]}>
              <Icon name="warning-outline" size={16} color="#F59E0B" />
              <Text style={[styles.warningText, { color: isDarkMode ? "#FCD34D" : "#92400E" }]}>
                Premium content creation is currently disabled.
              </Text>
            </View>
          )}

          {/* Country-wise Pricing */}
          {renderSectionHeader("Country-wise Pricing")}
          <View style={cardStyle}>
            {draft.countryPricing.length === 0 ? (
              <View style={styles.emptyCountry}>
                <Text style={[styles.emptyCountryText, { color: colors.mutedText }]}>
                  No country pricing configured yet.
                </Text>
              </View>
            ) : (
              draft.countryPricing.map((entry, index) => (
                <View
                  key={entry._id || `${entry.countryCode}-${index}`}
                  style={[
                    styles.countryCard,
                    {
                      borderBottomColor: alpha(colors.border, isDarkMode ? "44" : "88"),
                      borderBottomWidth:
                        index < draft.countryPricing.length - 1
                          ? StyleSheet.hairlineWidth
                          : 0,
                    },
                  ]}
                >
                  {/* Country header row */}
                  <View style={styles.countryHeader}>
                    <Text style={styles.countryFlag}>{entry.flag}</Text>
                    <View style={styles.countryNameBlock}>
                      <Text style={[styles.countryName, { color: colors.text }]}>
                        {entry.countryName}
                      </Text>
                      <Text style={[styles.countryCode, { color: colors.mutedText }]}>
                        {entry.countryCode}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => removeCountry(index)}
                      activeOpacity={0.82}
                      style={[
                        styles.removeButton,
                        {
                          backgroundColor: alpha("#EF4444", isDarkMode ? "22" : "14"),
                        },
                      ]}
                    >
                      <Icon name="trash-outline" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>

                  {/* Currency + Amount row */}
                  <View style={styles.countryFields}>
                    <View style={styles.fieldBlock}>
                      <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>Currency</Text>
                      <TextInput
                        style={[
                          styles.currencyInput,
                          {
                            color: colors.text,
                            borderColor: alpha(colors.border, isDarkMode ? "77" : "BB"),
                            backgroundColor: alpha(colors.background, "CC"),
                          },
                        ]}
                        placeholder="XXX"
                        placeholderTextColor={colors.mutedText}
                        value={entry.currency}
                        onChangeText={(t) => updateCountryCurrency(index, t)}
                        maxLength={3}
                        autoCapitalize="characters"
                      />
                    </View>
                    <View style={[styles.fieldBlock, styles.fieldBlockFlex]}>
                      <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
                        Premium Price
                      </Text>
                      <TextInput
                        style={[
                          styles.amountInput,
                          {
                            color: colors.text,
                            borderColor: alpha(colors.border, isDarkMode ? "77" : "BB"),
                            backgroundColor: alpha(colors.background, "CC"),
                          },
                        ]}
                        placeholder="0.00"
                        placeholderTextColor={colors.mutedText}
                        value={String(entry.amount)}
                        onChangeText={(t) => updateCountryAmount(index, t)}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  {/* Enabled row */}
                  <View style={styles.enabledRow}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>Enabled</Text>
                    <Switch
                      value={entry.enabled}
                      onValueChange={(v) => updateCountryEnabled(index, v)}
                      trackColor={{ false: colors.border, true: alpha(colors.primary, "66") }}
                      thumbColor={entry.enabled ? colors.primary : colors.card}
                    />
                  </View>
                </View>
              ))
            )}

            <TouchableOpacity
              activeOpacity={0.82}
              onPress={openPickerForNew}
              style={[
                styles.addCountryButton,
                {
                  borderTopColor: alpha(colors.border, isDarkMode ? "44" : "88"),
                  borderTopWidth:
                    draft.countryPricing.length > 0 ? StyleSheet.hairlineWidth : 0,
                },
              ]}
            >
              <Icon name="add-circle-outline" size={18} color={colors.primary} />
              <Text style={[styles.addCountryText, { color: colors.primary }]}>
                Add Country
              </Text>
            </TouchableOpacity>
          </View>

          {/* Pricing Bounds */}
          {renderSectionHeader("Global Pricing Bounds (INR)")}
          <View style={cardStyle}>
            {renderRow(
              "Minimum Price",
              "Lowest price a creator can set (₹)",
              renderNumInput(draft.minPriceINR, (v) =>
                setDraft((d) => ({ ...d, minPriceINR: v })),
              ),
            )}
            {renderRow(
              "Maximum Price",
              "Highest price a creator can set (₹)",
              renderNumInput(draft.maxPriceINR, (v) =>
                setDraft((d) => ({ ...d, maxPriceINR: v })),
              ),
              true,
            )}
          </View>

          {/* Monetization */}
          {renderSectionHeader("Monetization")}
          <View style={cardStyle}>
            {renderRow(
              "Default Tier",
              "Applied when creators don't specify",
              <View style={styles.tierRow}>
                {(["one_time", "subscription"] as const).map((tier) => (
                  <TouchableOpacity
                    key={tier}
                    activeOpacity={0.82}
                    onPress={() => setDraft((d) => ({ ...d, defaultTier: tier }))}
                    style={[
                      styles.tierButton,
                      {
                        backgroundColor:
                          draft.defaultTier === tier
                            ? colors.primary
                            : alpha(colors.border, isDarkMode ? "44" : "88"),
                        borderColor:
                          draft.defaultTier === tier
                            ? colors.primary
                            : alpha(colors.border, isDarkMode ? "66" : "CC"),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tierButtonText,
                        { color: draft.defaultTier === tier ? "#fff" : colors.text },
                      ]}
                    >
                      {tier === "one_time" ? "One-time" : "Subscription"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>,
            )}
            {renderRow(
              "Platform Fee",
              "Revenue share on each purchase (0–100%)",
              renderNumInput(draft.platformFeePercent, (v) =>
                setDraft((d) => ({ ...d, platformFeePercent: v })),
              ),
              true,
            )}
          </View>

          {/* Media Security */}
          {renderSectionHeader("Media Security")}
          <View style={cardStyle}>
            {renderRow(
              "Signed URL TTL",
              "Seconds (0 = server default: 300 s)",
              renderNumInput(draft.signedUrlTtlSeconds, (v) =>
                setDraft((d) => ({ ...d, signedUrlTtlSeconds: v })),
              ),
              true,
            )}
          </View>

          {lastUpdatedAt ? (
            <Text style={[styles.lastUpdated, { color: colors.mutedText }]}>
              Last updated: {new Date(lastUpdatedAt).toLocaleString()}
            </Text>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.82}
            disabled={saving}
            onPress={saveSettings}
            style={[
              styles.saveButton,
              { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 },
            ]}
          >
            {saving ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={[styles.saveButtonText, { marginLeft: 8 }]}>Saving…</Text>
              </>
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>

        </ScrollView>

        {/* Country picker modal — renders outside the ScrollView to avoid clipping */}
        <CountryPicker
          show={showCountryPicker}
          lang="en"
          pickerButtonOnPress={onCountrySelected}
          onBackdropPress={() => setShowCountryPicker(false)}
          onRequestClose={() => setShowCountryPicker(false)}
          inputPlaceholder="Search country…"
          searchMessage="No country found"
          style={{
            modal: {
              height: "70%",
              backgroundColor: colors.card,
            },
            textInput: {
              color: colors.text,
              backgroundColor: alpha(colors.background, "EE"),
              borderRadius: 10,
              borderColor: alpha(colors.border, "88"),
              borderWidth: 1,
            },
            countryButtonStyles: {
              backgroundColor: "transparent",
            },
            flag: { fontSize: 22 },
            countryName: { color: colors.text, fontSize: 15 },
            dialCode: { color: colors.mutedText, fontSize: 13 },
          }}
        />

        <AppBottomDock navigation={navigation} />
      </SafeAreaView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  loadingText: {
    marginTop: 14,
    fontSize: 14,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerCopy: { flex: 1 },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    fontFamily: appFonts.bold,
    letterSpacing: -0.3,
  },
  headerSubtitle: { fontSize: 13, marginTop: 1 },

  sectionHeader: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 6,
    marginLeft: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { flex: 1, marginRight: 12 },
  rowTitle: { fontSize: 15, fontWeight: "500" },
  rowHint: { fontSize: 12, marginTop: 2 },
  rowControl: { alignItems: "flex-end" },

  numInput: {
    width: 90,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 15,
    textAlign: "right",
  },

  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  warningText: {
    fontSize: 13,
    flex: 1,
    fontWeight: "500",
  },

  // Country card
  countryCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  countryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  countryFlag: {
    fontSize: 28,
    marginRight: 10,
  },
  countryNameBlock: { flex: 1 },
  countryName: {
    fontSize: 15,
    fontWeight: "600",
  },
  countryCode: {
    fontSize: 12,
    marginTop: 1,
  },
  removeButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  countryFields: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  fieldBlock: {},
  fieldBlockFlex: { flex: 1 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  currencyInput: {
    width: 72,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    fontSize: 14,
    textAlign: "center",
    textTransform: "uppercase",
  },
  amountInput: {
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 15,
    textAlign: "right",
  },

  enabledRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  emptyCountry: { padding: 20, alignItems: "center" },
  emptyCountryText: { fontSize: 14 },

  addCountryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
  },
  addCountryText: { fontSize: 14, fontWeight: "600" },

  tierRow: { flexDirection: "row", gap: 8 },
  tierButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  tierButtonText: { fontSize: 13, fontWeight: "600" },

  lastUpdated: { fontSize: 12, textAlign: "center", marginTop: 16 },
  saveButton: {
    marginTop: 24,
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  errorText: {
    fontSize: 15,
    textAlign: "center",
    marginTop: 16,
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});

export default PremiumSettingsScreen;
