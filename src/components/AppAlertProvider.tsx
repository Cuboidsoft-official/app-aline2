import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DraggableBottomSheet from "./DraggableBottomSheet";
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
  const insets = useSafeAreaInsets();
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
  const isSheetPresentation = activeAlert?.presentation === "sheet";
  const showsSheetHero = isSheetPresentation && activeAlert?.kind === "alert";
  const dialogVisible = Boolean(activeAlert) && !isSheetPresentation;
  const sheetVisible = Boolean(activeAlert) && isSheetPresentation;

  const dialogCardSurfaceStyle = {
    backgroundColor: colors.card,
    borderColor: colors.border,
    shadowColor: isDarkMode ? "#000000" : "#0F172A",
  };
  const sheetContentSurfaceStyle = {
    backgroundColor: colors.card,
    paddingBottom: Math.max(insets.bottom + 22, 30),
  };
  const sheetHeroIconStyle = {
    backgroundColor: isDarkMode ? "rgba(239,68,68,0.16)" : "rgba(239,68,68,0.12)",
    borderColor: isDarkMode ? "rgba(248,113,113,0.28)" : "rgba(239,68,68,0.18)",
  };

  const renderAlertContent = (sheetMode: boolean) => (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={sheetMode ? styles.sheetKeyboardWrap : undefined}
    >
      <View
        style={[
          sheetMode ? styles.sheetContent : [styles.card, styles.dialogCard],
          sheetMode ? sheetContentSurfaceStyle : dialogCardSurfaceStyle,
        ]}
      >
        <View
          style={[
            styles.topGlow,
            sheetMode ? styles.sheetTopGlow : styles.dialogTopGlow,
            { backgroundColor: `${colors.primary}${isDarkMode ? "18" : "10"}` },
          ]}
        />

        <ScrollView
          bounces={false}
          showsVerticalScrollIndicator={false}
          style={sheetMode ? styles.sheetScroll : undefined}
          contentContainerStyle={sheetMode ? styles.sheetScrollContent : undefined}
        >
          {sheetMode && showsSheetHero ? (
            <View style={styles.sheetHero}>
              <View style={[styles.sheetHeroIconWrap, sheetHeroIconStyle]}>
                <Icon name="shield-checkmark-outline" size={24} color={colors.primary} />
              </View>
              <Text style={[styles.sheetHeroLabel, { color: colors.mutedText }]}>Safety check</Text>
            </View>
          ) : null}

          <View style={[styles.header, sheetMode && styles.sheetHeader]}>
            <Text style={[styles.title, { color: colors.text }]}>{activeAlert?.title}</Text>
          </View>

          {activeAlert?.message ? (
            <Text style={[styles.message, sheetMode && styles.sheetMessage, { color: colors.mutedText }]}>
              {activeAlert.message}
            </Text>
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
        </ScrollView>

        <View
          style={[
            styles.buttonRow,
            (shouldStackButtons || sheetMode) && styles.buttonColumn,
            sheetMode && styles.sheetButtonColumn,
          ]}
        >
          {activeAlert?.buttons.map((button, index) => {
            const isPrimaryAction = index === primaryButtonIndex;

            return (
              <Pressable
                key={`${button.text || "button"}-${index}`}
                onPress={() => handleButtonPress(button)}
                style={[
                  styles.button,
                  sheetMode && styles.sheetButton,
                  {
                    backgroundColor: buttonBackgroundColor(button.style, isPrimaryAction),
                    borderColor: isPrimaryAction ? buttonBackgroundColor(button.style, true) : colors.border,
                  },
                ]}
              >
                <Text style={[styles.buttonText, { color: buttonTextColor(button.style, isPrimaryAction) }]}>
                  {button.text || "OK"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </KeyboardAvoidingView>
  );

  return (
    <>
      {children}
      <Modal
        visible={dialogVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={handleBackdropPress}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.overlay, styles.overlayDialog]}
        >
          <Pressable style={styles.backdrop} onPress={handleBackdropPress} />
          {renderAlertContent(false)}
        </KeyboardAvoidingView>
      </Modal>

      <DraggableBottomSheet
        visible={sheetVisible}
        onClose={handleBackdropPress}
        snapPoints={[0.4, 0.58, 0.78, 0.92]}
        initialSnapIndex={2}
        minHeight={320}
        maxHeightRatio={0.94}
      >
        {renderAlertContent(true)}
      </DraggableBottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    paddingHorizontal: 20,
  },
  overlayDialog: {
    justifyContent: "center",
    alignItems: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7, 12, 20, 0.44)",
  },
  card: {
    width: "100%",
    borderWidth: 1,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.24,
    shadowRadius: 34,
    elevation: 18,
  },
  dialogCard: {
    maxWidth: 410,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
  },
  sheetKeyboardWrap: {
    flex: 1,
  },
  sheetContent: {
    flex: 1,
    overflow: "hidden",
    paddingHorizontal: 22,
    paddingTop: 16,
  },
  topGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  dialogTopGlow: {
    height: 72,
  },
  sheetTopGlow: {
    height: 112,
  },
  sheetHero: {
    alignItems: "center",
    marginBottom: 10,
  },
  sheetHeroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: 10,
  },
  sheetHeroLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  header: {
    alignItems: "center",
    marginBottom: 10,
  },
  sheetHeader: {
    marginBottom: 8,
  },
  title: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 23,
  },
  message: {
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
  },
  sheetMessage: {
    paddingHorizontal: 4,
    marginBottom: 18,
  },
  sheetScroll: {
    flexShrink: 1,
  },
  sheetScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: 2,
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
  sheetButtonColumn: {
    gap: 10,
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
  sheetButton: {
    minHeight: 54,
    borderRadius: 20,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "800",
  },
});

export default AppAlertProvider;
