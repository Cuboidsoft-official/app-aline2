/**
 * Story / swipe frame layout — editor frame sizing, crop export size and the
 * viewer layout that shows published media at its real frame size.
 */

import {
  computeCropExportSize,
  computeFramedMediaLayout,
  fitFrameInContainer,
  resolveStoryFrameRatio,
  TALL_FRAME_RATIO,
} from "../src/screens/composerConfig";
import { toFramedMediaStyles } from "../src/features/social/framedMedia";

const SCREEN_W = 390;
const SCREEN_H = 844; // ≈ 9:19.5 phone

describe("fitFrameInContainer", () => {
  it("fits a 16:9 frame to the full width of a tall canvas", () => {
    const { width, height } = fitFrameInContainer(SCREEN_W, SCREEN_H, 16 / 9);
    expect(width).toBeCloseTo(SCREEN_W);
    expect(height).toBeCloseTo(SCREEN_W * 9 / 16);
  });

  it("fits a 1:1 frame to the full width of a tall canvas", () => {
    expect(fitFrameInContainer(SCREEN_W, SCREEN_H, 1)).toEqual({ width: SCREEN_W, height: SCREEN_W });
  });

  it("fits a tall frame to the height of a wide canvas", () => {
    const { width, height } = fitFrameInContainer(800, 400, 9 / 16);
    expect(height).toBe(400);
    expect(width).toBeCloseTo(225);
  });

  it("returns zero size before the canvas is measured", () => {
    expect(fitFrameInContainer(0, 0, 1)).toEqual({ width: 0, height: 0 });
  });

  it("falls back to the canvas ratio for an invalid ratio", () => {
    expect(fitFrameInContainer(SCREEN_W, SCREEN_H, NaN)).toEqual({ width: SCREEN_W, height: SCREEN_H });
  });
});

describe("resolveStoryFrameRatio", () => {
  it("Full Screen uses the whole canvas", () => {
    expect(resolveStoryFrameRatio("fullscreen", SCREEN_W, SCREEN_H, 9 / 16)).toBeCloseTo(SCREEN_W / SCREEN_H);
  });

  it("Full Screen falls back to 9:16 before the canvas is measured", () => {
    expect(resolveStoryFrameRatio("fullscreen", 0, 0, 9 / 16)).toBeCloseTo(9 / 16);
  });

  it("16:9 and 1:1 keep their preset ratio", () => {
    expect(resolveStoryFrameRatio("landscape", SCREEN_W, SCREEN_H, 16 / 9)).toBeCloseTo(16 / 9);
    expect(resolveStoryFrameRatio("square", SCREEN_W, SCREEN_H, 1)).toBe(1);
  });
});

describe("computeCropExportSize", () => {
  it("exports 16:9 at 1920×1080", () => {
    expect(computeCropExportSize(16 / 9)).toEqual({ width: 1920, height: 1080 });
  });

  it("exports 1:1 at 1080×1080", () => {
    expect(computeCropExportSize(1)).toEqual({ width: 1080, height: 1080 });
  });

  it("exports 9:16 at 1080×1920", () => {
    expect(computeCropExportSize(9 / 16)).toEqual({ width: 1080, height: 1920 });
  });

  it("keeps the frame ratio for a full-screen canvas", () => {
    const { width, height } = computeCropExportSize(SCREEN_W / SCREEN_H);
    expect(width).toBe(1080);
    expect(width / height).toBeCloseTo(SCREEN_W / SCREEN_H, 2);
  });
});

describe("computeFramedMediaLayout", () => {
  it("shows a square story as a centred square box with no transform", () => {
    const layout = computeFramedMediaLayout({
      containerWidth: SCREEN_W,
      containerHeight: SCREEN_H,
      mediaWidth: 1080,
      mediaHeight: 1080,
    });
    expect(layout.frame).toEqual({ left: 0, top: (SCREEN_H - SCREEN_W) / 2, width: SCREEN_W, height: SCREEN_W });
    expect(layout.content).toBeNull();
  });

  it("shows a 16:9 story as a full-width landscape box", () => {
    const layout = computeFramedMediaLayout({
      containerWidth: SCREEN_W,
      containerHeight: SCREEN_H,
      mediaWidth: 1920,
      mediaHeight: 1080,
    });
    expect(layout.frame.width).toBeCloseTo(SCREEN_W);
    expect(layout.frame.height).toBeCloseTo(SCREEN_W * 9 / 16);
  });

  it("fills the screen for Full Screen (tall) frames", () => {
    const layout = computeFramedMediaLayout({
      containerWidth: SCREEN_W,
      containerHeight: SCREEN_H,
      mediaWidth: 1080,
      mediaHeight: 1920,
    });
    expect(9 / 16).toBeLessThan(TALL_FRAME_RATIO);
    expect(layout.frame).toEqual({ left: 0, top: 0, width: SCREEN_W, height: SCREEN_H });
  });

  it("fills the screen when the media has no size", () => {
    const layout = computeFramedMediaLayout({ containerWidth: SCREEN_W, containerHeight: SCREEN_H });
    expect(layout.frame).toEqual({ left: 0, top: 0, width: SCREEN_W, height: SCREEN_H });
    expect(layout.content).toBeNull();
  });

  it("applies the saved pan/zoom inside the frame and always covers it", () => {
    const layout = computeFramedMediaLayout({
      containerWidth: SCREEN_W,
      containerHeight: SCREEN_H,
      mediaWidth: 1080,
      mediaHeight: 1080,
      frameTransform: { scale: 2, translateX: 0.1, translateY: -0.1, sourceAspect: 16 / 9 },
    });
    const content = layout.content!;
    expect(content.scale).toBe(2);
    expect(content.translateX).toBeCloseTo(0.1 * SCREEN_W);
    expect(content.translateY).toBeCloseTo(-0.1 * SCREEN_W);
    // Scaled media is at least as large as the frame in both axes.
    expect(content.width * content.scale).toBeGreaterThanOrEqual(layout.frame.width);
    expect(content.height * content.scale).toBeGreaterThanOrEqual(layout.frame.height);
  });

  it("never zooms out below fill or pans past the media edge", () => {
    const layout = computeFramedMediaLayout({
      containerWidth: SCREEN_W,
      containerHeight: SCREEN_H,
      mediaWidth: 1080,
      mediaHeight: 1080,
      frameTransform: { scale: 0.5, translateX: 1.5, translateY: 0, sourceAspect: 1 },
    });
    const content = layout.content!;
    expect(content.scale).toBe(1);
    // Square media in a square frame at fill scale has nowhere to pan.
    expect(content.translateX).toBeCloseTo(0);
  });
});

describe("toFramedMediaStyles", () => {
  it("builds a clipped frame and a transformed content box", () => {
    const styles = toFramedMediaStyles({
      frame: { left: 0, top: 10, width: 100, height: 100 },
      content: { left: -20, top: 0, width: 140, height: 100, translateX: 5, translateY: 0, scale: 1.5 },
    });
    expect(styles.frame).toMatchObject({ position: "absolute", overflow: "hidden", top: 10, width: 100 });
    expect(styles.content).toMatchObject({
      left: -20,
      width: 140,
      transform: [{ translateX: 5 }, { translateY: 0 }, { scale: 1.5 }],
    });
  });

  it("returns null content when there is no transform", () => {
    expect(toFramedMediaStyles({ frame: { left: 0, top: 0, width: 1, height: 1 }, content: null }).content).toBeNull();
  });
});
