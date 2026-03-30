import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { launchCamera, launchImageLibrary } from "react-native-image-picker";
import {
  errorCodes,
  isErrorWithCode,
  keepLocalCopy,
  pick,
  types,
  type DocumentPickerResponse,
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
  formatPrimaryServicePrice,
  getPrimaryPricingOption,
  getServicePricingOptions,
} from "../utils/servicePricing";
import {
  createChatConversation,
  fetchConversationMessages,
  sendChatMessage,
} from "../utils/chatApi";
import {
  getLastIncomingUnseenMessage,
  mergeMessageReaction,
  mergeMessageSeen,
} from "../utils/chatRealtime";

const PRIMARY = "#7B4DFF";
const DEFAULT_AVATAR = "https://cdn-icons-png.flaticon.com/512/149/149071.png";

type SellerProfile = {
  _id: string;
  user?: string | { _id?: string };
  sellerName?: string;
  profilePic?: string;
  availabilityStatus?: boolean;
};

type AttachmentShape = {
  url?: string;
  fileName?: string;
  mimeType?: string;
  thumbnailUrl?: string;
};

type ChatMessage = {
  _id: string;
  text?: string;
  messageType?: string;
  attachment?: AttachmentShape;
  sender?: string | { _id?: string };
  seenBy?: Array<{ userId?: string; seenAt?: string }>;
  reactions?: Array<{ emoji?: string; users?: string[] }>;
};

type SellerService = {
  _id: string;
  serviceName?: string;
  pricePerMin?: number;
  pricePerHour?: number;
  pricePerMsg?: number;
  pricePerSession?: number;
  packagePrice?: number;
  pricingModel?: string;
  pricingOptions?: Array<{
    model?: string;
    label?: string;
    amount?: number;
    isDefault?: boolean;
    durationMinutes?: number;
  }>;
  currency?: string;
  sessionDurationMinutes?: number;
};

type AppointmentSlot = {
  start: string;
  end?: string;
  timeZone?: string;
  label?: string;
  durationMinutes?: number;
};

type PickedDocument = {
  uri: string;
  name?: string | null;
  type?: string | null;
};

const FALLBACK_TIME_ZONE = "Asia/Kolkata";

const getLocalTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIME_ZONE;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
};

const buildSuggestedAppointmentSlots = (): AppointmentSlot[] => {
  const slots: AppointmentSlot[] = [];
  const cursor = new Date();
  cursor.setMinutes(0, 0, 0);
  cursor.setHours(cursor.getHours() + 2);

  while (slots.length < 6) {
    const hour = cursor.getHours();

    if (hour >= 10 && hour <= 19) {
      const start = new Date(cursor);
      slots.push({
        start: start.toISOString(),
        label: formatAppointmentSlotLabel(start.toISOString()),
        timeZone: getLocalTimeZone(),
      });
      cursor.setHours(cursor.getHours() + 3);
      continue;
    }

    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(10, 0, 0, 0);
  }

  return slots;
};

