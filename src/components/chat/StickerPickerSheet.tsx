/**
 * StickerPickerSheet — Bottom sheet grid for sending stickers in chat
 *
 * Fetches stickers from /stickers API. Shows grid with category tabs.
 * Tapping a sticker calls onSend with the sticker URL.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import {
    fetchStickersForChat,
    fetchStickersByCategory,
    searchStickers,
} from "../../utils/chatStickerApi";

const COLUMNS = 4;
const PRIMARY = "#7b3fe4";
const CATEGORIES = ["all", "general", "love", "funny", "animals", "celebrations"];

interface Sticker {
    _id?: string;
    name: string;
    imageUrl: string;
    [key: string]: any;
}

interface StickerPickerSheetProps {
    visible: boolean;
    onClose: () => void;
    onSend: (sticker: Sticker) => void;
}

const StickerPickerSheet: React.FC<StickerPickerSheetProps> = ({ visible, onClose, onSend }) => {
    const [stickers, setStickers] = useState<Sticker[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeCategory, setActiveCategory] = useState("all");
    const [query, setQuery] = useState("");

    const loadStickers = useCallback(async (category = "all", searchQuery = "") => {
        setLoading(true);
        try {
            let results;
            if (searchQuery.trim()) {
                results = await searchStickers(searchQuery.trim());
            } else if (category === "all") {
                results = await fetchStickersForChat(1, 100);
            } else {
                results = await fetchStickersByCategory(category);
            }
            setStickers(results || []);
        } catch (err) {
            console.log("sticker load error:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (visible) {
            loadStickers(activeCategory, query);
        }
    }, [visible, activeCategory, loadStickers, query]);

    const handleSend = useCallback(
        (sticker: Sticker) => {
            if (onSend && sticker?.imageUrl) {
                onSend(sticker);
            }
            onClose();
        },
        [onClose, onSend]
    );

    const renderSticker = ({ item }: { item: Sticker }) => (
        <TouchableOpacity style={styles.stickerCell} onPress={() => handleSend(item)} activeOpacity={0.7}>
            <Image source={{ uri: item.imageUrl }} style={styles.stickerImage} resizeMode="contain" />
        </TouchableOpacity>
    );

    if (!visible) return null;

    return (
        <Modal visible transparent animationType="slide" onRequestClose={onClose}>
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
                <View style={styles.sheet} onStartShouldSetResponder={() => true}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>Stickers</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Icon name="close" size={24} color="#333" />
                        </TouchableOpacity>
                    </View>

                    {/* Search */}
                    <View style={styles.searchRow}>
                        <Icon name="search" size={18} color="#999" />
                        <TextInput
                            style={styles.searchInput}
                            value={query}
                            onChangeText={(value) => {
                                setQuery(value);
                                setActiveCategory("all");
                            }}
                            placeholder="Search stickers..."
                            placeholderTextColor="#999"
                        />
                    </View>

                    {/* Category tabs */}
                    <FlatList
                        horizontal
                        data={CATEGORIES}
                        keyExtractor={(item) => item}
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.categoryRow}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[styles.categoryChip, activeCategory === item && styles.categoryChipActive]}
                                onPress={() => {
                                    setActiveCategory(item);
                                    setQuery("");
                                }}
                            >
                                <Text style={[styles.categoryText, activeCategory === item && styles.categoryTextActive]}>
                                    {item.charAt(0).toUpperCase() + item.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        )}
                    />

                    {/* Sticker grid */}
                    {loading ? (
                        <ActivityIndicator style={styles.loader} color={PRIMARY} size="large" />
                    ) : stickers.length === 0 ? (
                        <View style={styles.emptyWrap}>
                            <Icon name="images-outline" size={48} color="#ddd" />
                            <Text style={styles.emptyText}>No stickers found</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={stickers}
                            numColumns={COLUMNS}
                            keyExtractor={(item) => item._id || item.name}
                            renderItem={renderSticker}
                            contentContainerStyle={styles.grid}
                            showsVerticalScrollIndicator={false}
                        />
                    )}
                </View>
            </TouchableOpacity>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.35)",
        justifyContent: "flex-end",
    },
    sheet: {
        backgroundColor: "#fff",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: "60%",
        paddingBottom: 32,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 8,
    },
    title: {
        fontSize: 18,
        fontWeight: "800",
        color: "#111",
    },
    searchRow: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#f5f5f5",
        borderRadius: 12,
        marginHorizontal: 20,
        paddingHorizontal: 12,
        marginBottom: 8,
    },
    searchInput: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 8,
        fontSize: 14,
        color: "#333",
    },
    categoryRow: {
        paddingHorizontal: 16,
        paddingVertical: 6,
    },
    categoryChip: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: "#f0f0f0",
        marginRight: 8,
    },
    categoryChipActive: {
        backgroundColor: PRIMARY,
    },
    categoryText: {
        fontSize: 13,
        fontWeight: "600",
        color: "#555",
    },
    categoryTextActive: {
        color: "#fff",
    },
    grid: {
        paddingHorizontal: 12,
        paddingTop: 8,
    },
    stickerCell: {
        flex: 1,
        aspectRatio: 1,
        margin: 6,
        borderRadius: 12,
        backgroundColor: "#f8f8f8",
        alignItems: "center",
        justifyContent: "center",
        padding: 8,
    },
    stickerImage: {
        width: "100%",
        height: "100%",
    },
    loader: {
        marginTop: 40,
    },
    emptyWrap: {
        alignItems: "center",
        paddingTop: 40,
        paddingBottom: 20,
    },
    emptyText: {
        marginTop: 12,
        color: "#999",
        fontSize: 14,
    },
});

export default StickerPickerSheet;
