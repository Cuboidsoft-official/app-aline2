import React, { useCallback, useState } from "react";
import Clipboard from "@react-native-clipboard/clipboard";
import { TextInput as RNTextInput } from "react-native";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator
} from "react-native";
import { Alert } from "../utils/appAlert";

import Icon from "react-native-vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { API } from "../api/api";
import { monetizationDisabledMessage, productFlags } from "../config/productFlags";
import { formatCurrencyAmount, formatSummaryAmount } from "../utils/servicePricing";

type LedgerRequest = {
    _id: string;
    status?: string;
    createdAt?: string;
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
};

function WalletScreen({ navigation }: any) {

    const [summary, setSummary] = useState<any>(null);
    const [recentRequests, setRecentRequests] = useState<LedgerRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [walletData, setWalletData] = useState<any>(null);
    const [referralCode, setReferralCode] = useState<string>("");
    const [applyCode, setApplyCode] = useState("");
    const [applyingCode, setApplyingCode] = useState(false);

    useFocusEffect(
        useCallback(() => {
            let active = true;

            const loadSummary = async () => {
                try {
                    setLoading(true);
                    const [summaryRes, requestsRes, walletRes] = await Promise.all([
                        API.get("/service-requests/summary", {
                            params: { role: "seller" }
                        }),
                        API.get("/service-requests", {
                            params: { role: "seller" }
                        }),
                        API.get("/wallet").catch(() => ({ data: null })),
                    ]);

                    if (active) {
                        setSummary(summaryRes.data?.summary || null);
                        setRecentRequests((requestsRes.data?.requests || []).slice(0, 8));
                        if (walletRes.data?.wallet) {
                            setWalletData(walletRes.data.wallet);
                        }
                        if (walletRes.data?.referralCode) {
                            setReferralCode(walletRes.data.referralCode);
                        }
                    }
                } catch (error) {
                    console.log("wallet summary error:", error);
                    if (active) {
                        Alert.alert("Error", "Failed to load seller earnings");
                    }
                } finally {
                    if (active) {
                        setLoading(false);
                    }
                }
            };

            loadSummary();

            return () => {
                active = false;
            };
        }, [])
    );

    if (!productFlags.sellerMonetizationInConsumerApp) {
        return (
            <ScrollView style={styles.container} contentContainerStyle={styles.readOnlyContainer} showsVerticalScrollIndicator={false}>
                <StatusBar barStyle="light-content" backgroundColor="#ab2aeb" />

                <View style={styles.header}>
                    <View style={styles.headerRow}>
                        <TouchableOpacity onPress={() => navigation.goBack()}>
                            <Icon name="arrow-back" size={24} color="#fff" />
                        </TouchableOpacity>

                        <Text style={styles.title}>Business Tools</Text>

                        <View style={{ width: 24 }} />
                    </View>
                </View>

                <View style={styles.readOnlyCard}>
                    <Icon name="lock-closed-outline" size={26} color="#ab2aeb" />
                    <Text style={styles.readOnlyTitle}>Payments are not handled in this app</Text>
                    <Text style={styles.readOnlyText}>{monetizationDisabledMessage}</Text>
                </View>
            </ScrollView>
        );
    }

    return (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
            <StatusBar barStyle="light-content" backgroundColor="#ab2aeb" />

            {/* HEADER */}
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={() => navigation.goBack()}>
                        <Icon name="arrow-back" size={24} color="#fff" />
                    </TouchableOpacity>

                    <Text style={styles.title}>Seller Earnings</Text>

                    <View style={{ width: 24 }} />
                </View>

                {/* BALANCE */}
                <View style={styles.balanceBox}>
                    <Text style={styles.balanceLabel}>Awaiting Settlement</Text>
                    {loading ? (
                        <ActivityIndicator color="#fff" style={{ marginVertical: 8 }} />
                    ) : (
                        <Text style={styles.balance}>
                            {formatSummaryAmount(
                                {
                                    settlementPendingAmount: summary?.settlementPendingAmount,
                                    settlementPendingAmountByCurrency: summary?.settlementPendingAmountByCurrency,
                                    settlementPendingDisplayCurrency: summary?.settlementPendingDisplayCurrency,
                                    displayCurrency: summary?.displayCurrency
                                },
                                "settlementPending"
                            )}
                        </Text>
                    )}

                    <View style={styles.addMoneyBtn}>
                        <Icon name="checkmark-circle-outline" size={18} color="#fff" />
                        <Text style={styles.addMoneyText}>Manual settlement workflow</Text>
                    </View>
                </View>
            </View>

            <View style={styles.summaryStrip}>
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Paid</Text>
                    <Text style={styles.summaryValue}>{summary?.paid || 0}</Text>
                </View>
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Confirmed</Text>
                    <Text style={styles.summaryValue}>{summary?.confirmed || summary?.accepted || 0}</Text>
                </View>
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Completed</Text>
                    <Text style={styles.summaryValue}>{summary?.completed || 0}</Text>
                </View>
            </View>

            <Text style={styles.sectionTitle}>Settlement status</Text>
            <View style={styles.infoBox}>
                <Text style={styles.infoText}>Customer payments are captured during booking checkout and tracked against each appointment.</Text>
                <Text style={[styles.infoText, styles.infoTextSecondary]}>Seller payouts are still reviewed and settled manually for this launch, so this screen shows earnings and settlement exposure instead of fake withdrawal controls.</Text>
            </View>

            <View style={styles.summaryStrip}>
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Gross Paid</Text>
                    <Text style={styles.summaryValue}>{formatSummaryAmount(summary, "paid")}</Text>
                </View>
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Completed</Text>
                    <Text style={styles.summaryValue}>{formatSummaryAmount(summary, "completed")}</Text>
                </View>
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Refund Review</Text>
                    <Text style={styles.summaryValue}>{summary?.refund_needed || 0}</Text>
                </View>
            </View>

            {/* REFERRAL CODE CARD */}
            {!!referralCode && (
                <View style={styles.referralCard}>
                    <View style={styles.referralLeft}>
                        <Icon name="gift-outline" size={22} color="#7B4DFF" />
                        <View style={{ marginLeft: 10, flex: 1 }}>
                            <Text style={styles.referralLabel}>Your Referral Code</Text>
                            <Text style={styles.referralCodeText}>{referralCode}</Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        style={styles.copyBtn}
                        onPress={() => {
                            Clipboard.setString(referralCode);
                            Alert.alert("Copied!", "Referral code copied to clipboard");
                        }}
                    >
                        <Icon name="copy-outline" size={18} color="#fff" />
                        <Text style={styles.copyBtnText}>Copy</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* WALLET BALANCE CARD */}
            {walletData && (
                <View style={styles.walletBalanceCard}>
                    <Text style={styles.walletBalanceLabel}>Wallet Balance</Text>
                    <Text style={styles.walletBalanceAmount}>
                        {formatCurrencyAmount(walletData.balance || 0, walletData.currency || "INR")}
                    </Text>
                    <View style={styles.walletRow}>
                        <View style={styles.walletStat}>
                            <Text style={styles.walletStatLabel}>Total Earned</Text>
                            <Text style={styles.walletStatValue}>
                                {formatCurrencyAmount(walletData.totalEarned || 0, walletData.currency || "INR")}
                            </Text>
                        </View>
                        <View style={styles.walletStat}>
                            <Text style={styles.walletStatLabel}>Withdrawn</Text>
                            <Text style={styles.walletStatValue}>
                                {formatCurrencyAmount(walletData.totalWithdrawn || 0, walletData.currency || "INR")}
                            </Text>
                        </View>
                        <View style={styles.walletStat}>
                            <Text style={styles.walletStatLabel}>Referral</Text>
                            <Text style={styles.walletStatValue}>
                                {formatCurrencyAmount(walletData.referralEarnings || 0, walletData.currency || "INR")}
                            </Text>
                        </View>
                    </View>

                    {/* Withdrawal button */}
                    {walletData.withdrawalsEnabled && walletData.balance >= 100 && (
                        <TouchableOpacity
                            style={styles.withdrawBtn}
                            onPress={() => {
                                Alert.prompt(
                                    "Request Withdrawal",
                                    `Available: ${formatCurrencyAmount(walletData.balance, walletData.currency || "INR")}\nMinimum: ₹100`,
                                    async (value) => {
                                        if (!value) return;
                                        try {
                                            const res = await API.post("/wallet/withdraw", { amount: Number(value) });
                                            if (res.data?.success) {
                                                Alert.alert("Success", res.data.message);
                                                setWalletData((prev: any) => ({
                                                    ...prev,
                                                    balance: res.data.withdrawal.balanceAfter,
                                                    totalWithdrawn: (prev?.totalWithdrawn || 0) + Number(value),
                                                }));
                                            }
                                        } catch (err: any) {
                                            Alert.alert("Error", err?.response?.data?.message || "Withdrawal failed");
                                        }
                                    },
                                    "plain-text",
                                    "",
                                    "numeric"
                                );
                            }}
                        >
                            <Icon name="arrow-down-circle-outline" size={18} color="#fff" />
                            <Text style={styles.withdrawBtnText}>Request Withdrawal</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* APPLY REFERRAL CODE */}
            {!referralCode && (
                <View style={styles.referralCard}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.referralLabel}>Have a referral code?</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                            <RNTextInput
                                style={styles.referralInput}
                                placeholder="Enter code"
                                placeholderTextColor="#9CA3AF"
                                value={applyCode}
                                onChangeText={setApplyCode}
                                autoCapitalize="characters"
                            />
                            <TouchableOpacity
                                style={[styles.copyBtn, applyingCode && { opacity: 0.5 }]}
                                disabled={applyingCode || !applyCode.trim()}
                                onPress={async () => {
                                    try {
                                        setApplyingCode(true);
                                        const res = await API.post("/wallet/apply-referral", { referralCode: applyCode.trim() });
                                        if (res.data?.success) {
                                            Alert.alert("Success", "Referral code applied!");
                                            setApplyCode("");
                                        }
                                    } catch (err: any) {
                                        Alert.alert("Error", err?.response?.data?.message || "Invalid code");
                                    } finally {
                                        setApplyingCode(false);
                                    }
                                }}
                            >
                                <Text style={styles.copyBtnText}>{applyingCode ? "..." : "Apply"}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    <TouchableOpacity
                        style={[styles.copyBtn, { marginLeft: 8, backgroundColor: "#10B981" }]}
                        onPress={async () => {
                            try {
                                const res = await API.post("/wallet/referral-code");
                                if (res.data?.referralCode) {
                                    setReferralCode(res.data.referralCode);
                                    Alert.alert("Generated!", `Your code: ${res.data.referralCode}`);
                                }
                            } catch (err: any) {
                                Alert.alert("Error", err?.response?.data?.message || "Failed to generate");
                            }
                        }}
                    >
                        <Icon name="sparkles-outline" size={16} color="#fff" />
                        <Text style={styles.copyBtnText}>Get Code</Text>
                    </TouchableOpacity>
                </View>
            )}

            <Text style={styles.sectionTitle}>Recent transactions</Text>
            <View style={styles.infoBox}>
                {recentRequests.length ? (
                    recentRequests.map((request) => (
                        <View key={request._id} style={styles.transactionRow}>
                            <View style={styles.transactionMeta}>
                                <Text style={styles.transactionTitle}>{request.service?.serviceName || "Appointment"}</Text>
                                <Text style={styles.transactionSubtitle}>
                                    {request.user?.name || request.user?.username || "Customer"} • {String(request.status || "").replace(/_/g, " ")}
                                </Text>
                            </View>
                            <Text style={styles.transactionAmount}>
                                {formatCurrencyAmount(request.pricing?.amount || 0, request.pricing?.currency || "INR")}
                            </Text>
                        </View>
                    ))
                ) : (
                    <Text style={styles.infoText}>Paid and confirmed seller bookings will appear here as they move through completion and settlement review.</Text>
                )}
            </View>

        </ScrollView>
    );
}

export default WalletScreen;

const styles = StyleSheet.create({

    container: {
        flex: 1,
        backgroundColor: "#f8f5ff",
    },
    readOnlyContainer: {
        paddingBottom: 32,
    },

    /* HEADER */
    header: {
        backgroundColor: "#ab2aeb",
        paddingTop: 50,
        paddingBottom: 30,
        paddingHorizontal: 20,
        borderBottomLeftRadius: 25,
        borderBottomRightRadius: 25,
    },

    headerRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },

    title: {
        color: "#fff",
        fontSize: 20,
        fontWeight: "bold",
    },

    /* BALANCE BOX */
    balanceBox: {
        marginTop: 25,
        backgroundColor: "rgba(255,255,255,0.15)",
        padding: 20,
        borderRadius: 15,
        alignItems: "center",
    },

    balanceLabel: {
        color: "#eee",
        fontSize: 13,
    },

    balance: {
        fontSize: 30,
        fontWeight: "bold",
        color: "#fff",
        marginVertical: 8,
    },

    addMoneyBtn: {
        flexDirection: "row",
        backgroundColor: "#fff",
        paddingVertical: 8,
        paddingHorizontal: 18,
        borderRadius: 25,
        alignItems: "center",
    },

    addMoneyText: {
        color: "#ab2aeb",
        marginLeft: 5,
        fontWeight: "bold",
    },

    /* SECTION */
    sectionTitle: {
        marginLeft: 20,
        marginTop: 20,
        fontWeight: "bold",
        color: "#555",
        fontSize: 15,
    },
    summaryStrip: {
        flexDirection: "row",
        marginHorizontal: 15,
        marginTop: 18
    },
    summaryCard: {
        flex: 1,
        backgroundColor: "#fff",
        padding: 14,
        borderRadius: 14,
        marginHorizontal: 5,
        alignItems: "center"
    },
    summaryLabel: {
        color: "#666",
        fontSize: 12
    },
    summaryValue: {
        color: "#ab2aeb",
        fontWeight: "700",
        fontSize: 18,
        marginTop: 6
    },

    /* PAYMENT CARD */
    paymentCard: {
        backgroundColor: "#fff",
        marginHorizontal: 15,
        marginTop: 12,
        padding: 16,
        borderRadius: 14,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        elevation: 3,
    },

    left: {
        flexDirection: "row",
        alignItems: "center",
    },

    paymentIcon: {
        width: 35,
        height: 35,
        marginRight: 12,
    },

    paymentText: {
        fontSize: 16,
        fontWeight: "500",
    },

    infoBox: {
        backgroundColor: "#fff",
        marginHorizontal: 15,
        marginTop: 12,
        padding: 16,
        borderRadius: 14
    },
    infoText: {
        color: "#444",
        lineHeight: 20
    },
    infoTextSecondary: {
        marginTop: 8,
        color: "#777"
    },
    transactionRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#F1F1F4"
    },
    transactionMeta: {
        flex: 1,
        paddingRight: 12
    },
    transactionTitle: {
        color: "#1F2937",
        fontWeight: "700"
    },
    transactionSubtitle: {
        marginTop: 4,
        color: "#6B7280",
        textTransform: "capitalize"
    },
    transactionAmount: {
        color: "#7C3AED",
        fontWeight: "700"
    },
    readOnlyCard: {
        marginHorizontal: 20,
        marginTop: 24,
        padding: 20,
        borderRadius: 18,
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#E9D5FF"
    },
    readOnlyTitle: {
        marginTop: 12,
        color: "#111827",
        fontSize: 18,
        fontWeight: "bold"
    },
    readOnlyText: {
        marginTop: 8,
        color: "#4B5563",
        lineHeight: 21
    },

    // Referral Code Card
    referralCard: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#F5F3FF",
        marginHorizontal: 16,
        marginTop: 16,
        padding: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#E9D5FF",
    },
    referralLeft: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
    },
    referralLabel: {
        fontSize: 12,
        color: "#6B7280",
    },
    referralCodeText: {
        fontSize: 18,
        fontWeight: "800",
        color: "#7B4DFF",
        letterSpacing: 2,
        marginTop: 2,
    },
    copyBtn: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#7B4DFF",
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 10,
        gap: 4,
    },
    copyBtnText: {
        color: "#fff",
        fontWeight: "600",
        fontSize: 13,
    },

    // Wallet Balance Card
    walletBalanceCard: {
        backgroundColor: "#fff",
        marginHorizontal: 16,
        marginTop: 16,
        padding: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#E5E7EB",
    },
    walletBalanceLabel: {
        fontSize: 13,
        color: "#6B7280",
        fontWeight: "600",
    },
    walletBalanceAmount: {
        fontSize: 28,
        fontWeight: "800",
        color: "#111827",
        marginTop: 4,
    },
    walletRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 14,
        paddingTop: 14,
        borderTopWidth: 1,
        borderTopColor: "#F3F4F6",
    },
    walletStat: {
        alignItems: "center",
        flex: 1,
    },
    walletStatLabel: {
        fontSize: 11,
        color: "#9CA3AF",
        fontWeight: "600",
    },
    walletStatValue: {
        fontSize: 14,
        fontWeight: "700",
        color: "#374151",
        marginTop: 2,
    },

    // Withdrawal button
    withdrawBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#7B4DFF",
        marginTop: 14,
        paddingVertical: 12,
        borderRadius: 10,
        gap: 6,
    },
    withdrawBtnText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 14,
    },

    // Referral input
    referralInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#D1D5DB",
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 15,
        fontWeight: "600",
        color: "#111827",
        marginRight: 8,
        letterSpacing: 1,
    },
});
