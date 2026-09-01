import { getCarouselGestureIntent } from "../src/utils/carouselGesture";

describe("getCarouselGestureIntent", () => {
  it("waits for intentional movement before choosing a direction", () => {
    expect(getCarouselGestureIntent({ x: 100, y: 100 }, { x: 103, y: 102 })).toBe("unknown");
  });

  it("claims horizontal carousel drags while leaving vertical feed scrolls alone", () => {
    expect(getCarouselGestureIntent({ x: 100, y: 100 }, { x: 112, y: 104 })).toBe("horizontal");
    expect(getCarouselGestureIntent({ x: 100, y: 100 }, { x: 104, y: 112 })).toBe("vertical");
  });

  it("keeps the direction selected at the start of a gesture", () => {
    expect(getCarouselGestureIntent({ x: 100, y: 100 }, { x: 102, y: 130 }, "horizontal")).toBe("horizontal");
  });
});
