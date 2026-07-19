import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Image, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
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
  preload?: boolean;
  resizeMode?: "cover" | "contain" | "stretch" | "none";
  onEnd?: () => void;
  contentBlurRadius?: number;
  fallbackColor?: string;
  showBufferingLoader?: boolean;
};

const isLikelyVideoUri = (value: string): boolean =>
  /\.(mp4|m4v|mov|webm|m3u8)(?:[?#].*)?$/i.test(value);

const isUsablePosterUri = (posterUri: string, videoUri: string): boolean =>
  !!posterUri && posterUri !== videoUri && !isLikelyVideoUri(posterUri);

function SocialVideo({
  uri,
  posterUri,
  style,
  paused = false,
  muted = false,
  repeat = false,
  controls = false,
  preload = false,
  resizeMode = "cover",
  onEnd,
  contentBlurRadius = 0,
  fallbackColor = "#0f172a",
  showBufferingLoader = true,
}: SocialVideoProps) {
  const placeholderOpacity = useRef(new Animated.Value(1)).current;
  const [posterFailed, setPosterFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const resolvedUri = String(uri || "").trim();
  const resolvedPosterUri = String(posterUri || "").trim();
  const usablePosterUri = isUsablePosterUri(resolvedPosterUri, resolvedUri) ? resolvedPosterUri : "";
  const containerStyle = useMemo(() => stripBackgroundColorFromStyle(style), [style]);
  const shouldMountVideo = !!resolvedUri && !videoFailed && (!paused || controls || preload);
  const shouldShowPoster = !!usablePosterUri && !posterFailed;

  useEffect(() => {
    placeholderOpacity.stopAnimation();
    placeholderOpacity.setValue(1);
    setPosterFailed(false);
    setVideoFailed(false);
    setIsBuffering(false);
  }, [placeholderOpacity, usablePosterUri, resolvedUri]);

  useEffect(() => {
    [usablePosterUri]
      .filter(Boolean)
      .filter((value) => /^https?:\/\//i.test(value))
      .forEach((value) => {
        Image.prefetch(value).catch(() => undefined);
      });
  }, [usablePosterUri]);

  if (!resolvedUri && !usablePosterUri) {
    return <View style={[styles.fallback, containerStyle, { backgroundColor: fallbackColor }]} />;
  }

  return (
    <View style={[styles.container, containerStyle, { backgroundColor: fallbackColor }]}>
      {shouldShowPoster ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: placeholderOpacity }]}>
          <Image
            source={{ uri: usablePosterUri }}
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
      {shouldMountVideo ? (
        <>
          <Video
            source={{ uri: resolvedUri }}
            style={StyleSheet.absoluteFill}
            resizeMode={resizeMode}
            paused={paused}
            muted={muted || preload}
            repeat={repeat}
            controls={controls}
            onEnd={onEnd}
            poster={usablePosterUri || undefined}
            posterResizeMode={resizeMode}
            progressUpdateInterval={500}
            preferredForwardBufferDuration={preload ? 1 : 2}
            automaticallyWaitsToMinimizeStalling={false}
            bufferConfig={{
              minBufferMs: preload ? 500 : 1200,
              maxBufferMs: preload ? 2500 : 5000,
              bufferForPlaybackMs: preload ? 250 : 500,
              bufferForPlaybackAfterRebufferMs: preload ? 500 : 1000,
            }}
            onLoadStart={() => {
              setIsBuffering(true);
            }}
            onLoad={() => {
              setIsBuffering(false);
              Animated.timing(placeholderOpacity, {
                toValue: 0,
                duration: 180,
                useNativeDriver: true,
              }).start();
            }}
            onReadyForDisplay={() => {
              setIsBuffering(false);
            }}
            onBuffer={({ isBuffering: nextIsBuffering }) => {
              setIsBuffering(Boolean(nextIsBuffering));
            }}
            onError={() => {
              placeholderOpacity.stopAnimation();
              placeholderOpacity.setValue(1);
              setIsBuffering(false);
              setVideoFailed(true);
            }}
            playWhenInactive={false}
            ignoreSilentSwitch="ignore"
          />
          {showBufferingLoader && isBuffering && !preload ? (
            <View pointerEvents="none" style={styles.loaderOverlay}>
              <ActivityIndicator size="small" color="#fff" />
            </View>
          ) : null}
          {contentBlurRadius > 0 && usablePosterUri ? (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Image
                source={{ uri: usablePosterUri }}
                style={StyleSheet.absoluteFill}
                resizeMode={resizeMode}
                blurRadius={contentBlurRadius}
              />
            </View>
          ) : null}
        </>
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
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(2, 6, 23, 0.12)",
  },
});

export default SocialVideo;
