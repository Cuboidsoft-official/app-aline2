import React, { useCallback, useMemo, useState } from "react";
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
TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useFocusEffect } from "@react-navigation/native";
import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import Icon from "react-native-vector-icons/Ionicons";
import { getStoredUserId } from "../utils/authSession";
import { createGroupChatConversation, fetchChatConversations } from "../utils/chatApi";
import { getConversationPreview } from "../utils/chatPresentation";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { useAppTheme } from "../theme/AppThemeContext";

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

type ChatTab = "regular" | "seller" | "group";

const AllChatsScreen = ({ navigation }: any) => {
  const { colors, isDarkMode } = useAppTheme();
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

  const renderChat = ({ item }: { item: ChatUser }) => {
    const conversation = conversationMap.get(item._id);
    const subtitle = getConversationPreview(conversation)
      || (activeTab === "seller" ? "Tap to start seller conversation" : "Tap to start conversation");

    return (
      <TouchableOpacity
        style={[styles.chatCard, { borderColor: colors.border, backgroundColor: colors.card }]}
        onPress={() => navigation.navigate("ChatScreen", {
          userId: item._id,
          conversationId: conversation?._id,
          conversationType: activeTab === "seller" ? "seller" : "direct"
        })}
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
          <Text style={[styles.username, { color: colors.text }]}>
            {item.username || item.name || "User"}
          </Text>

          <Text style={[styles.lastMessage, { color: colors.mutedText }]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>

        <View style={styles.chatMeta}>
          {!!conversation?.unreadCount && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
              </Text>
            </View>
          )}

          <Icon name="chevron-forward-outline" size={20} color={colors.mutedText}/>
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

    const handlePress = () => {
      if (!hasSellerLink) {
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
          { borderColor: colors.border, backgroundColor: colors.card },
          !hasSellerLink ? styles.chatCardDisabled : null,
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
          <Text style={[styles.username, { color: colors.text }]}>
            {sellerName}
          </Text>

          <Text style={[styles.lastMessage, { color: colors.mutedText }]} numberOfLines={2}>
            {hasSellerLink
              ? subtitleParts.join(" • ") || "Tap to open seller conversation"
              : "This seller conversation is temporarily unavailable while profile details finish syncing."}
          </Text>
        </View>

        <View style={styles.chatMeta}>
          {!!item?.unreadCount && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {item.unreadCount > 99 ? "99+" : item.unreadCount}
              </Text>
            </View>
          )}

          <Icon
            name={hasSellerLink ? "chevron-forward-outline" : "alert-circle-outline"}
            size={20}
            color={hasSellerLink ? colors.mutedText : colors.placeholder}
          />
        </View>
      </TouchableOpacity>
    );
  };

  const renderGroupConversation = ({ item }: { item: Conversation }) => {
    const title = item?.groupName || "Group chat";
    const subtitle = getConversationPreview(item)
      || `${item?.memberCount || item?.members?.length || 0} members`;

    return (
      <TouchableOpacity
        style={[styles.chatCard, { borderColor: colors.border, backgroundColor: colors.card }]}
        onPress={() => navigation.navigate("ChatScreen", {
          conversationId: item._id,
          conversationType: "group",
          groupName: item?.groupName,
          groupAvatar: item?.groupAvatar,
          memberCount: item?.memberCount || item?.members?.length || 0,
        })}
      >
        {item?.groupAvatar ? (
          <Image source={{ uri: item.groupAvatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.groupAvatarCard, { backgroundColor: groupAvatarBackgroundColor }]}>
            <Icon name="people-outline" size={22} color={colors.primary} />
          </View>
        )}

        <View style={styles.chatInfo}>
          <Text style={[styles.username, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.lastMessage, { color: colors.mutedText }]} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>

        <View style={styles.chatMeta}>
          {!!item?.unreadCount && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {item.unreadCount > 99 ? "99+" : item.unreadCount}
              </Text>
            </View>
          )}

          <Icon name="chevron-forward-outline" size={20} color={colors.mutedText}/>
        </View>
      </TouchableOpacity>
    );
  };

  const listData = activeTab === "seller"
    ? orderedSellerConversations
    : activeTab === "group"
      ? orderedGroupConversations
      : orderedUsers;
  const renderListItem = activeTab === "seller"
    ? renderSellerConversation
    : activeTab === "group"
      ? renderGroupConversation
      : renderChat;
  const keyExtractor = (item: ChatUser | Conversation) => item._id;

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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Chats</Text>

        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => navigation.navigate("Search")}>
            <Icon name="search-outline" size={24} color={colors.text} />
          </TouchableOpacity>
          {activeTab === "group" ? (
            <TouchableOpacity
              style={styles.headerActionButton}
              onPress={() => {
                setErrorMessage("");
                setGroupModalVisible(true);
              }}
            >
              <Icon name="add-circle-outline" size={24} color={colors.text} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={[styles.tabs, { backgroundColor: tabsBackgroundColor, borderColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "regular" ? { backgroundColor: colors.primary } : null]}
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

      <FlatList
        data={listData}
        keyExtractor={keyExtractor}
        renderItem={renderListItem}
        showsVerticalScrollIndicator={false}
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
    </SafeAreaView>
  );
};

export default AllChatsScreen;

const styles = StyleSheet.create({

container:{
 flex:1,
},

header:{
 flexDirection:"row",
 justifyContent:"space-between",
 alignItems:"center",
 paddingHorizontal:18,
 marginBottom:10,
 paddingBottom:20,
 borderBottomWidth:1,
},

headerTitle:{
 fontSize:24,
 fontWeight:"bold"
},

headerActions:{
 flexDirection:"row",
 alignItems:"center"
},

headerActionButton:{
 marginLeft:16
},

tabs:{
 flexDirection:"row",
 marginHorizontal:15,
 marginBottom:10,
 borderRadius:10,
 borderWidth:1,
 padding:4,
},

tab:{
 flex:1,
 paddingVertical:10,
 alignItems:"center",
 borderRadius:8
},

tabText:{
 fontSize:14,
},

activeTabText:{
 fontWeight:"600"
},

chatCard:{
 flexDirection:"row",
 alignItems:"center",
 padding:15,
 borderBottomWidth:1,
},

chatCardDisabled:{
 opacity:0.72,
},

avatarContainer:{
 position:"relative",
 marginRight:15
},

avatar:{
 width:55,
 height:55,
 borderRadius:28
},

groupAvatarCard:{
 width:55,
 height:55,
 borderRadius:28,
 justifyContent:"center",
 alignItems:"center",
 marginRight:15
},

onlineDot:{
 width:12,
 height:12,
 borderRadius:6,
 backgroundColor:"#22c55e",
 position:"absolute",
 bottom:2,
 right:2,
 borderWidth:2,
 borderColor:"#fff"
},

chatInfo:{
 flex:1
},

chatMeta:{
 alignItems:"flex-end"
},

emptyState:{
 paddingHorizontal:24,
 paddingTop:48,
 alignItems:"center"
},

emptyTitle:{
 fontSize:16,
 fontWeight:"600",
},

emptyText:{
 marginTop:8,
 fontSize:13,
 lineHeight:18,
 textAlign:"center"
},

username:{
 fontSize:16,
 fontWeight:"600"
},

lastMessage:{
 marginTop:3,
 fontSize:13
},

unreadBadge:{
 minWidth:22,
 height:22,
 borderRadius:11,
 paddingHorizontal:6,
 alignItems:"center",
 justifyContent:"center",
 backgroundColor:"#7b3fe4",
 marginBottom:8
},

unreadText:{
 color:"#fff",
 fontSize:11,
 fontWeight:"700"
},

center:{
 flex:1,
 justifyContent:"center",
 alignItems:"center"
},

modalBackdrop:{
 flex:1,
 backgroundColor:"rgba(17,24,39,0.55)",
 justifyContent:"flex-end"
},

modalCard:{
 borderTopLeftRadius:24,
 borderTopRightRadius:24,
 borderWidth:1,
 paddingHorizontal:18,
 paddingTop:18,
 paddingBottom:24,
 maxHeight:"85%"
},

modalHeader:{
 flexDirection:"row",
 justifyContent:"space-between",
 alignItems:"center"
},

modalTitle:{
 fontSize:18,
 fontWeight:"700"
},

groupNameInput:{
 marginTop:16,
 borderWidth:1,
 borderRadius:14,
 paddingHorizontal:14,
 paddingVertical:14,
 fontSize:15
},

modalHelper:{
 marginTop:10,
 fontSize:13,
 lineHeight:19
},

groupPickerList:{
 marginTop:16
},

groupEligibilityHint:{
 marginTop:10,
 fontSize:12,
 lineHeight:18
},

memberRow:{
 flexDirection:"row",
 alignItems:"center",
 paddingVertical:12,
 borderBottomWidth:1
},

memberAvatar:{
 width:42,
 height:42,
 borderRadius:21,
 marginRight:12
},

memberMeta:{
 flex:1
},

memberName:{
 fontSize:15,
 fontWeight:"600"
},

memberSubtitle:{
 marginTop:3,
 fontSize:12
},

createGroupButton:{
 marginTop:16,
 borderRadius:14,
 paddingVertical:15,
 alignItems:"center"
},

createGroupButtonText:{
 color:"#fff",
 fontWeight:"700",
 fontSize:15
}

});
