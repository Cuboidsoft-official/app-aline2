import { API } from "../../api/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getStoredUserId } from "../../utils/authSession";
import { cloneFeed, clonePostById, cloneReels, cloneStories, getUsers, state } from "./mockData";
import {
  ContentKind,
  Comment,
  CreatePostInput,
  CreateReelInput,
  CreateSwipeInput,
  CreateStoryInput,
  FeedResponse,
  GetStorySequenceOptions,
  MediaAsset,
  Post,
  ReelComment,
  ReportReason,
  Reel,
  SocialApi,
  SocialUser,
  Story,
  StoryViewerEntry,
  StoryReply,
  StorySequenceResponse,
  UpdatePostInput,
  UpdateStoryInput,
} from "./types";
import {
  cloneComment,
  normalizeReportNote,
  normalizeCommentText,
  normalizePostInput,
  normalizeReelInput,
  normalizeStoryInput,
  normalizeUpdatePostInput,
  normalizeUpdateStoryInput,
} from "./validation";

const SOCIAL_API_MODE: "mock" | "remote" =
  (globalThis as { __SOCIAL_API_MODE__?: "mock" | "remote" }).__SOCIAL_API_MODE__ || "remote";
const REQUEST_DELAY_MS = 180;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const buildId = (prefix: string): string => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
const POST_DELETE_OWNER_ERROR = "You can only delete your own posts.";
const STORY_OWNER_ERROR = "You can only manage your own stories.";
const STORY_INSIGHTS_OWNER_ERROR = "Story insights are only available for your own stories.";
const STORY_REPLIES_OWNER_ERROR = "Story replies are only available for your own stories.";
const SYNC_REQUIRED_POST_ERROR = "This post is not synced with the server yet.";
const SYNC_REQUIRED_STORY_ERROR = "This story is not synced with the server yet.";

const postComments = new Map<string, Comment[]>();
const reelComments = new Map<string, ReelComment[]>();
const storyComments = new Map<string, Comment[]>();
const commentReplies = new Map<string, Comment[]>();
const storyViewers = new Map<string, StoryViewerEntry[]>();
const storyLikers = new Map<string, SocialUser[]>();
const archivedStoryIds = new Set<string>();
const archivedPostIds = new Set<string>();
const mutedUserIds = new Set<string>();
const blockedUserIds = new Set<string>();
const hiddenContentKeys = new Set<string>();
const reports: Array<{
  contentType: ContentKind;
  contentId: string;
  reason: ReportReason;
  note?: string;
  createdAt: number;
}> = [];
const LOCAL_MODERATION_PREFS_KEY = "social_local_prefs_v1";
let moderationPrefsLoaded = false;

const applyModerationPrefsPayload = (payload: any): void => {
  mutedUserIds.clear();
  blockedUserIds.clear();
  hiddenContentKeys.clear();
  reports.splice(0, reports.length);

  (payload?.mutedUserIds || []).forEach((id: string) => mutedUserIds.add(id));
  (payload?.blockedUserIds || []).forEach((id: string) => blockedUserIds.add(id));
  (payload?.hiddenContentKeys || []).forEach((key: string) => hiddenContentKeys.add(key));
  (payload?.reports || []).forEach((report: any) => reports.push(report));
};

const loadModerationPrefs = async (): Promise<void> => {
  if (moderationPrefsLoaded) {
    return;
  }

  try {
    if (SOCIAL_API_MODE === "remote") {
      const res = await API.get("/user/content-preferences");
      applyModerationPrefsPayload(res?.data?.preferences || {});
      await persistModerationPrefs();
      moderationPrefsLoaded = true;
      return;
    }

    const raw = await AsyncStorage.getItem(LOCAL_MODERATION_PREFS_KEY);
    if (!raw) {
      moderationPrefsLoaded = true;
      return;
    }

    const parsed = JSON.parse(raw);
    applyModerationPrefsPayload(parsed);
  } catch {
    applyModerationPrefsPayload({});
  } finally {
    moderationPrefsLoaded = true;
  }
};

const persistModerationPrefs = async (): Promise<void> => {
  await AsyncStorage.setItem(
    LOCAL_MODERATION_PREFS_KEY,
    JSON.stringify({
      mutedUserIds: Array.from(mutedUserIds),
      blockedUserIds: Array.from(blockedUserIds),
      hiddenContentKeys: Array.from(hiddenContentKeys),
      reports,
    }),
  );
};

const applyContentVisibilityFilters = <T extends { id: string; user: { id: string } }>(
  items: T[],
  kind: ContentKind,
): T[] =>
  items.filter(
    (item) =>
      !blockedUserIds.has(item.user.id) &&
      !mutedUserIds.has(item.user.id) &&
      !hiddenContentKeys.has(buildContentKey(kind, item.id)),
  );
const normalizeContentKind = (kind: ContentKind): "post" | "swipe" | "story" => {
  if (kind === "reel" || kind === "swipe") {
    return "swipe";
  }
  return kind;
};

const buildContentKey = (kind: ContentKind, id: string): string => `${normalizeContentKind(kind)}:${id}`;
const seedCommentSnippets = [
  "Loved this shot.",
  "This is super clean.",
  "Need the full breakdown for this.",
  "Saved this for later.",
];

const cloneComments = (items: Comment[]): Comment[] => items.map(cloneComment);
const cloneReelComment = (comment: ReelComment): ReelComment => ({ ...comment, user: { ...comment.user } });
const cloneReelComments = (items: ReelComment[]): ReelComment[] => items.map(cloneReelComment);
const cloneUsers = (items: SocialUser[]): SocialUser[] => items.map((user) => ({ ...user }));
const cloneStoryRecord = (story: Story): Story => ({
  ...story,
  user: { ...story.user },
  media: story.media ? { ...story.media } : undefined,
  poll: story.poll
    ? {
        question: story.poll.question,
        options: [...story.poll.options] as [string, string],
        votes: [...story.poll.votes] as [number, number],
        selectedIndex: story.poll.selectedIndex,
      }
    : undefined,
  question: story.question ? { ...story.question } : undefined,
  mentions: [...story.mentions],
  hashtags: [...story.hashtags],
  music: story.music ? { ...story.music } : undefined,
});

const formatMusicLabel = (music: any): string | undefined => {
  if (!music) {
    return undefined;
  }

  if (typeof music === "string") {
    const trimmed = music.trim();
    return trimmed || undefined;
  }

  const title = String(music?.title || music?.trackName || "").trim();
  const artist = String(music?.artist || music?.artistName || "").trim();

  if (!title) {
    return undefined;
  }

  return artist ? `${title} • ${artist}` : title;
};

const mapStoryMusicDetails = (music: any, musicConfig?: any) => {
  if (!music) {
    return undefined;
  }

  const trackName = String(music?.title || music?.trackName || "").trim();
  const artistName = String(music?.artist || music?.artistName || "").trim() || undefined;

  if (!trackName) {
    return undefined;
  }

  return {
    id: typeof music === "object" ? String(music?._id || music?.id || "") || undefined : undefined,
    trackName,
    artistName,
    artworkUrl: music?.thumbnailUrl || music?.artworkUrl || undefined,
    previewUrl: music?.previewUrl || music?.audioUrl || undefined,
    source: music?.source || undefined,
    isOriginal: !!music?.isOriginal,
    startTime:
      typeof musicConfig?.startTime === "number"
        ? musicConfig.startTime
        : typeof music?.startTime === "number"
          ? music.startTime
          : 0,
    duration:
      typeof musicConfig?.duration === "number"
        ? musicConfig.duration
        : typeof music?.duration === "number"
          ? music.duration
          : undefined,
  };
};

const buildMusicRequestPayload = (music: any) =>
  music?.id
    ? {
        musicId: music.id,
        musicConfig: {
          startTime: music.clipStartTime ?? 0,
          duration: music.clipDuration ?? music.duration,
          volume: 1,
        },
      }
    : {};

const buildStoryMusicSticker = (music: any) => {
  const label = formatMusicLabel(music);

  if (!label) {
    return null;
  }

  return {
    type: "music",
    text: label,
    position: {
      x: 0.5,
      y: 0.82,
      width: 0.64,
      height: 0.1,
      rotation: 0,
      scale: 1,
    },
    style: {
      color: "#ffffff",
      backgroundColor: "rgba(17,24,39,0.72)",
      alignment: "center",
    },
    interactive: false,
  };
};

const getCurrentUserId = (): string => getUsers()[0]?.id || "";
const assertCurrentUserOwns = (ownerId: string, message: string): void => {
  if (!ownerId || ownerId !== getCurrentUserId()) {
    throw new Error(message);
  }
};

const ensurePostComments = (postId: string): Comment[] => {
  const existing = postComments.get(postId);
  if (existing) {
    return existing;
  }

  const post = state.posts.find((item) => item.id === postId);
  if (!post) {
    throw new Error("Post not found");
  }

  const users = getUsers();
  const now = Date.now();
  const seeded: Comment[] = users.slice(1, 4).map((user, index) => ({
    id: `seed_${postId}_${index + 1}`,
    postId,
    user,
    text: seedCommentSnippets[index % seedCommentSnippets.length],
    createdAt: now - (index + 1) * 1000 * 60 * 13,
    liked: false,
    likesCount: 2 + index * 3,
    canDelete: false,
  }));

  const yourComment: Comment = {
    id: `seed_${postId}_self`,
    postId,
    user: users[0],
    text: "Looks great.",
    createdAt: now - 1000 * 60 * 6,
    liked: true,
    likesCount: 1,
    canDelete: true,
  };

  const all = [yourComment, ...seeded];
  postComments.set(postId, all);
  return all;
};

const ensureReelComments = (reelId: string): ReelComment[] => {
  const existing = reelComments.get(reelId);
  if (existing) {
    return existing;
  }

  const reel = state.reels.find((item) => item.id === reelId);
  if (!reel) {
    throw new Error("Swipe not found");
  }

  const users = getUsers();
  const now = Date.now();
  const seeded: ReelComment[] = users.slice(1, 4).map((user, index) => ({
    id: `seed_reel_${reelId}_${index + 1}`,
    reelId,
    user,
    text: seedCommentSnippets[(index + 1) % seedCommentSnippets.length],
    createdAt: now - (index + 1) * 1000 * 60 * 11,
    liked: false,
    likesCount: 1 + index * 2,
    canDelete: false,
  }));

  const self: ReelComment = {
    id: `seed_reel_${reelId}_self`,
    reelId,
    user: users[0],
    text: "This is fire.",
    createdAt: now - 1000 * 60 * 4,
    liked: false,
    likesCount: 0,
    canDelete: true,
  };

  const all = [self, ...seeded];
  reelComments.set(reelId, all);
  return all;
};

const ensureStoryViewers = (storyId: string): StoryViewerEntry[] => {
  const existing = storyViewers.get(storyId);
  if (existing) {
    return existing;
  }

  const viewers: StoryViewerEntry[] = getUsers()
    .slice(1)
    .map((user, index) => ({
      user,
      viewedAt: Date.now() - (index + 1) * 1000 * 60 * 6,
      liked: index % 2 === 0,
    }));

  storyViewers.set(storyId, viewers);
  storyLikers.set(
    storyId,
    viewers.filter((entry) => entry.liked).map((entry) => entry.user),
  );
  return viewers;
};

