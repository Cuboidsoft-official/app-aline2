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
  PermissionsAndroid,
  NativeModules,
  Linking,
  Keyboard,
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
} from "@react-native-documents/picker";
import { API } from "../api/api";
import { connectSocket, socket } from "../socket";
import {
  buildCallEventMessage,
  buildScheduledCallMessage,
  getAttachmentDisplayName,
  getMessageAttachment,
  parseCallEventMessage,
  parseScheduledCallMessage,
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
  checkChatMediaModeration,
  reactToChatMessage,
  sendChatMessage,
} from "../utils/chatApi";
import {
  getExistingCallPayloadFromError,
  isCallAlreadyActiveError,
  startCallSession,
} from "../utils/callApi";
import { CHAT_THEME_LIST } from "../utils/chatThemes";
import {
  getLastIncomingUnseenMessage,
  mergeMessageReaction,
  mergeMessageSeen,
} from "../utils/chatRealtime";
import { getStoredUser } from "../utils/authSession";
import { DEFAULT_AVATAR_URL } from "../constants/defaultAssets";
import { callingDisabledMessage, productFlags } from "../config/productFlags";
import { alpha, appFonts, appShadows } from "../theme/designSystem";
import { getChatLayoutMetrics } from "../theme/chatUi";
import VoiceRecorderButton from "../components/chat/VoiceRecorderButton";
import VoiceMessageBubble from "../components/chat/VoiceMessageBubble";
import MessageContextMenu from "../components/chat/MessageContextMenu";
import StickerPickerSheet from "../components/chat/StickerPickerSheet";
import AISupportSheet from "../components/chat/AISupportSheet";
import MessageLinkPreview from "../components/chat/MessageLinkPreview";
import { openSharedContent } from "../utils/socialNavigation";
import ChatLockModal from "../components/chat/ChatLockModal";
import AppAvatar from "../components/AppAvatar";
import DraggableBottomSheet from "../components/DraggableBottomSheet";
import MentionSuggestionList from "../components/MentionSuggestionList";
import InteractiveText from "../features/social/components/InteractiveText";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { showModerationBlockedSheet } from "../utils/moderationNotice";
import { ensureCameraPermission, resolveCameraCaptureMediaType } from "../utils/permissions";
import { normalizeMediaFieldsDeep, normalizeMediaUrl } from "../utils/mediaUrls";
import { getActiveMentionQuery, insertMentionAtCursorEnd, mapMentionCandidate, MentionCandidate } from "../utils/mentionComposer";
import {
  hasChatLockPasscode,
  isConversationLocked,
  setChatLockPasscode,
  verifyChatLockPasscode,
} from "../utils/chatSecurity";

// ─── Constants ──────────────────────────────────────────────────────────────

const PRIMARY = "#7b3fe4";
const CHAT_DARK_COLORS = {
  primary: PRIMARY,
  background: "#0B1220",
  surface: "#111A2B",
  card: "#151F32",
  input: "#1B263A",
  border: "#2A3851",
  text: "#F6F8FC",
  mutedText: "#97A3B6",
  placeholder: "#6F7D93",
  tabInactive: "#8A96AA",
  danger: "#FF6961",
};
const DEFAULT_CHAT_WALLPAPER = require("../assets/chat/default-whatsapp-doodle.jpeg");
const LOCATION_MESSAGE_LABEL = "Shared location:";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChatUser {
  _id?: string;
  id?: string;
  username?: string;
  name?: string;
  profilePic?: string;
  availabilityStatus?: string;
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
  sender?: string | { _id?: string; id?: string; username?: string; name?: string; profilePic?: string };
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
  groupVisibility: "private" | "public";
  groupMessagePermission: "everyone" | "admins";
  isGroupAdmin: boolean;
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
  clientMessageId?: string;
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
  meta: string;
  icon: string;
}

interface ScheduledCallPreview {
  label: string;
  meta: string;
  calendarUrl: string;
  icon: string;
  durationMinutes: number;
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

const buildLocationMessage = (query: string): string => {
  const cleanQuery = String(query || "").trim();
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanQuery)}`;
  return `${LOCATION_MESSAGE_LABEL} ${cleanQuery}\n${mapsUrl}`;
};

const buildCoordinateLocationMessage = (latitude: number, longitude: number): string => {
  const coordinateLabel = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinateLabel)}`;
  return `${LOCATION_MESSAGE_LABEL} Current location\n${mapsUrl}`;
};

const getCurrentDeviceLocation = async (): Promise<{ latitude: number; longitude: number }> => {
  const nativeLocation = (NativeModules as any)?.AlineLocationModule;
  if (Platform.OS === "android" && nativeLocation?.getCurrentPosition) {
    const position = await nativeLocation.getCurrentPosition(15000);
    return {
      latitude: Number(position?.latitude),
      longitude: Number(position?.longitude),
    };
  }

  const geolocation = (globalThis as any)?.navigator?.geolocation;
  if (!geolocation?.getCurrentPosition) {
    throw new Error("Current location is unavailable on this device.");
  }

  const position: any = await new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000,
    });
  });

  return {
    latitude: Number(position?.coords?.latitude),
    longitude: Number(position?.coords?.longitude),
  };
};

const requestAndroidLocationPermission = async (): Promise<boolean> => {
  if (Platform.OS !== "android") {
    return true;
  }

  const permissions = [
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  ];
  const currentStatuses = await Promise.all(
    permissions.map((permission) => PermissionsAndroid.check(permission)),
  );
  if (currentStatuses.some(Boolean)) {
    return true;
  }

  const results = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.some((permission) => results[permission] === PermissionsAndroid.RESULTS.GRANTED);
};

const getExtensionForMimeType = (mimeType = ""): string => {
  const normalizedMimeType = String(mimeType || "").trim().toLowerCase();
  if (normalizedMimeType.includes("jpeg")) return ".jpg";
  if (normalizedMimeType.includes("png")) return ".png";
  if (normalizedMimeType.includes("gif")) return ".gif";
  if (normalizedMimeType.includes("webp")) return ".webp";
  if (normalizedMimeType.includes("mp4")) return ".mp4";
  if (normalizedMimeType.includes("quicktime")) return ".mov";
  if (normalizedMimeType.includes("webm")) return ".webm";
  return "";
};

const ensurePickedFileName = (name: string | undefined | null, fallbackBase: string, mimeType = ""): string => {
  const cleanName = String(name || fallbackBase || `media_${Date.now()}`).trim();
  const extension = getExtensionForMimeType(mimeType);

  if (/\.[a-z0-9]{2,5}$/i.test(cleanName) || !extension) {
    return cleanName;
  }

  return `${cleanName}${extension}`;
};

const inferPickedMimeType = (asset: any): string => {
  const explicitType = String(asset?.type || "").trim();
  if (explicitType) {
    return explicitType;
  }

  const source = String(asset?.fileName || asset?.uri || "").trim().toLowerCase();
  if (/\.(mp4|mov|webm|mkv|avi)$/.test(source)) {
    return "video/mp4";
  }
  if (/\.(jpg|jpeg|png|gif|webp|heic|heif)$/.test(source)) {
    return "image/jpeg";
  }

  return "application/octet-stream";
};

const padDatePart = (value: number): string => String(value).padStart(2, "0");

const buildLocalDateTimeInputValue = (date = new Date()): string => {
  const nextDate = new Date(date);
  nextDate.setMinutes(0, 0, 0);
  nextDate.setHours(nextDate.getHours() + 1);

  return [
    nextDate.getFullYear(),
    padDatePart(nextDate.getMonth() + 1),
    padDatePart(nextDate.getDate()),
  ].join("-")
    + `T${padDatePart(nextDate.getHours())}:${padDatePart(nextDate.getMinutes())}`;
};

const parseLocalDateTimeInputValue = (value: string): Date | null => {
  const normalizedValue = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalizedValue)) {
    return null;
  }

  const parsedDate = new Date(normalizedValue);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const formatCalendarDate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
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

