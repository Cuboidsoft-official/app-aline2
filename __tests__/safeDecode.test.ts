import { safeDecodeURIComponent } from "../src/utils/safeDecode";

describe("safeDecodeURIComponent", () => {
  it("decodes percent-encoded display values", () => {
    expect(safeDecodeURIComponent("Aline%40User%2BTest")).toBe("Aline@User+Test");
  });

  it("returns malformed values unchanged instead of throwing", () => {
    expect(safeDecodeURIComponent("bad%name")).toBe("bad%name");
  });

  it("trims blankish values", () => {
    expect(safeDecodeURIComponent("  ")).toBe("");
  });
});
