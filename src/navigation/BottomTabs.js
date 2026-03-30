import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import Icon from "react-native-vector-icons/Ionicons";
import { Platform, TouchableNativeFeedback, View, StyleSheet } from "react-native";

import FeedScreen from "../screens/FeedScreen";
import ProfileView from "../screens/ProfileView";
import CreatePostScreen from "../screens/CreatePostScreen";
import AllChatsScreen from "../screens/AllChatsScreen";
import SwipesScreen from "../screens/social/SwipesScreen";
import { useAppTheme } from "../theme/AppThemeContext";

const Tab = createBottomTabNavigator();

const tabIconNameByRoute = {
  Feed: { active: "home", inactive: "home-outline" },
  Swipes: { active: "play-circle", inactive: "play-circle-outline" },
  Create: { active: "add-circle", inactive: "add-circle-outline" },
  Chats: { active: "chatbubbles", inactive: "chatbubbles-outline" },
  ProfileView: { active: "person", inactive: "person-outline" },
};

const renderTabIcon = (routeName, focused, color) => {
  const config = tabIconNameByRoute[routeName] || tabIconNameByRoute.Feed;
  return <Icon name={focused ? config.active : config.inactive} size={26} color={color} />;
};

function TabBarButton(props) {
  if (Platform.OS === "android") {
    return (
      <TouchableNativeFeedback
        {...props}
        background={TouchableNativeFeedback.Ripple("rgba(123,63,228,0.18)", true, 25)}
        useForeground
      >
        <View style={styles.tabButtonContainer}>{props.children}</View>
      </TouchableNativeFeedback>
    );
  }

  return <View style={styles.tabButtonContainer}>{props.children}</View>;
}

export default function BottomTabs() {
  const { colors } = useAppTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarIcon: ({ focused, color }) => renderTabIcon(route.name, focused, color),
        tabBarButton: TabBarButton,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        sceneStyle: {
          backgroundColor: colors.background,
        },
      })}
    >
      <Tab.Screen name="Feed" component={FeedScreen} />
      <Tab.Screen name="Swipes" component={SwipesScreen} />
      <Tab.Screen name="Create" component={CreatePostScreen} />
      <Tab.Screen name="Chats" component={AllChatsScreen} />
      <Tab.Screen name="ProfileView" component={ProfileView} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabButtonContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 5,
  },
});
