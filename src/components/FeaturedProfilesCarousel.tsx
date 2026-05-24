import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";

import { API } from "../api/api";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { normalizeMediaUrl } from "../utils/mediaUrls";
import { useAppTheme } from "../theme/AppThemeContext";

export type FeaturedProfileItem = {
  _id: string;
  userId: string;
  sellerId?: string;
  name?: string;
  username?: string;
  profilePic?: string;
  bio?: string;
  isSeller?: boolean;
  sellerName?: string;
  specialization?: string;
  sellerAvailable?: boolean;
  isFollowing?: boolean;
};

type FeaturedProfilesCarouselProps = {
  navigation: any;
  title?: string;
  compact?: boolean;
  limit?: number;
};

const trackFeaturedProfile = (featuredProfileId: string, action: string) => {
  if (!featuredProfileId) {
    return;
  }

  API.post(`/featured-profiles/${featuredProfileId}/track`, { action }).catch(() => {});
};

function FeaturedProfilesCarousel({
  navigation,
  title = "Featured profiles",
  compact = false,
  limit = 12,
}: FeaturedProfilesCarouselProps) {
  const { colors } = useAppTheme();
  const [profiles, setProfiles] = useState<FeaturedProfileItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadProfiles = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get("/featured-profiles", { params: { limit } });
      const nextProfiles = Array.isArray(res.data?.profiles) ? res.data.profiles : [];
      setProfiles(nextProfiles);
      nextProfiles.forEach((profile: FeaturedProfileItem) => trackFeaturedProfile(profile._id, "impression"));
    } catch (error) {
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const openProfile = useCallback((item: FeaturedProfileItem) => {
    trackFeaturedProfile(item._id, "view");
    navigation.navigate("ProfilePreviewScreen", { userId: item.userId });
  }, [navigation]);

  const openSeller = useCallback((item: FeaturedProfileItem) => {
    if (!item.sellerId) {
      openProfile(item);
      return;
    }

    trackFeaturedProfile(item._id, "seller_tap");
    navigation.navigate("SellerPreviewScreen", { sellerId: item.sellerId });
  }, [navigation, openProfile]);

  const followProfile = useCallback(async (item: FeaturedProfileItem) => {
    if (!item.userId || item.isFollowing) {
      return;
    }

    setProfiles((current) => current.map((profile) => (
      profile._id === item._id ? { ...profile, isFollowing: true } : profile
    )));
    trackFeaturedProfile(item._id, "follow");

    try {
      await API.post(`/follow/follow/${item.userId}`);
    } catch (error) {
      setProfiles((current) => current.map((profile) => (
        profile._id === item._id ? { ...profile, isFollowing: false } : profile
      )));
    }
  }, []);

  if (loading && !profiles.length) {
    return (
      <View style={[styles.shell, compact && styles.shellCompact, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!profiles.length) {
    return null;
  }

  return (
    <View style={[styles.shell, compact && styles.shellCompact, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>Promoted</Text>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        </View>
        <Icon name="sparkles-outline" size={20} color={colors.primary} />
      </View>

      <FlatList
        horizontal
        data={profiles}
        keyExtractor={(item) => item._id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.88}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => openProfile(item)}
          >
            <View style={styles.avatarWrap}>
              <Image
                source={{ uri: normalizeMediaUrl(item.profilePic || DEFAULT_AVATAR_URL) }}
                style={styles.avatar}
              />
              <View style={[styles.featureBadge, { backgroundColor: colors.primary }]}>
                <Icon name="star" size={10} color="#fff" />
              </View>
            </View>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {item.name || item.username || item.sellerName || "Aline2 profile"}
            </Text>
            <Text style={[styles.meta, { color: colors.mutedText }]} numberOfLines={1}>
              {item.isSeller ? item.specialization || "Seller" : item.username ? `@${item.username}` : "Featured"}
            </Text>
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.followButton, { backgroundColor: item.isFollowing ? colors.card : colors.primary }]}
                onPress={() => followProfile(item)}
                disabled={item.isFollowing}
              >
                <Text style={[styles.followText, { color: item.isFollowing ? colors.mutedText : "#fff" }]}>
                  {item.isFollowing ? "Following" : "Follow"}
                </Text>
              </TouchableOpacity>
              {item.isSeller ? (
                <TouchableOpacity style={[styles.iconButton, { borderColor: colors.border }]} onPress={() => openSeller(item)}>
                  <Icon name="storefront-outline" size={14} color={colors.primary} />
                </TouchableOpacity>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    marginHorizontal: 12,
    marginVertical: 10,
    paddingVertical: 14,
  },
  shellCompact: {
    marginHorizontal: 0,
    marginBottom: 14,
  },
  header: {
    paddingHorizontal: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  title: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: "900",
  },
  list: {
    paddingHorizontal: 14,
    paddingTop: 12,
    gap: 10,
  },
  card: {
    width: 132,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 10,
    marginRight: 10,
  },
  avatarWrap: {
    width: 54,
    height: 54,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#E5E7EB",
  },
  featureBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    marginTop: 9,
    fontSize: 13,
    fontWeight: "900",
  },
  meta: {
    marginTop: 2,
    fontSize: 11,
    minHeight: 15,
  },
  actions: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  followButton: {
    flex: 1,
    minHeight: 30,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  followText: {
    fontSize: 11,
    fontWeight: "900",
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default FeaturedProfilesCarousel;
