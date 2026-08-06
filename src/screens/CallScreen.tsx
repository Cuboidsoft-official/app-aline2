import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  StatusBar,
  StyleSheet,
  Text,
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
import { Alert } from "../utils/appAlert";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";

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
import { getStoredUser } from "../utils/authSession";
import {
  activateCommunicationAudio,
  resetCallAudioRoute,
  setCallSpeakerEnabled,
  startCallRingtone,
  stopCallRingtone,
} from "../utils/callAudio";
import {
  applyArFilterPresetToTrack,
  AR_FILTER_LABELS,
  AR_FILTER_PRESET_ORDER,
  isArFilterSupported,
  type ArFilterPreset,
} from "../utils/arFilters";
import { ensureCameraPermission, ensureMicrophonePermission } from "../utils/permissions";
import { safeDecodeURIComponent } from "../utils/safeDecode";

const TERMINAL_STATUSES = new Set(["rejected", "ended", "cancelled", "missed", "failed"]);
const DEFAULT_ICE_SERVERS = [{ urls: ["stun:stun.l.google.com:19302"] }];

const buildStatusLabel = (callSession: any, mode: "incoming" | "outgoing", isGroupCall: boolean) => {
  if (!callSession) {
    return "Preparing call...";
  }

  if (isGroupCall && callSession?.currentParticipantState?.status === "invited" && callSession?.status === "ongoing") {
    return mode === "incoming" ? "Incoming group call..." : "Connecting group call...";
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

const resolveAvatarUrl = (participant: any) =>
  String(
    participant?.profilePic
    || participant?.avatar
    || participant?.user?.profilePic
    || participant?.user?.avatar
    || ""
  ).trim();

const resolveParticipantId = (participant: any) =>
  String(
    participant?._id
    || participant?.id
    || participant?.user?._id
    || participant?.user?.id
    || participant?.user
    || ""
  ).trim();

const stopMediaStream = (stream: any) => {
  const tracks = typeof stream?.getTracks === "function" ? stream.getTracks() : [];
  tracks.forEach((track: any) => {
    try {
      track.stop();
    } catch {
      // Ignore media cleanup errors during teardown.
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

const buildMediaConstraints = (
  callType: "audio" | "video",
  facingMode: "user" | "environment" = "user",
) => ({
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
  video:
    callType === "video"
      ? {
          facingMode,
          frameRate: 24,
          width: 960,
          height: 540,
        }
      : false,
});

const shouldInitiateOffer = (localUserId: string, remoteUserId: string) =>
  String(localUserId || "").trim().localeCompare(String(remoteUserId || "").trim()) < 0;

type RemoteStreamEntry = {
  userId: string;
  stream: any;
  streamURL: string;
};

const CallScreen = ({ navigation, route }: any) => {
  const { colors, isDarkMode } = useAppTheme();
  const insets = useSafeAreaInsets();
  const {
    callSessionId,
    mode = "outgoing",
    initialCallSession = null,
    initialIceServers = [],
    title = "",
    avatarUrl = "",
  } = route.params || {};

  const [callSession, setCallSession] = useState<any>(initialCallSession);
  const [callRuntime, setCallRuntime] = useState<any>(route.params?.callRuntime || null);
  const [iceServers, setIceServers] = useState<any[]>(Array.isArray(initialIceServers) ? initialIceServers : []);
  const [loading, setLoading] = useState(!initialCallSession);
  const [answering, setAnswering] = useState(false);
  const [ending, setEnding] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const [localStreamURL, setLocalStreamURL] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStreamEntry[]>([]);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(String(route.params?.callType || "audio") === "video");
  const [speakerEnabled, setSpeakerEnabledState] = useState(true);
  const [arFilterPreset, setArFilterPreset] = useState<ArFilterPreset>("none");
  const [arFiltersSupported, setArFiltersSupported] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<"user" | "environment">("user");

  const callSessionRef = useRef<any>(initialCallSession);
  const closingRef = useRef(false);
  const answeredRef = useRef(false);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringtoneActiveRef = useRef(false);
  const speakerEnabledRef = useRef(true);
  const localStreamRef = useRef<any>(null);
  const peerConnectionsRef = useRef<Map<string, any>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<string, any[]>>(new Map());
  const offeredPeerIdsRef = useRef<Set<string>>(new Set());
  const joinedCallRoomRef = useRef(false);

  const effectiveCallType =
    String(callSession?.callType || route.params?.callType || "audio") === "video" ? "video" : "audio";
  const isGroupCall = String(callSession?.conversation?.conversationType || "") === "group";
  const currentParticipantState = callSession?.currentParticipantState || null;
  const currentUserId = String(
    currentUser?._id
    || currentUser?.id
    || currentParticipantState?.user?._id
    || currentParticipantState?.user
    || ""
  );
  const otherParticipant = useMemo(() => callSession?.otherParticipant || null, [callSession]);

  const normalizedIceServerConfig = useMemo(() => normalizeIceServers(iceServers), [iceServers]);

  const participantLookup = useMemo(() => {
    const nextLookup = new Map<string, any>();

    const registerParticipant = (participant: any) => {
      const participantId = resolveParticipantId(participant);
      if (!participantId) {
        return;
      }

      nextLookup.set(participantId, participant?.user || participant);
    };

    registerParticipant(currentUser);
    registerParticipant(otherParticipant);

    (Array.isArray(callSession?.participants) ? callSession.participants : []).forEach(registerParticipant);
    (Array.isArray(callSession?.participantStates) ? callSession.participantStates : []).forEach((entry: any) => {
      registerParticipant(entry?.user);
    });

    return nextLookup;
  }, [callSession?.participantStates, callSession?.participants, currentUser, otherParticipant]);

  const participantAvatarMap = useMemo(() => {
    const nextMap = new Map<string, string>();

    participantLookup.forEach((participant, participantId) => {
      const nextAvatarUrl = resolveAvatarUrl(participant);
      if (nextAvatarUrl) {
        nextMap.set(participantId, nextAvatarUrl);
      }
    });

    return nextMap;
  }, [participantLookup]);

  const displayName = isGroupCall
    ? safeDecodeURIComponent(callSession?.conversation?.groupName || title) || "Group call"
    : safeDecodeURIComponent(otherParticipant?.name || otherParticipant?.username || title) || "Aline2 call";
  const displayAvatar = isGroupCall
    ? callSession?.conversation?.groupAvatar || avatarUrl || DEFAULT_AVATAR_URL
    : otherParticipant?.profilePic || avatarUrl || DEFAULT_AVATAR_URL;
  const hasActiveCall = callSession && !TERMINAL_STATUSES.has(String(callSession.status || ""));
  const initiatorId = String(
    callSession?.initiatedBy?._id
    || callSession?.initiatedBy?.id
    || callSession?.initiatedBy
    || "",
  );
  const shouldEnterMediaRoom = isGroupCall
    ? String(currentParticipantState?.status || "") === "joined"
    : String(callSession?.status || "") === "ongoing";
  const isIncomingInviteState = isGroupCall
    ? String(currentParticipantState?.status || "") === "invited" && String(callSession?.status || "") === "ongoing"
    : String(callSession?.status || "") === "ringing";
  const isIncomingCallScreen = mode === "incoming"
    || (
      !!currentUserId
      && !!initiatorId
      && initiatorId !== String(currentUserId)
      && isIncomingInviteState
    );
  const shouldPlayRingtone =
    !loading
    && !shouldEnterMediaRoom
    && !TERMINAL_STATUSES.has(String(callSession?.status || ""))
    && (
      String(callSession?.status || "") === "ringing"
      || (
        isGroupCall
        && String(currentParticipantState?.status || "") === "invited"
        && String(callSession?.status || "") === "ongoing"
      )
    );

  const joinedRemoteParticipantIds = useMemo(() => {
    const nextIds = new Set<string>();

    (Array.isArray(callSession?.participantStates) ? callSession.participantStates : []).forEach((entry: any) => {
      const participantId = resolveParticipantId(entry?.user);
      if (!participantId || participantId === String(currentUserId || "")) {
        return;
      }

      if (String(entry?.status || "") === "joined") {
        nextIds.add(participantId);
      }
    });

    return Array.from(nextIds);
  }, [callSession?.participantStates, currentUserId]);

  const remoteParticipantTiles = useMemo(
    () =>
      remoteStreams.map((entry) => ({
        ...entry,
        participant: participantLookup.get(entry.userId) || null,
        avatarUrl: participantAvatarMap.get(entry.userId) || DEFAULT_AVATAR_URL,
        name:
          String(
            participantLookup.get(entry.userId)?.name
            || participantLookup.get(entry.userId)?.username
            || "Participant"
          ).trim() || "Participant",
      })),
    [participantAvatarMap, participantLookup, remoteStreams]
  );

  const remotePrimaryTile = remoteParticipantTiles[0] || null;

  useEffect(() => {
    callSessionRef.current = callSession;
  }, [callSession]);

  useEffect(() => {
    speakerEnabledRef.current = speakerEnabled;
  }, [speakerEnabled]);

  useEffect(() => {
    setCameraEnabled(effectiveCallType === "video");
  }, [effectiveCallType]);

  useEffect(() => {
    if (effectiveCallType !== "video") {
      setArFiltersSupported(false);
      setCameraFacingMode("user");
      return;
    }

    let active = true;

    isArFilterSupported()
      .then((supported) => {
        if (active) {
          setArFiltersSupported(supported);
        }
      })
      .catch((error) => {
        console.log("call ar filter capability error", error);
        if (active) {
          setArFiltersSupported(false);
        }
      });

    return () => {
      active = false;
    };
  }, [effectiveCallType]);

  const setRemoteStreamForUser = useCallback((userId: string, stream: any) => {
    if (!userId || !stream?.toURL) {
      return;
    }

    const streamURL = String(stream.toURL() || "").trim();
    if (!streamURL) {
      return;
    }

    setRemoteStreams((prev) => {
      const existingIndex = prev.findIndex((entry) => entry.userId === userId);
      if (existingIndex >= 0) {
        const nextEntries = [...prev];
        nextEntries[existingIndex] = { userId, stream, streamURL };
        return nextEntries;
      }

      return [...prev, { userId, stream, streamURL }];
    });
  }, []);

  const removeRemoteStreamForUser = useCallback((userId: string) => {
    setRemoteStreams((prev) => prev.filter((entry) => entry.userId !== userId));
  }, []);

  const cleanupPeerConnection = useCallback((remoteUserId: string) => {
    const peerConnection = peerConnectionsRef.current.get(remoteUserId);
    if (peerConnection) {
      try {
        peerConnection.onicecandidate = null;
        peerConnection.ontrack = null;
        peerConnection.onconnectionstatechange = null;
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.close();
      } catch {
        // Ignore peer cleanup errors.
      }
    }

    peerConnectionsRef.current.delete(remoteUserId);
    pendingIceCandidatesRef.current.delete(remoteUserId);
    offeredPeerIdsRef.current.delete(remoteUserId);
    removeRemoteStreamForUser(remoteUserId);
  }, [removeRemoteStreamForUser]);

  const cleanupAllPeers = useCallback(() => {
    Array.from(peerConnectionsRef.current.keys()).forEach((remoteUserId) => {
      cleanupPeerConnection(remoteUserId);
    });
  }, [cleanupPeerConnection]);

  const releaseLocalMedia = useCallback(() => {
    stopMediaStream(localStreamRef.current);
    localStreamRef.current = null;
    setLocalStreamURL(null);
    setMediaReady(false);
  }, []);

  const leaveCallRoom = useCallback(() => {
    if (!callSessionId || !joinedCallRoomRef.current) {
      return;
    }

    socket.emit("call:leave", { callSessionId });
    joinedCallRoomRef.current = false;
  }, [callSessionId]);

  const attachLocalTracksToPeer = useCallback((peerConnection: any) => {
    const localStream = localStreamRef.current;
    if (!peerConnection || !localStream || typeof localStream.getTracks !== "function") {
      return;
    }

    const senders = typeof peerConnection.getSenders === "function" ? peerConnection.getSenders() : [];
    localStream.getTracks().forEach((track: any) => {
      const alreadyAttached = Array.isArray(senders)
        && senders.some((sender: any) => String(sender?.track?.id || "") === String(track?.id || ""));

      if (!alreadyAttached) {
        peerConnection.addTrack(track, localStream);
      }
    });
  }, []);

  const flushPendingIceCandidates = useCallback(async (remoteUserId: string, peerConnection: any) => {
    const queuedCandidates = pendingIceCandidatesRef.current.get(remoteUserId) || [];
    if (!queuedCandidates.length || !peerConnection?.remoteDescription?.type) {
      return;
    }

    pendingIceCandidatesRef.current.delete(remoteUserId);

    for (const candidate of queuedCandidates) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.log("call pending ICE candidate apply error", error);
      }
    }
  }, []);

  const ensurePeerConnection = useCallback((remoteUserId: string) => {
    const existingPeerConnection = peerConnectionsRef.current.get(remoteUserId);
    if (existingPeerConnection) {
      attachLocalTracksToPeer(existingPeerConnection);
      return {
        peerConnection: existingPeerConnection,
        created: false,
      };
    }

    const peerConnection: any = new RTCPeerConnection({
      iceServers: normalizedIceServerConfig,
    });

    attachLocalTracksToPeer(peerConnection);

    peerConnection.onicecandidate = (event: any) => {
      if (!event?.candidate) {
        return;
      }

      socket.emit("call:ice-candidate", {
        callSessionId,
        targetUserId: remoteUserId,
        candidate: typeof event.candidate.toJSON === "function" ? event.candidate.toJSON() : event.candidate,
      });
    };

    peerConnection.ontrack = (event: any) => {
      const [remoteStream] = Array.isArray(event?.streams) ? event.streams : [];
      if (remoteStream) {
        remoteStream.getAudioTracks?.().forEach((track: any) => {
          track.enabled = true;
        });
        activateCommunicationAudio(speakerEnabledRef.current).catch((error) => {
          console.log("call remote audio route error", error);
        });
        setRemoteStreamForUser(remoteUserId, remoteStream);
      }
    };

    peerConnection.onconnectionstatechange = () => {
      const connectionState = String(peerConnection.connectionState || "").trim();
      console.log("[WebRTC] Peer state changed", {
        callSessionId,
        remoteUserId,
        connectionState,
      });

      if (connectionState === "failed" || connectionState === "closed") {
        cleanupPeerConnection(remoteUserId);
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      const iceConnectionState = String(peerConnection.iceConnectionState || "").trim();
      if (iceConnectionState === "failed" || iceConnectionState === "closed") {
        cleanupPeerConnection(remoteUserId);
      }
    };

    peerConnectionsRef.current.set(remoteUserId, peerConnection);
    return {
      peerConnection,
      created: true,
    };
  }, [
    attachLocalTracksToPeer,
    callSessionId,
    cleanupPeerConnection,
    normalizedIceServerConfig,
    setRemoteStreamForUser,
  ]);

  const createAndSendOffer = useCallback(async (remoteUserId: string) => {
    if (!callSessionId || !remoteUserId || offeredPeerIdsRef.current.has(remoteUserId)) {
      return;
    }

    const { peerConnection } = ensurePeerConnection(remoteUserId);
    if (String(peerConnection?.signalingState || "") !== "stable") {
      return;
    }

    offeredPeerIdsRef.current.add(remoteUserId);

    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: effectiveCallType === "video",
      } as any);

      await peerConnection.setLocalDescription(offer);

      socket.emit("call:offer", {
        callSessionId,
        targetUserId: remoteUserId,
        description: {
          type: offer.type,
          sdp: offer.sdp,
        },
      });
    } catch (error) {
      offeredPeerIdsRef.current.delete(remoteUserId);
      console.log("call offer create error", error);
      throw error;
    }
  }, [callSessionId, effectiveCallType, ensurePeerConnection]);

  const ensureLocalMedia = useCallback(async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    const hasMicrophonePermission = await ensureMicrophonePermission(
      "Allow Aline2 to use your microphone for calls."
    );
    if (!hasMicrophonePermission) {
      throw new Error("Microphone permission is required for calling.");
    }

    if (effectiveCallType === "video") {
      const hasCameraPermission = await ensureCameraPermission(
        "Allow Aline2 to use your camera for video calls."
      );
      if (!hasCameraPermission) {
        throw new Error("Camera permission is required for video calls.");
      }
    }

    const stream = await mediaDevices.getUserMedia(buildMediaConstraints(effectiveCallType, cameraFacingMode));
    localStreamRef.current = stream;
    setLocalStreamURL(typeof stream?.toURL === "function" ? stream.toURL() : null);
    setMediaReady(true);

    stream.getAudioTracks().forEach((track: any) => {
      track.enabled = microphoneEnabled;
    });

    stream.getVideoTracks().forEach((track: any) => {
      track.enabled = cameraEnabled;
    });

    return stream;
  }, [cameraEnabled, cameraFacingMode, effectiveCallType, microphoneEnabled]);

  const syncPeerGraph = useCallback(async () => {
    if (!shouldEnterMediaRoom || !callSessionId || !currentUserId || !joinedCallRoomRef.current || !localStreamRef.current) {
      return;
    }

    for (const remoteUserId of joinedRemoteParticipantIds) {
      const { created, peerConnection } = ensurePeerConnection(remoteUserId);
      attachLocalTracksToPeer(peerConnection);

      if (created && shouldInitiateOffer(currentUserId, remoteUserId)) {
        await createAndSendOffer(remoteUserId);
      }
    }

    Array.from(peerConnectionsRef.current.keys()).forEach((remoteUserId) => {
      if (!joinedRemoteParticipantIds.includes(remoteUserId)) {
        cleanupPeerConnection(remoteUserId);
      }
    });
  }, [
    attachLocalTracksToPeer,
    callSessionId,
    cleanupPeerConnection,
    createAndSendOffer,
    currentUserId,
    ensurePeerConnection,
    joinedRemoteParticipantIds,
    shouldEnterMediaRoom,
  ]);

  useEffect(() => {
    let active = true;

    getStoredUser()
      .then((user) => {
        if (active) {
          setCurrentUser(user || null);
        }
      })
      .catch((error) => {
        console.log("call screen current user load error", error);
      });

    return () => {
      active = false;
    };
  }, []);

  const fetchCallSessionState = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!callSessionId) {
        return;
      }

      try {
        if (!options.silent) {
          setLoading(true);
        }

        const data = await getCallSession(callSessionId);
        setCallSession(data.callSession || null);
        if (data.callRuntime) {
          setCallRuntime(data.callRuntime);
        }
        if (Array.isArray(data.iceServers)) {
          setIceServers(data.iceServers);
        }
      } catch (error) {
        if (!options.silent) {
          Alert.alert("Call unavailable", getReadableApiErrorMessage(error, "This call could not be loaded."));
          navigation.goBack();
        } else {
          console.log("call session poll error", error);
        }
      } finally {
        if (!options.silent) {
          setLoading(false);
        }
      }
    },
    [callSessionId, navigation]
  );

  const applyTerminalState = useCallback(
    (nextCallSession: any) => {
      setCallSession(nextCallSession);

      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }

      leaveCallRoom();
      cleanupAllPeers();
      releaseLocalMedia();

      if (closingRef.current) {
        return;
      }

      closingRef.current = true;
      setTimeout(() => {
        navigation.goBack();
      }, 900);
    },
    [cleanupAllPeers, leaveCallRoom, navigation, releaseLocalMedia]
  );

  useEffect(() => {
    connectSocket().catch((error) => {
      console.log("call screen socket connect error", error);
    });
  }, []);

  useEffect(() => {
    if (!callSessionId) {
      Alert.alert("Call unavailable", "Missing call session.");
      navigation.goBack();
      return;
    }

    fetchCallSessionState().catch(() => {});
  }, [callSessionId, fetchCallSessionState, navigation]);

  useEffect(() => {
    const shouldPoll =
      !closingRef.current &&
      (
        String(callSession?.status || "") === "ringing" ||
        (isGroupCall && String(callSession?.currentParticipantState?.status || "") === "invited")
      );

    if (!shouldPoll) {
      return undefined;
    }

    const pollInterval = setInterval(() => {
      fetchCallSessionState({ silent: true }).catch(() => {});
    }, Math.max(3000, Math.min(Number(callRuntime?.ringingTimeoutMs || 5000) / 3, 5000)));

    return () => clearInterval(pollInterval);
  }, [callRuntime?.ringingTimeoutMs, callSession, fetchCallSessionState, isGroupCall]);

  useEffect(() => {
    if (!callSession || !TERMINAL_STATUSES.has(String(callSession.status || ""))) {
      return;
    }

    applyTerminalState(callSession);
  }, [applyTerminalState, callSession]);

  useEffect(() => {
    const handleCallStatus = (payload: any) => {
      const nextCallSession = payload?.callSession;
      if (!nextCallSession || String(nextCallSession._id || "") !== String(callSessionId || "")) {
        return;
      }

      if (payload?.callRuntime) {
        setCallRuntime(payload.callRuntime);
      }

      if (Array.isArray(payload?.iceServers)) {
        setIceServers(payload.iceServers);
      }

      setCallSession(nextCallSession);

      if (TERMINAL_STATUSES.has(String(nextCallSession.status || ""))) {
        applyTerminalState(nextCallSession);
      }
    };

    socket.on("call:status", handleCallStatus);

    return () => {
      socket.off("call:status", handleCallStatus);
    };
  }, [applyTerminalState, callSessionId]);

  useEffect(() => {
    if (String(callSession?.status || "") !== "ongoing") {
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
      cleanupAllPeers();
      releaseLocalMedia();
      leaveCallRoom();

      const reason = mode === "incoming" && String(callSession?.status || "") === "ringing" ? "declined" : "hangup";

      endCallSession(callSessionId, reason)
        .catch(() => {})
        .finally(() => {
          closingRef.current = true;
          navigation.dispatch(event.data.action);
        });
    });

    return unsubscribe;
  }, [callSession?.status, callSessionId, cleanupAllPeers, hasActiveCall, leaveCallRoom, mode, navigation, releaseLocalMedia]);

  useEffect(() => () => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }

    stopCallRingtone().catch(() => {});
    resetCallAudioRoute().catch(() => {});
    ringtoneActiveRef.current = false;
    leaveCallRoom();
    cleanupAllPeers();
    releaseLocalMedia();
  }, [cleanupAllPeers, leaveCallRoom, releaseLocalMedia]);

  useEffect(() => {
    let active = true;

    const syncRingtone = async () => {
      if (shouldPlayRingtone) {
        if (!ringtoneActiveRef.current) {
          const didStart = await startCallRingtone();
          if (active) {
            ringtoneActiveRef.current = didStart;
          }
        }

        return;
      }

      if (ringtoneActiveRef.current) {
        await stopCallRingtone();
        if (active) {
          ringtoneActiveRef.current = false;
        }
      }
    };

    syncRingtone().catch((error) => {
      console.log("call ringtone sync error", error);
    });

    return () => {
      active = false;
    };
  }, [shouldPlayRingtone]);

  useEffect(() => {
    const localStream = localStreamRef.current;
    if (!localStream || typeof localStream.getAudioTracks !== "function") {
      return;
    }

    localStream.getAudioTracks().forEach((track: any) => {
      track.enabled = microphoneEnabled;
    });
  }, [microphoneEnabled]);

  useEffect(() => {
    const localStream = localStreamRef.current;
    if (!localStream || typeof localStream.getVideoTracks !== "function") {
      return;
    }

    localStream.getVideoTracks().forEach((track: any) => {
      track.enabled = cameraEnabled;
    });
  }, [cameraEnabled]);

  useEffect(() => {
    if (effectiveCallType !== "video") {
      return;
    }

    const localVideoTrack = localStreamRef.current?.getVideoTracks?.()?.[0];
    if (!localVideoTrack) {
      return;
    }

    if (!arFiltersSupported) {
      return;
    }

    applyArFilterPresetToTrack(localVideoTrack, arFilterPreset).catch((error) => {
      console.log("call ar filter sync error", error);
    });
  }, [arFilterPreset, arFiltersSupported, effectiveCallType, localStreamURL]);

  useEffect(() => {
    let active = true;

    const syncAudioRoute = async () => {
      if (!shouldEnterMediaRoom) {
        await resetCallAudioRoute();
        return;
      }

      const didApply =
        (await activateCommunicationAudio(speakerEnabled))
        || (await setCallSpeakerEnabled(speakerEnabled));
      if (active && !didApply) {
        console.log("call speaker route unavailable");
      }
    };

    syncAudioRoute().catch((error) => {
      console.log("call speaker sync error", error);
    });

    return () => {
      active = false;
    };
  }, [shouldEnterMediaRoom, speakerEnabled]);

  useEffect(() => {
    let cancelled = false;

    if (!shouldEnterMediaRoom || !callSessionId || !currentUserId) {
      return undefined;
    }

    const bootstrapMedia = async () => {
      try {
        await connectSocket();
        if (cancelled) {
          return;
        }

        await ensureLocalMedia();
        if (cancelled) {
          return;
        }

        if (!joinedCallRoomRef.current) {
          socket.emit("call:join", { callSessionId });
          joinedCallRoomRef.current = true;
        }

        await syncPeerGraph();
      } catch (error) {
        console.log("call media bootstrap error", error);

        if (!cancelled) {
          Alert.alert("Could not start call", getReadableApiErrorMessage(error, "Please check permissions and try again."));
          closingRef.current = true;
          navigation.goBack();
        }
      }
    };

    bootstrapMedia().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [callSessionId, currentUserId, ensureLocalMedia, navigation, shouldEnterMediaRoom, syncPeerGraph]);

  useEffect(() => {
    if (!shouldEnterMediaRoom || !mediaReady || !joinedCallRoomRef.current) {
      return;
    }

    syncPeerGraph().catch((error) => {
      console.log("call peer graph sync error", error);
    });
  }, [joinedRemoteParticipantIds, mediaReady, shouldEnterMediaRoom, syncPeerGraph]);

  useEffect(() => {
    const handleParticipantJoined = (payload: any) => {
      if (String(payload?.callSessionId || "") !== String(callSessionId || "")) {
        return;
      }

      syncPeerGraph().catch((error) => {
        console.log("participant-joined sync error", error);
      });
    };

    const handleParticipantLeft = (payload: any) => {
      if (String(payload?.callSessionId || "") !== String(callSessionId || "")) {
        return;
      }

      const remoteUserId = String(payload?.userId || "").trim();
      if (!remoteUserId || remoteUserId === currentUserId) {
        return;
      }

      cleanupPeerConnection(remoteUserId);
    };

    const handleOffer = async (payload: any) => {
      if (String(payload?.callSessionId || "") !== String(callSessionId || "")) {
        return;
      }

      const remoteUserId = String(payload?.fromUserId || "").trim();
      const description = payload?.description;
      if (!remoteUserId || !description?.type || !description?.sdp) {
        return;
      }

      await ensureLocalMedia();
      const { peerConnection } = ensurePeerConnection(remoteUserId);

      await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
      await flushPendingIceCandidates(remoteUserId, peerConnection);

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socket.emit("call:answer", {
        callSessionId,
        targetUserId: remoteUserId,
        description: {
          type: answer.type,
          sdp: answer.sdp,
        },
      });
    };

    const handleAnswer = async (payload: any) => {
      if (String(payload?.callSessionId || "") !== String(callSessionId || "")) {
        return;
      }

      const remoteUserId = String(payload?.fromUserId || "").trim();
      const description = payload?.description;
      if (!remoteUserId || !description?.type || !description?.sdp) {
        return;
      }

      const peerConnection = peerConnectionsRef.current.get(remoteUserId);
      if (!peerConnection) {
        return;
      }

      await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
      await flushPendingIceCandidates(remoteUserId, peerConnection);
    };

    const handleIceCandidate = async (payload: any) => {
      if (String(payload?.callSessionId || "") !== String(callSessionId || "")) {
        return;
      }

      const remoteUserId = String(payload?.fromUserId || "").trim();
      const candidate = payload?.candidate;
      if (!remoteUserId || !candidate) {
        return;
      }

      const { peerConnection } = ensurePeerConnection(remoteUserId);

      if (peerConnection?.remoteDescription?.type) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        return;
      }

      const queuedCandidates = pendingIceCandidatesRef.current.get(remoteUserId) || [];
      queuedCandidates.push(candidate);
      pendingIceCandidatesRef.current.set(remoteUserId, queuedCandidates);
    };

    socket.on("call:participant-joined", handleParticipantJoined);
    socket.on("call:participant-left", handleParticipantLeft);
    socket.on("call:offer", handleOffer);
    socket.on("call:answer", handleAnswer);
    socket.on("call:ice-candidate", handleIceCandidate);

    return () => {
      socket.off("call:participant-joined", handleParticipantJoined);
      socket.off("call:participant-left", handleParticipantLeft);
      socket.off("call:offer", handleOffer);
      socket.off("call:answer", handleAnswer);
      socket.off("call:ice-candidate", handleIceCandidate);
    };
  }, [
    callSessionId,
    cleanupPeerConnection,
    currentUserId,
    ensureLocalMedia,
    ensurePeerConnection,
    flushPendingIceCandidates,
    syncPeerGraph,
  ]);

  const handleAnswer = async () => {
    if (answering || answeredRef.current) {
      return;
    }

    try {
      setAnswering(true);
      await stopCallRingtone().catch(() => {});
      ringtoneActiveRef.current = false;
      const response = await answerCallSession(callSessionId);
      answeredRef.current = true;
      setCallSession(response.callSession || null);
      if (response.callRuntime) {
        setCallRuntime(response.callRuntime);
      }
      if (Array.isArray(response.iceServers)) {
        setIceServers(response.iceServers);
      }
    } catch (error) {
      Alert.alert("Could not answer call", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setAnswering(false);
    }
  };

  const handleReject = async () => {
    try {
      setEnding(true);
      await stopCallRingtone().catch(() => {});
      ringtoneActiveRef.current = false;
      await rejectCallSession(callSessionId, "declined");
      leaveCallRoom();
      closingRef.current = true;
      navigation.goBack();
    } catch (error) {
      setEnding(false);
      Alert.alert("Could not decline call", getReadableApiErrorMessage(error, "Please try again."));
    }
  };

  const handleHangUp = useCallback(async () => {
    try {
      setEnding(true);
      await stopCallRingtone().catch(() => {});
      ringtoneActiveRef.current = false;
      cleanupAllPeers();
      releaseLocalMedia();
      leaveCallRoom();
      await endCallSession(callSessionId, "hangup");
      closingRef.current = true;
      navigation.goBack();
    } catch (error) {
      setEnding(false);
      Alert.alert("Could not end call", getReadableApiErrorMessage(error, "Please try again."));
    }
  }, [callSessionId, cleanupAllPeers, leaveCallRoom, navigation, releaseLocalMedia]);

  const toggleMicrophone = useCallback(() => {
    setMicrophoneEnabled((prev) => !prev);
  }, []);

  const toggleCamera = useCallback(() => {
    if (effectiveCallType !== "video") {
      return;
    }

    setCameraEnabled((prev) => !prev);
  }, [effectiveCallType]);

  const switchCameraFacing = useCallback(() => {
    if (effectiveCallType !== "video") {
      return;
    }

    const localVideoTrack = localStreamRef.current?.getVideoTracks?.()?.[0];
    if (!localVideoTrack || typeof (localVideoTrack as any)?._switchCamera !== "function") {
      Alert.alert("Camera switch unavailable", "This device could not switch cameras during the call.");
      return;
    }

    try {
      (localVideoTrack as any)._switchCamera();
      setCameraFacingMode((current) => (current === "user" ? "environment" : "user"));

      if (arFiltersSupported) {
        applyArFilterPresetToTrack(localVideoTrack, arFilterPreset).catch((error) => {
          console.log("call ar filter resync after camera switch error", error);
        });
      }
    } catch (error) {
      console.log("call switch camera error", error);
      Alert.alert("Camera switch unavailable", "The camera could not be switched right now.");
    }
  }, [arFilterPreset, arFiltersSupported, effectiveCallType]);

  const toggleSpeaker = useCallback(() => {
    setSpeakerEnabledState((prev) => !prev);
  }, []);

  const cycleArFilter = useCallback(() => {
    if (!arFiltersSupported) {
      return;
    }

    setArFilterPreset((current) => {
      const currentIndex = AR_FILTER_PRESET_ORDER.indexOf(current);
      return AR_FILTER_PRESET_ORDER[(currentIndex + 1) % AR_FILTER_PRESET_ORDER.length] || "none";
    });
  }, [arFiltersSupported]);

  const renderParticipantPlaceholder = useCallback(
    (_name: string, avatarSource: string, _subtitle: string) => (
      <View style={styles.placeholderStage}>
        <View style={[styles.avatarRing, { borderColor: colors.primary }]}>
          <Image source={{ uri: avatarSource || DEFAULT_AVATAR_URL }} style={styles.avatar} />
        </View>
      </View>
    ),
    [colors.primary]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#fff" />
      </SafeAreaView>
    );
  }

  const showIncomingActions = isIncomingCallScreen && isIncomingInviteState;
  const statusLabel = buildStatusLabel(callSession, mode, isGroupCall);
  const overlayDisplayName =
    isGroupCall && shouldEnterMediaRoom
      ? `${Math.max(remoteParticipantTiles.length + (localStreamURL ? 1 : 0), 1)} in call`
      : displayName;
  const warningText = Array.isArray(callRuntime?.warnings) ? callRuntime.warnings.join(" ") : "";
  const combinedWarningText = [
    warningText,
    effectiveCallType === "video" && !arFiltersSupported ? "AR filters are unavailable on this device." : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? "#050816" : "#0f172a" }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      <View style={[styles.header, { paddingTop: Math.max(insets.top, 18) }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {shouldEnterMediaRoom ? (
        <View style={styles.webrtcStage}>
          {effectiveCallType === "audio"
            ? remoteParticipantTiles.map((entry) => (
                <RTCView
                  key={`remote-audio-${entry.userId}`}
                  streamURL={entry.streamURL}
                  style={styles.remoteAudioSink}
                  objectFit="cover"
                />
              ))
            : null}

          {effectiveCallType === "video" ? (
            isGroupCall ? (
              <View style={styles.groupVideoGrid}>
                {remoteParticipantTiles.length ? (
                  remoteParticipantTiles.map((entry) => (
                    <View key={entry.userId} style={styles.groupVideoTile}>
                      <RTCView streamURL={entry.streamURL} style={styles.groupVideoStream} objectFit="cover" />
                      <View style={styles.groupVideoLabel}>
                        <Text style={styles.groupVideoName}>{entry.name}</Text>
                      </View>
                    </View>
                  ))
                ) : (
                  renderParticipantPlaceholder(displayName, displayAvatar, mediaReady ? "Waiting for others to join..." : "Connecting video...")
                )}

                {localStreamURL ? (
                  <View style={styles.groupVideoTile}>
                    <RTCView streamURL={localStreamURL} style={styles.groupVideoStream} objectFit="cover" mirror={cameraFacingMode === "user"} />
                    <View style={styles.groupVideoLabel}>
                      <Text style={styles.groupVideoName}>You</Text>
                    </View>
                  </View>
                ) : null}
              </View>
            ) : remotePrimaryTile?.streamURL ? (
              <>
                <RTCView streamURL={remotePrimaryTile.streamURL} style={styles.remoteVideo} objectFit="cover" />
                {localStreamURL ? (
                  <View style={styles.localVideoWrap}>
                    <RTCView streamURL={localStreamURL} style={styles.localVideo} objectFit="cover" mirror={cameraFacingMode === "user"} />
                  </View>
                ) : null}
              </>
            ) : (
              renderParticipantPlaceholder(displayName, displayAvatar, mediaReady ? "Waiting for video..." : "Connecting video...")
            )
          ) : (
            renderParticipantPlaceholder(
              displayName,
              displayAvatar,
              mediaReady
                ? `${remoteParticipantTiles.length || joinedRemoteParticipantIds.length} participant${(remoteParticipantTiles.length || joinedRemoteParticipantIds.length) === 1 ? "" : "s"} connected`
                : "Connecting audio..."
            )
          )}

          <View style={styles.overlay}>
            {effectiveCallType === "video" && arFilterPreset !== "none" ? (
              <View style={styles.filterPill}>
                <Text style={styles.filterPillText}>{AR_FILTER_LABELS[arFilterPreset]}</Text>
              </View>
            ) : null}
            <Text style={styles.name}>{overlayDisplayName}</Text>
            <Text style={styles.statusLabel}>
              {String(callSession?.status || "") === "ongoing" ? formatDuration(durationSeconds) : statusLabel}
            </Text>

            {combinedWarningText ? <Text style={styles.warningText}>{combinedWarningText}</Text> : null}

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.callButton, microphoneEnabled ? styles.secondaryButton : styles.disabledButton]}
                onPress={toggleMicrophone}
              >
                <Icon name={microphoneEnabled ? "mic" : "mic-off"} size={22} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.callButton, speakerEnabled ? styles.secondaryButton : styles.disabledButton]}
                onPress={toggleSpeaker}
              >
                <Icon name={speakerEnabled ? "volume-high" : "volume-medium"} size={22} color="#fff" />
              </TouchableOpacity>

              {effectiveCallType === "video" ? (
                <TouchableOpacity
                  style={[styles.callButton, cameraEnabled ? styles.secondaryButton : styles.disabledButton]}
                  onPress={toggleCamera}
                >
                  <Icon name={cameraEnabled ? "videocam" : "videocam-off"} size={22} color="#fff" />
                </TouchableOpacity>
              ) : null}

              {effectiveCallType === "video" ? (
                <TouchableOpacity
                  style={[styles.callButton, styles.secondaryButton, !arFiltersSupported && styles.disabledButton]}
                  onPress={switchCameraFacing}
                >
                  <Icon name="camera-reverse-outline" size={22} color="#fff" />
                </TouchableOpacity>
              ) : null}

              {effectiveCallType === "video" ? (
                <TouchableOpacity
                  style={[styles.callButton, arFiltersSupported ? styles.secondaryButton : styles.disabledButton]}
                  onPress={cycleArFilter}
                  disabled={!arFiltersSupported}
                >
                  <Icon name="color-filter-outline" size={22} color="#fff" />
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
        </View>
      ) : (
        <>
          <View style={styles.avatarStage}>
            <View style={[styles.avatarRing, { borderColor: colors.primary }]}>
              <Image source={{ uri: displayAvatar }} style={styles.avatar} />
            </View>
          </View>

          <View style={styles.overlay}>
            <Text style={styles.name}>{overlayDisplayName}</Text>
            <Text style={styles.statusLabel}>
              {String(callSession?.status || "") === "ongoing"
                ? formatDuration(durationSeconds)
                : statusLabel}
            </Text>

            {warningText ? <Text style={styles.warningText}>{warningText}</Text> : null}

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
                  {answering ? <ActivityIndicator color="#fff" /> : <Icon name={isGroupCall ? "people" : "call"} size={24} color="#fff" />}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.callButton, speakerEnabled ? styles.secondaryButton : styles.disabledButton]}
                  onPress={toggleSpeaker}
                >
                  <Icon name={speakerEnabled ? "volume-high" : "volume-medium"} size={22} color="#fff" />
                </TouchableOpacity>
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
        </>
      )}
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
  webrtcStage: {
    flex: 1,
    backgroundColor: "#020617",
  },
  remoteAudioSink: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  header: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 5,
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
  avatarStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  placeholderStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
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
  remoteVideo: {
    flex: 1,
    backgroundColor: "#000",
  },
  localVideoWrap: {
    position: "absolute",
    top: 96,
    right: 14,
    width: 110,
    height: 160,
    borderRadius: 0,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 0,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
  },
  localVideo: {
    width: "100%",
    height: "100%",
    borderRadius: 0,
    backgroundColor: "#000",
  },
  groupVideoGrid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    paddingTop: 92,
    paddingHorizontal: 12,
    paddingBottom: 156,
    backgroundColor: "#000",
  },
  groupVideoTile: {
    width: "50%",
    height: "50%",
    padding: 6,
  },
  groupVideoStream: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  groupVideoLabel: {
    position: "absolute",
    left: 16,
    bottom: 18,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(2,6,23,0.66)",
  },
  groupVideoName: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingBottom: 28,
    alignItems: "center",
  },
  filterPill: {
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.72)",
  },
  filterPillText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  name: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
  },
  statusLabel: {
    color: "rgba(255,255,255,0.86)",
    marginTop: 10,
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
  },
  warningText: {
    color: "#facc15",
    marginTop: 12,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  actionRow: {
    marginTop: 28,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    maxWidth: 360,
    paddingHorizontal: 12,
  },
  callButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectButton: {
    backgroundColor: "#ef4444",
  },
  acceptButton: {
    backgroundColor: "#22c55e",
  },
  endButton: {
    backgroundColor: "#ef4444",
  },
  secondaryButton: {
    backgroundColor: "rgba(30,41,59,0.92)",
  },
  disabledButton: {
    backgroundColor: "rgba(71,85,105,0.92)",
  },
  endIcon: {
    transform: [{ rotate: "135deg" }],
  },
});
