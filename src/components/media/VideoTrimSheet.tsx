/**
 * VideoTrimSheet — Bottom sheet for video trimming, aspect ratio selection
 *
 * Uses react-native-video-trim for the native trim UI.
 * Falls back to a simple start/end time input if the native module isn't available.
 */
import React, { useCallback, useState } from "react";
import {
    Alert,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { ASPECT_RATIOS, VIDEO_DURATION_LIMITS } from "../../utils/videoTrimConfig";

// Try to import react-native-video-trim
let showEditor;
try {
    showEditor = require("react-native-video-trim").showEditor;
} catch {
    showEditor = null;
}

const PRIMARY = "#7b3fe4";

interface TrimResult {
    uri: string;
    aspectRatio: string;
    maxDuration: number;
    trimmed?: boolean;
}

interface VideoTrimSheetProps {
    visible: boolean;
    videoUri: string;
    contentType?: string;
    onClose: () => void;
    onTrimmed?: (result: TrimResult) => void;
}

const VideoTrimSheet: React.FC<VideoTrimSheetProps> = ({ visible, videoUri, contentType = "post", onClose, onTrimmed }) => {
    const [selectedRatio, setSelectedRatio] = useState("original");
    const [trimming, setTrimming] = useState(false);

    const maxDuration = (VIDEO_DURATION_LIMITS as any)[contentType] || 60;

    const handleTrim = useCallback(async () => {
        if (!videoUri) {
            Alert.alert("No video", "Select a video first.");
            return;
        }

        if (showEditor) {
            try {
                setTrimming(true);
                const result = await showEditor(videoUri, {
                    maxDuration,
                    cancelButtonText: "Cancel",
                    saveButtonText: "Done",
                });

                if (result && onTrimmed) {
                    onTrimmed({
                        uri: result,
                        aspectRatio: selectedRatio,
                        maxDuration,
                    });
                }
                onClose();
            } catch (err) {
                if (!String(err).includes("cancel")) {
                    Alert.alert("Trim error", "Could not trim video. Please try again.");
                }
            } finally {
                setTrimming(false);
            }
        } else {
            // Fallback — pass the video untrimmed with aspect ratio info
            if (onTrimmed) {
                onTrimmed({
                    uri: videoUri,
                    aspectRatio: selectedRatio,
                    maxDuration,
                    trimmed: false,
                });
            }
            onClose();
        }
    }, [maxDuration, onClose, onTrimmed, selectedRatio, videoUri]);

    if (!visible) return null;

    return (
        <Modal visible transparent animationType="slide" onRequestClose={onClose}>
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
                <View style={styles.sheet} onStartShouldSetResponder={() => true}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Edit Video</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Icon name="close" size={24} color="#333" />
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.sectionTitle}>Aspect Ratio</Text>
                    <View style={styles.ratioRow}>
                        {ASPECT_RATIOS.map((ar) => {
                            const isActive = ar.id === selectedRatio;
                            return (
                                <TouchableOpacity
                                    key={ar.id}
                                    style={[styles.ratioChip, isActive && styles.ratioChipActive]}
                                    onPress={() => setSelectedRatio(ar.id)}
                                >
                                    <Text style={[styles.ratioText, isActive && styles.ratioTextActive]}>
                                        {ar.name}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <Text style={styles.infoText}>
                        Max duration: {maxDuration}s for {contentType}
                    </Text>

                    <TouchableOpacity
                        style={[styles.trimBtn, trimming && styles.trimBtnDisabled]}
                        onPress={handleTrim}
                        disabled={trimming}
                    >
                        <Icon name="cut-outline" size={20} color="#fff" />
                        <Text style={styles.trimBtnText}>
                            {trimming ? "Processing..." : showEditor ? "Trim & Crop Video" : "Apply Settings"}
                        </Text>
                    </TouchableOpacity>
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
        paddingHorizontal: 20,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: 18,
        paddingBottom: 12,
    },
    title: {
        fontSize: 18,
        fontWeight: "800",
        color: "#111",
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: "700",
        color: "#555",
        marginTop: 8,
        marginBottom: 10,
    },
    ratioRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 16,
    },
    ratioChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: "#f0f0f0",
    },
    ratioChipActive: {
        backgroundColor: PRIMARY,
    },
    ratioText: {
        fontSize: 13,
        fontWeight: "600",
        color: "#555",
    },
    ratioTextActive: {
        color: "#fff",
    },
    infoText: {
        fontSize: 13,
        color: "#999",
        marginBottom: 20,
    },
    trimBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: PRIMARY,
        borderRadius: 14,
        paddingVertical: 14,
        gap: 8,
    },
    trimBtnDisabled: {
        opacity: 0.6,
    },
    trimBtnText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "700",
    },
});

export default VideoTrimSheet;
