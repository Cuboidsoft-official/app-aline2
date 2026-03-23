import React from "react";
import { StyleSheet, View } from "react-native";

import CommentThreadSheet from "../../features/social/components/CommentThreadSheet";
import { Comment, SwipeComment } from "../../features/social/types";

type ThreadComment = Comment | SwipeComment;

function CommentThreadScreen({ route, navigation }: any) {
  const contentType = route?.params?.contentType as "post" | "swipe";
  const contentId = route?.params?.contentId as string;
  const comment = route?.params?.comment as ThreadComment;

  return (
    <View style={styles.container}>
      <CommentThreadSheet
        visible
        contentType={contentType}
        contentId={contentId}
        comment={comment}
        onClose={() => navigation.goBack()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
});

export default CommentThreadScreen;
