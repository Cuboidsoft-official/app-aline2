import { isFeedVideoSoundOn, shouldMuteFeedVideo } from "../src/utils/feedMediaSound";

describe("feed video sound state", () => {
  const baseOptions = {
    isPostActive: true,
    isVideoSoundEnabled: true,
    isPostMuted: false,
    hasAttachedMusic: false,
  };

  it("unmutes active video only when global video sound is enabled", () => {
    expect(shouldMuteFeedVideo(baseOptions)).toBe(false);
    expect(shouldMuteFeedVideo({ ...baseOptions, isVideoSoundEnabled: false })).toBe(true);
  });

  it("mutes inactive, non-visible carousel, explicitly muted, or music-overlaid videos", () => {
    expect(shouldMuteFeedVideo({ ...baseOptions, isPostActive: false })).toBe(true);
    expect(shouldMuteFeedVideo({ ...baseOptions, isCarouselItemActive: false })).toBe(true);
    expect(shouldMuteFeedVideo({ ...baseOptions, isPostMuted: true })).toBe(true);
    expect(shouldMuteFeedVideo({ ...baseOptions, hasAttachedMusic: true })).toBe(true);
  });

  it("reports the sound hint from the same audible state", () => {
    expect(isFeedVideoSoundOn(baseOptions)).toBe(true);
    expect(isFeedVideoSoundOn({ ...baseOptions, isPostMuted: true })).toBe(false);
    expect(isFeedVideoSoundOn({ ...baseOptions, hasAttachedMusic: true })).toBe(false);
  });
});
