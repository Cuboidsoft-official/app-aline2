/**
 * Chat Sticker API Utility
 *
 * Provides functions to fetch stickers from the backend for use in chat.
 * Stickers are managed via the admin panel (CRUD already exists at /admin/stickers)
 * and fetched publicly via /stickers routes.
 *
 * Usage in chat:
 *   import { fetchStickersForChat, fetchStickersByCategory, searchStickers } from '../utils/chatStickerApi';
 *
 *   // In sticker picker bottom sheet:
 *   const stickers = await fetchStickersForChat();
 *   const loveStickers = await fetchStickersByCategory('love');
 *   const results = await searchStickers('happy');
 *
 *   // Send sticker as message:
 *   await API.post('/message/send', {
 *     conversationId,
 *     text: sticker.name,
 *     messageType: 'image',     // stickers are sent as image messages
 *     stickerUrl: sticker.imageUrl, // frontend renders this as a sticker bubble
 *   });
 */

import { API } from "../api/api";

export interface ChatSticker {
    _id: string;
    name: string;
    type: "gif" | "emoji" | "animated" | "static";
    imageUrl: string;
    thumbnailUrl?: string;
    category: string;
    tags: string[];
    useCount: number;
}

/**
 * Fetch all active stickers (paginated, sorted by popularity)
 */
export async function fetchStickersForChat(page = 1, limit = 50): Promise<ChatSticker[]> {
    try {
        const res = await API.get(`/stickers?page=${page}&limit=${limit}`);
        return res.data?.stickers || res.data?.data || [];
    } catch (error) {
        console.log("fetchStickersForChat error:", error);
        return [];
    }
}

/**
 * Fetch stickers by category
 */
export async function fetchStickersByCategory(category: string): Promise<ChatSticker[]> {
    try {
        const res = await API.get(`/stickers/category/${encodeURIComponent(category)}`);
        return res.data?.stickers || res.data?.data || [];
    } catch (error) {
        console.log("fetchStickersByCategory error:", error);
        return [];
    }
}

/**
 * Search stickers by name or tag
 */
export async function searchStickers(query: string): Promise<ChatSticker[]> {
    try {
        const res = await API.get(`/stickers/search?q=${encodeURIComponent(query)}`);
        return res.data?.stickers || res.data?.data || [];
    } catch (error) {
        console.log("searchStickers error:", error);
        return [];
    }
}

export default {
    fetchStickersForChat,
    fetchStickersByCategory,
    searchStickers,
};
