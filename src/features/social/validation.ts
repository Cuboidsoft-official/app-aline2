import {
  Comment,
  CreatePostInput,
  CreateReelInput,
  CreateStoryInput,
  MediaAsset,
  StoryReply,
  UpdatePostInput,
  UpdateStoryInput,
} from "./types";

const MAX_CAPTION_LENGTH = 350;
const MAX_LOCATION_LENGTH = 80;
const MAX_MUSIC_LENGTH = 80;
const MAX_HASHTAGS = 20;
const MAX_MENTIONS = 20;
const MAX_COLLABS = 3;
const MAX_COMMENT_LENGTH = 2200;
const MAX_STORY_TEXT_LENGTH = 180;
const MAX_REPORT_NOTE_LENGTH = 500;

const URL_PROTOCOL_PATTERN = /^https?:\/\//i;
const USERNAME_TOKEN = /^[a-zA-Z0-9_.]{1,30}$/;

export class SocialValidationError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SocialValidationError";
    this.code = code;
  }
}

const cleanText = (value: string | undefined): string =>
  (value || "")
    .replace(/\s+/g, " ")
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return !(code <= 31 || code === 127);
    })
    .join("")
    .trim();

const assertLength = (value: string, max: number, field: string) => {
  if (value.length > max) {
    throw new SocialValidationError(
      "validation_error",
      `${field} is too long. Max ${max} characters allowed.`,
    );
  }
};

const normalizeMedia = (asset: MediaAsset): MediaAsset => {
  const normalizedUrl = cleanText(asset.url);
  const normalizedThumb = asset.thumbnailUrl ? cleanText(asset.thumbnailUrl) : undefined;

  if (!normalizedUrl || !URL_PROTOCOL_PATTERN.test(normalizedUrl)) {
    throw new SocialValidationError("validation_error", "Invalid media URL.");
  }

  if (normalizedThumb && !URL_PROTOCOL_PATTERN.test(normalizedThumb)) {
    throw new SocialValidationError("validation_error", "Invalid media thumbnail URL.");
  }

  if (asset.mediaType !== "image" && asset.mediaType !== "video") {
    throw new SocialValidationError("validation_error", "Unsupported media type.");
  }

  return {
    ...asset,
    id: cleanText(asset.id) || `media_${Date.now()}`,
    url: normalizedUrl,
    thumbnailUrl: normalizedThumb,
    altText: asset.altText ? cleanText(asset.altText) : undefined,
  };
};

