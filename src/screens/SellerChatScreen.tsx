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
  StatusBar,
  Modal,
  ActivityIndicator,
  Linking,
  KeyboardAvoidingView,
  Platform
} from "react-native";
import { Alert } from "../utils/appAlert";
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
  type DocumentPickerResponse,
} from "@react-native-documents/picker";
import { API } from "../api/api";
import { connectSocket, socket } from "../socket";
import {
  buildCallEventMessage,
  getAttachmentDisplayName,
  getMessageAttachment,
  getMessageSenderId,
  getMessageText,
  isAudioMessage,
  isDocumentMessage,
  isImageMessage,
  parseCallEventMessage,
  parseSharedContentMessage,
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
  reactToChatMessage,
  sendChatMessage,
} from "../utils/chatApi";
import { startCallSession } from "../utils/callApi";
import { openRazorpayCheckout } from "../utils/razorpayCheckout";
import {
  getLastIncomingUnseenMessage,
  mergeMessageReaction,
  mergeMessageSeen,
} from "../utils/chatRealtime";
import { getStoredUser } from "../utils/authSession";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { callingDisabledMessage, productFlags } from "../config/productFlags";
import { useAppTheme } from "../theme/AppThemeContext";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import VoiceRecorderButton from "../components/chat/VoiceRecorderButton";
import VoiceMessageBubble from "../components/chat/VoiceMessageBubble";
import StickerPickerSheet from "../components/chat/StickerPickerSheet";
import AISupportSheet from "../components/chat/AISupportSheet";
import { ensureCameraPermission, resolveCameraCaptureMediaType } from "../utils/permissions";
import { normalizeMediaFieldsDeep, normalizeMediaUrl } from "../utils/mediaUrls";

const PRIMARY = "#7B4DFF";
const LOCATION_MESSAGE_LABEL = "Shared location:";

