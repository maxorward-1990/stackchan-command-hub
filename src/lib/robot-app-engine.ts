// Runs the owner's robot apps (robot-apps.ts) from Command Hub. Module singleton so armed apps keep
// running across page navigation (started from HubShell). Every action goes through the shared
// gemini-robot client; triggers come from /api/sensors polling, the clock and USB transcript lines.
import { useSyncExternalStore } from "react";
import { robot } from "./gemini-robot";
import { onSerialLine, serialConnected } from "./web-serial";
import { readStored } from "./app-storage";
import { focusStartRequest } from "./focus-app";
import { fitJpeg } from "./jpeg-fit";
import {
  SENSOR_TRIGGERS, USB_IMAGE_BASE64, UtteranceJoiner, mayStart, readRobotApps, readSensorSnapshot, runActions, saysMatch, sensorEdge,
  timeMatch, waitForSpeech, speakInstruction, describeInstruction, ROBOT_ONLY_ACTIONS, ACTION_LABELS, type Action, type RobotApp, type SensorSnapshot,
} from "./robot-apps";

export const ROBOT_APPS_KEY = "sc.robotApps.v1";
const POLL_MS = 700, TICK_MS = 10000, ERROR_BACKOFF_MS = 5000, LOG_MAX = 40;

export interface EngineState {
  running: { id: string; name: string } | null;
  sensors: SensorSnapshot | null;
  sensorError: string;
  log: string[];
  armed: number;
}
let state: EngineState = { running: null, sensors: null, sensorError: "", log: [], armed: 0 };
const listeners = new Set<() => void>();
const set = (p: Partial<EngineState>) => { state = { ...state, ...p }; listeners.forEach(l => l()); };
const log = (m: string) => set({ log: [`${new Date().toLocaleTimeString("sv-SE")} ${m}`, ...state.log].slice(0, LOG_MAX) });
export function useAppEngine() { return useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => state, () => state); }

let apps: RobotApp[] = [];
let controller: AbortController | null = null;
const lastRun = new Map<string, number>();
const firedKeys = new Set<string>();
const firedUtterance = new Map<string, number>();
const joiner = new UtteranceJoiner();
let prevSensors: SensorSnapshot | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null, tickTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribeSerial: (() => void) | null = null;
let pollBusy = false, pollPausedUntil = 0, started = false;

const armedApps = () => apps.filter(a => a.enabled);

async function homeAction(action: "scene" | "on" | "off", target: string) {
  await robot.homeStart({ action, target });
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    await new Promise(r => setTimeout(r, 700));
    const r = await robot.homePoll();
    if (r.pending) continue;
    if (r.ok === false || r.error || r.failed?.length) throw new Error(r.error || r.last_error || r.failed?.[0]?.error || "Lamporna svarade inte.");
    return;
  }
  throw new Error("Lamporna svarade inte inom 15 s.");
}

const geminiSpeaking = async () => {
  const g = ((await robot.sensors()) as { gemini?: { speaking?: unknown } }).gemini;
  return typeof g?.speaking === "boolean" ? g.speaking : undefined;
};

export async function executeAction(a: Action, signal: AbortSignal = new AbortController().signal): Promise<void> {
  switch (a.kind) {
    case "led": await robot.led(a.mode, a.color); return;
    case "emotion": await robot.emotion(a.emotion); return;
    case "gesture": await robot.gesture(a.gesture); return;
    case "look": await robot.look(a.pan, a.tilt); return;
    case "text": await robot.showText(a.text); return;
    case "image": {
      const jpeg = serialConnected() && a.jpeg_base64.length > USB_IMAGE_BASE64 ? await fitJpeg(a.jpeg_base64, USB_IMAGE_BASE64) : a.jpeg_base64;
      const r = await robot.showImage(jpeg);
      if (r.ok === false) throw new Error("Roboten kunde inte visa bilden.");
      return;
    }
    case "clear": await robot.clearScreen(); return;
    case "speak": await robot.say(speakInstruction(a.text)); await waitForSpeech(geminiSpeaking, signal); return;
    case "describe": await robot.say(describeInstruction(a.prompt)); await waitForSpeech(geminiSpeaking, signal); return;
    case "listen": await robot.listen(); return;
    case "photo": case "sound": throw new Error(`"${ACTION_LABELS[a.kind]}" fungerar bara när appen körs på roboten (v87) – skicka appen och kör den där.`);
    case "ask": await robot.say(a.prompt); await waitForSpeech(geminiSpeaking, signal); return;
    case "lights": await homeAction(a.action, a.target); return;
    case "todo": { const r = await robot.todos({ action: "add", text: a.text }); if (!r.ok) throw new Error(r.error || "Att-göra kunde inte sparas."); return; }
    case "timer": await robot.focusStart(focusStartRequest({ focus_min: a.minutes, break_min: 1, rounds: 1, mode: "widget" })); return;
    case "stop_talk": await robot.stopConversation(); return;
    case "reset": await resetLook(); return;
    case "wait": return;  // handled by runActions
  }
}

