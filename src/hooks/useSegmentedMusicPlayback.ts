import { useCallback, useEffect, useRef, useState } from "react";
import { createSound } from "react-native-nitro-sound";

import { startManagedAudioClipPlayback } from "../utils/audioPlayback";

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
  const audioEndMsRef = useRef(0);
  const audioStartMsRef = useRef(0);
  const shouldLoopRef = useRef(false);
  const youtubePlayerRef = useRef<any>(null);
  const youtubeTrackKeyRef = useRef("");
  const youtubePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const youtubeVideoIdRef = useRef("");
  const [isYoutubeReady, setIsYoutubeReady] = useState(false);
  const [youtubePlay, setYoutubePlay] = useState(false);

  const isUsingYoutube = !!youtubeVideoId;
  const playbackEndMs = durationMs > 0 ? startMs + durationMs : 0;

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

  const stopAudioPlayback = useCallback(async () => {
    audioTrackKeyRef.current = "";
    audioEndMsRef.current = 0;

    try {
      await audioPlayerRef.current.stopPlayer();
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
      stopAudioPlayback().catch(() => undefined);
      return;
    }

    if (isUsingYoutube) {
      stopAudioPlayback().catch(() => undefined);

      if (youtubeTrackKeyRef.current !== trackKey) {
        youtubeTrackKeyRef.current = trackKey;
        setIsYoutubeReady(false);
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
      if (!normalizedUrl) {
        return;
      }

      if (audioTrackKeyRef.current === trackKey) {
        await audioPlayerRef.current.resumePlayer().catch(() => undefined);
        return;
      }

      await stopAudioPlayback();
      audioTrackKeyRef.current = trackKey;
      await startManagedAudioClipPlayback(audioPlayerRef.current, {
        rawValue: rawUrl,
        normalizedValue: normalizedUrl,
        startPositionMs: startMs,
        volume: 1,
      });
    };

    resumeAudio().catch((error) => {
      console.log("segmented music playback error", error);
      stopAudioPlayback().catch(() => undefined);
    });
  }, [
    isUsingYoutube,
    isYoutubeReady,
    normalizedUrl,
    rawUrl,
    seekYoutubeToStart,
    shouldPlay,
    startMs,
    startYoutubePolling,
    stopAudioPlayback,
    stopYoutubePolling,
    trackKey,
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
