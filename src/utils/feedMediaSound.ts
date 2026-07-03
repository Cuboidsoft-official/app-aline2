type FeedVideoMuteOptions = {
  isPostActive: boolean;
  isCarouselItemActive?: boolean;
  isVideoSoundEnabled: boolean;
  isPostMuted: boolean;
  hasAttachedMusic: boolean;
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
