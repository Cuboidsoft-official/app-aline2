import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DarkTheme, DefaultTheme } from "@react-navigation/native";

const STORAGE_KEY = "darkMode";

const lightColors = {
  primary: "#7B4DFF",
  background: "#FFFFFF",
  surface: "#F8F8FC",
  card: "#FFFFFF",
  input: "#F4F5FA",
  border: "#E7E9F2",
  text: "#111111",
  mutedText: "#667085",
  placeholder: "#98A2B3",
  tabInactive: "#667085",
  danger: "#EF4444",
};

const darkColors = {
  primary: "#9A7BFF",
  background: "#0F172A",
  surface: "#111827",
  card: "#172033",
  input: "#1F2937",
  border: "#243146",
  text: "#F8FAFC",
  mutedText: "#9CA3AF",
  placeholder: "#6B7280",
  tabInactive: "#94A3B8",
  danger: "#F87171",
};

type ThemeValue = {
  colors: typeof lightColors;
  isDarkMode: boolean;
  setDarkModePreference: (nextValue: boolean) => Promise<void>;
  navigationTheme: typeof DefaultTheme;
};

const AppThemeContext = createContext<ThemeValue | undefined>(undefined);

export const AppThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadThemePreference = async () => {
      try {
        const storedValue = await AsyncStorage.getItem(STORAGE_KEY);
        if (mounted && storedValue !== null) {
          setIsDarkMode(storedValue === "true");
        }
      } catch (error) {
        console.log("theme preference load error:", error);
      }
    };

    loadThemePreference().catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  const setDarkModePreference = useCallback(async (nextValue: boolean) => {
    setIsDarkMode(nextValue);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, String(nextValue));
    } catch (error) {
      console.log("theme preference save error:", error);
    }
  }, []);

  const colors = isDarkMode ? darkColors : lightColors;

  const navigationTheme = useMemo(
    () => ({
      ...(isDarkMode ? DarkTheme : DefaultTheme),
      colors: {
        ...(isDarkMode ? DarkTheme.colors : DefaultTheme.colors),
        primary: colors.primary,
        background: colors.background,
        card: colors.card,
        text: colors.text,
        border: colors.border,
        notification: colors.primary,
      },
    }),
    [colors, isDarkMode],
  );

  const value = useMemo(
    () => ({
      colors,
      isDarkMode,
      setDarkModePreference,
      navigationTheme,
    }),
    [colors, isDarkMode, navigationTheme, setDarkModePreference],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
};

export const useAppTheme = () => {
  const context = useContext(AppThemeContext);

  if (!context) {
    throw new Error("useAppTheme must be used inside AppThemeProvider");
  }

  return context;
};
