import React from "react";
import { StyleSheet, View } from "react-native";
import YoutubePlayer from "react-native-youtube-iframe";

type HiddenYoutubeAudioPlayerProps = {
  playerRef: React.RefObject<any>;
  play: boolean;
  videoId: string;
  onReady: () => void;
  onError: (error: any) => void;
  onChangeState: (state: string) => void;
};

export default function HiddenYoutubeAudioPlayer({
  playerRef,
  play,
  videoId,
  onReady,
  onError,
  onChangeState,
}: HiddenYoutubeAudioPlayerProps) {
  if (!videoId) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.hiddenPlayerWrap}>
      <YoutubePlayer
        ref={playerRef}
        height={1}
        width={1}
        play={play}
        videoId={videoId}
        initialPlayerParams={{
          controls: false,
          modestbranding: true,
          rel: false,
        }}
        onReady={onReady}
        onError={onError}
        onChangeState={onChangeState}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hiddenPlayerWrap: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0.01,
    left: -9999,
    top: -9999,
  },
});
