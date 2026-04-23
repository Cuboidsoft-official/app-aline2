export const getTouchPoints = (touches) =>
  (Array.isArray(touches) ? touches : [])
    .map((touch) => ({
      pageX: Number(touch?.pageX),
      pageY: Number(touch?.pageY),
    }))
    .filter((touch) => Number.isFinite(touch.pageX) && Number.isFinite(touch.pageY));

export const getTouchMetrics = (touches) => {
  const points = getTouchPoints(touches);

  if (!points.length) {
    return null;
  }

  if (points.length === 1) {
    return {
      centerX: points[0].pageX,
      centerY: points[0].pageY,
      distance: 0,
      angle: 0,
    };
  }

  const [firstPoint, secondPoint] = points;
  const deltaX = secondPoint.pageX - firstPoint.pageX;
  const deltaY = secondPoint.pageY - firstPoint.pageY;

  return {
    centerX: (firstPoint.pageX + secondPoint.pageX) / 2,
    centerY: (firstPoint.pageY + secondPoint.pageY) / 2,
    distance: Math.hypot(deltaX, deltaY),
    angle: (Math.atan2(deltaY, deltaX) * 180) / Math.PI,
  };
};

export const normalizeAngleDelta = (value) => {
  const normalized = Number(value);

  if (!Number.isFinite(normalized)) {
    return 0;
  }

  return ((normalized + 540) % 360) - 180;
};

export const getAngleDeltaDegrees = (startAngle, currentAngle) =>
  normalizeAngleDelta(Number(currentAngle) - Number(startAngle));
