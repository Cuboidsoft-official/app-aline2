import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";

import { askSupportAssistant, type AssistantHistoryEntry } from "../../utils/assistantApi";
import { getReadableApiErrorMessage } from "../../api/networkErrors";
import { useAppTheme } from "../../theme/AppThemeContext";

type AssistantTurn = AssistantHistoryEntry & {
  id: string;
};

type AISupportSheetProps = {
  visible: boolean;
  onClose: () => void;
  scope: string;
  scopeHint?: string;
  conversationSummary?: string;
  recentMessages?: string[];
  suggestedPrompts?: string[];
  autoPrompt?: string;
};

const buildTurnId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const defaultSuggestedPrompts = [
  "Mujhe next step batao",
  "Ye issue kaise fix karun?",
  "Seller flow explain karo",
];

const AISupportSheet = ({
  visible,
  onClose,
  scope,
  scopeHint,
  conversationSummary,
  recentMessages = [],
  suggestedPrompts = defaultSuggestedPrompts,
  autoPrompt,
}: AISupportSheetProps) => {
  const { colors, isDarkMode } = useAppTheme();
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const scrollRef = useRef<ScrollView | null>(null);
  const hasAutoPromptedRef = useRef(false);

  const subtitle = useMemo(() => {
    if (scopeHint) {
      return scopeHint;
    }

    return "Aline2 support ke liye apna question likho.";
  }, [scopeHint]);

  useEffect(() => {
    if (!visible) {
      hasAutoPromptedRef.current = false;
      return;
    }

    const timeout = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);

    return () => clearTimeout(timeout);
  }, [turns, visible]);

  useEffect(() => {
    if (!visible || hasAutoPromptedRef.current || loading || turns.length) {
      return;
    }

    hasAutoPromptedRef.current = true;
    submit(autoPrompt || `Is ${scope} screen me meri help karo aur jo user sabse pehle jaana chahe woh samjhao.`).catch(() => {});
  }, [autoPrompt, loading, scope, turns.length, visible]);

  const submit = async (overrideText?: string) => {
    const nextText = String(overrideText ?? draft).trim();
    if (!nextText || loading) {
      return;
    }

    const nextUserTurn: AssistantTurn = {
      id: buildTurnId(),
      role: "user",
      text: nextText,
    };

    setTurns((current) => [...current, nextUserTurn]);
    setDraft("");
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await askSupportAssistant({
        message: nextText,
        history: [...turns, nextUserTurn].map((entry) => ({
          role: entry.role,
          text: entry.text,
        })),
        scope,
        scopeHint,
        conversationSummary,
        recentMessages,
      });

      const reply = String(response?.reply || "").trim();
      if (!reply) {
        throw new Error(response?.message || "Assistant did not return a reply.");
      }

      setTurns((current) => [
        ...current,
        {
          id: buildTurnId(),
          role: "assistant",
          text: reply,
        },
      ]);
    } catch (error) {
      setErrorMessage(getReadableApiErrorMessage(error, "AI support abhi available nahi hai. Thodi der me dobara try karo."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.fullScreen, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          style={styles.fullScreen}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                shadowColor: isDarkMode ? "#000" : "#20103D",
              },
            ]}
          >
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <View style={styles.headerCopy}>
                <View style={[styles.badge, { backgroundColor: `${colors.primary}18` }]}>
                  <Icon name="sparkles-outline" size={14} color={colors.primary} />
                  <Text style={[styles.badgeText, { color: colors.primary }]}>Gemini Support</Text>
                </View>
                <Text style={[styles.title, { color: colors.text }]}>AI Assistant</Text>
                <Text style={[styles.subtitle, { color: colors.mutedText }]}>{subtitle}</Text>
              </View>

              <TouchableOpacity
                style={[styles.closeButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={onClose}
              >
                <Icon name="close-outline" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={scrollRef}
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.scopeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.scopeLabel, { color: colors.primary }]}>Current area</Text>
                <Text style={[styles.scopeTitle, { color: colors.text }]}>{scope}</Text>
                {conversationSummary ? (
                  <Text style={[styles.scopeText, { color: colors.mutedText }]}>{conversationSummary}</Text>
                ) : null}
              </View>

              {!turns.length ? (
                <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>Ask anything about this flow</Text>
                  <Text style={[styles.emptyText, { color: colors.mutedText }]}>
                    Chat, payments, seller onboarding, appointments, profile settings, ya support issue yahin se pooch sakte ho.
                  </Text>
                </View>
              ) : null}

              {suggestedPrompts.length ? (
                <View style={styles.promptRow}>
                {suggestedPrompts.map((prompt) => (
                  <TouchableOpacity
                    key={prompt}
                    style={[styles.promptChip, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => {
                      submit(prompt).catch(() => {});
                    }}
                    disabled={loading}
                  >
                    <Text style={[styles.promptChipText, { color: colors.text }]}>{prompt}</Text>
                  </TouchableOpacity>
                ))}
                </View>
              ) : null}

              {turns.map((turn) => {
                const isAssistant = turn.role === "assistant";

                return (
                  <View
                    key={turn.id}
                    style={[
                      styles.messageBubble,
                      isAssistant ? styles.assistantBubble : styles.userBubble,
                      {
                        alignSelf: isAssistant ? "flex-start" : "flex-end",
                        backgroundColor: isAssistant ? colors.card : colors.primary,
                        borderColor: isAssistant ? colors.border : colors.primary,
                      },
                    ]}
                  >
                    <Text style={[styles.messageLabel, { color: isAssistant ? colors.primary : "rgba(255,255,255,0.8)" }]}>
                      {isAssistant ? "Assistant" : "You"}
                    </Text>
                    <Text style={[styles.messageText, { color: isAssistant ? colors.text : "#fff" }]}>
                      {turn.text}
                    </Text>
                  </View>
                );
              })}

              {loading ? (
                <View style={[styles.loadingBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.loadingText, { color: colors.mutedText }]}>Gemini support thinking...</Text>
                </View>
              ) : null}

              {errorMessage ? (
                <View style={[styles.errorCard, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}25` }]}>
                  <Text style={[styles.errorText, { color: colors.text }]}>{errorMessage}</Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
              <View style={[styles.composerInputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Apna support question likho..."
                  placeholderTextColor={colors.placeholder}
                  style={[styles.composerInput, { color: colors.text }]}
                  multiline
                  editable={!loading}
                />
              </View>

              <TouchableOpacity
                style={[styles.sendButton, { backgroundColor: colors.primary }, (!draft.trim() || loading) ? styles.sendButtonDisabled : null]}
                onPress={() => {
                  submit().catch(() => {});
                }}
                disabled={!draft.trim() || loading}
              >
                <Icon name="send" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
  },
  sheet: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerCopy: {
    flex: 1,
    paddingRight: 12,
  },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "700",
  },
  title: {
    marginTop: 10,
    fontSize: 20,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
    paddingBottom: 24,
  },
  scopeCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  scopeLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  scopeTitle: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: "700",
  },
  scopeText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
  },
  emptyCard: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
  },
  promptRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 14,
    marginBottom: 4,
  },
  promptChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
    marginBottom: 10,
  },
  promptChipText: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  messageBubble: {
    maxWidth: "88%",
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 10,
  },
  assistantBubble: {
    borderTopLeftRadius: 6,
  },
  userBubble: {
    borderTopRightRadius: 6,
  },
  messageLabel: {
    fontSize: 11.5,
    fontWeight: "700",
    marginBottom: 5,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 21,
  },
  loadingBubble: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  loadingText: {
    marginLeft: 10,
    fontSize: 13,
    fontWeight: "600",
  },
  errorCard: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
  },
  composerInputWrap: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 54,
    justifyContent: "center",
  },
  composerInput: {
    maxHeight: 110,
    fontSize: 14,
    lineHeight: 20,
    padding: 0,
  },
  sendButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
});

export default AISupportSheet;
