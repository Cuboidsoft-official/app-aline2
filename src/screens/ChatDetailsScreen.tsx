/**
 * ChatDetailsScreen — Direct-chat detail/info screen
 *
 * Shows user profile, shared media grid, message search, chat-theme picker,
 * and block/report actions.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
  TextInput,
  ScrollView
} from "react-native";
import { Alert } from "../utils/appAlert";
import { SafeAreaView } from "react-native-safe-area-context";
import { launchImageLibrary } from "react-native-image-picker";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import {
    clearConversationMessages,
    fetchConversationMedia,
    fetchChatConversationDetails,
    searchConversationMessages,
    updateConversationDisappearingMessages,
    updateConversationWallpaper,
} from "../utils/chatApi";
import { normalizeMediaUrl } from "../utils/mediaUrls";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { useAppTheme } from "../theme/AppThemeContext";
import ChatThemePicker from "../components/chat/ChatThemePicker";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { uploadImageAsset } from "../utils/uploadMedia";
import ChatLockModal from "../components/chat/ChatLockModal";
import {
    hasChatLockPasscode,
    isConversationLocked,
    setChatLockPasscode,
    setConversationLocked,
    verifyChatLockPasscode,
} from "../utils/chatSecurity";
import { getStoredUserId } from "../utils/authSession";
import AppAvatar from "../components/AppAvatar";

const PRIMARY = "#111111";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChatUser {
    _id?: string;
    id?: string;
    username?: string;
    name?: string;
    profilePic?: string;
    phone?: string;
}

interface MediaItem {
    _id: string;
    messageType: string;
    mediaUrl?: string;
    thumbnailUrl?: string;
    fileName?: string;
    fileSize?: number;
    duration?: number;
    text?: string;
    createdAt?: string;
}

interface SearchResult {
    _id: string;
    text?: string;
    fileName?: string;
    createdAt?: string;
    sender?: { username?: string; name?: string };
}

const escapeSearchText = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const renderHighlightedText = (value: string, query: string, textColor: string) => {
    const safeValue = String(value || "");
    const trimmedQuery = String(query || "").trim();

    if (!trimmedQuery) {
        return safeValue;
    }

    return safeValue
        .split(new RegExp(`(${escapeSearchText(trimmedQuery)})`, "ig"))
        .filter(Boolean)
        .map((part, index) => {
            const isMatch = part.toLowerCase() === trimmedQuery.toLowerCase();

            return (
                <Text
                    key={`${part}-${index}`}
                    style={isMatch ? styles.searchHighlight : { color: textColor }}
                >
                    {part}
                </Text>
            );
        });
};

// ─── Sub-components ─────────────────────────────────────────────────────────

interface OptionProps {
    icon: string;
    title: string;
    onPress: () => void;
    colors: any;
}

const Option: React.FC<OptionProps> = ({ icon, title, onPress, colors }) => (
    <TouchableOpacity style={styles.optionRow} activeOpacity={0.7} onPress={onPress}>
        <Icon name={icon} size={22} color={colors.text} />
        <Text style={[styles.optionTitle, { color: colors.text }]}>{title}</Text>
        <Icon name="chevron-forward" size={18} color={colors.placeholder} />
    </TouchableOpacity>
);

const DestructiveOption: React.FC<OptionProps> = ({ icon, title, onPress, colors }) => (
    <TouchableOpacity style={styles.optionRow} activeOpacity={0.7} onPress={onPress}>
        <Icon name={icon} size={22} color={colors.danger || "#e74c3c"} />
        <Text style={[styles.optionTitle, { color: colors.danger || "#e74c3c" }]}>{title}</Text>
        <Icon name="chevron-forward" size={18} color={colors.placeholder} />
    </TouchableOpacity>
);

const MediaGridItem = ({ item, onPress }: { item: MediaItem; onPress: () => void }) => {
    const uri = normalizeMediaUrl(item.thumbnailUrl || item.mediaUrl || "");
    if (!uri) return null;

    return (
        <TouchableOpacity style={styles.gridCell} activeOpacity={0.8} onPress={onPress}>
            <Image source={{ uri }} style={styles.gridImage} resizeMode="cover" />
            {item.messageType === "video" && (
                <View style={styles.videoOverlay}>
                    <Icon name="play-circle" size={28} color="#fff" />
                </View>
            )}
        </TouchableOpacity>
    );
};

// ─── Main Screen ────────────────────────────────────────────────────────────

const ChatDetailsScreen = ({ navigation, route }: any) => {
    const { colors } = useAppTheme();
    const { userId, conversationId } = route.params || {};

    const [user, setUser] = useState<ChatUser | null>(null);
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [loadingMedia, setLoadingMedia] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searching, setSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [showThemePicker, setShowThemePicker] = useState(false);
    const [currentTheme, setCurrentTheme] = useState("default");
    const [chatWallpaper, setChatWallpaper] = useState("");
    const [savingWallpaper, setSavingWallpaper] = useState(false);
    const [currentUserId, setCurrentUserId] = useState("");
    const [isLocked, setIsLocked] = useState(false);
    const [lockModalVisible, setLockModalVisible] = useState(false);
    const [lockModalMode, setLockModalMode] = useState<"unlock" | "setup">("unlock");
    const [lockingBusy, setLockingBusy] = useState(false);
    const [pendingLockAction, setPendingLockAction] = useState<"lock" | "unlock">("lock");
    const [disappearingMessagesSeconds, setDisappearingMessagesSeconds] = useState(0);
    const [updatingDisappearingMessages, setUpdatingDisappearingMessages] = useState(false);
    const [clearingChat, setClearingChat] = useState(false);

    const resolvedConversationId = useMemo(() => conversationId || null, [conversationId]);

    // ─── Data fetching ──────────────────────────────────────────────────────

    const fetchUser = useCallback(async () => {
        if (!userId) return;
        try {
            const res = await API.get(`/auth/user/${userId}`);
            setUser(res.data?.user || null);
        } catch (err: any) {
            console.log("ChatDetails user fetch error:", err?.response?.data || err);
        }
    }, [userId]);

    const loadMedia = useCallback(async () => {
        if (!resolvedConversationId) return;
        setLoadingMedia(true);
        try {
            const data = await fetchConversationMedia(resolvedConversationId, { limit: 24 });
            setMedia(data?.media || []);
        } catch (err: any) {
            console.log("ChatDetails media fetch error:", err?.response?.data || err);
        } finally {
            setLoadingMedia(false);
        }
    }, [resolvedConversationId]);

    const loadConversationSettings = useCallback(async () => {
        if (!resolvedConversationId) {
            return;
        }

        try {
            const data = await fetchChatConversationDetails(resolvedConversationId);
            const conversation = data?.conversation;
            setCurrentTheme(String(conversation?.chatTheme || "default"));
            setChatWallpaper(String(conversation?.chatWallpaper || ""));
            setDisappearingMessagesSeconds(Number(conversation?.disappearingMessagesSeconds) || 0);
        } catch (err: any) {
            console.log("ChatDetails settings fetch error:", err?.response?.data || err);
        }
    }, [resolvedConversationId]);

    useEffect(() => {
        fetchUser();
        loadMedia();
        loadConversationSettings();
    }, [fetchUser, loadConversationSettings, loadMedia]);

    useEffect(() => {
        const loadLockState = async () => {
            const storedUserId = await getStoredUserId();
            setCurrentUserId(storedUserId || "");

            if (!resolvedConversationId || !storedUserId) {
                setIsLocked(false);
                return;
            }

            const locked = await isConversationLocked(storedUserId, resolvedConversationId);
            setIsLocked(locked);
        };

        loadLockState().catch((error) => {
            console.log("ChatDetails lock load error:", error);
        });
    }, [resolvedConversationId]);

    // ─── Search ─────────────────────────────────────────────────────────────

    const [showSearch, setShowSearch] = useState(false);

    const toggleSearch = useCallback(() => {
        setShowSearch((prev) => !prev);
        if (showSearch) {
            setSearchQuery("");
            setSearchResults([]);
        }
    }, [showSearch]);

    const handleSearch = useCallback(async (queryOverride?: string) => {
        const trimmedQuery = String(queryOverride ?? searchQuery).trim();

        if (!resolvedConversationId || !trimmedQuery) {
            setSearchResults([]);
            return;
        }

        setSearching(true);
        try {
            const data = await searchConversationMessages(resolvedConversationId, { q: trimmedQuery });
            setSearchResults(data?.messages || []);
        } catch (err: any) {
            console.log("ChatDetails search error:", err?.response?.data || err);
        } finally {
            setSearching(false);
        }
    }, [resolvedConversationId, searchQuery]);

    useEffect(() => {
        if (!showSearch) {
            return;
        }

        const trimmedQuery = searchQuery.trim();
        if (!trimmedQuery) {
            setSearchResults([]);
            setSearching(false);
            return;
        }

        const timeoutId = setTimeout(() => {
            handleSearch(trimmedQuery).catch(() => {});
        }, 220);

        return () => clearTimeout(timeoutId);
    }, [handleSearch, searchQuery, showSearch]);

    // ─── Block user ─────────────────────────────────────────────────────────

    const blockUser = useCallback(() => {
        Alert.alert(
            "Block User",
            `Are you sure you want to block ${user?.name || user?.username || "this user"}?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Block",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await API.post(`/user/block/${user?._id || userId}`);
                            Alert.alert("Blocked", "User has been blocked.");
                            navigation.goBack();
                        } catch (err: any) {
                            console.log("Block error:", err?.response?.data || err);
                            Alert.alert("Error", getReadableApiErrorMessage(err, "Failed to block user."));
                        }
                    },
                },
            ]
        );
    }, [navigation, user, userId]);

    const updateWallpaper = useCallback(async (wallpaperUrl: string | null) => {
        if (!resolvedConversationId) {
            return;
        }

        try {
            setSavingWallpaper(true);
            const response = await updateConversationWallpaper({
                conversationId: resolvedConversationId,
                wallpaperUrl,
            });
            setChatWallpaper(String(response?.wallpaperUrl || ""));
            Alert.alert(
                wallpaperUrl ? "Wallpaper updated" : "Wallpaper removed",
                wallpaperUrl ? "Your custom chat wallpaper is ready." : "The chat is back to its default background."
            );
        } catch (error) {
            Alert.alert("Unable to update wallpaper", getReadableApiErrorMessage(error, "Please try again."));
        } finally {
            setSavingWallpaper(false);
        }
    }, [resolvedConversationId]);

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
                conversationId: resolvedConversationId,
                wallpaperUrl: uploadedUrl,
            });
            setChatWallpaper(String(response?.wallpaperUrl || uploadedUrl));
            Alert.alert("Wallpaper updated", "Your custom chat wallpaper is ready.");
        } catch (error) {
            Alert.alert("Unable to update wallpaper", getReadableApiErrorMessage(error, "Please try again."));
        } finally {
            setSavingWallpaper(false);
        }
    }, [resolvedConversationId]);

    const submitLockPasscode = useCallback(async (passcode: string) => {
        try {
            setLockingBusy(true);
            if (lockModalMode === "setup") {
                await setChatLockPasscode(passcode);
                await setConversationLocked(currentUserId, resolvedConversationId, true);
                setIsLocked(true);
            } else {
                const isValid = await verifyChatLockPasscode(passcode);
                if (!isValid) {
                    throw new Error("Incorrect passcode.");
                }

                const shouldLock = pendingLockAction === "lock";
                await setConversationLocked(currentUserId, resolvedConversationId, shouldLock);
                setIsLocked(shouldLock);
            }

            setLockModalVisible(false);
        } catch (error) {
            Alert.alert("Chat lock", getReadableApiErrorMessage(error, "Please try again."));
        } finally {
            setLockingBusy(false);
        }
    }, [currentUserId, lockModalMode, pendingLockAction, resolvedConversationId]);

    const toggleChatLock = useCallback(async () => {
        if (!currentUserId || !resolvedConversationId) {
            return;
        }

        if (!isLocked) {
            const hasPasscode = await hasChatLockPasscode();
            if (!hasPasscode) {
                setPendingLockAction("lock");
                setLockModalMode("setup");
                setLockModalVisible(true);
                return;
            }

            await setConversationLocked(currentUserId, resolvedConversationId, true);
            setIsLocked(true);
            return;
        }

        setPendingLockAction("unlock");
        setLockModalMode("unlock");
        setLockModalVisible(true);
    }, [currentUserId, isLocked, resolvedConversationId]);

    const formatDisappearingMessagesLabel = useCallback((value: number) => {
        switch (Number(value) || 0) {
            case 24 * 60 * 60:
                return "24 hours";
            case 7 * 24 * 60 * 60:
                return "7 days";
            case 90 * 24 * 60 * 60:
                return "90 days";
            default:
                return "Off";
        }
    }, []);

    const selectDisappearingMessages = useCallback(() => {
        if (!resolvedConversationId || updatingDisappearingMessages) {
            return;
        }

        const options = [
            { label: "Off", value: 0 },
            { label: "24 hours", value: 24 * 60 * 60 },
            { label: "7 days", value: 7 * 24 * 60 * 60 },
            { label: "90 days", value: 90 * 24 * 60 * 60 },
        ];

        Alert.alert(
            "Disappearing messages",
            "Choose how long new messages should stay in this chat.",
            [
                ...options.map((option) => ({
                    text: option.label,
                    onPress: async () => {
                        try {
                            setUpdatingDisappearingMessages(true);
                            const response = await updateConversationDisappearingMessages({
                                conversationId: resolvedConversationId,
                                disappearingMessagesSeconds: option.value,
                            });
                            setDisappearingMessagesSeconds(Number(response?.disappearingMessagesSeconds) || 0);
                        } catch (error) {
                            Alert.alert("Disappearing messages", getReadableApiErrorMessage(error, "Please try again."));
                        } finally {
                            setUpdatingDisappearingMessages(false);
                        }
                    },
                })),
                { text: "Cancel", style: "cancel" },
            ]
        );
    }, [resolvedConversationId, updatingDisappearingMessages]);

    const handleClearChat = useCallback(() => {
        if (!resolvedConversationId || clearingChat) {
            return;
        }

        Alert.alert(
            "Clear chat",
            "This will remove all messages from your chat history on this device account.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Clear",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            setClearingChat(true);
                            await clearConversationMessages({ conversationId: resolvedConversationId });
                            setMedia([]);
                            setSearchResults([]);
                            setSearchQuery("");
                            Alert.alert("Chat cleared", "Your messages in this chat have been cleared.");
                        } catch (error) {
                            Alert.alert("Clear chat", getReadableApiErrorMessage(error, "Please try again."));
                        } finally {
                            setClearingChat(false);
                        }
                    },
                },
            ]
        );
    }, [clearingChat, resolvedConversationId]);

    const openScheduleCall = useCallback((callType: "audio" | "video") => {
        navigation.navigate("ChatScreen", {
            userId: user?._id || userId,
            conversationId: resolvedConversationId,
            conversationType: "direct",
            openScheduleCallComposer: true,
            openScheduleCallType: callType,
        });
    }, [navigation, resolvedConversationId, user?._id, userId]);

    // ─── Render helpers ─────────────────────────────────────────────────────

    const renderGridItem = useCallback(
        ({ item }: { item: MediaItem }) => <MediaGridItem item={item} onPress={() => { }} />,
        []
    );

    const displayName = user?.name || user?.username || "Loading...";
    const subtitle = user?.username ? `@${user.username}` : user?.phone || "";

    // ─── UI ─────────────────────────────────────────────────────────────────

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Icon name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Chat Info</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Profile card */}
                <View style={[styles.profileCard, { backgroundColor: colors.card }]}>
                    <AppAvatar
                        uri={user?.profilePic || DEFAULT_AVATAR_URL}
                        name={displayName}
                        size={90}
                        style={styles.avatar}
                        backgroundColor={colors.surface || "#E2E8F0"}
                        textColor={colors.primary}
                    />
                    <Text style={[styles.displayName, { color: colors.text }]}>{displayName}</Text>
                    {!!subtitle && <Text style={[styles.subtitle, { color: colors.placeholder }]}>{subtitle}</Text>}

                    <View style={styles.profileActions}>
                        <TouchableOpacity
                            style={styles.profileActionButton}
                            onPress={() => navigation.navigate("ProfilePreviewScreen", { userId: user?._id || userId })}
                        >
                            <Icon name="person-outline" size={20} color={PRIMARY} />
                            <Text style={styles.profileActionLabel}>Profile</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.profileActionButton}
                            onPress={() => navigation.navigate("ChatScreen", { userId: user?._id || userId, conversationId: resolvedConversationId })}
                        >
                            <Icon name="chatbubble-outline" size={20} color={PRIMARY} />
                            <Text style={styles.profileActionLabel}>Message</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Options */}
                <View style={[styles.optionBox, { backgroundColor: colors.card }]}>
                    <Option icon="notifications-outline" title="Notifications" onPress={() => navigation.navigate("NotificationSettingsScreen")} colors={colors} />
                    <Option icon="images-outline" title="Refresh shared media" onPress={loadMedia} colors={colors} />
                    <Option icon="search-outline" title="Search messages" onPress={toggleSearch} colors={colors} />
                    <Option icon="call-outline" title="Schedule audio meeting" onPress={() => openScheduleCall("audio")} colors={colors} />
                    <Option icon="videocam-outline" title="Schedule video meeting" onPress={() => openScheduleCall("video")} colors={colors} />
                    <Option icon="color-palette-outline" title="Chat Theme" onPress={() => setShowThemePicker(true)} colors={colors} />
                    <Option
                        icon={savingWallpaper ? "hourglass-outline" : "image-outline"}
                        title={chatWallpaper ? "Change wallpaper" : "Add custom wallpaper"}
                        onPress={pickWallpaper}
                        colors={colors}
                    />
                    {chatWallpaper ? (
                        <DestructiveOption
                            icon="close-circle-outline"
                            title="Remove wallpaper"
                            onPress={() => updateWallpaper(null)}
                            colors={colors}
                        />
                    ) : null}
                    <Option
                        icon={isLocked ? "lock-open-outline" : "lock-closed-outline"}
                        title={isLocked ? "Unlock chat" : "Lock chat"}
                        onPress={() => {
                            toggleChatLock().catch(() => {});
                        }}
                        colors={colors}
                    />
                    <Option
                        icon={updatingDisappearingMessages ? "hourglass-outline" : "timer-outline"}
                        title={`Disappearing messages: ${formatDisappearingMessagesLabel(disappearingMessagesSeconds)}`}
                        onPress={selectDisappearingMessages}
                        colors={colors}
                    />
                    <DestructiveOption
                        icon={clearingChat ? "hourglass-outline" : "trash-outline"}
                        title="Clear chat"
                        onPress={handleClearChat}
                        colors={colors}
                    />
                </View>

                {/* Search bar */}
                {showSearch && (
                    <View style={[styles.searchWrapper, { backgroundColor: colors.card }]}>
                        <View style={[styles.searchRow, { backgroundColor: colors.surface || "#f5f5f5" }]}>
                            <Icon name="search" size={18} color={colors.placeholder} />
                            <TextInput
                                style={[styles.searchInput, { color: colors.text }]}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                placeholder="Search in conversation..."
                                placeholderTextColor={colors.placeholder}
                                onSubmitEditing={() => handleSearch()}
                                returnKeyType="search"
                            />
                        </View>
                        {searching && <ActivityIndicator style={{ marginTop: 10 }} color={PRIMARY} />}
                        {searchResults.length > 0 && (
                            <View style={styles.searchResultsList}>
                                {searchResults.slice(0, 10).map((result) => (
                                    <View key={result._id} style={[styles.searchResultItem, { borderColor: colors.border }]}>
                                        <Text style={[styles.searchResultText, { color: colors.text }]} numberOfLines={2}>
                                            {renderHighlightedText(result.text || result.fileName || "(media)", searchQuery, colors.text)}
                                        </Text>
                                        <Text style={[styles.searchResultMeta, { color: colors.placeholder }]}>
                                            {result.sender?.username || result.sender?.name || ""}{" "}
                                            {result.createdAt ? new Date(result.createdAt).toLocaleDateString() : ""}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        )}
                        {!searching && searchQuery.trim().length > 0 && searchResults.length === 0 ? (
                            <Text style={[styles.searchEmptyText, { color: colors.placeholder }]}>No matching messages found.</Text>
                        ) : null}
                    </View>
                )}

                {/* Shared media grid */}
                <View style={[styles.mediaSection, { backgroundColor: colors.card }]}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Shared Media</Text>
                    {loadingMedia ? (
                        <ActivityIndicator style={{ paddingVertical: 20 }} color={PRIMARY} />
                    ) : media.length === 0 ? (
                        <Text style={[styles.emptyMediaText, { color: colors.placeholder }]}>No shared media yet</Text>
                    ) : (
                        <FlatList
                            data={media}
                            numColumns={3}
                            keyExtractor={(item) => item._id}
                            renderItem={renderGridItem}
                            scrollEnabled={false}
                            contentContainerStyle={styles.mediaGrid}
                        />
                    )}
                </View>

                {/* Danger zone */}
                <View style={[styles.optionBox, { backgroundColor: colors.card }]}>
                    <DestructiveOption icon="ban-outline" title={`Block ${user?.name || "User"}`} onPress={blockUser} colors={colors} />
                </View>
            </ScrollView>

            {/* Chat Theme Picker */}
            {resolvedConversationId && (
                <ChatThemePicker
                    visible={showThemePicker}
                    conversationId={resolvedConversationId}
                    currentTheme={currentTheme}
                    onClose={() => setShowThemePicker(false)}
                    onThemeChanged={(themeId) => setCurrentTheme(themeId)}
                />
            )}

            <ChatLockModal
                visible={lockModalVisible}
                mode={lockModalMode}
                busy={lockingBusy}
                onClose={() => setLockModalVisible(false)}
                onSubmit={submitLockPasscode}
            />
        </SafeAreaView>
    );
};

export default ChatDetailsScreen;

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: "700",
    },
    scrollContent: {
        paddingBottom: 40,
    },
    profileCard: {
        alignItems: "center",
        paddingVertical: 28,
        marginBottom: 10,
    },
    avatar: {
        width: 90,
        height: 90,
        borderRadius: 45,
        marginBottom: 14,
    },
    displayName: {
        fontSize: 22,
        fontWeight: "800",
    },
    subtitle: {
        fontSize: 14,
        marginTop: 4,
    },
    profileActions: {
        flexDirection: "row",
        marginTop: 18,
        gap: 24,
    },
    profileActionButton: {
        alignItems: "center",
        gap: 4,
    },
    profileActionLabel: {
        color: PRIMARY,
        fontSize: 12,
        fontWeight: "600",
    },
    optionBox: {
        marginTop: 10,
        paddingHorizontal: 4,
    },
    optionRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    optionTitle: {
        flex: 1,
        fontSize: 15,
        fontWeight: "500",
        marginLeft: 14,
    },
    searchWrapper: {
        marginTop: 10,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    searchRow: {
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 12,
        paddingHorizontal: 12,
    },
    searchInput: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 8,
        fontSize: 14,
    },
    searchResultsList: {
        marginTop: 12,
    },
    searchResultItem: {
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    searchResultText: {
        fontSize: 14,
    },
    searchResultMeta: {
        fontSize: 11,
        marginTop: 3,
    },
    searchEmptyText: {
        marginTop: 12,
        fontSize: 13,
        textAlign: "center",
    },
    searchHighlight: {
        backgroundColor: "#FACC15",
        color: "#1F2937",
        borderRadius: 4,
        overflow: "hidden",
    },
    mediaSection: {
        marginTop: 10,
        paddingVertical: 14,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: "700",
        paddingHorizontal: 16,
        marginBottom: 12,
    },
    emptyMediaText: {
        textAlign: "center",
        paddingVertical: 20,
        fontSize: 14,
    },
    mediaGrid: {
        paddingHorizontal: 8,
    },
    gridCell: {
        flex: 1,
        aspectRatio: 1,
        margin: 2,
        borderRadius: 6,
        overflow: "hidden",
    },
    gridImage: {
        width: "100%",
        height: "100%",
    },
    videoOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.2)",
    },
});
