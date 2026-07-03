import { PermissionsAndroid, Platform } from "react-native";
import { API } from "../api/api";
import { getStoredUserId } from "./authSession";
import { startCallRingtone } from "./callAudio";
import { getMutedConversationIds } from "./chatMute";
import { openPostInFeed } from "./socialNavigation";

let Notifications: any = null;
let Device: any = null;
let FirebaseMessaging: any = null;
let lastHandledNotificationResponseId = "";

const CALL_NOTIFICATION_CHANNEL_ID = "calls_v3";

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

try {
  Notifications = require("expo-notifications");
} catch {
  Notifications = null;
}

try {
  Device = require("expo-device");
} catch {
  Device = null;
}

try {
  FirebaseMessaging = require("@react-native-firebase/messaging").default;
} catch {
  FirebaseMessaging = null;
}

const getMessaging = () => (typeof FirebaseMessaging === "function" ? FirebaseMessaging() : null);

const resolveNavigation = (navigationRef?: any) => {
  if (!navigationRef) {
    return null;
  }

  return navigationRef.current || navigationRef;
};

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android" || !Notifications) {
    return;
  }

  try {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance?.MAX ?? 4,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
    });

    await Notifications.setNotificationChannelAsync("chat", {
      name: "Chat Messages",
      importance: Notifications.AndroidImportance?.MAX ?? 4,
      vibrationPattern: [0, 150, 100, 150],
      sound: "default",
    });

    await Notifications.setNotificationChannelAsync("calls_v2", {
      name: "Calls",
      importance: Notifications.AndroidImportance?.MAX ?? 4,
      vibrationPattern: [0, 250, 150, 250, 150, 250],
      sound: null,
    });

    await Notifications.setNotificationChannelAsync(CALL_NOTIFICATION_CHANNEL_ID, {
      name: "Calls",
      importance: Notifications.AndroidImportance?.MAX ?? 4,
      vibrationPattern: [0, 300, 160, 300, 160, 300],
      sound: "call_ringing.mp3",
    });

    await Notifications.setNotificationChannelAsync("social", {
      name: "Social Updates",
      importance: Notifications.AndroidImportance?.HIGH ?? 4,
      sound: "default",
    });
  } catch (error) {
    console.log("[Push] Android channel setup error:", error);
  }
}

function buildSoftDeviceKey() {
  const parts = [
    Platform.OS,
    String(Device?.brand || "").trim(),
    String(Device?.modelName || "").trim(),
    String(Device?.deviceName || "").trim(),
  ].filter(Boolean);

  return parts.join(":").slice(0, 160);
}

function getPushDeviceInfo() {
  return {
    deviceKey: buildSoftDeviceKey(),
    deviceName: String(Device?.deviceName || "").trim(),
    deviceModel: String(Device?.modelName || Device?.designName || "").trim(),
    osVersion: String(Device?.osVersion || Platform.Version || "").trim(),
  };
}

async function logBackendPushDevices(context: string) {
  try {
    const response = await API.get("/user/push-devices");
    console.log(`[Push] Backend device snapshot after ${context}:`, response?.data?.devices || []);
  } catch (error) {
    console.log(`[Push] Failed to load backend device snapshot after ${context}:`, error);
  }
}

async function syncPushTokenToBackend(token: string | null | undefined) {
  const normalizedToken = String(token || "").trim();

  if (!normalizedToken) {
    return null;
  }

  const pushDeviceInfo = getPushDeviceInfo();
  console.log("[Push] Syncing token to backend", {
    token: normalizedToken,
    platform: Platform.OS,
    ...pushDeviceInfo,
  });

  await API.put("/user/profile", {
    fcmToken: normalizedToken,
    pushPlatform: Platform.OS,
    pushDeviceInfo,
  });

  await logBackendPushDevices("token sync");

  return normalizedToken;
}

