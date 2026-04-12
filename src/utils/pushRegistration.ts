/**
 * Push Notification Registration + Listener
 *
 * Handles:
 *  1. Permission request
 *  2. Device push token retrieval (native FCM/APNs — NOT Expo tokens)
 *  3. Registration with the backend via /user/profile
 *  4. Foreground notification display
 *  5. Notification tap → navigation
 *  6. Android notification channel setup
 *  7. Token clearing on logout
 *
 * The backend uses firebase-admin (FCM) to send pushes directly,
 * so we must register the NATIVE device token, not an Expo push token.
 *
 * Usage:
 *   import { registerPushToken, setupNotificationListeners, clearPushToken } from './pushRegistration';
 *
 *   // After login:
 *   registerPushToken();
 *   setupNotificationListeners(navigationRef);
 *
 *   // On logout:
 *   clearPushToken();
 */

import { Platform } from "react-native";
import { API } from "../api/api";

let Notifications: any = null;
let Device: any = null;

try {
    Notifications = require("expo-notifications");
} catch {
    // expo-notifications not installed
}

try {
    Device = require("expo-device");
} catch {
    // expo-device not installed
}

// ─────────────────────────────────────────────
// Configure foreground notification behaviour
// ─────────────────────────────────────────────
if (Notifications) {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,   // Show banner even when app is in foreground
            shouldPlaySound: true,
            shouldSetBadge: true,
        }),
    });
}

// ─────────────────────────────────────────────
// Android notification channel (required for Android 8+)
// ─────────────────────────────────────────────
async function ensureAndroidChannel() {
    if (Platform.OS !== "android" || !Notifications) return;

    try {
        await Notifications.setNotificationChannelAsync("default", {
            name: "Default",
            importance: Notifications.AndroidImportance?.MAX ?? 4,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#7B4DFF",
            sound: "default",
        });

        await Notifications.setNotificationChannelAsync("chat", {
            name: "Chat Messages",
            importance: Notifications.AndroidImportance?.MAX ?? 4,
            vibrationPattern: [0, 150, 100, 150],
            lightColor: "#1DA1F2",
            sound: "default",
        });

        await Notifications.setNotificationChannelAsync("calls", {
            name: "Calls",
            importance: Notifications.AndroidImportance?.MAX ?? 4,
            vibrationPattern: [0, 250, 150, 250, 150, 250],
            lightColor: "#22c55e",
            sound: "default",
        });

        await Notifications.setNotificationChannelAsync("social", {
            name: "Social Updates",
            importance: Notifications.AndroidImportance?.DEFAULT ?? 3,
            sound: "default",
        });
    } catch (error) {
        console.log("[Push] Android channel setup error:", error);
    }
}

// ─────────────────────────────────────────────
// Token registration
// ─────────────────────────────────────────────

/**
 * Request push permission and register the native device token
 * (FCM on Android, APNs on iOS) with the backend.
 *
 * Safe to call multiple times — won't re-prompt if already granted.
 */
export async function registerPushToken(): Promise<string | null> {
    try {
        if (!Notifications) {
            console.log("[Push] expo-notifications not available, skipping");
            return null;
        }

        // Must be a physical device
        if (Device && !Device.isDevice) {
            console.log("[Push] Not a physical device, skipping push registration");
            return null;
        }

        // Request permission
        const { status: existingStatus } =
            await Notifications.getPermissionsAsync();

        let finalStatus = existingStatus;

        if (existingStatus !== "granted") {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== "granted") {
            console.log("[Push] Notification permission not granted");
            return null;
        }

        // Setup Android channels before requesting token
        await ensureAndroidChannel();

        // Get the NATIVE device push token (FCM on Android, APNs on iOS).
        // This is different from Expo Push Token — firebase-admin on the
        // backend can send directly to these tokens.
        const tokenData = await Notifications.getDevicePushTokenAsync();

        const token = tokenData?.data;

        if (!token) {
            console.log("[Push] Could not obtain device push token");
            return null;
        }

        // Send to backend
        await API.put("/user/profile", { fcmToken: token });
        console.log(
            "[Push] Native device token registered:",
            String(token).substring(0, 20) + "..."
        );

        return token;
    } catch (error) {
        console.log("[Push] Registration error:", error);
        return null;
    }
}

// ─────────────────────────────────────────────
// Notification listeners
// ─────────────────────────────────────────────

/** Active listener subscriptions — call cleanup() to remove */
let listenerSubs: Array<{ remove: () => void }> = [];

/**
 * Setup notification listeners for:
 *  - Foreground notification received (already handled by setNotificationHandler)
 *  - Notification tapped → navigate to relevant screen
 *
 * @param navigationRef  React Navigation ref for deep-linking on tap
 */
export function setupNotificationListeners(navigationRef?: any): () => void {
    if (!Notifications) {
        return () => { };
    }

    // Clean up any previous subscriptions
    listenerSubs.forEach((sub) => sub.remove());
    listenerSubs = [];

    // When a notification is received while app is in foreground
    const receivedSub = Notifications.addNotificationReceivedListener(
        (notification: any) => {
            const data = notification?.request?.content?.data;
            console.log("[Push] Notification received in foreground:", data?.type);
        }
    );

    // When user taps on a notification
    const responseSub = Notifications.addNotificationResponseReceivedListener(
        (response: any) => {
            const data = response?.notification?.request?.content?.data;

            if (!data || !navigationRef?.current) return;

            const nav = navigationRef.current;

            try {
                switch (data.type) {
                    case "like":
                    case "comment":
                    case "comment_reply":
                    case "mention_post":
                    case "tag_post":
                    case "post_share":
                        if (data.postId) {
                            nav.navigate("PostDetail", { postId: data.postId });
                        }
                        break;

                    case "follow":
                        if (data.senderId) {
                            nav.navigate("ProfileView", { userId: data.senderId });
                        }
                        break;

                    case "story_view":
                    case "story_reply":
                    case "mention_story":
                    case "tag_story":
                        if (data.storyId) {
                            nav.navigate("StoryViewer", { storyId: data.storyId });
                        }
                        break;

                    case "service_request":
                    case "service_request_update":
                        nav.navigate("ServiceRequestsScreen", { mode: "seller" });
                        break;

                    case "chat_message":
                        if (data.conversationId) {
                            nav.navigate("ChatScreen", { conversationId: data.conversationId });
                        } else {
                            nav.navigate("AllChatsScreen");
                        }
                        break;

                    case "incoming_call":
                        if (data.callSessionId) {
                            nav.navigate("CallScreen", {
                                callSessionId: data.callSessionId,
                                mode: "incoming",
                                callType: data.callType || "audio",
                                title: data.title || "Incoming call",
                                avatarUrl: data.avatarUrl || "",
                            });
                        } else {
                            nav.navigate("AllChatsScreen");
                        }
                        break;

                    default:
                        // Open the notifications screen as fallback
                        nav.navigate("NotificationScreen");
                        break;
                }
            } catch (error) {
                console.log("[Push] Navigation error on tap:", error);
            }
        }
    );

    listenerSubs = [receivedSub, responseSub];

    // Return cleanup function
    return () => {
        receivedSub.remove();
        responseSub.remove();
        listenerSubs = [];
    };
}

// ─────────────────────────────────────────────
// Token cleanup (logout)
// ─────────────────────────────────────────────

/**
 * Clear the push token from the backend so the user
 * stops receiving notifications after logging out.
 */
export async function clearPushToken(): Promise<void> {
    try {
        await API.put("/user/profile", { fcmToken: "" });
        console.log("[Push] Token cleared");
    } catch (error) {
        console.log("[Push] Clear token error:", error);
    }
}
