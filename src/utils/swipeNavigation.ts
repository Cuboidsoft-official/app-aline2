export type SwipeNavigationDirection = "next" | "previous";

export const getAdjacentSwipeIndex = (
  currentIndex: number,
  direction: SwipeNavigationDirection,
  totalSwipes: number,
): number => {
  const lastIndex = Math.max(0, totalSwipes - 1);
  const safeCurrentIndex = Math.max(0, Math.min(lastIndex, Math.floor(Number(currentIndex) || 0)));
  const offset = direction === "next" ? 1 : -1;

  return Math.max(0, Math.min(lastIndex, safeCurrentIndex + offset));
};
