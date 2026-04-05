/**
 * Face Overlay Stickers (AR-lite)
 *
 * Since full AR face tracking (DeepAR, Banuba) requires paid SDKs ($99-499/mo),
 * this module provides an overlay-based approach using static/animated stickers
 * that users can position on their photos/videos manually.
 *
 * For actual face-tracking AR filters in the future, consider:
 * - DeepAR (https://deepar.ai) - $99/mo, best React Native support
 * - Banuba (https://banuba.com) - $299/mo, most Instagram-like
 * - react-native-vision-camera + mediapipe face mesh (free but complex)
 *
 * The stickers below are positioned by the user via drag gestures,
 * similar to Instagram story stickers, and composited onto the image/video
 * before upload.
 *
 * Usage:
 *   import { FACE_STICKER_CATEGORIES } from '../utils/faceOverlayStickers';
 *   // Render draggable sticker overlay on camera preview
 */

export interface FaceSticker {
    id: string;
    name: string;
    emoji: string;       // Fallback emoji for rendering
    category: string;
    /** URL to sticker image — loaded from the admin Sticker collection via /stickers API */
    imageUrl?: string;
}

export const FACE_STICKER_CATEGORIES = [
    {
        id: "accessories",
        name: "Accessories",
        stickers: [
            { id: "sunglasses", name: "Sunglasses", emoji: "🕶️", category: "accessories" },
            { id: "crown", name: "Crown", emoji: "👑", category: "accessories" },
            { id: "hat_cowboy", name: "Cowboy Hat", emoji: "🤠", category: "accessories" },
            { id: "tophat", name: "Top Hat", emoji: "🎩", category: "accessories" },
            { id: "headband", name: "Headband", emoji: "🌸", category: "accessories" },
            { id: "bow", name: "Bow", emoji: "🎀", category: "accessories" },
        ],
    },
    {
        id: "fun",
        name: "Fun",
        stickers: [
            { id: "dog_ears", name: "Dog Ears", emoji: "🐶", category: "fun" },
            { id: "cat_ears", name: "Cat Ears", emoji: "🐱", category: "fun" },
            { id: "bunny_ears", name: "Bunny Ears", emoji: "🐰", category: "fun" },
            { id: "devil_horns", name: "Devil Horns", emoji: "😈", category: "fun" },
            { id: "angel_halo", name: "Angel Halo", emoji: "😇", category: "fun" },
            { id: "clown_nose", name: "Clown Nose", emoji: "🤡", category: "fun" },
        ],
    },
    {
        id: "celebrations",
        name: "Celebrations",
        stickers: [
            { id: "party_hat", name: "Party Hat", emoji: "🥳", category: "celebrations" },
            { id: "confetti", name: "Confetti", emoji: "🎊", category: "celebrations" },
            { id: "sparkles", name: "Sparkles", emoji: "✨", category: "celebrations" },
            { id: "hearts", name: "Hearts", emoji: "💕", category: "celebrations" },
            { id: "stars", name: "Stars", emoji: "⭐", category: "celebrations" },
            { id: "fireworks", name: "Fireworks", emoji: "🎆", category: "celebrations" },
        ],
    },
    {
        id: "moods",
        name: "Moods",
        stickers: [
            { id: "tears_joy", name: "Tears of Joy", emoji: "😂", category: "moods" },
            { id: "heart_eyes", name: "Heart Eyes", emoji: "😍", category: "moods" },
            { id: "fire", name: "Fire", emoji: "🔥", category: "moods" },
            { id: "thinking", name: "Thinking", emoji: "🤔", category: "moods" },
            { id: "mind_blown", name: "Mind Blown", emoji: "🤯", category: "moods" },
            { id: "100", name: "100", emoji: "💯", category: "moods" },
        ],
    },
];

export const ALL_FACE_STICKERS = FACE_STICKER_CATEGORIES.flatMap((cat) =>
    cat.stickers.map((s) => ({ ...s, categoryName: cat.name }))
);

export default FACE_STICKER_CATEGORIES;
