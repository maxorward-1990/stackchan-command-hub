import { describe, expect, it } from "vitest";
import { compare, DIAGNOSIS_STEPS, runDiagnosis, TEXT_TURNS, VOICE_TRIES, type DiagnosisDeps, type DiagnosisOptions, type DiagnosisResult, type DiagnosisRobot } from "./standard-diagnosis";

const OPTS: DiagnosisOptions = { servo: true, camera: true, voiceSim: true, lampService: true, idleSeconds: 2 };

/** A simulated robot on a virtual clock: serial lines are emitted as fake time advances. */
function fakeRobot(over: { noDiagnostic?: boolean; sensorsThrow?: boolean; rebootAt?: number | undefined; wakeMisses?: number; keepTalking?: boolean } = {}) {
  let now = 1_000_000;
  let uptime = 50_000;
  const queue: { at: number; line: string }[] = [];
  let sub: ((l: string) => void) | null = null;
  let speakingUntil = 0;
  let threshold = 490;
  let diag = false;
  let wakeMisses = over.wakeMisses ?? 0;
  let lastPerf = now;
  const calls: string[] = [];
  const emit = (delay: number, line: string) => queue.push({ at: now + delay, line });
  const advance = (ms: number) => {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + 50);
      uptime += 50;
      if (over.rebootAt !== undefined && now - 1_000_000 >= over.rebootAt) { uptime = 1000; over.rebootAt = undefined; }
      if (now - lastPerf >= 1000) {
        lastPerf = now;
        sub?.(`[PERF] ${JSON.stringify({ v: 1, fw: "custom-v77", ms: uptime, window_ms: 1000, cpu0: 20, cpu1: 30, ticks0: 1, ticks1: 1, loop_us: 900, gap_us: 0, ws_us: 0, audio_us: 0, mic_us: 0, lcd_us: 0, services_us: 0, loops: 100, frames: 0, queue_ms: 0, slots: 0, underruns: 0, dropped: 0, wait_ms: 0, heap: 80000, largest: 40000, psram: 4000000, stack: 1000, rssi: -55, ble: 0, mode: "idle", skipped: 0 })}`);
      }
      queue.sort((a, b) => a.at - b.at);
      while (queue.length && queue[0]!.at <= now) sub?.(queue.shift()!.line);
    }
  };
  const talk = (prompt: string) => {
    emit(100, "[TID] start text");
    if (prompt.includes("klockan")) emit(500, "[VERKTYG] get_current_time");
    if (prompt.includes("skärmen")) emit(500, "[VERKTYG] show_text");
    emit(800, "[TID] forsta_ljud_ms=800");
    if (prompt.includes("planeter")) { speakingUntil = now + 20_000; return; }
    emit(1500, "[TID] tur_klar_ms=1500");
    emit(2500, "[TID] uppspelning_klar_ms=2500");
    speakingUntil = now + 2500;
  };
  const robot: DiagnosisRobot = {
    status: async () => { calls.push("status"); return { firmware_version: "custom-v77", uptime_ms: uptime, wifi_ip: "192.168.0.188", wake_word_available: true, wake_word_listening: true, diagnostic_mode_ms: diag ? 1000 : 0, web_search: { configured: true }, smart_home: { configured: true, last_ok: true }, gemini: { speaking: over.keepTalking ? true : now < speakingUntil, recording: false, tool_pending: false } }; },
    personality: async () => ({ personality: { wake_word: true, wake_threshold_milli: threshold } }),
    savePersonality: async (p) => { calls.push(`save:${p.wake_threshold_milli}`); threshold = p.wake_threshold_milli; return { ok: true }; },
    sensors: async () => { if (over.sensorsThrow) throw new Error("sensor timeout"); return { imu: { accel_ok: true, temp_c: 31 }, ltr553: { ps_ok: true } }; },
    servoStatus: async () => ({ ok: true }),
    diagnostic: async (active) => { calls.push(`diag:${active}`); if (over.noDiagnostic) throw new Error("Roboten svarade 404"); diag = active; return { ok: true, active, remaining_ms: active ? 900000 : 0 }; },
    led: async (mode, hex) => { calls.push(`led:${mode}${hex ? ":" + hex : ""}`); return {}; },
    emotion: async (e) => { calls.push(`emotion:${e}`); return {}; },
    showText: async () => ({}),
    clearScreen: async () => { calls.push("clear"); return {}; },
    cameraFrame: async () => ({ ok: true, jpeg_bytes: 12000 }),
    startAudioTest: async () => ({ ok: true, id: 7, state: "recording" }),
    audioTestStatus: async () => ({ ok: true, id: 7, state: "ready", peak: 4000, rms: 300, clipped_samples: 0, captured_ms: 3000 }),
    clearAudioTest: async () => ({}),
    gesture: async () => ({}),
    look: async () => ({}),
    home: async () => { calls.push("home"); return {}; },
    searchTest: async () => ({}),
    searchResult: async () => ({ busy: false, last_ok: true, last_duration_ms: 900, last_http_status: 200 }),
    homeScenes: async () => ({ ok: true, scenes: [{}, {}] }),
    say: async (text) => { calls.push("say"); talk(text); return { ok: true }; },
    interrupt: async () => { calls.push("interrupt"); speakingUntil = 0; return {}; },
    toggleVoice: async () => { calls.push("toggle"); return {}; },
  };
  const answers: string[] = [];
  let abortAfter: number | null = null;
  const deps: DiagnosisDeps = {
    robot,
    subscribe: (fn) => { sub = fn; return () => { sub = null; }; },
    now: () => now,
    sleep: async (ms) => { advance(Math.max(1, ms)); },
    ask: async (q) => { answers.push(q); return true; },
    speak: async (text) => {
      calls.push(`speak:${text}`);
      if (text.startsWith("Hi Stack")) { if (wakeMisses > 0) wakeMisses--; else emit(300, "[WAKE] detected word=histackchan threshold=0.490"); }
      else { emit(3000, "[TID] uppspelning_klar_ms=3000"); speakingUntil = now + 3000; }
      advance(600);
    },
    progress: () => undefined,
    aborted: () => abortAfter !== null && now - 1_000_000 > abortAfter,
  };
  return { deps, calls, answers, setAbortAfter: (ms: number) => { abortAfter = ms; }, threshold: () => threshold };
}

