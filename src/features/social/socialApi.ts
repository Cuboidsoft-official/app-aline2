import { API } from "../../api/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getStoredUserId } from "../../utils/authSession";
import { postMultipart } from "../../utils/multipartUpload";
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
  StoryStickerTextAlignment,
  StoryStickerPlacement,
  StoryTextStickerTheme,
  StoryViewerEntry,
  StoryReply,
  StorySequenceResponse,
  UpdatePostInput,
  UpdateStoryInput,
  DeleteCommentResult,
  CommentAudioFile,
} from "./types";
import {
  normalizeReportNote,
  normalizeCommentText,
  normalizeOptionalCommentText,
  normalizePostInput,
  normalizeReelInput,
  normalizeStoryInput,
  normalizeUpdatePostInput,
  normalizeUpdateStoryInput,
} from "./validation";

const POST_DELETE_OWNER_ERROR = "You can only delete your own posts.";
const STORY_OWNER_ERROR = "You can only manage your own stories.";
const STORY_INSIGHTS_OWNER_ERROR = "Story insights are only available for your own stories.";
const STORY_REPLIES_OWNER_ERROR = "Story replies are only available for your own stories.";
const SYNC_REQUIRED_POST_ERROR = "This post is not synced with the server yet.";
const SYNC_REQUIRED_STORY_ERROR = "This story is not synced with the server yet.";

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
    const res = await API.get("/user/content-preferences");
    applyModerationPrefsPayload(res?.data?.preferences || {});
    await persistModerationPrefs();
  } catch {
    try {
      const raw = await AsyncStorage.getItem(LOCAL_MODERATION_PREFS_KEY);
      if (!raw) {
        applyModerationPrefsPayload({});
      } else {
        applyModerationPrefsPayload(JSON.parse(raw));
      }
    } catch {
      applyModerationPrefsPayload({});
    }
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

const normalizeCommentAudioUpload = (audioFile?: CommentAudioFile) => {
  if (!audioFile?.uri) {
    return null;
  }

  const rawUri = normalizeUploadUri(audioFile.uri);
  const normalizedUri = String(rawUri || "").trim();
  const fallbackExtension = /\.m4a$/i.test(normalizedUri) ? "m4a" : "mp4";
  const fallbackName = `voice_${Date.now()}.${fallbackExtension}`;
  const normalizedName = String(audioFile.name || "").trim() || fallbackName;
  const normalizedType = String(audioFile.type || "").trim() || (fallbackExtension === "m4a" ? "audio/m4a" : "audio/mp4");
  const normalizedDuration = Number(audioFile.duration);

  return {
    uri: normalizedUri,
    name: normalizedName,
    type: normalizedType,
    duration: Number.isFinite(normalizedDuration) && normalizedDuration > 0 ? Math.round(normalizedDuration) : 1,
  };
};

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

const storyStickerPositions: Record<StoryStickerPlacement, { x: number; y: number }> = {
  top_left: { x: 0.12, y: 0.18 },
  top_right: { x: 0.68, y: 0.18 },
  center: { x: 0.22, y: 0.44 },
  bottom_left: { x: 0.12, y: 0.72 },
  bottom_right: { x: 0.68, y: 0.72 },
};

const MUSIC_CLIP_MAX_SECONDS = 30;

const clampMusicClipDurationSeconds = (duration: number | undefined): number | undefined => {
  if (typeof duration !== "number" || duration <= 0) {
    return undefined;
  }

  return Math.min(MUSIC_CLIP_MAX_SECONDS, duration);
};

const resolveMusicSegmentDurationSeconds = (music: any, musicConfig?: any): number | undefined => {
  const explicitDuration =
    typeof musicConfig?.duration === "number"
      ? musicConfig.duration
      : typeof music?.duration === "number"
        ? music.duration
        : undefined;

  if (typeof explicitDuration === "number" && explicitDuration > 0) {
    return clampMusicClipDurationSeconds(explicitDuration);
  }

  const startTime =
    typeof musicConfig?.startTime === "number"
      ? musicConfig.startTime
      : typeof music?.startTime === "number"
        ? music.startTime
        : 0;
  const endTime =
    typeof musicConfig?.endTime === "number"
      ? musicConfig.endTime
      : typeof music?.endTime === "number"
        ? music.endTime
        : undefined;

  if (typeof endTime === "number" && endTime > startTime) {
    return clampMusicClipDurationSeconds(endTime - startTime);
  }

  return undefined;
};

const resolveStoryStickerPosition = (
  customPosition: { x: number; y: number } | undefined,
  placement: StoryStickerPlacement | undefined,
  type: "text" | "emoji",
  scale: number | undefined,
  rotation: number | undefined,
) => {
  const safeScale = typeof scale === "number" ? scale : 1;
  const safeRotation = typeof rotation === "number" ? rotation : 0;
  if (customPosition && typeof customPosition.x === "number" && typeof customPosition.y === "number") {
    return {
      x: customPosition.x,
      y: customPosition.y,
      width: type === "emoji" ? 0.16 : 0.64,
      height: type === "emoji" ? 0.12 : 0.12,
      rotation: safeRotation,
      scale: safeScale,
    };
  }

  const base = storyStickerPositions[placement || (type === "text" ? "bottom_left" : "top_right")];

  return {
    x: base.x,
    y: base.y,
    width: type === "emoji" ? 0.16 : 0.64,
    height: type === "emoji" ? 0.12 : 0.12,
    rotation: safeRotation,
    scale: safeScale,
  };
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
    externalId: typeof music === "object" ? String(music?.externalId || "") || undefined : undefined,
    trackName,
    artistName,
    artworkUrl: music?.thumbnailUrl || music?.artworkUrl || undefined,
    previewUrl: music?.previewUrl || music?.audioUrl || undefined,
    streamUrl: music?.streamUrl || music?.audioUrl || music?.previewUrl || undefined,
    audioUrl: music?.audioUrl || music?.streamUrl || music?.previewUrl || undefined,
    externalUrl: music?.externalUrl || undefined,
    youtubeVideoId:
      typeof music === "object" && String(music?.source || "").trim().toLowerCase() === "youtube"
        ? String(music?.youtubeVideoId || music?.externalId || "").trim() || undefined
        : typeof music === "object"
          ? String(music?.youtubeVideoId || "").trim() || undefined
          : undefined,
    source: music?.source || undefined,
    isOriginal: !!music?.isOriginal,
    startTime:
      typeof musicConfig?.startTime === "number"
        ? musicConfig.startTime
        : typeof music?.startTime === "number"
          ? music.startTime
          : 0,
    endTime:
      typeof musicConfig?.endTime === "number"
        ? musicConfig.endTime
        : typeof music?.endTime === "number"
          ? music.endTime
          : undefined,
    duration:
      resolveMusicSegmentDurationSeconds(music, musicConfig),
  };
};