const formatAppointmentSlotLabel = (isoValue: string) =>
  new Date(isoValue).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const getDocumentPickerMessage = (error: unknown): string => {
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

const getRequestErrorMessage = (error: any, fallbackMessage: string): string =>
  error?.response?.data?.message || error?.message || fallbackMessage;

const SellerChatScreen = ({ route, navigation }: any) => {
  const {
    sellerId,
    sellerUserId: initialSellerUserId,
    conversationId,
    serviceId,
    serviceName
  } = route.params || {};

  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(conversationId || null);
  const [conversationServiceId, setConversationServiceId] = useState<string | null>(serviceId || null);
  const [services, setServices] = useState<SellerService[]>([]);
  const [selectedService, setSelectedService] = useState<SellerService | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedAppointmentStart, setSelectedAppointmentStart] = useState("");
  const [appointmentSlots, setAppointmentSlots] = useState<AppointmentSlot[]>([]);
  const [loadingAppointmentSlots, setLoadingAppointmentSlots] = useState(false);
  const [appointmentSlotFallback, setAppointmentSlotFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagination, setPagination] = useState({ nextCursor: null, hasMore: false, limit: 30 });
  const [typingUserId, setTypingUserId] = useState("");
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const quickOptions = useMemo(
    () => [
      "I want to book",
      "What are your charges?",
      "Are you available?",
      "Please share the next steps"
    ],
    []
  );

  const sellerUserId = useMemo(() => {
    if (initialSellerUserId) {
      return initialSellerUserId;
    }

    if (!seller?.user) {
      return null;
    }

    return typeof seller.user === "string" ? seller.user : seller.user._id || null;
  }, [initialSellerUserId, seller]);

  const fetchSeller = useCallback(async () => {
    const token = await AsyncStorage.getItem("token");
    const res = await API.get(`/seller/${sellerId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setSeller(res.data.seller);
    return res.data.seller as SellerProfile;
  }, [sellerId]);

  const fetchServices = useCallback(async () => {
    const token = await AsyncStorage.getItem("token");
    const res = await API.get(`/service/seller/${sellerId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const nextServices = res.data.services || [];
    setServices(nextServices);

    if (serviceId) {
      const matchedService = nextServices.find((item: SellerService) => item._id === serviceId) || null;
      setSelectedService(matchedService);
    } else if (nextServices.length > 0) {
      setSelectedService(nextServices[0]);
    }
  }, [sellerId, serviceId]);

  const fetchBookingSlots = useCallback(async () => {
    try {
      setLoadingAppointmentSlots(true);
      const targetServiceId = selectedService?._id || serviceId || undefined;
      const res = await API.get(`/seller/${sellerId}/slots`, {
        params: {
          serviceId: targetServiceId,
        },
      });

      const nextSlots = Array.isArray(res?.data?.slots) ? (res.data.slots as AppointmentSlot[]) : [];
      setAppointmentSlotFallback(false);
      setAppointmentSlots(nextSlots);
    } catch (error) {
      console.log("seller slot fetch error:", error);
      setAppointmentSlotFallback(true);
      setAppointmentSlots(buildSuggestedAppointmentSlots());
    } finally {
      setLoadingAppointmentSlots(false);
    }
  }, [selectedService?._id, sellerId, serviceId]);

  const fetchMessages = useCallback(async (targetConversationId: string, options: { cursor?: string | null; append?: boolean; limit?: number } = {}) => {
    const data = await fetchConversationMessages(targetConversationId, {
      cursor: options.cursor,
      limit: options.limit || 30,
    });
    const nextMessages = data?.messages || [];
    setPagination(data?.pagination || { nextCursor: null, hasMore: false, limit: 30 });
    setMessages((prev) => (options.append ? [...nextMessages, ...prev] : nextMessages));
  }, []);

  const resolveConversation = useCallback(async (targetServiceId?: string | null, options: { force?: boolean } = {}) => {
    if (!sellerUserId) {
      return null;
    }

    const normalizedServiceId = targetServiceId || null;

    if (currentConversationId && !options.force && conversationServiceId === normalizedServiceId) {
      return currentConversationId;
    }

    const res = await createChatConversation({
      receiverId: sellerUserId,
      conversationType: "seller",
      serviceId: normalizedServiceId || undefined,
    });

    const nextConversationId = res?.conversation?._id || null;

    if (nextConversationId) {
      setCurrentConversationId(nextConversationId);
      setConversationServiceId(normalizedServiceId);
    }

    return nextConversationId;
  }, [conversationServiceId, currentConversationId, sellerUserId]);

  const ensureConversation = useCallback(async () => {
    const targetServiceId = selectedService?._id || serviceId || null;
    return resolveConversation(targetServiceId, {
      force: conversationServiceId !== targetServiceId,
    });
  }, [conversationServiceId, resolveConversation, selectedService?._id, serviceId]);

  const appendMessage = useCallback((nextMessage: ChatMessage) => {
    setMessages((prev) => {
      const exists = prev.some((item) => item._id === nextMessage._id);
      return exists ? prev : [...prev, nextMessage];
    });
  }, []);

  const applyMessageSeen = useCallback((payload: { messageId?: string; userId?: string; seenAt?: string }) => {
    setMessages((prev) => mergeMessageSeen(prev, payload) as ChatMessage[]);
  }, []);

  const applyMessageReaction = useCallback((payload: { messageId?: string; userId?: string; emoji?: string }) => {
    setMessages((prev) => mergeMessageReaction(prev, payload) as ChatMessage[]);
  }, []);

  const submitMessage = useCallback(async ({ text: nextText, file }: { text?: string; file?: { uri: string; name?: string | null; type?: string | null } }) => {
    const resolvedConversationId = await ensureConversation();

    if (!resolvedConversationId) {
      Alert.alert("Unavailable", "Seller chat is not ready yet for this profile.");
      return;
    }

    const res = await sendChatMessage({
      conversationId: resolvedConversationId,
      text: nextText,
      file,
    });

    const nextMessage = res.message as ChatMessage;
    appendMessage(nextMessage);

    await connectSocket();
    socket.emit("sendMessage", {
      conversationId: resolvedConversationId,
      message: nextMessage
    });
  }, [appendMessage, ensureConversation]);

  const sendMessage = useCallback(async (msgText = text) => {
    if (!msgText.trim() || sending) {
      return;
    }

    try {
      setSending(true);
      await submitMessage({ text: msgText.trim() });
      setText("");
    } catch (error) {
      console.log("seller chat send error:", error);
      Alert.alert("Error", getRequestErrorMessage(error, "Failed to send message"));
    } finally {
      setSending(false);
    }
  }, [sending, submitMessage, text]);

  const sendBookingRequest = useCallback(async () => {
    const targetService = selectedService;

    if (!targetService) {
      return;
    }

    try {
      const resolvedConversationId = await ensureConversation();
      const pricingModel = getPrimaryPricingOption(targetService)?.model;
      const res = await API.post("/service-requests", {
        serviceId: targetService._id,
        conversationId: resolvedConversationId || undefined,
        pricingModel,
        note: text.trim() || `Request for ${targetService.serviceName || serviceName || "service"}`,
        appointmentStart: selectedAppointmentStart || undefined,
        appointmentTimezone: getLocalTimeZone(),
      });

      if (res?.data?.systemMessage) {
        appendMessage(res.data.systemMessage as ChatMessage);
        if (resolvedConversationId) {
          await connectSocket();
          socket.emit("sendMessage", {
            conversationId: resolvedConversationId,
            message: res.data.systemMessage
          });
        }
      }

      setShowPaymentModal(false);
      setSelectedAppointmentStart("");
      setText("");
      Alert.alert("Appointment Requested", "Your appointment request has been sent to the seller for confirmation.");
    } catch (error: any) {
      console.log("seller booking request error:", error?.response?.data || error);
      Alert.alert("Error", error?.response?.data?.message || "Failed to create service request");
    }
  }, [appendMessage, ensureConversation, selectedAppointmentStart, selectedService, serviceName, text]);

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
        } catch (error) {
          console.log("seller image send error:", error);
          Alert.alert("Error", getRequestErrorMessage(error, "Failed to send attachment"));
        } finally {
          setUploading(false);
        }
      }
    );
  }, [submitMessage, text]);

  const sendCameraAttachment = useCallback(async () => {
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
        } catch (error) {
          console.log("seller camera send error:", error);
          Alert.alert("Error", getRequestErrorMessage(error, "Failed to send camera capture"));
        } finally {
          setUploading(false);
        }
      }
    );
  }, [submitMessage, text]);

  const normalizePickedDocument = useCallback(async (file: DocumentPickerResponse): Promise<PickedDocument> => {
    const fileName = file.name || `document_${Date.now()}`;

    if (file.isVirtual || String(file.uri || "").startsWith("content://")) {
      const [localCopy] = await keepLocalCopy({
        destination: "cachesDirectory",
        files: [
          {
            uri: file.uri,
            fileName,
            convertVirtualFileToType: file.convertibleToMimeTypes?.[0]?.mimeType,
          },
        ],
      });

      if (!localCopy || localCopy.status !== "success") {
        throw new Error(localCopy?.copyError || "Unable to access the selected document.");
      }

      return {
        uri: localCopy.localUri,
        name: fileName,
        type: file.type,
      };
    }

    return {
      uri: file.uri,
      name: fileName,
      type: file.type,
    };
  }, []);

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

      const normalizedFile = await normalizePickedDocument(file);
      setUploading(true);
      await submitMessage({
        text: text.trim(),
        file: {
          uri: normalizedFile.uri,
          name: normalizedFile.name || `document_${Date.now()}`,
          type: normalizedFile.type || "application/octet-stream",
        }
      });
      setText("");
    } catch (error) {
      const message = getDocumentPickerMessage(error) || getRequestErrorMessage(error, "Document pick failed");
      if (!message) {
        return;
      }

      console.log("seller document send error:", error);
      Alert.alert("Error", message);
    } finally {
      setUploading(false);
    }
  }, [normalizePickedDocument, submitMessage, text]);

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

      const normalizedFile = await normalizePickedDocument(file);
      setUploading(true);
      await submitMessage({
        text: text.trim(),
        file: {
          uri: normalizedFile.uri,
          name: normalizedFile.name || `audio_${Date.now()}`,
          type: normalizedFile.type || "audio/*",
        }
      });
      setText("");
    } catch (error) {
      const message = getDocumentPickerMessage(error) || getRequestErrorMessage(error, "Audio pick failed");
      if (!message) {
        return;
      }

      console.log("seller audio send error:", error);
      Alert.alert("Error", message);
    } finally {
      setUploading(false);
    }
  }, [normalizePickedDocument, submitMessage, text]);

  useEffect(() => {
    let mounted = true;

    const loadCurrentUser = async () => {
      try {
        const rawUser = await AsyncStorage.getItem("user");
        const parsedUser = rawUser ? JSON.parse(rawUser) : null;
        const nextUserId = parsedUser?._id || parsedUser?.id || "";

        if (!mounted) {
          return;
        }

        setCurrentUserId(nextUserId);

        if (nextUserId) {
          await connectSocket();
          socket.emit("userOnline", nextUserId);
        }
      } catch (error) {
        console.log("seller chat current user load error:", error);
      }
    };

    loadCurrentUser();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const initializeChat = async () => {
      try {
        setLoading(true);
        await Promise.all([fetchSeller(), fetchServices()]);
      } catch (error) {
        console.log("seller chat init error:", error);
        if (active) {
          Alert.alert("Error", "Failed to load seller chat");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    initializeChat();

    return () => {
      active = false;
    };
  }, [fetchSeller, fetchServices]);

  useEffect(() => {
    let active = true;

    const syncConversationForSelectedService = async () => {
      if (!sellerUserId) {
        return;
      }

      const targetServiceId = selectedService?._id || serviceId || null;
      const shouldForceConversation = conversationServiceId !== targetServiceId;

      if (!currentConversationId && !targetServiceId) {
        return;
      }

      try {
        setLoading(true);
        const nextConversationId = await resolveConversation(targetServiceId, {
          force: shouldForceConversation,
        });

        if (!active || !nextConversationId) {
          return;
        }

        await fetchMessages(nextConversationId);
        await connectSocket();
        socket.emit("joinConversation", nextConversationId);
      } catch (error) {
        console.log("seller chat conversation sync error:", error);
        if (active) {
          Alert.alert("Error", "Failed to load the selected service conversation.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    syncConversationForSelectedService().catch(() => {});

    return () => {
      active = false;
    };
  }, [
    conversationServiceId,
    currentConversationId,
    fetchMessages,
    resolveConversation,
    selectedService?._id,
    sellerUserId,
    serviceId,
  ]);

  useEffect(() => {
    const handleReceiveMessage = (msg: ChatMessage) => {
      appendMessage(msg);
    };

    const handleTyping = (data: { userId?: string }) => {
      const nextUserId = String(data?.userId || "");
      if (nextUserId && nextUserId !== String(currentUserId || "")) {
        setTypingUserId(nextUserId);
      }
    };

    const handleStopTyping = (data: { userId?: string }) => {
      const nextUserId = String(data?.userId || "");
      setTypingUserId((prev) => (prev === nextUserId ? "" : prev));
    };

    const handleMessageSeen = (data: { messageId?: string; userId?: string; seenAt?: string }) => {
      applyMessageSeen(data);
    };

    const handleMessageReaction = (data: { messageId?: string; userId?: string; emoji?: string }) => {
      applyMessageReaction(data);
    };

    socket.on("receiveMessage", handleReceiveMessage);
    socket.on("typing", handleTyping);
    socket.on("stopTyping", handleStopTyping);
    socket.on("messageSeen", handleMessageSeen);
    socket.on("messageReaction", handleMessageReaction);

    return () => {
      socket.off("receiveMessage", handleReceiveMessage);
      socket.off("typing", handleTyping);
      socket.off("stopTyping", handleStopTyping);
      socket.off("messageSeen", handleMessageSeen);
      socket.off("messageReaction", handleMessageReaction);
    };
  }, [appendMessage, applyMessageReaction, applyMessageSeen, currentUserId]);

  useEffect(() => {
    if (!currentConversationId) {
      return;
    }

    const joinConversation = async () => {
      await connectSocket();
      socket.emit("joinConversation", currentConversationId);
    };

    joinConversation().catch((error) => {
      console.log("seller chat join error:", error);
    });
  }, [currentConversationId]);

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
      .catch((error) => {
        console.log("seller typing emit error:", error);
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

    const nextMessage = getLastIncomingUnseenMessage(messages, currentUserId) as ChatMessage | null;
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
      .catch((error) => {
        console.log("seller message seen emit error:", error);
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
      .catch((error) => {
        console.log("seller message reaction emit error:", error);
      });
  }, [applyMessageReaction, currentConversationId, currentUserId]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMine = String(getMessageSenderId(item)) === String(currentUserId || "");
    const attachment = getMessageAttachment(item);
    const textValue = getMessageText(item);
    const seenCount = Array.isArray(item?.seenBy) ? item.seenBy.length : 0;
    const reactions = Array.isArray(item?.reactions) ? item.reactions : [];

    return (
      <View
        style={[
          styles.msgRow,
          { justifyContent: isMine ? "flex-end" : "flex-start" }
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.92}
          onLongPress={() => reactToMessage(item._id)}
          style={[
            styles.msgBubble,
            isMine ? styles.myMsg : styles.otherMsg
          ]}
        >
          {isImageMessage(item) && attachment?.url ? (
            <Image source={{ uri: attachment.url }} style={styles.messageImage} />
          ) : null}

          {isVideoMessage(item) && (attachment?.thumbnailUrl || attachment?.url) ? (
            <View style={styles.attachmentRow}>
              <Image
                source={{ uri: attachment.thumbnailUrl || attachment.url }}
                style={styles.messageImage}
              />
              <Text
                style={[styles.attachmentName, isMine ? styles.myText : styles.otherText]}
                numberOfLines={1}
              >
                Video attachment
              </Text>
            </View>
          ) : null}

          {isAudioMessage(item) && attachment?.url ? (
            <View style={styles.attachmentRow}>
              <Icon
                name="musical-notes-outline"
                size={20}
                color={isMine ? "#fff" : PRIMARY}
              />
              <Text
                style={[styles.attachmentName, isMine ? styles.myText : styles.otherText]}
                numberOfLines={1}
              >
                {getAttachmentDisplayName(item)}
              </Text>
            </View>
          ) : null}

          {isDocumentMessage(item) && attachment?.url ? (
            <View style={styles.attachmentRow}>
              <Icon
                name="document-text-outline"
                size={20}
                color={isMine ? "#fff" : PRIMARY}
              />
              <Text
                style={[styles.attachmentName, isMine ? styles.myText : styles.otherText]}
                numberOfLines={1}
              >
                {getAttachmentDisplayName(item)}
              </Text>
            </View>
          ) : null}

          {!!textValue && (
            <Text style={isMine ? styles.myText : styles.otherText}>
              {textValue}
            </Text>
          )}

          {!!reactions.length && (
            <View style={styles.reactionRow}>
              {reactions.map((reaction) => (
                <View
                  key={`${item._id}-${reaction?.emoji || "reaction"}`}
                  style={[styles.reactionChip, isMine ? styles.myReactionChip : null]}
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

  const selectedPricing = getPrimaryPricingOption(selectedService);
  const selectedServiceLabel = selectedService?.serviceName || serviceName || "service requests";
  useEffect(() => {
    if (showPaymentModal) {
      fetchBookingSlots().catch((error) => {
        console.log("seller slot fetch error:", error);
      });
      return;
    }

    setSelectedAppointmentStart("");
  }, [fetchBookingSlots, showPaymentModal]);

  useEffect(() => {
    if (showPaymentModal) {
      setSelectedAppointmentStart((currentValue) => currentValue || appointmentSlots[0]?.start || "");
      return;
    }

    setSelectedAppointmentStart("");
  }, [appointmentSlots, showPaymentModal]);

  const openFeatureInfo = (title: string, description: string) => {
    navigation.navigate("FeatureInfoScreen", {
      title,
      description,
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={PRIMARY} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.centerHeader}
          onPress={() =>
            navigation.navigate("SellerDetailsScreen", { sellerId })
          }
        >
          <Image
            source={{
              uri: seller?.profilePic || DEFAULT_AVATAR
            }}
            style={styles.avatar}
          />

          <View style={{ marginLeft: 8 }}>
            <Text style={styles.name}>
              {seller?.sellerName || "Loading..."}
            </Text>
            <Text style={styles.status}>{typingUserId ? "Typing..." : `Chat for ${selectedServiceLabel}`}</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.rightIcons}>
          <TouchableOpacity
            style={{ marginRight: 15 }}
            onPress={() => openFeatureInfo("Voice Call", "Voice calling is not available in the current backend yet.")}
          >
            <Icon name="call" size={20} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => openFeatureInfo("Video Call", "Video calling is not available in the current backend yet.")}
          >
            <Icon name="videocam" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.premiumServiceWrap}>
        <Text style={styles.premiumTitle}>Available Services</Text>

        <FlatList
          horizontal
          data={services}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ paddingHorizontal: 10 }}
          renderItem={({ item }: { item: SellerService }) => {
            const isSelected = selectedService?._id === item._id;
            const extraOptions = getServicePricingOptions(item).slice(1, 3);

            return (
              <TouchableOpacity
                style={[
                  styles.premiumCard,
                  isSelected && styles.selectedCard
                ]}
                onPress={() => setSelectedService(item)}
              >
                <Text
                  style={[
                    styles.serviceName,
                    isSelected && { color: "#fff" }
                  ]}
                >
                  {item.serviceName}
                </Text>

                <Text
                  style={[
                    styles.servicePrice,
                    isSelected && { color: "#fff" }
                  ]}
                >
                  {formatPrimaryServicePrice(item)}
                </Text>

                {!!extraOptions.length && (
                  <Text
                    style={[
                      styles.serviceSubMeta,
                      isSelected && { color: "#E9DEFF" }
                    ]}
                  >
                    {extraOptions.map((option: { label?: string }) => option.label).join(" • ")}
                  </Text>
                )}

                <View style={styles.serviceFooter}>
                  <Text
                    style={[
                      styles.serviceSelectionText,
                      isSelected ? styles.serviceSelectionTextActive : null,
                    ]}
                  >
                    {isSelected ? "Selected conversation" : "Tap card to switch"}
                  </Text>

                  <TouchableOpacity
                    style={[styles.bookNowBtn, !isSelected ? styles.bookNowBtnMuted : null]}
                    onPress={() => {
                      if (seller?.availabilityStatus === false) {
                        Alert.alert("Unavailable", "This seller is not accepting appointment requests right now.");
                        return;
                      }
                      setSelectedService(item);
                      setShowPaymentModal(true);
                    }}
                  >
                    <Text style={styles.bookNowText}>{isSelected ? "Request in Chat" : "Select & Request"}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <View style={styles.selectedServiceBanner}>
        <Icon name="briefcase-outline" size={16} color={PRIMARY} />
        <Text style={styles.selectedServiceBannerText}>
          Active service: {selectedServiceLabel}
        </Text>
      </View>

      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color={PRIMARY} />
          </View>
        ) : (
          <FlatList
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item, index) => item._id || index.toString()}
            contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
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
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptyText}>
                  Start the conversation here. Booking requests are handled through chat.
                </Text>
              </View>
            }
          />
        )}

        <View style={styles.quickContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {quickOptions.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.quickChip}
                onPress={() => {
                  sendMessage(item).catch((error) => {
                    console.log("seller quick reply error:", error);
                  });
                }}
              >
                <Text style={styles.quickText}>{item}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      <View style={styles.inputWrap}>
        <TouchableOpacity style={styles.attachButton} onPress={sendCameraAttachment} disabled={uploading || loading}>
          <Icon name="camera-outline" size={22} color={PRIMARY} />
        </TouchableOpacity>

        <TouchableOpacity onPress={sendImageAttachment} disabled={uploading || loading}>
          <Icon name="image-outline" size={22} color={PRIMARY} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.attachButton} onPress={sendDocumentAttachment} disabled={uploading || loading}>
          <Icon name="document-outline" size={22} color={PRIMARY} />
        </TouchableOpacity>

        <TextInput
          placeholder={uploading ? "Uploading attachment..." : "Message..."}
          value={text}
          onChangeText={handleTextChange}
          style={styles.input}
          editable={!loading && !sending && !uploading}
        />

        {uploading ? (
          <ActivityIndicator color={PRIMARY} />
        ) : text.trim() ? (
          <TouchableOpacity
            style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
            onPress={() => {
              sendMessage().catch((error) => {
                console.log("seller chat send error:", error);
              });
            }}
            disabled={sending || loading}
          >
            <Icon name="send" size={18} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={sendAudioAttachment} disabled={uploading || loading}>
            <Icon name="mic-outline" size={24} color={PRIMARY} />
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={showPaymentModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Request Appointment</Text>

            <Text style={styles.modalService}>
              {selectedService?.serviceName || serviceName || "Selected service"}
            </Text>

            <Text style={styles.modalPrice}>
              {selectedPricing ? formatPrimaryServicePrice(selectedService) : "Pricing unavailable"}
            </Text>

            {!!selectedPricing?.durationMinutes && (
              <Text style={styles.modalDuration}>
                Duration: {selectedPricing.durationMinutes} min
              </Text>
            )}

            <View style={styles.slotSection}>
              <Text style={styles.slotHeading}>Choose a preferred slot</Text>
              <View style={styles.slotList}>
                {appointmentSlots.map((slot) => {
                  const isSelected = selectedAppointmentStart === slot.start;

                  return (
                    <TouchableOpacity
                      key={slot.start}
                      style={[styles.slotChip, isSelected ? styles.slotChipActive : null]}
                      onPress={() => setSelectedAppointmentStart(slot.start)}
                    >
                      <Text style={[styles.slotChipText, isSelected ? styles.slotChipTextActive : null]}>
                        {slot.label || formatAppointmentSlotLabel(slot.start)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <Text style={styles.modalNote}>
              {loadingAppointmentSlots
                ? "Loading seller availability..."
                : appointmentSlots.length
                  ? appointmentSlotFallback
                    ? "Seller slots could not be loaded right now, so suggested fallback times are shown."
                    : "This sends a preferred appointment slot to the seller. The seller can accept, decline, or complete it from the requests screen."
                  : "This seller does not have any bookable slots available right now."}
            </Text>

            <TouchableOpacity
              style={[
                styles.payBtn,
                (loadingAppointmentSlots || !appointmentSlots.length) && styles.payBtnDisabled,
              ]}
              onPress={() => {
              sendBookingRequest().catch((error) => {
                console.log("seller booking request error:", error);
              });
            }}
              disabled={loadingAppointmentSlots || !appointmentSlots.length}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>
                Send Request
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
              <Text style={{ marginTop: 10, color: "#777" }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default SellerChatScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5FA" },
  header: {
    backgroundColor: PRIMARY,
    paddingTop: StatusBar.currentHeight || 40,
    paddingBottom: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  centerHeader: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginLeft: 10
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19
  },
  name: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15
  },
  status: {
    color: "#E5D9FF",
    fontSize: 11
  },
  rightIcons: {
    flexDirection: "row",
    alignItems: "center"
  },
  premiumServiceWrap: {
    backgroundColor: "#fff",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#eee"
  },
  premiumTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 12,
    marginBottom: 6
  },
  premiumCard: {
    width: 188,
    backgroundColor: "#fafafa",
    padding: 12,
    borderRadius: 16,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#eee"
  },
  selectedCard: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY
  },
  serviceName: { fontWeight: "700", fontSize: 13 },
  servicePrice: {
    marginTop: 5,
    fontSize: 14,
    fontWeight: "700",
    color: PRIMARY
  },
  serviceSubMeta: {
    marginTop: 6,
    fontSize: 11.5,
    color: "#666"
  },
  serviceFooter: {
    marginTop: 12,
  },
  serviceSelectionText: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 8,
  },
  serviceSelectionTextActive: {
    color: "#E9DEFF",
  },
  bookNowBtn: {
    marginTop: 10,
    backgroundColor: "#fff",
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: "center"
  },
  bookNowText: {
    color: PRIMARY,
    fontWeight: "700",
    fontSize: 12
  },
  bookNowBtnMuted: {
    backgroundColor: "#8F78DB",
  },
  selectedServiceBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#E7E9F2",
    backgroundColor: "#FAF8FF",
  },
  selectedServiceBannerText: {
    marginLeft: 8,
    color: "#47356B",
    fontWeight: "600",
  },
  loaderWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  loadEarlierButton: {
    alignSelf: "center",
    backgroundColor: "#fff",
    borderRadius: 999,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  loadEarlierText: {
    color: PRIMARY,
    fontWeight: "700"
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 60
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111"
  },
  emptyText: {
    marginTop: 8,
    textAlign: "center",
    color: "#666"
  },
  msgRow: { marginVertical: 5 },
  msgBubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: "80%"
  },
  myMsg: { backgroundColor: PRIMARY },
  otherMsg: { backgroundColor: "#fff" },
  myText: { color: "#fff" },
  otherText: { color: "#111" },
  messageImage: {
    width: 220,
    height: 220,
    borderRadius: 12,
    marginBottom: 8
  },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6
  },
  attachmentName: {
    marginLeft: 8,
    fontWeight: "600",
    maxWidth: 180
  },
  reactionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8
  },
  reactionChip: {
    backgroundColor: "rgba(123, 77, 255, 0.12)",
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
    color: "rgba(255,255,255,0.86)",
    fontSize: 11,
    marginTop: 8
  },
  quickContainer: {
    paddingVertical: 6,
    paddingLeft: 10,
    backgroundColor: "#F4F5FA",
    borderTopWidth: 1,
    borderTopColor: "#E7E9F2"
  },
  quickChip: {
    backgroundColor: "#EDE9FF",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10
  },
  quickText: { color: PRIMARY, fontWeight: "600" },
  inputWrap: {
    flexDirection: "row",
    padding: 10,
    backgroundColor: "#fff",
    alignItems: "center"
  },
  attachButton: {
    marginLeft: 10,
    marginRight: 10
  },
  input: {
    flex: 1,
    backgroundColor: "#F1F1F4",
    borderRadius: 25,
    paddingHorizontal: 15,
    minHeight: 44
  },
  sendBtn: {
    backgroundColor: PRIMARY,
    padding: 10,
    borderRadius: 20,
    marginLeft: 8
  },
  sendBtnDisabled: {
    opacity: 0.6
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center"
  },
  modalBox: {
    width: "85%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 22,
    alignItems: "center"
  },
  modalTitle: { fontSize: 16, fontWeight: "700" },
  modalService: { marginTop: 10, fontWeight: "600" },
  modalPrice: { marginTop: 6, color: PRIMARY, fontWeight: "700" },
  modalDuration: {
    marginTop: 4,
    color: "#666",
    fontSize: 12
  },
  modalNote: {
    marginTop: 10,
    fontSize: 12,
    color: "#777",
    textAlign: "center"
  },
  slotSection: {
    width: "100%",
    marginTop: 16,
  },
  slotHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111",
    marginBottom: 10,
  },
  slotList: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  slotChip: {
    borderWidth: 1,
    borderColor: "#DED8F7",
    backgroundColor: "#F7F4FF",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    margin: 4,
  },
  slotChipActive: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
  },
  slotChipText: {
    color: "#47356B",
    fontSize: 12,
    fontWeight: "600",
  },
  slotChipTextActive: {
    color: "#fff",
  },
  payBtn: {
    marginTop: 14,
    backgroundColor: PRIMARY,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 12
  },
  payBtnDisabled: {
    opacity: 0.5
  }
});
