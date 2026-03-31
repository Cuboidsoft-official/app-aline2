import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import SwipeCommentsSheet from "../../features/social/components/SwipeCommentsSheet";
import { socialApi } from "../../features/social/socialApi";
import { Swipe } from "../../features/social/types";
import { toUserSafeMessage } from "../../features/social/validation";
import { useAppTheme } from "../../theme/AppThemeContext";

function SwipeCommentsScreen({ route, navigation }: any) {
  const { colors } = useAppTheme();
  const swipeId =
    typeof route?.params?.swipeId === "string"
      ? route.params.swipeId
      : typeof route?.params?.reelId === "string"
        ? route.params.reelId
        : "";

  const [swipe, setSwipe] = useState<Swipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const load = useCallback(async () => {
    if (!swipeId) {
      throw new Error("Invalid swipe id");
    }

    const nextSwipe = await socialApi.getSwipe(swipeId);
    setSwipe(nextSwipe);
    setErrorMessage("");
  }, [swipeId]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        setLoading(true);
        await load();
      } catch (error) {
        if (active) {
          setSwipe(null);
          setErrorMessage(toUserSafeMessage(error));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [load, navigation]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!swipe) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorTitle, { color: colors.text }]}>Comments unavailable</Text>
        <Text style={[styles.errorText, { color: colors.mutedText }]}>{errorMessage || "Please try again."}</Text>
        <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={() => load().catch((error) => setErrorMessage(toUserSafeMessage(error)))}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <SwipeCommentsSheet
        visible
        swipe={swipe}
        onClose={() => navigation.goBack()}
        onSwipeUpdate={setSwipe}
        onOpenFull={() => {}}
        showOpenFull={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  errorTitle: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  errorText: { marginTop: 8, textAlign: "center", lineHeight: 20 },
  retryButton: { marginTop: 14, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: "#fff", fontWeight: "700" },
});

export default SwipeCommentsScreen;
