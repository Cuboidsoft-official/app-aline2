import { useCallback, useEffect, useRef, useState } from "react";

type YouTubePlayerRef = {
  getCurrentTime?: () => Promise<number> | number;
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
};

type TrimWindow = {
  startTime: number;
  endTime: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function useYouTubeTrimPreview() {
  const playerRef = useRef<YouTubePlayerRef | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trimWindowRef = useRef<TrimWindow>({ startTime: 0, endTime: 0 });
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [positionMs, setPositionMs] = useState(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const seekToSeconds = useCallback((nextSeconds: number) => {
    const { startTime, endTime } = trimWindowRef.current;
    const safeTarget = clamp(nextSeconds, startTime, Math.max(startTime, endTime));
    playerRef.current?.seekTo?.(safeTarget, true);
    setPositionMs(Math.round(safeTarget * 1000));
  }, []);

  const stopAtTrimEnd = useCallback(() => {
    stopPolling();
    setIsPlaying(false);
    setIsLoading(false);
    seekToSeconds(trimWindowRef.current.startTime);
  }, [seekToSeconds, stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const currentSeconds = await playerRef.current?.getCurrentTime?.();
        const normalizedSeconds = Math.max(0, Number(currentSeconds || 0));
        setPositionMs(Math.round(normalizedSeconds * 1000));
        setIsLoading(false);

        if (normalizedSeconds >= trimWindowRef.current.endTime) {
          stopAtTrimEnd();
        }
      } catch {
        // Keep the UI responsive even if a poll misses.
      }
    }, 250);
  }, [stopAtTrimEnd, stopPolling]);

  const setTrimWindow = useCallback((startTime: number, endTime: number) => {
    trimWindowRef.current = {
      startTime: Math.max(0, startTime),
      endTime: Math.max(startTime, endTime),
    };
  }, []);

  const resetPreview = useCallback((startTime: number, endTime: number) => {
    setTrimWindow(startTime, endTime);
    stopPolling();
    setIsPlaying(false);
    setIsLoading(false);
    setPositionMs(Math.round(Math.max(0, startTime) * 1000));
    if (isReady) {
      seekToSeconds(startTime);
    }
  }, [isReady, seekToSeconds, setTrimWindow, stopPolling]);

  const togglePlayback = useCallback(() => {
    if (!isReady) {
      setIsLoading(true);
      return;
    }

    if (isPlaying) {
      stopPolling();
      setIsPlaying(false);
      setIsLoading(false);
      return;
    }

    const { startTime } = trimWindowRef.current;
    setIsLoading(true);
    seekToSeconds(startTime);
    setIsPlaying(true);
    startPolling();
  }, [isPlaying, isReady, seekToSeconds, startPolling, stopPolling]);

  const handleReady = useCallback(() => {
    setIsReady(true);
    setIsLoading(false);
    seekToSeconds(trimWindowRef.current.startTime);
  }, [seekToSeconds]);

  const handleError = useCallback(() => {
    stopPolling();
    setIsPlaying(false);
    setIsLoading(false);
  }, [stopPolling]);

  const handleStateChange = useCallback((state: string) => {
    if (state === "playing") {
      setIsPlaying(true);
      setIsLoading(false);
      startPolling();
      return;
    }

    if (state === "paused" || state === "buffering") {
      if (state === "buffering") {
        setIsLoading(true);
      } else {
        setIsPlaying(false);
        setIsLoading(false);
      }
      return;
    }

    if (state === "ended") {
      stopAtTrimEnd();
    }
  }, [startPolling, stopAtTrimEnd]);

  useEffect(() => () => {
    stopPolling();
  }, [stopPolling]);

  return {
    playerRef,
    isReady,
    isPlaying,
    isLoading,
    positionMs,
    resetPreview,
    seekToSeconds,
    setTrimWindow,
    stopAtTrimEnd,
    togglePlayback,
    handleReady,
    handleError,
    handleStateChange,
  };
}
