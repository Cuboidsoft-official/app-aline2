jest.mock("react-native-blob-util", () => ({
  __esModule: true,
  default: {
    config: jest.fn(() => ({
      fetch: jest.fn(async () => ({
        info: () => ({ status: 200 }),
        path: () => "/mock-cache/media-file",
      })),
    })),
    fs: {
      unlink: jest.fn(async () => undefined),
      stat: jest.fn(async () => ({ size: 1024 })),
      dirs: {
        CacheDir: "/mock-cache",
      },
    },
  },
}), { virtual: true });

jest.mock("@react-native-camera-roll/camera-roll", () => ({
  CameraRoll: {
    save: jest.fn(async (uri: string) => uri),
  },
}), { virtual: true });

import { getMediaFileExtension, saveMediaToGallery, GallerySaveError } from "../src/utils/mediaDownload";

const { CameraRoll } = require("@react-native-camera-roll/camera-roll");
const ReactNativeBlobUtil = require("react-native-blob-util").default;

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

    expect(savedUri).toBe("file:///mock-cache/media-file");
    expect(CameraRoll.save).toHaveBeenCalledWith(savedUri, {
      type: "photo",
      album: "Aline2",
    });
  });

  it("saves videos using the video media type", async () => {
    const savedUri = await saveMediaToGallery("https://cdn.example.com/video.mp4", "chat-video");

    expect(CameraRoll.save).toHaveBeenCalledWith(savedUri, {
      type: "video",
      album: "Aline2",
    });
  });

  it("reports a not-found error for a 404 response", async () => {
    ReactNativeBlobUtil.config.mockReturnValueOnce({
      fetch: jest.fn(async () => ({
        info: () => ({ status: 404 }),
        path: () => "/mock-cache/media-file",
      })),
    });

    await expect(saveMediaToGallery("https://cdn.example.com/missing.webp")).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("reports a timeout error when the request times out", async () => {
    const timeoutFetch = { fetch: jest.fn(async () => { throw new Error("request timed out."); }) };
    ReactNativeBlobUtil.config
      .mockReturnValueOnce(timeoutFetch)
      .mockReturnValueOnce(timeoutFetch)
      .mockReturnValueOnce(timeoutFetch)
      .mockReturnValueOnce(timeoutFetch);

    await expect(
      saveMediaToGallery("https://cdn.example.com/photo.webp").catch((error) => error.code)
    ).resolves.toBe("timeout");
  });

  it("verifies the downloaded file is complete (non-zero size) before saving to the gallery on a good connection", async () => {
    ReactNativeBlobUtil.fs.stat.mockClear();
    CameraRoll.save.mockClear();

    const savedUri = await saveMediaToGallery("https://cdn.example.com/photo.webp", "good-connection");

    expect(ReactNativeBlobUtil.fs.stat).toHaveBeenCalledWith("/mock-cache/media-file");
    // CameraRoll.save must only run after the completeness check passes.
    const statOrder = ReactNativeBlobUtil.fs.stat.mock.invocationCallOrder[0];
    const saveOrder = CameraRoll.save.mock.invocationCallOrder[0];
    expect(statOrder).toBeLessThan(saveOrder);
    expect(savedUri).toBe("file:///mock-cache/media-file");
  });

  it("rejects and never saves a broken (zero-byte) download to the gallery", async () => {
    ReactNativeBlobUtil.config.mockReturnValueOnce({
      fetch: jest.fn(async () => ({
        info: () => ({ status: 200 }),
        path: () => "/mock-cache/media-file",
      })),
    });
    ReactNativeBlobUtil.fs.stat.mockReturnValueOnce(Promise.resolve({ size: 0 }));
    CameraRoll.save.mockClear();

    await expect(saveMediaToGallery("https://cdn.example.com/photo.webp")).rejects.toMatchObject({
      code: "download",
    });
    expect(CameraRoll.save).not.toHaveBeenCalled();
  });

  it("reuses an already-downloaded video from cache instead of fetching it again", async () => {
    ReactNativeBlobUtil.config.mockClear();
    CameraRoll.save.mockClear();
    // Force the first cache-check (before any download) to report "no file yet".
    ReactNativeBlobUtil.fs.stat.mockReturnValueOnce(Promise.resolve(null));

    const videoUrl = "https://cdn.example.com/clip-reuse-test.mp4";
    await saveMediaToGallery(videoUrl, "chat-video");
    expect(ReactNativeBlobUtil.config).toHaveBeenCalledTimes(1);

    const secondUri = await saveMediaToGallery(videoUrl, "chat-video");

    // No additional network fetch was made for the second save of the same video.
    expect(ReactNativeBlobUtil.config).toHaveBeenCalledTimes(1);
    expect(secondUri).toContain("aline2_media_cache");
    expect(CameraRoll.save).toHaveBeenCalledTimes(2);
    expect(CameraRoll.save).toHaveBeenLastCalledWith(secondUri, { type: "video", album: "Aline2" });
  });
});
