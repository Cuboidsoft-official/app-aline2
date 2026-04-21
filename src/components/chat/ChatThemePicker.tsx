/**
 * ChatThemePicker — Bottom sheet for selecting chat themes
 *
 * Shows theme preview circles. Tapping one updates the chat theme.
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
import { CHAT_THEME_LIST } from "../../utils/chatThemes";
import { getReadableApiErrorMessage } from "../../api/networkErrors";
import { updateConversationTheme } from "../../utils/chatApi";
import { useAppTheme } from "../../theme/AppThemeContext";

interface ChatThemePickerProps {
    visible: boolean;
    conversationId: string;
    currentTheme?: string;
    onClose: () => void;
    onThemeChanged?: (themeId: string) => void;
}

const ChatThemePicker: React.FC<ChatThemePickerProps> = ({ visible, conversationId, currentTheme = "default", onClose, onThemeChanged }) => {
    const [saving, setSaving] = useState(false);
    const { colors } = useAppTheme();

    const handleSelect = useCallback(
        async (theme: any) => {
            if (theme.id === currentTheme || saving) return;
            if (!conversationId) {
                Alert.alert("Chat theme", "Conversation is not ready yet. Please try again.");
                return;
            }

            try {
                setSaving(true);
                await updateConversationTheme({ conversationId, theme: theme.id });
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
                style={[
                    styles.themeItem,
                    isActive ? { backgroundColor: `${colors.primary}14` } : null,
                ]}
                onPress={() => handleSelect(item)}
                disabled={saving}
            >
                <View
                    style={[
                        styles.themeCircle,
                        { borderColor: isActive ? colors.primary : colors.border },
                    ]}
                >
                    {gradientContent}
                    {isActive ? (
                        <View style={[styles.checkMark, { backgroundColor: colors.primary }]}>
                            <Icon name="checkmark" size={14} color="#fff" />
                        </View>
                    ) : null}
                </View>
                <Text
                    style={[
                        styles.themeName,
                        { color: isActive ? colors.primary : colors.mutedText },
                        isActive && styles.themeNameActive,
                    ]}
                    numberOfLines={1}
                >
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
                    <View style={[styles.sheetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.header, { borderBottomColor: colors.border }]}>
                        <Text style={[styles.title, { color: colors.text }]}>Chat Theme</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Icon name="close" size={24} color={colors.text} />
                        </TouchableOpacity>
                    </View>

                    {saving ? (
                        <ActivityIndicator style={styles.loader} color={colors.primary} />
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
        paddingHorizontal: 12,
        paddingBottom: 14,
    },
    sheetCard: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: "hidden",
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    title: {
        fontSize: 18,
        fontWeight: "800",
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
        marginHorizontal: 4,
        paddingVertical: 10,
        borderRadius: 16,
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
        alignItems: "center",
        justifyContent: "center",
    },
    themeName: {
        marginTop: 6,
        fontSize: 11,
        fontWeight: "600",
        textAlign: "center",
    },
    themeNameActive: {
        fontWeight: "700",
    },
});

export default ChatThemePicker;
