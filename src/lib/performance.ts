export type PerfSample = {
  v: number; fw: string; ms: number; window_ms: number;
  cpu0: number; cpu1: number; ticks0: number; ticks1: number;
  loop_us: number; gap_us: number; ws_us: number; audio_us: number;
  mic_us: number; lcd_us: number; services_us: number; loops: number; frames: number;
  queue_ms: number; slots: number; underruns: number; dropped: number; wait_ms: number;
  heap: number; largest: number; psram: number; stack: number;
  rssi: number; ble: number; mode: string; skipped: number;
};
export const MAX_PERF_SAMPLES = 600;
const unsignedKeys = ["ms", "window_ms", "ticks0", "ticks1", "loop_us", "gap_us", "ws_us", "audio_us", "mic_us", "lcd_us", "services_us", "loops", "frames", "queue_ms", "slots", "underruns", "dropped", "wait_ms", "heap", "largest", "psram", "stack", "skipped"] as const;
export function validatePerf(value: unknown): PerfSample | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const x = value as Record<string, unknown>;
  if (x["v"] !== 1 || typeof x["fw"] !== "string" || !/^custom-v\d+$/.test(x["fw"])) return null;
  for (const k of unsignedKeys) {
    const n = x[k];
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) return null;
  }
  for (const k of ["cpu0", "cpu1"] as const) {
    const n = x[k];
    if (typeof n !== "number" || !Number.isInteger(n) || n < -1 || n > 100) return null;
  }
  if (typeof x["rssi"] !== "number" || !Number.isInteger(x["rssi"]) || x["rssi"] < -127 || x["rssi"] > 0) return null;
  if (x["ble"] !== 0 && x["ble"] !== 1) return null;
  if (!['speaking', 'listening', 'tool', 'waiting', 'idle'].includes(String(x["mode"]))) return null;
  if (Number(x["window_ms"]) === 0) return null;
  // Copy only the known schema; never export unrelated log content or secrets.
  const clean: Record<string, unknown> = {};
  for (const k of [...unsignedKeys, "v", "fw", "cpu0", "cpu1", "rssi", "ble", "mode"]) clean[k] = x[k];
  return clean as unknown as PerfSample;
}
export function parsePerf(line: string): PerfSample | null {
  if (!line.startsWith("[PERF] ") || line.length > 2048) return null;
  try { return validatePerf(JSON.parse(line.slice(7))); } catch { return null; }
}
export function appendPerf(list: PerfSample[], sample: PerfSample): PerfSample[] {
  // Uptime reset or firmware change starts a new series, not a misleading continuous graph.
  const previous = list.at(-1);
  const base = previous && (sample.ms < previous.ms || sample.fw !== previous.fw) ? [] : list;
  return [...base, sample].slice(-MAX_PERF_SAMPLES);
}
export function importPerf(text: string): PerfSample[] {
  let values: PerfSample[] = [];
  try {
    const json: unknown = JSON.parse(text);
    if (json && typeof json === "object" && "samples" in json && Array.isArray(json.samples)) {
      values = json.samples.map(validatePerf).filter((x): x is PerfSample => x !== null);
    }
  } catch { /* A normal console log is not JSON. */ }
  if (!values.length) values = text.split(/\r?\n/).map(parsePerf).filter((x): x is PerfSample => x !== null);
  return values.slice(-MAX_PERF_SAMPLES);
}
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0;
}