import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  ScrollView,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  StatusBar,
  Modal,
  ActivityIndicator,
  Linking,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
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
  type DocumentPickerResponse,
} from "@react-native-documents/picker";
import { API } from "../api/api";
import { connectSocket, socket } from "../socket";
import {
  buildCallEventMessage,
  getAttachmentDisplayName,
  getMessageAttachment,
  getMessageReply,
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
import {
  getExistingCallPayloadFromError,
  isCallAlreadyActiveError,
  startCallSession,
} from "../utils/callApi";
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
import { alpha, appFonts, appShadows } from "../theme/designSystem";
import { getChatLayoutMetrics } from "../theme/chatUi";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { showModerationBlockedSheet } from "../utils/moderationNotice";
import { openSharedContent } from "../utils/socialNavigation";
import VoiceMessageBubble from "../components/chat/VoiceMessageBubble";
import StickerPickerSheet from "../components/chat/StickerPickerSheet";
import AISupportSheet from "../components/chat/AISupportSheet";
import MessageLinkPreview from "../components/chat/MessageLinkPreview";
import ChatLockModal from "../components/chat/ChatLockModal";
import DocumentViewerModal from "../components/chat/DocumentViewerModal";
import SocialVideo from "../features/social/components/SocialVideo";
import { ensureCameraPermission, resolveCameraCaptureMediaType } from "../utils/permissions";
import { normalizeMediaFieldsDeep, normalizeMediaUrl } from "../utils/mediaUrls";
import {
  hasChatLockPasscode,
  isConversationLocked,
  setChatLockPasscode,
  setConversationLocked,
  verifyChatLockPasscode,
} from "../utils/chatSecurity";

const PRIMARY = "#7B4DFF";
const CHAT_BG = "#0A0F1C";
const CHAT_PANEL = "#101827";
const CHAT_PANEL_ALT = "#151F34";
const CHAT_PANEL_SOFT = "#1C2740";
const CHAT_BORDER = "rgba(255,255,255,0.08)";
const CHAT_TEXT_MUTED = "#9AA6C1";
const LOCATION_MESSAGE_LABEL = "Shared location:";

const buildLocationMessage = (query: string): string => {
  const cleanQuery = String(query || "").trim();
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanQuery)}`;
  return `${LOCATION_MESSAGE_LABEL} ${cleanQuery}\n${mapsUrl}`;
};

const buildOutgoingSendGuardKey = ({
  conversationId,
  text,
  file,
  messageType,
  duration,
  replyToMessageId,
}: {
  conversationId?: string | null;
  text?: string;
  file?: { uri?: string; name?: string | null; type?: string | null };
  messageType?: string;
  duration?: number;
  replyToMessageId?: string;
}): string =>
  [
    String(conversationId || "").trim(),
    String(text || "").trim(),
    String(file?.uri || "").trim(),
    String(file?.name || "").trim(),
    String(messageType || "text").trim().toLowerCase(),
    Number(duration || 0),
    String(replyToMessageId || "").trim(),
  ].join("::");

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

const formatLastSeenStatus = (value?: string): string => {
  if (!value) {
    return "Away";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Away";
  }

  const now = new Date();
  const diffMinutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / (1000 * 60)));

  if (diffMinutes <= 1) {
    return "Last seen just now";
  }

  if (diffMinutes < 60) {
    return `Last seen ${diffMinutes}m ago`;
  }

  const sameDay = date.toDateString() === now.toDateString();
  const timeLabel = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (sameDay) {
    return `Last seen ${timeLabel}`;
  }

  const dateLabel = date.toLocaleDateString([], { month: "short", day: "numeric" });
  return `Last seen ${dateLabel}`;
};

type SellerProfile = {
  _id: string;
  user?: string | { _id?: string };
  sellerName?: string;
  profilePic?: string;
  availabilityStatus?: boolean;
  isOnline?: boolean;
  lastSeenAt?: string;
};

type AttachmentShape = {
  url?: string;
  fileName?: string;
  mimeType?: string;
  thumbnailUrl?: string;
};

type MessagePreviewState = {
  imageUrl?: string;
  videoUrl?: string;
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
  createdAt?: string;
  replyToMessage?: ChatMessage | null;
  replyTo?: ChatMessage | string | null;
  parentMessage?: ChatMessage | null;
  replyToMessageId?: string;
  replyMessageId?: string;
  parentMessageId?: string;
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
  details?: string;
};

type ReplyPreviewState = {
  id: string;
  author: string;
  snippet: string;
  message: ChatMessage;
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

const formatAppointmentSlotDateLabel = (isoValue: string) =>
  new Date(isoValue).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const formatAppointmentSlotTimeLabel = (isoValue: string) =>
  new Date(isoValue).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

const formatAppointmentSlotWindow = (slot?: AppointmentSlot | null) => {
  if (!slot?.start) {
    return "";
  }

  const startDate = new Date(slot.start);
  if (Number.isNaN(startDate.getTime())) {
    return slot.label || "";
  }

  const endDate = slot.end ? new Date(slot.end) : null;
  const startLabel = startDate.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  if (endDate && !Number.isNaN(endDate.getTime())) {
    const endLabel = endDate.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${startLabel} - ${endLabel}`;
  }

  return startLabel;
};

const formatMessageTime = (value?: string) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
};

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
  const event = String(callEvent.event || "started");

  if (event === "missed") {
    return {
      label: isVideo ? "Missed video call" : "Missed voice call",
      details: direction === "outgoing" ? "No answer" : "Missed",
      icon: isVideo ? "videocam-outline" : "call-outline",
    };
  }

  return {
    label: isVideo ? "Video call" : "Voice call",
    details: event === "ended" ? "Completed" : direction === "outgoing" ? "Calling" : "Incoming",
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
  const seenSignatures = new Set<string>();

  return (Array.isArray(items) ? items : []).filter((item) => {
    const identity = getMessageIdentity(item);
    const signature = buildMessageSignature(item);

    if (identity) {
      if (seen.has(identity)) {
        return false;
      }

      seen.add(identity);
    }

    if (!identity && signature && seenSignatures.has(signature)) {
      return false;
    }

    if (!identity && signature) {
      seenSignatures.add(signature);
    }

    return true;
  });
};

const buildMessageSignature = (message: ChatMessage | null | undefined): string => {
  const attachment = getMessageAttachment(message);
  const replyId =
    String((message as any)?.replyToMessageId || "").trim()
    || getMessageIdentity(getMessageReply(message) as ChatMessage | null | undefined)
    || "";

  return [
    String((message as any)?.messageType || "text").trim().toLowerCase(),
    String(getMessageText(message) || "").trim(),
    normalizeMediaUrl((message as any)?.mediaUrl || attachment?.url || ""),
    String(attachment?.fileName || "").trim(),
    Number((message as any)?.duration || 0),
    replyId,
  ].join("::");
};

