import {
  FeedResponse,
  MediaAsset,
  Post,
  Reel,
  SocialUser,
  Story,
  StoryType,
} from "./types";

const now = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

const makeAsset = (id: string, url: string, mediaType: "image" | "video" = "image"): MediaAsset => ({
  id,
  mediaType,
  url,
  thumbnailUrl: mediaType === "video" ? url : undefined,
});

const users: SocialUser[] = [
  {
    id: "u1",
    username: "you",
    name: "You",
    avatarUrl: "https://randomuser.me/api/portraits/women/68.jpg",
    isVerified: true,
  },
  {
    id: "u2",
    username: "rahul_k",
    name: "Rahul",
    avatarUrl: "https://randomuser.me/api/portraits/men/32.jpg",
  },
  {
    id: "u3",
    username: "reema.styles",
    name: "Reema",
    avatarUrl: "https://randomuser.me/api/portraits/women/12.jpg",
    isVerified: true,
  },
  {
    id: "u4",
    username: "amit.travels",
    name: "Amit",
    avatarUrl: "https://randomuser.me/api/portraits/men/51.jpg",
  },
  {
    id: "u5",
    username: "neha.fit",
    name: "Neha",
    avatarUrl: "https://randomuser.me/api/portraits/women/22.jpg",
  },
];

const storyPool: Story[] = [
  {
    id: "s1",
    user: users[0],
    type: "media",
    media: makeAsset("sm1", "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=900"),
    mentions: ["@rahul_k"],
    hashtags: ["#morning"],
    visibility: "public",
    createdAt: now - 1000 * 60 * 15,
    expiresAt: now + DAY_MS,
    viewed: false,
    liked: false,
    reactionCount: 3,
    allowReplies: true,
    allowSharing: true,
    music: { trackName: "Dawn Routine", artistName: "Aline Radio" },
  },
  {
    id: "s2",
    user: users[1],
    type: "poll",
    media: makeAsset("sm2", "https://images.unsplash.com/photo-1500534623283-312aade485b7?w=900"),
    poll: {
      question: "Beach this weekend?",
      options: ["Yes", "No"],
      votes: [64, 22],
    },
    mentions: [],
    hashtags: ["#weekend"],
    visibility: "public",
    createdAt: now - 1000 * 60 * 60,
    expiresAt: now + DAY_MS,
    viewed: false,
    liked: false,
    reactionCount: 12,
    allowReplies: true,
    allowSharing: true,
  },
  {
    id: "s3",
    user: users[2],
    type: "question",
    media: makeAsset("sm3", "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=900"),
    question: {
      prompt: "Ask me fashion questions",
      responseCount: 8,
    },
    mentions: [],
    hashtags: ["#askme"],
    visibility: "close_friends",
    createdAt: now - 1000 * 60 * 70,
    expiresAt: now + DAY_MS,
    viewed: true,
    liked: true,
    reactionCount: 20,
    allowReplies: true,
    allowSharing: false,
    music: { trackName: "Runway Notes", artistName: "Studio Edit" },
  },
  {
    id: "s4",
    user: users[3],
    type: "text",
    text: "New travel vlog drops tonight",
    backgroundColor: "#1E3A8A",
    linkUrl: "https://example.com/vlog",
    mentions: ["@you"],
    hashtags: ["#travel"],
    visibility: "public",
    createdAt: now - 1000 * 60 * 90,
    expiresAt: now + DAY_MS,
    viewed: false,
    liked: false,
    reactionCount: 4,
    allowReplies: true,
    allowSharing: true,
  },
  {
    id: "s5",
    user: users[4],
    type: "media",
    media: makeAsset("sm5", "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=900"),
    mentions: [],
    hashtags: ["#fitness"],
    visibility: "public",
    createdAt: now - 1000 * 60 * 120,
    expiresAt: now + DAY_MS,
    viewed: true,
    liked: false,
    reactionCount: 6,
    allowReplies: true,
    allowSharing: true,
  },
];

const postPool: Post[] = [
  {
    id: "p1",
    user: users[2],
    type: "photo",
    caption: "Golden hour + city vibes #aline2 #city",
    media: [makeAsset("pm1", "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=1200")],
    location: "Mumbai",
    music: "Evening Wave",
    hashtags: ["#aline2", "#city"],
    mentions: ["@amit.travels"],
    collaboratorIds: ["u4"],
    settings: { disableComments: false, hideLikeCount: false, allowRemix: true },
    createdAt: now - 1000 * 60 * 50,
    likesCount: 1842,
    commentsCount: 92,
    sharesCount: 43,
    liked: false,
    saved: false,
  },
  {
    id: "p2",
    user: users[3],
    type: "carousel",
    caption: "Weekend trek album #manali",
    media: [
      makeAsset("pm2a", "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200"),
      makeAsset("pm2b", "https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=1200"),
      makeAsset("pm2c", "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200"),
    ],
    location: "Manali",
    hashtags: ["#manali", "#mountains"],
    mentions: [],
    collaboratorIds: [],
    settings: { disableComments: false, hideLikeCount: false, allowRemix: true },
    createdAt: now - 1000 * 60 * 130,
    likesCount: 936,
    commentsCount: 41,
    sharesCount: 12,
    liked: true,
    saved: true,
  },
  {
    id: "p3",
    user: users[4],
    type: "video",
    caption: "Morning routine swipe clip #fitness",
    media: [makeAsset("pm3", "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1200", "video")],
    hashtags: ["#fitness"],
    mentions: [],
    collaboratorIds: [],
    settings: { disableComments: false, hideLikeCount: false, allowRemix: false },
    createdAt: now - 1000 * 60 * 220,
    likesCount: 642,
    commentsCount: 17,
    sharesCount: 8,
    liked: false,
    saved: false,
  },
];

