import {
  Comment,
  CreatePostInput,
  CreateReelInput,
  CreateStoryInput,
  MediaAsset,
  SelectedMusicClip,
  StoryReply,
  UpdatePostInput,
  UpdateStoryInput,
} from "./types";
import { getReadableApiErrorMessage } from "../../api/networkErrors";

const MAX_CAPTION_LENGTH = 350;
const MAX_LOCATION_LENGTH = 80;
const MAX_MUSIC_LENGTH = 80;
const MAX_HASHTAGS = 20;
const MAX_MENTIONS = 20;
const MAX_TAGGED_USERS = 20;
const MAX_COLLABS = 3;
const MAX_COMMENT_LENGTH = 2200;
const MAX_STORY_TEXT_LENGTH = 180;
const MAX_REPORT_NOTE_LENGTH = 500;
const MAX_CLIP_DURATION = 30;
const MAX_STORY_EMOJI_STICKERS = 8;

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
    sensitiveContent: asset.sensitiveContent?.isSensitive
      ? {
          isSensitive: true,
          blur: asset.sensitiveContent.blur !== false,
          label: asset.sensitiveContent.label ? cleanText(asset.sensitiveContent.label) : undefined,
          confidence:
            typeof asset.sensitiveContent.confidence === "number"
              ? asset.sensitiveContent.confidence
              : undefined,
        }
      : undefined,
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

const normalizeTaggedUsers = (values: CreatePostInput["taggedUsers"] | CreateReelInput["taggedUsers"]) => {
  const unique = new Map<string, { user: string; username?: string }>();

  for (const value of values || []) {
    const user = cleanText(value?.user);
    const username = cleanText(value?.username).replace(/^@/, "").toLowerCase() || undefined;

    if (!user) {
      continue;
    }

    if (username && !USERNAME_TOKEN.test(username)) {
      throw new SocialValidationError("validation_error", `Invalid tagged user: ${value?.username}`);
    }

    if (!unique.has(user)) {
      unique.set(user, {
        user,
        username,
      });
    }
  }

  if (unique.size > MAX_TAGGED_USERS) {
    throw new SocialValidationError(
      "validation_error",
      `Too many tagged users. Maximum ${MAX_TAGGED_USERS} allowed.`,
    );
  }

  return Array.from(unique.values());
};