const normalizeTagList = (values: string[] | undefined, maxItems: number, label: string): string[] => {
  const unique = new Set<string>();

  for (const value of values || []) {
    const raw = cleanText(value).replace(/^[@#]/, "");
    if (!raw) {
      continue;
    }

    if (!USERNAME_TOKEN.test(raw)) {
      throw new SocialValidationError("validation_error", `Invalid ${label}: ${value}`);
    }

    unique.add(raw.toLowerCase());
  }

  if (unique.size > maxItems) {
    throw new SocialValidationError(
      "validation_error",
      `Too many ${label}. Maximum ${maxItems} allowed.`,
    );
  }

  return Array.from(unique);
};

export const parseCaptionEntities = (caption: string): { hashtags: string[]; mentions: string[] } => {
  const hashtagMatches = caption.match(/#([a-zA-Z0-9_.]{1,30})/g) || [];
  const mentionMatches = caption.match(/@([a-zA-Z0-9_.]{1,30})/g) || [];

  return {
    hashtags: normalizeTagList(hashtagMatches, MAX_HASHTAGS, "hashtags"),
    mentions: normalizeTagList(mentionMatches, MAX_MENTIONS, "mentions"),
  };
};

export const normalizePostInput = (input: CreatePostInput): CreatePostInput => {
  const caption = cleanText(input.caption);
  const location = cleanText(input.location);
  const music = cleanText(input.music);

  if (!caption) {
    throw new SocialValidationError("validation_error", "Caption is required.");
  }

  assertLength(caption, MAX_CAPTION_LENGTH, "Caption");
  assertLength(location, MAX_LOCATION_LENGTH, "Location");
  assertLength(music, MAX_MUSIC_LENGTH, "Music");

  const media = (input.media || []).map(normalizeMedia);

  if (!media.length) {
    throw new SocialValidationError("validation_error", "At least one media item is required.");
  }

  if (media.length > 10) {
    throw new SocialValidationError("validation_error", "Maximum 10 media items are allowed.");
  }

  const hashtags = normalizeTagList(input.hashtags, MAX_HASHTAGS, "hashtags");
  const mentions = normalizeTagList(input.mentions, MAX_MENTIONS, "mentions");
  const collaboratorIds = Array.from(new Set((input.collaboratorIds || []).map(cleanText).filter(Boolean))).slice(
    0,
    MAX_COLLABS,
  );

  return {
    ...input,
    caption,
    location,
    music,
    media,
    hashtags,
    mentions,
    collaboratorIds,
  };
};

export const normalizeStoryInput = (input: CreateStoryInput): CreateStoryInput => {
  const type = input.type;

  if (!["media", "text", "poll", "question"].includes(type)) {
    throw new SocialValidationError("validation_error", "Invalid story type.");
  }

  const media = input.media ? normalizeMedia(input.media) : undefined;
  const text = cleanText(input.text);
  const linkUrl = cleanText(input.linkUrl);
  const hashtags = normalizeTagList(input.hashtags, MAX_HASHTAGS, "hashtags");
  const mentions = normalizeTagList(input.mentions, MAX_MENTIONS, "mentions");

  if (linkUrl && !URL_PROTOCOL_PATTERN.test(linkUrl)) {
    throw new SocialValidationError("validation_error", "Story link must be http/https.");
  }

  if (type === "media" && !media) {
    throw new SocialValidationError("validation_error", "Media story requires a media asset.");
  }

  if (type === "text") {
    if (!text) {
      throw new SocialValidationError("validation_error", "Text story cannot be empty.");
    }
    assertLength(text, MAX_STORY_TEXT_LENGTH, "Story text");
  }

  if (type === "poll") {
    const question = cleanText(input.poll?.question);
    const optionA = cleanText(input.poll?.options?.[0]);
    const optionB = cleanText(input.poll?.options?.[1]);

    if (!question || !optionA || !optionB) {
      throw new SocialValidationError("validation_error", "Poll stories require question and two options.");
    }
  }

  if (type === "question") {
    const prompt = cleanText(input.question?.prompt);
    if (!prompt) {
      throw new SocialValidationError("validation_error", "Question stories require a prompt.");
    }
  }

  return {
    ...input,
    media,
    text,
    linkUrl: linkUrl || undefined,
    hashtags,
    mentions,
    allowReplies: input.allowReplies !== false,
    allowSharing: input.allowSharing !== false,
    music: input.music?.trackName
      ? {
          trackName: cleanText(input.music.trackName).slice(0, MAX_MUSIC_LENGTH),
          artistName: cleanText(input.music.artistName).slice(0, MAX_MUSIC_LENGTH) || undefined,
          startTime: input.music.startTime,
          duration: input.music.duration,
        }
      : undefined,
  };
};

export const normalizeReelInput = (input: CreateReelInput): CreateReelInput => {
  const caption = cleanText(input.caption);
  const music = cleanText(input.music);
  const location = cleanText(input.location);

  if (!caption) {
    throw new SocialValidationError("validation_error", "Caption is required.");
  }

  assertLength(caption, MAX_CAPTION_LENGTH, "Caption");
  assertLength(music, MAX_MUSIC_LENGTH, "Music");
  assertLength(location, MAX_LOCATION_LENGTH, "Location");

  return {
    ...input,
    caption,
    music,
    location,
    media: normalizeMedia(input.media),
    thumbnailUrl: input.thumbnailUrl ? cleanText(input.thumbnailUrl) : undefined,
    hashtags: normalizeTagList(input.hashtags, MAX_HASHTAGS, "hashtags"),
    mentions: normalizeTagList(input.mentions, MAX_MENTIONS, "mentions"),
  };
};

export const normalizeCommentText = (text: string): string => {
  const clean = cleanText(text);

  if (!clean) {
    throw new SocialValidationError("validation_error", "Comment cannot be empty.");
  }

  assertLength(clean, MAX_COMMENT_LENGTH, "Comment");
  return clean;
};

export const normalizeReportNote = (text: string | undefined): string | undefined => {
  if (text === undefined) {
    return undefined;
  }

  const clean = cleanText(text);
  if (!clean) {
    return undefined;
  }

  assertLength(clean, MAX_REPORT_NOTE_LENGTH, "Report note");
  return clean;
};

export const normalizeUpdatePostInput = (input: UpdatePostInput): UpdatePostInput => {
  const caption = input.caption !== undefined ? cleanText(input.caption) : undefined;
  const location = input.location !== undefined ? cleanText(input.location) : undefined;
  const music = input.music !== undefined ? cleanText(input.music) : undefined;

  if (caption !== undefined) {
    if (!caption) {
      throw new SocialValidationError("validation_error", "Caption cannot be empty.");
    }

    assertLength(caption, MAX_CAPTION_LENGTH, "Caption");
  }

  if (location !== undefined) {
    assertLength(location, MAX_LOCATION_LENGTH, "Location");
  }

  if (music !== undefined) {
    assertLength(music, MAX_MUSIC_LENGTH, "Music");
  }

  return {
    caption,
    location,
    music,
    hashtags: input.hashtags ? normalizeTagList(input.hashtags, MAX_HASHTAGS, "hashtags") : undefined,
    mentions: input.mentions ? normalizeTagList(input.mentions, MAX_MENTIONS, "mentions") : undefined,
    settings: input.settings,
  };
};

export const normalizeUpdateStoryInput = (input: UpdateStoryInput): UpdateStoryInput => {
  const linkUrl = input.linkUrl !== undefined ? cleanText(input.linkUrl) : undefined;
  const text = input.text !== undefined ? cleanText(input.text) : undefined;

  if (linkUrl && !URL_PROTOCOL_PATTERN.test(linkUrl)) {
    throw new SocialValidationError("validation_error", "Story link must be http/https.");
  }

  if (text !== undefined) {
    assertLength(text, MAX_STORY_TEXT_LENGTH, "Story text");
  }

  return {
    text,
    backgroundColor: input.backgroundColor !== undefined ? cleanText(input.backgroundColor) : undefined,
    linkUrl,
    visibility: input.visibility,
    allowReplies: input.allowReplies,
    allowSharing: input.allowSharing,
    music: input.music?.trackName
      ? {
          trackName: cleanText(input.music.trackName).slice(0, MAX_MUSIC_LENGTH),
          artistName: cleanText(input.music.artistName).slice(0, MAX_MUSIC_LENGTH) || undefined,
          startTime: input.music.startTime,
          duration: input.music.duration,
        }
      : undefined,
  };
};

export const toUserSafeMessage = (error: unknown): string => {
  if (error instanceof SocialValidationError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
};

export const limits = {
  caption: MAX_CAPTION_LENGTH,
  location: MAX_LOCATION_LENGTH,
  music: MAX_MUSIC_LENGTH,
  comment: MAX_COMMENT_LENGTH,
  storyText: MAX_STORY_TEXT_LENGTH,
};

export const cloneComment = (comment: Comment): Comment => ({
  ...comment,
  user: { ...comment.user },
  mentions: comment.mentions ? [...comment.mentions] : undefined,
});
export const cloneStoryReply = (reply: StoryReply): StoryReply => ({ ...reply, fromUser: { ...reply.fromUser } });
