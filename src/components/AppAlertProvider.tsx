import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAppTheme } from "../theme/AppThemeContext";
import {
  type AppAlertButton,
  type AppAlertButtonStyle,
  type AppAlertConfig,
  registerAppAlertPresenter,
} from "../utils/appAlert";

const DEFAULT_CANCELABLE = true;

function AppAlertProvider({ children }: { children: React.ReactNode }) {
  const { colors, isDarkMode } = useAppTheme();
  const [queue, setQueue] = useState<AppAlertConfig[]>([]);
  const activeAlert = queue[0] ?? null;
  const [promptValue, setPromptValue] = useState("");

  useEffect(() => {
    return registerAppAlertPresenter({
      show: (config) => {
        setQueue((currentQueue) => [...currentQueue, config]);
      },
      dismiss: () => {
        setQueue((currentQueue) => currentQueue.slice(1));
      },
    });
  }, []);

  useEffect(() => {
    if (activeAlert?.kind === "prompt") {
      setPromptValue(activeAlert.defaultValue ?? "");
      return;
    }

    setPromptValue("");
  }, [activeAlert]);

  const dismissCurrent = useCallback((runOnDismiss?: boolean) => {
    const currentAlert = activeAlert;
    setQueue((currentQueue) => currentQueue.slice(1));

    if (runOnDismiss) {
      currentAlert?.options?.onDismiss?.();
    }
  }, [activeAlert]);

  const handleBackdropPress = useCallback(() => {
    const canDismiss = (activeAlert?.options?.cancelable ?? DEFAULT_CANCELABLE) === true;

    if (canDismiss) {
      dismissCurrent(true);
    }
  }, [activeAlert?.options?.cancelable, dismissCurrent]);

  const handleButtonPress = useCallback((button: AppAlertButton) => {
    const currentValue = promptValue;
    dismissCurrent(false);

    if (button.onPress) {
      requestAnimationFrame(() => {
        button.onPress?.(currentValue);
      });
    }
  }, [dismissCurrent, promptValue]);

  const primaryButtonIndex = useMemo(() => {
    if (!activeAlert) {
      return -1;
    }

    const preferredIndex = activeAlert.buttons.findIndex((button) => button.isPreferred);
    if (preferredIndex >= 0) {
      return preferredIndex;
    }

    const cancelIndex = activeAlert.buttons.findIndex((button) => button.style === "cancel");
    return cancelIndex === activeAlert.buttons.length - 1 ? Math.max(0, cancelIndex - 1) : activeAlert.buttons.length - 1;
  }, [activeAlert]);

  const buttonTextColor = (style: AppAlertButtonStyle | undefined, isPrimaryAction: boolean) => {
    if (isPrimaryAction) {
      return "#FFFFFF";
    }

    if (style === "destructive") {
      return colors.danger;
    }

    return colors.text;
  };

  const buttonBackgroundColor = (style: AppAlertButtonStyle | undefined, isPrimaryAction: boolean) => {
    if (style === "destructive" && isPrimaryAction) {
      return colors.danger;
    }

    if (isPrimaryAction) {
      return colors.primary;
    }

    return isDarkMode ? "#0F172A" : "#F4F5FA";
  };

  const secureTextEntry = activeAlert?.kind === "prompt" && activeAlert.promptType === "secure-text";
  const shouldStackButtons = (activeAlert?.buttons.length || 0) > 2;

  return (
    <>
      {children}
      <Modal
        visible={Boolean(activeAlert)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={handleBackdropPress}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.overlay}
        >
          <Pressable style={styles.backdrop} onPress={handleBackdropPress} />
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                shadowColor: isDarkMode ? "#000000" : "#0F172A",
              },
            ]}
          >
            <View style={[styles.topGlow, { backgroundColor: `${colors.primary}${isDarkMode ? "18" : "10"}` }]} />
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>{activeAlert?.title}</Text>
            </View>

            {activeAlert?.message ? (
              <Text style={[styles.message, { color: colors.mutedText }]}>{activeAlert.message}</Text>
            ) : null}

            {activeAlert?.kind === "prompt" ? (
              <TextInput
                autoFocus
                value={promptValue}
                onChangeText={setPromptValue}
                secureTextEntry={secureTextEntry}
                keyboardType={activeAlert.keyboardType}
                placeholder="Type here"
                placeholderTextColor={colors.placeholder}
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    backgroundColor: colors.input,
                    borderColor: colors.border,
                  },
                ]}
                selectionColor={colors.primary}
              />
            ) : null}

            <View style={[styles.buttonRow, shouldStackButtons && styles.buttonColumn]}>
              {activeAlert?.buttons.map((button, index) => {
                const isPrimaryAction = index === primaryButtonIndex;

                return (
                  <Pressable
                    key={`${button.text || "button"}-${index}`}
                    onPress={() => handleButtonPress(button)}
                    style={[
                      styles.button,
                      {
                        backgroundColor: buttonBackgroundColor(button.style, isPrimaryAction),
                        borderColor: isPrimaryAction ? buttonBackgroundColor(button.style, true) : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        { color: buttonTextColor(button.style, isPrimaryAction) },
                      ]}
                    >
                      {button.text || "OK"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7, 12, 20, 0.44)",
  },
  card: {
    width: "100%",
    maxWidth: 410,
    borderRadius: 28,
    borderWidth: 1,
    overflow: "hidden",
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.24,
    shadowRadius: 34,
    elevation: 18,
  },
  topGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 72,
  },
  header: {
    alignItems: "center",
    marginBottom: 10,
  },
  title: {
    textAlign: "center",
    fontSize: 19,
    fontWeight: "800",
    lineHeight: 24,
  },
  message: {
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
  },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 18,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
  },
  buttonColumn: {
    flexDirection: "column",
  },
  button: {
    flex: 1,
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "800",
  },
});

export default AppAlertProvider;
