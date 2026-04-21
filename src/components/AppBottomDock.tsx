import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { alpha, appFonts } from "../theme/designSystem";
import { useAppTheme } from "../theme/AppThemeContext";
import ProfileTabAvatar from "./ProfileTabAvatar";

export const APP_BOTTOM_DOCK_BASE_HEIGHT = Platform.OS === "ios" ? 78 : 70;

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
  const bottomPadding = Math.max(insets.bottom, Platform.OS === "ios" ? 14 : 10);
  const surfaceColor = isDarkMode ? colors.surface : colors.card;
  const activeTintColor = colors.primary;
  const labelFontSize = Platform.OS === "ios" ? 11 : 10.5;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View
        style={[
          styles.surface,
          {
            height: APP_BOTTOM_DOCK_BASE_HEIGHT + bottomPadding,
            paddingBottom: bottomPadding,
            backgroundColor: surfaceColor,
            borderTopColor: isDarkMode ? alpha(colors.border, "CC") : colors.border,
            shadowColor: isDarkMode ? "#000" : colors.text,
            shadowOpacity: isDarkMode ? 0.36 : 0.08,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: -4 },
          },
        ]}
      >
        {bottomNavItems.map((item) => {
          const isActive = activeRouteName === item.key;
          const tintColor = isActive ? activeTintColor : colors.tabInactive || colors.mutedText;
          const activeBackgroundColor = isDarkMode ? alpha(activeTintColor, "22") : alpha(activeTintColor, "14");

          return (
            <TouchableOpacity
              key={item.key}
              activeOpacity={0.85}
              style={[
                styles.item,
                {
                  backgroundColor: isActive ? activeBackgroundColor : "transparent",
                  borderColor: isActive ? alpha(activeTintColor, isDarkMode ? "42" : "24") : "transparent",
                },
              ]}
              onPress={() => {
                if (item.screen === "Swipes") {
                  navigation.navigate("Swipes");
                  return;
                }

                navigation.navigate("MainApp", { screen: item.screen });
              }}
            >
              {item.key === "ProfileView" ? (
                <ProfileTabAvatar focused={isActive} color={tintColor} size={24} />
              ) : (
                <Icon name={isActive ? item.icons.active : item.icons.inactive} size={24} color={tintColor} />
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
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 60,
  },
  surface: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
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
    paddingTop: 7,
    paddingHorizontal: 4,
    marginHorizontal: 5,
    marginTop: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  label: {
    marginTop: 3,
    width: "100%",
    textAlign: "center",
    lineHeight: 14,
    fontFamily: appFonts.semibold,
    fontWeight: "700",
  },
});

export default AppBottomDock;
