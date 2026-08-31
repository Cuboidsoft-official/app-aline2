import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Image, PanResponder, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
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
  onProgress?: (data: any) => void;
  contentBlurRadius?: number;
  fallbackColor?: string;
  showBufferingLoader?: boolean;
  showProgressBar?: boolean;
  progressBarBottomOffset?: number;
  progressBarTrackColor?: string;
  progressBarFillColor?: string;
  progressBarThumbColor?: string;
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
  onProgress,
  contentBlurRadius = 0,
  fallbackColor = "#0f172a",
  showBufferingLoader = true,
  showProgressBar = false,
  progressBarBottomOffset,
  progressBarTrackColor = "rgba(255, 255, 255, 0.35)",
  progressBarFillColor = "#ffffff",
  progressBarThumbColor = "#ffffff",
}: SocialVideoProps) {
  const placeholderOpacity = useRef(new Animated.Value(1)).current;
  const videoRef = useRef<any>(null);
  const durationRef = useRef(0);
  const trackWidthRef = useRef(0);

  const [posterFailed, setPosterFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const resolvedUri = String(uri || "").trim();
  const resolvedPosterUri = String(posterUri || "").trim();
  const usablePosterUri = isUsablePosterUri(resolvedPosterUri, resolvedUri) ? resolvedPosterUri : "";
  const containerStyle = useMemo(() => stripBackgroundColorFromStyle(style), [style]);
  const shouldMountVideo = !!resolvedUri && !videoFailed;
  const shouldShowPoster = !!usablePosterUri && !posterFailed;
  const safeVolume = Math.max(0, Math.min(1, Number(volume) || 0));
  const effectivePaused = paused || preload;

  const seekToProgress = useCallback((locationX: number) => {
    if (progressBarWidth <= 0 || durationRef.current <= 0) {
      return;
    }

    const nextProgress = Math.max(0, Math.min(1, locationX / progressBarWidth));
    setVideoProgress(nextProgress);
    videoRef.current?.seek?.(nextProgress * durationRef.current);
  }, [progressBarWidth]);

  const progressBarResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => seekToProgress(event.nativeEvent.locationX),
      onPanResponderMove: (event) => seekToProgress(event.nativeEvent.locationX),
      onPanResponderRelease: (event) => seekToProgress(event.nativeEvent.locationX),
      onPanResponderTerminationRequest: () => false,
    }),
    [seekToProgress],
  );

  const fadeOutPoster = useCallback(() => {
    Animated.timing(placeholderOpacity, {
      toValue: 0,
      duration: 100,
      useNativeDriver: true,
    }).start();
  }, [placeholderOpacity]);

  const handleSeekFromEvent = useCallback((evt: any) => {
    const locX = evt?.nativeEvent?.locationX ?? 0;
    const width = trackWidthRef.current || 1;
    const ratio = Math.max(0, Math.min(1, locX / width));
    setVideoProgress(ratio);
    if (durationRef.current > 0) {
      videoRef.current?.seek?.(ratio * durationRef.current);
    }
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => handleSeekFromEvent(evt),
        onPanResponderMove: (evt) => handleSeekFromEvent(evt),
        onPanResponderRelease: (evt) => handleSeekFromEvent(evt),
      }),
    [handleSeekFromEvent]
  );

  useEffect(() => {
    placeholderOpacity.stopAnimation();
    placeholderOpacity.setValue(1);
    setPosterFailed(false);
    setVideoFailed(false);
    setIsBuffering(false);
    setIsVideoReady(false);
    setVideoProgress(0);
    durationRef.current = 0;
  }, [placeholderOpacity, usablePosterUri, resolvedUri]);

  useEffect(() => {
    if (!preload && !paused && isVideoReady) {
      fadeOutPoster();
    } else if (preload) {
      placeholderOpacity.stopAnimation();
      placeholderOpacity.setValue(1);
      setVideoProgress(0);
    }
  }, [preload, paused, isVideoReady, fadeOutPoster, placeholderOpacity]);

  useEffect(() => {
    if (!restartKey || !videoRef.current || preload) {
      return;
    }

    videoRef.current.seek?.(0);
    setVideoProgress(0);
  }, [preload, restartKey]);

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
            useTextureView={true}
            onEnd={() => {
              setVideoProgress(0);
              onEnd?.();
            }}
            progressUpdateInterval={100}
            preferredForwardBufferDuration={preload ? 2 : 4}
            automaticallyWaitsToMinimizeStalling
            bufferConfig={{
              minBufferMs: 1000,
              maxBufferMs: 15000,
              bufferForPlaybackMs: 250,
              bufferForPlaybackAfterRebufferMs: 500,
            }}
            onLoadStart={() => {
              setIsBuffering(false);
            }}
            onLoad={(event) => {
              setIsBuffering(false);
              setIsVideoReady(true);
              if (event?.duration && Number(event.duration) > 0) {
                durationRef.current = Number(event.duration);
              }
              if (preload) {
                videoRef.current?.seek?.(0);
                setVideoProgress(0);
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
                setVideoProgress(0);
              } else if (!paused) {
                fadeOutPoster();
              }
            }}
            onProgress={(data) => {
              if (!preload && !paused) {
                setIsBuffering(false);
                setIsVideoReady(true);
                fadeOutPoster();
              }
              const current = Number(data?.currentTime || 0);
              const total = Number(
                data?.seekableDuration || data?.playableDuration || durationRef.current || 0
              );
              if (total > 0) {
                const ratio = Math.max(0, Math.min(1, current / total));
                setVideoProgress(ratio);
              }
              onProgress?.(data);
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
              setVideoProgress(0);
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
          {showProgressBar && !preload ? (
            <View
              style={[
                styles.progressBarTrack,
                progressBarBottomOffset !== undefined ? { bottom: progressBarBottomOffset } : null,
              ]}
              onLayout={(event) => setProgressBarWidth(event.nativeEvent.layout.width)}
              {...progressBarResponder.panHandlers}
            >
              <View pointerEvents="none" style={[styles.progressBarRail, { backgroundColor: progressBarTrackColor }]} />
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.max(0, Math.min(100, videoProgress * 100))}%`,
                    backgroundColor: progressBarFillColor,
                  },
                ]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.progressBarThumb,
                  {
                    left: `${Math.max(0, Math.min(100, videoProgress * 100))}%`,
                    backgroundColor: progressBarThumbColor,
                  },
                ]}
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
  progressBarTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 18,
    justifyContent: "center",
    zIndex: 999,
    elevation: 10,
  },
  progressBarRail: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.35)",
  },
  progressBarFill: {
    height: 4,
    backgroundColor: "#ffffff",
    borderRadius: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
    elevation: 3,
  },
  progressBarThumb: {
    position: "absolute",
    width: 14,
    height: 14,
    marginLeft: -7,
    borderRadius: 7,
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 2,
    elevation: 4,
  },
});

export default SocialVideo;
