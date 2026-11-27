// Robot apps as data: "when <trigger> then <actions>". Pure and tested; runs in Command Hub now
// (robot-app-engine.ts sends each action through the shared gemini-robot client) and is meant to
// be played unchanged by a future on-robot player (v85). No scripts, no loops, bounded sizes.
import { z } from "zod";

export const APP_FORMAT_VERSION = 1;
export const MAX_APPS = 20, MAX_TRIGGERS = 4, MAX_ACTIONS = 20;
/** Base64 JPEG budget per image action (the robot's /api/display accepts ≤64 KiB decoded). */
export const MAX_IMAGE_BASE64 = 60000;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const text = (max: number) => z.string().trim().min(1).max(max);

export const triggerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("button") }),
  z.object({ kind: z.literal("time"), at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), days: z.array(z.number().int().min(0).max(6)).min(1).max(7) }),
  z.object({ kind: z.literal("says"), phrase: text(60) }),
  z.object({ kind: z.literal("near"), threshold: z.number().int().min(1).max(2047) }),
  z.object({ kind: z.literal("light"), when: z.enum(["dark", "bright"]), threshold: z.number().int().min(0).max(65535) }),
  z.object({ kind: z.literal("head_touch") }),
  // v87 (robot only): motion and power events the robot already detects
  z.object({ kind: z.literal("lifted") }), z.object({ kind: z.literal("put_down") }), z.object({ kind: z.literal("tipped") }),
  z.object({ kind: z.literal("knock") }), z.object({ kind: z.literal("battery_low") }),
  z.object({ kind: z.literal("power_on") }), z.object({ kind: z.literal("power_off") }),
]);
export type Trigger = z.infer<typeof triggerSchema>;
export type TriggerKind = Trigger["kind"];

export const GESTURE_CHOICES = [
  ["little_dance", "Liten dans"], ["dance", "Dans"], ["nod_yes", "Nicka ja"], ["shake_no", "Skaka nej"],
  ["curious_tilt", "Nyfiken"], ["look_left", "Titta vänster"], ["look_right", "Titta höger"], ["look_up", "Titta upp"],
  ["look_down", "Titta ner"], ["look_at_user", "Titta på mig"], ["center_head", "Centrera"],
] as const;
export const EMOTION_CHOICES = [["neutral", "Neutral"], ["happy", "Glad"], ["angry", "Arg"], ["looking", "Tittar"], ["sleep", "Sover"]] as const;
const gestureNames = GESTURE_CHOICES.map(g => g[0]) as [string, ...string[]];
const emotionNames = EMOTION_CHOICES.map(e => e[0]) as [string, ...string[]];

/** v87: with_previous = start together with the step before ("samtidigt" instead of "sedan"). */
const step = <T extends z.ZodRawShape>(shape: T) => z.object({ ...shape, with_previous: z.boolean().optional() });
export const actionSchema = z.discriminatedUnion("kind", [
  step({ kind: z.literal("led"), mode: z.enum(["solid", "pulse", "rainbow", "off", "auto"]), color: hex }),
  step({ kind: z.literal("emotion"), emotion: z.enum(emotionNames) }),
  step({ kind: z.literal("gesture"), gesture: z.enum(gestureNames) }),
  step({ kind: z.literal("look"), pan: z.number().min(-90).max(90), tilt: z.number().min(-30).max(30) }),
  step({ kind: z.literal("text"), text: text(200) }),
  step({ kind: z.literal("image"), name: z.string().max(80), jpeg_base64: z.string().min(16).max(MAX_IMAGE_BASE64).regex(/^[A-Za-z0-9+/]+=*$/) }),
  step({ kind: z.literal("clear") }),
  step({ kind: z.literal("speak"), text: text(200) }),
  step({ kind: z.literal("ask"), prompt: text(400) }),
  step({ kind: z.literal("lights"), action: z.enum(["scene", "on", "off"]), target: text(40) }),
  step({ kind: z.literal("todo"), text: text(120) }),
  step({ kind: z.literal("timer"), minutes: z.number().int().min(1).max(90) }),
  step({ kind: z.literal("wait"), seconds: z.number().min(0.2).max(60) }),
  step({ kind: z.literal("stop_talk") }),
  step({ kind: z.literal("reset") }),
  // v87 (robot only for photo/sound)
  step({ kind: z.literal("photo"), show: z.boolean() }),
  step({ kind: z.literal("describe"), prompt: text(400) }),
  step({ kind: z.literal("listen") }),
  step({ kind: z.literal("sound"), sound: z.enum(["beep", "double", "rising", "falling"]) }),
  // v88 (robot only)
  step({ kind: z.literal("overlay"), symbol: z.enum(["heart", "star", "question", "exclaim", "zzz", "note", "none"]), text: z.string().trim().max(40).optional(), seconds: z.number().min(0.5).max(60) }),
  step({ kind: z.literal("wait_for"), event: z.enum(["head_touch", "knock", "lifted", "put_down", "tipped", "near", "light", "power_on", "power_off"]),
    seconds: z.number().int().min(1).max(600), otherwise: z.enum(["stop", "continue"]), threshold: z.number().int().min(0).max(65535).optional(), when: z.enum(["dark", "bright"]).optional() }),
]);
export type Action = z.infer<typeof actionSchema>;
export type ActionKind = Action["kind"];

