import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
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
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";

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
  const [viewerJoinToasts, setViewerJoinToasts] = useState<any[]>([]);
  const [requestingGuestSlot, setRequestingGuestSlot] = useState(false);
  const [processingGuestUserId, setProcessingGuestUserId] = useState("");

  const localStreamRef = useRef<any>(null);
  const peerConnectionsRef = useRef<Map<string, any>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<string, any[]>>(new Map());
  const hasJoinedRoomRef = useRef(false);
  const leavingRef = useRef(false);
  const mediaTornDownRef = useRef(false);

  const isHost = useMemo(() => Boolean(liveStream?.isHost || mode === "host"), [liveStream?.isHost, mode]);
  const currentUserId = String(currentUser?._id || currentUser?.id || "").trim();
  const currentViewers = useMemo(
    () =>
      (Array.isArray(liveStream?.currentViewers) ? liveStream.currentViewers : [])
        .map((viewer: any) => ({
          ...viewer,
          id: String(viewer?._id || viewer?.id || "").trim(),
          label: String(viewer?.name || viewer?.username || "Viewer").trim() || "Viewer",
          avatarUrl: String(viewer?.profilePic || "").trim() || DEFAULT_AVATAR_URL,
        }))
        .filter((viewer: any) => viewer.id),
    [liveStream?.currentViewers],
  );
  const approvedGuestIds = Array.isArray(liveStream?.approvedGuestIds)
    ? liveStream.approvedGuestIds
      .map((entry: any) => String(entry?._id || entry?.id || entry || "").trim())
      .filter(Boolean)
    : [];
  const pendingGuestRequestIds = Array.isArray(liveStream?.pendingGuestRequestIds)
    ? liveStream.pendingGuestRequestIds
      .map((entry: any) => String(entry?._id || entry?.id || entry || "").trim())
      .filter(Boolean)
    : [];
  const pendingGuestRequests = Array.isArray(liveStream?.pendingGuestRequests) ? liveStream.pendingGuestRequests : [];
  const isApprovedGuest = approvedGuestIds.includes(currentUserId) || Boolean(liveStream?.isApprovedGuest);
  const canBroadcast = isHost || isApprovedGuest;
  const hasPendingGuestRequest = pendingGuestRequestIds.includes(currentUserId);
  const liveStatus = String(liveStream?.status || "").trim() || "live";
  const viewerCount = currentViewers.length || Number(liveStream?.viewerCount) || 0;
  const normalizedIceServers = useMemo(() => normalizeIceServers(iceServers), [iceServers]);

  const leaveLiveRoom = useCallback(() => {
    if (!hasJoinedRoomRef.current) {
      return;
    }

    socket.emit("live-stream:leave", { liveStreamId });
    hasJoinedRoomRef.current = false;
  }, [liveStreamId]);

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
    setRemoteStreamURL(null);
  }, []);

  const cleanupAllPeers = useCallback(() => {
    Array.from(peerConnectionsRef.current.keys()).forEach((remoteUserId) => cleanupPeerConnection(remoteUserId));
  }, [cleanupPeerConnection]);

  const teardownLiveMedia = useCallback(() => {
    if (mediaTornDownRef.current) {
      return;
    }

    mediaTornDownRef.current = true;
    cleanupAllPeers();
    stopMediaStream(localStreamRef.current);
    localStreamRef.current = null;
    pendingIceCandidatesRef.current.clear();
    setLocalStreamURL(null);
    setRemoteStreamURL(null);
    setRequestingGuestSlot(false);
    setProcessingGuestUserId("");
    resetCallAudioRoute().catch(() => {});
  }, [cleanupAllPeers]);

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

    if (canBroadcast) {
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
      if (!nextStream) {
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
  }, [attachLocalTracksToPeer, canBroadcast, cleanupPeerConnection, liveStreamId, normalizedIceServers]);

  const createOfferForViewer = useCallback(async (viewerId: string) => {
    const peerConnection = ensurePeerConnection(viewerId);

    try {
      attachLocalTracksToPeer(peerConnection);
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
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
    if (!canBroadcast || localStreamRef.current) {
      return;
    }

    mediaTornDownRef.current = false;
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
  }, [cameraFacingMode, canBroadcast]);

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
        if (canBroadcast) {
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
  }, [canBroadcast, currentUser, ensureLocalMedia, liveStreamId, speakerEnabled]);

  useEffect(() => {
    if (!currentUser || !canBroadcast || !hasJoinedRoomRef.current || localStreamRef.current) {
      return;
    }

    let active = true;

    ensureLocalMedia()
      .then(() => {
        if (!active || !isApprovedGuest) {
          return;
        }

        setTimeout(() => {
          if (active) {
            socket.emit("live-stream:viewer-ready", { liveStreamId });
          }
        }, 250);
      })
      .catch((error) => {
        if (active) {
          setErrorMessage(getReadableApiErrorMessage(error, "Unable to prepare your guest video."));
        }
      });

    return () => {
      active = false;
    };
  }, [canBroadcast, currentUser, ensureLocalMedia, isApprovedGuest, liveStreamId]);

  useEffect(() => {
    const handleJoined = (payload: any) => {
      if (payload?.liveStream?._id && String(payload.liveStream._id) !== String(liveStreamId)) {
        return;
      }

      setRequestingGuestSlot(false);
      if (payload?.liveStream) {
        setLiveStream(payload.liveStream);
      }
    };

    const handleStatus = (payload: any) => {
      if (String(payload?.liveStream?._id || "") !== String(liveStreamId)) {
        return;
      }

      setRequestingGuestSlot(false);
      setLiveStream(payload.liveStream);
      if (String(payload?.liveStream?.status || "") === "ended") {
        teardownLiveMedia();
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

    const handleViewerJoined = (payload: any) => {
      if (String(payload?.liveStreamId || "") !== String(liveStreamId)) {
        return;
      }

      if (payload?.liveStream) {
        setLiveStream(payload.liveStream);
      }

      const joinedUserId = String(payload?.viewer?._id || payload?.viewer?.id || payload?.userId || "").trim();
      if (!joinedUserId || joinedUserId === currentUserId) {
        return;
      }

      const viewer = payload?.viewer || {};
      const toastId = `${joinedUserId}-${Date.now()}`;
      const label = String(viewer?.name || viewer?.username || "Viewer").trim() || "Viewer";
      setViewerJoinToasts((current) => [
        {
          id: toastId,
          userId: joinedUserId,
          label,
          avatarUrl: String(viewer?.profilePic || "").trim() || DEFAULT_AVATAR_URL,
        },
        ...current.filter((entry) => entry.userId !== joinedUserId),
      ].slice(0, 2));

      setTimeout(() => {
        setViewerJoinToasts((current) => current.filter((entry) => entry.id !== toastId));
      }, 3200);
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

    const handleGuestRequested = (payload: any) => {
      if (String(payload?.liveStreamId || "") !== String(liveStreamId)) {
        return;
      }

      setRequestingGuestSlot(false);
      if (payload?.liveStream) {
        setLiveStream(payload.liveStream);
      }
    };

    const handleGuestResponse = (payload: any) => {
      if (String(payload?.liveStreamId || "") !== String(liveStreamId)) {
        return;
      }

      setProcessingGuestUserId("");
      if (payload?.liveStream) {
        setLiveStream(payload.liveStream);
      }

      if (String(payload?.targetUserId || "") === currentUserId) {
        Alert.alert(
          payload?.approved ? "Guest request approved" : "Guest request declined",
          payload?.approved
            ? "The host approved your request. Stay active in the stream chat while everything syncs."
            : "The host declined your request to join on stream."
        );
      }
    };

    socket.on("live-stream:joined", handleJoined);
    socket.on("live-stream:status", handleStatus);
    socket.on("live-stream:viewer-ready", handleViewerReady);
    socket.on("live-stream:offer", handleOffer);
    socket.on("live-stream:answer", handleAnswer);
    socket.on("live-stream:ice-candidate", handleIceCandidate);
    socket.on("live-stream:chat", handleChat);
    socket.on("live-stream:viewer-joined", handleViewerJoined);
    socket.on("live-stream:viewer-left", handleViewerLeft);
    socket.on("live-stream:reaction", handleReaction);
    socket.on("live-stream:guest-requested", handleGuestRequested);
    socket.on("live-stream:guest-response", handleGuestResponse);

    return () => {
      socket.off("live-stream:joined", handleJoined);
      socket.off("live-stream:status", handleStatus);
      socket.off("live-stream:viewer-ready", handleViewerReady);
      socket.off("live-stream:offer", handleOffer);
      socket.off("live-stream:answer", handleAnswer);
      socket.off("live-stream:ice-candidate", handleIceCandidate);
      socket.off("live-stream:chat", handleChat);
      socket.off("live-stream:viewer-joined", handleViewerJoined);
      socket.off("live-stream:viewer-left", handleViewerLeft);
      socket.off("live-stream:reaction", handleReaction);
      socket.off("live-stream:guest-requested", handleGuestRequested);
      socket.off("live-stream:guest-response", handleGuestResponse);
    };
  }, [cleanupPeerConnection, createOfferForViewer, currentUserId, ensurePeerConnection, flushPendingIceCandidates, isHost, liveStreamId, teardownLiveMedia]);

  useEffect(() => () => {
    leavingRef.current = true;

    leaveLiveRoom();
    teardownLiveMedia();
  }, [leaveLiveRoom, teardownLiveMedia]);

  useEffect(() => {
    if (!isHost || !liveStreamId || liveStatus !== "live") {
      return undefined;
    }

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "background" || leavingRef.current || ending) {
        return;
      }

      leavingRef.current = true;
      setLiveStream((current: any) => (current ? { ...current, status: "ended" } : current));
      endLiveStream(liveStreamId)
        .catch((error) => {
          console.log("live stream background end error:", error);
        })
        .finally(() => {
          teardownLiveMedia();
          leaveLiveRoom();
        });
    });

    return () => {
      subscription.remove();
    };
  }, [ending, isHost, leaveLiveRoom, liveStatus, liveStreamId, teardownLiveMedia]);

  useEffect(() => {
    if (liveStatus === "ended") {
      teardownLiveMedia();
      leaveLiveRoom();
      return;
    }

    activateCommunicationAudio(speakerEnabled).catch((error) => {
      console.log("live stream audio activate error:", error);
    });
  }, [leaveLiveRoom, liveStatus, speakerEnabled, teardownLiveMedia]);

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

  const requestGuestSlot = useCallback(() => {
    if (!liveStreamId || liveStatus !== "live" || requestingGuestSlot || hasPendingGuestRequest || isApprovedGuest || isHost) {
      return;
    }

    setRequestingGuestSlot(true);
    socket.emit("live-stream:guest-request", {
      liveStreamId,
    });
  }, [hasPendingGuestRequest, isApprovedGuest, isHost, liveStatus, liveStreamId, requestingGuestSlot]);

  const respondToGuestRequest = useCallback((targetUserId: string, approved: boolean) => {
    const nextTargetUserId = String(targetUserId || "").trim();
    if (!isHost || !nextTargetUserId || processingGuestUserId) {
      return;
    }

    setProcessingGuestUserId(nextTargetUserId);
    socket.emit("live-stream:guest-response", {
      liveStreamId,
      targetUserId: nextTargetUserId,
      approved,
    });
  }, [isHost, liveStreamId, processingGuestUserId]);

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
      leavingRef.current = true;
      teardownLiveMedia();
      leaveLiveRoom();

      if (isHost && liveStreamId) {
        setLiveStream((current: any) => (current ? { ...current, status: "ended" } : current));
        await endLiveStream(liveStreamId);
      }

      navigation.goBack();
    } catch (error) {
      Alert.alert("Unable to close stream", getReadableApiErrorMessage(error, "The live stream could not be closed."));
    } finally {
      setEnding(false);
    }
  }, [isHost, leaveLiveRoom, liveStreamId, navigation, teardownLiveMedia]);

  const statusLabel = liveStatus === "ended" ? "Stream ended" : canBroadcast ? (isHost ? "You are live" : "You are live with host") : "Watching live";
  const mainStageStreamURL = liveStatus === "ended" ? null : remoteStreamURL || (canBroadcast ? localStreamURL : null);
  const shouldMirrorMainStage = !remoteStreamURL && canBroadcast && cameraFacingMode === "user";
  const showLocalPreview = Boolean(remoteStreamURL && localStreamURL && canBroadcast);

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
      <KeyboardAvoidingView style={styles.screen} behavior="padding">
          <View style={styles.stage}>
            {mainStageStreamURL ? (
              <RTCView objectFit="cover" streamURL={mainStageStreamURL} style={styles.video} mirror={shouldMirrorMainStage} />
            ) : (
              <View style={styles.videoPlaceholder}>
                <Icon name="videocam-outline" size={44} color="#fff" />
                <Text style={styles.videoPlaceholderTitle}>
                  {liveStatus === "ended" ? "This live stream has ended" : canBroadcast ? "Preparing your live preview..." : "Waiting for host video..."}
                </Text>
              </View>
            )}

            {showLocalPreview ? (
              <View style={styles.localPreviewPip}>
                <RTCView objectFit="cover" streamURL={localStreamURL as string} style={styles.localPreviewPipVideo} mirror={cameraFacingMode === "user"} />
              </View>
            ) : null}

          <View style={styles.topOverlay}>
            <TouchableOpacity style={[styles.iconButton, ending && styles.iconButtonDisabled]} onPress={handleLeave} disabled={ending}>
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
              {canBroadcast ? (
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

          {viewerJoinToasts.length ? (
            <View pointerEvents="none" style={styles.viewerJoinToastStack}>
              {viewerJoinToasts.map((toast) => (
                <View key={toast.id} style={styles.viewerJoinToast}>
                  <Image source={{ uri: toast.avatarUrl }} style={styles.viewerJoinToastAvatar} />
                  <Text style={styles.viewerJoinToastText} numberOfLines={1}>
                    {toast.label} joined
                  </Text>
                </View>
              ))}
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
          </View>

          {isHost ? (
            <View style={[styles.viewerRosterCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.viewerRosterHeader}>
                <Text style={[styles.viewerRosterTitle, { color: colors.text }]}>Watching now</Text>
                <Text style={[styles.viewerRosterCount, { color: colors.mutedText }]}>{viewerCount}</Text>
              </View>

              {currentViewers.length ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.viewerRosterList}
                >
                  {currentViewers.slice(0, 24).map((viewer: any) => (
                    <View key={viewer.id} style={styles.viewerChip}>
                      <Image source={{ uri: viewer.avatarUrl }} style={styles.viewerAvatar} />
                      <Text style={[styles.viewerName, { color: colors.text }]} numberOfLines={1}>
                        {viewer.label}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <Text style={[styles.viewerEmptyText, { color: colors.mutedText }]}>No viewers yet.</Text>
              )}
            </View>
          ) : null}

          {!isHost && !isApprovedGuest ? (
            <View style={[styles.guestRequestCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.guestRequestIconWrap}>
                <Icon name="hand-left-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.guestRequestCopy}>
                <Text style={[styles.guestRequestTitle, { color: colors.text }]}>Join live</Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.guestRequestButton,
                  {
                    backgroundColor: isApprovedGuest || hasPendingGuestRequest ? colors.surface : colors.primary,
                    borderColor: colors.border,
                  },
                ]}
                onPress={requestGuestSlot}
                disabled={liveStatus !== "live" || requestingGuestSlot || hasPendingGuestRequest}
              >
                <Text style={[styles.guestRequestButtonText, { color: hasPendingGuestRequest ? colors.text : "#fff" }]}>
                  {hasPendingGuestRequest ? "Pending" : requestingGuestSlot ? "Sending..." : "Request"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : pendingGuestRequests.length ? (
            <View style={[styles.guestQueueCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.guestQueueTitle, { color: colors.text }]}>Requests to join</Text>
              {pendingGuestRequests.slice(0, 3).map((requester: any) => {
                const requesterId = String(requester?._id || requester?.id || "").trim();
                const requesterLabel = requester?.name || requester?.username || "Viewer";
                const isProcessing = processingGuestUserId === requesterId;

                return (
                  <View key={requesterId} style={styles.guestQueueRow}>
                    <View style={styles.guestQueueCopy}>
                      <Text style={[styles.guestQueueName, { color: colors.text }]} numberOfLines={1}>
                        {requesterLabel}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.guestQueueAction, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      onPress={() => respondToGuestRequest(requesterId, false)}
                      disabled={isProcessing}
                    >
                      <Text style={[styles.guestQueueActionText, { color: colors.text }]}>Later</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.guestQueueAction, styles.guestQueueApproveButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      onPress={() => respondToGuestRequest(requesterId, true)}
                      disabled={isProcessing}
                    >
                      <Text style={styles.guestQueueApproveText}>{isProcessing ? "Saving..." : "Approve"}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ) : null}

          <ScrollView style={styles.chatList} contentContainerStyle={styles.chatListContent}>
            {messages.length === 0 ? (
              <Text style={[styles.emptyChatText, { color: colors.mutedText }]}>No messages yet.</Text>
            ) : (
              messages.map((message, index) => {
                const senderId = String(message?.sender?._id || message?.sender?.id || message?.senderId || "").trim();
                const isOwnMessage = Boolean(currentUserId) && senderId === currentUserId;

                return (
                  <View
                    key={message?.id || message?._id || `message-${index}`}
                    style={[styles.chatBubbleRow, isOwnMessage ? styles.chatBubbleRowMine : null]}
                  >
                    <View
                      style={[
                        styles.chatBubble,
                        {
                          backgroundColor: isOwnMessage ? colors.primary : colors.card,
                          borderColor: isOwnMessage ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      {!isOwnMessage ? (
                        <Text style={[styles.chatSender, { color: colors.text }]}>
                          {message?.sender?.name || message?.sender?.username || "Aline2 User"}
                        </Text>
                      ) : null}
                      <Text style={[styles.chatMessage, { color: isOwnMessage ? "#fff" : colors.text }]}>
                        {message?.text}
                      </Text>
                    </View>
                  </View>
                );
              })
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
  localPreviewPip: {
    position: "absolute",
    right: 18,
    top: 110,
    width: 108,
    height: 154,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(15,23,42,0.68)",
  },
  localPreviewPipVideo: {
    flex: 1,
  },
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
  viewerJoinToastStack: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 138,
    alignItems: "flex-start",
  },
  viewerJoinToast: {
    maxWidth: 230,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingLeft: 5,
    paddingRight: 14,
    paddingVertical: 5,
    marginBottom: 8,
    backgroundColor: "rgba(15,23,42,0.84)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
  viewerJoinToastAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 9,
    backgroundColor: "rgba(148,163,184,0.35)",
  },
  viewerJoinToastText: {
    flexShrink: 1,
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  chatPanel: {
    maxHeight: 360,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  chatHeader: { marginBottom: 10 },
  chatTitle: { fontSize: 16, fontWeight: "900" },
  chatHint: { marginTop: 4, fontSize: 12, lineHeight: 18 },
  viewerRosterCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  viewerRosterHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  viewerRosterTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  viewerRosterCount: {
    fontSize: 12,
    fontWeight: "800",
  },
  viewerRosterList: {
    paddingRight: 8,
  },
  viewerChip: {
    width: 70,
    alignItems: "center",
    marginRight: 12,
  },
  viewerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(148,163,184,0.18)",
  },
  viewerName: {
    marginTop: 6,
    width: 68,
    textAlign: "center",
    fontSize: 11.5,
    fontWeight: "700",
  },
  viewerEmptyText: {
    fontSize: 13,
    lineHeight: 19,
  },
  guestRequestCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  guestRequestIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(123,63,228,0.1)",
    marginRight: 12,
  },
  guestRequestCopy: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  guestRequestTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  guestRequestHint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
  },
  guestRequestButton: {
    minWidth: 122,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  guestRequestButtonText: {
    fontSize: 12.5,
    fontWeight: "800",
  },
  guestQueueCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  guestQueueTitle: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },
  guestQueueRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  guestQueueCopy: {
    flex: 1,
    minWidth: 0,
    marginRight: 10,
  },
  guestQueueName: {
    fontSize: 13.5,
    fontWeight: "700",
  },
  guestQueueMeta: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
  },
  guestQueueAction: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginLeft: 8,
  },
  guestQueueActionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  guestQueueApproveButton: {
    minWidth: 78,
    alignItems: "center",
  },
  guestQueueApproveText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  chatList: { flexGrow: 0 },
  chatListContent: { paddingBottom: 12 },
  emptyChatText: { fontSize: 13, lineHeight: 19 },
  chatBubbleRow: {
    width: "100%",
    marginBottom: 10,
    alignItems: "flex-start",
  },
  chatBubbleRowMine: {
    alignItems: "flex-end",
  },
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
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: "84%",
  },
  chatSender: { fontSize: 12, fontWeight: "800" },
  chatMessage: { marginTop: 4, fontSize: 13, lineHeight: 18 },
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
