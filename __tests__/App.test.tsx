/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('../src/screens/LoginScreen', () => () => null);
jest.mock('../src/screens/SplashScreen', () => () => null);
jest.mock('../src/screens/SignupScreen', () => () => null);
jest.mock('../src/screens/OtpVerifyScreen', () => () => null);
jest.mock('../src/screens/ProfileScreen', () => () => null);
jest.mock('../src/screens/FeedScreen', () => () => null);
jest.mock('../src/screens/ProfileView', () => () => null);
jest.mock('../src/screens/ProfilePreviewScreen', () => () => null);
jest.mock('../src/screens/NotificationScreen', () => () => null);
jest.mock('../src/screens/FollowersFollowingScreen', () => () => null);
jest.mock('../src/screens/CreatePostScreen', () => () => null);
jest.mock('../src/screens/ChatScreen', () => () => null);
jest.mock('../src/screens/ChatDetailsScreen', () => () => null);
jest.mock('../src/screens/AllChatsScreen', () => () => null);
jest.mock('../src/screens/CallScreen', () => () => null);
jest.mock('../src/screens/SettingsScreen', () => () => null);
jest.mock('../src/screens/AccountCenterScreen', () => () => null);
jest.mock('../src/screens/BlockedUsersScreen', () => () => null);
jest.mock('../src/screens/NotificationSettingsScreen', () => () => null);
jest.mock('../src/screens/CommentControlsScreen', () => () => null);
jest.mock('../src/screens/TagsMentionsScreen', () => () => null);
jest.mock('../src/screens/DeleteAccountScreen', () => () => null);
jest.mock('../src/screens/HelpSupportScreen', () => () => null);
jest.mock('../src/screens/PrivacyPolicyScreen', () => () => null);
jest.mock('../src/screens/ReleaseNotesScreen', () => () => null);
jest.mock('../src/screens/ForgotPasswordScreen', () => () => null);
jest.mock('../src/screens/SellerRegistration', () => () => null);
jest.mock('../src/screens/SellerDashboardScreen', () => () => null);
jest.mock('../src/screens/AddServiceScreen', () => () => null);
jest.mock('../src/screens/SellerSettingsScreen', () => () => null);
jest.mock('../src/screens/WalletScreen', () => () => null);
jest.mock('../src/screens/HowToEarnScreen', () => () => null);
jest.mock('../src/screens/EditServiceScreen', () => () => null);
jest.mock('../src/screens/SellerPreviewScreen', () => () => null);
jest.mock('../src/screens/SellerChatScreen', () => () => null);
jest.mock('../src/screens/SellerDetailsScreen', () => () => null);
jest.mock('../src/screens/ServiceRequestsScreen', () => () => null);
jest.mock('../src/screens/LiveStreamsScreen', () => () => null);
jest.mock('../src/screens/LiveStreamScreen', () => () => null);
jest.mock('../src/screens/SearchScreen', () => () => null);
jest.mock('../src/screens/HashtagResultsScreen', () => () => null);
jest.mock('../src/screens/social/SwipesScreen.tsx', () => () => null);
jest.mock('../src/screens/social/StoryViewerScreen.tsx', () => () => null);
jest.mock('../src/screens/social/PostDetailScreen.tsx', () => () => null);
jest.mock('../src/screens/social/StoryArchiveScreen.tsx', () => () => null);
jest.mock('../src/screens/social/PostArchiveScreen.tsx', () => () => null);
jest.mock('../src/screens/social/SavedPostsScreen.tsx', () => () => null);
jest.mock('../src/screens/social/PostCommentsScreen.tsx', () => () => null);
jest.mock('../src/screens/social/SwipeCommentsScreen.tsx', () => () => null);
jest.mock('../src/screens/social/StoryInsightsScreen.tsx', () => () => null);
jest.mock('../src/screens/social/ContentActionsScreen.tsx', () => () => null);
jest.mock('../src/screens/social/StoryRepliesScreen.tsx', () => () => null);
jest.mock('../src/screens/social/CommentThreadScreen.tsx', () => () => null);
jest.mock('../src/screens/CloseFriendsScreen', () => () => null);
jest.mock('../src/screens/GroupDetailsScreen', () => () => null);
jest.mock('../src/navigation/BottomTabs', () => () => null);

import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
