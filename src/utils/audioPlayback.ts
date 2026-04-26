const buildPlaybackCandidates = (value: string): string[] => {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return [];
  }

  const candidates = [
    normalizedValue,
    encodeURI(normalizedValue),
    decodeURI(normalizedValue),
    normalizedValue.startsWith("file://") ? normalizedValue.replace(/^file:\/\//i, "") : "",
  ];

  return candidates.filter(Boolean);
};

export const getPlaybackSources = (rawValue: string, normalizedValue: string): string[] =>
  Array.from(new Set([
    ...buildPlaybackCandidates(rawValue),
    ...buildPlaybackCandidates(normalizedValue),
  ]));

export const startAudioPlaybackFromSources = async (
  player: any,
  rawValue: string,
  normalizedValue: string,
): Promise<string> => {
  let lastError: unknown = null;

  for (const source of getPlaybackSources(rawValue, normalizedValue)) {
    try {
      await player.startPlayer(source);
      return source;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to start playback");
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export const startManagedAudioClipPlayback = async (
  player: any,
  {
    rawValue,
    normalizedValue,
    startPositionMs = 0,
    volume = 1,
    seekSettleDelayMs = 140,
  }: {
    rawValue: string;
    normalizedValue: string;
    startPositionMs?: number;
    volume?: number;
    seekSettleDelayMs?: number;
  },
): Promise<string> => {
  const source = await startAudioPlaybackFromSources(player, rawValue, normalizedValue);

  try {
    await player.setVolume(volume);
  } catch {
    // noop
  }

  if (startPositionMs > 0) {
    await wait(seekSettleDelayMs);

    try {
      await player.seekToPlayer(startPositionMs);
    } catch {
      await wait(seekSettleDelayMs);

      try {
        await player.seekToPlayer(startPositionMs);
      } catch {
        // Some remote streams reject early seeks. Let playback continue instead of failing hard.
      }
    }
  }

  return source;
};
