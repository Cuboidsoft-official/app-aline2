import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";

import { normalizeMediaUrl } from "../../../utils/mediaUrls";
import { createManagedSound } from "../../../utils/nitroSound";

type CommentAudioBubbleProps = {
  audioDuration?: number;
  audioUrl?: string;
  accentColor?: string;
};

const formatAudioTime = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

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

function CommentAudioBubble({
  audioDuration,
  audioUrl,
  accentColor = "#2563eb",
}: CommentAudioBubbleProps) {
  const soundRef = useRef(createManagedSound());
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [duration, setDuration] = useState(Math.max(0, Number(audioDuration || 0) * 1000));

  const rawAudioUrl = useMemo(() => String(audioUrl || "").trim(), [audioUrl]);
  const resolvedAudioUrl = useMemo(() => normalizeMediaUrl(rawAudioUrl), [rawAudioUrl]);

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
    setDuration(Math.max(0, Number(audioDuration || 0) * 1000));
    soundRef.current.stopPlayer().catch(() => {});
  }, [audioDuration, resolvedAudioUrl]);

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
      console.log("comment audio playback error:", error);
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
      activeOpacity={0.85}
      onPress={togglePlayback}
      style={[styles.container, { borderColor: `${accentColor}30`, backgroundColor: `${accentColor}12` }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: accentColor }]}>
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Icon name={playing ? "pause" : "play"} size={16} color="#fff" />
        )}
      </View>
      <View style={styles.copy}>
        <Text style={[styles.label, { color: accentColor }]}>Voice comment</Text>
        <Text style={styles.meta}>
          {formatAudioTime(currentPosition)} / {formatAudioTime(duration || Number(audioDuration || 0) * 1000)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    marginLeft: 10,
    flex: 1,
  },
  label: {
    fontSize: 12.5,
    fontWeight: "700",
  },
  meta: {
    marginTop: 2,
    color: "#6b7280",
    fontSize: 11.5,
    fontVariant: ["tabular-nums"],
  },
});

export default CommentAudioBubble;