const ensureStoryComments = (storyId: string): Comment[] => {
  const existing = storyComments.get(storyId);
  if (existing) {
    return existing;
  }

  const story = state.stories.find((item) => item.id === storyId);
  if (!story) {
    throw new Error("Story not found");
  }

  const users = getUsers();
  const now = Date.now();
  const seeded: Comment[] = users.slice(1, 4).map((user, index) => ({
    id: `seed_story_${storyId}_${index + 1}`,
    storyId,
    user,
    text:
      index === 0
        ? "This story is clean."
        : index === 1
          ? "Need the full details on this."
          : "Dropping a reaction because this is good.",
    createdAt: now - (index + 1) * 1000 * 60 * 9,
    liked: index === 0,
    likesCount: index + 1,
    canDelete: false,
    replyCount: index === 0 ? 1 : 0,
    mentions: [],
  }));

  const firstReply: Comment = {
    id: `seed_story_reply_${storyId}_1`,
    storyId,
    parentCommentId: seeded[0]?.id,
    user: users[0],
    text: `@${seeded[0]?.user.username || "user"} Thanks for watching.`,
    createdAt: now - 1000 * 60 * 4,
    liked: false,
    likesCount: 0,
    canDelete: true,
    replyCount: 0,
    mentions: seeded[0]?.user.username ? [seeded[0].user.username] : [],
  };

  if (seeded[0]) {
    commentReplies.set(seeded[0].id, [firstReply]);
  }

  storyComments.set(storyId, seeded);
  return seeded;
};

const getStoryReplyTotal = (storyId: string): number => {
  const topLevel = ensureStoryComments(storyId);
  let total = topLevel.length;

  topLevel.forEach((comment) => {
    total += (commentReplies.get(comment.id) || []).length;
  });

  return total;
};

const syncMockStoryMeta = (story: Story): Story => {
  const viewers = ensureStoryViewers(story.id);
  const likers = storyLikers.get(story.id) || [];

  return {
    ...cloneStoryRecord(story),
    isOwner: story.user.id === getCurrentUserId(),
    allowReplies: story.allowReplies !== false,
    allowSharing: story.allowSharing !== false,
    viewCount: viewers.length,
    reactionCount: likers.length || story.reactionCount,
    replyCount: getStoryReplyTotal(story.id),
  };
};

class MockSocialApi implements SocialApi {
  async getFeed(): Promise<FeedResponse> {
    await loadModerationPrefs();
    await wait(REQUEST_DELAY_MS);
    const feed = cloneFeed();
    return {
      stories: applyContentVisibilityFilters(
        feed.stories.filter((item) => !archivedStoryIds.has(item.id)),
        "story",
      ),
      posts: applyContentVisibilityFilters(
        feed.posts.filter((item) => !archivedPostIds.has(item.id)),
        "post",
      ),
    };
  }

  async getReels(): Promise<Reel[]> {
    await loadModerationPrefs();
    await wait(REQUEST_DELAY_MS);
    return applyContentVisibilityFilters(cloneReels(), "swipe");
  }

  async getSwipes(): Promise<Reel[]> {
    return this.getReels();
  }

  async getStorySequence(storyId: string, _options?: GetStorySequenceOptions): Promise<StorySequenceResponse> {
    await loadModerationPrefs();
    await wait(REQUEST_DELAY_MS);
    const stories = applyContentVisibilityFilters(
      cloneStories().filter((item) => !archivedStoryIds.has(item.id)),
      "story",
    ).map(syncMockStoryMeta);
    const story = stories.find((item) => item.id === storyId);

    if (!story) {
      throw new Error("Story not found or no longer available.");
    }

    const sameUserStories = stories.filter((item) => item.user.id === story.user.id);
    const remainingUserIds = Array.from(
      new Set(stories.filter((item) => item.user.id !== story.user.id).map((item) => item.user.id)),
    );
    const others = remainingUserIds.flatMap((userId) => stories.filter((item) => item.user.id === userId));
    const list = [...sameUserStories, ...others];
    const startIndex = list.findIndex((item) => item.id === storyId);

    return {
      stories: list,
      startIndex: startIndex >= 0 ? startIndex : 0,
    };
  }

  async getStory(storyId: string): Promise<Story> {
    await loadModerationPrefs();
    await wait(80);
    const story = state.stories.find((item) => item.id === storyId);

    if (!story) {
      throw new Error("Story not found");
    }
    if (
      archivedStoryIds.has(story.id) ||
      blockedUserIds.has(story.user.id) ||
      mutedUserIds.has(story.user.id) ||
      hiddenContentKeys.has(buildContentKey("story", story.id))
    ) {
      throw new Error("Story not available");
    }

    return syncMockStoryMeta(story);
  }

  async getPost(postId: string): Promise<Post> {
    await loadModerationPrefs();
    await wait(80);
    const cloned = clonePostById(postId);

    if (!cloned) {
      throw new Error("Post not found");
    }
    if (
      archivedPostIds.has(cloned.id) ||
      blockedUserIds.has(cloned.user.id) ||
      mutedUserIds.has(cloned.user.id) ||
      hiddenContentKeys.has(buildContentKey("post", cloned.id))
    ) {
      throw new Error("Post not available");
    }

    return cloned;
  }

