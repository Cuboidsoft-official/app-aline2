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

const roundToPrecision = (value, precision) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return 0;
  }

  return Math.round(normalized * precision) / precision;
};

export const clampStickerScale = (value, options = {}) => {
  const { min = 0.6, max = 3 } = options;
  const normalized = Number(value);

  if (!Number.isFinite(normalized)) {
    return 1;
  }

  return roundToPrecision(Math.min(max, Math.max(min, normalized)), 100);
};

export const clampStickerRotation = (value, options = {}) => {
  const { min = -180, max = 180 } = options;
  const normalized = Number(value);

  if (!Number.isFinite(normalized)) {
    return 0;
  }

  return roundToPrecision(Math.min(max, Math.max(min, normalized)), 10);
};

export const getStickerBounds = (dimensions, scale = 1) => {
  const normalizedWidth = Number(dimensions?.width);
  const normalizedHeight = Number(dimensions?.height);
  const safeScale = clampStickerScale(scale);

  return {
    width: Math.min(1, Math.max(0.08, normalizedWidth * safeScale)),
    height: Math.min(1, Math.max(0.08, normalizedHeight * safeScale)),
  };
};

export const clampStickerPosition = (dimensions, position, scale = 1) => {
  const bounds = getStickerBounds(dimensions, scale);
  const normalizedX = Number(position?.x);
  const normalizedY = Number(position?.y);

  return {
    x: Math.min(Math.max(0, Number.isFinite(normalizedX) ? normalizedX : 0), Math.max(0, 1 - bounds.width)),
    y: Math.min(Math.max(0, Number.isFinite(normalizedY) ? normalizedY : 0), Math.max(0, 1 - bounds.height)),
  };
};
