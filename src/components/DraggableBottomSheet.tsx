import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import { useAppTheme } from "../theme/AppThemeContext";

type DraggableBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  snapPoints?: number[];
  initialSnapIndex?: number;
  minHeight?: number;
  maxHeightRatio?: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function DraggableBottomSheet({
  visible,
  onClose,
  children,
  snapPoints = [0.44, 0.68, 0.88],
  initialSnapIndex = 1,
  minHeight = 240,
  maxHeightRatio = 0.88,
}: DraggableBottomSheetProps) {
  const { colors, isDarkMode } = useAppTheme();
  const { height: windowHeight } = useWindowDimensions();
  const maxHeight = Math.max(minHeight + 40, Math.floor(windowHeight * maxHeightRatio));

  const sheetHeights = useMemo(() => {
    const values = snapPoints
      .map((point) => clamp(Math.round(windowHeight * point), minHeight, maxHeight))
      .filter(Boolean)
      .sort((a, b) => a - b);

    return Array.from(new Set(values.length ? values : [Math.max(minHeight, Math.round(windowHeight * 0.68)), maxHeight]));
  }, [maxHeight, minHeight, snapPoints, windowHeight]);

  const currentHeightRef = useRef(sheetHeights[Math.min(initialSnapIndex, sheetHeights.length - 1)] || maxHeight);
  const dragStartHeightRef = useRef(currentHeightRef.current);
  const animatedHeight = useRef(new Animated.Value(currentHeightRef.current)).current;

  const animateToHeight = (nextHeight: number) => {
    currentHeightRef.current = nextHeight;
    Animated.spring(animatedHeight, {
      toValue: nextHeight,
      useNativeDriver: false,
      tension: 170,
      friction: 24,
    }).start();
  };

  useEffect(() => {
    const defaultHeight = sheetHeights[Math.min(initialSnapIndex, sheetHeights.length - 1)] || maxHeight;
    currentHeightRef.current = defaultHeight;
    animatedHeight.setValue(defaultHeight);
  }, [animatedHeight, initialSnapIndex, maxHeight, sheetHeights]);

  useEffect(() => {
    if (visible) {
      animateToHeight(currentHeightRef.current);
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_event, gestureState) => Math.abs(gestureState.dy) > 3,
      onPanResponderGrant: () => {
        dragStartHeightRef.current = currentHeightRef.current;
      },
      onPanResponderMove: (_event, gestureState) => {
        const nextHeight = clamp(dragStartHeightRef.current - gestureState.dy, sheetHeights[0], maxHeight);
        animatedHeight.setValue(nextHeight);
      },
      onPanResponderRelease: (_event, gestureState) => {
        const releasedHeight = clamp(dragStartHeightRef.current - gestureState.dy, sheetHeights[0], maxHeight);
        const shouldClose = gestureState.dy > 160 && releasedHeight <= sheetHeights[0] + 24;
        if (shouldClose) {
          onClose();
          return;
        }

        const nextHeight = sheetHeights.reduce(
          (closest, point) => (Math.abs(point - releasedHeight) < Math.abs(closest - releasedHeight) ? point : closest),
          sheetHeights[0]
        );

        animateToHeight(nextHeight);
      },
    })
  ).current;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View pointerEvents="box-none" style={styles.root}>
        <Animated.View
          style={[
            styles.sheetWrap,
            {
              height: animatedHeight,
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: isDarkMode ? "#000" : "#0f172a",
            },
          ]}
        >
          <View style={styles.handleArea} {...panResponder.panHandlers}>
            <View style={[styles.handle, { backgroundColor: isDarkMode ? "#475569" : "#cbd5e1" }]} />
          </View>
          <View style={styles.content}>{children}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2,6,23,0.58)",
  },
  root: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  sheetWrap: {
    marginTop: "auto",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.24,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 14,
  },
  handleArea: {
    paddingTop: 10,
    paddingBottom: 8,
    alignItems: "center",
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 999,
  },
  content: {
    flex: 1,
  },
});

export default DraggableBottomSheet;
