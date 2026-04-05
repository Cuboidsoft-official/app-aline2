/**
 * FaceOverlayPicker — Draggable sticker overlays for camera/photo
 *
 * Displays categorized emoji/sticker overlays that users can
 * drag-position on their photos/videos before posting.
 * This is the "AR-lite" approach — no face tracking SDK needed.
 */
import React, { useCallback, useRef, useState } from "react";
import {
    Animated,
    FlatList,
    Modal,
    PanResponder,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { FACE_STICKER_CATEGORIES, ALL_FACE_STICKERS } from "../../utils/faceOverlayStickers";

const PRIMARY = "#7b3fe4";

interface FaceSticker {
    id: string;
    name: string;
    emoji: string;
    placementId?: number;
}

interface FaceOverlayPickerProps {
    visible: boolean;
    onClose: () => void;
    onStickersChanged?: (stickers: FaceSticker[]) => void;
}
/** A single draggable sticker placed on the canvas */
const DraggableSticker: React.FC<{ emoji: string; onRemove: (id: number) => void; id: number }> = ({ emoji, onRemove, id }) => {
    const pan = useRef(new Animated.ValueXY()).current;
    const scale = useRef(new Animated.Value(1)).current;

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
                pan.setValue({ x: 0, y: 0 });
                Animated.spring(scale, { toValue: 1.2, useNativeDriver: true }).start();
            },
            onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
                useNativeDriver: false,
            }),
            onPanResponderRelease: () => {
                pan.flattenOffset();
                Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
            },
        })
    ).current;

    return (
        <Animated.View
            style={[
                styles.draggableSticker,
                { transform: [...pan.getTranslateTransform(), { scale }] },
            ]}
            {...panResponder.panHandlers}
        >
            <Text style={styles.dragEmoji}>{emoji}</Text>
            <TouchableOpacity style={styles.removeBtn} onPress={() => onRemove(id)}>
                <Icon name="close-circle" size={18} color="#ff4444" />
            </TouchableOpacity>
        </Animated.View>
    );
};

const FaceOverlayPicker: React.FC<FaceOverlayPickerProps> = ({ visible, onClose, onStickersChanged }) => {
    const [placedStickers, setPlacedStickers] = useState<FaceSticker[]>([]);
    const [activeCategory, setActiveCategory] = useState(0);
    const nextId = useRef(1);

    const addSticker = useCallback(
        (sticker: FaceSticker) => {
            const newSticker = {
                ...sticker,
                placementId: nextId.current++,
            };
            const updated = [...placedStickers, newSticker];
            setPlacedStickers(updated);
            if (onStickersChanged) {
                onStickersChanged(updated);
            }
        },
        [onStickersChanged, placedStickers]
    );

    const removeSticker = useCallback(
        (placementId: number) => {
            const updated = placedStickers.filter((s) => s.placementId !== placementId);
            setPlacedStickers(updated);
            if (onStickersChanged) {
                onStickersChanged(updated);
            }
        },
        [onStickersChanged, placedStickers]
    );

    const clearAll = useCallback(() => {
        setPlacedStickers([]);
        if (onStickersChanged) {
            onStickersChanged([]);
        }
    }, [onStickersChanged]);

    if (!visible) return null;

    const currentCategory = FACE_STICKER_CATEGORIES[activeCategory] || FACE_STICKER_CATEGORIES[0];

    return (
        <Modal visible transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.container}>
                {/* Canvas area with placed stickers */}
                <TouchableOpacity style={styles.canvasOverlay} activeOpacity={1} onPress={onClose}>
                    {placedStickers.map((sticker) => (
                        <DraggableSticker
                            key={sticker.placementId!}
                            id={sticker.placementId!}
                            emoji={sticker.emoji}
                            onRemove={removeSticker}
                        />
                    ))}
                </TouchableOpacity>

                {/* Bottom picker */}
                <View style={styles.pickerSheet}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Face Stickers</Text>
                        <View style={styles.headerActions}>
                            {placedStickers.length > 0 ? (
                                <TouchableOpacity style={styles.clearBtn} onPress={clearAll}>
                                    <Text style={styles.clearText}>Clear all</Text>
                                </TouchableOpacity>
                            ) : null}
                            <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
                                <Text style={styles.doneText}>Done</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Category tabs */}
                    <FlatList
                        horizontal
                        data={FACE_STICKER_CATEGORIES}
                        keyExtractor={(item) => item.id}
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.categoryRow}
                        renderItem={({ item, index }) => (
                            <TouchableOpacity
                                style={[styles.catChip, activeCategory === index && styles.catChipActive]}
                                onPress={() => setActiveCategory(index)}
                            >
                                <Text style={[styles.catText, activeCategory === index && styles.catTextActive]}>
                                    {item.name}
                                </Text>
                            </TouchableOpacity>
                        )}
                    />

                    {/* Sticker grid */}
                    <FlatList
                        horizontal
                        data={currentCategory.stickers}
                        keyExtractor={(item) => item.id}
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.stickerRow}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={styles.stickerBtn} onPress={() => addSticker(item)}>
                                <Text style={styles.stickerEmoji}>{item.emoji}</Text>
                                <Text style={styles.stickerLabel} numberOfLines={1}>{item.name}</Text>
                            </TouchableOpacity>
                        )}
                    />
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    canvasOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.3)",
    },
    draggableSticker: {
        position: "absolute",
        top: "40%",
        left: "40%",
    },
    dragEmoji: {
        fontSize: 56,
    },
    removeBtn: {
        position: "absolute",
        top: -6,
        right: -6,
    },
    pickerSheet: {
        backgroundColor: "#fff",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingBottom: 40,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 8,
    },
    title: {
        fontSize: 16,
        fontWeight: "800",
        color: "#111",
    },
    headerActions: {
        flexDirection: "row",
        gap: 12,
    },
    clearBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: "#fee",
    },
    clearText: {
        color: "#ff4444",
        fontWeight: "600",
        fontSize: 13,
    },
    doneBtn: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: PRIMARY,
    },
    doneText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 13,
    },
    categoryRow: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    catChip: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: "#f0f0f0",
        marginRight: 8,
    },
    catChipActive: {
        backgroundColor: PRIMARY,
    },
    catText: {
        fontSize: 13,
        fontWeight: "600",
        color: "#555",
    },
    catTextActive: {
        color: "#fff",
    },
    stickerRow: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    stickerBtn: {
        alignItems: "center",
        marginRight: 16,
        width: 64,
    },
    stickerEmoji: {
        fontSize: 36,
    },
    stickerLabel: {
        marginTop: 4,
        fontSize: 10,
        color: "#888",
        textAlign: "center",
    },
});

export default FaceOverlayPicker;