const buildMusicRequestPayload = (music: any) =>
  music?.id
    ? (() => {
      const startTime = Math.max(0, Number(music.clipStartTime ?? 0) || 0);
      const rawDuration = Number(music.clipDuration ?? music.duration ?? MUSIC_CLIP_MAX_SECONDS) || MUSIC_CLIP_MAX_SECONDS;
      const duration = Math.max(1, Math.min(MUSIC_CLIP_MAX_SECONDS, rawDuration));
      const explicitEndTime = Number(music.clipEndTime);
      const endTime = Math.min(
        startTime + duration,
        Number.isFinite(explicitEndTime) && explicitEndTime > startTime ? explicitEndTime : startTime + duration,
      );

      return {
        musicId: music.id,
        musicConfig: {
          startTime,
          endTime,
          duration: Math.max(1, endTime - startTime),
          volume: 1,
        },
      };
    })()
    : {};

const mapTaggedUsersForRequest = (taggedUsers: any[] | undefined) =>
  (taggedUsers || []).map((entry) => ({
    user: entry.user,
    username: entry.username,
    position: {
      x: typeof entry?.position?.x === "number" ? entry.position.x : 0.5,
      y: typeof entry?.position?.y === "number" ? entry.position.y : 0.5,
    },
    mediaIndex: typeof entry?.mediaIndex === "number" ? entry.mediaIndex : 0,
  }));

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

const normalizeUploadUri = (value: string | undefined | null): string => {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  if (/^(file|content):\/\//i.test(rawValue)) {
    return rawValue;
  }

  if (/^[a-z]:\\/i.test(rawValue) || rawValue.startsWith("/")) {
    return `file://${rawValue.replace(/\\/g, "/")}`;
  }

  return rawValue;
};

