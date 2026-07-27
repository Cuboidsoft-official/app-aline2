type FeedVideoMuteOptions = {
  isPostActive: boolean;
  isCarouselItemActive?: boolean;
  isVideoSoundEnabled: boolean;
  isPostMuted: boolean;
  hasAttachedMusic: boolean;
  originalAudioVolume?: number;
};

type FeedVideoMountOptions = {
  isPostActive: boolean;
  isCarouselItemActive?: boolean;
  isScreenFocused: boolean;
  isScrolling?: boolean;
};

export const FEED_VIDEO_SOUND_DEFAULT = true;

const resolveOriginalAudioVolume = (value: number | undefined, hasAttachedMusic: boolean): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return hasAttachedMusic ? 0 : 1;
  }

  return Math.max(0, Math.min(1, value));
};

export const shouldMuteFeedVideo = ({
  isPostActive,
  isCarouselItemActive = true,
  isVideoSoundEnabled,
  isPostMuted,
  hasAttachedMusic,
  originalAudioVolume,
}: FeedVideoMuteOptions): boolean => {
  const resolvedOriginalAudioVolume = resolveOriginalAudioVolume(originalAudioVolume, hasAttachedMusic);

  return !isPostActive
  || !isCarouselItemActive
  || !isVideoSoundEnabled
  || isPostMuted
  || resolvedOriginalAudioVolume <= 0;
};

export const isFeedVideoSoundOn = ({
  isVideoSoundEnabled,
  isPostMuted,
  hasAttachedMusic,
}: Pick<FeedVideoMuteOptions, "isVideoSoundEnabled" | "isPostMuted" | "hasAttachedMusic">): boolean =>
  isVideoSoundEnabled && !isPostMuted && !hasAttachedMusic;

export const isFeedPostAudioOn = ({
  hasVideoMedia,
  hasAttachedMusic,
  isVideoSoundEnabled,
  isPostMuted,
  originalAudioVolume,
}: Pick<FeedVideoMuteOptions, "isVideoSoundEnabled" | "isPostMuted" | "hasAttachedMusic"> & {
  hasVideoMedia: boolean;
  originalAudioVolume?: number;
}): boolean => {
  if (isPostMuted) {
    return false;
  }

  if (hasAttachedMusic) {
    return true;
  }

  return hasVideoMedia
    && isVideoSoundEnabled
    && resolveOriginalAudioVolume(originalAudioVolume, hasAttachedMusic) > 0;
};

export const shouldMountFeedVideo = ({
  isPostActive,
  isCarouselItemActive = true,
  isScreenFocused,
  isScrolling = false,
}: FeedVideoMountOptions): boolean => {
  void isScrolling;

  return isScreenFocused
  && isPostActive
  && isCarouselItemActive;
};
