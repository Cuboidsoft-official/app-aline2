import { Share } from "react-native";
import { API } from "../api/api";
import { appConfig } from "../config/env";

const FALLBACK_PUBLIC_URL = "https://aline2.com";

const isValidUrl = (value) => {
  try {
    return Boolean(new URL(String(value || "").trim()));
  } catch {
    return false;
  }
};

export const createShortShareUrl = async ({ originalUrl, title, description }) => {
  if (!isValidUrl(originalUrl)) {
    return null;
  }

  const response = await API.post("/share/create", {
    originalUrl,
    title: title || "",
    description: description || "",
  });

  const shortUrl = String(response?.data?.data?.shortUrl || "").trim();
  if (shortUrl) {
    return shortUrl;
  }

  const shortCode = response?.data?.data?.shortCode;
  const baseUrl = (appConfig.publicShareBaseUrl || FALLBACK_PUBLIC_URL).replace(/\/+$/, "");
  return shortCode ? `${baseUrl}/s/${shortCode}` : null;
};

export const shareContentLink = async ({
  originalUrl,
  title,
  description,
  fallbackMessage,
}) => {
  const cleanFallback = String(fallbackMessage || title || "Check this out on Aline2").trim();

  try {
    const shortUrl = await createShortShareUrl({ originalUrl, title, description });

    if (shortUrl) {
      const parts = [title, description, shortUrl].filter(Boolean);
      await Share.share({
        message: parts.join("\n\n"),
      });
      return shortUrl;
    }
  } catch (error) {
    console.log("share short link error:", error);
  }

  const messageParts = [cleanFallback];
  if (isValidUrl(originalUrl)) {
    messageParts.push(originalUrl);
  } else if (FALLBACK_PUBLIC_URL) {
    messageParts.push(FALLBACK_PUBLIC_URL);
  }

  await Share.share({
    message: messageParts.filter(Boolean).join("\n\n"),
  });

  return null;
};
