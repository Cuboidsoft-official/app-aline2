import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCView,
  mediaDevices,
} from "react-native-webrtc";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";

import { Alert } from "../utils/appAlert";
import { connectSocket, socket } from "../socket";
import { getStoredUser } from "../utils/authSession";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { useAppTheme } from "../theme/AppThemeContext";
import { ensureCameraPermission, ensureMicrophonePermission } from "../utils/permissions";
import { activateCommunicationAudio, resetCallAudioRoute } from "../utils/callAudio";
import { endLiveStream, getLiveStream } from "../utils/liveStreamApi";

const DEFAULT_ICE_SERVERS = [{ urls: ["stun:stun.l.google.com:19302"] }];
const LIVE_REACTION_OPTIONS = ["❤️", "🔥", "👏", "😂", "😍"];

const stopMediaStream = (stream: any) => {
  const tracks = typeof stream?.getTracks === "function" ? stream.getTracks() : [];
  tracks.forEach((track: any) => {
    try {
      track.stop();
    } catch {
      // Ignore teardown media errors.
    }
  });
};

const normalizeIceServers = (iceServers: any) => {
  if (!Array.isArray(iceServers) || !iceServers.length) {
    return DEFAULT_ICE_SERVERS;
  }

  const nextServers = iceServers.reduce((accumulator: any[], entry: any) => {
    const urls = Array.isArray(entry?.urls)
      ? entry.urls.map((value: any) => String(value || "").trim()).filter(Boolean)
      : [String(entry?.urls || "").trim()].filter(Boolean);

    if (!urls.length) {
      return accumulator;
    }

    accumulator.push({
      urls,
      username: String(entry?.username || "").trim() || undefined,
      credential: String(entry?.credential || "").trim() || undefined,
    });

    return accumulator;
  }, []);

  return nextServers.length ? nextServers : DEFAULT_ICE_SERVERS;
};

