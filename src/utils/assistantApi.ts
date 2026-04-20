import { GEMINI_API_KEY } from "@env";

import { API } from "../api/api";

export type AssistantHistoryEntry = {
  role: "user" | "assistant";
  text: string;
};

export type AssistantResponse = {
  success?: boolean;
  reply?: string;
  model?: string;
  message?: string;
};

type AskSupportAssistantParams = {
  message: string;
  history?: AssistantHistoryEntry[];
  scope?: string;
  scopeHint?: string;
  conversationSummary?: string;
  recentMessages?: string[];
};

const SUPPORT_SYSTEM_INSTRUCTION = `
You are the official Aline2 AI support assistant.

Your job:
- Help users with chat, seller registration, appointments, payments, profile, bank setup, notifications, and app troubleshooting.
- Answer in a practical, friendly, concise style.
- Prefer step-by-step help when the user seems blocked.
- Keep the answer focused on Aline2 app support.
`.trim();

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const ASSISTANT_ENDPOINT_TIMEOUT_MS = 15000;
const DIRECT_GEMINI_TIMEOUT_MS = 20000;

const toLimitedString = (value: unknown, maxLength = 1200) => String(value || "").trim().slice(0, maxLength);

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const buildContextPrompt = ({
  scope,
  scopeHint,
  conversationSummary,
  recentMessages = [],
}: Omit<AskSupportAssistantParams, "message" | "history">) => {
  const sections = [`Screen: ${toLimitedString(scope, 120) || "General support"}`];

  if (scopeHint) {
    sections.push(`Screen details: ${toLimitedString(scopeHint, 500)}`);
  }

  if (conversationSummary) {
    sections.push(`Conversation summary: ${toLimitedString(conversationSummary, 1000)}`);
  }

  const normalizedRecentMessages = (Array.isArray(recentMessages) ? recentMessages : [])
    .map((item) => toLimitedString(item, 500))
    .filter(Boolean)
    .slice(0, 8);

  if (normalizedRecentMessages.length) {
    sections.push(`Recent chat context:\n- ${normalizedRecentMessages.join("\n- ")}`);
  }

  return sections.join("\n\n");
};

const extractGeminiReply = (payload: any) => {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const combinedText = parts
      .map((part: any) => String(part?.text || "").trim())
      .filter(Boolean)
      .join("\n");

    if (combinedText) {
      return combinedText;
    }
  }

  return "";
};

const askGeminiDirectly = async ({
  message,
  history = [],
  scope,
  scopeHint,
  conversationSummary,
  recentMessages = [],
}: AskSupportAssistantParams): Promise<AssistantResponse> => {
  const apiKey = String(GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("Gemini API key is not configured in the app.");
  }

  const contextPrompt = buildContextPrompt({
    scope,
    scopeHint,
    conversationSummary,
    recentMessages,
  });

  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

  if (contextPrompt) {
    contents.push({
      role: "user",
      parts: [{ text: `Aline2 support context:\n${contextPrompt}` }],
    });
  }

  history.slice(-12).forEach((entry) => {
    const text = toLimitedString(entry?.text, 4000);
    if (!text) {
      return;
    }

    contents.push({
      role: entry.role === "assistant" ? "model" : "user",
      parts: [{ text }],
    });
  });

  contents.push({
    role: "user",
    parts: [{ text: toLimitedString(message, 4000) }],
  });

  const response = await withTimeout(
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DEFAULT_GEMINI_MODEL)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SUPPORT_SYSTEM_INSTRUCTION }],
          },
          contents,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 700,
            topP: 0.9,
          },
        }),
      },
    ),
    DIRECT_GEMINI_TIMEOUT_MS,
    "Gemini support request timed out. Please try again.",
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Gemini request failed");
  }

  const reply = extractGeminiReply(payload);
  if (!reply) {
    throw new Error("Gemini returned an empty response");
  }

  return {
    success: true,
    reply,
    model: DEFAULT_GEMINI_MODEL,
  };
};

export const askSupportAssistant = async ({
  message,
  history = [],
  scope,
  scopeHint,
  conversationSummary,
  recentMessages = [],
}: AskSupportAssistantParams): Promise<AssistantResponse> => {
  try {
    const response = await withTimeout(
      API.post(
        "/assistant/support-chat",
        {
          message,
          history,
          scope,
          scopeHint,
          conversationSummary,
          recentMessages,
        },
        {
          timeout: ASSISTANT_ENDPOINT_TIMEOUT_MS,
        },
      ),
      ASSISTANT_ENDPOINT_TIMEOUT_MS + 1000,
      "Assistant backend request timed out. Switching to Gemini fallback.",
    );

    return response.data as AssistantResponse;
  } catch (error: any) {
    const statusCode = Number(error?.response?.status || 0);
    const shouldFallbackToDirectGemini =
      !statusCode || statusCode === 404 || statusCode === 405 || statusCode === 501 || statusCode >= 500;

    if (!shouldFallbackToDirectGemini) {
      throw error;
    }

    return askGeminiDirectly({
      message,
      history,
      scope,
      scopeHint,
      conversationSummary,
      recentMessages,
    });
  }
};