const reelPool: Reel[] = [
  {
    id: "r1",
    user: users[3],
    caption: "Top of the hill in 20 seconds. #travel",
    media: makeAsset("rm1", "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1200", "video"),
    thumbnailUrl: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1200",
    music: "Highland Beats",
    hashtags: ["#travel"],
    mentions: ["@you"],
    createdAt: now - 1000 * 60 * 40,
    likesCount: 3821,
    commentsCount: 120,
    sharesCount: 47,
    liked: false,
    saved: false,
  },
  {
    id: "r2",
    user: users[2],
    caption: "Outfit transition in one take #fashion",
    media: makeAsset("rm2", "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1200", "video"),
    thumbnailUrl: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1200",
    music: "Mirror Pop",
    hashtags: ["#fashion"],
    mentions: [],
    createdAt: now - 1000 * 60 * 80,
    likesCount: 5210,
    commentsCount: 204,
    sharesCount: 83,
    liked: true,
    saved: false,
  },
  {
    id: "r3",
    user: users[4],
    caption: "30-sec full body warmup #fitlife",
    media: makeAsset("rm3", "https://images.unsplash.com/photo-1598971639058-a67d2f1f95c9?w=1200", "video"),
    thumbnailUrl: "https://images.unsplash.com/photo-1598971639058-a67d2f1f95c9?w=1200",
    music: "Push Tempo",
    hashtags: ["#fitlife"],
    mentions: ["@rahul_k"],
    createdAt: now - 1000 * 60 * 140,
    likesCount: 2600,
    commentsCount: 75,
    sharesCount: 31,
    liked: false,
    saved: true,
  },
];

const STORY_TEXT_COLORS = ["#1E3A8A", "#831843", "#0F766E", "#3F3F46", "#6D28D9"];

export const localMediaOptions = {
  post: [
    "https://images.unsplash.com/photo-1472396961693-142e6e269027?w=1200",
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=1200",
    "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=1200",
    "https://images.unsplash.com/photo-1516321497487-e288fb19713f?w=1200",
    "https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=1200",
    "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200",
  ],
  story: [
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=900",
    "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=900",
    "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=900",
    "https://images.unsplash.com/photo-1500534623283-312aade485b7?w=900",
  ],
  reel: [
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1200",
    "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1200",
    "https://images.unsplash.com/photo-1598971639058-a67d2f1f95c9?w=1200",
    "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1200",
  ],
  swipes: [
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1200",
    "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1200",
    "https://images.unsplash.com/photo-1598971639058-a67d2f1f95c9?w=1200",
    "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1200",
  ],
  storyTextColors: STORY_TEXT_COLORS,
};

export const getUsers = (): SocialUser[] => users;

export const state = {
  stories: storyPool,
  posts: postPool,
  reels: reelPool,
};

const clonePost = (item: Post): Post => ({
  ...item,
  user: { ...item.user },
  media: item.media.map((asset) => ({ ...asset })),
  hashtags: [...item.hashtags],
  mentions: [...item.mentions],
  collaboratorIds: [...item.collaboratorIds],
  settings: { ...item.settings },
});

const cloneStory = (item: Story): Story => ({
  ...item,
  user: { ...item.user },
  media: item.media ? { ...item.media } : undefined,
  poll: item.poll
    ? {
        question: item.poll.question,
        options: [...item.poll.options] as [string, string],
        votes: [...item.poll.votes] as [number, number],
        selectedIndex: item.poll.selectedIndex,
      }
    : undefined,
  question: item.question ? { ...item.question } : undefined,
  mentions: [...item.mentions],
  hashtags: [...item.hashtags],
});

const cloneReel = (item: Reel): Reel => ({
  ...item,
  user: { ...item.user },
  media: { ...item.media },
  hashtags: [...item.hashtags],
  mentions: [...item.mentions],
});

export const cloneFeed = (): FeedResponse => ({
  stories: state.stories.map(cloneStory),
  posts: state.posts.map(clonePost),
});

export const cloneReels = (): Reel[] => state.reels.map(cloneReel);

export const cloneStories = (): Story[] => state.stories.map(cloneStory);

export const clonePostById = (postId: string): Post | null => {
  const post = state.posts.find((item) => item.id === postId);
  return post ? clonePost(post) : null;
};

export const cloneStoryById = (storyId: string): Story | null => {
  const story = state.stories.find((item) => item.id === storyId);
  return story ? cloneStory(story) : null;
};

export const resolveStoryType = (story: Story): StoryType => story.type;
