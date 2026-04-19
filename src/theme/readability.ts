import { Platform, StyleSheet, Text, TextInput } from "react-native";

let readabilityInstalled = false;

const liftReadableFontSize = (value: unknown) => {
  if (typeof value !== "number") {
    return value;
  }

  if (value <= 11) {
    return value + 2.5;
  }

  if (value <= 12.5) {
    return value + 2;
  }

  if (value <= 14) {
    return value + 1.5;
  }

  if (value <= 16) {
    return value + 1;
  }

  return value;
};

const liftReadableLineHeight = (value: unknown) => {
  if (typeof value !== "number") {
    return value;
  }

  if (value <= 14) {
    return value + 4;
  }

  if (value <= 18) {
    return value + 3;
  }

  if (value <= 22) {
    return value + 2;
  }

  return value;
};

const configureTextDefaults = (component: any, maxFontSizeMultiplier: number) => {
  component.defaultProps = {
    ...(component.defaultProps || {}),
    allowFontScaling: true,
    maxFontSizeMultiplier,
  };
};

export const installReadableUiDefaults = () => {
  if (readabilityInstalled) {
    return;
  }

  readabilityInstalled = true;

  const maxFontSizeMultiplier = Platform.OS === "ios" ? 1.4 : 1.35;
  configureTextDefaults(Text, maxFontSizeMultiplier);
  configureTextDefaults(TextInput, maxFontSizeMultiplier);

  const styleSheetWithPreprocessors = StyleSheet as typeof StyleSheet & {
    setStyleAttributePreprocessor?: (property: string, process: (value: unknown) => unknown) => void;
  };

  styleSheetWithPreprocessors.setStyleAttributePreprocessor?.("fontSize", liftReadableFontSize);
  styleSheetWithPreprocessors.setStyleAttributePreprocessor?.("lineHeight", liftReadableLineHeight);
};

