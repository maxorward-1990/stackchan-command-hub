// Standard diagnosis: one fixed, repeatable programme that exercises the robot through the
// shared robot client and reports measurements, verdicts and a comparison with the previous run.
// Pure orchestration: every robot call, the serial log, timing, owner questions and computer
// speech are injected, so the whole run is tested against a fake robot (standard-diagnosis.test.ts).
// Physical effects are limited to LEDs, face, screen text, a short gesture, the speaker and (optional)
// computer speech; lamps are only listed, never switched. Every changed setting is restored.
import { guessReplyLanguage } from "./reply-language";
import { applyLine, newRun, type SpeechRun } from "./speech-timing";
import { parsePerf, type PerfSample } from "./performance";

export const DIAGNOSIS_SCHEMA = "stackchan-diagnosis-v1";
export const DIAGNOSIS_MODE_SECONDS = 900;
export const TURN_TIMEOUT_MS = 45000;

type Json = Record<string, unknown>;
export interface DiagnosisRobot {
  status(): Promise<unknown>;
  personality(): Promise<unknown>;
  savePersonality(p: { wake_threshold_milli: number }): Promise<unknown>;
  sensors(): Promise<unknown>;
  servoStatus(): Promise<unknown>;
  diagnostic(active: boolean, seconds?: number): Promise<unknown>;
  led(mode: "auto" | "solid" | "off" | "rainbow" | "pulse", hex?: string): Promise<unknown>;
  emotion(e: string): Promise<unknown>;
  showText(t: string): Promise<unknown>;
  clearScreen(): Promise<unknown>;
  cameraFrame(): Promise<{ ok: boolean; jpeg_bytes?: number; error?: string }>;
  startAudioTest(): Promise<{ ok: boolean; id: number; state: string; error?: string }>;
  audioTestStatus(): Promise<{ ok: boolean; id: number; state: string; error?: string; peak?: number; rms?: number; clipped_samples?: number; captured_ms?: number }>;
  clearAudioTest(id: number): Promise<unknown>;
  gesture(g: string): Promise<unknown>;
  look(pan: number, tilt: number, speed?: number): Promise<unknown>;
  home(): Promise<unknown>;
  searchTest(q: string): Promise<unknown>;
  searchResult(): Promise<unknown>;
  homeScenes(): Promise<{ ok: boolean; scenes?: unknown[] }>;
  say(text: string): Promise<unknown>;
  interrupt(): Promise<unknown>;
  /** Explicit conversation stop/start over USB (not the touch-like toggle, which means "interrupt and listen"). */
  stopConversation(): Promise<unknown>;
  listen(): Promise<unknown>;
}
export interface DiagnosisDeps {
  robot: DiagnosisRobot;
  subscribe(fn: (line: string) => void): () => void;
  now(): number;
  sleep(ms: number): Promise<void>;
  /** Ask the owner a yes/no question; null = skipped/unanswered. */
  ask(question: string): Promise<boolean | null>;
  /** Speak through the computer's speaker (voice simulation); absent = unsupported. */
  speak?(text: string, lang: string): Promise<void>;
  /** Whether the computer has a speech voice for a language prefix ("sv"); absent = assume yes. */
  hasVoice?(langPrefix: string): Promise<boolean>;
  progress(stepIndex: number, stepCount: number, title: string): void;
  aborted(): boolean;
}
/** voiceOnly: run just preparation, voice simulation and restore (quick language/wake-word check). */
export interface DiagnosisOptions { servo: boolean; camera: boolean; voiceSim: boolean; lampService: boolean; performance: boolean; idleSeconds: number; voiceOnly?: boolean }
const VOICE_ONLY_STEPS = new Set(["prepare", "voice", "restore"]);
export const DEFAULT_OPTIONS: DiagnosisOptions = { servo: true, camera: true, voiceSim: true, lampService: false, performance: true, idleSeconds: 60 };

export type Verdict = "ok" | "varning" | "fel" | "hoppad";
export interface StepResult { id: string; title: string; verdict: Verdict; ms: number; metrics: Record<string, number | string | boolean | null>; notes: string[] }
export interface DiagnosisResult {
  schema: typeof DIAGNOSIS_SCHEMA; firmware: string; startedAt: string; durationMs: number; aborted: boolean;
  options: DiagnosisOptions; verdict: Verdict; steps: StepResult[]; keyMetrics: Record<string, number | null>;
  comparison: string[]; summaryText: string;
}

