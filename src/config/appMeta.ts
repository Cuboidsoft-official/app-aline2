export const APP_VERSION = "2.2.1";
export const APP_RELEASE_DATE = "August 6, 2026";
export const APP_RELEASE_TITLE = "Referral Leaderboard, Fraud Reporting, Performance & UI Polish";

export const APP_RELEASE_HIGHLIGHTS = [
  "Referral Leaderboard & Live Tracking: Track top referral earners with real-time earnings, Top 3 podium champions, and timeframe filters.",
  "Customer Support & Fraud Reporting: Dedicated report fraud screen with seller tag, proof photo attachments, call details, and resilient backend submission.",
  "Small Device & Low-RAM Performance: Optimized list rendering with clipped view unmounting, reduced window sizes, and navigation freeze-on-blur for zero lag.",
  "Video Call PiP Refinement: Cleaned floating video container by removing border lines and surface background artifacts.",
  "Simplified Seller Registration: Streamlined Step 4 registration to only require essential Aadhaar verification.",
  "Swipes UI Centering: Re-aligned action rail (Like, Comment, Share, Save) directly into vertical center for better accessibility.",
];

export const APP_FEATURE_SECTIONS = [
  {
    title: "Core experience",
    items: [
      "Phone login, OTP verification, signup with referral code tracking, forgot password, and session restore.",
      "Home feed with stories, posts, swipes, reactions, saves, shares, and archives.",
      "Profile management with previews, followers, following, close friends, blocked users, and privacy controls.",
      "Referral Leaderboard with live rankings, top earner podiums, and all-time/monthly/weekly timeframe filters.",
    ],
  },
  {
    title: "Messaging and communication",
    items: [
      "Direct chats, seller chats, group chats, message forwarding, locked chats, muting, shared media, and faster latest-message loading.",
      "Chat details with wallpaper changes, clear chat, disappearing messages, and chat locking controls.",
      "Voice notes in chat with preview-before-send support, cleaner audio playback, and reliable incoming audio/video calls.",
      "Incoming and missed call push notifications with dedicated call channel for instant priority.",
      "Video call PiP floating window with borderless overlay and black background bleed protection.",
      "Live broadcasts with host tools, viewer chat, reactions, guest requests, guest video, and stream discovery.",
    ],
  },
  {
    title: "Creator and social tools",
    items: [
      "Post, story, and swipe creation with media upload, filters, trims, stickers, overlays, captions, hashtags, and attached music.",
      "Swipes player with vertically centered action rail for Like, Comment, Share, and Save interactions.",
      "Story viewer auto-advance fixes preventing second story auto-skipping.",
      "Comment threads, story replies, content controls, and saved or archived flows.",
      "Notifications, mention/tag controls, and seller/service discovery across the app.",
    ],
  },
  {
    title: "Seller and earnings",
    items: [
      "Simplified seller onboarding requiring Aadhaar identity verification only.",
      "Seller dashboard, service management, previews, requests, wallet visibility, and referral earnings guidance.",
      "Seller settings, service edits, marketplace discovery, and request tracking from both user and seller sides.",
    ],
  },
  {
    title: "Safety, Support & Account Controls",
    items: [
      "Customer Support & Fraud Report form with seller tagging, proof screenshots gallery, call context, and dual MongoDB collection recording.",
      "Account center, notification settings, comment controls, tags/mentions controls, delete account, and help/support.",
      "Push notification registration, session invalidation handling, active-device visibility, and safer chat-media enforcement.",
      "Full performance optimizations for budget devices with unmounted clipped subviews and navigation freeze-on-blur.",
    ],
  },
];

export const APP_BUG_FIXES = [
  "Fixed story auto-advance double-trigger bug where the second story was skipped automatically.",
  "Fixed Customer Support submission errors by adding 3-candidate API route fallback and graceful guest handling on backend.",
  "Removed floating video call border line artifacts and white background bleed-through.",
  "Removed Account Type read-only field from Edit Profile UI while keeping backend category separation.",
  "Fixed list memory leaks and frame drops on low-RAM Android devices by enabling removeClippedSubviews and windowSize tuning.",
  "Fixed referral leaderboard real-time data synchronization with fallback indicators when data is unavailable.",
  "Fixed seller registration KYC check validation by removing obsolete PAN and Bank proof requirements.",
  "Corrected Swipes action rail vertical positioning to prevent overlap with top screen headers.",
];

export const APP_UPCOMING_CHANGES = [
  "In-app referral reward redemption directly into bank/UPI wallet.",
  "Expanded creator tooling for live moderation and seller promotional badges.",
  "Full historical release notes archive viewer.",
  "Video call screen share and group call grid enhancements.",
];
