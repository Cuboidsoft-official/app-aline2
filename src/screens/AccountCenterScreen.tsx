import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";

import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { clearStoredSession } from "../utils/authSession";
import { useAppTheme } from "../theme/AppThemeContext";
import { clearPushToken } from "../utils/pushRegistration";

type AccountCenterResponse = {
  account?: {
    email?: string;
    name?: string;
    username?: string;
    isVerified?: boolean;
    linkedAuth?: {
      password?: boolean;
      google?: boolean;
    };
    createdAt?: string;
  };
  sessions?: Array<{
    id: string;
    devicePlatform?: string;
    deviceName?: string;
    appVersion?: string;
    lastUsedAt?: string;
    createdAt?: string;
    isCurrent?: boolean;
  }>;
};

const formatDateTime = (value?: string) => {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString();
};

const AccountCenterScreen = ({ navigation }: any) => {
  const { colors } = useAppTheme();
  const [data, setData] = useState<AccountCenterResponse>({});
  const [loading, setLoading] = useState(true);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await API.get("/auth/account-center");
      setData({
        account: response.data?.account || {},
        sessions: Array.isArray(response.data?.sessions) ? response.data.sessions : [],
      });
    } catch (error) {
      Alert.alert("Unable to load account center", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const logoutAfterRevoke = async () => {
    await clearPushToken();
    await clearStoredSession();
    navigation.reset({
      index: 0,
      routes: [{ name: "Login" }],
    });
  };

  const revokeSession = async (sessionId: string, isCurrent: boolean) => {
    if (busySessionId) {
      return;
    }

    try {
      setBusySessionId(sessionId);
      const response = await API.delete(`/auth/sessions/${sessionId}`);

      if (response.data?.revokedCurrent || isCurrent) {
        await logoutAfterRevoke();
        return;
      }

      setData((current) => ({
        ...current,
        sessions: (current.sessions || []).filter((session) => session.id !== sessionId),
      }));
    } catch (error) {
      Alert.alert("Unable to revoke session", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setBusySessionId(null);
    }
  };

  const revokeOtherSessions = async () => {
    if (revokingOthers) {
      return;
    }

    try {
      setRevokingOthers(true);
      await API.delete("/auth/sessions");
      setData((current) => ({
        ...current,
        sessions: (current.sessions || []).filter((session) => session.isCurrent),
      }));
      Alert.alert("Done", "Other signed-in devices have been logged out.");
    } catch (error) {
      Alert.alert("Unable to log out other devices", getReadableApiErrorMessage(error, "Please try again."));
    } finally {
      setRevokingOthers(false);
    }
  };

  const account = data.account || {};
  const sessions = data.sessions || [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Account Center</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Account</Text>
            <Text style={[styles.primaryText, { color: colors.text }]}>{account.name || account.email || "Aline2 account"}</Text>
            {account.username ? (
              <Text style={[styles.secondaryText, { color: colors.mutedText }]}>@{account.username}</Text>
            ) : null}
            {account.email ? (
              <Text style={[styles.secondaryText, { color: colors.mutedText }]}>{account.email}</Text>
            ) : null}
            <Text style={[styles.secondaryText, { color: colors.mutedText }]}>
              Joined {formatDateTime(account.createdAt)}
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Linked sign-in methods</Text>
            <View style={styles.row}>
              <Text style={[styles.primaryText, { color: colors.text }]}>Password</Text>
              <Text style={[styles.badge, { color: account.linkedAuth?.password ? colors.primary : colors.mutedText }]}>
                {account.linkedAuth?.password ? "Connected" : account.linkedAuth?.google ? "Set password" : "Not set"}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.primaryText, { color: colors.text }]}>Google</Text>
              <Text style={[styles.badge, { color: account.linkedAuth?.google ? colors.primary : colors.mutedText }]}>
                {account.linkedAuth?.google ? "Connected" : "Not connected"}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.inlineButton, { borderColor: colors.border }]}
              onPress={() => navigation.navigate("ForgotPassword", { email: account.email || "" })}
            >
              <Text style={[styles.inlineButtonText, { color: colors.text }]}>
                {account.linkedAuth?.password ? "Change password" : "Set password"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.row}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Active sessions</Text>
              <TouchableOpacity onPress={revokeOtherSessions} disabled={revokingOthers}>
                <Text style={[styles.actionLink, { color: colors.primary }, revokingOthers && styles.actionLinkDisabled]}>
                  {revokingOthers ? "Working..." : "Log out others"}
                </Text>
              </TouchableOpacity>
            </View>

            {(sessions || []).map((session) => (
              <View key={session.id} style={[styles.sessionRow, { borderTopColor: colors.border }]}>
                <View style={styles.sessionCopy}>
                  <Text style={[styles.primaryText, { color: colors.text }]}>
                    {session.deviceName || session.devicePlatform || "Unknown device"}
                  </Text>
                  <Text style={[styles.secondaryText, { color: colors.mutedText }]}>
                    {session.devicePlatform || "unknown"} {session.appVersion ? `• v${session.appVersion}` : ""}
                  </Text>
                  <Text style={[styles.secondaryText, { color: colors.mutedText }]}>
                    Last used {formatDateTime(session.lastUsedAt)}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => revokeSession(session.id, !!session.isCurrent)}
                  disabled={busySessionId === session.id}
                >
                  <Text
                    style={[
                      styles.actionLink,
                      { color: session.isCurrent ? colors.danger : colors.primary },
                      busySessionId === session.id && styles.actionLinkDisabled,
                    ]}
                  >
                    {busySessionId === session.id ? "Working..." : session.isCurrent ? "Log out" : "Revoke"}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  headerSpacer: { width: 24 },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: 20, gap: 16 },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 10 },
  primaryText: { fontSize: 15, fontWeight: "600" },
  secondaryText: { marginTop: 4, fontSize: 13, lineHeight: 18 },
  badge: { fontSize: 13, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  actionLinkDisabled: { opacity: 0.5 },
  inlineButton: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  inlineButtonText: { fontSize: 14, fontWeight: "600" },
  actionLink: { fontSize: 13, fontWeight: "700" },
  sessionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    borderTopWidth: 1,
    paddingTop: 14,
    marginTop: 14,
  },
  sessionCopy: { flex: 1 },
});

export default AccountCenterScreen;
