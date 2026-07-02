import {
  createSound,
  type PlayBackType,
  type PlaybackEndType,
  type RecordBackType,
} from "react-native-nitro-sound";

type NitroSoundInstance = ReturnType<typeof createSound>;

type DisposableNitroSound = NitroSoundInstance & {
  dispose?: () => void;
};

export type ManagedNitroSound = NitroSoundInstance & {
  dispose: () => void;
  isDisposed: () => boolean;
};

const clampVolume = (volume: number) => {
  const numericVolume = Number(volume);
  if (!Number.isFinite(numericVolume)) {
    return 1;
  }

  return Math.min(1, Math.max(0, numericVolume));
};

export const createManagedSound = (): ManagedNitroSound => {
  const nativeSound = createSound() as DisposableNitroSound;
  let acceptingCalls = true;
  let disposed = false;
  let playbackStarted = false;
  let pendingOperation = Promise.resolve();

  const enqueue = <T>(
    operation: () => Promise<T>,
    fallback: T,
    options?: { allowDuringDispose?: boolean; throwWhenClosed?: boolean },
  ): Promise<T> => {
    const acceptedAtCallTime = acceptingCalls && !disposed;

    if (!acceptedAtCallTime) {
      if (options?.throwWhenClosed) {
        return Promise.reject(new Error("Audio player is no longer available."));
      }
      return Promise.resolve(fallback);
    }

    const queuedOperation = pendingOperation
      .catch(() => undefined)
      .then(async () => {
        const mayRun = !disposed && (acceptingCalls || options?.allowDuringDispose);
        if (!mayRun) {
          if (options?.throwWhenClosed) {
            throw new Error("Audio player is no longer available.");
          }
          return fallback;
        }

        return operation();
      });

    pendingOperation = queuedOperation.catch(() => undefined).then(() => undefined);
    return queuedOperation;
  };

  const removeListeners = () => {
    try {
      nativeSound.removePlayBackListener();
    } catch {
      // noop
    }

    try {
      nativeSound.removePlaybackEndListener();
    } catch {
      // noop
    }
  };

  const managedSound: ManagedNitroSound = {
    ...nativeSound,
    startRecorder: nativeSound.startRecorder.bind(nativeSound),
    pauseRecorder: nativeSound.pauseRecorder.bind(nativeSound),
    resumeRecorder: nativeSound.resumeRecorder.bind(nativeSound),
    stopRecorder: nativeSound.stopRecorder.bind(nativeSound),
    startPlayer: (uri?: string, httpHeaders?: Record<string, string>) =>
      enqueue(
        async () => {
          const result = await nativeSound.startPlayer(uri, httpHeaders);
          playbackStarted = true;
          return result;
        },
        "",
        { throwWhenClosed: true },
      ),
    stopPlayer: () =>
      enqueue(
        async () => {
          if (!playbackStarted) {
            return "Player stopped";
          }

          try {
            return await nativeSound.stopPlayer();
          } finally {
            playbackStarted = false;
          }
        },
        "Player stopped",
        { allowDuringDispose: true },
      ),
    pausePlayer: () => {
      if (!playbackStarted) {
        return Promise.resolve("Player paused");
      }

      return enqueue(() => nativeSound.pausePlayer(), "Player paused");
    },
    resumePlayer: () => {
      if (!playbackStarted) {
        return Promise.resolve("Player resumed");
      }

      return enqueue(
        async () => {
          const result = await nativeSound.resumePlayer();
          playbackStarted = true;
          return result;
        },
        "Player resumed",
      );
    },
    seekToPlayer: (time: number) => {
      const safeTime = Math.round(Number(time));
      if (!playbackStarted || !Number.isFinite(safeTime) || safeTime < 0) {
        return Promise.resolve("Seek skipped");
      }

      return enqueue(() => nativeSound.seekToPlayer(safeTime), "Seek skipped");
    },
    setVolume: (volume: number) => {
      if (!playbackStarted) {
        return Promise.resolve("Volume skipped");
      }

      return enqueue(() => nativeSound.setVolume(clampVolume(volume)), "Volume skipped");
    },
    setPlaybackSpeed: (playbackSpeed: number) => {
      if (!playbackStarted) {
        return Promise.resolve("Playback speed skipped");
      }

      return enqueue(
        () => nativeSound.setPlaybackSpeed(Number(playbackSpeed) || 1),
        "Playback speed skipped",
      );
    },
    setSubscriptionDuration: (sec: number) => {
      if (!acceptingCalls || disposed) {
        return;
      }
      nativeSound.setSubscriptionDuration(sec);
    },
    addRecordBackListener: (callback: (recordingMeta: RecordBackType) => void) => {
      if (!acceptingCalls || disposed) {
        return;
      }
      nativeSound.addRecordBackListener(callback);
    },
    removeRecordBackListener: () => {
      if (disposed) {
        return;
      }
      nativeSound.removeRecordBackListener();
    },
    addPlayBackListener: (callback: (playbackMeta: PlayBackType) => void) => {
      if (!acceptingCalls || disposed) {
        return;
      }
      nativeSound.addPlayBackListener(callback);
    },
    removePlayBackListener: () => {
      if (disposed) {
        return;
      }
      nativeSound.removePlayBackListener();
    },
    addPlaybackEndListener: (callback: (playbackEndMeta: PlaybackEndType) => void) => {
      if (!acceptingCalls || disposed) {
        return;
      }
      nativeSound.addPlaybackEndListener(callback);
    },
    removePlaybackEndListener: () => {
      if (disposed) {
        return;
      }
      nativeSound.removePlaybackEndListener();
    },
    mmss: nativeSound.mmss.bind(nativeSound),
    mmssss: nativeSound.mmssss.bind(nativeSound),
    dispose: () => {
      if (!acceptingCalls || disposed) {
        return;
      }

      acceptingCalls = false;
      pendingOperation
        .catch(() => undefined)
        .finally(() => {
          removeListeners();
          try {
            nativeSound.dispose?.();
          } catch {
            // noop
          }
          playbackStarted = false;
          disposed = true;
        });
    },
    isDisposed: () => disposed || !acceptingCalls,
  };

  return managedSound;
};
