export const openPostInFeed = (navigation: any, params: { postId?: string; userId?: string } = {}) => {
  const postId = String(params.postId || "").trim();
  const userId = String(params.userId || "").trim();

  if (!postId) {
    return;
  }

  navigation.navigate("Feed", {
    postId,
    userId,
    focusMode: userId ? "userPosts" : "feed",
  });
};

export const openSwipeInSwipes = (navigation: any, params: { swipeId?: string; userId?: string } = {}) => {
  const swipeId = String(params.swipeId || "").trim();
  const userId = String(params.userId || "").trim();

  if (!swipeId) {
    return;
  }

  navigation.navigate("Swipes", {
    swipeId,
    userId,
    focusMode: userId ? "userSwipes" : "swipes",
  });
};

export const openSharedContent = (navigation: any, sharedContent: any) => {
  if (sharedContent?.kind === "post" && sharedContent?.postId) {
    openPostInFeed(navigation, {
      postId: sharedContent.postId,
    });
    return;
  }

  if (sharedContent?.kind === "swipe" && sharedContent?.swipeId) {
    openSwipeInSwipes(navigation, {
      swipeId: sharedContent.swipeId,
    });
  }
};