  async getStoryArchive(): Promise<Story[]> {
    await wait(120);
    return cloneStories()
      .filter(
        (item) =>
          archivedStoryIds.has(item.id) &&
          !blockedUserIds.has(item.user.id) &&
          !hiddenContentKeys.has(buildContentKey("story", item.id)),
      )
      .map(syncMockStoryMeta)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getPostArchive(): Promise<Post[]> {
    await wait(120);
    return state.posts
      .filter((item) => archivedPostIds.has(item.id))
      .map((item) => clonePostById(item.id))
      .filter(Boolean) as Post[];
  }

  async markStoryViewed(storyId: string): Promise<Story> {
    await wait(80);
    const target = state.stories.find((item) => item.id === storyId);

    if (!target) {
      throw new Error("Story not found");
    }

    if (target.user.id === getCurrentUserId()) {
      return syncMockStoryMeta(target);
    }

    target.viewed = true;

    const currentUser = getUsers()[0];
    const viewers = ensureStoryViewers(storyId);
    const existingViewer = viewers.find((entry) => entry.user.id === currentUser.id);
    if (!existingViewer) {
      viewers.unshift({
        user: currentUser,
        viewedAt: Date.now(),
        liked: target.liked,
      });
    }

    storyViewers.set(storyId, viewers);
    return syncMockStoryMeta(target);
  }

  async toggleStoryLike(storyId: string): Promise<Story> {
    await wait(120);
    const target = state.stories.find((item) => item.id === storyId);

    if (!target) {
      throw new Error("Story not found");
    }

    if (target.liked) {
      return syncMockStoryMeta(target);
    }

    target.liked = true;
    target.viewed = true;
    target.reactionCount = Math.max(0, target.reactionCount + 1);

    const viewers = ensureStoryViewers(storyId);
    const currentUserId = getCurrentUserId();
    const existing = viewers.find((entry) => entry.user.id === currentUserId);
    if (existing) {
      existing.liked = target.liked;
      existing.viewedAt = Date.now();
    } else {
      viewers.unshift({
        user: getUsers()[0],
        viewedAt: Date.now(),
        liked: target.liked,
      });
    }

    storyViewers.set(storyId, viewers);
    storyLikers.set(
      storyId,
      viewers.filter((entry) => entry.liked).map((entry) => entry.user),
    );
    return syncMockStoryMeta(target);
  }

  async voteStoryPoll(storyId: string, optionIndex: 0 | 1): Promise<Story> {
    await wait(120);
    const target = state.stories.find((item) => item.id === storyId);

    if (!target || !target.poll) {
      throw new Error("Poll story not found");
    }

    if (target.poll.selectedIndex === undefined) {
      target.poll.votes[optionIndex] += 1;
    } else if (target.poll.selectedIndex !== optionIndex) {
      target.poll.votes[target.poll.selectedIndex] = Math.max(0, target.poll.votes[target.poll.selectedIndex] - 1);
      target.poll.votes[optionIndex] += 1;
    }

    target.poll.selectedIndex = optionIndex;

    return syncMockStoryMeta(target);
  }

  async replyToStory(storyId: string, text: string): Promise<StoryReply> {
    const reply = await this.addStoryReply(storyId, text);
    return {
      id: reply.id,
      storyId,
      fromUser: { ...reply.user },
      text: reply.text,
      createdAt: reply.createdAt,
    };
  }

  async getStoryReplies(storyId: string): Promise<Comment[]> {
    await wait(100);
    const story = state.stories.find((item) => item.id === storyId);
    if (!story) {
      throw new Error("Story not found");
    }

    assertCurrentUserOwns(story.user.id, STORY_REPLIES_OWNER_ERROR);
    return cloneComments(ensureStoryComments(storyId)).sort((a, b) => b.createdAt - a.createdAt);
  }

  async addStoryReply(storyId: string, text: string, parentCommentId?: string): Promise<Comment> {
    await wait(120);
    const target = state.stories.find((item) => item.id === storyId);

    if (!target) {
      throw new Error("Story not found");
    }

    const comment: Comment = {
      id: buildId(parentCommentId ? "scr" : "sc"),
      storyId,
      parentCommentId: parentCommentId || null,
      user: getUsers()[0],
      text: normalizeCommentText(text),
      createdAt: Date.now(),
      liked: false,
      likesCount: 0,
      canDelete: true,
      replyCount: 0,
      mentions: [],
    };

    if (parentCommentId) {
      const replies = commentReplies.get(parentCommentId) || [];
      replies.push(comment);
      commentReplies.set(parentCommentId, replies);

      const parent = ensureStoryComments(storyId).find((item) => item.id === parentCommentId);
      if (parent) {
        parent.replyCount = (parent.replyCount || 0) + 1;
      }
    } else {
      const comments = ensureStoryComments(storyId);
      comments.unshift(comment);
      storyComments.set(storyId, comments);
    }

    if (target.question) {
      target.question.responseCount += 1;
    }

    return cloneComment(comment);
  }

  async getCommentReplies(commentId: string): Promise<Comment[]> {
    await wait(90);
    return cloneComments(commentReplies.get(commentId) || []).sort((a, b) => a.createdAt - b.createdAt);
  }

  async toggleStoryReplyLike(storyId: string, commentId: string): Promise<Comment> {
    await wait(80);
    const topLevel = ensureStoryComments(storyId);
    const nested = Array.from(commentReplies.values()).flat();
    const target = [...topLevel, ...nested].find((item) => item.id === commentId);

    if (!target) {
      throw new Error("Reply not found");
    }

    target.liked = !target.liked;
    target.likesCount = Math.max(0, target.likesCount + (target.liked ? 1 : -1));
    return cloneComment(target);
  }

  async deleteStoryReply(storyId: string, commentId: string): Promise<void> {
    await wait(90);

    const topLevel = ensureStoryComments(storyId);
    const topLevelIndex = topLevel.findIndex((item) => item.id === commentId);
    if (topLevelIndex >= 0) {
      topLevel.splice(topLevelIndex, 1);
      storyComments.set(storyId, topLevel);
      commentReplies.delete(commentId);
      return;
    }

    for (const [parentId, replies] of commentReplies.entries()) {
      const replyIndex = replies.findIndex((item) => item.id === commentId);
      if (replyIndex >= 0) {
        replies.splice(replyIndex, 1);
        commentReplies.set(parentId, replies);
        const parent = topLevel.find((item) => item.id === parentId);
        if (parent) {
          parent.replyCount = Math.max(0, (parent.replyCount || 0) - 1);
        }
        return;
      }
    }

    throw new Error("Reply not found");
  }

  async togglePostLike(postId: string): Promise<Post> {
    await wait(120);
    const target = state.posts.find((item) => item.id === postId);

    if (!target) {
      throw new Error("Post not found");
    }

    target.liked = !target.liked;
    target.likesCount = Math.max(0, target.likesCount + (target.liked ? 1 : -1));

    const cloned = clonePostById(postId);
    if (!cloned) {
      throw new Error("Post not found");
    }

    return cloned;
  }

  async togglePostSave(postId: string): Promise<Post> {
    await wait(120);
    const target = state.posts.find((item) => item.id === postId);

    if (!target) {
      throw new Error("Post not found");
    }

    target.saved = !target.saved;

    const cloned = clonePostById(postId);
    if (!cloned) {
      throw new Error("Post not found");
    }

    return cloned;
  }

  async sharePost(postId: string): Promise<Post> {
    await wait(100);
    const target = state.posts.find((item) => item.id === postId);

    if (!target) {
      throw new Error("Post not found");
    }

    target.sharesCount += 1;

    const sharedStory: Story = {
      id: buildId("s"),
      user: getUsers()[0],
      type: "media",
      media: target.media[0],
      text: target.caption,
      mentions: target.mentions,
      hashtags: target.hashtags,
      visibility: "public",
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      viewed: false,
      liked: false,
      reactionCount: 0,
      allowReplies: true,
      allowSharing: true,
    };

    state.stories.unshift(sharedStory);

    const cloned = clonePostById(postId);
    if (!cloned) {
      throw new Error("Post not found");
    }

    return cloned;
  }

  async addPostComment(postId: string, text: string, parentCommentId?: string): Promise<Comment> {
    await wait(120);

    const targetPost = state.posts.find((item) => item.id === postId);
    if (!targetPost) {
      throw new Error("Post not found");
    }

    const comment: Comment = {
      id: buildId("c"),
      postId,
      parentCommentId: parentCommentId || null,
      user: getUsers()[0],
      text: normalizeCommentText(text),
      createdAt: Date.now(),
      liked: false,
      likesCount: 0,
      canDelete: true,
      replyCount: 0,
      mentions: [],
    };

    if (parentCommentId) {
      const replies = commentReplies.get(parentCommentId) || [];
      replies.push(comment);
      commentReplies.set(parentCommentId, replies);

      const parent = ensurePostComments(postId).find((item) => item.id === parentCommentId);
      if (parent) {
        parent.replyCount = (parent.replyCount || 0) + 1;
      }
    } else {
      const existing = ensurePostComments(postId);
      existing.unshift(comment);
      postComments.set(postId, existing);
    }

    targetPost.commentsCount += 1;
    return cloneComment(comment);
  }

  async getPostComments(postId: string): Promise<Comment[]> {
    await wait(100);
    const post = state.posts.find((item) => item.id === postId);

    if (!post) {
      throw new Error("Post not found");
    }

    return cloneComments(ensurePostComments(postId)).sort((a, b) => b.createdAt - a.createdAt);
  }

  async togglePostCommentLike(postId: string, commentId: string): Promise<Comment> {
    await wait(80);
    const comments = ensurePostComments(postId);
    const target =
      comments.find((item) => item.id === commentId) ||
      Array.from(commentReplies.values())
        .flat()
        .find((item) => item.postId === postId && item.id === commentId);

    if (!target) {
      throw new Error("Comment not found");
    }

    target.liked = !target.liked;
    target.likesCount = Math.max(0, target.likesCount + (target.liked ? 1 : -1));

    return cloneComment(target);
  }

  async deletePostComment(postId: string, commentId: string): Promise<void> {
    await wait(90);
    const comments = ensurePostComments(postId);
    const idx = comments.findIndex((item) => item.id === commentId);
    const comment =
      idx >= 0
        ? comments[idx]
        : Array.from(commentReplies.values())
            .flat()
            .find((item) => item.postId === postId && item.id === commentId);

    if (!comment) {
      throw new Error("Comment not found");
    }
    const currentUserId = getCurrentUserId();

    if (comment.user.id !== currentUserId && !comment.canDelete) {
      throw new Error("You can only delete your own comments.");
    }

    if (idx >= 0) {
      comments.splice(idx, 1);
      postComments.set(postId, comments);
      commentReplies.delete(commentId);
    } else {
      for (const [parentId, replies] of commentReplies.entries()) {
        const replyIndex = replies.findIndex((item) => item.id === commentId);
        if (replyIndex >= 0) {
          replies.splice(replyIndex, 1);
          commentReplies.set(parentId, replies);
          const parent = comments.find((item) => item.id === parentId);
          if (parent) {
            parent.replyCount = Math.max(0, (parent.replyCount || 0) - 1);
          }
          break;
        }
      }
    }

    const post = state.posts.find((item) => item.id === postId);
    if (post) {
      post.commentsCount = Math.max(0, post.commentsCount - 1);
    }
  }

  async updatePost(postId: string, input: UpdatePostInput): Promise<Post> {
    await wait(140);
    const target = state.posts.find((item) => item.id === postId);

    if (!target) {
      throw new Error("Post not found");
    }

    const payload = normalizeUpdatePostInput(input);

    if (payload.caption !== undefined) {
      target.caption = payload.caption;
    }

    if (payload.location !== undefined) {
      target.location = payload.location;
    }

    if (payload.music !== undefined) {
      target.music = payload.music;
    }

    if (payload.hashtags !== undefined) {
      target.hashtags = payload.hashtags;
    }

    if (payload.mentions !== undefined) {
      target.mentions = payload.mentions;
    }

    if (payload.settings) {
      target.settings = {
        ...target.settings,
        ...payload.settings,
      };
    }

    target.editedAt = Date.now();

    const cloned = clonePostById(postId);
    if (!cloned) {
      throw new Error("Post not found");
    }

    return cloned;
  }

  async archivePost(postId: string): Promise<void> {
    await wait(100);
    const target = state.posts.find((item) => item.id === postId);

    if (!target) {
      throw new Error("Post not found");
    }

    assertCurrentUserOwns(target.user.id, POST_DELETE_OWNER_ERROR);
    archivedPostIds.add(postId);
  }

  async restorePost(postId: string): Promise<void> {
    await wait(100);
    const target = state.posts.find((item) => item.id === postId);

    if (!target) {
      throw new Error("Post not found");
    }

    assertCurrentUserOwns(target.user.id, POST_DELETE_OWNER_ERROR);
    archivedPostIds.delete(postId);
  }

  async deletePost(postId: string): Promise<void> {
    await wait(100);
    const idx = state.posts.findIndex((item) => item.id === postId);

    if (idx < 0) {
      throw new Error("Post not found");
    }

    assertCurrentUserOwns(state.posts[idx]?.user?.id || "", POST_DELETE_OWNER_ERROR);
    state.posts.splice(idx, 1);
    archivedPostIds.delete(postId);
    postComments.delete(postId);
  }

  async toggleReelLike(reelId: string): Promise<Reel> {
    await wait(120);
    const target = state.reels.find((item) => item.id === reelId);

    if (!target) {
      throw new Error("Swipe not found");
    }

    target.liked = !target.liked;
    target.likesCount = Math.max(0, target.likesCount + (target.liked ? 1 : -1));

    const reel = state.reels.find((item) => item.id === reelId);
    if (!reel) {
      throw new Error("Swipe not found");
    }

    return {
      ...reel,
      user: { ...reel.user },
      media: { ...reel.media },
      hashtags: [...reel.hashtags],
      mentions: [...reel.mentions],
    };
  }

  async toggleSwipeLike(swipeId: string): Promise<Reel> {
    return this.toggleReelLike(swipeId);
  }

  async toggleReelSave(reelId: string): Promise<Reel> {
    await wait(90);
    const target = state.reels.find((item) => item.id === reelId);

    if (!target) {
      throw new Error("Swipe not found");
    }

    target.saved = !target.saved;

    return {
      ...target,
      user: { ...target.user },
      media: { ...target.media },
      hashtags: [...target.hashtags],
      mentions: [...target.mentions],
    };
  }

  async toggleSwipeSave(swipeId: string): Promise<Reel> {
    return this.toggleReelSave(swipeId);
  }

  async shareReel(reelId: string): Promise<Reel> {
    await wait(80);
    const target = state.reels.find((item) => item.id === reelId);

    if (!target) {
      throw new Error("Swipe not found");
    }

    target.sharesCount += 1;

    return {
      ...target,
      user: { ...target.user },
      media: { ...target.media },
      hashtags: [...target.hashtags],
      mentions: [...target.mentions],
    };
  }

  async shareSwipe(swipeId: string): Promise<Reel> {
    return this.shareReel(swipeId);
  }

  async getReelComments(reelId: string): Promise<ReelComment[]> {
    await wait(100);
    const reel = state.reels.find((item) => item.id === reelId);
    if (!reel) {
      throw new Error("Swipe not found");
    }

    return cloneReelComments(ensureReelComments(reelId)).sort((a, b) => b.createdAt - a.createdAt);
  }

  async getSwipeComments(swipeId: string): Promise<ReelComment[]> {
    return this.getReelComments(swipeId);
  }

  async addReelComment(reelId: string, text: string, parentCommentId?: string): Promise<ReelComment> {
    await wait(110);
    const reel = state.reels.find((item) => item.id === reelId);
    if (!reel) {
      throw new Error("Swipe not found");
    }

    const comment: ReelComment = {
      id: buildId("rc"),
      reelId,
      parentCommentId: parentCommentId || null,
      user: getUsers()[0],
      text: normalizeCommentText(text),
      createdAt: Date.now(),
      liked: false,
      likesCount: 0,
      canDelete: true,
      replyCount: 0,
    };

    if (parentCommentId) {
      const replies = commentReplies.get(parentCommentId) || [];
      replies.push({
        id: comment.id,
        postId: reelId,
        parentCommentId,
        user: comment.user,
        text: comment.text,
        createdAt: comment.createdAt,
        liked: comment.liked,
        likesCount: comment.likesCount,
        canDelete: comment.canDelete,
        replyCount: 0,
        mentions: [],
      });
      commentReplies.set(parentCommentId, replies);

      const parent = ensureReelComments(reelId).find((item) => item.id === parentCommentId);
      if (parent) {
        parent.replyCount = (parent.replyCount || 0) + 1;
      }
    } else {
      const comments = ensureReelComments(reelId);
      comments.unshift(comment);
      reelComments.set(reelId, comments);
    }
    reel.commentsCount += 1;
    return cloneReelComment(comment);
  }

  async addSwipeComment(swipeId: string, text: string, parentCommentId?: string): Promise<ReelComment> {
    return this.addReelComment(swipeId, text, parentCommentId);
  }

  async toggleReelCommentLike(reelId: string, commentId: string): Promise<ReelComment> {
    await wait(80);
    const comments = ensureReelComments(reelId);
    const target =
      comments.find((item) => item.id === commentId) ||
      Array.from(commentReplies.values())
        .flat()
        .find((item) => item.postId === reelId && item.id === commentId);

    if (!target) {
      throw new Error("Comment not found");
    }

    target.liked = !target.liked;
    target.likesCount = Math.max(0, target.likesCount + (target.liked ? 1 : -1));
    return cloneReelComment({
      id: target.id,
      reelId,
      parentCommentId: target.parentCommentId || null,
      user: target.user,
      text: target.text,
      createdAt: target.createdAt,
      liked: target.liked,
      likesCount: target.likesCount,
      canDelete: target.canDelete,
      replyCount: target.replyCount,
    });
  }

  async toggleSwipeCommentLike(swipeId: string, commentId: string): Promise<ReelComment> {
    return this.toggleReelCommentLike(swipeId, commentId);
  }

  async deleteReelComment(reelId: string, commentId: string): Promise<void> {
    await wait(90);
    const comments = ensureReelComments(reelId);
    const idx = comments.findIndex((item) => item.id === commentId);
    const comment =
      idx >= 0
        ? comments[idx]
        : Array.from(commentReplies.values())
            .flat()
            .find((item) => item.postId === reelId && item.id === commentId);

    if (!comment) {
      throw new Error("Comment not found");
    }
    const currentUserId = getCurrentUserId();
    if (comment.user.id !== currentUserId && !comment.canDelete) {
      throw new Error("You can only delete your own comments.");
    }

    if (idx >= 0) {
      comments.splice(idx, 1);
      reelComments.set(reelId, comments);
      commentReplies.delete(commentId);
    } else {
      for (const [parentId, replies] of commentReplies.entries()) {
        const replyIndex = replies.findIndex((item) => item.id === commentId);
        if (replyIndex >= 0) {
          replies.splice(replyIndex, 1);
          commentReplies.set(parentId, replies);
          const parent = comments.find((item) => item.id === parentId);
          if (parent) {
            parent.replyCount = Math.max(0, (parent.replyCount || 0) - 1);
          }
          break;
        }
      }
    }

    const reel = state.reels.find((item) => item.id === reelId);
    if (reel) {
      reel.commentsCount = Math.max(0, reel.commentsCount - 1);
    }
  }

  async deleteSwipeComment(swipeId: string, commentId: string): Promise<void> {
    await this.deleteReelComment(swipeId, commentId);
  }

  async createPost(input: CreatePostInput): Promise<Post> {
    await wait(REQUEST_DELAY_MS);
    const payload = normalizePostInput(input);

    const post: Post = {
      id: buildId("p"),
      user: getUsers()[0],
      type: payload.type,
      caption: payload.caption,
      media: payload.media,
      location: payload.location,
      music: formatMusicLabel(payload.music),
      hashtags: payload.hashtags || [],
      mentions: payload.mentions || [],
      collaboratorIds: payload.collaboratorIds || [],
      settings: {
        disableComments: payload.settings?.disableComments || false,
        hideLikeCount: payload.settings?.hideLikeCount || false,
        allowRemix: payload.settings?.allowRemix ?? true,
      },
      createdAt: Date.now(),
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      liked: false,
      saved: false,
    };

    state.posts.unshift(post);

    const cloned = clonePostById(post.id);
    if (!cloned) {
      throw new Error("Could not create post");
    }

    return cloned;
  }

  async createStory(input: CreateStoryInput): Promise<Story> {
    await wait(REQUEST_DELAY_MS);
    const payload = normalizeStoryInput(input);

    const story: Story = {
      id: buildId("s"),
      user: getUsers()[0],
      type: payload.type,
      media: payload.media,
      text: payload.text,
      backgroundColor: payload.backgroundColor,
      poll: payload.poll
        ? {
            question: payload.poll.question,
            options: payload.poll.options,
            votes: [0, 0],
          }
        : undefined,
      question: payload.question
        ? {
            prompt: payload.question.prompt,
            responseCount: 0,
          }
        : undefined,
      linkUrl: payload.linkUrl,
      mentions: payload.mentions || [],
      hashtags: payload.hashtags || [],
      visibility: payload.visibility || "public",
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      viewed: false,
      liked: false,
      reactionCount: 0,
      allowReplies: payload.allowReplies,
      allowSharing: payload.allowSharing,
      music: mapStoryMusicDetails(payload.music, {
        startTime: payload.music?.clipStartTime,
        duration: payload.music?.clipDuration,
      }),
    };

    state.stories.unshift(story);

    const found = state.stories.find((item) => item.id === story.id);
    if (!found) {
      throw new Error("Could not create story");
    }

    return syncMockStoryMeta(found);
  }

  async updateStory(storyId: string, input: UpdateStoryInput): Promise<Story> {
    await wait(130);
    const target = state.stories.find((item) => item.id === storyId);

    if (!target) {
      throw new Error("Story not found");
    }

    const payload = normalizeUpdateStoryInput(input);

    if (payload.text !== undefined) {
      target.text = payload.text;
    }

    if (payload.backgroundColor !== undefined) {
      target.backgroundColor = payload.backgroundColor;
    }

    if (payload.linkUrl !== undefined) {
      target.linkUrl = payload.linkUrl;
    }

    if (payload.visibility !== undefined) {
      target.visibility = payload.visibility;
    }

    if (payload.allowReplies !== undefined) {
      target.allowReplies = payload.allowReplies;
    }

    if (payload.allowSharing !== undefined) {
      target.allowSharing = payload.allowSharing;
    }

    if (payload.music !== undefined) {
      target.music = payload.music;
    }

    return syncMockStoryMeta(target);
  }

  async archiveStory(storyId: string): Promise<void> {
    await wait(90);
    const target = state.stories.find((item) => item.id === storyId);

    if (!target) {
      throw new Error("Story not found");
    }

    assertCurrentUserOwns(target.user.id, STORY_OWNER_ERROR);
    archivedStoryIds.add(storyId);
  }

  async restoreStory(storyId: string): Promise<void> {
    await wait(90);
    const target = state.stories.find((item) => item.id === storyId);

    if (!target) {
      throw new Error("Story not found");
    }

    assertCurrentUserOwns(target.user.id, STORY_OWNER_ERROR);
    archivedStoryIds.delete(storyId);
  }

  async deleteStory(storyId: string): Promise<void> {
    await wait(90);
    const idx = state.stories.findIndex((item) => item.id === storyId);

    if (idx < 0) {
      throw new Error("Story not found");
    }

    assertCurrentUserOwns(state.stories[idx]?.user?.id || "", STORY_OWNER_ERROR);
    state.stories.splice(idx, 1);
    archivedStoryIds.delete(storyId);
    storyComments.delete(storyId);
    storyViewers.delete(storyId);
    storyLikers.delete(storyId);
  }

  async getStoryViewers(storyId: string): Promise<StoryViewerEntry[]> {
    await wait(100);
    const story = state.stories.find((item) => item.id === storyId);
    if (!story) {
      throw new Error("Story not found");
    }

    assertCurrentUserOwns(story.user.id, STORY_INSIGHTS_OWNER_ERROR);
    return ensureStoryViewers(storyId).map((entry) => ({ ...entry, user: { ...entry.user } }));
  }

  async getStoryLikers(storyId: string): Promise<SocialUser[]> {
    await wait(100);
    const story = state.stories.find((item) => item.id === storyId);
    if (!story) {
      throw new Error("Story not found");
    }

    assertCurrentUserOwns(story.user.id, STORY_INSIGHTS_OWNER_ERROR);
    ensureStoryViewers(storyId);
    return cloneUsers(storyLikers.get(storyId) || []);
  }

  async reportContent(contentType: ContentKind, contentId: string, reason: ReportReason, note?: string): Promise<void> {
    await loadModerationPrefs();
    await wait(90);
    reports.push({
      contentType,
      contentId,
      reason,
      note: normalizeReportNote(note),
      createdAt: Date.now(),
    });
    await persistModerationPrefs();
  }

  async muteUser(userId: string): Promise<void> {
    await loadModerationPrefs();
    await wait(60);
    mutedUserIds.add(userId);
    await persistModerationPrefs();
  }

  async blockUser(userId: string): Promise<void> {
    await loadModerationPrefs();
    await wait(60);
    blockedUserIds.add(userId);
    await persistModerationPrefs();
  }

  async unblockUser(userId: string): Promise<void> {
    await loadModerationPrefs();
    await wait(60);
    blockedUserIds.delete(userId);
    await persistModerationPrefs();
  }

  async markNotInterested(contentType: ContentKind, contentId: string): Promise<void> {
    await loadModerationPrefs();
    await wait(60);
    hiddenContentKeys.add(buildContentKey(contentType, contentId));
    await persistModerationPrefs();
  }

  async createReel(input: CreateReelInput): Promise<Reel> {
    await wait(REQUEST_DELAY_MS);
    const payload = normalizeReelInput(input);

    const reel: Reel = {
      id: buildId("r"),
      user: getUsers()[0],
      caption: payload.caption,
      media: payload.media,
      thumbnailUrl: payload.thumbnailUrl || payload.media.thumbnailUrl || payload.media.url,
      music: formatMusicLabel(payload.music),
      hashtags: payload.hashtags || [],
      mentions: payload.mentions || [],
      location: payload.location,
      createdAt: Date.now(),
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      liked: false,
      saved: false,
    };

    state.reels.unshift(reel);

    return {
      ...reel,
      user: { ...reel.user },
      media: { ...reel.media },
      hashtags: [...reel.hashtags],
      mentions: [...reel.mentions],
    };
  }

  async createSwipe(input: CreateSwipeInput): Promise<Reel> {
    return this.createReel(input);
  }
}

class RemoteSocialApi implements SocialApi {
  private readonly mock = new MockSocialApi();
  private readonly fallbackAvatarUrl = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
  private readonly postCache = new Map<string, Post>();
  private readonly storyCache = new Map<string, Story>();
  private readonly reelCache = new Map<string, Reel>();
  private readonly commentCache = new Map<string, Comment | ReelComment>();
  private readonly storyReplyCache = new Map<string, Comment[]>();
  private readonly commentReplyCache = new Map<string, Comment[]>();

