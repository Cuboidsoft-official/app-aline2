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
