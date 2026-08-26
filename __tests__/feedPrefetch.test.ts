import { shouldTriggerFeedPrefetch } from "../src/utils/feedPrefetch";

describe("shouldTriggerFeedPrefetch", () => {
  it("triggers when a user near the 5th item has only the next page left to load", () => {
    const result = shouldTriggerFeedPrefetch({
      highestVisibleIndex: 4,
      totalPosts: 15,
      triggerIndex: 4,
      bufferSize: 8,
      pageSize: 10,
    });

    expect(result).toBe(true);
  });

  it("keeps the broader buffer guard for later scroll positions", () => {
    const result = shouldTriggerFeedPrefetch({
      highestVisibleIndex: 9,
      totalPosts: 28,
      triggerIndex: 4,
      bufferSize: 8,
      pageSize: 10,
    });

    expect(result).toBe(true);
  });

  it("does not trigger too early when the visible range still has a healthy buffer", () => {
    const result = shouldTriggerFeedPrefetch({
      highestVisibleIndex: 4,
      totalPosts: 24,
      triggerIndex: 4,
      bufferSize: 8,
      pageSize: 10,
    });

    expect(result).toBe(false);
  });
});
