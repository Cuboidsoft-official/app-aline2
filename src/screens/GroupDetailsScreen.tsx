import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Modal,
  TextInput,
  useWindowDimensions,
} from "react-native";
import { Alert } from "../utils/appAlert";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { launchImageLibrary } from "react-native-image-picker";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import {
  addGroupChatMembers,
  deleteGroupChatConversation,
  demoteGroupChatAdmin,
  fetchChatConversations,
  fetchChatConversationDetails,
  promoteGroupChatAdmin,
  removeGroupChatMember,
  transferGroupChatOwnership,
  updateConversationWallpaper,
  updateGroupChatConversation,
} from "../utils/chatApi";
import { getStoredUserId } from "../utils/authSession";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { useAppTheme } from "../theme/AppThemeContext";
import { appFonts, appShadows } from "../theme/designSystem";
import { getChatLayoutMetrics } from "../theme/chatUi";
import { uploadImageAsset } from "../utils/uploadMedia";
import ChatLockModal from "../components/chat/ChatLockModal";
import ChatThemePicker from "../components/chat/ChatThemePicker";
import { normalizeMediaUrl } from "../utils/mediaUrls";
import { isConversationMuted, setConversationMuted } from "../utils/chatMute";
import {
  hasChatLockPasscode,
  isConversationLocked,
  setChatLockPasscode,
  setConversationLocked,
  verifyChatLockPasscode,
} from "../utils/chatSecurity";

type ChatUser = {
  _id: string;
  id?: string;
  username?: string;
  name?: string;
  profilePic?: string;
  category?: string;
};

type GroupConversation = {
  _id: string;
  groupName?: string | null;
  groupAvatar?: string | null;
  members?: Array<ChatUser | string>;
  memberCount?: number;
  isGroupOwner?: boolean;
  isGroupAdmin?: boolean;
  groupOwner?: string | null;
  groupAdmins?: string[];
  groupDescription?: string | null;
  groupLinks?: string[];
  groupVisibility?: "private" | "public";
  groupMessagePermission?: "everyone" | "admins";
  chatTheme?: string | null;
  chatWallpaper?: string | null;
};

const MAX_GROUP_MEMBERS = 100;

const resolveChatUserId = (value: any) =>
  String(value?._id || value?.id || value || "").trim();

const normalizeChatUser = (value: any, directory?: Map<string, ChatUser>) => {
  const resolvedId = resolveChatUserId(value);
  if (!resolvedId) {
    return null;
  }

  const fromDirectory = directory?.get(resolvedId) || null;
  const source =
    value && typeof value === "object"
      ? { ...fromDirectory, ...value }
      : { ...fromDirectory };

  return {
    _id: resolvedId,
    id: resolvedId,
    username: source?.username,
    name: source?.name,
    profilePic: source?.profilePic,
    category: source?.category,
  } as ChatUser;
};

const normalizeChatUsers = (items: any[], directory?: Map<string, ChatUser>) => {
  const seen = new Set<string>();

  return (Array.isArray(items) ? items : []).reduce<ChatUser[]>((accumulator, entry) => {
    const normalizedUser = normalizeChatUser(entry, directory);
    const normalizedId = String(normalizedUser?._id || "");

    if (!normalizedUser || !normalizedId || seen.has(normalizedId)) {
      return accumulator;
    }

    seen.add(normalizedId);
    accumulator.push(normalizedUser);
    return accumulator;
  }, []);
};

