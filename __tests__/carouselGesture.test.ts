import {
  getCarouselGestureIntent,
  getCarouselPageIndex,
  isCarouselTapGesture,
} from "../src/utils/carouselGesture";

describe("getCarouselGestureIntent", () => {
  it("waits for intentional movement before choosing a direction", () => {
    expect(getCarouselGestureIntent({ x: 100, y: 100 }, { x: 103, y: 102 }, "unknown", 8)).toBe("unknown");
  });

  it("claims horizontal carousel drags while leaving vertical feed scrolls alone", () => {
    expect(getCarouselGestureIntent({ x: 100, y: 100 }, { x: 120, y: 104 }, "unknown", 8)).toBe("horizontal");
    expect(getCarouselGestureIntent({ x: 100, y: 100 }, { x: 104, y: 120 }, "unknown", 8)).toBe("vertical");
  });

  it("keeps the direction selected at the start of a gesture", () => {
    expect(getCarouselGestureIntent({ x: 100, y: 100 }, { x: 102, y: 130 }, "horizontal", 8)).toBe("horizontal");
  });

  it("uses a density-independent threshold so tiny jitter does not lock an axis", () => {
    expect(getCarouselGestureIntent({ x: 0, y: 0 }, { x: 7, y: 2 }, "unknown", 8)).toBe("unknown");
    expect(getCarouselGestureIntent({ x: 0, y: 0 }, { x: 24, y: 6 }, "unknown", 24)).toBe("horizontal");
  });
});

describe("isCarouselTapGesture", () => {
  it("treats sub-threshold movement as a tap so like/mute still work", () => {
    expect(isCarouselTapGesture({ x: 40, y: 80 }, { x: 43, y: 82 }, 8)).toBe(true);
    expect(isCarouselTapGesture({ x: 40, y: 80 }, { x: 70, y: 82 }, 8)).toBe(false);
  });
});

describe("getCarouselPageIndex", () => {
  it("snaps using the measured page width rather than a mixed window width", () => {
    expect(getCarouselPageIndex(0, 360, 3)).toBe(0);
    expect(getCarouselPageIndex(350, 360, 3)).toBe(1);
    expect(getCarouselPageIndex(720, 360, 3)).toBe(2);
    expect(getCarouselPageIndex(900, 360, 3)).toBe(2);
  });
});
