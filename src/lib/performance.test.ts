import { describe, expect, it } from "vitest";
import { appendPerf, importPerf, parsePerf, percentile, validatePerf } from "./performance";
const data = {
  v: 1, fw: "custom-v36", ms: 1000, window_ms: 1000, cpu0: 20, cpu1: 80, ticks0: 100, ticks1: 100,
  loop_us: 23000, gap_us: 33000, ws_us: 5000, audio_us: 200, mic_us: 0, lcd_us: 15000, services_us: 400,
  loops: 50, frames: 11, queue_ms: 300, slots: 2, underruns: 0, dropped: 0, wait_ms: 0,
  heap: 100000, largest: 60000, psram: 5000000, stack: 4000, rssi: -55, ble: 0, mode: "speaking", skipped: 0,
};
describe("performance telemetry", () => {
  it("parses concrete firmware measurements", () => {
    expect(parsePerf(`[PERF] ${JSON.stringify(data)}`)).toEqual(data);
  });
  it("keeps unavailable CPU distinct from 0%", () => {
    expect(validatePerf({ ...data, cpu0: -1 })?.cpu0).toBe(-1);
    expect(validatePerf({ ...data, cpu0: 0 })?.cpu0).toBe(0);
  });
  it("rejects invalid and partial data", () => {
    expect(parsePerf('[PERF] {')).toBeNull();
    expect(validatePerf({ ...data, cpu0: 101 })).toBeNull();
    expect(validatePerf({ ...data, heap: -1 })).toBeNull();
    expect(validatePerf({ ...data, lcd_us: NaN })).toBeNull();
    expect(validatePerf({ ...data, v: 2 })).toBeNull();
  });
  it("bounds retained telemetry to 600 samples", () => {
    let samples: typeof data[] = [];
    for (let ms = 1; ms <= 601; ms++) samples = appendPerf(samples, { ...data, ms });
    expect(samples).toHaveLength(600);
    expect(samples[0]?.ms).toBe(2);
  });
  it("starts fresh on reboot", () => {
    expect(appendPerf([data], { ...data, ms: 10 })).toHaveLength(1);
  });
  it("imports logs and strips unrelated sensitive fields", () => {
    const clean = { ...data, secret: "must-not-export" };
    expect(importPerf(`unrelated line\n[PERF] ${JSON.stringify(clean)}`)).toEqual([data]);
    expect(importPerf(JSON.stringify({ samples: [clean] }))).toEqual([data]);
  });
  it("computes observed percentile without inventing benchmarks", () => {
    expect(percentile([4, 1, 3, 2, 100], 0.95)).toBe(100);
    expect(percentile([], 0.95)).toBe(0);
  });
});