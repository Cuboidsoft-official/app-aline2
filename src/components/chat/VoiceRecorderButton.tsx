/**
 * VoiceRecorderButton — Hold-to-record voice message component
 *
 * Press and hold the mic button to start recording.
 * Release to send the voice message automatically.
 * Slide left to cancel. Shows duration + animated pulsing indicator.
 */
import React, { useCallback, useRef, useState } from "react";
import {
    Animated,
    PanResponder,
    Platform,
    PermissionsAndroid,
    StyleSheet,
    Text,
    View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import AudioRecorderPlayer from "react-native-audio-recorder-player";

const audioRecorder = new (AudioRecorderPlayer as any)();
audioRecorder.setSubscriptionDuration(0.15); // 150ms updates

const CANCEL_THRESHOLD = -80; // slide left 80px to cancel

const formatRecordTime = (ms: number) => {
    const totalSec = Math.floor((ms || 0) / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

interface VoiceFile {
    uri: string;
    name: string;
    type: string;
    duration: number;
}

interface VoiceRecorderButtonProps {
    onSend: (file: VoiceFile) => void;
    disabled?: boolean;
    color?: string;
}

const VoiceRecorderButton: React.FC<VoiceRecorderButtonProps> = ({ onSend, disabled = false, color = "#7b3fe4" }) => {
    const [recording, setRecording] = useState(false);
    const [duration, setDuration] = useState(0);
    const [cancelled, setCancelled] = useState(false);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const slideX = useRef(new Animated.Value(0)).current;
    const cancelledRef = useRef(false);
    const recordingPathRef = useRef("");
    const isRecordingRef = useRef(false);

    const startPulse = useCallback(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.35, duration: 500, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            ])
        ).start();
    }, [pulseAnim]);

    const stopPulse = useCallback(() => {
        pulseAnim.stopAnimation();
        pulseAnim.setValue(1);
    }, [pulseAnim]);

    const requestMicPermission = async () => {
        if (Platform.OS !== "android") return true;
        try {
            const result = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
            );
            return result === PermissionsAndroid.RESULTS.GRANTED;
        } catch {
            return false;
        }
    };

    const startRecording = async () => {
        const granted = await requestMicPermission();
        if (!granted) return;

        cancelledRef.current = false;
        setCancelled(false);
        setDuration(0);
        setRecording(true);
        isRecordingRef.current = true;
        startPulse();

        try {
            const path = await audioRecorder.startRecorder(undefined, {
                AudioEncoderAndroid: 3, // AAC
                AudioSourceAndroid: 6, // VOICE_RECOGNITION
                OutputFormatAndroid: 2, // MPEG_4
            });
            recordingPathRef.current = path;

            audioRecorder.addRecordBackListener((e: any) => {
                if (isRecordingRef.current) {
                    setDuration(e.currentPosition || 0);
                }
            });
        } catch (err) {
            console.log("voice recorder start error:", err);
            setRecording(false);
            isRecordingRef.current = false;
            stopPulse();
        }
    };

    const stopRecording = async (send = true) => {
        isRecordingRef.current = false;
        setRecording(false);
        stopPulse();
        slideX.setValue(0);

        try {
            const result = await audioRecorder.stopRecorder();
            audioRecorder.removeRecordBackListener();

            if (send && !cancelledRef.current && result && onSend) {
                const durationSec = Math.round((duration || 0) / 1000);
                if (durationSec >= 1) {
                    onSend({
                        uri: result,
                        name: `voice_${Date.now()}.m4a`,
                        type: "audio/m4a",
                        duration: durationSec,
                    });
                }
            }
        } catch (err) {
            console.log("voice recorder stop error:", err);
        } finally {
            setDuration(0);
            setCancelled(false);
        }
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                startRecording();
            },
            onPanResponderMove: (_, gestureState) => {
                const dx = Math.min(0, gestureState.dx);
                slideX.setValue(dx);
                if (dx < CANCEL_THRESHOLD && !cancelledRef.current) {
                    cancelledRef.current = true;
                    setCancelled(true);
                }
            },
            onPanResponderRelease: () => {
                if (cancelledRef.current) {
                    stopRecording(false);
                } else {
                    stopRecording(true);
                }
            },
            onPanResponderTerminate: () => {
                stopRecording(false);
            },
        })
    ).current;

    if (recording) {
        return (
            <Animated.View
                style={[styles.recordingContainer, { transform: [{ translateX: slideX }] }]}
                {...panResponder.panHandlers}
            >
                <Animated.View
                    style={[
                        styles.recordingDot,
                        { backgroundColor: cancelled ? "#999" : "#FF3B30", transform: [{ scale: pulseAnim }] },
                    ]}
                />
                <Text style={[styles.recordingTime, cancelled && styles.cancelledText]}>
                    {cancelled ? "Release to cancel" : formatRecordTime(duration)}
                </Text>
                <Text style={styles.slideHint}>
                    {cancelled ? "" : "◁ Slide to cancel"}
                </Text>
                <View style={[styles.recordingMic, { backgroundColor: cancelled ? "#ccc" : color }]}>
                    <Icon name="mic" size={22} color="#fff" />
                </View>
            </Animated.View>
        );
    }

    return (
        <View {...panResponder.panHandlers} style={styles.micButton}>
            <Icon name="mic" size={24} color={disabled ? "#ccc" : color} />
        </View>
    );
};

const styles = StyleSheet.create({
    micButton: {
        padding: 4,
    },
    recordingContainer: {
        flexDirection: "row",
        alignItems: "center",
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "#fff",
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderTopWidth: 1,
        borderTopColor: "#eee",
        zIndex: 100,
    },
    recordingDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 10,
    },
    recordingTime: {
        fontSize: 16,
        fontWeight: "700",
        color: "#333",
        marginRight: 12,
        fontVariant: ["tabular-nums"],
    },
    cancelledText: {
        color: "#999",
    },
    slideHint: {
        flex: 1,
        fontSize: 13,
        color: "#999",
    },
    recordingMic: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: "center",
        justifyContent: "center",
    },
});

export default VoiceRecorderButton;
