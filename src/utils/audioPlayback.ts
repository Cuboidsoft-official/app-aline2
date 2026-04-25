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
