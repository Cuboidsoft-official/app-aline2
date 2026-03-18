import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import LoginScreen from './src/screens/LoginScreen';
import SplashScreen from './src/screens/SplashScreen';
import SignupScreen from './src/screens/SignupScreen';
import OtpVerifyScreen from './src/screens/OtpVerifyScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import FeedScreen from './src/screens/FeedScreen';
import ProfileView from './src/screens/ProfileView';
import ProfilePreviewScreen from './src/screens/ProfilePreviewScreen';
import NotificationScreen from './src/screens/NotificationScreen';
import FollowersFollowingScreen from './src/screens/FollowersFollowingScreen';
import CreatePostScreen from './src/screens/CreatePostScreen';
import ChatScreen from './src/screens/ChatScreen';
import ChatDetailsScreen from './src/screens/ChatDetailsScreen';
import AllChatsScreen from './src/screens/AllChatsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import BlockedUsersScreen from './src/screens/BlockedUsersScreen';
import NotificationSettingsScreen from './src/screens/NotificationSettingsScreen';
import DeleteAccountScreen from './src/screens/DeleteAccountScreen';
import SellerRegistration from './src/screens/SellerRegistration';
import SellerDashboardScreen from './src/screens/SellerDashboardScreen';
import AddServiceScreen from './src/screens/AddServiceScreen';
import SellerSettingsScreen from './src/screens/SellerSettingsScreen';
import WalletScreen from './src/screens/WalletScreen';
import HowToEarnScreen from './src/screens/HowToEarnScreen';
import EditServiceScreen from './src/screens/EditServiceScreen';
import SellerPreviewScreen from './src/screens/SellerPreviewScreen';

import BottomTabs from './src/navigation/BottomTabs';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>

        <Stack.Navigator
          initialRouteName="Splash"
          screenOptions={{ headerShown: false }}
        >

          {/* Splash First */}
          <Stack.Screen name="Splash" component={SplashScreen} />

          {/* Auth Screens */}
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
          <Stack.Screen name="OtpVerify" component={OtpVerifyScreen} />

          {/* Main App */}
          <Stack.Screen name="MainApp" component={BottomTabs} />

          {/* Other Screens */}
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="Feed" component={FeedScreen} />
          <Stack.Screen name="ProfileView" component={ProfileView} />
          <Stack.Screen name="NotificationScreen" component={NotificationScreen} />
          <Stack.Screen name="CreatePostScreen" component={CreatePostScreen} />
          <Stack.Screen name="ProfilePreviewScreen" component={ProfilePreviewScreen} />
          <Stack.Screen name="FollowersFollowingScreen" component={FollowersFollowingScreen} />
          <Stack.Screen name="ChatScreen" component={ChatScreen} />
          <Stack.Screen name="ChatDetailsScreen" component={ChatDetailsScreen} />
          <Stack.Screen name="AllChatsScreen" component={AllChatsScreen} />
          <Stack.Screen name="SettingsScreen" component={SettingsScreen} />
          <Stack.Screen name="BlockedUsersScreen" component={BlockedUsersScreen} />
          <Stack.Screen name="NotificationSettingsScreen" component={NotificationSettingsScreen} />
          <Stack.Screen name="DeleteAccountScreen" component={DeleteAccountScreen} />
          <Stack.Screen name="SellerRegistration" component={SellerRegistration} />
          <Stack.Screen name="SellerDashboardScreen" component={SellerDashboardScreen} />
          <Stack.Screen name="AddServiceScreen" component={AddServiceScreen} />
          <Stack.Screen name="SellerSettingsScreen" component={SellerSettingsScreen} />
          <Stack.Screen name="WalletScreen" component={WalletScreen} />
          <Stack.Screen name="HowToEarnScreen" component={HowToEarnScreen} />
          <Stack.Screen name="EditServiceScreen" component={EditServiceScreen} />
          <Stack.Screen name="SellerPreviewScreen" component={SellerPreviewScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}