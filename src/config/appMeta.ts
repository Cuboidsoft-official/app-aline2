export const APP_VERSION = "0.0.1";
export const APP_RELEASE_DATE = "April 21, 2026";
export const APP_RELEASE_TITLE = "Communication polish and product clarity";

export const APP_RELEASE_HIGHLIGHTS = [
  "Boosted voice, video-call, and live-stream audio tuning for clearer and louder sessions.",
  "Added lightweight live video filter presets for video calls without heavy rendering overhead.",
  "Added in-app version visibility plus a dedicated release notes and feature catalog screen.",
];

export const APP_FEATURE_SECTIONS = [
  {
    title: "Core experience",
    items: [
      "Phone login, OTP verification, signup, forgot password, and session restore.",
      "Home feed with stories, posts, reels-style swipes, reactions, saves, shares, and archives.",
      "Profile management with previews, followers, following, close friends, blocked users, and privacy controls.",
    ],
  },
  {
    title: "Messaging and communication",
    items: [
      "Direct chats, seller chats, group chats, message forwarding, locked chats, muting, and media attachments.",
      "Voice notes in chat plus live incoming call routing for audio calls and video calls.",
      "WebRTC-based live streams with host tools, viewer chat, reactions, and active stream discovery.",
    ],
  },
  {
    title: "Creator and social tools",
    items: [
      "Post, story, and swipe creation with media upload, filters, trims, stickers, overlays, captions, and hashtags.",
      "Comment threads, story replies, content moderation controls, and saved/archive flows.",
      "Notifications, mention/tag controls, and seller/service discovery across the app.",
    ],
  },
  {
    title: "Seller and earnings",
    items: [
      "Seller onboarding, dashboard, service management, previews, requests, wallet visibility, and earnings guidance.",
      "Seller settings, service edits, marketplace discovery, and request tracking from both user and seller sides.",
    ],
  },
  {
    title: "Safety and account controls",
    items: [
      "Account center, notification settings, comment controls, tags/mentions controls, delete account, and help/support.",
      "Push notification registration, session invalidation handling, and active-device visibility.",
    ],
  },
];

export const APP_BUG_FIXES = [
  "Raised WebRTC audio processing quality by enabling auto gain control, echo cancellation, and noise suppression in calls and live streams.",
  "Improved Android communication audio routing so speaker mode is louder and more consistent during calls and streaming playback.",
  "Added direct sidebar access to release notes and surfaced the current app version in the feed menu.",
  "Added video-call filter presets so users can quickly switch the look of live video sessions.",
];

export const APP_UPCOMING_CHANGES = [
  "Deeper call diagnostics for packet loss, latency, and reconnect hints inside the call UI.",
  "Expanded creator tooling for richer live-stream moderation and better seller promo surfaces.",
  "A fuller historical release archive so each version can be reviewed directly inside the app.",
  "More advanced real-time call effects once native performance-safe video processing is validated.",
];
