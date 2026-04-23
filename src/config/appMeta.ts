export const APP_VERSION = "0.0.1";
export const APP_RELEASE_DATE = "April 23, 2026";
export const APP_RELEASE_TITLE = "Live guest video, safer calls, and cleaner shared chat cards";

export const APP_RELEASE_HIGHLIGHTS = [
  "Chat UI is cleaner across direct and group conversations with tighter spacing, improved bubbles, and better composer alignment.",
  "Missing profile photos now fall back to clean first-letter avatars across key chat, notification, search, and relationship screens.",
  "Chat details now include clear-chat controls and disappearing message timers for more WhatsApp-style chat management.",
  "Chat, post, reel, and story media now pass through backend nudity and explicit-content checks before publishing.",
  "Approved live-stream guest requests now bring the guest camera on screen so the host and guest can both appear in the live stage.",
  "Calls now clean up more safely when the app disconnects so stale active sessions do not block the next call attempt.",
  "Release notes now reflect the live product status more clearly across chat, feed, seller, live, and account surfaces.",
];

export const APP_FEATURE_SECTIONS = [
  {
    title: "Core experience",
    items: [
      "Phone login, OTP verification, signup, forgot password, and session restore.",
  "Home feed with stories, posts, swipes, reactions, saves, shares, and archives.",
      "Profile management with previews, followers, following, close friends, blocked users, and privacy controls.",
    ],
  },
  {
    title: "Messaging and communication",
    items: [
      "Direct chats, seller chats, group chats, message forwarding, locked chats, muting, shared media, and cleaner Instagram-style chat presentation.",
      "Chat details now support wallpaper changes, clear chat, disappearing messages, and chat locking controls.",
      "Voice notes in chat with preview-before-send support, safer audio typing, plus live incoming call routing for audio calls and video calls.",
      "WebRTC-based live streams with host tools, viewer chat, reactions, request-to-join support, approved guest video, and active stream discovery.",
      "Protected chat media flow with backend moderation checks for nudity and explicit-content detection on chat images, GIFs, and videos.",
    ],
  },
  {
    title: "Creator and social tools",
    items: [
      "Post, story, and swipe creation with media upload, filters, trims, stickers, overlays, captions, and hashtags.",
      "Post, reel, and story publishing now re-check media for nudity and explicit content before content goes live.",
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
      "Push notification registration, session invalidation handling, active-device visibility, and safer chat-media enforcement.",
    ],
  },
];

export const APP_BUG_FIXES = [
  "Tightened chat bubble sizing, composer spacing, and footer alignment across direct and group chat screens.",
  "Added first-letter avatar fallbacks when a user has not uploaded a profile photo on major list and chat surfaces.",
  "Added clear-chat controls and disappearing message timers inside chat details.",
  "Improved voice-note handling so recordings can be previewed before sending and no longer fall back into video-style chat cards.",
  "Clarified release-note wording so chat moderation coverage is described accurately inside the app.",
  "Extended backend nudity checks to post, reel, and story publishing flows for safer creator uploads.",
  "Improved voice and live session clarity so conversations sound fuller and easier to hear.",
  "Added direct sidebar access to release notes and surfaced the current app version in the feed menu.",
  "Wired the Dog AR filter into Android video-call tracks, camera switching, and safer live-call behavior.",
  "Fixed live-stream guest approval flow so approved viewers can come on stage with video and the host sees the guest feed.",
  "Tightened call-session teardown on disconnect so repeat calls in the same conversation no longer get blocked by stale active sessions.",
  "Refined shared post cards in chat so incoming post previews look cleaner and more compact.",
];

export const APP_UPCOMING_CHANGES = [
  "More helpful call quality status updates inside the call screen.",
  "Expanded creator tooling for richer live-stream moderation, better seller promo surfaces, and admin review queues.",
  "A fuller historical release archive so each version can be reviewed directly inside the app.",
  "Optional client-side moderation previews before upload completes, plus richer admin review tools.",
];
