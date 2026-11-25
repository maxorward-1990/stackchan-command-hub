import { describe, expect, it } from "vitest";
import { SUMMARY_TIMELINE_MAX, clock, summarizeTest, summaryText, type SummaryEvent } from "./test-summary";
import type { PerfSample } from "./performance";

const ev = (elapsedMs: number, text: string, kind: SummaryEvent["kind"] = "serial"): SummaryEvent => ({ elapsedMs, kind, text });
const perf = (ms: number, heap: number, extra: Partial<PerfSample> = {}): PerfSample => ({
  v: 1, fw: "custom-v76", ms, window_ms: 1000, cpu0: 10, cpu1: 10, ticks0: 0, ticks1: 0, loop_us: 0, gap_us: 0, ws_us: 0, audio_us: 0,
  mic_us: 0, lcd_us: 0, services_us: 0, loops: 0, frames: 0, queue_ms: 0, slots: 0, underruns: 0, dropped: 0, wait_ms: 0,
  heap, largest: heap / 2, psram: 4_000_000, stack: 0, rssi: -50, ble: 0, mode: "idle", skipped: 0, ...extra,
});

describe("summarizeTest", () => {
  it("counts wake, conversation and markers from a normal session", () => {
    const s = summarizeTest([
      ev(0, "Test started", "marker"),
      ev(1000, "[WAKE] ready model=wn9 word=histackchan chunk=512 threshold=0.450"),
      ev(5000, "[WAKE] detected word=histackchan threshold=0.450 detect_us=900 peak=9000"),
      ev(5200, "[WAKE] starting conversation (same path as display tap)"),
      ev(6000, "GeminiLive: setupComplete"),
      ev(9000, "[TUR] klar"),
      ev(9100, "> api #3 GET /api/status", "command"),
      ev(12000, "GeminiLive: disconnect reason=idle"),
      ev(13000, "[WAKE] rejected reason=low_signal peak=200 recent_peak=300 min_peak=1500"),
      ev(14000, "lampan blinkade", "marker"),
    ], [perf(1000, 90_000), perf(2000, 70_000, { underruns: 2, wait_ms: 40 })], 120_000, 0, ["custom-v76"]);
    expect(s.durationMin).toBe(2);
    expect(s.firmware).toEqual(["custom-v76"]);
    expect(s.wake).toEqual({ ready: 1, detected: 1, rejectedLowSignal: 1, paused: 0, problems: 0 });
    expect(s.conversation).toEqual({ sessions: 1, turnsDone: 1, interrupted: 0, disconnects: { idle: 1 } });
    expect(s.problems).toEqual({ reboots: 0, crashes: 0, errorLines: 0 });
    expect(s.counts).toMatchObject({ commands: 1, markers: 2 });
    expect(s.memory).toMatchObject({ minHeap: 70_000, minLargest: 35_000, maxWaitMs: 40, underruns: 2, perfSamples: 2 });
    expect(s.markers).toEqual(["00:00 Test started", "00:14 lampan blinkade"]);
    expect(s.timeline).toContain("00:06 samtal startat");
  });

  it("flags restarts, crashes, wake problems and error lines", () => {
    const s = summarizeTest([
      ev(1000, "[WAKE] model/buffer allocation failed (retry after 30s)"),
      ev(2000, "Guru Meditation Error: Core  1 panic'ed (LoadProhibited)"),
      ev(2100, "ESP-ROM:esp32s3-20210327"),
      ev(3000, "SmartHome: request failed status=-1"),
    ], [perf(50_000, 90_000), perf(1_000, 95_000)], 10_000, 3);
    expect(s.problems).toEqual({ reboots: 1, crashes: 1, errorLines: 1 });
    expect(s.wake.problems).toBe(1);
    expect(s.counts.dropped).toBe(3);
    expect(s.timeline.some(t => t.includes("KRASCH"))).toBe(true);
    expect(s.timeline.some(t => t.includes("OMSTART"))).toBe(true);
  });

  it("does not count telemetry lines as errors and bounds the timeline", () => {
    const many = Array.from({ length: SUMMARY_TIMELINE_MAX + 5 }, (_, i) => ev(i * 1000, `Camera: frame error ${i}`));
    const s = summarizeTest([ev(0, '[PERF] {"error":1}'), ...many], [], 1000, 0);
    expect(s.problems.errorLines).toBe(SUMMARY_TIMELINE_MAX + 5);
    expect(s.timeline).toHaveLength(SUMMARY_TIMELINE_MAX + 1);
    expect(s.timeline.at(-1)).toContain("5 fler");
  });

  it("renders a short Swedish overview", () => {
    const text = summaryText(summarizeTest([], [], 60_000, 0));
    expect(text.split("\n")).toHaveLength(5);
    expect(text).toContain("Test 1 min");
    expect(clock(61_500)).toBe("01:01");
  });
});
