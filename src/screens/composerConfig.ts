/**
 * Pure configuration and math helpers for the post/story/swipe composer.
 * Extracted from CreatePostScreen.tsx so they can be unit-tested without
 * mounting the React Native component tree.
 *
 * Runtime behaviour is unchanged — CreatePostScreen imports directly from here.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComposerMode = "post" | "story" | "swipe";

export type AspectOption = {
  id: string;
  label: string;
  detail: string;
  ratio: number;
};

export type ComposerMediaTransform = {
  scale: number;
  translateX: number;
  translateY: number;
};

export type ComposerEditToolPanel =
  | "layout"
  | "filters"
  | "tag"
  | "trim"
  | "text"
  | "color"
  | "font"
  | "size"
  | null;

// ─── Aspect configuration ─────────────────────────────────────────────────────

export const POST_ASPECTS: AspectOption[] = [
  { id: "square", label: "1:1", detail: "Square", ratio: 1 },
  { id: "landscape", label: "16:9", detail: "Landscape", ratio: 16 / 9 },
];

// Kept separate from POST_ASPECTS so swipe/reel options don't change
// when post options are updated.
export const SWIPE_ASPECTS: AspectOption[] = [
  { id: "portrait", label: "4:5", detail: "Portrait", ratio: 4 / 5 },
  { id: "landscape", label: "16:9", detail: "Landscape", ratio: 16 / 9 },
];

export const STORY_ASPECTS: AspectOption[] = [
  { id: "vertical", label: "9:16", detail: "Vertical", ratio: 9 / 16 },
  { id: "portrait", label: "4:5", detail: "Portrait", ratio: 4 / 5 },
];

export const ASPECTS_BY_MODE: Record<ComposerMode, AspectOption[]> = {
  post: POST_ASPECTS,
  story: STORY_ASPECTS,
  swipe: SWIPE_ASPECTS,
};

export const DEFAULT_ASPECT_BY_MODE: Record<ComposerMode, string> = {
  post: "square",
  story: "vertical",
  swipe: "portrait",
};

/** The panel that is open when the editor first appears. null = none open. */
export const INITIAL_TOOL_PANEL: ComposerEditToolPanel = null;

// ─── Transform defaults ───────────────────────────────────────────────────────

export const DEFAULT_COMPOSER_MEDIA_TRANSFORM: ComposerMediaTransform = {
  scale: 1,
  translateX: 0,
  translateY: 0,
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/** Returns the matching aspect option, or the first option if not found. */
export const findAspectOption = (
  mode: ComposerMode,
  aspectId: string | undefined,
): AspectOption =>
  ASPECTS_BY_MODE[mode].find((item) => item.id === aspectId) ||
  ASPECTS_BY_MODE[mode][0];

/**
 * Sanitizes a raw frameTransform from the composer state into the value
 * written into the post payload.
 *
 * Scale range  [0.1, 4]   — preserves intentional sub-1 states such as the
 *   "fit full photo" scale of 0.82 produced by toggleFitScale.
 * Translate range  [-1.5, 1.5]  — matches the editor's PanResponder clamp.
 *
 * Returns undefined when no transform is provided (no-op / default).
 */
export const sanitizeFrameTransform = (
  frameTransform?: { scale: number; translateX: number; translateY: number },
): { scale: number; translateX: number; translateY: number } | undefined => {
  if (!frameTransform) return undefined;
  return {
    scale: Math.max(0.1, Math.min(4, Number(frameTransform.scale) || 1)),
    translateX: Math.max(-1.5, Math.min(1.5, Number(frameTransform.translateX) || 0)),
    translateY: Math.max(-1.5, Math.min(1.5, Number(frameTransform.translateY) || 0)),
  };
};

/**
 * Normalizes raw pixel-space pan coordinates into the [-1.5, 1.5] canvas-relative
 * range stored in ComposerMediaTransform. Returns current values unchanged when
 * canvas dimensions are zero (layout not yet measured).
 */
export const normalizeTranslate = (
  rawX: number,
  rawY: number,
  canvasWidth: number,
  canvasHeight: number,
  currentTranslateX: number,
  currentTranslateY: number,
): { translateX: number; translateY: number } => ({
  translateX: canvasWidth
    ? Math.max(-1.5, Math.min(1.5, rawX / canvasWidth))
    : currentTranslateX,
  translateY: canvasHeight
    ? Math.max(-1.5, Math.min(1.5, rawY / canvasHeight))
    : currentTranslateY,
});

/**
 * Computes the natural "cover" dimensions for a media asset inside a canvas
 * so the asset fills the frame with no letterboxing (Instagram-style).
 *
 * - Wide asset  (imgAspect >= canvasAspect): height = canvas height, width overflows
 * - Tall asset  (imgAspect <  canvasAspect): width  = canvas width,  height overflows
 *
 * The max pan freedom at scale=1 is then:
 *   maxPanX = max(0, (coverW - canvasW) / 2)
 *   maxPanY = max(0, (coverH - canvasH) / 2)
 */
export const computeCoverDimensions = (
  imgW: number,
  imgH: number,
  canvasW: number,
  canvasH: number,
): { coverW: number; coverH: number } => {
  const imgAspect = Math.max(1, imgW) / Math.max(1, imgH);
  const canvasAspect = Math.max(1, canvasW) / Math.max(1, canvasH);
  return imgAspect >= canvasAspect
    ? { coverW: canvasH * imgAspect, coverH: canvasH }
    : { coverW: canvasW, coverH: canvasW / imgAspect };
};

/**
 * Computes the maximum pixel pan allowed in each axis for a given scale.
 * At scale=1 with a wide image the horizontal overflow > 0 (free pan).
 * At scale=1 with a perfectly matching aspect ratio both values are 0.
 */
export const computeMaxPan = (
  coverW: number,
  coverH: number,
  canvasW: number,
  canvasH: number,
  scale: number,
): { maxPanX: number; maxPanY: number } => ({
  maxPanX: Math.max(0, (coverW * scale - canvasW) / 2),
  maxPanY: Math.max(0, (coverH * scale - canvasH) / 2),
});

/**
 * Computes the next pinch scale from a two-finger gesture.
 * Clamped to [0.2, 4] matching the composer's pan responder.
 */
export const computePinchScale = (
  startScale: number,
  startDistance: number,
  currentDistance: number,
): number =>
  Math.max(
    0.2,
    Math.min(4, startScale * (currentDistance / Math.max(1, startDistance))),
  );

/**
 * Determines the next scale when the "Fit full photo / Fill frame" button
 * is tapped. Mirrors the toggleFitFullPhoto logic in the component.
 * - If currently fitted (scale < 0.95), restore to fill (1.0).
 * - If currently filling, switch to fitted (0.82).
 */
