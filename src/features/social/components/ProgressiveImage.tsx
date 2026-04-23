import React, { useEffect, useRef } from "react";
import {
  Animated,
  Image,
  ImageResizeMode,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";

type ProgressiveImageProps = {
  uri?: string;
  previewUri?: string;
  style?: StyleProp<ViewStyle>;
  resizeMode?: ImageResizeMode;
  blurRadius?: number;
  fallbackColor?: string;
};

function ProgressiveImage({
  uri,
  previewUri,
  style,
  resizeMode = "cover",
  blurRadius = 14,
  fallbackColor = "#111827",
}: ProgressiveImageProps) {
  const imageOpacity = useRef(new Animated.Value(0)).current;
  const resolvedUri = String(uri || "").trim();
  const resolvedPreviewUri = String(previewUri || resolvedUri).trim();

  useEffect(() => {
    imageOpacity.stopAnimation();
    imageOpacity.setValue(0);
  }, [imageOpacity, resolvedPreviewUri, resolvedUri]);

  if (!resolvedUri) {
    return <View style={[styles.fallback, { backgroundColor: fallbackColor }, style]} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: fallbackColor }, style]}>
      {resolvedPreviewUri ? (
        <>
          <Image
            source={{ uri: resolvedPreviewUri }}
            style={StyleSheet.absoluteFill}
            resizeMode={resizeMode}
            blurRadius={blurRadius}
          />
          <View pointerEvents="none" style={styles.placeholderTint} />
        </>
      ) : null}
      <Animated.Image
        source={{ uri: resolvedUri }}
        style={[StyleSheet.absoluteFill, { opacity: imageOpacity }]}
        resizeMode={resizeMode}
        onLoad={() => {
          Animated.timing(imageOpacity, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }).start();
        }}
        onError={() => {
          imageOpacity.setValue(1);
        }}
      />
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
