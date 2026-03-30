import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Video from "react-native-video";

type SocialVideoProps = {
  uri?: string;
  posterUri?: string;
  style?: StyleProp<ViewStyle>;
  paused?: boolean;
  muted?: boolean;
  repeat?: boolean;
  controls?: boolean;
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
  onEnd,
}: SocialVideoProps) {
  if (!uri) {
    return <View style={[styles.fallback, style]} />;
  }

  return (
    <View style={[styles.container, style]}>
      <Video
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        paused={paused}
        muted={muted}
        repeat={repeat}
        controls={controls}
        onEnd={onEnd}
        poster={posterUri || undefined}
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
});

export default SocialVideo;
