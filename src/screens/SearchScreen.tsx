import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";

import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import Icon from "react-native-vector-icons/Ionicons";
import { getStoredUserId } from "../utils/authSession";
import { formatPrimaryServicePrice } from "../utils/servicePricing";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { useAppTheme } from "../theme/AppThemeContext";
import AppBottomDock, { APP_BOTTOM_DOCK_BASE_HEIGHT } from "../components/AppBottomDock";
import AppAvatar from "../components/AppAvatar";
import DraggableBottomSheet from "../components/DraggableBottomSheet";
import FeaturedProfilesCarousel, { type FeaturedProfileItem } from "../components/FeaturedProfilesCarousel";

type UserItem = {
  _id: string;
  name?: string;
  username?: string;
  profilePic?: string;
  isPrivate?: boolean;
  interests?: string[];
};

type SellerItem = {
  _id: string;
  sellerName?: string;
  name?: string;
  specialization?: string;
  category?: string;
  bio?: string;
  profilePic?: string;
  availabilityStatus?: boolean;
  user?: {
    _id?: string;
    name?: string;
    username?: string;
    category?: string;
    role?: string;
  };
};

type ServiceItem = {
  _id: string;
  serviceName?: string;
  description?: string;
  image?: string;
  currency?: string;
  pricingModel?: string;
  pricingOptions?: Array<{
    model?: string;
    label?: string;
    amount?: number;
    isDefault?: boolean;
    durationMinutes?: number;
  }>;
  seller?: {
    _id?: string;
    sellerName?: string;
    specialization?: string;
    profilePic?: string;
    availabilityStatus?: boolean;
  };
};

type TrendingHashtag = {
  tag: string;
  count: number;
};

const TAB_LABELS = {
  users: "users",
  sellers: "sellers",
  services: "services",
} as const;

const SearchScreen = ({ navigation, route }: any) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const accentColor = colors.primary;
  const accentSoft = `${accentColor}16`;
  const accentBorder = `${accentColor}36`;
  const [allUsers, setAllUsers] = useState<UserItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<UserItem[]>([]);
  const [allSellers, setAllSellers] = useState<SellerItem[]>([]);
  const [sellers, setSellers] = useState<SellerItem[]>([]);
  const [discoverServices, setDiscoverServices] = useState<ServiceItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<TrendingHashtag[]>([]);
  const [featuredProfiles, setFeaturedProfiles] = useState<FeaturedProfileItem[]>([]);
  const [search, setSearch] = useState(String(route?.params?.initialQuery || "").trim());
  const [locationSearch, setLocationSearch] = useState(String(route?.params?.initialLocation || "").trim());
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<keyof typeof TAB_LABELS>("users");
  const [showFilterSheet, setShowFilterSheet] = useState(false);