const normalizeSelectedMusic = (music: SelectedMusicClip | undefined): SelectedMusicClip | undefined => {
  if (!music) {
    return undefined;
  }

  const id = cleanText(music.id);
  const title = cleanText(music.title);
  const artist = cleanText(music.artist);
  const source = cleanText(music.source);
  const artworkUrl = music.artworkUrl ? cleanText(music.artworkUrl) : undefined;
  const previewUrl = music.previewUrl ? cleanText(music.previewUrl) : undefined;
  const duration = Math.max(1, Math.round(Number(music.duration || 0)));
  const clipDuration = Math.max(
    1,
    Math.min(
      MAX_CLIP_DURATION,
      Math.round(Number(music.clipDuration || duration || 1)),
      duration,
    ),
  );
  const clipStartTime = Math.max(
    0,
    Math.min(duration - 1, Math.round(Number(music.clipStartTime || 0))),
  );
  const clipEndTime = Math.max(
    clipStartTime + 1,
    Math.min(duration, Math.round(Number(music.clipEndTime || clipStartTime + clipDuration))),
  );

  if (!id || !title || !duration) {
    throw new SocialValidationError("validation_error", "Choose a valid music track.");
  }

  assertLength(title, MAX_MUSIC_LENGTH, "Music title");

  if (artist) {
    assertLength(artist, MAX_MUSIC_LENGTH, "Music artist");
  }

  if (artworkUrl && !URL_PROTOCOL_PATTERN.test(artworkUrl)) {
    throw new SocialValidationError("validation_error", "Music artwork URL must be http/https.");
  }

  if (previewUrl && !URL_PROTOCOL_PATTERN.test(previewUrl)) {
    throw new SocialValidationError("validation_error", "Music preview URL must be http/https.");
  }

  return {
    ...music,
    id,
    title,
    artist: artist || undefined,
    source: source || undefined,
    artworkUrl,
    previewUrl,
    duration,
    clipStartTime,
    clipEndTime,
    clipDuration,
  };
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
  const music = normalizeSelectedMusic(input.music);

  assertLength(caption, MAX_CAPTION_LENGTH, "Caption");
  assertLength(location, MAX_LOCATION_LENGTH, "Location");

  const media = (input.media || []).map(normalizeMedia);

  if (!media.length) {
    throw new SocialValidationError("validation_error", "At least one media item is required.");
  }

  if (media.length > 10) {
    throw new SocialValidationError("validation_error", "Maximum 10 media items are allowed.");
  }

  const hashtags = normalizeTagList(input.hashtags, MAX_HASHTAGS, "hashtags");
  const mentions = normalizeTagList(input.mentions, MAX_MENTIONS, "mentions");
  const taggedUsers = normalizeTaggedUsers(input.taggedUsers);
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
    taggedUsers,
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
  const location = cleanText(input.location);
  const filterPreset = input.filterPreset;
  const filterIntensity = input.filterIntensity;
  const customTextSticker = cleanText(input.customTextSticker);
  const customEmojiSticker = cleanText(input.customEmojiSticker);
  const customTextStickerPlacement = input.customTextStickerPlacement;
  const customEmojiStickerPlacement = input.customEmojiStickerPlacement;
  const customTextStickerPosition = input.customTextStickerPosition;
  const customEmojiStickerPosition = input.customEmojiStickerPosition;
  const customImageStickerUrl = cleanText(input.customImageStickerUrl);
  const customImageStickerLabel = cleanText(input.customImageStickerLabel);
  const customImageStickerPosition = input.customImageStickerPosition;
  const customTextStickerScale = input.customTextStickerScale;
  const customEmojiStickerScale = input.customEmojiStickerScale;
  const customImageStickerScale = input.customImageStickerScale;
  const customTextStickerRotation = input.customTextStickerRotation;
  const customEmojiStickerRotation = input.customEmojiStickerRotation;
  const customImageStickerRotation = input.customImageStickerRotation;
  const customTextStickerTheme = input.customTextStickerTheme;
  const customTextStickerAlignment = input.customTextStickerAlignment;
  const extraEmojiStickers =
    Array.isArray(input.extraEmojiStickers)
      ? input.extraEmojiStickers
        .map((sticker) => ({
          text: cleanText(sticker?.text),
          position: {
            x: Number(sticker?.position?.x),
            y: Number(sticker?.position?.y),
          },
          scale:
            sticker?.scale === undefined || sticker?.scale === null
              ? undefined
              : Number(sticker.scale),
          rotation:
            sticker?.rotation === undefined || sticker?.rotation === null
              ? undefined
              : Number(sticker.rotation),
        }))
        .filter((sticker) => sticker.text)
      : [];
  const hashtags = normalizeTagList(input.hashtags, MAX_HASHTAGS, "hashtags");
  const mentions = normalizeTagList(input.mentions, MAX_MENTIONS, "mentions");
  const music = normalizeSelectedMusic(input.music);

  if (linkUrl && !URL_PROTOCOL_PATTERN.test(linkUrl)) {
    throw new SocialValidationError("validation_error", "Story link must be http/https.");
  }

  if (filterPreset !== undefined && !["none", "warm", "cool", "noir", "dream"].includes(filterPreset)) {
    throw new SocialValidationError("validation_error", "Invalid story filter.");
  }

  if (
    filterIntensity !== undefined &&
    (typeof filterIntensity !== "number" || filterIntensity < 0.2 || filterIntensity > 1)
  ) {
    throw new SocialValidationError("validation_error", "Invalid story filter intensity.");
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

  assertLength(customTextSticker, 60, "Story text sticker");
  assertLength(customEmojiSticker, 16, "Story emoji sticker");
  assertLength(customImageStickerLabel, 40, "Story image sticker");

  if (extraEmojiStickers.length > MAX_STORY_EMOJI_STICKERS) {
    throw new SocialValidationError(
      "validation_error",
      `Maximum ${MAX_STORY_EMOJI_STICKERS} extra emoji stickers are allowed.`,
    );
  }

  if (
    customTextStickerPlacement !== undefined &&
    !["top_left", "top_right", "center", "bottom_left", "bottom_right"].includes(customTextStickerPlacement)
  ) {
    throw new SocialValidationError("validation_error", "Invalid text sticker placement.");
  }

  if (
    customEmojiStickerPlacement !== undefined &&
    !["top_left", "top_right", "center", "bottom_left", "bottom_right"].includes(customEmojiStickerPlacement)
  ) {
    throw new SocialValidationError("validation_error", "Invalid emoji sticker placement.");
  }

  if (
    customTextStickerPosition &&
    (typeof customTextStickerPosition.x !== "number" ||
      typeof customTextStickerPosition.y !== "number" ||
      customTextStickerPosition.x < 0 ||
      customTextStickerPosition.x > 1 ||
      customTextStickerPosition.y < 0 ||
      customTextStickerPosition.y > 1)
  ) {
    throw new SocialValidationError("validation_error", "Invalid text sticker position.");
  }

  if (
    customEmojiStickerPosition &&
    (typeof customEmojiStickerPosition.x !== "number" ||
      typeof customEmojiStickerPosition.y !== "number" ||
      customEmojiStickerPosition.x < 0 ||
      customEmojiStickerPosition.x > 1 ||
      customEmojiStickerPosition.y < 0 ||
      customEmojiStickerPosition.y > 1)
  ) {
    throw new SocialValidationError("validation_error", "Invalid emoji sticker position.");
  }

  if (
    customImageStickerPosition &&
    (typeof customImageStickerPosition.x !== "number" ||
      typeof customImageStickerPosition.y !== "number" ||
      customImageStickerPosition.x < 0 ||
      customImageStickerPosition.x > 1 ||
      customImageStickerPosition.y < 0 ||
      customImageStickerPosition.y > 1)
  ) {
    throw new SocialValidationError("validation_error", "Invalid image sticker position.");
  }

  if (
    customTextStickerScale !== undefined &&
    (typeof customTextStickerScale !== "number" || customTextStickerScale < 0.6 || customTextStickerScale > 2)
  ) {
    throw new SocialValidationError("validation_error", "Invalid text sticker size.");
  }

  if (
    customEmojiStickerScale !== undefined &&
    (typeof customEmojiStickerScale !== "number" || customEmojiStickerScale < 0.6 || customEmojiStickerScale > 2)
  ) {
    throw new SocialValidationError("validation_error", "Invalid emoji sticker size.");
  }

  if (
    customImageStickerScale !== undefined &&
    (typeof customImageStickerScale !== "number" || customImageStickerScale < 0.6 || customImageStickerScale > 2)
  ) {
    throw new SocialValidationError("validation_error", "Invalid image sticker size.");
  }

  if (
    customTextStickerRotation !== undefined &&
    (typeof customTextStickerRotation !== "number" || customTextStickerRotation < -180 || customTextStickerRotation > 180)
  ) {
    throw new SocialValidationError("validation_error", "Invalid text sticker rotation.");
  }

  if (
    customTextStickerTheme !== undefined &&
    !["dark", "light", "accent", "outline"].includes(customTextStickerTheme)
  ) {
    throw new SocialValidationError("validation_error", "Invalid text sticker theme.");
  }

  if (
    customTextStickerAlignment !== undefined &&
    !["left", "center", "right"].includes(customTextStickerAlignment)
  ) {
    throw new SocialValidationError("validation_error", "Invalid text sticker alignment.");
  }

  if (
    customEmojiStickerRotation !== undefined &&
    (typeof customEmojiStickerRotation !== "number" || customEmojiStickerRotation < -180 || customEmojiStickerRotation > 180)
  ) {
    throw new SocialValidationError("validation_error", "Invalid emoji sticker rotation.");
  }

  if (
    customImageStickerRotation !== undefined &&
    (typeof customImageStickerRotation !== "number" || customImageStickerRotation < -180 || customImageStickerRotation > 180)
  ) {
    throw new SocialValidationError("validation_error", "Invalid image sticker rotation.");
  }

  if (customImageStickerUrl && !URL_PROTOCOL_PATTERN.test(customImageStickerUrl)) {
    throw new SocialValidationError("validation_error", "Story image sticker must use a valid URL.");
  }

  extraEmojiStickers.forEach((sticker) => {
    assertLength(sticker.text, 16, "Story emoji sticker");

    if (
      !Number.isFinite(sticker.position.x) ||
      !Number.isFinite(sticker.position.y) ||
      sticker.position.x < 0 ||
      sticker.position.x > 1 ||
      sticker.position.y < 0 ||
      sticker.position.y > 1
    ) {
      throw new SocialValidationError("validation_error", "Invalid extra emoji sticker position.");
    }

    if (
      sticker.scale !== undefined &&
      (typeof sticker.scale !== "number" || sticker.scale < 0.6 || sticker.scale > 2)
    ) {
      throw new SocialValidationError("validation_error", "Invalid extra emoji sticker size.");
    }

    if (
      sticker.rotation !== undefined &&
      (typeof sticker.rotation !== "number" || sticker.rotation < -180 || sticker.rotation > 180)
    ) {
      throw new SocialValidationError("validation_error", "Invalid extra emoji sticker rotation.");
    }
  });

  return {
    ...input,
    media,
    text,
    linkUrl: linkUrl || undefined,
    location: location || undefined,
    filterPreset,
    filterIntensity,
    customTextSticker: customTextSticker || undefined,
    customTextStickerPlacement,
    customTextStickerPosition,
    customTextStickerScale,
    customTextStickerRotation,
    customTextStickerTheme,
    customTextStickerAlignment,
    customEmojiSticker: customEmojiSticker || undefined,
    customEmojiStickerPlacement,
    customEmojiStickerPosition,
    customEmojiStickerScale,
    customEmojiStickerRotation,
    customImageStickerUrl: customImageStickerUrl || undefined,
    customImageStickerLabel: customImageStickerLabel || undefined,
    customImageStickerPosition,
    customImageStickerScale,
    customImageStickerRotation,
    extraEmojiStickers: extraEmojiStickers.length ? extraEmojiStickers : undefined,
    hashtags,
    mentions,
    allowReplies: input.allowReplies !== false,
    allowSharing: input.allowSharing !== false,
    music,
  };
};

export const normalizeReelInput = (input: CreateReelInput): CreateReelInput => {
  const caption = cleanText(input.caption);
  const music = normalizeSelectedMusic(input.music);
  const location = cleanText(input.location);

  assertLength(caption, MAX_CAPTION_LENGTH, "Caption");
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
    taggedUsers: normalizeTaggedUsers(input.taggedUsers),
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

export const normalizeOptionalCommentText = (text: string | undefined): string => {
  const clean = cleanText(text);

  if (!clean) {
    return "";
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
  const filterPreset = input.filterPreset;
  const filterIntensity = input.filterIntensity;

  if (linkUrl && !URL_PROTOCOL_PATTERN.test(linkUrl)) {
    throw new SocialValidationError("validation_error", "Story link must be http/https.");
  }

  if (text !== undefined) {
    assertLength(text, MAX_STORY_TEXT_LENGTH, "Story text");
  }

  if (filterPreset !== undefined && !["none", "warm", "cool", "noir", "dream"].includes(filterPreset)) {
    throw new SocialValidationError("validation_error", "Invalid story filter.");
  }

  if (
    filterIntensity !== undefined &&
    (typeof filterIntensity !== "number" || filterIntensity < 0.2 || filterIntensity > 1)
  ) {
    throw new SocialValidationError("validation_error", "Invalid story filter intensity.");
  }

  return {
    text,
    backgroundColor: input.backgroundColor !== undefined ? cleanText(input.backgroundColor) : undefined,
    linkUrl,
    filterPreset,
    filterIntensity,
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

  if (typeof error === "object" && error !== null) {
    const maybeAxiosError = error as {
      response?: { data?: { message?: string } };
      message?: string;
    };

    if (maybeAxiosError.response?.data?.message) {
      return String(maybeAxiosError.response.data.message);
    }
  }

  if (error instanceof Error && error.message) {
    if (typeof (error as any)?.response !== "undefined") {
      return getReadableApiErrorMessage(error, error.message);
    }
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
