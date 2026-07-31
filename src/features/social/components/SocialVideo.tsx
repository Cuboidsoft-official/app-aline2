import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Image, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Video from "react-native-video";
import { stripBackgroundColorFromStyle } from "./mediaSurfaceStyle";

type SocialVideoProps = {
  uri?: string;
  posterUri?: string;
  style?: StyleProp<ViewStyle>;
  paused?: boolean;
  muted?: boolean;
  volume?: number;
  repeat?: boolean;
  controls?: boolean;
  preload?: boolean;
  resizeMode?: "cover" | "contain" | "stretch" | "none";
  restartKey?: string | number;
  onEnd?: () => void;
  onLoad?: (event: any) => void;
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
  volume = 1,
  repeat = false,
  controls = false,
  preload = false,
  resizeMode = "cover",
  restartKey,
  onEnd,
  onLoad,
  contentBlurRadius = 0,
  fallbackColor = "#0f172a",
  showBufferingLoader = true,
}: SocialVideoProps) {
  const placeholderOpacity = useRef(new Animated.Value(1)).current;
  const videoRef = useRef<any>(null);
  const [posterFailed, setPosterFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const resolvedUri = String(uri || "").trim();
  const resolvedPosterUri = String(posterUri || "").trim();
  const usablePosterUri = isUsablePosterUri(resolvedPosterUri, resolvedUri) ? resolvedPosterUri : "";
  const containerStyle = useMemo(() => stripBackgroundColorFromStyle(style), [style]);
  const shouldMountVideo = !!resolvedUri && !videoFailed && (!paused || controls || preload);
  const shouldShowPoster = !!usablePosterUri && !posterFailed;
  const safeVolume = Math.max(0, Math.min(1, Number(volume) || 0));
  const effectivePaused = preload ? (isVideoReady ? true : false) : paused;

  const fadeOutPoster = useCallback(() => {
    Animated.timing(placeholderOpacity, {
      toValue: 0,
      duration: 100,
      useNativeDriver: true,
    }).start();
  }, [placeholderOpacity]);

  useEffect(() => {
    placeholderOpacity.stopAnimation();
    placeholderOpacity.setValue(1);
    setPosterFailed(false);
    setVideoFailed(false);
    setIsBuffering(false);
    setIsVideoReady(false);
  }, [placeholderOpacity, usablePosterUri, resolvedUri]);

  useEffect(() => {
    if (!preload && !paused && isVideoReady) {
      fadeOutPoster();
    } else if (preload) {
      placeholderOpacity.stopAnimation();
      placeholderOpacity.setValue(1);
    }
  }, [preload, paused, isVideoReady, fadeOutPoster, placeholderOpacity]);

  useEffect(() => {
    if (!restartKey || !videoRef.current || paused || preload) {
      return;
    }

    videoRef.current.seek?.(0);
  }, [paused, preload, restartKey]);

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
            ref={videoRef}
            source={{ uri: resolvedUri }}
            style={StyleSheet.absoluteFill}
            resizeMode={resizeMode}
            paused={effectivePaused}
            muted={muted || preload}
            volume={safeVolume}
            repeat={repeat}
            controls={controls}
            onEnd={onEnd}
            progressUpdateInterval={250}
            preferredForwardBufferDuration={preload ? 2 : 4}
            automaticallyWaitsToMinimizeStalling={false}
            bufferConfig={{
              minBufferMs: 500,
              maxBufferMs: 5000,
              bufferForPlaybackMs: 50,
              bufferForPlaybackAfterRebufferMs: 100,
            }}
            onLoadStart={() => {
              setIsBuffering(false);
            }}
            onLoad={(event) => {
              setIsBuffering(false);
              setIsVideoReady(true);
              if (preload) {
                videoRef.current?.seek?.(0);
              } else if (!paused) {
                fadeOutPoster();
              }
              onLoad?.(event);
            }}
            onReadyForDisplay={() => {
              setIsBuffering(false);
              setIsVideoReady(true);
              if (preload) {
                videoRef.current?.seek?.(0);
              } else if (!paused) {
                fadeOutPoster();
              }
            }}
            onProgress={() => {
              if (!preload && !paused) {
                setIsBuffering(false);
                setIsVideoReady(true);
                fadeOutPoster();
              }
            }}
            onBuffer={({ isBuffering: nextIsBuffering }) => {
              if (!nextIsBuffering) {
                setIsBuffering(false);
                if (!preload && !paused) {
                  fadeOutPoster();
                }
              }
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
