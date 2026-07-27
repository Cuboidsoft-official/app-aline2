export type MediaType = "image" | "video";
export type Visibility = "public" | "friends" | "close_friends" | "custom";

export interface SocialUser {
  id: string;
  username: string;
  name: string;
  avatarUrl: string;
  isVerified?: boolean;
  followerIds?: string[];
  followingIds?: string[];
  viewerFollows?: boolean;
  followsViewer?: boolean;
}

export interface StoryMusic {
  id?: string;
  externalId?: string;
  trackName: string;
  artistName?: string;
  artworkUrl?: string;
  previewUrl?: string;
  streamUrl?: string;
  audioUrl?: string;
  externalUrl?: string;
  youtubeVideoId?: string;
  source?: string;
  isOriginal?: boolean;
  startTime?: number;
  endTime?: number;
  duration?: number;
}

export interface SelectedMusicClip {
  id: string;
  externalId?: string;
  title: string;
  artist?: string;
  artworkUrl?: string;
  previewUrl?: string;
  streamUrl?: string;
  audioUrl?: string;
  externalUrl?: string;
  source?: string;
  youtubeVideoId?: string;
  isOriginal?: boolean;
  duration: number;
  clipStartTime?: number;
  clipEndTime?: number;
  clipDuration?: number;
}

export interface MediaAsset {
  id: string;
  mediaType: MediaType;
  url: string;
  thumbnailUrl?: string;
  altText?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  frameTransform?: {
    scale: number;
    translateX: number;
    translateY: number;
  };
  sensitiveContent?: {
    isSensitive: boolean;
    blur?: boolean;
    label?: string;
    confidence?: number;
  };
}

export type PostType = "photo" | "video" | "carousel";

export interface PostSettings {
  disableComments: boolean;
  hideLikeCount: boolean;
  allowRemix: boolean;
}

export interface Post {
  id: string;
  user: SocialUser;
  likePreviewUsers?: SocialUser[];
  postType?: "post" | "reel";
  type: PostType;
  caption: string;
  media: MediaAsset[];
  location?: string;
  music?: StoryMusic;
  hashtags: string[];
  mentions: string[];
  collaboratorIds: string[];
  settings: PostSettings;
  createdAt: number;
  filterPreset?: string;
  stickers: StorySticker[];
  editedAt?: number;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  liked: boolean;
  saved: boolean;
  hasOriginalAudio?: boolean;
  originalAudioVolume?: number;
}

export type StoryType = "media" | "text" | "poll" | "question";

export interface StoryPoll {
  question: string;
  options: [string, string];
  votes: [number, number];
  selectedIndex?: 0 | 1;
}

export interface StoryQuestion {
  prompt: string;
  responseCount: number;
}

export type StoryStickerType = "text" | "emoji" | "image";
export type StoryStickerPlacement = "top_left" | "top_right" | "center" | "bottom_left" | "bottom_right";
export type StoryStickerTextAlignment = "left" | "center" | "right";
export type StoryTextStickerTheme = "dark" | "light" | "accent" | "outline";
export type StoryFilterPreset = "none" | "warm" | "cool" | "noir" | "dream";

export interface StorySticker {
  id: string;
  type: StoryStickerType;
  text: string;
  mediaUrl?: string;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    scale?: number;
  };
  style?: {
    color?: string;
    backgroundColor?: string;
    fontSize?: number;
    fontFamily?: string;
    fontStyle?: "normal" | "italic";
    alignment?: "left" | "center" | "right";
  };
}

export interface StoryMentionTarget {
  id?: string;
  username: string;
}

export interface Story {
  id: string;
  user: SocialUser;
  type: StoryType;
  media?: MediaAsset;
  text?: string;
  backgroundColor?: string;
  filterPreset?: StoryFilterPreset;
  filterIntensity?: number;
  poll?: StoryPoll;
  question?: StoryQuestion;
  linkUrl?: string;
  location?: string;
  stickers: StorySticker[];
  mentions: string[];
  mentionTargets?: StoryMentionTarget[];
  hashtags: string[];
  visibility: Visibility;
  createdAt: number;
  expiresAt: number;
  viewed: boolean;
  liked: boolean;
  reactionCount: number;
  viewCount?: number;
  replyCount?: number;
  allowReplies?: boolean;
  allowSharing?: boolean;
  isOwner?: boolean;
  music?: StoryMusic;
}

export interface Reel {
  id: string;
  user: SocialUser;
  caption: string;
  media: MediaAsset;
  thumbnailUrl: string;
  music?: StoryMusic;
  hashtags: string[];
  mentions: string[];
  location?: string;
  stickers?: StorySticker[];
  createdAt: number;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  liked: boolean;
  saved: boolean;
}

