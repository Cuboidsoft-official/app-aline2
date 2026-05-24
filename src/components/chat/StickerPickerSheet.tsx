import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  emojiPackOptions,
  fetchEmojiStickers,
  fetchGifStickers,
  fetchStickersByCategory,
  fetchStickersForChat,
  searchStickers,
  type ChatSticker,
  type EmojiPackId,
} from "../../utils/chatStickerApi";
import { normalizeMediaUrl } from "../../utils/mediaUrls";

const PRIMARY = "#7b3fe4";
const MODE_OPTIONS = [
  { id: "emoji", label: "Emoji Packs" },
  { id: "gifs", label: "GIFs" },
  { id: "stickers", label: "Stickers" },
] as const;

const EMOJI_CATEGORIES = ["all", "smileys", "people", "animals", "food", "travel", "activities", "objects", "symbols"] as const;
const GIF_CATEGORIES = ["all", "reactions", "love", "funny", "animals", "celebrations"] as const;
const STICKER_CATEGORIES = ["all", "general", "love", "funny", "animals", "celebrations"] as const;

const FALLBACK_EMOJI_ITEMS: ChatSticker[] = [
  { _id: "emoji-1", name: "Heart eyes", emoji: "😍", imageUrl: "", type: "emoji", category: "smileys", tags: [], useCount: 0 },
  { _id: "emoji-2", name: "Fire", emoji: "🔥", imageUrl: "", type: "emoji", category: "symbols", tags: [], useCount: 0 },
  { _id: "emoji-3", name: "Party", emoji: "🥳", imageUrl: "", type: "emoji", category: "activities", tags: [], useCount: 0 },
  { _id: "emoji-4", name: "Dog", emoji: "🐶", imageUrl: "", type: "emoji", category: "animals", tags: [], useCount: 0 },
  { _id: "emoji-5", name: "Pizza", emoji: "🍕", imageUrl: "", type: "emoji", category: "food", tags: [], useCount: 0 },
  { _id: "emoji-6", name: "Plane", emoji: "✈️", imageUrl: "", type: "emoji", category: "travel", tags: [], useCount: 0 },
];

const FALLBACK_GIF_ITEMS: ChatSticker[] = [
  { _id: "gif-1", name: "Love", emoji: "💜", imageUrl: "", type: "gif", category: "love", tags: [], useCount: 0 },
  { _id: "gif-2", name: "Hype", emoji: "🔥", imageUrl: "", type: "gif", category: "reactions", tags: [], useCount: 0 },
  { _id: "gif-3", name: "Funny", emoji: "😂", imageUrl: "", type: "gif", category: "funny", tags: [], useCount: 0 },
  { _id: "gif-4", name: "Party", emoji: "🎉", imageUrl: "", type: "gif", category: "celebrations", tags: [], useCount: 0 },
];

const FALLBACK_STICKER_ITEMS: ChatSticker[] = [
  { _id: "sticker-1", name: "Love", emoji: "💞", imageUrl: "", type: "static", category: "love", tags: [], useCount: 0 },
  { _id: "sticker-2", name: "Funny", emoji: "🤣", imageUrl: "", type: "static", category: "funny", tags: [], useCount: 0 },
  { _id: "sticker-3", name: "Pet", emoji: "🐾", imageUrl: "", type: "static", category: "animals", tags: [], useCount: 0 },
  { _id: "sticker-4", name: "Party", emoji: "✨", imageUrl: "", type: "static", category: "celebrations", tags: [], useCount: 0 },
];

interface StickerPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSend: (sticker: ChatSticker) => void | Promise<void>;
  preferredMode?: "emoji" | "gifs" | "stickers";
}

