import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { launchImageLibrary, type Asset } from "react-native-image-picker";

import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { useAppTheme } from "../theme/AppThemeContext";
import { alpha, appFonts, appRadii, appShadows, appSpacing, appTypography } from "../theme/designSystem";
import { Alert } from "../utils/appAlert";
import {
  getStoredRefreshToken,
  getStoredSessionMeta,
  getStoredUser,
  setStoredSession,
} from "../utils/authSession";
import { registerPushToken } from "../utils/pushRegistration";
import { uploadImageAsset } from "../utils/uploadMedia";

const LOGO_URI = "https://aline2.com/asstes/images/logo/logo.jpeg";
const USERNAME_REGEX = /^(?!.*[.]{2})(?!.*[_]{2})[a-z0-9._]{3,30}$/;

const SetupAccountScreen = ({ navigation, route }: any) => {
  const { colors } = useAppTheme();
  const email = String(route?.params?.email || "").trim().toLowerCase();
  const [avatar, setAvatar] = useState<Asset | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const cleanUsername = useMemo(
    () => String(username || "").trim().toLowerCase(),
    [username],
  );
  const optionalDetailsStarted = Boolean(
    avatar?.uri || String(name || "").trim() || cleanUsername,
  );

  const pickAvatar = async () => {
    const result = await launchImageLibrary({
      mediaType: "photo",
      quality: 0.8,
      selectionLimit: 1,
    });

    if (result.didCancel) {
      return;
    }

    const nextAsset = result.assets?.[0];
    if (!nextAsset?.uri) {
      return;
    }

    setAvatar(nextAsset);
  };

  const completeSignup = async (skipOptionalDetails = false) => {
    if (!email) {
      Alert.alert("Setup failed", "Your signup email is missing. Please start again.");
      navigation.replace("Signup");
      return;
    }

    if (!password || password.trim().length < 6) {
      Alert.alert("Password required", "Use at least 6 characters for your password.");
      return;
    }

    if (String(password) !== String(confirmPassword)) {
      Alert.alert("Passwords do not match", "Please make sure both password fields match.");
      return;
    }

    if (!skipOptionalDetails && String(name || "").trim() && String(name || "").trim().length < 2) {
      Alert.alert("Name too short", "Please enter at least 2 characters for your name.");
      return;
    }

    if (!skipOptionalDetails && cleanUsername && !USERNAME_REGEX.test(cleanUsername)) {
      Alert.alert(
        "Invalid username",
        "Username must be 3 to 30 lowercase letters, numbers, dots, or underscores without double dots or underscores.",
      );
      return;
    }

    if (loading) {
      return;
    }

    let accessToken = "";
    let refreshToken: any = null;
    let session: any = null;
    let finalUser: any = null;

    try {
      setLoading(true);

      const passwordRes = await API.post("/auth/set-password", {
        email,
        password: String(password).trim(),
      });

      if (!passwordRes?.data?.success) {
        Alert.alert("Setup failed", passwordRes?.data?.message || "We could not save your password.");
        return;
      }

      const loginRes = await API.post("/auth/login", {
        email,
        password: String(password).trim(),
      });

      if (!loginRes?.data?.success || !loginRes?.data?.user) {
        Alert.alert(
          "Password saved",
          "Your password was created, but automatic login did not finish. Please log in with your new password.",
        );
        navigation.replace("Login", { email });
        return;
      }

      accessToken = String(loginRes.data.accessToken || loginRes.data.token || "").trim();
      refreshToken = loginRes.data.refreshToken;
      session = loginRes.data.session;
      finalUser = loginRes.data.user;

      const shouldSaveOptionalProfile = !skipOptionalDetails && optionalDetailsStarted;

      if (shouldSaveOptionalProfile && accessToken) {
        const profilePayload: Record<string, any> = {};

        if (String(name || "").trim()) {
          profilePayload.name = String(name).trim();
        }

        if (cleanUsername) {
          profilePayload.username = cleanUsername;
        }

        if (avatar?.uri) {
          profilePayload.profilePic = await uploadImageAsset({
            uri: avatar.uri,
            fileName: avatar.fileName || `avatar_${Date.now()}.jpg`,
            type: avatar.type || "image/jpeg",
          });
        }

        if (Object.keys(profilePayload).length > 0) {
          try {
            const updateRes = await API.post("/auth/update-profile", profilePayload, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            });

            finalUser = updateRes?.data?.user || {
              ...(finalUser || {}),
              ...profilePayload,
            };
          } catch (profileError: any) {
            Alert.alert(
              "Account created",
              getReadableApiErrorMessage(
                profileError,
                "We signed you in, but your optional profile details were not saved. You can add them later from Profile.",
              ),
            );
          }
        }
      }

      const [storedUser, storedRefreshToken, storedSession] = await Promise.all([
        getStoredUser(),
        getStoredRefreshToken(),
        getStoredSessionMeta(),
      ]);

      await setStoredSession({
        accessToken,
        refreshToken: refreshToken || storedRefreshToken,
        session: session || storedSession,
        user: {
          ...(storedUser || {}),
          ...(finalUser || {}),
        },
      });

      registerPushToken().catch(() => {});

      navigation.reset({
        index: 0,
        routes: [{ name: "MainApp" }],
      });
    } catch (error: any) {
      Alert.alert("Setup failed", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.orb, styles.orbTop, { backgroundColor: alpha(colors.primary, "22") }]} />
      <View style={[styles.orb, styles.orbBottom, { backgroundColor: alpha("#0C91E3", "22") }]} />

      <KeyboardAvoidingView
        style={styles.flexFill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.flexFill}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={20} color={colors.text} />
            <Text style={[styles.backText, { color: colors.text }]}>Back</Text>
          </TouchableOpacity>

          <View style={[styles.brandCard, { backgroundColor: alpha(colors.card, "E8"), borderColor: alpha(colors.border, "A0") }]}>
            <Image source={{ uri: LOGO_URI }} style={styles.logo} />
            <Text style={[styles.brandName, { color: colors.text }]}>Aline2</Text>
            <Text style={[styles.brandCopy, { color: colors.mutedText }]}>
              Set a password, then add your basic profile details now or later.
            </Text>
          </View>

          <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.panelTitle, { color: colors.text }]}>Finish your account</Text>
            <Text style={[styles.panelSubtitle, { color: colors.mutedText }]}>
              Signing up with <Text style={[styles.emailText, { color: colors.text }]}>{email || "your email"}</Text>
            </Text>

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Create password"
                placeholderTextColor={colors.placeholder}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm password"
                placeholderTextColor={colors.placeholder}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />
            </View>

            <View style={styles.section}>
              <View style={styles.optionalHeader}>
                <Text style={[styles.sectionLabel, { color: colors.text }]}>Basic details</Text>
                <Text style={[styles.optionalTag, { color: colors.primary, backgroundColor: alpha(colors.primary, "14") }]}>Optional</Text>
              </View>

              <TouchableOpacity
                style={[styles.avatarButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => {
                  pickAvatar().catch((error) => {
                    Alert.alert("Image error", getReadableApiErrorMessage(error, "Please try another image."));
                  });
                }}
                activeOpacity={0.9}
              >
                {avatar?.uri ? (
                  <Image source={{ uri: avatar.uri }} style={styles.avatarPreview} />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: alpha(colors.primary, "16") }]}>
                    <Icon name="camera-outline" size={22} color={colors.primary} />
                  </View>
                )}
                <View style={styles.avatarCopy}>
                  <Text style={[styles.avatarTitle, { color: colors.text }]}>Profile picture</Text>
                  <Text style={[styles.avatarSubtitle, { color: colors.mutedText }]}>
                    Add an avatar now, or skip and upload it later.
                  </Text>
                </View>
                <Icon name="chevron-forward" size={18} color={colors.mutedText} />
              </TouchableOpacity>

              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Name"
                placeholderTextColor={colors.placeholder}
                autoCapitalize="words"
                textContentType="name"
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />
              <TextInput
                value={username}
                onChangeText={(text) => setUsername(String(text || "").toLowerCase().replace(/[^a-z0-9_.]/g, ""))}
                placeholder="Username"
                placeholderTextColor={colors.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="username"
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />
              <Text style={[styles.helperText, { color: colors.mutedText }]}>
                Usernames can use lowercase letters, numbers, dots, and underscores.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]}
              disabled={loading}
              onPress={() => {
                completeSignup(false).catch(() => {});
              }}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Create account</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: colors.border, backgroundColor: alpha(colors.surface, "E8") }]}
              disabled={loading}
              onPress={() => {
                completeSignup(true).catch(() => {});
              }}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
                {optionalDetailsStarted ? "Skip optional details" : "Skip for now"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default SetupAccountScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flexFill: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: appSpacing.lg,
    paddingTop: appSpacing.sm,
    paddingBottom: appSpacing.xxl,
  },
  orb: {
    position: "absolute",
    borderRadius: 999,
  },
  orbTop: {
    width: 220,
    height: 220,
    top: -70,
    right: -40,
  },
  orbBottom: {
    width: 260,
    height: 260,
    bottom: -100,
    left: -70,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: appSpacing.xs,
    gap: 8,
  },
  backText: {
    fontFamily: appFonts.semibold,
    fontSize: 15,
  },
  brandCard: {
    marginTop: appSpacing.md,
    borderWidth: 1,
    borderRadius: appRadii.xl,
    paddingHorizontal: appSpacing.lg,
    paddingVertical: appSpacing.xl,
    alignItems: "center",
    ...appShadows.card,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: appSpacing.md,
  },
  brandName: {
    ...appTypography.h2,
    textAlign: "center",
  },
  brandCopy: {
    marginTop: appSpacing.xs,
    ...appTypography.body,
    textAlign: "center",
  },
  panel: {
    marginTop: appSpacing.lg,
    borderWidth: 1,
    borderRadius: appRadii.xl,
    padding: appSpacing.lg,
    ...appShadows.card,
  },
  panelTitle: {
    ...appTypography.h2,
  },
  panelSubtitle: {
    marginTop: appSpacing.xs,
    ...appTypography.body,
  },
  emailText: {
    fontFamily: appFonts.semibold,
  },
  section: {
    marginTop: appSpacing.lg,
  },
  sectionLabel: {
    ...appTypography.label,
    marginBottom: appSpacing.sm,
  },
  optionalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: appSpacing.sm,
  },
  optionalTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: appRadii.pill,
    fontFamily: appFonts.semibold,
    fontSize: 12,
    overflow: "hidden",
  },
  avatarButton: {
    borderWidth: 1,
    borderRadius: appRadii.lg,
    padding: appSpacing.sm,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: appSpacing.sm,
  },
  avatarPreview: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarCopy: {
    flex: 1,
    marginHorizontal: appSpacing.sm,
  },
  avatarTitle: {
    ...appTypography.title,
  },
  avatarSubtitle: {
    marginTop: 2,
    ...appTypography.caption,
  },
  input: {
    borderWidth: 1,
    borderRadius: appRadii.lg,
    paddingHorizontal: appSpacing.md,
    paddingVertical: Platform.OS === "ios" ? 16 : 14,
    fontFamily: appFonts.regular,
    fontSize: 15,
    marginBottom: appSpacing.sm,
  },
  helperText: {
    ...appTypography.caption,
    marginTop: 2,
  },
  primaryButton: {
    marginTop: appSpacing.lg,
    borderRadius: appRadii.pill,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontFamily: appFonts.bold,
    fontSize: 16,
  },
  secondaryButton: {
    marginTop: appSpacing.sm,
    minHeight: 52,
    borderRadius: appRadii.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontFamily: appFonts.semibold,
    fontSize: 15,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
