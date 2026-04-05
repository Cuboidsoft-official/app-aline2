/**
 * PhotoFilterStrip — Horizontal scrollable filter previews for post/story creation
 *
 * Uses react-native-color-matrix-image-filters for GPU-accelerated real-time filters.
 * Shows thumbnail previews of the image with each filter applied.
 * Tapping a filter selects it; parent applies it to the full-size image.
 */
import React, { useCallback } from "react";
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

// Try to import color matrix filters; fallback gracefully if not linked yet
let ColorMatrix;
try {
    ColorMatrix = require("react-native-color-matrix-image-filters").ColorMatrix;
} catch {
    ColorMatrix = null;
}

import { PHOTO_FILTER_LIST } from "../../utils/photoFilters";

const THUMB_SIZE = 72;

interface FilterItem {
    id: string;
    name: string;
    matrix: number[];
}

interface PhotoFilterStripProps {
    imageUri: string;
    selectedFilter?: string;
    onSelectFilter?: (filter: FilterItem) => void;
}

const PhotoFilterStrip: React.FC<PhotoFilterStripProps> = ({ imageUri, selectedFilter = "none", onSelectFilter }) => {
    const handleSelect = useCallback(
        (filter: FilterItem) => {
            if (onSelectFilter) {
                onSelectFilter(filter);
            }
        },
        [onSelectFilter]
    );

    const renderFilter = ({ item }: { item: FilterItem }) => {
        const isActive = item.id === selectedFilter;
        const thumb = (
            <Image source={{ uri: imageUri }} style={styles.thumb} resizeMode="cover" />
        );

        return (
            <TouchableOpacity
                style={[styles.filterItem, isActive && styles.filterItemActive]}
                onPress={() => handleSelect(item)}
                activeOpacity={0.8}
            >
                <View style={[styles.thumbWrap, isActive && styles.thumbWrapActive]}>
                    {ColorMatrix && item.id !== "none" ? (
                        <ColorMatrix matrix={item.matrix}>{thumb}</ColorMatrix>
                    ) : (
                        thumb
                    )}
                </View>
                <Text style={[styles.filterName, isActive && styles.filterNameActive]} numberOfLines={1}>
                    {item.name}
                </Text>
            </TouchableOpacity>
        );
    };

    if (!imageUri) return null;

    return (
        <View style={styles.container}>
            <FlatList
                horizontal
                data={PHOTO_FILTER_LIST}
                keyExtractor={(item) => item.id}
                renderItem={renderFilter}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.list}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        height: 110,
        backgroundColor: "#000",
    },
    list: {
        paddingHorizontal: 8,
        alignItems: "center",
    },
    filterItem: {
        alignItems: "center",
        marginHorizontal: 6,
        width: THUMB_SIZE + 4,
    },
    filterItemActive: {},
    thumbWrap: {
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        borderRadius: 12,
        overflow: "hidden",
        borderWidth: 2,
        borderColor: "transparent",
    },
    thumbWrapActive: {
        borderColor: "#7b3fe4",
    },
    thumb: {
        width: "100%",
        height: "100%",
    },
    filterName: {
        marginTop: 4,
        fontSize: 11,
        fontWeight: "600",
        color: "#aaa",
        textAlign: "center",
    },
    filterNameActive: {
        color: "#7b3fe4",
        fontWeight: "700",
    },
});

export default PhotoFilterStrip;
