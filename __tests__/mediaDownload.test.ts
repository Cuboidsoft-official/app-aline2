jest.mock("expo-file-system", () => ({
  documentDirectory: "file:///mock-documents/",
  downloadAsync: jest.fn(async (_url: string, targetUri: string) => ({ uri: targetUri })),
}), { virtual: true });

jest.mock("expo-media-library", () => ({
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  saveToLibraryAsync: jest.fn(async () => undefined),
  createAssetAsync: jest.fn(async () => ({ id: "asset-1" })),
}), { virtual: true });

import { getMediaFileExtension, saveMediaToGallery } from "../src/utils/mediaDownload";

const mediaLibrary = require("expo-media-library");

describe("media download filename handling", () => {
  it("preserves image extensions from remote URLs", () => {
    expect(getMediaFileExtension("https://cdn.example.com/photo.webp?width=900")).toBe("webp");
  });

  it("preserves video extensions from remote URLs", () => {
    expect(getMediaFileExtension("https://cdn.example.com/video.mp4?download=1")).toBe("mp4");
  });

  it("uses a safe default when a URL has no extension", () => {
    expect(getMediaFileExtension("https://cdn.example.com/media/abc")).toBe("jpg");
  });

  it("downloads the media and saves it to the device gallery", async () => {
    const savedUri = await saveMediaToGallery("https://cdn.example.com/photo.webp", "chat-photo");

    expect(savedUri).toContain("chat-photo_");
    expect(savedUri).toContain(".webp");
    expect(mediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true);
    expect(mediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith(savedUri);
  });

  it("falls back to createAssetAsync when saveToLibraryAsync fails", async () => {
    mediaLibrary.saveToLibraryAsync.mockRejectedValueOnce(new Error("save failed"));

    const savedUri = await saveMediaToGallery("https://cdn.example.com/photo.png", "chat-photo");

    expect(savedUri).toContain("chat-photo_");
    expect(savedUri).toContain(".png");
    expect(mediaLibrary.createAssetAsync).toHaveBeenCalledWith(savedUri);
  });

  it("does not report success when gallery permission is denied", async () => {
    mediaLibrary.requestPermissionsAsync.mockResolvedValueOnce({ status: "denied" });

    await expect(
      saveMediaToGallery("https://cdn.example.com/photo.jpg", "chat-photo"),
    ).rejects.toThrow("Gallery permission is required");
  });
});
