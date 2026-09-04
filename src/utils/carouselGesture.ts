import { PixelRatio } from "react-native";

export type CarouselGestureIntent = "horizontal" | "vertical" | "unknown";

type GesturePoint = {
  x: number;
  y: number;
};

/** Android touch slop is density-based (dp). A raw 5px lock races differently on ldpi vs xxxhdpi. */
export const CAROUSEL_GESTURE_SLOP_DP = 8;

export const getCarouselGestureThresholdPx = (pixelRatio = PixelRatio.get()): number => {
  const density = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  return Math.max(CAROUSEL_GESTURE_SLOP_DP, Math.round(CAROUSEL_GESTURE_SLOP_DP * density));
};

export const getCarouselGestureIntent = (
  start: GesturePoint,
  current: GesturePoint,
  previous: CarouselGestureIntent = "unknown",
  thresholdPx = getCarouselGestureThresholdPx(),
): CarouselGestureIntent => {
  if (previous !== "unknown") {
    return previous;
  }

  const horizontalDistance = Math.abs(current.x - start.x);
  const verticalDistance = Math.abs(current.y - start.y);

  if (Math.max(horizontalDistance, verticalDistance) < thresholdPx) {
    return "unknown";
  }

  return horizontalDistance > verticalDistance ? "horizontal" : "vertical";
};

export const isCarouselTapGesture = (
  start: GesturePoint,
  end: GesturePoint,
  thresholdPx = getCarouselGestureThresholdPx(),
): boolean =>
  Math.abs(end.x - start.x) < thresholdPx && Math.abs(end.y - start.y) < thresholdPx;

export const getCarouselPageIndex = (offsetX: number, pageWidth: number, pageCount: number): number => {
  if (pageCount <= 1) {
    return 0;
  }

  const safeWidth = Math.max(1, pageWidth);
  return Math.max(0, Math.min(pageCount - 1, Math.round(Number(offsetX || 0) / safeWidth)));
};
