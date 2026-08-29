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
  const useTallSheet = isSheetPresentation && activeAlert?.options?.tallSheet === true;
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
    paddingBottom: Math.max(insets.bottom + 20, 30),
  };
  const sheetHeroIconStyle = {
    backgroundColor: isDarkMode ? "rgba(123,63,228,0.16)" : "rgba(123,63,228,0.10)",
    borderColor: isDarkMode ? "rgba(168,85,247,0.28)" : "rgba(123,63,228,0.18)",
  };
  const sheetBodyCardStyle = {
    backgroundColor: isDarkMode ? "rgba(15,23,42,0.28)" : "#FFFFFF",
    borderColor: isDarkMode ? "rgba(148,163,184,0.14)" : colors.border,
  };
  const sheetFooterStyle = {
    borderTopColor: isDarkMode ? "rgba(148,163,184,0.12)" : colors.border,
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
          <View style={sheetMode ? [styles.sheetBodyCard, sheetBodyCardStyle] : undefined}>
            {sheetMode && showsSheetHero ? (
              <View style={styles.sheetHero}>
                <View style={[styles.sheetHeroIconWrap, sheetHeroIconStyle]}>
                  <Icon name="shield-checkmark-outline" size={26} color={colors.primary} />
                </View>
                <Text style={[styles.sheetHeroLabel, { color: colors.mutedText }]}>Notice</Text>
              </View>
            ) : null}

            <View style={[styles.header, sheetMode && styles.sheetHeader]}>
              <Text style={[styles.title, sheetMode && styles.sheetTitle, { color: colors.text }]}>{activeAlert?.title}</Text>
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
          </View>
        </ScrollView>

        <View
          style={[
            styles.buttonRow,
            (shouldStackButtons || sheetMode) && styles.buttonColumn,
            sheetMode && styles.sheetButtonColumn,
            sheetMode && styles.sheetFooter,
            sheetMode && sheetFooterStyle,
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
        snapPoints={useTallSheet ? [0.42, 0.56, 0.7] : [0.3, 0.42, 0.56]}
        initialSnapIndex={useTallSheet ? 1 : 0}
        minHeight={useTallSheet ? 420 : 246}
        maxHeightRatio={0.86}
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
    borderWidth: 1,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.24,
    shadowRadius: 34,
    elevation: 18,
  },
  dialogCard: {
    width: "88%",
    minWidth: 280,
    maxWidth: 340,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
  },
  sheetKeyboardWrap: {
    width: "100%",
  },
  sheetContent: {
    width: "100%",
    overflow: "hidden",
    paddingHorizontal: 18,
    paddingTop: 10,
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
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: 8,
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
  sheetTitle: {
    fontSize: 18,
    lineHeight: 24,
  },
  message: {
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
  },
  sheetMessage: {
    paddingHorizontal: 6,
    marginBottom: 2,
    fontSize: 15,
    lineHeight: 22,
  },
  sheetScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  sheetScrollContent: {
    justifyContent: "flex-start",
    paddingBottom: 8,
  },
  sheetBodyCard: {
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
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
    width: "100%",
    marginTop: 4,
  },
  buttonColumn: {
    flexDirection: "column",
  },
  sheetButtonColumn: {
    gap: 10,
  },
  sheetFooter: {
    marginTop: 10,
    paddingTop: 12,
    paddingBottom: 8,
  },
  button: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  sheetButton: {
    minHeight: 48,
    borderRadius: 16,
    marginBottom: 2,
  },
  buttonText: {
    fontSize: 14.5,
    fontWeight: "700",
    textAlign: "center",
  },
});

export default AppAlertProvider;
