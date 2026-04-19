/**
 * MessageContextMenu — Long-press action sheet for messages
 *
 * Actions: React, Edit (own text messages within 15 min), Forward, Copy, Delete/Unsend
 * Shown as a slide-up modal when user long-presses a message bubble.
 */
import React, { useCallback, useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Alert } from "../../utils/appAlert";
import Icon from "react-native-vector-icons/Ionicons";
// @ts-ignore — clipboard module lacks TS declarations in this project
import Clipboard from "@react-native-clipboard/clipboard";
// @ts-ignore
import { API } from "../../api/api";
import { getReadableApiErrorMessage } from "../../api/networkErrors";

const EMOJI_OPTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍"];
const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface MessageEditedData {
    messageId: string;
    text: string;
    isEdited: boolean;
    editedAt: string;
}

interface ChatMessage {
    _id: string;
    text?: string;
    messageType?: string;
    isDeleted?: boolean;
    createdAt?: string;
    sender?: { _id: string } | string;
    [key: string]: any;
}

interface MessageContextMenuProps {
    visible: boolean;
    message: ChatMessage | null;
    isMine: boolean;
    onClose: () => void;
    onReact?: (messageId: string, emoji: string) => void;
    onReply?: (message: ChatMessage) => void;
    onForward?: (messageId: string) => void;
    onMessageEdited?: (data: MessageEditedData) => void;
    onMessageDeleted?: (messageId: string) => void;
}

