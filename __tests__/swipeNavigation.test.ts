import { getAdjacentSwipeIndex } from "../src/utils/swipeNavigation";

describe("getAdjacentSwipeIndex", () => {
  it("moves to the next reel without passing the last reel", () => {
    expect(getAdjacentSwipeIndex(1, "next", 4)).toBe(2);
    expect(getAdjacentSwipeIndex(3, "next", 4)).toBe(3);
  });

  it("moves to the previous reel without going before the first reel", () => {
    expect(getAdjacentSwipeIndex(2, "previous", 4)).toBe(1);
    expect(getAdjacentSwipeIndex(0, "previous", 4)).toBe(0);
  });

  it("clamps invalid indexes and handles an empty feed", () => {
    expect(getAdjacentSwipeIndex(-4, "next", 3)).toBe(1);
    expect(getAdjacentSwipeIndex(99, "previous", 3)).toBe(1);
    expect(getAdjacentSwipeIndex(0, "next", 0)).toBe(0);
  });
});
