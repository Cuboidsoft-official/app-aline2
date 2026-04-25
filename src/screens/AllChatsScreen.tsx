import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  useWindowDimensions,
} from "react-native";
import { Alert } from "../utils/appAlert";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useFocusEffect } from "@react-navigation/native";
import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import Icon from "react-native-vector-icons/Ionicons";
import { getStoredUserId } from "../utils/authSession";
import {
  createChatConversation,
  createGroupChatConversation,
  deleteChatConversation,
  fetchChatConversations,
  fetchPublicGroupChatConversations,
  forwardChatMessage,
  joinPublicGroupChatConversation,
} from "../utils/chatApi";
import { getConversationPreview } from "../utils/chatPresentation";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { useAppTheme } from "../theme/AppThemeContext";
import { alpha, appFonts, appShadows } from "../theme/designSystem";
import { getChatLayoutMetrics } from "../theme/chatUi";
import { connectSocket, socket } from "../socket";
import AISupportSheet from "../components/chat/AISupportSheet";
import ChatLockModal from "../components/chat/ChatLockModal";
import AppBottomDock, { getAppBottomDockHeight } from "../components/AppBottomDock";
import AppAvatar from "../components/AppAvatar";
import {
  getLockedConversationIds,
  hasChatLockPasscode,
  setChatLockPasscode,
  setConversationLocked,
  verifyChatLockPasscode,
} from "../utils/chatSecurity";
import { getMutedConversationIds, setConversationMuted } from "../utils/chatMute";

interface ChatUser {
  _id: string;
  username?: string;
  name?: string;
  profilePic?: string;
  sellerProfile?: string;
  category?: string;
  isOnline?: boolean;
  lastSeenAt?: string;
  availabilityStatus?: string;
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
  groupDescription?: string | null;
  groupVisibility?: "private" | "public";
  memberCount?: number;
  updatedAt?: string;
  lastMessageTime?: string;
  lastMessageText?: string;
  lastMessageType?: string;
  unreadCount?: number;
  isJoined?: boolean;
}

interface ForwardTarget {
  key: string;
  label: string;
  conversationType: "direct" | "seller" | "group";
  conversationId?: string;
  userId?: string;
}

interface AssistantInboxItem {
  _id: string;
  itemType: "assistant";
  title: string;
  subtitle: string;
  meta: string;
}

type ChatTab = "regular" | "seller" | "group";
const MAX_GROUP_MEMBERS = 100;
const MAIN_TAB_ROUTES = ["Feed", "SwipesLauncher", "Create", "Chats", "ProfileView"];
const AI_ASSISTANT_ROW_ID = "assistant:inbox";

const hasMainTabParent = (navigation: any) => {
  let currentNavigation = navigation;

  while (currentNavigation?.getParent) {
    currentNavigation = currentNavigation.getParent();
    const routeNames = currentNavigation?.getState?.()?.routeNames;

    if (
      Array.isArray(routeNames)
      && MAIN_TAB_ROUTES.every((routeName) => routeNames.includes(routeName))
    ) {
      return true;
    }
  }

  return false;
};

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

const isSellerConversation = (conversation?: Conversation | null) => {
  if (!conversation) {
    return false;
  }

  return (
    conversation?.conversationType === "seller"
    || Boolean(conversation?.service?._id)
    || Boolean(conversation?.service?.seller?._id)
    || Boolean(conversation?.sellerUser?._id)
  );
};

const getSellerConversationIdentity = (conversation?: Conversation | null) => {
  const sellerId = String(
    conversation?.service?.seller?._id
    || conversation?.sellerUser?.sellerProfile
    || conversation?.otherUser?.sellerProfile
    || "",
  ).trim();
  const sellerUserId = String(
    conversation?.sellerUser?._id
    || conversation?.service?.seller?.user
    || conversation?.otherUser?._id
    || "",
  ).trim();
  const sellerName = String(
    conversation?.service?.seller?.sellerName
    || conversation?.sellerUser?.name
    || conversation?.otherUser?.name
    || conversation?.sellerUser?.username
    || conversation?.otherUser?.username
    || "Seller",
  ).trim() || "Seller";
  const profilePic = conversation?.sellerUser?.profilePic
    || conversation?.otherUser?.profilePic
    || DEFAULT_AVATAR_URL;

  return {
    sellerId,
    sellerUserId,
    sellerName,
    profilePic,
    hasSellerLink: Boolean(sellerId && sellerUserId),
  };
};

const getConversationSortTime = (conversation?: Conversation | null) =>
  new Date(conversation?.updatedAt || conversation?.lastMessageTime || 0).getTime();

