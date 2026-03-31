import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator
} from "react-native";

import { API } from "../api/api";
import Icon from "react-native-vector-icons/Ionicons";
import { getStoredUserId } from "../utils/authSession";
import { formatPrimaryServicePrice } from "../utils/servicePricing";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";

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
  specialization?: string;
  bio?: string;
  profilePic?: string;
  availabilityStatus?: boolean;
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

const SearchScreen = ({ navigation }: any) => {
  const [allUsers, setAllUsers] = useState<UserItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<UserItem[]>([]);
  const [allSellers, setAllSellers] = useState<SellerItem[]>([]);
  const [sellers, setSellers] = useState<SellerItem[]>([]);
  const [discoverServices, setDiscoverServices] = useState<ServiceItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<TrendingHashtag[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<keyof typeof TAB_LABELS>("users");

  const applyUserResults = useCallback((items: UserItem[], userId: string | null) => {
    const filtered = items.filter((item) => item?._id && item._id !== userId);
    setAllUsers(filtered);
    setUsers(filtered);
  }, []);

  const applySellerResults = useCallback((items: SellerItem[]) => {
    setAllSellers(items);
    setSellers(items);
  }, []);

  const applyServiceResults = useCallback((items: ServiceItem[]) => {
    setDiscoverServices(items);
    setServices(items);
  }, []);

  const init = useCallback(async () => {
    try {
      setLoading(true);
      const id = await getStoredUserId();
      setCurrentUserId(id);

      const [usersRes, sellersRes, servicesRes, suggestedRes, hashtagsRes] = await Promise.all([
        API.get("/auth/users"),
        API.get("/seller/all"),
        API.get("/service/discover", { params: { limit: 20 } }),
        API.get("/search/suggested/users", { params: { limit: 6 } }),
        API.get("/search/trending/hashtags", { params: { limit: 8 } }),
      ]);

      applyUserResults(usersRes.data?.users || [], id);
      applySellerResults(Array.isArray(sellersRes.data?.sellers) ? sellersRes.data.sellers : []);
      applyServiceResults(Array.isArray(servicesRes.data?.services) ? servicesRes.data.services : []);
      setSuggestedUsers((suggestedRes.data?.users || []).filter((item: UserItem) => item?._id !== id));
      setTrendingHashtags(hashtagsRes.data?.hashtags || []);
    } catch (error) {
      console.log("search init error:", error);
    } finally {
      setLoading(false);
    }
  }, [applySellerResults, applyServiceResults, applyUserResults]);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!search.trim()) {
      setUsers(allUsers);
      setSellers(allSellers);
      setServices(discoverServices);
      return;
    }

    const handleSearch = async () => {
      setSearching(true);

      try {
        if (activeTab === "users") {
          const res = await API.get("/auth/search", {
            params: { query: search.trim() }
          });

          setUsers((res.data?.users || []).filter((item: UserItem) => item?._id !== currentUserId));
          return;
        }

        if (activeTab === "sellers") {
          const normalizedQuery = search.trim().toLowerCase();
          setSellers(
            allSellers.filter((seller) => {
              const sellerName = String(seller?.sellerName || "").toLowerCase();
              const specialization = String(seller?.specialization || "").toLowerCase();
              const bio = String(seller?.bio || "").toLowerCase();

              return (
                sellerName.includes(normalizedQuery)
                || specialization.includes(normalizedQuery)
                || bio.includes(normalizedQuery)
              );
            })
          );
          return;
        }

        const res = await API.get("/service/discover", {
          params: { query: search.trim(), limit: 20 }
        });

        setServices(res.data?.services || []);
      } catch (error) {
        console.log("searchData error:", error);
      } finally {
        setSearching(false);
      }
    };

    handleSearch();
  }, [activeTab, allSellers, allUsers, currentUserId, discoverServices, search]);

  const searchData = async (text: string) => {
    setSearch(text);
  };

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

  const renderUser = ({ item }: { item: UserItem }) => (
    <TouchableOpacity
      style={styles.userCard}
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
          <Text style={styles.username}>{item.username || "user"}</Text>
          {item.isPrivate ? (
            <View style={styles.privateBadge}>
              <Icon name="lock-closed" size={12} color="#7B4DFF" />
              <Text style={styles.privateText}>Private</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.name}>{item.name || "Aline2 user"}</Text>
        {!!item.interests?.length && (
          <Text style={styles.metaLine} numberOfLines={1}>
            {item.interests.join(" • ")}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderSeller = ({ item }: { item: SellerItem }) => (
    <TouchableOpacity
      style={styles.userCard}
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
          <Text style={styles.username}>{item.sellerName || "Seller"}</Text>
          <View style={[styles.statusBadge, item.availabilityStatus ? styles.availableBadge : styles.busyBadge]}>
            <Text style={[styles.statusText, item.availabilityStatus ? styles.availableText : styles.busyText]}>
              {item.availabilityStatus ? "Available" : "Busy"}
            </Text>
          </View>
        </View>
        <Text style={styles.name}>{item.specialization || "Service provider"}</Text>
        {!!item.bio && (
          <Text style={styles.metaLine} numberOfLines={1}>
            {item.bio}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderService = ({ item }: { item: ServiceItem }) => (
    <TouchableOpacity
      style={styles.serviceCard}
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
        <Text style={styles.username}>{item.serviceName || "Service"}</Text>
        <Text style={styles.name}>
          {item?.seller?.sellerName || "Seller"}{item?.seller?.specialization ? ` • ${item.seller.specialization}` : ""}
        </Text>
        {!!item.description && (
          <Text style={styles.metaLine} numberOfLines={2}>
            {item.description}
          </Text>
        )}
        <Text style={styles.priceText}>{formatPrimaryServicePrice(item)}</Text>
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
        <Text style={styles.sectionTitle}>Suggested for you</Text>
        {suggestedUsers.map((item) => (
          <TouchableOpacity
            key={item._id}
            style={styles.suggestionRow}
            onPress={() => navigation.navigate("ProfilePreviewScreen", { userId: item._id })}
          >
            <Image source={{ uri: item.profilePic || DEFAULT_AVATAR_URL }} style={styles.suggestionAvatar} />
            <View style={styles.cardContent}>
              <Text style={styles.username}>{item.username || "user"}</Text>
              <Text style={styles.name}>{item.name || "Aline2 user"}</Text>
            </View>
          </TouchableOpacity>
        ))}
        <Text style={styles.sectionTitle}>Browse all users</Text>
      </View>
    );
  };

  const renderServiceHeader = () => {
    if (search.trim() || activeTab !== "services") {
      return null;
    }

    return (
      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>Trending hashtags</Text>
        <View style={styles.tagWrap}>
          {trendingHashtags.length ? trendingHashtags.map((item) => (
            <TouchableOpacity
              key={item.tag}
              style={styles.tagChip}
              onPress={() => openHashtagResults(item.tag)}
            >
              <Text style={styles.tagText}>#{item.tag}</Text>
            </TouchableOpacity>
          )) : (
            <Text style={styles.helperText}>No trending hashtags yet.</Text>
          )}
        </View>
        <Text style={styles.sectionTitle}>Discover services</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Search</Text>

        <View style={{ width: 24 }} />
      </View>

      {/* SEARCH */}
      <View style={styles.searchBar}>
        <Icon name="search-outline" size={20} color="#777" />
        <TextInput
          placeholder={`Search ${activeTab}...`}
          style={styles.searchInput}
          value={search}
          onChangeText={searchData}
        />
      </View>

      {/* TABS */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "users" && styles.activeTab]}
          onPress={() => setActiveTab("users")}
        >
          <Text style={activeTab === "users" && styles.activeText}>
            Users
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === "sellers" && styles.activeTab]}
          onPress={() => setActiveTab("sellers")}
        >
          <Text style={activeTab === "sellers" && styles.activeText}>
            Sellers
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === "services" && styles.activeTab]}
          onPress={() => setActiveTab("services")}
        >
          <Text style={activeTab === "services" && styles.activeText}>
            Services
          </Text>
        </TouchableOpacity>
      </View>

      {searching ? (
        <View style={styles.searchingBox}>
          <ActivityIndicator size="small" color="#7B4DFF" />
          <Text style={styles.searchingText}>Updating results...</Text>
        </View>
      ) : null}

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
        ListHeaderComponent={activeTab === "services" ? renderServiceHeader : renderDiscoverHeader}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No {TAB_LABELS[activeTab]} found</Text>
        }
        contentContainerStyle={styles.listContent}
      />

    </View>
  );
};

