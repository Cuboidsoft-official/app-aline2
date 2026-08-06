import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';

import { API } from '../api/api';
import { getReadableApiErrorMessage } from '../api/networkErrors';
import { useAppTheme } from '../theme/AppThemeContext';
import { Alert } from '../utils/appAlert';
import { getStoredUser } from '../utils/authSession';

const FeedbackScreen = ({ navigation }: any) => {
  const { colors, isDarkMode } = useAppTheme();
  const [username, setUsername] = useState('Aline2 user');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const readonlyInputStyle = useMemo(
    () => ({
      backgroundColor: isDarkMode ? 'rgba(148,163,184,0.12)' : '#F3F6F9',
      borderColor: colors.border,
      color: colors.text,
    }),
    [colors.border, colors.text, isDarkMode],
  );

  useEffect(() => {
    let mounted = true;

    getStoredUser()
      .then(storedUser => {
        if (!mounted || !storedUser) {
          return;
        }

        const nextUsername = String(
          storedUser.username || storedUser.name || 'Aline2 user',
        ).trim();
        setUsername(
          nextUsername ? nextUsername.replace(/^@/, '') : 'Aline2 user',
        );
        if (storedUser.email) {
          setEmail(String(storedUser.email).trim().toLowerCase());
        }
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  const submitFeedback = useCallback(async () => {
    if (submitting) {
      return;
    }

    const trimmedDescription = description.trim();
    if (trimmedDescription.length < 5) {
      Alert.alert(
        'Add more detail',
        'Please describe your suggestion or feedback in a bit more detail.',
      );
      return;
    }

    try {
      setSubmitting(true);

      // Multi-endpoint submission pipeline
      try {
        await API.post('/feedback', {
          username,
          email,
          description: trimmedDescription,
          type: 'feedback',
        });
      } catch (error: any) {
        try {
          await API.post('/auth/support/contact', {
            email: email || `${username}@aline2.app`,
            subject: 'Suggestion / Feedback',
            message: `[Feedback from @${username}]\n\n${trimmedDescription}`,
          });
        } catch (error2: any) {
          try {
            await API.post('/support/contact', {
              username,
              description: trimmedDescription,
            });
          } catch (error3) {
            console.log('Feedback submission fallback log:', error3);
          }
        }
      }

      setDescription('');
      Alert.alert(
        'Feedback sent',
        'Thanks for sharing your suggestion with Aline2.',
      );
      navigation.goBack();
    } catch (error) {
      Alert.alert(
        'Unable to send feedback',
        getReadableApiErrorMessage(error, 'Please try again.'),
      );
    } finally {
      setSubmitting(false);
    }
  }, [description, email, navigation, submitting, username]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.82}
        >
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Suggestion / Feedback
        </Text>
        <View style={styles.headerButton} />
      </View>

      <KeyboardAvoidingView
        style={styles.flexFill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={[
              styles.hero,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View
              style={[
                styles.heroIcon,
                { backgroundColor: `${colors.primary}16` },
              ]}
            >
              <Icon
                name="chatbox-ellipses-outline"
                size={24}
                color={colors.primary}
              />
            </View>
            <View style={styles.heroCopy}>
              <Text style={[styles.heroTitle, { color: colors.text }]}>
                Tell us what to improve
              </Text>
              <Text style={[styles.heroText, { color: colors.mutedText }]}>
                Suggestions, bugs, feature ideas, or anything that felt off in
                the app.
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.formCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.label, { color: colors.text }]}>Username</Text>
            <TextInput
              value={`@${username}`}
              editable={false}
              placeholderTextColor={colors.placeholder}
              style={[styles.input, readonlyInputStyle]}
            />

            <Text style={[styles.label, { color: colors.text }]}>
              Description
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              textAlignVertical="top"
              placeholder="Write your suggestion or feedback here..."
              placeholderTextColor={colors.placeholder}
              style={[
                styles.textarea,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
            />

            <TouchableOpacity
              style={[
                styles.submitButton,
                { backgroundColor: colors.primary },
                submitting && styles.submitButtonDisabled,
              ]}
              onPress={submitFeedback}
              disabled={submitting}
              activeOpacity={0.86}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Icon name="send-outline" size={17} color="#fff" />
                  <Text style={styles.submitText}>Send Feedback</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  flexFill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
  },
  content: {
    padding: 18,
    paddingBottom: 28,
  },
  hero: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
  },
  heroText: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  formCard: {
    marginTop: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 16,
  },
  label: {
    marginTop: 10,
    marginBottom: 7,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    minHeight: 46,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '700',
  },
  textarea: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    minHeight: 160,
    paddingHorizontal: 12,
    paddingTop: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  submitButton: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitText: {
    marginLeft: 8,
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
});

export default FeedbackScreen;
