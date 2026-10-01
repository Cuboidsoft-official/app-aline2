import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { alpha, appFonts, appShadows } from "../theme/designSystem";
import { useAppTheme } from "../theme/AppThemeContext";
import { currencyForCountry, currencySymbol, countryFlag, countryNameForCode } from "../utils/countryCurrency";

// ─── Types ────────────────────────────────────────────────────────────────────

type GlobalBounds = {
  premiumContentEnabled: boolean;
  minPriceINR: number;
  maxPriceINR: number;
};

type SelectedCountry = {
  code: string;
  name: string;
  flag: string;
  currency: string;
  currencySymbol: string;
};

// ─── Guide Content ────────────────────────────────────────────────────────────

const GUIDE_ITEMS = [
  "This is our premium post model where you can upload stories and posts only for your subscribers.",
  "You can use this feature by turning on your premium post model above.",
  "You can upload premium posts just by selecting premium post while uploading stories and posts.",
  "It will appear on your profile page inside the premium logo.",
];

// ─── Terms Content ────────────────────────────────────────────────────────────

const TERMS_SECTIONS: Array<{ heading: string; body: string }> = [
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

// ─── Component ────────────────────────────────────────────────────────────────

const CreatorSubscriptionSetupScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { colors, isDarkMode } = useAppTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [globalBounds, setGlobalBounds] = useState<GlobalBounds>({
    premiumContentEnabled: false,
    minPriceINR: 1,
    maxPriceINR: 9999,
  });

  const [premiumEnabled, setPremiumEnabled] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<SelectedCountry | null>(null);
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const amountRef = useRef<TextInput>(null);

  // ─── Load ──────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
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
          premiumContentEnabled: pub.premiumContentEnabled ?? false,
          minPriceINR: pub.minPriceINR ?? 1,
          maxPriceINR: pub.maxPriceINR ?? 9999,
        });
      }

      const mine = mineRes?.data?.settings;
      if (mine) {
        setPremiumEnabled(mine.premiumContentEnabled ?? false);
        const firstEntry = (mine.countryPricing || [])[0];
        if (firstEntry) {
          const code = String(firstEntry.countryCode || "").toUpperCase();
          const currency = String(firstEntry.currency || currencyForCountry(code)).toUpperCase();
          setSelectedCountry({
            code,
            name: countryNameForCode(code),
            flag: countryFlag(code),
            currency,
            currencySymbol: currencySymbol(currency),
          });
          setAmount(String(firstEntry.amount ?? ""));
        }
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const msg =
        status === 401
          ? "Session expired. Please log in again."
          : err?.response?.data?.message || "Failed to load settings.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Amount validation ─────────────────────────────────────────────────────

  const validateAmount = (value: string): string => {
    if (!value.trim()) return "Please enter a subscription amount.";
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "Amount must be a positive number.";
    if (n < globalBounds.minPriceINR) {
      return `Minimum allowed amount is ${globalBounds.minPriceINR}.`;
    }
    if (n > globalBounds.maxPriceINR) {
      return `Maximum allowed amount is ${globalBounds.maxPriceINR}.`;
    }
    return "";
  };

  const onAmountChange = (value: string) => {
    setAmount(value);
    if (amountError) setAmountError(validateAmount(value));
  };

  const onAmountBlur = () => {
    setAmountError(validateAmount(amount));
  };

  // ─── Country selection ─────────────────────────────────────────────────────

  const onCountrySelected = (item: CountryItem) => {
    setShowCountryPicker(false);
    const code = item.code.toUpperCase();
    const currency = currencyForCountry(code) || "USD";
    setSelectedCountry({
      code,
      name: item.name?.en || countryNameForCode(code),
      flag: item.flag || countryFlag(code),
      currency,
      currencySymbol: currencySymbol(currency),
    });
    setAmount("");
    setAmountError("");
  };

  // ─── Can submit ────────────────────────────────────────────────────────────

  const canSubmit =
    termsAccepted &&
    !!selectedCountry &&
    !validateAmount(amount) &&
    !saving;

  // ─── Save ──────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!canSubmit) return;
    Keyboard.dismiss();

    const amountErr = validateAmount(amount);
    if (amountErr) {
      setAmountError(amountErr);
      return;
    }
    if (!selectedCountry) {
      Alert.alert("Missing", "Please select your country/currency.");
      return;
    }
    if (!termsAccepted) {
      Alert.alert("Terms required", "Please accept the terms to continue.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        premiumContentEnabled: premiumEnabled,
        countryPricing: [
          {
            countryCode: selectedCountry.code,
            currency: selectedCountry.currency,
            amount: Number(amount),
            enabled: true,
          },
        ],
      };
      await API.put("/premium-settings/mine", payload);
      Alert.alert(
        "Saved",
        "Your premium subscription settings have been saved.",
        [{ text: "OK", onPress: () => navigation.goBack() }],
      );
    } catch (err: any) {
      const status = err?.response?.status;
      const msg =
        status === 400
          ? err?.response?.data?.message || "Validation failed."
          : status === 401
          ? "Session expired. Please log in again."
          : err?.response?.data?.message || "Failed to save settings.";
      Alert.alert("Save failed", msg);
    } finally {
      setSaving(false);
    }
  };

  // ─── Shared style helpers ──────────────────────────────────────────────────

  const cardStyle = [
    styles.card,
    appShadows.card,
    {
      backgroundColor: colors.card,
      borderColor: alpha(colors.border, isDarkMode ? "72" : "AA"),
    },
  ];

  const sectionHeader = (title: string, actionLabel?: string, onAction?: () => void) => (
    <View style={styles.sectionHeaderRow}>
      <Text style={[styles.sectionHeaderText, { color: colors.mutedText }]}>
        {title.toUpperCase()}
      </Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7}>
          <Text style={[styles.sectionHeaderAction, { color: colors.primary }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  // ─── Loading / error ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedText }]}>
            Loading…
          </Text>
        </SafeAreaView>
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { borderBottomColor: alpha(colors.border, "88") }]}>
            <TouchableOpacity
              activeOpacity={0.82}
              style={[styles.headerButton, { backgroundColor: alpha(colors.card, "F0"), borderColor: alpha(colors.border, "B0") }]}
              onPress={() => navigation.goBack()}
            >
              <Icon name="arrow-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Premium Subscription</Text>
          </View>
          <View style={styles.centered}>
            <Icon name="lock-closed-outline" size={44} color={colors.mutedText} />
            <Text style={[styles.errorText, { color: colors.mutedText }]}>{errorMessage}</Text>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: colors.primary }]}
              onPress={loadData}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ─── Main render ───────────────────────────────────────────────────────────

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
            <Text style={[styles.headerTitle, { color: colors.text }]}>Premium Subscription</Text>
            <Text style={[styles.headerSubtitle, { color: colors.mutedText }]}>
              Set up your creator subscription
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
            accessibilityLabel="Open guide"
          >
            <Icon name="information-circle-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom, 10) + 100 },
            ]}
          >

            {/* Premium toggle */}
            {sectionHeader("Premium Post Model")}
            <View style={cardStyle}>
              <View style={[styles.row, { borderBottomColor: "transparent" }]}>
                <View style={styles.rowLabel}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>Enable Premium Posts</Text>
                  <Text style={[styles.rowHint, { color: colors.mutedText }]}>
                    Allow subscribers to access exclusive content
                  </Text>
                </View>
                <Switch
                  value={premiumEnabled}
                  onValueChange={setPremiumEnabled}
                  trackColor={{ false: colors.border, true: alpha(colors.primary, "66") }}
                  thumbColor={premiumEnabled ? colors.primary : colors.card}
                />
              </View>
            </View>

            {/* ── Section 1: Select Your Currency ── */}
            {sectionHeader("1. Select Your Currency")}
            <View style={cardStyle}>
              <TouchableOpacity
                activeOpacity={0.82}
                style={styles.countrySelector}
                onPress={() => setShowCountryPicker(true)}
                accessibilityRole="button"
                accessibilityLabel={
                  selectedCountry
                    ? `Selected country: ${selectedCountry.name}`
                    : "Select country and currency"
                }
              >
                {selectedCountry ? (
                  <View style={styles.countrySelected}>
                    <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
                    <View style={styles.countryInfo}>
                      <Text style={[styles.countryName, { color: colors.text }]}>
                        {selectedCountry.name}
                      </Text>
                      <Text style={[styles.countryCurrency, { color: colors.mutedText }]}>
                        {selectedCountry.currency} · {selectedCountry.currencySymbol}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.countryPlaceholder}>
                    <Icon
                      name="globe-outline"
                      size={22}
                      color={colors.mutedText}
                      style={{ marginRight: 10 }}
                    />
                    <Text style={[styles.countrySelectorPlaceholder, { color: colors.mutedText }]}>
                      Tap to select country & currency
                    </Text>
                  </View>
                )}
                <Icon name="chevron-forward" size={18} color={colors.mutedText} />
              </TouchableOpacity>
              {!selectedCountry && (
                <Text style={[styles.selectorHint, { color: colors.mutedText }]}>
                  Select the country in which you'll receive subscription payments.
                </Text>
              )}
            </View>

            {/* ── Section 2: Setup Your Subscription Amount ── */}
            {sectionHeader("2. Setup Your Subscription Amount")}
            <View style={cardStyle}>
              <View style={styles.amountWrapper}>
                <View style={styles.amountRow}>
                  {selectedCountry ? (
                    <View
                      style={[
                        styles.currencyBadge,
                        {
                          backgroundColor: alpha(colors.primary, "18"),
                          borderColor: alpha(colors.primary, "44"),
                        },
                      ]}
                    >
                      <Text style={[styles.currencyBadgeText, { color: colors.primary }]}>
                        {selectedCountry.currencySymbol}
                      </Text>
                    </View>
                  ) : null}
                  <TextInput
                    ref={amountRef}
                    style={[
                      styles.amountInput,
                      {
                        color: colors.text,
                        borderColor: amountError
                          ? "#EF4444"
                          : alpha(colors.border, isDarkMode ? "88" : "CC"),
                        backgroundColor: alpha(colors.background, "CC"),
                        flex: 1,
                      },
                    ]}
                    placeholder="0"
                    placeholderTextColor={colors.mutedText}
                    keyboardType="numeric"
                    returnKeyType="done"
                    value={amount}
                    onChangeText={onAmountChange}
                    onBlur={onAmountBlur}
                    editable={!!selectedCountry}
                  />
                </View>
                {!!selectedCountry && (
                  <Text style={[styles.amountHint, { color: colors.mutedText }]}>
                    Monthly subscription · min {globalBounds.minPriceINR} – max{" "}
                    {globalBounds.maxPriceINR} {selectedCountry.currency}
                  </Text>
                )}
                {!selectedCountry && (
                  <Text style={[styles.amountHint, { color: colors.mutedText }]}>
                    Select a country first to enter your subscription amount.
                  </Text>
                )}
                {!!amountError && (
                  <Text style={styles.amountError}>{amountError}</Text>
                )}
              </View>
            </View>

            {/* ── Section 3: Terms and Conditions ── */}
            {sectionHeader("3. Creator Subscription Terms")}
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

            {/* ── Section 4: Consent + Accept and Continue ── */}
            {sectionHeader("4. Accept and Continue")}
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
                      backgroundColor: termsAccepted
                        ? colors.primary
                        : "transparent",
                    },
                  ]}
                >
                  {termsAccepted && (
                    <Icon name="checkmark" size={14} color="#fff" />
                  )}
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

          </ScrollView>

          {/* Accept and Continue button — pinned to bottom */}
          <View
            style={[
              styles.bottomBar,
              {
                backgroundColor: colors.background,
                borderTopColor: alpha(colors.border, isDarkMode ? "55" : "96"),
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={canSubmit ? 0.82 : 1}
              disabled={!canSubmit}
              onPress={handleSubmit}
              style={[
                styles.submitButton,
                {
                  backgroundColor: canSubmit ? colors.primary : alpha(colors.primary, "55"),
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit }}
              accessibilityLabel="Accept and Continue"
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Accept and Continue</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

      </SafeAreaView>

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
  flex: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: { marginTop: 14, fontSize: 14 },

  // Header
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
  headerSubtitle: { fontSize: 12, marginTop: 1 },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 6,
    marginLeft: 4,
  },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
  sectionHeaderAction: {
    fontSize: 12,
    fontWeight: "600",
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

  // Country selector
  countrySelector: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: "space-between",
  },
  countrySelected: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  countryFlag: { fontSize: 28, marginRight: 12 },
  countryInfo: { flex: 1 },
  countryName: { fontSize: 15, fontWeight: "600" },
  countryCurrency: { fontSize: 12, marginTop: 2 },
  countryPlaceholder: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  countrySelectorPlaceholder: { fontSize: 15 },
  selectorHint: {
    fontSize: 12,
    paddingHorizontal: 14,
    paddingBottom: 12,
    marginTop: -4,
  },

  // Amount
  amountWrapper: {
    padding: 14,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  currencyBadge: {
    height: 46,
    width: 46,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  currencyBadgeText: {
    fontSize: 20,
    fontWeight: "700",
  },
  amountInput: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 20,
    fontWeight: "600",
    textAlign: "right",
  },
  amountHint: {
    fontSize: 12,
    marginTop: 8,
  },
  amountError: {
    fontSize: 12,
    color: "#EF4444",
    marginTop: 6,
    fontWeight: "500",
  },

  // Terms
  termsCard: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  termsSection: {
    marginBottom: 14,
  },
  termsHeading: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 3,
  },
  termsBody: {
    fontSize: 13,
    lineHeight: 19,
  },

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
  consentText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },

  // Bottom bar
  bottomBar: {
    padding: 14,
    borderTopWidth: 1,
  },
  submitButton: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  // Error state
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
  retryText: { color: "#fff", fontWeight: "600", fontSize: 15 },

  // Guide
  guideBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
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
  guideTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
  },
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
  guideNumberText: {
    fontSize: 13,
    fontWeight: "700",
  },
  guideItemText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});

export default CreatorSubscriptionSetupScreen;
