import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import {
  addGroupChatMembers,
  demoteGroupChatAdmin,
  fetchChatConversationDetails,
  promoteGroupChatAdmin,
  removeGroupChatMember,
  updateGroupChatConversation,
} from "../utils/chatApi";
import { getStoredUserId } from "../utils/authSession";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { useAppTheme } from "../theme/AppThemeContext";

type ChatUser = {
  _id: string;
  username?: string;
  name?: string;
  profilePic?: string;
  category?: string;
};

type GroupConversation = {
  _id: string;
  groupName?: string | null;
  groupAvatar?: string | null;
  members?: ChatUser[];
  memberCount?: number;
  isGroupOwner?: boolean;
  isGroupAdmin?: boolean;
  groupOwner?: string | null;
  groupAdmins?: string[];
};

const GroupDetailsScreen = ({ navigation, route }: any) => {
  const { colors, isDarkMode } = useAppTheme();
  const { conversationId } = route.params || {};

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

  const loadConversation = useCallback(async () => {
    try {
      setLoading(true);
      const [storedUserId, conversationRes] = await Promise.all([
        getStoredUserId(),
        fetchChatConversationDetails(conversationId),
      ]);

      setCurrentUserId(storedUserId || "");
      const nextConversation = (conversationRes?.conversation || null) as GroupConversation | null;
      setConversation(nextConversation);
      setGroupNameDraft(nextConversation?.groupName || "");
      setErrorMessage("");
    } catch (error) {
      console.log("group details load error:", error);
      setConversation(null);
      setErrorMessage(getReadableApiErrorMessage(error, "Failed to load group details."));
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      loadConversation().catch(() => {});
    }, [loadConversation])
  );

  const canManageMembers = Boolean(conversation?.isGroupOwner || conversation?.isGroupAdmin);
  const canEditGroup = canManageMembers;
  const isOwner = Boolean(conversation?.isGroupOwner);
  const members = useMemo(() => Array.isArray(conversation?.members) ? conversation.members : [], [conversation]);
  const groupAdminIds = useMemo(
    () => new Set(Array.isArray(conversation?.groupAdmins) ? conversation.groupAdmins.map((entry) => String(entry)) : []),
    [conversation]
  );

  const openAddMembers = useCallback(async () => {
    try {
      const res = await API.get("/auth/users");
      const existingIds = new Set(members.map((member) => member._id));
      const availableUsers = ((res?.data?.users || []) as ChatUser[]).filter(
        (user) => user?._id && !existingIds.has(user._id)
      );
      setCandidateUsers(availableUsers);
      setSelectedUsers([]);
      setAddMembersVisible(true);
    } catch (error) {
      Alert.alert("Unable to load people", getReadableApiErrorMessage(error, "Please try again."));
    }
  }, [members]);

  const toggleCandidate = useCallback((userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((entry) => entry !== userId)
        : [...prev, userId]
    );
  }, []);

  const submitAddMembers = useCallback(async () => {
    if (!selectedUsers.length) {
      Alert.alert("Add members", "Select at least one member to add.");
      return;
    }

    try {
      setSavingMembers(true);
      const res = await addGroupChatMembers({
        conversationId,
        memberIds: selectedUsers,
      });
      setConversation((res?.conversation || null) as GroupConversation | null);
      setAddMembersVisible(false);
      setCandidateUsers([]);
      setSelectedUsers([]);
    } catch (error) {
      Alert.alert("Unable to add members", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setSavingMembers(false);
    }
  }, [conversationId, selectedUsers]);

  const submitGroupName = useCallback(async () => {
    if (!groupNameDraft.trim()) {
      Alert.alert("Group name", "Enter a group name.");
      return;
    }

    try {
      setSavingName(true);
      const res = await updateGroupChatConversation({
        conversationId,
        groupName: groupNameDraft.trim(),
      });
      setConversation((res?.conversation || null) as GroupConversation | null);
      setEditingName(false);
    } catch (error) {
      Alert.alert("Unable to update group", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setSavingName(false);
    }
  }, [conversationId, groupNameDraft]);

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
              const res = await removeGroupChatMember({
                conversationId,
                memberId: member._id,
              });
              setConversation((res?.conversation || null) as GroupConversation | null);
            } catch (error) {
              Alert.alert("Unable to remove member", getReadableApiErrorMessage(error, "Please try again."));
            }
          },
        },
      ]
    );
  }, [conversationId]);

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
              const res = isAdmin
                ? await demoteGroupChatAdmin({ conversationId, memberId: member._id })
                : await promoteGroupChatAdmin({ conversationId, memberId: member._id });
              setConversation((res?.conversation || null) as GroupConversation | null);
            } catch (error) {
              Alert.alert("Unable to update admin role", getReadableApiErrorMessage(error, "Please try again."));
            }
          },
        },
      ]
    );
  }, [conversationId, groupAdminIds]);

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

      {errorMessage ? (
        <View style={[styles.errorCard, { backgroundColor: isDarkMode ? "#3b1f24" : "#FEE2E2", borderColor: isDarkMode ? "#7f1d1d" : "#FCA5A5" }]}>
          <Text style={[styles.errorText, { color: isDarkMode ? "#FECACA" : "#991B1B" }]}>{errorMessage}</Text>
        </View>
      ) : null}

      <View style={styles.hero}>
        {conversation?.groupAvatar ? (
          <Image source={{ uri: conversation.groupAvatar }} style={styles.heroAvatar} />
        ) : (
          <View style={[styles.heroFallback, { backgroundColor: isDarkMode ? colors.surface : "#ede9fe" }]}>
            <Icon name="people-outline" size={30} color={colors.primary} />
          </View>
        )}

        {editingName ? (
          <View style={styles.editNameWrap}>
            <View style={[styles.nameInputCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <TextInput
                value={groupNameDraft}
                onChangeText={setGroupNameDraft}
                placeholder="Group name"
                placeholderTextColor={colors.placeholder}
                style={[styles.nameInput, { color: colors.text }]}
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
            <Text style={[styles.groupName, { color: colors.text }]}>
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
        <Text style={[styles.memberCount, { color: colors.mutedText }]}>
          {conversation?.memberCount || members.length} members
        </Text>
      </View>

      <View style={styles.actionsRow}>
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

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Members</Text>

      <FlatList
        data={members}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.memberList}
        renderItem={({ item }) => {
          const isSelf = item._id === currentUserId;
          const canRemove = canManageMembers && !isSelf;

          return (
            <View style={[styles.memberCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Image
                source={{ uri: item.profilePic || DEFAULT_AVATAR_URL }}
                style={styles.memberAvatar}
              />

              <View style={styles.memberInfo}>
                <Text style={[styles.memberName, { color: colors.text }]}>
                  {item.username || item.name || "User"}
                </Text>
                <Text style={[styles.memberMeta, { color: colors.mutedText }]}>
                  {isSelf
                    ? groupAdminIds.has(item._id) ? "You • admin" : "You"
                    : groupAdminIds.has(item._id)
                      ? "Group admin"
                      : item.name || item.category || "Aline2 member"}
                </Text>
              </View>

              <View style={styles.memberActions}>
                {isOwner && !isSelf ? (
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
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.mutedText }]}>No members found.</Text>
          </View>
        }
      />

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
    </SafeAreaView>
  );
};

export default GroupDetailsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    fontWeight: "700",
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
    fontWeight: "600",
  },
  hero: {
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 24,
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
  groupName: {
    fontSize: 22,
    fontWeight: "800",
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
    fontWeight: "700",
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
    fontWeight: "700",
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
    fontWeight: "600",
    fontSize: 15,
  },
  sectionTitle: {
    paddingHorizontal: 18,
    paddingTop: 24,
    fontSize: 16,
    fontWeight: "700",
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
    fontWeight: "600",
  },
  memberMeta: {
    marginTop: 3,
    fontSize: 12,
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
    fontWeight: "700",
  },
  modalList: {
    marginTop: 16,
    marginBottom: 16,
  },
});
