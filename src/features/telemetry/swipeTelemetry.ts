import { API } from "../../api/api";
import uuid from "react-native-uuid";

/**
 * Phase 10C -- invisible engagement telemetry for the Swipes/Reels player
 * only. Not used by Feed. Events go through the Aline2 backend's own
 * POST /api/telemetry/swipe-events endpoint.
 *
 * Every call here is fire-and-forget: a network failure must never affect
 * video playback or any other UX. Failures are swallowed, not surfaced.
 */

export type SwipeTelemetryEventType =
  | "impression"
  | "video_start"
  | "watch_progress"
  | "complete"
  | "skip"
  | "rewatch";

type EmitArgs = {
  eventType: SwipeTelemetryEventType;
  eventId: string;
  userId: string;
  postId: string;
  creatorId?: string;
  position?: number;
  watchTimeMs?: number;
  videoDurationMs?: number;
  completionRate?: number;
};

// Client-side idempotency: prevents re-emitting the same (view, threshold)
// pair on rapid re-renders/duplicate callback firings. Bounded so it can
// never grow unbounded across a long session.
const emittedEventIds = new Set<string>();
const MAX_TRACKED_EVENT_IDS = 500;
const sessionId = `${Date.now().toString(36)}-${uuid.v4()}`;
const CONFIG_TTL_MS = 60_000;
let configEnabled = false;
let configExpiresAt = 0;
let configRequest: Promise<boolean> | null = null;

// The backend controls this flag and also gates POSTs from older app builds.
// Fail closed on unavailable or stale configuration; one GET is shared by
// concurrent events and cached for at most a minute while Swipes is active.
export function refreshSwipeTelemetryGate(force = false): Promise<boolean> {
  if (!force && Date.now() < configExpiresAt) {
    return Promise.resolve(configEnabled);
  }
  if (configRequest) {
    return configRequest;
  }
  configEnabled = false;
  configRequest = API.get("/telemetry/config", { timeout: 5000 })
    .then((response) => {
      configEnabled = response.data?.success === true && response.data?.enabled === true;
      return configEnabled;
    })
    .catch(() => {
      configEnabled = false;
      return false;
    })
    .finally(() => {
      configExpiresAt = Date.now() + CONFIG_TTL_MS;
      configRequest = null;
    });
  return configRequest;
}

function rememberEventId(eventId: string): void {
  emittedEventIds.add(eventId);
  if (emittedEventIds.size > MAX_TRACKED_EVENT_IDS) {
    const oldest = emittedEventIds.values().next().value;
    if (oldest) {
      emittedEventIds.delete(oldest);
    }
  }
}

function emitSwipeTelemetryEvent(args: EmitArgs): void {
  if (!args.userId || !args.postId || emittedEventIds.has(args.eventId)) {
    return;
  }
  const send = () => {
    if (emittedEventIds.has(args.eventId)) return;
    // Mark before the POST resolves so callback replays cannot duplicate it.
    rememberEventId(args.eventId);
    API.post("/telemetry/swipe-events", {
      eventId: args.eventId,
      eventType: args.eventType,
      postId: args.postId,
      creatorId: args.creatorId,
      surface: "swipe",
      position: args.position,
      watchTimeMs: args.watchTimeMs,
      videoDurationMs: args.videoDurationMs,
      completionRate: args.completionRate,
      timestamp: new Date().toISOString(),
    }).catch(() => {
      // Best-effort telemetry must never interrupt playback.
    });
  };

  if (Date.now() < configExpiresAt) {
    if (configEnabled) send();
  } else {
    refreshSwipeTelemetryGate().then((enabled) => {
      if (enabled) send();
    });
  }
}

const PROGRESS_THRESHOLDS = [0.25, 0.5, 0.75];
const MIN_WATCHED_MS_TO_AVOID_SKIP = 3000;
const MIN_COMPLETION_TO_AVOID_SKIP = 0.25;

type ViewState = {
  postId: string;
  creatorId?: string;
  position?: number;
  viewSeq: number;
  emittedVideoStart: boolean;
  emittedThresholds: Set<number>;
  emittedCompleteOnce: boolean;
  durationMs: number;
  maxWatchTimeMs: number;
  maxCompletionRate: number;
};

/**
 * One instance per currently-active Swipes item. SwipesScreen creates a new
 * tracker whenever the active item changes and finalizes the previous one
 * (emitting `skip` if it never reached a meaningful watch threshold).
 */
