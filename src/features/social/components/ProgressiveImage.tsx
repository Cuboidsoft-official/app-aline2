import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  ImageResizeMode,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { stripBackgroundColorFromStyle } from "./mediaSurfaceStyle";

type ProgressiveImageProps = {
  uri?: string;
  previewUri?: string;
  style?: StyleProp<ViewStyle>;
  resizeMode?: ImageResizeMode;
  blurRadius?: number;
  contentBlurRadius?: number;
  fallbackColor?: string;
};

function ProgressiveImage({
  uri,
  previewUri,
  style,
  resizeMode = "cover",
  blurRadius = 14,
  contentBlurRadius = 0,
  fallbackColor = "#0f172a",
}: ProgressiveImageProps) {
  const imageOpacity = useRef(new Animated.Value(0)).current;
  const [previewFailed, setPreviewFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const resolvedUri = String(uri || "").trim();
  const resolvedPreviewUri = String(previewUri || resolvedUri).trim();
  const containerStyle = useMemo(() => stripBackgroundColorFromStyle(style), [style]);

  useEffect(() => {
    imageOpacity.stopAnimation();
    imageOpacity.setValue(0);
    setPreviewFailed(false);
    setImageFailed(false);
  }, [imageOpacity, resolvedPreviewUri, resolvedUri]);

  useEffect(() => {
    const remoteCandidates = [resolvedPreviewUri, resolvedUri]
      .filter(Boolean)
      .filter((value, index, all) => all.indexOf(value) === index)
      .filter((value) => /^https?:\/\//i.test(value));

    remoteCandidates.forEach((value) => {
      Image.prefetch(value).catch(() => undefined);
    });
  }, [resolvedPreviewUri, resolvedUri]);

  if (!resolvedUri && !resolvedPreviewUri) {
    return <View style={[styles.fallback, containerStyle, { backgroundColor: fallbackColor }]} />;
  }

  return (
    <View style={[styles.container, containerStyle, { backgroundColor: fallbackColor }]}>
      {resolvedPreviewUri && !previewFailed ? (
        <>
          <Image
            source={{ uri: resolvedPreviewUri }}
            style={StyleSheet.absoluteFill}
            resizeMode={resizeMode}
            blurRadius={blurRadius}
            fadeDuration={0}
            onError={() => {
              setPreviewFailed(true);
            }}
          />
          <View pointerEvents="none" style={styles.placeholderTint} />
        </>
      ) : null}
      {resolvedUri && !imageFailed ? (
        <Animated.Image
          source={{ uri: resolvedUri }}
          style={[StyleSheet.absoluteFill, { opacity: imageOpacity }]}
          resizeMode={resizeMode}
          fadeDuration={0}
          onLoad={() => {
            Animated.timing(imageOpacity, {
              toValue: 1,
              duration: 180,
              useNativeDriver: true,
            }).start();
          }}
          onError={() => {
            imageOpacity.stopAnimation();
            imageOpacity.setValue(0);
            setImageFailed(true);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  fallback: {
    backgroundColor: "#111827",
  },
  placeholderTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 23, 0.12)",
  },
});

export default ProgressiveImage;
