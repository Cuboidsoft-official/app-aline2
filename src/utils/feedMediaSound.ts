type FeedVideoMuteOptions = {
  isPostActive: boolean;
  isCarouselItemActive?: boolean;
  isVideoSoundEnabled: boolean;
  isPostMuted: boolean;
  hasAttachedMusic: boolean;
};

type FeedVideoMountOptions = {
  isPostActive: boolean;
  isCarouselItemActive?: boolean;
  isScreenFocused: boolean;
  isScrolling?: boolean;
};

export const FEED_VIDEO_SOUND_DEFAULT = true;

export const shouldMuteFeedVideo = ({
  isPostActive,
  isCarouselItemActive = true,
  isVideoSoundEnabled,
  isPostMuted,
  hasAttachedMusic,
}: FeedVideoMuteOptions): boolean =>
  !isPostActive
  || !isCarouselItemActive
  || !isVideoSoundEnabled
  || isPostMuted
  || hasAttachedMusic;

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
}: Pick<FeedVideoMuteOptions, "isVideoSoundEnabled" | "isPostMuted" | "hasAttachedMusic"> & {
  hasVideoMedia: boolean;
}): boolean => {
  if (isPostMuted) {
    return false;
  }

  if (hasAttachedMusic) {
    return true;
  }

  return hasVideoMedia && isVideoSoundEnabled;
};

export const shouldMountFeedVideo = ({
  isPostActive,
  isCarouselItemActive = true,
  isScreenFocused,
  isScrolling = false,
}: FeedVideoMountOptions): boolean =>
  isScreenFocused
  && !isScrolling
  && isPostActive
  && isCarouselItemActive;
