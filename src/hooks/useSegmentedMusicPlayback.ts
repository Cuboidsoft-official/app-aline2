import { useCallback, useEffect, useMemo, useRef } from "react";
import { createSound } from "react-native-nitro-sound";

import { ensureAudioClipStartPosition, startManagedAudioClipPlayback } from "../utils/audioPlayback";

type UseSegmentedMusicPlaybackParams = {
  rawUrl: string;
  normalizedUrl: string;
  youtubeVideoId?: string;
  trackKey: string;
  startMs: number;
  durationMs: number;
  shouldPlay: boolean;
};

const noop = () => {};

export function useSegmentedMusicPlayback({
  rawUrl,
  normalizedUrl,
  trackKey,
  startMs,
  durationMs,
  shouldPlay,
}: UseSegmentedMusicPlaybackParams) {
  const audioPlayerRef = useRef(createSound());
  const audioTrackKeyRef = useRef("");
  const audioSourceKeyRef = useRef("");
  const audioEndMsRef = useRef(0);
  const audioStartMsRef = useRef(0);
  const shouldLoopRef = useRef(false);
  const youtubePlayerRef = useRef<any>(null);
  const playbackEndMs = durationMs > 0 ? startMs + durationMs : 0;
  const audioSourceKey = useMemo(() => normalizedUrl || rawUrl, [normalizedUrl, rawUrl]);

  useEffect(() => {
    audioStartMsRef.current = startMs;
    audioEndMsRef.current = playbackEndMs;
    shouldLoopRef.current = shouldPlay;
  }, [playbackEndMs, shouldPlay, startMs]);

  const resetAudioPlayback = useCallback(async () => {
    audioTrackKeyRef.current = "";
    audioSourceKeyRef.current = "";
    audioEndMsRef.current = 0;

    try {
      await audioPlayerRef.current.stopPlayer();
    } catch {
      // noop
    }
  }, []);

  const pauseAudioPlayback = useCallback(async () => {
    try {
      await audioPlayerRef.current.pausePlayer();
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    const player = audioPlayerRef.current;

    player.setSubscriptionDuration(0.1);
    player.addPlayBackListener((event: any) => {
      const currentPosition = Math.max(0, Number(event?.currentPosition || 0));

      if (audioEndMsRef.current > 0 && currentPosition >= audioEndMsRef.current) {
        if (shouldLoopRef.current) {
          player.seekToPlayer(audioStartMsRef.current).then(() => player.resumePlayer()).catch(() => undefined);
        } else {
          player.pausePlayer().catch(() => undefined);
        }
      }
    });
    player.addPlaybackEndListener(() => {
      if (shouldLoopRef.current) {
        player.seekToPlayer(audioStartMsRef.current).then(() => player.resumePlayer()).catch(() => undefined);
      }
    });

    return () => {
      try {
        player.removePlayBackListener();
      } catch {
        // noop
      }

      try {
        player.removePlaybackEndListener();
      } catch {
        // noop
      }

      player.stopPlayer().catch(() => undefined);
      player.dispose();
    };
  }, []);

  useEffect(() => {
    if (!shouldPlay) {
      pauseAudioPlayback().catch(() => undefined);
      return;
    }

    const resumeAudio = async () => {
      if (!audioSourceKey) {
        return;
      }

      if (audioTrackKeyRef.current === trackKey) {
        await ensureAudioClipStartPosition(audioPlayerRef.current, startMs).catch(() => undefined);
        await audioPlayerRef.current.resumePlayer().catch(() => undefined);
        return;
      }

      if (audioSourceKeyRef.current === audioSourceKey) {
        try {
          audioTrackKeyRef.current = trackKey;
          await ensureAudioClipStartPosition(audioPlayerRef.current, startMs);
          await audioPlayerRef.current.resumePlayer().catch(() => undefined);
          return;
        } catch {
          await resetAudioPlayback();
        }
      }

      await resetAudioPlayback();
      audioTrackKeyRef.current = trackKey;
      audioSourceKeyRef.current = audioSourceKey;
      await startManagedAudioClipPlayback(audioPlayerRef.current, {
        rawValue: rawUrl,
        normalizedValue: normalizedUrl,
        startPositionMs: startMs,
        volume: 1,
        seekSettleDelayMs: 70,
      });
    };

    resumeAudio().catch((error) => {
      console.log("segmented music playback error", error);
      resetAudioPlayback().catch(() => undefined);
    });
  }, [
    audioSourceKey,
    normalizedUrl,
    pauseAudioPlayback,
    rawUrl,
    resetAudioPlayback,
    shouldPlay,
    startMs,
    trackKey,
  ]);

  return {
    isUsingYoutube: false,
    youtubePlay: false,
    youtubePlayerRef,
    handleYoutubeReady: noop,
    handleYoutubeError: noop,
    handleYoutubeStateChange: noop,
  };
}
