export const extractYouTubeVideoId = (item: any): string => {
  const directId = String(item?.youtubeVideoId || "").trim();
  if (directId) {
    return directId;
  }

  const externalId = String(item?.externalId || "").trim();
  if (externalId && !/^https?:\/\//i.test(externalId)) {
    return externalId.replace(/^youtube:/i, "").trim();
  }

  const candidateUrls = [
    item?.externalUrl,
    item?.previewUrl,
    item?.streamUrl,
    item?.audioUrl,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  for (const candidateUrl of candidateUrls) {
    try {
      const parsed = new URL(candidateUrl);
      const hostname = String(parsed.hostname || "").toLowerCase();

      if (hostname.includes("youtu.be")) {
        return parsed.pathname.replace(/^\/+/, "").trim();
      }

      if (hostname.includes("youtube.com")) {
        const watchId = String(parsed.searchParams.get("v") || "").trim();
        if (watchId) {
          return watchId;
        }

        const embedPathMatch = parsed.pathname.match(/\/(?:embed|shorts)\/([^/?#]+)/i);
        if (embedPathMatch?.[1]) {
          return embedPathMatch[1].trim();
        }
      }
    } catch {
      // Ignore malformed URLs.
    }
  }

  return "";
};
