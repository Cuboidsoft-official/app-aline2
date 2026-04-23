import { StyleProp, StyleSheet, ViewStyle } from "react-native";

export const stripBackgroundColorFromStyle = (style?: StyleProp<ViewStyle>): ViewStyle => {
  const flattened = StyleSheet.flatten(style);
  if (!flattened) {
    return {};
  }

  const { backgroundColor: _ignoredBackgroundColor, ...rest } = flattened;
  return rest;
};
