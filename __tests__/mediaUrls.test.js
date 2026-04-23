import { normalizeMediaUrl } from "../src/utils/mediaUrls";

describe("normalizeMediaUrl", () => {
  it("keeps current R2 URLs unchanged", () => {
    const url = "https://pub-43954e72859749d9a3eaa7b3e4840a9b.r2.dev/images/example.png";

    expect(normalizeMediaUrl(url)).toBe(url);
  });

  it("preserves already-prefixed legacy R2 URLs", () => {
    const url = "https://pub-0ca80f02c91947fe9a67f96ec272c6a2.r2.dev/aline2/images/example.png";

    expect(normalizeMediaUrl(url)).toBe(url);
  });

  it("adds the prefix only for the legacy R2 host that needs it", () => {
    const url = "https://pub-0ca80f02c91947fe9a67f96ec272c6a2.r2.dev/images/example.png";

    expect(normalizeMediaUrl(url)).toBe(
      "https://pub-0ca80f02c91947fe9a67f96ec272c6a2.r2.dev/aline2/images/example.png",
    );
  });

  it.each([
    ["audio", "audio/example.aac"],
    ["chat", "chat/example.png"],
    ["documents", "documents/example.pdf"],
    ["stickers", "stickers/example.webp"],
    ["videos", "videos/example.mp4"],
  ])("applies the legacy prefix for %s media paths only on the old host", (_label, path) => {
    const url = `https://pub-0ca80f02c91947fe9a67f96ec272c6a2.r2.dev/${path}`;

    expect(normalizeMediaUrl(url)).toBe(
      `https://pub-0ca80f02c91947fe9a67f96ec272c6a2.r2.dev/aline2/${path}`,
    );
  });
});
