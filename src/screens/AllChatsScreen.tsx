import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput
} from "react-native";
import { Alert } from "../utils/appAlert";
import { SafeAreaView } from "react-native-safe-area-context";

import { useFocusEffect } from "@react-navigation/native";
import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import Icon from "react-native-vector-icons/Ionicons";
import { getStoredUserId } from "../utils/authSession";
import { createChatConversation, createGroupChatConversation, fetchChatConversations, forwardChatMessage } from "../utils/chatApi";
import { getConversationPreview } from "../utils/chatPresentation";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { useAppTheme } from "../theme/AppThemeContext";
import { connectSocket, socket } from "../socket";
import AISupportSheet from "../components/chat/AISupportSheet";

interface ChatUser {
  _id: string;
  username?: string;
  name?: string;
  profilePic?: string;
  sellerProfile?: string;
  category?: string;
}

interface SellerServiceSummary {
  _id?: string;
  serviceName?: string;
  seller?: {
    _id?: string;
    sellerName?: string;
    user?: string;
  } | null;
}

interface Conversation {
  _id: string;
  conversationType?: "direct" | "seller" | "group";
  otherUser?: ChatUser | null;
  sellerUser?: ChatUser | null;
  service?: SellerServiceSummary | null;
  members?: ChatUser[];
  groupName?: string | null;
  groupAvatar?: string | null;
  memberCount?: number;
  updatedAt?: string;
  lastMessageTime?: string;
  lastMessageText?: string;
  lastMessageType?: string;
  unreadCount?: number;
}

interface ForwardTarget {
  key: string;
  label: string;
  conversationType: "direct" | "seller" | "group";
  conversationId?: string;
  userId?: string;
}

type ChatTab = "regular" | "seller" | "group";

const formatConversationTime = (value?: string) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};

