import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

import {
  ensureAudioClipStartPosition,
  getPlaybackSources,
  registerManagedAudioPlayer,
  startManagedAudioClipPlayback,
  stopAllManagedAudioPlayback,
} from "../utils/audioPlayback";
import { createManagedSound } from "../utils/nitroSound";

type UseSegmentedMusicPlaybackParams = {
  rawUrl: string;
  normalizedUrl: string;
  youtubeVideoId?: string;
  trackKey: string;
  startMs: number;
  durationMs: number;
  shouldPlay: boolean;
  syncKey?: string | number;
  pauseWhenInactive?: boolean;
};

const noop = () => {};
let activePlaybackOwnerId = "";
let activePlaybackStopper: null | (() => void) = null;
let globalStopGeneration = 0;
const playbackStoppers = new Set<() => void>();

type UseSegmentedMusicWarmupParams = {
  rawUrl: string;
  normalizedUrl: string;
  trackKey: string;
  enabled: boolean;
};

export const registerGlobalMusicPlaybackStopper = (stopper: () => void) => {
  playbackStoppers.add(stopper);
  return () => {
    playbackStoppers.delete(stopper);
  };
};

export const stopAllSegmentedMusicPlayback = () => {
  globalStopGeneration += 1;
  playbackStoppers.forEach((stopper) => {
    stopper();
  });
  stopAllManagedAudioPlayback();
  activePlaybackOwnerId = "";
  activePlaybackStopper = null;
};

export function useSegmentedMusicWarmup({
  rawUrl,
  normalizedUrl,
  trackKey,
  enabled,
}: UseSegmentedMusicWarmupParams) {
  const warmupPlayerRef = useRef<any>(null);
  const warmupTrackKeyRef = useRef("");
  const warmupRequestIdRef = useRef(0);

  useEffect(() => {
    if (!warmupPlayerRef.current) {
      warmupPlayerRef.current = createManagedSound();
    }

    const player = warmupPlayerRef.current;
    return () => {
      warmupRequestIdRef.current += 1;
      warmupTrackKeyRef.current = "";
      player.setVolume?.(0)?.catch?.(() => undefined);
      player.pausePlayer?.()?.catch?.(() => undefined);
      player.stopPlayer?.()?.catch?.(() => undefined);
      player.dispose?.();
      warmupPlayerRef.current = null;
    };
  }, []);

  useEffect(() => registerGlobalMusicPlaybackStopper(() => {
    const player = warmupPlayerRef.current;
    warmupRequestIdRef.current += 1;
    warmupTrackKeyRef.current = "";
    player?.setVolume?.(0)?.catch?.(() => undefined);
    player?.pausePlayer?.()?.catch?.(() => undefined);
    player?.stopPlayer?.()?.catch?.(() => undefined);
  }), []);

  useEffect(() => {
    const player = warmupPlayerRef.current;
    const sources = getPlaybackSources(rawUrl, normalizedUrl);

    if (!enabled || !trackKey || !sources.length || warmupTrackKeyRef.current === trackKey || !player) {
      return;
    }

    const requestId = warmupRequestIdRef.current + 1;
    warmupRequestIdRef.current = requestId;
    warmupTrackKeyRef.current = trackKey;
    let cancelled = false;
    let settleTimeout: ReturnType<typeof setTimeout> | null = null;

    const warm = async () => {
      player.setVolume?.(0)?.catch?.(() => undefined);
      player.pausePlayer?.()?.catch?.(() => undefined);
      player.stopPlayer?.()?.catch?.(() => undefined);

      for (const source of sources) {
        if (cancelled || warmupRequestIdRef.current !== requestId) {
          return;
        }

        try {
          await player.startPlayer(source);
          await player.setVolume(0).catch(() => undefined);
          await player.pausePlayer().catch(() => undefined);
          settleTimeout = setTimeout(() => {
            if (!cancelled && warmupRequestIdRef.current === requestId) {
              player.stopPlayer?.()?.catch?.(() => undefined);
            }
          }, 1600);
          return;
        } catch {
          // Try the next normalized source candidate.
        }
      }
    };

    const startTimeout = setTimeout(() => {
      warm().catch(() => undefined);
    }, 90);

    return () => {
      cancelled = true;
      clearTimeout(startTimeout);
      if (settleTimeout) {
        clearTimeout(settleTimeout);
      }
      player.setVolume?.(0)?.catch?.(() => undefined);
      player.pausePlayer?.()?.catch?.(() => undefined);
      player.stopPlayer?.()?.catch?.(() => undefined);
    };
  }, [enabled, normalizedUrl, rawUrl, trackKey]);
}

