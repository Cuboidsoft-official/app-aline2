/**
 * ChatThemePicker — Bottom sheet for selecting chat themes
 *
 * Shows theme preview circles. Tapping one calls PUT /chat/:id/theme.
 * Real-time update via chatThemeChanged socket event.
 */
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Alert } from "../../utils/appAlert";
import Icon from "react-native-vector-icons/Ionicons";
import LinearGradient from "react-native-linear-gradient";
// @ts-ignore
import { API } from "../../api/api";
import { CHAT_THEME_LIST } from "../../utils/chatThemes";
import { getReadableApiErrorMessage } from "../../api/networkErrors";

interface ChatThemePickerProps {
    visible: boolean;
    conversationId: string;
    currentTheme?: string;
    onClose: () => void;
    onThemeChanged?: (themeId: string) => void;
}

const ChatThemePicker: React.FC<ChatThemePickerProps> = ({ visible, conversationId, currentTheme = "default", onClose, onThemeChanged }) => {
    const [saving, setSaving] = useState(false);

    const handleSelect = useCallback(
        async (theme: any) => {
            if (theme.id === currentTheme || saving) return;

            try {
                setSaving(true);
                await API.put(`/chat/${conversationId}/theme`, { theme: theme.id });
                if (onThemeChanged) {
                    onThemeChanged(theme.id);
                }
                onClose();
            } catch (err) {
                Alert.alert("Error", getReadableApiErrorMessage(err, "Could not change theme"));
            } finally {
                setSaving(false);
            }
        },
        [conversationId, currentTheme, onClose, onThemeChanged, saving]
    );

    const renderTheme = ({ item }: { item: any }) => {
        const isActive = item.id === currentTheme;

        // Try to render gradient if LinearGradient is available, otherwise use solid color
        let gradientContent;
        try {
            gradientContent = (
                <LinearGradient
                    colors={item.sentBubble}
                    style={styles.themeCircleGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                />
            );
        } catch {
            gradientContent = (
                <View style={[styles.themeCircleGradient, { backgroundColor: item.sentBubble[0] }]} />
            );
        }

        return (
            <TouchableOpacity
                style={[styles.themeItem, isActive && styles.themeItemActive]}
                onPress={() => handleSelect(item)}
                disabled={saving}
            >
                <View style={[styles.themeCircle, isActive && styles.themeCircleActive]}>
                    {gradientContent}
                    {isActive ? (
                        <View style={styles.checkMark}>
                            <Icon name="checkmark" size={14} color="#fff" />
                        </View>
                    ) : null}
                </View>
                <Text style={[styles.themeName, isActive && styles.themeNameActive]} numberOfLines={1}>
                    {item.name}
                </Text>
            </TouchableOpacity>
        );
    };

    if (!visible) return null;

    return (
        <Modal visible transparent animationType="slide" onRequestClose={onClose}>
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
                <View style={styles.sheet} onStartShouldSetResponder={() => true}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Chat Theme</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Icon name="close" size={24} color="#333" />
                        </TouchableOpacity>
                    </View>

                    {saving ? (
                        <ActivityIndicator style={styles.loader} color="#7b3fe4" />
                    ) : null}

                    <FlatList
                        data={CHAT_THEME_LIST}
                        numColumns={5}
                        keyExtractor={(item) => item.id}
                        renderItem={renderTheme}
                        contentContainerStyle={styles.grid}
                        showsVerticalScrollIndicator={false}
                    />
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
        paddingBottom: 40,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 12,
    },
    title: {
        fontSize: 18,
        fontWeight: "800",
        color: "#111",
    },
    loader: {
        marginBottom: 8,
    },
    grid: {
        paddingHorizontal: 16,
        paddingTop: 4,
    },
    themeItem: {
        flex: 1,
        alignItems: "center",
        marginBottom: 20,
    },
    themeItemActive: {},
    themeCircle: {
        width: 54,
        height: 54,
        borderRadius: 27,
        overflow: "hidden",
        borderWidth: 2,
        borderColor: "transparent",
        alignItems: "center",
        justifyContent: "center",
    },
    themeCircleActive: {
        borderColor: "#7b3fe4",
    },
    themeCircleGradient: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: 27,
    },
    checkMark: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: "#7b3fe4",
        alignItems: "center",
        justifyContent: "center",
    },
    themeName: {
        marginTop: 6,
        fontSize: 11,
        fontWeight: "600",
        color: "#666",
        textAlign: "center",
    },
    themeNameActive: {
        color: "#7b3fe4",
        fontWeight: "700",
    },
});

export default ChatThemePicker;
