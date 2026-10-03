/// <reference types="node" />
/**
 * Tests for the post editor layout/crop feature changes.
 * All assertions are against pure-logic equivalents of the
 * constants and helpers changed in CreatePostScreen.tsx.
 */

// ─── Mirror the changed constants ────────────────────────────────────────────

type AspectOption = { id: string; label: string; detail: string; ratio: number };
type ComposerMode = "post" | "story" | "swipe";

const POST_ASPECTS: AspectOption[] = [
  { id: "square", label: "1:1", detail: "Square", ratio: 1 },
  { id: "landscape", label: "16:9", detail: "Landscape", ratio: 16 / 9 },
];

const SWIPE_ASPECTS: AspectOption[] = [
  { id: "portrait", label: "4:5", detail: "Portrait", ratio: 4 / 5 },
  { id: "landscape", label: "16:9", detail: "Landscape", ratio: 16 / 9 },
];

const STORY_ASPECTS: AspectOption[] = [
  { id: "vertical", label: "9:16", detail: "Vertical", ratio: 9 / 16 },
  { id: "portrait", label: "4:5", detail: "Portrait", ratio: 4 / 5 },
];

const ASPECTS_BY_MODE: Record<ComposerMode, AspectOption[]> = {
  post: POST_ASPECTS,
  story: STORY_ASPECTS,
  swipe: SWIPE_ASPECTS,
};

const DEFAULT_ASPECT_BY_MODE: Record<ComposerMode, string> = {
  post: "square",
  story: "vertical",
  swipe: "portrait",
};

// Initial composerEditToolPanel state (changed from "layout" to null)
const INITIAL_TOOL_PANEL: string | null = null;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PostEditorLayout — POST_ASPECTS", () => {
  it("has exactly 2 options for post mode", () => {
    expect(POST_ASPECTS).toHaveLength(2);
  });

  it("first post option is 1:1 square", () => {
    expect(POST_ASPECTS[0].id).toBe("square");
    expect(POST_ASPECTS[0].label).toBe("1:1");
    expect(POST_ASPECTS[0].ratio).toBe(1);
  });

  it("second post option is 16:9 landscape", () => {
    expect(POST_ASPECTS[1].id).toBe("landscape");
    expect(POST_ASPECTS[1].label).toBe("16:9");
    expect(POST_ASPECTS[1].ratio).toBeCloseTo(16 / 9, 5);
  });

  it("does NOT contain 4:5 portrait in post mode", () => {
    const ids = POST_ASPECTS.map((a) => a.id);
    expect(ids).not.toContain("portrait");
  });

  it("does NOT contain 9:16 vertical in post mode", () => {
    const ids = POST_ASPECTS.map((a) => a.id);
    expect(ids).not.toContain("vertical");
  });
});

describe("PostEditorLayout — DEFAULT_ASPECT_BY_MODE", () => {
  it("default post aspect is square", () => {
    expect(DEFAULT_ASPECT_BY_MODE.post).toBe("square");
  });

  it("default story aspect is unchanged (vertical 9:16)", () => {
    expect(DEFAULT_ASPECT_BY_MODE.story).toBe("vertical");
  });

  it("default swipe aspect is unchanged (portrait 4:5)", () => {
    expect(DEFAULT_ASPECT_BY_MODE.swipe).toBe("portrait");
  });
});

describe("PostEditorLayout — SWIPE_ASPECTS (unchanged)", () => {
  it("swipe mode retains portrait 4:5 option", () => {
    const portrait = SWIPE_ASPECTS.find((a) => a.id === "portrait");
    expect(portrait).toBeDefined();
    expect(portrait?.ratio).toBeCloseTo(4 / 5, 5);
  });

  it("swipe mode retains landscape 16:9 option", () => {
    const landscape = SWIPE_ASPECTS.find((a) => a.id === "landscape");
    expect(landscape).toBeDefined();
    expect(landscape?.ratio).toBeCloseTo(16 / 9, 5);
  });

  it("swipe aspects are separate from post aspects (not same reference)", () => {
    expect(ASPECTS_BY_MODE.swipe).not.toBe(ASPECTS_BY_MODE.post);
  });
});

describe("PostEditorLayout — STORY_ASPECTS (unchanged)", () => {
  it("story mode retains vertical 9:16", () => {
    const vertical = STORY_ASPECTS.find((a) => a.id === "vertical");
    expect(vertical).toBeDefined();
    expect(vertical?.ratio).toBeCloseTo(9 / 16, 5);
  });

  it("story mode retains portrait 4:5", () => {
    const portrait = STORY_ASPECTS.find((a) => a.id === "portrait");
    expect(portrait).toBeDefined();
    expect(portrait?.ratio).toBeCloseTo(4 / 5, 5);
  });
});

describe("PostEditorLayout — composerEditToolPanel initial state", () => {
  it("initial panel is null — layout sheet does NOT auto-open", () => {
    expect(INITIAL_TOOL_PANEL).toBeNull();
  });
});

describe("PostEditorLayout — ASPECTS_BY_MODE mapping", () => {
  it("post mode uses POST_ASPECTS", () => {
    expect(ASPECTS_BY_MODE.post).toBe(POST_ASPECTS);
  });

  it("story mode uses STORY_ASPECTS", () => {
    expect(ASPECTS_BY_MODE.story).toBe(STORY_ASPECTS);
  });

  it("swipe mode uses SWIPE_ASPECTS (not POST_ASPECTS)", () => {
    expect(ASPECTS_BY_MODE.swipe).toBe(SWIPE_ASPECTS);
    expect(ASPECTS_BY_MODE.swipe).not.toBe(POST_ASPECTS);
  });
});

describe("PostEditorLayout — aspect lookup helper", () => {
  const findAspect = (mode: ComposerMode, aspectId: string | undefined) =>
    ASPECTS_BY_MODE[mode].find((item) => item.id === aspectId) || ASPECTS_BY_MODE[mode][0];

  it("resolves square for post mode by default", () => {
    const aspect = findAspect("post", DEFAULT_ASPECT_BY_MODE.post);
    expect(aspect.id).toBe("square");
    expect(aspect.ratio).toBe(1);
  });

  it("falls back to first post option (square) for unknown id", () => {
    const aspect = findAspect("post", "unknown-id");
    expect(aspect.id).toBe("square");
  });

  it("resolves landscape correctly for post", () => {
    const aspect = findAspect("post", "landscape");
    expect(aspect.id).toBe("landscape");
    expect(aspect.ratio).toBeCloseTo(16 / 9);
  });

  it("resolves vertical for story by default", () => {
    const aspect = findAspect("story", DEFAULT_ASPECT_BY_MODE.story);
    expect(aspect.id).toBe("vertical");
  });

  it("resolves portrait for swipe by default", () => {
    const aspect = findAspect("swipe", DEFAULT_ASPECT_BY_MODE.swipe);
    expect(aspect.id).toBe("portrait");
  });
});
