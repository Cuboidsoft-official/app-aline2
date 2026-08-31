import React, { useEffect, useImperativeHandle, useRef } from "react";
import {
  Dimensions,
  Image,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { captureRef } from "react-native-view-shot";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export type PinchZoomImageHandle = {
  captureAsync: () => Promise<string>;
};

export type PinchZoomImageProps = {
  uri: string;
  onLoad?: () => void;
  onError?: (error: any) => void;
  style?: StyleProp<ViewStyle>;
  minScale?: number;
  maxScale?: number;
  doubleTapScale?: number;
};

export const PinchZoomImage = React.forwardRef<PinchZoomImageHandle, PinchZoomImageProps>(({
  uri,
  onLoad,
  onError,
  style,
  minScale = 1,
  maxScale = 5,
  doubleTapScale = 2.5,
}, ref) => {
  const imageCaptureRef = useRef<View>(null);

  useImperativeHandle(ref, () => ({
    captureAsync: async () => {
      return captureRef(imageCaptureRef, {
        format: "jpg",
        quality: 1,
        result: "tmpfile",
      });
    },
  }), []);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  // Measured from the actual rendered container (onLayout) instead of the
  // static device screen size, so pan clamping stays correct even if this
  // viewer is ever hosted in something other than a true full-screen modal.
  const containerWidth = useSharedValue(SCREEN_WIDTH);
  const containerHeight = useSharedValue(SCREEN_HEIGHT);

  // Reset zoom & pan when URI changes
  useEffect(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [uri, scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  // Pinch Gesture
  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      const nextScale = savedScale.value * event.scale;
      scale.value = Math.min(Math.max(nextScale, minScale * 0.8), maxScale * 1.2);
    })
    .onEnd(() => {
      if (scale.value < minScale * 1.05) {
        scale.value = withSpring(minScale);
        savedScale.value = minScale;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else if (scale.value > maxScale) {
        scale.value = withSpring(maxScale);
        savedScale.value = maxScale;
      } else {
        savedScale.value = scale.value;
      }
    });

  // Pan Gesture
  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .onUpdate((event) => {
      if (scale.value <= 1.02) {
        return;
      }

      // Calculate max allowed translation based on current scale
      const maxTransX = (containerWidth.value * (scale.value - 1)) / 2;
      const maxTransY = (containerHeight.value * (scale.value - 1)) / 2;

      const nextX = savedTranslateX.value + event.translationX;
      const nextY = savedTranslateY.value + event.translationY;

      translateX.value = Math.min(Math.max(nextX, -maxTransX), maxTransX);
      translateY.value = Math.min(Math.max(nextY, -maxTransY), maxTransY);
    })
    .onEnd(() => {
      if (scale.value <= 1.02) {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        return;
      }

      const maxTransX = (containerWidth.value * (scale.value - 1)) / 2;
      const maxTransY = (containerHeight.value * (scale.value - 1)) / 2;

      if (Math.abs(translateX.value) > maxTransX) {
        const clampedX = translateX.value > 0 ? maxTransX : -maxTransX;
        translateX.value = withSpring(clampedX);
        savedTranslateX.value = clampedX;
      } else {
        savedTranslateX.value = translateX.value;
      }

      if (Math.abs(translateY.value) > maxTransY) {
        const clampedY = translateY.value > 0 ? maxTransY : -maxTransY;
        translateY.value = withSpring(clampedY);
        savedTranslateY.value = clampedY;
      } else {
        savedTranslateY.value = translateY.value;
      }
    });

  // Double Tap to toggle zoom
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd(() => {
      if (scale.value > 1.1) {
        scale.value = withTiming(1, { duration: 200 });
        savedScale.value = 1;
        translateX.value = withTiming(0, { duration: 200 });
        translateY.value = withTiming(0, { duration: 200 });
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(doubleTapScale, { duration: 200 });
        savedScale.value = doubleTapScale;
      }
    });

  const composedGesture = Gesture.Simultaneous(
    pinchGesture,
    panGesture,
    doubleTapGesture
  );

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  return (
    <View
      style={[styles.container, style]}
      onLayout={(event) => {
        containerWidth.value = event.nativeEvent.layout.width;
        containerHeight.value = event.nativeEvent.layout.height;
      }}
    >
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={[styles.imageWrapper, animatedStyle]}>
          <View ref={imageCaptureRef} collapsable={false} style={styles.captureWrapper}>
            <Image
              source={{ uri }}
              style={styles.image}
              resizeMode="contain"
              onLoad={onLoad}
              onError={onError}
            />
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  imageWrapper: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  captureWrapper: {
    width: "100%",
    height: "100%",
    backgroundColor: "transparent",
  },
  image: {
    width: "100%",
    height: "100%",
  },
});

export default PinchZoomImage;