const getTextStickerThemeStyle = (
  theme: StoryTextStickerTheme | undefined,
): { color: string; backgroundColor: string } => {
  switch (theme) {
    case "light":
      return {
        color: "#0f172a",
        backgroundColor: "rgba(255,255,255,0.9)",
      };
    case "accent":
      return {
        color: "#ffffff",
        backgroundColor: "rgba(219,39,119,0.84)",
      };
    case "outline":
      return {
        color: "#ffffff",
        backgroundColor: "rgba(15,23,42,0.2)",
      };
    case "dark":
    default:
      return {
        color: "#ffffff",
        backgroundColor: "rgba(15,23,42,0.55)",
      };
  }
};

const buildTextStickerStyle = (
  scale: number | undefined,
  theme: StoryTextStickerTheme | undefined,
  alignment: StoryStickerTextAlignment | undefined,
) => {
  const themeStyle = getTextStickerThemeStyle(theme);
  return {
    color: themeStyle.color,
    backgroundColor: themeStyle.backgroundColor,
    fontSize: Math.round(18 * (scale || 1)),
    alignment: alignment || "center",
  } as const;
};

class RemoteSocialApi implements SocialApi {
  private readonly fallbackAvatarUrl = "https://aline2.com/asstes/images/logo/logo.jpeg";
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
    const followerIds = Array.isArray(user?.followers)
      ? user.followers.map((entry: any) => this.getId(entry)).filter(Boolean)
      : [];
    const followingIds = Array.isArray(user?.following)
      ? user.following.map((entry: any) => this.getId(entry)).filter(Boolean)
      : [];