const AllChatsScreen = ({ navigation, route }: any) => {
  const { colors, isDarkMode } = useAppTheme();
  const accentColor = colors.primary;
  const accentSoft = `${accentColor}16`;
  const accentBorder = `${accentColor}36`;
  const tabsBackgroundColor = isDarkMode ? colors.surface : colors.card;
  const groupAvatarBackgroundColor = isDarkMode ? colors.surface : colors.card;
  const modalInputBackgroundColor = isDarkMode ? colors.surface : colors.background;
  const disabledCreateGroupColor = isDarkMode ? colors.surface : colors.border;

  const [users, setUsers] = useState<ChatUser[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeTab, setActiveTab] = useState<ChatTab>("regular");
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [eligibleGroupMemberIds, setEligibleGroupMemberIds] = useState<string[]>([]);
  const [selectedForwardTargets, setSelectedForwardTargets] = useState<Record<string, ForwardTarget>>({});
  const [forwarding, setForwarding] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const forwardMessageId = String(route?.params?.forwardMessageId || "");
  const isForwardMode = Boolean(forwardMessageId);
  const headerSubtitle = isForwardMode
    ? "Choose one or more chats to forward this message."
    : activeTab === "seller"
      ? "Seller conversations with cleaner, faster access."
      : activeTab === "group"
        ? "Shared spaces for multiple people in one thread."
        : "Recent direct messages with a tighter, easier layout.";

  useEffect(() => {
    if (!isForwardMode) {
      setSelectedForwardTargets({});
      setForwarding(false);
    }
  }, [isForwardMode]);

  const fetchChatData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const currentUserId = await getStoredUserId();
      const conversationType = activeTab === "seller"
        ? "seller"
        : activeTab === "group"
          ? "group"
          : "direct";
      const userQuery = activeTab === "seller"
        ? { category: "Seller" }
        : activeTab === "group"
          ? {}
          : { excludeCategory: "Seller" };

      const [usersRes, conversationsRes] = await Promise.all([
        API.get("/auth/users", { params: userQuery }),
        fetchChatConversations({ conversationType }),
      ]);

      const profileRes = await API.get("/auth/profile");
      const me = profileRes?.data?.user || {};
      const followingIds = new Set((Array.isArray(me?.following) ? me.following : []).map((entry: any) => String(entry || "")));
      const followerIds = new Set((Array.isArray(me?.followers) ? me.followers : []).map((entry: any) => String(entry || "")));

      const fetchedUsers = ((usersRes?.data?.users || []) as ChatUser[]).filter(
        (user: ChatUser) => user?._id !== currentUserId
      );
      const mutualIds = fetchedUsers
        .map((user) => String(user?._id || ""))
        .filter((id) => id && followingIds.has(id) && followerIds.has(id));

      setUsers(fetchedUsers);
      setEligibleGroupMemberIds(mutualIds);
      setConversations((conversationsRes?.conversations || []) as Conversation[]);
      setErrorMessage("");
    } catch (error) {
      console.log("Chats Error:", error);
      setUsers([]);
      setConversations([]);
      setErrorMessage(getReadableApiErrorMessage(error, "Failed to load chats."));
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [activeTab]);

  const eligibleGroupUsers = useMemo(() => {
    const eligibleSet = new Set(eligibleGroupMemberIds);
    return users.filter((user) => eligibleSet.has(String(user?._id || "")));
  }, [eligibleGroupMemberIds, users]);

  useFocusEffect(
    useCallback(() => {
      fetchChatData();
    }, [fetchChatData])
  );

  useEffect(() => {
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }

      refreshTimeout = setTimeout(() => {
        fetchChatData(true).catch((error) => {
          console.log("Chats realtime refresh error:", error);
        });
      }, 180);
    };

    connectSocket().catch((error) => {
      console.log("Chats socket connect error:", error);
    });

    socket.on("receiveMessage", scheduleRefresh);
    socket.on("messageSeen", scheduleRefresh);
    socket.on("call:incoming", scheduleRefresh);
    socket.on("call:status", scheduleRefresh);

    return () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }

      socket.off("receiveMessage", scheduleRefresh);
      socket.off("messageSeen", scheduleRefresh);
      socket.off("call:incoming", scheduleRefresh);
      socket.off("call:status", scheduleRefresh);
    };
  }, [fetchChatData]);

  const conversationMap = useMemo(() => {
    return new Map(
      conversations
        .filter((conversation): conversation is Conversation & { otherUser: ChatUser } => Boolean(conversation?.otherUser?._id))
        .map((conversation) => [conversation.otherUser._id, conversation] as const)
    );
  }, [conversations]);

  const orderedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const conversationA = conversationMap.get(a._id);
      const conversationB = conversationMap.get(b._id);
      const timeA = conversationA ? new Date(conversationA.updatedAt || conversationA.lastMessageTime || 0).getTime() : 0;
      const timeB = conversationB ? new Date(conversationB.updatedAt || conversationB.lastMessageTime || 0).getTime() : 0;

      if (timeA !== timeB) {
        return timeB - timeA;
      }

      return String(a?.username || a?.name || "").localeCompare(
        String(b?.username || b?.name || "")
      );
    });
  }, [conversationMap, users]);

  const orderedSellerConversations = useMemo(() => {
    return [...conversations]
      .filter((conversation) => conversation?.service || conversation?.sellerUser || conversation?.otherUser?.sellerProfile)
      .sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.lastMessageTime || 0).getTime();
        const timeB = new Date(b.updatedAt || b.lastMessageTime || 0).getTime();
        return timeB - timeA;
      });
  }, [conversations]);

  const orderedRegularConversations = useMemo(() => {
    return [...conversations]
      .filter((conversation) => {
        if (conversation?.conversationType === "group") {
          return false;
        }

        return !(conversation?.service || conversation?.sellerUser || conversation?.otherUser?.sellerProfile);
      })
      .sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.lastMessageTime || 0).getTime();
        const timeB = new Date(b.updatedAt || b.lastMessageTime || 0).getTime();
        return timeB - timeA;
      });
  }, [conversations]);

  const orderedGroupConversations = useMemo(() => {
    return [...conversations]
      .filter((conversation) => conversation?.conversationType === "group")
      .sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.lastMessageTime || 0).getTime();
        const timeB = new Date(b.updatedAt || b.lastMessageTime || 0).getTime();
        return timeB - timeA;
      });
  }, [conversations]);

  const closeGroupModal = useCallback(() => {
    setGroupModalVisible(false);
    setGroupName("");
    setSelectedGroupMembers([]);
  }, []);

  const toggleGroupMember = useCallback((memberId: string) => {
    setSelectedGroupMembers((prev) =>
      prev.includes(memberId)
        ? prev.filter((entry) => entry !== memberId)
        : [...prev, memberId]
    );
  }, []);

  const createGroup = useCallback(async () => {
    if (!groupName.trim()) {
      setErrorMessage("Enter a group name to continue.");
      return;
    }

    if (selectedGroupMembers.length < 2) {
      setErrorMessage("Choose at least two other people for a group chat.");
      return;
    }

    try {
      setCreatingGroup(true);
      const response = await createGroupChatConversation({
        groupName: groupName.trim(),
        memberIds: selectedGroupMembers,
      });

      const conversation = response?.conversation;
      closeGroupModal();
      await fetchChatData(true);

      if (conversation?._id) {
        navigation.navigate("ChatScreen", {
          conversationId: conversation._id,
          conversationType: "group",
          groupName: conversation.groupName,
          groupAvatar: conversation.groupAvatar,
          memberCount: conversation.memberCount || conversation.members?.length || 0,
        });
      }
    } catch (error) {
      setErrorMessage(getReadableApiErrorMessage(error, "Failed to create group chat."));
    } finally {
      setCreatingGroup(false);
    }
  }, [closeGroupModal, fetchChatData, groupName, navigation, selectedGroupMembers]);

  const selectedForwardTargetList = useMemo(
    () => Object.values(selectedForwardTargets),
    [selectedForwardTargets],
  );

  const toggleForwardTarget = useCallback((target: ForwardTarget) => {
    setSelectedForwardTargets((current) => {
      if (current[target.key]) {
        const nextTargets = { ...current };
        delete nextTargets[target.key];
        return nextTargets;
      }

      return {
        ...current,
        [target.key]: target,
      };
    });
  }, []);

  const resolveForwardConversationId = useCallback(async (target: ForwardTarget) => {
    if (target.conversationId) {
      return String(target.conversationId);
    }

    if (!target.userId) {
      throw new Error("Unable to prepare this chat for forwarding.");
    }

    const existingConversation = conversationMap.get(target.userId);
    if (existingConversation?._id) {
      return String(existingConversation._id);
    }

    const createdConversation = await createChatConversation({
      receiverId: target.userId,
      conversationType: target.conversationType === "seller" ? "seller" : "direct",
    });

    const nextConversationId = String(createdConversation?.conversation?._id || "");
    if (!nextConversationId) {
      throw new Error("Unable to prepare this chat for forwarding.");
    }

    return nextConversationId;
  }, [conversationMap]);

  const completeForward = useCallback(async () => {
    if (!forwardMessageId || !selectedForwardTargetList.length || forwarding) {
      return;
    }

    try {
      setForwarding(true);
      const results = await Promise.allSettled(
        selectedForwardTargetList.map(async (target) => {
          const targetConversationId = await resolveForwardConversationId(target);
          await forwardChatMessage({
            messageId: forwardMessageId,
            targetConversationId,
          });
          return target;
        }),
      );

      const successCount = results.filter((result) => result.status === "fulfilled").length;
      const failedCount = results.length - successCount;

      if (!successCount) {
        const firstFailure = results.find((result) => result.status === "rejected");
        throw firstFailure?.status === "rejected"
          ? firstFailure.reason
          : new Error("Unable to forward this message right now.");
      }

      if (failedCount > 0) {
        Alert.alert("Partially forwarded", `Forwarded to ${successCount} chats. ${failedCount} failed.`);
      } else {
        Alert.alert(
          "Message forwarded",
          `Forwarded to ${successCount} ${successCount === 1 ? "chat" : "chats"}.`,
        );
      }

      navigation.goBack();
    } catch (error) {
      Alert.alert("Forward failed", getReadableApiErrorMessage(error, "Unable to forward this message right now."));
    } finally {
      setForwarding(false);
    }
  }, [forwardMessageId, forwarding, navigation, resolveForwardConversationId, selectedForwardTargetList]);

  const handleForwardToUser = useCallback(async (user: ChatUser, conversationType: "direct" | "seller") => {
    toggleForwardTarget({
      key: `user:${conversationType}:${user._id}`,
      label: user.username || user.name || "User",
      conversationType,
      conversationId: conversationMap.get(user._id)?._id,
      userId: user._id,
    });
  }, [conversationMap, toggleForwardTarget]);

  const renderChat = ({ item }: { item: ChatUser }) => {
    const conversation = conversationMap.get(item._id);
    const subtitle = getConversationPreview(conversation)
      || (activeTab === "seller" ? "Tap to start seller conversation" : "Tap to start conversation");
    const forwardTarget: ForwardTarget = {
      key: `user:${activeTab === "seller" ? "seller" : "direct"}:${item._id}`,
      label: item.username || item.name || "User",
      conversationType: activeTab === "seller" ? "seller" : "direct",
      conversationId: conversation?._id,
      userId: item._id,
    };
    const isSelectedForForward = Boolean(selectedForwardTargets[forwardTarget.key]);

    return (
      <TouchableOpacity
        style={[
          styles.chatCard,
          {
            borderColor: isSelectedForForward ? accentColor : colors.border,
            backgroundColor: isSelectedForForward ? accentSoft : colors.card,
          },
          isSelectedForForward ? styles.chatCardSelected : null,
        ]}
        onPress={() => {
          if (isForwardMode) {
            handleForwardToUser(item, activeTab === "seller" ? "seller" : "direct").catch(() => { });
            return;
          }

          navigation.navigate("ChatScreen", {
            userId: item._id,
            conversationId: conversation?._id,
            conversationType: activeTab === "seller" ? "seller" : "direct"
          });
        }}
      >
        <View style={styles.avatarContainer}>
          <Image
            source={{
              uri: item.profilePic || DEFAULT_AVATAR_URL
            }}
            style={styles.avatar}
          />

          <View style={[styles.onlineDot, { borderColor: colors.card }]}/>
        </View>

        <View style={styles.chatInfo}>
          <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>
            {item.username || item.name || "User"}
          </Text>

          <Text style={[styles.lastMessage, { color: colors.mutedText }]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>

        <View style={styles.chatMeta}>
          {isForwardMode ? (
            <View style={[styles.forwardCheck, isSelectedForForward ? { backgroundColor: colors.primary, borderColor: colors.primary } : { borderColor: colors.border }]}>
              {isSelectedForForward ? <Icon name="checkmark" size={14} color="#fff" /> : null}
            </View>
          ) : !!conversation?.unreadCount ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
              </Text>
            </View>
          ) : null}

          <Icon name={isForwardMode && isSelectedForForward ? "checkmark-circle" : "chevron-forward-outline"} size={20} color={isForwardMode && isSelectedForForward ? colors.primary : colors.mutedText}/>
        </View>
      </TouchableOpacity>
    );
  };

  const renderRegularConversation = ({ item }: { item: Conversation }) => {
    const participant = item?.otherUser || item?.sellerUser;
    const subtitle = getConversationPreview(item) || "Tap to open conversation";
    const timestamp = formatConversationTime(item?.updatedAt || item?.lastMessageTime);
    const forwardTarget: ForwardTarget = {
      key: `conversation:direct:${item._id}`,
      label: participant?.username || participant?.name || "User",
      conversationType: "direct",
      conversationId: item._id,
      userId: participant?._id,
    };
    const isSelectedForForward = Boolean(selectedForwardTargets[forwardTarget.key]);

    return (
      <TouchableOpacity
        style={[
          styles.chatCard,
          {
            borderColor: isSelectedForForward ? accentColor : colors.border,
            backgroundColor: isSelectedForForward ? accentSoft : colors.card,
          },
          isSelectedForForward ? styles.chatCardSelected : null,
        ]}
        onPress={() => {
          if (isForwardMode) {
            toggleForwardTarget(forwardTarget);
            return;
          }

          navigation.navigate("ChatScreen", {
            userId: participant?._id,
            conversationId: item?._id,
            conversationType: "direct",
          });
        }}
      >
        <View style={styles.avatarContainer}>
          <Image
            source={{
              uri: participant?.profilePic || DEFAULT_AVATAR_URL,
            }}
            style={styles.avatar}
          />

          {!!item?.unreadCount && <View style={[styles.onlineDot, styles.unreadDot, { borderColor: colors.card }]} />}
        </View>

        <View style={styles.chatInfo}>
          <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>
            {participant?.username || participant?.name || "User"}
          </Text>

          <Text style={[styles.lastMessage, { color: colors.mutedText }]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>

        <View style={styles.chatMeta}>
          {timestamp && !isForwardMode ? (
            <Text style={[styles.chatTimestamp, { color: item?.unreadCount ? colors.primary : colors.mutedText }]}>
              {timestamp}
            </Text>
          ) : null}

          {isForwardMode ? (
            <View style={[styles.forwardCheck, isSelectedForForward ? { backgroundColor: colors.primary, borderColor: colors.primary } : { borderColor: colors.border }]}>
              {isSelectedForForward ? <Icon name="checkmark" size={14} color="#fff" /> : null}
            </View>
          ) : !!item?.unreadCount ? <View style={styles.unreadBadge} /> : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSellerConversation = ({ item }: { item: Conversation }) => {
    const sellerUserId = item?.sellerUser?._id || item?.otherUser?._id || "";
    const sellerId = item?.service?.seller?._id || item?.otherUser?.sellerProfile || "";
    const sellerName = item?.service?.seller?.sellerName || item?.otherUser?.username || item?.otherUser?.name || "Seller";
    const profilePic = item?.otherUser?.profilePic || item?.sellerUser?.profilePic || DEFAULT_AVATAR_URL;
    const hasSellerLink = Boolean(sellerUserId && sellerId);
    const subtitleParts = [
      item?.service?.serviceName ? `Service: ${item.service.serviceName}` : "",
      getConversationPreview(item),
    ].filter(Boolean);
    const timestamp = formatConversationTime(item?.updatedAt || item?.lastMessageTime);
    const forwardTarget: ForwardTarget = {
      key: `conversation:seller:${item._id}`,
      label: sellerName,
      conversationType: "seller",
      conversationId: item._id,
      userId: sellerUserId,
    };
    const isSelectedForForward = Boolean(selectedForwardTargets[forwardTarget.key]);

    const handlePress = () => {
      if (!hasSellerLink) {
        return;
      }

      if (isForwardMode) {
        toggleForwardTarget(forwardTarget);
        return;
      }

      navigation.navigate("SellerChatScreen", {
        sellerId,
        sellerUserId,
        conversationId: item._id,
        serviceId: item?.service?._id,
        serviceName: item?.service?.serviceName,
      });
    };

    return (
      <TouchableOpacity
        style={[
          styles.chatCard,
          {
            borderColor: isSelectedForForward ? accentColor : colors.border,
            backgroundColor: isSelectedForForward ? accentSoft : colors.card,
          },
          !hasSellerLink ? styles.chatCardDisabled : null,
          isSelectedForForward ? styles.chatCardSelected : null,
        ]}
        onPress={handlePress}
        disabled={!hasSellerLink}
        activeOpacity={hasSellerLink ? 0.85 : 1}
      >
        <View style={styles.avatarContainer}>
          <Image
            source={{
              uri: profilePic
            }}
            style={styles.avatar}
          />

          <View style={[styles.onlineDot, { borderColor: colors.card }]}/>
        </View>

        <View style={styles.chatInfo}>
          <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>
            {sellerName}
          </Text>

          <Text style={[styles.lastMessage, { color: colors.mutedText }]} numberOfLines={2}>
            {hasSellerLink
              ? subtitleParts.join(" • ") || "Tap to open seller conversation"
              : "This seller conversation is temporarily unavailable while profile details finish syncing."}
          </Text>
        </View>

        <View style={styles.chatMeta}>
          {timestamp && !isForwardMode ? (
            <Text style={[styles.chatTimestamp, { color: item?.unreadCount ? colors.primary : colors.mutedText }]}>
              {timestamp}
            </Text>
          ) : null}

          {isForwardMode ? (
            <View style={[styles.forwardCheck, isSelectedForForward ? { backgroundColor: colors.primary, borderColor: colors.primary } : { borderColor: colors.border }]}>
              {isSelectedForForward ? <Icon name="checkmark" size={14} color="#fff" /> : null}
            </View>
          ) : !!item?.unreadCount ? <View style={styles.unreadBadge} /> : null}

          <Icon
            name={
              isForwardMode && isSelectedForForward
                ? "checkmark-circle"
                : hasSellerLink
                  ? "chevron-forward-outline"
                  : "alert-circle-outline"
            }
            size={20}
            color={
              isForwardMode && isSelectedForForward
                ? colors.primary
                : hasSellerLink
                  ? colors.mutedText
                  : colors.placeholder
            }
          />
        </View>
      </TouchableOpacity>
    );
  };

  const renderGroupConversation = ({ item }: { item: Conversation }) => {
    const title = item?.groupName || "Group chat";
    const subtitle = getConversationPreview(item)
      || `${item?.memberCount || item?.members?.length || 0} members`;
    const timestamp = formatConversationTime(item?.updatedAt || item?.lastMessageTime);
    const forwardTarget: ForwardTarget = {
      key: `conversation:group:${item._id}`,
      label: title,
      conversationType: "group",
      conversationId: item._id,
    };
    const isSelectedForForward = Boolean(selectedForwardTargets[forwardTarget.key]);

    return (
      <TouchableOpacity
        style={[
          styles.chatCard,
          {
            borderColor: isSelectedForForward ? accentColor : colors.border,
            backgroundColor: isSelectedForForward ? accentSoft : colors.card,
          },
          isSelectedForForward ? styles.chatCardSelected : null,
        ]}
        onPress={() => {
          if (isForwardMode) {
            toggleForwardTarget(forwardTarget);
            return;
          }

          navigation.navigate("ChatScreen", {
            conversationId: item._id,
            conversationType: "group",
            groupName: item?.groupName,
            groupAvatar: item?.groupAvatar,
            memberCount: item?.memberCount || item?.members?.length || 0,
          });
        }}
      >
        {item?.groupAvatar ? (
          <View style={styles.avatarContainer}>
            <Image source={{ uri: item.groupAvatar }} style={styles.avatar} />
          </View>
        ) : (
          <View style={[styles.groupAvatarCard, { backgroundColor: groupAvatarBackgroundColor }]}>
            <Icon name="people-outline" size={22} color={colors.primary} />
          </View>
        )}

        <View style={styles.chatInfo}>
          <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.lastMessage, { color: colors.mutedText }]} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>

        <View style={styles.chatMeta}>
          {timestamp && !isForwardMode ? (
            <Text style={[styles.chatTimestamp, { color: item?.unreadCount ? colors.primary : colors.mutedText }]}>
              {timestamp}
            </Text>
          ) : null}

          {isForwardMode ? (
            <View style={[styles.forwardCheck, isSelectedForForward ? { backgroundColor: colors.primary, borderColor: colors.primary } : { borderColor: colors.border }]}>
              {isSelectedForForward ? <Icon name="checkmark" size={14} color="#fff" /> : null}
            </View>
          ) : !!item?.unreadCount ? <View style={styles.unreadBadge} /> : null}

          <Icon name={isForwardMode && isSelectedForForward ? "checkmark-circle" : "chevron-forward-outline"} size={20} color={isForwardMode && isSelectedForForward ? colors.primary : colors.mutedText}/>
        </View>
      </TouchableOpacity>
    );
  };

  const listData = activeTab === "seller"
    ? orderedSellerConversations
    : activeTab === "group"
      ? orderedGroupConversations
      : isForwardMode
        ? orderedUsers
        : orderedRegularConversations;
  const renderListItem = activeTab === "seller"
    ? renderSellerConversation
    : activeTab === "group"
      ? renderGroupConversation
      : isForwardMode
        ? renderChat
        : renderRegularConversation;
  const keyExtractor = (item: ChatUser | Conversation) => item._id;
  const assistantScope = activeTab === "seller"
    ? "Seller chats inbox support"
    : activeTab === "group"
      ? "Group chats inbox support"
      : "Direct chats inbox support";
  const assistantScopeHint = headerSubtitle;
  const assistantConversationSummary = `Visible chats in this tab: ${listData.length}. Forward mode: ${isForwardMode ? "on" : "off"}.`;
  const assistantSuggestedPrompts = activeTab === "seller"
    ? ["Explain the seller chat flow", "Where do appointments appear?", "Fix the seller inbox issue"]
    : activeTab === "group"
      ? ["How do I create a group chat?", "Fix a group message issue", "Explain forward mode"]
      : ["Fix a direct chat issue", "Explain the message inbox", "Help with search or unread filters"];
  const assistantRecentMessages = useMemo(
    () =>
      listData.slice(0, 5).map((item) => {
        if ("conversationType" in item) {
          const label = item?.groupName || item?.otherUser?.username || item?.otherUser?.name || item?.sellerUser?.username || "Chat";
          return `${label}: ${getConversationPreview(item) || "No recent preview"}`;
        }

        const chatUser = item as ChatUser;
        return `${chatUser?.username || chatUser?.name || "User"}: chat ready to open`;
      }),
    [listData],
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      <View style={styles.headerShell}>
        <View style={[styles.header, { backgroundColor: colors.card, borderColor: accentBorder }]}>
          <View style={styles.headerCopy}>
            <Text style={[styles.headerEyebrow, { color: accentColor }]}>Messages</Text>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Chats</Text>
            <Text style={[styles.headerSubtitle, { color: colors.mutedText }]} numberOfLines={2}>
              {headerSubtitle}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.headerIconButton, { backgroundColor: accentSoft, borderColor: accentBorder }]}
              onPress={() => navigation.navigate("Search")}
            >
              <Icon name="search-outline" size={20} color={accentColor} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerIconButton, { backgroundColor: accentSoft, borderColor: accentBorder }]}
              onPress={() => setShowAssistant(true)}
            >
              <Icon name="sparkles-outline" size={20} color={accentColor} />
            </TouchableOpacity>
          {activeTab === "group" ? (
            <TouchableOpacity
              style={[styles.headerActionButton, styles.headerIconButton, { backgroundColor: accentSoft, borderColor: accentBorder }]}
              onPress={() => {
                setErrorMessage("");
                setGroupModalVisible(true);
              }}
            >
              <Icon name="add-circle-outline" size={20} color={accentColor} />
            </TouchableOpacity>
          ) : null}
          </View>
        </View>
      </View>

      <View style={[styles.tabs, { backgroundColor: tabsBackgroundColor, borderColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "regular" ? { backgroundColor: accentColor } : null]}
          onPress={() => setActiveTab("regular")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "regular" && styles.activeTabText,
              { color: activeTab === "regular" ? "#fff" : colors.mutedText },
            ]}
          >
            Regular Chats
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === "seller" ? { backgroundColor: colors.primary } : null]}
          onPress={() => setActiveTab("seller")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "seller" && styles.activeTabText,
              { color: activeTab === "seller" ? "#fff" : colors.mutedText },
            ]}
          >
            Seller Chats
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === "group" ? { backgroundColor: colors.primary } : null]}
          onPress={() => setActiveTab("group")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "group" && styles.activeTabText,
              { color: activeTab === "group" ? "#fff" : colors.mutedText },
            ]}
          >
            Group Chats
          </Text>
        </TouchableOpacity>
      </View>

      {isForwardMode ? (
        <View style={[styles.forwardBanner, { backgroundColor: colors.card, borderColor: accentBorder }]}>
          <View style={styles.forwardBannerBody}>
            <Icon name="arrow-redo-outline" size={18} color={accentColor} />
            <Text style={[styles.forwardBannerText, { color: colors.text }]}>
              {selectedForwardTargetList.length
                ? `${selectedForwardTargetList.length} ${selectedForwardTargetList.length === 1 ? "chat" : "chats"} selected`
                : "Select one or more chats to forward this message."}
            </Text>
          </View>
          <View style={styles.forwardBannerActions}>
            {!!selectedForwardTargetList.length ? (
              <TouchableOpacity onPress={() => completeForward().catch(() => { })} disabled={forwarding}>
                <Text style={[styles.forwardBannerAction, { color: colors.primary }]}>
                  {forwarding ? "Sending..." : "Send"}
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={[styles.forwardBannerAction, { color: colors.primary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <FlatList
        data={listData}
        keyExtractor={keyExtractor}
        renderItem={renderListItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          !listData.length ? styles.listContentEmpty : null,
        ]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {errorMessage
                ? activeTab === "seller"
                  ? "Seller chats unavailable"
                  : activeTab === "group"
                    ? "Group chats unavailable"
                    : "Chats unavailable"
                : activeTab === "seller"
                  ? "No seller chats yet"
                  : activeTab === "group"
                    ? "No group chats yet"
                    : "No chats yet"}
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedText }]}>
              {errorMessage || (activeTab === "seller"
                ? "Start a seller conversation from a seller profile to see it here."
                : activeTab === "group"
                  ? "Create a group chat to talk with multiple people in one place."
                  : "Start a direct conversation from a user profile or this tab.")}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchChatData(true).catch(() => {})}
            tintColor={colors.primary}
          />
        }
      />

      <Modal
        visible={groupModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeGroupModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Create Group Chat</Text>
              <TouchableOpacity onPress={closeGroupModal}>
                <Icon name="close-outline" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Group name"
              placeholderTextColor={colors.placeholder}
              style={[styles.groupNameInput, { borderColor: colors.border, color: colors.text, backgroundColor: modalInputBackgroundColor }]}
            />

            <Text style={[styles.modalHelper, { color: colors.mutedText }]}>
              Choose at least two people who mutually follow you.
            </Text>

            <FlatList
              data={eligibleGroupUsers}
              keyExtractor={(item) => item._id}
              style={styles.groupPickerList}
              renderItem={({ item }) => {
                const isSelected = selectedGroupMembers.includes(item._id);

                return (
                  <TouchableOpacity
                    style={[styles.memberRow, { borderColor: colors.border }]}
                    onPress={() => toggleGroupMember(item._id)}
                  >
                    <Image
                      source={{ uri: item.profilePic || DEFAULT_AVATAR_URL }}
                      style={styles.memberAvatar}
                    />

                    <View style={styles.memberMeta}>
                      <Text style={[styles.memberName, { color: colors.text }]}>
                        {item.username || item.name || "User"}
                      </Text>
                      <Text style={[styles.memberSubtitle, { color: colors.mutedText }]}>
                        {item.name || item.category || "Aline2 member"}
                      </Text>
                    </View>

                    <Icon
                      name={isSelected ? "checkbox" : "square-outline"}
                      size={22}
                      color={isSelected ? colors.primary : colors.mutedText}
                    />
                  </TouchableOpacity>
                );
              }}
            />

            {!eligibleGroupUsers.length ? (
              <Text style={[styles.groupEligibilityHint, { color: colors.mutedText }]}>
                Only mutually following users can be added to a group right now.
              </Text>
            ) : null}

            <TouchableOpacity
              style={[styles.createGroupButton, { backgroundColor: creatingGroup ? disabledCreateGroupColor : colors.primary }]}
              onPress={createGroup}
              disabled={creatingGroup}
            >
              {creatingGroup ? <ActivityIndicator color="#fff" /> : <Text style={styles.createGroupButtonText}>Create group</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <AISupportSheet
        visible={showAssistant}
        onClose={() => setShowAssistant(false)}
        scope={assistantScope}
        scopeHint={assistantScopeHint}
        conversationSummary={assistantConversationSummary}
        recentMessages={assistantRecentMessages}
        suggestedPrompts={assistantSuggestedPrompts}
      />
    </SafeAreaView>
  );
};

export default AllChatsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerShell: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  headerEyebrow: {
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
  headerSubtitle: {
    marginTop: 4,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "500",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActionButton: {
    marginLeft: 10,
  },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 14,
    marginBottom: 10,
    borderRadius: 18,
    borderWidth: 1,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: "center",
    borderRadius: 14,
  },
  tabText: {
    fontSize: 13.5,
    fontWeight: "600",
  },
  forwardBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 14,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
  },
  forwardBannerBody: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  forwardBannerText: {
    marginLeft: 8,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  forwardBannerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  forwardBannerAction: {
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 14,
  },
  activeTabText: {
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 28,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  chatCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
  },
  chatCardSelected: {
    transform: [{ scale: 0.995 }],
  },
  chatCardDisabled: {
    opacity: 0.72,
  },
  avatarContainer: {
    position: "relative",
    marginRight: 14,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  groupAvatarCard: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  onlineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#22c55e",
    position: "absolute",
    bottom: 2,
    right: 2,
    borderWidth: 2,
    borderColor: "#fff",
  },
  chatInfo: {
    flex: 1,
    minWidth: 0,
  },
  chatMeta: {
    alignItems: "flex-end",
    justifyContent: "center",
    marginLeft: 12,
  },
  forwardCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    backgroundColor: "#fff",
  },
  chatTimestamp: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptyState: {
    paddingHorizontal: 24,
    paddingTop: 72,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  emptyText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  username: {
    fontSize: 16,
    fontWeight: "700",
  },
  lastMessage: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  unreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#7b3fe4",
    marginBottom: 8,
    paddingHorizontal: 5,
  },
  unreadDot: {
    backgroundColor: "#9b4dff",
  },
  unreadText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(17,24,39,0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  groupNameInput: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
  },
  modalHelper: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
  },
  groupPickerList: {
    marginTop: 16,
  },
  groupEligibilityHint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  memberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 12,
  },
  memberMeta: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: "600",
  },
  memberSubtitle: {
    marginTop: 3,
    fontSize: 12,
  },
  createGroupButton: {
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  createGroupButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  }

});