const MessageContextMenu: React.FC<MessageContextMenuProps> = ({
    visible,
    message,
    isMine,
    onClose,
    onReact,
    onReply,
    onForward,
    onMessageEdited,
    onMessageDeleted,
}) => {
    const [editMode, setEditMode] = useState(false);
    const [editText, setEditText] = useState("");
    const [saving, setSaving] = useState(false);

    const canEdit =
        isMine &&
        message?.messageType === "text" &&
        !message?.isDeleted &&
        message?.createdAt &&
        Date.now() - new Date(message.createdAt).getTime() < EDIT_WINDOW_MS;

    const handleCopy = useCallback(() => {
        if (message?.text) {
            Clipboard.setString(message.text);
        }
        onClose();
    }, [message?.text, onClose]);

    const handleEditStart = useCallback(() => {
        setEditText(message?.text || "");
        setEditMode(true);
    }, [message?.text]);

    const handleEditSave = useCallback(async () => {
        const trimmed = String(editText || "").trim();
        if (!trimmed || !message || trimmed === message?.text) {
            setEditMode(false);
            return;
        }

        try {
            setSaving(true);
            const res = await API.patch(`/message/${message!._id}`, { text: trimmed });
            if (res.data?.success && onMessageEdited) {
                onMessageEdited({
                    messageId: message!._id,
                    text: trimmed,
                    isEdited: true,
                    editedAt: res.data?.data?.editedAt || new Date().toISOString(),
                });
            }
            setEditMode(false);
            onClose();
        } catch (err) {
            Alert.alert("Edit failed", getReadableApiErrorMessage(err, "Could not edit message"));
        } finally {
            setSaving(false);
        }
    }, [editText, message, onClose, onMessageEdited]);

    const handleDelete = useCallback(async () => {
        Alert.alert(
            "Unsend message?",
            "This message will be removed for everyone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Unsend",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await API.delete(`/message/${message!._id}`);
                            if (onMessageDeleted) {
                                onMessageDeleted(message!._id);
                            }
                            onClose();
                        } catch (err) {
                            Alert.alert("Error", getReadableApiErrorMessage(err, "Could not unsend"));
                        }
                    },
                },
            ]
        );
    }, [message, onClose, onMessageDeleted]);

    const handleReact = useCallback(
        (emoji: string) => {
            if (onReact && message?._id) {
                onReact(message._id, emoji);
            }
            onClose();
        },
        [message?._id, onClose, onReact]
    );

    const handleForward = useCallback(() => {
        if (onForward && message?._id) {
            onForward(message._id);
        }
        onClose();
    }, [message?._id, onClose, onForward]);

    const handleReply = useCallback(() => {
        if (onReply && message) {
            onReply(message);
        }
        onClose();
    }, [message, onClose, onReply]);

    if (!visible || !message) return null;

    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
                <View style={styles.sheet}>
                    {/* Emoji reactions row */}
                    <View style={styles.emojiRow}>
                        {EMOJI_OPTIONS.map((emoji) => (
                            <TouchableOpacity key={emoji} style={styles.emojiBtn} onPress={() => handleReact(emoji)}>
                                <Text style={styles.emojiText}>{emoji}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Edit mode */}
                    {editMode ? (
                        <View style={styles.editContainer}>
                            <TextInput
                                style={styles.editInput}
                                value={editText}
                                onChangeText={setEditText}
                                autoFocus
                                multiline
                                editable={!saving}
                            />
                            <View style={styles.editActions}>
                                <TouchableOpacity
                                    style={styles.editCancelBtn}
                                    onPress={() => setEditMode(false)}
                                    disabled={saving}
                                >
                                    <Text style={styles.editCancelText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.editSaveBtn}
                                    onPress={handleEditSave}
                                    disabled={saving || !editText.trim()}
                                >
                                    <Text style={styles.editSaveText}>{saving ? "Saving..." : "Save"}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : (
                        <>
                            {/* Copy */}
                            {message?.text ? (
                                <TouchableOpacity style={styles.action} onPress={handleCopy}>
                                    <Icon name="copy-outline" size={20} color="#333" />
                                    <Text style={styles.actionText}>Copy</Text>
                                </TouchableOpacity>
                            ) : null}

                            {/* Edit (own text messages, within 15 min) */}
                            {canEdit ? (
                                <TouchableOpacity style={styles.action} onPress={handleEditStart}>
                                    <Icon name="create-outline" size={20} color="#333" />
                                    <Text style={styles.actionText}>Edit</Text>
                                </TouchableOpacity>
                            ) : null}

                            {onReply ? (
                                <TouchableOpacity style={styles.action} onPress={handleReply}>
                                    <Icon name="return-up-back-outline" size={20} color="#333" />
                                    <Text style={styles.actionText}>Reply</Text>
                                </TouchableOpacity>
                            ) : null}

                            {onForward ? (
                                <TouchableOpacity style={styles.action} onPress={handleForward}>
                                    <Icon name="arrow-redo-outline" size={20} color="#333" />
                                    <Text style={styles.actionText}>Forward</Text>
                                </TouchableOpacity>
                            ) : null}

                            {/* Unsend (own messages only) */}
                            {isMine && !message?.isDeleted ? (
                                <TouchableOpacity style={styles.action} onPress={handleDelete}>
                                    <Icon name="trash-outline" size={20} color="#FF3B30" />
                                    <Text style={[styles.actionText, { color: "#FF3B30" }]}>Unsend</Text>
                                </TouchableOpacity>
                            ) : null}
                        </>
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
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingTop: 16,
        paddingBottom: 34,
        paddingHorizontal: 20,
    },
    emojiRow: {
        flexDirection: "row",
        justifyContent: "space-around",
        marginBottom: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#f0f0f0",
    },
    emojiBtn: {
        padding: 8,
    },
    emojiText: {
        fontSize: 28,
    },
    action: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: "#f5f5f5",
    },
    actionText: {
        marginLeft: 14,
        fontSize: 16,
        color: "#333",
        fontWeight: "500",
    },
    editContainer: {
        paddingVertical: 8,
    },
    editInput: {
        borderWidth: 1,
        borderColor: "#ddd",
        borderRadius: 12,
        padding: 12,
        fontSize: 15,
        maxHeight: 120,
        color: "#333",
    },
    editActions: {
        flexDirection: "row",
        justifyContent: "flex-end",
        marginTop: 12,
        gap: 12,
    },
    editCancelBtn: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: "#f0f0f0",
    },
    editCancelText: {
        color: "#666",
        fontWeight: "600",
    },
    editSaveBtn: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: "#7b3fe4",
    },
    editSaveText: {
        color: "#fff",
        fontWeight: "700",
    },
});

export default MessageContextMenu;
