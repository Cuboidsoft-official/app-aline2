import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { connectSocket, socket } from "../socket";
import { Swipeable } from "react-native-gesture-handler";
import { getStoredUserId } from "../utils/authSession";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { useAppTheme } from "../theme/AppThemeContext";

type NotificationKind =
  | "follow"
  | "like"
  | "comment"
  | "story_reply"
  | "mention_story"
  | "tag_story"
  | "service_request"
  | "service_request_update"
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
}

interface AppNotification {
  _id: string;
  type: NotificationKind;
  createdAt: string;
  read?: boolean;
  sender?: NotificationUser | null;
  post?: NotificationTarget | string | null;
  story?: NotificationTarget | string | null;
}

interface NotificationScreenProps {
  navigation: any;
}

const FALLBACK_AVATAR = DEFAULT_AVATAR_URL;

const NotificationScreen = ({ navigation }: NotificationScreenProps) => {
  const { colors, isDarkMode } = useAppTheme();
  const notificationCardShadowColor = isDarkMode ? "#000" : "#111827";
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
      setNotifications((res.data?.notifications || []) as AppNotification[]);
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

    socket.on("connect", () => console.log("Socket connected"));

    socket.on("receiveNotification", (data: AppNotification) => {
      setNotifications(prev => {
        if (prev.some((item) => item._id === data._id)) {
          return prev;
        }

        return [data, ...prev];
      });
      setUnreadCount(prev => prev + 1);
    });

    return () => {
      socket.off("connect");
      socket.off("receiveNotification");
    };
  }, [fetchNotifications]);

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();
    }, [fetchNotifications])
  );

  const deleteNotification = async (id: string) => {
    try {
      const existing = notifications.find((item) => item._id === id);
      await API.delete(`/notifications/${id}`);
      setNotifications(prev => prev.filter(n => n._id !== id));
      if (existing?.read === false) {
        setUnreadCount(prev => Math.max(0, prev - 1));
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
        }))
      );
    } catch (err) {
      console.log("Notification read-all error:", err);
    }
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

  const handlePress = (item: AppNotification) => {
    if (item._id && item.read === false) {
      API.put(`/notifications/read/${item._id}`, null).catch((error) => {
        console.log("Notification mark-read error:", error);
      });

      setNotifications((prev) =>
        prev.map((notification) =>
          notification._id === item._id
            ? { ...notification, read: true }
            : notification
        )
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
    }
  };

  const getNotificationText = (item: AppNotification): string => {
    switch (item.type) {
      case "follow":
        return " started following you";
      case "like":
        return item.story ? " liked your story ❤️" : " liked your post ❤️";
      case "comment":
        return " commented on your post 💬";
      case "story_reply":
        return " replied to your story 💬";
      case "mention_story":
        return " mentioned you in a story @";
      case "tag_story":
        return " tagged you in a story @";
      case "swipe":
        return " matched with you 🔥";
      case "service_request":
        return " sent a service request 📋";
      case "service_request_update":
        return " updated your service request 📌";
      default:
        return " sent notification";
    }
  };

  const getIcon = (type: NotificationKind): string => {
    switch (type) {
      case "follow":
        return "person-add-outline";
      case "like":
        return "heart-outline";
      case "comment":
        return "chatbubble-outline";
      case "story_reply":
        return "chatbubble-ellipses-outline";
      case "mention_story":
        return "at-outline";
      case "tag_story":
        return "pricetag-outline";
      case "swipe":
        return "flame-outline";
      case "service_request":
        return "briefcase-outline";
      case "service_request_update":
        return "checkmark-done-outline";
      default:
        return "notifications-outline";
    }
  };

  const getNotificationGroup = (dateString?: string): string => {
    if (!dateString) {
      return "Earlier";
    }

    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return "Earlier";
  };

  const grouped = useMemo<Record<string, AppNotification[]>>(() => {
    const groups: Record<string, AppNotification[]> = {};
    notifications.forEach((n) => {
      const group = getNotificationGroup(n.createdAt);
      if (!groups[group]) groups[group] = [];
      groups[group].push(n);
    });
    return groups;
  }, [notifications]);

  const groupKeys = useMemo(() => Object.keys(grouped), [grouped]);

  const renderRightActions = (id: string) => (
    <TouchableOpacity style={[styles.deleteBtn, { backgroundColor: colors.danger }]} onPress={() => deleteNotification(id)}>
      <Icon name="trash" size={22} color="#fff" />
    </TouchableOpacity>
  );

  const renderNotification = ({ item }: { item: AppNotification }) => (
    <Swipeable renderRightActions={() => renderRightActions(item._id)}>
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            shadowColor: notificationCardShadowColor,
          },
        ]}
        onPress={() => handlePress(item)}
      >
        <Image
          source={{ uri: item.sender?.profilePic || FALLBACK_AVATAR }}
          style={[styles.avatar, { backgroundColor: colors.surface }]}
        />
        <View style={styles.content}>
          <Text style={[styles.title, { color: colors.text }]}>
            {item.sender?.username || "Someone"}
            <Text style={[styles.msg, { color: colors.mutedText }]}> {getNotificationText(item)}</Text>
          </Text>
          <Text style={[styles.time, { color: colors.mutedText }]}>
            {new Date(item.createdAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "numeric",
              hour12: true
            })}
          </Text>
        </View>

        {!item.read ? <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} /> : null}
        <Icon name={getIcon(item.type)} size={22} color={colors.mutedText} />
      </TouchableOpacity>
    </Swipeable>
  );

  if (loading) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      <View style={[styles.header, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
          <Text style={[styles.headerSubtitle, { color: colors.mutedText }]}>
            {errorMessage || (unreadCount > 0 ? `${unreadCount} unread` : "All caught up")}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.headerAction,
            {
              backgroundColor: colors.surface,
              opacity: unreadCount > 0 ? 1 : 0.6,
            },
          ]}
          onPress={markAllRead}
          disabled={unreadCount <= 0}
        >
          <Text style={[styles.headerActionText, { color: colors.primary }]}>Read all</Text>
        </TouchableOpacity>
      </View>

      <FlatList<string>
        data={groupKeys}
        keyExtractor={(item) => item}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchNotifications(true).catch(() => {})}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={[styles.headerTitle, styles.emptyTitle, { color: colors.text }]}>
              {errorMessage ? "Notifications unavailable" : "No notifications yet"}
            </Text>
            <Text style={[styles.headerSubtitle, styles.emptySubtitle, { color: colors.mutedText }]}>
              {errorMessage || "Your latest follows, likes, comments, and requests will appear here."}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View>
            <Text style={[styles.groupTitle, { color: colors.mutedText }]}>{item}</Text>
            {grouped[item].map((notification) => (
              <View key={notification._id}>{renderNotification({ item: notification })}</View>
            ))}
          </View>
        )}
      />
    </SafeAreaView>
  );
};

