/**
 * Post editor layout/crop tests — imports real production values from composerConfig.ts.
 */

import {
  POST_ASPECTS,
  SWIPE_ASPECTS,
  STORY_ASPECTS,
  ASPECTS_BY_MODE,
  DEFAULT_ASPECT_BY_MODE,
  INITIAL_TOOL_PANEL,
  DEFAULT_COMPOSER_MEDIA_TRANSFORM,
  findAspectOption,
  sanitizeFrameTransform,
  normalizeTranslate,
  computePinchScale,
  computeCoverDimensions,
  computeMaxPan,
} from "../src/screens/composerConfig";

// ─── POST_ASPECTS ─────────────────────────────────────────────────────────────

describe("POST_ASPECTS", () => {
  it("has exactly 2 options", () => {
    expect(POST_ASPECTS).toHaveLength(2);
  });

  it("first option is 1:1 square", () => {
    expect(POST_ASPECTS[0].id).toBe("square");
    expect(POST_ASPECTS[0].label).toBe("1:1");
    expect(POST_ASPECTS[0].ratio).toBe(1);
  });

  it("second option is 16:9 landscape", () => {
    expect(POST_ASPECTS[1].id).toBe("landscape");
    expect(POST_ASPECTS[1].label).toBe("16:9");
    expect(POST_ASPECTS[1].ratio).toBeCloseTo(16 / 9, 5);
  });

  it("does NOT include portrait (4:5)", () => {
    expect(POST_ASPECTS.map((a) => a.id)).not.toContain("portrait");
  });

  it("does NOT include vertical (9:16)", () => {
    expect(POST_ASPECTS.map((a) => a.id)).not.toContain("vertical");
  });
});

// ─── DEFAULT_ASPECT_BY_MODE ───────────────────────────────────────────────────

describe("DEFAULT_ASPECT_BY_MODE", () => {
  it("post defaults to square", () => {
    expect(DEFAULT_ASPECT_BY_MODE.post).toBe("square");
  });

  it("story defaults to fullscreen (9:16)", () => {
    expect(DEFAULT_ASPECT_BY_MODE.story).toBe("fullscreen");
  });

  it("swipe defaults to fullscreen (9:16)", () => {
    expect(DEFAULT_ASPECT_BY_MODE.swipe).toBe("fullscreen");
  });
});

// ─── SWIPE_ASPECTS ────────────────────────────────────────────────────────────

describe("SWIPE_ASPECTS", () => {
  it("includes fullscreen 9:16", () => {
    const opt = SWIPE_ASPECTS.find((a) => a.id === "fullscreen");
    expect(opt).toBeDefined();
    expect(opt!.ratio).toBeCloseTo(9 / 16, 5);
  });

  it("includes landscape 16:9", () => {
    const opt = SWIPE_ASPECTS.find((a) => a.id === "landscape");
    expect(opt).toBeDefined();
    expect(opt!.ratio).toBeCloseTo(16 / 9, 5);
  });

  it("includes square 1:1", () => {
    const opt = SWIPE_ASPECTS.find((a) => a.id === "square");
    expect(opt).toBeDefined();
    expect(opt!.ratio).toBe(1);
  });

  it("is a different array reference from POST_ASPECTS", () => {
    expect(SWIPE_ASPECTS).not.toBe(POST_ASPECTS);
  });
});

// ─── STORY_ASPECTS ────────────────────────────────────────────────────────────

describe("STORY_ASPECTS", () => {
  it("includes fullscreen 9:16", () => {
    const opt = STORY_ASPECTS.find((a) => a.id === "fullscreen");
    expect(opt).toBeDefined();
    expect(opt!.ratio).toBeCloseTo(9 / 16, 5);
  });

  it("includes landscape 16:9", () => {
    const opt = STORY_ASPECTS.find((a) => a.id === "landscape");
    expect(opt).toBeDefined();
    expect(opt!.ratio).toBeCloseTo(16 / 9, 5);
  });

  it("includes square 1:1", () => {
    const opt = STORY_ASPECTS.find((a) => a.id === "square");
    expect(opt).toBeDefined();
    expect(opt!.ratio).toBe(1);
  });
});

// ─── ASPECTS_BY_MODE ─────────────────────────────────────────────────────────

