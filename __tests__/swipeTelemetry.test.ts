import { createSwipeViewTracker, refreshSwipeTelemetryGate } from "../src/features/telemetry/swipeTelemetry";

jest.mock("../src/api/api", () => ({
  API: { get: jest.fn(), post: jest.fn() },
}));

const { API } = require("../src/api/api");

describe("createSwipeViewTracker (Phase 10C engagement telemetry)", () => {
  beforeEach(async () => {
    (API.get as jest.Mock).mockReset();
    (API.post as jest.Mock).mockReset();
    (API.get as jest.Mock).mockResolvedValue({ data: { success: true, enabled: true } });
    (API.post as jest.Mock).mockResolvedValue({ data: { success: true } });
    await refreshSwipeTelemetryGate(true);
  });

  it("does not throw when the telemetry request fails -- playback must never be interrupted", () => {
    (API.post as jest.Mock).mockRejectedValue(new Error("network down"));
    const tracker = createSwipeViewTracker({ userId: "u1", postId: "p1", viewSeq: 1 });

    expect(() => tracker.handleImpression()).not.toThrow();
    expect(() => tracker.handleLoad(30000)).not.toThrow();
    expect(() => tracker.handleProgress(5, 30)).not.toThrow();
    expect(() => tracker.handleEnd()).not.toThrow();
  });

  it("emits at most one watch_progress call per threshold, not per player tick", () => {
    const tracker = createSwipeViewTracker({ userId: "u1", postId: "p1", viewSeq: 2 });
    tracker.handleLoad(10000); // 10s video

    // Simulate ~20 rapid onProgress ticks climbing from 0 to 9.5s -- as
    // react-native-video's onProgress would fire many times per second.
    for (let tick = 0; tick <= 19; tick += 1) {
      tracker.handleProgress((tick / 19) * 9.5, 10);
    }

    const progressCalls = (API.post as jest.Mock).mock.calls.filter(
      (call) => call[1]?.eventType === "watch_progress"
    );
    // 25%, 50%, 75% thresholds -- exactly 3 calls despite 20 ticks.
    expect(progressCalls).toHaveLength(3);
  });

  it("does not re-emit the same threshold if progress oscillates or re-renders replay the same tick", () => {
    const tracker = createSwipeViewTracker({ userId: "u1", postId: "p1", viewSeq: 3 });
    tracker.handleLoad(10000);
    tracker.handleProgress(3, 10); // 30% -> crosses 25%
    tracker.handleProgress(3, 10); // identical tick replayed
    tracker.handleProgress(2.9, 10); // slight rewind, still above 25%

    const progressCalls = (API.post as jest.Mock).mock.calls.filter(
      (call) => call[1]?.eventType === "watch_progress"
    );
    expect(progressCalls).toHaveLength(1);
  });

  it("emits impression once and video_start once per view, even if handlers fire repeatedly", () => {
    const tracker = createSwipeViewTracker({ userId: "u1", postId: "p1", viewSeq: 4 });
    tracker.handleImpression();
    tracker.handleImpression();
    tracker.handleLoad(10000);
    tracker.handleLoad(10000);

    const impressionCalls = (API.post as jest.Mock).mock.calls.filter((c) => c[1]?.eventType === "impression");
    const startCalls = (API.post as jest.Mock).mock.calls.filter((c) => c[1]?.eventType === "video_start");
    expect(impressionCalls).toHaveLength(1);
    expect(startCalls).toHaveLength(1);
  });

  it("emits complete on the first onEnd and rewatch on subsequent loops of the same view", () => {
    const tracker = createSwipeViewTracker({ userId: "u1", postId: "p1", viewSeq: 5 });
    tracker.handleEnd();
    tracker.handleEnd();

    const eventTypes = (API.post as jest.Mock).mock.calls.map((c) => c[1]?.eventType);
    expect(eventTypes).toEqual(["complete", "rewatch"]);
  });

  it("emits skip on finalize when the view never reached a meaningful watch threshold", () => {
    const tracker = createSwipeViewTracker({ userId: "u1", postId: "p1", viewSeq: 6 });
    tracker.handleLoad(30000);
    tracker.handleProgress(1, 30); // barely watched, well under thresholds
    tracker.finalize();

    const skipCalls = (API.post as jest.Mock).mock.calls.filter((c) => c[1]?.eventType === "skip");
    expect(skipCalls).toHaveLength(1);
  });

  it("does not emit skip on finalize if the view already completed", () => {
    const tracker = createSwipeViewTracker({ userId: "u1", postId: "p1", viewSeq: 7 });
    tracker.handleEnd(); // complete
    tracker.finalize();

    const skipCalls = (API.post as jest.Mock).mock.calls.filter((c) => c[1]?.eventType === "skip");
    expect(skipCalls).toHaveLength(0);
  });

  it("sends stable, deterministic eventIds so a resent request is idempotent", () => {
    const tracker = createSwipeViewTracker({ userId: "u42", postId: "postABC", viewSeq: 9 });
    tracker.handleImpression();
    const [, payload] = (API.post as jest.Mock).mock.calls[0];
    expect(payload.eventId).toMatch(/^swipe:u42:postABC:[^:]+:9:impression$/);
    expect(payload.userId).toBeUndefined(); // userId is not in the body; backend derives it from the auth token
  });

  it("uses different event IDs for identical views in separate app sessions", () => {
    createSwipeViewTracker({ userId: "u42", postId: "postABC", viewSeq: 1, sessionId: "session-one" }).handleImpression();
    createSwipeViewTracker({ userId: "u42", postId: "postABC", viewSeq: 1, sessionId: "session-two" }).handleImpression();

    const ids = (API.post as jest.Mock).mock.calls.map((call) => call[1].eventId);
    expect(ids).toEqual([
      "swipe:u42:postABC:session-one:1:impression",
      "swipe:u42:postABC:session-two:1:impression",
    ]);
  });

  it("emits nothing when operations disable telemetry", async () => {
    (API.get as jest.Mock).mockResolvedValue({ data: { success: true, enabled: false } });
    await refreshSwipeTelemetryGate(true);
    const tracker = createSwipeViewTracker({ userId: "u42", postId: "postABC", viewSeq: 11 });
    tracker.handleImpression();
    tracker.handleLoad(10000);
    tracker.handleProgress(8, 10);
    tracker.finalize();
    expect(API.post).not.toHaveBeenCalled();
  });

  it("fails closed when the config request fails", async () => {
    (API.get as jest.Mock).mockRejectedValue(new Error("offline"));
    await refreshSwipeTelemetryGate(true);
    createSwipeViewTracker({ userId: "u42", postId: "postABC", viewSeq: 12 }).handleImpression();
    expect(API.post).not.toHaveBeenCalled();
  });

  it("shares one config request across a cold set of events before posting", async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(now + 61_000);
    (API.get as jest.Mock).mockClear();
    try {
      const tracker = createSwipeViewTracker({ userId: "u42", postId: "postABC", viewSeq: 13 });
      tracker.handleImpression();
      tracker.handleLoad(10000);
      expect(API.post).not.toHaveBeenCalled();
      await refreshSwipeTelemetryGate();
      expect(API.get).toHaveBeenCalledTimes(1);
      expect(API.post).toHaveBeenCalledTimes(2);
    } finally {
      clock.mockRestore();
    }
  });

  it("does not call the network at all without a userId or postId", () => {
    const tracker = createSwipeViewTracker({ userId: "", postId: "p1", viewSeq: 10 });
    tracker.handleImpression();
    expect(API.post).not.toHaveBeenCalled();
  });
});
