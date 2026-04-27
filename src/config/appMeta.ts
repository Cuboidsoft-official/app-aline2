export const APP_VERSION = "1.0.2";
export const APP_RELEASE_DATE = "April 27, 2026";
export const APP_RELEASE_TITLE = "Smaller feed UI, steadier video posting, and cleaner call updates";

export const APP_RELEASE_HIGHLIGHTS = [
  "Feed cards now feel tighter and more Instagram-like with smaller avatars, lighter typography, and less bulky spacing.",
  "Video post uploads now retry alternate backend connections instead of falling straight into a generic internet-error state.",
  "Video trim preview feels more polished with clearer clip feedback and a stronger save-trim flow before publishing.",
  "Call rows now explain what happened more clearly with better missed, calling, incoming, and completed labels.",
  "Release notes now reflect the latest feed, upload, trim, referral, and call experience improvements more accurately.",
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
  "Fixed a video-post upload path that could show a misleading internet error before trying the app's backup backend connection.",
  "Reduced feed header and caption sizing so posts feel denser, cleaner, and closer to a familiar social feed layout.",
  "Improved trim-sheet feedback so creators can preview the exact clip window and save the trimmed version more confidently.",
  "Clarified call-event copy across chat surfaces so missed, completed, and in-progress calls are easier to understand.",
  "Refreshed the in-app release summary so referral and release-note sections stay in sync with the current build.",
  "Reduced chat lag so text sending feels quicker and the newest message stays in view more consistently.",
  "Fixed a stuck active-call state that could appear even after the previous call had already ended.",
  "Improved music playback for published feed posts, stories, and swipes so sound starts more reliably.",
  "Smoothed swipe playback and scrolling so videos feel closer to a continuous full-screen reel experience.",
  "Reordered swipe actions so share, sound, save, and more options feel more familiar and easier to reach.",
  "Tightened chat bubble sizing, composer spacing, and footer alignment across direct and group chat screens.",
  "Added first-letter avatar fallbacks when a user has not uploaded a profile photo on major list and chat surfaces.",
  "Added clear-chat controls and disappearing message timers inside chat details.",
  "Improved voice-note handling so recordings can be previewed before sending and no longer fall back into video-style chat cards.",
  "Improved voice and live session clarity so conversations sound fuller and easier to hear.",
  "Added direct sidebar access to release notes and surfaced the current app version in the feed menu.",
  "Added a fun camera effect during supported video calls and tightened camera switching behavior.",
  "Fixed guest approval flow so approved viewers can join live on camera and the host sees the guest feed.",
  "Tightened call cleanup so repeat calls in the same conversation no longer get blocked by stale active sessions.",
  "Refined shared post cards in chat so incoming post previews look cleaner and more compact.",
];

export const APP_UPCOMING_CHANGES = [
  "More detailed call states inside the live call screen itself.",
  "Expanded creator tooling for richer live moderation, better seller promo surfaces, and stronger review queues.",
  "A fuller historical release archive so each version can be reviewed directly inside the app.",
  "Optional upload previews before publishing completes, plus richer review tools.",
];
