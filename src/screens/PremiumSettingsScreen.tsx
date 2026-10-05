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
  countryCode: string;
  countryName: string;
  flag: string;
  currency: string;
  amount: string;
  enabled: boolean;
};

type PremiumSettingsShape = {
  premiumContentEnabled: boolean;
  countryPricing: CountryPricingEntry[];
};

type GlobalBounds = {
  minPriceINR: number;
  maxPriceINR: number;
};

const DEFAULT_SETTINGS: PremiumSettingsShape = {
  premiumContentEnabled: false,
  countryPricing: [],
};

const DEFAULT_BOUNDS: GlobalBounds = { minPriceINR: 1, maxPriceINR: 9999 };

// ─── Guide items ──────────────────────────────────────────────────────────────

const GUIDE_ITEMS = [
  "This is our premium post model where you can upload stories and posts only for your subscribers.",
  "You can use this feature by turning on your premium post model above.",
  "You can upload premium posts just by selecting premium post while uploading stories and posts.",
  "It will appear on your profile page inside the premium logo.",
];

// ─── Terms ────────────────────────────────────────────────────────────────────

const TERMS_SECTIONS: { heading: string; body: string }[] = [
  {
    heading: "Eligibility",
    body: "You must be 18+ (or the age of majority in your country), have a compliant account, and comply with the Community Guidelines.",
  },
  {
    heading: "Subscription Content",
    body: "You are responsible for the content you post for subscribers. It must be original or properly licensed and must not violate any law or policy.",
  },
  {
    heading: "Pricing",
    body: "You set your own monthly price within the allowed range. Price changes apply to new subscribers immediately and to existing subscribers only after prior notice (e.g., at their next billing cycle).",
  },
  {
    heading: "Fees",
    body: "The Platform and app store/payment processor fees are deducted from each payment. You receive the remaining amount as earnings.",
  },
  {
    heading: "Payouts",
    body: "Earnings are paid to your linked account once the minimum payout threshold is reached. Payouts may be delayed for verification, disputes, or refunds.",
  },
  {
    heading: "Taxes",
    body: "You are responsible for all applicable taxes in your country. The Platform may collect tax details and withhold taxes where required by law.",
  },
  {
    heading: "Cancellations",
    body: "Subscribers may cancel anytime. Access continues until the end of the paid period, and no further charges are made after cancellation.",
  },
  {
    heading: "Refunds and Chargebacks",
    body: "Refunds follow the app store/payment provider policies. If a payment is refunded or charged back, the related earnings may be deducted from your balance.",
  },
  {
    heading: "Content Delivery",
    body: "You must provide subscriber-only content as promised. Failure to do so may lead to refunds, suspension, or removal of the feature.",
  },
  {
    heading: "Prohibited Activities",
    body: "Fraud, fake subscribers, misleading offers, and off-platform payment redirection are prohibited.",
  },
  {
    heading: "Data and Privacy",
    body: "Subscriber data may be used only to provide the service, under the Privacy Policy. You must not misuse or share subscriber information.",
  },
  {
    heading: "Suspension or Termination",
    body: "The Platform may suspend or terminate access to this feature for policy violations or legal reasons. Pending earnings may be withheld where permitted by law.",
  },
  {
    heading: "Changes to Terms",
    body: "The Platform may update these terms with notice. Continued use means you accept the updated terms.",
  },
  {
    heading: "Governing Law",
    body: "These terms are governed by the laws of the applicable jurisdiction.",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

const PremiumSettingsScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { colors, isDarkMode } = useAppTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [draft, setDraft] = useState<PremiumSettingsShape>(DEFAULT_SETTINGS);
  const [globalBounds, setGlobalBounds] = useState<GlobalBounds>(DEFAULT_BOUNDS);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [pickerTargetIndex, setPickerTargetIndex] = useState<number>(-1);
  const [showGuide, setShowGuide] = useState(false);

  // ─── Load ────────────────────────────────────────────────────────────────

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [publicRes, mineRes] = await Promise.all([
        API.get("/premium-settings"),
        API.get("/premium-settings/mine"),
      ]);

      const pub = publicRes?.data?.settings;
      if (pub) {
        setGlobalBounds({
          minPriceINR: pub.minPriceINR ?? 1,
          maxPriceINR: pub.maxPriceINR ?? 9999,
        });
      }

      const s = mineRes?.data?.settings;
      if (s) {
        setDraft({
          premiumContentEnabled: s.premiumContentEnabled ?? false,
          countryPricing: (s.countryPricing || []).map(serverEntryToLocal),
        });
        setLastUpdatedAt(s.updatedAt || null);
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const msg =
        status === 403
          ? "Access denied."
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
    const seenCodes = new Set<string>();
    for (let i = 0; i < draft.countryPricing.length; i++) {
      const entry = draft.countryPricing[i];
      const code = entry.countryCode.trim().toUpperCase();
      const currency = entry.currency.trim().toUpperCase();
      const amount = Number(entry.amount);

      if (!/^[A-Z]{2}$/.test(code)) {
        return `Country [${i + 1}]: invalid country code "${entry.countryCode}".`;
      }
      if (!/^[A-Z]{3}$/.test(currency)) {
        return `Country [${i + 1}] (${code}): invalid currency "${entry.currency}".`;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return `Country [${i + 1}] (${code}): amount must be a positive number.`;
      }
      if (amount < globalBounds.minPriceINR) {
        return `Country [${i + 1}] (${code}): amount must be at least ${globalBounds.minPriceINR}.`;
      }
      if (amount > globalBounds.maxPriceINR) {
        return `Country [${i + 1}] (${code}): amount cannot exceed ${globalBounds.maxPriceINR}.`;
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
    if (!termsAccepted) {
      Alert.alert("Terms required", "Please accept the Subscription Terms to continue.");
      return;
    }

    const validationError = validateDraft();
    if (validationError) {
      Alert.alert("Invalid input", validationError);
      return;
    }

    setSaving(true);
    try {
      // Only send creator-relevant fields — global admin fields (minPriceINR,
      // maxPriceINR, platformFeePercent, signedUrlTtlSeconds, defaultTier)
      // are never sent by the creator flow.
      const payload = {
        premiumContentEnabled: draft.premiumContentEnabled,
        countryPricing: draft.countryPricing.map((e) => ({
          countryCode: e.countryCode.trim().toUpperCase(),
          currency: e.currency.trim().toUpperCase(),
          amount: Number(e.amount),
          enabled: e.enabled,
        })),
      };
      const res = await API.put("/premium-settings/mine", payload);
      const updated = res?.data?.settings;
      if (updated) {
        setDraft({
          premiumContentEnabled: updated.premiumContentEnabled ?? false,
          countryPricing: (updated.countryPricing || []).map(serverEntryToLocal),
        });
        setLastUpdatedAt(updated.updatedAt || null);
      }
      Alert.alert("Saved", "Premium subscription settings updated successfully.");
    } catch (err: any) {
      const status = err?.response?.status;
      const msg =
        status === 403
          ? "Access denied."
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
    const currency = currencyForCountry(code) || "USD";

    if (pickerTargetIndex === -1) {
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

  // ─── Shared style helpers ─────────────────────────────────────────────────

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

  // ─── Loading / error ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedText }]}>
            Loading Premium Settings…
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

  const canSubmit = termsAccepted && !saving;

  // ─── Main render ──────────────────────────────────────────────────────────

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
              Creator subscription setup
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.82}
            style={[
              styles.headerButton,
              {
                backgroundColor: alpha(colors.card, isDarkMode ? "D8" : "F2"),
                borderColor: alpha(colors.border, isDarkMode ? "72" : "B6"),
              },
            ]}
            onPress={() => setShowGuide(true)}
            accessibilityRole="button"
            accessibilityLabel="Open premium post guide"
          >
            <Icon name="information-circle-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
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
          {renderSectionHeader("Premium Post Model")}
          <View style={cardStyle}>
            {renderRow(
              "Enable Premium Posts",
              draft.premiumContentEnabled
                ? "Premium content creation is ON"
                : "Premium content creation is OFF",
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
            <View
              style={[
                styles.warningBanner,
                {
                  backgroundColor: alpha("#F59E0B", isDarkMode ? "22" : "18"),
                  borderColor: alpha("#F59E0B", "44"),
                },
              ]}
            >
              <Icon name="warning-outline" size={16} color="#F59E0B" />
              <Text style={[styles.warningText, { color: isDarkMode ? "#FCD34D" : "#92400E" }]}>
                Premium content creation is currently disabled.
              </Text>
            </View>
          )}

          {/* 1. Select Your Currency */}
          {renderSectionHeader("1. Select Your Currency")}
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
                        { backgroundColor: alpha("#EF4444", isDarkMode ? "22" : "14") },
                      ]}
                    >
                      <Icon name="trash-outline" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>

                  {/* Amount setup */}
                  <Text style={[styles.subSectionLabel, { color: colors.mutedText }]}>
                    Setup your monthly subscription amount
                  </Text>
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
                        Monthly Amount
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
                        placeholder={`${globalBounds.minPriceINR}–${globalBounds.maxPriceINR}`}
                        placeholderTextColor={colors.mutedText}
                        value={String(entry.amount)}
                        onChangeText={(t) => updateCountryAmount(index, t)}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                  <Text style={[styles.boundsHint, { color: colors.mutedText }]}>
                    Allowed range: {globalBounds.minPriceINR}–{globalBounds.maxPriceINR} / month
                  </Text>

                  {/* Enabled */}
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

          {/* 3. Terms and Conditions */}
          {renderSectionHeader("3. Creator Subscription Terms")}
          <View style={[cardStyle, styles.termsCard]}>
            {TERMS_SECTIONS.map((section) => (
              <View key={section.heading} style={styles.termsSection}>
                <Text style={[styles.termsHeading, { color: colors.text }]}>
                  {section.heading}
                </Text>
                <Text style={[styles.termsBody, { color: colors.mutedText }]}>
                  {section.body}
                </Text>
              </View>
            ))}
          </View>

          {/* 4. Consent */}
          {renderSectionHeader("4. Accept and Continue")}
          <View style={cardStyle}>
            <TouchableOpacity
              activeOpacity={0.82}
              style={styles.consentRow}
              onPress={() => setTermsAccepted((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: termsAccepted }}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: termsAccepted
                      ? colors.primary
                      : alpha(colors.border, isDarkMode ? "88" : "CC"),
                    backgroundColor: termsAccepted ? colors.primary : "transparent",
                  },
                ]}
              >
                {termsAccepted && <Icon name="checkmark" size={14} color="#fff" />}
              </View>
              <Text style={[styles.consentText, { color: colors.mutedText }]}>
                By tapping Accept and Continue, you agree to the{" "}
                <Text style={{ color: colors.primary }}>Subscription Terms</Text>
                {", "}
                <Text style={{ color: colors.primary }}>Monetization Policy</Text>
                {", and "}
                <Text style={{ color: colors.primary }}>Privacy Policy</Text>
                {"."}
              </Text>
            </TouchableOpacity>
          </View>

          {lastUpdatedAt ? (
            <Text style={[styles.lastUpdated, { color: colors.mutedText }]}>
              Last updated: {new Date(lastUpdatedAt).toLocaleString()}
            </Text>
          ) : null}

          {/* Accept and Continue button */}
          <TouchableOpacity
            activeOpacity={canSubmit ? 0.82 : 1}
            disabled={!canSubmit}
            onPress={saveSettings}
            style={[
              styles.saveButton,
              {
                backgroundColor: canSubmit ? colors.primary : alpha(colors.primary, "55"),
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit }}
            accessibilityLabel="Accept and Continue"
          >
            {saving ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={[styles.saveButtonText, { marginLeft: 8 }]}>Saving…</Text>
              </>
            ) : (
              <Text style={styles.saveButtonText}>Accept and Continue</Text>
            )}
          </TouchableOpacity>

        </ScrollView>

        {/* Country picker */}
        <CountryPicker
          show={showCountryPicker}
          lang="en"
          pickerButtonOnPress={onCountrySelected}
          onBackdropPress={() => setShowCountryPicker(false)}
          onRequestClose={() => setShowCountryPicker(false)}
          inputPlaceholder="Search country…"
          searchMessage="No country found"
          style={{
            modal: { height: "70%", backgroundColor: colors.card },
            textInput: {
              color: colors.text,
              backgroundColor: alpha(colors.background, "EE"),
              borderRadius: 10,
              borderColor: alpha(colors.border, "88"),
              borderWidth: 1,
            },
            countryButtonStyles: { backgroundColor: "transparent" },
            flag: { fontSize: 22 },
            countryName: { color: colors.text, fontSize: 15 },
            dialCode: { color: colors.mutedText, fontSize: 13 },
          }}
        />

        <AppBottomDock navigation={navigation} />
      </SafeAreaView>

      {/* Guide modal */}
      <Modal
        visible={showGuide}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGuide(false)}
      >
        <TouchableOpacity
          style={styles.guideBackdrop}
          activeOpacity={1}
          onPress={() => setShowGuide(false)}
        />
        <View
          style={[
            styles.guideSheet,
            {
              backgroundColor: colors.card,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={styles.guideHandle} />
          <View style={styles.guideHeader}>
            <Icon name="diamond" size={22} color={colors.primary} />
            <Text style={[styles.guideTitle, { color: colors.text }]}>
              Premium Post Guide
            </Text>
            <TouchableOpacity onPress={() => setShowGuide(false)} activeOpacity={0.7}>
              <Icon name="close" size={22} color={colors.mutedText} />
            </TouchableOpacity>
          </View>
          {GUIDE_ITEMS.map((item, i) => (
            <View key={i} style={styles.guideItem}>
              <View style={[styles.guideNumber, { backgroundColor: alpha(colors.primary, "20") }]}>
                <Text style={[styles.guideNumberText, { color: colors.primary }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.guideItemText, { color: colors.text }]}>{item}</Text>
            </View>
          ))}
        </View>
      </Modal>
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
  loadingText: { marginTop: 14, fontSize: 14 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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

  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  warningText: { fontSize: 13, flex: 1, fontWeight: "500" },

  // Country cards
  countryCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  countryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  countryFlag: { fontSize: 28, marginRight: 10 },
  countryNameBlock: { flex: 1 },
  countryName: { fontSize: 15, fontWeight: "600" },
  countryCode: { fontSize: 12, marginTop: 1 },
  removeButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  subSectionLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  countryFields: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 6,
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
  boundsHint: {
    fontSize: 11,
    marginBottom: 10,
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

  // Terms
  termsCard: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  termsSection: { marginBottom: 14 },
  termsHeading: { fontSize: 13, fontWeight: "700", marginBottom: 3 },
  termsBody: { fontSize: 13, lineHeight: 19 },

  // Consent
  consentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  consentText: { flex: 1, fontSize: 13, lineHeight: 19 },

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
  retryButton: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  retryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },

  // Guide
  guideBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  guideSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  guideHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(128,128,128,0.35)",
    alignSelf: "center",
    marginBottom: 16,
  },
  guideHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  guideTitle: { flex: 1, fontSize: 17, fontWeight: "700" },
  guideItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  guideNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  guideNumberText: { fontSize: 13, fontWeight: "700" },
  guideItemText: { flex: 1, fontSize: 14, lineHeight: 20 },
});

export default PremiumSettingsScreen;