export type Swipe = Reel;

export interface FeedResponse {
  stories: Story[];
  posts: Post[];
}

export interface StorySequenceResponse {
  stories: Story[];
  startIndex: number;
}

export interface GetStorySequenceOptions {
  storyUserId?: string;
}

export interface Comment {
  id: string;
  postId?: string;
  storyId?: string;
  parentCommentId?: string | null;
  user: SocialUser;
  text: string;
  audioUrl?: string;
  audioDuration?: number;
  createdAt: number;
  liked: boolean;
  likesCount: number;
  canDelete?: boolean;
  replyCount?: number;
  mentions?: string[];
}

export interface ReelComment {
  id: string;
  reelId: string;
  parentCommentId?: string | null;
  user: SocialUser;
  text: string;
  audioUrl?: string;
  audioDuration?: number;
  createdAt: number;
  liked: boolean;
  likesCount: number;
  canDelete?: boolean;
  replyCount?: number;
}

export type SwipeComment = ReelComment;

export interface CommentAudioFile {
  uri: string;
  name: string;
  type: string;
  duration?: number;
}

export interface StoryReply {
  id: string;
  storyId: string;
  fromUser: SocialUser;
  text: string;
  createdAt: number;
}

export type ContentKind = "post" | "reel" | "swipe" | "story";
export type ReportReason =
  | "spam"
  | "violence"
  | "harassment"
  | "nudity"
  | "hate_speech"
  | "false_information"
  | "other";

export interface StoryViewerEntry {
  user: SocialUser;
  viewedAt: number;
  liked: boolean;
}

export interface TaggedUserInput {
  user: string;
  username?: string;
}

export interface CreatePostInput {
  type: PostType;
  caption: string;
  media: MediaAsset[];
  location?: string;
  music?: SelectedMusicClip;
  hashtags?: string[];
  mentions?: string[];
  taggedUsers?: TaggedUserInput[];
  collaboratorIds?: string[];
  settings?: Partial<PostSettings>;
  filterPreset?: string;
  stickers?: StorySticker[];
  hasOriginalAudio?: boolean;
  originalAudioVolume?: number;
}

export interface CreateStoryInput {
  type: StoryType;
  media?: MediaAsset;
  text?: string;
  backgroundColor?: string;
  poll?: { question: string; options: [string, string] };
  question?: { prompt: string };
  linkUrl?: string;
  location?: string;
  filterPreset?: StoryFilterPreset;
  filterIntensity?: number;
  customTextSticker?: string;
  customTextStickerPlacement?: StoryStickerPlacement;
  customTextStickerPosition?: { x: number; y: number };
  customTextStickerScale?: number;
  customTextStickerRotation?: number;
  customTextStickerTheme?: StoryTextStickerTheme;
  customTextStickerAlignment?: StoryStickerTextAlignment;
  customEmojiSticker?: string;
  customEmojiStickerPlacement?: StoryStickerPlacement;
  customEmojiStickerPosition?: { x: number; y: number };
  customEmojiStickerScale?: number;
  customEmojiStickerRotation?: number;
  customImageStickerUrl?: string;
  customImageStickerLabel?: string;
  customImageStickerPosition?: { x: number; y: number };
  customImageStickerScale?: number;
  customImageStickerRotation?: number;
  extraEmojiStickers?: Array<{
    text: string;
    position: { x: number; y: number };
    scale?: number;
    rotation?: number;
  }>;
  mentions?: string[];
  hashtags?: string[];
  visibility?: Visibility;
  visibleToUserIds?: string[];
  allowReplies?: boolean;
  allowSharing?: boolean;
  music?: SelectedMusicClip;
}

export interface CreateReelInput {
  caption: string;
  media: MediaAsset;
  thumbnailUrl?: string;
  hasOriginalAudio?: boolean;
  originalAudioVolume?: number;
  music?: SelectedMusicClip;
  hashtags?: string[];
  mentions?: string[];
  taggedUsers?: TaggedUserInput[];
  location?: string;
  stickers?: StorySticker[];
}

export type CreateSwipeInput = CreateReelInput;

export interface UpdatePostInput {
  caption?: string;
  location?: string;
  music?: string;
  hashtags?: string[];
  mentions?: string[];
  settings?: Partial<PostSettings>;
}

export interface UpdateStoryInput {
  text?: string;
  backgroundColor?: string;
  linkUrl?: string;
  filterPreset?: StoryFilterPreset;
  filterIntensity?: number;
  visibility?: Visibility;
  allowReplies?: boolean;
  allowSharing?: boolean;
  music?: StoryMusic;
}