export default NotificationScreen;

const styles = StyleSheet.create({
  container:{flex:1},
  header:{flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingHorizontal:18, paddingBottom:14, borderBottomWidth:1},
  headerCopy:{flex:1, marginLeft:14},
  headerTitle:{fontSize:19, fontWeight:"600", letterSpacing:0.3},
  headerSubtitle:{marginTop:4, fontSize:12},
  headerAction:{paddingHorizontal:12, paddingVertical:8, borderRadius:12},
  headerActionText:{fontWeight:"600", fontSize:12},
  groupTitle:{fontSize:16, fontWeight:"600", marginLeft:20, marginTop:20, marginBottom:5},
  card:{flexDirection:"row", alignItems:"center", paddingVertical:14, paddingHorizontal:14, marginHorizontal:14, marginTop:10, borderRadius:16, shadowOpacity:0.06, shadowRadius:8, shadowOffset:{width:0,height:2}, elevation:3},
  avatar:{width:52, height:52, borderRadius:26, marginRight:14},
  content:{flex:1},
  title:{fontWeight:"600", fontSize:14},
  msg:{fontWeight:"400", fontSize:14},
  time:{fontSize:12, marginTop:4},
  deleteBtn:{justifyContent:"center", alignItems:"center", width:80, marginTop:10, borderTopRightRadius:0, borderBottomRightRadius:0},
  center:{flex:1, justifyContent:"center", alignItems:"center"},
  unreadDot:{width:10, height:10, borderRadius:5, marginRight:10},
  emptyTitle:{fontSize:17},
  emptySubtitle:{textAlign:"center", marginTop:8}
});
