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
    Alert,
    TextInput,
    ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import {
    fetchConversationMedia,
    searchConversationMessages,
    createChatConversation,
} from "../utils/chatApi";
import { normalizeMediaUrl } from "../utils/mediaUrls";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { useAppTheme } from "../theme/AppThemeContext";
import ChatThemePicker from "../components/chat/ChatThemePicker";

const PRIMARY = "#7b3fe4";

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
    createdAt?: string;
    sender?: { username?: string; name?: string };
}

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

    useEffect(() => {
        fetchUser();
        loadMedia();
    }, [fetchUser, loadMedia]);

    // ─── Search ─────────────────────────────────────────────────────────────

    const [showSearch, setShowSearch] = useState(false);

    const toggleSearch = useCallback(() => {
        setShowSearch((prev) => !prev);
        if (showSearch) {
            setSearchQuery("");
            setSearchResults([]);
        }
    }, [showSearch]);

    const handleSearch = useCallback(async () => {
        if (!resolvedConversationId || !searchQuery.trim()) return;
        setSearching(true);
        try {
            const data = await searchConversationMessages(resolvedConversationId, { q: searchQuery.trim() });
            setSearchResults(data?.messages || []);
        } catch (err: any) {
            console.log("ChatDetails search error:", err?.response?.data || err);
        } finally {
            setSearching(false);
        }
    }, [resolvedConversationId, searchQuery]);

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
                            await API.post(`/auth/block/${user?._id || userId}`);
                            Alert.alert("Blocked", "User has been blocked.");
                            navigation.goBack();
                        } catch (err: any) {
                            console.log("Block error:", err?.response?.data || err);
                            Alert.alert("Error", "Failed to block user.");
                        }
                    },
                },
            ]
        );
    }, [navigation, user, userId]);

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
                    <Image
                        source={{ uri: user?.profilePic || DEFAULT_AVATAR_URL }}
                        style={styles.avatar}
                    />
                    <Text style={[styles.displayName, { color: colors.text }]}>{displayName}</Text>
                    {!!subtitle && <Text style={[styles.subtitle, { color: colors.placeholder }]}>{subtitle}</Text>}

                    <View style={styles.profileActions}>
                        <TouchableOpacity
                            style={styles.profileActionButton}
                            onPress={() => navigation.navigate("UserProfileScreen", { userId: user?._id || userId })}
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
                    <Option icon="color-palette-outline" title="Chat Theme" onPress={() => setShowThemePicker(true)} colors={colors} />
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
                                onSubmitEditing={handleSearch}
                                returnKeyType="search"
                            />
                        </View>
                        {searching && <ActivityIndicator style={{ marginTop: 10 }} color={PRIMARY} />}
                        {searchResults.length > 0 && (
                            <View style={styles.searchResultsList}>
                                {searchResults.slice(0, 10).map((result) => (
                                    <View key={result._id} style={[styles.searchResultItem, { borderColor: colors.border }]}>
                                        <Text style={[styles.searchResultText, { color: colors.text }]} numberOfLines={2}>
                                            {result.text || "(media)"}
                                        </Text>
                                        <Text style={[styles.searchResultMeta, { color: colors.placeholder }]}>
                                            {result.sender?.username || result.sender?.name || ""}{" "}
                                            {result.createdAt ? new Date(result.createdAt).toLocaleDateString() : ""}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        )}
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
                    onClose={() => setShowThemePicker(false)}
                />
            )}
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
