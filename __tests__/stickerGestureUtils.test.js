import {
  getAngleDeltaDegrees,
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
});