export interface DeleteCommentResult {
  deletedCount: number;
  parentCommentId?: string | null;
}

export interface SocialApi {
  getFeed(page?: number, limit?: number): Promise<FeedResponse>;
  getUserFeed(userId: string): Promise<FeedResponse>;
  getReels(page?: number): Promise<Reel[]>;
  getReel(reelId: string): Promise<Reel>;
  getSwipes(page?: number, limit?: number): Promise<Swipe[]>;
  getUserSwipes(userId: string): Promise<Swipe[]>;
  getSwipe(swipeId: string): Promise<Swipe>;
  getStorySequence(storyId: string, options?: GetStorySequenceOptions): Promise<StorySequenceResponse>;
  getPost(postId: string): Promise<Post>;
  getStory(storyId: string): Promise<Story>;
  getStoryArchive(): Promise<Story[]>;
  getPostArchive(): Promise<Post[]>;
  getSavedPosts(): Promise<Post[]>;

  markStoryViewed(storyId: string): Promise<Story>;
  toggleStoryLike(storyId: string): Promise<Story>;
  voteStoryPoll(storyId: string, optionIndex: 0 | 1): Promise<Story>;
  replyToStory(storyId: string, text: string): Promise<StoryReply>;
  getStoryReplies(storyId: string): Promise<Comment[]>;
  addStoryReply(storyId: string, text: string, parentCommentId?: string): Promise<Comment>;
  getCommentReplies(commentId: string): Promise<Comment[]>;
  toggleStoryReplyLike(storyId: string, commentId: string): Promise<Comment>;
  deleteStoryReply(storyId: string, commentId: string): Promise<DeleteCommentResult>;

  togglePostLike(postId: string): Promise<Post>;
  togglePostSave(postId: string): Promise<Post>;
  sharePost(postId: string): Promise<Post>;
  addPostComment(postId: string, text: string, parentCommentId?: string, audioFile?: CommentAudioFile): Promise<Comment>;
  getPostComments(postId: string): Promise<Comment[]>;
  togglePostCommentLike(postId: string, commentId: string): Promise<Comment>;
  deletePostComment(postId: string, commentId: string): Promise<DeleteCommentResult>;
  updatePost(postId: string, input: UpdatePostInput): Promise<Post>;
  archivePost(postId: string): Promise<void>;
  restorePost(postId: string): Promise<void>;
  deletePost(postId: string): Promise<void>;

  toggleReelLike(reelId: string): Promise<Reel>;
  toggleSwipeLike(swipeId: string): Promise<Swipe>;
  toggleReelSave(reelId: string): Promise<Reel>;
  toggleSwipeSave(swipeId: string): Promise<Swipe>;
  shareReel(reelId: string): Promise<Reel>;
  shareSwipe(swipeId: string): Promise<Swipe>;
  getReelComments(reelId: string): Promise<ReelComment[]>;
  getSwipeComments(swipeId: string): Promise<SwipeComment[]>;
  addReelComment(reelId: string, text: string, parentCommentId?: string, audioFile?: CommentAudioFile): Promise<ReelComment>;
  addSwipeComment(swipeId: string, text: string, parentCommentId?: string, audioFile?: CommentAudioFile): Promise<SwipeComment>;
  toggleReelCommentLike(reelId: string, commentId: string): Promise<ReelComment>;
  toggleSwipeCommentLike(swipeId: string, commentId: string): Promise<SwipeComment>;
  deleteReelComment(reelId: string, commentId: string): Promise<DeleteCommentResult>;
  deleteSwipeComment(swipeId: string, commentId: string): Promise<DeleteCommentResult>;
  deleteSwipe(swipeId: string): Promise<void>;

  createPost(input: CreatePostInput): Promise<Post>;
  createStory(input: CreateStoryInput): Promise<Story>;
  createReel(input: CreateReelInput): Promise<Reel>;
  createSwipe(input: CreateSwipeInput): Promise<Swipe>;
  updateStory(storyId: string, input: UpdateStoryInput): Promise<Story>;
  archiveStory(storyId: string): Promise<void>;
  restoreStory(storyId: string): Promise<void>;
  deleteStory(storyId: string): Promise<void>;

  getStoryViewers(storyId: string): Promise<StoryViewerEntry[]>;
  getStoryLikers(storyId: string): Promise<SocialUser[]>;

  reportContent(contentType: ContentKind, contentId: string, reason: ReportReason, note?: string): Promise<void>;
  muteUser(userId: string): Promise<void>;
  blockUser(userId: string): Promise<void>;
  unblockUser(userId: string): Promise<void>;
  markNotInterested(contentType: ContentKind, contentId: string): Promise<void>;
}