const AllChatsScreen = ({ navigation, route }: any) => {
  const { colors, isDarkMode } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const chatMetrics = useMemo(() => getChatLayoutMetrics(width), [width]);
  const isInsideTabNavigator = useMemo(() => hasMainTabParent(navigation), [navigation]);
  const bottomDockOffset = isInsideTabNavigator ? 0 : getAppBottomDockHeight(insets.bottom);
  const accentColor = colors.primary;
  const accentSoft = alpha(accentColor, isDarkMode ? "22" : "14");
  const accentBorder = alpha(accentColor, isDarkMode ? "52" : "32");
  const tabsBackgroundColor = isDarkMode ? colors.surface : colors.card;
  const groupAvatarBackgroundColor = isDarkMode ? colors.surface : colors.card;
  const modalInputBackgroundColor = isDarkMode ? colors.surface : colors.background;
  const disabledCreateGroupColor = isDarkMode ? colors.surface : colors.border;
  const tabLabelFontSize = Math.max(chatMetrics.metaFontSize, 11);
  const cardRadius = Math.max(chatMetrics.bubbleRadius - 2, 16);
  const cardPadding = Math.max(chatMetrics.cardPadding - 4, 11);
  const inboxHorizontalPadding = Math.max(chatMetrics.listPadding, 10);
  const compactAvatarSize = Math.max(chatMetrics.headerAvatar + 2, 42);

  const [users, setUsers] = useState<ChatUser[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeTab, setActiveTab] = useState<ChatTab>("regular");
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);
  const [groupVisibility, setGroupVisibility] = useState<"private" | "public">("private");
  const [groupDescription, setGroupDescription] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [publicGroupsVisible, setPublicGroupsVisible] = useState(false);
  const [publicGroups, setPublicGroups] = useState<Conversation[]>([]);
  const [loadingPublicGroups, setLoadingPublicGroups] = useState(false);
  const [lockedConversationIds, setLockedConversationIds] = useState<string[]>([]);
  const [mutedConversationIds, setMutedConversationIds] = useState<string[]>([]);
  const [deletingConversationId, setDeletingConversationId] = useState("");
  const [chatLockModalVisible, setChatLockModalVisible] = useState(false);
  const [chatLockMode, setChatLockMode] = useState<"unlock" | "setup">("unlock");
  const [pendingLockedTarget, setPendingLockedTarget] = useState<(() => void) | null>(null);
  const [pendingLockChange, setPendingLockChange] = useState<{ conversationId: string; locked: boolean } | null>(null);
  const [lockingBusy, setLockingBusy] = useState(false);
  const [groupActionsVisible, setGroupActionsVisible] = useState(false);
  const [activeGroupConversation, setActiveGroupConversation] = useState<Conversation | null>(null);
  const [selectedForwardTargets, setSelectedForwardTargets] = useState<Record<string, ForwardTarget>>({});
  const [forwarding, setForwarding] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const forwardMessageId = String(route?.params?.forwardMessageId || "");
  const isForwardMode = Boolean(forwardMessageId);
  const headerSubtitle = isForwardMode
    ? "Choose chats to forward."
    : activeTab === "seller"
      ? "Seller inbox"
      : activeTab === "group"
        ? "Shared spaces"
        : "Direct messages";

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

      const storedUserId = await getStoredUserId();
      const [usersRes, conversationsRes] = await Promise.all([
        API.get("/auth/users"),
        fetchChatConversations(),
      ]);

      const usersPayload = usersRes?.data;
      const conversationsPayload = conversationsRes?.data;
      const fetchedUsersSource =
        (Array.isArray(usersPayload?.users) ? usersPayload.users : null)
        || (Array.isArray(usersPayload) ? usersPayload : []);
      const fetchedConversations =
        (Array.isArray(conversationsRes?.conversations) ? conversationsRes.conversations : null)
        || (Array.isArray(conversationsPayload?.conversations) ? conversationsPayload.conversations : null)
        || (Array.isArray(conversationsPayload) ? conversationsPayload : null)
        || (Array.isArray(conversationsRes) ? conversationsRes : []);

      const fetchedUsers = (fetchedUsersSource as ChatUser[]).filter(
        (user: ChatUser) => user?._id !== storedUserId
      );

      setUsers(
        [...fetchedUsers].sort((left, right) =>
          String(left?.username || left?.name || "").localeCompare(String(right?.username || right?.name || ""))
        )
      );
      setCurrentUserId(storedUserId || "");
      setConversations((fetchedConversations || []) as Conversation[]);
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
  }, []);

  const loadLockedChats = useCallback(async (userIdOverride?: string) => {
    const resolvedUserId = String(userIdOverride || currentUserId || "").trim();
    if (!resolvedUserId) {
      setLockedConversationIds([]);
      return;
    }

    const lockedIds = await getLockedConversationIds(resolvedUserId);
    setLockedConversationIds(lockedIds);
  }, [currentUserId]);

  const loadMutedChats = useCallback(async (userIdOverride?: string) => {
    const resolvedUserId = String(userIdOverride || currentUserId || "").trim();
    if (!resolvedUserId) {
      setMutedConversationIds([]);
      return;
    }

    const mutedIds = await getMutedConversationIds(resolvedUserId);
    setMutedConversationIds(mutedIds);
  }, [currentUserId]);

  const loadPublicGroups = useCallback(async () => {
    try {
      setLoadingPublicGroups(true);
      const response = await fetchPublicGroupChatConversations({ limit: 30 });
      setPublicGroups((response?.groups || []) as Conversation[]);
    } catch (error) {
      console.log("public groups load error:", error);
      Alert.alert("Unable to load public groups", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setLoadingPublicGroups(false);
    }
  }, []);

  const eligibleGroupUsers = useMemo(() => users, [users]);
  const remainingGroupSlots = Math.max(0, MAX_GROUP_MEMBERS - 1 - selectedGroupMembers.length);

  useFocusEffect(
    useCallback(() => {
      fetchChatData();
    }, [fetchChatData])
  );

  useFocusEffect(
    useCallback(() => {
      loadLockedChats().catch((error) => {
        console.log("locked chats load error:", error);
      });
    }, [loadLockedChats])
  );

  useFocusEffect(
    useCallback(() => {
      loadMutedChats().catch((error) => {
        console.log("muted chats load error:", error);
      });
    }, [loadMutedChats])
  );

  useEffect(() => {
    if (activeTab !== "group" || !publicGroupsVisible) {
      return;
    }

    loadPublicGroups().catch((error) => {
      console.log("public groups effect error:", error);
    });
  }, [activeTab, loadPublicGroups, publicGroupsVisible]);

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
    socket.on("presence:update", scheduleRefresh);

    return () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }

      socket.off("receiveMessage", scheduleRefresh);
      socket.off("messageSeen", scheduleRefresh);
      socket.off("call:incoming", scheduleRefresh);
      socket.off("call:status", scheduleRefresh);
      socket.off("presence:update", scheduleRefresh);
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
      .filter((conversation) => isSellerConversation(conversation) && getSellerConversationIdentity(conversation).hasSellerLink)
      .sort((a, b) => {
        return getConversationSortTime(b) - getConversationSortTime(a);
      });
  }, [conversations]);

  const orderedRegularConversations = useMemo(() => {
    return [...conversations]
      .filter((conversation) => {
        if (conversation?.conversationType === "group") {
          return false;
        }

        return !isSellerConversation(conversation);
      })
      .sort((a, b) => {
        return getConversationSortTime(b) - getConversationSortTime(a);
      });
  }, [conversations]);

  const orderedGroupConversations = useMemo(() => {
    return [...conversations]
      .filter((conversation) => conversation?.conversationType === "group")
      .sort((a, b) => {
        return getConversationSortTime(b) - getConversationSortTime(a);
      });
  }, [conversations]);

  const closeGroupModal = useCallback(() => {
    setGroupModalVisible(false);
    setGroupName("");
    setGroupDescription("");
    setGroupVisibility("private");
    setSelectedGroupMembers([]);
  }, []);

  const openLockedChat = useCallback(async (onUnlocked: () => void) => {
    const hasPasscode = await hasChatLockPasscode();
    setPendingLockChange(null);
    setPendingLockedTarget(() => onUnlocked);
    setChatLockMode(hasPasscode ? "unlock" : "setup");
    setChatLockModalVisible(true);
  }, []);

  const closeGroupActions = useCallback(() => {
    setGroupActionsVisible(false);
    setActiveGroupConversation(null);
  }, []);

  const openGroupActions = useCallback((conversation: Conversation) => {
    setActiveGroupConversation(conversation);
    setGroupActionsVisible(true);
  }, []);

  const toggleActiveGroupMute = useCallback(async () => {
    if (!activeGroupConversation?._id || !String(currentUserId || "").trim()) {
      return;
    }

    const conversationId = String(activeGroupConversation._id);
    const isMuted = mutedConversationIds.includes(conversationId);
    const nextIds = await setConversationMuted(currentUserId, conversationId, !isMuted);
    setMutedConversationIds(nextIds);
    closeGroupActions();
  }, [activeGroupConversation, closeGroupActions, currentUserId, mutedConversationIds]);

  const requestActiveGroupLockToggle = useCallback(async () => {
    if (!activeGroupConversation?._id || !String(currentUserId || "").trim()) {
      return;
    }

    const conversationId = String(activeGroupConversation._id);
    const isLocked = lockedConversationIds.includes(conversationId);

    if (!isLocked) {
      const hasPasscode = await hasChatLockPasscode();
      if (!hasPasscode) {
        setPendingLockedTarget(null);
        setPendingLockChange({ conversationId, locked: true });
        setChatLockMode("setup");
        setChatLockModalVisible(true);
        closeGroupActions();
        return;
      }

      const nextIds = await setConversationLocked(currentUserId, conversationId, true);
      setLockedConversationIds(nextIds);
      closeGroupActions();
      return;
    }

    setPendingLockedTarget(null);
    setPendingLockChange({ conversationId, locked: false });
    setChatLockMode("unlock");
    setChatLockModalVisible(true);
    closeGroupActions();
  }, [activeGroupConversation, closeGroupActions, currentUserId, lockedConversationIds]);

  const toggleGroupMember = useCallback((memberId: string) => {
    setSelectedGroupMembers((prev) => {
      if (prev.includes(memberId)) {
        return prev.filter((entry) => entry !== memberId);
      }

      if (prev.length >= MAX_GROUP_MEMBERS - 1) {
        Alert.alert("Group limit reached", `A group can have up to ${MAX_GROUP_MEMBERS} members.`);
        return prev;
      }

      return [...prev, memberId];
    });
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

    if (selectedGroupMembers.length + 1 > MAX_GROUP_MEMBERS) {
      setErrorMessage(`A group can have up to ${MAX_GROUP_MEMBERS} members.`);
      return;
    }

    try {
      setCreatingGroup(true);
      const response = await createGroupChatConversation({
        groupName: groupName.trim(),
        memberIds: selectedGroupMembers,
        groupVisibility,
        groupDescription: groupDescription.trim(),
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
          groupConversation: conversation,
        });
      }
    } catch (error) {
      setErrorMessage(getReadableApiErrorMessage(error, "Failed to create group chat."));
    } finally {
      setCreatingGroup(false);
    }
  }, [closeGroupModal, fetchChatData, groupDescription, groupName, groupVisibility, navigation, selectedGroupMembers]);

  const handleChatLockSubmit = useCallback(async (passcode: string) => {
    try {
      setLockingBusy(true);
      if (chatLockMode === "setup") {
        await setChatLockPasscode(passcode);
        if (pendingLockChange) {
          const nextIds = await setConversationLocked(currentUserId, pendingLockChange.conversationId, pendingLockChange.locked);
          setLockedConversationIds(nextIds);
          setPendingLockChange(null);
          setChatLockModalVisible(false);
          closeGroupActions();
          return;
        }

        const nextAction = pendingLockedTarget;
        setChatLockModalVisible(false);
        setPendingLockedTarget(null);
        nextAction?.();
        return;
      }

      const isValid = await verifyChatLockPasscode(passcode);
      if (!isValid) {
        throw new Error("Incorrect passcode.");
      }

      if (pendingLockChange) {
        const nextIds = await setConversationLocked(currentUserId, pendingLockChange.conversationId, pendingLockChange.locked);
        setLockedConversationIds(nextIds);
        setPendingLockChange(null);
        setChatLockModalVisible(false);
        closeGroupActions();
        return;
      }

      const nextAction = pendingLockedTarget;
      setChatLockModalVisible(false);
      setPendingLockedTarget(null);
      nextAction?.();
    } catch (error) {
      Alert.alert("Chat lock", getReadableApiErrorMessage(error, "Unable to unlock chat."));
    } finally {
      setLockingBusy(false);
    }
  }, [chatLockMode, closeGroupActions, currentUserId, pendingLockChange, pendingLockedTarget]);

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

  const handleJoinPublicGroup = useCallback(async (group: Conversation) => {
    try {
      const response = await joinPublicGroupChatConversation(String(group?._id || ""));
      const joinedConversation = response?.conversation || group;
      setPublicGroups((prev) =>
        prev.map((item) => (String(item?._id || "") === String(group?._id || "") ? {
          ...item,
          ...joinedConversation,
          isJoined: true,
        } : item))
      );
      await fetchChatData(true);
      setPublicGroupsVisible(false);
      navigation.navigate("ChatScreen", {
        conversationId: joinedConversation?._id || group?._id,
        conversationType: "group",
        groupName: joinedConversation?.groupName || group?.groupName,
        groupAvatar: joinedConversation?.groupAvatar || group?.groupAvatar,
        memberCount: joinedConversation?.memberCount || joinedConversation?.members?.length || group?.memberCount || 0,
      });
    } catch (error) {
      Alert.alert("Unable to join group", getReadableApiErrorMessage(error, "Please try again."));
    }
  }, [fetchChatData, navigation]);

  const performDeleteConversation = useCallback(async (conversation: Conversation, title: string) => {
    const conversationId = String(conversation?._id || "");
    if (!conversationId || deletingConversationId) {
      return;
    }

    try {
      setDeletingConversationId(conversationId);
      await deleteChatConversation({ conversationId });
      setConversations((prev) => prev.filter((entry) => String(entry?._id || "") !== conversationId));
      setLockedConversationIds((prev) => prev.filter((entry) => entry !== conversationId));
      setMutedConversationIds((prev) => prev.filter((entry) => entry !== conversationId));
      Alert.alert("Chat deleted", `${title} removed from your chat list.`);
    } catch (error) {
      Alert.alert("Delete failed", getReadableApiErrorMessage(error, "Unable to delete this chat right now."));
    } finally {
      setDeletingConversationId("");
    }
  }, [deletingConversationId]);

  const promptDeleteConversation = useCallback((conversation: Conversation, title: string) => {
    if (!conversation?._id || isForwardMode || deletingConversationId) {
      return;
    }

    Alert.alert(
      "Delete chat",
      `Remove ${title} from your chat list?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: deletingConversationId === String(conversation._id) ? "Deleting..." : "Delete",
          style: "destructive",
          onPress: () => {
            performDeleteConversation(conversation, title).catch(() => {});
          },
        },
      ],
    );
  }, [deletingConversationId, isForwardMode, performDeleteConversation]);

  const renderUnreadBadge = (count?: number) => {
    const nextCount = Number(count || 0);
    if (!nextCount) {
      return null;
    }

    return (
      <View style={styles.unreadBadge}>
        <Text style={styles.unreadText}>
          {nextCount > 99 ? "99+" : nextCount}
        </Text>
      </View>
    );
  };

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
    const isOnline = Boolean(item?.isOnline);

    return (
      <TouchableOpacity
        style={[
          styles.chatCard,
          {
            borderColor: isSelectedForForward ? accentColor : colors.border,
            backgroundColor: isSelectedForForward ? accentSoft : colors.card,
            padding: cardPadding,
            borderRadius: cardRadius,
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
          <AppAvatar
            uri={item.profilePic || DEFAULT_AVATAR_URL}
            name={item.username || item.name || (item as any)?.email || "User"}
            size={44}
            style={styles.avatar}
            backgroundColor={colors.surface}
            textColor={colors.primary}
          />

          {isOnline ? <View style={[styles.onlineDot, { borderColor: colors.card }]}/> : null}
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
          ) : renderUnreadBadge(conversation?.unreadCount)}

          <Icon name={isForwardMode && isSelectedForForward ? "checkmark-circle" : "chevron-forward-outline"} size={20} color={isForwardMode && isSelectedForForward ? colors.primary : colors.mutedText}/>
        </View>
      </TouchableOpacity>
    );
  };

  const renderRegularConversation = ({ item }: { item: Conversation }) => {
    const participant = item?.otherUser || item?.sellerUser;
    const subtitle = getConversationPreview(item) || "Tap to open conversation";
    const timestamp = formatConversationTime(item?.updatedAt || item?.lastMessageTime);
    const isLocked = lockedConversationIds.includes(String(item?._id || ""));
    const isDeleting = deletingConversationId === String(item?._id || "");
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

          const openChat = () => navigation.navigate("ChatScreen", {
            userId: participant?._id,
            conversationId: item?._id,
            conversationType: "direct",
          });

          if (isLocked) {
            openLockedChat(openChat).catch(() => {});
            return;
          }

          openChat();
        }}
        onLongPress={() => {
          promptDeleteConversation(item, participant?.username || participant?.name || "this chat");
        }}
        delayLongPress={240}
      >
        <View style={styles.avatarContainer}>
          <AppAvatar
            uri={participant?.profilePic || DEFAULT_AVATAR_URL}
            name={participant?.username || participant?.name || (participant as any)?.email || "User"}
            size={compactAvatarSize}
            style={styles.avatar}
            backgroundColor={colors.surface}
            textColor={colors.primary}
          />

          {participant?.isOnline ? <View style={[styles.onlineDot, { borderColor: colors.card }]} /> : null}
        </View>

        <View style={styles.chatInfo}>
          <View style={styles.chatPrimaryRow}>
            <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>
              {participant?.username || participant?.name || "User"}
            </Text>
            {isDeleting ? (
              <Text style={[styles.chatStateText, { color: colors.primary }]}>Deleting...</Text>
            ) : null}
          </View>
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
          ) : isLocked ? (
            <Icon name="lock-closed" size={16} color={colors.mutedText} />
          ) : renderUnreadBadge(item?.unreadCount)}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSellerConversation = ({ item }: { item: Conversation }) => {
    const {
      sellerUserId,
      sellerId,
      sellerName,
      profilePic,
      hasSellerLink,
    } = getSellerConversationIdentity(item);
    const subtitleParts = [
      item?.service?.serviceName || "",
      getConversationPreview(item),
    ].filter(Boolean);
    const timestamp = formatConversationTime(item?.updatedAt || item?.lastMessageTime);
    const isLocked = lockedConversationIds.includes(String(item?._id || ""));
    const isDeleting = deletingConversationId === String(item?._id || "");
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

      const openChat = () => navigation.navigate("SellerChatScreen", {
        sellerId,
        sellerUserId,
        conversationId: item._id,
        serviceId: item?.service?._id,
        serviceName: item?.service?.serviceName,
      });

      if (isLocked) {
        openLockedChat(openChat).catch(() => {});
        return;
      }

      openChat();
    };

    return (
      <TouchableOpacity
        style={[
          styles.chatCard,
          {
            borderColor: isSelectedForForward ? accentColor : colors.border,
            backgroundColor: isSelectedForForward ? accentSoft : colors.card,
            padding: cardPadding,
            borderRadius: cardRadius,
          },
          !hasSellerLink ? styles.chatCardDisabled : null,
          isSelectedForForward ? styles.chatCardSelected : null,
        ]}
        onPress={handlePress}
        onLongPress={() => {
          if (hasSellerLink) {
            promptDeleteConversation(item, sellerName);
          }
        }}
        delayLongPress={240}
        disabled={!hasSellerLink}
        activeOpacity={hasSellerLink ? 0.85 : 1}
      >
        <View style={styles.avatarContainer}>
          <AppAvatar
            uri={profilePic}
            name={sellerName}
            size={compactAvatarSize}
            style={styles.avatar}
            backgroundColor={colors.surface}
            textColor={colors.primary}
          />

          {(item?.sellerUser?.isOnline || item?.otherUser?.isOnline) ? (
            <View style={[styles.onlineDot, { borderColor: colors.card }]}/>
          ) : null}
        </View>

        <View style={styles.chatInfo}>
          <View style={styles.chatPrimaryRow}>
            <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>
              {sellerName}
            </Text>
            {isDeleting ? (
              <Text style={[styles.chatStateText, { color: colors.primary }]}>Deleting...</Text>
            ) : null}
          </View>

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
          ) : isLocked ? <Icon name="lock-closed" size={16} color={colors.mutedText} /> : renderUnreadBadge(item?.unreadCount)}

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
    const isLocked = lockedConversationIds.includes(String(item?._id || ""));
    const isMuted = mutedConversationIds.includes(String(item?._id || ""));
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
            padding: cardPadding,
            borderRadius: cardRadius,
          },
          isSelectedForForward ? styles.chatCardSelected : null,
        ]}
        onPress={() => {
          if (isForwardMode) {
            toggleForwardTarget(forwardTarget);
            return;
          }

          const openChat = () => navigation.navigate("ChatScreen", {
            conversationId: item._id,
            conversationType: "group",
            groupName: item?.groupName,
            groupAvatar: item?.groupAvatar,
            memberCount: item?.memberCount || item?.members?.length || 0,
            groupConversation: item,
          });

          if (isLocked) {
            openLockedChat(openChat).catch(() => {});
            return;
          }

          openChat();
        }}
        onLongPress={() => {
          if (!isForwardMode) {
            openGroupActions(item);
          }
        }}
        delayLongPress={220}
      >
        {item?.groupAvatar ? (
          <View style={styles.avatarContainer}>
            <Image
              source={{ uri: item.groupAvatar }}
              style={[
                styles.avatar,
                {
                  width: compactAvatarSize,
                  height: compactAvatarSize,
                  borderRadius: compactAvatarSize / 2,
                },
              ]}
            />
          </View>
        ) : (
          <View
            style={[
              styles.groupAvatarCard,
              {
                backgroundColor: groupAvatarBackgroundColor,
                width: compactAvatarSize,
                height: compactAvatarSize,
                borderRadius: compactAvatarSize / 2,
              },
            ]}
          >
            <Icon name="people-outline" size={22} color={colors.primary} />
          </View>
        )}

        <View style={styles.chatInfo}>
          <View style={styles.groupTitleRow}>
            <Text style={[styles.username, { color: colors.text, flex: 1 }]} numberOfLines={1}>{title}</Text>
            <View style={[styles.groupVisibilityPill, { backgroundColor: item?.groupVisibility === "public" ? accentSoft : colors.background }]}>
              <Text style={[styles.groupVisibilityText, { color: item?.groupVisibility === "public" ? colors.primary : colors.mutedText }]} numberOfLines={1}>
                {item?.groupVisibility === "public" ? "Public" : "Private"}
              </Text>
            </View>
          </View>
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
          ) : isLocked ? <Icon name="lock-closed" size={16} color={colors.mutedText} /> : renderUnreadBadge(item?.unreadCount)}

          {!isForwardMode && isMuted ? (
            <Icon name="notifications-off-outline" size={16} color={colors.mutedText} />
          ) : null}

          <Icon name={isForwardMode && isSelectedForForward ? "checkmark-circle" : "chevron-forward-outline"} size={20} color={isForwardMode && isSelectedForForward ? colors.primary : colors.mutedText}/>
        </View>
      </TouchableOpacity>
    );
  };

  const renderAssistantConversation = ({ item }: { item: AssistantInboxItem }) => (
    <TouchableOpacity
      style={[
        styles.chatCard,
        styles.assistantChatCard,
        {
          borderColor: accentBorder,
          backgroundColor: colors.card,
        },
      ]}
      onPress={() => setShowAssistant(true)}
    >
      <View style={[styles.assistantAvatarCard, { backgroundColor: accentSoft, borderColor: accentBorder }]}>
        <Icon name="sparkles" size={20} color={accentColor} />
      </View>

      <View style={styles.chatInfo}>
        <View style={styles.chatPrimaryRow}>
          <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={[styles.assistantMetaPill, { backgroundColor: accentSoft, borderColor: accentBorder }]}>
            <Text style={[styles.assistantMetaPillText, { color: accentColor }]} numberOfLines={1}>
              {item.meta}
            </Text>
          </View>
        </View>

        <Text style={[styles.lastMessage, { color: colors.mutedText }]} numberOfLines={2}>
          {item.subtitle}
        </Text>
      </View>

      <View style={[styles.chatMeta, styles.assistantChatMeta]}>
        <Icon name="sparkles-outline" size={17} color={accentColor} />
        <Icon name="chevron-forward-outline" size={18} color={colors.mutedText} />
      </View>
    </TouchableOpacity>
  );

  const assistantListItem = useMemo<AssistantInboxItem>(
    () => ({
      _id: AI_ASSISTANT_ROW_ID,
      itemType: "assistant",
      title: "AI Assistant",
      subtitle: "Ask about chats, stories, posts, seller flow, or app issues.",
      meta: "Aline2 AI",
    }),
    [],
  );
  const directInboxItems = useMemo<(Conversation | AssistantInboxItem)[]>(
    () => [assistantListItem, ...orderedRegularConversations],
    [assistantListItem, orderedRegularConversations],
  );
  const listData = activeTab === "seller"
    ? orderedSellerConversations
    : activeTab === "group"
      ? orderedGroupConversations
      : isForwardMode
        ? orderedUsers
        : directInboxItems;
  const assistantContextItems = activeTab === "regular" && !isForwardMode
    ? orderedRegularConversations
    : listData;
  const renderListItem = activeTab === "seller"
    ? renderSellerConversation
    : activeTab === "group"
      ? renderGroupConversation
      : isForwardMode
        ? renderChat
        : ({ item }: { item: Conversation | AssistantInboxItem }) =>
            "itemType" in item && item.itemType === "assistant"
              ? renderAssistantConversation({ item })
              : renderRegularConversation({ item: item as Conversation });
  const keyExtractor = (item: ChatUser | Conversation | AssistantInboxItem) => item._id;
  const assistantScope = activeTab === "seller"
    ? "Seller chats inbox support"
    : activeTab === "group"
      ? "Channels inbox support"
      : "Direct chats inbox support";
  const assistantScopeHint = headerSubtitle;
  const assistantConversationSummary = `Visible chats in this tab: ${assistantContextItems.length}. Forward mode: ${isForwardMode ? "on" : "off"}.`;
  const assistantSuggestedPrompts = activeTab === "seller"
    ? ["Explain the seller chat flow", "Where do appointments appear?", "Fix the seller inbox issue"]
    : activeTab === "group"
      ? ["How do I create a channel?", "Fix a group message issue", "Explain forward mode"]
      : ["Fix a direct chat issue", "Explain the message inbox", "Help with search or unread filters"];
  const assistantRecentMessages = useMemo(
    () =>
      assistantContextItems.slice(0, 5).map((item) => {
        if ("conversationType" in item) {
          const label = item?.groupName || item?.otherUser?.username || item?.otherUser?.name || item?.sellerUser?.username || "Chat";
          return `${label}: ${getConversationPreview(item) || "No recent preview"}`;
        }

        const chatUser = item as ChatUser;
        return `${chatUser?.username || chatUser?.name || "User"}: chat ready to open`;
      }),
    [assistantContextItems],
  );

  if (loading) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        {!isInsideTabNavigator ? <AppBottomDock navigation={navigation} activeRouteName="Chats" /> : null}
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
        <View style={styles.headerShell}>
        <View
          style={[
            styles.header,
            {
              backgroundColor: colors.card,
              borderColor: accentBorder,
              borderRadius: cardRadius + 6,
              paddingHorizontal: cardPadding,
              paddingVertical: Math.max(chatMetrics.bubblePaddingY + 1, 14),
            },
          ]}
        >
          <View style={styles.headerCopy}>
            <Text style={[styles.headerEyebrow, { color: accentColor, fontSize: chatMetrics.metaFontSize + 0.5 }]}>Messages</Text>
            <Text style={[styles.headerTitle, { color: colors.text, fontSize: chatMetrics.titleFontSize + 5 }]}>Chats</Text>
            <Text
              style={[
                styles.headerSubtitle,
                {
                  color: colors.mutedText,
                  fontSize: chatMetrics.metaFontSize + 1,
                  lineHeight: chatMetrics.metaFontSize + 7,
                },
              ]}
              numberOfLines={2}
            >
              {headerSubtitle}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[
                styles.headerIconButton,
                {
                  backgroundColor: accentSoft,
                  borderColor: accentBorder,
                  width: chatMetrics.headerAction + 2,
                  height: chatMetrics.headerAction + 2,
                  borderRadius: Math.round((chatMetrics.headerAction + 2) / 2),
                },
              ]}
              onPress={() => navigation.navigate("Search")}
            >
              <Icon name="search-outline" size={20} color={accentColor} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.headerIconButton,
                {
                  backgroundColor: accentSoft,
                  borderColor: accentBorder,
                  width: chatMetrics.headerAction + 2,
                  height: chatMetrics.headerAction + 2,
                  borderRadius: Math.round((chatMetrics.headerAction + 2) / 2),
                },
              ]}
              onPress={() => setShowAssistant(true)}
            >
              <Icon name="sparkles-outline" size={20} color={accentColor} />
            </TouchableOpacity>
          {activeTab === "group" ? (
            <TouchableOpacity
              style={[styles.headerActionButton, styles.headerIconButton, { backgroundColor: accentSoft, borderColor: accentBorder }]}
              onPress={() => {
                setPublicGroupsVisible(true);
                loadPublicGroups().catch(() => {});
              }}
            >
              <Icon name="globe-outline" size={20} color={accentColor} />
            </TouchableOpacity>
          ) : null}
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

      <View
        style={[
          styles.tabs,
          {
            backgroundColor: tabsBackgroundColor,
            borderColor: alpha(colors.border, isDarkMode ? "D0" : "B8"),
            borderRadius: cardRadius,
            padding: 5,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.tab, activeTab === "regular" ? { backgroundColor: accentColor } : null]}
          onPress={() => setActiveTab("regular")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "regular" && styles.activeTabText,
              { color: activeTab === "regular" ? "#fff" : colors.mutedText, fontSize: tabLabelFontSize },
            ]}
            numberOfLines={1}
          >
            Direct
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
              { color: activeTab === "seller" ? "#fff" : colors.mutedText, fontSize: tabLabelFontSize },
            ]}
            numberOfLines={1}
          >
            Seller
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
              { color: activeTab === "group" ? "#fff" : colors.mutedText, fontSize: tabLabelFontSize },
            ]}
            numberOfLines={1}
          >
            Channels
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
        removeClippedSubviews
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={6}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingHorizontal: inboxHorizontalPadding,
            paddingBottom: bottomDockOffset + 18,
          },
          !listData.length ? styles.listContentEmpty : null,
        ]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {errorMessage
                ? activeTab === "seller"
                  ? "Seller chats unavailable"
                  : activeTab === "group"
                    ? "Channels unavailable"
                    : "Chats unavailable"
                : activeTab === "seller"
                  ? "No seller chats yet"
                  : activeTab === "group"
                  ? "No channels yet"
                    : "No chats yet"}
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedText }]}>
              {errorMessage || (activeTab === "seller"
                ? "Seller chats will appear here."
                : activeTab === "group"
                  ? "Create a private or public channel."
                  : "Start a new chat to see it here.")}
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
              <Text style={[styles.modalTitle, { color: colors.text }]}>Create Channel</Text>
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
              Choose 2 to 99 people. The group can have up to 100 members including you.
            </Text>

            <View style={styles.groupModeRow}>
              {(["private", "public"] as const).map((mode) => {
                const isActive = groupVisibility === mode;
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.groupModeButton,
                      {
                        backgroundColor: isActive ? colors.primary : modalInputBackgroundColor,
                        borderColor: isActive ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setGroupVisibility(mode)}
                  >
                    <Text style={[styles.groupModeText, { color: isActive ? "#fff" : colors.text }]}>
                      {mode === "public" ? "Public Channel" : "Private Channel"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              value={groupDescription}
              onChangeText={setGroupDescription}
              placeholder="Group description (optional)"
              placeholderTextColor={colors.placeholder}
              multiline
              maxLength={240}
              style={[styles.groupDescriptionInput, { borderColor: colors.border, color: colors.text, backgroundColor: modalInputBackgroundColor }]}
            />

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
                    <AppAvatar
                      uri={item.profilePic || DEFAULT_AVATAR_URL}
                      name={item.username || item.name || (item as any)?.email || "User"}
                      size={48}
                      style={styles.memberAvatar}
                      backgroundColor={colors.surface}
                      textColor={colors.primary}
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
                No users are available for a new group right now.
              </Text>
            ) : null}

            <Text style={[styles.groupEligibilityHint, { color: colors.mutedText }]}>
              Selected {selectedGroupMembers.length} people. {remainingGroupSlots} spots left.
            </Text>

            <TouchableOpacity
              style={[styles.createGroupButton, { backgroundColor: creatingGroup ? disabledCreateGroupColor : colors.primary }]}
              onPress={createGroup}
              disabled={creatingGroup}
            >
              {creatingGroup ? <ActivityIndicator color="#fff" /> : <Text style={styles.createGroupButtonText}>Create channel</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={publicGroupsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPublicGroupsVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Browse Public Channels</Text>
              <TouchableOpacity onPress={() => setPublicGroupsVisible(false)}>
                <Icon name="close-outline" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {loadingPublicGroups ? (
              <View style={styles.publicGroupsLoader}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : (
              <FlatList
                data={publicGroups}
                keyExtractor={(item) => String(item?._id || "")}
                style={styles.groupPickerList}
                ListEmptyComponent={(
                  <Text style={[styles.groupEligibilityHint, { color: colors.mutedText }]}>
                    Koi public group available nahi hai abhi.
                  </Text>
                )}
                renderItem={({ item }) => {
                  const alreadyJoined = Boolean(item?.isJoined || orderedGroupConversations.some((entry) => entry._id === item._id));

                  return (
                    <View style={[styles.publicGroupRow, { borderColor: colors.border }]}>
                      <View style={styles.publicGroupCopy}>
                        <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
                          {item?.groupName || "Public group"}
                        </Text>
                        <Text style={[styles.memberSubtitle, { color: colors.mutedText }]} numberOfLines={2}>
                          {item?.groupDescription || `${item?.memberCount || item?.members?.length || 0} members`}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.joinGroupButton,
                          { backgroundColor: alreadyJoined ? modalInputBackgroundColor : colors.primary, borderColor: colors.border },
                        ]}
                        onPress={() => {
                          if (alreadyJoined) {
                            setPublicGroupsVisible(false);
                            navigation.navigate("ChatScreen", {
                              conversationId: item._id,
                              conversationType: "group",
                              groupName: item?.groupName,
                              groupAvatar: item?.groupAvatar,
                              memberCount: item?.memberCount || item?.members?.length || 0,
                            });
                            return;
                          }

                          handleJoinPublicGroup(item).catch(() => {});
                        }}
                      >
                        <Text style={[styles.joinGroupButtonText, { color: alreadyJoined ? colors.text : "#fff" }]}>
                          {alreadyJoined ? "Open" : "Join"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={groupActionsVisible}
        transparent
        animationType="slide"
        onRequestClose={closeGroupActions}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeGroupActions}>
          <Pressable
            style={[styles.groupActionsCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={1}>
                {activeGroupConversation?.groupName || "Group options"}
              </Text>
              <TouchableOpacity onPress={closeGroupActions}>
                <Icon name="close-outline" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.groupActionRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => {
                toggleActiveGroupMute().catch(() => {});
              }}
              disabled={!activeGroupConversation?._id}
            >
              <Icon
                name={mutedConversationIds.includes(String(activeGroupConversation?._id || "")) ? "notifications-outline" : "notifications-off-outline"}
                size={20}
                color={colors.primary}
              />
              <Text style={[styles.groupActionText, { color: colors.text }]}>
                {mutedConversationIds.includes(String(activeGroupConversation?._id || "")) ? "Unmute group" : "Mute group"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.groupActionRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => {
                requestActiveGroupLockToggle().catch(() => {});
              }}
              disabled={!activeGroupConversation?._id}
            >
              <Icon
                name={lockedConversationIds.includes(String(activeGroupConversation?._id || "")) ? "lock-open-outline" : "lock-closed-outline"}
                size={20}
                color={colors.primary}
              />
              <Text style={[styles.groupActionText, { color: colors.text }]}>
                {lockedConversationIds.includes(String(activeGroupConversation?._id || "")) ? "Unlock group" : "Lock group"}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <ChatLockModal
        visible={chatLockModalVisible}
        mode={chatLockMode}
        busy={lockingBusy}
        onClose={() => {
          setChatLockModalVisible(false);
          setPendingLockedTarget(null);
          setPendingLockChange(null);
          setLockingBusy(false);
        }}
        onSubmit={handleChatLockSubmit}
      />

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
      {!isInsideTabNavigator ? <AppBottomDock navigation={navigation} activeRouteName="Chats" /> : null}
    </View>
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
    fontFamily: appFonts.semibold,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: appFonts.bold,
    fontWeight: "800",
    marginTop: 2,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: appFonts.medium,
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
    minWidth: 0,
  },
  tabText: {
    fontSize: 13.5,
    fontFamily: appFonts.semibold,
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
    fontFamily: appFonts.medium,
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
    fontFamily: appFonts.bold,
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 28,
    paddingTop: 2,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  chatCard: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    ...appShadows.card,
  },
  chatCardSelected: {
    transform: [{ scale: 0.995 }],
  },
  assistantChatCard: {
    paddingVertical: 12,
    borderWidth: 1,
  },
  chatCardDisabled: {
    opacity: 0.72,
  },
  avatarContainer: {
    position: "relative",
    marginRight: 11,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  groupAvatarCard: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  assistantAvatarCard: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  onlineDot: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: "#22c55e",
    position: "absolute",
    bottom: 1,
    right: 1,
    borderWidth: 2,
    borderColor: "#fff",
  },
  chatInfo: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  chatPrimaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  groupTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  groupVisibilityPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  groupVisibilityText: {
    fontSize: 10,
    fontFamily: appFonts.semibold,
    fontWeight: "700",
  },
  assistantMetaPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  assistantMetaPillText: {
    fontSize: 10,
    fontFamily: appFonts.semibold,
    fontWeight: "700",
  },
  assistantChatMeta: {
    justifyContent: "center",
    gap: 8,
  },
  chatMeta: {
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginLeft: 10,
    minWidth: 46,
    alignSelf: "stretch",
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
    fontSize: 11,
    fontFamily: appFonts.semibold,
    fontWeight: "600",
    marginBottom: 6,
  },
  chatStateText: {
    fontSize: 10.5,
    fontFamily: appFonts.semibold,
    fontWeight: "600",
    flexShrink: 0,
  },
  emptyState: {
    paddingHorizontal: 24,
    paddingTop: 72,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: appFonts.bold,
    fontWeight: "700",
  },
  emptyText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    fontFamily: appFonts.regular,
  },
  username: {
    fontSize: 15,
    fontFamily: appFonts.bold,
    fontWeight: "700",
  },
  lastMessage: {
    marginTop: 2,
    fontSize: 12.5,
    lineHeight: 16,
    fontFamily: appFonts.regular,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#7b3fe4",
    marginBottom: 6,
    paddingHorizontal: 5,
  },
  unreadDot: {
    backgroundColor: "#9b4dff",
  },
  unreadText: {
    color: "#fff",
    fontSize: 11.5,
    fontFamily: appFonts.bold,
    fontWeight: "700",
    textAlign: "center",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  screen: {
    flex: 1,
  },
  loadingScreen: {
    flex: 1,
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
  groupActionsCard: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 22,
    maxHeight: "60%",
  },
  groupActionRow: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  groupActionText: {
    marginLeft: 12,
    fontSize: 15,
    fontFamily: appFonts.semibold,
    fontWeight: "700",
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: appFonts.bold,
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
  groupModeRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  groupModeButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  groupModeText: {
    fontSize: 13,
    fontFamily: appFonts.semibold,
    fontWeight: "700",
  },
  groupDescriptionInput: {
    marginTop: 12,
    minHeight: 82,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    textAlignVertical: "top",
  },
  groupPickerList: {
    marginTop: 16,
  },
  publicGroupsLoader: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  publicGroupRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  publicGroupCopy: {
    flex: 1,
  },
  joinGroupButton: {
    minWidth: 76,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  joinGroupButtonText: {
    fontSize: 13,
    fontFamily: appFonts.semibold,
    fontWeight: "700",
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
    fontFamily: appFonts.semibold,
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
    fontFamily: appFonts.bold,
    fontWeight: "700",
    fontSize: 15,
  }

});