export const robotAppSchema = z.object({
  id: z.string().min(1).max(80),
  name: text(40),
  enabled: z.boolean(),
  cooldown_s: z.number().int().min(0).max(3600),
  triggers: z.array(triggerSchema).min(1).max(MAX_TRIGGERS),
  actions: z.array(actionSchema).min(1).max(MAX_ACTIONS),
});
export type RobotApp = z.infer<typeof robotAppSchema>;

export const TRIGGER_LABELS: Record<TriggerKind, string> = {
  button: "Bara manuellt (meny, röst, Kör)", time: "Klockslag", says: "Om användaren säger …",
  near: "Om något är nära (närhetssensor)", light: "Om det är mörkt/ljust i rummet", head_touch: "Om någon rör robotens huvud",
  lifted: "Om roboten lyfts upp", put_down: "Om roboten ställs ner", tipped: "Om roboten välter", knock: "Om någon knackar på roboten",
  battery_low: "Om batteriet blir lågt", power_on: "Om laddaren ansluts", power_off: "Om laddaren kopplas ur",
};
export const ACTION_LABELS: Record<ActionKind, string> = {
  led: "LED-färg", emotion: "Ansiktsuttryck", gesture: "Gest / dans", look: "Titta åt", text: "Visa text", image: "Visa bild",
  clear: "Rensa skärmen", speak: "Säg en mening", ask: "Fråga Gemini", lights: "Lampor (Smart Life)", todo: "Lägg till att-göra",
  timer: "Starta timer", wait: "Vänta", stop_talk: "Avsluta samtal", reset: "Återställ roboten",
  photo: "Ta en bild", describe: "Titta och berätta (kamera)", listen: "Starta samtal (roboten lyssnar)", sound: "Spela ljud",
  overlay: "Visa över ansiktet", wait_for: "Vänta på …",
};
export const SYMBOL_CHOICES = [["heart", "Hjärta"], ["star", "Stjärna"], ["question", "Frågetecken"], ["exclaim", "Utropstecken"], ["zzz", "Zzz"], ["note", "Not"], ["none", "Ingen symbol (bara text)"]] as const;
export const WAIT_EVENTS = [["head_touch", "någon rör huvudet"], ["knock", "någon knackar"], ["lifted", "roboten lyfts upp"], ["put_down", "roboten ställs ner"], ["tipped", "roboten välter"],
  ["near", "något är nära"], ["light", "det blir mörkt/ljust"], ["power_on", "laddaren ansluts"], ["power_off", "laddaren kopplas ur"]] as const;
