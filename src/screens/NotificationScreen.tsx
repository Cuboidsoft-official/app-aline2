import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import LinearGradient from "react-native-linear-gradient";
import Icon from "react-native-vector-icons/Ionicons";
import { Swipeable } from "react-native-gesture-handler";

import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import AppBottomDock, { APP_BOTTOM_DOCK_BASE_HEIGHT } from "../components/AppBottomDock";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { connectSocket, socket } from "../socket";
import { useAppTheme } from "../theme/AppThemeContext";
import { getStoredUserId } from "../utils/authSession";
import { normalizeMediaFieldsDeep, normalizeMediaUrl } from "../utils/mediaUrls";

type NotificationKind =
  | "follow"
  | "like"
  | "comment"
  | "story_reply"
  | "mention_story"
  | "tag_story"
  | "service_request"
  | "service_request_update"
  | "live_stream_started"
  | "swipe"
  | string;

interface NotificationUser {
  _id?: string;
  id?: string;
  username?: string;
  profilePic?: string;
}

interface NotificationTarget {
  _id?: string;
  id?: string;
  groupName?: string;
  groupAvatar?: string;
  conversationType?: string;
}

interface AppNotification {
  _id: string;
  type: NotificationKind;
  createdAt: string;
  read?: boolean;
  text?: string;
  sender?: NotificationUser | null;
  conversation?: NotificationTarget | string | null;
  liveStream?: NotificationTarget | string | null;
  post?: NotificationTarget | string | null;
  story?: NotificationTarget | string | null;
}

interface NotificationScreenProps {
  navigation: any;
}

const FALLBACK_AVATAR = DEFAULT_AVATAR_URL;

const parseTimestamp = (value?: string): number => {
  const timestamp = new Date(String(value || "")).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const formatRelativeTime = (value?: string): string => {
  const timestamp = parseTimestamp(value);
  if (!timestamp) {
    return "Recent";
  }

  const diffMinutes = Math.max(1, Math.floor((Date.now() - timestamp) / (1000 * 60)));
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return new Date(timestamp).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
};

const getNotificationGroup = (dateString?: string): string => {
  const timestamp = parseTimestamp(dateString);
  if (!timestamp) {
    return "Earlier";
  }

  const date = new Date(timestamp);
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }
  return "Earlier";
};

const getTargetId = (value?: NotificationTarget | string | null): string => {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return value._id || value.id || "";
};

const getNotificationText = (item: AppNotification): string => {
  switch (item.type) {
    case "follow":
      return "started following you";
    case "like":
      return item.story ? "liked your story" : "liked your post";
    case "comment":
      return "commented on your post";
    case "story_reply":
      return "replied to your story";
    case "mention_story":
      return "mentioned you in a story";
    case "tag_story":
      return "tagged you in a story";
    case "swipe":
      return "matched with you";
    case "service_request":
      return "sent a new service request";
    case "service_request_update":
      return "updated your service request";
    case "live_stream_started":
      return "is live now";
    case "group_join":
      return "joined your group";
    case "group_leave":
      return "left your group";
    case "group_member_added":
      return "added members to a group";
    case "group_member_removed":
      return "removed a member from a group";
    case "group_admin_promoted":
      return "promoted a group admin";
    case "group_admin_demoted":
      return "removed a group admin";
    case "group_owner_transferred":
      return "transferred group ownership";
    case "group_updated":
      return "updated a group";
    default:
      return "sent you an update";
  }
};

const getNotificationIcon = (type: NotificationKind): string => {
  switch (type) {
    case "follow":
      return "person-add";
    case "like":
      return "heart";
    case "comment":
      return "chatbubble";
    case "story_reply":
      return "chatbubble-ellipses";
    case "mention_story":
      return "at";
    case "tag_story":
      return "pricetag";
    case "swipe":
      return "flame";
    case "service_request":
      return "briefcase";
    case "service_request_update":
      return "checkmark-done";
    case "live_stream_started":
      return "radio";
    case "group_join":
      return "person-add";
    case "group_leave":
      return "log-out";
    case "group_member_added":
      return "people";
    case "group_member_removed":
      return "person-remove";
    case "group_admin_promoted":
      return "shield-checkmark";
    case "group_admin_demoted":
      return "shield";
    case "group_owner_transferred":
      return "swap-horizontal";
    case "group_updated":
      return "settings";
    default:
      return "notifications";
  }
};

