/**
 * Chat Theme Color Presets
 *
 * These map to the `chatTheme` field on the Conversation model.
 * Each theme defines gradient colors for sent/received bubble backgrounds,
 * chat background color, and accent colors.
 *
 * Usage:
 *   import { CHAT_THEMES } from '../utils/chatThemes';
 *   const theme = CHAT_THEMES[conversation.chatTheme || 'default'];
 */

export interface ChatThemeColors {
    id: string;
    name: string;
    sentBubble: string[];       // gradient from → to
    receivedBubble: string;
    sentBubbleText: string;
    receivedBubbleText: string;
    background: string;
    accent: string;
    headerBg: string;
    inputBg: string;
}

export const CHAT_THEMES: Record<string, ChatThemeColors> = {
    default: {
        id: "default",
        name: "Default",
        sentBubble: ["#0084FF", "#0066CC"],
        receivedBubble: "#E4E6EB",
        sentBubbleText: "#FFFFFF",
        receivedBubbleText: "#1C1E21",
        background: "#FFFFFF",
        accent: "#0084FF",
        headerBg: "#FFFFFF",
        inputBg: "#F0F2F5",
    },

    love: {
        id: "love",
        name: "Love",
        sentBubble: ["#FF6B6B", "#EE5A24"],
        receivedBubble: "#FFE8E8",
        sentBubbleText: "#FFFFFF",
        receivedBubbleText: "#5C2018",
        background: "#FFF5F5",
        accent: "#FF6B6B",
        headerBg: "#FFF0F0",
        inputBg: "#FFE8E8",
    },

    ocean: {
        id: "ocean",
        name: "Ocean",
        sentBubble: ["#0ABDE3", "#0C8FE0"],
        receivedBubble: "#E0F4FD",
        sentBubbleText: "#FFFFFF",
        receivedBubbleText: "#1A3C5A",
        background: "#F0FAFF",
        accent: "#0ABDE3",
        headerBg: "#E8F8FF",
        inputBg: "#E0F4FD",
    },

    sunset: {
        id: "sunset",
        name: "Sunset",
        sentBubble: ["#F97316", "#EF4444"],
        receivedBubble: "#FFF0E5",
        sentBubbleText: "#FFFFFF",
        receivedBubbleText: "#7C2D12",
        background: "#FFFBF5",
        accent: "#F97316",
        headerBg: "#FFF5EB",
        inputBg: "#FFF0E5",
    },

    forest: {
        id: "forest",
        name: "Forest",
        sentBubble: ["#10B981", "#059669"],
        receivedBubble: "#DCFCE7",
        sentBubbleText: "#FFFFFF",
        receivedBubbleText: "#14532D",
        background: "#F0FDF4",
        accent: "#10B981",
        headerBg: "#ECFDF5",
        inputBg: "#DCFCE7",
    },

    midnight: {
        id: "midnight",
        name: "Midnight",
        sentBubble: ["#7C3AED", "#5B21B6"],
        receivedBubble: "#2D2946",
        sentBubbleText: "#FFFFFF",
        receivedBubbleText: "#E0D9F6",
        background: "#0F0D1A",
        accent: "#7C3AED",
        headerBg: "#1A1730",
        inputBg: "#2D2946",
    },

    lavender: {
        id: "lavender",
        name: "Lavender",
        sentBubble: ["#A78BFA", "#8B5CF6"],
        receivedBubble: "#EDE9FE",
        sentBubbleText: "#FFFFFF",
        receivedBubbleText: "#4C1D95",
        background: "#FAF5FF",
        accent: "#A78BFA",
        headerBg: "#F5F0FF",
        inputBg: "#EDE9FE",
    },

    neon: {
        id: "neon",
        name: "Neon",
        sentBubble: ["#06D6A0", "#118AB2"],
        receivedBubble: "#1A1A2E",
        sentBubbleText: "#FFFFFF",
        receivedBubbleText: "#06D6A0",
        background: "#0F0F23",
        accent: "#06D6A0",
        headerBg: "#16162B",
        inputBg: "#1A1A2E",
    },

    retro: {
        id: "retro",
        name: "Retro",
        sentBubble: ["#E8A838", "#D4791C"],
        receivedBubble: "#F5E6D0",
        sentBubbleText: "#FFFFFF",
        receivedBubbleText: "#5A3E1B",
        background: "#FDF8EF",
        accent: "#E8A838",
        headerBg: "#FAF0DD",
        inputBg: "#F5E6D0",
    },

    minimal: {
        id: "minimal",
        name: "Minimal",
        sentBubble: ["#374151", "#1F2937"],
        receivedBubble: "#F3F4F6",
        sentBubbleText: "#FFFFFF",
        receivedBubbleText: "#1F2937",
        background: "#FFFFFF",
        accent: "#374151",
        headerBg: "#FAFAFA",
        inputBg: "#F3F4F6",
    },
};

export const CHAT_THEME_LIST = Object.values(CHAT_THEMES);

export default CHAT_THEMES;
