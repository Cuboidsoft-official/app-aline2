import React, { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import PostCommentsSheet from "../../features/social/components/PostCommentsSheet";
import { socialApi } from "../../features/social/socialApi";
import { Post } from "../../features/social/types";
import { toUserSafeMessage } from "../../features/social/validation";

function PostCommentsScreen({ route, navigation }: any) {
  const postId = typeof route?.params?.postId === "string" ? route.params.postId : "";
  const [post, setPost] = useState<Post | null>(null);

  const load = useCallback(async () => {
    if (!postId) {
      throw new Error("Invalid post id");
    }

    const nextPost = await socialApi.getPost(postId);
    setPost(nextPost);
  }, [postId]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        await load();
      } catch (error) {
        if (active) {
          Alert.alert("Could not load comments", toUserSafeMessage(error));
          navigation.goBack();
        }
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [load, navigation]);

  return (
    <View style={styles.container}>
      <PostCommentsSheet
        visible
        post={post}
        onClose={() => navigation.goBack()}
        onPostUpdate={setPost}
        onOpenFull={() => {}}
        showOpenFull={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
});

export default PostCommentsScreen;
