import { parsePerf } from './performance';
import { summarizeTest, summaryText, type TestSummary } from './test-summary';

export const TEST_MAX_BYTES = 4 * 1024 * 1024;
export const TEST_MAX_EVENTS = 20000;
export const TEST_MAX_MS = 30 * 60 * 1000;
export interface TestEvent { receivedAt: string; elapsedMs: number; kind: 'serial' | 'command' | 'marker'; text: string }
export interface TestReport {
  schema: 'stackchan-test-v1'; startedAt: string; stoppedAt: string; reason: string;
  transport: 'usb';
  /** Short human/Claude-readable overview; read this first. */
  summaryText: string; summary: TestSummary;
  events: TestEvent[]; dropped: number;
  snapshots: { phase: string; receivedAt: string; status: unknown; runtime: unknown }[];
  performance: { receivedAt: string; elapsedMs: number; sample: NonNullable<ReturnType<typeof parsePerf>> }[];
  limitations: string[];
}
export interface RecordingDependencies {
  connected: () => boolean;
  subscribe: (fn: (line: string) => void) => () => void;
  commands: (fn: (line: string) => void) => () => void;
  performance: (enabled?: boolean) => Promise<{ enabled: boolean }>;
  status: () => Promise<unknown>; runtime: () => Promise<unknown>;
  now: () => number;
}
// Only measurements/config flags are exported from API reads. No SSIDs, keys,
// IP addresses, prompts, private memory, images, audio, or arbitrary API bodies.
const safeKeys = new Set(['fw', 'firmware', 'firmware_version', 'version', 'gemini', 'model', 'state', 'connected', 'ready', 'recording', 'speaking', 'last_error', 'audio_dropped', 'audio_wait_ms', 'speech_languages', 'gemini_model', 'gemini_voice', 'speaker_volume', 'mic_magnification', 'mic_noise_filter_level', 'vad_prefix_padding_ms', 'vad_silence_duration_ms', 'vad_start_sensitivity_high', 'vad_end_sensitivity_low', 'vad_turn_includes_all_input', 'wifi_enabled', 'web_enabled', 'gemini_enabled', 'gateway_enabled', 'web_search_enabled', 'smart_home_enabled', 'tool_wikipedia', 'tool_images', 'tool_gestures', 'tool_camera', 'tool_memory', 'tool_screen', 'tool_emotions', 'sensors', 'battery', 'level', 'percent', 'voltage', 'clock', 'rtc_available', 'rtc_valid', 'rtc_set_from_network', 'seeded_from_rtc', 'utc', 'heap', 'psram', 'rssi', 'enabled']);
export function safeSnapshot(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key]) => safeKeys.has(key)).map(([key, val]) => [key, val && typeof val === 'object' ? safeSnapshot(val) : typeof val === 'string' ? redactText(val).slice(0, 256) : val]));
}
export function redactText(text: string): string {
  return text.replace(/\b(?:AIza|sk-|tvly-)[\w-]+/g, '[REDACTED]')
    .replace(/((?:password|passwd|api[_ -]?key|token|secret|authorization|pin)\s*[=:]\s*)(?:"[^"]*"|[^\s,}]+)/gi, '$1[REDACTED]');
}
export function safeLine(line: string): string | null {
  if (/^(?:API #|> api #)/.test(line) || /remember_private_memory|recall_private_memory|\/api\/(?:secrets|prompts|audio|camera)/.test(line) || /(?:password|passwd|api[_ -]?key|token|secret|authorization|pin)\s*[=:]/i.test(line)) return null;
  return redactText(line).slice(0, 4096);
}
export class TestRecording {
  active = false; busy = false; report: TestReport | null = null;
  events: TestEvent[] = []; dropped = 0; private bytes = 0; private started = 0;
  private snapshots: TestReport['snapshots'] = []; private previousPerf = false;
  private unsubscribers: (() => void)[] = []; private timer: ReturnType<typeof setTimeout> | null = null;
  private stopping: Promise<TestReport> | null = null;
  constructor(private deps: RecordingDependencies) {}
  private add(kind: TestEvent['kind'], text: string) {
    if (!this.active) return;
    const clean = safeLine(text); if (clean === null) return;
    const size = new TextEncoder().encode(clean).byteLength + 128;
    if (this.events.length >= TEST_MAX_EVENTS || this.bytes + size > TEST_MAX_BYTES) { this.dropped++; return; }
    this.bytes += size;
    const now = this.deps.now();
    this.events.push({ receivedAt: new Date(now).toISOString(), elapsedMs: now - this.started, kind, text: clean });
  }
  marker(text: string) { this.add('marker', text); }
  private async snapshot(phase: string) {
    const [status, runtime] = await Promise.allSettled([this.deps.status(), this.deps.runtime()]);
    this.snapshots.push({ phase, receivedAt: new Date(this.deps.now()).toISOString(), status: status.status === 'fulfilled' ? safeSnapshot(status.value) : { unavailable: true }, runtime: runtime.status === 'fulfilled' ? safeSnapshot(runtime.value) : { unavailable: true } });
  }
  async start(options: { performance?: boolean } = {}) {
    const wantPerf = options.performance ?? true;
    if (this.active || this.busy) throw new Error('Ett test pågår redan.');
    if (!this.deps.connected()) throw new Error('Anslut USB först; fullständig logginsamling kräver USB.');
    this.busy = true; this.report = null; this.events = []; this.snapshots = []; this.bytes = 0; this.dropped = 0; this.stopping = null;
    this.started = this.deps.now(); this.active = true;
    this.unsubscribers = [this.deps.subscribe(line => this.add('serial', line)), this.deps.commands(line => this.add('command', line))];
    let enabled = false;
    try {
      this.previousPerf = (await this.deps.performance()).enabled;
      if (wantPerf) {
        const ack = await this.deps.performance(true); enabled = true;
        if (!ack.enabled) throw new Error('Roboten kunde inte slå på prestandamätningen.');
      }
      await this.snapshot('start');
      this.marker('Test started: serial, transcripts, timing, performance and status.');
      this.timer = setTimeout(() => { void this.stop('30-minute limit').catch(() => undefined); }, TEST_MAX_MS);
    } catch (error) {
      this.active = false; this.cleanup();
      if (enabled) await this.deps.performance(this.previousPerf).catch(() => undefined);
      throw error;
    } finally { this.busy = false; }
  }
  private cleanup() { this.unsubscribers.forEach(fn => fn()); this.unsubscribers = []; if (this.timer) clearTimeout(this.timer); this.timer = null; }
  stop(reason = 'user'): Promise<TestReport> {
    if (this.stopping) return this.stopping;
    if (!this.active || this.busy) return Promise.reject(new Error('Inget färdigt startat test.'));
    this.busy = true;
    this.stopping = (async () => {
      await this.snapshot('end');
      try { const ack = await this.deps.performance(this.previousPerf); if (ack.enabled !== this.previousPerf) this.marker('Warning: performance setting not restored.'); }
      catch { this.marker('Warning: connection lost; performance setting could not be restored.'); }
      this.marker(`Test stopped: ${reason}`);
      this.active = false; this.cleanup();
      const performance = this.events.flatMap(event => { const sample = parsePerf(event.text); return sample ? [{ receivedAt: event.receivedAt, elapsedMs: event.elapsedMs, sample }] : []; });
      const snapshotFw = this.snapshots.flatMap(x => { const st = x.status as Record<string, unknown>; return ['fw', 'firmware', 'firmware_version', 'version'].map(k => st?.[k]).filter((v): v is string => typeof v === 'string'); });
      const summary = summarizeTest(this.events, performance.map(p => p.sample), this.deps.now() - this.started, this.dropped, snapshotFw);
      this.report = { schema: 'stackchan-test-v1', startedAt: new Date(this.started).toISOString(), stoppedAt: new Date(this.deps.now()).toISOString(), reason, transport: 'usb', summaryText: summaryText(summary), summary, events: [...this.events], dropped: this.dropped, snapshots: this.snapshots, performance,
        limitations: ['Local text logs only; no PCM, camera capture or automatic upload.', 'Conversation text may contain personal information: review before sharing.', 'receivedAt is browser UTC reception time; device ms is uptime, not UTC. Network/buffering delay remains unknown.', 'CPU is a tick-sampling estimate; nested stage maxima overlap.', 'Raw API responses and sensitive tool lines are excluded; snapshots use an allowlist.', 'Only events received during this test are included. No historical conversations fetched.', 'Capture limited to 30 minutes, 20000 events and 4 MiB event budget; omitted events counted.'] };
      this.busy = false;
      return this.report;
    })();
    return this.stopping;
  }
}
