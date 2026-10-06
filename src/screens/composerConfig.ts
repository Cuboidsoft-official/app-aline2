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

// Story and swipe share the same three frame options.
// "fullscreen" (9:16) is the tall portrait frame — image fits without cropping at default scale.
// "landscape" (16:9) and "square" (1:1) work identically to the post options.
export const SWIPE_ASPECTS: AspectOption[] = [
  { id: "fullscreen", label: "Full", detail: "Full Screen", ratio: 9 / 16 },
  { id: "landscape",  label: "16:9", detail: "Landscape",  ratio: 16 / 9 },
  { id: "square",     label: "1:1",  detail: "Square",     ratio: 1 },
];

export const STORY_ASPECTS: AspectOption[] = [
  { id: "fullscreen", label: "Full", detail: "Full Screen", ratio: 9 / 16 },
  { id: "landscape",  label: "16:9", detail: "Landscape",  ratio: 16 / 9 },
  { id: "square",     label: "1:1",  detail: "Square",     ratio: 1 },
];

export const ASPECTS_BY_MODE: Record<ComposerMode, AspectOption[]> = {
  post: POST_ASPECTS,
  story: STORY_ASPECTS,
  swipe: SWIPE_ASPECTS,
};

export const DEFAULT_ASPECT_BY_MODE: Record<ComposerMode, string> = {
  post: "square",
  story: "fullscreen",
  swipe: "fullscreen",
};

/**
 * Returns true for the "fullscreen" aspect which starts the image at fit-scale
 * (entire image visible without cropping) rather than the default cover-fill scale.
 */
// All story frames use cover mode (image always fills the frame, no letterboxing).
export const isFitAspect = (_aspectId: string): boolean => false;

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
  frameTransform?: { scale: number; translateX: number; translateY: number; sourceAspect?: number },
): { scale: number; translateX: number; translateY: number; sourceAspect?: number } | undefined => {
  if (!frameTransform) return undefined;
  const result: { scale: number; translateX: number; translateY: number; sourceAspect?: number } = {
    scale: Math.max(0.1, Math.min(4, Number(frameTransform.scale) || 1)),
    translateX: Math.max(-1.5, Math.min(1.5, Number(frameTransform.translateX) || 0)),
    translateY: Math.max(-1.5, Math.min(1.5, Number(frameTransform.translateY) || 0)),
  };
  const sa = Number(frameTransform.sourceAspect);
  if (Number.isFinite(sa) && sa > 0) {
    result.sourceAspect = sa;
  }
  return result;
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
 * Computes the minimum scale at which the entire image is visible inside the
 * canvas without any cropping (the "fit" / contain scale). Used for the
 * "Full Screen" frame option where the image should show completely by default.
 * Returns 1.0 when the image matches or is smaller than the canvas in both axes.
 */
export const computeFitScale = (
  imgW: number,
  imgH: number,
  canvasW: number,
  canvasH: number,
): number => {
  const { coverW, coverH } = computeCoverDimensions(imgW, imgH, canvasW, canvasH);
  if (coverW <= 0 || coverH <= 0) return 1;
  return Math.min(canvasW / coverW, canvasH / coverH);
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
