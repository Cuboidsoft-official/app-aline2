/**
 * VoiceRecorderButton — Hold-to-record voice message component
 *
 * Press and hold the mic button to start recording.
 * Release to send the voice message automatically.
 * Slide left to cancel. Shows duration + animated pulsing indicator.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Alert,
    Animated,
    PanResponder,
    Platform,
    PermissionsAndroid,
    StyleSheet,
    TouchableOpacity,
    Text,
    View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import Sound, { AudioEncoderAndroidType, AudioSourceAndroidType } from "react-native-nitro-sound";

Sound.setSubscriptionDuration(0.15);

const CANCEL_THRESHOLD = -80;

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
    const [starting, setStarting] = useState(false);
    const [stopping, setStopping] = useState(false);
    const [duration, setDuration] = useState(0);
    const [cancelled, setCancelled] = useState(false);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const slideX = useRef(new Animated.Value(0)).current;
    const cancelledRef = useRef(false);
    const isRecordingRef = useRef(false);

    const startPulse = useCallback(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.35, duration: 500, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            ]),
        ).start();
    }, [pulseAnim]);

    const stopPulse = useCallback(() => {
        pulseAnim.stopAnimation();
        pulseAnim.setValue(1);
    }, [pulseAnim]);

    useEffect(() => () => {
        try {
            Sound.removeRecordBackListener();
        } catch {
            // Ignore cleanup failures.
        }
    }, []);

    const requestMicPermission = async () => {
        if (Platform.OS !== "android") return true;
        try {
            const result = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            );
            return result === PermissionsAndroid.RESULTS.GRANTED;
        } catch {
            return false;
        }
    };

    const startRecording = async () => {
        if (disabled || starting || stopping || recording) {
            return;
        }

        const granted = await requestMicPermission();
        if (!granted) {
            Alert.alert("Microphone Permission Required", "Allow microphone access to record voice notes.");
            return;
        }

        cancelledRef.current = false;
        setCancelled(false);
        setDuration(0);
        setStarting(true);

        try {
            Sound.addRecordBackListener((e: any) => {
                if (isRecordingRef.current) {
                    setDuration(e.currentPosition || 0);
                }
            });

            await Sound.startRecorder(undefined, {
                AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
                AudioSourceAndroid: AudioSourceAndroidType.MIC,
                AudioSamplingRate: 44100,
                AudioEncodingBitRate: 128000,
                AudioChannels: 1,
            });

            isRecordingRef.current = true;
            setRecording(true);
            startPulse();
        } catch (err) {
            Sound.removeRecordBackListener();
            console.log("voice recorder start error:", err);
            Alert.alert("Voice Recording Error", "Could not start voice recording. Please try again.");
        } finally {
            setStarting(false);
        }
    };

    const stopRecording = async (send = true) => {
        if (!recording && !starting) {
            return;
        }

        isRecordingRef.current = false;
        setStopping(true);
        setRecording(false);
        stopPulse();
        slideX.setValue(0);

        try {
            const result = await Sound.stopRecorder();
            Sound.removeRecordBackListener();

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
            Alert.alert("Voice Recording Error", "Could not finish voice recording. Please try again.");
        } finally {
            setStopping(false);
            setDuration(0);
            setCancelled(false);
        }
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => !disabled && !starting && !stopping,
            onMoveShouldSetPanResponder: () => !disabled && !starting && !stopping,
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
        }),
    ).current;

    if (recording || starting || stopping) {
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
                    {starting ? "Starting..." : stopping ? "Finishing..." : cancelled ? "Release to cancel" : formatRecordTime(duration)}
                </Text>
                <Text style={styles.slideHint}>
                    {cancelled || starting || stopping ? "" : "◁ Slide to cancel"}
                </Text>
                <View style={[styles.recordingMic, { backgroundColor: cancelled ? "#ccc" : color }]}>
                    <Icon name="mic" size={22} color="#fff" />
                </View>
            </Animated.View>
        );
    }

    return (
        <TouchableOpacity {...panResponder.panHandlers} disabled={disabled} style={styles.micButton}>
            <Icon name="mic" size={24} color={disabled ? "#ccc" : color} />
        </TouchableOpacity>
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
