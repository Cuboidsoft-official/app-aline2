import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";

import { API } from "../api/api";
import AppAvatar from "../components/AppAvatar";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { useAppTheme } from "../theme/AppThemeContext";
import { appFonts } from "../theme/designSystem";
import { Alert } from "../utils/appAlert";
import { getStoredUser } from "../utils/authSession";
import { normalizeMediaUrl } from "../utils/mediaUrls";
import { formatCurrencyAmount } from "../utils/servicePricing";

export type TimeframeFilter = "all_time" | "this_month" | "this_week";

export interface LeaderboardEntry {
  id: string;
  rank: number;
  name: string;
  username: string;
  avatarUrl: string;
  referralCount: number;
  earningsAmount: number;
  isCurrentUser?: boolean;
}

const LeaderboardScreen = ({ navigation }: any) => {
  const { colors, isDarkMode } = useAppTheme();
  const [timeframe, setTimeframe] = useState<TimeframeFilter>("all_time");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [currentUserStanding, setCurrentUserStanding] = useState<LeaderboardEntry | null>(null);

  const handleUserPress = useCallback((userId?: string) => {
    const cleanId = String(userId || "").trim();
    if (!cleanId) {
      return;
    }
    navigation.navigate("ProfileView", { userId: cleanId });
  }, [navigation]);

  const loadLeaderboardData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const storedUser = await getStoredUser().catch(() => null);
      const currentUserId = String(storedUser?._id || storedUser?.id || "").trim();
      const currentUsername = String(storedUser?.username || storedUser?.name || "You").trim().replace(/^@/, "");

      let apiEntries: any[] = [];
      try {
        const response = await API.get("/leaderboard/referrals", { params: { timeframe } });
        apiEntries = Array.isArray(response.data?.leaderboard) ? response.data.leaderboard : [];
      } catch (err1) {
        try {
          const response = await API.get("/auth/leaderboard/referrals", { params: { timeframe } });
          apiEntries = Array.isArray(response.data?.leaderboard) ? response.data.leaderboard : [];
        } catch (err2) {
          apiEntries = [];
        }
      }

      let formattedList: LeaderboardEntry[] = [];
      if (apiEntries.length > 0) {
        formattedList = apiEntries.map((item: any, idx: number) => ({
          id: String(item.id || item._id || `lead_${idx + 1}`),
          rank: idx + 1,
          name: String(item.name || item.username || `User ${idx + 1}`),
          username: String(item.username || item.name || "user").replace(/^@/, ""),
          avatarUrl: String(item.avatarUrl || item.profilePic || DEFAULT_AVATAR_URL),
          referralCount: Number(item.referralCount || item.referrals || 0),
          earningsAmount: Number(item.earningsAmount || item.earnings || item.totalEarned || 0),
          isCurrentUser: String(item.id || item._id || item.userId || "").trim() === currentUserId,
        }));

        formattedList.sort((a, b) => b.earningsAmount - a.earningsAmount);
        formattedList = formattedList.map((entry, index) => ({
          ...entry,
          rank: index + 1,
        }));
      } else {
        formattedList = [];
      }

      setLeaderboard(formattedList);

      const myStandingInList = formattedList.find((entry) => entry.isCurrentUser);
      if (myStandingInList) {
        setCurrentUserStanding(myStandingInList);
      } else if (currentUserId) {
        setCurrentUserStanding({
          id: currentUserId,
          rank: formattedList.length + 1,
          name: String(storedUser?.name || currentUsername || "You"),
          username: currentUsername || "you",
          avatarUrl: String(storedUser?.avatarUrl || storedUser?.profilePic || DEFAULT_AVATAR_URL),
          referralCount: 0,
          earningsAmount: 0,
          isCurrentUser: true,
        });
      } else {
        setCurrentUserStanding(null);
      }
    } catch (error) {
      console.log("Leaderboard fetch error:", error);
      setLeaderboard([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [timeframe]);

  useEffect(() => {
    loadLeaderboardData();
  }, [loadLeaderboardData]);

  const top3Podium = useMemo(() => {
    const rank1 = leaderboard.find((item) => item.rank === 1) || null;
    const rank2 = leaderboard.find((item) => item.rank === 2) || null;
    const rank3 = leaderboard.find((item) => item.rank === 3) || null;
    return { rank1, rank2, rank3 };
  }, [leaderboard]);

  const rank4PlusList = useMemo(() => {
    return leaderboard.filter((item) => item.rank > 3);
  }, [leaderboard]);

  const renderRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <View style={[styles.crownBadge, { backgroundColor: "#F59E0B" }]}>
          <Icon name="trophy" size={12} color="#FFF" />
        </View>
      );
    }
    if (rank === 2) {
      return (
        <View style={[styles.crownBadge, { backgroundColor: "#94A3B8" }]}>
          <Icon name="medal" size={12} color="#FFF" />
        </View>
      );
    }
    if (rank === 3) {
      return (
        <View style={[styles.crownBadge, { backgroundColor: "#D97706" }]}>
          <Icon name="ribbon" size={12} color="#FFF" />
        </View>
      );
    }
    return (
      <View style={[styles.standardRankBadge, { backgroundColor: isDarkMode ? "rgba(148,163,184,0.16)" : "#F1F5F9" }]}>
        <Text style={[styles.standardRankText, { color: colors.mutedText }]}>#{rank}</Text>
      </View>
    );
  };

  const renderLeaderboardItem = ({ item }: { item: LeaderboardEntry }) => {
    return (
      <TouchableOpacity
        activeOpacity={0.84}
        onPress={() => handleUserPress(item.id)}
        style={[
          styles.listItem,
          {
            backgroundColor: item.isCurrentUser
              ? isDarkMode
                ? "rgba(123, 63, 228, 0.22)"
                : "rgba(123, 63, 228, 0.08)"
              : colors.card,
            borderColor: item.isCurrentUser ? colors.primary : colors.border,
          },
        ]}
      >
        <View style={styles.listRankCol}>
          {renderRankBadge(item.rank)}
        </View>

        <TouchableOpacity onPress={() => handleUserPress(item.id)} activeOpacity={0.8}>
          <AppAvatar
            uri={normalizeMediaUrl(item.avatarUrl)}
            name={item.name || item.username}
            size={42}
            style={styles.listAvatar}
          />
        </TouchableOpacity>

        <View style={styles.listInfoCol}>
          <Text style={[styles.listName, { color: colors.text }]} numberOfLines={1}>
            {item.name} {item.isCurrentUser ? "(You)" : ""}
          </Text>
          <Text style={[styles.listUsername, { color: colors.mutedText }]} numberOfLines={1}>
            @{item.username} • {item.referralCount} referrals
          </Text>
        </View>

        <View style={styles.listEarningCol}>
          <Text style={[styles.listEarningAmount, { color: colors.primary }]}>
            {formatCurrencyAmount(item.earningsAmount)}
          </Text>
          <View style={styles.invitesChip}>
            <Icon name="people-outline" size={11} color={colors.mutedText} />
            <Text style={[styles.invitesChipText, { color: colors.mutedText }]}>
              {item.referralCount} invites
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIconCircle, { backgroundColor: isDarkMode ? "rgba(245, 158, 11, 0.16)" : "#FEF3C7" }]}>
        <Icon name="trophy-outline" size={48} color="#F59E0B" />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No Referral Data Available Yet</Text>
      <Text style={[styles.emptySubtitle, { color: colors.mutedText }]}>
        No users have earned referral rewards for this timeframe yet. Be the first to invite your friends and top the leaderboard!
      </Text>
      <TouchableOpacity
        activeOpacity={0.85}
        style={[styles.emptyActionBtn, { backgroundColor: colors.primary }]}
        onPress={() => navigation.navigate("HowToEarnScreen", { section: "howToEarn" })}
      >
        <Icon name="gift-outline" size={18} color="#FFF" style={{ marginRight: 6 }} />
        <Text style={styles.emptyActionBtnText}>Invite Friends & Earn</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Referral Leaderboard</Text>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => {
            Alert.alert(
              "Referral Earnings",
              "Top earners who invited friends to Aline2 and earned real referral rewards. Keep referring to climb the ranks!"
            );
          }}
          activeOpacity={0.8}
        >
          <Icon name="information-circle-outline" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Timeframe Filter Tabs */}
      <View style={[styles.tabContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity
          activeOpacity={0.84}
          onPress={() => setTimeframe("all_time")}
          style={[
            styles.tabButton,
            timeframe === "all_time" && [styles.activeTabButton, { backgroundColor: colors.primary }],
          ]}
        >
          <Text
            style={[
              styles.tabText,
              { color: timeframe === "all_time" ? "#FFF" : colors.mutedText },
            ]}
          >
            All Time
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.84}
          onPress={() => setTimeframe("this_month")}
          style={[
            styles.tabButton,
            timeframe === "this_month" && [styles.activeTabButton, { backgroundColor: colors.primary }],
          ]}
        >
          <Text
            style={[
              styles.tabText,
              { color: timeframe === "this_month" ? "#FFF" : colors.mutedText },
            ]}
          >
            This Month
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.84}
          onPress={() => setTimeframe("this_week")}
          style={[
            styles.tabButton,
            timeframe === "this_week" && [styles.activeTabButton, { backgroundColor: colors.primary }],
          ]}
        >
          <Text
            style={[
              styles.tabText,
              { color: timeframe === "this_week" ? "#FFF" : colors.mutedText },
            ]}
          >
            This Week
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedText }]}>Loading leaderboard...</Text>
        </View>
      ) : leaderboard.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={rank4PlusList}
          keyExtractor={(item) => item.id}
          renderItem={renderLeaderboardItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS === "android"}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={50}
          windowSize={5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadLeaderboardData(true)}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <View style={styles.podiumSection}>
              {/* Podium Top 3 Champions */}
              <View style={styles.podiumContainer}>
                {/* Rank 2 (Left) */}
                {top3Podium.rank2 ? (
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={() => handleUserPress(top3Podium.rank2?.id)}
                    style={[styles.podiumCard, styles.podiumCard2, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={styles.podiumAvatarWrap}>
                      <AppAvatar
                        uri={normalizeMediaUrl(top3Podium.rank2.avatarUrl)}
                        name={top3Podium.rank2.name}
                        size={52}
                      />
                      <View style={[styles.podiumRankBadge, { backgroundColor: "#94A3B8" }]}>
                        <Text style={styles.podiumRankText}>2</Text>
                      </View>
                    </View>
                    <Text style={[styles.podiumName, { color: colors.text }]} numberOfLines={1}>
                      {top3Podium.rank2.name}
                    </Text>
                    <Text style={[styles.podiumEarnings, { color: colors.primary }]}>
                      {formatCurrencyAmount(top3Podium.rank2.earningsAmount)}
                    </Text>
                    <Text style={[styles.podiumInvites, { color: colors.mutedText }]}>
                      {top3Podium.rank2.referralCount} invites
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {/* Rank 1 (Center - Gold Champion) */}
                {top3Podium.rank1 ? (
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={() => handleUserPress(top3Podium.rank1?.id)}
                    style={[styles.podiumCard, styles.podiumCard1, { backgroundColor: isDarkMode ? "rgba(245, 158, 11, 0.16)" : "#FFFBEB", borderColor: "#F59E0B" }]}
                  >
                    <View style={styles.crownIconWrap}>
                      <Icon name="trophy" size={20} color="#F59E0B" />
                    </View>
                    <View style={styles.podiumAvatarWrap}>
                      <AppAvatar
                        uri={normalizeMediaUrl(top3Podium.rank1.avatarUrl)}
                        name={top3Podium.rank1.name}
                        size={64}
                      />
                      <View style={[styles.podiumRankBadge, { backgroundColor: "#F59E0B" }]}>
                        <Text style={styles.podiumRankText}>1</Text>
                      </View>
                    </View>
                    <Text style={[styles.podiumName, styles.podiumName1, { color: colors.text }]} numberOfLines={1}>
                      {top3Podium.rank1.name}
                    </Text>
                    <Text style={[styles.podiumEarnings, styles.podiumEarnings1, { color: colors.primary }]}>
                      {formatCurrencyAmount(top3Podium.rank1.earningsAmount)}
                    </Text>
                    <Text style={[styles.podiumInvites, { color: colors.mutedText }]}>
                      {top3Podium.rank1.referralCount} invites
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {/* Rank 3 (Right) */}
                {top3Podium.rank3 ? (
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={() => handleUserPress(top3Podium.rank3?.id)}
                    style={[styles.podiumCard, styles.podiumCard3, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={styles.podiumAvatarWrap}>
                      <AppAvatar
                        uri={normalizeMediaUrl(top3Podium.rank3.avatarUrl)}
                        name={top3Podium.rank3.name}
                        size={50}
                      />
                      <View style={[styles.podiumRankBadge, { backgroundColor: "#D97706" }]}>
                        <Text style={styles.podiumRankText}>3</Text>
                      </View>
                    </View>
                    <Text style={[styles.podiumName, { color: colors.text }]} numberOfLines={1}>
                      {top3Podium.rank3.name}
                    </Text>
                    <Text style={[styles.podiumEarnings, { color: colors.primary }]}>
                      {formatCurrencyAmount(top3Podium.rank3.earningsAmount)}
                    </Text>
                    <Text style={[styles.podiumInvites, { color: colors.mutedText }]}>
                      {top3Podium.rank3.referralCount} invites
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {rank4PlusList.length > 0 ? (
                <Text style={[styles.sectionHeading, { color: colors.text }]}>Rankings</Text>
              ) : null}
            </View>
          }
        />
      )}

      {/* Sticky Bottom Dock: Logged in User's Standing */}
      {currentUserStanding ? (
        <View style={[styles.bottomStandingBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TouchableOpacity style={styles.myStandingLeft} activeOpacity={0.84} onPress={() => handleUserPress(currentUserStanding.id)}>
            <View style={[styles.myRankBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.myRankText}>#{currentUserStanding.rank}</Text>
            </View>
            <AppAvatar
              uri={normalizeMediaUrl(currentUserStanding.avatarUrl)}
              name={currentUserStanding.name}
              size={38}
            />
            <View style={styles.myStandingCopy}>
              <Text style={[styles.myStandingTitle, { color: colors.text }]} numberOfLines={1}>
                Your Standing
              </Text>
              <Text style={[styles.myStandingSub, { color: colors.mutedText }]}>
                {currentUserStanding.referralCount} successful invites
              </Text>
            </View>
          </TouchableOpacity>
          <View style={styles.myStandingRight}>
            <Text style={[styles.myStandingEarnings, { color: colors.primary }]}>
              {formatCurrencyAmount(currentUserStanding.earningsAmount)}
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.referBtn, { backgroundColor: colors.primary }]}
              onPress={() => navigation.navigate("HowToEarnScreen", { section: "howToEarn" })}
            >
              <Text style={styles.referBtnText}>Invite & Earn</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: appFonts.bold,
  },
  tabContainer: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  activeTabButton: {
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontFamily: appFonts.semibold,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: appFonts.medium,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: appFonts.bold,
    textAlign: "center",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13.5,
    fontFamily: appFonts.regular,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  emptyActionBtnText: {
    color: "#FFF",
    fontSize: 14,
    fontFamily: appFonts.bold,
  },
  podiumSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  podiumContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 8,
    marginBottom: 20,
  },
  podiumCard: {
    flex: 1,
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  podiumCard1: {
    paddingVertical: 16,
    transform: [{ translateY: -10 }],
    elevation: 4,
    shadowColor: "#F59E0B",
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  podiumCard2: {
    height: 146,
    justifyContent: "center",
  },
  podiumCard3: {
    height: 140,
    justifyContent: "center",
  },
  crownIconWrap: {
    marginBottom: 4,
  },
  podiumAvatarWrap: {
    position: "relative",
    marginBottom: 6,
  },
  podiumRankBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#FFF",
  },
  podiumRankText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "800",
  },
  podiumName: {
    fontSize: 12,
    fontFamily: appFonts.semibold,
    textAlign: "center",
  },
  podiumName1: {
    fontSize: 13.5,
    fontFamily: appFonts.bold,
  },
  podiumEarnings: {
    marginTop: 2,
    fontSize: 12.5,
    fontFamily: appFonts.bold,
  },
  podiumEarnings1: {
    fontSize: 14,
  },
  podiumInvites: {
    marginTop: 2,
    fontSize: 10.5,
    fontFamily: appFonts.medium,
  },
  sectionHeading: {
    fontSize: 16,
    fontFamily: appFonts.bold,
    marginBottom: 8,
    marginTop: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  listRankCol: {
    width: 32,
    alignItems: "center",
  },
  crownBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  standardRankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  standardRankText: {
    fontSize: 11,
    fontFamily: appFonts.bold,
  },
  listAvatar: {
    marginRight: 10,
  },
  listInfoCol: {
    flex: 1,
  },
  listName: {
    fontSize: 14,
    fontFamily: appFonts.semibold,
  },
  listUsername: {
    fontSize: 11.5,
    fontFamily: appFonts.regular,
    marginTop: 2,
  },
  listEarningCol: {
    alignItems: "flex-end",
  },
  listEarningAmount: {
    fontSize: 14,
    fontFamily: appFonts.bold,
  },
  invitesChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  invitesChipText: {
    fontSize: 10.5,
    fontFamily: appFonts.medium,
  },
  bottomStandingBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
  },
  myStandingLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  myRankBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 10,
  },
  myRankText: {
    color: "#FFF",
    fontSize: 12,
    fontFamily: appFonts.bold,
  },
  myStandingCopy: {
    marginLeft: 10,
    flex: 1,
  },
  myStandingTitle: {
    fontSize: 13.5,
    fontFamily: appFonts.bold,
  },
  myStandingSub: {
    fontSize: 11,
    fontFamily: appFonts.medium,
    marginTop: 1,
  },
  myStandingRight: {
    alignItems: "flex-end",
  },
  myStandingEarnings: {
    fontSize: 14,
    fontFamily: appFonts.bold,
    marginBottom: 4,
  },
  referBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  referBtnText: {
    color: "#FFF",
    fontSize: 11.5,
    fontFamily: appFonts.bold,
  },
});

export default LeaderboardScreen;