function navigateFromNotificationData(data: any, navigationRef?: any) {
  const navigation = resolveNavigation(navigationRef);

  if (!data || !navigation?.navigate) {
    return;
  }

  switch (String(data.type || "").trim()) {
    case "like":
    case "comment":
    case "comment_reply":
    case "mention_post":
    case "tag_post":
    case "post_share":
      if (data.postId) {
        openPostInFeed(navigation, { postId: data.postId });
      }
      break;

    case "follow":
      if (data.senderId) {
        navigation.navigate("ProfileView", { userId: data.senderId });
      }
      break;

    case "story_view":
    case "story_reply":
    case "mention_story":
    case "tag_story":
      if (data.storyId) {
        navigation.navigate("StoryViewer", { storyId: data.storyId });
      }
      break;

    case "service_request":
    case "service_request_update":
      navigation.navigate("ServiceRequestsScreen", { mode: "seller" });
      break;

    case "live_stream_started":
      if (data.liveStreamId) {
        navigation.navigate("LiveStreamScreen", { liveStreamId: data.liveStreamId, mode: "viewer" });
      } else {
        navigation.navigate("LiveStreamsScreen");
      }
      break;

    case "chat_message":
      if (data.conversationId) {
        navigation.navigate("ChatScreen", { conversationId: data.conversationId, conversationType: data.conversationType });
      } else {
        navigation.navigate("AllChatsScreen");
      }
      break;

    case "group_join":
    case "group_leave":
    case "group_member_added":
    case "group_member_removed":
    case "group_admin_promoted":
    case "group_admin_demoted":
    case "group_owner_transferred":
    case "group_updated":
    case "group_deleted":
      if (data.conversationId) {
        navigation.navigate("ChatScreen", { conversationId: data.conversationId, conversationType: "group" });
      } else {
        navigation.navigate("AllChatsScreen");
      }
      break;

    case "incoming_call":
      if (data.callSessionId) {
        const currentRoute = typeof navigation.getCurrentRoute === "function"
          ? navigation.getCurrentRoute()
          : null;

        if (
          currentRoute?.name === "CallScreen"
          && String(currentRoute?.params?.callSessionId || "") === String(data.callSessionId || "")
        ) {
          return;
        }

        startCallRingtone().catch((error) => {
          console.log("[Push] Incoming call ringtone start error:", error);
        });
        navigation.navigate("CallScreen", {
          callSessionId: data.callSessionId,
          mode: "incoming",
          callType: data.callType || "audio",
          title: safeDecode(String(data.title || "")) || "Incoming call",
          avatarUrl: data.avatarUrl || "",
        });
      } else {
        navigation.navigate("AllChatsScreen");
      }
      break;

    default:
      navigation.navigate("NotificationScreen");
      break;
  }
}

function getResponseId(response: any) {
  return String(
    response?.notification?.request?.identifier
      || response?.notification?.request?.content?.data?.notificationId
      || response?.messageId
      || response?.data?.notificationId
      || ""
  ).trim();
}

async function handleNotificationResponse(response: any, navigationRef?: any) {
  const responseId = getResponseId(response);

  if (responseId && responseId === lastHandledNotificationResponseId) {
    return;
  }

  if (responseId) {
    lastHandledNotificationResponseId = responseId;
  }

  const data =
    response?.notification?.request?.content?.data
      || response?.data
      || response?.notification?.data
      || {};

  navigateFromNotificationData(data, navigationRef);
}

async function showForegroundNotification(remoteMessage: any) {
  if (!Notifications?.scheduleNotificationAsync) {
    return;
  }

  const data = remoteMessage?.data || remoteMessage?.notification?.data || {};
  const title = safeDecode(String(remoteMessage?.notification?.title || data.title || "New notification").trim());
  const body = String(remoteMessage?.notification?.body || data.body || "").trim();
  const type = String(data.type || "").trim();
  const conversationId = String(data.conversationId || "").trim();

  if (conversationId && (type === "chat_message" || type.startsWith("group_"))) {
    try {
      const userId = await getStoredUserId();
      if (userId) {
        const mutedIds = await getMutedConversationIds(userId);
        if (mutedIds.includes(conversationId)) {
          return;
        }
      }
    } catch (error) {
      console.log("[Push] Mute lookup error:", error);
    }
  }
  const channelId =
    type === "incoming_call"
      ? CALL_NOTIFICATION_CHANNEL_ID
      : type === "chat_message"
        ? "chat"
        : "social";

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: type === "incoming_call" ? false : "default",
      ...(Platform.OS === "android" ? { channelId } : {}),
    },
    trigger: null,
  }).catch((error: any) => {
    console.log("[Push] Foreground notification display error:", error);
  });
}

async function requestPushPermission() {
  const messaging = getMessaging();

  if (messaging) {
    try {
      if (typeof messaging.setAutoInitEnabled === "function") {
        await messaging.setAutoInitEnabled(true);
      }

      if (typeof messaging.registerDeviceForRemoteMessages === "function") {
        await messaging.registerDeviceForRemoteMessages().catch(() => {});
      }
    } catch (error) {
      console.log("[Push] Firebase device registration error:", error);
    }
  }

  if (messaging && Platform.OS === "ios") {
    await messaging.requestPermission();
  }

  if (Platform.OS === "android" && Number(Platform.Version || 0) >= 33) {
    try {
      const hasAndroidPermission = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );

      if (!hasAndroidPermission) {
        const permissionResult = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );

        if (permissionResult !== PermissionsAndroid.RESULTS.GRANTED) {
          return false;
        }
      }
    } catch (error) {
      console.log("[Push] Android notification permission error:", error);
      return false;
    }
  }

  if (messaging && Platform.OS === "android") {
    return true;
  }

  if (!Notifications) {
    return true;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === "granted";
}