/** Run an app now. reason is shown in the log. Returns false when another app is running. */
export async function runApp(app: RobotApp, reason: string): Promise<boolean> {
  if (state.running) { log(`${app.name}: hoppades över (${state.running.name} körs)`); return false; }
  controller = new AbortController();
  lastRun.set(app.id, Date.now());
  set({ running: { id: app.id, name: app.name } });
  log(`▶ ${app.name} (${reason})`);
  const r = await runActions(app.actions, (a, sig) => executeAction(a, sig), controller.signal);
  controller = null;
  set({ running: null });
  log(r.ok ? `✓ ${app.name} klar` : `✗ ${app.name}: ${r.error}`);
  return true;
}
export function stopRunning() { controller?.abort(); }

/** Normal look again: LEDs follow the personality, screen cleared, neutral face, head centred. */
async function resetLook() {
  const errors: string[] = [];
  for (const step of [() => robot.led("auto"), () => robot.clearScreen(), () => robot.emotion("neutral"), () => robot.home()])
    await step().catch(e => errors.push(e instanceof Error ? e.message : String(e)));
  if (errors.length) throw new Error(errors[0]);
}
/** Stop the running app and put the robot back to normal (also ends a conversation over USB). */
export async function resetRobot() {
  stopRunning();
  await robot.robotAppsPost({ action: "stop" }).catch(() => undefined);  // an app playing on the robot (v85+)
  await new Promise(r => setTimeout(r, 100));
  if (serialConnected()) await robot.stopConversation().catch(() => undefined);
  await resetLook();
  log("↺ Roboten återställd");
}

function fire(app: RobotApp, reason: string) {
  if (!mayStart(app, lastRun.get(app.id), Date.now(), state.running !== null)) return;
  void runApp(app, reason);
}

async function poll() {
  if (pollBusy || state.running || Date.now() < pollPausedUntil) return;
  pollBusy = true;
  try {
    const next = readSensorSnapshot(await robot.sensors());
    for (const app of armedApps()) for (const t of app.triggers) {
      if (sensorEdge(t, prevSensors, next)) { fire(app, t.kind === "near" ? "nära" : t.kind === "light" ? (t.when === "dark" ? "mörkt" : "ljust") : "huvudet rördes"); break; }
    }
    prevSensors = next;
    set({ sensors: next, sensorError: "" });
  } catch (e) {
    prevSensors = null;  // a fresh baseline after reconnecting, so a stale reading never fires
    pollPausedUntil = Date.now() + ERROR_BACKOFF_MS;
    set({ sensorError: e instanceof Error ? e.message : "Sensorerna svarar inte." });
  } finally { pollBusy = false; }
}

function tick() {
  const now = new Date();
  for (const app of armedApps()) for (const t of app.triggers) {
    const key = timeMatch(t, now);
    if (key && !firedKeys.has(`${app.id} ${key}`)) { firedKeys.add(`${app.id} ${key}`); fire(app, `klockan ${t.kind === "time" ? t.at : ""}`); }
  }
  if (firedKeys.size > 500) firedKeys.clear();
}

function onLine(line: string) {
  const utterance = joiner.push(line, Date.now());
  if (utterance === null) return;
  for (const app of armedApps()) {
    if (firedUtterance.get(app.id) === joiner.id) continue;
    const t = app.triggers.find(tr => saysMatch(tr, utterance));
    if (t?.kind === "says") { firedUtterance.set(app.id, joiner.id); fire(app, `du sa "${t.phrase}"`); }
  }
}

/** Update the app list (from the builder) and start/stop only the trigger sources the armed apps need. */
export function setEngineApps(next: RobotApp[]) {
  apps = next;
  const armed = armedApps();
  const needs = (kinds: string[]) => armed.some(a => a.triggers.some(t => kinds.includes(t.kind)));
  if (needs(SENSOR_TRIGGERS)) { if (!pollTimer) { prevSensors = null; pollTimer = setInterval(() => void poll(), POLL_MS); } }
  else if (pollTimer) { clearInterval(pollTimer); pollTimer = null; prevSensors = null; set({ sensors: null, sensorError: "" }); }
  if (needs(["time"])) { if (!tickTimer) tickTimer = setInterval(tick, TICK_MS); }
  else if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  if (needs(["says"])) { if (!unsubscribeSerial) unsubscribeSerial = onSerialLine(onLine); }
  else if (unsubscribeSerial) { unsubscribeSerial(); unsubscribeSerial = null; }
  set({ armed: armed.length });
}

/** One sensor reading for the builder (choosing thresholds). */
export async function readSensorsOnce() { const s = readSensorSnapshot(await robot.sensors()); set({ sensors: s, sensorError: "" }); return s; }

/** Called once by HubShell: arm the saved apps so they work on every page. */
export function startAppEngine() {
  if (started || typeof window === "undefined") return;
  started = true;
  try { setEngineApps(readRobotApps(JSON.parse(readStored(ROBOT_APPS_KEY) ?? "[]"))); } catch { setEngineApps([]); }
}
