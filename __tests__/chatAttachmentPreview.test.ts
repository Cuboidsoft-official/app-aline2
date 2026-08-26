import {
  getAttachmentPreviewThumbs,
  getAttachmentPreviewCountLabel,
  shouldShowAttachmentPreviewCountBadge,
} from "../src/utils/chatAttachmentPreview";

describe("chat attachment preview helpers", () => {
  it("counts multi-image attachments and keeps only a preview window", () => {
    const result = getAttachmentPreviewThumbs(
      [
        { uri: "a", kind: "image" },
        { uri: "b", kind: "image" },
        { uri: "c", kind: "image" },
        { uri: "d", kind: "image" },
        { uri: "e", kind: "image" },
        { uri: "f", kind: "video" },
      ],
      4,
    );

    expect(result.total).toBe(5);
    expect(result.visible.length).toBe(4);
    expect(result.extraCount).toBe(1);
  });

  it("formats the label for multiple selected photos", () => {
    expect(
      getAttachmentPreviewCountLabel([
        { uri: "a", kind: "image" },
        { uri: "b", kind: "image" },
        { uri: "c", kind: "image" },
      ]),
    ).toBe("3 photos");
  });

  it("shows a badge only when more than one image is selected", () => {
    expect(shouldShowAttachmentPreviewCountBadge([{ uri: "a", kind: "image" }, { uri: "b", kind: "image" }])).toBe(true);
    expect(shouldShowAttachmentPreviewCountBadge([{ uri: "a", kind: "image" }])).toBe(false);
  });
});
