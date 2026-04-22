export const APP_VERSION = "0.0.1";
export const APP_RELEASE_DATE = "April 23, 2026";
export const APP_RELEASE_TITLE = "Chat polish, safer chat media checks, and stronger calling tools";

export const APP_RELEASE_HIGHLIGHTS = [
  "Chat UI is cleaner across direct and group conversations with tighter spacing, improved bubbles, and better composer alignment.",
  "Chat, post, reel, and story media now pass through backend nudity and explicit-content checks before publishing.",
  "Calls and live sessions now sound clearer, support camera switching, and include the Android Dog AR face filter flow.",
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
      "Voice notes in chat with preview-before-send support, plus live incoming call routing for audio calls and video calls.",
      "WebRTC-based live streams with host tools, viewer chat, reactions, request-to-join support, and active stream discovery.",
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
  "Improved voice-note handling so recordings can be previewed before sending.",
  "Clarified release-note wording so chat moderation coverage is described accurately inside the app.",
  "Extended backend nudity checks to post, reel, and story publishing flows for safer creator uploads.",
  "Improved voice and live session clarity so conversations sound fuller and easier to hear.",
  "Added direct sidebar access to release notes and surfaced the current app version in the feed menu.",
  "Wired the Dog AR filter into Android video-call tracks, camera switching, and safer live-call behavior.",
];

export const APP_UPCOMING_CHANGES = [
  "More helpful call quality status updates inside the call screen.",
  "Expanded creator tooling for richer live-stream moderation, better seller promo surfaces, and admin review queues.",
  "A fuller historical release archive so each version can be reviewed directly inside the app.",
  "Optional client-side moderation previews before upload completes, plus richer admin review tools.",
];