describe("ASPECTS_BY_MODE", () => {
  it("post → POST_ASPECTS (same reference)", () => {
    expect(ASPECTS_BY_MODE.post).toBe(POST_ASPECTS);
  });

  it("story → STORY_ASPECTS (same reference)", () => {
    expect(ASPECTS_BY_MODE.story).toBe(STORY_ASPECTS);
  });

  it("swipe → SWIPE_ASPECTS, not POST_ASPECTS", () => {
    expect(ASPECTS_BY_MODE.swipe).toBe(SWIPE_ASPECTS);
    expect(ASPECTS_BY_MODE.swipe).not.toBe(POST_ASPECTS);
  });
});

// ─── INITIAL_TOOL_PANEL ───────────────────────────────────────────────────────

describe("INITIAL_TOOL_PANEL", () => {
  it("is null — no sheet auto-opens on editor entry", () => {
    expect(INITIAL_TOOL_PANEL).toBeNull();
  });
});

// ─── Aspect ratio inline toolbar invariants ───────────────────────────────────

describe("inline aspect ratio toolbar", () => {
  it("post mode exposes exactly 2 aspect options for the inline toolbar", () => {
    expect(ASPECTS_BY_MODE.post).toHaveLength(2);
  });

  it("first post toolbar option is 1:1 square (ratio=1, no landscape shape)", () => {
    const opt = ASPECTS_BY_MODE.post[0];
    expect(opt.ratio).toBe(1);
    expect(opt.ratio).toBeGreaterThanOrEqual(1); // renders as square, not portrait
  });

  it("second post toolbar option is 16:9 landscape (ratio > 1)", () => {
    expect(ASPECTS_BY_MODE.post[1].ratio).toBeCloseTo(16 / 9, 5);
  });

  it("swipe mode exposes exactly 3 aspect options for the inline toolbar", () => {
    expect(ASPECTS_BY_MODE.swipe).toHaveLength(3);
  });

  it("story mode exposes exactly 3 aspect options for the inline toolbar", () => {
    expect(ASPECTS_BY_MODE.story).toHaveLength(3);
  });

  it("each mode has a valid default that resolves to a real option", () => {
    (["post", "story", "swipe"] as const).forEach((m) => {
      const def = findAspectOption(m, DEFAULT_ASPECT_BY_MODE[m]);
      expect(def).toBeDefined();
      expect(def.id).toBe(DEFAULT_ASPECT_BY_MODE[m]);
    });
  });

  it("aspect shape width >= height for landscape ratio (renders wider shape)", () => {
    const landscape = ASPECTS_BY_MODE.post.find((a) => a.ratio > 1)!;
    const maxDim = 18;
    const w = maxDim;
    const h = Math.round(maxDim / landscape.ratio);
    expect(w).toBeGreaterThan(h);
  });

  it("aspect shape height >= width for portrait ratio (renders taller shape)", () => {
    const portrait = ASPECTS_BY_MODE.swipe.find((a) => a.ratio < 1)!;
    const maxDim = 18;
    const h = maxDim;
    const w = Math.round(maxDim * portrait.ratio);
    expect(h).toBeGreaterThan(w);
  });
});

// ─── DEFAULT_COMPOSER_MEDIA_TRANSFORM ────────────────────────────────────────

describe("DEFAULT_COMPOSER_MEDIA_TRANSFORM", () => {
  it("has scale 1, translateX 0, translateY 0", () => {
    expect(DEFAULT_COMPOSER_MEDIA_TRANSFORM).toEqual({ scale: 1, translateX: 0, translateY: 0 });
  });
});

// ─── findAspectOption ─────────────────────────────────────────────────────────

describe("findAspectOption", () => {
  it("resolves square for post by default", () => {
    expect(findAspectOption("post", "square").id).toBe("square");
  });

  it("falls back to first option (square) for unknown id", () => {
    expect(findAspectOption("post", "unknown").id).toBe("square");
  });

  it("falls back to first option when id is undefined", () => {
    expect(findAspectOption("post", undefined).id).toBe("square");
  });

  it("resolves landscape for post", () => {
    const opt = findAspectOption("post", "landscape");
    expect(opt.id).toBe("landscape");
    expect(opt.ratio).toBeCloseTo(16 / 9);
  });

  it("resolves fullscreen for story default", () => {
    expect(findAspectOption("story", DEFAULT_ASPECT_BY_MODE.story).id).toBe("fullscreen");
  });

  it("resolves fullscreen for swipe default", () => {
    expect(findAspectOption("swipe", DEFAULT_ASPECT_BY_MODE.swipe).id).toBe("fullscreen");
  });
});

