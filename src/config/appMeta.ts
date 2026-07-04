export const APP_VERSION = "2.0.0";
export const APP_RELEASE_DATE = "July 4, 2026";
export const APP_RELEASE_TITLE = "Audio fixes and production stability improvements";

export const APP_RELEASE_HIGHLIGHTS = [
  "Fixed critical audio unmute functionality in feed posts with music - tapping now correctly plays/pauses audio.",
  "Improved music playback state management for more reliable audio control throughout the app.",
  "Enhanced production build process with comprehensive CI/CD validation and security measures.",
  "Feed, story, and swipe publishing now keep selected-track metadata steadier so attached music remains consistent.",
  "Updated security measures for safer credential handling and production deployment workflows.",
  "Stabilized release artifact signing and verification to ensure authentic app delivery.",
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
      "Direct chats, seller chats, group chats, message forwarding, locked chats, muting, shared media, and faster latest-message loading.",
      "Chat details now support wallpaper changes, clear chat, disappearing messages, and chat locking controls.",
      "Voice notes in chat with preview-before-send support, cleaner audio playback, and more reliable incoming audio and video calls.",
      "Live broadcasts with host tools, viewer chat, reactions, guest requests, guest video, and stream discovery.",
      "Protected chat media flow with safer image, GIF, and video sharing.",
    ],
  },
  {
    title: "Creator and social tools",
    items: [
      "Post, story, and swipe creation with media upload, filters, trims, stickers, overlays, captions, hashtags, and attached music.",
      "Feed, story, and swipe playback now feel smoother with better sound behavior and steadier automatic video play.",
      "Comment threads, story replies, content controls, and saved or archived flows.",
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
  "Fixed critical audio unmute bug where tapping posts with music wouldn't play audio - now works correctly.",
  "Corrected inverted music playback logic that prevented sound from playing when user tapped to unmute.",
  "Fixed double-tap like behavior to work correctly alongside audio toggle - like animation still appears on double-tap.",
  "Improved audio state management so tapping reliably toggles playback instead of causing confusion.",
  "Fixed a live music catalog regression that could fail the picker instead of returning the latest playable tracks.",
  "Fixed version drift where the feed sidebar could still show the old v0.0.1 label after newer releases had already shipped.",
  "Refreshed Firebase Android configuration for the current release certificate so Google-services-backed flows stay in sync with the production build.",
  "Improved Jamendo-backed track parsing so catalog responses return safer playback URLs, track titles, and artist details more consistently.",
  "Preserved attached-audio metadata more reliably across create-post, story, and swipe publishing.",
  "Reduced false generic network errors during video publishing by keeping backup backend retry behavior in place.",
];

export const APP_UPCOMING_CHANGES = [
  "More detailed call states inside the live call screen itself.",
  "Expanded creator tooling for richer live moderation, better seller promo surfaces, and stronger review queues.",
  "A fuller historical release archive so each version can be reviewed directly inside the app.",
  "Optional upload previews before publishing completes, plus richer review tools.",
  "More visible music-source credit cues and playback context across pickers and published media surfaces.",
];
