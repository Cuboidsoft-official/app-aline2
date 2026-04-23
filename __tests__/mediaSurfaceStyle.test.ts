import { stripBackgroundColorFromStyle } from "../src/features/social/components/mediaSurfaceStyle";

describe("stripBackgroundColorFromStyle", () => {
  test("preserves layout styles while removing the background color override", () => {
    const sanitized = stripBackgroundColorFromStyle({
      width: 120,
      height: 220,
      borderRadius: 18,
      backgroundColor: "#f3f3f3",
    });

    expect(sanitized).toEqual({
      width: 120,
      height: 220,
      borderRadius: 18,
    });
  });

  test("returns an empty object for missing styles", () => {
    expect(stripBackgroundColorFromStyle(undefined)).toEqual({});
  });
});
