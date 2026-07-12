import React, { useCallback, useMemo, useRef } from "react";
import { PanResponder, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { alpha, appFonts } from "../theme/designSystem";
import { useAppTheme } from "../theme/AppThemeContext";
import { stopAllSegmentedMusicPlayback } from "../hooks/useSegmentedMusicPlayback";
import ProfileTabAvatar from "./ProfileTabAvatar";

export const APP_BOTTOM_DOCK_BASE_HEIGHT = Platform.OS === "ios" ? 74 : 66;

export const getAppBottomDockBottomPadding = (bottomInset = 0) => {
  const normalizedInset = Math.max(0, Number(bottomInset) || 0);
  if (normalizedInset > 0) {
    return normalizedInset + (Platform.OS === "ios" ? 8 : 4);
  }

  return Platform.OS === "ios" ? 12 : 8;
};

export const getAppBottomDockHeight = (bottomInset = 0) =>
  APP_BOTTOM_DOCK_BASE_HEIGHT + getAppBottomDockBottomPadding(bottomInset);

const bottomNavItems = [
  {
    key: "Feed",
    label: "Feed",
    screen: "Feed",
    icons: { active: "home", inactive: "home-outline" },
  },
  {
    key: "Swipes",
    label: "Swipes",
    screen: "Swipes",
    icons: { active: "flame", inactive: "flame-outline" },
  },
  {
    key: "Create",
    label: "Create",
    screen: "Create",
    icons: { active: "add-circle", inactive: "add-circle-outline" },
  },
  {
    key: "Chats",
    label: "Chats",
    screen: "Chats",
    icons: { active: "chatbubbles", inactive: "chatbubbles-outline" },
  },
  {
    key: "ProfileView",
    label: "Profile",
    screen: "ProfileView",
    icons: { active: "person", inactive: "person-outline" },
  },
];

type AppBottomDockProps = {
  navigation: any;
  activeRouteName?: string;
};

function AppBottomDock({ navigation, activeRouteName }: AppBottomDockProps) {
  const { colors, isDarkMode } = useAppTheme();
  const insets = useSafeAreaInsets();
  const bottomPadding = getAppBottomDockBottomPadding(insets.bottom);
  const dockHeight = getAppBottomDockHeight(insets.bottom);
  const surfaceColor = isDarkMode ? "#08111F" : colors.card;
  const activeTintColor = colors.primary;
  const labelFontSize = Platform.OS === "ios" ? 8.5 : 8.2;
  const routeNames = useMemo(() => navigation?.getState?.()?.routeNames || [], [navigation]);
  const swipeLockRef = useRef(false);
  const resolvedActiveKey = activeRouteName === "SwipesLauncher" ? "Swipes" : activeRouteName;
  const activeIndex = useMemo(
    () => Math.max(0, bottomNavItems.findIndex((item) => item.key === resolvedActiveKey)),
    [resolvedActiveKey],
  );

  const navigateToItem = useCallback((screen: string) => {
    const nextActiveKey = screen === "Swipes" ? "Swipes" : screen;
    if (nextActiveKey !== resolvedActiveKey) {
      stopAllSegmentedMusicPlayback();
    }

    if (screen === "Swipes") {
      navigation.getParent?.()?.navigate("Swipes");
      return;
    }

    const isTabScreen = screen === "Feed" || screen === "Create" || screen === "Chats" || screen === "ProfileView";
    const params = screen === "Feed" && resolvedActiveKey === "Feed"
      ? { reloadNonce: Date.now() }
      : undefined;

    if (isTabScreen && Array.isArray(routeNames) && routeNames.includes("MainApp")) {
      navigation.navigate("MainApp", { screen, params });
      return;
    }

    if (Array.isArray(routeNames) && routeNames.includes(screen)) {
      navigation.navigate(screen, params);
      return;
    }

    if (Array.isArray(routeNames) && routeNames.includes("MainApp")) {
      navigation.navigate("MainApp", { screen, params });
      return;
    }

    navigation.getParent?.()?.navigate("MainApp", { screen, params });
  }, [navigation, resolvedActiveKey, routeNames]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Math.abs(gestureState.dx) > 18 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2,
        onPanResponderRelease: (_event, gestureState) => {
          if (swipeLockRef.current) {
            swipeLockRef.current = false;
            return;
          }

          const { dx, dy } = gestureState;
          if (Math.abs(dx) < 28 || Math.abs(dx) < Math.abs(dy) * 1.2) {
            return;
          }

          const direction = dx < 0 ? 1 : -1;
          const nextItem = bottomNavItems[activeIndex + direction];
          if (nextItem) {
            navigateToItem(nextItem.screen);
          }
        },
      }),
    [activeIndex, navigateToItem],
  );

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View
        {...panResponder.panHandlers}
        style={[
          styles.surface,
          {
            height: dockHeight,
            paddingBottom: bottomPadding,
            backgroundColor: surfaceColor,
            borderTopColor: isDarkMode ? "rgba(111,176,255,0.12)" : colors.border,
            shadowColor: isDarkMode ? "#000" : colors.text,
            shadowOpacity: isDarkMode ? 0.42 : 0.08,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: -4 },
            elevation: 16,
          },
        ]}
      >
        {bottomNavItems.map((item) => {
          const isActive = resolvedActiveKey === item.key;
          const tintColor = isActive ? activeTintColor : colors.tabInactive || colors.mutedText;
          const activeBackgroundColor = isDarkMode ? "rgba(17,131,255,0.16)" : alpha(activeTintColor, "14");

          return (
            <TouchableOpacity
              key={item.key}
              activeOpacity={0.85}
              style={[
                styles.item,
                {
                  backgroundColor: isActive ? activeBackgroundColor : "transparent",
                  borderColor: isActive ? alpha(activeTintColor, isDarkMode ? "56" : "24") : "transparent",
                },
              ]}
              onPress={() => {
                swipeLockRef.current = true;
                navigateToItem(item.screen);
              }}
            >
              {item.key === "ProfileView" ? (
                <ProfileTabAvatar focused={isActive} color={tintColor} size={22} />
              ) : (
                <Icon name={isActive ? item.icons.active : item.icons.inactive} size={22} color={tintColor} />
              )}
              <Text
                style={[styles.label, { color: tintColor, fontSize: labelFontSize }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 60,
    elevation: 60,
  },
  surface: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: "visible",
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
    paddingTop: 5,
    paddingBottom: 2,
    paddingHorizontal: 2,
    marginHorizontal: 2,
    marginTop: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  label: {
    marginTop: 1,
    width: "100%",
    textAlign: "center",
    lineHeight: 10,
    fontFamily: appFonts.semibold,
    fontWeight: "700",
  },
});

export default AppBottomDock;
