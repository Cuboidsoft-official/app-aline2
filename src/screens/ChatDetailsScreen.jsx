import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import {
  createChatConversation,
  fetchConversationMedia,
  searchConversationMessages,
} from "../utils/chatApi";
import {
  getAttachmentDisplayName,
  getMessageAttachment,
  getMessageText,
  isImageMessage,
  isVideoMessage,
} from "../utils/chatPresentation";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { useAppTheme } from "../theme/AppThemeContext";

const PRIMARY = "#7b3fe4";

const Action = ({ icon, title, onPress, colors }) => (
  <TouchableOpacity style={styles.actionItem} onPress={onPress}>
    <View style={[styles.actionIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Icon name={icon} size={24} color="#7b3fe4" />
    </View>
    <Text style={[styles.actionText, { color: colors.text }]}>{title}</Text>
  </TouchableOpacity>
);

const Option = ({ icon, title, onPress, colors }) => (
  <TouchableOpacity style={[styles.optionRow, { borderBottomColor: colors.border }]} onPress={onPress}>
    <Icon name={icon} size={22} style={[styles.optionIcon, { color: colors.text }]} />
    <Text style={[styles.optionLabel, { color: colors.text }]}>{title}</Text>
    <Icon name="chevron-forward" color={colors.mutedText} />
  </TouchableOpacity>
);

const MediaCard = ({ item, onPress }) => {
  const attachment = getMessageAttachment(item);
  const imageUri = attachment?.thumbnailUrl || attachment?.url || null;
  const showPreview = Boolean(imageUri) && (isImageMessage(item) || isVideoMessage(item));
  const label = getAttachmentDisplayName(item);

  return (
    <TouchableOpacity style={styles.mediaCard} onPress={onPress} activeOpacity={0.85}>
      {showPreview ? (
        <Image source={{ uri: imageUri }} style={styles.mediaBox} />
      ) : (
        <View style={[styles.mediaBox, styles.mediaFallback]}>
          <Icon
            name={item?.messageType === "audio" ? "musical-notes-outline" : "document-text-outline"}
            size={28}
            color="#6b7280"
          />
        </View>
      )}
      {isVideoMessage(item) ? (
        <View style={styles.mediaBadge}>
          <Icon name="play" size={12} color="#fff" />
        </View>
      ) : null}
      <Text numberOfLines={1} style={styles.mediaLabel}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const SearchResult = ({ item }) => {
  const preview = getMessageText(item) || getAttachmentDisplayName(item);
  const senderName = item?.sender?.username || item?.sender?.name || "Unknown";
  const timestamp = item?.createdAt ? new Date(item.createdAt).toLocaleString() : "";

  return (
    <View style={styles.searchResult}>
      <Text style={styles.searchSender}>{senderName}</Text>
      <Text style={styles.searchPreview}>{preview}</Text>
      {timestamp ? <Text style={styles.searchTime}>{timestamp}</Text> : null}
    </View>
  );
};

const ChatDetailsScreen = ({ route, navigation }) => {
  const { colors } = useAppTheme();
  const { userId, conversationId } = route.params || {};
  const [user, setUser] = useState(null);
  const [media, setMedia] = useState([]);
  const [resolvedConversationId, setResolvedConversationId] = useState(conversationId || null);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  const fetchUser = useCallback(async () => {
    try {
      const res = await API.get(`/auth/user/${userId}`);
      setUser(res.data.user);
    } catch (err) {
      console.log("chat details user error:", err?.response?.data || err);
    }
  }, [userId]);

  const ensureConversation = useCallback(async () => {
    if (resolvedConversationId) {
      return resolvedConversationId;
    }

    if (!userId) {
      return null;
    }

    try {
      const res = await createChatConversation({ receiverId: userId, conversationType: "direct" });
      const nextConversationId = res?.conversation?._id || null;
      if (nextConversationId) {
        setResolvedConversationId(nextConversationId);
      }
      return nextConversationId;
    } catch (err) {
      console.log("chat details conversation error:", err?.response?.data || err);
      return null;
    }
  }, [resolvedConversationId, userId]);

  const loadMedia = useCallback(async () => {
    try {
      setLoadingMedia(true);
      const nextConversationId = await ensureConversation();

      if (!nextConversationId) {
        setMedia([]);
        return;
      }

      const res = await fetchConversationMedia(nextConversationId, { limit: 12 });
      setMedia(Array.isArray(res?.media) ? res.media : []);
    } catch (err) {
      console.log("chat details media error:", err?.response?.data || err);
      setMedia([]);
    } finally {
      setLoadingMedia(false);
    }
  }, [ensureConversation]);

  useEffect(() => {
    fetchUser();
    loadMedia();
  }, [fetchUser, loadMedia]);

  useFocusEffect(
    useCallback(() => {
      fetchUser().catch(() => {});
      loadMedia().catch(() => {});
    }, [fetchUser, loadMedia]),
  );

  const blockUser = async () => {
    Alert.alert(
      "Block user",
      `Block ${user?.name || user?.username || "this account"}? You can unblock them later from Settings.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              await API.post(`/user/block/${userId}`, {});
              Alert.alert("Blocked", "This user has been blocked.");
              navigation.goBack();
            } catch (error) {
              console.log("block user error:", error);
              Alert.alert("Unable to block user", getReadableApiErrorMessage(error, "Please try again."));
            }
          }
        }
      ]
    );
  };

  const toggleSearch = () => {
    setSearchVisible((prev) => {
      const nextValue = !prev;
      if (!nextValue) {
        setSearchQuery("");
        setSearchResults([]);
      }
      return nextValue;
    });
  };

  const runSearch = async () => {
    const trimmedQuery = String(searchQuery || "").trim();

    if (!trimmedQuery) {
      Alert.alert("Search messages", "Enter a word or phrase to search this conversation.");
      return;
    }

    try {
      setSearching(true);
      const nextConversationId = await ensureConversation();

      if (!nextConversationId) {
        Alert.alert("Search unavailable", "Conversation details are still syncing. Please open the chat once and try again.");
        return;
      }

      const res = await searchConversationMessages(nextConversationId, {
        q: trimmedQuery,
        limit: 20,
      });
      setSearchResults(Array.isArray(res?.messages) ? res.messages : []);
    } catch (err) {
      console.log("chat search error:", err?.response?.data || err);
      Alert.alert("Search failed", getReadableApiErrorMessage(err, "Please try again."));
    } finally {
      setSearching(false);
    }
  };

  const mediaSummary = useMemo(() => {
    if (loadingMedia) {
      return "Loading shared media...";
    }

    if (!media.length) {
      return "No shared media yet";
    }

    return `${media.length} recent shared attachment${media.length === 1 ? "" : "s"}`;
  }, [loadingMedia, media]);

  const openAttachment = async (item) => {
    const attachment = getMessageAttachment(item);
    const targetUrl = attachment?.url || attachment?.thumbnailUrl;

    if (!targetUrl) {
      return;
    }

    try {
      await Linking.openURL(targetUrl);
    } catch (error) {
      console.log("attachment open error:", error);
      Alert.alert("Unable to open attachment", getReadableApiErrorMessage(error, "This file could not be opened on the device."));
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      <View style={[styles.header, { backgroundColor: PRIMARY }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>User Details</Text>

        <TouchableOpacity onPress={toggleSearch}>
          <Icon name="search" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.profileSection}>
          <View style={[styles.avatarRing, { backgroundColor: colors.surface }]}>
            <Image
              source={{
                uri: user?.profilePic || DEFAULT_AVATAR_URL
              }}
              style={styles.avatar}
            />
          </View>

          <Text style={[styles.username, { color: colors.text }]}>{user?.name || user?.username || "User"}</Text>
          <Text style={[styles.phone, { color: colors.mutedText }]}>
            {user?.username ? `@${user.username}` : user?.phone || "Conversation details"}
          </Text>
        </View>

        <View style={styles.actions}>
          <Action icon="search-outline" title="Search" onPress={toggleSearch} colors={colors} />
          <Action icon="images-outline" title="Media" onPress={loadMedia} colors={colors} />
          <Action icon="notifications-outline" title="Alerts" onPress={() => navigation.navigate("NotificationSettingsScreen")} colors={colors} />
          <Action icon="close-circle-outline" title="Block" onPress={blockUser} colors={colors} />
        </View>

        {searchVisible ? (
          <View style={[styles.searchCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Search in conversation</Text>
            <View style={styles.searchInputRow}>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search messages"
                placeholderTextColor={colors.placeholder}
                style={[styles.searchInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
                returnKeyType="search"
                onSubmitEditing={runSearch}
              />
              <TouchableOpacity style={styles.searchButton} onPress={runSearch} disabled={searching}>
                {searching ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="search" size={18} color="#fff" />}
              </TouchableOpacity>
            </View>

            {searchResults.length ? (
              <View style={styles.searchResults}>
                {searchResults.map((item) => (
                  <SearchResult key={item._id} item={item} />
                ))}
              </View>
            ) : (
              <Text style={[styles.searchHint, { color: colors.mutedText }]}>
                {searching ? "Searching..." : "Search results will appear here."}
              </Text>
            )}
          </View>
        ) : null}

        <View style={styles.mediaSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Shared media</Text>
          <Text style={[styles.mediaSummary, { color: colors.mutedText }]}>{mediaSummary}</Text>

          {loadingMedia ? (
            <View style={styles.noMediaBox}>
              <ActivityIndicator size="small" color="#7b3fe4" />
            </View>
          ) : media.length > 0 ? (
            <View style={styles.mediaGrid}>
              {media.map((item) => (
                <MediaCard key={item._id} item={item} onPress={() => openAttachment(item)} />
              ))}
            </View>
          ) : (
            <View style={styles.noMediaBox}>
              <Icon name="images-outline" size={30} color="#aaa" />
              <Text style={[styles.noMediaText, { color: colors.mutedText }]}>No shared media files</Text>
            </View>
          )}
        </View>

        <View style={[styles.optionBox, { backgroundColor: colors.card }]}>
          <Option icon="notifications-outline" title="Notifications" onPress={() => navigation.navigate("NotificationSettingsScreen")} colors={colors} />
          <Option icon="images-outline" title="Refresh shared media" onPress={loadMedia} colors={colors} />
          <Option icon="search-outline" title="Search messages" onPress={toggleSearch} colors={colors} />
        </View>

        <TouchableOpacity style={[styles.blockButton, { borderColor: colors.danger }]} onPress={blockUser}>
          <Icon name="close-circle-outline" size={20} color="#ef4444" />
          <Text style={styles.blockText}>Block {user?.name || "User"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

export default ChatDetailsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f6f7fb"
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 55,
    paddingBottom: 15,
    backgroundColor: "#7b3fe4"
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600"
  },
  profileSection: {
    alignItems: "center",
    marginTop: 25
  },
  avatarRing: {
    padding: 4,
    borderRadius: 70,
    backgroundColor: "#e9e0ff"
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55
  },
  username: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 12
  },
  phone: {
    color: "#777",
    marginTop: 4
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 30
  },
  actionItem: {
    alignItems: "center"
  },
  actionIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2
  },
  actionText: {
    marginTop: 6,
    fontSize: 12
  },
  searchCard: {
    marginTop: 28,
    marginHorizontal: 18,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16
  },
  searchInputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#111827",
    backgroundColor: "#f9fafb"
  },
  searchButton: {
    marginLeft: 10,
    backgroundColor: "#7b3fe4",
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  searchHint: {
    marginTop: 12,
    color: "#6b7280",
    fontSize: 13
  },
  searchResults: {
    marginTop: 14,
    gap: 10
  },
  searchResult: {
    borderWidth: 1,
    borderColor: "#ede9fe",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#faf7ff"
  },
  searchSender: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6d28d9",
    marginBottom: 4
  },
  searchPreview: {
    fontSize: 14,
    color: "#111827"
  },
  searchTime: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 6
  },
  mediaSection: {
    marginTop: 35,
    paddingHorizontal: 20
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10
  },
  mediaSummary: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 12
  },
  mediaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 14
  },
  mediaCard: {
    width: "31%"
  },
  mediaBox: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: "#e5e7eb"
  },
  mediaFallback: {
    justifyContent: "center",
    alignItems: "center"
  },
  mediaBadge: {
    position: "absolute",
    right: 8,
    top: 8,
    backgroundColor: "rgba(17, 24, 39, 0.75)",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 4
  },
  mediaLabel: {
    marginTop: 6,
    fontSize: 11,
    color: "#4b5563"
  },
  noMediaBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 25
  },
  noMediaText: {
    marginTop: 8,
    fontSize: 13,
    color: "#999"
  },
  optionBox: {
    marginTop: 35,
    backgroundColor: "#fff",
    marginHorizontal: 18,
    borderRadius: 14
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderColor: "#f0f0f0"
  },
  optionIcon: {
    marginRight: 15
  },
  optionLabel: {
    flex: 1
  },
  blockButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    margin: 20,
    padding: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ef4444"
  },
  blockText: {
    color: "#ef4444",
    marginLeft: 8,
    fontWeight: "600"
  }
});
