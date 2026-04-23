import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Video from "react-native-video";
import { stripBackgroundColorFromStyle } from "./mediaSurfaceStyle";

type SocialVideoProps = {
  uri?: string;
  posterUri?: string;
  style?: StyleProp<ViewStyle>;
  paused?: boolean;
  muted?: boolean;
  repeat?: boolean;
  controls?: boolean;
  resizeMode?: "cover" | "contain" | "stretch" | "none";
  onEnd?: () => void;
  fallbackColor?: string;
};

function SocialVideo({
  uri,
  posterUri,
  style,
  paused = false,
  muted = false,
  repeat = false,
  controls = false,
  resizeMode = "cover",
  onEnd,
  fallbackColor = "#0f172a",
}: SocialVideoProps) {
  const placeholderOpacity = useRef(new Animated.Value(1)).current;
  const [posterFailed, setPosterFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const resolvedUri = String(uri || "").trim();
  const resolvedPosterUri = String(posterUri || "").trim();
  const containerStyle = useMemo(() => stripBackgroundColorFromStyle(style), [style]);

  useEffect(() => {
    placeholderOpacity.stopAnimation();
    placeholderOpacity.setValue(1);
    setPosterFailed(false);
    setVideoFailed(false);
  }, [placeholderOpacity, resolvedPosterUri, resolvedUri]);

  useEffect(() => {
    [resolvedPosterUri]
      .filter(Boolean)
      .filter((value) => /^https?:\/\//i.test(value))
      .forEach((value) => {
        Image.prefetch(value).catch(() => undefined);
      });
  }, [resolvedPosterUri]);

  if (!resolvedUri && !resolvedPosterUri) {
    return <View style={[styles.fallback, containerStyle, { backgroundColor: fallbackColor }]} />;
  }

  return (
    <View style={[styles.container, containerStyle, { backgroundColor: fallbackColor }]}>
      {resolvedPosterUri && !posterFailed ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: placeholderOpacity }]}>
          <Image
            source={{ uri: resolvedPosterUri }}
            style={StyleSheet.absoluteFill}
            resizeMode={resizeMode}
            blurRadius={14}
            fadeDuration={0}
            onError={() => {
              setPosterFailed(true);
            }}
          />
          <View style={styles.placeholderTint} />
        </Animated.View>
      ) : null}
      {resolvedUri && !videoFailed ? (
        <Video
          source={{ uri: resolvedUri }}
          style={StyleSheet.absoluteFill}
          resizeMode={resizeMode}
          paused={paused}
          muted={muted}
          repeat={repeat}
          controls={controls}
          onEnd={onEnd}
          poster={resolvedPosterUri || undefined}
          onLoad={() => {
            Animated.timing(placeholderOpacity, {
              toValue: 0,
              duration: 180,
              useNativeDriver: true,
            }).start();
          }}
          onError={() => {
            placeholderOpacity.stopAnimation();
            placeholderOpacity.setValue(1);
            setVideoFailed(true);
          }}
          playWhenInactive={false}
          ignoreSilentSwitch="ignore"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: "#000",
  },
  fallback: {
    backgroundColor: "#111827",
  },
  placeholderTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 23, 0.12)",
  },
});

export default SocialVideo;
