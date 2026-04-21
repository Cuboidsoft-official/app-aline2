import { Platform, TextStyle, ViewStyle } from "react-native";

const iosFont = "System";
const androidRegular = "sans-serif";
const androidMedium = "sans-serif-medium";
const androidBold = "sans-serif-bold";

export const appFonts = {
  regular: Platform.select({
    ios: iosFont,
    android: androidRegular,
    default: "sans-serif",
  }) as string,
  medium: Platform.select({
    ios: iosFont,
    android: androidMedium,
    default: "sans-serif",
  }) as string,
  semibold: Platform.select({
    ios: iosFont,
    android: androidMedium,
    default: "sans-serif",
  }) as string,
  bold: Platform.select({
    ios: iosFont,
    android: androidBold,
    default: "sans-serif",
  }) as string,
};

export const appSpacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
};

export const appRadii = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 30,
  pill: 999,
};

export const appTypography: Record<string, TextStyle> = {
  overline: {
    fontFamily: appFonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  hero: {
    fontFamily: appFonts.bold,
    fontSize: 32,
    lineHeight: 38,
  },
  h1: {
    fontFamily: appFonts.bold,
    fontSize: 28,
    lineHeight: 34,
  },
  h2: {
    fontFamily: appFonts.bold,
    fontSize: 22,
    lineHeight: 28,
  },
  h3: {
    fontFamily: appFonts.semibold,
    fontSize: 18,
    lineHeight: 24,
  },
  title: {
    fontFamily: appFonts.semibold,
    fontSize: 16,
    lineHeight: 22,
  },
  body: {
    fontFamily: appFonts.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  bodyStrong: {
    fontFamily: appFonts.semibold,
    fontSize: 15,
    lineHeight: 22,
  },
  label: {
    fontFamily: appFonts.semibold,
    fontSize: 14,
    lineHeight: 18,
  },
  caption: {
    fontFamily: appFonts.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  micro: {
    fontFamily: appFonts.medium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.4,
  },
};

export const appLayout = {
  contentMaxWidth: 560,
  authMaxWidth: 520,
};

export const appShadows: Record<string, ViewStyle> = {
  card: Platform.select({
    ios: {
      shadowColor: "#0f172a",
      shadowOpacity: 0.09,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
    android: {
      elevation: 6,
    },
    default: {},
  }) as ViewStyle,
  floating: Platform.select({
    ios: {
      shadowColor: "#020617",
      shadowOpacity: 0.14,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 14 },
    },
    android: {
      elevation: 14,
    },
    default: {},
  }) as ViewStyle,
};

export const alpha = (hexColor: string, opacityHex: string) => {
  const normalized = String(hexColor || "").trim();

  if (!normalized.startsWith("#")) {
    return hexColor;
  }

  if (normalized.length === 7) {
    return `${normalized}${opacityHex}`;
  }

  if (normalized.length === 4) {
    const expanded = `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
    return `${expanded}${opacityHex}`;
  }

  return hexColor;
};
