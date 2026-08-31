export type FeedPrefetchTriggerInput = {
  highestVisibleIndex: number;
  totalPosts: number;
  triggerIndex?: number;
  bufferSize?: number;
  pageSize?: number;
};

export const shouldTriggerFeedPrefetch = ({
  highestVisibleIndex,
  totalPosts,
  triggerIndex = 4,
  bufferSize = 8,
  pageSize = 10,
}: FeedPrefetchTriggerInput): boolean => {
  if (!Number.isFinite(highestVisibleIndex) || highestVisibleIndex < triggerIndex) {
    return false;
  }

  const safeTotalPosts = Math.max(0, Number(totalPosts) || 0);
  const remainingPosts = Math.max(0, safeTotalPosts - (highestVisibleIndex + 1));
  const requestedPageSize = Math.max(1, Number(pageSize) || 10);
  const requestedBufferSize = Math.max(0, Number(bufferSize) || 0);

  const nearTriggerThreshold = requestedPageSize;
  const legacyThreshold = requestedPageSize + requestedBufferSize;

  const isNearTriggerWindow = highestVisibleIndex <= triggerIndex && remainingPosts <= nearTriggerThreshold;
  const hasLegacyBuffer = remainingPosts <= legacyThreshold;

  return isNearTriggerWindow || hasLegacyBuffer;
};
