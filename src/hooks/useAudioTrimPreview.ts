import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import {
  ensureAudioClipStartPosition,
  registerManagedAudioPlayer,
  startManagedAudioClipPlayback,
  stopManagedAudioPlayer,
} from "../utils/audioPlayback";
import {
  registerGlobalMusicPlaybackStopper,
  stopAllSegmentedMusicPlayback,
} from "./useSegmentedMusicPlayback";
import { createManagedSound } from "../utils/nitroSound";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type TrimWindow = {
  startTime: number;
  endTime: number;
};

export function useAudioTrimPreview(options: { trackPosition?: boolean } = {}) {
  const trackPosition = options.trackPosition !== false;
  const playerRef = useRef(createManagedSound());
  const trimWindowRef = useRef<TrimWindow>({ startTime: 0, endTime: 0 });
  const sourceRef = useRef({ rawUrl: "", normalizedUrl: "" });
  const isReadyRef = useRef(false);
  const isPlayingRef = useRef(false);
  const requestIdRef = useRef(0);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [positionMs, setPositionMs] = useState(0);

  const stopPlayback = useCallback(async () => {
    requestIdRef.current += 1;
    try {
      await playerRef.current.pausePlayer();
    } catch {
      // noop
    }
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsLoading(false);
  }, []);

  const forceStopPlayback = useCallback(() => {
    requestIdRef.current += 1;
    isPlayingRef.current = false;
    isReadyRef.current = false;
    setIsPlaying(false);
    setIsLoading(false);
    setIsReady(false);
    stopManagedAudioPlayer(playerRef.current);
  }, []);

  const seekToSeconds = useCallback(async (nextSeconds: number) => {
    const { startTime, endTime } = trimWindowRef.current;
    const safeTarget = clamp(nextSeconds, startTime, Math.max(startTime, endTime));
    await ensureAudioClipStartPosition(playerRef.current, Math.round(safeTarget * 1000), 40);
    setPositionMs(Math.round(safeTarget * 1000));
  }, []);

  const setTrimWindow = useCallback((startTime: number, endTime: number) => {
    trimWindowRef.current = {
      startTime: Math.max(0, startTime),
      endTime: Math.max(startTime, endTime),
    };
  }, []);

  const resetPreview = useCallback(async (
    startTime: number,
    endTime: number,
    options?: { rawUrl?: string; normalizedUrl?: string },
  ) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const shouldResumeAfterSeek = isPlayingRef.current;
    setTrimWindow(startTime, endTime);
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsLoading(false);
    setPositionMs(Math.round(Math.max(0, startTime) * 1000));

    if (typeof options?.rawUrl === "string" || typeof options?.normalizedUrl === "string") {
      const nextSource = {
        rawUrl: String(options?.rawUrl || "").trim(),
        normalizedUrl: String(options?.normalizedUrl || "").trim(),
      };

      if (
        nextSource.rawUrl !== sourceRef.current.rawUrl ||
        nextSource.normalizedUrl !== sourceRef.current.normalizedUrl
      ) {
        sourceRef.current = nextSource;
        isReadyRef.current = false;
        setIsReady(false);
        try {
          await playerRef.current.stopPlayer();
        } catch {
          // noop
        }
        return;
      }
    }

    if (isReadyRef.current) {
      await seekToSeconds(startTime).catch(() => undefined);
      if (shouldResumeAfterSeek) {
        await playerRef.current.resumePlayer().catch(() => undefined);
        if (requestIdRef.current !== requestId) {
          return;
        }
        isPlayingRef.current = true;
        setIsPlaying(true);
      }
    }
  }, [seekToSeconds, setTrimWindow]);

  const togglePlayback = useCallback(async () => {
    const { rawUrl, normalizedUrl } = sourceRef.current;
    if (!rawUrl && !normalizedUrl) {
      throw new Error("Music preview unavailable for this track.");
    }

    if (isPlaying) {
      await stopPlayback();
      return;
    }

    stopAllSegmentedMusicPlayback();
    setIsLoading(true);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      await startManagedAudioClipPlayback(playerRef.current, {
        rawValue: rawUrl,
        normalizedValue: normalizedUrl,
        startPositionMs: Math.round(trimWindowRef.current.startTime * 1000),
        volume: 1,
        seekSettleDelayMs: 80,
      });
      if (requestIdRef.current !== requestId) {
        return;
      }
      isReadyRef.current = true;
      isPlayingRef.current = true;
      setIsReady(true);

      setIsPlaying(true);
    } catch (error) {
      isReadyRef.current = false;
      isPlayingRef.current = false;
      setIsReady(false);
      setIsPlaying(false);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, stopPlayback]);

  useEffect(() => registerGlobalMusicPlaybackStopper(forceStopPlayback), [forceStopPlayback]);

  useEffect(() => registerManagedAudioPlayer(playerRef.current), []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        forceStopPlayback();
      }
    });

    return () => subscription.remove();
  }, [forceStopPlayback]);

  useEffect(() => {
    const player = playerRef.current;

    player.setSubscriptionDuration(trackPosition ? 0.1 : 0.35);
    player.addPlayBackListener((event: any) => {
      const currentPosition = Math.max(0, Number(event?.currentPosition || 0));
      if (trackPosition) {
        setPositionMs(currentPosition);
      }
      setIsLoading(false);

      const endMs = Math.max(
        Math.round(trimWindowRef.current.startTime * 1000),
        Math.round(trimWindowRef.current.endTime * 1000),
      );

      if (endMs > 0 && currentPosition >= endMs) {
        player.pausePlayer().catch(() => undefined);
        ensureAudioClipStartPosition(
          player,
          Math.round(trimWindowRef.current.startTime * 1000),
          40,
        ).catch(() => undefined);
        isPlayingRef.current = false;
        setIsPlaying(false);
      }
    });

    player.addPlaybackEndListener(() => {
      isPlayingRef.current = false;
      setIsPlaying(false);
      setIsLoading(false);
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
  }, [trackPosition]);

  return {
    playerRef,
    isReady,
    isPlaying,
    isLoading,
    positionMs,
    resetPreview,
    seekToSeconds,
    setTrimWindow,
    togglePlayback,
  };
}
