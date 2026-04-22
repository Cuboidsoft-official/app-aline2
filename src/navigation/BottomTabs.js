import React, { useMemo } from "react";
import { PanResponder, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import FeedScreen from "../screens/FeedScreen";
import ProfileView from "../screens/ProfileView";
import CreatePostScreen from "../screens/CreatePostScreen";
import AllChatsScreen from "../screens/AllChatsScreen";
import AppBottomDock from "../components/AppBottomDock";

const Tab = createBottomTabNavigator();
const SwipesTabPlaceholder = () => null;
const TAB_SEQUENCE = ["Feed", "SwipesLauncher", "Create", "Chats", "ProfileView"];

function BottomTabSwipeWrapper({ navigation, activeRouteName, children }) {
  const activeIndex = useMemo(
    () => Math.max(0, TAB_SEQUENCE.findIndex((routeName) => routeName === activeRouteName)),
    [activeRouteName],
  );

  const navigateToTab = (routeName) => {
    if (routeName === "SwipesLauncher") {
      navigation.getParent?.()?.navigate("Swipes");
      return;
    }

    if (typeof navigation.jumpTo === "function") {
      navigation.jumpTo(routeName);
      return;
    }

    navigation.navigate(routeName);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Math.abs(gestureState.dx) > 36 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.35,
        onPanResponderRelease: (_event, gestureState) => {
          const { dx, dy } = gestureState;
          if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.35) {
            return;
          }

          const direction = dx < 0 ? 1 : -1;
          const nextRouteName = TAB_SEQUENCE[activeIndex + direction];
          if (nextRouteName) {
            navigateToTab(nextRouteName);
          }
        },
      }),
    [activeIndex],
  );

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      {children}
    </View>
  );
}

const wrapWithBottomTabSwipe = (Component, activeRouteName) =>
  function BottomTabWrappedScreen(props) {
    return (
      <BottomTabSwipeWrapper navigation={props.navigation} activeRouteName={activeRouteName}>
        <Component {...props} />
      </BottomTabSwipeWrapper>
    );
  };

const FeedTabScreen = wrapWithBottomTabSwipe(FeedScreen, "Feed");
const CreateTabScreen = wrapWithBottomTabSwipe(CreatePostScreen, "Create");
const ChatsTabScreen = wrapWithBottomTabSwipe(AllChatsScreen, "Chats");
const ProfileTabScreen = wrapWithBottomTabSwipe(ProfileView, "ProfileView");

export default function BottomTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        animation: "fade",
      }}
      tabBar={({ navigation, state }) => (
        <AppBottomDock
          navigation={navigation}
          activeRouteName={state.routeNames[state.index]}
        />
      )}
    >
      <Tab.Screen name="Feed" component={FeedTabScreen} />
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
      <Tab.Screen name="Create" component={CreateTabScreen} />
      <Tab.Screen name="Chats" component={ChatsTabScreen} />
      <Tab.Screen name="ProfileView" component={ProfileTabScreen} />
    </Tab.Navigator>
  );
}
