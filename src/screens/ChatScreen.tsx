import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  Modal,
  StatusBar,
  ActivityIndicator,
  Linking,
  KeyboardAvoidingView,
  Platform
} from "react-native";
import { Alert } from "../utils/appAlert";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Swipeable } from "react-native-gesture-handler";
import Icon from "react-native-vector-icons/Ionicons";
import { launchCamera, launchImageLibrary } from "react-native-image-picker";
import {
  errorCodes,
  isErrorWithCode,
  keepLocalCopy,
  pick,
  types,
} from "@react-native-documents/picker";
import { API } from "../api/api";
import { connectSocket, socket } from "../socket";
import {
  buildCallEventMessage,
  getAttachmentDisplayName,
  getMessageAttachment,
  parseCallEventMessage,
  getMessageReply,
  getMessageSenderId,
  getMessageText,
  isAudioMessage,
  isDocumentMessage,
  isImageMessage,
  parseSharedContentMessage,
  isVideoMessage,
} from "../utils/chatPresentation";
import {
  createChatConversation,
  fetchChatConversationDetails,
  fetchConversationMessages,
  reactToChatMessage,
  sendChatMessage,
} from "../utils/chatApi";
import { startCallSession } from "../utils/callApi";
import { CHAT_THEME_LIST } from "../utils/chatThemes";
import {
  getLastIncomingUnseenMessage,
  mergeMessageReaction,
  mergeMessageSeen,
} from "../utils/chatRealtime";
import { getStoredUser } from "../utils/authSession";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { callingDisabledMessage, productFlags } from "../config/productFlags";
import { useAppTheme } from "../theme/AppThemeContext";
import VoiceRecorderButton from "../components/chat/VoiceRecorderButton";
import VoiceMessageBubble from "../components/chat/VoiceMessageBubble";
import MessageContextMenu from "../components/chat/MessageContextMenu";
import StickerPickerSheet from "../components/chat/StickerPickerSheet";
import AISupportSheet from "../components/chat/AISupportSheet";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { ensureCameraPermission, resolveCameraCaptureMediaType } from "../utils/permissions";
import { normalizeMediaFieldsDeep, normalizeMediaUrl } from "../utils/mediaUrls";

// ─── Constants ──────────────────────────────────────────────────────────────

const PRIMARY = "#7b3fe4";
const LOCATION_MESSAGE_LABEL = "Shared location:";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChatUser {
  _id?: string;
  id?: string;
  username?: string;
  name?: string;
  profilePic?: string;
  availabilityStatus?: boolean;
  isOnline?: boolean;
  lastSeenAt?: string;
}

interface ChatMessage {
  _id?: string;
  id?: string;
  clientMessageId?: string;
  clientId?: string;
  localId?: string;
  tempId?: string;
  optimisticId?: string;
  messageId?: string;
  text?: string;
  messageType?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
  sender?: string | { _id?: string; id?: string; username?: string; name?: string };
  isEdited?: boolean;
  editedAt?: string;
  isDeleted?: boolean;
  seenBy?: Array<{ userId?: string; seenAt?: string }>;
  reactions?: Array<{ emoji?: string; users?: string[] }>;
  createdAt?: string;
  replyToMessageId?: string;
  replyToMessage?: ChatMessage | null;
  replyTo?: ChatMessage | string | null;
  parentMessage?: ChatMessage | null;
  [key: string]: any;
}

interface LocationPayload {
  label: string;
  url: string;
}

interface GroupMeta {
  groupName: string;
  groupAvatar: string;
  memberCount: number;
}

