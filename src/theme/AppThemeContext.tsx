import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DarkTheme, DefaultTheme } from "@react-navigation/native";

const STORAGE_KEY = "darkMode";

const lightColors = {
  primary: "#9b4dff",
  background: "#F4F7FB",
  surface: "#EDF2F8",
  card: "#FFFFFF",
  input: "#EEF3F8",
  border: "#D7DFEA",
  text: "#0F172A",
  mutedText: "#5F6B7C",
  placeholder: "#8A95A6",
  tabInactive: "#7A8699",
  danger: "#FF3B30",
};

const darkColors = {
  primary: "#9b4dff",
  background: "#0B1220",
  surface: "#111A2B",
  card: "#151F32",
  input: "#1B263A",
  border: "#2A3851",
  text: "#F6F8FC",
  mutedText: "#97A3B6",
  placeholder: "#6F7D93",
  tabInactive: "#8A96AA",
  danger: "#FF6961",
};

type ThemeValue = {
  colors: typeof lightColors;
  isDarkMode: boolean;
  setDarkModePreference: (nextValue: boolean) => Promise<void>;
  navigationTheme: typeof DefaultTheme;
};

const AppThemeContext = createContext<ThemeValue | undefined>(undefined);

export const AppThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [isDarkMode, setIsDarkMode] = useState(true);

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
