/**
 * Story crop & frame tests — zoom in/out, Full Screen, Landscape, Square.
 *
 * All assertions use pure helpers from composerConfig.ts (no component mount
 * needed). The canvas used throughout is a typical 9:16 portrait phone screen:
 *   canvasW = 390, canvasH = 693  (≈ 9:16 at standard density)
 */

import {
  isFitAspect,
  computeFitScale,
  computeCoverDimensions,
  computeMaxPan,
  computePinchScale,
  sanitizeFrameTransform,
  STORY_ASPECTS,
  DEFAULT_ASPECT_BY_MODE,
  findAspectOption,
  ASPECTS_BY_MODE,
} from "../src/screens/composerConfig";

const CANVAS_W = 390;
const CANVAS_H = 693; // ≈ 9:16

// ─── isFitAspect ─────────────────────────────────────────────────────────────

describe("isFitAspect", () => {
  it("returns false for 'fullscreen' — all story frames use cover mode", () => {
    expect(isFitAspect("fullscreen")).toBe(false);
  });

  it("returns false for 'landscape'", () => {
    expect(isFitAspect("landscape")).toBe(false);
  });

  it("returns false for 'square'", () => {
    expect(isFitAspect("square")).toBe(false);
  });

  it("returns false for any id — cover mode is universal for stories", () => {
    expect(isFitAspect("portrait")).toBe(false);
    expect(isFitAspect("")).toBe(false);
    expect(isFitAspect("FULLSCREEN")).toBe(false);
  });
});

// ─── Full Screen frame — always cover mode ───────────────────────────────────

describe("Full Screen frame — cover mode (isFitAspect returns false)", () => {
  it("fullscreen minScale = 1.0 (no letterboxing, image always fills frame)", () => {
    // isFitAspect("fullscreen") === false → minScale = 1.0
    const minScale = isFitAspect("fullscreen") ? computeFitScale(1920, 1080, CANVAS_W, CANVAS_H) : 1.0;
    expect(minScale).toBe(1.0);
  });

  it("landscape source at scale=1: coverH = canvasH, image fills portrait canvas by height", () => {
    const imgW = 1920; const imgH = 1080;
    const { coverH } = computeCoverDimensions(imgW, imgH, CANVAS_W, CANVAS_H);
    expect(coverH).toBeCloseTo(CANVAS_H, 0);
  });

  it("landscape source at scale=1: horizontal pan available (image overflows width)", () => {
    const imgW = 1920; const imgH = 1080;
    const { coverW, coverH } = computeCoverDimensions(imgW, imgH, CANVAS_W, CANVAS_H);
    const { maxPanX } = computeMaxPan(coverW, coverH, CANVAS_W, CANVAS_H, 1);
    expect(maxPanX).toBeGreaterThan(0);
  });

  it("portrait source at scale=1: nearly fills canvas exactly — minimal or no pan", () => {
    // 1080:1920 ≈ 390:693 — ratios are close but not pixel-perfect, so pan is ~0
    const imgW = 1080; const imgH = 1920;
    const { coverW, coverH } = computeCoverDimensions(imgW, imgH, CANVAS_W, CANVAS_H);
    const { maxPanX, maxPanY } = computeMaxPan(coverW, coverH, CANVAS_W, CANVAS_H, 1);
    expect(maxPanX).toBeCloseTo(0, 0); // < 0.5 px
    expect(maxPanY).toBeCloseTo(0, 0); // < 0.5 px
  });

  it("square source at scale=1: fills canvas by height, horizontal overflow", () => {
    // Same as square frame: square image covers by height on portrait canvas
    const imgW = 1080; const imgH = 1080;
    const { coverW, coverH } = computeCoverDimensions(imgW, imgH, CANVAS_W, CANVAS_H);
    const { maxPanX } = computeMaxPan(coverW, coverH, CANVAS_W, CANVAS_H, 1);
    expect(coverH).toBeCloseTo(CANVAS_H, 0); // fills height
    expect(maxPanX).toBeGreaterThan(0); // overflows width → can pan horizontally
  });

  it("computeFitScale helper still works correctly even though it is not used for minScale", () => {
    // computeFitScale is still a valid utility; just not used for minScale since isFitAspect = false
    expect(computeFitScale(1920, 1080, CANVAS_W, CANVAS_H)).toBeGreaterThan(0);
    expect(computeFitScale(1920, 1080, CANVAS_W, CANVAS_H)).toBeLessThanOrEqual(1);
  });
});