    return {
      id: this.getId(user),
      username: user?.username || "user",
      name: user?.name || user?.fullName || user?.username || "User",
      avatarUrl: user?.profilePic || user?.avatarUrl || this.fallbackAvatarUrl,
      isVerified: !!user?.isVerified,
      followerIds,
      followingIds,
      viewerFollows:
        typeof user?.viewerFollows === "boolean"
          ? user.viewerFollows
          : typeof user?.isFollowing === "boolean"
            ? user.isFollowing
            : undefined,
      followsViewer:
        typeof user?.followsViewer === "boolean"
          ? user.followsViewer
          : typeof user?.isFollower === "boolean"
            ? user.isFollower
            : undefined,
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
      sensitiveContent: item?.sensitiveContent?.isSensitive || item?.mediaSensitivity?.isSensitive
        ? {
            isSensitive: true,
            blur: item?.sensitiveContent?.blur !== false && item?.mediaSensitivity?.blur !== false,
            label: item?.sensitiveContent?.label || item?.mediaSensitivity?.label,
            confidence:
              typeof item?.sensitiveContent?.confidence === "number"
                ? item.sensitiveContent.confidence
                : typeof item?.mediaSensitivity?.confidence === "number"
                  ? item.mediaSensitivity.confidence
                  : undefined,
          }
        : undefined,
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
    const stickers = Array.isArray(post?.stickers) ? post.stickers : [];

    return {
      id: this.getId(post),
      user: this.mapUser(post?.user),
      type,
      caption: post?.caption || "",
      media,
      location: typeof post?.location === "string" ? post.location : post?.location?.name,
      music: mapStoryMusicDetails(post?.music, post?.musicConfig),
      hashtags: Array.isArray(post?.hashtags) ? post.hashtags : [],
      mentions: this.mapMentionNames(post?.mentions),
      collaboratorIds: Array.isArray(post?.collaborators) ? post.collaborators.map((item: any) => this.getId(item)) : [],
      settings: {
        disableComments: !!post?.commentsDisabled,
        hideLikeCount: !!post?.likesHidden,
        allowRemix: true,
      },
      createdAt: this.toTimestamp(post?.createdAt),
      filterPreset: typeof post?.filterPreset === "string" ? post.filterPreset : undefined,
      stickers: stickers
        .filter((item: any) => item?.type === "text" || item?.type === "emoji")
        .map((item: any, index: number) => ({
          id: this.getId(item) || `${this.getId(post)}_post_sticker_${index}`,
          type: item?.type === "emoji" ? "emoji" : "text",
          text: String(item?.text || "").trim(),
          position: {
            x: typeof item?.position?.x === "number" ? item.position.x : 0.18,
            y: typeof item?.position?.y === "number" ? item.position.y : 0.22 + index * 0.12,
            width: typeof item?.position?.width === "number" ? item.position.width : item?.type === "emoji" ? 0.18 : 0.56,
            height: typeof item?.position?.height === "number" ? item.position.height : item?.type === "emoji" ? 0.14 : 0.12,
            rotation: typeof item?.position?.rotation === "number" ? item.position.rotation : 0,
            scale: typeof item?.position?.scale === "number" ? item.position.scale : 1,
          },
          style: {
            color: item?.style?.color,
            backgroundColor: item?.style?.backgroundColor,
            fontSize: item?.style?.fontSize,
            alignment: item?.style?.alignment,
          },
        })),
      editedAt: post?.updatedAt && post?.updatedAt !== post?.createdAt ? this.toTimestamp(post.updatedAt) : undefined,
      likesCount: typeof post?.likes === "number" ? post.likes : 0,
      commentsCount: typeof post?.comments === "number" ? post.comments : 0,
      sharesCount: typeof post?.shares === "number" ? post.shares : 0,
      liked: typeof post?.liked === "boolean" ? post.liked : false,
      saved: typeof post?.saved === "boolean" ? post.saved : false,
      likePreviewUsers: Array.isArray(post?.recentLikes)
        ? post.recentLikes.map((user: any) => this.mapUser(user)).filter((user: SocialUser) => !!user.id)
        : [],
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
      music: mapStoryMusicDetails(post?.music, post?.musicConfig),
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
    const locationSticker = stickers.find((item: any) => item?.type === "location" && item?.text);
    const mentionStickers = stickers.filter((item: any) => item?.type === "mention" && item?.text);
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
        mediaSensitivity: story.mediaSensitivity,
      }, 0, "story_media") : undefined,
      text: storyType === "text" ? story?.caption || "" : undefined,
      backgroundColor: typeof story?.backgroundColor === "string" ? story.backgroundColor : undefined,
      filterPreset:
        story?.filterPreset === "warm" ||
          story?.filterPreset === "cool" ||
          story?.filterPreset === "noir" ||
          story?.filterPreset === "dream"
          ? story.filterPreset
          : "none",
      filterIntensity:
        typeof story?.filterIntensity === "number"
          ? Math.min(1, Math.max(0.2, story.filterIntensity))
          : 1,
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
      linkUrl: typeof story?.linkUrl === "string" ? story.linkUrl : undefined,
      location: locationSticker?.text || undefined,
      stickers: stickers
        .filter((item: any) => ((item?.type === "text" || item?.type === "emoji") && item?.text) || (item?.type === "gif" && item?.mediaUrl))
        .map((item: any, index: number) => ({
          id: this.getId(item) || `${this.getId(story)}_story_sticker_${index}`,
          type: item?.type === "gif" ? "image" : item.type,
          text: item.text || "",
          mediaUrl: typeof item?.mediaUrl === "string" ? item.mediaUrl : undefined,
          position: {
            x: typeof item?.position?.x === "number" ? item.position.x : 0.18,
            y: typeof item?.position?.y === "number" ? item.position.y : 0.22 + index * 0.12,
            width:
              typeof item?.position?.width === "number"
                ? item.position.width
                : item?.type === "emoji"
                  ? 0.18
                  : item?.type === "gif"
                    ? 0.28
                    : 0.56,
            height:
              typeof item?.position?.height === "number"
                ? item.position.height
                : item?.type === "emoji"
                  ? 0.14
                  : item?.type === "gif"
                    ? 0.2
                    : 0.12,
            rotation: typeof item?.position?.rotation === "number" ? item.position.rotation : 0,
            scale: typeof item?.position?.scale === "number" ? item.position.scale : 1,
          },
          style: item?.style
            ? {
              color: typeof item.style.color === "string" ? item.style.color : undefined,
              backgroundColor: typeof item.style.backgroundColor === "string" ? item.style.backgroundColor : undefined,
              fontSize: typeof item.style.fontSize === "number" ? item.style.fontSize : undefined,
              alignment: item.style.alignment,
            }
            : undefined,
        })),
      mentions: mentionStickers.map((item: any) => item.text),
      mentionTargets: mentionStickers.map((item: any) => ({
        id: item?.userId ? String(item.userId) : undefined,
        username: String(item.text),
      })),
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
    const inferredAudioUrl =
      comment?.audioUrl ||
      comment?.voiceUrl ||
      comment?.audio?.url ||
      (["audio", "voice"].includes(String(comment?.messageType || comment?.type || "").toLowerCase())
        ? comment?.mediaUrl
        : undefined);

