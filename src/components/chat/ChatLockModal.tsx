import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../../theme/AppThemeContext";

type ChatLockModalProps = {
  visible: boolean;
  mode: "unlock" | "setup";
  title?: string;
  description?: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (passcode: string) => Promise<void> | void;
};

const ChatLockModal = ({
  visible,
  mode,
  title,
  description,
  busy = false,
  onClose,
  onSubmit,
}: ChatLockModalProps) => {
  const { colors } = useAppTheme();
  const [passcode, setPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!visible) {
      setPasscode("");
      setConfirmPasscode("");
      setErrorMessage("");
    }
  }, [visible]);

  const submit = async () => {
    const normalizedPasscode = String(passcode || "").trim();

    if (!/^\d{4,8}$/.test(normalizedPasscode)) {
      setErrorMessage("Passcode 4 se 8 digits ka hona chahiye.");
      return;
    }

    if (mode === "setup" && normalizedPasscode !== String(confirmPasscode || "").trim()) {
      setErrorMessage("Passcode match nahi hua.");
      return;
    }

    setErrorMessage("");
    await onSubmit(normalizedPasscode);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.iconWrap}>
            <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}18` }]}>
              <Icon name="lock-closed-outline" size={22} color={colors.primary} />
            </View>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            {title || (mode === "setup" ? "Set chat lock" : "Unlock chat")}
          </Text>
          <Text style={[styles.description, { color: colors.mutedText || colors.placeholder }]}>
            {description || (mode === "setup"
              ? "Ek secure passcode set karo jisse locked chats aur groups khulenge."
              : "Apna chat lock passcode daal kar conversation unlock karo.")}
          </Text>

          <TextInput
            value={passcode}
            onChangeText={setPasscode}
            placeholder="Enter passcode"
            placeholderTextColor={colors.placeholder}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
          />

          {mode === "setup" ? (
            <TextInput
              value={confirmPasscode}
              onChangeText={setConfirmPasscode}
              placeholder="Confirm passcode"
              placeholderTextColor={colors.placeholder}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
            />
          ) : null}

          {errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.background }]}
              onPress={onClose}
              disabled={busy}
            >
              <Text style={[styles.secondaryText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                submit().catch(() => {});
              }}
              disabled={busy}
            >
              {busy ? <ActivityIndicator size="small" color="#fff" /> : (
                <Text style={styles.primaryText}>{mode === "setup" ? "Save lock" : "Unlock"}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default ChatLockModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  iconWrap: {
    alignItems: "center",
    marginBottom: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  description: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginTop: 14,
  },
  errorText: {
    marginTop: 10,
    fontSize: 12.5,
    color: "#dc2626",
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 18,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: "700",
  },
  primaryButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
});