const buildLocationMessage = (query: string): string => {
  const cleanQuery = String(query || "").trim();
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanQuery)}`;
  return `${LOCATION_MESSAGE_LABEL} ${cleanQuery}\n${mapsUrl}`;
};

const parseLocationMessage = (value: string | undefined): { label: string; url: string } | null => {
  if (typeof value !== "string" || !value.startsWith(LOCATION_MESSAGE_LABEL)) {
    return null;
  }

  const [labelLine, urlLine] = value.split("\n");
  const label = labelLine.replace(LOCATION_MESSAGE_LABEL, "").trim();
  const url = String(urlLine || "").trim();

  if (!label || !/^https?:\/\//.test(url)) {
    return null;
  }

  return { label, url };
};

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

type MessagePreviewState = {
  imageUrl: string;
  title?: string;
};

type ChatMessage = {
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
  attachment?: AttachmentShape;
  duration?: number;
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

type PendingVoiceNote = {
  uri: string;
  name: string;
  type: string;
  duration: number;
};

type CallEventPreview = {
  label: string;
  icon: string;
};

const FALLBACK_TIME_ZONE = "Asia/Kolkata";

const getLocalTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIME_ZONE;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
};

const formatAppointmentSlotLabel = (isoValue: string) =>
  new Date(isoValue).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const formatCalendarDate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);

  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
};

const buildGoogleCalendarUrl = ({
  title,
  details,
  start,
  end,
}: {
  title: string;
  details?: string;
  start: string | Date;
  end: string | Date;
}) => {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    details: details || "",
    dates: `${formatCalendarDate(start)}/${formatCalendarDate(end)}`,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

const buildCallEventPreview = (message: ChatMessage, currentUserId: string): CallEventPreview | null => {
  const callEvent = parseCallEventMessage(message);
  if (callEvent?.kind !== "call") {
    return null;
  }

  const direction = String(callEvent.callerId || "") === String(currentUserId || "") ? "outgoing" : "incoming";
  const isVideo = callEvent.callType === "video";
  const callLabel = isVideo ? "video call" : "voice call";

  return {
    label: `${direction === "outgoing" ? "Outgoing" : "Incoming"} ${callLabel}`,
    icon: isVideo ? "videocam-outline" : "call-outline",
  };
};

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

const messageRenderKeyCache = new WeakMap<object, string>();
let nextSyntheticMessageKey = 0;

const getMessageIdentity = (message: ChatMessage | null | undefined): string => {
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

const getMessageRenderKey = (message: ChatMessage | null | undefined): string => {
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

const dedupeMessages = (items: ChatMessage[]): ChatMessage[] => {
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

const SellerChatScreen = ({ route, navigation }: any) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
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
  const [processingBookingPayment, setProcessingBookingPayment] = useState(false);
  const [selectedAppointmentStart, setSelectedAppointmentStart] = useState("");
  const [appointmentSlots, setAppointmentSlots] = useState<AppointmentSlot[]>([]);
  const [loadingAppointmentSlots, setLoadingAppointmentSlots] = useState(false);
  const [appointmentSlotFallback, setAppointmentSlotFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagination, setPagination] = useState({ nextCursor: null, hasMore: false, limit: 30 });
  const [typingUserId, setTypingUserId] = useState("");
  const [isSellerOnline, setIsSellerOnline] = useState(false);
  const [showLocationComposer, setShowLocationComposer] = useState(false);
  const [locationDraft, setLocationDraft] = useState("");
  const [messagePreview, setMessagePreview] = useState<MessagePreviewState | null>(null);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [pendingVoiceNote, setPendingVoiceNote] = useState<PendingVoiceNote | null>(null);
  const [showAssistant, setShowAssistant] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sellerPresenceText = useMemo(() => {
    if (typingUserId) {
      return "Online now";
    }

    if (seller?.availabilityStatus === false && !isSellerOnline) {
      return "Away";
    }

    return isSellerOnline || seller?.availabilityStatus !== false ? "Online" : "Away";
  }, [isSellerOnline, seller?.availabilityStatus, typingUserId]);

  const sellerHeaderTint = colors.primary;
  const sellerStatusColor = "rgba(255,255,255,0.78)";
  const canUseComposer = seller?.availabilityStatus !== false;
  const assistantScope = "Seller chat support";
  const assistantScopeHint = `${seller?.sellerName || "Seller"} ke booking, payment, appointment, aur chat support ke liye help.`;
  const assistantConversationSummary = `Selected service: ${selectedService?.serviceName || serviceName || "service requests"}. Seller status: ${sellerPresenceText}.${seller?.availabilityStatus === false ? " Messaging currently locked until seller turns availability on." : ""}`;
  const assistantSuggestedPrompts = [
    "Booking flow samjhao",
    "Payment issue fix karo",
    "Seller unavailable kyun dikh raha hai?",
  ];
  const assistantRecentMessages = useMemo(
    () =>
      messages.slice(-6).map((message) => {
        const rawText = String(getMessageText(message) || "").trim() || `[${String(message?.messageType || "message")}]`;
        const senderId = getMessageSenderId(message);
        const senderLabel = String(senderId) === String(currentUserId)
          ? "Current user"
          : seller?.sellerName || "Seller";

        return `${senderLabel}: ${rawText}`;
      }),
    [currentUserId, messages, seller?.sellerName],
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
    const res = await API.get(`/seller/${sellerId}`);
    setSeller(res.data.seller);
    setIsSellerOnline(Boolean(res.data?.seller?.availabilityStatus));
    return res.data.seller as SellerProfile;
  }, [sellerId]);

  const fetchServices = useCallback(async () => {
    const res = await API.get(`/service/seller/${sellerId}`);
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
      setAppointmentSlots([]);
    } finally {
      setLoadingAppointmentSlots(false);
    }
  }, [selectedService?._id, sellerId, serviceId]);

  const fetchMessages = useCallback(async (targetConversationId: string, options: { cursor?: string | null; append?: boolean; limit?: number } = {}) => {
    const data = await fetchConversationMessages(targetConversationId, {
      cursor: options.cursor,
      limit: options.limit || 30,
    });
    const nextMessages = dedupeMessages(normalizeMediaFieldsDeep(data?.messages || []) as ChatMessage[]);
    setPagination(data?.pagination || { nextCursor: null, hasMore: false, limit: 30 });
    setMessages((prev) => (options.append ? dedupeMessages([...nextMessages, ...prev]) : nextMessages));
    setErrorMessage("");
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
      setErrorMessage("");
    }

    return nextConversationId;
  }, [conversationServiceId, currentConversationId, sellerUserId]);

  const ensureConversation = useCallback(async () => {
    const targetServiceId = selectedService?._id || serviceId || null;
    return resolveConversation(targetServiceId, {
      force: conversationServiceId !== targetServiceId,
    });
  }, [conversationServiceId, resolveConversation, selectedService?._id, serviceId]);

  const joinConversationRealtime = useCallback(async (targetConversationId: string | null) => {
    if (!targetConversationId) {
      return false;
    }

    try {
      await connectSocket();
      socket.emit("joinConversation", targetConversationId);
      return true;
    } catch (error) {
      console.log("seller chat realtime join error:", error);
      return false;
    }
  }, []);

  const appendMessage = useCallback((nextMessage: ChatMessage) => {
    const normalizedMessage = normalizeMediaFieldsDeep(nextMessage) as ChatMessage;

    setMessages((prev) => {
      const nextIdentity = getMessageIdentity(normalizedMessage);
      const exists = nextIdentity
        ? prev.some((item) => getMessageIdentity(item) === nextIdentity)
        : false;
      return exists ? prev : [...prev, normalizedMessage];
    });
  }, []);

  const applyMessageSeen = useCallback((payload: { messageId?: string; userId?: string; seenAt?: string }) => {
    setMessages((prev) => mergeMessageSeen(prev, payload) as ChatMessage[]);
  }, []);

  const applyMessageReaction = useCallback((payload: { messageId?: string; userId?: string; emoji?: string }) => {
    setMessages((prev) => mergeMessageReaction(prev, payload) as ChatMessage[]);
  }, []);

  const submitMessage = useCallback(async ({ text: nextText, file, messageType, duration }: { text?: string; file?: { uri: string; name?: string | null; type?: string | null }; messageType?: string; duration?: number }) => {
    if (!canUseComposer) {
      throw new Error("Messaging is locked until this seller turns availability on.");
    }

    const resolvedConversationId = await ensureConversation();

    if (!resolvedConversationId) {
      throw new Error("Unable to start this seller conversation right now.");
    }

    const res = await sendChatMessage({
      conversationId: resolvedConversationId,
      text: nextText,
      file,
      messageType,
      duration,
    });

    const nextMessage = res.message as ChatMessage;
    appendMessage(nextMessage);
  }, [appendMessage, canUseComposer, ensureConversation]);

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
      Alert.alert("Error", getReadableApiErrorMessage(error, "Failed to send message"));
    } finally {
      setSending(false);
    }
  }, [sending, submitMessage, text]);

  const sendCallEventLog = useCallback(async ({
    conversationId: targetConversationId,
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
      conversationId: targetConversationId,
      text: payload,
      messageType: "system",
    });

    if (response?.message) {
      appendMessage(response.message as ChatMessage);
    }
  }, [appendMessage, currentUserId]);

  const sendBookingRequest = useCallback(async () => {
    const targetService = selectedService;

    if (!targetService) {
      return;
    }

    try {
      const resolvedConversationId = await ensureConversation();
      const pricingModel = getPrimaryPricingOption(targetService)?.model;
      setProcessingBookingPayment(true);
      const res = await API.post("/service-requests", {
        serviceId: targetService._id,
        conversationId: resolvedConversationId || undefined,
        pricingModel,
        note: text.trim() || `Request for ${targetService.serviceName || serviceName || "service"}`,
        appointmentStart: selectedAppointmentStart || undefined,
        appointmentTimezone: getLocalTimeZone(),
      });

      const requestId = res?.data?.request?._id;
      const paymentPayload = res?.data?.payment;

      if (!requestId || !paymentPayload) {
        throw new Error("Payment payload is missing for this booking");
      }

      let checkoutResult;
      try {
        checkoutResult = await openRazorpayCheckout(paymentPayload);
      } catch (checkoutError: any) {
        const cancellationCode = Number(checkoutError?.code);
        if (cancellationCode === 0 || /cancel/i.test(String(checkoutError?.description || checkoutError?.message || ""))) {
          if (requestId) {
            await API.put(`/service-requests/${requestId}/status`, {
              status: "cancelled",
            }).catch((statusError) => {
              console.log("seller booking cancel after payment abort error:", statusError);
            });
          }
          Alert.alert("Payment Cancelled", "Payment complete hone ke baad hi appointment book hogi. Abhi koi booking confirm nahi hui.");
          return;
        }
        throw checkoutError;
      }

      const verifyRes = await API.post(`/service-requests/${requestId}/payment/verify`, checkoutResult);
      const bookedRequest = verifyRes?.data?.request;
      const appointmentStartValue = bookedRequest?.appointmentStart || selectedAppointmentStart;
      const appointmentDurationMinutes =
        Number(bookedRequest?.appointmentDurationMinutes)
        || Number(getPrimaryPricingOption(targetService)?.durationMinutes)
        || 30;
      const appointmentEndValue = appointmentStartValue
        ? new Date(new Date(appointmentStartValue).getTime() + appointmentDurationMinutes * 60 * 1000)
        : null;

      if (verifyRes?.data?.systemMessage) {
        appendMessage(verifyRes.data.systemMessage as ChatMessage);
      }

      setShowPaymentModal(false);
      setSelectedAppointmentStart("");
      setText("");
      Alert.alert(
        "Payment Complete",
        "Payment successful. Appointment request booked and sent to the seller.",
        appointmentStartValue && appointmentEndValue ? [
          {
            text: "Add to Calendar",
            onPress: async () => {
              const calendarUrl = buildGoogleCalendarUrl({
                title: `${targetService.serviceName || serviceName || "Aline2 appointment"} with ${seller?.sellerName || "seller"}`,
                details: [
                  `Seller: ${seller?.sellerName || "Aline2 seller"}`,
                  `Service: ${targetService.serviceName || serviceName || "Appointment"}`,
                  text.trim() ? `Note: ${text.trim()}` : "",
                ].filter(Boolean).join("\n"),
                start: appointmentStartValue,
                end: appointmentEndValue,
              });

              try {
                await Linking.openURL(calendarUrl);
              } catch (calendarError) {
                console.log("seller booking calendar open error:", calendarError);
                Alert.alert("Calendar unavailable", "Calendar link open nahi ho saka. Appointment details notifications me mil jayengi.");
              }
            },
          },
          {
            text: "Done",
            style: "cancel",
          },
        ] : undefined,
      );
    } catch (error: any) {
      console.log("seller booking request error:", error?.response?.data || error);
      Alert.alert("Error", getReadableApiErrorMessage(error, error?.description || "Failed to start booking payment"));
    } finally {
      setProcessingBookingPayment(false);
    }
  }, [appendMessage, ensureConversation, selectedAppointmentStart, selectedService, seller?.sellerName, serviceName, text]);

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
          Alert.alert("Error", getReadableApiErrorMessage(error, "Failed to send attachment"));
        } finally {
          setUploading(false);
        }
      }
    );
  }, [submitMessage, text]);

  const sendCameraAttachment = useCallback(async () => {
    const hasPermission = await ensureCameraPermission(
      "Allow Aline2 to use your camera for seller chat photo and video attachments.",
    );
    if (!hasPermission) {
      Alert.alert("Camera permission needed", "Allow camera access to capture and send a photo or video.");
      return;
    }

    const mediaType = await resolveCameraCaptureMediaType("mixed", {
      title: "Send from camera",
      message: "Choose whether you want to capture a photo or record a video for this seller chat.",
    });
    if (!mediaType) {
      return;
    }

    launchCamera(
      {
        mediaType,
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
          Alert.alert("Error", getReadableApiErrorMessage(error, "Failed to send camera capture"));
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
      const message = getDocumentPickerMessage(error) || getReadableApiErrorMessage(error, "Document pick failed");
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
      const message = getDocumentPickerMessage(error) || getReadableApiErrorMessage(error, "Audio pick failed");
      if (!message) {
        return;
      }

      console.log("seller audio send error:", error);
      Alert.alert("Error", message);
    } finally {
      setUploading(false);
    }
  }, [normalizePickedDocument, submitMessage, text]);

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
      setText("");
    } catch (error) {
      console.log("seller location send error:", error);
      Alert.alert("Error", getReadableApiErrorMessage(error, "Failed to share location"));
    } finally {
      setUploading(false);
    }
  }, [locationDraft, submitMessage]);

  const loadSellerChat = useCallback(async ({ refresh = false }: { refresh?: boolean } = {}) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setErrorMessage("");
      await Promise.all([fetchSeller(), fetchServices()]);
    } catch (error) {
      console.log("seller chat init error:", error);
      setMessages([]);
      setErrorMessage(getReadableApiErrorMessage(error, "Failed to load seller chat."));
    } finally {
      if (refresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [fetchSeller, fetchServices]);

  useEffect(() => {
    let mounted = true;

    const loadCurrentUser = async () => {
      try {
        const parsedUser = await getStoredUser();
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
    loadSellerChat().catch((error) => {
      if (!active) {
        return;
      }
      console.log("seller chat init effect error:", error);
    });

    return () => {
      active = false;
    };
  }, [loadSellerChat]);

  useFocusEffect(
    useCallback(() => {
      loadSellerChat({ refresh: true }).catch((error) => {
        console.log("seller chat focus refresh error:", error);
      });
    }, [loadSellerChat])
  );

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
        void joinConversationRealtime(nextConversationId);
        setErrorMessage("");
      } catch (error) {
        console.log("seller chat conversation sync error:", error);
        if (active) {
          setMessages([]);
          setErrorMessage(getReadableApiErrorMessage(error, "Failed to load the selected service conversation."));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    syncConversationForSelectedService().catch(() => { });

    return () => {
      active = false;
    };
  }, [
    conversationServiceId,
    currentConversationId,
    fetchMessages,
    joinConversationRealtime,
    resolveConversation,
    selectedService?._id,
    sellerUserId,
    serviceId,
  ]);

  useEffect(() => {
    const handleReceiveMessage = (msg: ChatMessage) => {
      const messageConversationId = String(
        (msg as any)?.conversation?._id || (msg as any)?.conversation || (msg as any)?.conversationId || "",
      );

      if (
        currentConversationId
        && messageConversationId
        && messageConversationId !== String(currentConversationId)
      ) {
        return;
      }

      appendMessage(msg);

      const senderId = String(getMessageSenderId(msg) || "");
      if (senderId && senderId !== String(currentUserId || "")) {
        setIsSellerOnline(true);
      }
    };

    const handleTyping = (data: { userId?: string }) => {
      const nextUserId = String(data?.userId || "");
      if (nextUserId && nextUserId !== String(currentUserId || "")) {
        setTypingUserId(nextUserId);
        setIsSellerOnline(true);
      }
    };

    const handleStopTyping = (data: { userId?: string }) => {
      const nextUserId = String(data?.userId || "");
      setTypingUserId((prev) => (prev === nextUserId ? "" : prev));

      if (seller?.availabilityStatus === false) {
        setIsSellerOnline(false);
      }
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
  }, [
    appendMessage,
    applyMessageReaction,
    applyMessageSeen,
    currentConversationId,
    currentUserId,
    seller?.availabilityStatus,
  ]);

  useEffect(() => {
    if (!currentConversationId) {
      return;
    }

    void joinConversationRealtime(currentConversationId);
  }, [currentConversationId, joinConversationRealtime]);

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
      .catch((error) => {
        console.log("seller message reaction save error:", error);
        Alert.alert("Reaction failed", getReadableApiErrorMessage(error, "Unable to save the reaction right now."));
      });
  }, [applyMessageReaction, currentUserId]);

  const sendVoiceMessage = useCallback((voiceFile: { uri: string; name: string; type: string; duration: number }) => {
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
      });
      setPendingVoiceNote(null);
    } catch (error) {
      console.log("seller voice send error:", error);
      Alert.alert("Voice message failed", getReadableApiErrorMessage(error, "Unable to send voice message right now."));
    } finally {
      setUploading(false);
    }
  }, [pendingVoiceNote, submitMessage]);

  const openAttachmentUrl = useCallback(async (rawUrl: string | undefined | null, fallbackMessage: string) => {
    const targetUrl = normalizeMediaUrl(rawUrl);
    if (!targetUrl) {
      Alert.alert("Attachment unavailable", fallbackMessage);
      return;
    }

    try {
      await Linking.openURL(targetUrl);
    } catch (error) {
      console.log("seller attachment open error:", error);
      Alert.alert("Unable to open attachment", fallbackMessage);
    }
  }, []);

  const handleMessagePress = useCallback((message: ChatMessage, attachment: AttachmentShape | null, locationPayload: { label: string; url: string } | null) => {
    if (locationPayload?.url) {
      Linking.openURL(locationPayload.url).catch((error) => {
        console.log("seller open location error:", error);
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

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMine = String(getMessageSenderId(item)) === String(currentUserId || "");
    const isSystemMessage = String(item?.messageType || "") === "system";
    const attachment = getMessageAttachment(item);
    const textValue = getMessageText(item);
    const sharedContent = parseSharedContentMessage(item);
    const callEvent = buildCallEventPreview(item, currentUserId);
    const sharedMedia = Array.isArray(sharedContent?.media) ? sharedContent.media[0] : null;
    const locationPayload = parseLocationMessage(textValue);
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
          activeOpacity={isSystemMessage ? 1 : 0.92}
          onPress={isSystemMessage ? undefined : () => handleMessagePress(item, attachment, locationPayload)}
          onLongPress={isSystemMessage ? undefined : () => reactToMessage(item._id!)}
          style={[
            styles.msgBubble,
            sharedContent?.kind === "post" || callEvent ? styles.messageBubbleWide : null,
            isMine ? styles.myMsg : styles.otherMsg
          ]}
        >
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
                  color={isMine ? "#fff" : PRIMARY}
                />
              </View>
              <View style={styles.callEventBody}>
                <Text style={[styles.callEventTitle, isMine ? styles.callEventTitleMine : null]}>
                  {callEvent.label}
                </Text>
                <Text style={[styles.callEventMeta, isMine ? styles.callEventMetaMine : null]}>
                  Call activity is saved in chat
                </Text>
              </View>
            </View>
          ) : null}

          {isImageMessage(item) && attachment?.url ? (
            <Image source={{ uri: normalizeMediaUrl(attachment.url) }} style={styles.messageImage} />
          ) : null}

          {isVideoMessage(item) && (attachment?.thumbnailUrl || attachment?.url) ? (
            <View style={styles.attachmentRow}>
              <Image
                source={{ uri: normalizeMediaUrl(attachment.thumbnailUrl || attachment.url) }}
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

          {(isAudioMessage(item) || item?.messageType === "voice") && attachment?.url ? (
            <VoiceMessageBubble
              audioUrl={attachment.url}
              durationSeconds={Number(item?.duration || 0)}
              isMine={isMine}
              accentColor={PRIMARY}
              label={item?.messageType === "voice" ? "Voice message" : getAttachmentDisplayName(item)}
            />
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

          {!locationPayload && !sharedContent && !callEvent && !!textValue && (
            <Text style={isMine ? styles.myText : styles.otherText}>
              {textValue}
            </Text>
          )}

          {locationPayload ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => handleMessagePress(item, attachment, locationPayload)}
              style={[styles.locationCard, isMine ? styles.myLocationCard : null]}
            >
              <Icon name="location-outline" size={18} color={isMine ? "#fff" : PRIMARY} />
              <View style={styles.locationBody}>
                <Text style={isMine ? styles.myLocationTitle : styles.locationTitle}>
                  {locationPayload.label}
                </Text>
                <Text style={isMine ? styles.myLocationLink : styles.locationLink}>
                  Open in Maps
                </Text>
              </View>
            </TouchableOpacity>
          ) : null}

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

  const startCallFlow = useCallback(async (callType: "audio" | "video") => {
    if (!productFlags.callingInConsumerApp) {
      Alert.alert("Coming soon", callingDisabledMessage);
      return;
    }

    try {
      const resolvedConversationId = await ensureConversation();

      if (!resolvedConversationId) {
        throw new Error("Unable to open this seller conversation for calling.");
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
        console.log("seller call event log error:", error);
      });

      navigation.navigate("CallScreen", {
        callSessionId: nextCallSessionId,
        mode: "outgoing",
        callType,
        initialCallSession: nextCallSession,
        initialIceServers: Array.isArray(response?.iceServers) ? response.iceServers : [],
        callRuntime: response?.callRuntime || null,
        title: seller?.sellerName || selectedServiceLabel || "Aline2 call",
        avatarUrl: seller?.profilePic || "",
      });
    } catch (error) {
      Alert.alert(
        "Could not start call",
        getReadableApiErrorMessage(error, "Unable to start the call right now."),
      );
    }
  }, [ensureConversation, joinConversationRealtime, navigation, selectedServiceLabel, sendCallEventLog, seller?.profilePic, seller?.sellerName]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor={sellerHeaderTint} />

      <View style={[styles.header, { backgroundColor: sellerHeaderTint, borderBottomColor: `${colors.border}66`, paddingTop: 8 }]}>
        <TouchableOpacity style={styles.headerActionButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={20} color="#fff" />
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
              uri: seller?.profilePic || DEFAULT_AVATAR_URL
            }}
            style={styles.avatar}
          />

          <View style={styles.headerTextBlock}>
            <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
              {seller?.sellerName || "Loading..."}
            </Text>
            <View style={styles.statusRow}>
              <View style={[styles.presenceDot, { backgroundColor: sellerPresenceText === "Away" ? "#F59E0B" : "#22C55E" }]} />
              <Text style={[styles.status, { color: sellerStatusColor }]} numberOfLines={1} ellipsizeMode="tail">
                {typingUserId ? "Online now" : sellerPresenceText === "Away" ? "Away" : `Online • ${selectedServiceLabel}`}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.rightIcons}>
          <TouchableOpacity
            style={styles.headerActionButton}
            onPress={() => startCallFlow("audio")}
            disabled={!seller?.user}
          >
            <Icon name="call-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerActionButton}
            onPress={() => startCallFlow("video")}
            disabled={!seller?.user}
          >
            <Icon name="videocam-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerActionButton}
            onPress={() => setShowAssistant(true)}
          >
            <Icon name="sparkles-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerActionButton}
            onPress={() =>
              navigation.navigate("SellerDetailsScreen", { sellerId })
            }
          >
            <Icon name="ellipsis-vertical" size={20} color="#fff" />
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
                    style={[
                      styles.bookNowBtn,
                      !isSelected ? styles.bookNowBtnMuted : null,
                      seller?.availabilityStatus === false ? styles.bookNowBtnDisabled : null,
                    ]}
                    onPress={() => {
                      setSelectedService(item);
                      setShowPaymentModal(true);
                    }}
                    disabled={seller?.availabilityStatus === false}
                  >
                    <Text style={styles.bookNowText}>
                      {seller?.availabilityStatus === false
                        ? "Unavailable"
                        : isSelected
                          ? "Request in Chat"
                          : "Select & Request"}
                    </Text>
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

      {seller?.availabilityStatus === false ? (
        <View style={styles.unavailableBanner}>
          <Text style={styles.unavailableBannerText}>
            This seller is offline right now. Messaging and new appointments unlock after the seller turns availability on.
          </Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flexFill}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
        <View style={{ flex: 1 }}>
          {loading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="large" color={PRIMARY} />
            </View>
          ) : (
            <FlatList
              data={messages}
              renderItem={renderMessage}
              keyExtractor={(item) => getMessageRenderKey(item)}
              contentContainerStyle={{ padding: 12, paddingBottom: Math.max(20, 12 + insets.bottom) }}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    loadSellerChat({ refresh: true }).catch((error) => {
                      console.log("seller chat refresh error:", error);
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
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyTitle}>
                    {errorMessage ? "Conversation unavailable" : "No messages yet"}
                  </Text>
                  <Text style={styles.emptyText}>
                    {errorMessage || "Start the conversation here. Booking requests are handled through chat."}
                  </Text>
                </View>
              }
            />
          )}

        </View>

        <View style={[styles.inputWrap, { backgroundColor: colors.card, paddingBottom: Math.max(8, insets.bottom), borderTopColor: colors.border }]}>
          {!canUseComposer ? (
            <View style={[styles.composerLockedCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Icon name="lock-closed-outline" size={18} color={colors.primary} />
              <Text style={[styles.composerLockedText, { color: colors.text }]}>
                Seller availability off hai. Chat tabhi unlock hoga jab seller toggle on karega.
              </Text>
            </View>
          ) : null}

          {pendingVoiceNote ? (
            <View style={[styles.attachmentPreviewCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={styles.pendingVoicePreview}>
                <VoiceMessageBubble
                  audioUrl={pendingVoiceNote.uri}
                  durationSeconds={pendingVoiceNote.duration}
                  accentColor={PRIMARY}
                  backgroundColor={`${PRIMARY}10`}
                  textColor={colors.text}
                  metaColor={colors.placeholder}
                  label="Voice note preview"
                />
                <View style={styles.pendingVoiceActions}>
                  <TouchableOpacity
                    onPress={() => setPendingVoiceNote(null)}
                    disabled={uploading}
                    style={styles.pendingVoiceActionButton}
                  >
                    <Icon name="trash-outline" size={18} color={colors.placeholder} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null}

          <TouchableOpacity style={styles.attachButton} onPress={() => setShowStickerPicker(true)} disabled={uploading || loading || !canUseComposer}>
            <Icon name="happy-outline" size={22} color={colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.attachButton} onPress={sendCameraAttachment} disabled={uploading || loading || !canUseComposer}>
            <Icon name="camera-outline" size={22} color={colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity onPress={sendImageAttachment} disabled={uploading || loading || !canUseComposer}>
            <Icon name="image-outline" size={22} color={colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.attachButton} onPress={sendDocumentAttachment} disabled={uploading || loading || !canUseComposer}>
            <Icon name="document-outline" size={22} color={colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.attachButton} onPress={sendAudioAttachment} disabled={uploading || loading || !canUseComposer}>
            <Icon name="musical-notes-outline" size={22} color={colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.attachButton} onPress={() => setShowLocationComposer(true)} disabled={uploading || loading || !canUseComposer}>
            <Icon name="location-outline" size={22} color={colors.primary} />
          </TouchableOpacity>

          <TextInput
            placeholder={
              !canUseComposer
                ? "Seller availability on hote hi chat unlock hoga"
                : uploading
                  ? "Uploading attachment..."
                  : pendingVoiceNote
                    ? "Voice note ready to send"
                    : "Message..."
            }
            value={text}
            onChangeText={handleTextChange}
            style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]}
            editable={!loading && !sending && !uploading && canUseComposer}
            placeholderTextColor={colors.placeholder}
          />

          {uploading ? (
            <ActivityIndicator color={PRIMARY} />
          ) : pendingVoiceNote || text.trim() ? (
            <TouchableOpacity
              style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
              onPress={() => {
                if (pendingVoiceNote) {
                  sendPendingVoiceMessage().catch((error) => {
                    console.log("seller voice preview send error:", error);
                  });
                  return;
                }

                sendMessage().catch((error) => {
                  console.log("seller chat send error:", error);
                });
              }}
              disabled={sending || loading || !canUseComposer}
            >
              <Icon name="send" size={18} color="#fff" />
            </TouchableOpacity>
          ) : (
            <VoiceRecorderButton
              color={colors.primary}
              disabled={uploading || loading || !canUseComposer}
              onSend={sendVoiceMessage}
            />
          )}
        </View>
      </KeyboardAvoidingView>

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

      <StickerPickerSheet
        visible={showStickerPicker}
        onClose={() => setShowStickerPicker(false)}
        onSend={async (sticker) => {
          try {
            if (sticker.emoji && !sticker.imageUrl) {
              await submitMessage({
                text: sticker.emoji,
              });
              return;
            }

            const resolvedConversationId = await ensureConversation();
            if (!resolvedConversationId) {
              return;
            }

            const stickerText =
              sticker.type === "emoji"
                ? ""
                : sticker.type === "gif"
                  ? ""
                  : sticker.name || "Sticker";

            const res = await sendChatMessage({
              conversationId: resolvedConversationId,
              text: stickerText,
              mediaUrl: normalizeMediaUrl(sticker.imageUrl),
              messageType: sticker.type === "gif" ? "gif" : "image",
            });

            if (res?.message) {
              appendMessage(res.message as ChatMessage);
            }
          } catch (error) {
            console.log("seller sticker send error:", error);
          }
        }}
      />

      <Modal visible={showLocationComposer} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.locationModalBox}>
            <Text style={styles.modalTitle}>Share Location</Text>
            <Text style={styles.locationModalText}>
              Enter a place, address, or landmark. A Maps link will be sent in this chat.
            </Text>

            <TextInput
              value={locationDraft}
              onChangeText={setLocationDraft}
              style={styles.locationInput}
              placeholder="Cafe, airport, clinic, MG Road..."
              placeholderTextColor="#999"
              editable={!uploading}
            />

            <TouchableOpacity
              style={[styles.payBtn, uploading && styles.payBtnDisabled]}
              onPress={() => {
                sendLocationMessage().catch((error) => {
                  console.log("seller location send error:", error);
                });
              }}
              disabled={uploading}
            >
              {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.payBtnText}>Send Location</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setShowLocationComposer(false);
                setLocationDraft("");
              }}
              disabled={uploading}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showPaymentModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Book & Pay</Text>

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
              <Text style={styles.slotHeading}>Choose a slot before payment</Text>
              <Text style={styles.slotSubheading}>
                Only seller-set available timings are shown here.
              </Text>
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
                    ? "Seller availability abhi load nahi ho saki. Thodi der baad dobara try karo."
                    : `Payment pehle collect hoga. Successful payment ke baad hi appointment request book hogi aur seller ko bheji jayegi.${appointmentSlots[0]?.timeZone ? ` Slots shown in ${appointmentSlots[0].timeZone}.` : ""}`
                  : "This seller has not shared any bookable slots right now."}
            </Text>

            <TouchableOpacity
              style={[
                styles.payBtn,
                (loadingAppointmentSlots || !appointmentSlots.length || processingBookingPayment) && styles.payBtnDisabled,
              ]}
              onPress={() => {
                sendBookingRequest().catch((error) => {
                  console.log("seller booking request error:", error);
                });
              }}
              disabled={loadingAppointmentSlots || !appointmentSlots.length || processingBookingPayment}
            >
              {processingBookingPayment ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  Pay & Book Appointment
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowPaymentModal(false)} disabled={processingBookingPayment}>
              <Text style={{ marginTop: 10, color: "#777" }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
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
    </SafeAreaView>
  );
};

export default SellerChatScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5FA" },
  flexFill: { flex: 1 },
  header: {
    paddingBottom: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  centerHeader: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginLeft: 10
  },
  headerTextBlock: {
    marginLeft: 10,
    flexShrink: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22
  },
  name: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16
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
    fontSize: 12,
    fontWeight: "600"
  },
  rightIcons: {
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
  premiumServiceWrap: {
    backgroundColor: "#FFFFFF",
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderColor: "#ECE7F8"
  },
  premiumTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 12,
    marginBottom: 8,
    color: "#24173F",
  },
  premiumCard: {
    width: 188,
    backgroundColor: "#FCFAFF",
    padding: 13,
    borderRadius: 18,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#E7DCF8"
  },
  selectedCard: {
    backgroundColor: "#6F49E8",
    borderColor: "#6F49E8",
    shadowColor: "#6F49E8",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
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
  bookNowBtnDisabled: {
    opacity: 0.55,
  },
  selectedServiceBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#E8E0F5",
    backgroundColor: "#F8F4FF",
  },
  selectedServiceBannerText: {
    marginLeft: 8,
    color: "#47356B",
    fontWeight: "600",
  },
  unavailableBanner: {
    backgroundColor: "#FFF7D6",
    borderBottomWidth: 1,
    borderBottomColor: "#F9D66A",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  unavailableBannerText: {
    color: "#92400E",
    fontSize: 12,
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
    maxWidth: "80%",
    alignSelf: "flex-start",
    flexShrink: 1,
  },
  messageBubbleWide: {
    maxWidth: "92%",
    minWidth: 260,
  },
  sharedPostCard: {
    width: "100%",
    minWidth: 260,
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    backgroundColor: "rgba(123, 77, 255, 0.08)",
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(123, 77, 255, 0.08)",
  },
  callEventCardMine: {
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  callEventIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(123, 77, 255, 0.16)",
  },
  callEventIconMine: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  callEventBody: {
    flex: 1,
    marginLeft: 10,
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
    fontWeight: "600",
  },
  callEventMetaMine: {
    color: "rgba(255,255,255,0.78)",
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
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    borderRadius: 12,
    padding: 10,
    backgroundColor: "rgba(123, 77, 255, 0.08)",
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
    fontWeight: "700",
  },
  locationLink: {
    marginTop: 2,
    color: PRIMARY,
    fontSize: 12,
    fontWeight: "600",
  },
  myLocationLink: {
    marginTop: 2,
    color: "#E9DEFF",
    fontSize: 12,
    fontWeight: "600",
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
    paddingVertical: 8,
    paddingLeft: 10,
    backgroundColor: "#F8F6FD",
    borderTopWidth: 1,
    borderTopColor: "#E7E0F2"
  },
  quickChip: {
    backgroundColor: "#EEE7FF",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10
  },
  quickChipDisabled: {
    opacity: 0.45,
  },
  quickText: { color: PRIMARY, fontWeight: "600" },
  inputWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 10,
    backgroundColor: "#fff",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  composerLockedCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  composerLockedText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  attachmentPreviewCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 16,
    padding: 10,
    marginBottom: 10,
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
  attachButton: {
    marginRight: 10
  },
  input: {
    flex: 1,
    backgroundColor: "#F4F1FA",
    borderRadius: 22,
    paddingHorizontal: 15,
    minHeight: 44,
    fontSize: 13,
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
  locationModalBox: {
    width: "85%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 22,
  },
  modalTitle: { fontSize: 16, fontWeight: "700" },
  modalService: { marginTop: 10, fontWeight: "600" },
  modalPrice: { marginTop: 6, color: PRIMARY, fontWeight: "700" },
  locationModalText: {
    marginTop: 8,
    color: "#666",
    lineHeight: 20,
  },
  locationInput: {
    marginTop: 16,
    height: 48,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 12,
    color: "#111",
  },
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
  slotSubheading: {
    fontSize: 12,
    lineHeight: 18,
    color: "#6B5A8E",
    textAlign: "center",
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
  },
  payBtnText: {
    color: "#fff",
    fontWeight: "700",
    textAlign: "center",
  },
  modalCancelText: {
    marginTop: 10,
    color: "#777",
    textAlign: "center",
  }
});