// ─── Landscape frame ──────────────────────────────────────────────────────────

describe("Landscape frame (16:9)", () => {
  it("isFitAspect('landscape') is false → minScale = 1.0 (cover mode)", () => {
    expect(isFitAspect("landscape")).toBe(false);
  });

  it("computeCoverDimensions for landscape source on 9:16 canvas: coverH = canvasH", () => {
    const imgW = 1920; const imgH = 1080;
    const { coverH } = computeCoverDimensions(imgW, imgH, CANVAS_W, CANVAS_H);
    expect(coverH).toBeCloseTo(CANVAS_H, 0);
  });

  it("landscape source at scale=1: image wider than canvas → horizontal pan available", () => {
    const imgW = 1920; const imgH = 1080;
    const { coverW, coverH } = computeCoverDimensions(imgW, imgH, CANVAS_W, CANVAS_H);
    const { maxPanX, maxPanY } = computeMaxPan(coverW, coverH, CANVAS_W, CANVAS_H, 1);
    expect(maxPanX).toBeGreaterThan(0);
    expect(maxPanY).toBe(0); // fits height exactly, no vertical pan
  });

  it("STORY_ASPECTS contains landscape with ratio 16:9", () => {
    const opt = STORY_ASPECTS.find((a) => a.id === "landscape");
    expect(opt).toBeDefined();
    expect(opt!.ratio).toBeCloseTo(16 / 9, 5);
  });

  it("findAspectOption resolves 'landscape' for story mode", () => {
    const opt = findAspectOption("story", "landscape");
    expect(opt.id).toBe("landscape");
    expect(opt.ratio).toBeCloseTo(16 / 9, 5);
  });
});

// ─── Square frame ─────────────────────────────────────────────────────────────

describe("Square frame (1:1)", () => {
  it("isFitAspect('square') is false → minScale = 1.0 (cover mode)", () => {
    expect(isFitAspect("square")).toBe(false);
  });

  it("computeCoverDimensions for square source on 9:16 canvas: coverH = canvasH (covers by height)", () => {
    // Square on portrait canvas: cover scale fills by HEIGHT (canvasH/imgH > canvasW/imgW)
    // so coverH == canvasH, coverW == canvasH (square stays square)
    const imgW = 1080; const imgH = 1080;
    const { coverH } = computeCoverDimensions(imgW, imgH, CANVAS_W, CANVAS_H);
    expect(coverH).toBeCloseTo(CANVAS_H, 0);
  });

  it("square source at scale=1: coverW > canvasW → horizontal pan available", () => {
    // Square image covers by height on portrait canvas → overflows horizontally
    const imgW = 1080; const imgH = 1080;
    const { coverW, coverH } = computeCoverDimensions(imgW, imgH, CANVAS_W, CANVAS_H);
    const { maxPanX, maxPanY } = computeMaxPan(coverW, coverH, CANVAS_W, CANVAS_H, 1);
    expect(maxPanX).toBeGreaterThan(0); // overflows horizontally
    expect(maxPanY).toBe(0); // fits height exactly
  });

  it("STORY_ASPECTS contains square with ratio 1", () => {
    const opt = STORY_ASPECTS.find((a) => a.id === "square");
    expect(opt).toBeDefined();
    expect(opt!.ratio).toBe(1);
  });

  it("findAspectOption resolves 'square' for story mode", () => {
    const opt = findAspectOption("story", "square");
    expect(opt.id).toBe("square");
    expect(opt.ratio).toBe(1);
  });
});

// ─── Zoom in / zoom out ───────────────────────────────────────────────────────

