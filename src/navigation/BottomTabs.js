import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import FeedScreen from "../screens/FeedScreen";
import ProfileView from "../screens/ProfileView";
import CreatePostScreen from "../screens/CreatePostScreen";
import AllChatsScreen from "../screens/AllChatsScreen";
import AppBottomDock from "../components/AppBottomDock";

const Tab = createBottomTabNavigator();
const SwipesTabPlaceholder = () => null;

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
      <Tab.Screen name="Create" component={CreatePostScreen} options={{ unmountOnBlur: true }} />
      <Tab.Screen name="Chats" component={AllChatsScreen} />
      <Tab.Screen name="ProfileView" component={ProfileView} />
    </Tab.Navigator>
  );
}