interface PaginationState {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

interface ToolItem {
  id: string;
  name: string;
  icon: string;
  action: () => void;
}

interface MessageAttachment {
  url?: string;
  thumbnailUrl?: string;
  fileName?: string;
  fileSize?: number;
}

interface SubmitMessageParams {
  text?: string;
  file?: { uri: string; name: string; type: string };
  mediaUrl?: string;
  messageType?: string;
  duration?: number;
  replyToMessageId?: string;
  replyToMessage?: ChatMessage | null;
}

interface PendingAttachment {
  uri: string;
  name: string;
  type: string;
  kind: "image" | "video";
}

interface PendingVoiceNote {
  uri: string;
  name: string;
  type: string;
  duration: number;
}

interface MessagePreviewState {
  imageUrl: string;
  title?: string;
}

interface ReplyPreviewState {
  id: string;
  author: string;
  snippet: string;
  message: ChatMessage;
}

interface ConversationListingState {
  id: string;
  serviceName: string;
  sellerName?: string;
}

interface CallEventPreview {
  callType: "audio" | "video";
  direction: "incoming" | "outgoing";
  label: string;
  icon: string;
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

const buildLocationMessage = (query: string): string => {
  const cleanQuery = String(query || "").trim();
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanQuery)}`;
  return `${LOCATION_MESSAGE_LABEL} ${cleanQuery}\n${mapsUrl}`;
};

const parseLocationMessage = (text: string | undefined | null): LocationPayload | null => {
  if (typeof text !== "string" || !text.startsWith(LOCATION_MESSAGE_LABEL)) {
    return null;
  }

  const [labelLine, urlLine] = text.split("\n");
  const label = labelLine.replace(LOCATION_MESSAGE_LABEL, "").trim();
  const url = String(urlLine || "").trim();

  if (!label || !/^https?:\/\//.test(url)) {
    return null;
  }

  return { label, url };
};

const getDocumentPickerMessage = (error: any): string => {
  if (!isErrorWithCode(error)) {
    return "Document pick failed";
  }

  switch (error.code) {
    case errorCodes.OPERATION_CANCELED:
      return "";
    case errorCodes.IN_PROGRESS:
      return "The document picker is already open.";
    case errorCodes.NULL_PRESENTER:
      return "Could not open the document picker right now.";
    case errorCodes.UNABLE_TO_OPEN_FILE_TYPE:
      return "This device could not open the document picker.";
    default:
      return error.message || "Document pick failed";
  }
};

const messageRenderKeyCache = new WeakMap<object, string>();
let nextSyntheticMessageKey = 0;

const getMessageIdentity = (message: any): string => {
  if (!message || typeof message !== "object") {
    return "";
  }

  const identity =
    message?._id
    || message?.id
    || message?.clientMessageId
    || message?.clientId
    || message?.localId
    || message?.tempId
    || message?.optimisticId
    || message?.messageId;

  return identity ? String(identity) : "";
};

const getMessageRenderKey = (message: any): string => {
  const identity = getMessageIdentity(message);
  if (identity) {
    return identity;
  }

  if (!message || typeof message !== "object") {
    return "message:missing";
  }

  const cachedKey = messageRenderKeyCache.get(message);
  if (cachedKey) {
    return cachedKey;
  }

  const nextKey = `message:synthetic:${nextSyntheticMessageKey++}`;
  messageRenderKeyCache.set(message, nextKey);
  return nextKey;
};

const dedupeMessages = (items: any[]): any[] => {
  const seen = new Set<string>();

  return (Array.isArray(items) ? items : []).filter((item) => {
    const identity = getMessageIdentity(item);
    if (!identity) {
      return true;
    }

    if (seen.has(identity)) {
      return false;
    }

    seen.add(identity);
    return true;
  });
};

const getMessageTypeLabel = (message: ChatMessage | null | undefined): string => {
  if (!message) {
    return "Message";
  }

  const sharedContent = parseSharedContentMessage(message);
  if (sharedContent?.kind === "post") {
    return "Post";
  }

  if (String(message?.messageType || "") === "gif") {
    return "GIF";
  }

  if (isImageMessage(message)) {
    return "Photo";
  }

  if (isVideoMessage(message)) {
    return "Video";
  }

  if (isAudioMessage(message) || String(message?.messageType || "") === "voice") {
    return "Audio";
  }

  if (isDocumentMessage(message)) {
    return "Document";
  }

  if (parseLocationMessage(getMessageText(message))) {
    return "Location";
  }

  return "Message";
};

const buildCallEventPreview = (
  message: ChatMessage,
  currentUserId: string,
): CallEventPreview | null => {
  const callEvent = parseCallEventMessage(message);
  if (callEvent?.kind !== "call") {
    return null;
  }

  const direction = String(callEvent.callerId || "") === String(currentUserId || "") ? "outgoing" : "incoming";
  const isVideo = callEvent.callType === "video";
  const callLabel = isVideo ? "video call" : "voice call";
  const event = String(callEvent.event || "started");

  switch (event) {
    case "missed":
      return {
        callType: isVideo ? "video" : "audio",
        direction,
        label: direction === "incoming" ? `Missed ${callLabel}` : `${direction === "outgoing" ? "Unanswered" : "Missed"} ${callLabel}`,
        icon: isVideo ? "videocam-outline" : "call-outline",
      };
    case "ended":
      return {
        callType: isVideo ? "video" : "audio",
        direction,
        label: `${direction === "outgoing" ? "Outgoing" : "Incoming"} ${callLabel}`,
        icon: isVideo ? "videocam-outline" : "call-outline",
      };
    default:
      return {
        callType: isVideo ? "video" : "audio",
        direction,
        label: `${direction === "outgoing" ? "Outgoing" : "Incoming"} ${callLabel}`,
        icon: isVideo ? "videocam-outline" : "call-outline",
      };
  }
};

// ─── Component ──────────────────────────────────────────────────────────────

const ChatScreen = ({ navigation, route }: any) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { userId, conversationId, conversationType = "direct", serviceId, groupName, groupAvatar, memberCount } = route.params || {};
  const isGroupConversation = conversationType === "group";
  const [user, setUser] = useState<ChatUser | null>(null);
  const [text, setText] = useState("");
  const [showTools, setShowTools] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(conversationId || null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>({ nextCursor: null, hasMore: false, limit: 30 });
  const [chatTheme, setChatTheme] = useState("default");
  const [chatWallpaper, setChatWallpaper] = useState("");
  const [typingUserId, setTypingUserId] = useState("");
  const [isPeerOnline, setIsPeerOnline] = useState(false);
  const [showLocationComposer, setShowLocationComposer] = useState(false);
  const [locationDraft, setLocationDraft] = useState("");
  const [groupMeta, setGroupMeta] = useState<GroupMeta>({
    groupName: groupName || "Group chat",
    groupAvatar: groupAvatar || "",
    memberCount: Number(memberCount || 0),
  });
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Feature state: voice, stickers, message context menu
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [stickerPickerMode, setStickerPickerMode] = useState<"emoji" | "gifs" | "stickers">("emoji");
  const [contextMessage, setContextMessage] = useState<ChatMessage | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [pendingVoiceNote, setPendingVoiceNote] = useState<PendingVoiceNote | null>(null);
  const [messagePreview, setMessagePreview] = useState<MessagePreviewState | null>(null);
  const [replyingToMessage, setReplyingToMessage] = useState<ChatMessage | null>(null);
  const [showAssistant, setShowAssistant] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState("");
  const [conversationListing, setConversationListing] = useState<ConversationListingState | null>(null);
  const messageListRef = useRef<FlatList<ChatMessage> | null>(null);
  const messageInputRef = useRef<TextInput | null>(null);
  const replyHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFocusMessageIdRef = useRef("");

  useEffect(() => () => {
    if (replyHighlightTimeoutRef.current) {
      clearTimeout(replyHighlightTimeoutRef.current);
    }
  }, []);

  // ─── Data fetching ──────────────────────────────────────────────────────

  const fetchUser = useCallback(async () => {
    if (!userId) {
      setUser(null);
      return;
    }

    try {
      const res = await API.get(`/auth/user/${userId}`);
      const nextUser = res.data.user;
      setUser(nextUser);
      setIsPeerOnline(Boolean(nextUser?.isOnline ?? nextUser?.availabilityStatus));
    } catch (err: any) {
      console.log("User fetch error:", err?.response?.data || err);
    }
  }, [userId]);

  const mergeMessage = useCallback((nextMessage: any) => {
    const normalizedMessage = normalizeMediaFieldsDeep(nextMessage);

    setMessages((prev) => {
      const nextIdentity = getMessageIdentity(normalizedMessage);
      const exists = nextIdentity
        ? prev.some((item) => getMessageIdentity(item) === nextIdentity)
        : false;
      if (exists) {
        return prev;
      }
      return [...prev, normalizedMessage];
    });
  }, []);

  const applyMessageSeen = useCallback((payload: any) => {
    setMessages((prev) => mergeMessageSeen(prev, payload));
  }, []);

  const applyMessageReaction = useCallback((payload: any) => {
    setMessages((prev) => mergeMessageReaction(prev, payload));
  }, []);

  const fetchMessages = useCallback(async (
    targetConversationId: string | null = currentConversationId,
    options: { cursor?: string; limit?: number; append?: boolean } = {}
  ) => {
    if (!targetConversationId) {
      return;
    }

    try {
      const data = await fetchConversationMessages(targetConversationId, {
        cursor: options.cursor,
        limit: options.limit || 30,
      });
      const nextMessages = dedupeMessages(normalizeMediaFieldsDeep(data?.messages || []));
      setPagination(data?.pagination || { nextCursor: null, hasMore: false, limit: 30 });
      setMessages((prev) => (options.append ? dedupeMessages([...nextMessages, ...prev]) : nextMessages));
      setErrorMessage("");
    } catch (err: any) {
      console.log("Fetch messages error:", err?.response?.data || err);
      if (!options.append) {
        setMessages([]);
        setErrorMessage(getReadableApiErrorMessage(err, "Failed to load this conversation."));
      }
    }
  }, [currentConversationId]);

  const fetchConversationMeta = useCallback(async (targetConversationId: string | null = currentConversationId) => {
    if (!targetConversationId) {
      return;
    }

    try {
      const data = await fetchChatConversationDetails(targetConversationId);
      const nextConversation = data?.conversation;

      if (nextConversation?.chatTheme) {
        setChatTheme(nextConversation.chatTheme);
      }
      setChatWallpaper(String(nextConversation?.chatWallpaper || ""));
      setConversationListing(
        nextConversation?.service
          ? {
            id: String(nextConversation.service?._id || ""),
            serviceName: String(nextConversation.service?.serviceName || ""),
            sellerName: String(nextConversation.service?.seller?.sellerName || ""),
          }
          : null,
      );

      if (isGroupConversation) {
        const nextGroupMeta: GroupMeta = {
          groupName: nextConversation?.groupName || "Group chat",
          groupAvatar: nextConversation?.groupAvatar || "",
          memberCount: Number(nextConversation?.memberCount || nextConversation?.members?.length || 0),
        };

        setGroupMeta(nextGroupMeta);
        navigation.setParams({
          groupName: nextGroupMeta.groupName,
          groupAvatar: nextGroupMeta.groupAvatar,
          memberCount: nextGroupMeta.memberCount,
        });
      }
    } catch (error: any) {
      console.log("Fetch conversation details error:", error?.response?.data || error);
    }
  }, [currentConversationId, isGroupConversation, navigation]);

  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (currentConversationId) {
      return currentConversationId;
    }

    if (!userId) {
      return null;
    }

    try {
      const res = await createChatConversation({
        receiverId: userId,
        conversationType,
        serviceId,
      });

      const nextConversation = res?.conversation;
      const nextConversationId = nextConversation?._id || null;
      if (nextConversationId) {
        setCurrentConversationId(nextConversationId);
        if (nextConversation?.chatTheme) {
          setChatTheme(nextConversation.chatTheme);
        }
        setErrorMessage("");
      }
      return nextConversationId;
    } catch (err: any) {
      console.log("Ensure conversation error:", err?.response?.data || err);
      setErrorMessage(getReadableApiErrorMessage(err, "Unable to start this conversation right now."));
      return null;
    }
  }, [conversationType, currentConversationId, serviceId, userId]);

  const joinConversationRealtime = useCallback(async (targetConversationId: string | null) => {
    if (!targetConversationId) {
      return false;
    }

    try {
      await connectSocket();
      socket.emit("joinConversation", targetConversationId);
      return true;
    } catch (error) {
      console.log("Join conversation realtime error:", error);
      return false;
    }
  }, []);

  const initializeChat = useCallback(async ({ refresh = false } = {}) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setErrorMessage("");

      if (userId) {
        await fetchUser();
      }

      const resolvedConversationId = await ensureConversation();

      if (resolvedConversationId) {
        await Promise.all([
          fetchMessages(resolvedConversationId),
          fetchConversationMeta(resolvedConversationId),
        ]);
        void joinConversationRealtime(resolvedConversationId);
      }
    } catch (error: any) {
      console.log("Initialize chat error:", error);
      setMessages([]);
      setErrorMessage(getReadableApiErrorMessage(error, "Failed to load this conversation."));
    } finally {
      if (refresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [ensureConversation, fetchConversationMeta, fetchMessages, fetchUser, userId]);

  const sendCallEventLog = useCallback(async ({
    conversationId,
    callSessionId,
    callType,
    event = "started",
  }: {
    conversationId: string;
    callSessionId: string;
    callType: "audio" | "video";
    event?: string;
  }) => {
    const payload = buildCallEventMessage({
      callSessionId,
      callType,
      event,
      callerId: currentUserId,
    });

    const response = await sendChatMessage({
      conversationId,
      text: payload,
      messageType: "system",
    });

    if (response?.message) {
      mergeMessage(response.message);
    }
  }, [currentUserId, mergeMessage]);

  const startCallFlow = useCallback(async (callType: "audio" | "video") => {
    if (!productFlags.callingInConsumerApp) {
      Alert.alert("Coming soon", callingDisabledMessage);
      return;
    }

    try {
      const resolvedConversationId = await ensureConversation();

        if (!resolvedConversationId) {
          throw new Error("Unable to open this conversation for calling.");
        }

        const response = await startCallSession({
          conversationId: resolvedConversationId,
          callType,
        });

      const nextCallSession = response?.callSession || null;
      const nextCallSessionId = String(nextCallSession?._id || "");

        if (!nextCallSessionId) {
          throw new Error("Call session could not be created.");
        }

        void joinConversationRealtime(resolvedConversationId);

        sendCallEventLog({
          conversationId: resolvedConversationId,
          callSessionId: nextCallSessionId,
          callType,
        }).catch((error) => {
        console.log("call event log error:", error);
      });

      navigation.navigate("CallScreen", {
        callSessionId: nextCallSessionId,
        mode: "outgoing",
        callType,
        initialCallSession: nextCallSession,
        initialIceServers: Array.isArray(response?.iceServers) ? response.iceServers : [],
        callRuntime: response?.callRuntime || null,
        title: isGroupConversation
          ? groupMeta.groupName || groupName || "Group call"
          : user?.name || user?.username || "Aline2 call",
        avatarUrl: isGroupConversation
          ? groupMeta.groupAvatar || groupAvatar || ""
          : user?.profilePic || "",
      });
    } catch (error) {
      Alert.alert(
        "Could not start call",
        getReadableApiErrorMessage(error, "Unable to start the call right now."),
      );
    }
  }, [
    ensureConversation,
    groupAvatar,
    groupMeta.groupAvatar,
    groupMeta.groupName,
    groupName,
    isGroupConversation,
    joinConversationRealtime,
    navigation,
    sendCallEventLog,
    user?.name,
    user?.profilePic,
    user?.username,
  ]);

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    setCurrentConversationId(conversationId || null);
  }, [conversationId]);

  useEffect(() => {
    setGroupMeta({
      groupName: groupName || "Group chat",
      groupAvatar: groupAvatar || "",
      memberCount: Number(memberCount || 0),
    });
  }, [groupAvatar, groupName, memberCount]);

  useEffect(() => {
    let mounted = true;
    const loadCurrentUser = async () => {
      try {
        const parsedUser = await getStoredUser();
        const nextUserId = parsedUser?._id || parsedUser?.id || "";

        if (mounted) {
          setCurrentUserId(nextUserId);
        }

        if (nextUserId) {
          await connectSocket();
          socket.emit("userOnline", nextUserId);
        }
      } catch (err) {
        console.log("Current user load error:", err);
      }
    };

    loadCurrentUser();
    return () => {
      mounted = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (currentConversationId) {
        Promise.all([
          fetchMessages(currentConversationId),
          fetchConversationMeta(currentConversationId),
        ]).catch((error) => {
          console.log("Chat focus refresh error:", error);
        });
      } else {
        initializeChat({ refresh: true }).catch((error) => {
          console.log("Chat focus refresh error:", error);
        });
      }
    }, [currentConversationId, fetchConversationMeta, fetchMessages, initializeChat])
  );

  useEffect(() => {
    const handleReceiveMessage = (message: any) => {
      const messageConversationId = String(
        message?.conversation?._id || message?.conversation || message?.conversationId || "",
      );

      if (
        currentConversationId
        && messageConversationId
        && messageConversationId !== String(currentConversationId)
      ) {
        return;
      }

      mergeMessage(message);

      const senderId = String(getMessageSenderId(message) || "");
      if (senderId && senderId !== String(currentUserId || "")) {
        setIsPeerOnline(true);
      }
    };

    const handleTyping = (data: any) => {
      const nextUserId = String(data?.userId || "");
      if (nextUserId && nextUserId !== String(currentUserId || "")) {
        setTypingUserId(nextUserId);
        setIsPeerOnline(true);
      }
    };

    const handleStopTyping = (data: any) => {
      const nextUserId = String(data?.userId || "");
      setTypingUserId((prev) => (prev === nextUserId ? "" : prev));

      if (!(user?.isOnline === true || user?.availabilityStatus === true)) {
        setIsPeerOnline(false);
      }
    };

    const handleMessageSeen = (data: any) => {
      applyMessageSeen(data);
    };

    const handleMessageReaction = (data: any) => {
      applyMessageReaction(data);
    };

    const handleMessageEdited = (data: any) => {
      if (data?.messageId) {
        setMessages((prev) =>
          prev.map((msg) =>
            String(msg?._id) === String(data.messageId)
              ? { ...msg, text: data.text, isEdited: true, editedAt: data.editedAt }
              : msg
          )
        );
      }
    };

    const handleChatThemeChanged = (data: any) => {
      if (data?.theme) {
        setChatTheme(data.theme);
      }
    };

    const handleChatWallpaperChanged = (data: any) => {
      setChatWallpaper(String(data?.wallpaperUrl || ""));
    };

    socket.on("receiveMessage", handleReceiveMessage);
    socket.on("typing", handleTyping);
    socket.on("stopTyping", handleStopTyping);
    socket.on("messageSeen", handleMessageSeen);
    socket.on("messageReaction", handleMessageReaction);
    socket.on("messageEdited", handleMessageEdited);
    socket.on("chatThemeChanged", handleChatThemeChanged);
    socket.on("chatWallpaperChanged", handleChatWallpaperChanged);

    return () => {
      socket.off("receiveMessage", handleReceiveMessage);
      socket.off("typing", handleTyping);
      socket.off("stopTyping", handleStopTyping);
      socket.off("messageSeen", handleMessageSeen);
      socket.off("messageReaction", handleMessageReaction);
      socket.off("messageEdited", handleMessageEdited);
      socket.off("chatThemeChanged", handleChatThemeChanged);
      socket.off("chatWallpaperChanged", handleChatWallpaperChanged);
    };
  }, [
    applyMessageReaction,
    applyMessageSeen,
    currentConversationId,
    currentUserId,
    mergeMessage,
    user?.availabilityStatus,
    user?.isOnline,
  ]);

  useEffect(() => {
    let active = true;
    initializeChat().catch((error) => {
      if (!active) {
        return;
      }
      console.log("Chat initialize effect error:", error);
    });
    return () => {
      active = false;
    };
  }, [initializeChat]);

  useEffect(() => {
    if (!currentConversationId) {
      return;
    }

    void joinConversationRealtime(currentConversationId);
  }, [currentConversationId, joinConversationRealtime]);

  // ─── Message actions ──────────────────────────────────────────────────────

  const submitMessage = useCallback(async ({ text: nextText, file, mediaUrl, messageType, duration, replyToMessageId, replyToMessage }: SubmitMessageParams) => {
    const resolvedConversationId = await ensureConversation();
    if (!resolvedConversationId) {
      throw new Error("Unable to start this conversation right now.");
    }

    const res = await sendChatMessage({
      conversationId: resolvedConversationId,
      text: nextText,
      file,
      mediaUrl,
      messageType,
      duration,
      replyToMessageId,
    });

    if (res?.message) {
      const mergedReplyMessage = replyToMessage
        ? {
          ...res.message,
          replyToMessageId: res.message?.replyToMessageId || replyToMessageId,
          replyToMessage: res.message?.replyToMessage || replyToMessage,
        }
        : res.message;

      mergeMessage(mergedReplyMessage);
      setReplyingToMessage(null);
    }
  }, [ensureConversation, mergeMessage]);

  const replyingToMessageId = useMemo(() => getMessageIdentity(replyingToMessage), [replyingToMessage]);

  const sendTextMessage = useCallback(async () => {
    if (!text.trim() || sending) {
      return;
    }

    try {
      setSending(true);
      await submitMessage({
        text: text.trim(),
        replyToMessageId: replyingToMessageId,
        replyToMessage: replyingToMessage,
      });
      setText("");
    } catch (err: any) {
      console.log("Send message error:", err?.response?.data || err);
      Alert.alert("Error", getReadableApiErrorMessage(err, "Failed to send message"));
    } finally {
      setSending(false);
    }
  }, [replyingToMessage, replyingToMessageId, sending, submitMessage, text]);

  const primaryThemeColor = useMemo(() => {
    return CHAT_THEME_LIST.find(t => t.id === chatTheme)?.sentBubble[0] || PRIMARY;
  }, [chatTheme]);

  const directPresenceText = useMemo(() => {
    if (typingUserId) {
      return "Online now";
    }

    if (user?.isOnline === true || user?.availabilityStatus === true || isPeerOnline) {
      return "Online";
    }

    return "Away";
  }, [isPeerOnline, typingUserId, user?.availabilityStatus, user?.isOnline]);

  const groupPresenceText = useMemo(() => {
    if (typingUserId) {
      return "Someone is typing...";
    }

    return `${groupMeta.memberCount || 0} members`;
  }, [groupMeta.memberCount, typingUserId]);

  const chatHeaderTint = primaryThemeColor;
  const headerStatusColor = "rgba(255,255,255,0.78)";
  const headerIconColor = "#FFFFFF";
  const assistantScope = isGroupConversation ? "Group chat support" : "Direct chat support";
  const assistantScopeHint = isGroupConversation
    ? `${groupMeta.groupName || "Group chat"} me messages, calls, media, aur group controls ke liye help.`
    : `${user?.username || user?.name || "This chat"} ke conversation flow, messaging, media, aur support help.`;
  const assistantConversationSummary = isGroupConversation
    ? `Group members: ${groupMeta.memberCount || 0}. Presence: ${groupPresenceText}.`
    : `Current chat partner: ${user?.username || user?.name || "User"}. Presence: ${directPresenceText}.${conversationListing?.serviceName ? ` Linked service: ${conversationListing.serviceName}.` : ""}`;
  const assistantSuggestedPrompts = isGroupConversation
    ? ["Group chat issue fix karo", "Media send problem hai", "Unread messages samjhao"]
    : ["Message kyu nahi ja raha?", "Chat settings samjhao", "Is user chat ka issue fix kaise hoga?"];
  const assistantRecentMessages = useMemo(
    () =>
      messages.slice(-6).map((message) => {
        const rawText = String(getMessageText(message) || "").trim() || `[${getMessageTypeLabel(message)}]`;
        const senderId = getMessageSenderId(message);
        const senderLabel = String(senderId) === String(currentUserId)
          ? "Current user"
          : isGroupConversation
            ? (typeof message?.sender === "object" ? message.sender?.username || message.sender?.name || "Other member" : "Other member")
            : user?.username || user?.name || "Other participant";

        return `${senderLabel}: ${rawText}`;
      }),
    [currentUserId, isGroupConversation, messages, user?.name, user?.username],
  );
  const messageMap = useMemo(() => {
    const nextMap = new Map<string, ChatMessage>();
    messages.forEach((message) => {
      const identity = getMessageIdentity(message);
      if (identity) {
        nextMap.set(identity, message);
      }
    });
    return nextMap;
  }, [messages]);
  const messageIndexMap = useMemo(() => {
    const nextMap = new Map<string, number>();
    messages.forEach((message, index) => {
      const identity = getMessageIdentity(message);
      if (identity) {
        nextMap.set(identity, index);
      }
    });
    return nextMap;
  }, [messages]);

  const buildReplyPreview = useCallback((message: ChatMessage | null): ReplyPreviewState | null => {
    if (!message) {
      return null;
    }

    const messageId = getMessageIdentity(message);
    if (!messageId) {
      return null;
    }

    const resolvedMessage = messageMap.get(messageId) || message;

    const senderId = String(getMessageSenderId(resolvedMessage) || "");
    const senderInfo = typeof resolvedMessage?.sender === "object" ? resolvedMessage.sender : null;
    const author = senderId && senderId === String(currentUserId || "")
      ? "You"
      : String(
        senderInfo?.username
        || senderInfo?.name
        || user?.username
        || user?.name
        || "Replying to"
      );

    const textValue = getMessageText(resolvedMessage);
    const snippet = textValue || getMessageTypeLabel(resolvedMessage);

    return {
      id: messageId,
      author,
      snippet,
      message: resolvedMessage,
    };
  }, [currentUserId, messageMap, user?.name, user?.username]);

  const replyingToPreview = useMemo(() => buildReplyPreview(replyingToMessage), [buildReplyPreview, replyingToMessage]);

  const highlightMessageById = useCallback((messageId: string) => {
    setHighlightedMessageId(messageId);
    if (replyHighlightTimeoutRef.current) {
      clearTimeout(replyHighlightTimeoutRef.current);
    }
    replyHighlightTimeoutRef.current = setTimeout(() => {
      setHighlightedMessageId("");
      if (pendingFocusMessageIdRef.current === messageId) {
        pendingFocusMessageIdRef.current = "";
      }
    }, 1800);
  }, []);

  const scrollToMessageIndex = useCallback((index: number) => {
    if (index < 0) {
      return;
    }

    messageListRef.current?.scrollToIndex({
      index,
      animated: true,
      viewPosition: 0.45,
    });
  }, []);

  const focusMessageById = useCallback(async (messageId: string) => {
    const normalizedMessageId = String(messageId || "").trim();
    if (!normalizedMessageId || !currentConversationId) {
      return;
    }

    let workingMessages = messages;
    let targetMessage = messageMap.get(normalizedMessageId) || null;
    let nextCursor = pagination?.nextCursor || null;
    let hasMore = Boolean(pagination?.hasMore);
    let nextPagination = pagination;

    while (!targetMessage && hasMore && nextCursor) {
      const data = await fetchConversationMessages(currentConversationId, {
        cursor: nextCursor,
        limit: pagination?.limit || 30,
      });
      const nextMessages = dedupeMessages(normalizeMediaFieldsDeep(data?.messages || [])) as ChatMessage[];
      workingMessages = dedupeMessages([...nextMessages, ...workingMessages]) as ChatMessage[];

      setMessages((prev) => dedupeMessages([...nextMessages, ...prev]) as ChatMessage[]);
      nextPagination = data?.pagination || nextPagination;
      setPagination(nextPagination || { nextCursor: null, hasMore: false, limit: pagination?.limit || 30 });

      targetMessage = nextMessages.find((message) => getMessageIdentity(message) === normalizedMessageId) || null;
      hasMore = Boolean(nextPagination?.hasMore);
      nextCursor = nextPagination?.nextCursor || null;
    }

    const targetIndex = workingMessages.findIndex((message) => getMessageIdentity(message) === normalizedMessageId);
    if (targetIndex < 0) {
      Alert.alert("Message not found", "We could not find the original replied message in this chat.");
      return;
    }

    pendingFocusMessageIdRef.current = normalizedMessageId;
    requestAnimationFrame(() => {
      scrollToMessageIndex(targetIndex);
    });
    highlightMessageById(normalizedMessageId);
  }, [currentConversationId, highlightMessageById, messageMap, messages, pagination, scrollToMessageIndex]);

  const handleScrollToIndexFailed = useCallback((info: { index: number; averageItemLength: number }) => {
    const pendingMessageId = pendingFocusMessageIdRef.current;
    const fallbackIndex = pendingMessageId
      ? (messageIndexMap.get(pendingMessageId) ?? info.index)
      : info.index;

    if (fallbackIndex < 0) {
      return;
    }

    messageListRef.current?.scrollToOffset({
      offset: Math.max(0, info.averageItemLength * fallbackIndex),
      animated: true,
    });

    setTimeout(() => {
      const retryIndex = pendingMessageId
        ? messageIndexMap.get(pendingMessageId)
        : fallbackIndex;

      if (typeof retryIndex === "number" && retryIndex >= 0) {
        scrollToMessageIndex(retryIndex);
      }
    }, 120);
  }, [messageIndexMap, scrollToMessageIndex]);

  const queueAttachmentPreview = useCallback((asset: any) => {
    if (!asset?.uri) {
      return;
    }

    const mimeType = String(asset.type || "application/octet-stream").trim();
    const kind = mimeType.startsWith("video/") ? "video" : "image";
    setPendingAttachment({
      uri: asset.uri,
      name: asset.fileName || `${kind}_${Date.now()}`,
      type: mimeType,
      kind,
    });
    setPendingVoiceNote(null);
    setShowTools(false);
  }, []);

  const sendImageAttachment = useCallback(async () => {
    try {
      const response = await launchImageLibrary({
        mediaType: "mixed",
        selectionLimit: 1,
      });

      if (response?.didCancel) {
        return;
      }
      if (response?.errorCode) {
        Alert.alert("Error", response.errorMessage || "Image pick failed");
        return;
      }

      queueAttachmentPreview(response.assets?.[0]);
    } catch (error) {
      Alert.alert("Error", getReadableApiErrorMessage(error, "Failed to select attachment"));
    }
  }, [queueAttachmentPreview]);

  const sendCameraAttachment = useCallback(async () => {
    const hasPermission = await ensureCameraPermission(
      "Allow Aline2 to use your camera for chat photo and video attachments.",
    );
    if (!hasPermission) {
      Alert.alert("Camera permission needed", "Allow camera access to capture and send a photo or video.");
      return;
    }

    try {
      const mediaType = await resolveCameraCaptureMediaType("mixed", {
        title: "Send from camera",
        message: "Choose whether you want to capture a photo or record a video for this chat.",
      });
      if (!mediaType) {
        return;
      }

      const response = await launchCamera({
        mediaType,
        saveToPhotos: false,
        videoQuality: "high",
      });

      if (response?.didCancel) {
        return;
      }
      if (response?.errorCode) {
        Alert.alert("Error", response.errorMessage || "Camera capture failed");
        return;
      }

      queueAttachmentPreview(response.assets?.[0]);
    } catch (error) {
      Alert.alert("Error", getReadableApiErrorMessage(error, "Failed to capture media"));
    }
  }, [queueAttachmentPreview]);

  const sendPendingAttachment = useCallback(async () => {
    if (!pendingAttachment) {
      return;
    }

    try {
      setUploading(true);
      await submitMessage({
        text: text.trim(),
        file: {
          uri: pendingAttachment.uri,
          name: pendingAttachment.name,
          type: pendingAttachment.type,
        },
        replyToMessageId: replyingToMessageId,
        replyToMessage: replyingToMessage,
      });
      setText("");
      setPendingAttachment(null);
    } catch (error: any) {
      console.log("attachment message send error:", error);
      Alert.alert("Error", getReadableApiErrorMessage(error, "Failed to send attachment"));
    } finally {
      setUploading(false);
    }
  }, [pendingAttachment, replyingToMessage, replyingToMessageId, submitMessage, text]);

  const sendDocumentAttachment = useCallback(async () => {
    try {
      const [file] = await pick({
        mode: "import",
        allowMultiSelection: false,
        type: [types.allFiles]
      });

      if (!file?.uri) {
        return;
      }

      let localUri = file.uri;
      if (file.isVirtual || String(file.uri || "").startsWith("content://")) {
        const [localCopy] = await keepLocalCopy({
          destination: "cachesDirectory",
          files: [
            {
              uri: file.uri,
              fileName: file.name || `document_${Date.now()}`,
              convertVirtualFileToType: file.convertibleToMimeTypes?.[0]?.mimeType,
            },
          ],
        });

        if (!localCopy || localCopy.status !== "success") {
          throw new Error(localCopy?.copyError || "Unable to access the selected document.");
        }

        localUri = localCopy.localUri;
      }

      setUploading(true);
      await submitMessage({
        text: text.trim(),
        file: {
          uri: localUri,
          name: file.name || `document_${Date.now()}`,
          type: file.type || "application/octet-stream",
        },
        replyToMessageId: replyingToMessageId,
        replyToMessage: replyingToMessage,
      });
      setText("");
      setShowTools(false);
    } catch (error: any) {
      const message = getDocumentPickerMessage(error) || getReadableApiErrorMessage(error, "Document pick failed");
      if (!message) {
        return;
      }

      console.log("document message send error:", error);
      Alert.alert("Error", message);
    } finally {
      setUploading(false);
    }
  }, [replyingToMessage, replyingToMessageId, submitMessage, text]);

  const sendAudioAttachment = useCallback(async () => {
    try {
      const [file] = await pick({
        mode: "import",
        allowMultiSelection: false,
        type: [types.audio]
      });

      if (!file?.uri) {
        return;
      }

      let localUri = file.uri;
      if (file.isVirtual || String(file.uri || "").startsWith("content://")) {
        const [localCopy] = await keepLocalCopy({
          destination: "cachesDirectory",
          files: [
            {
              uri: file.uri,
              fileName: file.name || `audio_${Date.now()}`,
              convertVirtualFileToType: file.convertibleToMimeTypes?.[0]?.mimeType,
            },
          ],
        });

        if (!localCopy || localCopy.status !== "success") {
          throw new Error(localCopy?.copyError || "Unable to access the selected audio file.");
        }

        localUri = localCopy.localUri;
      }

      setUploading(true);
      await submitMessage({
        text: text.trim(),
        file: {
          uri: localUri,
          name: file.name || `audio_${Date.now()}`,
          type: file.type || "audio/*",
        },
        replyToMessageId: replyingToMessageId,
        replyToMessage: replyingToMessage,
      });
      setText("");
      setShowTools(false);
    } catch (error: any) {
      const message = getDocumentPickerMessage(error) || getReadableApiErrorMessage(error, "Audio pick failed");
      if (!message) {
        return;
      }

      console.log("audio message send error:", error);
      Alert.alert("Error", message);
    } finally {
      setUploading(false);
    }
  }, [replyingToMessage, replyingToMessageId, submitMessage, text]);

  const sendLocationMessage = useCallback(async () => {
    const cleanLocation = String(locationDraft || "").trim();

    if (!cleanLocation) {
      Alert.alert("Add a place", "Enter a place, address, or landmark to share.");
      return;
    }

    try {
      setUploading(true);
      await submitMessage({
        text: buildLocationMessage(cleanLocation),
        replyToMessageId: replyingToMessageId,
        replyToMessage: replyingToMessage,
      });
      setLocationDraft("");
      setShowLocationComposer(false);
      setShowTools(false);
    } catch (error: any) {
      console.log("location message send error:", error);
      Alert.alert("Error", getReadableApiErrorMessage(error, "Failed to share location"));
    } finally {
      setUploading(false);
    }
  }, [locationDraft, replyingToMessage, replyingToMessageId, submitMessage]);

  const tools: ToolItem[] = useMemo(() => [
    { id: "gallery", name: "Gallery", icon: "image", action: sendImageAttachment },
    { id: "document", name: "Document", icon: "document", action: sendDocumentAttachment },
    {
      id: "camera",
      name: "Camera",
      icon: "camera",
      action: sendCameraAttachment,
    },
    {
      id: "audio",
      name: "Audio",
      icon: "musical-notes",
      action: sendAudioAttachment,
    },
    {
      id: "sticker",
      name: "Sticker",
      icon: "happy",
      action: () => {
        setShowTools(false);
        setShowStickerPicker(true);
      },
    },
    {
      id: "location",
      name: "Location",
      icon: "location",
      action: () => {
        setShowTools(false);
        setShowLocationComposer(true);
      },
    },
  ], [sendAudioAttachment, sendCameraAttachment, sendDocumentAttachment, sendImageAttachment]);

  const loadMoreMessages = useCallback(async () => {
    if (!currentConversationId || !pagination?.hasMore || !pagination?.nextCursor || loadingMore) {
      return;
    }

    try {
      setLoadingMore(true);
      await fetchMessages(currentConversationId, {
        append: true,
        cursor: pagination.nextCursor,
        limit: pagination.limit || 30,
      });
    } finally {
      setLoadingMore(false);
    }
  }, [currentConversationId, fetchMessages, loadingMore, pagination]);

  const handleTextChange = useCallback((value: string) => {
    setText(value);

    if (!currentConversationId) {
      return;
    }

    connectSocket()
      .then(() => {
        socket.emit("typing", { conversationId: currentConversationId });
      })
      .catch((error: any) => {
        console.log("Typing emit error:", error);
      });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("stopTyping", { conversationId: currentConversationId });
    }, 1200);
  }, [currentConversationId]);

  useEffect(() => () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!currentConversationId || !currentUserId || !messages.length) {
      return;
    }

    const nextMessage = getLastIncomingUnseenMessage(messages, currentUserId);
    if (!nextMessage?._id) {
      return;
    }

    connectSocket()
      .then(() => {
        socket.emit("messageSeen", {
          conversationId: currentConversationId,
          messageId: nextMessage._id,
        });
        applyMessageSeen({
          messageId: nextMessage._id,
          userId: currentUserId,
          seenAt: new Date().toISOString(),
        });
      })
      .catch((error: any) => {
        console.log("Message seen emit error:", error);
      });
  }, [applyMessageSeen, currentConversationId, currentUserId, messages]);

  const reactToMessage = useCallback((messageId: string, emoji = "❤️") => {
    if (!messageId) {
      return;
    }

    reactToChatMessage(messageId, emoji)
      .then((response: any) => {
        applyMessageReaction({
          messageId: response?.data?.messageId || messageId,
          userId: response?.data?.userId || currentUserId,
          emoji: response?.data?.emoji || emoji,
        });
      })
      .catch((error: any) => {
        console.log("Message reaction save error:", error);
        Alert.alert("Reaction failed", getReadableApiErrorMessage(error, "Unable to save the reaction right now."));
      });
  }, [applyMessageReaction, currentUserId]);

  const sendVoiceMessage = useCallback((voiceFile: { uri: string; name: string; type: string; duration: number }) => {
    setPendingAttachment(null);
    setPendingVoiceNote({
      uri: voiceFile.uri,
      name: voiceFile.name,
      type: voiceFile.type,
      duration: voiceFile.duration,
    });
  }, []);

  const sendPendingVoiceMessage = useCallback(async () => {
    if (!pendingVoiceNote) {
      return;
    }

    try {
      setUploading(true);
      await submitMessage({
        file: {
          uri: pendingVoiceNote.uri,
          name: pendingVoiceNote.name,
          type: pendingVoiceNote.type,
        },
        duration: pendingVoiceNote.duration,
        messageType: "voice",
        replyToMessageId: replyingToMessageId,
        replyToMessage: replyingToMessage,
      });
      setPendingVoiceNote(null);
    } catch (error) {
      console.log("voice send error:", error);
      Alert.alert("Error", getReadableApiErrorMessage(error, "Failed to send voice message"));
    } finally {
      setUploading(false);
    }
  }, [pendingVoiceNote, replyingToMessage, replyingToMessageId, submitMessage]);

  const openAttachmentUrl = useCallback(async (rawUrl: string | undefined | null, fallbackMessage: string) => {
    const targetUrl = normalizeMediaUrl(rawUrl);
    if (!targetUrl) {
      Alert.alert("Attachment unavailable", fallbackMessage);
      return;
    }

    try {
      await Linking.openURL(targetUrl);
    } catch (error) {
      console.log("Attachment open error:", error);
      Alert.alert("Unable to open attachment", fallbackMessage);
    }
  }, []);

  const handleMessagePress = useCallback((message: ChatMessage, attachment: MessageAttachment | null, locationPayload: LocationPayload | null) => {
    if (locationPayload?.url) {
      Linking.openURL(locationPayload.url).catch((error) => {
        console.log("Open location error:", error);
        Alert.alert("Unable to open map", "Please try again.");
      });
      return;
    }

    if (!attachment?.url) {
      return;
    }

    if (isImageMessage(message)) {
      setMessagePreview({
        imageUrl: normalizeMediaUrl(attachment.url),
        title: getAttachmentDisplayName(message),
      });
      return;
    }

    if (isVideoMessage(message)) {
      openAttachmentUrl(attachment.url, "This video could not be opened right now.");
      return;
    }

    if (isAudioMessage(message) || String(message?.messageType || "") === "voice") {
      return;
    }

    if (isDocumentMessage(message)) {
      openAttachmentUrl(attachment.url, "This document could not be opened right now.");
    }
  }, [openAttachmentUrl]);

  const startReplyToMessage = useCallback((message: ChatMessage) => {
    setReplyingToMessage(message);
    requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  }, []);

  // ─── Render message ───────────────────────────────────────────────────────

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMine = String(getMessageSenderId(item)) === String(currentUserId || "");
    const isSystemMessage = String(item?.messageType || "") === "system";
    const attachment: MessageAttachment | null = getMessageAttachment(item);
    const textValue = getMessageText(item);
    const sharedContent = parseSharedContentMessage(item);
    const callEvent = buildCallEventPreview(item, currentUserId);
    const sharedMedia = Array.isArray(sharedContent?.media) ? sharedContent.media[0] : null;
    const locationPayload = parseLocationMessage(textValue);
    const seenCount = Array.isArray(item?.seenBy) ? item.seenBy.length : 0;
    const reactions = Array.isArray(item?.reactions) ? item.reactions : [];
    const repliedMessage = getMessageReply(item) as ChatMessage | null;
    const replyPreview = buildReplyPreview(repliedMessage);
    const isHighlighted = getMessageIdentity(item) === highlightedMessageId;
    let swipeableRef: Swipeable | null = null;

    const bubbleTextColor = isMine ? "#fff" : "#111";

    return (
      <Swipeable
        ref={(instance) => {
          swipeableRef = instance;
        }}
        friction={2}
        overshootLeft={false}
        overshootRight={false}
        leftThreshold={30}
        rightThreshold={30}
        renderLeftActions={isMine ? undefined : () => (
          <View style={styles.swipeReplyAction}>
            <Icon name="return-up-back-outline" size={18} color="#fff" />
            <Text style={styles.swipeReplyText}>Reply</Text>
          </View>
        )}
        renderRightActions={!isMine ? undefined : () => (
          <View style={[styles.swipeReplyAction, styles.swipeReplyActionMine]}>
            <Text style={styles.swipeReplyText}>Reply</Text>
            <Icon name="return-up-back-outline" size={18} color="#fff" />
          </View>
        )}
        onSwipeableOpen={() => {
          swipeableRef?.close();
          startReplyToMessage(item);
        }}
      >
        <View
          style={[
            styles.messageRow,
            isMine ? { justifyContent: "flex-end" } : { justifyContent: "flex-start" }
          ]}
        >
          <TouchableOpacity
            activeOpacity={isSystemMessage ? 1 : 0.92}
            onPress={isSystemMessage ? undefined : () => handleMessagePress(item, attachment, locationPayload)}
            onLongPress={isSystemMessage ? undefined : () => {
              setContextMessage(item);
              setShowContextMenu(true);
            }}
            style={[
              styles.messageBubble,
              sharedContent?.kind === "post" || callEvent ? styles.messageBubbleWide : null,
              isMine ? [styles.myMessage, { backgroundColor: primaryThemeColor }] : styles.otherMessage,
              isHighlighted ? styles.messageBubbleHighlighted : null,
            ]}
          >
            {replyPreview ? (
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={() => {
                  focusMessageById(replyPreview.id).catch((error) => {
                    console.log("reply target focus error:", error);
                  });
                }}
                style={[styles.replyPreviewCard, isMine ? styles.replyPreviewCardMine : null]}
              >
                <View style={[styles.replyPreviewBar, isMine ? styles.replyPreviewBarMine : null]} />
                <View style={styles.replyPreviewBody}>
                  <Text style={[styles.replyPreviewAuthor, isMine ? styles.replyPreviewAuthorMine : null]} numberOfLines={1}>
                    {replyPreview.author}
                  </Text>
                  <Text style={[styles.replyPreviewSnippet, isMine ? styles.replyPreviewSnippetMine : null]} numberOfLines={1}>
                    {replyPreview.snippet}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {sharedContent?.kind === "post" ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  if (sharedContent?.postId) {
                    navigation.navigate("PostDetail", { postId: sharedContent.postId });
                  }
                }}
                style={[styles.sharedPostCard, isMine ? styles.sharedPostCardMine : null]}
              >
                <View style={styles.sharedPostHeader}>
                  <Image
                    source={{ uri: normalizeMediaUrl(sharedContent?.user?.avatarUrl || DEFAULT_AVATAR_URL) }}
                    style={styles.sharedPostAvatar}
                  />
                  <View style={styles.sharedPostMeta}>
                    <Text style={[styles.sharedPostAuthor, isMine ? styles.sharedPostAuthorMine : null]} numberOfLines={1}>
                      {sharedContent?.user?.username ? `@${sharedContent.user.username}` : sharedContent?.user?.name || "Aline2 post"}
                    </Text>
                    <Text style={[styles.sharedPostLabel, isMine ? styles.sharedPostLabelMine : null]} numberOfLines={1}>
                      Shared post
                    </Text>
                  </View>
                </View>

                {sharedMedia?.url || sharedMedia?.thumbnailUrl ? (
                  <Image
                    source={{ uri: normalizeMediaUrl(sharedMedia?.thumbnailUrl || sharedMedia?.url || "") }}
                    style={styles.sharedPostImage}
                    resizeMode="cover"
                  />
                ) : null}

                {sharedContent?.caption ? (
                  <Text style={[styles.sharedPostCaption, isMine ? styles.sharedPostCaptionMine : null]} numberOfLines={3}>
                    {sharedContent.caption}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ) : null}

            {callEvent ? (
              <View style={[styles.callEventCard, isMine ? styles.callEventCardMine : null]}>
                <View style={[styles.callEventIcon, isMine ? styles.callEventIconMine : null]}>
                  <Icon
                    name={callEvent.icon}
                    size={16}
                    color={isMine ? "#fff" : primaryThemeColor}
                  />
                </View>
                <View style={styles.callEventBody}>
                  <Text style={[styles.callEventTitle, isMine ? styles.callEventTitleMine : null]}>
                    {callEvent.label}
                  </Text>
                  <Text style={[styles.callEventMeta, isMine ? styles.callEventMetaMine : null]}>
                    Tap header buttons to call again
                  </Text>
                </View>
              </View>
            ) : null}

            {isImageMessage(item) && attachment?.url ? (
              <Image
                source={{ uri: normalizeMediaUrl(attachment.url) }}
                style={styles.messageImage}
                resizeMode="cover"
              />
            ) : null}

            {isVideoMessage(item) && (attachment?.thumbnailUrl || attachment?.url) ? (
              <View style={styles.documentCard}>
                <Image
                  source={{ uri: normalizeMediaUrl(attachment.thumbnailUrl || attachment.url || "") }}
                  style={styles.messageImage}
                />
                <Text style={[styles.documentName, isMine && styles.myDocumentName]} numberOfLines={1}>
                  Video attachment
                </Text>
              </View>
            ) : null}

            {(isAudioMessage(item) || item?.messageType === "voice") && attachment?.url ? (
              <VoiceMessageBubble
                audioUrl={attachment.url}
                durationSeconds={Number(item?.duration || 0)}
                isMine={isMine}
                accentColor={primaryThemeColor}
                label={item?.messageType === "voice" ? "Voice message" : getAttachmentDisplayName(item)}
              />
            ) : null}

            {isDocumentMessage(item) && attachment?.url ? (
              <View style={styles.documentCard}>
                <Icon name="document-text-outline" size={20} color={isMine ? "#fff" : PRIMARY} />
                <Text style={[styles.documentName, isMine && styles.myDocumentName]} numberOfLines={1}>
                  {getAttachmentDisplayName(item)}
                </Text>
              </View>
            ) : null}

            {!locationPayload && !sharedContent && !callEvent && !!textValue && (
              <Text style={[styles.messageText, isMine && styles.myMessageText]}>
                {textValue}
                {item?.isEdited ? (
                  <Text style={{ fontSize: 11, fontStyle: "italic", opacity: 0.6 }}> edited</Text>
                ) : null}
              </Text>
            )}

            {locationPayload ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => handleMessagePress(item, attachment, locationPayload)}
                style={[styles.locationCard, isMine && styles.myLocationCard]}
              >
                <Icon name="location-outline" size={18} color={isMine ? "#fff" : PRIMARY} />
                <View style={styles.locationBody}>
                  <Text style={[styles.locationTitle, isMine && styles.myLocationTitle]}>
                    {locationPayload.label}
                  </Text>
                  <Text style={[styles.locationLink, isMine && styles.myLocationLink]}>
                    Open in Maps
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {!!reactions.length && (
              <View style={styles.reactionRow}>
                {reactions.map((reaction) => (
                  <View
                    key={`${item?._id || "message"}-${reaction?.emoji || "reaction"}`}
                    style={[styles.reactionChip, isMine && styles.myReactionChip]}
                  >
                    <Text style={[styles.reactionText, { color: bubbleTextColor }]}>
                      {reaction?.emoji} {Array.isArray(reaction?.users) ? reaction.users.length : 0}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {isMine && seenCount > 0 ? (
              <Text style={styles.seenText}>Seen</Text>
            ) : null}
          </TouchableOpacity>
        </View>
      </Swipeable>
    );
  };

  // ─── Main render ──────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
      <StatusBar backgroundColor={chatHeaderTint} barStyle="light-content" />

      <View style={[styles.header, { backgroundColor: chatHeaderTint, borderBottomColor: `${colors.border}66`, paddingTop: 8 }]}>
        <TouchableOpacity style={styles.headerActionButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={20} color={headerIconColor} />
        </TouchableOpacity>

        {isGroupConversation ? (
          <TouchableOpacity
            style={styles.userInfo}
            activeOpacity={0.8}
            onPress={() => navigation.navigate("GroupDetailsScreen", { conversationId: currentConversationId })}
          >
            {groupMeta.groupAvatar ? (
              <Image
                source={{
                  uri: groupMeta.groupAvatar
                }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.groupAvatar}>
                <Icon name="people-outline" size={20} color="#fff" />
              </View>
            )}

            <View style={styles.headerTextBlock}>
              <Text style={styles.username} numberOfLines={1} ellipsizeMode="tail">
                {groupMeta.groupName || "Group chat"}
              </Text>
              <View style={styles.statusRow}>
                <View style={[styles.presenceDot, { backgroundColor: typingUserId ? "#22C55E" : "#7C869D" }]} />
                <Text style={[styles.status, { color: headerStatusColor }]} numberOfLines={1} ellipsizeMode="tail">
                  {groupPresenceText}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.userInfo}
            activeOpacity={0.7}
            onPress={() => navigation.navigate("ChatDetailsScreen", { userId, conversationId: currentConversationId })}
          >
            <Image
              source={{
                uri: user?.profilePic || DEFAULT_AVATAR_URL
              }}
              style={styles.avatar}
            />

            <View style={styles.headerTextBlock}>
              <Text style={styles.username} numberOfLines={1} ellipsizeMode="tail">
                {user?.username || user?.name || "Loading..."}
              </Text>
              <View style={styles.statusRow}>
                <View style={[styles.presenceDot, { backgroundColor: directPresenceText === "Away" ? "#F59E0B" : "#22C55E" }]} />
                <Text style={[styles.status, { color: headerStatusColor }]} numberOfLines={1} ellipsizeMode="tail">{directPresenceText}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.headerIcons}>
          {isGroupConversation ? (
            <>
              <TouchableOpacity
                style={styles.headerActionButton}
                onPress={() => startCallFlow("audio")}
              >
                <Icon name="call-outline" size={19} color={headerIconColor} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerActionButton}
                onPress={() => startCallFlow("video")}
              >
                <Icon name="videocam-outline" size={20} color={headerIconColor} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerActionButton}
                onPress={() => setShowAssistant(true)}
              >
                <Icon name="sparkles-outline" size={19} color={headerIconColor} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerActionButton}
                onPress={() => navigation.navigate("GroupDetailsScreen", { conversationId: currentConversationId })}
              >
                <Icon name="ellipsis-horizontal" size={20} color={headerIconColor} />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.headerActionButton}
                onPress={() => startCallFlow("audio")}
              >
                <Icon name="call-outline" size={19} color={headerIconColor} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerActionButton}
                onPress={() => startCallFlow("video")}
              >
                <Icon name="videocam-outline" size={20} color={headerIconColor} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerActionButton}
                onPress={() => setShowAssistant(true)}
              >
                <Icon name="sparkles-outline" size={19} color={headerIconColor} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerActionButton}
                onPress={() => navigation.navigate("ChatDetailsScreen", { userId, conversationId: currentConversationId })}
              >
                <Icon name="ellipsis-horizontal" size={20} color={headerIconColor} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {!isGroupConversation && conversationListing?.serviceName ? (
        <View style={[styles.listingBanner, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Icon name="briefcase-outline" size={15} color={colors.primary} />
          <Text style={[styles.listingBannerText, { color: colors.text }]} numberOfLines={1}>
            {conversationListing.sellerName
              ? `${conversationListing.sellerName} • ${conversationListing.serviceName}`
              : conversationListing.serviceName}
          </Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flexFill}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
        <View style={[styles.chatBackground, { backgroundColor: colors.surface }]}>
          {chatWallpaper ? (
            <Image
              source={{ uri: normalizeMediaUrl(chatWallpaper) }}
              style={styles.wallpaperBackground}
              resizeMode="cover"
            />
          ) : null}
          <FlatList
            ref={messageListRef}
            data={messages}
            extraData={messages}
            keyExtractor={(item) => getMessageRenderKey(item)}
            renderItem={renderMessage}
            onScrollToIndexFailed={handleScrollToIndexFailed}
            contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(20, 12 + insets.bottom) }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  initializeChat({ refresh: true }).catch((error) => {
                    console.log("Chat refresh error:", error);
                  });
                }}
                tintColor={colors.primary}
              />
            }
            ListHeaderComponent={
              pagination?.hasMore ? (
                <TouchableOpacity
                  style={styles.loadEarlierButton}
                  onPress={loadMoreMessages}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <ActivityIndicator color={PRIMARY} />
                  ) : (
                    <Text style={styles.loadEarlierText}>Load earlier messages</Text>
                  )}
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={
              loading ? null : (
                <View style={styles.emptyWrap}>
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>
                    {errorMessage ? "Conversation unavailable" : "No messages yet"}
                  </Text>
                  <Text style={[styles.emptyText, { color: colors.mutedText }]}>
                    {errorMessage || "Start the conversation here."}
                  </Text>
                </View>
              )
            }
          />
        </View>

        <Modal visible={showTools} transparent animationType="slide">
          <TouchableOpacity
            style={styles.modalOverlay}
            onPress={() => setShowTools(false)}
            activeOpacity={1}
          >
            <View style={styles.toolboxContainer}>
              <FlatList
                data={tools}
                numColumns={3}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.toolItem}
                    onPress={item.action}
                    disabled={uploading}
                  >
                    <View style={styles.toolIcon}>
                      <Icon name={item.icon} size={26} color="#fff" />
                    </View>
                    <Text style={styles.toolText}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </TouchableOpacity>
        </Modal>

        <Modal visible={showLocationComposer} transparent animationType="fade">
          <View style={styles.locationComposerOverlay}>
            <View style={styles.locationComposerCard}>
              <Text style={styles.locationComposerTitle}>Share location</Text>
              <Text style={styles.locationComposerText}>
                Enter a place, address, or landmark. We will send a Maps link in chat.
              </Text>
              <TextInput
                style={styles.locationComposerInput}
                value={locationDraft}
                onChangeText={setLocationDraft}
                placeholder="Coffee shop, MG Road, airport..."
                placeholderTextColor="#888"
                editable={!uploading}
              />
              <View style={styles.locationComposerActions}>
                <TouchableOpacity
                  style={styles.locationSecondaryButton}
                  onPress={() => {
                    setShowLocationComposer(false);
                    setLocationDraft("");
                  }}
                  disabled={uploading}
                >
                  <Text style={styles.locationSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.locationPrimaryButton}
                  onPress={sendLocationMessage}
                  disabled={uploading}
                >
                  {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.locationPrimaryText}>Send</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Sticker Picker */}
        <StickerPickerSheet
          visible={showStickerPicker}
          preferredMode={stickerPickerMode}
          onClose={() => setShowStickerPicker(false)}
          onSend={async (sticker) => {
            try {
              setUploading(true);
              if (sticker.emoji && !sticker.imageUrl) {
                await submitMessage({
                  text: sticker.emoji,
                  replyToMessageId: replyingToMessageId,
                  replyToMessage: replyingToMessage,
                });
                return;
              }

              const stickerText =
                sticker.type === "emoji"
                  ? ""
                  : sticker.type === "gif"
                    ? ""
                    : sticker.name || "Sticker";

              await submitMessage({
                text: stickerText,
                mediaUrl: normalizeMediaUrl(sticker.imageUrl),
                messageType: sticker.type === "gif" ? "gif" : "image",
                replyToMessageId: replyingToMessageId,
                replyToMessage: replyingToMessage,
              });
            } catch (err) {
              console.log("sticker send error:", err);
            } finally {
              setUploading(false);
            }
          }}
        />

        {/* Message Context Menu */}
        <MessageContextMenu
          visible={showContextMenu}
          message={contextMessage as any}
          isMine={String(typeof contextMessage?.sender === "object" ? contextMessage?.sender?._id : contextMessage?.sender) === String(currentUserId)}
          onClose={() => { setShowContextMenu(false); setContextMessage(null); }}
          onReact={reactToMessage}
          onReply={(message: ChatMessage) => {
            startReplyToMessage(message);
          }}
          onForward={(messageId: string) => {
            navigation.navigate("AllChatsScreen", {
              forwardMessageId: messageId,
              sourceConversationId: currentConversationId,
            });
          }}
          onMessageEdited={(data: any) => {
            setMessages((prev) =>
              prev.map((msg) =>
                String(msg?._id) === String(data.messageId)
                  ? { ...msg, text: data.text, isEdited: true, editedAt: data.editedAt }
                  : msg
              )
            );
          }}
          onMessageDeleted={(messageId: string) => {
            setMessages((prev) => prev.filter((msg) => String(msg?._id) !== String(messageId)));
          }}
        />

        <Modal
          visible={!!messagePreview}
          transparent
          animationType="fade"
          onRequestClose={() => setMessagePreview(null)}
        >
          <View style={styles.previewOverlay}>
            <TouchableOpacity
              style={styles.previewCloseButton}
              onPress={() => setMessagePreview(null)}
            >
              <Icon name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <Image
              source={{ uri: messagePreview?.imageUrl || "" }}
              style={styles.previewImage}
              resizeMode="contain"
            />
            {messagePreview?.title ? (
              <Text style={styles.previewCaption} numberOfLines={1}>
                {messagePreview.title}
              </Text>
            ) : null}
          </View>
        </Modal>

        <AISupportSheet
          visible={showAssistant}
          onClose={() => setShowAssistant(false)}
          scope={assistantScope}
          scopeHint={assistantScopeHint}
          conversationSummary={assistantConversationSummary}
          recentMessages={assistantRecentMessages}
          suggestedPrompts={assistantSuggestedPrompts}
        />

        <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: Math.max(10, insets.bottom) }]}>
          <TouchableOpacity
            style={[styles.composerActionButton, { backgroundColor: colors.surface }]}
            onPress={() => setShowTools(true)}
            disabled={uploading}
          >
            <Icon name="add" size={20} color={colors.primary} />
          </TouchableOpacity>

          <View style={[styles.inputBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {replyingToPreview ? (
              <View style={[styles.composerReplyCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <View style={[styles.composerReplyAccent, { backgroundColor: primaryThemeColor }]} />
                <View style={styles.composerReplyBody}>
                  <Text style={[styles.composerReplyLabel, { color: colors.text }]} numberOfLines={1}>
                    Replying to {replyingToPreview.author}
                  </Text>
                  <Text style={[styles.composerReplySnippet, { color: colors.mutedText }]} numberOfLines={1}>
                    {replyingToPreview.snippet}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setReplyingToMessage(null)}
                  disabled={sending || uploading}
                  style={styles.composerReplyClose}
                >
                  <Icon name="close" size={16} color={colors.mutedText} />
                </TouchableOpacity>
              </View>
            ) : null}

            {pendingAttachment ? (
              <View style={[styles.attachmentPreviewCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <View style={styles.attachmentPreviewBody}>
                  {pendingAttachment.kind === "image" ? (
                    <Image source={{ uri: pendingAttachment.uri }} style={styles.attachmentPreviewImage} />
                  ) : (
                    <View style={[styles.attachmentPreviewVideo, { backgroundColor: primaryThemeColor }]}>
                      <Icon name="videocam-outline" size={18} color="#fff" />
                    </View>
                  )}
                  <View style={styles.attachmentPreviewMeta}>
                    <Text style={[styles.attachmentPreviewTitle, { color: colors.text }]} numberOfLines={1}>
                      {pendingAttachment.kind === "image" ? "Image ready to send" : "Video ready to send"}
                    </Text>
                    <Text style={[styles.attachmentPreviewSubtitle, { color: colors.mutedText }]} numberOfLines={1}>
                      {pendingAttachment.name}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setPendingAttachment(null)}
                    disabled={uploading}
                    style={styles.attachmentPreviewClose}
                  >
                    <Icon name="close-circle" size={20} color={colors.mutedText} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
            {pendingVoiceNote ? (
              <View style={[styles.attachmentPreviewCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <View style={styles.pendingVoicePreview}>
                  <VoiceMessageBubble
                    audioUrl={pendingVoiceNote.uri}
                    durationSeconds={pendingVoiceNote.duration}
                    accentColor={primaryThemeColor}
                    backgroundColor={`${primaryThemeColor}10`}
                    textColor={colors.text}
                    metaColor={colors.mutedText}
                    label="Voice note preview"
                  />
                  <View style={styles.pendingVoiceActions}>
                    <TouchableOpacity
                      onPress={() => setPendingVoiceNote(null)}
                      disabled={uploading}
                      style={styles.pendingVoiceActionButton}
                    >
                      <Icon name="trash-outline" size={18} color={colors.mutedText} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : null}
            <View style={styles.composerRow}>
              <TextInput
                ref={messageInputRef}
                placeholder={uploading ? "Uploading attachment..." : pendingAttachment ? "Add a caption (optional)" : pendingVoiceNote ? "Voice note ready to send" : "Message"}
                placeholderTextColor={colors.placeholder}
                style={[styles.input, { color: colors.text }]}
                value={text}
                onChangeText={handleTextChange}
                editable={!sending && !uploading}
              />

              <View style={styles.inlineActions}>
                <TouchableOpacity
                  style={[styles.inlineActionIcon, styles.gifActionPill]}
                  onPress={() => {
                    setStickerPickerMode("gifs");
                    setShowStickerPicker(true);
                  }}
                  disabled={uploading}
                >
                  <Text style={styles.gifActionText}>GIF</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.inlineActionIcon}
                  onPress={() => {
                    setStickerPickerMode("emoji");
                    setShowStickerPicker(true);
                  }}
                  disabled={uploading}
                >
                  <Icon name="happy-outline" size={19} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.inlineActionIcon} onPress={sendDocumentAttachment} disabled={uploading}>
                  <Icon name="document-outline" size={19} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.inlineActionIcon} onPress={sendImageAttachment} disabled={uploading}>
                  <Icon name="image-outline" size={19} color={primaryThemeColor} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {uploading ? (
            <ActivityIndicator color={colors.primary} />
          ) : text.length > 0 || pendingAttachment || pendingVoiceNote ? (
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: colors.primary }]}
              onPress={pendingAttachment ? sendPendingAttachment : pendingVoiceNote ? sendPendingVoiceMessage : sendTextMessage}
              disabled={sending}
            >
              <Icon name="send" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            <VoiceRecorderButton
              color={primaryThemeColor}
              disabled={uploading}
              onSend={sendVoiceMessage}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ChatScreen;

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff"
  },
  flexFill: {
    flex: 1,
  },
  listingBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listingBannerText: {
    marginLeft: 8,
    fontSize: 12.5,
    fontWeight: "600",
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 12,
    flex: 1
  },
  headerTextBlock: {
    flexShrink: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12
  },
  groupAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#7b3fe4"
  },
  username: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700"
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 7,
  },
  status: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  headerIcons: {
    flexDirection: "row",
    alignItems: "center"
  },
  headerActionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  chatBackground: {
    flex: 1
  },
  wallpaperBackground: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.16,
  },
  listContent: {
    padding: 12
  },
  loadEarlierButton: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 999,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  loadEarlierText: {
    color: PRIMARY,
    fontWeight: "600"
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingTop: 72,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyText: {
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  messageRow: {
    flexDirection: "row",
    width: "100%",
    marginVertical: 4
  },
  swipeReplyAction: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PRIMARY,
    marginLeft: 12,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  swipeReplyActionMine: {
    marginLeft: 0,
    marginRight: 12,
  },
  swipeReplyText: {
    marginLeft: 6,
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  messageBubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: "80%",
    minWidth: 86,
    flexShrink: 1,
  },
  messageBubbleWide: {
    maxWidth: "92%",
    paddingHorizontal: 10,
  },
  messageBubbleHighlighted: {
    shadowColor: PRIMARY,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  replyPreviewCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    padding: 8,
    borderRadius: 12,
    backgroundColor: "rgba(123, 63, 228, 0.1)",
    maxWidth: "100%",
  },
  replyPreviewCardMine: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  replyPreviewBar: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 999,
    backgroundColor: PRIMARY,
    marginRight: 8,
  },
  replyPreviewBarMine: {
    backgroundColor: "#fff",
  },
  replyPreviewBody: {
    flex: 1,
    minWidth: 0,
  },
  replyPreviewAuthor: {
    color: PRIMARY,
    fontSize: 12,
    fontWeight: "800",
  },
  replyPreviewAuthorMine: {
    color: "#fff",
  },
  replyPreviewSnippet: {
    marginTop: 2,
    color: "#475467",
    fontSize: 12,
    flexShrink: 1,
  },
  replyPreviewSnippetMine: {
    color: "rgba(255,255,255,0.82)",
  },
  sharedPostCard: {
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    backgroundColor: "rgba(123, 63, 228, 0.08)",
    width: "100%",
    minWidth: 260,
  },
  sharedPostCardMine: {
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  sharedPostHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  sharedPostAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  sharedPostMeta: {
    marginLeft: 8,
    flex: 1,
  },
  sharedPostAuthor: {
    color: "#111827",
    fontSize: 12.5,
    fontWeight: "700",
  },
  sharedPostAuthorMine: {
    color: "#fff",
  },
  sharedPostLabel: {
    marginTop: 1,
    color: "#667085",
    fontSize: 11,
    fontWeight: "600",
  },
  sharedPostLabelMine: {
    color: "rgba(255,255,255,0.78)",
  },
  sharedPostImage: {
    width: "100%",
    height: 160,
    borderRadius: 12,
    marginTop: 10,
  },
  sharedPostCaption: {
    marginTop: 10,
    color: "#344054",
    fontSize: 12.5,
    lineHeight: 18,
  },
  sharedPostCaptionMine: {
    color: "rgba(255,255,255,0.92)",
  },
  callEventCard: {
    width: "100%",
    minWidth: 220,
    borderRadius: 14,
    padding: 10,
    marginBottom: 6,
    backgroundColor: "rgba(123, 63, 228, 0.08)",
    flexDirection: "row",
    alignItems: "center",
  },
  callEventCardMine: {
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  callEventIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(123, 63, 228, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  callEventIconMine: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  callEventBody: {
    flex: 1,
    marginLeft: 10,
    minWidth: 0,
  },
  callEventTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
  },
  callEventTitleMine: {
    color: "#fff",
  },
  callEventMeta: {
    marginTop: 2,
    color: "#667085",
    fontSize: 11.5,
  },
  callEventMetaMine: {
    color: "rgba(255,255,255,0.82)",
  },
  messageText: {
    fontSize: 15,
    color: "#111"
  },
  myMessageText: {
    color: "#fff"
  },
  myMessage: {
    backgroundColor: PRIMARY
  },
  otherMessage: {
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.08)",
  },
  messageImage: {
    width: 220,
    height: 220,
    borderRadius: 12,
    marginBottom: 8
  },
  documentCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
    marginBottom: 6
  },
  documentName: {
    marginLeft: 8,
    color: PRIMARY,
    fontWeight: "600",
    maxWidth: 180,
    flexShrink: 1,
  },
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    borderRadius: 12,
    padding: 10,
    backgroundColor: "rgba(123, 63, 228, 0.08)",
  },
  myLocationCard: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  locationBody: {
    marginLeft: 8,
    flex: 1,
  },
  locationTitle: {
    color: "#111",
    fontWeight: "700",
  },
  myLocationTitle: {
    color: "#fff",
  },
  locationLink: {
    marginTop: 2,
    color: PRIMARY,
    fontSize: 12,
    fontWeight: "600",
  },
  myLocationLink: {
    color: "#ede9fe",
  },
  reactionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8
  },
  reactionChip: {
    backgroundColor: "rgba(123, 63, 228, 0.12)",
    borderRadius: 999,
    marginRight: 6,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  myReactionChip: {
    backgroundColor: "rgba(255,255,255,0.22)"
  },
  reactionText: {
    color: "#1f1f1f",
    fontSize: 12,
    fontWeight: "600"
  },
  seenText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    marginTop: 8
  },
  myDocumentName: {
    color: "#fff"
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingTop: 10,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee"
  },
  composerActionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  inputBox: {
    flex: 1,
    backgroundColor: "#f2f2f2",
    borderRadius: 22,
    marginHorizontal: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  composerReplyCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  composerReplyAccent: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 999,
    marginRight: 8,
  },
  composerReplyBody: {
    flex: 1,
  },
  composerReplyLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  composerReplySnippet: {
    marginTop: 2,
    fontSize: 12,
  },
  composerReplyClose: {
    marginLeft: 10,
    padding: 2,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 0,
    paddingRight: 6,
    fontSize: 13,
  },
  attachmentPreviewCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 8,
    marginBottom: 8,
  },
  attachmentPreviewBody: {
    flexDirection: "row",
    alignItems: "center",
  },
  attachmentPreviewImage: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  attachmentPreviewVideo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentPreviewMeta: {
    flex: 1,
    marginLeft: 10,
  },
  pendingVoicePreview: {
    flexDirection: "row",
    alignItems: "center",
  },
  pendingVoiceActions: {
    marginLeft: 10,
  },
  pendingVoiceActionButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentPreviewTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  attachmentPreviewSubtitle: {
    marginTop: 2,
    fontSize: 11,
  },
  attachmentPreviewClose: {
    marginLeft: 8,
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.96)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  previewCloseButton: {
    position: "absolute",
    top: 48,
    right: 18,
    zIndex: 2,
    padding: 6,
  },
  previewImage: {
    width: "100%",
    height: "78%",
  },
  previewCaption: {
    marginTop: 16,
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  sendBtn: {
    backgroundColor: PRIMARY,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginLeft: 4,
  },
  inlineActionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
    backgroundColor: "rgba(123,63,228,0.08)",
  },
  gifActionPill: {
    width: "auto",
    minWidth: 38,
    paddingHorizontal: 9,
  },
  gifActionText: {
    fontSize: 11,
    fontWeight: "800",
    color: PRIMARY,
    letterSpacing: 0.4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "flex-end"
  },
  toolboxContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 25,
    paddingBottom: 40,
    paddingHorizontal: 10
  },
  toolItem: {
    flex: 1,
    alignItems: "center",
    marginBottom: 22
  },
  toolIcon: {
    backgroundColor: PRIMARY,
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8
  },
  toolText: {
    color: "#444",
    fontSize: 13
  },
  locationComposerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  locationComposerCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
  },
  locationComposerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111",
  },
  locationComposerText: {
    marginTop: 8,
    color: "#555",
    lineHeight: 20,
  },
  locationComposerInput: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    color: "#111",
  },
  locationComposerActions: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  locationSecondaryButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
    backgroundColor: "#f3f4f6",
  },
  locationSecondaryText: {
    color: "#111",
    fontWeight: "700",
  },
  locationPrimaryButton: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: PRIMARY,
    minWidth: 72,
    alignItems: "center",
  },
  locationPrimaryText: {
    color: "#fff",
    fontWeight: "700",
  },
});
