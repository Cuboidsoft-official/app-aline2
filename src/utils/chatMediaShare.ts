export function getChatMediaMessageType(url: string = ""): "video" | "image" {
  if (typeof url === "string" && (url.includes(".mp4") || url.includes(".mov") || url.includes(".m3u8"))) {
    return "video";
  }
  return "image";
}

export function buildWhatsAppShareUrl(url: string = ""): string {
  return `https://wa.me/?text=${encodeURIComponent(url)}`;
}
