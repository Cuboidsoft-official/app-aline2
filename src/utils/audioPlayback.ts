const buildPlaybackCandidates = (value: string): string[] => {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return [];
  }

  const decodedValue = (() => {
    try {
      return decodeURI(normalizedValue);
    } catch {
      return "";
    }
  })();

  const candidates = [
    normalizedValue,
    encodeURI(normalizedValue),
    decodedValue,
    normalizedValue.startsWith("file://") ? normalizedValue.replace(/^file:\/\//i, "") : "",
  ];

  return candidates.filter(Boolean);
};

const managedAudioPlayers = new Set<any>();
let managedAudioSessionId = 0;
let activeManagedAudioPlayer: any = null;

const silenceManagedAudioPlayer = (player: any) => {
  if (!player || player.isDisposed?.()) {
    return;
  }

  player.setVolume?.(0)?.catch?.(() => undefined);
  player.pausePlayer?.()?.catch?.(() => undefined);
  player.stopPlayer?.()?.catch?.(() => undefined);
};

export const registerManagedAudioPlayer = (player: any) => {
  if (!player) {
    return () => {};
  }

  managedAudioPlayers.add(player);

  return () => {
    managedAudioPlayers.delete(player);
    if (activeManagedAudioPlayer === player) {
      activeManagedAudioPlayer = null;
    }
  };
};

export const stopManagedAudioPlayer = (player: any) => {
  managedAudioSessionId += 1;
  if (activeManagedAudioPlayer === player) {
    activeManagedAudioPlayer = null;
  }
  silenceManagedAudioPlayer(player);
};

export const stopAllManagedAudioPlayback = (exceptPlayer?: any) => {
  managedAudioSessionId += 1;
  activeManagedAudioPlayer = exceptPlayer || null;

  managedAudioPlayers.forEach((player) => {
    if (player !== exceptPlayer) {
      silenceManagedAudioPlayer(player);
    }
  });
};

export const getPlaybackSources = (rawValue: string, normalizedValue: string): string[] =>
  Array.from(new Set([
    ...buildPlaybackCandidates(normalizedValue),
    ...buildPlaybackCandidates(rawValue),
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
  const numericStartPositionMs = Number(startPositionMs);

  if (!Number.isFinite(numericStartPositionMs) || numericStartPositionMs < 0 || player?.isDisposed?.()) {
    return;
  }

  const safeStartPositionMs = Math.max(0, Math.round(numericStartPositionMs));
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await wait(seekSettleDelayMs);

    try {
      await player.seekToPlayer(safeStartPositionMs);
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
  stopAllManagedAudioPlayback(player);
  managedAudioSessionId += 1;
  const playbackSessionId = managedAudioSessionId;
  activeManagedAudioPlayer = player;
  let playbackStarted = false;
  const isCurrentSession = () =>
    managedAudioSessionId === playbackSessionId && activeManagedAudioPlayer === player;

  try {
    await player.setVolume(0);
  } catch {
    // noop
  }

  try {
    await player.pausePlayer();
  } catch {
    // noop
  }

  try {
    await player.stopPlayer();
  } catch {
    // noop
  }

  const source = await startAudioPlaybackFromSources(player, rawValue, normalizedValue);
  playbackStarted = true;
  await player.setVolume(0).catch(() => undefined);
  if (!isCurrentSession()) {
    silenceManagedAudioPlayer(player);
    throw new Error("Audio playback was superseded.");
  }

  try {
    await ensureAudioClipStartPosition(player, startPositionMs, seekSettleDelayMs);
  } catch (error) {
    if (playbackStarted) {
      await player.stopPlayer().catch(() => undefined);
    }
    throw error;
  }
  if (!isCurrentSession()) {
    silenceManagedAudioPlayer(player);
    throw new Error("Audio playback was superseded.");
  }

  try {
    await player.setVolume(volume);
  } catch {
    // noop
  }

  try {
    await player.resumePlayer();
  } catch {
    // Some players continue automatically after start/seek; ignore resume misses.
  }
  if (!isCurrentSession()) {
    silenceManagedAudioPlayer(player);
    throw new Error("Audio playback was superseded.");
  }

  return source;
};