  private getId(value: any): string {
    if (!value) {
      return "";
    }

    if (typeof value === "string") {
      return value;
    }

    if (typeof value === "number") {
      return String(value);
    }

    if (typeof value._id !== "undefined") {
      return this.getId(value._id);
    }

    if (typeof value.id !== "undefined") {
      return this.getId(value.id);
    }

    return "";
  }

  private isBackendObjectId(value: string): boolean {
    return /^[a-fA-F0-9]{24}$/.test(value);
  }

  private assertSyncedPostId(postId: string): void {
    if (!this.isBackendObjectId(postId)) {
      throw new Error(SYNC_REQUIRED_POST_ERROR);
    }
  }

  private assertSyncedStoryId(storyId: string): void {
    if (!this.isBackendObjectId(storyId)) {
      throw new Error(SYNC_REQUIRED_STORY_ERROR);
    }
  }

  private async requireOwnedPost(postId: string, message = POST_DELETE_OWNER_ERROR): Promise<void> {
    this.assertSyncedPostId(postId);
    const currentUserId = await this.getCurrentUserId();
    const cached = this.postCache.get(postId);

    if (cached && cached.user.id !== currentUserId) {
      throw new Error(message);
    }
  }

  private async requireOwnedStory(storyId: string, message: string): Promise<Story> {
    this.assertSyncedStoryId(storyId);

    const cached = this.storyCache.get(storyId);
    const story = cached || (await this.getStory(storyId));

    if (!story.isOwner) {
      throw new Error(message);
    }

    return story;
  }

