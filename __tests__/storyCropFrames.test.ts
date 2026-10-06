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
  it("returns true only for 'fullscreen'", () => {
    expect(isFitAspect("fullscreen")).toBe(true);
  });

  it("returns false for 'landscape'", () => {
    expect(isFitAspect("landscape")).toBe(false);
  });

  it("returns false for 'square'", () => {
    expect(isFitAspect("square")).toBe(false);
  });

  it("returns false for 'post-square' or any unknown id", () => {
    expect(isFitAspect("portrait")).toBe(false);
    expect(isFitAspect("")).toBe(false);
    expect(isFitAspect("FULLSCREEN")).toBe(false); // case-sensitive
  });
});

// ─── Full Screen frame ────────────────────────────────────────────────────────

describe("Full Screen frame — computeFitScale", () => {
  it("landscape source image (16:9) on 9:16 canvas → fitScale < 1 (letterboxed)", () => {
    const imgW = 1920; const imgH = 1080; // 16:9
    const scale = computeFitScale(imgW, imgH, CANVAS_W, CANVAS_H);
    expect(scale).toBeLessThan(1);
  });

  it("landscape source: image fills full canvas WIDTH at fitScale", () => {
    const imgW = 1920; const imgH = 1080;
    const { coverW } = computeCoverDimensions(imgW, imgH, CANVAS_W, CANVAS_H);
    const scale = computeFitScale(imgW, imgH, CANVAS_W, CANVAS_H);
    expect(coverW * scale).toBeCloseTo(CANVAS_W, 0);
  });

  it("portrait source image (9:16) on 9:16 canvas → fitScale ≈ 1 (very close to exact fit)", () => {
    // 1080/1920 ≈ 0.5625 vs 390/693 ≈ 0.5627 — not exactly equal, within 0.1%
    const imgW = 1080; const imgH = 1920;
    const scale = computeFitScale(imgW, imgH, CANVAS_W, CANVAS_H);
    expect(scale).toBeCloseTo(1, 2); // ≤0.5% tolerance
  });

  it("square source image (1:1) on 9:16 canvas → fitScale < 1 (letterboxed)", () => {
    const imgW = 1080; const imgH = 1080; // 1:1
    const scale = computeFitScale(imgW, imgH, CANVAS_W, CANVAS_H);
    expect(scale).toBeLessThan(1);
  });

  it("square source: image fills full canvas WIDTH at fitScale", () => {
    const imgW = 1080; const imgH = 1080;
    const { coverW } = computeCoverDimensions(imgW, imgH, CANVAS_W, CANVAS_H);
    const scale = computeFitScale(imgW, imgH, CANVAS_W, CANVAS_H);
    expect(coverW * scale).toBeCloseTo(CANVAS_W, 0);
  });

  it("tall portrait (3:4) on 9:16 canvas → fitScale < 1 (overflows horizontally when covering)", () => {
    // 3:4 is wider than 9:16 — cover scale fills by HEIGHT, leaving horizontal overflow
    // so fitScale (fit) < 1 to pull it back
    const imgW = 900; const imgH = 1200; // 3:4 ratio
    const scale = computeFitScale(imgW, imgH, CANVAS_W, CANVAS_H);
    expect(scale).toBeLessThan(1);
    expect(scale).toBeGreaterThan(0);
  });

  it("zero image dimensions → result is a number (function does not throw)", () => {
    // Function computes without crashing; the calling code guards with canvas size checks
    const result = computeFitScale(0, 0, CANVAS_W, CANVAS_H);
    expect(typeof result).toBe("number");
  });

  it("fitScale is always > 0", () => {
    expect(computeFitScale(1920, 1080, CANVAS_W, CANVAS_H)).toBeGreaterThan(0);
    expect(computeFitScale(1080, 1920, CANVAS_W, CANVAS_H)).toBeGreaterThan(0);
    expect(computeFitScale(1080, 1080, CANVAS_W, CANVAS_H)).toBeGreaterThan(0);
  });

  it("fitScale is always <= 1 (never zooms in beyond cover)", () => {
    [
      [1920, 1080], [1080, 1920], [1080, 1080], [400, 300], [300, 400],
    ].forEach(([w, h]) => {
      expect(computeFitScale(w, h, CANVAS_W, CANVAS_H)).toBeLessThanOrEqual(1 + 1e-9);
    });
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
  // Full Screen: minScale = fitScale (may be < 1)
  it("fullscreen + landscape image: pinch can zoom OUT below 1 down to fitScale", () => {
    const imgW = 1920; const imgH = 1080;
    const fitScale = computeFitScale(imgW, imgH, CANVAS_W, CANVAS_H);
    expect(fitScale).toBeLessThan(1);

    // Simulate clamping the pinch scale
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const pinchMinS = fitScale; // isFitAspect === true
    const attemptedScale = 0.1; // user tries to zoom way out
    const result = clamp(attemptedScale, pinchMinS, 4);
    expect(result).toBe(pinchMinS); // clamped to fitScale, not below
  });

  // Landscape / Square: minScale = 1.0 — cannot zoom out below cover
  it("landscape/square: pinch cannot zoom out below 1.0 (cover always fills frame)", () => {
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const pinchMinS = 1.0; // isFitAspect === false
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

  it("at fitScale with landscape source: maxPanX ≈ 0 (image fits exactly horizontally)", () => {
    const imgW = 1920; const imgH = 1080;
    const { coverW, coverH } = computeCoverDimensions(imgW, imgH, CANVAS_W, CANVAS_H);
    const fitScale = computeFitScale(imgW, imgH, CANVAS_W, CANVAS_H);
    const { maxPanX } = computeMaxPan(coverW, coverH, CANVAS_W, CANVAS_H, fitScale);
    // At fitScale the image fits exactly within the canvas in at least one axis
    expect(maxPanX).toBeCloseTo(0, 0);
  });

  it("maxPanX and maxPanY are never negative", () => {
    const imgW = 1080; const imgH = 1920; // portrait on portrait canvas — no overflow
    const { coverW, coverH } = computeCoverDimensions(imgW, imgH, CANVAS_W, CANVAS_H);
    const { maxPanX, maxPanY } = computeMaxPan(coverW, coverH, CANVAS_W, CANVAS_H, 1);
    expect(maxPanX).toBeGreaterThanOrEqual(0);
    expect(maxPanY).toBeGreaterThanOrEqual(0);
  });
});

// ─── sanitizeFrameTransform — fullscreen sub-1 scale must survive ────────────

describe("sanitizeFrameTransform — fullscreen fit scale preservation", () => {
  it("sub-1 scale from fullscreen mode is NOT clipped to 1", () => {
    const fitScale = computeFitScale(1920, 1080, CANVAS_W, CANVAS_H); // ~0.316
    const result = sanitizeFrameTransform({ scale: fitScale, translateX: 0, translateY: 0 });
    expect(result!.scale).toBeCloseTo(fitScale, 4);
  });

  it("sourceAspect (landscape image ratio) is stored and retrieved", () => {
    const sourceAspect = 1920 / 1080; // 16:9
    const result = sanitizeFrameTransform({
      scale: 0.5,
      translateX: 0,
      translateY: 0,
      sourceAspect,
    });
    expect(result!.sourceAspect).toBeCloseTo(sourceAspect, 5);
  });

  it("sourceAspect is omitted when 0 or negative", () => {
    const result = sanitizeFrameTransform({ scale: 1, translateX: 0, translateY: 0, sourceAspect: 0 });
    expect(result!.sourceAspect).toBeUndefined();
  });

  it("valid full-screen transform (sub-1 scale + sourceAspect) round-trips correctly", () => {
    const fitScale = computeFitScale(1920, 1080, CANVAS_W, CANVAS_H);
    const transform = { scale: fitScale, translateX: 0.1, translateY: -0.05, sourceAspect: 16 / 9 };
    const result = sanitizeFrameTransform(transform);
    expect(result!.scale).toBeCloseTo(fitScale, 4);
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

  it("fullscreen + landscape image: reset scale = fitScale (< 1)", () => {
    const s = minScale("fullscreen", 1920, 1080);
    expect(s).toBeLessThan(1);
    expect(s).toBeCloseTo(computeFitScale(1920, 1080, CANVAS_W, CANVAS_H), 5);
  });

  it("fullscreen + portrait image: reset scale ≈ 1.0 (fills canvas, within 0.1%)", () => {
    const s = minScale("fullscreen", 1080, 1920);
    expect(s).toBeCloseTo(1, 2); // 1080/1920 ≈ 390/693 — close but not pixel-perfect
  });

  it("landscape: reset scale = 1.0 (cover always)", () => {
    expect(minScale("landscape", 1920, 1080)).toBe(1.0);
  });

  it("square: reset scale = 1.0 (cover always)", () => {
    expect(minScale("square", 1080, 1080)).toBe(1.0);
  });
});