const GroupDetailsScreen = ({ navigation, route }: any) => {
  const { colors, isDarkMode } = useAppTheme();
  const { width } = useWindowDimensions();
  const chatMetrics = useMemo(() => getChatLayoutMetrics(width), [width]);
  const { conversationId, conversationSnapshot } = route.params || {};

  const [conversation, setConversation] = useState<GroupConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [addMembersVisible, setAddMembersVisible] = useState(false);
  const [candidateUsers, setCandidateUsers] = useState<ChatUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [savingMembers, setSavingMembers] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [transferringOwnerId, setTransferringOwnerId] = useState("");
  const [groupDescriptionDraft, setGroupDescriptionDraft] = useState("");
  const [groupLinksDraft, setGroupLinksDraft] = useState("");
  const [groupVisibilityDraft, setGroupVisibilityDraft] = useState<"private" | "public">("private");
  const [groupMessagePermissionDraft, setGroupMessagePermissionDraft] = useState<"everyone" | "admins">("everyone");
  const [savingMeta, setSavingMeta] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [lockModalVisible, setLockModalVisible] = useState(false);
  const [lockModalMode, setLockModalMode] = useState<"unlock" | "setup">("unlock");
  const [lockingBusy, setLockingBusy] = useState(false);
  const [pendingLockAction, setPendingLockAction] = useState<"lock" | "unlock">("lock");
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [currentTheme, setCurrentTheme] = useState("default");
  const [chatWallpaper, setChatWallpaper] = useState("");
  const [savingWallpaper, setSavingWallpaper] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);

  const loadConversation = useCallback(async () => {
    try {
      setLoading(true);
      const [storedUserId, conversationRes, conversationListRes] = await Promise.all([
        getStoredUserId(),
        conversationId ? fetchChatConversationDetails(conversationId).catch((error) => ({ __error: error })) : Promise.resolve(null),
        fetchChatConversations({ conversationType: "group" }).catch(() => null),
      ]);

      setCurrentUserId(storedUserId || "");
      const detailError = (conversationRes as any)?.__error || null;
      const detailedConversation = ((conversationRes as any)?.conversation || null) as GroupConversation | null;
      const routeConversation = (conversationSnapshot || null) as GroupConversation | null;
      const fallbackConversation = ((Array.isArray(conversationListRes?.conversations) ? conversationListRes.conversations : []).find(
        (entry: GroupConversation | null) => String(entry?._id || "") === String(conversationId)
      ) || routeConversation || null) as GroupConversation | null;
      const rawMembers = Array.isArray(detailedConversation?.members) && detailedConversation.members.length
        ? detailedConversation.members
        : Array.isArray(fallbackConversation?.members)
          ? fallbackConversation.members
          : Array.isArray(routeConversation?.members)
            ? routeConversation.members
          : [];
      const shouldHydrateMemberProfiles = rawMembers.some((entry) => {
        if (!entry || typeof entry !== "object") {
          return true;
        }

        return !resolveChatUserId(entry) || (!entry.username && !entry.name && !entry.profilePic);
      });

      let memberDirectory: Map<string, ChatUser> | undefined;
      if (shouldHydrateMemberProfiles && rawMembers.length) {
        const usersRes = await API.get("/auth/users").catch(() => null);
        const directoryMap = new Map<string, ChatUser>();

        if (Array.isArray(usersRes?.data?.users)) {
          (usersRes.data.users as ChatUser[]).forEach((entry) => {
            const normalizedUser = normalizeChatUser(entry);
            if (normalizedUser?._id) {
              directoryMap.set(String(normalizedUser._id), normalizedUser);
            }
          });
        }

        memberDirectory = directoryMap;
      }

      const normalizedMembers = normalizeChatUsers(rawMembers, memberDirectory);
      const mergedConversation = detailedConversation
        ? {
            ...routeConversation,
            ...fallbackConversation,
            ...detailedConversation,
          }
        : (fallbackConversation || routeConversation);
      const nextConversation = mergedConversation
        ? {
            ...mergedConversation,
            members: normalizedMembers,
            memberCount:
              mergedConversation?.memberCount
              || routeConversation?.memberCount
              || normalizedMembers.length,
            chatTheme: String(mergedConversation?.chatTheme || "default"),
            chatWallpaper: String(mergedConversation?.chatWallpaper || ""),
          }
        : null;
      setConversation(nextConversation);
      setGroupNameDraft(nextConversation?.groupName || "");
      setGroupDescriptionDraft(nextConversation?.groupDescription || "");
      setGroupLinksDraft(Array.isArray(nextConversation?.groupLinks) ? nextConversation.groupLinks.join("\n") : "");
      setGroupVisibilityDraft((nextConversation?.groupVisibility || "private") as "private" | "public");
      setGroupMessagePermissionDraft((nextConversation?.groupMessagePermission || "everyone") as "everyone" | "admins");
      setCurrentTheme(String(nextConversation?.chatTheme || "default"));
      setChatWallpaper(String(nextConversation?.chatWallpaper || ""));
      if (storedUserId) {
        const [locked, muted] = await Promise.all([
          isConversationLocked(storedUserId, conversationId),
          isConversationMuted(storedUserId, conversationId),
        ]);
        setIsLocked(locked);
        setIsMuted(muted);
      } else {
        setIsMuted(false);
      }
      setErrorMessage(nextConversation ? "" : getReadableApiErrorMessage(detailError, "Failed to load group details."));
    } catch (error) {
      console.log("group details load error:", error);
      if (conversationSnapshot) {
        const normalizedSnapshot = {
          ...(conversationSnapshot as GroupConversation),
          members: normalizeChatUsers(Array.isArray((conversationSnapshot as GroupConversation)?.members) ? (conversationSnapshot as GroupConversation).members as any[] : []),
        } as GroupConversation;
        setConversation(normalizedSnapshot);
        setGroupNameDraft(normalizedSnapshot?.groupName || "");
        setGroupDescriptionDraft(normalizedSnapshot?.groupDescription || "");
        setGroupLinksDraft(Array.isArray(normalizedSnapshot?.groupLinks) ? normalizedSnapshot.groupLinks.join("\n") : "");
        setGroupVisibilityDraft((normalizedSnapshot?.groupVisibility || "private") as "private" | "public");
        setGroupMessagePermissionDraft((normalizedSnapshot?.groupMessagePermission || "everyone") as "everyone" | "admins");
      } else {
        setConversation(null);
      }
      setErrorMessage(getReadableApiErrorMessage(error, "Failed to load group details."));
    } finally {
      setLoading(false);
    }
  }, [conversationId, conversationSnapshot]);

  useFocusEffect(
    useCallback(() => {
      loadConversation().catch(() => {});
    }, [loadConversation])
  );

  const canManageMembers = Boolean(conversation?.isGroupOwner || conversation?.isGroupAdmin);
  const canEditGroup = canManageMembers;
  const isOwner = Boolean(conversation?.isGroupOwner);
  const members = useMemo<ChatUser[]>(
    () => normalizeChatUsers(Array.isArray(conversation?.members) ? conversation.members : []),
    [conversation]
  );
  const availableMemberSlots = Math.max(0, MAX_GROUP_MEMBERS - members.length);
  const groupAdminIds = useMemo(
    () => new Set(Array.isArray(conversation?.groupAdmins) ? conversation.groupAdmins.map((entry) => String(entry)) : []),
    [conversation]
  );

  const openAddMembers = useCallback(async () => {
    if (availableMemberSlots <= 0) {
      Alert.alert("Group is full", `This group already has ${MAX_GROUP_MEMBERS} members.`);
      return;
    }

    try {
      const res = await API.get("/auth/users");
      const existingIds = new Set(members.map((member) => member._id));
      const availableUsers = ((res?.data?.users || []) as ChatUser[]).filter(
        (user) => user?._id && user._id !== currentUserId && !existingIds.has(user._id)
      );
      setCandidateUsers(
        [...availableUsers].sort((left, right) =>
          String(left?.username || left?.name || "").localeCompare(String(right?.username || right?.name || ""))
        )
      );
      setSelectedUsers([]);
      setAddMembersVisible(true);
    } catch (error) {
      Alert.alert("Unable to load people", getReadableApiErrorMessage(error, "Please try again."));
    }
  }, [availableMemberSlots, currentUserId, members]);

  const toggleCandidate = useCallback((userId: string) => {
    setSelectedUsers((prev) => {
      if (prev.includes(userId)) {
        return prev.filter((entry) => entry !== userId);
      }

      if (prev.length >= availableMemberSlots) {
        Alert.alert("Member limit reached", `You can add ${availableMemberSlots} more ${availableMemberSlots === 1 ? "person" : "people"} to this group.`);
        return prev;
      }

      return [...prev, userId];
    });
  }, [availableMemberSlots]);

  const submitAddMembers = useCallback(async () => {
    if (!selectedUsers.length) {
      Alert.alert("Add members", "Select at least one member to add.");
      return;
    }

    if (selectedUsers.length > availableMemberSlots) {
      Alert.alert("Member limit reached", `This group can have up to ${MAX_GROUP_MEMBERS} members.`);
      return;
    }

    try {
      setSavingMembers(true);
      await addGroupChatMembers({
        conversationId,
        memberIds: selectedUsers,
      });
      setAddMembersVisible(false);
      setCandidateUsers([]);
      setSelectedUsers([]);
      await loadConversation();
    } catch (error) {
      Alert.alert("Unable to add members", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setSavingMembers(false);
    }
  }, [availableMemberSlots, conversationId, loadConversation, selectedUsers]);

  const submitGroupName = useCallback(async () => {
    if (!groupNameDraft.trim()) {
      Alert.alert("Group name", "Enter a group name.");
      return;
    }

    try {
      setSavingName(true);
      await updateGroupChatConversation({
        conversationId,
        groupName: groupNameDraft.trim(),
      });
      await loadConversation();
      setEditingName(false);
    } catch (error) {
      Alert.alert("Unable to update group", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setSavingName(false);
    }
  }, [conversationId, groupNameDraft, loadConversation]);

  const submitGroupMeta = useCallback(async () => {
    try {
      setSavingMeta(true);
      await updateGroupChatConversation({
        conversationId,
        groupVisibility: groupVisibilityDraft,
        groupMessagePermission: groupMessagePermissionDraft,
        groupDescription: groupDescriptionDraft.trim(),
        groupLinks: groupLinksDraft
          .split(/\r?\n/)
          .map((entry) => entry.trim())
          .filter(Boolean),
      });
      await loadConversation();
    } catch (error) {
      Alert.alert("Unable to update group", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setSavingMeta(false);
    }
  }, [conversationId, groupDescriptionDraft, groupLinksDraft, groupMessagePermissionDraft, groupVisibilityDraft, loadConversation]);

  const handleThemeChanged = useCallback((themeId: string) => {
    setCurrentTheme(themeId);
    setConversation((prev) => prev ? { ...prev, chatTheme: themeId } : prev);
  }, []);

  const updateWallpaper = useCallback(async (wallpaperUrl: string | null) => {
    if (!conversationId) {
      return;
    }

    try {
      setSavingWallpaper(true);
      const response = await updateConversationWallpaper({
        conversationId,
        wallpaperUrl,
      });
      const nextWallpaper = String(response?.wallpaperUrl || "");
      setChatWallpaper(nextWallpaper);
      setConversation((prev) => prev ? { ...prev, chatWallpaper: nextWallpaper } : prev);
      Alert.alert(
        wallpaperUrl ? "Wallpaper updated" : "Wallpaper removed",
        wallpaperUrl ? "The group chat wallpaper is ready." : "The group chat is back to the default background."
      );
    } catch (error) {
      Alert.alert("Unable to update wallpaper", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setSavingWallpaper(false);
    }
  }, [conversationId]);

  const pickWallpaper = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: "photo",
        quality: 0.8,
        selectionLimit: 1,
      });

      if (result.didCancel) {
        return;
      }

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        Alert.alert("Wallpaper", "Please choose a usable image.");
        return;
      }

      setSavingWallpaper(true);
      const uploadedUrl = await uploadImageAsset({
        uri: asset.uri,
        fileName: asset.fileName,
        name: asset.fileName,
        type: asset.type,
      });
      const response = await updateConversationWallpaper({
        conversationId,
        wallpaperUrl: uploadedUrl,
      });
      const nextWallpaper = String(response?.wallpaperUrl || uploadedUrl || "");
      setChatWallpaper(nextWallpaper);
      setConversation((prev) => prev ? { ...prev, chatWallpaper: nextWallpaper } : prev);
      Alert.alert("Wallpaper updated", "The group chat wallpaper is ready.");
    } catch (error) {
      Alert.alert("Unable to update wallpaper", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setSavingWallpaper(false);
    }
  }, [conversationId]);

  const toggleMuteState = useCallback(async () => {
    if (!currentUserId || !conversationId) {
      return;
    }

    try {
      await setConversationMuted(currentUserId, conversationId, !isMuted);
      setIsMuted((prev) => !prev);
    } catch (error) {
      Alert.alert("Mute group", getReadableApiErrorMessage(error, "Please try again."));
    }
  }, [conversationId, currentUserId, isMuted]);

  const submitLockPasscode = useCallback(async (passcode: string) => {
    try {
      setLockingBusy(true);
      if (lockModalMode === "setup") {
        await setChatLockPasscode(passcode);
        await setConversationLocked(currentUserId, conversationId, true);
        setIsLocked(true);
      } else {
        const isValid = await verifyChatLockPasscode(passcode);
        if (!isValid) {
          throw new Error("Incorrect passcode.");
        }

        const shouldLock = pendingLockAction === "lock";
        await setConversationLocked(currentUserId, conversationId, shouldLock);
        setIsLocked(shouldLock);
      }

      setLockModalVisible(false);
    } catch (error) {
      Alert.alert("Chat lock", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setLockingBusy(false);
    }
  }, [conversationId, currentUserId, lockModalMode, pendingLockAction]);

  const toggleLockState = useCallback(async () => {
    if (!currentUserId || !conversationId) {
      return;
    }

    if (!isLocked) {
      const hasPasscode = await hasChatLockPasscode();
      if (!hasPasscode) {
        setLockModalMode("setup");
        setPendingLockAction("lock");
        setLockModalVisible(true);
        return;
      }

      await setConversationLocked(currentUserId, conversationId, true);
      setIsLocked(true);
      return;
    }

    setPendingLockAction("unlock");
    setLockModalMode("unlock");
    setLockModalVisible(true);
  }, [conversationId, currentUserId, isLocked]);

  const handleChangeAvatar = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: "photo",
        quality: 0.7,
        selectionLimit: 1,
      });

      if (result.didCancel) {
        return;
      }

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        Alert.alert("Group photo", "Please choose a usable image.");
        return;
      }

      setSavingAvatar(true);
      const groupAvatar = await uploadImageAsset({
        uri: asset.uri,
        fileName: asset.fileName,
        name: asset.fileName,
        type: asset.type,
      });
      await updateGroupChatConversation({
        conversationId,
        groupAvatar,
      });
      await loadConversation();
    } catch (error) {
      Alert.alert("Unable to update photo", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setSavingAvatar(false);
    }
  }, [conversationId, loadConversation]);

  const handleRemoveMember = useCallback((member: ChatUser) => {
    Alert.alert(
      "Remove member",
      `Remove ${member?.username || member?.name || "this member"} from the group?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await removeGroupChatMember({
                conversationId,
                memberId: member._id,
              });
              await loadConversation();
            } catch (error) {
              Alert.alert("Unable to remove member", getReadableApiErrorMessage(error, "Please try again."));
            }
          },
        },
      ]
    );
  }, [conversationId, loadConversation]);

  const handleLeaveGroup = useCallback(() => {
    Alert.alert(
      "Leave group",
      "You will stop receiving new messages from this group.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            try {
              await removeGroupChatMember({
                conversationId,
                memberId: currentUserId,
              });
              navigation.reset({
                index: 0,
                routes: [{ name: "AllChatsScreen" }],
              });
            } catch (error) {
              Alert.alert("Unable to leave group", getReadableApiErrorMessage(error, "Please try again."));
            }
          },
        },
      ]
    );
  }, [conversationId, currentUserId, navigation]);

  const handleAdminToggle = useCallback((member: ChatUser) => {
    const isAdmin = groupAdminIds.has(member._id);
    const actionLabel = isAdmin ? "Remove admin role" : "Make admin";

    Alert.alert(
      actionLabel,
      `${actionLabel} for ${member?.username || member?.name || "this member"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: actionLabel,
          onPress: async () => {
            try {
              await (isAdmin
                ? await demoteGroupChatAdmin({ conversationId, memberId: member._id })
                : await promoteGroupChatAdmin({ conversationId, memberId: member._id }));
              await loadConversation();
            } catch (error) {
              Alert.alert("Unable to update admin role", getReadableApiErrorMessage(error, "Please try again."));
            }
          },
        },
      ]
    );
  }, [conversationId, groupAdminIds, loadConversation]);

  const handleTransferOwnership = useCallback((member: ChatUser) => {
    Alert.alert(
      "Transfer ownership",
      `Make ${member?.username || member?.name || "this member"} the new group owner?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Transfer",
          onPress: async () => {
            try {
              setTransferringOwnerId(member._id);
              await transferGroupChatOwnership({
                conversationId,
                memberId: member._id,
              });
              await loadConversation();
            } catch (error) {
              Alert.alert("Unable to transfer ownership", getReadableApiErrorMessage(error, "Please try again."));
            } finally {
              setTransferringOwnerId("");
            }
          },
        },
      ]
    );
  }, [conversationId, loadConversation]);

  const handleDeleteGroup = useCallback(() => {
    Alert.alert(
      "Delete group",
      "This will permanently delete the group, its messages, and access for all members.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete group",
          style: "destructive",
          onPress: async () => {
            try {
              setDeletingGroup(true);
              await deleteGroupChatConversation({ conversationId });
              navigation.reset({
                index: 0,
                routes: [{ name: "AllChatsScreen" }],
              });
            } catch (error) {
              Alert.alert("Unable to delete group", getReadableApiErrorMessage(error, "Please try again."));
            } finally {
              setDeletingGroup(false);
            }
          },
        },
      ]
    );
  }, [conversationId, navigation]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Group Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, { paddingBottom: 28, paddingHorizontal: 0 }]}>
      {errorMessage ? (
        <View style={[styles.errorCard, { backgroundColor: isDarkMode ? "#3b1f24" : "#FEE2E2", borderColor: isDarkMode ? "#7f1d1d" : "#FCA5A5" }]}>
          <Text style={[styles.errorText, { color: isDarkMode ? "#FECACA" : "#991B1B" }]}>{errorMessage}</Text>
        </View>
      ) : null}

      <View style={[styles.hero, { paddingHorizontal: chatMetrics.listPadding + 6, paddingTop: chatMetrics.cardPadding + 8 }]}>
        {conversation?.groupAvatar ? (
          <View style={styles.avatarWrap}>
            <Image source={{ uri: conversation.groupAvatar }} style={[styles.heroAvatar, { width: chatMetrics.heroAvatar, height: chatMetrics.heroAvatar, borderRadius: chatMetrics.heroAvatar / 2 }]} />
            {canEditGroup ? (
              <TouchableOpacity
                style={[styles.avatarEditButton, { backgroundColor: colors.primary }]}
                onPress={handleChangeAvatar}
                disabled={savingAvatar}
              >
                {savingAvatar ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Icon name="camera-outline" size={16} color="#fff" />
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View style={styles.avatarWrap}>
            <View style={[styles.heroFallback, { backgroundColor: isDarkMode ? colors.surface : "#ede9fe", width: chatMetrics.heroAvatar, height: chatMetrics.heroAvatar, borderRadius: chatMetrics.heroAvatar / 2 }]}>
              <Icon name="people-outline" size={30} color={colors.primary} />
            </View>
            {canEditGroup ? (
              <TouchableOpacity
                style={[styles.avatarEditButton, { backgroundColor: colors.primary }]}
                onPress={handleChangeAvatar}
                disabled={savingAvatar}
              >
                {savingAvatar ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Icon name="camera-outline" size={16} color="#fff" />
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {editingName ? (
          <View style={styles.editNameWrap}>
            <View style={[styles.nameInputCard, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: chatMetrics.bubbleRadius }]}>
              <TextInput
                value={groupNameDraft}
                onChangeText={setGroupNameDraft}
                placeholder="Group name"
                placeholderTextColor={colors.placeholder}
                style={[styles.nameInput, { color: colors.text, fontSize: chatMetrics.bodyFontSize + 1 }]}
              />
            </View>
            <View style={styles.editNameActions}>
              <TouchableOpacity
                style={[styles.nameSecondaryButton, { borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={() => {
                  setEditingName(false);
                  setGroupNameDraft(conversation?.groupName || "");
                }}
                disabled={savingName}
              >
                <Text style={[styles.nameSecondaryText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.namePrimaryButton, { backgroundColor: savingName ? "#a78bfa" : colors.primary }]}
                onPress={submitGroupName}
                disabled={savingName}
              >
                {savingName ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.namePrimaryText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.groupNameRow}>
            <Text style={[styles.groupName, { color: colors.text, fontSize: chatMetrics.titleFontSize + 4, lineHeight: chatMetrics.titleFontSize + 10 }]}>
              {conversation?.groupName || "Group chat"}
            </Text>
            {canEditGroup ? (
              <TouchableOpacity
                style={[styles.editNameButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setEditingName(true)}
              >
                <Icon name="create-outline" size={16} color={colors.primary} />
              </TouchableOpacity>
            ) : null}
          </View>
        )}
        <Text style={[styles.memberCount, { color: colors.mutedText, fontSize: chatMetrics.metaFontSize + 1 }]}>
          {conversation?.memberCount || members.length} members
        </Text>
      </View>

      <View style={[styles.actionsRow, { paddingHorizontal: chatMetrics.listPadding + 6 }]}>
        {canManageMembers ? (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={openAddMembers}
          >
            <Text style={styles.primaryButtonText}>Add members</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.card }]}
          onPress={handleLeaveGroup}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Leave group</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.metaCard, appShadows.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: chatMetrics.bubbleRadius + 2, marginHorizontal: chatMetrics.listPadding + 6, padding: chatMetrics.cardPadding }]}>
        <Text style={[styles.metaCardTitle, { color: colors.text, fontSize: chatMetrics.sectionTitleFontSize } ]}>Group privacy</Text>
        <View style={styles.visibilityRow}>
          {(["private", "public"] as const).map((mode) => {
            const isActive = groupVisibilityDraft === mode;
            return (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.visibilityButton,
                  {
                    backgroundColor: isActive ? colors.primary : colors.background,
                    borderColor: isActive ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setGroupVisibilityDraft(mode)}
                disabled={!canEditGroup}
              >
                <Text style={[styles.visibilityButtonText, { color: isActive ? "#fff" : colors.text }]}>
                  {mode === "public" ? "Public" : "Private"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.metaSectionLabel, { color: colors.text }]}>Who can send messages</Text>
        <Text style={[styles.metaCardText, { color: colors.mutedText }]}>
          Choose whether everyone can chat, ya sirf admins announcements bhej sakein.
        </Text>

        <View style={styles.visibilityRow}>
          {([
            { value: "everyone" as const, label: "Everyone" },
            { value: "admins" as const, label: "Admins only" },
          ]).map((mode) => {
            const isActive = groupMessagePermissionDraft === mode.value;
            return (
              <TouchableOpacity
                key={mode.value}
                style={[
                  styles.visibilityButton,
                  {
                    backgroundColor: isActive ? colors.primary : colors.background,
                    borderColor: isActive ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setGroupMessagePermissionDraft(mode.value)}
                disabled={!canEditGroup}
              >
                <Text style={[styles.visibilityButtonText, { color: isActive ? "#fff" : colors.text }]}>
                  {mode.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TextInput
          value={groupDescriptionDraft}
          onChangeText={setGroupDescriptionDraft}
          placeholder="Group description"
          placeholderTextColor={colors.placeholder}
          multiline
          maxLength={240}
          editable={canEditGroup}
          style={[styles.descriptionInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background, fontSize: chatMetrics.bodyFontSize - 1, lineHeight: chatMetrics.bodyLineHeight }]}
        />

        <Text style={[styles.metaCardText, { color: colors.mutedText }]}>
          Add website, community, invite, ya koi bhi useful link. Har line me ek link.
        </Text>

        <TextInput
          value={groupLinksDraft}
          onChangeText={setGroupLinksDraft}
          placeholder={"https://example.com\nhttps://chat.example.com/invite"}
          placeholderTextColor={colors.placeholder}
          multiline
          maxLength={720}
          editable={canEditGroup}
          style={[styles.descriptionInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background, minHeight: 110, fontSize: chatMetrics.bodyFontSize - 1, lineHeight: chatMetrics.bodyLineHeight }]}
        />

        {canEditGroup ? (
          <TouchableOpacity
            style={[styles.saveMetaButton, { backgroundColor: savingMeta ? "#a78bfa" : colors.primary }]}
            onPress={submitGroupMeta}
            disabled={savingMeta}
          >
            {savingMeta ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveMetaButtonText}>Save group settings</Text>}
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={[styles.metaCard, appShadows.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: chatMetrics.bubbleRadius + 2, marginHorizontal: chatMetrics.listPadding + 6, padding: chatMetrics.cardPadding }]}>
        <Text style={[styles.metaCardTitle, { color: colors.text, fontSize: chatMetrics.sectionTitleFontSize }]}>Chat experience</Text>
        <Text style={[styles.metaCardText, { color: colors.mutedText }]}>
          Theme and wallpaper update the shared group chat. Mute and lock stay only on this device.
        </Text>

        <TouchableOpacity
          style={[styles.settingRow, { borderColor: colors.border, backgroundColor: colors.background }]}
          onPress={() => setShowThemePicker(true)}
        >
          <View style={styles.settingRowTextWrap}>
            <Text style={[styles.settingRowTitle, { color: colors.text }]}>Chat theme</Text>
            <Text style={[styles.settingRowMeta, { color: colors.mutedText }]}>
              {currentTheme === "default" ? "Default theme" : `${currentTheme} theme`}
            </Text>
          </View>
          <Icon name="color-palette-outline" size={20} color={colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.settingRow, { borderColor: colors.border, backgroundColor: colors.background }]}
          onPress={() => {
            pickWallpaper().catch(() => {});
          }}
          disabled={savingWallpaper}
        >
          <View style={styles.settingRowTextWrap}>
            <Text style={[styles.settingRowTitle, { color: colors.text }]}>
              {chatWallpaper ? "Change wallpaper" : "Add wallpaper"}
            </Text>
            <Text style={[styles.settingRowMeta, { color: colors.mutedText }]}>
              {savingWallpaper ? "Uploading selected image..." : chatWallpaper ? "A custom wallpaper is active." : "Set a custom background for the group chat."}
            </Text>
          </View>
          {savingWallpaper ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Icon name="image-outline" size={20} color={colors.primary} />
          )}
        </TouchableOpacity>

        {chatWallpaper ? (
          <View style={[styles.wallpaperPreviewCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Image source={{ uri: normalizeMediaUrl(chatWallpaper) }} style={styles.wallpaperPreview} />
            <TouchableOpacity
              style={[styles.wallpaperRemoveButton, { borderColor: colors.border }]}
              onPress={() => {
                updateWallpaper(null).catch(() => {});
              }}
              disabled={savingWallpaper}
            >
              <Text style={[styles.wallpaperRemoveText, { color: colors.text }]}>Remove wallpaper</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.inlineControlRow}>
          <TouchableOpacity
            style={[
              styles.inlineControlButton,
              {
                backgroundColor: isMuted ? colors.background : colors.primary,
                borderColor: colors.border,
              },
            ]}
            onPress={() => {
              toggleMuteState().catch(() => {});
            }}
          >
            <Text style={[styles.inlineControlText, { color: isMuted ? colors.text : "#fff" }]}>
              {isMuted ? "Unmute group" : "Mute group"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.inlineControlButton,
              {
                backgroundColor: isLocked ? colors.background : colors.primary,
                borderColor: colors.border,
              },
            ]}
            onPress={() => {
              toggleLockState().catch(() => {});
            }}
          >
            <Text style={[styles.inlineControlText, { color: isLocked ? colors.text : "#fff" }]}>
              {isLocked ? "Unlock group" : "Lock group"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {isOwner ? (
        <View style={[styles.metaCard, appShadows.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: chatMetrics.bubbleRadius + 2, marginHorizontal: chatMetrics.listPadding + 6, padding: chatMetrics.cardPadding }]}>
          <Text style={[styles.metaCardTitle, { color: colors.text, fontSize: chatMetrics.sectionTitleFontSize }]}>Owner controls</Text>
          <Text style={[styles.metaCardText, { color: colors.mutedText }]}>
            Transfer ownership if needed, or permanently delete the whole group for everyone.
          </Text>
          <TouchableOpacity
            style={[styles.dangerButton, { borderColor: "#fecaca", backgroundColor: isDarkMode ? "#3b1f24" : "#fff1f2" }]}
            onPress={handleDeleteGroup}
            disabled={deletingGroup}
          >
            {deletingGroup ? (
              <ActivityIndicator size="small" color="#dc2626" />
            ) : (
              <>
                <Icon name="trash-outline" size={18} color="#dc2626" />
                <Text style={styles.dangerButtonText}>Delete group</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={[styles.sectionTitle, { color: colors.text, fontSize: chatMetrics.sectionTitleFontSize, paddingHorizontal: chatMetrics.listPadding + 6 }]}>Members</Text>

      <FlatList
        data={members}
        keyExtractor={(item) => item._id}
        contentContainerStyle={[styles.memberList, { paddingHorizontal: chatMetrics.listPadding + 6, gap: chatMetrics.listPadding }]}
        scrollEnabled={false}
        removeClippedSubviews={false}
        renderItem={({ item }) => {
          const isSelf = item._id === currentUserId;
          const canRemove = canManageMembers && !isSelf && conversation?.groupOwner !== item._id;

          return (
            <TouchableOpacity
              activeOpacity={0.86}
              style={[styles.memberCard, appShadows.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: chatMetrics.bubbleRadius }]}
              onPress={() => navigation.navigate("ProfilePreviewScreen", { userId: item._id })}
            >
              <Image
                source={{ uri: item.profilePic || DEFAULT_AVATAR_URL }}
                style={[styles.memberAvatar, { width: chatMetrics.senderAvatar + 10, height: chatMetrics.senderAvatar + 10, borderRadius: (chatMetrics.senderAvatar + 10) / 2 }]}
              />

              <View style={styles.memberInfo}>
                <Text style={[styles.memberName, { color: colors.text, fontSize: chatMetrics.bodyFontSize } ]}>
                  {item.username || item.name || "User"}
                </Text>
                <Text style={[styles.memberMeta, { color: colors.mutedText, fontSize: chatMetrics.metaFontSize }]}>
                  {isSelf
                    ? conversation?.groupOwner === item._id
                      ? "You • owner"
                      : groupAdminIds.has(item._id) ? "You • admin" : "You"
                    : groupAdminIds.has(item._id)
                      ? conversation?.groupOwner === item._id
                        ? "Group owner"
                        : "Group admin"
                      : item.name || item.category || "Aline2 member"}
                </Text>
              </View>

              <View style={styles.memberActions}>
                {isOwner && !isSelf && conversation?.groupOwner !== item._id ? (
                  <TouchableOpacity style={styles.memberActionButton} onPress={() => handleTransferOwnership(item)}>
                    {transferringOwnerId === item._id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Icon name="swap-horizontal-outline" size={20} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                ) : null}

                {canManageMembers && !isSelf && conversation?.groupOwner !== item._id ? (
                  <TouchableOpacity style={styles.memberActionButton} onPress={() => handleAdminToggle(item)}>
                    <Icon
                      name={groupAdminIds.has(item._id) ? "shield-checkmark-outline" : "shield-outline"}
                      size={21}
                      color={groupAdminIds.has(item._id) ? colors.primary : colors.mutedText}
                    />
                  </TouchableOpacity>
                ) : null}

                {canRemove ? (
                  <TouchableOpacity style={styles.memberActionButton} onPress={() => handleRemoveMember(item)}>
                    <Icon name="person-remove-outline" size={22} color="#dc2626" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.mutedText }]}>
              {Number(conversation?.memberCount || 0) > 0
                ? "Members are still syncing for this group. Reopen the screen in a moment."
                : "No members found."}
            </Text>
          </View>
        }
      />

      </ScrollView>

      <Modal
        visible={addMembersVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddMembersVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Add Members</Text>
              <TouchableOpacity onPress={() => setAddMembersVisible(false)}>
                <Icon name="close-outline" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalHint, { color: colors.mutedText }]}>
              {members.length}/{MAX_GROUP_MEMBERS} members. You can add {availableMemberSlots} more.
            </Text>

            <FlatList
              data={candidateUsers}
              keyExtractor={(item) => item._id}
              style={styles.modalList}
              renderItem={({ item }) => {
                const isSelected = selectedUsers.includes(item._id);

                return (
                  <TouchableOpacity
                    style={[styles.memberCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => toggleCandidate(item._id)}
                  >
                    <Image
                      source={{ uri: item.profilePic || DEFAULT_AVATAR_URL }}
                      style={styles.memberAvatar}
                    />

                    <View style={styles.memberInfo}>
                      <Text style={[styles.memberName, { color: colors.text }]}>
                        {item.username || item.name || "User"}
                      </Text>
                      <Text style={[styles.memberMeta, { color: colors.mutedText }]}>
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
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyText, { color: colors.mutedText }]}>No more people available to add.</Text>
                </View>
              }
            />

            {!candidateUsers.length ? (
              <Text style={[styles.modalHint, { color: colors.mutedText }]}>
                No more people are available to add right now.
              </Text>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: savingMembers ? "#a78bfa" : colors.primary }]}
              onPress={submitAddMembers}
              disabled={savingMembers}
            >
              {savingMembers ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Add selected members</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ChatLockModal
        visible={lockModalVisible}
        mode={lockModalMode}
        busy={lockingBusy}
        onClose={() => setLockModalVisible(false)}
        onSubmit={submitLockPasscode}
      />

      <ChatThemePicker
        visible={showThemePicker}
        conversationId={String(conversationId || "")}
        currentTheme={currentTheme}
        onClose={() => setShowThemePicker(false)}
        onThemeChanged={handleThemeChanged}
      />
    </SafeAreaView>
  );
};

export default GroupDetailsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 28,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: appFonts.semibold,
  },
  headerSpacer: {
    width: 24,
  },
  errorCard: {
    marginHorizontal: 18,
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: appFonts.medium,
  },
  hero: {
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 24,
  },
  avatarWrap: {
    position: "relative",
  },
  groupNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    gap: 10,
  },
  heroAvatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  heroFallback: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEditButton: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  groupName: {
    fontSize: 22,
    fontFamily: appFonts.bold,
    textAlign: "center",
  },
  editNameButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  editNameWrap: {
    width: "100%",
    marginTop: 14,
  },
  nameInputCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  nameInput: {
    fontSize: 16,
    paddingVertical: 14,
    textAlign: "center",
    fontFamily: appFonts.semibold,
  },
  editNameActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  nameSecondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 12,
  },
  nameSecondaryText: {
    fontWeight: "600",
  },
  namePrimaryButton: {
    flex: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  namePrimaryText: {
    color: "#fff",
    fontWeight: "700",
  },
  memberCount: {
    marginTop: 6,
    fontSize: 14,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 22,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontFamily: appFonts.semibold,
    fontSize: 15,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButtonText: {
    fontFamily: appFonts.medium,
    fontSize: 15,
  },
  metaCard: {
    marginHorizontal: 18,
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  metaCardTitle: {
    fontSize: 15,
    fontFamily: appFonts.semibold,
  },
  metaCardText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: appFonts.regular,
  },
  metaSectionLabel: {
    marginTop: 18,
    fontSize: 13.5,
    fontFamily: appFonts.bold,
  },
  visibilityRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  visibilityButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    paddingVertical: 11,
  },
  visibilityButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  descriptionInput: {
    minHeight: 92,
    borderWidth: 1,
    borderRadius: 14,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    textAlignVertical: "top",
  },
  saveMetaButton: {
    marginTop: 14,
    borderRadius: 14,
    alignItems: "center",
    paddingVertical: 13,
  },
  saveMetaButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  settingRow: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingRowTextWrap: {
    flex: 1,
  },
  settingRowTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  settingRowMeta: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
  },
  wallpaperPreviewCard: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  wallpaperPreview: {
    width: "100%",
    height: 144,
  },
  wallpaperRemoveButton: {
    margin: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
  },
  wallpaperRemoveText: {
    fontSize: 14,
    fontWeight: "700",
  },
  inlineControlRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  inlineControlButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    paddingVertical: 13,
  },
  inlineControlText: {
    fontSize: 14,
    fontWeight: "700",
  },
  dangerButton: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  dangerButtonText: {
    color: "#dc2626",
    fontSize: 14,
    fontFamily: appFonts.semibold,
  },
  sectionTitle: {
    paddingHorizontal: 18,
    paddingTop: 24,
    fontSize: 16,
    fontFamily: appFonts.semibold,
  },
  memberList: {
    padding: 18,
    gap: 12,
  },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  memberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  memberActionButton: {
    padding: 4,
  },
  memberName: {
    fontSize: 15,
    fontFamily: appFonts.semibold,
  },
  memberMeta: {
    marginTop: 3,
    fontSize: 12,
    fontFamily: appFonts.regular,
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
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
    fontFamily: appFonts.semibold,
  },
  modalList: {
    marginTop: 16,
    marginBottom: 16,
  },
  modalHint: {
    marginBottom: 14,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: appFonts.regular,
  },
});