  private getCachedStorySequence(storyId: string): StorySequenceResponse {
    const story = this.storyCache.get(storyId);

    if (!story) {
      return {
        stories: [],
        startIndex: 0,
      };
    }

    const stories = Array.from(this.storyCache.values());
    const sameUserStories = stories.filter((item) => item.user.id === story.user.id);
    const remainingUserIds = Array.from(
      new Set(stories.filter((item) => item.user.id !== story.user.id).map((item) => item.user.id)),
    );
    const others = remainingUserIds.flatMap((userId) => stories.filter((item) => item.user.id === userId));
    const list = [...sameUserStories, ...others].map((item) => ({
      ...item,
      user: { ...item.user },
      media: item.media ? { ...item.media } : undefined,
      poll: item.poll
        ? {
            ...item.poll,
            options: [...item.poll.options] as [string, string],
            votes: [...item.poll.votes] as [number, number],
          }
        : undefined,
      question: item.question ? { ...item.question } : undefined,
      music: item.music ? { ...item.music } : undefined,
    }));

    return {
      stories: list,
      startIndex: Math.max(0, list.findIndex((item) => item.id === storyId)),
    };
  }

  private toTimestamp(value: any): number {
    if (typeof value === "number") {
      return value;
    }

    if (!value) {
      return Date.now();
    }

    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }

  private mapUser(user: any) {
    return {
      id: this.getId(user),
      username: user?.username || "user",
      name: user?.name || user?.fullName || user?.username || "User",
      avatarUrl: user?.profilePic || user?.avatarUrl || this.fallbackAvatarUrl,
      isVerified: !!user?.isVerified,
    };
  }

  private mapMentionNames(mentions: any): string[] {
    if (!Array.isArray(mentions)) {
      return [];
    }

    return mentions
      .map((item: any) => {
        const value = typeof item === "string" ? item : item?.username;
        return typeof value === "string" ? value.replace(/^@/, "").trim() : "";
      })
      .filter(Boolean);
  }

  private mapMediaAsset(item: any, index = 0, prefix = "media"): MediaAsset {
    return {
      id: this.getId(item) || `${prefix}_${index}`,
      mediaType: item?.type === "video" || item?.mediaType === "video" ? "video" : "image",
      url: item?.url || item?.mediaUrl || item?.image || "",
      thumbnailUrl: item?.thumbnailUrl,
      durationMs:
        typeof item?.durationMs === "number"
          ? item.durationMs
          : typeof item?.duration === "number"
            ? item.duration * 1000
            : undefined,
      width: item?.width,
      height: item?.height,
    };
  }

  private getPostMedia(post: any) {
    if (Array.isArray(post?.media) && post.media.length > 0) {
      return post.media.map((item: any, index: number) => this.mapMediaAsset(item, index, "post_media"));
    }

    if (post?.image) {
      return [this.mapMediaAsset({ url: post.image, type: "image" }, 0, "post_media")];
    }

    return [];
  }

  private mapPost(post: any, overrides: Partial<Post> = {}): Post {
    const media = this.getPostMedia(post);
    const type = media.length > 1 ? "carousel" : media[0]?.mediaType === "video" || post?.postType === "reel" ? "video" : "photo";

    return {
      id: this.getId(post),
      user: this.mapUser(post?.user),
      type,
      caption: post?.caption || "",
      media,
      location: typeof post?.location === "string" ? post.location : post?.location?.name,
      music: formatMusicLabel(post?.music),
      hashtags: Array.isArray(post?.hashtags) ? post.hashtags : [],
      mentions: this.mapMentionNames(post?.mentions),
      collaboratorIds: Array.isArray(post?.collaborators) ? post.collaborators.map((item: any) => this.getId(item)) : [],
      settings: {
        disableComments: !!post?.commentsDisabled,
        hideLikeCount: !!post?.likesHidden,
        allowRemix: true,
      },
      createdAt: this.toTimestamp(post?.createdAt),
      editedAt: post?.updatedAt && post?.updatedAt !== post?.createdAt ? this.toTimestamp(post.updatedAt) : undefined,
      likesCount: typeof post?.likes === "number" ? post.likes : 0,
      commentsCount: typeof post?.comments === "number" ? post.comments : 0,
      sharesCount: typeof post?.shares === "number" ? post.shares : 0,
      liked: typeof post?.liked === "boolean" ? post.liked : false,
      saved: typeof post?.saved === "boolean" ? post.saved : false,
      ...overrides,
    };
  }

  private mapReel(post: any, overrides: Partial<Reel> = {}): Reel {
    const media = this.getPostMedia(post);
    const primary = media[0] || this.mapMediaAsset(post, 0, "reel_media");

    return {
      id: this.getId(post),
      user: this.mapUser(post?.user),
      caption: post?.caption || "",
      media: primary,
      thumbnailUrl: primary.thumbnailUrl || primary.url,
      music: formatMusicLabel(post?.music),
      hashtags: Array.isArray(post?.hashtags) ? post.hashtags : [],
      mentions: this.mapMentionNames(post?.mentions),
      location: typeof post?.location === "string" ? post.location : post?.location?.name,
      createdAt: this.toTimestamp(post?.createdAt),
      likesCount: typeof post?.likes === "number" ? post.likes : 0,
      commentsCount: typeof post?.comments === "number" ? post.comments : 0,
      sharesCount: typeof post?.shares === "number" ? post.shares : 0,
      liked: typeof post?.liked === "boolean" ? post.liked : false,
      saved: typeof post?.saved === "boolean" ? post.saved : false,
      ...overrides,
    };
  }

  private mapStory(story: any, overrides: Partial<Story> = {}): Story {
    const stickers = Array.isArray(story?.stickers) ? story.stickers : [];
    const pollSticker = stickers.find((item: any) => item?.type === "poll");
    const questionSticker = stickers.find((item: any) => item?.type === "question");
    const storyType = pollSticker ? "poll" : questionSticker ? "question" : !story?.mediaUrl && story?.caption ? "text" : "media";

    return {
      id: this.getId(story),
      user: this.mapUser(story?.user),
      type: storyType,
      media: story?.mediaUrl ? this.mapMediaAsset({
        type: story?.mediaType,
        url: story.mediaUrl,
        thumbnailUrl: story.thumbnailUrl,
        duration: story.duration,
      }, 0, "story_media") : undefined,
      text: storyType === "text" ? story?.caption || "" : undefined,
      backgroundColor: undefined,
      poll: pollSticker
        ? {
            question: pollSticker?.text || "Poll",
            options: [
              pollSticker?.pollOptions?.[0]?.text || "Option 1",
              pollSticker?.pollOptions?.[1]?.text || "Option 2",
            ],
            votes: [
              pollSticker?.pollOptions?.[0]?.votes || 0,
              pollSticker?.pollOptions?.[1]?.votes || 0,
            ],
          }
        : undefined,
      question: questionSticker
        ? {
            prompt: questionSticker?.text || "Ask anything",
            responseCount: 0,
          }
        : undefined,
      linkUrl: undefined,
      mentions: stickers
        .filter((item: any) => item?.type === "mention" && item?.text)
        .map((item: any) => item.text),
      hashtags: stickers
        .filter((item: any) => item?.type === "hashtag" && item?.text)
        .map((item: any) => item.text),
      visibility:
        story?.visibility === "close_friends" ||
        story?.visibility === "friends" ||
        story?.visibility === "custom"
          ? story.visibility
          : "public",
      createdAt: this.toTimestamp(story?.createdAt),
      expiresAt: this.toTimestamp(story?.expiresAt),
      viewed: false,
      liked: false,
      reactionCount: 0,
      viewCount: typeof story?.viewCount === "number" ? story.viewCount : 0,
      replyCount: typeof story?.replyCount === "number" ? story.replyCount : 0,
      allowReplies: story?.allowReplies !== false,
      allowSharing: story?.allowSharing !== false,
      music: mapStoryMusicDetails(story?.music, story?.musicConfig),
      ...overrides,
    };
  }

  private mapComment(comment: any, context: { postId?: string; storyId?: string }, currentUserId: string): Comment {
    return {
      id: this.getId(comment),
      postId: context.postId,
      storyId: context.storyId,
      parentCommentId: this.getId(comment?.parentComment) || null,
      user: this.mapUser(comment?.user),
      text: comment?.text || "",
      createdAt: this.toTimestamp(comment?.createdAt),
      liked: false,
      likesCount: typeof comment?.likes === "number" ? comment.likes : 0,
      canDelete: this.getId(comment?.user) === currentUserId,
      replyCount: typeof comment?.replyCount === "number" ? comment.replyCount : 0,
      mentions: Array.isArray(comment?.mentions) ? comment.mentions.map((item: any) => item?.username).filter(Boolean) : [],
    };
  }

  private mapReelComment(comment: any, reelId: string, currentUserId: string): ReelComment {
    return {
      id: this.getId(comment),
      reelId,
      parentCommentId: this.getId(comment?.parentComment) || null,
      user: this.mapUser(comment?.user),
      text: comment?.text || "",
      createdAt: this.toTimestamp(comment?.createdAt),
      liked: false,
      likesCount: typeof comment?.likes === "number" ? comment.likes : 0,
      canDelete: this.getId(comment?.user) === currentUserId,
      replyCount: typeof comment?.replyCount === "number" ? comment.replyCount : 0,
    };
  }

  private mapStoryViewerEntry(view: any): StoryViewerEntry {
    return {
      user: this.mapUser(view?.viewer || view?.user),
      viewedAt: this.toTimestamp(view?.lastViewedAt || view?.createdAt),
      liked: !!view?.interactions?.liked,
    };
  }

  private cachePosts(posts: Post[]) {
    posts.forEach((post) => this.postCache.set(post.id, post));
    return posts;
  }