const getNotificationHint = (item: AppNotification): string => {
  switch (item.type) {
    case "follow":
      return "Open profile";
    case "like":
      return item.story ? "Open story" : "Open post";
    case "comment":
      return "Open post";
    case "story_reply":
      return "Open story";
    case "mention_story":
    case "tag_story":
      return "View story";
    case "service_request":
    case "service_request_update":
      return "Open requests";
    case "live_stream_started":
      return "Watch live";
    case "swipe":
      return "Open swipes";
    case "group_join":
    case "group_leave":
    case "group_member_added":
    case "group_member_removed":
    case "group_admin_promoted":
    case "group_admin_demoted":
    case "group_owner_transferred":
    case "group_updated":
      return "Open group";
    default:
      return "View";
  }
};

const NotificationScreen = ({ navigation }: NotificationScreenProps) => {
  const { colors, isDarkMode } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const res = await API.get("/notifications");
      const nextNotifications = normalizeMediaFieldsDeep(res.data?.notifications || []) as AppNotification[];
      setNotifications(nextNotifications);
      setUnreadCount(Number(res.data?.unreadCount) || 0);
      setErrorMessage("");
    } catch (err) {
      console.log("Notification fetch error:", err);
      setNotifications([]);
      setUnreadCount(0);
      setErrorMessage(getReadableApiErrorMessage(err, "Failed to load notifications."));
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchNotifications();

    connectSocket().catch((error) => {
      console.log("Notification socket connect error:", error);
    });

    const handleRealtimeNotification = (data: AppNotification) => {
      const normalizedNotification = normalizeMediaFieldsDeep(data) as AppNotification;

      setNotifications((prev) => {
        if (prev.some((item) => item._id === normalizedNotification._id)) {
          return prev;
        }

        return [normalizedNotification, ...prev];
      });
      setUnreadCount((prev) => prev + 1);
    };

    socket.on("receiveNotification", handleRealtimeNotification);

    return () => {
      socket.off("receiveNotification", handleRealtimeNotification);
    };
  }, [fetchNotifications]);

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();
    }, [fetchNotifications]),
  );

  const deleteNotification = async (id: string) => {
    try {
      const existing = notifications.find((item) => item._id === id);
      await API.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((notification) => notification._id !== id));
      if (existing?.read === false) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.log("Notification delete error:", err);
    }
  };

  const markAllRead = async () => {
    if (unreadCount <= 0) {
      return;
    }

    try {
      await API.put("/notifications/read-all");
      setUnreadCount(0);
      setNotifications((prev) =>
        prev.map((notification) => ({
          ...notification,
          read: true,
        })),
      );
    } catch (err) {
      console.log("Notification read-all error:", err);
    }
  };

  const handlePress = (item: AppNotification) => {
    if (item._id && item.read === false) {
      API.put(`/notifications/read/${item._id}`, null).catch((error) => {
        console.log("Notification mark-read error:", error);
      });

      setNotifications((prev) =>
        prev.map((notification) =>
          notification._id === item._id
            ? { ...notification, read: true }
            : notification,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    const openStory = async (storyOwnerId?: string) => {
      const storyId = getTargetId(item.story);
      if (!storyId) {
        return;
      }

      navigation.navigate("StoryViewer", {
        storyId,
        storyUserId: storyOwnerId,
      });
    };

    if (item.type === "follow") {
      const userId = getTargetId(item.sender || null);
      if (userId) {
        navigation.navigate("ProfilePreviewScreen", { userId });
      }
      return;
    }

    if (item.type === "like") {
      const storyId = getTargetId(item.story);
      if (storyId) {
        getStoredUserId().then((userId) => openStory(userId || undefined));
        return;
      }

      const postId = getTargetId(item.post);
      if (postId) {
        navigation.navigate("PostDetail", { postId });
      }
      return;
    }

    if (item.type === "comment") {
      const postId = getTargetId(item.post);
      if (postId) {
        navigation.navigate("PostDetail", { postId });
      }
      return;
    }

    if (item.type === "story_reply") {
      getStoredUserId().then((userId) => openStory(userId || undefined));
      return;
    }

    if (item.type === "mention_story" || item.type === "tag_story") {
      openStory(getTargetId(item.sender || null) || undefined);
      return;
    }

    if (item.type === "swipe") {
      navigation.navigate("Swipes");
      return;
    }

    if (item.type === "service_request") {
      navigation.navigate("ServiceRequestsScreen", { mode: "seller" });
      return;
    }

    if (item.type === "service_request_update") {
      navigation.navigate("ServiceRequestsScreen", { mode: "user" });
      return;
    }

    if (item.type === "live_stream_started") {
      const liveStreamId = getTargetId(item.liveStream || null);
      if (liveStreamId) {
        navigation.navigate("LiveStreamScreen", { liveStreamId, mode: "viewer" });
      } else {
        navigation.navigate("LiveStreamsScreen");
      }
      return;
    }

    if (String(item.type || "").startsWith("group_")) {
      const conversationId = getTargetId(item.conversation || null);
      if (conversationId) {
        navigation.navigate("ChatScreen", { conversationId, conversationType: "group" });
      }
      return;
    }
  };

  const sortedNotifications = useMemo(
    () => [...notifications].sort((a, b) => parseTimestamp(b.createdAt) - parseTimestamp(a.createdAt)),
    [notifications],
  );

  const groupedNotifications = useMemo<Record<string, AppNotification[]>>(() => {
    const groups: Record<string, AppNotification[]> = {};
    sortedNotifications.forEach((notification) => {
      const group = getNotificationGroup(notification.createdAt);
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(notification);
    });
    return groups;
  }, [sortedNotifications]);

  const groupKeys = useMemo(() => Object.keys(groupedNotifications), [groupedNotifications]);
  const readCount = Math.max(0, notifications.length - unreadCount);
  const heroGradient = isDarkMode
    ? ["#181F3A", "#141C34", "#11192C"]
    : ["#F8EFFF", "#EEF4FF", "#FFFFFF"];

  const renderRightActions = (id: string) => (
    <TouchableOpacity
      style={[styles.deleteAction, { backgroundColor: colors.danger }]}
      onPress={() => deleteNotification(id)}
    >
      <Icon name="trash-outline" size={20} color="#fff" />
      <Text style={styles.deleteActionText}>Delete</Text>
    </TouchableOpacity>
  );

  const renderNotificationRow = (item: AppNotification, index: number, sectionSize: number) => {
    const actorName = item.sender?.username || "Someone";
    const avatarUrl = normalizeMediaUrl(item.sender?.profilePic || FALLBACK_AVATAR);

    return (
      <Swipeable key={item._id} renderRightActions={() => renderRightActions(item._id)}>
        <TouchableOpacity
          activeOpacity={0.9}
          style={[
            styles.notificationRow,
            index < sectionSize - 1 && [styles.rowDivider, { borderBottomColor: colors.border }],
          ]}
          onPress={() => handlePress(item)}
        >
          <View style={styles.avatarColumn}>
            <Image source={{ uri: avatarUrl || FALLBACK_AVATAR }} style={[styles.avatar, { backgroundColor: colors.surface }]} />
            <View style={[styles.typeBadge, { backgroundColor: colors.primary }]}>
              <Icon name={getNotificationIcon(item.type)} size={12} color="#fff" />
            </View>
          </View>

          <View style={styles.notificationCopy}>
            <View style={styles.notificationTopRow}>
              <Text style={[styles.notificationText, { color: colors.text }]}>
                <Text style={styles.actorName}>{actorName} </Text>
                <Text style={[styles.notificationBody, { color: colors.mutedText }]}>{getNotificationText(item)}</Text>
              </Text>
              {!item.read ? <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} /> : null}
            </View>

            {item.text ? (
              <Text style={[styles.notificationPreview, { color: colors.mutedText }]} numberOfLines={2}>
                {item.text}
              </Text>
            ) : null}

            <View style={styles.notificationMetaRow}>
              <Text style={[styles.notificationTime, { color: colors.mutedText }]}>{formatRelativeTime(item.createdAt)}</Text>
              <Text style={[styles.metaBullet, { color: colors.border }]}>•</Text>
              <Text style={[styles.notificationHint, { color: colors.mutedText }]}>{getNotificationHint(item)}</Text>
            </View>
          </View>

          <Icon name="chevron-forward" size={18} color={colors.tabInactive} />
        </TouchableOpacity>
      </Swipeable>
    );
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={[styles.centered, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        <AppBottomDock navigation={navigation} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.headerButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => navigation.goBack()}
          >
            <Icon name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.headerCopy}>
            <Text style={[styles.headerEyebrow, { color: colors.primary }]}>Activity</Text>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
          </View>

          <TouchableOpacity
            style={[styles.headerButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => navigation.navigate("NotificationSettingsScreen")}
          >
            <Icon name="options-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <FlatList<string>
          data={groupKeys}
          keyExtractor={(item) => item}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: APP_BOTTOM_DOCK_BASE_HEIGHT + Math.max(insets.bottom, 10) + 28 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchNotifications(true).catch(() => {})}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <View>
              <LinearGradient colors={heroGradient} style={[styles.heroPanel, { borderColor: colors.border }]}>
                <View style={styles.heroTopRow}>
                  <View>
                    <Text style={[styles.heroTitle, { color: colors.text }]}>Stay on top of every signal</Text>
                    <Text style={[styles.heroSubtitle, { color: colors.mutedText }]}>
                      {errorMessage || (unreadCount > 0 ? `${unreadCount} new updates waiting for you.` : "Everything is cleared and up to date.")}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.heroButton,
                      {
                        backgroundColor: unreadCount > 0 ? colors.primary : colors.surface,
                        opacity: unreadCount > 0 ? 1 : 0.72,
                      },
                    ]}
                    onPress={markAllRead}
                    disabled={unreadCount <= 0}
                  >
                    <Text style={[styles.heroButtonText, { color: unreadCount > 0 ? "#fff" : colors.mutedText }]}>
                      Mark all read
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.heroStats}>
                  <View style={[styles.heroStatCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.heroStatValue, { color: colors.text }]}>{notifications.length}</Text>
                    <Text style={[styles.heroStatLabel, { color: colors.mutedText }]}>Total</Text>
                  </View>
                  <View style={[styles.heroStatCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.heroStatValue, { color: colors.text }]}>{unreadCount}</Text>
                    <Text style={[styles.heroStatLabel, { color: colors.mutedText }]}>Unread</Text>
                  </View>
                  <View style={[styles.heroStatCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.heroStatValue, { color: colors.text }]}>{readCount}</Text>
                    <Text style={[styles.heroStatLabel, { color: colors.mutedText }]}>Read</Text>
                  </View>
                </View>
              </LinearGradient>

              {!errorMessage && notifications.length ? (
                <View style={styles.sectionIntro}>
                  <Text style={[styles.sectionIntroTitle, { color: colors.text }]}>Recent activity</Text>
                  <Text style={[styles.sectionIntroText, { color: colors.mutedText }]}>
                    Follows, comments, likes, story interactions, and service updates appear here in one stream.
                  </Text>
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.emptyIconWrap, { backgroundColor: `${colors.primary}16` }]}>
                <Icon name={errorMessage ? "cloud-offline-outline" : "notifications-outline"} size={28} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {errorMessage ? "Notifications unavailable" : "No notifications yet"}
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedText }]}>
                {errorMessage || "When people interact with your profile, posts, stories, or services, updates will show up here."}
              </Text>
              <TouchableOpacity
                style={[styles.emptyButton, { backgroundColor: colors.primary }]}
                onPress={() => (errorMessage ? fetchNotifications().catch(() => {}) : navigation.navigate("NotificationSettingsScreen"))}
              >
                <Text style={styles.emptyButtonText}>{errorMessage ? "Try again" : "Open settings"}</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.groupBlock}>
              <Text style={[styles.groupTitle, { color: colors.mutedText }]}>{item}</Text>
              <View style={[styles.groupPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {groupedNotifications[item].map((notification, index) =>
                  renderNotificationRow(notification, index, groupedNotifications[item].length),
                )}
              </View>
            </View>
          )}
        />
      </SafeAreaView>
      <AppBottomDock navigation={navigation} />
    </View>
  );
};

