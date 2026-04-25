export const APP_VERSION = "0.0.1";
export const APP_RELEASE_DATE = "April 26, 2026";
export const APP_RELEASE_TITLE = "Faster chats, smoother swipes, and more reliable calls";

export const APP_RELEASE_HIGHLIGHTS = [
  "Call sessions now reset more reliably after a call ends so the next call can start without the old active warning getting stuck.",
  "Chat sending feels faster with a snappier latest-message view and less lag while conversations update.",
  "Music attached to feed posts, stories, and swipes now plays more reliably after publishing.",
  "Swipes now feel smoother with quicker full-screen transitions, faster auto playback, and a cleaner action dock layout.",
  "Release notes have been refreshed to focus on user-facing improvements across chat, feed, swipes, seller, and account screens.",
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
  "More helpful call status updates inside the call screen.",
  "Expanded creator tooling for richer live moderation, better seller promo surfaces, and stronger review queues.",
  "A fuller historical release archive so each version can be reviewed directly inside the app.",
  "Optional upload previews before publishing completes, plus richer review tools.",
];
