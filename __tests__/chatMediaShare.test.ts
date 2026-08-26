import { buildWhatsAppShareUrl, getChatMediaMessageType } from "../src/utils/chatMediaShare";

describe("chat media sharing", () => {
  it("uses video message type for video URLs", () => {
    expect(getChatMediaMessageType("https://cdn.example.com/chat/video.mp4?token=1")).toBe("video");
  });

  it("keeps image message type for image URLs", () => {
    expect(getChatMediaMessageType("https://cdn.example.com/chat/photo.webp")).toBe("image");
  });

  it("builds an encoded WhatsApp share URL", () => {
    expect(buildWhatsAppShareUrl("https://cdn.example.com/photo.jpg?a=1")).toBe(
      "https://wa.me/?text=https%3A%2F%2Fcdn.example.com%2Fphoto.jpg%3Fa%3D1",
    );
  });
});
