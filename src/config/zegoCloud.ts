import { ZEGO_CLOUD_APP_ID as ZEGO_CLOUD_APP_ID_ENV, ZEGO_CLOUD_APP_SIGN as ZEGO_CLOUD_APP_SIGN_ENV } from "@env";

const parsedZegoCloudAppId = Number(String(ZEGO_CLOUD_APP_ID_ENV || "").trim());

export const ZEGO_CLOUD_APP_ID = Number.isFinite(parsedZegoCloudAppId) ? parsedZegoCloudAppId : 0;
export const ZEGO_CLOUD_APP_SIGN = String(ZEGO_CLOUD_APP_SIGN_ENV || "").trim();

export const sanitizeZegoRoomId = (value: string | number | null | undefined) =>
  String(value || "")
    .trim()
    .replace(/[^0-9A-Za-z_]/g, "_");