const STEPS: { id: string; title: string }[] = [
  { id: "prepare", title: "Förberedelse" },
  { id: "baseline", title: "Utgångsläge i vila" },
  { id: "hardware", title: "Hårdvara: sensorer, ljus, skärm, kamera, mikrofon" },
  { id: "servo", title: "Servon" },
  { id: "network", title: "Nätverk och tjänster" },
  { id: "gemini", title: "Gemini-samtal (text)" },
  { id: "voice", title: "Röstsimulering" },
  { id: "stress", title: "Belastning och återhämtning" },
  { id: "restore", title: "Återställning" },
];
export const DIAGNOSIS_STEPS = STEPS;

export const TEXT_TURNS: { id: string; prompt: string; expectTool?: string }[] = [
  { id: "basic", prompt: "Diagnostest: svara med en kort mening, vad är två plus två?" },
  { id: "clock", prompt: "Diagnostest: vad är klockan just nu? Svara kort.", expectTool: "get_current_time" },
  { id: "screen", prompt: "Diagnostest: visa texten DIAGNOS OK på skärmen och säg sedan klart.", expectTool: "show" },
];
export const INTERRUPT_PROMPT = "Diagnostest: berätta långsamt och utförligt om alla planeter i solsystemet.";
export const VOICE_TRIES = 3;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const get = (o: unknown, path: string): unknown => path.split(".").reduce<unknown>((x, k) => (x && typeof x === "object" ? (x as Json)[k] : undefined), o);
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const worst = (vs: Verdict[]): Verdict => (vs.includes("fel") ? "fel" : vs.includes("varning") ? "varning" : vs.every((v) => v === "hoppad") ? "hoppad" : "ok");

export class DiagnosisAborted extends Error { constructor() { super("Avbruten"); } }

