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

export const ensureAudioClipStartPosition = async (
  player: any,
  startPositionMs: number,
  seekSettleDelayMs = 70,
): Promise<void> => {
  if (!(startPositionMs > 0)) {
    return;
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await wait(seekSettleDelayMs);

    try {
      await player.seekToPlayer(startPositionMs);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to seek audio clip to the trimmed start.");
};

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
  const shouldDelayAudioOutput = startPositionMs > 0;
  let playbackStarted = false;

  if (shouldDelayAudioOutput) {
    try {
      await player.setVolume(0);
    } catch {
      // noop
    }
  }

  const source = await startAudioPlaybackFromSources(player, rawValue, normalizedValue);
  playbackStarted = true;

  try {
    await ensureAudioClipStartPosition(player, startPositionMs, seekSettleDelayMs);
  } catch (error) {
    if (playbackStarted) {
      await player.stopPlayer().catch(() => undefined);
    }
    throw error;
  }

  try {
    await player.setVolume(volume);
  } catch {
    // noop
  }

  if (!shouldDelayAudioOutput) {
    try {
      await player.setVolume(volume);
    } catch {
      // noop
    }
  }

  if (shouldDelayAudioOutput) {
    try {
      await player.resumePlayer();
    } catch {
      // Some players continue automatically after seek; ignore resume misses.
    }
  }

  return source;
};