  private cacheStories(stories: Story[]) {
    stories.forEach((story) => this.storyCache.set(story.id, story));
    return stories;
  }

  private cacheReels(reels: Reel[]) {
    reels.forEach((reel) => this.reelCache.set(reel.id, reel));
    return reels;
  }

  private cacheComments(comments: Array<Comment | ReelComment>) {
    comments.forEach((comment) => this.commentCache.set(comment.id, comment));
    return comments;
  }

  private async getCurrentUserId(): Promise<string> {
    return getStoredUserId();
  }

  private async getSavedPostIds(): Promise<Set<string>> {
    try {
      const res = await API.get("/user/posts/saved");
      return new Set((res?.data?.posts || []).map((item: any) => this.getId(item)));
    } catch {
      return new Set<string>();
    }
  }

  private async getLikeStatusMap(ids: string[], key: "postId" | "storyId"): Promise<Map<string, boolean>> {
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await API.get("/like/status", {
            params: { [key]: id },
          });
          return [id, !!res?.data?.liked] as const;
        } catch {
          return [id, false] as const;
        }
      }),
    );

    return new Map(results);
  }

  private async getStoryFeedGroups(): Promise<any[]> {
    const res = await API.get("/story/feed");
    return Array.isArray(res?.data?.stories) ? res.data.stories : [];
  }

  private async resolveStorySequenceFromUser(
    storyId: string,
    storyUserId: string,
    currentUserId: string,
  ): Promise<StorySequenceResponse> {
    const res = await API.get(`/story/user/${storyUserId}`);
    const storyPayload = Array.isArray(res?.data?.stories) ? res.data.stories : [];
    const likes = await this.getLikeStatusMap(
      storyPayload.map((story: any) => this.getId(story)),
      "storyId",
    );
    const stories = this.cacheStories(
      storyPayload.map((story: any) =>
        this.mapStory(story, {
          liked: !!likes.get(this.getId(story)),
          isOwner: this.getId(story?.user) === currentUserId,
        }),
      ),
    );
    const visibleStories = applyContentVisibilityFilters(stories, "story");
    const startIndex = visibleStories.findIndex((story) => story.id === storyId);

    if (startIndex < 0) {
      throw new Error("Story not found or no longer available.");
    }

    return {
      stories: visibleStories,
      startIndex,
    };
  }

  private getCachedPost(postId: string): Post {
    const cached = this.postCache.get(postId);
    if (!cached) {
      throw new Error("Post not found");
    }
    return { ...cached };
  }

  private getCachedStory(storyId: string): Story {
    const cached = this.storyCache.get(storyId);
    if (!cached) {
      throw new Error("Story not found");
    }
    return { ...cached };
  }

  private getCachedReel(reelId: string): Reel {
    const cached = this.reelCache.get(reelId);
    if (!cached) {
      throw new Error("Swipe not found");
    }
    return { ...cached };
  }

  async getFeed(): Promise<FeedResponse> {
    await loadModerationPrefs();
    const [postsRes, storyGroups, currentUserId] = await Promise.all([
      API.get("/posts/feed"),
      this.getStoryFeedGroups(),
      this.getCurrentUserId(),
    ]);

    const postPayload = Array.isArray(postsRes?.data?.posts) ? postsRes.data.posts : [];

    const posts = this.cachePosts(
      postPayload.map((post: any) => this.mapPost(post)),
    );

    const stories = this.cacheStories(
      storyGroups
        .map((group: any) => {
          const leadStory = Array.isArray(group?.stories) ? group.stories[0] : null;
          if (!leadStory) {
            return null;
          }

          return this.mapStory(
            {
              ...leadStory,
              user: leadStory.user || group.user,
            },
            {
              viewed: !group?.hasUnseenStories,
              isOwner: this.getId(leadStory?.user || group?.user) === currentUserId,
            },
          );
        })
        .filter(Boolean) as Story[],
    );

    return {
      stories: applyContentVisibilityFilters(stories, "story"),
      posts: applyContentVisibilityFilters(posts, "post"),
    };
  }

  async getReels(): Promise<Reel[]> {
    return this.getSwipes();
  }

  async getSwipes(): Promise<Reel[]> {
    await loadModerationPrefs();
    const [reelsRes, savedIds] = await Promise.all([
      API.get("/search/reels"),
      this.getSavedPostIds(),
    ]);

    const reelPayload = Array.isArray(reelsRes?.data?.reels) ? reelsRes.data.reels : [];
    const reelLikes = await this.getLikeStatusMap(reelPayload.map((reel: any) => this.getId(reel)), "postId");

    const reels = this.cacheReels(
      reelPayload.map((reel: any) =>
        this.mapReel(reel, {
          liked: !!reelLikes.get(this.getId(reel)),
          saved: savedIds.has(this.getId(reel)),
        }),
      ),
    );

    return applyContentVisibilityFilters(reels, "swipe");
  }

  async getStorySequence(storyId: string, options?: GetStorySequenceOptions): Promise<StorySequenceResponse> {
    await loadModerationPrefs();
    if (!this.isBackendObjectId(storyId)) {
      return this.getCachedStorySequence(storyId);
    }

    const [groups, currentUserId] = await Promise.all([this.getStoryFeedGroups(), this.getCurrentUserId()]);
    const targetGroup = groups.find((group: any) =>
      Array.isArray(group?.stories) && group.stories.some((story: any) => this.getId(story) === storyId),
    );

    if (!targetGroup) {
      if (options?.storyUserId && this.isBackendObjectId(options.storyUserId)) {
        return this.resolveStorySequenceFromUser(storyId, options.storyUserId, currentUserId);
      }

      const cached = this.storyCache.get(storyId);
      if (cached?.user?.id) {
        return this.resolveStorySequenceFromUser(storyId, cached.user.id, currentUserId);
      }

      throw new Error("Story not found or no longer available.");
    }

    const orderedGroups = [targetGroup, ...groups.filter((group: any) => group !== targetGroup)];
    const storyPayload = orderedGroups.flatMap((group: any) => Array.isArray(group?.stories) ? group.stories : []);
    const likes = await this.getLikeStatusMap(storyPayload.map((story: any) => this.getId(story)), "storyId");
    const stories = this.cacheStories(
      storyPayload.map((story: any) =>
        this.mapStory(story, {
          liked: !!likes.get(this.getId(story)),
          viewed:
            targetGroup === orderedGroups[0] &&
            this.getId(story?.user) === this.getId(targetGroup?.user) &&
            !targetGroup?.hasUnseenStories,
          isOwner: this.getId(story?.user) === currentUserId,
        }),
      ),
    );
    const visibleStories = applyContentVisibilityFilters(stories, "story");
    const startIndex = visibleStories.findIndex((story) => story.id === storyId);

    if (startIndex < 0) {
      throw new Error("Story not found or no longer available.");
    }

    return {
      stories: visibleStories,
      startIndex,
    };
  }

  async getStory(storyId: string): Promise<Story> {
    const cached = this.storyCache.get(storyId);
    if (cached) {
      if (
        blockedUserIds.has(cached.user.id) ||
        mutedUserIds.has(cached.user.id) ||
        hiddenContentKeys.has(buildContentKey("story", cached.id))
      ) {
        throw new Error("Story not available.");
      }
      return { ...cached };
    }

    const sequence = await this.getStorySequence(storyId);
    const story = sequence.stories.find((item) => item.id === storyId);

    if (!story) {
      throw new Error("Story not found");
    }

    return story;
  }

  async getPost(postId: string): Promise<Post> {
    await loadModerationPrefs();
    const [res, savedIds, likes] = await Promise.all([
      API.get(`/posts/${postId}`),
      this.getSavedPostIds(),
      this.getLikeStatusMap([postId], "postId"),
    ]);

    const post = this.mapPost(res?.data?.post, {
      liked: !!likes.get(postId),
      saved: savedIds.has(postId),
    });

    if (
      blockedUserIds.has(post.user.id) ||
      mutedUserIds.has(post.user.id) ||
      hiddenContentKeys.has(buildContentKey("post", post.id))
    ) {
      throw new Error("Post not available.");
    }

    this.postCache.set(post.id, post);
    return post;
  }

  async getStoryArchive(): Promise<Story[]> {
    await loadModerationPrefs();
    const [res, likes, currentUserId] = await Promise.all([
      API.get("/user/stories/archive"),
      Promise.resolve(new Map<string, boolean>()),
      this.getCurrentUserId(),
    ]);

    const stories = this.cacheStories(
      (res?.data?.stories || []).map((story: any) =>
        this.mapStory(story, {
          liked: !!likes.get(this.getId(story)),
          isOwner: this.getId(story?.user) === currentUserId,
        }),
      ),
    );

    return applyContentVisibilityFilters(stories, "story");
  }

  async getPostArchive(): Promise<Post[]> {
    const res = await API.get("/posts/archive");
    const posts: Post[] = (res?.data?.posts || []).map((post: any) => this.mapPost(post));
    posts.forEach((post) => this.postCache.set(post.id, post));
    return posts;
  }

  async markStoryViewed(storyId: string): Promise<Story> {
    if (!this.isBackendObjectId(storyId)) {
      const cached = this.getCachedStory(storyId);
      const updated = {
        ...cached,
        viewed: true,
      };

      this.storyCache.set(storyId, updated);
      return updated;
    }

    const cached = this.getCachedStory(storyId);
    await API.post(`/story/${storyId}/view`);

    const updated = {
      ...cached,
      viewed: true,
      viewCount: !cached.viewed && !cached.isOwner ? (cached.viewCount || 0) + 1 : cached.viewCount,
    };

    this.storyCache.set(storyId, updated);
    return updated;
  }

  async toggleStoryLike(storyId: string): Promise<Story> {
    if (!this.isBackendObjectId(storyId)) {
      const cached = this.getCachedStory(storyId);

      if (cached.liked) {
        return cached;
      }

      const updated = {
        ...cached,
        liked: true,
        viewed: true,
        reactionCount: Math.max(0, cached.reactionCount + 1),
      };

      this.storyCache.set(storyId, updated);
      return updated;
    }

    const cached = this.getCachedStory(storyId);

    if (cached.liked) {
      return cached;
    }

    const likeStatus = await API.get("/like/status", {
      params: { storyId },
    }).catch(() => ({ data: { liked: false } }));

    if (!cached.viewed && !cached.isOwner) {
      await API.post(`/story/${storyId}/view`).catch(() => undefined);
    }

    await API.post(`/story/${storyId}/react`);

    if (!likeStatus?.data?.liked) {
      await API.post(`/like/story/${storyId}`);
    }

    const updated = {
      ...cached,
      viewed: true,
      liked: true,
      reactionCount: Math.max(0, cached.reactionCount + 1),
      viewCount: !cached.viewed && !cached.isOwner ? (cached.viewCount || 0) + 1 : cached.viewCount,
    };

    this.storyCache.set(storyId, updated);
    return updated;
  }

  async voteStoryPoll(storyId: string, optionIndex: 0 | 1): Promise<Story> {
    const cached = this.getCachedStory(storyId);

    if (!cached.poll) {
      throw new Error("Poll story not found");
    }

    const poll = {
      ...cached.poll,
      options: [...cached.poll.options] as [string, string],
      votes: [...cached.poll.votes] as [number, number],
      selectedIndex: optionIndex,
    };

    if (cached.poll.selectedIndex !== undefined && cached.poll.selectedIndex !== optionIndex) {
      poll.votes[cached.poll.selectedIndex] = Math.max(0, poll.votes[cached.poll.selectedIndex] - 1);
    }

    if (cached.poll.selectedIndex === undefined || cached.poll.selectedIndex !== optionIndex) {
      poll.votes[optionIndex] += 1;
    }

    const updated = {
      ...cached,
      poll,
    };

    this.storyCache.set(storyId, updated);
    return updated;
  }

  async replyToStory(storyId: string, text: string): Promise<StoryReply> {
    const comment = await this.addStoryReply(storyId, text);
    return {
      id: comment.id,
      storyId,
      fromUser: comment.user,
      text: comment.text,
      createdAt: comment.createdAt,
    };
  }

  async getStoryReplies(storyId: string): Promise<Comment[]> {
    await this.requireOwnedStory(storyId, STORY_REPLIES_OWNER_ERROR);

    const [res, currentUserId] = await Promise.all([
      API.get("/comments", {
        params: { storyId },
      }),
      this.getCurrentUserId(),
    ]);

    const comments = this.cacheComments(
      (res?.data?.comments || []).map((comment: any) => this.mapComment(comment, { storyId }, currentUserId)),
    ) as Comment[];
    this.storyReplyCache.set(storyId, comments);
    return comments;
  }

  async addStoryReply(storyId: string, text: string, parentCommentId?: string): Promise<Comment> {
    if (!this.isBackendObjectId(storyId)) {
      const currentUserId = await this.getCurrentUserId();
      const cachedStory = this.storyCache.get(storyId);
      const comment: Comment = {
        id: buildId(parentCommentId ? "scr" : "sc"),
        storyId,
        parentCommentId: parentCommentId || null,
        user: cachedStory?.user.id === currentUserId ? { ...cachedStory.user } : {
          id: currentUserId || "local_user",
          username: "you",
          name: "You",
          avatarUrl: this.fallbackAvatarUrl,
        },
        text: normalizeCommentText(text),
        createdAt: Date.now(),
        liked: false,
        likesCount: 0,
        canDelete: true,
        replyCount: 0,
        mentions: [],
      };

      this.commentCache.set(comment.id, comment);

      if (parentCommentId) {
        const replies = this.commentReplyCache.get(parentCommentId) || [];
        this.commentReplyCache.set(parentCommentId, [...replies, comment]);
      } else {
        const existing = this.storyReplyCache.get(storyId) || [];
        this.storyReplyCache.set(storyId, [comment, ...existing]);
      }

      if (cachedStory) {
        this.storyCache.set(storyId, {
          ...cachedStory,
          replyCount: (cachedStory.replyCount || 0) + 1,
          question: cachedStory.question
            ? {
                ...cachedStory.question,
                responseCount: cachedStory.question.responseCount + 1,
              }
            : undefined,
        });
      }

      return comment;
    }

    const cleanText = normalizeCommentText(text);
    const res = await API.post("/comments/add", {
      storyId,
      text: cleanText,
      parentCommentId,
    });

    const currentUserId = await this.getCurrentUserId();
    const comment = this.mapComment(res?.data?.comment, { storyId }, currentUserId);
    this.commentCache.set(comment.id, comment);

    if (parentCommentId) {
      const replies = this.commentReplyCache.get(parentCommentId) || [];
      this.commentReplyCache.set(parentCommentId, [...replies, comment]);
    } else {
      const existing = this.storyReplyCache.get(storyId) || [];
      this.storyReplyCache.set(storyId, [comment, ...existing]);
    }

    const cached = this.storyCache.get(storyId);
    if (cached) {
      this.storyCache.set(storyId, {
        ...cached,
        replyCount: (cached.replyCount || 0) + 1,
        question: cached.question
          ? {
              ...cached.question,
              responseCount: cached.question.responseCount + 1,
            }
          : undefined,
      });
    }

    if (parentCommentId) {
      const cachedParent = this.commentCache.get(parentCommentId);
      if (cachedParent && "user" in cachedParent) {
        this.commentCache.set(parentCommentId, {
          ...cachedParent,
          replyCount: ((cachedParent as Comment).replyCount || 0) + 1,
        });
      }
    }

    return comment;
  }

  async getCommentReplies(commentId: string): Promise<Comment[]> {
    const cached = this.commentReplyCache.get(commentId);
    if (cached) {
      return cached.map((item) => ({ ...item, user: { ...item.user } }));
    }

    const [res, currentUserId] = await Promise.all([
      API.get(`/comments/${commentId}/replies`),
      this.getCurrentUserId(),
    ]);

    const replies = (res?.data?.replies || []).map((comment: any) =>
      this.mapComment(comment, { storyId: (comment?.story && this.getId(comment.story)) || undefined }, currentUserId),
    );
    this.commentReplyCache.set(commentId, replies);
    this.cacheComments(replies);
    return replies;
  }

  async toggleStoryReplyLike(storyId: string, commentId: string): Promise<Comment> {
    const res = await API.post(`/comments/${commentId}/like`);
    const cached = this.commentCache.get(commentId) as Comment | undefined;

    if (!cached) {
      throw new Error("Reply not found");
    }

    const liked = !!res?.data?.liked;
    const updated = {
      ...cached,
      liked,
      likesCount: Math.max(0, cached.likesCount + (liked ? 1 : cached.liked ? -1 : 0)),
    };

    this.commentCache.set(commentId, updated);
    return updated;
  }

  async deleteStoryReply(storyId: string, commentId: string): Promise<void> {
    await this.requireOwnedStory(storyId, STORY_REPLIES_OWNER_ERROR);
    await API.delete(`/comments/${commentId}`);
    this.commentCache.delete(commentId);
    this.storyReplyCache.set(
      storyId,
      (this.storyReplyCache.get(storyId) || []).filter((item) => item.id !== commentId),
    );
    this.commentReplyCache.forEach((items, parentId) => {
      this.commentReplyCache.set(
        parentId,
        items.filter((item) => item.id !== commentId),
      );
    });

    const cached = this.storyCache.get(storyId);
    if (cached) {
      this.storyCache.set(storyId, {
        ...cached,
        replyCount: Math.max(0, (cached.replyCount || 0) - 1),
      });
    }
  }

  async getStoryLikers(storyId: string): Promise<SocialUser[]> {
    await this.requireOwnedStory(storyId, STORY_INSIGHTS_OWNER_ERROR);
    const res = await API.get(`/like/story/${storyId}`);
    return (res?.data?.likes || []).map((user: any) => this.mapUser(user));
  }

  async togglePostLike(postId: string): Promise<Post> {
    const res = await API.post(`/like/post/${postId}`);
    const liked = !!res?.data?.liked;
    const cached = this.getCachedPost(postId);
    const updated = {
      ...cached,
      liked,
      likesCount: Math.max(0, cached.likesCount + (liked ? 1 : cached.liked ? -1 : 0)),
    };

    this.postCache.set(postId, updated);
    return updated;
  }

  async togglePostSave(postId: string): Promise<Post> {
    const res = await API.post(`/user/posts/${postId}/save`);
    const saved = !!res?.data?.saved;
    const cached = this.getCachedPost(postId);
    const updated = {
      ...cached,
      saved,
    };

    this.postCache.set(postId, updated);
    return updated;
  }

  async sharePost(postId: string): Promise<Post> {
    const cached = this.getCachedPost(postId);
    const primaryMedia = cached.media[0];

    await API.post(`/posts/${postId}/share`, {
      shareType: "story",
      storyData: primaryMedia
        ? {
            mediaType: primaryMedia.mediaType,
            mediaUrl: primaryMedia.url,
            thumbnailUrl: primaryMedia.thumbnailUrl,
          }
        : undefined,
    });

    const updated = {
      ...cached,
      sharesCount: cached.sharesCount + 1,
    };

    this.postCache.set(postId, updated);
    return updated;
  }

  async addPostComment(postId: string, text: string, parentCommentId?: string): Promise<Comment> {
    const cleanText = normalizeCommentText(text);
    const res = await API.post("/comments/add", {
      postId,
      text: cleanText,
      parentCommentId,
    });

    const currentUserId = await this.getCurrentUserId();
    const comment = this.mapComment(res?.data?.comment, { postId }, currentUserId);
    this.commentCache.set(comment.id, comment);
    if (parentCommentId) {
      const parent = this.commentCache.get(parentCommentId) as Comment | undefined;
      if (parent) {
        this.commentCache.set(parentCommentId, { ...parent, replyCount: (parent.replyCount || 0) + 1 });
      }
    }
    return comment;
  }

  async getPostComments(postId: string): Promise<Comment[]> {
    const [res, currentUserId] = await Promise.all([
      API.get("/comments", {
        params: { postId },
      }),
      this.getCurrentUserId(),
    ]);

    return this.cacheComments(
      (res?.data?.comments || []).map((comment: any) => this.mapComment(comment, { postId }, currentUserId)),
    ) as Comment[];
  }

  async togglePostCommentLike(postId: string, commentId: string): Promise<Comment> {
    const res = await API.post(`/comments/${commentId}/like`);
    const cached = this.commentCache.get(commentId) as Comment | undefined;

    if (!cached) {
      throw new Error("Comment not found");
    }

    const liked = !!res?.data?.liked;
    const updated = {
      ...cached,
      liked,
      likesCount: Math.max(0, cached.likesCount + (liked ? 1 : cached.liked ? -1 : 0)),
    };

    this.commentCache.set(commentId, updated);
    return updated;
  }

  async deletePostComment(postId: string, commentId: string): Promise<void> {
    await API.delete(`/comments/${commentId}`);
    this.commentCache.delete(commentId);
  }

  async updatePost(postId: string, input: UpdatePostInput): Promise<Post> {
    const payload = normalizeUpdatePostInput(input);
    const res = await API.put(`/posts/${postId}`, {
      caption: payload.caption,
      commentsDisabled: payload.settings?.disableComments,
      likesHidden: payload.settings?.hideLikeCount,
    });

    const cached = this.postCache.get(postId);
    const updated = this.mapPost(res?.data?.post, {
      liked: cached?.liked || false,
      saved: cached?.saved || false,
    });

    this.postCache.set(postId, updated);
    return updated;
  }

  async archivePost(postId: string): Promise<void> {
    await this.requireOwnedPost(postId);
    await API.put(`/posts/${postId}/archive`);
    this.postCache.delete(postId);
  }

  async restorePost(postId: string): Promise<void> {
    await API.put(`/posts/${postId}/restore`);
  }

  async deletePost(postId: string): Promise<void> {
    await this.requireOwnedPost(postId);
    await API.delete(`/posts/delete/${postId}`);
    this.postCache.delete(postId);
  }

  async toggleReelLike(reelId: string): Promise<Reel> {
    return this.toggleSwipeLike(reelId);
  }

  async toggleSwipeLike(swipeId: string): Promise<Reel> {
    const res = await API.post(`/like/post/${swipeId}`);
    const liked = !!res?.data?.liked;
    const cached = this.getCachedReel(swipeId);
    const updated = {
      ...cached,
      liked,
      likesCount: Math.max(0, cached.likesCount + (liked ? 1 : cached.liked ? -1 : 0)),
    };

    this.reelCache.set(swipeId, updated);
    return updated;
  }

  async toggleReelSave(reelId: string): Promise<Reel> {
    return this.toggleSwipeSave(reelId);
  }

  async toggleSwipeSave(swipeId: string): Promise<Reel> {
    const res = await API.post(`/user/posts/${swipeId}/save`);
    const saved = !!res?.data?.saved;
    const cached = this.getCachedReel(swipeId);
    const updated = {
      ...cached,
      saved,
    };

    this.reelCache.set(swipeId, updated);
    return updated;
  }

  async shareReel(reelId: string): Promise<Reel> {
    return this.shareSwipe(reelId);
  }

  async shareSwipe(swipeId: string): Promise<Reel> {
    await API.post(`/posts/${swipeId}/share`);
    const cached = this.getCachedReel(swipeId);
    const updated = {
      ...cached,
      sharesCount: cached.sharesCount + 1,
    };

    this.reelCache.set(swipeId, updated);
    return updated;
  }

  async getReelComments(reelId: string): Promise<ReelComment[]> {
    return this.getSwipeComments(reelId);
  }

  async getSwipeComments(swipeId: string): Promise<ReelComment[]> {
    const [res, currentUserId] = await Promise.all([
      API.get("/comments", {
        params: { postId: swipeId },
      }),
      this.getCurrentUserId(),
    ]);

    return this.cacheComments(
      (res?.data?.comments || []).map((comment: any) => this.mapReelComment(comment, swipeId, currentUserId)),
    ) as ReelComment[];
  }

  async addReelComment(reelId: string, text: string, parentCommentId?: string): Promise<ReelComment> {
    return this.addSwipeComment(reelId, text, parentCommentId);
  }

  async addSwipeComment(swipeId: string, text: string, parentCommentId?: string): Promise<ReelComment> {
    const cleanText = normalizeCommentText(text);
    const res = await API.post("/comments/add", {
      postId: swipeId,
      text: cleanText,
      parentCommentId,
    });

    const currentUserId = await this.getCurrentUserId();
    const comment = this.mapReelComment(res?.data?.comment, swipeId, currentUserId);
    this.commentCache.set(comment.id, comment);
    if (parentCommentId) {
      const parent = this.commentCache.get(parentCommentId) as ReelComment | undefined;
      if (parent) {
        this.commentCache.set(parentCommentId, { ...parent, replyCount: (parent.replyCount || 0) + 1 });
      }
    }
    return comment;
  }

  async toggleReelCommentLike(reelId: string, commentId: string): Promise<ReelComment> {
    return this.toggleSwipeCommentLike(reelId, commentId);
  }

  async toggleSwipeCommentLike(swipeId: string, commentId: string): Promise<ReelComment> {
    const res = await API.post(`/comments/${commentId}/like`);
    const cached = this.commentCache.get(commentId) as ReelComment | undefined;

    if (!cached) {
      throw new Error("Comment not found");
    }

    const liked = !!res?.data?.liked;
    const updated = {
      ...cached,
      liked,
      likesCount: Math.max(0, cached.likesCount + (liked ? 1 : cached.liked ? -1 : 0)),
    };

    this.commentCache.set(commentId, updated);
    return updated;
  }

  async deleteReelComment(reelId: string, commentId: string): Promise<void> {
    await this.deleteSwipeComment(reelId, commentId);
  }

  async deleteSwipeComment(swipeId: string, commentId: string): Promise<void> {
    await API.delete(`/comments/${commentId}`);
    this.commentCache.delete(commentId);
  }

  async createPost(input: CreatePostInput): Promise<Post> {
    const payload = normalizePostInput(input);
    const res = await API.post("/posts/create", {
      caption: payload.caption,
      media: payload.media.map((asset, index) => ({
        type: asset.mediaType,
        url: asset.url,
        thumbnailUrl: asset.thumbnailUrl,
        duration: asset.durationMs ? Math.ceil(asset.durationMs / 1000) : undefined,
        width: asset.width,
        height: asset.height,
        order: index,
      })),
      // Video posts are still regular feed posts; only the dedicated swipe flow should create reels.
      postType: "post",
      location: payload.location ? { name: payload.location } : undefined,
      commentsDisabled: payload.settings?.disableComments || false,
      likesHidden: payload.settings?.hideLikeCount || false,
      collaborators: payload.collaboratorIds || [],
      ...buildMusicRequestPayload(payload.music),
    });

    const post = this.mapPost(res?.data?.post);
    this.postCache.set(post.id, post);
    return post;
  }

  async createStory(input: CreateStoryInput): Promise<Story> {
    const payload = normalizeStoryInput(input);

    if (payload.type === "text") {
      throw new Error("Text stories are not supported by the current backend.");
    }

    const stickers: any[] =
      payload.type === "poll" && payload.poll
        ? [
            {
              type: "poll",
              text: payload.poll.question,
              pollOptions: payload.poll.options.map((option) => ({
                text: option,
              })),
              position: {
                x: 0.5,
                y: 0.55,
                width: 0.72,
                height: 0.22,
                rotation: 0,
                scale: 1,
              },
            },
          ]
        : payload.type === "question" && payload.question
          ? [
              {
                type: "question",
                text: payload.question.prompt,
                position: {
                  x: 0.5,
                  y: 0.55,
                  width: 0.72,
                  height: 0.18,
                  rotation: 0,
                  scale: 1,
                },
            },
          ]
          : [];
    const musicSticker = buildStoryMusicSticker(payload.music);
    if (musicSticker) {
      stickers.push(musicSticker);
    }

    if (payload.type === "media" && !payload.media) {
      throw new Error("Media stories require an image or video.");
    }

    if (payload.visibility === "custom" && !(payload.visibleToUserIds || []).length) {
      throw new Error("Choose at least one user for a custom story audience.");
    }

    const res = await API.post("/story/create", {
      mediaType: payload.media?.mediaType || "image",
      mediaUrl: payload.media?.url,
      thumbnailUrl: payload.media?.thumbnailUrl,
      duration: payload.media?.durationMs ? Math.ceil(payload.media.durationMs / 1000) : undefined,
      caption: payload.text,
      stickers,
      visibility: payload.visibility || "public",
      visibleTo: payload.visibility === "custom" ? payload.visibleToUserIds || [] : undefined,
      isCloseFriends: payload.visibility === "close_friends",
      allowReplies: payload.allowReplies,
      allowSharing: payload.allowSharing,
      ...buildMusicRequestPayload(payload.music),
    });

    const story = this.mapStory(res?.data?.story);
    this.storyCache.set(story.id, story);
    return story;
  }

  async createReel(input: CreateReelInput): Promise<Reel> {
    return this.createSwipe(input);
  }

  async createSwipe(input: CreateSwipeInput): Promise<Reel> {
    const payload = normalizeReelInput(input);
    const res = await API.post("/posts/create", {
      caption: payload.caption,
      media: [
        {
          type: payload.media.mediaType,
          url: payload.media.url,
          thumbnailUrl: payload.thumbnailUrl || payload.media.thumbnailUrl,
          duration: payload.media.durationMs ? Math.ceil(payload.media.durationMs / 1000) : undefined,
          width: payload.media.width,
          height: payload.media.height,
          order: 0,
        },
      ],
      postType: "reel",
      location: payload.location ? { name: payload.location } : undefined,
      ...buildMusicRequestPayload(payload.music),
    });

    const reel = this.mapReel(res?.data?.post);
    this.reelCache.set(reel.id, reel);
    return reel;
  }

  async updateStory(storyId: string, input: UpdateStoryInput): Promise<Story> {
    const payload = normalizeUpdateStoryInput(input);
    const res = await API.put(`/story/${storyId}`, {
      text: payload.text,
      visibility: payload.visibility,
      allowReplies: payload.allowReplies,
      allowSharing: payload.allowSharing,
    });
    const updated = this.mapStory(res?.data?.story);
    this.storyCache.set(storyId, updated);
    return updated;
  }

  async archiveStory(storyId: string): Promise<void> {
    await this.requireOwnedStory(storyId, STORY_OWNER_ERROR);
    await API.put(`/story/${storyId}/archive`);
    this.storyCache.delete(storyId);
    this.storyReplyCache.delete(storyId);
  }

  async restoreStory(storyId: string): Promise<void> {
    await API.put(`/story/${storyId}/restore`);
  }

  async deleteStory(storyId: string): Promise<void> {
    await this.requireOwnedStory(storyId, STORY_OWNER_ERROR);
    await API.delete(`/story/${storyId}`);
    this.storyCache.delete(storyId);
    this.storyReplyCache.delete(storyId);
  }

  async getStoryViewers(storyId: string): Promise<StoryViewerEntry[]> {
    await this.requireOwnedStory(storyId, STORY_INSIGHTS_OWNER_ERROR);
    const res = await API.get(`/story/${storyId}/views`);
    return (res?.data?.views || []).map((view: any) => this.mapStoryViewerEntry(view));
  }

  async reportContent(_contentType: ContentKind, _contentId: string, _reason: ReportReason, _note?: string): Promise<void> {
    await loadModerationPrefs();
    await API.post("/user/report", {
      contentType: _contentType,
      contentId: _contentId,
      reason: _reason,
      note: normalizeReportNote(_note),
    });
    reports.push({
      contentType: _contentType,
      contentId: _contentId,
      reason: _reason,
      note: normalizeReportNote(_note),
      createdAt: Date.now(),
    });
    await persistModerationPrefs();
  }

  async muteUser(_userId: string): Promise<void> {
    await loadModerationPrefs();
    await API.post(`/user/mute/${_userId}`);
    mutedUserIds.add(_userId);
    await persistModerationPrefs();
  }

  async blockUser(_userId: string): Promise<void> {
    await loadModerationPrefs();
    await API.post(`/user/block/${_userId}`);
    blockedUserIds.add(_userId);
    await persistModerationPrefs();
  }

  async unblockUser(_userId: string): Promise<void> {
    await loadModerationPrefs();
    await API.delete(`/user/block/${_userId}`);
    blockedUserIds.delete(_userId);
    await persistModerationPrefs();
  }

  async markNotInterested(_contentType: ContentKind, _contentId: string): Promise<void> {
    await loadModerationPrefs();
    await API.post("/user/not-interested", {
      contentType: _contentType,
      contentId: _contentId,
    });
    hiddenContentKeys.add(buildContentKey(_contentType, _contentId));
    await persistModerationPrefs();
  }
}

export const socialApi: SocialApi =
  SOCIAL_API_MODE === "remote" ? new RemoteSocialApi() : new MockSocialApi();
