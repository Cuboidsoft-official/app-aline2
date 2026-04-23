import React, { useEffect, useRef } from "react";
import { Animated, Image, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Video from "react-native-video";

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
}: SocialVideoProps) {
  const placeholderOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    placeholderOpacity.stopAnimation();
    placeholderOpacity.setValue(1);
  }, [placeholderOpacity, posterUri, uri]);

  if (!uri) {
    return <View style={[styles.fallback, style]} />;
  }

  return (
    <View style={[styles.container, style]}>
      {posterUri ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: placeholderOpacity }]}>
          <Image
            source={{ uri: posterUri }}
            style={StyleSheet.absoluteFill}
            resizeMode={resizeMode}
            blurRadius={14}
          />
          <View style={styles.placeholderTint} />
        </Animated.View>
      ) : null}
      <Video
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode={resizeMode}
        paused={paused}
        muted={muted}
        repeat={repeat}
        controls={controls}
        onEnd={onEnd}
        poster={posterUri || undefined}
        onLoad={() => {
          Animated.timing(placeholderOpacity, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }).start();
        }}
        playWhenInactive={false}
        ignoreSilentSwitch="ignore"
      />
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