// ─── sanitizeFrameTransform ───────────────────────────────────────────────────
// Scale range: [0.1, 4]  — preserves intentional sub-1 states (e.g. 0.82 fit)
// Translate range: [-1.5, 1.5] — matches the editor PanResponder clamp

describe("sanitizeFrameTransform", () => {
  it("returns undefined when no argument given", () => {
    expect(sanitizeFrameTransform(undefined)).toBeUndefined();
  });

  it("passes through a valid transform unchanged", () => {
    expect(sanitizeFrameTransform({ scale: 2, translateX: 0.5, translateY: -0.3 }))
      .toEqual({ scale: 2, translateX: 0.5, translateY: -0.3 });
  });

  // ── Regression: scale = 0.82 (fit-full-photo) must survive serialization ──
  it("preserves scale = 0.82 (toggleFitScale fit state) — must NOT be clipped to 1", () => {
    expect(sanitizeFrameTransform({ scale: 0.82, translateX: 0, translateY: 0 })!.scale).toBeCloseTo(0.82);
  });

  it("preserves scale = 0.5 (sub-1 pinch-out) — must NOT be clipped to 1", () => {
    expect(sanitizeFrameTransform({ scale: 0.5, translateX: 0, translateY: 0 })!.scale).toBe(0.5);
  });

  it("clamps scale below 0.1 up to 0.1", () => {
    expect(sanitizeFrameTransform({ scale: 0.01, translateX: 0, translateY: 0 })!.scale).toBe(0.1);
  });

  it("clamps scale above 4 down to 4", () => {
    expect(sanitizeFrameTransform({ scale: 10, translateX: 0, translateY: 0 })!.scale).toBe(4);
  });

  // ── Regression: translate ±1.5 must survive serialization ─────────────────
  it("preserves translateX = 1.2 (within editor range) — must NOT be clipped to 1", () => {
    expect(sanitizeFrameTransform({ scale: 1, translateX: 1.2, translateY: 0 })!.translateX).toBeCloseTo(1.2);
  });

  it("preserves translateX = -1.2 (within editor range) — must NOT be clipped to -1", () => {
    expect(sanitizeFrameTransform({ scale: 1, translateX: -1.2, translateY: 0 })!.translateX).toBeCloseTo(-1.2);
  });

  it("clamps translateX below -1.5 up to -1.5", () => {
    expect(sanitizeFrameTransform({ scale: 1, translateX: -2, translateY: 0 })!.translateX).toBe(-1.5);
  });

  it("clamps translateX above 1.5 down to 1.5", () => {
    expect(sanitizeFrameTransform({ scale: 1, translateX: 5, translateY: 0 })!.translateX).toBe(1.5);
  });

  it("clamps translateY below -1.5 up to -1.5", () => {
    expect(sanitizeFrameTransform({ scale: 1, translateX: 0, translateY: -3 })!.translateY).toBe(-1.5);
  });

  it("clamps translateY above 1.5 down to 1.5", () => {
    expect(sanitizeFrameTransform({ scale: 1, translateX: 0, translateY: 99 })!.translateY).toBe(1.5);
  });

  it("treats NaN scale as 1", () => {
    expect(sanitizeFrameTransform({ scale: NaN, translateX: 0, translateY: 0 })!.scale).toBe(1);
  });

  it("treats NaN translateX as 0", () => {
    expect(sanitizeFrameTransform({ scale: 1, translateX: NaN, translateY: 0 })!.translateX).toBe(0);
  });
});

// ─── normalizeTranslate ───────────────────────────────────────────────────────

