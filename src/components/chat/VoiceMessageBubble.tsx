import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { createSound } from "react-native-nitro-sound";

import { normalizeMediaUrl } from "../../utils/mediaUrls";

interface VoiceMessageBubbleProps {
  audioUrl?: string;
  durationSeconds?: number;
  isMine?: boolean;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  metaColor?: string;
  label?: string;
}

const formatAudioTime = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const buildWaveformBars = (progress: number) =>
  [0.45, 0.85, 0.55, 0.95, 0.62, 0.78, 0.52, 0.9, 0.48, 0.74].map((height, index) => ({
    id: `bar-${index}`,
    height,
    active: index < Math.max(1, Math.round(progress * 10)),
  }));

const buildPlaybackCandidates = (value: string) => {
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

const getPlaybackSources = (rawValue: string, normalizedValue: string) =>
  Array.from(new Set([
    ...buildPlaybackCandidates(rawValue),
    ...buildPlaybackCandidates(normalizedValue),
  ]));

const VoiceMessageBubble = ({
  audioUrl,
  durationSeconds = 0,
  isMine = false,
  accentColor = "#7b3fe4",
  backgroundColor,
  textColor,
  metaColor,
  label = "Voice message",
}: VoiceMessageBubbleProps) => {
  const soundRef = useRef(createSound());
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [duration, setDuration] = useState(Math.max(0, Number(durationSeconds || 0) * 1000));

  const rawAudioUrl = useMemo(() => String(audioUrl || "").trim(), [audioUrl]);
  const resolvedAudioUrl = useMemo(() => normalizeMediaUrl(rawAudioUrl), [rawAudioUrl]);
  const resolvedBackgroundColor = backgroundColor || (isMine ? "rgba(255,255,255,0.18)" : `${accentColor}12`);
  const resolvedTextColor = textColor || (isMine ? "#fff" : "#111827");
  const resolvedMetaColor = metaColor || (isMine ? "rgba(255,255,255,0.8)" : "#667085");
  const waveformBars = useMemo(
    () => buildWaveformBars(duration > 0 ? Math.min(1, currentPosition / duration) : 0),
    [currentPosition, duration],
  );

  useEffect(() => {
    const sound = soundRef.current;
    sound.setSubscriptionDuration(0.1);
    sound.addPlayBackListener((playback) => {
      setCurrentPosition(playback.currentPosition || 0);
      if (playback.duration) {
        setDuration(playback.duration);
      }
    });
    sound.addPlaybackEndListener(() => {
      setPlaying(false);
      setLoading(false);
      setCurrentPosition(0);
    });

    return () => {
      sound.removePlayBackListener();
      sound.removePlaybackEndListener();
      sound.stopPlayer().catch(() => {});
    };
  }, []);

  useEffect(() => {
    setPlaying(false);
    setLoading(false);
    setCurrentPosition(0);
    setDuration(Math.max(0, Number(durationSeconds || 0) * 1000));
    soundRef.current.stopPlayer().catch(() => {});
  }, [durationSeconds, resolvedAudioUrl]);

  const togglePlayback = async () => {
    if (!resolvedAudioUrl || loading) {
      return;
    }

    try {
      setLoading(true);

      if (playing) {
        await soundRef.current.pausePlayer();
        setPlaying(false);
        return;
      }

      if (currentPosition > 0 && (!duration || currentPosition < duration)) {
        await soundRef.current.resumePlayer();
      } else {
        setCurrentPosition(0);
        let lastError: unknown = null;
        let started = false;

        for (const source of getPlaybackSources(rawAudioUrl, resolvedAudioUrl)) {
          try {
            await soundRef.current.startPlayer(source);
            started = true;
            break;
          } catch (error) {
            lastError = error;
          }
        }

        if (!started) {
          throw lastError || new Error("Unable to start playback");
        }
      }

      setPlaying(true);
    } catch (error) {
      console.log("voice message playback error:", error);
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  };

  if (!resolvedAudioUrl) {
    return null;
  }

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={togglePlayback}
      style={[styles.container, { backgroundColor: resolvedBackgroundColor }]}
    >
      <View style={[styles.playButton, { backgroundColor: isMine ? "rgba(255,255,255,0.22)" : accentColor }]}>
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Icon name={playing ? "pause" : "play"} size={18} color="#fff" />
        )}
      </View>
      <View style={styles.waveformWrap}>
        <View style={styles.waveformRow}>
          {waveformBars.map((bar) => (
            <View
              key={bar.id}
              style={[
                styles.waveBar,
                {
                  height: 14 * bar.height,
                  backgroundColor: bar.active ? resolvedTextColor : `${resolvedMetaColor}88`,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.metaRow}>
          {label ? (
            <Text style={[styles.label, { color: resolvedTextColor }]} numberOfLines={1}>
              {label}
            </Text>
          ) : null}
          <Text style={[styles.meta, { color: resolvedMetaColor }]}>
            {formatAudioTime(currentPosition)} / {formatAudioTime(duration || Number(durationSeconds || 0) * 1000)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    minWidth: 124,
    maxWidth: 168,
    borderRadius: 14,
    paddingHorizontal: 6,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
  },
  playButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  waveformWrap: {
    flex: 1,
    marginLeft: 7,
    minWidth: 0,
  },
  waveformRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 14,
  },
  waveBar: {
    width: 3,
    borderRadius: 999,
    marginRight: 2.5,
  },
  metaRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    flexShrink: 1,
    marginRight: 5,
  },
  meta: {
    fontSize: 9.5,
    fontVariant: ["tabular-nums"],
  },
});

export default VoiceMessageBubble;