export default SearchScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: 50
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 15,
    marginBottom: 10
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "bold"
  },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f4fb",
    marginHorizontal: 15,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 12
  },

  searchInput: {
    flex: 1,
    marginLeft: 8,
    color: "#111"
  },

  tabs: {
    flexDirection: "row",
    marginHorizontal: 15,
    marginBottom: 10
  },

  tab: {
    flex: 1,
    padding: 10,
    alignItems: "center",
    borderBottomWidth: 2,
    borderColor: "transparent"
  },

  activeTab: {
    borderColor: "#7B4DFF"
  },

  activeText: {
    fontWeight: "bold",
    color: "#7B4DFF"
  },

  userCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    borderBottomWidth: 1,
    borderColor: "#eee"
  },
  serviceCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 15,
    borderBottomWidth: 1,
    borderColor: "#eee"
  },

  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 15
  },
  suggestionAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 12
  },
  serviceImage: {
    width: 62,
    height: 62,
    borderRadius: 14,
    marginRight: 15
  },
  cardContent: {
    flex: 1
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap"
  },

  username: {
    fontWeight: "700",
    color: "#111"
  },

  name: {
    color: "#666",
    marginTop: 2
  },
  metaLine: {
    color: "#777",
    marginTop: 4
  },
  priceText: {
    marginTop: 8,
    color: "#7B4DFF",
    fontWeight: "700"
  },
  sectionBlock: {
    paddingHorizontal: 15,
    paddingTop: 6,
    paddingBottom: 8
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#222",
    marginBottom: 10
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#faf8ff",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10
  },
  privateBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1ebff",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8
  },
  privateText: {
    marginLeft: 4,
    color: "#7B4DFF",
    fontSize: 11,
    fontWeight: "600"
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8
  },
  availableBadge: {
    backgroundColor: "#E8F7EE"
  },
  busyBadge: {
    backgroundColor: "#FEECEC"
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600"
  },
  availableText: {
    color: "#137A3A"
  },
  busyText: {
    color: "#C23B3B"
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 14
  },
  tagChip: {
    backgroundColor: "#f1ebff",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
    marginBottom: 8
  },
  tagText: {
    color: "#7B4DFF",
    fontWeight: "600"
  },
  helperText: {
    color: "#777"
  },
  listContent: {
    paddingBottom: 24
  },
  emptyText: {
    textAlign: "center",
    marginTop: 24,
    color: "#666"
  },
  searchingBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 8
  },
  searchingText: {
    marginLeft: 8,
    color: "#666"
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  }
});
