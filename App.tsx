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
import SellerChatScreen from './src/screens/SellerChatScreen';
import SellerDetailsScreen from './src/screens/SellerDetailsScreen';
import ServiceRequestsScreen from './src/screens/ServiceRequestsScreen';
import SwipesScreen from './src/screens/social/SwipesScreen';
import StoryViewerScreen from './src/screens/social/StoryViewerScreen';
import PostDetailScreen from './src/screens/social/PostDetailScreen';
import StoryArchiveScreen from './src/screens/social/StoryArchiveScreen';
import PostCommentsScreen from './src/screens/social/PostCommentsScreen';
import SwipeCommentsScreen from './src/screens/social/SwipeCommentsScreen';
import StoryInsightsScreen from './src/screens/social/StoryInsightsScreen';
import ContentActionsScreen from './src/screens/social/ContentActionsScreen';
import StoryRepliesScreen from './src/screens/social/StoryRepliesScreen';
import CommentThreadScreen from './src/screens/social/CommentThreadScreen';
import SearchScreen from './src/screens/SearchScreen';
import HashtagResultsScreen from './src/screens/HashtagResultsScreen';

import BottomTabs from './src/navigation/BottomTabs';

const Stack = createNativeStackNavigator();
const rootStyle = { flex: 1 } as const;
const transparentSheetOptions = {
  presentation: 'transparentModal' as const,
  animation: 'fade' as const,
  contentStyle: { backgroundColor: 'transparent' },
};

export default function App() {
  return (
    <GestureHandlerRootView style={rootStyle}>
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
          <Stack.Screen name="Search" component={SearchScreen} />
          <Stack.Screen name="HashtagResultsScreen" component={HashtagResultsScreen} />
          <Stack.Screen name="SellerRegistration" component={SellerRegistration} />
          <Stack.Screen name="SellerDashboardScreen" component={SellerDashboardScreen} />
          <Stack.Screen name="AddServiceScreen" component={AddServiceScreen} />
          <Stack.Screen name="SellerSettingsScreen" component={SellerSettingsScreen} />
          <Stack.Screen name="WalletScreen" component={WalletScreen} />
          <Stack.Screen name="HowToEarnScreen" component={HowToEarnScreen} />
          <Stack.Screen name="EditServiceScreen" component={EditServiceScreen} />
          <Stack.Screen name="SellerPreviewScreen" component={SellerPreviewScreen} />
          <Stack.Screen name="SellerChatScreen" component={SellerChatScreen} />
          <Stack.Screen name="SellerDetailsScreen" component={SellerDetailsScreen} />
          <Stack.Screen name="ServiceRequestsScreen" component={ServiceRequestsScreen} />
          <Stack.Screen name="Swipes" component={SwipesScreen} />
          <Stack.Screen name="StoryViewer" component={StoryViewerScreen} />
          <Stack.Screen name="PostDetail" component={PostDetailScreen} />
          <Stack.Screen name="StoryArchive" component={StoryArchiveScreen} />
          <Stack.Screen name="PostComments" component={PostCommentsScreen} options={transparentSheetOptions} />
          <Stack.Screen name="SwipeComments" component={SwipeCommentsScreen} options={transparentSheetOptions} />
          <Stack.Screen name="StoryInsights" component={StoryInsightsScreen} options={transparentSheetOptions} />
          <Stack.Screen name="StoryReplies" component={StoryRepliesScreen} options={transparentSheetOptions} />
          <Stack.Screen name="CommentThread" component={CommentThreadScreen} options={transparentSheetOptions} />
          <Stack.Screen name="ContentActions" component={ContentActionsScreen} options={transparentSheetOptions} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