export const SOUND_CHOICES = [["beep", "Pip"], ["double", "Dubbelpip"], ["rising", "Stigande"], ["falling", "Fallande"]] as const;
/** Work only when the app runs on the robot (firmware v87+), not when tried from Command Hub. */
export const ROBOT_ONLY_TRIGGERS: TriggerKind[] = ["lifted", "put_down", "tipped", "knock", "battery_low", "power_on", "power_off"];
export const ROBOT_ONLY_ACTIONS: ActionKind[] = ["photo", "sound", "overlay", "wait_for"];
export type Role = "motion" | "speech" | "screen" | "other";
export function roleOf(kind: ActionKind): Role {
  if (kind === "gesture" || kind === "look") return "motion";
  if (kind === "speak" || kind === "ask" || kind === "describe" || kind === "listen") return "speech";
  if (kind === "text" || kind === "image" || kind === "photo" || kind === "clear") return "screen";
  return "other";
}
/** Steps grouped by "samtidigt" (the first step never joins a previous one). */
export function groupsOf(actions: Action[]): Action[][] {
  const groups: Action[][] = [];
  actions.forEach((a, i) => { const last = groups.at(-1); if (i > 0 && a.with_previous && last) last.push(a); else groups.push([a]); });
  return groups;
}
/** Same rule as firmware RobotAppPolicy::groupsValid: one head, one voice, one screen per group. */
export function groupProblem(actions: Action[]): string | null {
  let index = 0;
  for (const g of groupsOf(actions)) {
    if (g.length > 1 && g.some(a => a.kind === "wait_for")) return `Steg ${index + 1}–${index + g.length}: "Vänta på …" kan inte köras samtidigt med andra steg.`;
    for (const a of g) {
      if (a.kind === "wait_for" && a.event === "near" && !a.threshold) return `Steg ${actions.indexOf(a) + 1}: ange ett närhetsvärde (t.ex. 10).`;
      if (a.kind === "overlay" && a.symbol === "none" && !a.text) return `Steg ${actions.indexOf(a) + 1}: välj en symbol eller skriv en text.`;
    }
    for (const role of ["motion", "speech", "screen"] as const) {
      if (g.filter(a => roleOf(a.kind) === role).length > 1)
        return `Steg ${index + 1}–${index + g.length} körs samtidigt men har ${role === "motion" ? "två rörelser" : role === "speech" ? "två tal-/samtalssteg" : "två saker på skärmen"} – högst en av varje åt gången.`;
    }
    index += g.length;
  }
  return null;
}
/** Triggers that need the USB connection in Command Hub (they read the robot's console lines). */
export const USB_ONLY_TRIGGERS: TriggerKind[] = ["says"];
export const SENSOR_TRIGGERS: TriggerKind[] = ["near", "light", "head_touch"];

export function defaultTrigger(kind: TriggerKind): Trigger {
  switch (kind) {
    case "button": return { kind };
    case "time": return { kind, at: "07:00", days: [1, 2, 3, 4, 5] };
    case "says": return { kind, phrase: "disco" };
    case "near": return { kind, threshold: 100 };
    case "light": return { kind, when: "dark", threshold: 20 };
    case "head_touch": case "lifted": case "put_down": case "tipped": case "knock": case "battery_low": case "power_on": case "power_off": return { kind };
  }
}
export function defaultAction(kind: ActionKind): Action {
  switch (kind) {
    case "led": return { kind, mode: "solid", color: "#2563eb" };
    case "emotion": return { kind, emotion: "happy" };
    case "gesture": return { kind, gesture: "little_dance" };
    case "look": return { kind, pan: 0, tilt: 0 };
    case "text": return { kind, text: "Hej!" };
    case "image": return { kind, name: "", jpeg_base64: "" };
    case "clear": return { kind };
    case "speak": return { kind, text: "Hej, jag heter Stackchan." };
    case "ask": return { kind, prompt: "Berätta ett kort roligt faktum." };
    case "lights": return { kind, action: "scene", target: "" };
    case "todo": return { kind, text: "Ny uppgift" };
    case "timer": return { kind, minutes: 5 };
    case "wait": return { kind, seconds: 2 };
    case "stop_talk": return { kind };
    case "reset": return { kind };
    case "photo": return { kind, show: true };
    case "describe": return { kind, prompt: "Vad ser du framför dig?" };
    case "listen": return { kind };
    case "sound": return { kind, sound: "beep" };
    case "overlay": return { kind, symbol: "heart", seconds: 3 };
    case "wait_for": return { kind, event: "tipped", seconds: 20, otherwise: "stop" };
  }
}

export const EXAMPLE_APP: RobotApp = {
  id: "example-disco", name: "Disco", enabled: false, cooldown_s: 10,
  triggers: [{ kind: "button" }, { kind: "says", phrase: "disco" }],
  actions: [{ kind: "led", mode: "rainbow", color: "#2563eb" }, { kind: "emotion", emotion: "happy" }, { kind: "text", text: "Disco!" }, { kind: "gesture", gesture: "little_dance" }, { kind: "wait", seconds: 4 }, { kind: "led", mode: "auto", color: "#000000" }, { kind: "clear" }],
};