describe("Zoom in / zoom out — pinch clamp logic", () => {
  // All frames (including fullscreen): minScale = 1.0 — cannot zoom out below cover
  it("fullscreen: pinch cannot zoom out below 1.0 (cover mode, no letterboxing)", () => {
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const pinchMinS = isFitAspect("fullscreen") ? computeFitScale(1920, 1080, CANVAS_W, CANVAS_H) : 1.0;
    expect(pinchMinS).toBe(1.0); // isFitAspect is false → 1.0
    expect(clamp(0.1, pinchMinS, 4)).toBe(1.0);
  });

  it("landscape/square: pinch cannot zoom out below 1.0 (cover always fills frame)", () => {
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const pinchMinS = 1.0; // isFitAspect === false for all aspects
    const attemptedScale = 0.5;
    expect(clamp(attemptedScale, pinchMinS, 4)).toBe(1.0);
  });

  // All modes: max zoom = 4
  it("all modes: pinch zoom cannot exceed 4x", () => {
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    expect(clamp(10, 1.0, 4)).toBe(4);
    expect(clamp(10, 0.5, 4)).toBe(4);
  });

  it("computePinchScale — proportional to finger distance ratio", () => {
    const result = computePinchScale(1.0, 100, 200); // fingers doubled → 2x
    expect(result).toBeCloseTo(2.0, 4);
  });

  it("computePinchScale — zoom out halves scale", () => {
    const result = computePinchScale(2.0, 200, 100); // fingers halved → 1x
    expect(result).toBeCloseTo(1.0, 4);
  });

  it("computePinchScale — never below 0.2 (internal clamp)", () => {
    expect(computePinchScale(1.0, 100, 1)).toBeLessThanOrEqual(0.2);
    // result should equal 0.2 (the floor) since ratio would be < 0.2
    expect(computePinchScale(1.0, 100, 1)).toBeGreaterThanOrEqual(0.2);
  });

  it("computePinchScale — never above 4", () => {
    expect(computePinchScale(1.0, 10, 10000)).toBeLessThanOrEqual(4);
  });
});

// ─── Pan bounds ───────────────────────────────────────────────────────────────

describe("Pan bounds during zoom", () => {
  it("at scale=1 with square source: pan bounded by (coverH - canvasH) / 2 vertically", () => {
    const imgW = 1080; const imgH = 1080;
    const { coverW, coverH } = computeCoverDimensions(imgW, imgH, CANVAS_W, CANVAS_H);
    const { maxPanY } = computeMaxPan(coverW, coverH, CANVAS_W, CANVAS_H, 1);
    const expected = (coverH - CANVAS_H) / 2;
    expect(maxPanY).toBeCloseTo(expected, 1);
  });

  it("at scale=2 with square source: pan doubles compared to scale=1", () => {
    const imgW = 1080; const imgH = 1080;
    const { coverW, coverH } = computeCoverDimensions(imgW, imgH, CANVAS_W, CANVAS_H);
    const { maxPanX: x1, maxPanY: y1 } = computeMaxPan(coverW, coverH, CANVAS_W, CANVAS_H, 1);
    const { maxPanX: x2, maxPanY: y2 } = computeMaxPan(coverW, coverH, CANVAS_W, CANVAS_H, 2);
    // At 2x: overflow = coverW*2 - canvasW, boundary = (coverW*2 - canvasW) / 2
    // Compared to 1x: (coverW - canvasW) / 2  → roughly double + extra for the scale
    expect(x2).toBeGreaterThan(x1);
    expect(y2).toBeGreaterThan(y1);
  });

  it("landscape source at scale=1: maxPanX > 0 (image overflows width in cover mode)", () => {
    const imgW = 1920; const imgH = 1080;
    const { coverW, coverH } = computeCoverDimensions(imgW, imgH, CANVAS_W, CANVAS_H);
    const { maxPanX, maxPanY } = computeMaxPan(coverW, coverH, CANVAS_W, CANVAS_H, 1);
    expect(maxPanX).toBeGreaterThan(0); // image wider than canvas → can pan
    expect(maxPanY).toBe(0); // fills height exactly
  });

  it("maxPanX and maxPanY are never negative", () => {
    const imgW = 1080; const imgH = 1920; // portrait on portrait canvas — no overflow
    const { coverW, coverH } = computeCoverDimensions(imgW, imgH, CANVAS_W, CANVAS_H);
    const { maxPanX, maxPanY } = computeMaxPan(coverW, coverH, CANVAS_W, CANVAS_H, 1);
    expect(maxPanX).toBeGreaterThanOrEqual(0);
    expect(maxPanY).toBeGreaterThanOrEqual(0);
  });
});

// ─── sanitizeFrameTransform — cover mode (scale >= 1) ───────────────────────

