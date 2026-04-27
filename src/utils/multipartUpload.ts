import { Platform } from "react-native";

import { appConfig } from "../config/env";
import { getActiveConnectionConfig } from "../api/api";
import { getStoredToken } from "./authSession";

type MultipartOptions = {
  path: string;
  body: FormData;
  timeoutMs?: number;
};

const joinUrl = (baseUrl: string, path: string): string => {
  const normalizedBase = String(baseUrl || "").replace(/\/+$/, "");
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  return `${normalizedBase}/${normalizedPath}`;
};

const buildUploadBaseUrls = (): string[] => {
  const activeBaseUrl = String(getActiveConnectionConfig()?.apiBaseUrl || "").trim();
  const configuredBaseUrls = Array.isArray(appConfig.connectionCandidates)
    ? appConfig.connectionCandidates
      .map((entry) => String(entry?.apiBaseUrl || "").trim())
      .filter(Boolean)
    : [];

  return Array.from(new Set([activeBaseUrl, ...configuredBaseUrls].filter(Boolean)));
};

const withTimeout = async (promise: Promise<Response>, timeoutMs = 120000): Promise<Response> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<Response>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error("Request timed out");
      (error as Error & { code?: string }).code = "ECONNABORTED";
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export const postMultipart = async ({ path, body, timeoutMs = 120000 }: MultipartOptions) => {
  const token = await getStoredToken();
  const requestBaseUrls = buildUploadBaseUrls();
  let lastError: any = null;

  for (const baseUrl of requestBaseUrls) {
    const requestUrl = joinUrl(baseUrl, path);

    try {
      const response = await withTimeout(
        fetch(requestUrl, {
          method: "POST",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            "x-device-platform": Platform.OS,
            "x-device-name": `${Platform.OS}-${String(Platform.Version || "unknown")}`,
          },
          body,
        }),
        timeoutMs,
      );

      const rawText = await response.text();
      let data: any = null;

      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = rawText;
      }

      if (!response.ok) {
        const error: Error & {
          config?: { url: string };
          response?: { status: number; data: any };
        } = new Error(
          String(data?.message || data || `Request failed with status ${response.status}`),
        );
        error.config = { url: requestUrl };
        error.response = {
          status: response.status,
          data,
        };
        throw error;
      }

      return data;
    } catch (error: any) {
      lastError = error;
      const hasServerResponse = Boolean(error?.response);
      if (hasServerResponse) {
        break;
      }
    }
  }

  if (lastError && !lastError.config) {
    lastError.config = {
      url: joinUrl(requestBaseUrls[0] || String(getActiveConnectionConfig()?.apiBaseUrl || ""), path),
    };
  }

  throw lastError;
};