/** Human-readable problem for the first invalid field, or null when the app can be saved/run. */
export function appProblem(app: unknown): string | null {
  const r = robotAppSchema.safeParse(app);
  if (r.success) return groupProblem(r.data.actions);
  const issue = r.error.issues[0];
  const path = issue?.path ?? [];
  if (path[0] === "name") return "Ge appen ett namn (högst 40 tecken).";
  if (path[0] === "triggers") return path.length === 1 ? `Appen behöver 1–${MAX_TRIGGERS} "om"-villkor.` : `"Om"-villkor ${Number(path[1]) + 1} är ofullständigt.`;
  if (path[0] === "actions") {
    if (path.length === 1) return `Appen behöver 1–${MAX_ACTIONS} steg.`;
    const a = (app as RobotApp).actions?.[Number(path[1])];
    if (a?.kind === "image") return `Steg ${Number(path[1]) + 1}: välj en bild (högst ${Math.round(MAX_IMAGE_BASE64 / 1365)} kB).`;
    return `Steg ${Number(path[1]) + 1} är ofullständigt.`;
  }
  return "Appen är ogiltig.";
}

export function readRobotApps(value: unknown): RobotApp[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(a => { const p = robotAppSchema.safeParse(a); return p.success ? [p.data] : []; }).slice(0, MAX_APPS);
}
export function exportRobotApps(apps: RobotApp[]) { return JSON.stringify({ format: "stackchan-apps", version: APP_FORMAT_VERSION, apps }, null, 2); }
export function importRobotApps(json: string): RobotApp[] {
  let data: unknown;
  try { data = JSON.parse(json); } catch { throw new Error("Filen är inte giltig JSON."); }
  const d = data as { format?: unknown; version?: unknown; apps?: unknown };
  if (d?.format !== "stackchan-apps" || d.version !== APP_FORMAT_VERSION || !Array.isArray(d.apps)) throw new Error("Filen är inte en StackChan-appfil (version 1).");
  const apps = readRobotApps(d.apps);
  if (!apps.length) throw new Error("Filen innehåller inga giltiga appar.");
  return apps.map(a => ({ ...a, enabled: false }));
}

// ---- Trigger evaluation (edge-triggered so a held hand or a dark evening fires once) ----

export interface SensorSnapshot { ps_raw?: number | undefined; als_avg?: number | undefined; head_pressed?: boolean | undefined }
/** Extract the fields apps use from /api/sensors. Missing or failed reads become undefined (never fire). */
export function readSensorSnapshot(raw: unknown): SensorSnapshot {
  const r = raw as { body_touch?: { pressed_raw?: unknown }; ltr553?: { ps_ok?: unknown; ps_raw?: unknown; als_ok?: unknown; als_avg?: unknown } } | null;
  const ltr = r?.ltr553;
  return {
    ps_raw: ltr?.ps_ok === true && typeof ltr.ps_raw === "number" ? ltr.ps_raw : undefined,
    als_avg: ltr?.als_ok === true && typeof ltr.als_avg === "number" ? ltr.als_avg : undefined,
    head_pressed: typeof r?.body_touch?.pressed_raw === "boolean" ? r.body_touch.pressed_raw : undefined,
  };
}

function sensorActive(t: Trigger, s: SensorSnapshot): boolean | undefined {
  if (t.kind === "near") return s.ps_raw === undefined ? undefined : s.ps_raw >= t.threshold;
  if (t.kind === "light") return s.als_avg === undefined ? undefined : t.when === "dark" ? s.als_avg <= t.threshold : s.als_avg >= t.threshold;
  if (t.kind === "head_touch") return s.head_pressed;
  return undefined;
}
/** True when a sensor trigger goes from inactive to active. Unknown readings never fire and keep the old state. */
export function sensorEdge(t: Trigger, prev: SensorSnapshot | null, next: SensorSnapshot): boolean {
  if (!prev) return false;  // first reading after arming only sets the baseline
  const before = sensorActive(t, prev), after = sensorActive(t, next);
  return before === false && after === true;
}