const SellerChatScreen = ({ route, navigation }: any) => {
  const { colors, isDarkMode } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const chatMetrics = useMemo(() => getChatLayoutMetrics(width), [width]);
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
  const [sellerLastSeenAt, setSellerLastSeenAt] = useState("");
  const [sellerPresenceStatus, setSellerPresenceStatus] = useState("");
  const [showLocationComposer, setShowLocationComposer] = useState(false);
  const [locationDraft, setLocationDraft] = useState("");
  const [messagePreview, setMessagePreview] = useState<MessagePreviewState | null>(null);
  const [documentPreview, setDocumentPreview] = useState<{ url: string; fileName?: string } | null>(null);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [pendingVoiceNote, setPendingVoiceNote] = useState<PendingVoiceNote | null>(null);
  const [isConversationLockedState, setIsConversationLockedState] = useState(false);
  const [chatLockModalVisible, setChatLockModalVisible] = useState(false);
  const [chatLockMode, setChatLockMode] = useState<"unlock" | "setup">("unlock");
  const [lockingBusy, setLockingBusy] = useState(false);
  const [pendingLockAction, setPendingLockAction] = useState<"lock" | "unlock">("unlock");
  const [replyingToMessage, setReplyingToMessage] = useState<ChatMessage | null>(null);
  const [showAssistant, setShowAssistant] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textSendLockRef = useRef(false);
  const recentOutgoingSendRef = useRef<{ key: string; timestamp: number }>({ key: "", timestamp: 0 });
  const messageInputRef = useRef<TextInput | null>(null);
  const selectedServiceLabel = selectedService?.serviceName || serviceName || "service requests";
  const selectedAppointmentSlot = useMemo(
    () => appointmentSlots.find((slot) => slot.start === selectedAppointmentStart) || null,
    [appointmentSlots, selectedAppointmentStart],
  );
  const isCompactBookingSheet = width < 380;
  const bookingSheetWidth = Math.min(width - 16, 430);
  const bookingSheetMaxHeight = Math.min(height * 0.86, 760);
  const isSellerActive = useMemo(
    () => Boolean(typingUserId || isSellerOnline),
    [isSellerOnline, typingUserId],
  );

  const sellerPresenceText = useMemo(() => {
    if (typingUserId) {
      return "Typing...";
    }

    if (isSellerActive) {
      return `Active now • ${selectedServiceLabel}`;
    }

    const lastSeenLabel = formatLastSeenStatus(sellerLastSeenAt || seller?.lastSeenAt);
    return lastSeenLabel === "Away" ? `Away • ${selectedServiceLabel}` : `${lastSeenLabel} • ${selectedServiceLabel}`;
  }, [isSellerActive, selectedServiceLabel, seller?.lastSeenAt, sellerLastSeenAt, typingUserId]);

  const normalizedSellerPresenceText = useMemo(() => {
    if (typingUserId) {
      return "Typing...";
    }

    if (String(sellerPresenceStatus || "").trim().toLowerCase() === "away") {
      return `Away • ${selectedServiceLabel}`;
    }

    if (isSellerActive || String(sellerPresenceStatus || "").trim().toLowerCase() === "active") {
      return `Active now • ${selectedServiceLabel}`;
    }

    const lastSeenLabel = formatLastSeenStatus(sellerLastSeenAt || seller?.lastSeenAt);
    return lastSeenLabel === "Away" ? `Away • ${selectedServiceLabel}` : `${lastSeenLabel} • ${selectedServiceLabel}`;
  }, [isSellerActive, selectedServiceLabel, seller?.lastSeenAt, sellerLastSeenAt, sellerPresenceStatus, typingUserId]);

  const sellerChatColors = useMemo(() => ({
    background: isDarkMode ? CHAT_BG : colors.background,
    panel: isDarkMode ? CHAT_PANEL : colors.card,
    panelAlt: isDarkMode ? CHAT_PANEL_ALT : colors.surface,
    panelSoft: isDarkMode ? CHAT_PANEL_SOFT : alpha(colors.primary, "0E"),
    border: isDarkMode ? CHAT_BORDER : alpha(colors.border, "D8"),
    text: isDarkMode ? "#F8FAFF" : colors.text,
    muted: isDarkMode ? CHAT_TEXT_MUTED : colors.mutedText,
    headerIcon: isDarkMode ? "#FFFFFF" : colors.primary,
    headerButtonBg: isDarkMode ? alpha("#FFFFFF", "14") : alpha(colors.primary, "10"),
    headerButtonBorder: isDarkMode ? alpha("#FFFFFF", "24") : alpha(colors.primary, "26"),
    headerClusterBg: isDarkMode ? alpha("#FFFFFF", "10") : alpha(colors.primary, "0E"),
    headerClusterBorder: isDarkMode ? alpha("#FFFFFF", "16") : alpha(colors.border, "C8"),
    accentSoft: isDarkMode ? "rgba(123, 77, 255, 0.18)" : alpha(colors.primary, "14"),
    accentText: isDarkMode ? "#BFA7FF" : colors.primary,
    selectedSoftText: isDarkMode ? "#E9DEFF" : "#F3EEFF",
    warningBg: isDarkMode ? CHAT_PANEL_SOFT : "#FFF7E6",
    warningText: isDarkMode ? "#F5D995" : "#8A5A00",
    overlay: isDarkMode ? "rgba(10,15,28,0.62)" : "rgba(15,23,42,0.28)",
  }), [colors, isDarkMode]);

  const sellerStatusColor = isDarkMode ? "rgba(255,255,255,0.78)" : colors.mutedText;
  const canUseComposer = seller?.availabilityStatus !== false;
  const assistantScope = "Seller chat support";
  const assistantScopeHint = `Get help with booking, payment, appointments, and chat support for ${seller?.sellerName || "this seller"}.`;
  const assistantConversationSummary = `Selected service: ${selectedService?.serviceName || serviceName || "service requests"}. Seller status: ${normalizedSellerPresenceText}.${seller?.availabilityStatus === false ? " Messaging currently locked until seller turns availability on." : ""}`;
  const assistantSuggestedPrompts = [
    "Explain the booking flow",
    "Help fix a payment issue",
    "Why is the seller unavailable?",
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
  const bookingTimelineMessages = useMemo(
    () =>
      messages.filter((message) => {
        if (String(message?.messageType || "") !== "system") {
          return false;
        }

        return !parseCallEventMessage(message);
      }),
    [messages],
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
  const replyingToMessageId = useMemo(() => getMessageIdentity(replyingToMessage), [replyingToMessage]);

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
    const senderInfo =
      typeof resolvedMessage?.sender === "object"
        ? (resolvedMessage.sender as { username?: string; name?: string } | null)
        : null;
    const author = senderId && senderId === String(currentUserId || "")
      ? "You"
      : String(senderInfo?.username || senderInfo?.name || seller?.sellerName || "Reply");
    const snippet = getMessageText(resolvedMessage) || String(resolvedMessage?.messageType || "Message");

    return {
      id: messageId,
      author,
      snippet,
      message: resolvedMessage,
    };
  }, [currentUserId, messageMap, seller?.sellerName]);

  const replyingToPreview = useMemo(
    () => buildReplyPreview(replyingToMessage),
    [buildReplyPreview, replyingToMessage],
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
    const nextSeller = res.data.seller as SellerProfile;
    setSeller(nextSeller);

    const resolvedSellerUserId =
      (typeof nextSeller?.user === "string" ? nextSeller.user : nextSeller?.user?._id)
      || initialSellerUserId
      || "";

    let nextIsOnline = Boolean(nextSeller?.isOnline);
    let nextLastSeenAt = String(nextSeller?.lastSeenAt || "");

    if (resolvedSellerUserId) {
      try {
        const presenceRes = await API.get(`/auth/user/${resolvedSellerUserId}`);
        const presenceUser = presenceRes?.data?.user || {};
        nextIsOnline = Boolean(presenceUser?.isOnline ?? nextIsOnline);
        nextLastSeenAt = String(presenceUser?.lastSeenAt || nextLastSeenAt || "");
        setSellerPresenceStatus(String(presenceUser?.availabilityStatus || ""));
      } catch (error) {
        console.log("seller presence fetch error:", error);
      }
    }

    setIsSellerOnline(nextIsOnline);
    setSellerLastSeenAt(nextLastSeenAt);
    return nextSeller;
  }, [initialSellerUserId, sellerId]);

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
      const nextSignature = buildMessageSignature(normalizedMessage);
      let hasChanged = false;

      const mergedItems = prev.map((item) => {
        const itemIdentity = getMessageIdentity(item);
        if (nextIdentity && itemIdentity === nextIdentity) {
          hasChanged = true;
          return { ...item, ...normalizedMessage };
        }

        if (!hasChanged && ((item as any)?._optimistic || !itemIdentity) && buildMessageSignature(item) === nextSignature) {
          hasChanged = true;
          return { ...item, ...normalizedMessage };
        }

        return item;
      });

      if (hasChanged) {
        return dedupeMessages(mergedItems);
      }

      return dedupeMessages([...prev, normalizedMessage]);
    });
  }, []);

  const applyMessageSeen = useCallback((payload: { messageId?: string; userId?: string; seenAt?: string }) => {
    setMessages((prev) => mergeMessageSeen(prev, payload) as ChatMessage[]);
  }, []);

  const applyMessageReaction = useCallback((payload: { messageId?: string; userId?: string; emoji?: string }) => {
    setMessages((prev) => mergeMessageReaction(prev, payload) as ChatMessage[]);
  }, []);

  const submitMessage = useCallback(async ({ text: nextText, file, messageType, duration }: { text?: string; file?: { uri?: string; name?: string | null; type?: string | null }; messageType?: string; duration?: number }) => {
    if (!canUseComposer) {
      throw new Error("Messaging is locked until this seller turns availability on.");
    }

    const resolvedConversationId = await ensureConversation();

    if (!resolvedConversationId) {
      throw new Error("Unable to start this seller conversation right now.");
    }

    const sendGuardKey = buildOutgoingSendGuardKey({
      conversationId: resolvedConversationId,
      text: nextText,
      file,
      messageType,
      duration,
      replyToMessageId: replyingToMessageId || undefined,
    });
    const sendAttemptedAt = Date.now();
    if (
      sendGuardKey
      && recentOutgoingSendRef.current.key === sendGuardKey
      && sendAttemptedAt - recentOutgoingSendRef.current.timestamp < 1400
    ) {
      return;
    }
    recentOutgoingSendRef.current = { key: sendGuardKey, timestamp: sendAttemptedAt };

    try {
      const res = await sendChatMessage({
        conversationId: resolvedConversationId,
        text: nextText,
        file,
        messageType,
        duration,
        replyToMessageId: replyingToMessageId || undefined,
      });

      const nextMessage = replyingToMessage
        ? {
          ...(res.message as ChatMessage),
          replyToMessageId: (res.message as ChatMessage)?.replyToMessageId || replyingToMessageId,
          replyToMessage: (res.message as ChatMessage)?.replyToMessage || replyingToMessage,
        }
        : res.message as ChatMessage;
      appendMessage(nextMessage);
      setReplyingToMessage(null);
    } catch (error) {
      if (recentOutgoingSendRef.current.key === sendGuardKey) {
        recentOutgoingSendRef.current = { key: "", timestamp: 0 };
      }
      throw error;
    }
  }, [appendMessage, canUseComposer, ensureConversation, replyingToMessage, replyingToMessageId]);

  const sendMessage = useCallback(async (msgText = text) => {
    if (!msgText.trim() || sending || textSendLockRef.current) {
      return;
    }

    try {
      textSendLockRef.current = true;
      setSending(true);
      await submitMessage({ text: msgText.trim() });
      setText("");
    } catch (error) {
      console.log("seller chat send error:", error);
      Alert.alert("Error", getReadableApiErrorMessage(error, "Failed to send message"));
    } finally {
      textSendLockRef.current = false;
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

  const finalizeSuccessfulBooking = useCallback(async ({
    bookedRequest,
    systemMessage,
    targetService,
    noteText,
  }: {
    bookedRequest: any;
    systemMessage?: ChatMessage | null;
    targetService: SellerService;
    noteText: string;
  }) => {
    const appointmentStartValue = bookedRequest?.appointmentStart || selectedAppointmentStart;
    const appointmentDurationMinutes =
      Number(bookedRequest?.appointmentDurationMinutes)
      || Number(getPrimaryPricingOption(targetService)?.durationMinutes)
      || 30;
    const appointmentEndValue = appointmentStartValue
      ? new Date(new Date(appointmentStartValue).getTime() + appointmentDurationMinutes * 60 * 1000)
      : null;

    if (systemMessage) {
      appendMessage(systemMessage);
    }

    setShowPaymentModal(false);
    setSelectedAppointmentStart("");
    setReplyingToMessage(null);
    setText("");

    Alert.alert(
      "Appointment Requested",
      "Your appointment request is booked and the seller has been notified.",
      appointmentStartValue && appointmentEndValue ? [
        {
          text: "Add to Calendar",
          onPress: async () => {
            const calendarUrl = buildGoogleCalendarUrl({
              title: `${targetService.serviceName || serviceName || "Aline2 appointment"} with ${seller?.sellerName || "seller"}`,
              details: [
                `Seller: ${seller?.sellerName || "Aline2 seller"}`,
                `Service: ${targetService.serviceName || serviceName || "Appointment"}`,
                noteText ? `Note: ${noteText}` : "",
              ].filter(Boolean).join("\n"),
              start: appointmentStartValue,
              end: appointmentEndValue,
            });

            try {
              await Linking.openURL(calendarUrl);
            } catch (calendarError) {
              console.log("seller booking calendar open error:", calendarError);
              Alert.alert("Calendar unavailable", "The calendar link could not be opened. Appointment details are still available in notifications.");
            }
          },
        },
        {
          text: "Done",
          style: "cancel",
        },
      ] : undefined,
    );
  }, [appendMessage, selectedAppointmentStart, seller?.sellerName, serviceName]);

  const sendBookingRequest = useCallback(async () => {
    const targetService = selectedService;

    if (!targetService) {
      return;
    }

    try {
      const resolvedConversationId = await ensureConversation();
      const pricingModel = getPrimaryPricingOption(targetService)?.model;
      const noteText = text.trim() || `Request for ${targetService.serviceName || serviceName || "service"}`;
      setProcessingBookingPayment(true);
      const res = await API.post("/service-requests", {
        serviceId: targetService._id,
        conversationId: resolvedConversationId || undefined,
        pricingModel,
        note: noteText,
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
          setShowPaymentModal(false);
          setSelectedAppointmentStart("");
          setText("");
          Alert.alert(
            "Payment Pending",
            "Your appointment request is saved. Complete payment later from User Dashboard > My Bookings, or recharge coins first.",
            [
              {
                text: "My Bookings",
                onPress: () => navigation.navigate("ServiceRequestsScreen", { mode: "user" }),
              },
              {
                text: "Later",
                style: "cancel",
              },
            ],
          );
          return;
        }
        throw checkoutError;
      }

      const verifyRes = await API.post(`/service-requests/${requestId}/payment/verify`, checkoutResult);
      await finalizeSuccessfulBooking({
        bookedRequest: verifyRes?.data?.request,
        systemMessage: verifyRes?.data?.systemMessage || null,
        targetService,
        noteText,
      });
    } catch (error: any) {
      console.log("seller booking request error:", error?.response?.data || error);
      Alert.alert("Error", getReadableApiErrorMessage(error, error?.description || "Failed to start booking payment"));
    } finally {
      setProcessingBookingPayment(false);
    }
  }, [ensureConversation, finalizeSuccessfulBooking, navigation, selectedAppointmentStart, selectedService, serviceName, text]);

  const openBookingFlow = useCallback((service: SellerService) => {
    setSelectedService(service);
    setShowPaymentModal(true);
  }, []);

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
          if (showModerationBlockedSheet(error, { fallbackMessage: "This attachment could not be sent right now." })) {
            return;
          }
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
          if (showModerationBlockedSheet(error, { fallbackMessage: "This capture could not be sent right now." })) {
            return;
          }
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
        },
        messageType: "audio",
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

      if (seller?.isOnline !== true) {
        setIsSellerOnline(false);
      }
    };

    const handleMessageSeen = (data: { messageId?: string; userId?: string; seenAt?: string }) => {
      applyMessageSeen(data);
    };

    const handleMessageReaction = (data: { messageId?: string; userId?: string; emoji?: string }) => {
      applyMessageReaction(data);
    };

    const handleMessageEdited = (data: { messageId?: string; text?: string; editedAt?: string }) => {
      if (!data?.messageId) {
        return;
      }

      setMessages((prev) =>
        prev.map((msg) =>
          getMessageIdentity(msg) === String(data.messageId)
            ? { ...msg, text: data.text || "", isEdited: true, editedAt: data.editedAt }
            : msg
        )
      );
    };

    const handleMessageDeleted = (data: { messageId?: string }) => {
      if (!data?.messageId) {
        return;
      }

      setMessages((prev) => prev.filter((msg) => getMessageIdentity(msg) !== String(data.messageId)));
      setReplyingToMessage((prev) => (getMessageIdentity(prev) === String(data.messageId) ? null : prev));
    };

    const handlePresenceUpdate = (data: { userId?: string; isOnline?: boolean; lastSeenAt?: string; availabilityStatus?: string }) => {
      const nextUserId = String(data?.userId || "");
      if (!nextUserId || nextUserId !== String(sellerUserId || "")) {
        return;
      }

      setIsSellerOnline(Boolean(data?.isOnline));
      setSellerLastSeenAt(String(data?.lastSeenAt || ""));
      setSellerPresenceStatus(String(data?.availabilityStatus || ""));
    };

    socket.on("receiveMessage", handleReceiveMessage);
    socket.on("typing", handleTyping);
    socket.on("stopTyping", handleStopTyping);
    socket.on("messageSeen", handleMessageSeen);
    socket.on("messageReaction", handleMessageReaction);
    socket.on("messageEdited", handleMessageEdited);
    socket.on("messageDeleted", handleMessageDeleted);
    socket.on("presence:update", handlePresenceUpdate);

    return () => {
      socket.off("receiveMessage", handleReceiveMessage);
      socket.off("typing", handleTyping);
      socket.off("stopTyping", handleStopTyping);
      socket.off("messageSeen", handleMessageSeen);
      socket.off("messageReaction", handleMessageReaction);
      socket.off("messageEdited", handleMessageEdited);
      socket.off("messageDeleted", handleMessageDeleted);
      socket.off("presence:update", handlePresenceUpdate);
    };
  }, [
    appendMessage,
    applyMessageReaction,
    applyMessageSeen,
    currentConversationId,
    currentUserId,
    seller?.isOnline,
    sellerUserId,
  ]);

  useEffect(() => {
    if (!currentConversationId) {
      return;
    }

    void joinConversationRealtime(currentConversationId);
  }, [currentConversationId, joinConversationRealtime]);

  useEffect(() => {
    let active = true;

    const loadConversationLockState = async () => {
      if (!currentUserId || !currentConversationId) {
        if (active) {
          setIsConversationLockedState(false);
        }
        return;
      }

      const locked = await isConversationLocked(currentUserId, currentConversationId);
      if (active) {
        setIsConversationLockedState(locked);
      }
    };

    loadConversationLockState().catch((error) => {
      console.log("seller chat lock load error:", error);
    });

    return () => {
      active = false;
    };
  }, [currentConversationId, currentUserId]);

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

  const submitChatLockPasscode = useCallback(async (passcode: string) => {
    try {
      if (!currentUserId || !currentConversationId) {
        throw new Error("This chat is not ready to lock yet.");
      }

      setLockingBusy(true);
      if (chatLockMode === "setup") {
        await setChatLockPasscode(passcode);
        await setConversationLocked(currentUserId, currentConversationId, true);
        setIsConversationLockedState(true);
      } else {
        const isValid = await verifyChatLockPasscode(passcode);
        if (!isValid) {
          throw new Error("Incorrect passcode.");
        }

        const shouldLock = pendingLockAction === "lock";
        await setConversationLocked(currentUserId, currentConversationId, shouldLock);
        setIsConversationLockedState(shouldLock);
      }

      setChatLockModalVisible(false);
    } catch (error) {
      Alert.alert("Chat lock", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setLockingBusy(false);
    }
  }, [chatLockMode, currentConversationId, currentUserId, pendingLockAction]);

  const toggleSellerChatLock = useCallback(async () => {
    if (!currentUserId) {
      return;
    }

    const targetConversationId = currentConversationId || await ensureConversation();
    if (!targetConversationId) {
      Alert.alert("Chat lock", "Open this seller chat once before locking it.");
      return;
    }

    if (!currentConversationId && targetConversationId) {
      setCurrentConversationId(targetConversationId);
    }

    if (!isConversationLockedState) {
      const hasPasscode = await hasChatLockPasscode();
      if (!hasPasscode) {
        setPendingLockAction("lock");
        setChatLockMode("setup");
        setChatLockModalVisible(true);
        return;
      }

      await setConversationLocked(currentUserId, targetConversationId, true);
      setIsConversationLockedState(true);
      return;
    }

    setPendingLockAction("unlock");
    setChatLockMode("unlock");
    setChatLockModalVisible(true);
  }, [currentConversationId, currentUserId, ensureConversation, isConversationLockedState]);

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

  const startReplyToMessage = useCallback((message: ChatMessage) => {
    setReplyingToMessage(message);
    requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  }, []);

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
    const nextMessageId = getMessageIdentity(nextMessage);
    if (!nextMessageId) {
      return;
    }

    connectSocket()
      .then(() => {
        socket.emit("messageSeen", {
          conversationId: currentConversationId,
          messageId: nextMessageId,
        });
        applyMessageSeen({
          messageId: nextMessageId,
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

  const sendVoiceMessage = useCallback(async (voiceFile: { uri: string; name: string; type: string; duration: number }) => {
    try {
      setPendingVoiceNote(null);
      setUploading(true);
      await submitMessage({
        file: {
          uri: voiceFile.uri,
          name: voiceFile.name,
          type: voiceFile.type,
        },
        duration: voiceFile.duration,
        messageType: "voice",
      });
    } catch (error) {
      console.log("seller voice send error:", error);
      Alert.alert("Voice message failed", getReadableApiErrorMessage(error, "Unable to send voice message right now."));
    } finally {
      setUploading(false);
    }
  }, [submitMessage]);

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
      const videoUrl = normalizeMediaUrl(attachment?.url || (message as any)?.mediaUrl);
      if (videoUrl) {
        setMessagePreview({
          imageUrl: attachment?.thumbnailUrl ? normalizeMediaUrl(attachment.thumbnailUrl) : undefined,
          videoUrl,
          title: getAttachmentDisplayName(message),
        });
      } else {
        openAttachmentUrl(attachment?.url, "This video could not be opened right now.");
      }
      return;
    }

    if (isAudioMessage(message) || String(message?.messageType || "") === "voice") {
      return;
    }

    if (isDocumentMessage(message)) {
      const docUrl = attachment?.url || (message as any)?.mediaUrl;
      const docName = getAttachmentDisplayName(message) || attachment?.fileName || "Document";
      if (docUrl) {
        setDocumentPreview({ url: docUrl, fileName: docName });
      } else {
        openAttachmentUrl(attachment?.url, "This document could not be opened right now.");
      }
    }
  }, [openAttachmentUrl]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMine = String(getMessageSenderId(item)) === String(currentUserId || "");
    const isSystemMessage = String(item?.messageType || "") === "system";
    const attachment = getMessageAttachment(item);
    const textValue = getMessageText(item);
    const normalizedMessageType = String(item?.messageType || "").trim().toLowerCase();
    const sharedContent = parseSharedContentMessage(item);
    const callEvent = buildCallEventPreview(item, currentUserId);
    const sharedMedia = Array.isArray(sharedContent?.media) ? sharedContent.media[0] : null;
    const locationPayload = parseLocationMessage(textValue);
    const linkPreview = (item as any)?.linkPreview || null;
    const seenCount = Array.isArray(item?.seenBy) ? item.seenBy.length : 0;
    const reactions = Array.isArray(item?.reactions) ? item.reactions : [];
    const repliedMessage = getMessageReply(item) as ChatMessage | null;
    const replyPreview = buildReplyPreview(repliedMessage);
    const messageTimeLabel = formatMessageTime(item?.createdAt);
    const messageStatusIcon = seenCount > 0 ? "checkmark-done" : "checkmark";
    const messageStatusIconColor = seenCount > 0 ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.72)";
    const incomingBubbleText = isDarkMode ? "#F5F7FF" : colors.text;
    const incomingBubbleMeta = isDarkMode ? CHAT_TEXT_MUTED : colors.mutedText;
    let swipeableRef: Swipeable | null = null;

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
          if (!isSystemMessage) {
            startReplyToMessage(item);
          }
        }}
      >
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
              {
                paddingHorizontal: chatMetrics.bubblePaddingX,
                paddingVertical: chatMetrics.bubblePaddingY,
                borderRadius: chatMetrics.bubbleRadius,
                maxWidth: chatMetrics.bubbleMaxWidth,
                minWidth: minimumReadableBubbleWidth,
              },
              sharedContent || callEvent || isDocumentMessage(item)
                ? [styles.messageBubbleWide, { maxWidth: chatMetrics.wideBubbleMaxWidth, minWidth: minimumWideBubbleWidth }]
                : null,
              isMine ? styles.myMsg : styles.otherMsg,
              isMine
                ? { backgroundColor: colors.primary }
                : { backgroundColor: sellerChatColors.panelAlt, borderColor: sellerChatColors.border }
            ]}
          >
            {replyPreview ? (
              <View style={[styles.replyPreviewCard, isMine ? styles.replyPreviewCardMine : { backgroundColor: alpha(colors.primary, "10") }]}>
                <View style={[styles.replyPreviewBar, isMine ? styles.replyPreviewBarMine : null]} />
                <View style={styles.replyPreviewBody}>
                  <Text style={[styles.replyPreviewAuthor, isMine ? styles.replyPreviewAuthorMine : null, { fontSize: chatMetrics.metaFontSize + 0.5 }]} numberOfLines={1}>
                    {replyPreview.author}
                  </Text>
                  <Text style={[styles.replyPreviewSnippet, isMine ? styles.replyPreviewSnippetMine : { color: incomingBubbleMeta }, { fontSize: chatMetrics.metaFontSize, lineHeight: chatMetrics.metaFontSize + 6 }]} numberOfLines={1}>
                    {replyPreview.snippet}
                  </Text>
                </View>
              </View>
            ) : null}

            {sharedContent?.kind === "post" || sharedContent?.kind === "story" || sharedContent?.kind === "swipe" ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  if (sharedContent?.kind === "post" || sharedContent?.kind === "swipe") {
                    openSharedContent(navigation, sharedContent);
                    return;
                  }
                  if (sharedContent?.kind === "story" && sharedContent?.storyId) {
                    navigation.navigate("StoryViewer", {
                      storyId: sharedContent.storyId,
                      storyUserId: sharedContent?.user?.id,
                    });
                  }
                }}
                style={[styles.sharedPostCard, isMine ? styles.sharedPostCardMine : { backgroundColor: alpha(colors.primary, "08") }]}
              >
                <View style={styles.sharedPostHeader}>
                  <Image
                    source={{ uri: normalizeMediaUrl(sharedContent?.user?.avatarUrl || DEFAULT_AVATAR_URL) }}
                    style={styles.sharedPostAvatar}
                  />
                  <View style={styles.sharedPostMeta}>
                    <Text style={[styles.sharedPostAuthor, isMine ? styles.sharedPostAuthorMine : { color: incomingBubbleText }, { fontSize: chatMetrics.metaFontSize + 1 }]} numberOfLines={1}>
                      {sharedContent?.user?.username
                        ? `@${sharedContent.user.username}`
                        : sharedContent?.user?.name || (sharedContent?.kind === "story" ? "Aline2 story" : "Aline2 post")}
                    </Text>
                    <Text style={[styles.sharedPostLabel, isMine ? styles.sharedPostLabelMine : { color: incomingBubbleMeta }, { fontSize: chatMetrics.metaFontSize }]} numberOfLines={1}>
                      {sharedContent?.kind === "story"
                        ? sharedContent?.interaction?.type === "reply"
                          ? "Story reply"
                          : sharedContent?.interaction?.type === "like"
                            ? "Story like"
                            : "Shared story"
                        : sharedContent?.kind === "swipe"
                          ? "Shared swipe"
                          : "Shared post"}
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
                  <Text style={[styles.sharedPostCaption, isMine ? styles.sharedPostCaptionMine : { color: incomingBubbleText }, { fontSize: chatMetrics.metaFontSize + 1, lineHeight: chatMetrics.metaFontSize + 7 }]} numberOfLines={3}>
                    {sharedContent.caption}
                  </Text>
                ) : null}

                {sharedContent?.kind === "story" && sharedContent?.interaction?.text ? (
                  <Text style={[styles.sharedPostCaption, isMine ? styles.sharedPostCaptionMine : { color: incomingBubbleText }, { fontSize: chatMetrics.metaFontSize + 0.5, lineHeight: chatMetrics.metaFontSize + 6 }]} numberOfLines={2}>
                    {sharedContent.interaction.text}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ) : null}

            {callEvent ? (
              <View style={[styles.callEventCard, isMine ? styles.callEventCardMine : { backgroundColor: alpha(colors.primary, "08") }]}>
                <View style={[styles.callEventIcon, isMine ? styles.callEventIconMine : null]}>
                  <Icon
                    name={callEvent.icon}
                    size={16}
                    color={isMine ? "#fff" : PRIMARY}
                  />
                </View>
                <View style={styles.callEventBody}>
                  <Text style={[styles.callEventTitle, isMine ? styles.callEventTitleMine : { color: incomingBubbleText }, { fontSize: chatMetrics.metaFontSize + 1 }]}>
                    {callEvent.label}
                  </Text>
                  <Text style={[styles.callEventMeta, isMine ? styles.callEventMetaMine : { color: incomingBubbleMeta }, { fontSize: chatMetrics.metaFontSize }]}>
                    Call activity is saved in chat
                  </Text>
                </View>
              </View>
            ) : null}

            {isImageMessage(item) && attachment?.url ? (
              <View style={[styles.mediaCard, normalizedMessageType === "gif" ? styles.gifMediaCard : null]}>
                <Image source={{ uri: normalizeMediaUrl(attachment.url) }} style={styles.messageImage} />
                {normalizedMessageType === "gif" ? (
                  <View style={[styles.mediaBadge, isMine ? styles.mediaBadgeMine : null]}>
                    <Text style={styles.mediaBadgeText}>GIF</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {!isAudioMessage(item) && String(item?.messageType || "") !== "voice" && isVideoMessage(item) && (attachment?.thumbnailUrl || attachment?.url) ? (
              <View style={styles.attachmentRow}>
                {attachment?.thumbnailUrl ? (
                  <Image
                    source={{ uri: normalizeMediaUrl(attachment.thumbnailUrl) }}
                    style={styles.messageImage}
                  />
                ) : (
                  <SocialVideo
                    uri={normalizeMediaUrl(attachment?.url || (item as any)?.mediaUrl || "")}
                    paused={true}
                    controls={false}
                    resizeMode="cover"
                    style={styles.messageImage}
                  />
                )}
                <Text
                  style={[styles.attachmentName, isMine ? styles.myText : [styles.otherText, { color: incomingBubbleText }]]}
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
                label={item?.messageType === "voice" ? "" : getAttachmentDisplayName(item)}
              />
            ) : null}

            {isDocumentMessage(item) && attachment?.url ? (
              <View style={[styles.documentCard, isMine ? styles.documentCardMine : styles.documentCardOther]}>
                <View style={[styles.documentIconBox, isMine ? styles.documentIconBoxMine : styles.documentIconBoxOther]}>
                  <Icon name="document-text" size={24} color={isMine ? "#FFFFFF" : PRIMARY} />
                </View>
                <View style={styles.documentTextContainer}>
                  <Text
                    style={[styles.documentName, isMine ? styles.myDocumentName : [styles.otherDocumentName, { color: incomingBubbleText }]]}
                    numberOfLines={2}
                  >
                    {getAttachmentDisplayName(item)}
                  </Text>
                  <Text style={[styles.documentSubtext, isMine ? styles.myDocumentSubtext : styles.otherDocumentSubtext]}>
                    Document • Tap to open
                  </Text>
                </View>
              </View>
            ) : null}

            {!locationPayload && !sharedContent && !callEvent && !!textValue && (
              <Text style={[isMine ? styles.myText : [styles.otherText, { color: incomingBubbleText }], { fontSize: chatMetrics.bodyFontSize, lineHeight: chatMetrics.bodyLineHeight }]}>
                {textValue}
              </Text>
            )}

            {!locationPayload && !sharedContent && !callEvent && linkPreview?.url ? (
              <MessageLinkPreview
                preview={linkPreview}
                isMine={isMine}
                onPress={() => {
                  Linking.openURL(String(linkPreview.url)).catch((error) => {
                    console.log("seller link preview open error:", error);
                  });
                }}
              />
            ) : null}

            {locationPayload ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => handleMessagePress(item, attachment, locationPayload)}
                style={[styles.locationCard, isMine ? styles.myLocationCard : { backgroundColor: alpha(colors.primary, "08") }]}
              >
                <Icon name="location-outline" size={18} color={isMine ? "#fff" : PRIMARY} />
                <View style={styles.locationBody}>
                  <Text style={[isMine ? styles.myLocationTitle : [styles.locationTitle, { color: incomingBubbleText }], { fontSize: chatMetrics.metaFontSize + 1 }]}>
                    {locationPayload.label}
                  </Text>
                  <Text style={[isMine ? styles.myLocationLink : styles.locationLink, { fontSize: chatMetrics.metaFontSize }]}>
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
                    <Text style={[styles.reactionText, { color: isMine ? "#fff" : incomingBubbleText, fontSize: chatMetrics.metaFontSize }]}>
                      {reaction?.emoji} {Array.isArray(reaction?.users) ? reaction.users.length : 0}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <View style={[styles.messageMetaRow, isMine ? styles.messageMetaRowMine : null]}>
              {!!messageTimeLabel ? (
                <Text style={[styles.messageMetaText, isMine ? styles.messageMetaTextMine : { color: incomingBubbleMeta }, { fontSize: chatMetrics.metaFontSize }]}>
                  {messageTimeLabel}
                </Text>
              ) : null}
              {isMine && !isSystemMessage ? (
                <View
                  style={[
                    styles.messageStatusPill,
                    seenCount > 0 ? styles.messageStatusPillSeen : null,
                  ]}
                >
                  <Icon name={messageStatusIcon} size={13} color={messageStatusIconColor} />
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        </View>
      </Swipeable>
    );
  };
  const selectedPricing = getPrimaryPricingOption(selectedService);
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
      const existingCallPayload = getExistingCallPayloadFromError(error);

      if (isCallAlreadyActiveError(error) && existingCallPayload?.callSession?._id) {
        const initiatorId = String(
          existingCallPayload.callSession?.initiatedBy?._id
          || existingCallPayload.callSession?.initiatedBy?.id
          || existingCallPayload.callSession?.initiatedBy
          || "",
        ).trim();
        const shouldOpenAsIncoming =
          String(existingCallPayload.callSession?.status || "") === "ringing"
          && !!initiatorId
          && initiatorId !== String(currentUserId || "").trim();

        navigation.navigate("CallScreen", {
          callSessionId: String(existingCallPayload.callSession._id),
          mode: shouldOpenAsIncoming ? "incoming" : "outgoing",
          callType: String(existingCallPayload.callSession?.callType || callType) === "video" ? "video" : "audio",
          initialCallSession: existingCallPayload.callSession,
          initialIceServers: existingCallPayload.iceServers,
          callRuntime: existingCallPayload.callRuntime,
          title: seller?.sellerName || selectedServiceLabel || "Aline2 call",
          avatarUrl: seller?.profilePic || "",
        });
        return;
      }

      Alert.alert(
        "Could not start call",
        getReadableApiErrorMessage(error, "Unable to start the call right now."),
      );
    }
  }, [ensureConversation, joinConversationRealtime, navigation, selectedServiceLabel, sendCallEventLog, seller?.profilePic, seller?.sellerName]);

  const compactHeaderActionSize = Math.max(chatMetrics.headerAction - 4, 30);
  const compactHeaderTitleSize = Math.max(chatMetrics.titleFontSize - 3, 13);
  const compactHeaderStatusSize = Math.max(chatMetrics.statusFontSize - 1, 10.5);
  const minimumReadableBubbleWidth = Math.min(
    Math.max(chatMetrics.minBubbleWidth, Math.round(width * 0.44)),
    Math.round(width * 0.62),
  );
  const minimumWideBubbleWidth = Math.min(
    Math.max(minimumReadableBubbleWidth + 56, Math.round(width * 0.68)),
    Math.round(width * 0.9),
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: sellerChatColors.background }]} edges={["top"]}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={sellerChatColors.background} />

      <View style={[styles.header, { backgroundColor: sellerChatColors.background, borderBottomColor: sellerChatColors.border, paddingTop: 8, paddingHorizontal: chatMetrics.listPadding + 2, paddingBottom: chatMetrics.listPadding }]}>
        <TouchableOpacity style={[styles.headerActionButton, { width: compactHeaderActionSize, height: compactHeaderActionSize, borderRadius: compactHeaderActionSize / 2, backgroundColor: sellerChatColors.headerButtonBg, borderColor: sellerChatColors.headerButtonBorder }]} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={20} color={sellerChatColors.headerIcon} />
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
            style={[styles.avatar, { width: chatMetrics.headerAvatar, height: chatMetrics.headerAvatar, borderRadius: chatMetrics.headerAvatar / 2 }]}
          />

          <View style={styles.headerTextBlock}>
            <Text style={[styles.name, { color: sellerChatColors.text, fontSize: compactHeaderTitleSize }]} numberOfLines={1} ellipsizeMode="tail">
              {seller?.sellerName || "Loading..."}
            </Text>
            <View style={styles.statusRow}>
              <View style={[styles.presenceDot, { backgroundColor: isSellerActive ? "#22C55E" : "#F59E0B" }]} />
              <Text style={[styles.status, { color: sellerStatusColor, fontSize: compactHeaderStatusSize }]} numberOfLines={1} ellipsizeMode="tail">
                    {normalizedSellerPresenceText}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={[styles.rightIcons, { backgroundColor: sellerChatColors.headerClusterBg, borderColor: sellerChatColors.headerClusterBorder }]}>
          <TouchableOpacity
            style={[styles.headerActionButton, styles.headerActionButtonGrouped, { width: compactHeaderActionSize, height: compactHeaderActionSize, borderRadius: compactHeaderActionSize / 2 }]}
            onPress={() => setShowAssistant(true)}
          >
            <Icon name="sparkles-outline" size={20} color={sellerChatColors.headerIcon} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerActionButton, styles.headerActionButtonGrouped, { width: compactHeaderActionSize, height: compactHeaderActionSize, borderRadius: compactHeaderActionSize / 2 }]}
            onPress={() => {
              toggleSellerChatLock().catch((error) => {
                console.log("seller chat lock toggle error:", error);
              });
            }}
          >
            <Icon name={isConversationLockedState ? "lock-open-outline" : "lock-closed-outline"} size={20} color={sellerChatColors.headerIcon} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerActionButton, styles.headerActionButtonGrouped, { width: compactHeaderActionSize, height: compactHeaderActionSize, borderRadius: compactHeaderActionSize / 2 }]}
            onPress={() =>
              navigation.navigate("SellerDetailsScreen", { sellerId })
            }
          >
            <Icon name="ellipsis-vertical" size={20} color={sellerChatColors.headerIcon} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.chatHeroPanel, { backgroundColor: sellerChatColors.panel, borderColor: sellerChatColors.border }]}>
        <View style={styles.chatHeroContent}>
          <Text style={[styles.chatHeroEyebrow, { color: sellerChatColors.accentText }]}>Booking conversation</Text>
          <Text style={[styles.chatHeroTitle, { color: sellerChatColors.text }]} numberOfLines={2}>
            {seller?.sellerName || "Seller"} bookings and service requests
          </Text>
          <Text style={[styles.chatHeroText, { color: sellerChatColors.muted }]}>
            Booking updates, service selections, and payment flow all stay organized in one premium thread.
          </Text>
        </View>
        <View style={[styles.chatHeroBadge, { backgroundColor: sellerChatColors.accentSoft }]}>
          <Icon
            name={seller?.availabilityStatus === false ? "time-outline" : "checkmark-circle-outline"}
            size={16}
            color={colors.primary}
          />
          <Text style={[styles.chatHeroBadgeText, { color: colors.primary }]}>
            {seller?.availabilityStatus === false ? "Seller away" : "Seller available"}
          </Text>
        </View>
      </View>

      <View style={[styles.premiumServiceWrap, { backgroundColor: sellerChatColors.panel, borderColor: sellerChatColors.border }]}>
        <Text style={[styles.premiumTitle, { color: sellerChatColors.text, fontSize: chatMetrics.sectionTitleFontSize }]}>Highlighted Services</Text>

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
                  { width: Math.min(214, width * 0.52), padding: chatMetrics.cardPadding, backgroundColor: sellerChatColors.panelAlt, borderColor: sellerChatColors.border },
                  isSelected && styles.selectedCard
                ]}
                onPress={() => setSelectedService(item)}
              >
                <Text
                  style={[
                    styles.serviceName,
                    { fontSize: chatMetrics.metaFontSize + 1 },
                    { color: isSelected ? "#fff" : sellerChatColors.text }
                  ]}
                >
                  {item.serviceName}
                </Text>

                <Text
                  style={[
                    styles.servicePrice,
                    { fontSize: chatMetrics.bodyFontSize - 0.5 },
                    isSelected ? { color: "#fff" } : null
                  ]}
                >
                  {formatPrimaryServicePrice(item)}
                </Text>

                {!!extraOptions.length && (
                  <Text
                    style={[
                      styles.serviceSubMeta,
                      { fontSize: chatMetrics.metaFontSize },
                      { color: isSelected ? sellerChatColors.selectedSoftText : sellerChatColors.muted }
                    ]}
                  >
                    {extraOptions.map((option: { label?: string }) => option.label).join(" • ")}
                  </Text>
                )}

                <View style={styles.serviceFooter}>
                  <Text
                    style={[
                      styles.serviceSelectionText,
                      { fontSize: chatMetrics.metaFontSize + 0.5 },
                      isSelected ? styles.serviceSelectionTextActive : null,
                    ]}
                  >
                    {isSelected ? "Ready for booking" : "Tap card to switch"}
                  </Text>

                  <TouchableOpacity
                    style={[
                      styles.bookNowBtn,
                      !isSelected ? styles.bookNowBtnMuted : null,
                      seller?.availabilityStatus === false ? styles.bookNowBtnDisabled : null,
                    ]}
                    onPress={() => {
                      openBookingFlow(item);
                    }}
                    disabled={seller?.availabilityStatus === false}
                  >
                    <Text style={styles.bookNowText}>
                      {seller?.availabilityStatus === false
                        ? "Unavailable"
                        : isSelected
                          ? "Request a Service"
                          : "Select & Request"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <View style={[styles.selectedServiceBanner, { backgroundColor: sellerChatColors.panelAlt, borderColor: sellerChatColors.border }]}>
        <View style={[styles.selectedServiceIconWrap, { backgroundColor: sellerChatColors.accentSoft }]}>
          <Icon name="briefcase-outline" size={15} color={colors.primary} />
        </View>
        <View style={styles.selectedServiceCopy}>
          <Text style={[styles.selectedServiceBannerLabel, { color: sellerChatColors.accentText }]}>Booking only</Text>
          <Text style={[styles.selectedServiceBannerText, { color: sellerChatColors.text }]}>
            {selectedServiceLabel} selected. Pick a time slot and continue to request an appointment.
          </Text>
        </View>
      </View>

      {seller?.availabilityStatus === false ? (
        <View style={[styles.unavailableBanner, { backgroundColor: sellerChatColors.warningBg, borderBottomColor: sellerChatColors.border }]}>
          <Text style={[styles.unavailableBannerText, { color: sellerChatColors.warningText }]}>
            Seller is away right now. You can review services here, and fresh booking activity will appear once availability returns.
          </Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flexFill}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        enabled
        keyboardVerticalOffset={0}
      >
        <View style={[styles.timelineShell, { backgroundColor: sellerChatColors.background, borderTopColor: sellerChatColors.border }]}>
          {loading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="large" color={PRIMARY} />
            </View>
          ) : (
            <FlatList
              data={bookingTimelineMessages}
              renderItem={renderMessage}
              keyExtractor={(item) => getMessageRenderKey(item)}
              contentContainerStyle={{ paddingHorizontal: chatMetrics.listPadding, paddingTop: chatMetrics.listPadding, paddingBottom: Math.max(20, 12 + insets.bottom) }}
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
                    style={[styles.loadEarlierButton, { backgroundColor: sellerChatColors.panelAlt, borderColor: sellerChatColors.border }]}
                    onPress={loadMoreMessages}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <ActivityIndicator color={PRIMARY} />
                    ) : (
                      <Text style={[styles.loadEarlierText, { fontSize: chatMetrics.metaFontSize + 1 }]}>Load earlier messages</Text>
                    )}
                  </TouchableOpacity>
                ) : null
              }
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <View style={[styles.emptyIconWrap, { backgroundColor: sellerChatColors.accentSoft }]}>
                    <Icon name="calendar-clear-outline" size={24} color={colors.primary} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: sellerChatColors.text, fontSize: chatMetrics.sectionTitleFontSize + 1 }]}>
                    {errorMessage ? "Conversation unavailable" : "No booking updates yet"}
                  </Text>
                  <Text style={[styles.emptyText, { color: sellerChatColors.muted, fontSize: chatMetrics.bodyFontSize - 1, lineHeight: chatMetrics.bodyLineHeight }]}>
                    {errorMessage || "This room only keeps appointment and payment updates. Normal chat and call logs stay hidden here."}
                  </Text>
                </View>
              }
            />
          )}

        </View>

        <View style={[styles.inputWrap, { backgroundColor: sellerChatColors.background, paddingBottom: Math.max(8, insets.bottom), borderTopColor: sellerChatColors.border }]}>
          <View style={[styles.composerLockedCard, { borderColor: sellerChatColors.border, backgroundColor: sellerChatColors.panelAlt, borderRadius: chatMetrics.bubbleRadius }]}>
            <View style={[styles.composerLockedIconWrap, { backgroundColor: alpha(colors.primary, "1A") }]}>
              <Icon name="calendar-clear-outline" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.composerLockedText, { color: sellerChatColors.text, fontSize: chatMetrics.metaFontSize + 1, lineHeight: chatMetrics.metaFontSize + 7 }]}>
              Choose a highlighted service to book, or share files and documents with the seller here.
            </Text>
          </View>

          <View style={styles.sellerAttachmentRow}>
            {[
              { id: "gallery", label: "Gallery", icon: "image-outline", action: sendImageAttachment },
              { id: "document", label: "Document", icon: "document-text-outline", action: sendDocumentAttachment },
              { id: "audio", label: "Audio", icon: "musical-notes-outline", action: sendAudioAttachment },
              { id: "camera", label: "Camera", icon: "camera-outline", action: sendCameraAttachment },
            ].map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.sellerAttachmentButton,
                  { borderColor: sellerChatColors.border, backgroundColor: sellerChatColors.panelAlt },
                  (!canUseComposer || uploading) ? styles.sellerAttachmentButtonDisabled : null,
                ]}
                onPress={() => {
                  item.action().catch((error) => {
                    console.log("seller attachment action error:", error);
                  });
                }}
                disabled={!canUseComposer || uploading}
              >
                <Icon name={item.icon} size={17} color={canUseComposer ? colors.primary : sellerChatColors.muted} />
                <Text style={[styles.sellerAttachmentText, { color: canUseComposer ? sellerChatColors.text : sellerChatColors.muted }]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </KeyboardAvoidingView>

      {isConversationLockedState ? (
        <View style={[styles.lockedChatOverlay, { backgroundColor: sellerChatColors.overlay }]}>
          <View style={[styles.lockedChatCard, { borderColor: sellerChatColors.border, backgroundColor: sellerChatColors.panel }]}>
            <Icon name="lock-closed-outline" size={26} color={colors.primary} />
            <Text style={[styles.lockedChatTitle, { color: sellerChatColors.text }]}>Seller chat locked</Text>
            <Text style={[styles.lockedChatText, { color: sellerChatColors.muted }]}>
              This seller conversation is locked. Enter your passcode to view updates and booking history.
            </Text>
            <TouchableOpacity
              style={[styles.lockedChatButton, { backgroundColor: colors.primary }]}
              onPress={async () => {
                const hasPasscode = await hasChatLockPasscode();
                setPendingLockAction("unlock");
                setChatLockMode(hasPasscode ? "unlock" : "setup");
                setChatLockModalVisible(true);
              }}
            >
              <Text style={styles.lockedChatButtonText}>Unlock seller chat</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

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
          {messagePreview?.videoUrl ? (
            <View style={styles.previewVideoContainer}>
              <SocialVideo
                uri={messagePreview.videoUrl}
                posterUri={messagePreview.imageUrl}
                controls={true}
                paused={false}
                resizeMode="contain"
                style={styles.previewVideo}
              />
            </View>
          ) : (
            <Image
              source={{ uri: messagePreview?.imageUrl || "" }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}
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
          <View style={[styles.locationModalBox, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Share Location</Text>
            <Text style={[styles.locationModalText, { color: colors.mutedText }]}>
              Enter a place, address, or landmark. A Maps link will be sent in this chat.
            </Text>

            <TextInput
              value={locationDraft}
              onChangeText={setLocationDraft}
              style={[styles.locationInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
              placeholder="Cafe, airport, clinic, MG Road..."
              placeholderTextColor={colors.placeholder}
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
              <Text style={[styles.modalCancelText, { color: colors.mutedText }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showPaymentModal} transparent animationType="fade">
        <View style={styles.bookingOverlay}>
          <View style={[styles.bookingSheet, { width: bookingSheetWidth, maxHeight: bookingSheetMaxHeight, backgroundColor: sellerChatColors.panel }]}>
            <View style={[styles.bookingHandle, { backgroundColor: alpha(sellerChatColors.muted, "55") }]} />

            <View style={styles.bookingHeaderRow}>
              <View style={styles.bookingHeaderCopy}>
                <Text style={[styles.modalTitle, { color: sellerChatColors.text }]}>Request a Service</Text>
                <Text style={[styles.bookingSubtitle, { color: sellerChatColors.muted }]}>
                  Pick seller availability first, then confirm your appointment request.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.bookingCloseButton, { backgroundColor: sellerChatColors.headerButtonBg }]}
                onPress={() => setShowPaymentModal(false)}
                disabled={processingBookingPayment}
              >
                <Icon name="close" size={18} color={sellerChatColors.headerIcon} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.bookingScrollContent}
            >
              <View style={[styles.bookingSummaryCard, { backgroundColor: sellerChatColors.panelAlt, borderColor: sellerChatColors.border }]}>
                <View style={styles.bookingSummaryHeader}>
                  <View style={styles.bookingSummaryTextWrap}>
                    <Text style={[styles.bookingSummaryEyebrow, { color: sellerChatColors.accentText }]}>Selected service</Text>
                    <Text style={[styles.modalService, { color: sellerChatColors.text }]}>
                      {selectedService?.serviceName || serviceName || "Selected service"}
                    </Text>
                  </View>
                  <View style={[styles.bookingStatusBadge, { backgroundColor: sellerChatColors.accentSoft }]}>
                    <Text style={styles.bookingStatusBadgeText}>
                      {seller?.availabilityStatus === false ? "Seller away" : "Seller available"}
                    </Text>
                  </View>
                </View>

                <View style={styles.bookingMetaRow}>
                  <View style={[styles.bookingMetaCard, { backgroundColor: sellerChatColors.panelSoft, borderColor: sellerChatColors.border }]}>
                    <Text style={[styles.bookingMetaLabel, { color: sellerChatColors.accentText }]}>Price</Text>
                    <Text style={[styles.bookingMetaValue, { color: sellerChatColors.text }]}>
                      {selectedPricing ? formatPrimaryServicePrice(selectedService) : "Pricing unavailable"}
                    </Text>
                  </View>
                  <View style={[styles.bookingMetaCard, { backgroundColor: sellerChatColors.panelSoft, borderColor: sellerChatColors.border }]}>
                    <Text style={[styles.bookingMetaLabel, { color: sellerChatColors.accentText }]}>Duration</Text>
                    <Text style={[styles.bookingMetaValue, { color: sellerChatColors.text }]}>
                      {selectedPricing?.durationMinutes ? `${selectedPricing.durationMinutes} min` : "Flexible"}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.bookingSellerLine, { color: sellerChatColors.muted }]}>
                  {seller?.sellerName || "Seller"} will receive this request after booking is confirmed.
                </Text>

                {selectedAppointmentSlot ? (
                  <View style={styles.bookingDateTimeRow}>
                    <View style={[styles.bookingDateTimeCard, { backgroundColor: sellerChatColors.panelSoft, borderColor: sellerChatColors.border }]}>
                      <Text style={[styles.bookingMetaLabel, { color: sellerChatColors.accentText }]}>Date</Text>
                      <Text style={[styles.bookingDateTimeValue, { color: sellerChatColors.text }]}>
                        {formatAppointmentSlotDateLabel(selectedAppointmentSlot.start)}
                      </Text>
                    </View>
                    <View style={[styles.bookingDateTimeCard, { backgroundColor: sellerChatColors.panelSoft, borderColor: sellerChatColors.border }]}>
                      <Text style={[styles.bookingMetaLabel, { color: sellerChatColors.accentText }]}>Time</Text>
                      <Text style={[styles.bookingDateTimeValue, { color: sellerChatColors.text }]}>
                        {formatAppointmentSlotTimeLabel(selectedAppointmentSlot.start)}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>

              <View style={styles.slotSection}>
                <Text style={[styles.slotHeading, { color: sellerChatColors.text }]}>Seller availability</Text>
                <Text style={[styles.slotSubheading, { color: sellerChatColors.muted }]}>
                  Choose the time that works for you from the seller's live schedule.
                </Text>

                {loadingAppointmentSlots ? (
                  <View style={[styles.bookingStateCard, { backgroundColor: sellerChatColors.panelAlt, borderColor: sellerChatColors.border }]}>
                    <ActivityIndicator size="small" color={PRIMARY} />
                    <Text style={[styles.bookingStateText, { color: sellerChatColors.muted }]}>Loading seller availability...</Text>
                  </View>
                ) : !appointmentSlots.length ? (
                  <View style={[styles.bookingStateCard, { backgroundColor: sellerChatColors.panelAlt, borderColor: sellerChatColors.border }]}>
                    <Icon name="calendar-clear-outline" size={18} color="#8A6BCF" />
                    <Text style={[styles.bookingStateText, { color: sellerChatColors.muted }]}>
                      {appointmentSlotFallback
                        ? "Seller availability could not be loaded right now. Please try again shortly."
                        : "This seller has not shared any bookable slots right now."}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.slotList}>
                    {appointmentSlots.map((slot) => {
                      const isSelected = selectedAppointmentStart === slot.start;

                      return (
                        <TouchableOpacity
                          key={slot.start}
                          style={[
                            styles.slotChip,
                            isCompactBookingSheet ? styles.slotChipCompact : styles.slotChipRegular,
                            { backgroundColor: sellerChatColors.panelSoft, borderColor: sellerChatColors.border },
                            isSelected ? styles.slotChipActive : null,
                          ]}
                          onPress={() => setSelectedAppointmentStart(slot.start)}
                        >
                          <Text style={[styles.slotChipDay, { color: isSelected ? "#fff" : sellerChatColors.accentText }, isSelected ? styles.slotChipDayActive : null]}>
                            {formatAppointmentSlotDateLabel(slot.start)}
                          </Text>
                          <Text style={[styles.slotChipTime, { color: isSelected ? "#fff" : sellerChatColors.text }, isSelected ? styles.slotChipTimeActive : null]}>
                            {formatAppointmentSlotTimeLabel(slot.start)}
                          </Text>
                          <Text style={[styles.slotChipMeta, { color: isSelected ? "rgba(255,255,255,0.82)" : sellerChatColors.muted }, isSelected ? styles.slotChipMetaActive : null]}>
                            {slot.end ? `${formatAppointmentSlotTimeLabel(slot.end)} end` : slot.timeZone || "Local time"}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              {selectedAppointmentSlot ? (
                <View style={[styles.selectedSlotCard, { backgroundColor: alpha(colors.primary, isDarkMode ? "24" : "12"), borderColor: alpha(colors.primary, isDarkMode ? "44" : "28") }]}>
                  <Text style={[styles.selectedSlotLabel, { color: sellerChatColors.accentText }]}>Appointment request</Text>
                  <Text style={[styles.selectedSlotValue, { color: sellerChatColors.text }]}>
                    {formatAppointmentSlotWindow(selectedAppointmentSlot)}
                  </Text>
                  <Text style={[styles.selectedSlotNote, { color: sellerChatColors.muted }]}>
                    {`Seller gets a notification for your new service request.${selectedAppointmentSlot?.timeZone ? ` Slots shown in ${selectedAppointmentSlot.timeZone}.` : ""}`}
                  </Text>
                </View>
              ) : null}
            </ScrollView>

            <Text style={[styles.modalNote, { color: sellerChatColors.muted }]}>
              Select a slot first. Payment is collected in the final step so the seller receives a confirmed service request.
            </Text>

            <TouchableOpacity
              style={[
                styles.payBtn,
                (!selectedAppointmentStart || loadingAppointmentSlots || !appointmentSlots.length || processingBookingPayment) && styles.payBtnDisabled,
              ]}
              onPress={() => {
                sendBookingRequest().catch((error) => {
                  console.log("seller booking request error:", error);
                });
              }}
              disabled={!selectedAppointmentStart || loadingAppointmentSlots || !appointmentSlots.length || processingBookingPayment}
            >
              {processingBookingPayment ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.payBtnText}>
                  Confirm Time & Continue
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowPaymentModal(false)} disabled={processingBookingPayment}>
              <Text style={[styles.modalCancelText, { color: sellerChatColors.muted }]}>
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

      <ChatLockModal
        visible={chatLockModalVisible}
        mode={chatLockMode}
        busy={lockingBusy}
        onClose={() => setChatLockModalVisible(false)}
        onSubmit={submitChatLockPasscode}
      />

      <DocumentViewerModal
        visible={!!documentPreview}
        url={documentPreview?.url}
        fileName={documentPreview?.fileName}
        onClose={() => setDocumentPreview(null)}
      />
    </SafeAreaView>
  );
};

export default SellerChatScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CHAT_BG },
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
    marginLeft: 10,
    minWidth: 0,
  },
  headerTextBlock: {
    marginLeft: 10,
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    paddingRight: 4,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22
  },
  name: {
    color: "#fff",
    fontFamily: appFonts.bold,
    fontSize: 16
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 7,
  },
  status: {
    fontSize: 12,
    fontFamily: appFonts.medium,
    flexShrink: 1,
  },
  rightIcons: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 10,
    flexShrink: 0,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 4,
  },
  headerActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 5,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: CHAT_BORDER,
  },
  headerActionButtonGrouped: {
    marginLeft: 0,
    marginRight: 2,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  headerActionButtonDisabled: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  chatHeroPanel: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 10,
    borderRadius: 26,
    padding: 18,
    backgroundColor: CHAT_PANEL,
    borderWidth: 1,
    borderColor: CHAT_BORDER,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  chatHeroContent: {
    flex: 1,
    paddingRight: 14,
  },
  chatHeroEyebrow: {
    color: "#BFA7FF",
    fontSize: 11,
    fontFamily: appFonts.bold,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  chatHeroTitle: {
    marginTop: 8,
    color: "#FFFFFF",
    fontSize: 20,
    fontFamily: appFonts.bold,
    lineHeight: 26,
  },
  chatHeroText: {
    marginTop: 8,
    color: CHAT_TEXT_MUTED,
    fontSize: 12.5,
    lineHeight: 19,
  },
  chatHeroBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "rgba(123, 77, 255, 0.18)",
  },
  chatHeroBadgeText: {
    marginLeft: 6,
    color: "#F8F5FF",
    fontSize: 11.5,
    fontFamily: appFonts.semibold,
  },
  premiumServiceWrap: {
    backgroundColor: CHAT_PANEL,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: CHAT_BORDER,
  },
  premiumTitle: {
    fontSize: 14,
    fontFamily: appFonts.semibold,
    marginLeft: 12,
    marginBottom: 8,
    color: "#F7F9FF",
  },
  premiumCard: {
    width: 188,
    backgroundColor: CHAT_PANEL_ALT,
    padding: 13,
    borderRadius: 18,
    marginRight: 10,
    borderWidth: 1,
    borderColor: CHAT_BORDER,
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
  serviceName: { fontFamily: appFonts.semibold, fontSize: 13 },
  servicePrice: {
    marginTop: 5,
    fontSize: 14,
    fontFamily: appFonts.semibold,
    color: PRIMARY
  },
  serviceSubMeta: {
    marginTop: 6,
    fontSize: 11.5,
    color: CHAT_TEXT_MUTED,
    fontFamily: appFonts.regular,
  },
  serviceFooter: {
    marginTop: 12,
  },
  serviceSelectionText: {
    fontSize: 12,
    color: CHAT_TEXT_MUTED,
    marginBottom: 8,
    fontFamily: appFonts.medium,
  },
  serviceSelectionTextActive: {
    color: "#E9DEFF",
  },
  bookNowBtn: {
    marginTop: 10,
    backgroundColor: "#F5F2FF",
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
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: CHAT_BORDER,
    backgroundColor: CHAT_PANEL_ALT,
  },
  selectedServiceIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(123, 77, 255, 0.18)",
  },
  selectedServiceCopy: {
    marginLeft: 10,
    flex: 1,
  },
  selectedServiceBannerLabel: {
    color: "#A598C7",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  selectedServiceBannerText: {
    marginTop: 3,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  unavailableBanner: {
    backgroundColor: CHAT_PANEL_SOFT,
    borderBottomWidth: 1,
    borderBottomColor: CHAT_BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  unavailableBannerText: {
    color: "#F5D995",
    fontSize: 12,
    fontWeight: "600",
  },
  loaderWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  timelineShell: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: CHAT_BORDER,
    backgroundColor: CHAT_BG,
  },
  loadEarlierButton: {
    alignSelf: "center",
    backgroundColor: CHAT_PANEL_ALT,
    borderRadius: 999,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: CHAT_BORDER,
  },
  loadEarlierText: {
    color: PRIMARY,
    fontFamily: appFonts.semibold,
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 60
  },
  emptyIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    backgroundColor: "rgba(123, 77, 255, 0.14)",
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: appFonts.bold,
    color: "#F8FAFF",
  },
  emptyText: {
    marginTop: 8,
    textAlign: "center",
    color: CHAT_TEXT_MUTED,
  },
  msgRow: {
    marginVertical: 6,
    paddingHorizontal: 2,
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
    marginHorizontal: 6,
    color: "#fff",
    fontSize: 12,
    fontFamily: appFonts.semibold,
  },
  msgBubble: {
    padding: 10,
    borderRadius: 18,
    maxWidth: "80%",
    minWidth: 0,
    alignSelf: "flex-start",
    flexShrink: 1,
    overflow: "hidden",
    shadowColor: "#040814",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    ...appShadows.card,
  },
  messageBubbleWide: {
    minWidth: 0,
    paddingHorizontal: 10,
  },
  replyPreviewCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "rgba(123, 77, 255, 0.12)",
    maxWidth: "100%",
    minWidth: 132,
  },
  replyPreviewCardMine: {
    backgroundColor: "rgba(255,255,255,0.14)",
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
    maxWidth: 200,
  },
  replyPreviewAuthor: {
    color: PRIMARY,
    fontSize: 12,
    fontFamily: appFonts.bold,
  },
  replyPreviewAuthorMine: {
    color: "#fff",
  },
  replyPreviewSnippet: {
    marginTop: 2,
    color: "#CAD4EA",
    fontSize: 12.5,
    flexShrink: 1,
  },
  replyPreviewSnippetMine: {
    color: "rgba(255,255,255,0.82)",
  },
  sharedPostCard: {
    maxWidth: "100%",
    minWidth: 0,
    borderRadius: 14,
    padding: 9,
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
    color: "#F8FAFF",
    fontSize: 12.5,
    fontFamily: appFonts.semibold,
  },
  sharedPostAuthorMine: {
    color: "#fff",
  },
  sharedPostLabel: {
    marginTop: 1,
    color: CHAT_TEXT_MUTED,
    fontSize: 11,
    fontFamily: appFonts.medium,
  },
  sharedPostLabelMine: {
    color: "rgba(255,255,255,0.78)",
  },
  sharedPostImage: {
    width: "100%",
    height: 138,
    borderRadius: 12,
    marginTop: 10,
  },
  sharedPostCaption: {
    marginTop: 10,
    color: "#D5DCF0",
    fontSize: 12.5,
    lineHeight: 18,
  },
  sharedPostCaptionMine: {
    color: "rgba(255,255,255,0.92)",
  },
  callEventCard: {
    maxWidth: "100%",
    minWidth: 0,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 8,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(123, 77, 255, 0.08)",
  },
  callEventCardMine: {
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  callEventIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
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
    color: "#F8FAFF",
    fontSize: 13,
    fontFamily: appFonts.semibold,
  },
  callEventTitleMine: {
    color: "#fff",
  },
  callEventMeta: {
    marginTop: 2,
    color: CHAT_TEXT_MUTED,
    fontSize: 11.5,
    fontFamily: appFonts.medium,
  },
  callEventMetaMine: {
    color: "rgba(255,255,255,0.78)",
  },
  myMsg: { backgroundColor: PRIMARY },
  otherMsg: { backgroundColor: CHAT_PANEL_ALT, borderWidth: 1, borderColor: CHAT_BORDER },
  myText: { color: "#fff", fontFamily: appFonts.regular },
  otherText: { color: "#F5F7FF", fontFamily: appFonts.regular },
  messageImage: {
    width: 188,
    height: 188,
    maxWidth: "100%",
    borderRadius: 12,
    marginBottom: 8
  },
  mediaCard: {
    position: "relative",
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 2,
  },
  gifMediaCard: {
    padding: 4,
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.32)",
    backgroundColor: "rgba(15,23,42,0.34)",
  },
  mediaBadge: {
    position: "absolute",
    left: 10,
    bottom: 12,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(15,23,42,0.72)",
  },
  mediaBadgeMine: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  mediaBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: appFonts.bold,
    letterSpacing: 0.4,
  },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6
  },
  attachmentName: {
    marginLeft: 8,
    fontFamily: appFonts.semibold,
    maxWidth: 180,
    color: "#F5F7FF",
  },
  documentCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 12,
    width: "100%",
    marginVertical: 2,
  },
  documentCardMine: {
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
  documentCardOther: {
    backgroundColor: "rgba(0, 0, 0, 0.05)",
  },
  documentIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  documentIconBoxMine: {
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  },
  documentIconBoxOther: {
    backgroundColor: "rgba(139, 92, 246, 0.14)",
  },
  documentTextContainer: {
    flex: 1,
    justifyContent: "center",
  },
  documentName: {
    fontSize: 14,
    fontFamily: appFonts.semibold,
    fontWeight: "600",
    lineHeight: 18,
  },
  myDocumentName: {
    color: "#FFFFFF",
  },
  otherDocumentName: {
    color: "#1E293B",
  },
  documentSubtext: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: appFonts.regular,
  },
  myDocumentSubtext: {
    color: "rgba(255, 255, 255, 0.75)",
  },
  otherDocumentSubtext: {
    color: "#64748B",
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
  previewVideoContainer: {
    width: "100%",
    height: "78%",
    justifyContent: "center",
    alignItems: "center",
  },
  previewVideo: {
    width: "100%",
    height: "100%",
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
    color: "#F5F7FF",
    fontFamily: appFonts.semibold,
  },
  myLocationTitle: {
    color: "#fff",
    fontFamily: appFonts.semibold,
  },
  locationLink: {
    marginTop: 2,
    color: PRIMARY,
    fontSize: 12,
    fontFamily: appFonts.medium,
  },
  myLocationLink: {
    marginTop: 2,
    color: "#E9DEFF",
    fontSize: 12,
    fontFamily: appFonts.medium,
  },
  reactionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6
  },
  reactionChip: {
    backgroundColor: "rgba(123, 77, 255, 0.12)",
    borderRadius: 999,
    marginRight: 5,
    marginTop: 3,
    paddingHorizontal: 7,
    paddingVertical: 3
  },
  myReactionChip: {
    backgroundColor: "rgba(255,255,255,0.22)"
  },
  reactionText: {
    color: "#F8FAFF",
    fontSize: 11,
    fontWeight: "600"
  },
  messageStatusPill: {
    alignSelf: "flex-end",
    marginTop: 7,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: "rgba(15,23,42,0.14)",
  },
  messageStatusPillSeen: {
    backgroundColor: "rgba(15,23,42,0.22)",
  },
  messageMetaRow: {
    marginTop: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  messageMetaRowMine: {
    justifyContent: "flex-end",
  },
  messageMetaText: {
    color: CHAT_TEXT_MUTED,
    fontSize: 11.5,
    fontWeight: "600",
  },
  messageMetaTextMine: {
    color: "rgba(255,255,255,0.78)",
    marginRight: 8,
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
    paddingHorizontal: 14,
    paddingTop: 12,
    backgroundColor: CHAT_BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: "#020617",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 8,
  },
  lockedChatOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,15,28,0.62)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  lockedChatCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: "center",
  },
  lockedChatTitle: {
    marginTop: 12,
    color: "#F8FAFF",
    fontSize: 20,
    fontWeight: "800",
  },
  lockedChatText: {
    marginTop: 8,
    color: "#A9B6D3",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  lockedChatButton: {
    marginTop: 18,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  lockedChatButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  composerReplyCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
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
    fontFamily: appFonts.bold,
  },
  composerReplySnippet: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: appFonts.regular,
  },
  composerReplyClose: {
    marginLeft: 10,
    padding: 2,
  },
  composerLockedCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  composerLockedIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  composerLockedText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 12.5,
    lineHeight: 19,
    fontFamily: appFonts.medium,
  },
  sellerAttachmentRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  sellerAttachmentButton: {
    flex: 1,
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  sellerAttachmentButtonDisabled: {
    opacity: 0.5,
  },
  sellerAttachmentText: {
    marginTop: 5,
    fontSize: 10.5,
    lineHeight: 13,
    fontFamily: appFonts.semibold,
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
  composerRow: {
    flexDirection: "row",
    alignItems: "center",
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
  mockPaymentIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(123, 77, 255, 0.1)",
    marginBottom: 14,
  },
  mockPaymentTitle: {
    color: "#101827",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  mockPaymentText: {
    marginTop: 10,
    color: "#5B6478",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  mockPaymentSummary: {
    width: "100%",
    marginTop: 16,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#F5F3FF",
  },
  mockPaymentSummaryLabel: {
    color: "#5B4B76",
    fontSize: 12,
    fontWeight: "700",
  },
  mockPaymentSummaryValue: {
    marginTop: 4,
    color: "#101827",
    fontSize: 16,
    fontWeight: "800",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center"
  },
  bookingOverlay: {
    flex: 1,
    backgroundColor: "rgba(10,12,22,0.48)",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 24,
  },
  modalBox: {
    width: "85%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 22,
    alignItems: "center"
  },
  bookingSheet: {
    backgroundColor: CHAT_PANEL,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
    shadowColor: "#0B1020",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 10,
  },
  bookingHandle: {
    alignSelf: "center",
    width: 52,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.24)",
    marginBottom: 12,
  },
  bookingHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  bookingHeaderCopy: {
    flex: 1,
    paddingRight: 12,
  },
  bookingCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  bookingScrollContent: {
    paddingBottom: 6,
  },
  locationModalBox: {
    width: "85%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 22,
  },
  modalTitle: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  bookingSubtitle: {
    marginTop: 8,
    color: CHAT_TEXT_MUTED,
    lineHeight: 20,
  },
  bookingSummaryCard: {
    borderRadius: 20,
    backgroundColor: CHAT_PANEL_ALT,
    borderWidth: 1,
    borderColor: CHAT_BORDER,
    padding: 16,
  },
  bookingSummaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  bookingSummaryTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  bookingSummaryEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#BFA7FF",
    marginBottom: 6,
  },
  bookingStatusBadge: {
    backgroundColor: "rgba(123, 77, 255, 0.18)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  bookingStatusBadgeText: {
    color: PRIMARY,
    fontSize: 11.5,
    fontWeight: "700",
  },
  modalService: {
    marginTop: 2,
    fontWeight: "700",
    fontSize: 16,
    color: "#FFFFFF",
  },
  modalPrice: {
    marginTop: 6,
    color: PRIMARY,
    fontWeight: "800",
    fontSize: 15,
  },
  bookingMetaRow: {
    flexDirection: "row",
    marginTop: 14,
  },
  bookingMetaCard: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: CHAT_PANEL_SOFT,
    borderWidth: 1,
    borderColor: CHAT_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginRight: 8,
  },
  bookingMetaLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#BFA7FF",
  },
  bookingMetaValue: {
    marginTop: 6,
    fontSize: 13.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  bookingSellerLine: {
    marginTop: 10,
    color: CHAT_TEXT_MUTED,
    fontSize: 12.5,
    lineHeight: 18,
  },
  bookingDateTimeRow: {
    flexDirection: "row",
    marginTop: 12,
  },
  bookingDateTimeCard: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: CHAT_BORDER,
    marginRight: 8,
  },
  bookingDateTimeValue: {
    marginTop: 6,
    color: "#F8FAFF",
    fontSize: 13.5,
    fontWeight: "700",
  },
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
    marginTop: 12,
    fontSize: 12,
    color: CHAT_TEXT_MUTED,
    textAlign: "center",
    lineHeight: 18,
  },
  slotSection: {
    width: "100%",
    marginTop: 16,
  },
  slotHeading: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 6,
  },
  slotSubheading: {
    fontSize: 12,
    lineHeight: 18,
    color: CHAT_TEXT_MUTED,
    marginBottom: 10,
  },
  slotList: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  slotChip: {
    borderWidth: 1,
    borderColor: CHAT_BORDER,
    backgroundColor: CHAT_PANEL_SOFT,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  slotChipRegular: {
    width: "48.5%",
  },
  slotChipCompact: {
    width: "100%",
  },
  slotChipActive: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
    shadowColor: PRIMARY,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  slotChipDay: {
    color: "#DCD3F7",
    fontSize: 11.5,
    fontWeight: "700",
  },
  slotChipDayActive: {
    color: "#fff",
  },
  slotChipTime: {
    marginTop: 6,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  slotChipTimeActive: {
    color: "#fff",
  },
  slotChipMeta: {
    marginTop: 4,
    color: CHAT_TEXT_MUTED,
    fontSize: 11.5,
    fontWeight: "600",
  },
  slotChipMetaActive: {
    color: "rgba(255,255,255,0.82)",
  },
  bookingStateCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CHAT_BORDER,
    backgroundColor: CHAT_PANEL_ALT,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  bookingStateText: {
    marginLeft: 10,
    color: CHAT_TEXT_MUTED,
    flex: 1,
    lineHeight: 19,
    fontSize: 12.5,
  },
  selectedSlotCard: {
    marginTop: 16,
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(123, 77, 255, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(123, 77, 255, 0.32)",
  },
  selectedSlotLabel: {
    color: "#BFA7FF",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  selectedSlotValue: {
    marginTop: 6,
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  selectedSlotNote: {
    marginTop: 6,
    color: "#D3DBF0",
    fontSize: 12.5,
    lineHeight: 18,
  },
  payBtn: {
    marginTop: 14,
    backgroundColor: PRIMARY,
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderRadius: 16
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
    marginTop: 12,
    color: CHAT_TEXT_MUTED,
    textAlign: "center",
    fontWeight: "600",
  }
});
