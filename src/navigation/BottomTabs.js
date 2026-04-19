import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import Icon from "react-native-vector-icons/Ionicons";
import { Platform, TouchableNativeFeedback, View, StyleSheet } from "react-native";

import FeedScreen from "../screens/FeedScreen";
import ProfileView from "../screens/ProfileView";
import CreatePostScreen from "../screens/CreatePostScreen";
import AllChatsScreen from "../screens/AllChatsScreen";
import { useAppTheme } from "../theme/AppThemeContext";
import ProfileTabAvatar from "../components/ProfileTabAvatar";

const Tab = createBottomTabNavigator();
const TAB_RIPPLE_COLOR = "rgba(155,77,255,0.18)";
const SwipesTabPlaceholder = () => null;

const tabIconNameByRoute = {
  Feed: { active: "home", inactive: "home-outline", label: "Feed" },
  SwipesLauncher: { active: "play-circle", inactive: "play-circle-outline", label: "Swipes" },
  Create: { active: "add-circle", inactive: "add-circle-outline", label: "Create" },
  Chats: { active: "chatbubbles", inactive: "chatbubbles-outline", label: "Chats" },
  ProfileView: { active: "person", inactive: "person-outline", label: "Profile" },
};

const renderTabIcon = (routeName, focused, color) => {
  const config = tabIconNameByRoute[routeName] || tabIconNameByRoute.Feed;
  if (routeName === "ProfileView") {
    return <ProfileTabAvatar focused={focused} color={color} size={26} />;
  }
  return <Icon name={focused ? config.active : config.inactive} size={26} color={color} />;
};

function TabBarButton(props) {
  if (Platform.OS === "android") {
    return (
      <TouchableNativeFeedback
        {...props}
        background={TouchableNativeFeedback.Ripple(TAB_RIPPLE_COLOR, true, 25)}
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
  const activeTintColor = colors.primary;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: activeTintColor,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarIcon: ({ focused, color }) => renderTabIcon(route.name, focused, color),
        tabBarLabel: tabIconNameByRoute[route.name]?.label || route.name,
        tabBarButton: TabBarButton,
        tabBarLabelStyle: {
          fontSize: 13,
          fontWeight: "700",
          marginTop: 0,
        },
        tabBarItemStyle: {
          borderRadius: 0,
          marginHorizontal: 0,
        },
        tabBarStyle: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.card,
          borderTopColor: `${activeTintColor}26`,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderWidth: 0,
          borderColor: "transparent",
          borderRadius: 0,
          height: Platform.OS === "ios" ? 78 : 70,
          paddingTop: 8,
          paddingBottom: Platform.OS === "ios" ? 14 : 10,
          shadowColor: "transparent",
          shadowOpacity: 0,
          shadowRadius: 0,
          shadowOffset: { width: 0, height: 0 },
          elevation: 0,
        },
        sceneStyle: {
          backgroundColor: colors.background,
        },
      })}
    >
      <Tab.Screen name="Feed" component={FeedScreen} />
      <Tab.Screen
        name="SwipesLauncher"
        component={SwipesTabPlaceholder}
        listeners={({ navigation }) => ({
          tabPress: (event) => {
            event.preventDefault();
            navigation.getParent()?.navigate("Swipes");
          },
        })}
      />
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
    borderRadius: 0,
    paddingVertical: 8,
    overflow: "hidden",
  },
});
