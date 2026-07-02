import React, { useCallback, useMemo, useState } from "react";
import Clipboard from "@react-native-clipboard/clipboard";
import { TextInput as RNTextInput } from "react-native";
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { Alert } from "../utils/appAlert";
import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { openRazorpayCheckout } from "../utils/razorpayCheckout";
import { formatCurrencyAmount } from "../utils/servicePricing";
import { useAppTheme } from "../theme/AppThemeContext";

type WalletTxn = {
  _id: string;
  amount?: number;
  type?: string;
  source?: string;
  note?: string;
};

type DepositEntry = {
  _id: string;
  amount?: number;
  status?: string;
};

type LedgerRequest = {
  _id: string;
  status?: string;
  pricing?: {
    amount?: number;
    currency?: string;
  };
  service?: {
    serviceName?: string;
  };
  user?: {
    name?: string;
    username?: string;
  };
  seller?: {
    sellerName?: string;
  };
};

const TOP_UP_PRESETS = ["200", "500", "1000", "2000"];

const formatCoinAmount = (value: number): string => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) {
    return "0 coins";
  }

  return `${amount.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })} coins`;
};

function WalletScreen({ navigation }: any) {
  const { colors, isDarkMode } = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [addingMoney, setAddingMoney] = useState(false);
  const [applyingCode, setApplyingCode] = useState(false);
  const [savingBankAccount, setSavingBankAccount] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [walletData, setWalletData] = useState<any>(null);
  const [bankAccount, setBankAccount] = useState<any>(null);
  const [recentRequests, setRecentRequests] = useState<LedgerRequest[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<WalletTxn[]>([]);
  const [recentDeposits, setRecentDeposits] = useState<DepositEntry[]>([]);
  const [referralCode, setReferralCode] = useState("");
  const [referredByCode, setReferredByCode] = useState("");
  const [applyCode, setApplyCode] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("500");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [bankName, setBankName] = useState("");

  const accent = colors.primary;
  const bg = isDarkMode ? "#070B14" : "#F4F1FF";
  const panel = isDarkMode ? "#0F1728" : "#FFFFFF";
  const panelAlt = isDarkMode ? "#151F35" : "#F8F5FF";
  const border = isDarkMode ? "rgba(255,255,255,0.08)" : "#E9E2FF";
  const textSecondary = isDarkMode ? "#A7B4D1" : "#6B7280";
  const white = "#FFFFFF";
  const isSellerAccount = false;

  const screenTitle = useMemo(() => "User Dashboard", []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [summaryRes, requestsRes, walletRes] = await Promise.all([
        API.get("/service-requests/summary", { params: { role: "user" } }).catch(() => ({ data: null })),
        API.get("/service-requests", { params: { role: "user" } }).catch(() => ({ data: null })),
        API.get("/wallet").catch(() => ({ data: null })),
      ]);

      setSummary(summaryRes.data?.summary || null);
      setRecentRequests((requestsRes.data?.requests || []).slice(0, 8));
      setWalletData(walletRes.data?.wallet || null);
      const nextBankAccount = walletRes.data?.bankAccount || null;
      setBankAccount(nextBankAccount);
      setBankAccountName(nextBankAccount?.accountName || "");
      setBankIfsc(nextBankAccount?.ifsc || "");
      setBankName(nextBankAccount?.bankName || "");
      setBankAccountNumber("");
      setReferralCode(walletRes.data?.referralCode || "");
      setReferredByCode(walletRes.data?.referredByCode || "");
      setRecentTransactions(walletRes.data?.recentTransactions || []);
      setRecentDeposits(walletRes.data?.recentDeposits || []);
    } catch (error) {
      console.log("wallet screen error:", error);
      Alert.alert("Error", "Failed to load wallet details.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const addMoneyToWallet = useCallback(async () => {
    try {
      const amount = Number(topUpAmount || 0);
      if (!Number.isFinite(amount) || amount < 10) {
        Alert.alert("Top-up amount", "Minimum wallet top-up is INR 10.");
        return;
      }

      setAddingMoney(true);
      const orderRes = await API.post("/wallet/deposit/order", { amount });
      const depositId = String(orderRes.data?.deposit?._id || "");
      const payment = orderRes.data?.payment;

      if (!depositId || !payment) {
        throw new Error("Wallet payment could not be prepared.");
      }

      const checkoutResult = await openRazorpayCheckout(payment);
      const verifyRes = await API.post(`/wallet/deposit/${depositId}/verify`, checkoutResult);

      setWalletData((prev: any) => ({
        ...(prev || {}),
        balance: Number(verifyRes.data?.walletBalance || 0),
        currency: prev?.currency || "INR",
      }));

      Alert.alert("Wallet updated", `INR ${amount} added successfully.`);
      loadData().catch(() => undefined);
    } catch (error: any) {
      if (error?.code === 0) {
        Alert.alert("Payment cancelled", "Wallet top-up was not completed.");
      } else if (error?.response?.status === 404) {
        Alert.alert("Wallet payment unavailable", "Wallet payment service is not reachable right now. Restart the backend and try again.");
      } else {
        Alert.alert(
          "Wallet top-up failed",
          getReadableApiErrorMessage(error, "Wallet top-up could not be completed."),
        );
      }
    } finally {
      setAddingMoney(false);
    }
  }, [loadData, topUpAmount]);

  const applyReferralCode = useCallback(async () => {
    try {
      if (!applyCode.trim()) {
        return;
      }

      setApplyingCode(true);
      const res = await API.post("/wallet/apply-referral", {
        referralCode: applyCode.trim(),
      });

      if (res.data?.success) {
        setReferredByCode(applyCode.trim().toUpperCase());
        setApplyCode("");
        Alert.alert("Success", "Referral code applied.");
      }
    } catch (error: any) {
      Alert.alert("Error", error?.response?.data?.message || "Invalid referral code");
    } finally {
      setApplyingCode(false);
    }
  }, [applyCode]);

  const saveBankAccount = useCallback(async () => {
    try {
      const accountName = bankAccountName.trim();
      const accountNumber = bankAccountNumber.replace(/\s+/g, "").trim();
      const ifsc = bankIfsc.trim().toUpperCase();
      const nextBankName = bankName.trim();

      if (!accountName || !accountNumber || !ifsc || !nextBankName) {
        Alert.alert("Bank account", "Fill account holder name, account number, IFSC, and bank name.");
        return;
      }

      setSavingBankAccount(true);
      const res = await API.put("/wallet/bank-account", {
        accountName,
        accountNumber,
        ifsc,
        bankName: nextBankName,
      });

      setBankAccount(res.data?.bankAccount || null);
      setBankAccountNumber("");
      Alert.alert("Bank account saved", "Your bank account details have been saved.");
    } catch (error: any) {
      Alert.alert("Bank account", getReadableApiErrorMessage(error, "Bank account could not be saved."));
    } finally {
      setSavingBankAccount(false);
    }
  }, [bankAccountName, bankAccountNumber, bankIfsc, bankName]);

  const cardStyle = useMemo(
    () => [
      styles.card,
      {
        backgroundColor: panel,
        borderColor: border,
      },
    ],
    [border, panel],
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: bg }]} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="light-content" backgroundColor={bg} />

      <View style={[styles.hero, { backgroundColor: isDarkMode ? "#0B1020" : "#7B4DFF" }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={[styles.headerIconButton, { backgroundColor: "rgba(255,255,255,0.12)" }]} onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={20} color={white} />
          </TouchableOpacity>
          <Text style={styles.title}>{screenTitle}</Text>
          <View style={styles.headerIconButton} />
        </View>

        <View style={[styles.balanceHero, { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.12)" }]}>
          <View style={styles.balanceTopRow}>
            <View>
              <Text style={styles.balanceLabel}>Available coins</Text>
              {loading ? (
                <ActivityIndicator color={white} style={{ marginTop: 10 }} />
              ) : (
                <Text style={styles.balanceValue}>
                  {formatCoinAmount(walletData?.balance || 0)}
                </Text>
              )}
            </View>
            <View style={[styles.heroIconOrb, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
              <Icon name="wallet-outline" size={24} color={white} />
            </View>
          </View>

          <View style={styles.balanceBadgeRow}>
            <View style={styles.balanceBadge}>
              <Icon name="flash-outline" size={14} color={white} />
              <Text style={styles.balanceBadgeText}>
                Recharge coins securely and keep your balance ready for bookings
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.statRow}>
          {[
            {
              icon: "bag-handle-outline",
              label: "Bookings",
              value: String(summary?.total || 0),
            },
            {
              icon: "checkmark-circle-outline",
              label: "Confirmed",
              value: String((summary?.confirmed || 0) + (summary?.rescheduled || 0)),
            },
            {
              icon: "card-outline",
              label: "Coins",
              value: formatCoinAmount(walletData?.balance || 0),
            },
          ].map((item) => (
            <View key={item.label} style={[styles.statCard, { backgroundColor: panelAlt, borderColor: border }]}>
              <View style={[styles.statIconWrap, { backgroundColor: `${accent}18` }]}>
                <Icon name={item.icon} size={16} color={accent} />
              </View>
              <Text style={[styles.statLabel, { color: textSecondary }]}>{item.label}</Text>
              <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={2}>
                {item.value}
              </Text>
            </View>
          ))}
        </View>

        <View style={cardStyle}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionIconWrap, { backgroundColor: `${accent}16` }]}>
              <Icon name="add-circle-outline" size={18} color={accent} />
            </View>
            <View style={styles.sectionHeaderCopy}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Recharge Coins</Text>
              <Text style={[styles.cardText, { color: textSecondary }]}>Top up your dashboard balance and use coins across bookings and paid actions.</Text>
            </View>
          </View>

          <View style={styles.presetRow}>
            {TOP_UP_PRESETS.map((preset) => {
              const active = topUpAmount === preset;
              return (
                <TouchableOpacity
                  key={preset}
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor: active ? accent : panelAlt,
                      borderColor: active ? accent : border,
                    },
                  ]}
                  onPress={() => setTopUpAmount(preset)}
                >
                  <Text style={[styles.presetChipText, { color: active ? white : colors.text }]}>INR {preset}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.amountField, { backgroundColor: panelAlt, borderColor: border }]}>
            <Icon name="logo-usd" size={18} color={accent} />
            <RNTextInput
              style={[styles.amountInput, { color: colors.text }]}
              placeholder="Enter amount"
              placeholderTextColor={textSecondary}
              value={topUpAmount}
              onChangeText={setTopUpAmount}
              keyboardType="numeric"
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: accent }, addingMoney && styles.buttonDisabled]}
            onPress={addMoneyToWallet}
            disabled={addingMoney}
          >
            {addingMoney ? <ActivityIndicator color={white} /> : (
              <>
                <Icon name="flash-outline" size={18} color={white} />
                <Text style={styles.primaryButtonText}>Recharge coins</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={cardStyle}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionIconWrap, { backgroundColor: `${accent}16` }]}>
              <Icon name="business-outline" size={18} color={accent} />
            </View>
            <View style={styles.sectionHeaderCopy}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Bank Account</Text>
              <Text style={[styles.cardText, { color: textSecondary }]}>Add your payout bank account for withdrawals and settlement support.</Text>
            </View>
          </View>

          {bankAccount?.hasBankAccount ? (
            <View style={[styles.bankSavedCard, { backgroundColor: panelAlt, borderColor: border }]}>
              <Icon name="checkmark-circle-outline" size={18} color="#22C55E" />
              <View style={styles.bankSavedCopy}>
                <Text style={[styles.bankSavedTitle, { color: colors.text }]}>{bankAccount.bankName || "Bank account"}</Text>
                <Text style={[styles.bankSavedMeta, { color: textSecondary }]}>
                  {bankAccount.accountNumber || "Account saved"} {bankAccount.ifsc ? `- ${bankAccount.ifsc}` : ""}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={[styles.bankField, { backgroundColor: panelAlt, borderColor: border }]}>
            <Icon name="person-outline" size={18} color={accent} />
            <RNTextInput
              style={[styles.bankInput, { color: colors.text }]}
              placeholder="Account holder name"
              placeholderTextColor={textSecondary}
              value={bankAccountName}
              onChangeText={setBankAccountName}
              autoCapitalize="words"
            />
          </View>
          <View style={[styles.bankField, { backgroundColor: panelAlt, borderColor: border }]}>
            <Icon name="keypad-outline" size={18} color={accent} />
            <RNTextInput
              style={[styles.bankInput, { color: colors.text }]}
              placeholder={bankAccount?.accountNumber ? "Enter new account number to update" : "Account number"}
              placeholderTextColor={textSecondary}
              value={bankAccountNumber}
              onChangeText={setBankAccountNumber}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.bankTwoColumnRow}>
            <View style={[styles.bankField, styles.bankHalfField, { backgroundColor: panelAlt, borderColor: border }]}>
              <Icon name="barcode-outline" size={18} color={accent} />
              <RNTextInput
                style={[styles.bankInput, { color: colors.text }]}
                placeholder="IFSC"
                placeholderTextColor={textSecondary}
                value={bankIfsc}
                onChangeText={(value) => setBankIfsc(value.toUpperCase())}
                autoCapitalize="characters"
              />
            </View>
            <View style={[styles.bankField, styles.bankHalfField, { backgroundColor: panelAlt, borderColor: border }]}>
              <Icon name="business-outline" size={18} color={accent} />
              <RNTextInput
                style={[styles.bankInput, { color: colors.text }]}
                placeholder="Bank name"
                placeholderTextColor={textSecondary}
                value={bankName}
                onChangeText={setBankName}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: accent }, savingBankAccount && styles.buttonDisabled]}
            onPress={saveBankAccount}
            disabled={savingBankAccount}
          >
            {savingBankAccount ? <ActivityIndicator color={white} /> : (
              <>
                <Icon name="save-outline" size={18} color={white} />
                <Text style={styles.primaryButtonText}>Save bank account</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={cardStyle}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionIconWrap, { backgroundColor: `${accent}16` }]}>
              <Icon name="calendar-outline" size={18} color={accent} />
            </View>
            <View style={styles.sectionHeaderCopy}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Appointments</Text>
              <Text style={[styles.cardText, { color: textSecondary }]}>Find sellers, manage pending payments, and use your coins on upcoming bookings.</Text>
            </View>
          </View>

          <View style={styles.quickActionRow}>
            <TouchableOpacity style={[styles.quickActionCard, { backgroundColor: panelAlt, borderColor: border }]} onPress={() => navigation.navigate("Search")}>
              <Icon name="search-outline" size={18} color={accent} />
              <Text style={[styles.quickActionText, { color: colors.text }]}>Find Sellers</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.quickActionCard, { backgroundColor: panelAlt, borderColor: border }]} onPress={() => navigation.navigate("ServiceRequestsScreen", { mode: "user" })}>
              <Icon name="receipt-outline" size={18} color={accent} />
              <Text style={[styles.quickActionText, { color: colors.text }]}>My Bookings</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={cardStyle}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionIconWrap, { backgroundColor: `${accent}16` }]}>
              <Icon name="gift-outline" size={18} color={accent} />
            </View>
            <View style={styles.sectionHeaderCopy}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Referral Wallet</Text>
              <Text style={[styles.cardText, { color: textSecondary }]}>Apply referral codes and keep your bonus coins in one place.</Text>
            </View>
          </View>

          {!!referralCode && (
            <View style={[styles.referralCodeCard, { backgroundColor: panelAlt, borderColor: border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.referralLabel, { color: textSecondary }]}>Your referral code</Text>
                <Text style={[styles.referralCode, { color: colors.text }]}>{referralCode}</Text>
              </View>
              <TouchableOpacity style={[styles.copyButton, { backgroundColor: accent }]} onPress={() => {
                Clipboard.setString(referralCode);
                Alert.alert("Copied", "Referral code copied to clipboard.");
              }}>
                <Icon name="copy-outline" size={16} color={white} />
              </TouchableOpacity>
            </View>
          )}

          {referredByCode ? (
            <View style={[styles.appliedRow, { backgroundColor: panelAlt, borderColor: border }]}>
              <Icon name="checkmark-circle-outline" size={18} color="#22C55E" />
              <Text style={styles.appliedCodeText}>Applied code: {referredByCode}</Text>
            </View>
          ) : (
            <View style={styles.applyRow}>
              <View style={[styles.referralField, { backgroundColor: panelAlt, borderColor: border }]}>
                <Icon name="ticket-outline" size={18} color={accent} />
                <RNTextInput
                  style={[styles.referralInput, { color: colors.text }]}
                  placeholder="Enter referral code"
                  placeholderTextColor={textSecondary}
                  value={applyCode}
                  onChangeText={setApplyCode}
                  autoCapitalize="characters"
                />
              </View>
              <TouchableOpacity
                style={[styles.applyButton, { backgroundColor: accent }, applyingCode && styles.buttonDisabled]}
                onPress={applyReferralCode}
                disabled={applyingCode || !applyCode.trim()}
              >
                <Text style={styles.applyButtonText}>{applyingCode ? "..." : "Apply"}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={cardStyle}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionIconWrap, { backgroundColor: `${accent}16` }]}>
              <Icon name="swap-horizontal-outline" size={18} color={accent} />
            </View>
            <View style={styles.sectionHeaderCopy}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Recent Wallet Activity</Text>
              <Text style={[styles.cardText, { color: textSecondary }]}>Top-ups, referral credits, and balance movement.</Text>
            </View>
          </View>
          {recentTransactions.length ? recentTransactions.map((entry) => (
            <View key={entry._id} style={[styles.listRow, { borderBottomColor: border }]}>
              <View style={[styles.listIconWrap, { backgroundColor: panelAlt }]}>
                <Icon name={entry.type === "debit" ? "arrow-down-outline" : "arrow-up-outline"} size={16} color={entry.type === "debit" ? "#F97316" : "#22C55E"} />
              </View>
              <View style={styles.listCopy}>
                <Text style={[styles.listTitle, { color: colors.text }]}>{entry.note || entry.source || "Wallet activity"}</Text>
                <Text style={[styles.listMeta, { color: textSecondary }]}>{String(entry.type || "credit").toUpperCase()}</Text>
              </View>
              <Text style={[styles.listAmount, { color: entry.type === "debit" ? "#F97316" : "#22C55E" }]}>
                {entry.type === "debit" ? "-" : "+"}{formatCurrencyAmount(entry.amount || 0, walletData?.currency || "INR")}
              </Text>
            </View>
          )) : <Text style={[styles.emptyText, { color: textSecondary }]}>Wallet credits, referrals, and top-ups will appear here.</Text>}
        </View>

        <View style={cardStyle}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionIconWrap, { backgroundColor: `${accent}16` }]}>
              <Icon name="card-outline" size={18} color={accent} />
            </View>
            <View style={styles.sectionHeaderCopy}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Recent Recharges</Text>
              <Text style={[styles.cardText, { color: textSecondary }]}>Successful and pending Razorpay dashboard top-ups.</Text>
            </View>
          </View>
          {recentDeposits.length ? recentDeposits.map((entry) => (
            <View key={entry._id} style={[styles.listRow, { borderBottomColor: border }]}>
              <View style={[styles.listIconWrap, { backgroundColor: panelAlt }]}>
                <Icon name="card-outline" size={16} color={accent} />
              </View>
              <View style={styles.listCopy}>
                <Text style={[styles.listTitle, { color: colors.text }]}>Wallet recharge</Text>
                <Text style={[styles.listMeta, { color: textSecondary }]}>{String(entry.status || "pending").replace(/_/g, " ")}</Text>
              </View>
              <Text style={[styles.listAmount, { color: colors.text }]}>{formatCurrencyAmount(entry.amount || 0, "INR")}</Text>
            </View>
          )) : <Text style={[styles.emptyText, { color: textSecondary }]}>Your successful and pending recharges will show here.</Text>}
        </View>

        <View style={[cardStyle, { marginBottom: 28 }]}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionIconWrap, { backgroundColor: `${accent}16` }]}>
              <Icon name="calendar-clear-outline" size={18} color={accent} />
            </View>
            <View style={styles.sectionHeaderCopy}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Recent Appointments</Text>
              <Text style={[styles.cardText, { color: textSecondary }]}>Latest booking activity and payment status.</Text>
            </View>
          </View>
          {recentRequests.length ? recentRequests.map((request) => (
            <View key={request._id} style={[styles.listRow, { borderBottomColor: border }]}>
              <View style={[styles.listIconWrap, { backgroundColor: panelAlt }]}>
                <Icon name="calendar-outline" size={16} color={accent} />
              </View>
              <View style={styles.listCopy}>
                <Text style={[styles.listTitle, { color: colors.text }]}>{request.service?.serviceName || "Appointment"}</Text>
                <Text style={[styles.listMeta, { color: textSecondary }]}>
                  {isSellerAccount
                    ? request.user?.name || request.user?.username || "Customer"
                    : request.seller?.sellerName || "Seller"}{" "}
                  • {String(request.status || "").replace(/_/g, " ")}
                </Text>
              </View>
              <Text style={[styles.listAmount, { color: colors.text }]}>
                {formatCurrencyAmount(request.pricing?.amount || 0, request.pricing?.currency || "INR")}
              </Text>
            </View>
          )) : <Text style={[styles.emptyText, { color: textSecondary }]}>Appointments and booking payments will appear here.</Text>}
        </View>
      </View>
    </ScrollView>
  );
}