describe("sanitizeFrameTransform — cover mode transforms", () => {
  it("scale=1 (reset position) round-trips correctly", () => {
    const result = sanitizeFrameTransform({ scale: 1, translateX: 0, translateY: 0 });
    expect(result!.scale).toBe(1);
  });

  it("zoomed-in scale (> 1) round-trips correctly", () => {
    const result = sanitizeFrameTransform({ scale: 2.5, translateX: 0.1, translateY: -0.05 });
    expect(result!.scale).toBeCloseTo(2.5, 4);
    expect(result!.translateX).toBeCloseTo(0.1, 5);
    expect(result!.translateY).toBeCloseTo(-0.05, 5);
  });

  it("sourceAspect (landscape image ratio) is stored and retrieved", () => {
    const sourceAspect = 1920 / 1080; // 16:9
    const result = sanitizeFrameTransform({ scale: 1.5, translateX: 0, translateY: 0, sourceAspect });
    expect(result!.sourceAspect).toBeCloseTo(sourceAspect, 5);
  });

  it("sourceAspect is omitted when 0 or negative", () => {
    const result = sanitizeFrameTransform({ scale: 1, translateX: 0, translateY: 0, sourceAspect: 0 });
    expect(result!.sourceAspect).toBeUndefined();
  });

  it("valid cover transform with sourceAspect round-trips correctly", () => {
    const transform = { scale: 1.8, translateX: 0.1, translateY: -0.05, sourceAspect: 16 / 9 };
    const result = sanitizeFrameTransform(transform);
    expect(result!.scale).toBeCloseTo(1.8, 4);
    expect(result!.translateX).toBeCloseTo(0.1, 5);
    expect(result!.translateY).toBeCloseTo(-0.05, 5);
    expect(result!.sourceAspect).toBeCloseTo(16 / 9, 5);
  });
});

// ─── Story frame list completeness ───────────────────────────────────────────

describe("Story frame list completeness", () => {
  it("story default is fullscreen", () => {
    expect(DEFAULT_ASPECT_BY_MODE.story).toBe("fullscreen");
  });

  it("story has exactly 3 frame options", () => {
    expect(STORY_ASPECTS).toHaveLength(3);
    expect(ASPECTS_BY_MODE.story).toHaveLength(3);
  });

  it("fullscreen is first (default position)", () => {
    expect(STORY_ASPECTS[0].id).toBe("fullscreen");
  });

  it("all 3 frame ids are present: fullscreen, landscape, square", () => {
    const ids = STORY_ASPECTS.map((a) => a.id);
    expect(ids).toContain("fullscreen");
    expect(ids).toContain("landscape");
    expect(ids).toContain("square");
  });

  it("all 3 frames resolve via findAspectOption", () => {
    ["fullscreen", "landscape", "square"].forEach((id) => {
      expect(findAspectOption("story", id).id).toBe(id);
    });
  });

  it("fullscreen ratio = 9/16", () => {
    expect(findAspectOption("story", "fullscreen").ratio).toBeCloseTo(9 / 16, 5);
  });

  it("landscape ratio = 16/9", () => {
    expect(findAspectOption("story", "landscape").ratio).toBeCloseTo(16 / 9, 5);
  });

  it("square ratio = 1", () => {
    expect(findAspectOption("story", "square").ratio).toBe(1);
  });

  it("unknown id falls back to fullscreen (first option)", () => {
    expect(findAspectOption("story", "unknown").id).toBe("fullscreen");
  });

  it("story frame list is independent of post frame list", () => {
    expect(ASPECTS_BY_MODE.story).not.toBe(ASPECTS_BY_MODE.post);
    // Story has fullscreen; post does not
    expect(ASPECTS_BY_MODE.story.map((a) => a.id)).toContain("fullscreen");
    expect(ASPECTS_BY_MODE.post.map((a) => a.id)).not.toContain("fullscreen");
  });
});

// ─── reset position logic ─────────────────────────────────────────────────────

describe("Reset position scale (resetCropPosition logic)", () => {
  const minScale = (aspectId: string, imgW: number, imgH: number) =>
    isFitAspect(aspectId) && CANVAS_W > 0 && CANVAS_H > 0
      ? computeFitScale(imgW, imgH, CANVAS_W, CANVAS_H)
      : 1.0;

  it("fullscreen + landscape image: reset scale = 1.0 (cover mode, no fit)", () => {
    const s = minScale("fullscreen", 1920, 1080);
    expect(s).toBe(1.0); // isFitAspect always false → 1.0
  });

  it("fullscreen + portrait image: reset scale = 1.0", () => {
    const s = minScale("fullscreen", 1080, 1920);
    expect(s).toBe(1.0);
  });

  it("landscape: reset scale = 1.0 (cover always)", () => {
    expect(minScale("landscape", 1920, 1080)).toBe(1.0);
  });

  it("square: reset scale = 1.0 (cover always)", () => {
    expect(minScale("square", 1080, 1080)).toBe(1.0);
  });
});
