const getEntityId = (value: any): string => {
  if (!value) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  return String(value?._id || value?.id || (typeof value?.toString === "function" ? value.toString() : "")).trim();
};

const getContentType = (value: any): string =>
  String(value?.postType || value?.contentType || value?.kind || value?.type || "").trim().toLowerCase();

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

export const openPostDetail = (navigation: any, params: { postId?: string } = {}) => {
  const postId = String(params.postId || "").trim();

  if (!postId) {
    return;
  }

  navigation.navigate("PostDetail", { postId });
};

export const openNotificationContentTarget = (navigation: any, data: any) => {
  const contentType = getContentType(data);
  const postType = getContentType(data?.post);
  const contentId = getEntityId(data?.contentId || data?.content || data?.targetId);
  const postId = getEntityId(data?.post || data?.postId || data?.post_id);
  const swipeId =
    getEntityId(data?.swipe || data?.swipeId || data?.reel || data?.reelId)
    || (["swipe", "reel"].includes(contentType) ? contentId || postId : "")
    || (["swipe", "reel"].includes(postType) ? postId : "");

  if (swipeId) {
    openSwipeInSwipes(navigation, { swipeId });
    return true;
  }

  const resolvedPostId = postId || (contentType === "post" ? contentId : "");
  if (resolvedPostId) {
    openPostDetail(navigation, { postId: resolvedPostId });
    return true;
  }

  return false;
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
