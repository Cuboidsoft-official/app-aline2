/**
 * Video Trim Configuration
 *
 * These are the supported video trim settings. The actual trimming should be done
 * using `react-native-video-trim` (free, MIT) or `ffmpeg-kit-react-native` (LGPL, free).
 *
 * Installation:
 *   npm install react-native-video-trim
 *   // or for full FFmpeg power:
 *   npm install ffmpeg-kit-react-native
 *
 * Usage with react-native-video-trim:
 *   import { showEditor } from 'react-native-video-trim';
 *   const result = await showEditor(videoUri, {
 *     maxDuration: MAX_VIDEO_DURATION_SECS,
 *   });
 *
 * Usage with ffmpeg-kit-react-native:
 *   import { FFmpegKit } from 'ffmpeg-kit-react-native';
 *   await FFmpegKit.execute(`-i ${input} -ss ${startSec} -to ${endSec} -c copy ${output}`);
 *
 * Aspect Ratio presets for post creation:
 */

/** Max video duration in seconds for different content types */
export const VIDEO_DURATION_LIMITS = {
    post: 60,        // 60 seconds for regular posts
    story: 30,       // 30 seconds for stories
    swipe: 90,       // 90 seconds for reels/swipes
    message: 180,    // 3 minutes for chat videos
};

/** Supported aspect ratios */
export const ASPECT_RATIOS = [
    { id: "original", name: "Original", ratio: null },
    { id: "portrait", name: "Portrait (9:16)", ratio: 9 / 16, width: 1080, height: 1920 },
    { id: "square", name: "Square (1:1)", ratio: 1, width: 1080, height: 1080 },
    { id: "landscape", name: "Landscape (16:9)", ratio: 16 / 9, width: 1920, height: 1080 },
    { id: "four_five", name: "4:5", ratio: 4 / 5, width: 1080, height: 1350 },
];

/**
 * Build FFmpeg trim command
 *
 * @param inputPath - path to input video
 * @param outputPath - path for output video
 * @param startSec - start time in seconds
 * @param endSec - end time in seconds
 * @param aspectRatio - optional aspect ratio id from ASPECT_RATIOS
 * @returns FFmpeg command string
 */
export function buildTrimCommand(
    inputPath: string,
    outputPath: string,
    startSec: number,
    endSec: number,
    aspectRatio?: string,
): string {
    const duration = endSec - startSec;
    let filters = "";

    const matched = ASPECT_RATIOS.find((ar) => ar.id === aspectRatio);
    if (matched && matched.ratio) {
        filters = ` -vf "crop=ih*${matched.ratio}:ih"`;
    }

    return `-i "${inputPath}" -ss ${startSec} -t ${duration}${filters} -c:a copy "${outputPath}"`;
}

/**
 * Build FFmpeg merge command for multiple clips
 *
 * @param inputPaths - array of input video paths
 * @param outputPath - output video path
 * @returns FFmpeg command string
 */
export function buildMergeCommand(inputPaths: string[], outputPath: string): string {
    const inputs = inputPaths.map((p) => `-i "${p}"`).join(" ");
    const filterInputs = inputPaths.map((_, i) => `[${i}:v:0][${i}:a:0]`).join("");
    return `${inputs} -filter_complex "${filterInputs}concat=n=${inputPaths.length}:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" "${outputPath}"`;
}

export default {
    VIDEO_DURATION_LIMITS,
    ASPECT_RATIOS,
    buildTrimCommand,
    buildMergeCommand,
};
