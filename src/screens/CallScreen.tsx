import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  PermissionsAndroid,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
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
  const [callRuntime, setCallRuntime] = useState<any>(route.params?.callRuntime || null);
  const [loading, setLoading] = useState(!initialCallSession);
  const [answering, setAnswering] = useState(false);
  const [ending, setEnding] = useState(false);
  const [localStream, setLocalStream] = useState<any>(null);
  const [directRemoteStream, setDirectRemoteStream] = useState<any>(null);
  const [groupRemoteStreams, setGroupRemoteStreams] = useState<Record<string, any>>({});
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(
    String(initialCallSession?.callType || route.params?.callType || "audio") === "video"
  );
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [statusLabel, setStatusLabel] = useState("");

  const directPeerConnectionRef = useRef<any>(null);
  const groupPeerConnectionsRef = useRef<Record<string, any>>({});
  const localStreamRef = useRef<any>(null);
  const directRemoteStreamRef = useRef<any>(null);
  const groupRemoteStreamsRef = useRef<Record<string, any>>({});
  const directOfferStartedRef = useRef(false);
  const joinSentRef = useRef(false);
  const closingRef = useRef(false);
  const answeredRef = useRef(false);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const effectiveCallType =
    String(callSession?.callType || route.params?.callType || "audio") === "video" ? "video" : "audio";
  const isGroupCall = String(callSession?.conversation?.conversationType || "") === "group";
  const participantStates = useMemo(
    () => (Array.isArray(callSession?.participantStates) ? callSession.participantStates : []),
    [callSession?.participantStates]
  );
  const currentParticipantState = callSession?.currentParticipantState || null;
  const currentUserId = String(currentParticipantState?.user?._id || currentParticipantState?.user || "");
  const conversationMeta = callSession?.conversation || {};
  const otherParticipant = useMemo(() => callSession?.otherParticipant || null, [callSession]);

  const joinedParticipantIds = useMemo(
    () =>
      participantStates
        .filter((entry: any) => String(entry?.status || "") === "joined")
        .map((entry: any) => String(entry?.user?._id || entry?.user || "")),
    [participantStates]
  );

  const groupMembers = useMemo(() => {
    const directParticipants = Array.isArray(callSession?.participants) ? callSession.participants : [];
    const stateUsers = participantStates
      .map((entry: any) => entry?.user)
      .filter(Boolean);
    const merged = [...directParticipants, ...stateUsers];
    const seen = new Set<string>();

    return merged.filter((participant: any) => {
      const participantId = String(participant?._id || participant || "");
      if (!participantId || seen.has(participantId)) {
        return false;
      }
      seen.add(participantId);
      return true;
    });
  }, [callSession, participantStates]);

  const remoteParticipants = useMemo(
    () =>
      groupMembers
        .filter((participant: any) => {
          const participantId = String(participant?._id || participant || "");
          return participantId && participantId !== currentUserId && joinedParticipantIds.includes(participantId);
        })
        .map((participant: any) => {
          const participantId = String(participant?._id || participant || "");
          const stream = groupRemoteStreams[participantId] || null;
          return {
            id: participantId,
            participant,
            stream,
            streamUrl: stream?.toURL?.() || null,
          };
        }),
    [currentUserId, groupMembers, groupRemoteStreams, joinedParticipantIds]
  );

  const displayName = isGroupCall
    ? conversationMeta?.groupName || title || "Group call"
    : otherParticipant?.name || otherParticipant?.username || title || "Aline2 call";
  const displayAvatar = isGroupCall
    ? conversationMeta?.groupAvatar || avatarUrl || DEFAULT_AVATAR_URL
    : otherParticipant?.profilePic || avatarUrl || DEFAULT_AVATAR_URL;
  const hasActiveCall = callSession && !TERMINAL_STATUSES.has(String(callSession.status || ""));

  const closeGroupPeerConnection = useCallback((remoteUserId: string) => {
    const peerConnection = groupPeerConnectionsRef.current[remoteUserId];

    if (peerConnection) {
      peerConnection.close();
      delete groupPeerConnectionsRef.current[remoteUserId];
    }

    const remoteStream = groupRemoteStreamsRef.current[remoteUserId];
    if (remoteStream) {
      remoteStream.getTracks?.().forEach((track: any) => track.stop?.());
      delete groupRemoteStreamsRef.current[remoteUserId];
      setGroupRemoteStreams((prev) => {
        const next = { ...prev };
        delete next[remoteUserId];
        return next;
      });
    }
  }, []);

  const cleanupMedia = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }

    if (directPeerConnectionRef.current) {
      directPeerConnectionRef.current.close();
      directPeerConnectionRef.current = null;
    }

    Object.keys(groupPeerConnectionsRef.current).forEach((userId) => {
      groupPeerConnectionsRef.current[userId]?.close();
      delete groupPeerConnectionsRef.current[userId];
    });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track: any) => track.stop());
      localStreamRef.current = null;
    }

    if (directRemoteStreamRef.current) {
      directRemoteStreamRef.current.getTracks().forEach((track: any) => track.stop?.());
      directRemoteStreamRef.current = null;
    }

    Object.values(groupRemoteStreamsRef.current).forEach((stream: any) => {
      stream?.getTracks?.().forEach((track: any) => track.stop?.());
    });
    groupRemoteStreamsRef.current = {};

    setLocalStream(null);
    setDirectRemoteStream(null);
    setGroupRemoteStreams({});
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
        if (Array.isArray(data.iceServers) && data.iceServers.length) {
          setIceServers(data.iceServers);
        }
        if (data.callRuntime) {
          setCallRuntime(data.callRuntime);
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

    if (directPeerConnectionRef.current) {
      stream.getTracks().forEach((track: any) => {
        directPeerConnectionRef.current.addTrack(track, stream);
      });
    }

    Object.values(groupPeerConnectionsRef.current).forEach((peerConnection: any) => {
      stream.getTracks().forEach((track: any) => {
        peerConnection.addTrack(track, stream);
      });
    });

    return stream;
  }, [effectiveCallType]);

  const ensureDirectPeerConnection = useCallback(async () => {
    if (directPeerConnectionRef.current) {
      return directPeerConnectionRef.current;
    }

    const peerConnection: any = new RTCPeerConnection({ iceServers });

    peerConnection.addEventListener("icecandidate", (event: any) => {
      if (!event?.candidate) {
        return;
      }

      socket.emit("call:ice-candidate", {
        callSessionId,
        candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
      });
    });

    peerConnection.addEventListener("track", (event: any) => {
      const nextStream = event?.streams?.[0];

      if (nextStream) {
        directRemoteStreamRef.current = nextStream;
        setDirectRemoteStream(nextStream);
        return;
      }

      if (!directRemoteStreamRef.current) {
        directRemoteStreamRef.current = new MediaStream();
      }

      if (event?.track) {
        directRemoteStreamRef.current.addTrack(event.track);
        setDirectRemoteStream(directRemoteStreamRef.current);
      }
    });

    peerConnection.addEventListener("connectionstatechange", () => {
      const connectionState = String(peerConnection.connectionState || "");

      if (connectionState === "connected") {
        setStatusLabel("Connected");
      } else if (connectionState === "failed") {
        setStatusLabel("Connection failed");
      } else if (connectionState === "disconnected") {
        setStatusLabel("Reconnecting...");
      }
    });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track: any) => {
        peerConnection.addTrack(track, localStreamRef.current);
      });
    }

    directPeerConnectionRef.current = peerConnection;
    return peerConnection;
  }, [callSessionId, iceServers]);

  const ensureGroupPeerConnection = useCallback(
    async (remoteUserId: string) => {
      if (groupPeerConnectionsRef.current[remoteUserId]) {
        return groupPeerConnectionsRef.current[remoteUserId];
      }

      const peerConnection: any = new RTCPeerConnection({ iceServers });

      peerConnection.addEventListener("icecandidate", (event: any) => {
        if (!event?.candidate) {
          return;
        }

        socket.emit("call:ice-candidate", {
          callSessionId,
          targetUserId: remoteUserId,
          candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
        });
      });

      peerConnection.addEventListener("track", (event: any) => {
        const nextStream = event?.streams?.[0];
        if (!nextStream) {
          return;
        }

        groupRemoteStreamsRef.current[remoteUserId] = nextStream;
        setGroupRemoteStreams((prev) => ({
          ...prev,
          [remoteUserId]: nextStream,
        }));
      });

      peerConnection.addEventListener("connectionstatechange", () => {
        const connectionState = String(peerConnection.connectionState || "");

        if (connectionState === "failed" || connectionState === "closed") {
          closeGroupPeerConnection(remoteUserId);
        }
      });

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track: any) => {
          peerConnection.addTrack(track, localStreamRef.current);
        });
      }

      groupPeerConnectionsRef.current[remoteUserId] = peerConnection;
      return peerConnection;
    },
    [callSessionId, closeGroupPeerConnection, iceServers]
  );

  const startDirectOffer = useCallback(async () => {
    if (directOfferStartedRef.current) {
      return;
    }

    directOfferStartedRef.current = true;

    try {
      await ensureLocalStream();
      const peerConnection = await ensureDirectPeerConnection();
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
      directOfferStartedRef.current = false;
      Alert.alert("Could not start call", getReadableApiErrorMessage(error, "Unable to initialize the call."));
    }
  }, [callSessionId, effectiveCallType, ensureDirectPeerConnection, ensureLocalStream]);

  const startGroupOffer = useCallback(
    async (remoteUserId: string) => {
      if (!remoteUserId || remoteUserId === currentUserId) {
        return;
      }

      try {
        await ensureLocalStream();
        const peerConnection = await ensureGroupPeerConnection(remoteUserId);
        const offer = await peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: effectiveCallType === "video",
        });
        await peerConnection.setLocalDescription(offer);

        socket.emit("call:offer", {
          callSessionId,
          targetUserId: remoteUserId,
          description: offer.toJSON ? offer.toJSON() : offer,
        });
      } catch (error) {
        console.log("group call offer error", error);
      }
    },
    [callSessionId, currentUserId, effectiveCallType, ensureGroupPeerConnection, ensureLocalStream]
  );

  const applyTerminalState = useCallback(
    (nextCallSession: any) => {
      setCallSession(nextCallSession);
      setStatusLabel(buildStatusLabel(nextCallSession, mode, isGroupCall));
      cleanupMedia();

      if (closingRef.current) {
        return;
      }

      closingRef.current = true;
      setTimeout(() => {
        navigation.goBack();
      }, 900);
    },
    [cleanupMedia, isGroupCall, mode, navigation]
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
    setStatusLabel(buildStatusLabel(callSession, mode, isGroupCall));
  }, [callSession, isGroupCall, mode]);

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
    const shouldJoinRoom =
      Boolean(callSessionId) &&
      (
        mode === "outgoing" ||
        (
          String(callSession?.status || "") === "ongoing" &&
          (!isGroupCall || String(callSession?.currentParticipantState?.status || "") === "joined")
        )
      );

    if (!shouldJoinRoom || joinSentRef.current) {
      return;
    }

    connectSocket()
      .then(() => {
        socket.emit("call:join", { callSessionId });
        joinSentRef.current = true;
      })
      .catch((error) => {
        console.log("call socket connect error", error);
      });
  }, [callSession?.currentParticipantState?.status, callSession?.status, callSessionId, isGroupCall, mode]);

  useEffect(() => {
    const handleCallStatus = (payload: any) => {
      const nextCallSession = payload?.callSession;
      if (!nextCallSession || String(nextCallSession._id || "") !== String(callSessionId || "")) {
        return;
      }

      if (Array.isArray(payload?.iceServers) && payload.iceServers.length) {
        setIceServers(payload.iceServers);
      }
      if (payload?.callRuntime) {
        setCallRuntime(payload.callRuntime);
      }

      setCallSession(nextCallSession);

      if (TERMINAL_STATUSES.has(String(nextCallSession.status || ""))) {
        applyTerminalState(nextCallSession);
        return;
      }

      if (!isGroupCall && String(nextCallSession.status) === "ongoing" && mode === "outgoing") {
        startDirectOffer().catch(() => {});
      }

      if (isGroupCall) {
        const joinedRemoteIds = (Array.isArray(nextCallSession?.participantStates) ? nextCallSession.participantStates : [])
          .filter((entry: any) => String(entry?.status || "") === "joined")
          .map((entry: any) => String(entry?.user?._id || entry?.user || ""))
          .filter((userId: string) => userId && userId !== currentUserId);

        Object.keys(groupPeerConnectionsRef.current).forEach((userId) => {
          if (!joinedRemoteIds.includes(userId)) {
            closeGroupPeerConnection(userId);
          }
        });
      }
    };

    const handleParticipantJoined = (payload: any) => {
      if (!isGroupCall || String(payload?.callSessionId || "") !== String(callSessionId || "")) {
        return;
      }

      const remoteUserId = String(payload?.userId || "");
      if (!remoteUserId || remoteUserId === currentUserId) {
        return;
      }

      if (String(callSession?.currentParticipantState?.status || "") !== "joined") {
        return;
      }

      startGroupOffer(remoteUserId).catch(() => {});
    };

    const handleOffer = async (payload: any) => {
      if (String(payload?.callSessionId || "") !== String(callSessionId || "")) {
        return;
      }

      try {
        await ensureLocalStream();

        if (isGroupCall && payload?.fromUserId) {
          const remoteUserId = String(payload.fromUserId);
          const peerConnection = await ensureGroupPeerConnection(remoteUserId);
          await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.description));
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);

          socket.emit("call:answer", {
            callSessionId,
            targetUserId: remoteUserId,
            description: answer.toJSON ? answer.toJSON() : answer,
          });
          return;
        }

        const peerConnection = await ensureDirectPeerConnection();
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
        if (isGroupCall && payload?.fromUserId) {
          const peerConnection = await ensureGroupPeerConnection(String(payload.fromUserId));
          await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.description));
          return;
        }

        const peerConnection = await ensureDirectPeerConnection();
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
        if (isGroupCall && payload?.fromUserId) {
          const peerConnection = await ensureGroupPeerConnection(String(payload.fromUserId));
          await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
          return;
        }

        const peerConnection = await ensureDirectPeerConnection();
        await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch (error) {
        console.log("call ice candidate error", error);
      }
    };

    socket.on("call:status", handleCallStatus);
    socket.on("call:participant-joined", handleParticipantJoined);
    socket.on("call:offer", handleOffer);
    socket.on("call:answer", handleAnswer);
    socket.on("call:ice-candidate", handleIceCandidate);

    return () => {
      socket.off("call:status", handleCallStatus);
      socket.off("call:participant-joined", handleParticipantJoined);
      socket.off("call:offer", handleOffer);
      socket.off("call:answer", handleAnswer);
      socket.off("call:ice-candidate", handleIceCandidate);
      cleanupMedia();
    };
  }, [
    applyTerminalState,
    callSession,
    callSessionId,
    cleanupMedia,
    closeGroupPeerConnection,
    currentUserId,
    ensureDirectPeerConnection,
    ensureGroupPeerConnection,
    ensureLocalStream,
    isGroupCall,
    mode,
    startDirectOffer,
    startGroupOffer,
  ]);

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

      const reason = mode === "incoming" && String(callSession?.status || "") === "ringing" ? "declined" : "hangup";

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
    const shouldWarmMedia =
      mode === "outgoing" ||
      (isGroupCall && String(callSession?.currentParticipantState?.status || "") === "joined");

    if (!shouldWarmMedia || !callSession || TERMINAL_STATUSES.has(String(callSession.status || ""))) {
      return;
    }

    ensureLocalStream().catch((error) => {
      Alert.alert("Could not access call media", getReadableApiErrorMessage(error, "Please check your device permissions."));
    });
  }, [callSession, ensureLocalStream, isGroupCall, mode]);

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
      if (response.callRuntime) {
        setCallRuntime(response.callRuntime);
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

  const showIncomingActions = isGroupCall
    ? mode === "incoming" && String(currentParticipantState?.status || "") === "invited" && String(callSession?.status || "") === "ongoing"
    : mode === "incoming" && String(callSession?.status || "") === "ringing";
  const showCallControls = isGroupCall
    ? String(currentParticipantState?.status || "") === "joined" && !TERMINAL_STATUSES.has(String(callSession?.status || ""))
    : String(callSession?.status || "") === "ongoing" || (mode === "outgoing" && String(callSession?.status || "") === "ringing");
  const localStreamUrl = localStream?.toURL?.() || null;
  const directRemoteStreamUrl = directRemoteStream?.toURL?.() || null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? "#050816" : "#0f172a" }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      <View style={[styles.header, { paddingTop: Math.max(insets.top, 18) }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {effectiveCallType === "video" ? (
        isGroupCall ? (
          remoteParticipants.length ? (
            <FlatList
              data={remoteParticipants}
              keyExtractor={(item) => item.id}
              numColumns={2}
              contentContainerStyle={styles.groupVideoGrid}
              renderItem={({ item }) => (
                <View style={styles.groupVideoTile}>
                  {item.streamUrl ? (
                    <RTCView streamURL={item.streamUrl} style={styles.groupVideo} objectFit="cover" />
                  ) : (
                    <View style={styles.groupVideoFallback}>
                      <Image
                        source={{ uri: item.participant?.profilePic || DEFAULT_AVATAR_URL }}
                        style={styles.groupVideoAvatar}
                      />
                    </View>
                  )}
                  <View style={styles.groupVideoLabel}>
                    <Text style={styles.groupVideoLabelText} numberOfLines={1}>
                      {item.participant?.name || item.participant?.username || "Participant"}
                    </Text>
                  </View>
                </View>
              )}
            />
          ) : (
            <View style={styles.avatarStage}>
              <View style={[styles.avatarRing, { borderColor: colors.primary }]}>
                <Image source={{ uri: displayAvatar }} style={styles.avatar} />
              </View>
            </View>
          )
        ) : directRemoteStreamUrl ? (
          <RTCView streamURL={directRemoteStreamUrl} style={styles.remoteVideo} objectFit="cover" />
        ) : (
          <View style={styles.avatarStage}>
            <View style={[styles.avatarRing, { borderColor: colors.primary }]}>
              <Image source={{ uri: displayAvatar }} style={styles.avatar} />
            </View>
          </View>
        )
      ) : (
        <View style={styles.avatarStage}>
          <View style={[styles.avatarRing, { borderColor: colors.primary }]}>
            <Image source={{ uri: displayAvatar }} style={styles.avatar} />
          </View>
          {isGroupCall && remoteParticipants.length ? (
            <View style={styles.groupJoinedWrap}>
              {remoteParticipants.map((item) => (
                <View key={item.id} style={styles.groupJoinedChip}>
                  <Text style={styles.groupJoinedChipText}>
                    {item.participant?.username || item.participant?.name || "Joined"}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      )}

      {effectiveCallType === "video" && localStreamUrl ? (
        <RTCView streamURL={localStreamUrl} style={styles.localPreview} objectFit="cover" mirror />
      ) : null}

      <View style={styles.overlay}>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.statusLabel}>
          {String(callSession?.status || "") === "ongoing" && (!isGroupCall || String(currentParticipantState?.status || "") === "joined")
            ? formatDuration(durationSeconds)
            : statusLabel}
        </Text>
        {isGroupCall ? (
          <Text style={styles.participantCount}>
            {joinedParticipantIds.length}/{Array.isArray(callSession?.participants) ? callSession.participants.length : 0} joined
          </Text>
        ) : null}

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
  localPreview: {
    position: "absolute",
    top: 110,
    right: 18,
    width: 112,
    height: 164,
    borderRadius: 20,
    overflow: "hidden",
    zIndex: 4,
    backgroundColor: "#111827",
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
  },
  participantCount: {
    marginTop: 8,
    color: "rgba(255,255,255,0.74)",
    fontSize: 13,
    fontWeight: "500",
  },
  actionRow: {
    marginTop: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  controlSection: {
    width: "100%",
    alignItems: "center",
  },
  callButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
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
  endIcon: {
    transform: [{ rotate: "135deg" }],
  },
  controlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  controlButtonActive: {
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  groupVideoGrid: {
    paddingTop: 110,
    paddingHorizontal: 12,
    paddingBottom: 220,
  },
  groupVideoTile: {
    flex: 1,
    minWidth: 0,
    height: 220,
    margin: 6,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#111827",
  },
  groupVideo: {
    flex: 1,
  },
  groupVideoFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
  },
  groupVideoAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  groupVideoLabel: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    backgroundColor: "rgba(15,23,42,0.6)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  groupVideoLabelText: {
    color: "#fff",
    fontWeight: "700",
  },
  groupJoinedWrap: {
    marginTop: 22,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  groupJoinedChip: {
    margin: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  groupJoinedChipText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 12,
  },
});