describe("normalizeTranslate", () => {
  it("normalizes pixel pan to canvas-relative value", () => {
    const result = normalizeTranslate(100, 50, 400, 400, 0, 0);
    expect(result.translateX).toBeCloseTo(0.25);
    expect(result.translateY).toBeCloseTo(0.125);
  });

  it("clamps to [-1.5, 1.5]", () => {
    const result = normalizeTranslate(1000, -1000, 200, 200, 0, 0);
    expect(result.translateX).toBe(1.5);
    expect(result.translateY).toBe(-1.5);
  });

  it("returns current values when canvas width is zero", () => {
    const result = normalizeTranslate(100, 100, 0, 400, 0.3, 0.4);
    expect(result.translateX).toBe(0.3);
  });

  it("returns current values when canvas height is zero", () => {
    const result = normalizeTranslate(100, 100, 400, 0, 0.3, 0.4);
    expect(result.translateY).toBe(0.4);
  });
});

// ─── computePinchScale ────────────────────────────────────────────────────────

describe("computePinchScale", () => {
  it("returns same scale when distance unchanged", () => {
    expect(computePinchScale(1.5, 200, 200)).toBeCloseTo(1.5);
  });

  it("scales up proportionally", () => {
    expect(computePinchScale(1.0, 100, 200)).toBeCloseTo(2.0);
  });

  it("scales down proportionally", () => {
    expect(computePinchScale(2.0, 200, 100)).toBeCloseTo(1.0);
  });

  it("clamps to minimum 0.2", () => {
    expect(computePinchScale(1.0, 1000, 1)).toBe(0.2);
  });

  it("clamps to maximum 4", () => {
    expect(computePinchScale(1.0, 1, 1000)).toBe(4);
  });

  it("guards against zero start distance (avoids division by zero)", () => {
    const result = computePinchScale(1.0, 0, 200);
    expect(Number.isFinite(result)).toBe(true);
  });
});

// ─── computeCoverDimensions ───────────────────────────────────────────────────
// Task 1 fix: both image AND video use this formula so the media always fills
// the canvas. The fix for video pan/zoom wraps SocialVideo in a
// pointerEvents="none" View so the native Video component cannot steal touches
// from the parent Animated.View that owns the PanResponder.

describe("computeCoverDimensions", () => {
  describe("wide media on square canvas (e.g. 16:9 video on 1:1 canvas)", () => {
    const canvas = { w: 400, h: 400 };
    const media  = { w: 1920, h: 1080 }; // 16:9 landscape

    it("coverH equals canvas height — no vertical letterboxing", () => {
      const { coverH } = computeCoverDimensions(media.w, media.h, canvas.w, canvas.h);
      expect(coverH).toBeCloseTo(canvas.h);
    });

    it("coverW is wider than canvas — horizontal overflow for pan freedom", () => {
      const { coverW } = computeCoverDimensions(media.w, media.h, canvas.w, canvas.h);
      expect(coverW).toBeGreaterThan(canvas.w);
    });

    it("coverW ≈ canvasH × aspect (711 for 400px canvas, 16:9 media)", () => {
      const { coverW } = computeCoverDimensions(media.w, media.h, canvas.w, canvas.h);
      expect(coverW).toBeCloseTo(canvas.h * (media.w / media.h), 1);
    });
  });

  describe("tall media on wide canvas (e.g. 9:16 portrait on 16:9 canvas)", () => {
    const canvas = { w: 640, h: 360 }; // 16:9
    const media  = { w: 1080, h: 1920 }; // 9:16 portrait

    it("coverW equals canvas width — no horizontal letterboxing", () => {
      const { coverW } = computeCoverDimensions(media.w, media.h, canvas.w, canvas.h);
      expect(coverW).toBeCloseTo(canvas.w);
    });

    it("coverH is taller than canvas — vertical overflow for pan freedom", () => {
      const { coverH } = computeCoverDimensions(media.w, media.h, canvas.w, canvas.h);
      expect(coverH).toBeGreaterThan(canvas.h);
    });
  });

  describe("perfectly matching aspect ratio (1:1 image on 1:1 canvas)", () => {
    it("coverW === canvasW and coverH === canvasH — no overflow", () => {
      const { coverW, coverH } = computeCoverDimensions(400, 400, 400, 400);
      expect(coverW).toBeCloseTo(400);
      expect(coverH).toBeCloseTo(400);
    });
  });

  it("guards against zero image dimensions", () => {
    const { coverW, coverH } = computeCoverDimensions(0, 0, 400, 400);
    expect(Number.isFinite(coverW)).toBe(true);
    expect(Number.isFinite(coverH)).toBe(true);
  });

  it("both output dimensions are always positive", () => {
    const cases = [
      [1920, 1080, 400, 400],
      [1080, 1920, 400, 400],
      [1280, 720, 375, 375],
      [720, 1280, 375, 667],
    ] as const;
    cases.forEach(([iW, iH, cW, cH]) => {
      const { coverW, coverH } = computeCoverDimensions(iW, iH, cW, cH);
      expect(coverW).toBeGreaterThan(0);
      expect(coverH).toBeGreaterThan(0);
    });
  });
});