export default WalletScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: {
    paddingTop: 50,
    paddingHorizontal: 18,
    paddingBottom: 22,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },
  balanceHero: {
    marginTop: 18,
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  balanceTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  heroIconOrb: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  balanceLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
  },
  balanceValue: {
    marginTop: 8,
    color: "#fff",
    fontSize: 30,
    fontWeight: "900",
  },
  balanceBadgeRow: {
    marginTop: 14,
    flexDirection: "row",
  },
  balanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  balanceBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 6,
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 16,
  },
  statRow: {
    flexDirection: "row",
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginHorizontal: 4,
  },
  statIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statLabel: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "700",
  },
  statValue: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: "800",
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  sectionHeaderCopy: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  cardText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  presetChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginRight: 8,
    marginBottom: 8,
  },
  presetChipText: {
    fontWeight: "700",
    fontSize: 12,
  },
  amountField: {
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 50,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  amountInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    fontWeight: "700",
  },
  bankSavedCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  bankSavedCopy: {
    flex: 1,
    marginLeft: 10,
  },
  bankSavedTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  bankSavedMeta: {
    marginTop: 3,
    fontSize: 12.5,
    fontWeight: "700",
  },
  bankField: {
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 50,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  bankInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    fontWeight: "700",
  },
  bankTwoColumnRow: {
    flexDirection: "row",
    marginHorizontal: -4,
  },
  bankHalfField: {
    flex: 1,
    marginHorizontal: 4,
  },
  primaryButton: {
    marginTop: 14,
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    marginLeft: 8,
  },
  quickActionRow: {
    flexDirection: "row",
  },
  quickActionCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    minHeight: 88,
    padding: 14,
    marginRight: 8,
    justifyContent: "space-between",
  },
  quickActionText: {
    marginTop: 16,
    fontWeight: "700",
    fontSize: 14,
  },
  metricRow: {
    flexDirection: "row",
  },
  metricBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginRight: 8,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  metricValue: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "800",
  },
  referralCodeCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  referralLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  referralCode: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 1,
  },
  copyButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  appliedRow: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  appliedCodeText: {
    marginLeft: 8,
    color: "#22C55E",
    fontWeight: "700",
  },
  applyRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  referralField: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 48,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
  },
  referralInput: {
    flex: 1,
    marginLeft: 10,
    fontWeight: "700",
  },
  applyButton: {
    borderRadius: 14,
    paddingHorizontal: 16,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  applyButtonText: {
    color: "#fff",
    fontWeight: "800",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  listIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  listCopy: {
    flex: 1,
    paddingRight: 12,
  },
  listTitle: {
    fontWeight: "700",
    fontSize: 14,
  },
  listMeta: {
    marginTop: 3,
    fontSize: 12.5,
    textTransform: "capitalize",
  },
  listAmount: {
    fontWeight: "800",
    fontSize: 13,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
