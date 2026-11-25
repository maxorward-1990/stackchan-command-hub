import { describe, expect, it } from 'vitest';
import { TestRecording, safeLine, safeSnapshot, TEST_MAX_EVENTS } from './test-recording';
function harness() {
  let receive: (line: string) => void = () => {}; let perf = false; let now = 1795456440000;
  const calls: boolean[] = [];
  const recorder = new TestRecording({ connected: () => true, subscribe: fn => { receive = fn; return () => { receive = () => {}; }; }, commands: () => () => {}, performance: async enabled => { if (enabled !== undefined) { perf = enabled; calls.push(enabled); } return { enabled: perf }; }, status: async () => ({ firmware: 'custom-v61', secret: 'never-export' }), runtime: async () => ({ speech_languages: 'sv-en', wifi_ssid: 'private' }), now: () => now });
  return { recorder, calls, receive: (line: string) => { now += 100; receive(line); } };
}
describe('one-action test recording', () => {
  it('starts logs, transcript and performance together and restores telemetry on stop', async () => {
    const h = harness(); await h.recorder.start();
    h.receive('[DU] Jag vill att du flashar memory-t'); h.receive('[ROBOT] Okej'); h.receive('[TUR] klar');
    h.recorder.marker('klickade'); const report = await h.recorder.stop();
    expect(h.calls).toEqual([true, false]);
    expect(report.events.some(e => e.text === '[DU] Jag vill att du flashar memory-t')).toBe(true);
    expect(report.events.find(e => e.text === '[TUR] klar')?.elapsedMs).toBe(300);
    expect(report.snapshots).toHaveLength(2);
    expect(report.snapshots[0]?.runtime).toEqual({ speech_languages: 'sv-en' });
    expect(h.recorder.active).toBe(false);
  });
  it('excludes private API bodies, credentials and private memory tools', () => {
    expect(safeLine('API #3 200 {"password":"secret"}')).toBeNull();
    expect(safeLine('[VERKTYG] recall_private_memory {"query":"pin"}')).toBeNull();
    expect(safeLine('api_key=AIzaTESTSECRET')).toBeNull();
    expect(safeSnapshot({ wifi_ssid: 'private', speech_languages: 'sv-en' })).toEqual({ speech_languages: 'sv-en' });
  });
  it('bounds browser capture and reports dropped events', async () => {
    const h = harness(); await h.recorder.start();
    for (let i = 0; i <= TEST_MAX_EVENTS; i++) h.receive('tick');
    const report = await h.recorder.stop();
    expect(report.events).toHaveLength(TEST_MAX_EVENTS); expect(report.dropped).toBeGreaterThan(0);
  });
  it('does not claim ready without telemetry confirmation', async () => {
    const h = harness(); h.recorder['deps'].performance = async () => ({ enabled: false });
    await expect(h.recorder.start()).rejects.toThrow('prestandamätningen'); expect(h.recorder.active).toBe(false);
  });
});
