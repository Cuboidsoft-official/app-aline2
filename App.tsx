import React, { useEffect } from 'react';
import { Alert } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Snackbar } from 'react-native-snackbar';

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
import AccountCenterScreen from './src/screens/AccountCenterScreen';
import BlockedUsersScreen from './src/screens/BlockedUsersScreen';
import NotificationSettingsScreen from './src/screens/NotificationSettingsScreen';
import CommentControlsScreen from './src/screens/CommentControlsScreen';
import TagsMentionsScreen from './src/screens/TagsMentionsScreen';
import DeleteAccountScreen from './src/screens/DeleteAccountScreen';
import HelpSupportScreen from './src/screens/HelpSupportScreen';
import PrivacyPolicyScreen from './src/screens/PrivacyPolicyScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
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
import PostArchiveScreen from './src/screens/social/PostArchiveScreen';
import SavedPostsScreen from './src/screens/social/SavedPostsScreen';
import PostCommentsScreen from './src/screens/social/PostCommentsScreen';
import SwipeCommentsScreen from './src/screens/social/SwipeCommentsScreen';
import StoryInsightsScreen from './src/screens/social/StoryInsightsScreen';
import ContentActionsScreen from './src/screens/social/ContentActionsScreen';
import StoryRepliesScreen from './src/screens/social/StoryRepliesScreen';
import CommentThreadScreen from './src/screens/social/CommentThreadScreen';
import SearchScreen from './src/screens/SearchScreen';
import HashtagResultsScreen from './src/screens/HashtagResultsScreen';
import CloseFriendsScreen from './src/screens/CloseFriendsScreen';
import GroupDetailsScreen from './src/screens/GroupDetailsScreen';
import CallScreen from './src/screens/CallScreen';

import BottomTabs from './src/navigation/BottomTabs';
import { callingDisabledMessage, productFlags } from './src/config/productFlags';
import { AppThemeProvider, useAppTheme } from './src/theme/AppThemeContext';
import { connectSocket, disconnectSocket, socket } from './src/socket';
import { getStoredToken, setSessionInvalidationHandler, subscribeSessionChanges } from './src/utils/authSession';
import { registerPushToken, setupNotificationListeners } from './src/utils/pushRegistration';

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();
const rootStyle = { flex: 1 } as const;
const transparentSheetOptions = {
  presentation: 'transparentModal' as const,
  animation: 'fade' as const,
  contentStyle: { backgroundColor: 'transparent' },
};

