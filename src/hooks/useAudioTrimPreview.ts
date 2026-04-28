import { useCallback, useEffect, useRef, useState } from "react";
import { createSound } from "react-native-nitro-sound";

import {
  ensureAudioClipStartPosition,
  startManagedAudioClipPlayback,
} from "../utils/audioPlayback";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type TrimWindow = {
  startTime: number;
  endTime: number;
};

export function useAudioTrimPreview() {
  const playerRef = useRef(createSound());
  const trimWindowRef = useRef<TrimWindow>({ startTime: 0, endTime: 0 });
  const sourceRef = useRef({ rawUrl: "", normalizedUrl: "" });
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [positionMs, setPositionMs] = useState(0);

  const stopPlayback = useCallback(async () => {
    try {
      await playerRef.current.pausePlayer();
    } catch {
      // noop
    }
    setIsPlaying(false);
    setIsLoading(false);
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
    setTrimWindow(startTime, endTime);
    setIsPlaying(false);
    setIsLoading(false);
    setPositionMs(Math.round(Math.max(0, startTime) * 1000));

    if (typeof options?.rawUrl === "string" || typeof options?.normalizedUrl === "string") {
      sourceRef.current = {
        rawUrl: String(options?.rawUrl || "").trim(),
        normalizedUrl: String(options?.normalizedUrl || "").trim(),
      };
      setIsReady(false);
      try {
        await playerRef.current.stopPlayer();
      } catch {
        // noop
      }
      return;
    }

    if (isReady) {
      await seekToSeconds(startTime).catch(() => undefined);
    }
  }, [isReady, seekToSeconds, setTrimWindow]);

  const togglePlayback = useCallback(async () => {
    const { rawUrl, normalizedUrl } = sourceRef.current;
    if (!rawUrl && !normalizedUrl) {
      throw new Error("Music preview unavailable for this track.");
    }

    if (isPlaying) {
      await stopPlayback();
      return;
    }

    setIsLoading(true);

    const sourceChanged = !isReady;
    if (sourceChanged) {
      await startManagedAudioClipPlayback(playerRef.current, {
        rawValue: rawUrl,
        normalizedValue: normalizedUrl,
        startPositionMs: Math.round(trimWindowRef.current.startTime * 1000),
        volume: 1,
        seekSettleDelayMs: 70,
      });
      setIsReady(true);
    } else {
      await seekToSeconds(trimWindowRef.current.startTime);
      await playerRef.current.resumePlayer().catch(() => undefined);
    }

    setIsPlaying(true);
    setIsLoading(false);
  }, [isPlaying, isReady, seekToSeconds, stopPlayback]);

  useEffect(() => {
    const player = playerRef.current;

    player.setSubscriptionDuration(0.1);
    player.addPlayBackListener((event: any) => {
      const currentPosition = Math.max(0, Number(event?.currentPosition || 0));
      setPositionMs(currentPosition);
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
        setIsPlaying(false);
      }
    });

    player.addPlaybackEndListener(() => {
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
  }, []);

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
