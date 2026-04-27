import { useCallback, useEffect, useRef, useState } from "react";
import { createSound } from "react-native-nitro-sound";

import { ensureAudioClipStartPosition, startManagedAudioClipPlayback } from "../utils/audioPlayback";

type UseSegmentedMusicPlaybackParams = {
  rawUrl: string;
  normalizedUrl: string;
  youtubeVideoId: string;
  trackKey: string;
  startMs: number;
  durationMs: number;
  shouldPlay: boolean;
};

export function useSegmentedMusicPlayback({
  rawUrl,
  normalizedUrl,
  youtubeVideoId,
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
  const youtubeTrackKeyRef = useRef("");
  const youtubeSourceKeyRef = useRef("");
  const youtubePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const youtubeVideoIdRef = useRef("");
  const [isYoutubeReady, setIsYoutubeReady] = useState(false);
  const [youtubePlay, setYoutubePlay] = useState(false);

  const isUsingYoutube = !!youtubeVideoId;
  const playbackEndMs = durationMs > 0 ? startMs + durationMs : 0;
  const audioSourceKey = normalizedUrl || rawUrl;

  useEffect(() => {
    audioStartMsRef.current = startMs;
    audioEndMsRef.current = playbackEndMs;
    shouldLoopRef.current = shouldPlay;
    youtubeVideoIdRef.current = youtubeVideoId;
  }, [playbackEndMs, shouldPlay, startMs, youtubeVideoId]);

  const stopYoutubePolling = useCallback(() => {
    if (youtubePollRef.current) {
      clearInterval(youtubePollRef.current);
      youtubePollRef.current = null;
    }
  }, []);

  const seekYoutubeToStart = useCallback(() => {
    youtubePlayerRef.current?.seekTo?.(Math.max(0, audioStartMsRef.current / 1000), true);
  }, []);

  const startYoutubePolling = useCallback(() => {
    stopYoutubePolling();
    youtubePollRef.current = setInterval(async () => {
      try {
        const currentSeconds = await youtubePlayerRef.current?.getCurrentTime?.();
        const currentMs = Math.max(0, Math.round(Number(currentSeconds || 0) * 1000));

        if (audioEndMsRef.current > 0 && currentMs >= audioEndMsRef.current) {
          if (shouldLoopRef.current) {
            seekYoutubeToStart();
          } else {
            setYoutubePlay(false);
            stopYoutubePolling();
          }
        }
      } catch {
        // Ignore transient iframe polling failures.
      }
    }, 250);
  }, [seekYoutubeToStart, stopYoutubePolling]);

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
      stopYoutubePolling();
    };
  }, [stopYoutubePolling]);

  useEffect(() => {
    if (!shouldPlay) {
      setYoutubePlay(false);
      youtubeTrackKeyRef.current = "";
      stopYoutubePolling();
      pauseAudioPlayback().catch(() => undefined);
      return;
    }

    if (isUsingYoutube) {
      pauseAudioPlayback().catch(() => undefined);

      if (youtubeSourceKeyRef.current !== youtubeVideoId) {
        youtubeSourceKeyRef.current = youtubeVideoId;
        youtubeTrackKeyRef.current = trackKey;
        setIsYoutubeReady(false);
      } else {
        youtubeTrackKeyRef.current = trackKey;
      }

      if (isYoutubeReady) {
        seekYoutubeToStart();
        setYoutubePlay(true);
        startYoutubePolling();
      } else {
        setYoutubePlay(true);
      }

      return;
    }

    setYoutubePlay(false);
    stopYoutubePolling();

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
    isUsingYoutube,
    isYoutubeReady,
    normalizedUrl,
    pauseAudioPlayback,
    rawUrl,
    resetAudioPlayback,
    seekYoutubeToStart,
    shouldPlay,
    startMs,
    startYoutubePolling,
    stopYoutubePolling,
    trackKey,
    youtubeVideoId,
  ]);

  const handleYoutubeReady = useCallback(() => {
    setIsYoutubeReady(true);
    if (!shouldLoopRef.current || !youtubeVideoIdRef.current) {
      return;
    }

    seekYoutubeToStart();
    setYoutubePlay(true);
    startYoutubePolling();
  }, [seekYoutubeToStart, startYoutubePolling]);

  const handleYoutubeError = useCallback((error: any) => {
    console.log("youtube segmented music playback error", error);
    setYoutubePlay(false);
    stopYoutubePolling();
  }, [stopYoutubePolling]);

  const handleYoutubeStateChange = useCallback((state: string) => {
    if (state === "playing") {
      startYoutubePolling();
      return;
    }

    if (state === "ended") {
      if (shouldLoopRef.current) {
        seekYoutubeToStart();
      } else {
        setYoutubePlay(false);
        stopYoutubePolling();
      }
    }
  }, [seekYoutubeToStart, startYoutubePolling, stopYoutubePolling]);

  return {
    isUsingYoutube,
    youtubePlay,
    youtubePlayerRef,
    handleYoutubeReady,
    handleYoutubeError,
    handleYoutubeStateChange,
  };
}
