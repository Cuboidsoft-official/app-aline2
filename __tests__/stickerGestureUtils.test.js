import {
  clampStickerPosition,
  clampStickerRotation,
  clampStickerScale,
  getAngleDeltaDegrees,
  getStickerBounds,
  getTouchMetrics,
  getTouchPoints,
  normalizeAngleDelta,
} from "../src/features/social/stickerGestureUtils";

describe("stickerGestureUtils", () => {
  it("normalizes touch points and drops malformed entries", () => {
    expect(
      getTouchPoints([
        { pageX: 24, pageY: 48 },
        { pageX: "bad", pageY: 10 },
      ]),
    ).toEqual([{ pageX: 24, pageY: 48 }]);
  });

  it("computes center, distance, and angle for multi-touch gestures", () => {
    expect(
      getTouchMetrics([
        { pageX: 0, pageY: 0 },
        { pageX: 3, pageY: 4 },
      ]),
    ).toEqual({
      centerX: 1.5,
      centerY: 2,
      distance: 5,
      angle: 53.13010235415598,
    });
  });

  it("wraps angle deltas across the -180/180 seam", () => {
    expect(normalizeAngleDelta(190)).toBe(-170);
    expect(normalizeAngleDelta(-190)).toBe(170);
    expect(getAngleDeltaDegrees(170, -170)).toBe(20);
  });

  it("keeps sticker transforms smooth while respecting the allowed range", () => {
    expect(clampStickerScale(1.236)).toBe(1.24);
    expect(clampStickerScale(5)).toBe(3);
    expect(clampStickerRotation(45.44)).toBe(45.4);
    expect(clampStickerRotation(-999)).toBe(-180);
  });

  it("clamps sticker position using the scaled sticker footprint", () => {
    expect(getStickerBounds({ width: 0.16, height: 0.12 }, 2.5)).toEqual({
      width: 0.4,
      height: 0.3,
    });

    expect(
      clampStickerPosition(
        { width: 0.16, height: 0.12 },
        { x: 0.9, y: 0.85 },
        2.5,
      ),
    ).toEqual({
      x: 0.6,
      y: 0.7,
    });
  });
});
