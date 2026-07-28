type FeedVideoMuteOptions = {
  isPostActive: boolean;
  isCarouselItemActive?: boolean;
  isVideoSoundEnabled: boolean;
  isPostMuted: boolean;
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
}: FeedVideoMuteOptions): boolean => {
  return !isPostActive
  || !isCarouselItemActive
  || !isVideoSoundEnabled
  || isPostMuted;
};

export const isFeedVideoSoundOn = ({
  isVideoSoundEnabled,
  isPostMuted,
}: Pick<FeedVideoMuteOptions, "isVideoSoundEnabled" | "isPostMuted">): boolean =>
  isVideoSoundEnabled && !isPostMuted;

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