export async function runDiagnosis(deps: DiagnosisDeps, options: DiagnosisOptions = DEFAULT_OPTIONS, previous?: DiagnosisResult | null): Promise<DiagnosisResult> {
  const { robot } = deps;
  const startedAtMs = deps.now();
  const steps: StepResult[] = [];
  const perfLog: { t: number; s: PerfSample }[] = [];
  const lines: { t: number; line: string }[] = [];
  const listeners = new Set<(line: string) => void>();
  const unsubscribe = deps.subscribe((line) => {
    const t = deps.now();
    if (lines.length < 20000) lines.push({ t, line });
    const s = parsePerf(line); if (s) perfLog.push({ t, s });
    listeners.forEach((fn) => fn(line));
  });
  let firmware = "okänd";
  let originalThreshold: number | null = null;
  let diagnosticMode = false;
  let aborted = false;
  const uptimes: number[] = [];
  const key: Record<string, number | null> = {};
  let falseWakes = 0;

  const check = () => { if (deps.aborted()) throw new DiagnosisAborted(); };
  const wait = async (ms: number) => { const end = deps.now() + ms; while (deps.now() < end) { check(); await deps.sleep(Math.min(250, end - deps.now())); } };
  const perfSince = (t: number) => perfLog.filter((e) => e.t >= t).map((e) => e.s);
  const wakesSince = (t: number) => lines.filter((l) => l.t >= t && l.line.startsWith("[WAKE] detected")).length;
  const waitFor = async (pred: (line: string) => boolean, timeoutMs: number): Promise<{ line: string; ms: number } | null> => {
    const t0 = deps.now();
    let hit: { line: string; ms: number } | null = null;
    const fn = (line: string) => { if (!hit && pred(line)) hit = { line, ms: deps.now() - t0 }; };
    listeners.add(fn);
    try { while (!hit && deps.now() - t0 < timeoutMs) { check(); await deps.sleep(100); } } finally { listeners.delete(fn); }
    return hit;
  };
  const statusSnap = async () => { const s = await robot.status(); const up = num(get(s, "uptime_ms")); if (up !== null) uptimes.push(up); return s; };
  const waitIdle = async (timeoutMs = 20000) => {
    const t0 = deps.now();
    while (deps.now() - t0 < timeoutMs) {
      check();
      const s = await statusSnap().catch(() => null);
      if (s && !get(s, "gemini.speaking") && !get(s, "gemini.recording") && !get(s, "gemini.tool_pending") && !get(s, "gemini.continuous")) return true;
      await deps.sleep(1000);
    }
    return false;
  };
  const textTurn = async (prompt: string, interruptAfterMs?: number): Promise<SpeechRun & { sentAt: number; interruptOk?: boolean | undefined; toolsBeforeAudio?: number | undefined }> => {
    let run = newRun(prompt);
    const t0 = deps.now();
    let toolsBeforeAudio: number | undefined;
    const fn = (line: string) => { run = applyLine(run, line, deps.now() - t0); if (toolsBeforeAudio === undefined && run.firstAudioMs !== undefined) toolsBeforeAudio = run.tools.length; };
    listeners.add(fn);
    let interruptOk: boolean | undefined;
    try {
      await robot.say(prompt);
      while (!run.done && deps.now() - t0 < TURN_TIMEOUT_MS) {
        check();
        if (interruptAfterMs !== undefined && interruptOk === undefined && run.firstAudioMs !== undefined && deps.now() - t0 >= run.firstAudioMs + interruptAfterMs) {
          await robot.interrupt();
          const stopped = await (async () => { const t1 = deps.now(); while (deps.now() - t1 < 4000) { const s = await statusSnap().catch(() => null); if (s && !get(s, "gemini.speaking")) return true; await deps.sleep(250); } return false; })();
          interruptOk = stopped; run = { ...run, done: true };
          break;
        }
        await deps.sleep(150);
      }
      if (!run.done) run = { ...run, error: run.error ?? "Inget färdigt svar inom 45 s", done: true };
    } finally { listeners.delete(fn); }
    return { ...run, sentAt: t0, interruptOk, toolsBeforeAudio };
  };

  const runStep = async (index: number, fn: (r: StepResult) => Promise<void>, enabled = true) => {
    const def = STEPS[index]!;
    deps.progress(index, STEPS.length, def.title);
    const r: StepResult = { id: def.id, title: def.title, verdict: "ok", ms: 0, metrics: {}, notes: [] };
    const t0 = deps.now();
    if (!enabled) { r.verdict = "hoppad"; r.notes.push("Avstängd i valen."); steps.push(r); return; }
    if (options.voiceOnly && !VOICE_ONLY_STEPS.has(def.id)) { r.verdict = "hoppad"; r.notes.push("Bara röstsimulering vald."); steps.push(r); return; }
    try { await fn(r); }
    catch (e) {
      if (e instanceof DiagnosisAborted) { r.verdict = "hoppad"; r.notes.push("Avbruten av användaren."); r.ms = deps.now() - t0; steps.push(r); throw e; }
      r.verdict = "fel"; r.notes.push(`Fel: ${(e as Error).message}`.slice(0, 300));
    }
    r.ms = deps.now() - t0; steps.push(r);
  };
  const warn = (r: StepResult, note: string) => { if (r.verdict === "ok") r.verdict = "varning"; r.notes.push(note); };
  const fail = (r: StepResult, note: string) => { r.verdict = "fel"; r.notes.push(note); };
  const askOwner = async (r: StepResult, id: string, q: string) => { const a = await deps.ask(q); r.metrics[`ägare_${id}`] = a; if (a === false) fail(r, `Ägaren svarade nej: ${q}`); return a; };

  try {
    // 0. Prepare: identify firmware, remember settings that the run changes, pause memory writes.
    await runStep(0, async (r) => {
      const s = await statusSnap();
      firmware = String(get(s, "firmware_version") ?? "okänd");
      r.metrics["firmware"] = firmware;
      r.metrics["wake_tillgängligt"] = (get(s, "wake_word_available") as boolean | undefined) ?? null;
      r.metrics["wifi_ip_finns"] = typeof get(s, "wifi_ip") === "string" && get(s, "wifi_ip") !== "0.0.0.0";
      const p = await robot.personality().catch(() => null);
      originalThreshold = num(get(p, "personality.wake_threshold_milli"));
      r.metrics["väckord_på"] = (get(p, "personality.wake_word") as boolean | undefined) ?? null;
      r.metrics["tröskel_milli"] = originalThreshold;
      try { await robot.diagnostic(true, DIAGNOSIS_MODE_SECONDS); diagnosticMode = true; r.metrics["diagnosläge"] = true; }
      catch { r.metrics["diagnosläge"] = false; warn(r, "Firmware saknar diagnosläge (v77+): testsamtalen sparas i robotens samtalsminne."); }
      if (!(await waitIdle(10000))) warn(r, "Roboten var upptagen i början av testet.");
    });

    // 1. Baseline at rest.
    await runStep(1, async (r) => {
      const t = deps.now();
      await wait(options.idleSeconds * 1000);
      const ps = perfSince(t);
      r.metrics["prov"] = ps.length;
      r.metrics["heap_min"] = ps.length ? Math.min(...ps.map((p) => p.heap)) : null;
      r.metrics["största_block_min"] = ps.length ? Math.min(...ps.map((p) => p.largest)) : null;
      r.metrics["psram_min"] = ps.length ? Math.min(...ps.map((p) => p.psram)) : null;
      r.metrics["cpu0_snitt"] = avg(ps.map((p) => p.cpu0)); r.metrics["cpu1_snitt"] = avg(ps.map((p) => p.cpu1));
      r.metrics["loop_max_us"] = ps.length ? Math.max(...ps.map((p) => p.loop_us)) : null;
      r.metrics["rssi"] = ps.at(-1)?.rssi ?? null;
      // Nothing is said during the rest, so every detection here is a false wake ("spökstart").
      r.metrics["falska_väckningar"] = wakesSince(t);
      falseWakes += wakesSince(t);
      key["vila_heap_min"] = r.metrics["heap_min"] as number | null;
      key["vila_största_block_min"] = r.metrics["största_block_min"] as number | null;
      if (!ps.length && options.performance) warn(r, "Inga prestandaprov togs emot (USB-telemetri saknas).");
    });

    // 2. Hardware without big movement.
    await runStep(2, async (r) => {
      const sensors = await robot.sensors();
      r.metrics["imu_ok"] = (get(sensors, "imu.accel_ok") as boolean | undefined) ?? null;
      r.metrics["temp_c"] = num(get(sensors, "imu.temp_c"));
      r.metrics["närhet_ok"] = (get(sensors, "ltr553.ps_ok") as boolean | undefined) ?? null;
      if (r.metrics["imu_ok"] === false) warn(r, "IMU svarar inte.");
      for (const hex of ["#ff0000", "#00ff00", "#0000ff"]) { await robot.led("solid", hex); await wait(700); }
      await robot.led("auto");
      for (const e of ["happy", "surprised", "neutral"]) { await robot.emotion(e); await wait(500); }
      await robot.showText("DIAGNOS – skärmtest");
      await wait(1500);
      await askOwner(r, "ljus_skärm", "Lyste lamporna rött, grönt och blått, och visades texten DIAGNOS på skärmen?");
      await robot.clearScreen();
      if (options.camera) {
        const t = deps.now();
        const cam = await robot.cameraFrame().catch((e: Error) => ({ ok: false, error: e.message, jpeg_bytes: 0 }));
        r.metrics["kamera_ok"] = cam.ok; r.metrics["kamera_ms"] = deps.now() - t; r.metrics["kamera_bytes"] = cam.jpeg_bytes ?? null;
        if (!cam.ok) warn(r, `Kameran: ${cam.error ?? "ingen bild"}`);
      } else r.metrics["kamera_ok"] = null;
      const start = await robot.startAudioTest();
      if (!start.ok) { warn(r, `Mikrofontest startade inte: ${start.error ?? "okänt"}`); return; }
      let a = await robot.audioTestStatus();
      const t = deps.now();
      while (a.state === "recording" && deps.now() - t < 15000) { await wait(400); a = await robot.audioTestStatus(); }
      r.metrics["mic_rms"] = a.rms ?? null; r.metrics["mic_peak"] = a.peak ?? null; r.metrics["mic_klippning"] = a.clipped_samples ?? null; r.metrics["mic_ms"] = a.captured_ms ?? null;
      if (a.state !== "ready") warn(r, `Mikrofontest: ${a.error || a.state}`);
      else if ((a.peak ?? 0) < 50) warn(r, "Mikrofonen tog upp nästan inget ljud.");
      await robot.clearAudioTest(start.id).catch(() => undefined);
    });

    // 3. Servos.
    await runStep(3, async (r) => {
      r.metrics["status_före"] = JSON.stringify(await robot.servoStatus()).slice(0, 200);
      let t = deps.now(); await robot.gesture("nod_yes"); await waitIdle(8000); r.metrics["gest_ms"] = deps.now() - t;
      t = deps.now(); await robot.look(30, 0, 600); await wait(1200); await robot.home(); await wait(1200); r.metrics["titta_och_hem_ms"] = deps.now() - t;
      r.metrics["status_efter"] = JSON.stringify(await robot.servoStatus()).slice(0, 200);
      if (options.camera) {
        // Motion pauses wake listening (mic off); v78 lost the camera clock exactly then.
        await robot.gesture("nod_yes");
        const cam = await robot.cameraFrame().catch((e: Error) => ({ ok: false, error: e.message, jpeg_bytes: 0 }));
        r.metrics["kamera_efter_rörelse_ok"] = cam.ok;
        if (!cam.ok) warn(r, `Kameran misslyckades direkt efter rörelse: ${cam.error ?? "ingen bild"}`.slice(0, 200));
        await waitIdle(8000);
      }
      await askOwner(r, "servo", "Nickade roboten, tittade åt sidan och kom tillbaka till mitten?");
    }, options.servo);

    // 4. Network and services.
    await runStep(4, async (r) => {
      const s = await statusSnap();
      r.metrics["wifi_rssi"] = perfLog.at(-1)?.s.rssi ?? null;
      r.metrics["sök_konfigurerad"] = (get(s, "web_search.configured") as boolean | undefined) ?? null;
      if (r.metrics["sök_konfigurerad"]) {
        const t = deps.now();
        await robot.searchTest("StackChan robot");
        let res = await robot.searchResult();
        while (get(res, "busy") && deps.now() - t < 30000) { await wait(800); res = await robot.searchResult(); }
        r.metrics["sök_ok"] = (get(res, "last_ok") as boolean | undefined) ?? (get(res, "ok") as boolean | undefined) ?? null;
        r.metrics["sök_ms"] = num(get(res, "last_duration_ms")) ?? deps.now() - t;
        r.metrics["sök_http"] = num(get(res, "last_http_status"));
        key["sök_ms"] = r.metrics["sök_ms"] as number | null;
        if (r.metrics["sök_ok"] === false) warn(r, `Tavily-sök misslyckades: ${String(get(res, "last_error") ?? "")}`.slice(0, 200));
      }
      r.metrics["lampor_konfigurerade"] = (get(s, "smart_home.configured") as boolean | undefined) ?? null;
      r.metrics["lampor_senast_ok"] = (get(s, "smart_home.last_ok") as boolean | undefined) ?? null;
      if (options.lampService && r.metrics["lampor_konfigurerade"]) {
        const sc = await robot.homeScenes();
        r.metrics["lampscener"] = Array.isArray(sc.scenes) ? sc.scenes.length : null;
      }
    });

    // 5. Gemini text turns, including tool use and an interruption.
    await runStep(5, async (r) => {
      const firsts: number[] = [], dones: number[] = [], toolsBefore: number[] = [];
      for (const turn of TEXT_TURNS) {
        const run = await textTurn(turn.prompt);
        r.metrics[`${turn.id}_första_ljud_ms`] = run.firstAudioMs ?? null;
        r.metrics[`${turn.id}_tur_klar_ms`] = run.turnDoneMs ?? null;
        r.metrics[`${turn.id}_uppspelning_klar_ms`] = run.playbackDoneMs ?? null;
        r.metrics[`${turn.id}_verktyg`] = run.tools.join(",") || null;
        r.metrics[`${turn.id}_verktyg_före_ljud`] = run.toolsBeforeAudio ?? null;
        if (run.toolsBeforeAudio !== undefined) toolsBefore.push(run.toolsBeforeAudio);
        if (run.firstAudioMs !== undefined) firsts.push(run.firstAudioMs);
        if (run.playbackDoneMs !== undefined) dones.push(run.playbackDoneMs);
        if (turn.id === TEXT_TURNS[0]!.id) await askOwner(r, "röst_hördes", "Hördes robotens röst ur dess högtalare just nu?");
        if (run.error) fail(r, `${turn.id}: ${run.error}`);
        else if (turn.expectTool && !run.tools.some((t) => t.includes(turn.expectTool!))) warn(r, `${turn.id}: väntat verktyg ${turn.expectTool} användes inte (${run.tools.join(",") || "inga"}).`);
        await waitIdle();
      }
      const inter = await textTurn(INTERRUPT_PROMPT, 1500);
      r.metrics["avbrott_tyst_inom_4s"] = inter.interruptOk ?? null;
      if (inter.interruptOk === false) fail(r, "Roboten slutade inte prata efter avbrott.");
      if (inter.interruptOk === undefined) warn(r, "Avbrottstestet kom aldrig till ljud, så det gick inte att avbryta.");
      // An interrupt is the touch path ("interrupt and listen to me"): end that conversation explicitly.
      await robot.stopConversation().catch(() => undefined);
      if (!(await waitIdle())) warn(r, "Roboten blev inte ledig efter avbrottet och stoppkommandot.");
      key["första_ljud_ms_snitt"] = avg(firsts); key["uppspelning_klar_ms_snitt"] = avg(dones);
      key["verktyg_före_ljud_snitt"] = toolsBefore.length ? Math.round((toolsBefore.reduce((a, b) => a + b, 0) / toolsBefore.length) * 10) / 10 : null;
      if ((key["första_ljud_ms_snitt"] ?? 0) > 6000) warn(r, `Långsamt första ljud (${key["första_ljud_ms_snitt"]} ms i snitt, ${key["verktyg_före_ljud_snitt"] ?? "?"} verktyg före tal).`);
      r.metrics["första_ljud_ms_snitt"] = key["första_ljud_ms_snitt"]; r.metrics["uppspelning_klar_ms_snitt"] = key["uppspelning_klar_ms_snitt"];
      await askOwner(r, "avbrott_tyst", "Tystnade roboten direkt när det långa svaret avbröts?");
    });

    // 6. Voice simulation through the computer speaker: wake word + spoken question.
    await runStep(6, async (r) => {
      if (!deps.speak) { r.verdict = "hoppad"; r.notes.push("Webbläsaren saknar talsyntes."); return; }
      const s = await statusSnap();
      if (get(s, "wake_word_available") === false && get(s, "wake_word_listening") === false) { r.verdict = "hoppad"; r.notes.push("Väckordet lyssnar inte (avstängt eller modell saknas)."); return; }
      let detected = 0, notListening = 0; const latencies: number[] = []; const answers: number[] = [];
      let langChecked = 0, langWrong = 0;
      // A Swedish sentence read by an English voice comes out as letters ("V A D ...") and can be
      // misheard as a command; ask in English when the computer has no Swedish voice.
      const swedish = deps.hasVoice ? await deps.hasVoice("sv") : true;
      const question = swedish ? { text: "Vad är tre plus tre?", lang: "sv-SE" } : { text: "What is three plus three?", lang: "en-US" };
      r.metrics["fråga_språk"] = question.lang;
      const wakeListening = async () => {
        const t = deps.now();
        while (deps.now() - t < 25000) {
          check();
          const st = await statusSnap().catch(() => null);
          const flag = get(st, "wake_word_listening");
          if (flag === true) return true;
          if (flag === undefined && lines.slice(-200).some((l) => l.line.startsWith("[WAKE] listening"))) return true;
          await deps.sleep(500);
        }
        return false;
      };
      for (let i = 0; i < VOICE_TRIES; i++) {
        await robot.stopConversation().catch(() => undefined);
        await waitIdle();
        if (!(await wakeListening())) { notListening++; r.notes.push(`Försök ${i + 1}: väckordet lyssnade inte inom 25 s, inget sades.`); continue; }
        await wait(1500);
        const wakeWait = waitFor((l) => l.startsWith("[WAKE] detected"), 8000);
        await deps.speak("Hi Stack Chan", "en-US");
        const hit = await wakeWait;
        if (!hit) { r.notes.push(`Försök ${i + 1}: väckordet uppfattades inte.`); continue; }
        detected++; latencies.push(hit.ms);
        await wait(1200);
        const reply = waitFor((l) => l.startsWith("[TID] uppspelning_klar_ms") || l.startsWith("[TUR] klar"), 30000);
        const linesBefore = lines.length;
        await deps.speak(question.text, question.lang);
        const done = await reply;
        if (done) answers.push(done.ms); else r.notes.push(`Försök ${i + 1}: inget färdigt svar på den talade frågan.`);
        // v80: check the reply language too; v79 answered an English question in Swedish twice without a warning.
        if (done) {
          let robotLine: string | null = null;
          const tr = deps.now();
          while (!robotLine && deps.now() - tr < 3000) { robotLine = lines.slice(linesBefore).find((l) => l.line.startsWith("[ROBOT]"))?.line ?? null; if (!robotLine) await deps.sleep(100); }
          const lang = robotLine ? guessReplyLanguage(robotLine.slice(7)) : null;
          if (lang) {
            langChecked++;
            if (lang !== question.lang.slice(0, 2)) { langWrong++; r.notes.push(`Försök ${i + 1}: svaret kom på ${lang === "sv" ? "svenska" : "engelska"} fast frågan var på ${question.lang.startsWith("sv") ? "svenska" : "engelska"}.`); }
          }
        }
      }
      await robot.stopConversation().catch(() => undefined);
      r.metrics["väckord_träffar"] = `${detected}/${VOICE_TRIES - notListening}`;
      r.metrics["väckord_lyssnade_inte"] = notListening;
      r.metrics["väckord_ms_snitt"] = avg(latencies);
      r.metrics["röstsvar_ms_snitt"] = avg(answers);
      r.metrics["svar_rätt_språk"] = `${langChecked - langWrong}/${langChecked}`;
      key["väckord_träffar"] = detected; key["röstsvar_ms_snitt"] = avg(answers);
      if (notListening === VOICE_TRIES) fail(r, "Väckordet kom aldrig igång, så röstvägen kunde inte testas.");
      else if (detected === 0) fail(r, "Väckordet uppfattades aldrig. Står roboten nära datorns högtalare och är volymen uppe?");
      else if (detected < VOICE_TRIES || answers.length < detected) warn(r, "Röstvägen fungerade bara delvis.");
      else if (langWrong > 0) warn(r, `Svaret kom på fel språk i ${langWrong} av ${langChecked} försök.`);
      await waitIdle();
    }, options.voiceSim);

    // 7. Stress: settings saves while listening (v75 failure mode), start/stop cycles, then rest.
    await runStep(7, async (r) => {
      let saveFails = 0, slowStatus = 0;
      if (originalThreshold !== null) {
        const alt = originalThreshold === 490 ? 520 : 490;
        for (const v of [alt, originalThreshold, alt]) {
          await robot.savePersonality({ wake_threshold_milli: v }).catch(() => { saveFails++; });
          const t = deps.now(); await statusSnap().catch(() => { saveFails++; }); if (deps.now() - t > 3000) slowStatus++;
          await wait(2000);
        }
      } else r.notes.push("Väckordströskel saknas i firmwaren; sparningstestet hoppades över.");
      r.metrics["sparningsfel"] = saveFails; r.metrics["långsam_status"] = slowStatus;
      let cycleFails = 0;
      for (let i = 0; i < 5; i++) {
        await robot.listen().catch(() => { cycleFails++; }); await wait(2500);
        await robot.stopConversation().catch(() => { cycleFails++; });
        if (!(await waitIdle(10000))) cycleFails++;
      }
      r.metrics["start_stopp_fel"] = cycleFails;
      const t = deps.now();
      await wait(options.idleSeconds * 2000);
      const ps = perfSince(t);
      r.metrics["falska_väckningar_vila"] = wakesSince(t);
      falseWakes += wakesSince(t);
      r.metrics["heap_min_efter_vila"] = ps.length ? Math.min(...ps.map((p) => p.heap)) : null;
      r.metrics["största_block_min_efter_vila"] = ps.length ? Math.min(...ps.map((p) => p.largest)) : null;
      key["slut_heap_min"] = r.metrics["heap_min_efter_vila"] as number | null;
      key["slut_största_block_min"] = r.metrics["största_block_min_efter_vila"] as number | null;
      if (saveFails) fail(r, `${saveFails} inställningssparningar eller statusanrop misslyckades.`);
      if (cycleFails) warn(r, `${cycleFails} problem i start/stopp-cyklerna.`);
      if (key["vila_största_block_min"] && key["slut_största_block_min"] !== null && key["slut_största_block_min"] < key["vila_största_block_min"] * 0.7) warn(r, "Största lediga minnesblock är mer än 30 % mindre än vid start (möjlig läcka eller fragmentering).");
    });
  } catch (e) {
    if (!(e instanceof DiagnosisAborted)) throw e;
    aborted = true;
  } finally {
    // 8. Always restore, even after an error or abort.
    const r: StepResult = { id: "restore", title: STEPS[8]!.title, verdict: "ok", ms: 0, metrics: {}, notes: [] };
    deps.progress(8, STEPS.length, r.title);
    const t0 = deps.now();
    const attempt = async (label: string, fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { r.verdict = "varning"; r.notes.push(`${label}: ${(e as Error).message}`.slice(0, 200)); } };
    const restoreThreshold = originalThreshold as number | null;
    await attempt("Samtal", () => robot.stopConversation());
    if (restoreThreshold !== null) await attempt("Tröskel", () => robot.savePersonality({ wake_threshold_milli: restoreThreshold }));
    await attempt("LED", () => robot.led("auto"));
    await attempt("Ansikte", () => robot.emotion("neutral"));
    await attempt("Skärm", () => robot.clearScreen());
    if (options.servo) await attempt("Huvud", () => robot.home());
    if (diagnosticMode) await attempt("Diagnosläge", () => robot.diagnostic(false));
    const s = await statusSnap().catch(() => null);
    r.metrics["tröskel_återställd"] = originalThreshold;
    r.metrics["diagnosläge_av"] = diagnosticMode ? !num(get(s, "diagnostic_mode_ms")) : null;
    r.ms = deps.now() - t0;
    steps.push(r);
    unsubscribe();
  }

  // Whole-run checks from the log.
  let reboots = 0;
  for (let i = 1; i < uptimes.length; i++) if (uptimes[i]! < uptimes[i - 1]!) reboots++;
  const crashes = lines.filter((l) => /Guru Meditation|abort\(\) was called|Backtrace:|Task watchdog|panic'ed|Brownout/i.test(l.line)).length;
  key["omstarter"] = reboots; key["krascher"] = crashes; key["falska_väckningar"] = falseWakes;
  // Firmware logs internal memory whenever the wake model is released/loaded; works with telemetry off.
  const mem = (phase: string) => lines.map((l) => (l.line.startsWith(`[WAKE] memory phase=${phase} `) ? Number(/internal_largest=(\d+)/.exec(l.line)?.[1]) : NaN)).filter((n) => Number.isFinite(n));
  const released = mem("released"), loaded = mem("loaded");
  key["block_utan_modell_först"] = released[0] ?? null;
  key["block_utan_modell_min"] = released.length ? Math.min(...released) : null;
  key["block_med_modell_min"] = loaded.length ? Math.min(...loaded) : null;
  key["prestandamätning"] = options.performance ? 1 : 0;
  const global: StepResult = { id: "global", title: "Hela körningen", verdict: reboots || crashes ? "fel" : "ok", ms: deps.now() - startedAtMs, metrics: { omstarter: reboots, krascher: crashes, loggrader: lines.length, prestandaprov: perfLog.length }, notes: [] };
  if (reboots) global.notes.push(`Roboten startade om ${reboots} gång(er) under testet.`);
  if (crashes) global.notes.push(`${crashes} kraschrader i loggen.`);
  if (falseWakes) { global.notes.push(`${falseWakes} falsk(a) väckning(ar) under tysta vilor (spökstarter).`); if (global.verdict === "ok") global.verdict = "varning"; }
  steps.push(global);

  const verdict = aborted ? "varning" : worst(steps.map((s) => s.verdict));
  const comparison = compare(key, previous ?? null, firmware);
  const result: DiagnosisResult = {
    schema: DIAGNOSIS_SCHEMA, firmware, startedAt: new Date(startedAtMs).toISOString(), durationMs: deps.now() - startedAtMs, aborted,
    options, verdict, steps, keyMetrics: key, comparison, summaryText: "",
  };
  result.summaryText = diagnosisText(result);
  return result;
}

const LABELS: Record<string, { label: string; better: "lower" | "higher" }> = {
  första_ljud_ms_snitt: { label: "Tid till första ljud", better: "lower" },
  uppspelning_klar_ms_snitt: { label: "Tid till färdigt svar", better: "lower" },
  röstsvar_ms_snitt: { label: "Röstsvar totalt", better: "lower" },
  väckord_träffar: { label: "Väckordsträffar", better: "higher" },
  vila_största_block_min: { label: "Största minnesblock i vila", better: "higher" },
  slut_största_block_min: { label: "Största minnesblock efter belastning", better: "higher" },
  sök_ms: { label: "Söktid", better: "lower" },
  falska_väckningar: { label: "Falska väckningar i tystnad", better: "lower" },
  block_utan_modell_min: { label: "Minsta minnesblock (väckordsmodell urladdad)", better: "higher" },
  block_med_modell_min: { label: "Minsta minnesblock (väckordsmodell laddad)", better: "higher" },
  verktyg_före_ljud_snitt: { label: "Verktyg före första ljud", better: "lower" },
};
export function compare(now: Record<string, number | null>, previous: DiagnosisResult | null, firmware: string): string[] {
  if (!previous) return ["Ingen tidigare körning att jämföra med."];
  const out = [`Jämfört med ${previous.startedAt.slice(0, 16).replace("T", " ")} (${previous.firmware})${previous.firmware !== firmware ? ", annan firmware" : ""}:`];
  for (const [k, { label, better }] of Object.entries(LABELS)) {
    const a = previous.keyMetrics[k], b = now[k];
    if (a == null || b == null) continue;
    if (a === b) { out.push(`${label}: oförändrat (${b})`); continue; }
    const pct = a === 0 ? null : Math.round(((b - a) / Math.abs(a)) * 100);
    const improved = better === "lower" ? b < a : b > a;
    out.push(`${label}: ${a} → ${b}${pct === null ? "" : ` (${pct > 0 ? "+" : ""}${pct} %)`} ${improved ? "bättre" : "sämre"}`);
  }
  return out;
}

export function diagnosisText(r: DiagnosisResult): string {
  const mark: Record<Verdict, string> = { ok: "OK", varning: "VARNING", fel: "FEL", hoppad: "hoppad" };
  const lines = [`Standarddiagnos ${r.startedAt.slice(0, 16).replace("T", " ")} · ${r.firmware} · ${Math.round(r.durationMs / 1000)} s · totalt: ${mark[r.verdict]}${r.aborted ? " (avbruten)" : ""}`];
  for (const s of r.steps) {
    lines.push(`- ${s.title}: ${mark[s.verdict]} (${Math.round(s.ms / 1000)} s)${s.notes.length ? ` – ${s.notes.join(" ")}` : ""}`);
  }
  const km = Object.entries(r.keyMetrics).filter(([, v]) => v !== null).map(([k, v]) => `${k}=${v}`).join(", ");
  if (km) lines.push(`Nyckeltal: ${km}`);
  lines.push(...r.comparison);
  return lines.join("\n");
}