    return {
      id: this.getId(comment),
      postId: context.postId,
      storyId: context.storyId,
      parentCommentId: this.getId(comment?.parentComment) || null,
      user: this.mapUser(comment?.user),
      text: comment?.text || "",
      audioUrl: inferredAudioUrl || undefined,
      audioDuration:
        typeof comment?.audioDuration === "number"
          ? comment.audioDuration
          : typeof comment?.audio?.duration === "number"
            ? comment.audio.duration
            : typeof comment?.duration === "number"
              ? comment.duration
              : undefined,
      createdAt: this.toTimestamp(comment?.createdAt),
      liked: !!comment?.likedByViewer,
      likesCount: typeof comment?.likes === "number" ? comment.likes : 0,
      canDelete: this.getId(comment?.user) === currentUserId,
      replyCount: typeof comment?.replyCount === "number" ? comment.replyCount : 0,
      mentions: Array.isArray(comment?.mentions) ? comment.mentions.map((item: any) => item?.username).filter(Boolean) : [],
    };
  }

  private mapReelComment(comment: any, reelId: string, currentUserId: string): ReelComment {
    const inferredAudioUrl =
      comment?.audioUrl ||
      comment?.voiceUrl ||
      comment?.audio?.url ||
      (["audio", "voice"].includes(String(comment?.messageType || comment?.type || "").toLowerCase())
        ? comment?.mediaUrl
        : undefined);

    return {
      id: this.getId(comment),
      reelId,
      parentCommentId: this.getId(comment?.parentComment) || null,
      user: this.mapUser(comment?.user),
      text: comment?.text || "",
      audioUrl: inferredAudioUrl || undefined,
      audioDuration:
        typeof comment?.audioDuration === "number"
          ? comment.audioDuration
          : typeof comment?.audio?.duration === "number"
            ? comment.audio.duration
            : typeof comment?.duration === "number"
              ? comment.duration
              : undefined,
      createdAt: this.toTimestamp(comment?.createdAt),
      liked: !!comment?.likedByViewer,
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

  private removeCommentFromReplyCaches(commentId: string) {
    this.commentReplyCache.forEach((items, parentId) => {
      this.commentReplyCache.set(
        parentId,
        items.filter((item) => item.id !== commentId),
      );
    });
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

  async getFeed(page = 1): Promise<FeedResponse> {
    await loadModerationPrefs();
    const [postsRes, storyGroups, currentUserId] = await Promise.all([
      API.get("/posts/feed", { params: { page } }),
      page === 1 ? this.getStoryFeedGroups() : Promise.resolve([]),
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

  async getReel(reelId: string): Promise<Reel> {
    return this.getSwipe(reelId);
  }

  async getSwipes(): Promise<Reel[]> {
    await loadModerationPrefs();
    const loadSwipeFeed = async () => {
      try {
        return await API.get("/search/swipes");
      } catch (error: any) {
        const statusCode = Number(error?.response?.status || 0);
        if (statusCode && statusCode !== 404) {
          throw error;
        }

        return API.get("/search/reels");
      }
    };

    const [reelsRes, savedIds] = await Promise.all([
      loadSwipeFeed(),
      this.getSavedPostIds(),
    ]);

    const reelPayload = Array.isArray(reelsRes?.data?.swipes)
      ? reelsRes.data.swipes
      : Array.isArray(reelsRes?.data?.reels)
        ? reelsRes.data.reels
        : [];
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

  async getSwipe(swipeId: string): Promise<Reel> {
    await loadModerationPrefs();
    const [res, savedIds, likes] = await Promise.all([
      API.get(`/posts/${swipeId}`),
      this.getSavedPostIds(),
      this.getLikeStatusMap([swipeId], "postId"),
    ]);

    const reel = this.mapReel(res?.data?.post, {
      liked: !!likes.get(swipeId),
      saved: savedIds.has(swipeId),
    });

    if (
      blockedUserIds.has(reel.user.id) ||
      mutedUserIds.has(reel.user.id) ||
      hiddenContentKeys.has(buildContentKey("swipe", reel.id))
    ) {
      throw new Error("Swipe not available.");
    }

    this.reelCache.set(reel.id, reel);
    return reel;
  }

  async getStorySequence(storyId: string, options?: GetStorySequenceOptions): Promise<StorySequenceResponse> {
    await loadModerationPrefs();
    if (!this.isBackendObjectId(storyId)) {
      throw new Error(SYNC_REQUIRED_STORY_ERROR);
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

  async getSavedPosts(): Promise<Post[]> {
    const res = await API.get("/user/posts/saved");
    const posts: Post[] = (res?.data?.posts || []).map((post: any) => this.mapPost(post));
    posts.forEach((post) => this.postCache.set(post.id, post));
    return posts;
  }

  async markStoryViewed(storyId: string): Promise<Story> {
    if (!this.isBackendObjectId(storyId)) {
      throw new Error(SYNC_REQUIRED_STORY_ERROR);
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
      throw new Error(SYNC_REQUIRED_STORY_ERROR);
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
      throw new Error(SYNC_REQUIRED_STORY_ERROR);
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

  async deleteStoryReply(storyId: string, commentId: string): Promise<DeleteCommentResult> {
    await this.requireOwnedStory(storyId, STORY_REPLIES_OWNER_ERROR);
    const res = await API.delete(`/comments/${commentId}`);
    const deletedCount = Math.max(1, Number(res?.data?.deletedCount || 1));
    const parentCommentId =
      typeof res?.data?.parentCommentId === "string" && res.data.parentCommentId
        ? res.data.parentCommentId
        : null;
    this.commentCache.delete(commentId);
    this.storyReplyCache.set(
      storyId,
      (this.storyReplyCache.get(storyId) || []).filter((item) => item.id !== commentId),
    );
    this.removeCommentFromReplyCaches(commentId);

    const cached = this.storyCache.get(storyId);
    if (cached) {
      this.storyCache.set(storyId, {
        ...cached,
        replyCount: Math.max(0, (cached.replyCount || 0) - deletedCount),
      });
    }

    if (parentCommentId) {
      const cachedParent = this.commentCache.get(parentCommentId);
      if (cachedParent && "user" in cachedParent) {
        this.commentCache.set(parentCommentId, {
          ...cachedParent,
          replyCount: Math.max(0, ((cachedParent as Comment).replyCount || 0) - 1),
        });
      }
    }

    return {
      deletedCount,
      parentCommentId,
    };
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

  async addPostComment(postId: string, text: string, parentCommentId?: string, audioFile?: CommentAudioFile): Promise<Comment> {
    const normalizedAudio = normalizeCommentAudioUpload(audioFile);
    const cleanText = normalizedAudio ? normalizeOptionalCommentText(text) : normalizeCommentText(text);
    const res = normalizedAudio
      ? await (() => {
          const body = new FormData();
          body.append("postId", postId);
          if (cleanText) {
            body.append("text", cleanText);
          }
          if (parentCommentId) {
            body.append("parentCommentId", parentCommentId);
          }
          body.append("duration", String(normalizedAudio.duration));
          body.append("messageType", "voice");
          body.append("file", {
            uri: normalizedAudio.uri,
            name: normalizedAudio.name,
            type: normalizedAudio.type,
          } as any);
          return postMultipart({
            path: "/comments/add",
            body,
            timeoutMs: 120000,
          });
        })()
      : await API.post("/comments/add", {
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

  async deletePostComment(postId: string, commentId: string): Promise<DeleteCommentResult> {
    const res = await API.delete(`/comments/${commentId}`);
    const deletedCount = Math.max(1, Number(res?.data?.deletedCount || 1));
    const parentCommentId =
      typeof res?.data?.parentCommentId === "string" && res.data.parentCommentId
        ? res.data.parentCommentId
        : null;
    this.commentCache.delete(commentId);
    this.removeCommentFromReplyCaches(commentId);

    if (parentCommentId) {
      const parent = this.commentCache.get(parentCommentId) as Comment | undefined;
      if (parent) {
        this.commentCache.set(parentCommentId, {
          ...parent,
          replyCount: Math.max(0, (parent.replyCount || 0) - 1),
        });
      }
    }

    const cachedPost = this.postCache.get(postId);
    if (cachedPost) {
      this.postCache.set(postId, {
        ...cachedPost,
        commentsCount: Math.max(0, cachedPost.commentsCount - deletedCount),
      });
    }

    return {
      deletedCount,
      parentCommentId,
    };
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
    const cached = this.getCachedReel(swipeId);
    await API.post(`/posts/${swipeId}/share`, {
      shareType: "story",
      storyData: cached.media
        ? {
          mediaType: cached.media.mediaType,
          mediaUrl: cached.media.url,
          thumbnailUrl: cached.thumbnailUrl || cached.media.thumbnailUrl,
        }
        : undefined,
    });
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

  async addReelComment(reelId: string, text: string, parentCommentId?: string, audioFile?: CommentAudioFile): Promise<ReelComment> {
    return this.addSwipeComment(reelId, text, parentCommentId, audioFile);
  }

  async addSwipeComment(swipeId: string, text: string, parentCommentId?: string, audioFile?: CommentAudioFile): Promise<ReelComment> {
    const normalizedAudio = normalizeCommentAudioUpload(audioFile);
    const cleanText = normalizedAudio ? normalizeOptionalCommentText(text) : normalizeCommentText(text);
    const res = normalizedAudio
      ? await (() => {
          const body = new FormData();
          body.append("postId", swipeId);
          if (cleanText) {
            body.append("text", cleanText);
          }
          if (parentCommentId) {
            body.append("parentCommentId", parentCommentId);
          }
          body.append("duration", String(normalizedAudio.duration));
          body.append("messageType", "voice");
          body.append("file", {
            uri: normalizedAudio.uri,
            name: normalizedAudio.name,
            type: normalizedAudio.type,
          } as any);
          return postMultipart({
            path: "/comments/add",
            body,
            timeoutMs: 120000,
          });
        })()
      : await API.post("/comments/add", {
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

  async deleteReelComment(reelId: string, commentId: string): Promise<DeleteCommentResult> {
    return this.deleteSwipeComment(reelId, commentId);
  }

  async deleteSwipeComment(swipeId: string, commentId: string): Promise<DeleteCommentResult> {
    const res = await API.delete(`/comments/${commentId}`);
    const deletedCount = Math.max(1, Number(res?.data?.deletedCount || 1));
    const parentCommentId =
      typeof res?.data?.parentCommentId === "string" && res.data.parentCommentId
        ? res.data.parentCommentId
        : null;
    this.commentCache.delete(commentId);
    this.removeCommentFromReplyCaches(commentId);

    if (parentCommentId) {
      const parent = this.commentCache.get(parentCommentId) as ReelComment | undefined;
      if (parent) {
        this.commentCache.set(parentCommentId, {
          ...parent,
          replyCount: Math.max(0, (parent.replyCount || 0) - 1),
        });
      }
    }

    const cachedSwipe = this.reelCache.get(swipeId);
    if (cachedSwipe) {
      this.reelCache.set(swipeId, {
        ...cachedSwipe,
        commentsCount: Math.max(0, cachedSwipe.commentsCount - deletedCount),
      });
    }

    return {
      deletedCount,
      parentCommentId,
    };
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
        sensitiveContent: asset.sensitiveContent,
      })),
      // Video posts are still regular feed posts; only the dedicated swipe flow should create reels.
      postType: "post",
      location: payload.location ? { name: payload.location } : undefined,
      commentsDisabled: payload.settings?.disableComments || false,
      likesHidden: payload.settings?.hideLikeCount || false,
      filterPreset: payload.filterPreset || undefined,
      stickers: (payload.stickers || []).map((sticker) => ({
        type: sticker.type,
        text: sticker.text,
        position: {
          x: sticker.position.x,
          y: sticker.position.y,
          width: sticker.position.width,
          height: sticker.position.height,
          rotation: sticker.position.rotation || 0,
          scale: sticker.position.scale || 1,
        },
        style: sticker.style,
      })),
      collaborators: payload.collaboratorIds || [],
      hashtags: payload.hashtags,
      mentions: payload.mentions,
      taggedUsers: mapTaggedUsersForRequest(payload.taggedUsers),
      ...buildMusicRequestPayload(payload.music),
    }, {
      timeout: 120000,
    });

    const post = this.mapPost(res?.data?.post);
    this.postCache.set(post.id, post);
    return post;
  }

  async createStory(input: CreateStoryInput): Promise<Story> {
    const payload = normalizeStoryInput(input);

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

    if (payload.location) {
      stickers.push({
        type: "location",
        text: payload.location,
        position: {
          x: 0.22,
          y: 0.14,
          width: 0.34,
          height: 0.08,
          rotation: 0,
          scale: 1,
        },
      });
    }

    if (payload.customTextSticker) {
      stickers.push({
        type: "text",
        text: payload.customTextSticker,
        position: resolveStoryStickerPosition(
          payload.customTextStickerPosition,
          payload.customTextStickerPlacement,
          "text",
          payload.customTextStickerScale,
          payload.customTextStickerRotation,
        ),
        style: buildTextStickerStyle(
          payload.customTextStickerScale,
          payload.customTextStickerTheme,
          payload.customTextStickerAlignment,
        ),
      });
    }

    if (payload.customEmojiSticker) {
      stickers.push({
        type: "emoji",
        text: payload.customEmojiSticker,
        position: resolveStoryStickerPosition(
          payload.customEmojiStickerPosition,
          payload.customEmojiStickerPlacement,
          "emoji",
          payload.customEmojiStickerScale,
          payload.customEmojiStickerRotation,
        ),
        style: {
          fontSize: Math.round(36 * (payload.customEmojiStickerScale || 1)),
          alignment: "center",
        },
      });
    }

    if (payload.customImageStickerUrl) {
      stickers.push({
        type: "gif",
        text: payload.customImageStickerLabel || "Sticker",
        mediaUrl: payload.customImageStickerUrl,
        position: resolveStoryStickerPosition(
          payload.customImageStickerPosition,
          undefined,
          "emoji",
          payload.customImageStickerScale,
          payload.customImageStickerRotation,
        ),
      });
    }

    (payload.extraEmojiStickers || []).slice(0, 8).forEach((sticker) => {
      stickers.push({
        type: "emoji",
        text: sticker.text,
        position: resolveStoryStickerPosition(
          sticker.position,
          undefined,
          "emoji",
          sticker.scale,
          sticker.rotation,
        ),
        style: {
          fontSize: Math.round(36 * (sticker.scale || 1)),
          alignment: "center",
        },
      });
    });

    (payload.hashtags || []).slice(0, 3).forEach((tag, index) => {
      stickers.push({
        type: "hashtag",
        text: tag,
        position: {
          x: 0.22 + Math.min(index, 1) * 0.22,
          y: 0.24 + Math.floor(index / 2) * 0.08,
          width: 0.22,
          height: 0.07,
          rotation: 0,
          scale: 1,
        },
      });
    });

    (payload.mentions || []).slice(0, 3).forEach((mention, index) => {
      stickers.push({
        type: "mention",
        text: mention,
        position: {
          x: 0.22 + Math.min(index, 1) * 0.24,
          y: 0.34 + Math.floor(index / 2) * 0.08,
          width: 0.24,
          height: 0.07,
          rotation: 0,
          scale: 1,
        },
      });
    });

    if (payload.type === "media" && !payload.media) {
      throw new Error("Media stories require an image or video.");
    }

    if (payload.type === "text" && !payload.text?.trim()) {
      throw new Error("Text stories require text.");
    }

    if (payload.visibility === "custom" && !(payload.visibleToUserIds || []).length) {
      throw new Error("Choose at least one user for a custom story audience.");
    }

    const res = await API.post("/story/create", {
      mediaType: payload.media?.mediaType,
      mediaUrl: payload.media?.url,
      thumbnailUrl: payload.media?.thumbnailUrl,
      duration: payload.media?.durationMs ? Math.ceil(payload.media.durationMs / 1000) : undefined,
      mediaSensitivity: payload.media?.sensitiveContent,
      caption: payload.text,
      backgroundColor: payload.backgroundColor,
      filterPreset: payload.filterPreset || "none",
      filterIntensity: payload.filterIntensity ?? 1,
      stickers,
      linkUrl: payload.linkUrl,
      visibility: payload.visibility || "public",
      visibleTo: payload.visibility === "custom" ? payload.visibleToUserIds || [] : undefined,
      isCloseFriends: payload.visibility === "close_friends",
      allowReplies: payload.allowReplies,
      allowSharing: payload.allowSharing,
      ...buildMusicRequestPayload(payload.music),
    }, {
      timeout: 120000,
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
          sensitiveContent: payload.media.sensitiveContent,
        },
      ],
      postType: "reel",
      location: payload.location ? { name: payload.location } : undefined,
      hashtags: payload.hashtags,
      mentions: payload.mentions,
      taggedUsers: mapTaggedUsersForRequest(payload.taggedUsers),
      ...buildMusicRequestPayload(payload.music),
    }, {
      timeout: 120000,
    });

    const reel = this.mapReel(res?.data?.post);
    this.reelCache.set(reel.id, reel);
    return reel;
  }

  async updateStory(storyId: string, input: UpdateStoryInput): Promise<Story> {
    const payload = normalizeUpdateStoryInput(input);
    const res = await API.put(`/story/${storyId}`, {
      text: payload.text,
      backgroundColor: payload.backgroundColor,
      filterPreset: payload.filterPreset,
      filterIntensity: payload.filterIntensity,
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

export const socialApi: SocialApi = new RemoteSocialApi();