describe("runDiagnosis", () => {
  it("runs every step on a healthy robot, measures, restores and pauses memory", async () => {
    const f = fakeRobot();
    const r = await runDiagnosis(f.deps, OPTS);
    expect(r.verdict).toBe("ok");
    expect(r.firmware).toBe("custom-v77");
    expect(r.steps.map((s) => s.id)).toEqual([...DIAGNOSIS_STEPS.map((s) => s.id), "global"]);
    expect(r.steps.every((s) => s.verdict === "ok")).toBe(true);
    expect(f.calls.filter((c) => c.startsWith("diag:"))).toEqual(["diag:true", "diag:false"]);
    expect(f.calls.filter((c) => c === "say")).toHaveLength(TEXT_TURNS.length + 1);
    expect(f.calls).toContain("interrupt");
    expect(f.threshold()).toBe(490);
    expect(f.calls.at(-1)).not.toMatch(/^save/);
    expect(r.keyMetrics["första_ljud_ms_snitt"]).toBe(800);
    expect(r.keyMetrics["väckord_träffar"]).toBe(VOICE_TRIES);
    expect(r.keyMetrics["omstarter"]).toBe(0);
    expect(f.answers).toHaveLength(3);
    const gemini = r.steps.find((s) => s.id === "gemini")!;
    expect(gemini.metrics["clock_verktyg"]).toBe("get_current_time");
    expect(gemini.metrics["avbrott_tyst_inom_4s"]).toBe(true);
    expect(r.summaryText.split("\n")[0]).toContain("totalt: OK");
  });

  it("keeps going after a failing step and still restores everything", async () => {
    const f = fakeRobot({ sensorsThrow: true });
    const r = await runDiagnosis(f.deps, OPTS);
    expect(r.steps.find((s) => s.id === "hardware")!.verdict).toBe("fel");
    expect(r.steps.find((s) => s.id === "gemini")!.verdict).toBe("ok");
    expect(r.verdict).toBe("fel");
    expect(f.calls).toContain("diag:false");
  });

  it("restores settings and ends diagnostic mode when aborted mid-run", async () => {
    const f = fakeRobot();
    f.setAbortAfter(4000);
    const r = await runDiagnosis(f.deps, OPTS);
    expect(r.aborted).toBe(true);
    expect(r.steps.some((s) => s.notes.some((n) => n.includes("Avbruten")))).toBe(true);
    expect(f.calls.filter((c) => c.startsWith("diag:"))).toEqual(["diag:true", "diag:false"]);
    expect(f.calls).toContain("led:auto");
    expect(f.calls).toContain("emotion:neutral");
    expect(r.steps.at(-2)!.id).toBe("restore");
  });

  it("warns on firmware without diagnostic mode and never tries to switch it off", async () => {
    const f = fakeRobot({ noDiagnostic: true });
    const r = await runDiagnosis(f.deps, OPTS);
    expect(r.steps[0]!.verdict).toBe("varning");
    expect(f.calls.filter((c) => c.startsWith("diag:"))).toEqual(["diag:true"]);
  });

  it("skips disabled options", async () => {
    const f = fakeRobot();
    const r = await runDiagnosis(f.deps, { ...OPTS, servo: false, voiceSim: false });
    expect(r.steps.find((s) => s.id === "servo")!.verdict).toBe("hoppad");
    expect(r.steps.find((s) => s.id === "voice")!.verdict).toBe("hoppad");
    expect(f.calls.some((c) => c.startsWith("speak:"))).toBe(false);
    expect(r.verdict).toBe("ok");
  });

  it("flags a reboot during the run, missed wake words and a robot that will not stop talking", async () => {
    const reboot = await runDiagnosis(fakeRobot({ rebootAt: 20_000 }).deps, OPTS);
    expect(reboot.keyMetrics["omstarter"]).toBeGreaterThan(0);
    expect(reboot.verdict).toBe("fel");
    const misses = await runDiagnosis(fakeRobot({ wakeMisses: 1 }).deps, OPTS);
    expect(misses.steps.find((s) => s.id === "voice")!.verdict).toBe("varning");
    expect(misses.keyMetrics["väckord_träffar"]).toBe(VOICE_TRIES - 1);
    const talking = await runDiagnosis(fakeRobot({ keepTalking: true }).deps, { ...OPTS, voiceSim: false });
    expect(talking.steps.find((s) => s.id === "gemini")!.verdict).toBe("fel");
  });

  it("marks a step as failed when the owner answers no", async () => {
    const f = fakeRobot();
    f.deps.ask = async (q) => !q.startsWith("Nickade");
    const r = await runDiagnosis(f.deps, OPTS);
    expect(r.steps.find((s) => s.id === "servo")!.verdict).toBe("fel");
  });
});

describe("compare", () => {
  const prev = { startedAt: "2026-11-25T17:00:00.000Z", firmware: "custom-v76", keyMetrics: { första_ljud_ms_snitt: 1000, väckord_träffar: 2 } } as unknown as DiagnosisResult;
  it("explains improvements and regressions", () => {
    const out = compare({ första_ljud_ms_snitt: 800, väckord_träffar: 1 }, prev, "custom-v77");
    expect(out[0]).toContain("annan firmware");
    expect(out).toContain("Tid till första ljud: 1000 → 800 (-20 %) bättre");
    expect(out).toContain("Väckordsträffar: 2 → 1 (-50 %) sämre");
  });
  it("handles a first run", () => {
    expect(compare({}, null, "custom-v77")).toEqual(["Ingen tidigare körning att jämföra med."]);
  });
});