export default NotificationScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
    paddingHorizontal: 14,
  },
  headerEyebrow: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  headerTitle: {
    marginTop: 3,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  heroPanel: {
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "800",
    maxWidth: 220,
  },
  heroSubtitle: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 250,
  },
  heroButton: {
    minHeight: 40,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
    marginLeft: 12,
  },
  heroButtonText: {
    fontWeight: "800",
    fontSize: 12.5,
  },
  heroStats: {
    flexDirection: "row",
    marginTop: 18,
  },
  heroStatCard: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginRight: 10,
  },
  heroStatValue: {
    fontSize: 22,
    fontWeight: "800",
  },
  heroStatLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
  },
  sectionIntro: {
    paddingHorizontal: 4,
    paddingTop: 18,
  },
  sectionIntroTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  sectionIntroText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
  },
  groupBlock: {
    marginTop: 18,
  },
  groupTitle: {
    marginBottom: 8,
    marginLeft: 4,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  groupPanel: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  notificationRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarColumn: {
    position: "relative",
    marginRight: 14,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  typeBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  notificationCopy: {
    flex: 1,
    minWidth: 0,
  },
  notificationTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  notificationText: {
    flex: 1,
    fontSize: 14.5,
    lineHeight: 20,
    paddingRight: 10,
  },
  actorName: {
    fontWeight: "800",
  },
  notificationBody: {
    fontWeight: "500",
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  notificationMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  notificationPreview: {
    marginTop: 6,
    fontSize: 12.5,
    lineHeight: 18,
  },
  notificationTime: {
    fontSize: 12,
    fontWeight: "700",
  },
  metaBullet: {
    marginHorizontal: 8,
    fontSize: 12,
  },
  notificationHint: {
    fontSize: 12,
    fontWeight: "600",
  },
  deleteAction: {
    width: 92,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 18,
    marginVertical: 6,
    marginRight: 2,
  },
  deleteActionText: {
    marginTop: 4,
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  emptyState: {
    marginTop: 18,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 22,
    paddingVertical: 28,
    alignItems: "center",
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: "800",
  },
  emptyText: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 13.5,
    lineHeight: 20,
  },
  emptyButton: {
    marginTop: 18,
    minHeight: 44,
    borderRadius: 16,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },
});