const StickerPickerSheet = ({ visible, onClose, onSend, preferredMode = "emoji" }: StickerPickerSheetProps) => {
  const [items, setItems] = useState<ChatSticker[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeMode, setActiveMode] = useState<"emoji" | "gifs" | "stickers">("emoji");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [emojiPack, setEmojiPack] = useState<EmojiPackId>("fluent");
  const sendLockRef = useRef(false);

  const categoryOptions = useMemo(() => {
    if (activeMode === "emoji") {
      return [...EMOJI_CATEGORIES];
    }

    if (activeMode === "gifs") {
      return [...GIF_CATEGORIES];
    }

    return [...STICKER_CATEGORIES];
  }, [activeMode]);

  const numColumns = activeMode === "gifs" ? 2 : 4;

  const resolveFallbackItems = useCallback((mode: "emoji" | "gifs" | "stickers", category = "all", searchQuery = "") => {
    const source = mode === "emoji"
      ? FALLBACK_EMOJI_ITEMS
      : mode === "gifs"
        ? FALLBACK_GIF_ITEMS
        : FALLBACK_STICKER_ITEMS;

    const normalizedQuery = searchQuery.trim().toLowerCase();

    return source.filter((item) => {
      const categoryMatch = category === "all" ? true : item.category === category;
      if (!categoryMatch) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return item.name.toLowerCase().includes(normalizedQuery) || String(item.emoji || "").includes(searchQuery.trim());
    });
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);

    try {
      let nextItems: ChatSticker[] = [];

      if (activeMode === "emoji") {
        nextItems = await fetchEmojiStickers({
          category: activeCategory,
          query,
          pack: emojiPack,
          limit: 180,
        });
      } else if (activeMode === "gifs") {
        nextItems = await fetchGifStickers({
          category: activeCategory,
          query,
          limit: 80,
        });
      } else if (query.trim()) {
        nextItems = await searchStickers(query.trim());
      } else if (activeCategory === "all") {
        nextItems = await fetchStickersForChat(1, 120);
      } else {
        nextItems = await fetchStickersByCategory(activeCategory);
      }

      setItems(nextItems.length ? nextItems : resolveFallbackItems(activeMode, activeCategory, query));
    } catch (error) {
      console.log("sticker picker load error:", error);
      setItems(resolveFallbackItems(activeMode, activeCategory, query));
    } finally {
      setLoading(false);
    }
  }, [activeCategory, activeMode, emojiPack, query, resolveFallbackItems]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setActiveMode(preferredMode);
    setActiveCategory("all");
    setQuery("");
    sendLockRef.current = false;
  }, [preferredMode, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    loadItems();
  }, [loadItems, visible]);

  const handleModeChange = useCallback((mode: "emoji" | "gifs" | "stickers") => {
    setActiveMode(mode);
    setActiveCategory("all");
    setQuery("");
  }, []);

  const renderGridItem = ({ item }: { item: ChatSticker }) => {
    const isGif = activeMode === "gifs";

    return (
      <TouchableOpacity
        style={[styles.itemCell, isGif ? styles.gifCell : styles.defaultCell]}
        onPress={() => {
          if (sendLockRef.current) {
            return;
          }
          sendLockRef.current = true;
          onClose();
          Promise.resolve(onSend(item)).catch(() => {
            sendLockRef.current = false;
          });
        }}
        activeOpacity={0.86}
      >
        {item.imageUrl ? (
          <Image
            source={{ uri: normalizeMediaUrl(item.imageUrl) }}
            style={isGif ? styles.gifImage : styles.itemImage}
            resizeMode={isGif ? "cover" : "contain"}
          />
        ) : (
          <View style={[styles.emojiFallback, isGif ? styles.gifFallback : null]}>
            <Text style={isGif ? styles.gifFallbackText : styles.emojiFallbackText}>{item.emoji || "🙂"}</Text>
          </View>
        )}

        <View style={isGif ? styles.gifLabelWrap : styles.itemLabelWrap}>
          <Text style={[styles.itemLabel, isGif ? styles.gifLabelText : styles.gridLabelText]} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} onPress={onClose} activeOpacity={1}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>Media picker</Text>
              <Text style={styles.title}>GIFs, emoji packs, and stickers</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Icon name="close" size={20} color="#223" />
            </TouchableOpacity>
          </View>

          <View style={styles.modeRow}>
            {MODE_OPTIONS.map((mode) => {
              const active = activeMode === mode.id;

              return (
                <TouchableOpacity
                  key={mode.id}
                  style={[styles.modeChip, active ? styles.modeChipActive : null]}
                  onPress={() => handleModeChange(mode.id)}
                >
                  <Text style={[styles.modeChipText, active ? styles.modeChipTextActive : null]}>
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.searchRow}>
            <Icon name="search" size={18} color="#8B91A5" />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={
                activeMode === "emoji"
                  ? "Search emojis"
                  : activeMode === "gifs"
                    ? "Search GIFs"
                    : "Search stickers"
              }
              placeholderTextColor="#8B91A5"
            />
          </View>

          {activeMode === "emoji" ? (
            <FlatList
              horizontal
              data={emojiPackOptions}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.packRow}
              renderItem={({ item }) => {
                const active = emojiPack === item.id;

                return (
                  <TouchableOpacity
                    style={[styles.packChip, active ? styles.packChipActive : null]}
                    onPress={() => setEmojiPack(item.id)}
                  >
                    <Text style={[styles.packChipText, active ? styles.packChipTextActive : null]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          ) : null}

          <FlatList
            horizontal
            data={categoryOptions}
            keyExtractor={(item) => item}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryRow}
            renderItem={({ item }) => {
              const active = activeCategory === item;

              return (
                <TouchableOpacity
                  style={[styles.categoryChip, active ? styles.categoryChipActive : null]}
                  onPress={() => setActiveCategory(item)}
                >
                  <Text style={[styles.categoryText, active ? styles.categoryTextActive : null]}>
                    {item.charAt(0).toUpperCase() + item.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />

          {loading ? (
            <ActivityIndicator style={styles.loader} size="large" color={PRIMARY} />
          ) : items.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="images-outline" size={44} color="#C5CBD9" />
              <Text style={styles.emptyTitle}>Nothing matched</Text>
              <Text style={styles.emptyText}>
                Try a different keyword, category, or emoji pack.
              </Text>
            </View>
          ) : (
            <FlatList
              data={items}
              numColumns={numColumns}
              key={`${activeMode}-${emojiPack}-${numColumns}`}
              keyExtractor={(item, index) => item._id || `${item.name}-${index}`}
              renderItem={renderGridItem}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.grid}
              columnWrapperStyle={numColumns > 1 ? styles.columnRow : undefined}
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
    justifyContent: "flex-end",
    backgroundColor: "rgba(12, 16, 28, 0.36)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "82%",
    paddingBottom: 26,
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#D6DCE7",
    marginTop: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    color: PRIMARY,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  title: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: "800",
    color: "#101828",
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F5FA",
  },
  modeRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "#EEF2F8",
    marginRight: 8,
  },
  modeChipActive: {
    backgroundColor: PRIMARY,
  },
  modeChipText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#667085",
  },
  modeChipTextActive: {
    color: "#FFFFFF",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 14,
    borderRadius: 16,
    backgroundColor: "#F3F6FB",
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    fontSize: 14,
    color: "#172033",
  },
  packRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  packChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#F7F4FF",
    marginRight: 8,
  },
  packChipActive: {
    backgroundColor: "#E8DDFF",
  },
  packChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B5B95",
  },
  packChipTextActive: {
    color: PRIMARY,
  },
  categoryRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  categoryChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#F3F4F8",
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: "#ECE4FF",
  },
  categoryText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#677085",
  },
  categoryTextActive: {
    color: PRIMARY,
  },
  loader: {
    marginTop: 44,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 48,
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "800",
    color: "#182230",
  },
  emptyText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: "#7B8798",
    textAlign: "center",
  },
  grid: {
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  columnRow: {
    justifyContent: "space-between",
  },
  itemCell: {
    marginBottom: 12,
  },
  defaultCell: {
    width: "23%",
  },
  gifCell: {
    width: "48.5%",
  },
  itemImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 18,
    backgroundColor: "#F6F8FC",
  },
  gifImage: {
    width: "100%",
    height: 128,
    borderRadius: 18,
    backgroundColor: "#EEF2F8",
  },
  emojiFallback: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F2FF",
  },
  gifFallback: {
    height: 128,
    aspectRatio: undefined,
    backgroundColor: "#151B2F",
  },
  emojiFallbackText: {
    fontSize: 32,
  },
  gifFallbackText: {
    fontSize: 34,
    color: "#FFFFFF",
  },
  itemLabelWrap: {
    paddingHorizontal: 2,
    paddingTop: 7,
  },
  gifLabelWrap: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    backgroundColor: "rgba(12, 16, 28, 0.54)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  itemLabel: {
    fontSize: 11.5,
    fontWeight: "700",
    textAlign: "center",
  },
  gifLabelText: {
    color: "#FFFFFF",
  },
  gridLabelText: {
    color: "#566074",
  },
});

export default StickerPickerSheet;