const isVerifiedSellerOnly = (seller: any): boolean => {
  if (!seller) return false;
  if (seller.onboardingCompleted === false || seller.isOnboarded === false) {
    return false;
  }
  const verificationStatus = String(
    seller.verificationStatus
    || seller.sellerVerificationStatus
    || seller.sellerProfile?.verificationStatus
    || seller.status
    || seller.approvalStatus
    || ""
  ).toLowerCase().trim();

  if (
    verificationStatus === "pending"
    || verificationStatus === "unverified"
    || verificationStatus === "draft"
    || verificationStatus === "incomplete"
    || verificationStatus === "rejected"
    || verificationStatus === "disabled"
    || verificationStatus === "blocked"
  ) {
    return false;
  }

  const isApproved =
    verificationStatus === "approved" ||
    verificationStatus === "verified" ||
    seller.isVerifiedSeller === true ||
    seller.isVerified === true ||
    seller.digilockerVerified === true;

  if (!isApproved && verificationStatus !== "approved" && verificationStatus !== "verified") {
    return false;
  }

  const name = String(seller.sellerName || seller.name || seller.user?.name || "").trim();
  if (!name) {
    return false;
  }

  const category = String(
    seller.specialization
    || seller.category
    || seller.user?.category
    || ""
  ).trim();

  if (!category) {
    return false;
  }

  return true;
};

  const applyUserResults = useCallback((items: UserItem[], userId: string | null) => {
    const filtered = items.filter((item) => item?._id && item._id !== userId);
    setAllUsers(filtered);
    setUsers(filtered);
  }, []);

  const applySellerResults = useCallback((items: SellerItem[]) => {
    const registeredSellers = items.filter((seller) => isVerifiedSellerOnly(seller));
    setAllSellers(registeredSellers);
    setSellers(registeredSellers);
  }, []);

  const applyServiceResults = useCallback((items: ServiceItem[]) => {
    const validServices = items.filter((service) => {
      if (!service?.seller) return true;
      return isVerifiedSellerOnly(service.seller);
    });
    setDiscoverServices(validServices);
    setServices(validServices);
  }, []);

  const init = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const id = await getStoredUserId();
      setCurrentUserId(id);

      const [usersRes, sellersRes, servicesRes, suggestedRes, hashtagsRes, featuredRes] = await Promise.all([
        API.get("/auth/users"),
        API.get("/seller/all"),
        API.get("/service/discover", { params: { limit: 20 } }),
        API.get("/search/suggested/users", { params: { limit: 6 } }),
        API.get("/search/trending/hashtags", { params: { limit: 8 } }),
        API.get("/featured-profiles", { params: { limit: 20 } }).catch(() => ({ data: null })),
      ]);

      applyUserResults(usersRes.data?.users || [], id);
      applySellerResults(Array.isArray(sellersRes.data?.sellers) ? sellersRes.data.sellers : []);
      applyServiceResults(Array.isArray(servicesRes.data?.services) ? servicesRes.data.services : []);
      setSuggestedUsers((suggestedRes.data?.users || []).filter((item: UserItem) => item?._id !== id));
      setTrendingHashtags(hashtagsRes.data?.hashtags || []);
      setFeaturedProfiles(Array.isArray(featuredRes.data?.profiles) ? featuredRes.data.profiles : []);
      setErrorMessage("");
    } catch (error) {
      console.log("search init error:", error);
      setErrorMessage(getReadableApiErrorMessage(error, "Could not load search right now."));
      setAllUsers([]);
      setUsers([]);
      setSuggestedUsers([]);
      setAllSellers([]);
      setSellers([]);
      setDiscoverServices([]);
      setServices([]);
      setTrendingHashtags([]);
      setFeaturedProfiles([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applySellerResults, applyServiceResults, applyUserResults]);

  useFocusEffect(
    useCallback(() => {
      init();
    }, [init])
  );

  useEffect(() => {
    const nextQuery = String(route?.params?.initialQuery || "").trim();
    if (!nextQuery) {
      return;
    }

    setSearch(nextQuery);
    navigation.setParams?.({ initialQuery: undefined });
  }, [navigation, route?.params?.initialQuery]);

  const matchesLocationFilter = useCallback((item: any, locQuery: string): boolean => {
    const normLoc = locQuery.trim().toLowerCase();
    if (!normLoc) return true;

    const locFields = [
      item?.location,
      item?.city,
      item?.state,
      item?.country,
      item?.address,
      item?.seller?.location,
      item?.seller?.city,
      item?.seller?.state,
      item?.seller?.country,
      item?.seller?.address,
      item?.bio,
      item?.specialization,
    ];

    return locFields.some((field) => String(field || "").toLowerCase().includes(normLoc));
  }, []);

  useEffect(() => {
    const trimmedQuery = search.trim();
    const trimmedLoc = locationSearch.trim();

    if (!trimmedQuery && !trimmedLoc) {
      setUsers(allUsers);
      setSellers(allSellers);
      setServices(discoverServices);
      setSearching(false);
      return;
    }

    const handleSearch = async () => {
      setSearching(true);

      try {
        if (activeTab === "users") {
          const res = await API.get("/auth/search", {
            params: { query: trimmedQuery, location: trimmedLoc }
          });

          let rawUsers = (res.data?.users || []).filter((item: UserItem) => item?._id !== currentUserId);
          if (trimmedLoc) {
            rawUsers = rawUsers.filter((item: UserItem) => matchesLocationFilter(item, trimmedLoc));
          }
          setUsers(rawUsers);
          setErrorMessage("");
          return;
        }

        if (activeTab === "sellers") {
          const normQuery = trimmedQuery.toLowerCase();
          const normLoc = trimmedLoc.toLowerCase();

          setSellers(
            allSellers.filter((seller) => {
              if (!isVerifiedSellerOnly(seller)) return false;
              const matchesQuery = !normQuery || [
                seller?.specialization,
                seller?.category,
                seller?.user?.category,
                seller?.sellerName,
                seller?.name,
                seller?.user?.name,
                seller?.bio
              ].some((val) => String(val || "").toLowerCase().includes(normQuery));

              const matchesLoc = !normLoc || matchesLocationFilter(seller, normLoc);

              return matchesQuery && matchesLoc;
            })
          );
          setErrorMessage("");
          return;
        }

        const res = await API.get("/service/discover", {
          params: { query: trimmedQuery, location: trimmedLoc, limit: 20 }
        });

        let rawServices = res.data?.services || [];
        if (trimmedLoc) {
          rawServices = rawServices.filter((service: ServiceItem) => matchesLocationFilter(service, trimmedLoc));
        }
        setServices(rawServices);
        setErrorMessage("");
      } catch (error) {
        console.log("searchData error:", error);
        setErrorMessage(getReadableApiErrorMessage(error, "Could not update search results."));
      } finally {
        setSearching(false);
      }
    };

    handleSearch();
  }, [activeTab, allSellers, allUsers, currentUserId, discoverServices, locationSearch, matchesLocationFilter, search]);

  const searchData = (text: string) => {
    setSearch(text);
  };

  const onRefresh = useCallback(async () => {
    await init(true);
  }, [init]);

  const openHashtagResults = (tag: string) => {
    const normalizedTag = String(tag || "").replace(/^#/, "").trim();

    if (!normalizedTag) {
      return;
    }

    navigation.navigate("HashtagResultsScreen", {
      hashtag: normalizedTag
    });
  };

  const currentData = useMemo(() => {
    if (activeTab === "sellers") {
      return sellers;
    }

    if (activeTab === "services") {
      return services;
    }

    return users;
  }, [activeTab, sellers, services, users]);

  const activeResultsCount = currentData.length;
  const featuredUserIds = useMemo(
    () => new Set(featuredProfiles.map((profile) => String(profile.userId || "")).filter(Boolean)),
    [featuredProfiles],
  );
  const featuredSellerIds = useMemo(
    () => new Set(featuredProfiles.map((profile) => String(profile.sellerId || "")).filter(Boolean)),
    [featuredProfiles],
  );

  const renderUser = ({ item }: { item: UserItem }) => (
    <TouchableOpacity
      style={[styles.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() =>
        navigation.navigate("ProfilePreviewScreen", {
          userId: item._id
        })
      }
    >
      <Image
        source={{
          uri: item.profilePic || DEFAULT_AVATAR_URL
        }}
        style={styles.avatar}
      />

      <View style={styles.cardContent}>
        <View style={styles.inlineRow}>
          <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>{item.username || "user"}</Text>
          {item.isPrivate ? (
            <View style={[styles.privateBadge, { backgroundColor: accentSoft }]}>
              <Icon name="lock-closed" size={12} color={accentColor} />
              <Text style={styles.privateText}>Private</Text>
            </View>
          ) : null}
          {featuredUserIds.has(String(item._id || "")) ? (
            <View style={[styles.featuredBadge, { backgroundColor: accentColor }]}>
              <Icon name="star" size={11} color="#fff" />
              <Text style={styles.featuredText}>Featured</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.name, { color: colors.mutedText }]} numberOfLines={1}>{item.name || item.username || "Aline2 user"}</Text>
        {!!item.interests?.length && (
          <Text style={[styles.metaLine, { color: colors.mutedText }]} numberOfLines={1}>
            {item.interests.join(" • ")}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderSeller = ({ item }: { item: SellerItem }) => (
    <TouchableOpacity
      style={[styles.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() =>
        navigation.navigate("SellerPreviewScreen", {
          sellerId: item._id
        })
      }
    >
      <Image
        source={{
          uri: item.profilePic || DEFAULT_AVATAR_URL
        }}
        style={styles.avatar}
      />

      <View style={styles.cardContent}>
        <View style={styles.inlineRow}>
          <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>{item.sellerName || "Seller"}</Text>
          <View style={[styles.statusBadge, item.availabilityStatus ? styles.availableBadge : styles.busyBadge]}>
            <Text style={[styles.statusText, item.availabilityStatus ? styles.availableText : styles.busyText]}>
              {item.availabilityStatus ? "Available" : "Busy"}
            </Text>
          </View>
          {featuredSellerIds.has(String(item._id || "")) ? (
            <View style={[styles.featuredBadge, { backgroundColor: accentColor }]}>
              <Icon name="star" size={11} color="#fff" />
              <Text style={styles.featuredText}>Featured</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.name, { color: colors.mutedText }]} numberOfLines={1}>{item.specialization || "Service provider"}</Text>
        {!!item.bio && (
          <Text style={[styles.metaLine, { color: colors.mutedText }]} numberOfLines={1}>
            {item.bio}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderService = ({ item }: { item: ServiceItem }) => (
    <TouchableOpacity
      style={[
        styles.serviceCard,
        { backgroundColor: colors.card, borderColor: colors.border },
        !item?.seller?._id && styles.disabledCard
      ]}
      disabled={!item?.seller?._id}
      onPress={() =>
        navigation.navigate("SellerPreviewScreen", {
          sellerId: item?.seller?._id
        })
      }
    >
      <Image
        source={{
          uri: item.image || item?.seller?.profilePic || DEFAULT_AVATAR_URL
        }}
        style={styles.serviceImage}
      />

      <View style={styles.cardContent}>
        <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>{item.serviceName || "Service"}</Text>
        <Text style={[styles.name, { color: colors.mutedText }]} numberOfLines={1}>
          {item?.seller?.sellerName || "Seller"}{item?.seller?.specialization ? ` • ${item.seller.specialization}` : ""}
        </Text>
        {!!item.description && (
          <Text style={[styles.metaLine, { color: colors.mutedText }]} numberOfLines={2}>
            {item.description}
          </Text>
        )}
        <Text style={[styles.priceText, { color: accentColor }]}>{formatPrimaryServicePrice(item)}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderDiscoverHeader = () => {
    if (search.trim() || activeTab !== "users") {
      return null;
    }

    if (!suggestedUsers.length) {
      return null;
    }

    return (
      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionEyebrow, { color: accentColor }]}>Quick picks</Text>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Suggested for you</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.mutedText }]}>
          Start with familiar profiles and active people from your network.
        </Text>
        {suggestedUsers.map((item) => (
          <TouchableOpacity
            key={item._id}
            style={[styles.suggestionRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => navigation.navigate("ProfilePreviewScreen", { userId: item._id })}
          >
            <AppAvatar
              uri={item.profilePic || DEFAULT_AVATAR_URL}
              name={item.username || item.name || (item as any)?.email || "User"}
              size={48}
              style={styles.suggestionAvatar}
              backgroundColor={colors.surface}
              textColor={colors.primary}
            />
            <View style={styles.cardContent}>
              <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>{item.username || "user"}</Text>
              <Text style={[styles.name, { color: colors.mutedText }]} numberOfLines={1}>{item.name || item.username || "Aline2 user"}</Text>
            </View>
          </TouchableOpacity>
        ))}
        <Text style={[styles.sectionTitle, styles.sectionTitleStandalone, { color: colors.text }]}>Browse all users</Text>
      </View>
    );
  };

  const renderServiceHeader = () => {
    if (search.trim() || activeTab !== "services") {
      return null;
    }

    return (
      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionEyebrow, { color: accentColor }]}>Discover</Text>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Trending hashtags</Text>
        <View style={styles.tagWrap}>
          {trendingHashtags.length ? trendingHashtags.map((item) => (
            <TouchableOpacity
              key={item.tag}
              style={[styles.tagChip, { backgroundColor: accentSoft, borderColor: accentBorder }]}
              onPress={() => openHashtagResults(item.tag)}
            >
              <Text style={styles.tagText}>#{item.tag}</Text>
            </TouchableOpacity>
          )) : (
            <Text style={[styles.helperText, { color: colors.mutedText }]}>No trending hashtags yet.</Text>
          )}
        </View>
        <Text style={[styles.sectionTitle, styles.sectionTitleStandalone, { color: colors.text }]}>Discover services</Text>
      </View>
    );
  };

  const renderListHeader = () => (
    <View>
      {!search.trim() ? (
        <FeaturedProfilesCarousel navigation={navigation} title="Featured profiles" compact limit={12} />
      ) : null}
      {activeTab === "services" ? renderServiceHeader() : renderDiscoverHeader()}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" />
        </SafeAreaView>
        <AppBottomDock navigation={navigation} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.headerWrap}>
          <View style={[styles.headerShell, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.topHeaderRow}>
              <TouchableOpacity
                style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => navigation.goBack()}
              >
                <Icon name="arrow-back" size={20} color={colors.text} />
              </TouchableOpacity>

              <Text style={[styles.headerTitle, styles.headerTitleCompact, { color: colors.text }]}>Search</Text>
              <View style={styles.headerSpacer} />
            </View>

            <View style={styles.searchRow}>
              <View style={[styles.searchBar, styles.searchBarInline, { backgroundColor: colors.input, borderColor: colors.border }]}>
                <Icon name="search-outline" size={18} color={colors.mutedText} />
                <TextInput
                  placeholder={`Search ${activeTab}...`}
                  placeholderTextColor={colors.placeholder}
                  style={[styles.searchInput, { color: colors.text }]}
                  value={search}
                  onChangeText={searchData}
                />
              </View>
              <TouchableOpacity
                style={[styles.filterButton, { backgroundColor: accentColor }]}
                onPress={() => setShowFilterSheet(true)}
                activeOpacity={0.88}
              >
                <Icon name="options-outline" size={18} color="#fff" />
                <Text style={[styles.filterButtonText, { color: "#fff" }]}>Filter</Text>
              </TouchableOpacity>
            </View>

            {locationSearch.trim() ? (
              <View style={styles.activeLocationBadgeRow}>
                <TouchableOpacity
                  style={[styles.activeLocationChip, { backgroundColor: accentSoft, borderColor: accentBorder }]}
                  onPress={() => setLocationSearch("")}
                  activeOpacity={0.8}
                >
                  <Icon name="location" size={14} color={accentColor} />
                  <Text style={[styles.activeLocationText, { color: accentColor }]}>
                    Location: {locationSearch.trim()}
                  </Text>
                  <Icon name="close" size={14} color={accentColor} />
                </TouchableOpacity>
              </View>
            ) : null}

            {searching ? (
              <View style={[styles.searchingBox, { backgroundColor: colors.surface }]}>
                <ActivityIndicator size="small" color={accentColor} />
                <Text style={[styles.searchingText, { color: colors.mutedText }]}>Updating results...</Text>
              </View>
            ) : null}
          </View>
        </View>

        <FlatList
          data={currentData}
          keyExtractor={(item: any, index) => String(item?._id || index)}
          renderItem={
            activeTab === "users"
              ? renderUser
              : activeTab === "sellers"
                ? renderSeller
                : renderService
          }
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {errorMessage ? "Search unavailable" : `No ${TAB_LABELS[activeTab]} found`}
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedText }]}>
                {errorMessage || "Try another search or check back later."}
              </Text>
              {errorMessage ? (
                <TouchableOpacity style={[styles.retryButton, { backgroundColor: accentColor }]} onPress={() => init()}>
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} />}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: APP_BOTTOM_DOCK_BASE_HEIGHT + Math.max(insets.bottom, 10) + 24 },
            !currentData.length && styles.listContentEmpty,
          ]}
        />
      </SafeAreaView>
      <DraggableBottomSheet
        visible={showFilterSheet}
        onClose={() => setShowFilterSheet(false)}
        snapPoints={[0.34, 0.5, 0.72]}
        initialSnapIndex={1}
        minHeight={280}
      >
        <View style={[styles.filterSheet, { backgroundColor: colors.card }]}>
          <View style={styles.filterSheetHeader}>
            <Text style={[styles.filterSheetTitle, { color: colors.text }]}>Filters</Text>
            <Text style={[styles.filterSheetMeta, { color: colors.mutedText }]}>{activeResultsCount} results</Text>
          </View>

          <Text style={[styles.filterSectionLabel, { color: colors.mutedText }]}>Content type</Text>
          <View style={[styles.tabsShell, styles.tabsSheetShell, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(["users", "sellers", "services"] as Array<keyof typeof TAB_LABELS>).map((tabKey) => (
              <TouchableOpacity
                key={tabKey}
                style={[styles.tab, activeTab === tabKey ? { backgroundColor: accentColor } : null]}
                onPress={() => {
                  setActiveTab(tabKey);
                  setShowFilterSheet(false);
                }}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: activeTab === tabKey ? "#fff" : colors.mutedText },
                    activeTab === tabKey && styles.activeText,
                  ]}
                >
                  {tabKey === "users" ? "Users" : tabKey === "sellers" ? "Sellers" : "Services"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.filterSectionLabel, styles.filterSectionSpacing, { color: colors.mutedText }]}>Location filter</Text>
          <View style={[styles.searchBar, styles.locationFilterInputBar, { backgroundColor: colors.input, borderColor: colors.border }]}>
            <Icon name="location-outline" size={18} color={accentColor} />
            <TextInput
              placeholder="Search by city, state, or country..."
              placeholderTextColor={colors.placeholder}
              style={[styles.searchInput, { color: colors.text }]}
              value={locationSearch}
              onChangeText={(text) => setLocationSearch(text)}
            />
            {locationSearch ? (
              <TouchableOpacity onPress={() => setLocationSearch("")}>
                <Icon name="close-circle" size={18} color={colors.mutedText} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.tagWrap}>
            {["Mumbai", "Delhi", "Bangalore", "London", "New York"].map((loc) => (
              <TouchableOpacity
                key={loc}
                style={[
                  styles.tagChip,
                  locationSearch.toLowerCase() === loc.toLowerCase()
                    ? { backgroundColor: accentColor, borderColor: accentColor }
                    : { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => {
                  setLocationSearch(locationSearch.toLowerCase() === loc.toLowerCase() ? "" : loc);
                }}
              >
                <Text
                  style={[
                    styles.tagText,
                    { color: locationSearch.toLowerCase() === loc.toLowerCase() ? "#fff" : colors.text },
                  ]}
                >
                  📍 {loc}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === "services" ? (
            <>
              <Text style={[styles.filterSectionLabel, styles.filterSectionSpacing, { color: colors.mutedText }]}>Trending hashtags</Text>
              <View style={styles.tagWrap}>
                {trendingHashtags.length ? trendingHashtags.map((item) => (
                  <TouchableOpacity
                    key={item.tag}
                    style={[styles.tagChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => {
                      setShowFilterSheet(false);
                      openHashtagResults(item.tag);
                    }}
                  >
                    <Text style={[styles.tagText, { color: colors.text }]}>#{item.tag}</Text>
                  </TouchableOpacity>
                )) : (
                  <Text style={[styles.helperText, { color: colors.mutedText }]}>No trending hashtags yet.</Text>
                )}
              </View>
            </>
          ) : null}
        </View>
      </DraggableBottomSheet>
      <AppBottomDock navigation={navigation} />
    </View>
  );
};

export default SearchScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  headerWrap: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 8,
  },
  headerShell: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
  },
  topHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  locationFilterInputBar: {
    marginBottom: 8,
    marginTop: 4,
  },
  activeLocationBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  activeLocationChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  activeLocationText: {
    fontSize: 12,
    fontWeight: "600",
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    marginTop: 2,
  },
  headerTitleCompact: {
    flex: 1,
    marginTop: 0,
    textAlign: "center",
    fontSize: 22,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f4fb",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 50,
  },
  searchBarInline: {
    flex: 1,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    color: "#111",
    fontSize: 15,
  },
  filterButton: {
    height: 50,
    minWidth: 98,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  searchHint: {
    marginTop: 10,
    fontSize: 12.5,
    lineHeight: 18,
  },
  tabsShell: {
    flexDirection: "row",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 4,
  },
  tabsSheetShell: {
    marginTop: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: "center",
    borderRadius: 14,
  },
  activeText: {
    fontWeight: "700",
  },
  tabText: {
    fontWeight: "600",
    fontSize: 13.5,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 14,
    marginBottom: 10,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
  },
  serviceCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginHorizontal: 14,
    marginBottom: 10,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
  },
  disabledCard: {
    opacity: 0.6,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 15,
  },
  suggestionAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 12,
  },
  serviceImage: {
    width: 62,
    height: 62,
    borderRadius: 14,
    marginRight: 15,
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  username: {
    fontWeight: "700",
    color: "#111",
    fontSize: 15,
    flexShrink: 1,
  },
  name: {
    color: "#666",
    marginTop: 4,
    fontSize: 13.5,
  },
  metaLine: {
    color: "#777",
    marginTop: 5,
    fontSize: 12.5,
    lineHeight: 18,
  },
  priceText: {
    marginTop: 10,
    color: "#7B4DFF",
    fontWeight: "700",
    fontSize: 13.5,
  },
  sectionBlock: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 10,
  },
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#222",
    marginTop: 6,
    marginBottom: 6,
  },
  sectionTitleStandalone: {
    marginTop: 12,
  },
  sectionSubtitle: {
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 12,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 10,
  },
  privateBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1ebff",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  privateText: {
    marginLeft: 4,
    color: "#7B4DFF",
    fontSize: 11,
    fontWeight: "600",
  },
  featuredBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginLeft: 8,
    gap: 3,
  },
  featuredText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  availableBadge: {
    backgroundColor: "#E8F7EE",
  },
  busyBadge: {
    backgroundColor: "#FEECEC",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  availableText: {
    color: "#137A3A",
  },
  busyText: {
    color: "#C23B3B",
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 6,
  },
  tagChip: {
    backgroundColor: "#f1ebff",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: {
    color: "#7B4DFF",
    fontWeight: "600",
  },
  helperText: {
    color: "#777",
  },
  listContent: {
    paddingTop: 2,
    paddingBottom: 24,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  emptyText: {
    textAlign: "center",
    marginTop: 8,
    color: "#666",
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: "#7B4DFF",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: {
    color: "#fff",
    fontWeight: "700",
  },
  searchingBox: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
  },
  searchingText: {
    marginLeft: 8,
    color: "#666",
  },
  filterSheet: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 18,
  },
  filterSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filterSheetTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  filterSheetMeta: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  filterSectionLabel: {
    marginTop: 18,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  filterSectionSpacing: {
    marginTop: 22,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  }
});