export function useSegmentedMusicPlayback({
  rawUrl,
  normalizedUrl,
  trackKey,
  startMs,
  durationMs,
  shouldPlay,
  syncKey,
  pauseWhenInactive = false,
}: UseSegmentedMusicPlaybackParams) {
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === "active");
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState<unknown>(null);
  const audioPlayerRef = useRef(createManagedSound());
  const ownerIdRef = useRef(`music_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const audioTrackKeyRef = useRef("");
  const audioSourceKeyRef = useRef("");
  const audioEndMsRef = useRef(0);
  const audioStartMsRef = useRef(0);
  const shouldLoopRef = useRef(false);
  const wasShouldPlayNowRef = useRef(false);
  const playbackRequestIdRef = useRef(0);
  const youtubePlayerRef = useRef<any>(null);
  const playbackEndMs = durationMs > 0 ? startMs + durationMs : 0;
  const audioSourceKey = useMemo(() => normalizedUrl || rawUrl, [normalizedUrl, rawUrl]);
  const shouldPlayNow = shouldPlay && isAppActive;

  useEffect(() => {
    audioStartMsRef.current = startMs;
    audioEndMsRef.current = playbackEndMs;
    shouldLoopRef.current = shouldPlayNow;
  }, [playbackEndMs, shouldPlayNow, startMs]);

  const silenceAudioPlayback = useCallback((options?: { disableLoop?: boolean }) => {
    audioTrackKeyRef.current = "";
    audioSourceKeyRef.current = "";
    audioEndMsRef.current = 0;
    setIsLoading(false);
    setIsPlaying(false);
    if (options?.disableLoop) {
      shouldLoopRef.current = false;
    }

    audioPlayerRef.current.setVolume(0).catch(() => undefined);
    audioPlayerRef.current.pausePlayer().catch(() => undefined);
    audioPlayerRef.current.stopPlayer().catch(() => undefined);
  }, []);

  const stopAudioPlayback = useCallback(async (options?: { disableLoop?: boolean }) => {
    silenceAudioPlayback(options);

    try {
      await audioPlayerRef.current.stopPlayer();
    } catch {
      // noop
    }
  }, [silenceAudioPlayback]);

  const pauseAudioPlayback = useCallback(() => {
    setIsLoading(false);
    setIsPlaying(false);
    shouldLoopRef.current = false;
    audioPlayerRef.current.setVolume(0).catch(() => undefined);
    audioPlayerRef.current.pausePlayer().catch(() => undefined);
  }, []);

  const restartAudioClipFromStart = useCallback(() => {
    if (!shouldLoopRef.current || !audioTrackKeyRef.current) {
      return;
    }

    audioPlayerRef.current
      .seekToPlayer(audioStartMsRef.current)
      .then(() => audioPlayerRef.current.resumePlayer())
      .catch(() => undefined);
  }, []);

  const resetAudioPlayback = useCallback(async () => {
    playbackRequestIdRef.current += 1;
    if (activePlaybackOwnerId === ownerIdRef.current) {
      activePlaybackOwnerId = "";
      activePlaybackStopper = null;
    }
    silenceAudioPlayback({ disableLoop: true });
  }, [silenceAudioPlayback]);

  const forceStopAudioPlayback = useCallback(() => {
    playbackRequestIdRef.current += 1;
    if (activePlaybackOwnerId === ownerIdRef.current) {
      activePlaybackOwnerId = "";
      activePlaybackStopper = null;
    }
    silenceAudioPlayback({ disableLoop: true });
  }, [silenceAudioPlayback]);

  useEffect(() => {
    return registerGlobalMusicPlaybackStopper(forceStopAudioPlayback);
  }, [forceStopAudioPlayback]);

  useEffect(() => registerManagedAudioPlayer(audioPlayerRef.current), []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        stopAllSegmentedMusicPlayback();
      }
      setIsAppActive(nextState === "active");
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!syncKey || !shouldPlayNow) {
      return;
    }

    restartAudioClipFromStart();
  }, [restartAudioClipFromStart, shouldPlayNow, syncKey]);

  useEffect(() => {
    const player = audioPlayerRef.current;
    const ownerId = ownerIdRef.current;

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
      playbackRequestIdRef.current += 1;
      shouldLoopRef.current = false;
      if (activePlaybackOwnerId === ownerId) {
        activePlaybackOwnerId = "";
        activePlaybackStopper = null;
      }

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

      player.setVolume(0).catch(() => undefined);
      player.pausePlayer().catch(() => undefined);
      player.stopPlayer().catch(() => undefined);
      player.dispose();
    };
  }, []);

  useEffect(() => {
    if (!shouldPlayNow) {
      wasShouldPlayNowRef.current = false;
      if (pauseWhenInactive && audioTrackKeyRef.current) {
        pauseAudioPlayback();
      } else {
        resetAudioPlayback().catch(() => undefined);
      }
      return;
    }

    wasShouldPlayNowRef.current = true;

    const resumeAudio = async () => {
      const requestId = playbackRequestIdRef.current + 1;
      const stopGenerationAtStart = globalStopGeneration;
      playbackRequestIdRef.current = requestId;
      const isCurrentRequest = () =>
        playbackRequestIdRef.current === requestId
        && shouldLoopRef.current
        && globalStopGeneration === stopGenerationAtStart;

      if (!audioSourceKey) {
        setIsLoading(false);
        setIsPlaying(false);
        return;
      }

      if (activePlaybackOwnerId && activePlaybackOwnerId !== ownerIdRef.current) {
        activePlaybackStopper?.();
      }
      activePlaybackOwnerId = ownerIdRef.current;
      activePlaybackStopper = forceStopAudioPlayback;
      setPlaybackError(null);
      setIsLoading(true);
      setIsPlaying(false);

      if (audioTrackKeyRef.current === trackKey) {
        await ensureAudioClipStartPosition(audioPlayerRef.current, startMs).catch(() => undefined);
        if (!isCurrentRequest()) {
          return;
        }
        await audioPlayerRef.current.setVolume(1).catch(() => undefined);
        await audioPlayerRef.current.resumePlayer().catch(() => undefined);
        if (isCurrentRequest()) {
          setIsLoading(false);
          setIsPlaying(true);
        }
        return;
      }

      if (audioSourceKeyRef.current === audioSourceKey) {
        try {
          audioTrackKeyRef.current = trackKey;
          await ensureAudioClipStartPosition(audioPlayerRef.current, startMs);
          if (!isCurrentRequest()) {
            return;
          }
          await audioPlayerRef.current.setVolume(1).catch(() => undefined);
          await audioPlayerRef.current.resumePlayer().catch(() => undefined);
          if (isCurrentRequest()) {
            setIsLoading(false);
            setIsPlaying(true);
          }
          return;
        } catch {
          silenceAudioPlayback();
        }
      }

      silenceAudioPlayback();
      if (!isCurrentRequest()) {
        return;
      }
      audioTrackKeyRef.current = trackKey;
      audioSourceKeyRef.current = audioSourceKey;
      await startManagedAudioClipPlayback(audioPlayerRef.current, {
        rawValue: rawUrl,
        normalizedValue: normalizedUrl,
        startPositionMs: startMs,
        volume: 1,
        seekSettleDelayMs: 24,
      });
      if (!isCurrentRequest()) {
        if (!shouldLoopRef.current) {
          await stopAudioPlayback({ disableLoop: true });
        }
        setIsLoading(false);
        setIsPlaying(false);
        return;
      }

      setIsLoading(false);
      setIsPlaying(true);
      if (activePlaybackOwnerId === ownerIdRef.current) {
        activePlaybackOwnerId = ownerIdRef.current;
        activePlaybackStopper = forceStopAudioPlayback;
      }
    };

    resumeAudio().catch((error) => {
      console.log("segmented music playback error", error);
      setPlaybackError(error);
      setIsLoading(false);
      setIsPlaying(false);
      resetAudioPlayback().catch(() => undefined);
    });
  }, [
    audioSourceKey,
    forceStopAudioPlayback,
    normalizedUrl,
    pauseAudioPlayback,
    pauseWhenInactive,
    rawUrl,
    resetAudioPlayback,
    shouldPlayNow,
    silenceAudioPlayback,
    startMs,
    stopAudioPlayback,
    trackKey,
  ]);

  return {
    isLoading,
    isPlaying,
    playbackError,
    isUsingYoutube: false,
    youtubePlay: false,
    youtubePlayerRef,
    handleYoutubeReady: noop,
    handleYoutubeError: noop,
    handleYoutubeStateChange: noop,
  };
}
