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
  Alert,
  ActivityIndicator,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
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
  getAttachmentDisplayName,
  getMessageAttachment,
  getMessageSenderId,
  getMessageText,
  isAudioMessage,
  isDocumentMessage,
  isImageMessage,
  isVideoMessage,
} from "../utils/chatPresentation";
import {
  createChatConversation,
  fetchChatConversationDetails,
  fetchConversationMessages,
  sendChatMessage,
} from "../utils/chatApi";
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
import MessageContextMenu from "../components/chat/MessageContextMenu";
import StickerPickerSheet from "../components/chat/StickerPickerSheet";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { ensureCameraPermission } from "../utils/permissions";
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
  sender?: string | { _id?: string; id?: string };
  isEdited?: boolean;
  editedAt?: string;
  isDeleted?: boolean;
  seenBy?: Array<{ userId?: string; seenAt?: string }>;
  reactions?: Array<{ emoji?: string; users?: string[] }>;
  createdAt?: string;
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
}

interface VoiceFile {
  uri: string;
  name: string;
  type: string;
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
  const [typingUserId, setTypingUserId] = useState("");
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
  const [contextMessage, setContextMessage] = useState<ChatMessage | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);

  // ─── Data fetching ──────────────────────────────────────────────────────

  const fetchUser = useCallback(async () => {
    if (!userId) {
      setUser(null);
      return;
    }

    try {
      const res = await API.get(`/auth/user/${userId}`);
      setUser(res.data.user);
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
        await connectSocket();
        socket.emit("joinConversation", resolvedConversationId);
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

  const startCallFlow = useCallback(async () => {
    if (!productFlags.callingInConsumerApp) {
      Alert.alert("Coming soon", callingDisabledMessage);
      return;
    }
  }, []);

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
      mergeMessage(message);
    };

    const handleTyping = (data: any) => {
      const nextUserId = String(data?.userId || "");
      if (nextUserId && nextUserId !== String(currentUserId || "")) {
        setTypingUserId(nextUserId);
      }
    };

    const handleStopTyping = (data: any) => {
      const nextUserId = String(data?.userId || "");
      setTypingUserId((prev) => (prev === nextUserId ? "" : prev));
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

    socket.on("receiveMessage", handleReceiveMessage);
    socket.on("typing", handleTyping);
    socket.on("stopTyping", handleStopTyping);
    socket.on("messageSeen", handleMessageSeen);
    socket.on("messageReaction", handleMessageReaction);
    socket.on("messageEdited", handleMessageEdited);
    socket.on("chatThemeChanged", handleChatThemeChanged);

    return () => {
      socket.off("receiveMessage", handleReceiveMessage);
      socket.off("typing", handleTyping);
      socket.off("stopTyping", handleStopTyping);
      socket.off("messageSeen", handleMessageSeen);
      socket.off("messageReaction", handleMessageReaction);
      socket.off("messageEdited", handleMessageEdited);
      socket.off("chatThemeChanged", handleChatThemeChanged);
    };
  }, [applyMessageReaction, applyMessageSeen, currentUserId, mergeMessage]);

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

    const joinConversation = async () => {
      await connectSocket();
      socket.emit("joinConversation", currentConversationId);
    };

    joinConversation().catch((error) => {
      console.log("Join conversation error:", error);
    });
  }, [currentConversationId]);

  // ─── Message actions ──────────────────────────────────────────────────────

  const submitMessage = useCallback(async ({ text: nextText, file, mediaUrl, messageType }: SubmitMessageParams) => {
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
    });

    if (res?.message) {
      mergeMessage(res.message);
      await connectSocket();
      socket.emit("sendMessage", {
        conversationId: resolvedConversationId,
        message: res.message
      });
    }
  }, [ensureConversation, mergeMessage]);

  const sendTextMessage = useCallback(async () => {
    if (!text.trim() || sending) {
      return;
    }

    try {
      setSending(true);
      await submitMessage({ text: text.trim() });
      setText("");
    } catch (err: any) {
      console.log("Send message error:", err?.response?.data || err);
      Alert.alert("Error", getReadableApiErrorMessage(err, "Failed to send message"));
    } finally {
      setSending(false);
    }
  }, [sending, submitMessage, text]);

  const primaryThemeColor = useMemo(() => {
    return CHAT_THEME_LIST.find(t => t.id === chatTheme)?.sentBubble[0] || PRIMARY;
  }, [chatTheme]);

  const sendImageAttachment = useCallback(async () => {
    launchImageLibrary(
      {
        mediaType: "mixed",
        selectionLimit: 1
      },
      async (response) => {
        if (response?.didCancel) return;
        if (response?.errorCode) {
          Alert.alert("Error", "Image pick failed");
          return;
        }

        const asset = response.assets?.[0];
        if (!asset?.uri) {
          return;
        }

        try {
          setUploading(true);
          await submitMessage({
            text: text.trim(),
            file: {
              uri: asset.uri,
              name: asset.fileName || `media_${Date.now()}`,
              type: asset.type || "application/octet-stream",
            }
          });
          setText("");
          setShowTools(false);
        } catch (error: any) {
          console.log("image message send error:", error);
          Alert.alert("Error", getReadableApiErrorMessage(error, "Failed to send attachment"));
        } finally {
          setUploading(false);
        }
      }
    );
  }, [submitMessage, text]);

  const sendCameraAttachment = useCallback(async () => {
    const hasPermission = await ensureCameraPermission();
    if (!hasPermission) {
      Alert.alert("Camera permission needed", "Allow camera access to capture and send a photo or video.");
      return;
    }

    launchCamera(
      {
        mediaType: "mixed",
        saveToPhotos: false,
        videoQuality: "high",
      },
      async (response) => {
        if (response?.didCancel) return;
        if (response?.errorCode) {
          Alert.alert("Error", response.errorMessage || "Camera capture failed");
          return;
        }

        const asset = response.assets?.[0];
        if (!asset?.uri) {
          return;
        }

        try {
          setUploading(true);
          await submitMessage({
            text: text.trim(),
            file: {
              uri: asset.uri,
              name: asset.fileName || `camera_${Date.now()}`,
              type: asset.type || "application/octet-stream",
            }
          });
          setText("");
          setShowTools(false);
        } catch (error: any) {
          console.log("camera message send error:", error);
          Alert.alert("Error", getReadableApiErrorMessage(error, "Failed to send camera capture"));
        } finally {
          setUploading(false);
        }
      }
    );
  }, [submitMessage, text]);

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
        }
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
  }, [submitMessage, text]);

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
        }
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
  }, [submitMessage, text]);

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
  }, [locationDraft, submitMessage]);

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
    if (!currentConversationId || !messageId) {
      return;
    }

    connectSocket()
      .then(() => {
        socket.emit("reactMessage", {
          conversationId: currentConversationId,
          messageId,
          emoji,
        });
        applyMessageReaction({
          messageId,
          userId: currentUserId,
          emoji,
        });
      })
      .catch((error: any) => {
        console.log("Message reaction emit error:", error);
      });
  }, [applyMessageReaction, currentConversationId, currentUserId]);

  // ─── Render message ───────────────────────────────────────────────────────

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMine = String(getMessageSenderId(item)) === String(currentUserId || "");
    const attachment: MessageAttachment | null = getMessageAttachment(item);
    const textValue = getMessageText(item);
    const locationPayload = parseLocationMessage(textValue);
    const seenCount = Array.isArray(item?.seenBy) ? item.seenBy.length : 0;
    const reactions = Array.isArray(item?.reactions) ? item.reactions : [];

    return (
      <View
        style={[
          styles.messageRow,
          isMine ? { justifyContent: "flex-end" } : { justifyContent: "flex-start" }
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.92}
          onLongPress={() => {
            setContextMessage(item);
            setShowContextMenu(true);
          }}
          style={[
            styles.messageBubble,
            isMine ? [styles.myMessage, { backgroundColor: primaryThemeColor }] : styles.otherMessage
          ]}
        >
          {isImageMessage(item) && attachment?.url ? (
            <Image source={{ uri: normalizeMediaUrl(attachment.url) }} style={styles.messageImage} />
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

          {isAudioMessage(item) && attachment?.url ? (
            <View style={styles.documentCard}>
              <Icon name="musical-notes-outline" size={20} color={isMine ? "#fff" : PRIMARY} />
              <Text style={[styles.documentName, isMine && styles.myDocumentName]} numberOfLines={1}>
                {getAttachmentDisplayName(item)}
              </Text>
            </View>
          ) : null}

          {isDocumentMessage(item) && attachment?.url ? (
            <View style={styles.documentCard}>
              <Icon name="document-text-outline" size={20} color={isMine ? "#fff" : PRIMARY} />
              <Text style={[styles.documentName, isMine && styles.myDocumentName]} numberOfLines={1}>
                {getAttachmentDisplayName(item)}
              </Text>
            </View>
          ) : null}

          {/* Voice message rendering */}
          {item?.messageType === "voice" && attachment?.url ? (
            <View style={styles.documentCard}>
              <Icon name="mic-outline" size={20} color={isMine ? "#fff" : PRIMARY} />
              <Text style={[styles.documentName, isMine && styles.myDocumentName]} numberOfLines={1}>
                Voice message {item?.duration ? `(${item.duration}s)` : ""}
              </Text>
            </View>
          ) : null}

          {!locationPayload && !!textValue && (
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
              onPress={() => {
                Linking.openURL(locationPayload.url).catch((error) => {
                  console.log("Open location error:", error);
                  Alert.alert("Unable to open map", "Please try again.");
                });
              }}
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
                  <Text style={styles.reactionText}>
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
    );
  };

  // ─── Main render ──────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
      <StatusBar backgroundColor={primaryThemeColor} barStyle="light-content" />

      <View style={[styles.header, { backgroundColor: primaryThemeColor, paddingTop: Math.max(insets.top, 14) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#fff" />
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

            <View>
              <Text style={styles.username}>
                {groupMeta.groupName || "Group chat"}
              </Text>
              <Text style={styles.status}>
                {typingUserId ? "Typing..." : `${groupMeta.memberCount || 0} members`}
              </Text>
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

            <View>
              <Text style={styles.username}>
                {user?.username || user?.name || "Loading..."}
              </Text>
              <Text style={styles.status}>{typingUserId ? "Typing..." : "Conversation"}</Text>
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.headerIcons}>
          {isGroupConversation ? (
            <>
              <TouchableOpacity
                style={styles.headerIconButton}
                onPress={startCallFlow}
              >
                <Icon name="call-outline" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerIconButton}
                onPress={startCallFlow}
              >
                <Icon name="videocam-outline" size={22} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate("GroupDetailsScreen", { conversationId: currentConversationId })}>
                <Icon name="ellipsis-vertical" size={20} color="#fff" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.headerIconButton}
                onPress={startCallFlow}
              >
                <Icon name="call-outline" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerIconButton}
                onPress={startCallFlow}
              >
                <Icon name="videocam-outline" size={22} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate("ChatDetailsScreen", { userId, conversationId: currentConversationId })}>
                <Icon name="ellipsis-vertical" size={20} color="#fff" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flexFill}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
        <View style={[styles.chatBackground, { backgroundColor: colors.surface }]}>
          <FlatList
            data={messages}
            extraData={messages}
            keyExtractor={(item) => getMessageRenderKey(item)}
            renderItem={renderMessage}
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
          onClose={() => setShowStickerPicker(false)}
          onSend={async (sticker) => {
            try {
              setUploading(true);
              await submitMessage({
                text: sticker.name || "Sticker",
                mediaUrl: sticker.imageUrl,
                messageType: "image"
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
          currentUserId={currentUserId}
          onClose={() => { setShowContextMenu(false); setContextMessage(null); }}
          onReact={reactToMessage}
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

        <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: Math.max(6, insets.bottom) }]}>
          <TouchableOpacity onPress={() => setShowTools(true)} disabled={uploading}>
            <Icon name="add" size={28} color={colors.primary} />
          </TouchableOpacity>

          <View style={[styles.inputBox, { backgroundColor: colors.surface }]}>
            <TextInput
              placeholder={uploading ? "Uploading attachment..." : "Message"}
              placeholderTextColor={colors.placeholder}
              style={[styles.input, { color: colors.text }]}
              value={text}
              onChangeText={handleTextChange}
              editable={!sending && !uploading}
            />
          </View>

          {uploading ? (
            <ActivityIndicator color={colors.primary} />
          ) : text.length > 0 ? (
            <TouchableOpacity style={[styles.sendBtn, { backgroundColor: colors.primary }]} onPress={sendTextMessage} disabled={sending}>
              <Icon name="send" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            <View style={styles.inlineActions}>
              <TouchableOpacity style={{ marginRight: 12 }} onPress={() => setShowStickerPicker(true)}>
                <Icon name="happy-outline" size={24} color={colors.primary} />
              </TouchableOpacity>

              <TouchableOpacity style={{ marginRight: 12 }} onPress={sendImageAttachment}>
                <Icon name="image" size={24} color={primaryThemeColor} />
              </TouchableOpacity>

              <VoiceRecorderButton
                color={primaryThemeColor}
                disabled={uploading}
                onSend={async (voiceFile: VoiceFile) => {
                  try {
                    setUploading(true);
                    const formData = new FormData();
                    const resolvedConversationId = await ensureConversation();
                    formData.append("conversationId", resolvedConversationId as string);
                    formData.append("messageType", "voice");
                    formData.append("file", {
                      uri: voiceFile.uri,
                      name: voiceFile.name,
                      type: voiceFile.type,
                    } as any);
                    const res = await API.post("/message/send", formData, {
                      headers: { "Content-Type": "multipart/form-data" },
                    });
                    if (res.data?.message) {
                      mergeMessage(res.data.message);
                      await connectSocket();
                      socket.emit("sendMessage", {
                        conversationId: resolvedConversationId,
                        message: res.data.message,
                      });
                    }
                  } catch (err) {
                    console.log("voice send error:", err);
                    Alert.alert("Error", "Failed to send voice message");
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </View>
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
  header: {
    backgroundColor: PRIMARY,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 15
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 12,
    flex: 1
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10
  },
  groupAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6d28d9"
  },
  username: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600"
  },
  status: {
    color: "#e6d9ff",
    fontSize: 12
  },
  headerIcons: {
    flexDirection: "row",
    alignItems: "center"
  },
  headerIconButton: {
    marginRight: 14,
  },
  chatBackground: {
    flex: 1
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
    marginVertical: 4
  },
  messageBubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: "78%",
    alignSelf: "flex-start",
    flexShrink: 1,
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
    backgroundColor: "#fff"
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
    maxWidth: 180
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
    padding: 10,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: "#eee"
  },
  inputBox: {
    flex: 1,
    backgroundColor: "#f2f2f2",
    borderRadius: 25,
    marginHorizontal: 10,
    paddingHorizontal: 15
  },
  input: {
    height: 40,
    paddingVertical: 0,
  },
  sendBtn: {
    backgroundColor: PRIMARY,
    padding: 10,
    borderRadius: 25
  },
  inlineActions: {
    flexDirection: "row"
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