const formatScheduledCallDateLabel = (startAt?: string, endAt?: string): string => {
  const startDate = startAt ? new Date(startAt) : null;
  const endDate = endAt ? new Date(endAt) : null;

  if (!startDate || Number.isNaN(startDate.getTime())) {
    return "Scheduled call";
  }

  const datePart = startDate.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
  const startTime = startDate.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (!endDate || Number.isNaN(endDate.getTime())) {
    return `${datePart}, ${startTime}`;
  }

  const endTime = endDate.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${datePart}, ${startTime} - ${endTime}`;
};

const buildOutgoingSendGuardKey = ({
  conversationId,
  text,
  file,
  mediaUrl,
  messageType,
  duration,
  replyToMessageId,
}: {
  conversationId?: string | null;
  text?: string;
  file?: { uri?: string; name?: string; type?: string };
  mediaUrl?: string;
  messageType?: string;
  duration?: number;
  replyToMessageId?: string;
}): string =>
  [
    String(conversationId || "").trim(),
    String(text || "").trim(),
    String(file?.uri || "").trim(),
    String(file?.name || "").trim(),
    String(mediaUrl || "").trim(),
    String(messageType || "text").trim().toLowerCase(),
    Number(duration || 0),
    String(replyToMessageId || "").trim(),
  ].join("::");

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

const normalizeGroupVisibility = (value: any, isPublic = false): "private" | "public" =>
  isPublic || String(value || "").trim().toLowerCase() === "public" ? "public" : "private";

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

const buildMessageSignature = (message: any): string => {
  const attachment = getMessageAttachment(message);
  const replyId =
    String(message?.replyToMessageId || "").trim()
    || getMessageIdentity(getMessageReply(message))
    || "";

  return [
    String(message?.messageType || "text").trim().toLowerCase(),
    String(getMessageText(message) || "").trim(),
    normalizeMediaUrl(message?.mediaUrl || attachment?.url || ""),
    String(attachment?.fileName || "").trim(),
    Number(message?.duration || 0),
    replyId,
  ].join("::");
};

const getMessageTimestamp = (message: any): number => {
  const rawValue = message?.createdAt || message?.updatedAt || message?.timestamp || 0;
  const timestamp = new Date(rawValue).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const isNearDuplicateMessage = (leftMessage: any, rightMessage: any): boolean => {
  if (!leftMessage?._optimistic && !rightMessage?._optimistic) {
    return false;
  }

  const leftSignature = buildMessageSignature(leftMessage);
  const rightSignature = buildMessageSignature(rightMessage);

  if (!leftSignature || leftSignature !== rightSignature) {
    return false;
  }

  const leftSenderId = String(getMessageSenderId(leftMessage) || "");
  const rightSenderId = String(getMessageSenderId(rightMessage) || "");
  if (leftSenderId && rightSenderId && leftSenderId !== rightSenderId) {
    return false;
  }

  const leftTimestamp = getMessageTimestamp(leftMessage);
  const rightTimestamp = getMessageTimestamp(rightMessage);
  const duplicateWindowMs = leftMessage?._optimistic || rightMessage?._optimistic ? 120000 : 30000;
  if (leftTimestamp && rightTimestamp && Math.abs(leftTimestamp - rightTimestamp) > duplicateWindowMs) {
    return false;
  }

  return true;
};

const buildOptimisticMessage = ({
  optimisticId,
  currentUserId,
  text,
  file,
  mediaUrl,
  messageType,
  duration,
  replyToMessageId,
  replyToMessage,
}: {
  optimisticId: string;
  currentUserId: string;
  text?: string;
  file?: { uri: string; name: string; type: string };
  mediaUrl?: string;
  messageType?: string;
  duration?: number;
  replyToMessageId?: string;
  replyToMessage?: ChatMessage | null;
}): ChatMessage => {
  const resolvedMessageType = String(
    messageType
    || (file?.type?.startsWith("video/") ? "video" : file?.type?.startsWith("image/") ? "image" : file ? "document" : "text")
  ).trim().toLowerCase() || "text";

  return {
    localId: optimisticId,
    optimisticId,
    clientMessageId: optimisticId,
    text: String(text || "").trim(),
    messageType: resolvedMessageType,
    mediaUrl: mediaUrl || file?.uri || "",
    attachment: file
      ? {
          url: file.uri,
          fileName: file.name,
          thumbnailUrl: file.uri,
        }
      : undefined,
    duration,
    sender: { _id: currentUserId },
    createdAt: new Date().toISOString(),
    replyToMessageId,
    replyToMessage: replyToMessage || null,
    replyTo: replyToMessage || replyToMessageId || null,
    _optimistic: true,
  };
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

const formatMessageTime = (value?: string): string => {
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

const isEmojiOnlyText = (value?: string | null): boolean => {
  const text = String(value || "").trim();
  if (!text || text.length > 10) {
    return false;
  }

  return /^[\p{Extended_Pictographic}\p{Emoji_Component}\u200d\uFE0F\s]+$/u.test(text);
};

const isGenericAttachmentText = (value?: string | null, attachmentLabel?: string | null): boolean => {
  const text = String(value || "").trim().toLowerCase();
  if (!text) {
    return false;
  }

  const genericLabels = new Set([
    "attachment",
    "audio",
    "audio attachment",
    "document",
    "document attachment",
    "image",
    "image attachment",
    "photo",
    "video",
    "video attachment",
    "voice message",
    "voice note",
  ]);

  if (genericLabels.has(text)) {
    return true;
  }

  const normalizedAttachmentLabel = String(attachmentLabel || "").trim().toLowerCase();
  return Boolean(normalizedAttachmentLabel && text === normalizedAttachmentLabel);
};

const getMessageTypeLabel = (message: ChatMessage | null | undefined): string => {
  if (!message) {
    return "Message";
  }

  const sharedContent = parseSharedContentMessage(message);
  if (sharedContent?.kind === "post") {
    return "Post";
  }

  if (sharedContent?.kind === "story") {
    return "Story";
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
  const event = String(callEvent.event || "started");

  switch (event) {
    case "missed":
      return {
        callType: isVideo ? "video" : "audio",
        direction,
        label: isVideo ? "Missed video call" : "Missed voice call",
        meta: direction === "outgoing" ? "No answer" : "Missed",
        icon: isVideo ? "videocam-outline" : "call-outline",
      };
    case "ended":
      return {
        callType: isVideo ? "video" : "audio",
        direction,
        label: isVideo ? "Video call" : "Voice call",
        meta: "Completed",
        icon: isVideo ? "videocam-outline" : "call-outline",
      };
    default:
      return {
        callType: isVideo ? "video" : "audio",
        direction,
        label: isVideo ? "Video call" : "Voice call",
        meta: direction === "outgoing" ? "Calling" : "Incoming",
        icon: isVideo ? "videocam-outline" : "call-outline",
      };
  }
};

const buildScheduledCallPreview = (message: ChatMessage): ScheduledCallPreview | null => {
  const scheduledCall = parseScheduledCallMessage(message);
  if (scheduledCall?.kind !== "call_schedule") {
    return null;
  }

  const isVideo = scheduledCall.callType === "video";
  const title = String(scheduledCall.title || "").trim();

  return {
    label: title || (isVideo ? "Scheduled video call" : "Scheduled voice call"),
    meta: formatScheduledCallDateLabel(scheduledCall.startAt, scheduledCall.endAt),
    calendarUrl: String(scheduledCall.calendarUrl || "").trim(),
    icon: isVideo ? "videocam-outline" : "call-outline",
    durationMinutes: Math.max(5, Number(scheduledCall.durationMinutes) || 30),
  };
};

// ─── Component ──────────────────────────────────────────────────────────────

const ChatScreen = ({ navigation, route }: any) => {
  const colors = CHAT_DARK_COLORS;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const chatMetrics = useMemo(() => getChatLayoutMetrics(width), [width]);
  const { userId, conversationId, conversationType: conversationTypeParam, serviceId, groupName, groupAvatar, memberCount, groupConversation, openScheduleCallComposer, openScheduleCallType } = route.params || {};
  const initialConversationType = (String(conversationTypeParam || "").trim().toLowerCase() || "direct") as "direct" | "seller" | "group";
  const [resolvedConversationType, setResolvedConversationType] = useState<"direct" | "seller" | "group">(initialConversationType);
  const isGroupConversation = resolvedConversationType === "group";
  const [user, setUser] = useState<ChatUser | null>(null);
  const [text, setText] = useState("");
  const [groupMentionCandidates, setGroupMentionCandidates] = useState<MentionCandidate[]>([]);
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
  const [isConversationLockedState, setIsConversationLockedState] = useState(false);
  const [chatLockModalVisible, setChatLockModalVisible] = useState(false);
  const [chatLockMode, setChatLockMode] = useState<"unlock" | "setup">("unlock");
  const [lockingBusy, setLockingBusy] = useState(false);
  const [showLocationComposer, setShowLocationComposer] = useState(false);
  const [locationDraft, setLocationDraft] = useState("");
  const [locatingCurrentPosition, setLocatingCurrentPosition] = useState(false);
  const [showScheduleCallComposer, setShowScheduleCallComposer] = useState(false);
  const [scheduleCallType, setScheduleCallType] = useState<"audio" | "video">("audio");
  const [scheduleCallDateTime, setScheduleCallDateTime] = useState(() => buildLocalDateTimeInputValue());
  const [scheduleCallDurationMinutes, setScheduleCallDurationMinutes] = useState("30");
  const [scheduleCallAgenda, setScheduleCallAgenda] = useState("");
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      const keyboardHeight = Math.max(0, Number(event?.endCoordinates?.height || 0));
      setIsKeyboardVisible(true);
      setKeyboardInset(Math.max(0, keyboardHeight - insets.bottom));
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
      setKeyboardInset(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom]);

  useEffect(() => {
    const normalized = String(conversationTypeParam || "").trim().toLowerCase();
    if (normalized === "direct" || normalized === "seller" || normalized === "group") {
      setResolvedConversationType(normalized as "direct" | "seller" | "group");
    }
  }, [conversationTypeParam]);

  useEffect(() => {
    if (openScheduleCallComposer) {
      setScheduleCallType(openScheduleCallType === "video" ? "video" : "audio");
      setShowScheduleCallComposer(true);
      navigation.setParams?.({ openScheduleCallComposer: undefined, openScheduleCallType: undefined });
    }
  }, [navigation, openScheduleCallComposer, openScheduleCallType]);
  const [groupMeta, setGroupMeta] = useState<GroupMeta>({
    groupName: groupName || "Group chat",
    groupAvatar: groupAvatar || "",
    memberCount: Number(memberCount || 0),
    groupVisibility: normalizeGroupVisibility(groupConversation?.groupVisibility, Boolean(groupConversation?.isPublicGroup) || String(groupConversation?.type || "").trim().toLowerCase() === "channel"),
    groupMessagePermission: (groupConversation?.groupMessagePermission || "everyone") as "everyone" | "admins",
    isGroupAdmin: Boolean(groupConversation?.isGroupOwner || groupConversation?.isGroupAdmin),
  });
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textSendLockRef = useRef(false);
  const composerSendPressLockRef = useRef(false);
  const pendingAttachmentSendLockRef = useRef(false);
  const recentOutgoingSendRef = useRef<{ key: string; timestamp: number }>({ key: "", timestamp: 0 });
  const activeOutgoingSendKeysRef = useRef<Set<string>>(new Set());
  const stickerSendLockRef = useRef(false);
  const recentStickerSendRef = useRef<{ key: string; timestamp: number }>({ key: "", timestamp: 0 });
  const stickerSendUnlockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Feature state: voice, stickers, message context menu
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [stickerPickerMode, setStickerPickerMode] = useState<"emoji" | "gifs" | "stickers">("emoji");
  const [contextMessage, setContextMessage] = useState<ChatMessage | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const pendingAttachment = pendingAttachments[0] || null;
  const [pendingVoiceNote, setPendingVoiceNote] = useState<PendingVoiceNote | null>(null);
  const [messagePreview, setMessagePreview] = useState<MessagePreviewState | null>(null);
  const [replyingToMessage, setReplyingToMessage] = useState<ChatMessage | null>(null);
  const [showAssistant, setShowAssistant] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState("");
  const [conversationListing, setConversationListing] = useState<ConversationListingState | null>(null);
  const messageListRef = useRef<FlatList<ChatMessage> | null>(null);
  const messageInputRef = useRef<TextInput | null>(null);
  const initialLatestScrollDoneRef = useRef(false);
  const replyHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFocusMessageIdRef = useRef("");
  const latestAutoScrollMessageIdRef = useRef("");
  const scrollToLatestMessage = useCallback((animated = true) => {
    const scroll = () => {
      messageListRef.current?.scrollToEnd?.({ animated });
    };

    requestAnimationFrame(scroll);
    if (!animated) {
      setTimeout(scroll, 80);
      setTimeout(scroll, 220);
    }
  }, []);

  useEffect(() => {
    initialLatestScrollDoneRef.current = false;
    latestAutoScrollMessageIdRef.current = "";
  }, [currentConversationId]);

  useEffect(() => () => {
    if (replyHighlightTimeoutRef.current) {
      clearTimeout(replyHighlightTimeoutRef.current);
    }
    if (stickerSendUnlockTimeoutRef.current) {
      clearTimeout(stickerSendUnlockTimeoutRef.current);
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
      setIsPeerOnline(Boolean(nextUser?.isOnline));
    } catch (err: any) {
      console.log("User fetch error:", err?.response?.data || err);
    }
  }, [userId]);

  const mergeMessage = useCallback((nextMessage: any) => {
    const normalizedMessage = normalizeMediaFieldsDeep(nextMessage);

    setMessages((prev) => {
      const nextIdentity = getMessageIdentity(normalizedMessage);
      const nextSignature = buildMessageSignature(normalizedMessage);
      let hasChanged = false;

      const mergedItems = prev.map((item) => {
        const itemIdentity = getMessageIdentity(item);
        if (nextIdentity && itemIdentity === nextIdentity) {
          hasChanged = true;
          return { ...item, ...normalizedMessage, _optimistic: false };
        }

        if (
          !hasChanged
          && (
            (
              normalizedMessage?.clientMessageId
              && (
                String(normalizedMessage.clientMessageId) === String(item?.clientMessageId || "")
                || String(normalizedMessage.clientMessageId) === String(item?.optimisticId || item?.localId || "")
              )
            )
            || (
            (
              item?._optimistic
              && String(getMessageSenderId(item) || "") === String(currentUserId || "")
              && buildMessageSignature(item) === nextSignature
            )
            || isNearDuplicateMessage(item, normalizedMessage)
            )
          )
        ) {
          hasChanged = true;
          return { ...item, ...normalizedMessage, _optimistic: false };
        }

        return item;
      });

      if (hasChanged) {
        return dedupeMessages(mergedItems);
      }

      return [...prev, { ...normalizedMessage, _optimistic: false }];
    });
  }, [currentUserId]);

  const removeLocalMessage = useCallback((messageId: string) => {
    const normalizedMessageId = String(messageId || "").trim();
    if (!normalizedMessageId) {
      return;
    }

    setMessages((prev) => prev.filter((item) => getMessageIdentity(item) !== normalizedMessageId));
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
      const apiType = String(nextConversation?.conversationType || "").trim().toLowerCase();
      if (apiType === "direct" || apiType === "seller" || apiType === "group") {
        setResolvedConversationType(apiType as "direct" | "seller" | "group");
      }

      setChatTheme(nextConversation?.chatTheme || "default");
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

      if (apiType === "group") {
        const nextGroupMeta: GroupMeta = {
          groupName: nextConversation?.groupName || "Group chat",
          groupAvatar: nextConversation?.groupAvatar || "",
          memberCount: Number(nextConversation?.memberCount || nextConversation?.members?.length || 0),
          groupVisibility: normalizeGroupVisibility(nextConversation?.groupVisibility, Boolean(nextConversation?.isPublicGroup) || String(nextConversation?.type || "").trim().toLowerCase() === "channel"),
          groupMessagePermission: (nextConversation?.groupMessagePermission || "everyone") as "everyone" | "admins",
          isGroupAdmin: Boolean(nextConversation?.isGroupOwner || nextConversation?.isGroupAdmin),
        };

        setGroupMeta(nextGroupMeta);
        setGroupMentionCandidates(
          (Array.isArray(nextConversation?.members) ? nextConversation.members : [])
            .map(mapMentionCandidate)
            .filter(Boolean) as MentionCandidate[],
        );
        navigation.setParams({
          groupName: nextGroupMeta.groupName,
          groupAvatar: nextGroupMeta.groupAvatar,
          memberCount: nextGroupMeta.memberCount,
        });
      } else {
        setGroupMentionCandidates([]);
      }
    } catch (error: any) {
      console.log("Fetch conversation details error:", error?.response?.data || error);
    }
  }, [currentConversationId, navigation]);

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
        conversationType: resolvedConversationType,
        serviceId,
      });

      const nextConversation = res?.conversation;
      const nextConversationId = nextConversation?._id || null;
      if (nextConversationId) {
        setCurrentConversationId(nextConversationId);
        setChatTheme(nextConversation?.chatTheme || "default");
        setErrorMessage("");
      }
      return nextConversationId;
    } catch (err: any) {
      console.log("Ensure conversation error:", err?.response?.data || err);
      setErrorMessage(getReadableApiErrorMessage(err, "Unable to start this conversation right now."));
      return null;
    }
  }, [currentConversationId, resolvedConversationType, serviceId, userId]);

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
  }, [ensureConversation, fetchConversationMeta, fetchMessages, fetchUser, joinConversationRealtime, userId]);

  const sendCallEventLog = useCallback(async ({
    targetConversationId,
    callSessionId,
    callType,
    event = "started",
  }: {
    targetConversationId: string;
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
          targetConversationId: resolvedConversationId,
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
          title: isGroupConversation
            ? groupMeta.groupName || groupName || "Group call"
            : user?.name || user?.username || "Aline2 call",
          avatarUrl: isGroupConversation
            ? groupMeta.groupAvatar || groupAvatar || ""
            : user?.profilePic || "",
        });
        return;
      }

      Alert.alert(
        "Could not start call",
        getReadableApiErrorMessage(error, "Unable to start the call right now."),
      );
    }
  }, [
    ensureConversation,
    currentUserId,
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
      groupVisibility: normalizeGroupVisibility(groupConversation?.groupVisibility, Boolean(groupConversation?.isPublicGroup) || String(groupConversation?.type || "").trim().toLowerCase() === "channel"),
      groupMessagePermission: (groupConversation?.groupMessagePermission || "everyone") as "everyone" | "admins",
      isGroupAdmin: Boolean(groupConversation?.isGroupOwner || groupConversation?.isGroupAdmin),
    });
    setGroupMentionCandidates(
      (Array.isArray(groupConversation?.members) ? groupConversation.members : [])
        .map(mapMentionCandidate)
        .filter(Boolean) as MentionCandidate[],
    );
  }, [groupAvatar, groupConversation?.groupMessagePermission, groupConversation?.groupVisibility, groupConversation?.isGroupAdmin, groupConversation?.isGroupOwner, groupConversation?.isPublicGroup, groupConversation?.members, groupConversation?.type, groupName, memberCount]);

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

  useEffect(() => {
    if (!currentUserId || !currentConversationId) {
      setIsConversationLockedState(false);
      return;
    }

    isConversationLocked(currentUserId, currentConversationId)
      .then((locked) => {
        setIsConversationLockedState(locked);
      })
      .catch((error) => {
        console.log("chat lock state error:", error);
      });
  }, [currentConversationId, currentUserId]);

  const submitChatLockPasscode = useCallback(async (passcode: string) => {
    try {
      setLockingBusy(true);
      if (chatLockMode === "setup") {
        await setChatLockPasscode(passcode);
        setIsConversationLockedState(false);
      } else {
        const isValid = await verifyChatLockPasscode(passcode);
        if (!isValid) {
          throw new Error("Incorrect passcode.");
        }
        setIsConversationLockedState(false);
      }

      setChatLockModalVisible(false);
    } catch (error) {
      Alert.alert("Chat lock", getReadableApiErrorMessage(error, "Unable to unlock chat."));
    } finally {
      setLockingBusy(false);
    }
  }, [chatLockMode]);

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

  useFocusEffect(
    useCallback(() => {
      if (isGroupConversation || !userId) {
        return undefined;
      }

      fetchUser().catch((error) => {
        console.log("presence refresh error:", error);
      });

      const presenceTimer = setInterval(() => {
        fetchUser().catch((error) => {
          console.log("presence refresh error:", error);
        });
      }, 20000);

      return () => {
        clearInterval(presenceTimer);
      };
    }, [fetchUser, isGroupConversation, userId]),
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

      if (user?.isOnline !== true) {
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
            getMessageIdentity(msg) === String(data.messageId)
              ? { ...msg, text: data.text, isEdited: true, editedAt: data.editedAt }
              : msg
          )
        );
      }
    };

    const handleMessageDeleted = (data: any) => {
      if (!data?.messageId) {
        return;
      }

      setMessages((prev) => prev.filter((msg) => getMessageIdentity(msg) !== String(data.messageId)));
      setReplyingToMessage((prev) => (getMessageIdentity(prev) === String(data.messageId) ? null : prev));
    };

    const handleChatThemeChanged = (data: any) => {
      if (data?.theme) {
        setChatTheme(data.theme);
      }
    };

    const handleChatWallpaperChanged = (data: any) => {
      setChatWallpaper(String(data?.wallpaperUrl || ""));
    };

    const handlePresenceUpdate = (data: any) => {
      const nextUserId = String(data?.userId || "");
      if (!nextUserId || nextUserId !== String(userId || "")) {
        return;
      }

      setUser((prev) => prev ? {
        ...prev,
        isOnline: Boolean(data?.isOnline),
        lastSeenAt: String(data?.lastSeenAt || prev?.lastSeenAt || ""),
        availabilityStatus: String(data?.availabilityStatus || prev?.availabilityStatus || ""),
      } : prev);
      setIsPeerOnline(Boolean(data?.isOnline));
    };

    socket.on("receiveMessage", handleReceiveMessage);
    socket.on("typing", handleTyping);
    socket.on("stopTyping", handleStopTyping);
    socket.on("messageSeen", handleMessageSeen);
    socket.on("messageReaction", handleMessageReaction);
    socket.on("messageEdited", handleMessageEdited);
    socket.on("messageDeleted", handleMessageDeleted);
    socket.on("chatThemeChanged", handleChatThemeChanged);
    socket.on("chatWallpaperChanged", handleChatWallpaperChanged);
    socket.on("presence:update", handlePresenceUpdate);

    return () => {
      socket.off("receiveMessage", handleReceiveMessage);
      socket.off("typing", handleTyping);
      socket.off("stopTyping", handleStopTyping);
      socket.off("messageSeen", handleMessageSeen);
      socket.off("messageReaction", handleMessageReaction);
      socket.off("messageEdited", handleMessageEdited);
      socket.off("messageDeleted", handleMessageDeleted);
      socket.off("chatThemeChanged", handleChatThemeChanged);
      socket.off("chatWallpaperChanged", handleChatWallpaperChanged);
      socket.off("presence:update", handlePresenceUpdate);
    };
  }, [
    applyMessageReaction,
    applyMessageSeen,
    currentConversationId,
    currentUserId,
    mergeMessage,
    userId,
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
    const isChannelConversation = isGroupConversation && groupMeta.groupVisibility === "public";
    if (
      isGroupConversation
      && groupMeta.groupMessagePermission === "admins"
      && !groupMeta.isGroupAdmin
    ) {
      throw new Error(isChannelConversation ? "Only admins can send messages in this channel." : "Only admins can send messages in this group.");
    }

    const preliminaryGuardKey = buildOutgoingSendGuardKey({
      conversationId: currentConversationId,
      text: nextText,
      file,
      mediaUrl,
      messageType,
      duration,
      replyToMessageId,
    });
    if (preliminaryGuardKey && activeOutgoingSendKeysRef.current.has(preliminaryGuardKey)) {
      return;
    }
    if (preliminaryGuardKey) {
      activeOutgoingSendKeysRef.current.add(preliminaryGuardKey);
    }

    const resolvedConversationId = await ensureConversation();
    if (!resolvedConversationId) {
      if (preliminaryGuardKey) {
        activeOutgoingSendKeysRef.current.delete(preliminaryGuardKey);
      }
      throw new Error("Unable to start this conversation right now.");
    }

    const sendGuardKey = buildOutgoingSendGuardKey({
      conversationId: resolvedConversationId,
      text: nextText,
      file,
      mediaUrl,
      messageType,
      duration,
      replyToMessageId,
    });
    const sendAttemptedAt = Date.now();
    if (
      sendGuardKey
      && recentOutgoingSendRef.current.key === sendGuardKey
      && sendAttemptedAt - recentOutgoingSendRef.current.timestamp < 1400
    ) {
      if (preliminaryGuardKey) {
        activeOutgoingSendKeysRef.current.delete(preliminaryGuardKey);
      }
      return;
    }
    recentOutgoingSendRef.current = { key: sendGuardKey, timestamp: sendAttemptedAt };
    if (sendGuardKey) {
      activeOutgoingSendKeysRef.current.add(sendGuardKey);
    }

    const optimisticId = `local:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    mergeMessage(
      buildOptimisticMessage({
        optimisticId,
        currentUserId,
        text: nextText,
        file,
        mediaUrl,
        messageType,
        duration,
        replyToMessageId,
        replyToMessage,
      }),
    );
    setReplyingToMessage(null);
    scrollToLatestMessage(false);

    try {
      const res = await sendChatMessage({
        conversationId: resolvedConversationId,
        text: nextText,
        file,
        mediaUrl,
        messageType,
        duration,
        replyToMessageId,
        clientMessageId: optimisticId,
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
      }
    } catch (error) {
      if (recentOutgoingSendRef.current.key === sendGuardKey) {
        recentOutgoingSendRef.current = { key: "", timestamp: 0 };
      }
      removeLocalMessage(optimisticId);
      setReplyingToMessage(replyToMessage || null);
      throw error;
    } finally {
      if (preliminaryGuardKey) {
        activeOutgoingSendKeysRef.current.delete(preliminaryGuardKey);
      }
      if (sendGuardKey) {
        activeOutgoingSendKeysRef.current.delete(sendGuardKey);
      }
    }
  }, [currentConversationId, currentUserId, ensureConversation, groupMeta.groupMessagePermission, groupMeta.groupVisibility, groupMeta.isGroupAdmin, isGroupConversation, mergeMessage, removeLocalMessage, scrollToLatestMessage]);

  const replyingToMessageId = useMemo(() => getMessageIdentity(replyingToMessage), [replyingToMessage]);

  const sendTextMessage = useCallback(async () => {
    if (!text.trim() || sending || textSendLockRef.current) {
      return;
    }

    const trimmedText = text.trim();
    try {
      textSendLockRef.current = true;
      setSending(true);
      setText("");
      await submitMessage({
        text: trimmedText,
        replyToMessageId: replyingToMessageId,
        replyToMessage: replyingToMessage,
      });
    } catch (err: any) {
      setText(trimmedText);
      console.log("Send message error:", err?.response?.data || err);
      Alert.alert("Error", getReadableApiErrorMessage(err, "Failed to send message"));
    } finally {
      textSendLockRef.current = false;
      setSending(false);
    }
  }, [replyingToMessage, replyingToMessageId, sending, submitMessage, text]);

  const runComposerSendAction = useCallback((action: () => Promise<void>) => {
    if (composerSendPressLockRef.current) {
      return;
    }

    composerSendPressLockRef.current = true;
    action()
      .catch(() => {})
      .finally(() => {
        composerSendPressLockRef.current = false;
      });
  }, []);

  const primaryThemeColor = useMemo(() => {
    return CHAT_THEME_LIST.find(t => t.id === chatTheme)?.sentBubble[0] || PRIMARY;
  }, [chatTheme]);

  const isDirectActive = useMemo(
    () => Boolean(typingUserId || user?.isOnline === true || isPeerOnline),
    [isPeerOnline, typingUserId, user?.isOnline],
  );

  const directPresenceText = useMemo(() => {
    if (typingUserId) {
      return "Typing...";
    }

    if (String(user?.availabilityStatus || "").trim().toLowerCase() === "away") {
      return "Away";
    }

    if (isDirectActive || String(user?.availabilityStatus || "").trim().toLowerCase() === "active") {
      return "Active now";
    }

    return formatLastSeenStatus(user?.lastSeenAt);
  }, [isDirectActive, typingUserId, user?.availabilityStatus, user?.lastSeenAt]);

  const groupPresenceText = useMemo(() => {
    if (typingUserId) {
      return "Someone is typing...";
    }

    return `${groupMeta.memberCount || 0} members`;
  }, [groupMeta.memberCount, typingUserId]);

  const chatHeaderTint = primaryThemeColor;
  const headerStatusColor = "rgba(255,255,255,0.78)";
  const headerIconColor = "#FFFFFF";
  const compactHeaderActionSize = Math.max(chatMetrics.headerAction - 4, 30);
  const compactHeaderTitleSize = Math.max(chatMetrics.titleFontSize - 3, 13);
  const compactHeaderStatusSize = Math.max(chatMetrics.statusFontSize - 1, 10.5);
  const minimumWideBubbleWidth = Math.min(
    Math.max(134, Math.round(width * 0.38)),
    Math.round(width * 0.66),
  );
  const compactBubbleMaxWidth = width < 360 ? "82%" : width < 430 ? "78%" : "74%";
  const wideContentBubbleMaxWidth = width < 360 ? "86%" : width < 430 ? "82%" : "78%";
  const callEventBubbleWidth = Math.min(Math.max(Math.round(width * 0.52), 164), 216);
  const mediaBubbleWidth = Math.min(width * 0.56, 192);
  const isChannelConversation = isGroupConversation && groupMeta.groupVisibility === "public";
  const canScheduleCall = resolvedConversationType === "direct" || resolvedConversationType === "group";
  const canComposeGroupMessage = !isGroupConversation
    || groupMeta.groupMessagePermission !== "admins"
    || groupMeta.isGroupAdmin;
  const hideChannelComposer = isChannelConversation && !canComposeGroupMessage;
  const activeGroupMentionQuery = isGroupConversation ? getActiveMentionQuery(text) : null;
  const visibleGroupMentionCandidates = useMemo(() => {
    if (activeGroupMentionQuery === null) {
      return [];
    }

    const query = activeGroupMentionQuery.trim().toLowerCase();
    return groupMentionCandidates
      .filter((candidate) => {
        if (!query) {
          return true;
        }
        return candidate.username.toLowerCase().includes(query) || String(candidate.name || "").toLowerCase().includes(query);
      })
      .slice(0, 6);
  }, [activeGroupMentionQuery, groupMentionCandidates]);
  const groupComposeLockedText = isGroupConversation && !canComposeGroupMessage
    ? isChannelConversation
      ? "Only admins can send messages in this channel."
      : "Only admins can send messages in this group."
    : "";
  const assistantScope = isGroupConversation ? "Group chat support" : "Direct chat support";
  const assistantScopeHint = isGroupConversation
    ? `Get help with messages, calls, media, and group controls for ${groupMeta.groupName || "this group chat"}.`
    : `Get help with messaging, media, and chat support for ${user?.username || user?.name || "this conversation"}.`;
  const assistantConversationSummary = isGroupConversation
    ? `Group members: ${groupMeta.memberCount || 0}. Presence: ${groupPresenceText}.`
    : `Current chat partner: ${user?.username || user?.name || "User"}. Presence: ${directPresenceText}.${conversationListing?.serviceName ? ` Linked service: ${conversationListing.serviceName}.` : ""}`;
  const assistantSuggestedPrompts = isGroupConversation
    ? ["Fix a group chat issue", "Troubleshoot media sending", "Explain unread messages"]
    : ["Why is my message not sending?", "Explain chat settings", "Help fix this conversation"];
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

  useEffect(() => {
    if (!messages.length || loadingMore) {
      return;
    }

    const latestMessageId = getMessageIdentity(messages[messages.length - 1]);
    if (!initialLatestScrollDoneRef.current) {
      initialLatestScrollDoneRef.current = true;
      latestAutoScrollMessageIdRef.current = latestMessageId || "";
      scrollToLatestMessage(false);
      setTimeout(() => scrollToLatestMessage(false), 80);
      return;
    }

    if (!latestMessageId || latestAutoScrollMessageIdRef.current === latestMessageId) {
      return;
    }

    const shouldAnimate = latestAutoScrollMessageIdRef.current !== "";
    latestAutoScrollMessageIdRef.current = latestMessageId;
    scrollToLatestMessage(shouldAnimate);
  }, [loadingMore, messages, scrollToLatestMessage]);

  const queueAttachmentPreview = useCallback((assetsInput: any[] | any) => {
    const assets = Array.isArray(assetsInput) ? assetsInput : [assetsInput];
    const seenAssetKeys = new Set<string>();
    const nextAttachments = assets
      .filter((asset) => {
        const assetKey = String(asset?.uri || asset?.fileName || "").trim();
        if (!assetKey || seenAssetKeys.has(assetKey)) {
          return false;
        }
        seenAssetKeys.add(assetKey);
        return true;
      })
      .map((asset, index) => {
        const mimeType = inferPickedMimeType(asset);
        const kind = mimeType.startsWith("video/") ? "video" : "image";
        return {
          uri: asset.uri,
          name: ensurePickedFileName(asset.fileName, `${kind}_${Date.now()}_${index + 1}`, mimeType),
          type: mimeType,
          kind,
        } as PendingAttachment;
      });

    if (!nextAttachments.length) {
      return;
    }

    setPendingAttachments(nextAttachments);
    setPendingVoiceNote(null);
    setShowTools(false);
  }, []);

  const sendImageAttachment = useCallback(async () => {
    try {
      const response = await launchImageLibrary({
        mediaType: "mixed",
        selectionLimit: 10,
      });

      if (response?.didCancel) {
        return;
      }
      if (response?.errorCode) {
        Alert.alert("Error", response.errorMessage || "Image pick failed");
        return;
      }

      queueAttachmentPreview(response.assets || []);
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
    if (!pendingAttachments.length || pendingAttachmentSendLockRef.current || uploading) {
      return;
    }

    try {
      pendingAttachmentSendLockRef.current = true;
      setUploading(true);
      for (const attachment of pendingAttachments) {
        await checkChatMediaModeration({
          file: {
            uri: attachment.uri,
            name: attachment.name,
            type: attachment.type,
          },
          messageType: attachment.kind,
        });
      }

      for (let index = 0; index < pendingAttachments.length; index += 1) {
        const attachment = pendingAttachments[index];
        await submitMessage({
          text: index === 0 ? text.trim() : "",
          file: {
            uri: attachment.uri,
            name: attachment.name,
            type: attachment.type,
          },
          messageType: attachment.kind,
          replyToMessageId: index === 0 ? replyingToMessageId : undefined,
          replyToMessage: index === 0 ? replyingToMessage : undefined,
        });
      }
      setText("");
      setPendingAttachments([]);
    } catch (error: any) {
      console.log("attachment message send error:", error);
      if (showModerationBlockedSheet(error, { fallbackMessage: "This attachment could not be sent right now." })) {
        return;
      }
      Alert.alert("Error", getReadableApiErrorMessage(error, "Failed to send attachment"));
    } finally {
      pendingAttachmentSendLockRef.current = false;
      setUploading(false);
    }
  }, [pendingAttachments, replyingToMessage, replyingToMessageId, submitMessage, text, uploading]);

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
        messageType: "audio",
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
      Alert.sheet("Add a place", "Enter a place, address, or landmark to share.");
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

  const useCurrentLocation = useCallback(async () => {
    if (locatingCurrentPosition || uploading) {
      return;
    }

    try {
      setLocatingCurrentPosition(true);

      if (Platform.OS === "android") {
        const granted = await requestAndroidLocationPermission();
        if (!granted) {
          Alert.sheet("Location permission needed", "Allow location access or enter a place manually.");
          return;
        }
      }

      const { latitude, longitude } = await getCurrentDeviceLocation();
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error("Could not detect current location.");
      }

      setUploading(true);
      await submitMessage({
        text: buildCoordinateLocationMessage(latitude, longitude),
        replyToMessageId: replyingToMessageId,
        replyToMessage: replyingToMessage,
      });
      setLocationDraft("");
      setShowLocationComposer(false);
      setShowTools(false);
    } catch (error: any) {
      console.log("current location send error:", error);
      Alert.sheet("Location unavailable", getReadableApiErrorMessage(error, "Enter a place manually or try current location again."));
    } finally {
      setUploading(false);
      setLocatingCurrentPosition(false);
    }
  }, [locatingCurrentPosition, replyingToMessage, replyingToMessageId, submitMessage, uploading]);

  const resetScheduleCallComposer = useCallback(() => {
    setShowScheduleCallComposer(false);
    setScheduleCallType("audio");
    setScheduleCallDateTime(buildLocalDateTimeInputValue());
    setScheduleCallDurationMinutes("30");
    setScheduleCallAgenda("");
  }, []);

  const sendScheduledCallMessage = useCallback(async () => {
    const scheduledStart = parseLocalDateTimeInputValue(scheduleCallDateTime);
    const durationMinutes = Math.max(5, Number.parseInt(String(scheduleCallDurationMinutes || "30"), 10) || 30);

    if (!scheduledStart) {
      Alert.alert("Pick date & time", "Please enter a valid date and time for the scheduled call.");
      return;
    }

    if (scheduledStart.getTime() <= Date.now()) {
      Alert.alert("Future time required", "Please choose a future date and time for the scheduled call.");
      return;
    }

    try {
      setUploading(true);
      const resolvedConversationId = await ensureConversation();
      if (!resolvedConversationId) {
        throw new Error("Unable to open this conversation right now.");
      }

      const scheduledEnd = new Date(scheduledStart.getTime() + durationMinutes * 60 * 1000);
      const participantLabel = isGroupConversation
        ? groupMeta.groupName || groupName || "this group"
        : user?.name || user?.username || "this chat";
      const scheduleTitle = `${scheduleCallType === "video" ? "Video" : "Voice"} call with ${participantLabel}`;
      const scheduleDetails = [
        scheduleCallAgenda ? `Agenda: ${scheduleCallAgenda.trim()}` : "",
        isGroupConversation ? `Group chat: ${participantLabel}` : "Scheduled from Aline2 chat",
      ].filter(Boolean).join("\n");
      const calendarUrl = buildGoogleCalendarUrl({
        title: scheduleTitle,
        details: scheduleDetails,
        start: scheduledStart,
        end: scheduledEnd,
      });
      const payload = buildScheduledCallMessage({
        callType: scheduleCallType,
        title: scheduleTitle,
        details: scheduleDetails,
        startAt: scheduledStart.toISOString(),
        endAt: scheduledEnd.toISOString(),
        durationMinutes,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
        createdBy: currentUserId,
        calendarUrl,
      });

      const response = await sendChatMessage({
        conversationId: resolvedConversationId,
        text: payload,
        messageType: "system",
        replyToMessageId: replyingToMessageId,
      });

      if (response?.message) {
        mergeMessage(response.message);
      }

      resetScheduleCallComposer();
      setReplyingToMessage(null);
      scrollToLatestMessage();
    } catch (error) {
      console.log("schedule call message send error:", error);
      Alert.alert("Could not schedule call", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setUploading(false);
    }
  }, [
    currentUserId,
    ensureConversation,
    groupMeta.groupName,
    groupName,
    isGroupConversation,
    mergeMessage,
    replyingToMessageId,
    resetScheduleCallComposer,
    scheduleCallAgenda,
    scheduleCallDateTime,
    scheduleCallDurationMinutes,
    scheduleCallType,
    scrollToLatestMessage,
    user?.name,
    user?.username,
  ]);

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
    ...(canScheduleCall ? [{
      id: "schedule_call",
      name: "Schedule call",
      icon: "calendar",
      action: () => {
        setShowTools(false);
        setShowScheduleCallComposer(true);
      },
    }] : []),
  ], [canScheduleCall, sendAudioAttachment, sendCameraAttachment, sendDocumentAttachment, sendImageAttachment]);

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
      .catch((error: any) => {
        console.log("Message seen emit error:", error);
      });
  }, [applyMessageSeen, currentConversationId, currentUserId, messages]);

  const reactToMessage = useCallback((messageId: string, emoji = "❤️") => {
    if (!messageId) {
      return;
    }

    applyMessageReaction({
      messageId,
      userId: currentUserId,
      emoji,
    });

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

  const sendVoiceMessage = useCallback(async (voiceFile: { uri: string; name: string; type: string; duration: number }) => {
    setPendingAttachments([]);
    setPendingVoiceNote(voiceFile);
    setShowTools(false);
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
      scrollToLatestMessage(false);
      messageInputRef.current?.focus();
    });
  }, [scrollToLatestMessage]);

  const openMentionedGroupMember = useCallback((username: string) => {
    const normalizedUsername = String(username || "").replace(/^@/, "").trim().toLowerCase();
    const matchedMember = groupMentionCandidates.find((candidate) => candidate.username.toLowerCase() === normalizedUsername);
    if (matchedMember?.id) {
      navigation.navigate("ProfilePreviewScreen", { userId: matchedMember.id });
    }
  }, [groupMentionCandidates, navigation]);

  // ─── Render message ───────────────────────────────────────────────────────

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMine = String(getMessageSenderId(item)) === String(currentUserId || "");
    const isSystemMessage = String(item?.messageType || "") === "system";
    const senderId = String(getMessageSenderId(item) || "");
    const senderInfo = typeof item?.sender === "object" ? item.sender : null;
    const senderDisplayName = String(
      senderInfo?.username
      || senderInfo?.name
      || "Aline2 user"
    ).trim() || "Aline2 user";
    const showGroupSender = isGroupConversation && !isMine && !isSystemMessage;
    const attachment: MessageAttachment | null = getMessageAttachment(item);
    const textValue = getMessageText(item);
    const sharedContent = parseSharedContentMessage(item);
    const callEvent = buildCallEventPreview(item, currentUserId);
    const scheduledCall = buildScheduledCallPreview(item);
    const sharedMedia = Array.isArray(sharedContent?.media) ? sharedContent.media[0] : null;
    const locationPayload = parseLocationMessage(textValue);
    const linkPreview = item?.linkPreview || null;
    const seenCount = Array.isArray(item?.seenBy) ? item.seenBy.length : 0;
    const reactions = Array.isArray(item?.reactions) ? item.reactions : [];
    const repliedMessage = getMessageReply(item) as ChatMessage | null;
    const replyPreview = buildReplyPreview(repliedMessage);
    const isHighlighted = getMessageIdentity(item) === highlightedMessageId;
    const messageTimeLabel = formatMessageTime(item?.createdAt);
    if (isSystemMessage && !scheduledCall) {
      return (
        <View style={styles.systemMessageRow}>
          <View style={[styles.systemMessagePill, { backgroundColor: alpha(colors.surface, "E8"), borderColor: alpha(colors.border, "86") }]}>
            <Text style={[styles.systemMessageText, { color: colors.mutedText }]}>
              {textValue || "System update"}
            </Text>
            {messageTimeLabel ? (
              <Text style={[styles.systemMessageTime, { color: colors.placeholder }]}>
                {messageTimeLabel}
              </Text>
            ) : null}
          </View>
        </View>
      );
    }
    const isEmojiOnly = !locationPayload && !sharedContent && !callEvent && !scheduledCall && !attachment?.url && isEmojiOnlyText(textValue);
    const hasImageBubble = isImageMessage(item) && attachment?.url;
    const hasVoiceBubble = (isAudioMessage(item) || item?.messageType === "voice") && attachment?.url;
    const hasVideoBubble = !hasVoiceBubble && isVideoMessage(item) && (attachment?.thumbnailUrl || attachment?.url);
    const hasDocumentBubble = isDocumentMessage(item) && attachment?.url;
    const isGifBubble = String(item?.messageType || "").trim().toLowerCase() === "gif";
    const mediaBubbleKind = !callEvent && !locationPayload && !sharedContent
      ? hasImageBubble
        ? "image"
        : hasVoiceBubble
          ? "voice"
          : hasVideoBubble
            ? "video"
            : hasDocumentBubble
              ? "document"
              : null
      : null;
    const isMediaBubble = Boolean(mediaBubbleKind);
    const attachmentLabel = getAttachmentDisplayName(item);
    const shouldRenderMessageText =
      !locationPayload
      && !sharedContent
      && !callEvent
      && !!textValue
      && (!isMediaBubble || !isGenericAttachmentText(textValue, attachmentLabel));
    let swipeableRef: Swipeable | null = null;

    const bubbleTextColor = isMine ? "#fff" : colors.text;
    const bubbleMetaColor = isMine ? "rgba(255,255,255,0.72)" : colors.mutedText;
    const messageStatusIcon = seenCount > 0 ? "checkmark-done" : "checkmark";
    const messageStatusIconColor = seenCount > 0 ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.72)";
    const incomingBubbleBg = colors.card;
    const incomingBubbleBorder = alpha(colors.border, "CC");
    const outgoingMediaBubbleColor = alpha(primaryThemeColor, "2C");
    const outgoingMediaBubbleBorder = alpha(primaryThemeColor, "5A");

    return (
      <Swipeable
        ref={(instance) => {
          swipeableRef = instance;
        }}
        friction={1.4}
        overshootLeft={false}
        overshootRight={false}
        leftThreshold={18}
        rightThreshold={18}
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
          {showGroupSender ? (
            <TouchableOpacity
              activeOpacity={0.86}
              style={[styles.groupSenderAvatarWrap, { marginRight: chatMetrics.listPadding - 4 }]}
              onPress={() => navigation.navigate("ProfilePreviewScreen", { userId: senderId })}
            >
              <Image
                source={{ uri: normalizeMediaUrl(senderInfo?.profilePic || DEFAULT_AVATAR_URL) }}
                style={[styles.groupSenderAvatar, { width: chatMetrics.senderAvatar, height: chatMetrics.senderAvatar, borderRadius: chatMetrics.senderAvatar / 2 }]}
              />
            </TouchableOpacity>
          ) : null}

          <View
            style={[
              styles.messageContentColumn,
              isMine ? styles.messageContentColumnMine : styles.messageContentColumnOther,
              showGroupSender ? [styles.groupMessageColumn, { maxWidth: chatMetrics.wideBubbleMaxWidth }] : { maxWidth: chatMetrics.wideBubbleMaxWidth },
            ]}
          >
            {showGroupSender ? (
              <TouchableOpacity
                activeOpacity={0.86}
                onPress={() => navigation.navigate("ProfilePreviewScreen", { userId: senderId })}
              >
                <Text style={[styles.groupSenderName, { color: alpha(primaryThemeColor, "E2"), fontSize: chatMetrics.senderFontSize }]} numberOfLines={1}>
                  {senderDisplayName}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              activeOpacity={isSystemMessage ? 1 : 0.92}
              onPress={isSystemMessage ? undefined : () => handleMessagePress(item, attachment, locationPayload)}
              onLongPress={isSystemMessage ? undefined : () => {
                setContextMessage(item);
                setShowContextMenu(true);
              }}
              style={[
                styles.messageBubble,
                isMine ? styles.messageBubbleMineAligned : styles.messageBubbleOtherAligned,
                !callEvent && !scheduledCall && !isEmojiOnly && !isMediaBubble ? {
                  paddingHorizontal: chatMetrics.bubblePaddingX,
                  paddingVertical: chatMetrics.bubblePaddingY,
                  borderRadius: chatMetrics.bubbleRadius,
                  maxWidth: compactBubbleMaxWidth,
                  minWidth: replyPreview ? 0 : width < 360 ? 64 : width < 430 ? 76 : 84,
                } : null,
                showGroupSender ? styles.groupMessageBubble : null,
                sharedContent
                  ? [styles.messageBubbleWide, { maxWidth: wideContentBubbleMaxWidth, minWidth: minimumWideBubbleWidth }]
                  : null,
                (callEvent || scheduledCall)
                  ? [
                    styles.callEventBubbleShell,
                    { maxWidth: callEventBubbleWidth },
                    isMine
                      ? styles.callEventBubbleMine
                      : [styles.callEventBubbleOther, { backgroundColor: incomingBubbleBg, borderColor: incomingBubbleBorder }],
                  ]
                  : isEmojiOnly
                    ? [
                      styles.emojiOnlyBubble,
                      isMine
                        ? { backgroundColor: alpha(primaryThemeColor, "22"), borderColor: alpha(primaryThemeColor, "34") }
                        : { backgroundColor: alpha(colors.surface, "F2"), borderColor: incomingBubbleBorder },
                    ]
                    : isMediaBubble
                      ? [
                        styles.mediaMessageBubble,
                        isMine
                          ? [styles.mediaMessageBubbleMine, { backgroundColor: outgoingMediaBubbleColor, borderColor: outgoingMediaBubbleBorder }]
                          : [styles.mediaMessageBubbleOther, { backgroundColor: incomingBubbleBg, borderColor: incomingBubbleBorder }],
                      ]
                      : isMine
                        ? [styles.myMessage, styles.myMessageBubbleTail, { backgroundColor: primaryThemeColor }]
                        : [styles.otherMessage, styles.otherMessageBubbleTail, { backgroundColor: incomingBubbleBg, borderColor: incomingBubbleBorder }],
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
                style={[
                  styles.replyPreviewCard,
                  isMine ? styles.replyPreviewCardMine : null,
                  isMine ? styles.replyPreviewCardMineAligned : styles.replyPreviewCardOtherAligned,
                ]}
              >
                <View style={[styles.replyPreviewBar, isMine ? styles.replyPreviewBarMine : null]} />
                <View style={styles.replyPreviewBody}>
                  <Text style={[styles.replyPreviewAuthor, isMine ? styles.replyPreviewAuthorMine : null, { fontSize: chatMetrics.metaFontSize + 0.5 }]} numberOfLines={1}>
                    {replyPreview.author}
                  </Text>
                  <Text style={[styles.replyPreviewSnippet, isMine ? styles.replyPreviewSnippetMine : null, { fontSize: chatMetrics.metaFontSize, lineHeight: chatMetrics.metaFontSize + 6 }]} numberOfLines={1}>
                    {replyPreview.snippet}
                  </Text>
                </View>
              </TouchableOpacity>
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
                style={[styles.sharedPostCard, isMine ? styles.sharedPostCardMine : null]}
              >
                <View style={styles.sharedPostHeader}>
                  <AppAvatar
                    uri={normalizeMediaUrl(sharedContent?.user?.avatarUrl || DEFAULT_AVATAR_URL)}
                    name={sharedContent?.user?.name || sharedContent?.user?.username || "Aline2"}
                    size={30}
                    style={styles.sharedPostAvatar}
                  />
                  <View style={styles.sharedPostMeta}>
                    <Text style={[styles.sharedPostAuthor, isMine ? styles.sharedPostAuthorMine : null, { fontSize: chatMetrics.metaFontSize + 1 }]} numberOfLines={1}>
                      {sharedContent?.user?.username
                        ? `@${sharedContent.user.username}`
                        : sharedContent?.user?.name || (sharedContent?.kind === "story" ? "Aline2 story" : "Aline2 post")}
                    </Text>
                    <Text style={[styles.sharedPostLabel, isMine ? styles.sharedPostLabelMine : null, { fontSize: chatMetrics.metaFontSize }]} numberOfLines={1}>
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

                {sharedContent?.kind === "story" && sharedContent?.interaction?.text ? (
                  <Text style={[styles.sharedPostCaption, isMine ? styles.sharedPostCaptionMine : null, styles.sharedStoryReplyText, { fontSize: chatMetrics.metaFontSize + 0.5, lineHeight: chatMetrics.metaFontSize + 6 }]} numberOfLines={2}>
                    {sharedContent.interaction.text}
                  </Text>
                ) : null}

                {sharedMedia?.url || sharedMedia?.thumbnailUrl ? (
                  <Image
                    source={{ uri: normalizeMediaUrl(sharedMedia?.thumbnailUrl || sharedMedia?.url || "") }}
                    style={styles.sharedPostImage}
                    resizeMode="cover"
                  />
                ) : null}

                {sharedContent?.caption ? (
                  <Text style={[styles.sharedPostCaption, isMine ? styles.sharedPostCaptionMine : null, { fontSize: chatMetrics.metaFontSize + 1, lineHeight: chatMetrics.metaFontSize + 7 }]} numberOfLines={3}>
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
                    size={15}
                    color={isMine ? "#fff" : primaryThemeColor}
                  />
                </View>
                <View style={styles.callEventBody}>
                  <Text style={[styles.callEventTitle, isMine ? styles.callEventTitleMine : null, { fontSize: chatMetrics.metaFontSize + 1 }]}>{callEvent.label}</Text>
                  <Text style={[styles.callEventMeta, isMine ? styles.callEventMetaMine : null, { fontSize: chatMetrics.metaFontSize }]}>
                    {messageTimeLabel ? `${callEvent.meta} • ${messageTimeLabel}` : callEvent.meta}
                  </Text>
                </View>
              </View>
            ) : null}

            {scheduledCall ? (
              <TouchableOpacity
                activeOpacity={scheduledCall.calendarUrl ? 0.85 : 1}
                disabled={!scheduledCall.calendarUrl}
                onPress={() => {
                  if (!scheduledCall.calendarUrl) {
                    return;
                  }

                  Linking.openURL(scheduledCall.calendarUrl).catch((error) => {
                    console.log("scheduled call calendar open error:", error);
                  });
                }}
                style={[styles.callEventCard, isMine ? styles.callEventCardMine : null]}
              >
                <View style={[styles.callEventIcon, isMine ? styles.callEventIconMine : null]}>
                  <Icon
                    name="calendar-outline"
                    size={15}
                    color={isMine ? "#fff" : primaryThemeColor}
                  />
                </View>
                <View style={styles.callEventBody}>
                  <Text style={[styles.callEventTitle, isMine ? styles.callEventTitleMine : null, { fontSize: chatMetrics.metaFontSize + 1 }]}>
                    {scheduledCall.label}
                  </Text>
                  <View style={styles.scheduledCallMetaRow}>
                    <Text style={[styles.callEventMeta, isMine ? styles.callEventMetaMine : null, styles.scheduledCallPrimaryMeta, { fontSize: chatMetrics.metaFontSize }]}>
                      {scheduledCall.meta}
                    </Text>
                    <View style={[styles.scheduledCallDurationBadge, isMine ? styles.scheduledCallDurationBadgeMine : null]}>
                      <Text style={[styles.scheduledCallDurationBadgeText, isMine ? styles.scheduledCallDurationBadgeTextMine : null, { fontSize: Math.max(10, chatMetrics.metaFontSize - 0.5) }]}>
                        {`${scheduledCall.durationMinutes} min`}
                      </Text>
                    </View>
                  </View>
                  {scheduledCall.calendarUrl ? (
                    <Text style={[styles.callEventLink, isMine ? styles.callEventLinkMine : null, { fontSize: chatMetrics.metaFontSize }]}>
                      Open calendar invite
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            ) : null}

            {mediaBubbleKind === "image" ? (
              <View style={[styles.mediaCard, isGifBubble ? styles.gifMediaCard : null]}>
                <Image
                  source={{ uri: normalizeMediaUrl(attachment?.url || "") }}
                  style={[
                    styles.messageImage,
                    {
                      width: mediaBubbleWidth,
                      height: Math.min(width * 0.5, 188),
                    },
                  ]}
                  resizeMode="cover"
                />
                {isGifBubble ? (
                  <View style={[styles.mediaTypeBadge, isMine ? styles.mediaTypeBadgeMine : null]}>
                    <Text style={styles.mediaTypeBadgeText}>GIF</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {mediaBubbleKind === "video" ? (
              <View style={styles.mediaCard}>
                <Image
                  source={{ uri: normalizeMediaUrl(attachment?.thumbnailUrl || attachment?.url || "") }}
                  style={[
                    styles.messageImage,
                    {
                      width: mediaBubbleWidth,
                      height: Math.min(width * 0.48, 176),
                    },
                  ]}
                />
                <View style={[styles.mediaOverlayBadge, isMine ? styles.mediaOverlayBadgeMine : null]}>
                  <Icon name="play" size={13} color="#fff" />
                </View>
                <View style={[styles.mediaTypeBadge, isMine ? styles.mediaTypeBadgeMine : null]}>
                  <Text style={styles.mediaTypeBadgeText}>VIDEO</Text>
                </View>
              </View>
            ) : null}

            {mediaBubbleKind === "voice" ? (
              <VoiceMessageBubble
                audioUrl={attachment?.url || ""}
                durationSeconds={Number(item?.duration || 0)}
                isMine={isMine}
                accentColor={primaryThemeColor}
                label={item?.messageType === "voice" ? "" : getAttachmentDisplayName(item)}
              />
            ) : null}

            {mediaBubbleKind === "document" ? (
              <View style={styles.documentCard}>
                <Icon name="document-text-outline" size={20} color={isMine ? "#fff" : PRIMARY} />
                <Text style={[styles.documentName, isMine && styles.myDocumentName]} numberOfLines={1}>
                  {getAttachmentDisplayName(item)}
                </Text>
              </View>
            ) : null}

            {shouldRenderMessageText && (
              <InteractiveText
                style={[
                  styles.messageText,
                  isMine && styles.myMessageText,
                  isEmojiOnly ? styles.emojiOnlyText : null,
                  {
                    color: bubbleTextColor,
                    fontSize: isEmojiOnly ? Math.max(chatMetrics.bodyFontSize + 8, 22) : chatMetrics.bodyFontSize,
                    lineHeight: isEmojiOnly ? Math.max(chatMetrics.bodyLineHeight + 8, 26) : chatMetrics.bodyLineHeight,
                  },
                ]}
                mentionStyle={[styles.messageMentionText, isMine && styles.myMessageMentionText]}
                onPressMention={isGroupConversation ? openMentionedGroupMember : undefined}
                text={textValue}
                textBreakStrategy="simple"
              >
                {item?.isEdited ? (
                  <Text style={{ fontSize: 11, fontStyle: "italic", opacity: 0.6 }}> edited</Text>
                ) : null}
              </InteractiveText>
            )}

            {!locationPayload && !sharedContent && !callEvent && !scheduledCall && !isMediaBubble && !isEmojiOnly && linkPreview?.url ? (
              <MessageLinkPreview
                preview={linkPreview}
                isMine={isMine}
                onPress={() => {
                  Linking.openURL(String(linkPreview.url)).catch((error) => {
                    console.log("link preview open error:", error);
                  });
                }}
              />
            ) : null}

            {locationPayload ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => handleMessagePress(item, attachment, locationPayload)}
                style={[styles.locationCard, isMine && styles.myLocationCard]}
              >
                <Icon name="location-outline" size={18} color={isMine ? "#fff" : PRIMARY} />
                <View style={styles.locationBody}>
                  <Text style={[styles.locationTitle, isMine && styles.myLocationTitle, { fontSize: chatMetrics.metaFontSize + 1 }]}>
                    {locationPayload.label}
                  </Text>
                  <Text style={[styles.locationLink, isMine && styles.myLocationLink, { fontSize: chatMetrics.metaFontSize }]}>
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
                    <Text style={[styles.reactionText, { color: bubbleTextColor, fontSize: chatMetrics.metaFontSize }]}>
                      {reaction?.emoji} {Array.isArray(reaction?.users) ? reaction.users.length : 0}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            </TouchableOpacity>
            {!callEvent && !scheduledCall ? (
              <View style={[styles.messageMetaRow, isMine ? styles.messageMetaRowMine : styles.messageMetaRowOther]}>
                {!!messageTimeLabel ? (
                  <Text
                    style={[
                      styles.messageMetaText,
                      isMine ? styles.messageMetaTextMine : null,
                      { color: bubbleMetaColor },
                      { fontSize: chatMetrics.metaFontSize },
                    ]}
                  >
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
            ) : null}
          </View>
        </View>
      </Swipeable>
    );
  };

  // ─── Main render ──────────────────────────────────────────────────────────

  const composerBottomPadding = isKeyboardVisible
    ? Math.max(6, Math.min(8, keyboardInset || 8))
    : Math.max(7, insets.bottom - 2);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={["top"]}>
      <StatusBar backgroundColor={chatHeaderTint} barStyle="light-content" />

      <View
        style={[
          styles.header,
          {
            backgroundColor: chatHeaderTint,
            borderBottomColor: alpha(colors.border, "80"),
            paddingTop: 4,
            paddingHorizontal: chatMetrics.listPadding + 2,
            paddingBottom: Math.max(chatMetrics.listPadding - 2, 10),
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.headerActionButton,
            {
              width: compactHeaderActionSize,
              height: compactHeaderActionSize,
              borderRadius: compactHeaderActionSize / 2,
              backgroundColor: alpha("#FFFFFF", "1F"),
              borderColor: alpha("#FFFFFF", "22"),
            },
          ]}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-back" size={20} color={headerIconColor} />
        </TouchableOpacity>

        {isGroupConversation ? (
          <TouchableOpacity
            style={styles.userInfo}
            activeOpacity={0.8}
            onPress={() => navigation.navigate("GroupDetailsScreen", {
              conversationId: currentConversationId,
              conversationSnapshot: groupConversation || {
                _id: currentConversationId,
                groupName: groupMeta.groupName,
                groupAvatar: groupMeta.groupAvatar,
                memberCount: groupMeta.memberCount,
              },
            })}
          >
            {groupMeta.groupAvatar ? (
              <Image
                source={{
                  uri: groupMeta.groupAvatar
                }}
                style={[styles.avatar, { width: chatMetrics.headerAvatar, height: chatMetrics.headerAvatar, borderRadius: chatMetrics.headerAvatar / 2, marginRight: chatMetrics.listPadding }]}
              />
            ) : (
              <View style={[styles.groupAvatar, { width: chatMetrics.headerAvatar, height: chatMetrics.headerAvatar, borderRadius: chatMetrics.headerAvatar / 2, marginRight: chatMetrics.listPadding }]}>
                <Icon name="people-outline" size={20} color="#fff" />
              </View>
            )}

            <View style={styles.headerTextBlock}>
              <Text style={[styles.username, { fontSize: compactHeaderTitleSize }]} numberOfLines={1} ellipsizeMode="tail">
                {groupMeta.groupName || "Group chat"}
              </Text>
              <View style={styles.statusRow}>
                <View style={[styles.presenceDot, { backgroundColor: typingUserId ? "#22C55E" : "#7C869D" }]} />
                <Text style={[styles.status, { color: headerStatusColor, fontSize: compactHeaderStatusSize }]} numberOfLines={1} ellipsizeMode="tail">
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
              style={[styles.avatar, { width: chatMetrics.headerAvatar, height: chatMetrics.headerAvatar, borderRadius: chatMetrics.headerAvatar / 2, marginRight: chatMetrics.listPadding }]}
            />

            <View style={styles.headerTextBlock}>
              <Text style={[styles.username, { fontSize: compactHeaderTitleSize }]} numberOfLines={1} ellipsizeMode="tail">
                {user?.username || user?.name || "Loading..."}
              </Text>
              <View style={styles.statusRow}>
                <View style={[styles.presenceDot, { backgroundColor: isDirectActive ? "#22C55E" : "#F59E0B" }]} />
                <Text style={[styles.status, { color: headerStatusColor, fontSize: compactHeaderStatusSize }]} numberOfLines={1} ellipsizeMode="tail">{directPresenceText}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        <View
          style={[
            styles.headerIcons,
            {
              backgroundColor: alpha("#FFFFFF", "10"),
              borderColor: alpha("#FFFFFF", "16"),
            },
          ]}
        >
          {isGroupConversation ? (
            <>
              <TouchableOpacity
                style={[styles.headerActionButton, styles.headerActionButtonGrouped]}
                onPress={() => startCallFlow("audio")}
              >
                <Icon name="call-outline" size={19} color={headerIconColor} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.headerActionButton, styles.headerActionButtonGrouped]}
                onPress={() => startCallFlow("video")}
              >
                <Icon name="videocam-outline" size={20} color={headerIconColor} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.headerActionButton, styles.headerActionButtonGrouped]}
                onPress={() => setShowAssistant(true)}
              >
                <Icon name="sparkles-outline" size={19} color={headerIconColor} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.headerActionButton, styles.headerActionButtonGrouped]}
                onPress={() => navigation.navigate("GroupDetailsScreen", {
                  conversationId: currentConversationId,
                  conversationSnapshot: groupConversation || {
                    _id: currentConversationId,
                    groupName: groupMeta.groupName,
                    groupAvatar: groupMeta.groupAvatar,
                    memberCount: groupMeta.memberCount,
                  },
                })}
              >
                <Icon name="ellipsis-horizontal" size={20} color={headerIconColor} />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.headerActionButton, styles.headerActionButtonGrouped]}
                onPress={() => startCallFlow("audio")}
              >
                <Icon name="call-outline" size={19} color={headerIconColor} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.headerActionButton, styles.headerActionButtonGrouped]}
                onPress={() => startCallFlow("video")}
              >
                <Icon name="videocam-outline" size={20} color={headerIconColor} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.headerActionButton, styles.headerActionButtonGrouped]}
                onPress={() => setShowAssistant(true)}
              >
                <Icon name="sparkles-outline" size={19} color={headerIconColor} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.headerActionButton, styles.headerActionButtonGrouped]}
                onPress={() => navigation.navigate("ChatDetailsScreen", { userId, conversationId: currentConversationId })}
              >
                <Icon name="ellipsis-horizontal" size={20} color={headerIconColor} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {!isGroupConversation && conversationListing?.serviceName ? (
        <View
          style={[
            styles.listingBanner,
            {
              backgroundColor: colors.card,
              borderBottomColor: colors.border,
              borderColor: alpha(colors.border, "96"),
              marginHorizontal: chatMetrics.listPadding,
            },
          ]}
        >
          <View style={[styles.listingBannerIcon, { backgroundColor: alpha(colors.primary, "14") }]}>
            <Icon name="briefcase-outline" size={15} color={colors.primary} />
          </View>
          <Text style={[styles.listingBannerText, { color: colors.text, fontSize: chatMetrics.metaFontSize + 1 }]} numberOfLines={1}>
            {conversationListing.sellerName
              ? `${conversationListing.sellerName} • ${conversationListing.serviceName}`
              : conversationListing.serviceName}
          </Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flexFill}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        enabled
        keyboardVerticalOffset={0}
      >
        <View style={[styles.chatBackground, { backgroundColor: colors.surface }]}>
          <Image
            source={chatWallpaper ? { uri: normalizeMediaUrl(chatWallpaper) } : DEFAULT_CHAT_WALLPAPER}
            style={[styles.wallpaperBackground, !chatWallpaper && styles.defaultWallpaperBackground]}
            resizeMode="cover"
          />
          <FlatList
            ref={messageListRef}
            data={messages}
            keyExtractor={(item) => getMessageRenderKey(item)}
            renderItem={renderMessage}
            onScrollToIndexFailed={handleScrollToIndexFailed}
            contentContainerStyle={[styles.listContent, { paddingHorizontal: Math.max(8, chatMetrics.listPadding - 3), paddingTop: chatMetrics.listPadding, paddingBottom: Math.max(20, 12 + insets.bottom) }]}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={Platform.OS === "android"}
            initialNumToRender={18}
            maxToRenderPerBatch={12}
            windowSize={7}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
              if (!initialLatestScrollDoneRef.current && messages.length) {
                initialLatestScrollDoneRef.current = true;
                scrollToLatestMessage(false);
              }
            }}
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
                    <Text style={[styles.loadEarlierText, { fontSize: chatMetrics.metaFontSize + 1 }]}>Load earlier messages</Text>
                  )}
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={
              loading ? null : (
                <View style={styles.emptyWrap}>
                  <View style={[styles.emptyIconWrap, { backgroundColor: alpha(primaryThemeColor, "14") }]}>
                    <Icon name="chatbubble-ellipses-outline" size={24} color={primaryThemeColor} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: colors.text, fontSize: chatMetrics.sectionTitleFontSize + 1 }]}>
                    {errorMessage ? "Conversation unavailable" : "No messages yet"}
                  </Text>
                  <Text style={[styles.emptyText, { color: colors.mutedText, fontSize: chatMetrics.bodyFontSize - 1, lineHeight: chatMetrics.bodyLineHeight }]}>
                    {errorMessage || "Say hello, share media, or use quick tools below to start this conversation."}
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

        <DraggableBottomSheet
          visible={showLocationComposer}
          onClose={() => {
            if (!uploading && !locatingCurrentPosition) {
              setShowLocationComposer(false);
              setLocationDraft("");
            }
          }}
          snapPoints={[0.62, 0.78, 0.9]}
          initialSnapIndex={0}
          minHeight={460}
        >
          <View style={styles.locationComposerSheet}>
              <Text style={styles.locationComposerTitle}>Share location</Text>
              <Text style={styles.locationComposerText}>
                Pick current location, choose a nearby place, or type any address. We will send a Maps link in chat.
              </Text>
              <View style={styles.locationQuickActions}>
                <TouchableOpacity
                  style={styles.locationQuickAction}
                  onPress={useCurrentLocation}
                  disabled={uploading || locatingCurrentPosition}
                >
                  <Icon name="navigate-outline" size={16} color="#fff" />
                  <Text style={styles.locationQuickActionText}>
                    {locatingCurrentPosition ? "Detecting..." : "Current"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.locationQuickAction}
                  onPress={() => setLocationDraft("Nearby places")}
                  disabled={uploading}
                >
                  <Icon name="map-outline" size={16} color="#fff" />
                  <Text style={styles.locationQuickActionText}>Nearby</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.locationQuickAction}
                  onPress={() => setLocationDraft("")}
                  disabled={uploading}
                >
                  <Icon name="create-outline" size={16} color="#fff" />
                  <Text style={styles.locationQuickActionText}>Manual</Text>
                </TouchableOpacity>
              </View>
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
        </DraggableBottomSheet>

        <Modal visible={showScheduleCallComposer} transparent animationType="fade">
          <View style={styles.locationComposerOverlay}>
            <View style={styles.locationComposerCard}>
              <Text style={styles.locationComposerTitle}>Schedule call</Text>
              <Text style={styles.locationComposerText}>
                Pick a time and we will drop a calendar invite right inside this chat.
              </Text>

              <View style={styles.scheduleTypeRow}>
                {(["audio", "video"] as Array<"audio" | "video">).map((typeOption) => {
                  const isActive = scheduleCallType === typeOption;
                  return (
                    <TouchableOpacity
                      key={typeOption}
                      style={[
                        styles.scheduleTypeChip,
                        isActive ? styles.scheduleTypeChipActive : null,
                      ]}
                      onPress={() => setScheduleCallType(typeOption)}
                    >
                      <Icon
                        name={typeOption === "video" ? "videocam-outline" : "call-outline"}
                        size={16}
                        color={isActive ? "#FFFFFF" : "#111111"}
                      />
                      <Text
                        style={[
                          styles.scheduleTypeChipText,
                          isActive ? styles.scheduleTypeChipTextActive : null,
                        ]}
                      >
                        {typeOption === "video" ? "Video" : "Audio"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TextInput
                style={styles.locationComposerInput}
                value={scheduleCallDateTime}
                onChangeText={setScheduleCallDateTime}
                placeholder="2026-04-27T18:30"
                placeholderTextColor="#888"
                editable={!uploading}
                autoCapitalize="none"
              />
              <TextInput
                style={styles.locationComposerInput}
                value={scheduleCallDurationMinutes}
                onChangeText={setScheduleCallDurationMinutes}
                placeholder="Duration in minutes"
                placeholderTextColor="#888"
                editable={!uploading}
                keyboardType="number-pad"
              />
              <TextInput
                style={[styles.locationComposerInput, styles.scheduleAgendaInput]}
                value={scheduleCallAgenda}
                onChangeText={setScheduleCallAgenda}
                placeholder="Agenda or note"
                placeholderTextColor="#888"
                editable={!uploading}
                multiline
              />

              <View style={styles.locationComposerActions}>
                <TouchableOpacity
                  style={styles.locationSecondaryButton}
                  onPress={resetScheduleCallComposer}
                  disabled={uploading}
                >
                  <Text style={styles.locationSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.locationPrimaryButton}
                  onPress={sendScheduledCallMessage}
                  disabled={uploading}
                >
                  {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.locationPrimaryText}>Share invite</Text>}
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
            const stickerSendKey = [
              String(currentConversationId || userId || "").trim(),
              String(sticker?._id || "").trim(),
              String(sticker?.type || "").trim(),
              String(sticker?.emoji || "").trim(),
              normalizeMediaUrl(sticker?.imageUrl || ""),
            ].join("::");
            const now = Date.now();
            if (
              stickerSendLockRef.current
              || (
                stickerSendKey
                && recentStickerSendRef.current.key === stickerSendKey
                && now - recentStickerSendRef.current.timestamp < 12000
              )
            ) {
              return;
            }

            try {
              setShowStickerPicker(false);
              stickerSendLockRef.current = true;
              recentStickerSendRef.current = { key: stickerSendKey, timestamp: now };
              if (stickerSendUnlockTimeoutRef.current) {
                clearTimeout(stickerSendUnlockTimeoutRef.current);
              }
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
              if (recentStickerSendRef.current.key === stickerSendKey) {
                recentStickerSendRef.current = { key: "", timestamp: 0 };
              }
            } finally {
              stickerSendUnlockTimeoutRef.current = setTimeout(() => {
                stickerSendLockRef.current = false;
              }, 12000);
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
                getMessageIdentity(msg) === String(data.messageId)
                  ? { ...msg, text: data.text, isEdited: true, editedAt: data.editedAt }
                  : msg
              )
            );
          }}
          onMessageDeleted={(messageId: string) => {
            setMessages((prev) => prev.filter((msg) => getMessageIdentity(msg) !== String(messageId)));
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

        <View
          style={[
            styles.inputContainer,
            {
              backgroundColor: alpha(colors.background, "FA"),
              borderColor: alpha(colors.border, "70"),
              paddingTop: 6,
              paddingBottom: composerBottomPadding,
              paddingHorizontal: Math.max(8, chatMetrics.listPadding - 2),
            },
          ]}
        >
          {!hideChannelComposer ? (
            <TouchableOpacity
              style={[
                styles.composerActionButton,
                {
                  backgroundColor: alpha(colors.surface, "C8"),
                  borderColor: alpha(colors.border, "78"),
                  width: Math.max(34, chatMetrics.headerAction - 2),
                  height: Math.max(34, chatMetrics.headerAction - 2),
                  borderRadius: Math.max(34, chatMetrics.headerAction - 2) / 2,
                },
              ]}
              onPress={() => setShowTools(true)}
              disabled={uploading || !canComposeGroupMessage}
            >
              <Icon name="add" size={20} color={colors.primary} />
            </TouchableOpacity>
          ) : null}

          <View style={[styles.inputBox, { backgroundColor: alpha(colors.surface, "D8"), borderColor: alpha(colors.border, "7A") }]}>
            {replyingToPreview ? (
              <View style={[styles.composerReplyCard, { borderColor: alpha(colors.border, "74"), backgroundColor: alpha(colors.background, "F2"), borderRadius: chatMetrics.bubbleRadius - 4 }]}>
                <View style={[styles.composerReplyAccent, { backgroundColor: primaryThemeColor }]} />
                <View style={styles.composerReplyBody}>
                  <Text style={[styles.composerReplyLabel, { color: colors.text, fontSize: chatMetrics.metaFontSize + 1 }]} numberOfLines={1}>
                    Replying to {replyingToPreview.author}
                  </Text>
                  <Text style={[styles.composerReplySnippet, { color: colors.mutedText, fontSize: chatMetrics.metaFontSize }]} numberOfLines={1}>
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
                      {pendingAttachments.length > 1
                        ? `${pendingAttachments.length} attachments ready to send`
                        : pendingAttachment.kind === "image" ? "Image ready to send" : "Video ready to send"}
                    </Text>
                    <Text style={[styles.attachmentPreviewSubtitle, { color: colors.mutedText }]} numberOfLines={1}>
                      {pendingAttachments.length > 1 ? "Each attachment will be prepared before sending." : pendingAttachment.name}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setPendingAttachments([])}
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
            {groupComposeLockedText ? (
              <View style={[styles.composerNotice, { backgroundColor: alpha(colors.primary, "12"), borderColor: alpha(colors.primary, "36") }]}>
                <Icon name="megaphone-outline" size={14} color={colors.primary} />
                <Text style={[styles.composerNoticeText, { color: colors.text }]}>
                  {groupComposeLockedText}
                </Text>
              </View>
            ) : null}
            {!hideChannelComposer ? (
              <MentionSuggestionList
                visible={activeGroupMentionQuery !== null}
                candidates={visibleGroupMentionCandidates}
                onSelect={(candidate) => {
                  setText((current) => insertMentionAtCursorEnd(current, candidate.username));
                }}
              />
            ) : null}
            {!hideChannelComposer ? (
              <View style={styles.composerRow}>
                <TextInput
                  ref={messageInputRef}
                  placeholder={groupComposeLockedText ? "Only admins can message" : uploading ? "Uploading attachment..." : pendingAttachment ? "Add a caption (optional)" : pendingVoiceNote ? "Voice note ready to send" : "Message"}
                  placeholderTextColor={colors.placeholder}
                  style={[styles.input, { color: colors.text, fontSize: chatMetrics.bodyFontSize, lineHeight: chatMetrics.bodyLineHeight, minHeight: chatMetrics.headerAction }]}
                  value={text}
                  onChangeText={handleTextChange}
                  multiline
                  blurOnSubmit={false}
                  textAlignVertical="center"
                  onFocus={() => {
                    setTimeout(() => scrollToLatestMessage(false), 80);
                  }}
                  editable={!sending && !textSendLockRef.current && !uploading && canComposeGroupMessage}
                />

                <View style={styles.inlineActions}>
                  <TouchableOpacity
                    style={[styles.inlineActionIcon, styles.gifActionPill]}
                    onPress={() => {
                      setStickerPickerMode("gifs");
                      setShowStickerPicker(true);
                    }}
                    disabled={uploading || !canComposeGroupMessage}
                  >
                    <Text style={styles.gifActionText}>GIF</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.inlineActionIcon}
                    onPress={() => {
                      setStickerPickerMode("emoji");
                      setShowStickerPicker(true);
                    }}
                    disabled={uploading || !canComposeGroupMessage}
                  >
                    <Icon name="happy-outline" size={19} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.inlineActionIcon}
                    onPress={() => {
                      sendCameraAttachment().catch(() => {});
                    }}
                    disabled={uploading || !canComposeGroupMessage}
                  >
                    <Icon name="camera-outline" size={18} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>

          {!hideChannelComposer ? (
            <View style={styles.composerTrailingAction}>
              {uploading ? (
                <ActivityIndicator color={colors.primary} />
              ) : text.length > 0 || pendingAttachment || pendingVoiceNote ? (
                <TouchableOpacity
                  style={[styles.sendBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    if (pendingAttachment) {
                      runComposerSendAction(sendPendingAttachment);
                      return;
                    }

                    if (pendingVoiceNote) {
                      runComposerSendAction(sendPendingVoiceMessage);
                      return;
                    }

                    if (textSendLockRef.current || sending || composerSendPressLockRef.current) {
                      return;
                    }

                    runComposerSendAction(sendTextMessage);
                  }}
                  disabled={sending || textSendLockRef.current || uploading || !canComposeGroupMessage}
                >
                  <Icon name="send" size={20} color="#fff" />
                </TouchableOpacity>
              ) : (
                <VoiceRecorderButton
                  color={primaryThemeColor}
                  disabled={uploading || !canComposeGroupMessage}
                  onSend={(voiceFile) => {
                    sendVoiceMessage(voiceFile).catch(() => {});
                  }}
                />
              )}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>

      {isConversationLockedState ? (
        <View style={styles.lockedChatOverlay}>
          <View style={[styles.lockedChatCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Icon name="lock-closed-outline" size={26} color={colors.primary} />
            <Text style={[styles.lockedChatTitle, { color: colors.text }]}>Chat locked</Text>
            <Text style={[styles.lockedChatText, { color: colors.mutedText }]}>
              This conversation is locked. Enter your passcode to open messages.
            </Text>
            <TouchableOpacity
              style={[styles.lockedChatButton, { backgroundColor: colors.primary }]}
              onPress={async () => {
                const hasPasscode = await hasChatLockPasscode();
                setChatLockMode(hasPasscode ? "unlock" : "setup");
                setChatLockModalVisible(true);
              }}
            >
              <Text style={styles.lockedChatButtonText}>Unlock chat</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <ChatLockModal
        visible={chatLockModalVisible}
        mode={chatLockMode}
        busy={lockingBusy}
        onClose={() => setChatLockModalVisible(false)}
        onSubmit={submitChatLockPasscode}
      />
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
  lockedChatOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
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
    fontSize: 20,
    fontWeight: "800",
  },
  lockedChatText: {
    marginTop: 8,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: "center",
  },
  lockedChatButton: {
    marginTop: 16,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  lockedChatButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  flexFill: {
    flex: 1,
  },
  chatHeroPanel: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 8,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 13,
    ...appShadows.card,
  },
  chatHeroContent: {
    paddingRight: 4,
  },
  chatHeroEyebrow: {
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    fontFamily: appFonts.bold,
  },
  chatHeroTitle: {
    marginTop: 4,
    fontSize: 18,
    lineHeight: 22,
    fontFamily: appFonts.bold,
  },
  chatHeroText: {
    marginTop: 7,
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: appFonts.regular,
  },
  chatHeroMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
  },
  chatHeroMetaChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  chatHeroMetaText: {
    marginLeft: 6,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appFonts.semibold,
  },
  listingBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderRadius: 18,
  },
  listingBannerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  listingBannerText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
    flex: 1,
    minWidth: 0,
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    paddingRight: 4,
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
    fontFamily: appFonts.bold,
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
    fontSize: 12.5,
    fontFamily: appFonts.medium,
    flexShrink: 1,
  },
  headerIcons: {
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
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  headerActionButtonGrouped: {
    marginLeft: 0,
    marginRight: 2,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  chatBackground: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  wallpaperBackground: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.16,
  },
  defaultWallpaperBackground: {
    opacity: 0.5,
  },
  listContent: {
    padding: 14,
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
    fontFamily: appFonts.semibold,
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingTop: 72,
  },
  emptyIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: appFonts.bold,
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
    marginVertical: 1.5,
    alignItems: "flex-end",
  },
  systemMessageRow: {
    width: "100%",
    alignItems: "center",
    marginVertical: 8,
    paddingHorizontal: 20,
  },
  systemMessagePill: {
    maxWidth: "92%",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  systemMessageText: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 17,
    fontFamily: appFonts.medium,
  },
  systemMessageTime: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: appFonts.regular,
  },
  groupSenderAvatarWrap: {
    marginRight: 8,
    alignSelf: "flex-start",
    marginTop: 16,
  },
  groupSenderAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  messageContentColumn: {
    minWidth: 0,
    flexShrink: 1,
  },
  messageContentColumnMine: {
    alignItems: "flex-end",
  },
  messageContentColumnOther: {
    alignItems: "flex-start",
  },
  groupMessageColumn: {
    maxWidth: "100%",
    flexShrink: 1,
    minWidth: 0,
  },
  groupSenderName: {
    marginBottom: 4,
    marginLeft: 4,
    fontSize: 11.5,
    fontFamily: appFonts.semibold,
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
    fontFamily: appFonts.semibold,
  },
  messageBubble: {
    padding: 7,
    borderRadius: 16,
    width: 250,
    maxWidth: "100%",
    minWidth: 0,
    flexShrink: 0,
    flexGrow: 0,
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  messageBubbleMineAligned: {
    alignSelf: "flex-end",
  },
  messageBubbleOtherAligned: {
    alignSelf: "flex-start",
  },
  mediaMessageBubble: {
    padding: 3,
    borderRadius: 16,
    maxWidth: "62%",
    borderWidth: 1,
    overflow: "hidden",
  },
  mediaMessageBubbleMine: {
    shadowOpacity: 0,
    elevation: 0,
  },
  mediaMessageBubbleOther: {
    shadowOpacity: 0,
    elevation: 0,
  },
  emojiOnlyBubble: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0,
    elevation: 0,
  },
  callEventBubbleShell: {
    maxWidth: "62%",
    minWidth: 152,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    shadowOpacity: 0,
    elevation: 0,
  },
  callEventBubbleMine: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  callEventBubbleOther: {},
  myMessageBubbleTail: {
    borderTopRightRadius: 6,
    borderBottomRightRadius: 4,
  },
  otherMessageBubbleTail: {
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 4,
  },
  groupMessageBubble: {
    maxWidth: "100%",
  },
  messageBubbleWide: {
    minWidth: 0,
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
    alignSelf: "flex-start",
    marginBottom: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: "rgba(123, 63, 228, 0.1)",
    maxWidth: "96%",
    minWidth: '100%',
  },
  replyPreviewCardMine: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  replyPreviewCardMineAligned: {
    alignSelf: "flex-end",
  },
  replyPreviewCardOtherAligned: {
    alignSelf: "flex-start",
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
    flexShrink: 1,
    minWidth: 0,
    maxWidth: 196,
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
    color: "#475467",
    fontSize: 12,
    flexShrink: 1,
  },
  replyPreviewSnippetMine: {
    color: "rgba(255,255,255,0.82)",
  },
  sharedPostCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
    padding: 10,
    marginBottom: 6,
    backgroundColor: "rgba(15,23,42,0.22)",
    maxWidth: "100%",
    minWidth: 0,
    overflow: "hidden",
  },
  sharedPostCardMine: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.16)",
  },
  sharedPostHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  sharedPostAvatarFallback: {
    fontSize: 12,
    fontWeight: "800",
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
    fontFamily: appFonts.semibold,
  },
  sharedPostAuthorMine: {
    color: "#fff",
  },
  sharedPostLabel: {
    marginTop: 1,
    color: "#667085",
    fontSize: 11,
    fontFamily: appFonts.medium,
  },
  sharedPostLabelMine: {
    color: "rgba(255,255,255,0.78)",
  },
  sharedPostImage: {
    width: "100%",
    height: 126,
    borderRadius: 12,
    marginTop: 8,
  },
  sharedPostCaption: {
    marginTop: 8,
    color: "#344054",
    fontSize: 12.5,
    lineHeight: 17,
  },
  sharedStoryReplyText: {
    fontFamily: appFonts.semibold,
  },
  sharedPostCaptionMine: {
    color: "rgba(255,255,255,0.92)",
  },
  callEventCard: {
    width: "auto",
    minWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginBottom: 0,
    backgroundColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  callEventCardMine: {
    backgroundColor: "transparent",
  },
  callEventIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(123, 63, 228, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  callEventIconMine: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  callEventBody: {
    flexShrink: 1,
    minWidth: 0,
  },
  callEventTitle: {
    color: "#111827",
    fontSize: 11.5,
    fontFamily: appFonts.semibold,
    lineHeight: 16,
  },
  callEventTitleMine: {
    color: "#fff",
  },
  callEventMeta: {
    marginTop: 2,
    color: "#667085",
    fontSize: 10.5,
    lineHeight: 14,
  },
  callEventMetaMine: {
    color: "rgba(255,255,255,0.82)",
  },
  scheduledCallMetaRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  scheduledCallPrimaryMeta: {
    marginTop: 0,
    flexShrink: 1,
  },
  scheduledCallDurationBadge: {
    minWidth: 52,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(17,17,17,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  scheduledCallDurationBadgeMine: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  scheduledCallDurationBadgeText: {
    color: "#111111",
    fontFamily: appFonts.semibold,
  },
  scheduledCallDurationBadgeTextMine: {
    color: "#FFFFFF",
  },
  callEventLink: {
    marginTop: 6,
    color: "#111827",
    fontFamily: appFonts.semibold,
  },
  callEventLinkMine: {
    color: "#FFFFFF",
  },
  messageText: {
    fontSize: 15,
    color: "#111",
    fontFamily: appFonts.regular,
    flexShrink: 1,
  },
  emojiOnlyText: {
    textAlign: "center",
    letterSpacing: 0,
  },
  myMessageText: {
    color: "#fff"
  },
  messageMentionText: {
    color: "#2563eb",
    fontFamily: appFonts.semibold,
  },
  myMessageMentionText: {
    color: "#ffffff",
    textDecorationLine: "underline",
  },
  myMessage: {
    backgroundColor: PRIMARY
  },
  otherMessage: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.08)",
  },
  messageImage: {
    width: 176,
    height: 176,
    maxWidth: "100%",
    borderRadius: 14,
  },
  mediaCard: {
    position: "relative",
    borderRadius: 18,
    overflow: "hidden",
  },
  gifMediaCard: {
    padding: 4,
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.32)",
    backgroundColor: "rgba(15,23,42,0.34)",
  },
  mediaOverlayBadge: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.72)",
  },
  mediaOverlayBadgeMine: {
    backgroundColor: "rgba(255,255,255,0.24)",
  },
  mediaTypeBadge: {
    position: "absolute",
    left: 10,
    bottom: 10,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(15,23,42,0.72)",
  },
  mediaTypeBadgeMine: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  mediaTypeBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: appFonts.bold,
    letterSpacing: 0.4,
  },
  documentCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
    marginBottom: 2
  },
  documentName: {
    marginLeft: 8,
    color: PRIMARY,
    fontFamily: appFonts.semibold,
    maxWidth: 180,
    flexShrink: 1,
  },
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    borderRadius: 14,
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
    marginTop: 5
  },
  reactionChip: {
    backgroundColor: "rgba(15,23,42,0.08)",
    borderRadius: 999,
    marginRight: 5,
    marginTop: 3,
    paddingHorizontal: 7,
    paddingVertical: 2
  },
  myReactionChip: {
    backgroundColor: "rgba(255,255,255,0.18)"
  },
  reactionText: {
    color: "#1f1f1f",
    fontSize: 11,
    fontWeight: "600"
  },
  messageMetaRow: {
    marginTop: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 2,
  },
  messageMetaRowMine: {
    justifyContent: "flex-end",
  },
  messageMetaRowOther: {
    justifyContent: "flex-start",
    paddingLeft: 2,
  },
  messageMetaText: {
    color: "#667085",
    fontSize: 10.5,
    fontFamily: appFonts.medium,
  },
  messageMetaTextMine: {
    color: "rgba(255,255,255,0.78)",
    marginRight: 6,
  },
  messageStatusPill: {
    alignSelf: "flex-end",
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: "rgba(15,23,42,0.14)",
  },
  messageStatusPillSeen: {
    backgroundColor: "rgba(15,23,42,0.22)",
  },
  myDocumentName: {
    color: "#fff"
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingTop: 6,
    backgroundColor: "#121C2F",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
    elevation: 6,
  },
  composerActionButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  inputBox: {
    flex: 1,
    backgroundColor: "#17243A",
    borderRadius: 22,
    marginHorizontal: 8,
    paddingHorizontal: 11,
    paddingTop: 5,
    paddingBottom: 5,
    borderWidth: 1,
    minHeight: 42,
  },
  composerReplyCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 5,
  },
  composerNotice: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  composerNoticeText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: appFonts.medium,
  },
  composerReplyAccent: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 999,
    marginRight: 8,
  },
  composerReplyBody: {
    flex: 1,
    minWidth: 0,
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
  composerRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 32,
  },
  input: {
    flex: 1,
    minHeight: 32,
    maxHeight: 96,
    paddingTop: 3,
    paddingBottom: 3,
    paddingRight: 2,
    fontSize: 14,
    fontFamily: appFonts.regular,
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
    marginBottom: 0,
    gap: 4,
  },
  inlineActionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(123,63,228,0.08)",
  },
  composerTrailingAction: {
    minWidth: 42,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0,
    marginLeft: 0,
    position: "relative",
  },
  gifActionPill: {
    width: "auto",
    minWidth: 34,
    paddingHorizontal: 7,
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
  locationComposerSheet: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 18,
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
  locationQuickActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  locationQuickAction: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  locationQuickActionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  scheduleTypeRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  scheduleTypeChip: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D4D4D4",
    backgroundColor: "#F5F5F5",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  scheduleTypeChipActive: {
    backgroundColor: "#111111",
    borderColor: "#111111",
  },
  scheduleTypeChipText: {
    color: "#111111",
    fontWeight: "700",
  },
  scheduleTypeChipTextActive: {
    color: "#FFFFFF",
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
  scheduleAgendaInput: {
    minHeight: 84,
    height: 84,
    paddingTop: 12,
    textAlignVertical: "top",
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
