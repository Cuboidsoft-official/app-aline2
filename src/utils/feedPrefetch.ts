export interface FeedPrefetchParams {
  highestVisibleIndex: number;
  totalPosts: number;
  triggerIndex: number;
  bufferSize: number;
  pageSize: number;
}

export function shouldTriggerFeedPrefetch(params: FeedPrefetchParams): boolean {
  const { highestVisibleIndex, totalPosts, triggerIndex, bufferSize, pageSize } = params;

  if (highestVisibleIndex < triggerIndex) {
    return false;
  }

  const remainingItems = totalPosts - 1 - highestVisibleIndex;
  const threshold = bufferSize + pageSize;

  return remainingItems <= threshold;
}
