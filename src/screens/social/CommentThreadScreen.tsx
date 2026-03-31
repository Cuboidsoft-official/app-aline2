import React from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import CommentThreadSheet from "../../features/social/components/CommentThreadSheet";
import { Comment, SwipeComment } from "../../features/social/types";
import { useAppTheme } from "../../theme/AppThemeContext";

type ThreadComment = Comment | SwipeComment;

function CommentThreadScreen({ route, navigation }: any) {
  const { colors } = useAppTheme();
  const contentType = route?.params?.contentType as "post" | "swipe";
  const contentId = route?.params?.contentId as string;
  const comment = route?.params?.comment as ThreadComment;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <CommentThreadSheet
        visible
        contentType={contentType}
        contentId={contentId}
        comment={comment}
        onClose={() => navigation.goBack()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
});

export default CommentThreadScreen;