export function createSwipeViewTracker(params: {
  userId: string;
  postId: string;
  creatorId?: string;
  position?: number;
  viewSeq: number;
  sessionId?: string;
}): {
  handleImpression: () => void;
  handleLoad: (durationMs: number) => void;
  handleProgress: (currentTimeSec: number, totalDurationSec: number) => void;
  handleEnd: () => void;
  finalize: () => void;
} {
  const state: ViewState = {
    postId: params.postId,
    creatorId: params.creatorId,
    position: params.position,
    viewSeq: params.viewSeq,
    emittedVideoStart: false,
    emittedThresholds: new Set(),
    emittedCompleteOnce: false,
    durationMs: 0,
    maxWatchTimeMs: 0,
    maxCompletionRate: 0,
  };

  const idPrefix = `swipe:${params.userId}:${params.postId}:${params.sessionId || sessionId}:${params.viewSeq}`;

  const handleImpression = () => {
    emitSwipeTelemetryEvent({
      eventType: "impression",
      eventId: `${idPrefix}:impression`,
      userId: params.userId,
      postId: params.postId,
      creatorId: params.creatorId,
      position: params.position,
    });
  };

  const handleLoad = (durationMs: number) => {
    if (durationMs > 0) {
      state.durationMs = durationMs;
    }
    if (state.emittedVideoStart) {
      return;
    }
    state.emittedVideoStart = true;
    emitSwipeTelemetryEvent({
      eventType: "video_start",
      eventId: `${idPrefix}:video_start`,
      userId: params.userId,
      postId: params.postId,
      creatorId: params.creatorId,
      position: params.position,
      videoDurationMs: state.durationMs || undefined,
    });
  };

  const handleProgress = (currentTimeSec: number, totalDurationSec: number) => {
    const watchTimeMs = Math.max(0, Math.round((currentTimeSec || 0) * 1000));
    const totalMs = Math.max(0, Math.round((totalDurationSec || 0) * 1000)) || state.durationMs;
    if (watchTimeMs > state.maxWatchTimeMs) {
      state.maxWatchTimeMs = watchTimeMs;
    }
    if (totalMs <= 0) {
      return;
    }
    const completionRate = Math.max(0, Math.min(1, watchTimeMs / totalMs));
    if (completionRate > state.maxCompletionRate) {
      state.maxCompletionRate = completionRate;
    }

    // Threshold-based, not per-tick: at most one network call per threshold
    // crossed per view (Phase 10B design, Part 10).
    for (const threshold of PROGRESS_THRESHOLDS) {
      if (completionRate >= threshold && !state.emittedThresholds.has(threshold)) {
        state.emittedThresholds.add(threshold);
        emitSwipeTelemetryEvent({
          eventType: "watch_progress",
          eventId: `${idPrefix}:watch_progress:${Math.round(threshold * 100)}`,
          userId: params.userId,
          postId: params.postId,
          creatorId: params.creatorId,
          position: params.position,
          watchTimeMs,
          videoDurationMs: totalMs,
          completionRate,
        });
      }
    }
  };

  const emitCompleteOrRewatch = () => {
    const isRewatch = state.emittedCompleteOnce;
    emitSwipeTelemetryEvent({
      eventType: isRewatch ? "rewatch" : "complete",
      eventId: isRewatch
        ? `${idPrefix}:rewatch:${Date.now()}`
        : `${idPrefix}:complete`,
      userId: params.userId,
      postId: params.postId,
      creatorId: params.creatorId,
      position: params.position,
      watchTimeMs: state.maxWatchTimeMs || undefined,
      videoDurationMs: state.durationMs || undefined,
      completionRate: 1,
    });
    state.emittedCompleteOnce = true;
    state.maxCompletionRate = 1;
  };

  const handleEnd = () => {
    emitCompleteOrRewatch();
  };

  const finalize = () => {
    // The view ended (item scrolled away) without ever looping to the end.
    // If it also never reached a meaningful watch threshold, record a skip.
    if (state.emittedCompleteOnce) {
      return;
    }
    const watchedEnough =
      state.maxWatchTimeMs >= MIN_WATCHED_MS_TO_AVOID_SKIP ||
      state.maxCompletionRate >= MIN_COMPLETION_TO_AVOID_SKIP;
    if (watchedEnough) {
      return;
    }
    emitSwipeTelemetryEvent({
      eventType: "skip",
      eventId: `${idPrefix}:skip`,
      userId: params.userId,
      postId: params.postId,
      creatorId: params.creatorId,
      position: params.position,
      watchTimeMs: state.maxWatchTimeMs || undefined,
      videoDurationMs: state.durationMs || undefined,
      completionRate: state.maxCompletionRate || undefined,
    });
  };

  return { handleImpression, handleLoad, handleProgress, handleEnd, finalize };
}
