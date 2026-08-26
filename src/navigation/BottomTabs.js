import React, { useCallback, useEffect, useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import FeedScreen from "../screens/FeedScreen";
import ProfileView from "../screens/ProfileView";
import CreatePostScreen from "../screens/CreatePostScreen";
import AllChatsScreen from "../screens/AllChatsScreen";
import AppBottomDock from "../components/AppBottomDock";
import { connectSocket, socket } from "../socket";
import { fetchChatConversations } from "../utils/chatApi";


const Tab = createBottomTabNavigator();
const SwipesTabPlaceholder = () => null;

export default function BottomTabs() {
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const loadChatUnreadCount = useCallback(async () => {
    try {
      const response = await fetchChatConversations();
      console.log(
        "CHAT API RESPONSE:",
        JSON.stringify(response, null, 2)
      );
      const conversations =
        (Array.isArray(response?.conversations)
          ? response.conversations
          : Array.isArray(response?.data?.conversations)
            ? response.data.conversations
            : Array.isArray(response?.data)
              ? response.data
              : []) || [];

      const total = conversations.reduce(
        (sum, conversation) =>
          sum + Number(conversation?.unreadCount || 0),
        0
      );

      setChatUnreadCount(total);
    } catch (error) {
      console.log("BottomTabs chat unread error:", error);
    }
  }, []);
  useEffect(() => {
    loadChatUnreadCount();

    connectSocket().catch((error) => {
      console.log("BottomTabs socket connection error:", error);
    });

    const handleReceiveMessage = () => {
      loadChatUnreadCount();
    };

    const handleMessageSeen = () => {
      loadChatUnreadCount();
    };

    socket.on("receiveMessage", handleReceiveMessage);
    socket.on("messageSeen", handleMessageSeen);

    return () => {
      socket.off("receiveMessage", handleReceiveMessage);
      socket.off("messageSeen", handleMessageSeen);
    };
  }, [loadChatUnreadCount]);
  return (
    <Tab.Navigator
      detachInactiveScreens={true}
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        animation: "fade",
      }}
      tabBar={({ navigation, state }) => {
        const activeRoute = state.routes[state.index];
        return (
          <AppBottomDock
            navigation={navigation}
            activeRouteName={activeRoute?.name}
            chatUnreadCount={chatUnreadCount}
          />
        );
      }}
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