/** Minute key (local time) for which a time trigger fires, or null. */
export function timeMatch(t: Trigger, now: Date): string | null {
  if (t.kind !== "time") return null;
  const hh = String(now.getHours()).padStart(2, "0"), mm = String(now.getMinutes()).padStart(2, "0");
  if (`${hh}:${mm}` !== t.at || !t.days.includes(now.getDay())) return null;
  return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()} ${t.at}`;
}

export function normalizeSpeech(s: string) {
  return s.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
/** Whole-word phrase match: "disco" matches "Kör disco nu!" but not "discotek". */
export function saysMatch(t: Trigger, utterance: string): boolean {
  if (t.kind !== "says") return false;
  const p = normalizeSpeech(t.phrase);
  return p.length > 0 && ` ${normalizeSpeech(utterance)} `.includes(` ${p} `);
}

/** Gemini sends the user's words as several "[DU] …" console lines; join fragments that arrive close together. */
export class UtteranceJoiner {
  private text = ""; private last: number | null = null;
  /** Increments for every new utterance, so an app fires at most once per utterance. */
  id = 0;
  constructor(private gapMs = 2500, private maxChars = 400) {}
  /** Returns the utterance so far when the line is a transcript fragment, else null. */
  push(line: string, nowMs: number): string | null {
    const m = /^\[DU\] (.*)$/.exec(line.trim());
    if (!m) return null;
    if (this.last === null || nowMs - this.last > this.gapMs) { this.text = ""; this.id++; }
    this.last = nowMs;
    this.text = (this.text + (m[1] ?? "").replace(/ \.\.\.$/, "")).slice(-this.maxChars);
    return this.text;
  }
}

/** Cooldown and one-run-at-a-time gate. */
export function mayStart(app: RobotApp, lastRunMs: number | undefined, nowMs: number, busy: boolean) {
  if (busy) return false;
  return lastRunMs === undefined || nowMs - lastRunMs >= app.cooldown_s * 1000;
}

// ---- Runner ----
export type ActionExecutor = (action: Action, signal: AbortSignal) => Promise<void>;
export interface RunResult { ok: boolean; done: number; error?: string }
/** Runs the steps in order; stops at the first failure or when aborted. Waits are abortable. */
export async function runActions(actions: Action[], exec: ActionExecutor, signal: AbortSignal, sleep = abortableSleep): Promise<RunResult> {
  let done = 0;
  for (const group of groupsOf(actions)) {
    if (signal.aborted) return { ok: false, done, error: "Stoppad." };
    let failed: { index: number; error: unknown } | null = null;
    await Promise.all(group.map(async (a, i) => {
      try {
        if (a.kind === "wait") await sleep(a.seconds * 1000, signal);
        else await exec(a, signal);
      } catch (e) { if (!failed) failed = { index: i, error: e }; }
    }));
    if (failed) {
      const f = failed as { index: number; error: unknown };
      const a = group[f.index]!;
      return { ok: false, done: done + f.index, error: signal.aborted ? "Stoppad." : `Steg ${done + f.index + 1} (${ACTION_LABELS[a.kind]}): ${f.error instanceof Error ? f.error.message : String(f.error)}` };
    }
    done += group.length;
  }
  return { ok: true, done };
}
/** Same instruction texts as the firmware (RobotAppPlayer.h), so Hub and robot behave alike. */
export const speakInstruction = (text: string) => `Säg exakt detta högt och ingenting annat. Anropa inga verktyg (inga rörelser, inget ansiktsuttryck): "${text}"`;
export const describeInstruction = (prompt: string) => `Anropa verktyget look_with_camera exakt en gång (inga andra verktyg, inga rörelser) och svara sedan kort och högt på: ${prompt}`;
export function abortableSleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new Error("aborted")); return; }
    const t = setTimeout(() => { signal.removeEventListener("abort", stop); resolve(); }, ms);
    const stop = () => { clearTimeout(t); reject(new Error("aborted")); };
    signal.addEventListener("abort", stop, { once: true });
  });
}

/** Speak/ask steps only queue text for Gemini; wait until the robot actually started and finished talking,
 *  so a following step (e.g. "Avsluta samtal") cannot cut the answer. speaking() reads /api/sensors gemini.speaking. */
export async function waitForSpeech(speaking: () => Promise<boolean | undefined>, signal: AbortSignal, opts: { startMs?: number; maxMs?: number; quietMs?: number; pollMs?: number; sleep?: typeof abortableSleep; now?: () => number } = {}) {
  const { startMs = 20000, maxMs = 90000, quietMs = 1500, pollMs = 400, sleep = abortableSleep, now = Date.now } = opts;
  const t0 = now();
  let started = false, quietSince: number | null = null;
  for (;;) {
    const s = await speaking();
    const t = now();
    if (s) { started = true; quietSince = null; }
    else if (started) { quietSince ??= t; if (t - quietSince >= quietMs) return; }
    else if (t - t0 >= startMs) throw new Error(`roboten började inte prata inom ${Math.round(startMs / 1000)} s – är Gemini igång?`);
    if (t - t0 >= maxMs) return;  // very long answer: let the app continue
    await sleep(pollMs, signal);
  }
}

/** The robot's serial API line limit (SerialCommandPolicy::maxLineBytes 6144) leaves ~5.6 kB for an image over USB. */
export const USB_IMAGE_BASE64 = 5600;
