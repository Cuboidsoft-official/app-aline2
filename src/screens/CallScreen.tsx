import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  PermissionsAndroid,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import {
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCView,
  mediaDevices,
} from "react-native-webrtc";

import { connectSocket, socket } from "../socket";
import {
  answerCallSession,
  endCallSession,
  getCallSession,
  rejectCallSession,
} from "../utils/callApi";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { useAppTheme } from "../theme/AppThemeContext";
const TERMINAL_STATUSES = new Set(["rejected", "ended", "cancelled", "missed", "failed"]);

const requestCallPermissions = async (callType: "audio" | "video") => {
  if (Platform.OS !== "android") {
    return true;
  }

  const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (callType === "video") {
    permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
  }

  const result = await PermissionsAndroid.requestMultiple(permissions);

  return permissions.every(
    (permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED
  );
};

const buildStatusLabel = (callSession: any, mode: "incoming" | "outgoing") => {
  if (!callSession) {
    return "Preparing call...";
  }

  switch (callSession.status) {
    case "ringing":
      return mode === "incoming" ? "Incoming call..." : "Ringing...";
    case "ongoing":
      return "Connected";
    case "rejected":
      return "Call declined";
    case "cancelled":
      return "Call cancelled";
    case "missed":
      return "Missed call";
    case "failed":
      return "Call failed";
    case "ended":
      return "Call ended";
    default:
      return "Connecting...";
  }
};

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const CallScreen = ({ navigation, route }: any) => {
  const { colors, isDarkMode } = useAppTheme();
  const insets = useSafeAreaInsets();
  const {
    callSessionId,
    mode = "outgoing",
    initialCallSession = null,
    initialIceServers = null,
    title = "",
    avatarUrl = "",
  } = route.params || {};

  const [callSession, setCallSession] = useState<any>(initialCallSession);
  const [iceServers, setIceServers] = useState<any[]>(
    Array.isArray(initialIceServers) && initialIceServers.length
      ? initialIceServers
      : [{ urls: ["stun:stun.l.google.com:19302"] }]
  );
  const [loading, setLoading] = useState(!initialCallSession);
  const [answering, setAnswering] = useState(false);
  const [ending, setEnding] = useState(false);
  const [statusLabel, setStatusLabel] = useState(
    buildStatusLabel(initialCallSession, mode)
  );
  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(
    String(initialCallSession?.callType || route.params?.callType || "audio") === "video"
  );
  const [durationSeconds, setDurationSeconds] = useState(0);
  const peerConnectionRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const remoteStreamRef = useRef<any>(null);
  const offerStartedRef = useRef(false);
  const closingRef = useRef(false);
  const answeredRef = useRef(false);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const effectiveCallType = String(callSession?.callType || route.params?.callType || "audio") === "video" ? "video" : "audio";
  const otherParticipant = useMemo(
    () => callSession?.otherParticipant || null,
    [callSession]
  );

  const displayName = otherParticipant?.name || otherParticipant?.username || title || "Aline2 call";
  const displayAvatar = otherParticipant?.profilePic || avatarUrl || DEFAULT_AVATAR_URL;
  const hasActiveCall = callSession && !TERMINAL_STATUSES.has(String(callSession.status || ""));

  const cleanupMedia = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track: any) => track.stop());
      localStreamRef.current = null;
    }

    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track: any) => track.stop?.());
      remoteStreamRef.current = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  const fetchCallSessionState = useCallback(async () => {
    if (!callSessionId) {
      return;
    }

    try {
      setLoading(true);
      const data = await getCallSession(callSessionId);
      setCallSession(data.callSession || null);
      if (Array.isArray(data.iceServers) && data.iceServers.length) {
        setIceServers(data.iceServers);
      }
      setStatusLabel(buildStatusLabel(data.callSession, mode));
    } catch (error) {
      Alert.alert("Call unavailable", getReadableApiErrorMessage(error, "This call could not be loaded."));
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [callSessionId, mode, navigation]);

  const ensurePeerConnection = useCallback(async () => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current;
    }

    const peerConnection: any = new RTCPeerConnection({ iceServers });

    const handleIceCandidate = (event: any) => {
      if (!event?.candidate) {
        return;
      }

      socket.emit("call:ice-candidate", {
        callSessionId,
        candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
      });
    };

    const handleTrack = (event: any) => {
      const nextStream = event?.streams?.[0];

      if (nextStream) {
        remoteStreamRef.current = nextStream;
        setRemoteStream(nextStream);
        return;
      }

      if (!remoteStreamRef.current) {
        remoteStreamRef.current = new MediaStream();
      }

      if (event?.track) {
        remoteStreamRef.current.addTrack(event.track);
        setRemoteStream(remoteStreamRef.current);
      }
    };

    const handleConnectionStateChange = () => {
      const connectionState = String(peerConnection.connectionState || "");

      if (connectionState === "connected") {
        setStatusLabel("Connected");
      } else if (connectionState === "failed") {
        setStatusLabel("Connection failed");
      } else if (connectionState === "disconnected") {
        setStatusLabel("Reconnecting...");
      }
    };

    peerConnection.addEventListener("icecandidate", handleIceCandidate as any);
    peerConnection.addEventListener("track", handleTrack as any);
    peerConnection.addEventListener("connectionstatechange", handleConnectionStateChange as any);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track: any) => {
        peerConnection.addTrack(track, localStreamRef.current);
      });
    }

    peerConnectionRef.current = peerConnection;
    return peerConnection;
  }, [callSessionId, iceServers]);

  const ensureLocalStream = useCallback(async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    const granted = await requestCallPermissions(effectiveCallType as "audio" | "video");
    if (!granted) {
      throw new Error(
        effectiveCallType === "video"
          ? "Camera and microphone permissions are required for video calls."
          : "Microphone permission is required for audio calls."
      );
    }

    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video:
        effectiveCallType === "video"
          ? {
              facingMode: "user",
              width: 640,
              height: 480,
              frameRate: 30,
            }
          : false,
    });

    localStreamRef.current = stream;
    setLocalStream(stream);
    setIsVideoEnabled(
      effectiveCallType === "video"
        ? stream.getVideoTracks().some((track: any) => track.enabled)
        : false
    );

    if (peerConnectionRef.current) {
      stream.getTracks().forEach((track: any) => {
        peerConnectionRef.current.addTrack(track, stream);
      });
    }

    return stream;
  }, [effectiveCallType]);

  const startOffer = useCallback(async () => {
    if (offerStartedRef.current) {
      return;
    }

    offerStartedRef.current = true;

    try {
      await ensureLocalStream();
      const peerConnection = await ensurePeerConnection();
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: effectiveCallType === "video",
      });
      await peerConnection.setLocalDescription(offer);

      socket.emit("call:offer", {
        callSessionId,
        description: offer.toJSON ? offer.toJSON() : offer,
      });
    } catch (error) {
      offerStartedRef.current = false;
      Alert.alert("Could not start call", getReadableApiErrorMessage(error, "Unable to initialize the call."));
    }
  }, [callSessionId, effectiveCallType, ensureLocalStream, ensurePeerConnection]);

  const applyTerminalState = useCallback(
    (nextCallSession: any) => {
      setCallSession(nextCallSession);
      setStatusLabel(buildStatusLabel(nextCallSession, mode));
      cleanupMedia();

      if (closingRef.current) {
        return;
      }

      closingRef.current = true;
      setTimeout(() => {
        navigation.goBack();
      }, 900);
    },
    [cleanupMedia, mode, navigation]
  );

  useEffect(() => {
    if (!callSessionId) {
      Alert.alert("Call unavailable", "Missing call session.");
      navigation.goBack();
      return;
    }

    fetchCallSessionState().catch(() => {});
  }, [callSessionId, fetchCallSessionState, navigation]);

  useEffect(() => {
    const syncSocket = async () => {
      await connectSocket();
      socket.emit("call:join", { callSessionId });
    };

    syncSocket().catch((error) => {
      console.log("call socket connect error", error);
    });

    const handleCallStatus = (payload: any) => {
      const nextCallSession = payload?.callSession;
      if (!nextCallSession || String(nextCallSession._id || "") !== String(callSessionId || "")) {
        return;
      }

      setCallSession(nextCallSession);
      setStatusLabel(buildStatusLabel(nextCallSession, mode));

      if (TERMINAL_STATUSES.has(String(nextCallSession.status || ""))) {
        applyTerminalState(nextCallSession);
        return;
      }

      if (String(nextCallSession.status) === "ongoing" && mode === "outgoing") {
        startOffer().catch(() => {});
      }
    };

    const handleOffer = async (payload: any) => {
      if (String(payload?.callSessionId || "") !== String(callSessionId || "")) {
        return;
      }

      try {
        await ensureLocalStream();
        const peerConnection = await ensurePeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.description));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit("call:answer", {
          callSessionId,
          description: answer.toJSON ? answer.toJSON() : answer,
        });
      } catch (error) {
        console.log("call offer handling error", error);
      }
    };

    const handleAnswer = async (payload: any) => {
      if (String(payload?.callSessionId || "") !== String(callSessionId || "")) {
        return;
      }

      try {
        const peerConnection = await ensurePeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.description));
      } catch (error) {
        console.log("call answer handling error", error);
      }
    };

    const handleIceCandidate = async (payload: any) => {
      if (String(payload?.callSessionId || "") !== String(callSessionId || "")) {
        return;
      }

      try {
        const peerConnection = await ensurePeerConnection();
        await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch (error) {
        console.log("call ice candidate error", error);
      }
    };

    socket.on("call:status", handleCallStatus);
    socket.on("call:offer", handleOffer);
    socket.on("call:answer", handleAnswer);
    socket.on("call:ice-candidate", handleIceCandidate);

    return () => {
      socket.off("call:status", handleCallStatus);
      socket.off("call:offer", handleOffer);
      socket.off("call:answer", handleAnswer);
      socket.off("call:ice-candidate", handleIceCandidate);
      cleanupMedia();
    };
  }, [
    applyTerminalState,
    callSessionId,
    cleanupMedia,
    ensureLocalStream,
    ensurePeerConnection,
    mode,
    startOffer,
  ]);

  useEffect(() => {
    if (callSession?.status !== "ongoing") {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      setDurationSeconds(0);
      return;
    }

    if (durationTimerRef.current) {
      return;
    }

    const answeredAt = callSession?.answeredAt ? new Date(callSession.answeredAt).getTime() : Date.now();

    durationTimerRef.current = setInterval(() => {
      setDurationSeconds(Math.max(0, Math.floor((Date.now() - answeredAt) / 1000)));
    }, 1000);

    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    };
  }, [callSession]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event: any) => {
      if (closingRef.current || !hasActiveCall) {
        return;
      }

      event.preventDefault();

      const reason = mode === "incoming" && callSession?.status === "ringing" ? "declined" : "hangup";

      endCallSession(callSessionId, reason)
        .catch(() => {})
        .finally(() => {
          closingRef.current = true;
          navigation.dispatch(event.data.action);
        });
    });

    return unsubscribe;
  }, [callSession?.status, callSessionId, hasActiveCall, mode, navigation]);

  useEffect(() => {
    if (mode !== "outgoing" || !callSession || TERMINAL_STATUSES.has(String(callSession.status || ""))) {
      return;
    }

    ensureLocalStream().catch((error) => {
      Alert.alert("Could not access call media", getReadableApiErrorMessage(error, "Please check your device permissions."));
    });
  }, [callSession, ensureLocalStream, mode]);

  const handleAnswer = async () => {
    if (answering || answeredRef.current) {
      return;
    }

    try {
      setAnswering(true);
      await ensureLocalStream();
      const response = await answerCallSession(callSessionId);
      answeredRef.current = true;
      setCallSession(response.callSession || null);
      if (Array.isArray(response.iceServers) && response.iceServers.length) {
        setIceServers(response.iceServers);
      }
      setStatusLabel(buildStatusLabel(response.callSession, mode));
    } catch (error) {
      Alert.alert("Could not answer call", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setAnswering(false);
    }
  };

  const handleReject = async () => {
    try {
      setEnding(true);
      await rejectCallSession(callSessionId, "declined");
      closingRef.current = true;
      navigation.goBack();
    } catch (error) {
      setEnding(false);
      Alert.alert("Could not decline call", getReadableApiErrorMessage(error, "Please try again."));
    }
  };

  const handleHangUp = async () => {
    try {
      setEnding(true);
      await endCallSession(callSessionId, "hangup");
      closingRef.current = true;
      navigation.goBack();
    } catch (error) {
      setEnding(false);
      Alert.alert("Could not end call", getReadableApiErrorMessage(error, "Please try again."));
    }
  };

  const toggleMute = () => {
    if (!localStreamRef.current) {
      return;
    }

    const nextMuted = !isMuted;
    localStreamRef.current.getAudioTracks().forEach((track: any) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  };

  const toggleVideo = () => {
    if (effectiveCallType !== "video" || !localStreamRef.current) {
      return;
    }

    const nextEnabled = !isVideoEnabled;
    localStreamRef.current.getVideoTracks().forEach((track: any) => {
      track.enabled = nextEnabled;
    });
    setIsVideoEnabled(nextEnabled);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#fff" />
      </SafeAreaView>
    );
  }

  const showIncomingActions = mode === "incoming" && callSession?.status === "ringing";
  const showCallControls = callSession?.status === "ongoing" || (mode === "outgoing" && callSession?.status === "ringing");
  const localStreamUrl = localStream?.toURL?.() || null;
  const remoteStreamUrl = remoteStream?.toURL?.() || null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? "#050816" : "#0f172a" }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      <View style={[styles.header, { paddingTop: Math.max(insets.top, 18) }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {effectiveCallType === "video" && remoteStreamUrl ? (
        <RTCView streamURL={remoteStreamUrl} style={styles.remoteVideo} objectFit="cover" />
      ) : (
        <View style={styles.avatarStage}>
          <View style={[styles.avatarRing, { borderColor: colors.primary }]}>
            <Image source={{ uri: displayAvatar }} style={styles.avatar} />
          </View>
        </View>
      )}

      {effectiveCallType === "video" && localStreamUrl ? (
        <RTCView streamURL={localStreamUrl} style={styles.localPreview} objectFit="cover" mirror />
      ) : null}

      <View style={styles.overlay}>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.statusLabel}>
          {callSession?.status === "ongoing" ? formatDuration(durationSeconds) : statusLabel}
        </Text>

        {showIncomingActions ? (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.callButton, styles.rejectButton]}
              onPress={handleReject}
              disabled={ending}
            >
              <Icon name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.callButton, styles.acceptButton]}
              onPress={handleAnswer}
              disabled={answering}
            >
              {answering ? <ActivityIndicator color="#fff" /> : <Icon name="call" size={24} color="#fff" />}
            </TouchableOpacity>
          </View>
        ) : showCallControls ? (
          <View style={styles.controlSection}>
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.controlButton, isMuted ? styles.controlButtonActive : null]}
                onPress={toggleMute}
              >
                <Icon name={isMuted ? "mic-off" : "mic"} size={22} color="#fff" />
              </TouchableOpacity>

              {effectiveCallType === "video" ? (
                <TouchableOpacity
                  style={[styles.controlButton, !isVideoEnabled ? styles.controlButtonActive : null]}
                  onPress={toggleVideo}
                >
                  <Icon name={isVideoEnabled ? "videocam" : "videocam-off"} size={22} color="#fff" />
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[styles.callButton, styles.endButton]}
                onPress={handleHangUp}
                disabled={ending}
              >
                {ending ? <ActivityIndicator color="#fff" /> : <Icon name="call" size={24} color="#fff" style={styles.endIcon} />}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.callButton, styles.endButton]}
              onPress={handleHangUp}
              disabled={ending}
            >
              {ending ? <ActivityIndicator color="#fff" /> : <Icon name="call" size={24} color="#fff" style={styles.endIcon} />}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

export default CallScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 3,
    paddingHorizontal: 18,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  remoteVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  avatarStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarRing: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  avatar: {
    width: 156,
    height: 156,
    borderRadius: 78,
  },
  localPreview: {
    position: "absolute",
    right: 18,
    top: 96,
    width: 110,
    height: 160,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#111827",
    zIndex: 3,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 24,
    paddingBottom: 42,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  name: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
  },
  statusLabel: {
    marginTop: 10,
    color: "#d1d5db",
    fontSize: 15,
    textAlign: "center",
  },
  controlSection: {
    marginTop: 28,
    width: "100%",
    alignItems: "center",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    marginTop: 28,
  },
  controlButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  controlButtonActive: {
    backgroundColor: "rgba(239,68,68,0.42)",
  },
  callButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButton: {
    backgroundColor: "#16a34a",
  },
  rejectButton: {
    backgroundColor: "#dc2626",
  },
  endButton: {
    backgroundColor: "#ef4444",
  },
  endIcon: {
    transform: [{ rotate: "135deg" }],
  },
});