async function getCurrentPushToken(): Promise<string | null> {
  const messaging = getMessaging();

  if (messaging) {
    const token = await messaging.getToken();
    return String(token || "").trim() || null;
  }

  if (!Notifications) {
    return null;
  }

  const tokenData = await Notifications.getDevicePushTokenAsync();
  return String(tokenData?.data || "").trim() || null;
}

export async function registerPushToken(): Promise<string | null> {
  try {
    const messaging = getMessaging();
    const canRegisterOnCurrentDevice =
      !Device
      || Device.isDevice
      || (Platform.OS === "android" && !!messaging);

    if (!canRegisterOnCurrentDevice) {
      console.log("[Push] Push registration skipped on unsupported simulator");
      return null;
    }

    if (Device && !Device.isDevice && Platform.OS === "android" && messaging) {
      console.log("[Push] Android emulator detected, attempting FCM registration");
    }

    const hasPermission = await requestPushPermission();
    if (!hasPermission) {
      console.log("[Push] Notification permission not granted");
      return null;
    }

    await ensureAndroidChannel();

    const token = await getCurrentPushToken();
    if (!token) {
      console.log("[Push] Could not obtain device push token");
      return null;
    }

    await syncPushTokenToBackend(token);
    console.log("[Push] Registration completed", {
      token,
      platform: Platform.OS,
      ...getPushDeviceInfo(),
    });
    return token;
  } catch (error) {
    console.log("[Push] Registration error:", error);
    return null;
  }
}

let listenerSubs: Array<{ remove: () => void }> = [];

export function setupNotificationListeners(navigationRef?: any): () => void {
  ensureAndroidChannel().catch((error) => {
    console.log("[Push] Android channel bootstrap error:", error);
  });

  listenerSubs.forEach((sub) => sub.remove());
  listenerSubs = [];

  const nextSubs: Array<{ remove: () => void }> = [];
  const messaging = getMessaging();

  if (messaging) {
    nextSubs.push(
      {
        remove: messaging.onMessage((remoteMessage: any) => {
          const data = remoteMessage?.data || {};

          if (String(data.type || "").trim() === "incoming_call") {
            navigateFromNotificationData(data, navigationRef);
            return;
          }

          showForegroundNotification(remoteMessage).catch((error) => {
            console.log("[Push] Foreground message error:", error);
          });
        }),
      },
    );

    nextSubs.push(
      {
        remove: messaging.onNotificationOpenedApp((remoteMessage: any) => {
          handleNotificationResponse(remoteMessage, navigationRef).catch((error) => {
            console.log("[Push] Firebase open-app error:", error);
          });
        }),
      },
    );

    nextSubs.push(
      {
        remove: messaging.onTokenRefresh((token: string) => {
          syncPushTokenToBackend(token).catch((error) => {
            console.log("[Push] Token refresh sync error:", error);
          });
        }),
      },
    );

    messaging
      .getInitialNotification()
      .then((remoteMessage: any) => {
        if (!remoteMessage) {
          return;
        }

        return handleNotificationResponse(remoteMessage, navigationRef);
      })
      .catch((error: any) => {
        console.log("[Push] Firebase initial notification error:", error);
      });
  }

  if (Notifications) {
    const receivedSub = Notifications.addNotificationReceivedListener((notification: any) => {
      const data = notification?.request?.content?.data;
      console.log("[Push] Notification received in foreground:", data?.type);
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response: any) => {
      handleNotificationResponse(response, navigationRef).catch((error) => {
        console.log("[Push] Navigation error on tap:", error);
      });
    });

    nextSubs.push(receivedSub, responseSub);

    if (typeof Notifications.getLastNotificationResponseAsync === "function") {
      Notifications.getLastNotificationResponseAsync()
        .then((response: any) => {
          if (!response) {
            return;
          }

          return handleNotificationResponse(response, navigationRef);
        })
        .then(() => {
          if (typeof Notifications.clearLastNotificationResponseAsync === "function") {
            return Notifications.clearLastNotificationResponseAsync();
          }

          return undefined;
        })
        .catch((error: any) => {
          console.log("[Push] Last response bootstrap error:", error);
        });
    }
  }

  listenerSubs = nextSubs;

  return () => {
    nextSubs.forEach((sub) => sub.remove());
    listenerSubs = [];
  };
}

export async function clearPushToken(): Promise<void> {
  try {
    const token = await getCurrentPushToken();

    if (!token) {
      return;
    }

    console.log("[Push] Clearing token from backend", {
      token,
      platform: Platform.OS,
      ...getPushDeviceInfo(),
    });

    await API.put("/user/profile", { removeFcmToken: token });
    await logBackendPushDevices("token clear");
    console.log("[Push] Token cleared");
  } catch (error) {
    console.log("[Push] Clear token error:", error);
  }
}
