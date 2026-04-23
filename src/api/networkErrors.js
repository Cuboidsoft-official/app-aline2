import { getActiveConnectionConfig } from "./api";

const isNetworkFailure = (error) => !error?.response;
const isTimeoutFailure = (error) =>
  String(error?.code || "").trim().toUpperCase() === "ECONNABORTED"
  || /timeout/i.test(String(error?.message || ""));

const getModerationBlockedMessage = (error, fallbackMessage) => {
  const responseData = error?.response?.data || {};
  const moderation = responseData?.moderation || {};
  const mediaType = String(moderation?.mediaType || "").trim().toLowerCase();
  const target = String(moderation?.target || "").trim();
  const isChatMedia = String(responseData?.code || "").trim() === "CHAT_MEDIA_BLOCKED";
  const mediaLabel =
    mediaType === "gif"
      ? "GIF"
      : mediaType === "video"
        ? "video"
        : mediaType === "image"
          ? "image"
          : "media";

  if (isChatMedia) {
    return `This ${mediaLabel} may contain restricted content. Choose another file.`;
  }

  if (target.startsWith("media[") || target === "mediaUrl" || target === "storyData.mediaUrl") {
    return `This ${mediaLabel} may contain restricted content. Choose another file.`;
  }

  return fallbackMessage;
};

export const getReadableApiErrorMessage = (error, fallbackMessage = "Please try again.") => {
  if (error?.response?.data?.code) {
    const code = String(error.response.data.code).trim();
    if (code === "OTP_EMAIL_DELIVERY_FAILED") {
      return "We couldn't send the verification email right now. Please try again in a moment.";
    }
    if (code === "OTP_NOT_CONFIGURED") {
      return "Email verification is temporarily unavailable. Please use password or Google sign-in.";
    }
    if (code === "GOOGLE_NOT_CONFIGURED" || code === "GOOGLE_LOGIN_FAILED") {
      return error.response.data.message || "Google Sign-In failed. Please try another sign-in method.";
    }
    if (code === "GOOGLE_TOKEN_INVALID") {
      return "Your Google session has expired. Please try signing in with Google again.";
    }
    if (code === "GOOGLE_AUDIENCE_MISMATCH") {
      return "Google Sign-In is not configured correctly. Please contact support.";
    }
    if (code === "TOO_MANY_ATTEMPTS") {
      return "Too many attempts. Please wait a few minutes and try again.";
    }
    if (code === "CHAT_MEDIA_BLOCKED" || code === "SOCIAL_MEDIA_BLOCKED") {
      return getModerationBlockedMessage(error, fallbackMessage);
    }
    if (code === "CHAT_MODERATION_UNAVAILABLE" || code === "SOCIAL_MEDIA_MODERATION_UNAVAILABLE") {
      return "Safety checks are temporarily unavailable right now. Please try again in a moment.";
    }
  }

  if (error?.response?.data?.message) {
    return String(error.response.data.message);
  }

  if (!isNetworkFailure(error)) {
    return error?.message || fallbackMessage;
  }

  if (isTimeoutFailure(error)) {
    return `The server took too long to respond. Please try again on a stable connection.`;
  }

  return `Unable to connect to the server. Please check your internet connection and try again.`;
};

export const isModerationBlockedError = (error) => {
  const code = String(error?.response?.data?.code || "").trim();
  return code === "CHAT_MEDIA_BLOCKED" || code === "SOCIAL_MEDIA_BLOCKED";
};