// ─── computeMaxPan ────────────────────────────────────────────────────────────

describe("computeMaxPan", () => {
  const canvas = { w: 400, h: 400 };
  const media  = { w: 1920, h: 1080 }; // 16:9 → coverW ≈ 711, coverH = 400

  it("at scale=1 with wide video: maxPanX > 0 (free horizontal pan)", () => {
    const { coverW, coverH } = computeCoverDimensions(media.w, media.h, canvas.w, canvas.h);
    const { maxPanX } = computeMaxPan(coverW, coverH, canvas.w, canvas.h, 1);
    expect(maxPanX).toBeGreaterThan(0);
  });

  it("at scale=1 with wide video: maxPanY === 0 (no vertical overflow)", () => {
    const { coverW, coverH } = computeCoverDimensions(media.w, media.h, canvas.w, canvas.h);
    const { maxPanY } = computeMaxPan(coverW, coverH, canvas.w, canvas.h, 1);
    expect(maxPanY).toBeCloseTo(0);
  });

  it("maxPanX ≈ (coverW - canvasW) / 2 at scale=1", () => {
    const { coverW, coverH } = computeCoverDimensions(media.w, media.h, canvas.w, canvas.h);
    const { maxPanX } = computeMaxPan(coverW, coverH, canvas.w, canvas.h, 1);
    expect(maxPanX).toBeCloseTo((coverW - canvas.w) / 2, 1);
  });

  it("maxPanX doubles when scale doubles", () => {
    const { coverW, coverH } = computeCoverDimensions(media.w, media.h, canvas.w, canvas.h);
    const { maxPanX: p1 } = computeMaxPan(coverW, coverH, canvas.w, canvas.h, 1);
    const { maxPanX: p2 } = computeMaxPan(coverW, coverH, canvas.w, canvas.h, 2);
    expect(p2).toBeGreaterThan(p1);
  });

  it("at scale=1 with 1:1 image on 1:1 canvas: both maxPan are 0 (no overflow)", () => {
    const { coverW, coverH } = computeCoverDimensions(400, 400, canvas.w, canvas.h);
    const { maxPanX, maxPanY } = computeMaxPan(coverW, coverH, canvas.w, canvas.h, 1);
    expect(maxPanX).toBeCloseTo(0);
    expect(maxPanY).toBeCloseTo(0);
  });

  it("maxPan values are always non-negative", () => {
    const { coverW, coverH } = computeCoverDimensions(400, 400, canvas.w, canvas.h);
    const { maxPanX, maxPanY } = computeMaxPan(coverW, coverH, canvas.w, canvas.h, 0.5);
    expect(maxPanX).toBeGreaterThanOrEqual(0);
    expect(maxPanY).toBeGreaterThanOrEqual(0);
  });
});

// ─── UI behaviour (manual test checklist) ────────────────────────────────────
//
// Task 1 — Video pan/zoom (verified on device):
//   1. Select a landscape video in the post editor.
//   2. Drag horizontally — canvas view scrolls left/right, no lock.
//   3. Pinch in — video zooms smoothly, no jitter.
//   4. Pinch out to scale=1 — stops at the natural cover fit (no black bars).
//   5. Tap Reset — returns to center, scale=1.
//
// Task 2 — Removed hint overlays:
//   1. Open post editor with any image → "Add draggable text" text is NOT visible.
//   2. Open post editor with any video → "Add draggable text" text is NOT visible.
//   3. Open story editor with empty text → "Add draggable text" IS visible (story only).
//   4. The dark "Drag - pinch to zoom" pill is NOT present on image or video canvas.
//   5. The "Reset" button is still visible bottom-left of the image canvas.

