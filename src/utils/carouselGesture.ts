export type CarouselGestureIntent = "horizontal" | "vertical" | "unknown";

type GesturePoint = {
  x: number;
  y: number;
};

const GESTURE_DIRECTION_THRESHOLD = 5;

export const getCarouselGestureIntent = (
  start: GesturePoint,
  current: GesturePoint,
  previous: CarouselGestureIntent = "unknown",
): CarouselGestureIntent => {
  if (previous !== "unknown") {
    return previous;
  }

  const horizontalDistance = Math.abs(current.x - start.x);
  const verticalDistance = Math.abs(current.y - start.y);

  if (Math.max(horizontalDistance, verticalDistance) < GESTURE_DIRECTION_THRESHOLD) {
    return "unknown";
  }

  return horizontalDistance > verticalDistance ? "horizontal" : "vertical";
};
