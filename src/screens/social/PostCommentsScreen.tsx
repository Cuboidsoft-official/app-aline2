import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PostCommentsSheet from "../../features/social/components/PostCommentsSheet";
import { socialApi } from "../../features/social/socialApi";
import { Post } from "../../features/social/types";
import { toUserSafeMessage } from "../../features/social/validation";
import { useAppTheme } from "../../theme/AppThemeContext";

function PostCommentsScreen({ route, navigation }: any) {
  const { colors } = useAppTheme();
  const postId = typeof route?.params?.postId === "string" ? route.params.postId : "";
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const load = useCallback(async () => {
    if (!postId) {
      throw new Error("Invalid post id");
    }

    const nextPost = await socialApi.getPost(postId);
    setPost(nextPost);
    setErrorMessage("");
  }, [postId]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        setLoading(true);
        await load();
      } catch (error) {
        if (active) {
          setPost(null);
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

  if (!post) {
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
      <PostCommentsSheet
        visible
        post={post}
        onClose={() => navigation.goBack()}
        onPostUpdate={setPost}
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

export default PostCommentsScreen;