function AppNavigator() {
  const { navigationTheme } = useAppTheme();

  const openRealtimeNotificationTarget = (payload: any) => {
    if (!navigationRef.isReady()) {
      return;
    }

    const type = String(payload?.type || '').trim();
    const senderId = String(payload?.sender?._id || payload?.sender?.id || payload?.senderId || '').trim();
    const postId = String(payload?.post?._id || payload?.post?.id || payload?.postId || '').trim();
    const storyId = String(payload?.story?._id || payload?.story?.id || payload?.storyId || '').trim();

    switch (type) {
      case 'follow':
        if (senderId) {
          (navigationRef as any).navigate('ProfileView', { userId: senderId });
          return;
        }
        break;
      case 'like':
      case 'comment':
      case 'comment_reply':
      case 'mention_post':
      case 'tag_post':
      case 'post_share':
        if (postId) {
          (navigationRef as any).navigate('PostDetail', { postId });
          return;
        }
        break;
      case 'story_reply':
      case 'story_view':
      case 'mention_story':
      case 'tag_story':
        if (storyId) {
          (navigationRef as any).navigate('StoryViewer', { storyId });
          return;
        }
        break;
      case 'service_request':
      case 'service_request_update':
        (navigationRef as any).navigate('ServiceRequestsScreen', { mode: 'seller' });
        return;
      default:
        break;
    }

    (navigationRef as any).navigate('NotificationScreen');
  };

  const buildRealtimeNotificationText = (payload: any) => {
    const senderName =
      String(payload?.sender?.name || payload?.sender?.username || '').trim()
      || 'Someone';
    const type = String(payload?.type || '').trim();

    switch (type) {
      case 'follow':
        return `${senderName} started following you`;
      case 'like':
        return `${senderName} liked your post`;
      case 'comment':
        return `${senderName} commented on your post`;
      case 'comment_reply':
        return `${senderName} replied to your comment`;
      case 'story_reply':
        return `${senderName} replied to your story`;
      case 'story_view':
        return `${senderName} viewed your story`;
      case 'mention_post':
      case 'mention_story':
        return `${senderName} mentioned you`;
      case 'tag_post':
      case 'tag_story':
        return `${senderName} tagged you`;
      case 'service_request':
        return `${senderName} sent a service request`;
      case 'service_request_update':
        return `${senderName} updated a service request`;
      default:
        return `${senderName} sent you a notification`;
    }
  };

  const showRealtimeBanner = (text: string, onPress?: () => void) => {
    Snackbar.show({
      text,
      duration: Snackbar.LENGTH_LONG,
      backgroundColor: '#111827',
      textColor: '#ffffff',
      action: onPress
        ? {
            text: 'OPEN',
            textColor: '#facc15',
            onPress,
          }
        : undefined,
    });
  };

  useEffect(() => {
    return setSessionInvalidationHandler(() => {
      if (navigationRef.isReady()) {
        navigationRef.resetRoot({
          index: 0,
          routes: [{ name: "Login" as never }],
        });
      }
    });
  }, []);

  useEffect(() => {
    const syncPushRegistration = async () => {
      const token = await getStoredToken();

      if (!token) {
        return;
      }

      await registerPushToken();
    };

    syncPushRegistration().catch((error) => {
      console.log("global push registration error", error);
    });

    const unsubscribe = subscribeSessionChanges(() => {
      syncPushRegistration().catch((error) => {
        console.log("session push registration error", error);
      });
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const syncSocketConnection = () => {
      connectSocket().catch((error) => {
        console.log("global socket connect error", error);
      });
    };

    syncSocketConnection();
    const unsubscribe = subscribeSessionChanges(syncSocketConnection);

    return () => {
      unsubscribe();
      disconnectSocket();
    };
  }, []);

  // Push notification tap handler
  useEffect(() => {
    const cleanup = setupNotificationListeners(navigationRef);
    return cleanup;
  }, []);

  useEffect(() => {
    const handleIncomingCall = (payload: any) => {
      if (!productFlags.callingInConsumerApp) {
        Alert.alert("Coming soon", callingDisabledMessage);
        return;
      }

      const nextCallSession = payload?.callSession;
      const nextCallSessionId = String(nextCallSession?._id || "");

      if (!nextCallSessionId || !navigationRef.isReady()) {
        return;
      }

      const currentRoute: any = navigationRef.getCurrentRoute();
      if (currentRoute?.name === "CallScreen" && currentRoute?.params?.callSessionId === nextCallSessionId) {
        return;
      }

      (navigationRef as any).navigate("CallScreen", {
        callSessionId: nextCallSessionId,
        mode: "incoming",
        initialCallSession: nextCallSession,
        initialIceServers: payload?.iceServers || [],
        callRuntime: payload?.callRuntime || null,
        title:
          nextCallSession?.conversation?.conversationType === "group"
            ? nextCallSession?.conversation?.groupName || "Incoming group call"
            : nextCallSession?.otherParticipant?.name || nextCallSession?.otherParticipant?.username || "Incoming call",
        avatarUrl:
          nextCallSession?.conversation?.conversationType === "group"
            ? nextCallSession?.conversation?.groupAvatar || ""
            : nextCallSession?.otherParticipant?.profilePic || "",
      });
    };

    socket.on("call:incoming", handleIncomingCall);

    return () => {
      socket.off("call:incoming", handleIncomingCall);
    };
  }, []);

  useEffect(() => {
    const handleRealtimeNotification = (payload: any) => {
      if (!navigationRef.isReady()) {
        return;
      }

      const currentRoute: any = navigationRef.getCurrentRoute();
      if (currentRoute?.name === 'NotificationScreen') {
        return;
      }

      showRealtimeBanner(
        buildRealtimeNotificationText(payload),
        () => openRealtimeNotificationTarget(payload),
      );
    };

    const handleRealtimeMessage = (payload: any) => {
      if (!navigationRef.isReady()) {
        return;
      }

      const conversationId = String(payload?.conversation?._id || payload?.conversation || payload?.conversationId || '').trim();
      if (!conversationId) {
        return;
      }

      const currentRoute: any = navigationRef.getCurrentRoute();
      const activeConversationId = String(currentRoute?.params?.conversationId || '').trim();

      if (
        (currentRoute?.name === 'ChatScreen' || currentRoute?.name === 'SellerChatScreen')
        && activeConversationId === conversationId
      ) {
        return;
      }

      const senderName =
        String(payload?.sender?.name || payload?.sender?.username || '').trim()
        || 'New message';
      const body =
        String(payload?.text || '').trim()
        || (payload?.messageType ? `Sent a ${String(payload.messageType).trim()}` : 'Open chat');

      showRealtimeBanner(
        `${senderName}: ${body}`,
        () => {
          (navigationRef as any).navigate('ChatScreen', { conversationId });
        },
      );
    };

    socket.on('receiveNotification', handleRealtimeNotification);
    socket.on('receiveMessage', handleRealtimeMessage);

    return () => {
      socket.off('receiveNotification', handleRealtimeNotification);
      socket.off('receiveMessage', handleRealtimeMessage);
    };
  }, []);

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
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
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="ForgotPasswordScreen" component={ForgotPasswordScreen} />

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
        <Stack.Screen name="GroupDetailsScreen" component={GroupDetailsScreen} />
        <Stack.Screen name="CallScreen" component={CallScreen} />
        <Stack.Screen name="SettingsScreen" component={SettingsScreen} />
        <Stack.Screen name="AccountCenterScreen" component={AccountCenterScreen} />
        <Stack.Screen name="BlockedUsersScreen" component={BlockedUsersScreen} />
        <Stack.Screen name="NotificationSettingsScreen" component={NotificationSettingsScreen} />
        <Stack.Screen name="CommentControlsScreen" component={CommentControlsScreen} />
        <Stack.Screen name="TagsMentionsScreen" component={TagsMentionsScreen} />
        <Stack.Screen name="CloseFriendsScreen" component={CloseFriendsScreen} />
        <Stack.Screen name="DeleteAccountScreen" component={DeleteAccountScreen} />
        <Stack.Screen name="HelpSupportScreen" component={HelpSupportScreen} />
        <Stack.Screen name="PrivacyPolicyScreen" component={PrivacyPolicyScreen} />
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
        <Stack.Screen name="PostArchive" component={PostArchiveScreen} />
        <Stack.Screen name="SavedPosts" component={SavedPostsScreen} />
        <Stack.Screen name="PostComments" component={PostCommentsScreen} options={transparentSheetOptions} />
        <Stack.Screen name="SwipeComments" component={SwipeCommentsScreen} options={transparentSheetOptions} />
        <Stack.Screen name="StoryInsights" component={StoryInsightsScreen} options={transparentSheetOptions} />
        <Stack.Screen name="StoryReplies" component={StoryRepliesScreen} options={transparentSheetOptions} />
        <Stack.Screen name="CommentThread" component={CommentThreadScreen} options={transparentSheetOptions} />
        <Stack.Screen name="ContentActions" component={ContentActionsScreen} options={transparentSheetOptions} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={rootStyle}>
      <AppThemeProvider>
        <AppNavigator />
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}