const LiveStreamScreen = ({ navigation, route }: any) => {
  const { colors } = useAppTheme();
  const {
    liveStreamId,
    mode = "viewer",
    initialLiveStream = null,
    initialIceServers = [],
  } = route.params || {};

  const [liveStream, setLiveStream] = useState<any>(initialLiveStream);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(!initialLiveStream);
  const [ending, setEnding] = useState(false);
  const [sendingChat, setSendingChat] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [localStreamURL, setLocalStreamURL] = useState<string | null>(null);
  const [remoteStreamURL, setRemoteStreamURL] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [draft, setDraft] = useState("");
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [cameraFacingMode, setCameraFacingMode] = useState<"user" | "environment">("user");
  const [iceServers, setIceServers] = useState<any[]>(Array.isArray(initialIceServers) ? initialIceServers : []);
  const [floatingReactions, setFloatingReactions] = useState<any[]>([]);

  const localStreamRef = useRef<any>(null);
  const peerConnectionsRef = useRef<Map<string, any>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<string, any[]>>(new Map());
  const hasJoinedRoomRef = useRef(false);
  const leavingRef = useRef(false);

  const isHost = useMemo(() => Boolean(liveStream?.isHost || mode === "host"), [liveStream?.isHost, mode]);
  const liveStatus = String(liveStream?.status || "").trim() || "live";
  const viewerCount = Number(liveStream?.viewerCount) || 0;
  const normalizedIceServers = useMemo(() => normalizeIceServers(iceServers), [iceServers]);

  const cleanupPeerConnection = useCallback((remoteUserId: string) => {
    const peerConnection = peerConnectionsRef.current.get(remoteUserId);
    if (!peerConnection) {
      return;
    }

    try {
      peerConnection.onicecandidate = null;
      peerConnection.ontrack = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.close();
    } catch {
      // Ignore peer cleanup issues during teardown.
    }

    peerConnectionsRef.current.delete(remoteUserId);
    pendingIceCandidatesRef.current.delete(remoteUserId);
  }, []);

  const cleanupAllPeers = useCallback(() => {
    Array.from(peerConnectionsRef.current.keys()).forEach((remoteUserId) => cleanupPeerConnection(remoteUserId));
  }, [cleanupPeerConnection]);

  const attachLocalTracksToPeer = useCallback((peerConnection: any) => {
    if (!peerConnection || !localStreamRef.current || typeof localStreamRef.current.getTracks !== "function") {
      return;
    }

    const senders = typeof peerConnection.getSenders === "function" ? peerConnection.getSenders() : [];
    localStreamRef.current.getTracks().forEach((track: any) => {
      const existingSender = senders.find((sender: any) => sender?.track?.kind === track.kind);
      if (!existingSender) {
        peerConnection.addTrack(track, localStreamRef.current);
      }
    });
  }, []);

  const flushPendingIceCandidates = useCallback(async (remoteUserId: string, peerConnection: any) => {
    const pendingCandidates = pendingIceCandidatesRef.current.get(remoteUserId) || [];
    if (!pendingCandidates.length || !peerConnection?.remoteDescription?.type) {
      return;
    }

    for (const candidate of pendingCandidates) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.log("live stream queued ICE error:", error);
      }
    }

    pendingIceCandidatesRef.current.delete(remoteUserId);
  }, []);

  const ensurePeerConnection = useCallback((remoteUserId: string) => {
    const existingPeerConnection = peerConnectionsRef.current.get(remoteUserId);
    if (existingPeerConnection) {
      attachLocalTracksToPeer(existingPeerConnection);
      return existingPeerConnection;
    }

    const peerConnection: any = new RTCPeerConnection({
      iceServers: normalizedIceServers,
    } as any);

    if (isHost) {
      attachLocalTracksToPeer(peerConnection);
    }

    peerConnection.onicecandidate = (event: any) => {
      if (!event?.candidate) {
        return;
      }

      socket.emit("live-stream:ice-candidate", {
        liveStreamId,
        targetUserId: remoteUserId,
        candidate: event.candidate,
      });
    };

    peerConnection.ontrack = (event: any) => {
      const nextStream = event?.streams?.[0];
      if (!nextStream || isHost) {
        return;
      }

      const nextStreamUrl = typeof nextStream.toURL === "function" ? nextStream.toURL() : null;
      if (nextStreamUrl) {
        setRemoteStreamURL(nextStreamUrl);
      }
    };

    peerConnection.onconnectionstatechange = () => {
      const connectionState = String(peerConnection.connectionState || "").trim();
      if (["failed", "closed", "disconnected"].includes(connectionState)) {
        cleanupPeerConnection(remoteUserId);
      }
    };

    peerConnectionsRef.current.set(remoteUserId, peerConnection);
    return peerConnection;
  }, [attachLocalTracksToPeer, cleanupPeerConnection, isHost, liveStreamId, normalizedIceServers]);

  const createOfferForViewer = useCallback(async (viewerId: string) => {
    const peerConnection = ensurePeerConnection(viewerId);

    try {
      attachLocalTracksToPeer(peerConnection);
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });
      await peerConnection.setLocalDescription(offer);

      socket.emit("live-stream:offer", {
        liveStreamId,
        targetUserId: viewerId,
        description: offer,
      });
    } catch (error) {
      console.log("live stream offer error:", error);
    }
  }, [attachLocalTracksToPeer, ensurePeerConnection, liveStreamId]);

  const ensureLocalMedia = useCallback(async () => {
    if (!isHost || localStreamRef.current) {
      return;
    }

    const hasMicrophonePermission = await ensureMicrophonePermission("Allow Aline2 to use your microphone for live streaming.");
    if (!hasMicrophonePermission) {
      throw new Error("Microphone permission is required for live streaming.");
    }

    const hasCameraPermission = await ensureCameraPermission("Allow Aline2 to use your camera for live streaming.");
    if (!hasCameraPermission) {
      throw new Error("Camera permission is required for live streaming.");
    }

    const stream = await mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        googEchoCancellation: true,
        googAutoGainControl: true,
        googNoiseSuppression: true,
        googHighpassFilter: true,
        channelCount: 1,
        sampleRate: 48000,
      } as any,
      video: {
        facingMode: cameraFacingMode,
        frameRate: 24,
        width: 960,
        height: 540,
      },
    });

    localStreamRef.current = stream;
    setLocalStreamURL(typeof stream?.toURL === "function" ? stream.toURL() : null);
  }, [cameraFacingMode, isHost]);

  const loadLiveStream = useCallback(async () => {
    const response = await getLiveStream(liveStreamId);
    if (response?.liveStream) {
      setLiveStream(response.liveStream);
    }
    if (Array.isArray(response?.iceServers)) {
      setIceServers(response.iceServers);
    }
    setErrorMessage("");
  }, [liveStreamId]);

  useEffect(() => {
    let active = true;

    getStoredUser()
      .then((user) => {
        if (active) {
          setCurrentUser(user || null);
        }
      })
      .catch((error) => {
        console.log("live stream current user load error:", error);
      });

    if (!initialLiveStream) {
      loadLiveStream()
        .catch((error) => {
          if (!active) {
            return;
          }

          setErrorMessage(getReadableApiErrorMessage(error, "Unable to load live stream."));
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });
    } else {
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [initialLiveStream, loadLiveStream]);

  useEffect(() => {
    if (!liveStreamId || !currentUser || hasJoinedRoomRef.current) {
      return;
    }

    let active = true;

    const joinRoom = async () => {
      try {
        await connectSocket();
        await activateCommunicationAudio(speakerEnabled).catch(() => false);
        if (isHost) {
          await ensureLocalMedia();
        }

        if (!active) {
          return;
        }

        socket.emit("live-stream:join", { liveStreamId });
        hasJoinedRoomRef.current = true;

        if (!isHost) {
          setTimeout(() => {
            socket.emit("live-stream:viewer-ready", { liveStreamId });
          }, 400);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(getReadableApiErrorMessage(error, "Unable to join this live stream."));
        }
      }
    };

    joinRoom().catch((error) => {
      if (active) {
        setErrorMessage(getReadableApiErrorMessage(error, "Unable to join this live stream."));
      }
    });

    return () => {
      active = false;
    };
  }, [currentUser, ensureLocalMedia, isHost, liveStreamId, speakerEnabled]);

  useEffect(() => {
    const handleJoined = (payload: any) => {
      if (payload?.liveStream?._id && String(payload.liveStream._id) !== String(liveStreamId)) {
        return;
      }

      if (payload?.liveStream) {
        setLiveStream(payload.liveStream);
      }
    };

    const handleStatus = (payload: any) => {
      if (String(payload?.liveStream?._id || "") !== String(liveStreamId)) {
        return;
      }

      setLiveStream(payload.liveStream);
      if (String(payload?.liveStream?.status || "") === "ended") {
        setRemoteStreamURL(null);
      }
    };

    const handleViewerReady = (payload: any) => {
      if (!isHost || String(payload?.liveStreamId || "") !== String(liveStreamId)) {
        return;
      }

      const viewerId = String(payload?.viewerId || "").trim();
      if (!viewerId) {
        return;
      }

      createOfferForViewer(viewerId).catch((error) => {
        console.log("live stream viewer-ready offer error:", error);
      });
    };

    const handleOffer = async (payload: any) => {
      if (isHost || String(payload?.liveStreamId || "") !== String(liveStreamId)) {
        return;
      }

      const fromUserId = String(payload?.fromUserId || "").trim();
      const description = payload?.description;
      if (!fromUserId || !description?.type || !description?.sdp) {
        return;
      }

      try {
        const peerConnection = ensurePeerConnection(fromUserId);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
        await flushPendingIceCandidates(fromUserId, peerConnection);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit("live-stream:answer", {
          liveStreamId,
          targetUserId: fromUserId,
          description: answer,
        });
      } catch (error) {
        console.log("live stream offer handle error:", error);
      }
    };

    const handleAnswer = async (payload: any) => {
      if (!isHost || String(payload?.liveStreamId || "") !== String(liveStreamId)) {
        return;
      }

      const fromUserId = String(payload?.fromUserId || "").trim();
      const description = payload?.description;
      if (!fromUserId || !description?.type || !description?.sdp) {
        return;
      }

      try {
        const peerConnection = ensurePeerConnection(fromUserId);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
        await flushPendingIceCandidates(fromUserId, peerConnection);
      } catch (error) {
        console.log("live stream answer handle error:", error);
      }
    };

    const handleIceCandidate = async (payload: any) => {
      if (String(payload?.liveStreamId || "") !== String(liveStreamId)) {
        return;
      }

      const fromUserId = String(payload?.fromUserId || "").trim();
      const candidate = payload?.candidate;
      if (!fromUserId || !candidate) {
        return;
      }

      try {
        const peerConnection = ensurePeerConnection(fromUserId);
        if (peerConnection?.remoteDescription?.type) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          return;
        }

        const queuedCandidates = pendingIceCandidatesRef.current.get(fromUserId) || [];
        queuedCandidates.push(candidate);
        pendingIceCandidatesRef.current.set(fromUserId, queuedCandidates);
      } catch (error) {
        console.log("live stream ice handle error:", error);
      }
    };

    const handleChat = (payload: any) => {
      if (String(payload?.liveStreamId || "") !== String(liveStreamId) || !payload?.message) {
        return;
      }

      setMessages((current) => [...current.slice(-39), payload.message]);
    };

    const handleViewerLeft = (payload: any) => {
      if (String(payload?.liveStreamId || "") !== String(liveStreamId)) {
        return;
      }

      cleanupPeerConnection(String(payload?.userId || ""));
      if (payload?.liveStream) {
        setLiveStream(payload.liveStream);
      }
    };

    const handleReaction = (payload: any) => {
      if (String(payload?.liveStreamId || "") !== String(liveStreamId) || !payload?.emoji) {
        return;
      }

      const reactionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const horizontalOffset = 24 + Math.floor(Math.random() * 180);
      setFloatingReactions((current) => [
        ...current,
        {
          id: reactionId,
          emoji: String(payload.emoji),
          left: horizontalOffset,
        },
      ]);

      setTimeout(() => {
        setFloatingReactions((current) => current.filter((entry) => entry.id !== reactionId));
      }, 2100);
    };

    socket.on("live-stream:joined", handleJoined);
    socket.on("live-stream:status", handleStatus);
    socket.on("live-stream:viewer-ready", handleViewerReady);
    socket.on("live-stream:offer", handleOffer);
    socket.on("live-stream:answer", handleAnswer);
    socket.on("live-stream:ice-candidate", handleIceCandidate);
    socket.on("live-stream:chat", handleChat);
    socket.on("live-stream:viewer-left", handleViewerLeft);
    socket.on("live-stream:reaction", handleReaction);

    return () => {
      socket.off("live-stream:joined", handleJoined);
      socket.off("live-stream:status", handleStatus);
      socket.off("live-stream:viewer-ready", handleViewerReady);
      socket.off("live-stream:offer", handleOffer);
      socket.off("live-stream:answer", handleAnswer);
      socket.off("live-stream:ice-candidate", handleIceCandidate);
      socket.off("live-stream:chat", handleChat);
      socket.off("live-stream:viewer-left", handleViewerLeft);
      socket.off("live-stream:reaction", handleReaction);
    };
  }, [cleanupPeerConnection, createOfferForViewer, ensurePeerConnection, flushPendingIceCandidates, isHost, liveStreamId]);

  useEffect(() => () => {
    leavingRef.current = true;

    if (hasJoinedRoomRef.current) {
      socket.emit("live-stream:leave", { liveStreamId });
      hasJoinedRoomRef.current = false;
    }

    cleanupAllPeers();
    stopMediaStream(localStreamRef.current);
    localStreamRef.current = null;
    resetCallAudioRoute().catch(() => {});
  }, [cleanupAllPeers, liveStreamId]);

  useEffect(() => {
    if (liveStatus === "ended") {
      return;
    }

    activateCommunicationAudio(speakerEnabled).catch((error) => {
      console.log("live stream audio activate error:", error);
    });
  }, [liveStatus, speakerEnabled]);

  const sendChatMessage = useCallback(() => {
    const nextText = String(draft || "").trim();
    if (!nextText || sendingChat || liveStatus !== "live") {
      return;
    }

    setSendingChat(true);
    socket.emit("live-stream:chat", {
      liveStreamId,
      text: nextText,
    });
    setDraft("");
    setTimeout(() => setSendingChat(false), 200);
  }, [draft, liveStatus, liveStreamId, sendingChat]);

  const sendReaction = useCallback((emoji: string) => {
    if (!emoji || liveStatus !== "live") {
      return;
    }

    socket.emit("live-stream:reaction", {
      liveStreamId,
      emoji,
    });
  }, [liveStatus, liveStreamId]);

  const toggleMicrophone = useCallback(() => {
    if (!localStreamRef.current) {
      return;
    }

    const nextEnabled = !microphoneEnabled;
    localStreamRef.current.getAudioTracks().forEach((track: any) => {
      track.enabled = nextEnabled;
    });
    setMicrophoneEnabled(nextEnabled);
  }, [microphoneEnabled]);

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) {
      return;
    }

    const nextEnabled = !cameraEnabled;
    localStreamRef.current.getVideoTracks().forEach((track: any) => {
      track.enabled = nextEnabled;
    });
    setCameraEnabled(nextEnabled);
  }, [cameraEnabled]);

  const switchCameraFacing = useCallback(() => {
    const localVideoTrack = localStreamRef.current?.getVideoTracks?.()?.[0];
    if (!localVideoTrack || typeof (localVideoTrack as any)?._switchCamera !== "function") {
      Alert.alert("Camera switch unavailable", "This device could not switch cameras during the live stream.");
      return;
    }

    try {
      (localVideoTrack as any)._switchCamera();
      setCameraFacingMode((current) => (current === "user" ? "environment" : "user"));
    } catch (error) {
      console.log("live stream switch camera error:", error);
      Alert.alert("Camera switch unavailable", "The camera could not be switched right now.");
    }
  }, []);

  const toggleSpeaker = useCallback(() => {
    setSpeakerEnabled((current) => !current);
  }, []);

  const handleLeave = useCallback(async () => {
    try {
      setEnding(true);

      if (isHost && liveStreamId) {
        await endLiveStream(liveStreamId);
      } else if (hasJoinedRoomRef.current) {
        socket.emit("live-stream:leave", { liveStreamId });
        hasJoinedRoomRef.current = false;
      }

      navigation.goBack();
    } catch (error) {
      Alert.alert("Unable to close stream", getReadableApiErrorMessage(error, "The live stream could not be closed."));
    } finally {
      setEnding(false);
    }
  }, [isHost, liveStreamId, navigation]);

  const statusLabel = liveStatus === "ended" ? "Stream ended" : isHost ? "You are live" : "Watching live";

  if (loading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: "#050816" }]} edges={["top", "bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="#050816" />
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.stage}>
          {isHost && localStreamURL ? (
            <RTCView objectFit="cover" streamURL={localStreamURL} style={styles.video} mirror={cameraFacingMode === "user"} />
          ) : remoteStreamURL ? (
            <RTCView objectFit="cover" streamURL={remoteStreamURL} style={styles.video} />
          ) : (
            <View style={styles.videoPlaceholder}>
              <Icon name="videocam-outline" size={44} color="#fff" />
              <Text style={styles.videoPlaceholderTitle}>
                {liveStatus === "ended" ? "This live stream has ended" : isHost ? "Preparing your live preview..." : "Waiting for host video..."}
              </Text>
            </View>
          )}

          <View style={styles.topOverlay}>
            <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
              <Icon name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>

            <View style={styles.streamMetaCard}>
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.livePillText}>{statusLabel}</Text>
              </View>
              <Text style={styles.streamTitle}>{liveStream?.title || "Live Session"}</Text>
              <Text style={styles.streamSubtitle}>
                    {liveStream?.hostDisplayName || liveStream?.hostSeller?.sellerName || "Aline2 Creator"} · {viewerCount} viewers
              </Text>
            </View>

            <TouchableOpacity style={[styles.iconButton, ending && styles.iconButtonDisabled]} onPress={handleLeave} disabled={ending}>
              {ending ? <ActivityIndicator color="#fff" /> : <Icon name={isHost ? "stop-circle-outline" : "exit-outline"} size={20} color="#fff" />}
            </TouchableOpacity>
          </View>

          <View style={styles.hostControls}>
            <TouchableOpacity style={[styles.controlButton, !speakerEnabled && styles.controlButtonMuted]} onPress={toggleSpeaker}>
              <Icon name={speakerEnabled ? "volume-high-outline" : "volume-mute-outline"} size={18} color="#fff" />
            </TouchableOpacity>
            {isHost ? (
              <>
                <TouchableOpacity style={[styles.controlButton, !microphoneEnabled && styles.controlButtonMuted]} onPress={toggleMicrophone}>
                  <Icon name={microphoneEnabled ? "mic-outline" : "mic-off-outline"} size={18} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.controlButton, !cameraEnabled && styles.controlButtonMuted]} onPress={toggleCamera}>
                  <Icon name={cameraEnabled ? "videocam-outline" : "videocam-off-outline"} size={18} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.controlButton} onPress={switchCameraFacing}>
                  <Icon name="camera-reverse-outline" size={18} color="#fff" />
                </TouchableOpacity>
              </>
            ) : null}
          </View>

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View pointerEvents="none" style={styles.reactionStage}>
            {floatingReactions.map((reaction, index) => (
              <View
                key={reaction.id}
                style={[
                  styles.reactionBubble,
                  {
                    left: reaction.left,
                    bottom: 26 + ((index % 4) * 22),
                  },
                ]}
              >
                <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.chatPanel, { backgroundColor: colors.background }]}>
          <View style={styles.chatHeader}>
            <Text style={[styles.chatTitle, { color: colors.text }]}>Live Chat</Text>
            <Text style={[styles.chatHint, { color: colors.mutedText }]}>
              {liveStatus === "live" ? "Real-time messages for host and viewers." : "Chat is closed because the stream ended."}
            </Text>
          </View>

          <ScrollView style={styles.chatList} contentContainerStyle={styles.chatListContent}>
            {messages.length === 0 ? (
              <Text style={[styles.emptyChatText, { color: colors.mutedText }]}>The chat is quiet right now. Send the first message.</Text>
            ) : (
              messages.map((message) => (
                <View key={message?.id} style={[styles.chatBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.chatSender, { color: colors.text }]}>
                    {message?.sender?.name || message?.sender?.username || "Aline2 User"}
                  </Text>
                  <Text style={[styles.chatMessage, { color: colors.text }]}>{message?.text}</Text>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.reactionRow}>
            <TouchableOpacity
              style={[styles.quickLikeButton, { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}40` }]}
              onPress={() => sendReaction("❤️")}
              disabled={liveStatus !== "live"}
            >
              <Icon name="heart" size={16} color={colors.primary} />
              <Text style={[styles.quickLikeText, { color: colors.primary }]}>Like</Text>
            </TouchableOpacity>
            {LIVE_REACTION_OPTIONS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={[styles.emojiButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => sendReaction(emoji)}
                disabled={liveStatus !== "live"}
              >
                <Text style={styles.emojiButtonText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.chatComposer, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Live chat message..."
              placeholderTextColor={colors.placeholder}
              style={[styles.chatInput, { color: colors.text }]}
              editable={liveStatus === "live"}
            />
            <TouchableOpacity
              style={[styles.sendButton, { backgroundColor: colors.primary }, (!draft.trim() || liveStatus !== "live") && styles.sendButtonDisabled]}
              onPress={sendChatMessage}
              disabled={!draft.trim() || liveStatus !== "live"}
            >
              <Icon name="send" size={17} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  stage: { flex: 1, backgroundColor: "#050816" },
  video: { flex: 1 },
  videoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    backgroundColor: "#0f172a",
  },
  videoPlaceholderTitle: {
    marginTop: 14,
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  reactionStage: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  reactionBubble: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(15,23,42,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  reactionEmoji: {
    fontSize: 21,
  },
  topOverlay: {
    position: "absolute",
    top: 18,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(15,23,42,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonDisabled: { opacity: 0.55 },
  streamMetaCard: {
    flex: 1,
    marginHorizontal: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(15,23,42,0.72)",
  },
  livePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239,68,68,0.18)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444" },
  livePillText: { marginLeft: 8, color: "#fff", fontSize: 12, fontWeight: "900" },
  streamTitle: { marginTop: 10, color: "#fff", fontSize: 16, fontWeight: "900" },
  streamSubtitle: { marginTop: 4, color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "600" },
  hostControls: {
    position: "absolute",
    right: 18,
    bottom: 18,
    flexDirection: "row",
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.82)",
    marginLeft: 10,
  },
  controlButtonMuted: { backgroundColor: "rgba(185,28,28,0.82)" },
  errorBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 18,
    backgroundColor: "rgba(127,29,29,0.92)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: { color: "#fff", fontSize: 12.5, lineHeight: 18 },
  chatPanel: {
    maxHeight: 290,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  chatHeader: { marginBottom: 10 },
  chatTitle: { fontSize: 16, fontWeight: "900" },
  chatHint: { marginTop: 4, fontSize: 12, lineHeight: 18 },
  chatList: { flexGrow: 0 },
  chatListContent: { paddingBottom: 12 },
  emptyChatText: { fontSize: 13, lineHeight: 19 },
  reactionRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 10,
  },
  quickLikeButton: {
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  quickLikeText: {
    marginLeft: 6,
    fontSize: 12.5,
    fontWeight: "800",
  },
  emojiButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    marginBottom: 8,
  },
  emojiButtonText: {
    fontSize: 18,
  },
  chatBubble: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  chatSender: { fontSize: 12, fontWeight: "800" },
  chatMessage: { marginTop: 5, fontSize: 13, lineHeight: 18 },
  chatComposer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chatInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  sendButtonDisabled: { opacity: 0.45 },
});

export default LiveStreamScreen;
