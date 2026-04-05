/**
 * Photo Filter Presets
 *
 * CSS-based filter presets that can be applied client-side via React Native's
 * Image component style transforms or via the `react-native-color-matrix-image-filters` library.
 *
 * Each preset defines a color matrix (5×4) that can be applied to any image in real-time.
 * These are GPU-accelerated and work without any paid SDK.
 *
 * Usage on frontend:
 *   import { PHOTO_FILTERS } from '../utils/photoFilters';
 *   import { ColorMatrix } from 'react-native-color-matrix-image-filters';
 *
 *   <ColorMatrix matrix={PHOTO_FILTERS.vintage.matrix}>
 *     <Image source={{ uri: photoUri }} />
 *   </ColorMatrix>
 */

// Identity matrix (no change)
const IDENTITY = [
    1, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, 1, 0,
];

export const PHOTO_FILTERS = {
    none: {
        id: "none",
        name: "Normal",
        matrix: IDENTITY,
    },

    vivid: {
        id: "vivid",
        name: "Vivid",
        matrix: [
            1.3, 0, 0, 0, 0,
            0, 1.3, 0, 0, 0,
            0, 0, 1.3, 0, 0,
            0, 0, 0, 1, 0,
        ],
    },

    vintage: {
        id: "vintage",
        name: "Vintage",
        matrix: [
            0.6279, 0.3202, 0.0514, 0, 0.0588,
            0.0299, 0.6938, 0.0762, 0, 0.0588,
            0.0474, 0.1183, 0.5343, 0, 0.0588,
            0, 0, 0, 1, 0,
        ],
    },

    warmth: {
        id: "warmth",
        name: "Warmth",
        matrix: [
            1.2, 0, 0, 0, 0.05,
            0, 1.0, 0, 0, 0,
            0, 0, 0.8, 0, 0,
            0, 0, 0, 1, 0,
        ],
    },

    cool: {
        id: "cool",
        name: "Cool",
        matrix: [
            0.85, 0, 0, 0, 0,
            0, 1.0, 0, 0, 0,
            0, 0, 1.2, 0, 0.05,
            0, 0, 0, 1, 0,
        ],
    },

    noir: {
        id: "noir",
        name: "Noir",
        matrix: [
            0.35, 0.45, 0.2, 0, 0,
            0.25, 0.5, 0.25, 0, 0,
            0.2, 0.35, 0.45, 0, 0,
            0, 0, 0, 1, 0,
        ],
    },

    mono: {
        id: "mono",
        name: "B&W",
        matrix: [
            0.299, 0.587, 0.114, 0, 0,
            0.299, 0.587, 0.114, 0, 0,
            0.299, 0.587, 0.114, 0, 0,
            0, 0, 0, 1, 0,
        ],
    },

    sepia: {
        id: "sepia",
        name: "Sepia",
        matrix: [
            0.393, 0.769, 0.189, 0, 0,
            0.349, 0.686, 0.168, 0, 0,
            0.272, 0.534, 0.131, 0, 0,
            0, 0, 0, 1, 0,
        ],
    },

    fade: {
        id: "fade",
        name: "Fade",
        matrix: [
            1, 0, 0, 0, 0.08,
            0, 1, 0, 0, 0.08,
            0, 0, 1, 0, 0.08,
            0, 0, 0, 0.9, 0,
        ],
    },

    dramatic: {
        id: "dramatic",
        name: "Dramatic",
        matrix: [
            1.5, -0.3, -0.2, 0, 0,
            -0.2, 1.5, -0.3, 0, 0,
            -0.3, -0.2, 1.5, 0, 0,
            0, 0, 0, 1, 0,
        ],
    },

    golden: {
        id: "golden",
        name: "Golden Hour",
        matrix: [
            1.2, 0.1, 0, 0, 0.05,
            0, 1.1, 0, 0, 0.03,
            0, 0, 0.75, 0, 0,
            0, 0, 0, 1, 0,
        ],
    },

    sunset: {
        id: "sunset",
        name: "Sunset",
        matrix: [
            1.3, 0, 0, 0, 0.08,
            0, 0.9, 0, 0, 0.02,
            0, 0, 0.7, 0, 0,
            0, 0, 0, 1, 0,
        ],
    },

    dreamy: {
        id: "dreamy",
        name: "Dreamy",
        matrix: [
            0.9, 0.1, 0.1, 0, 0.06,
            0.1, 0.9, 0.1, 0, 0.06,
            0.15, 0.1, 0.85, 0, 0.06,
            0, 0, 0, 0.95, 0,
        ],
    },

    bloom: {
        id: "bloom",
        name: "Bloom",
        matrix: [
            1.1, 0.05, 0.05, 0, 0.04,
            0.05, 1.1, 0.05, 0, 0.04,
            0.1, 0.05, 1.05, 0, 0.04,
            0, 0, 0, 1, 0,
        ],
    },

    contrast: {
        id: "contrast",
        name: "High Contrast",
        matrix: [
            1.5, 0, 0, 0, -0.15,
            0, 1.5, 0, 0, -0.15,
            0, 0, 1.5, 0, -0.15,
            0, 0, 0, 1, 0,
        ],
    },

    beauty: {
        id: "beauty",
        name: "Beauty",
        matrix: [
            1.05, 0.05, 0.02, 0, 0.04,
            0.02, 1.05, 0.02, 0, 0.03,
            0.02, 0.05, 1.02, 0, 0.04,
            0, 0, 0, 1, 0,
        ],
    },
};

export const PHOTO_FILTER_LIST = Object.values(PHOTO_FILTERS);

export default PHOTO_FILTERS;
