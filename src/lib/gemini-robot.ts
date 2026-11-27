// Client for our StackChan Gemini firmware (firmware/). Uses USB, then Bluetooth, then the
// local CORS bridge (tools/robot-proxy.mjs), since the robot sends no CORS headers.
export const DEFAULT_PROXY = "http://localhost:8787";
export const getProxy = (): string => {
  if (typeof window === "undefined") return "";
  try { return JSON.parse(readStored("sc.proxy") ?? "null") ?? DEFAULT_PROXY; } catch { return DEFAULT_PROXY; }
};
export const setProxy = (url: string) => writeStored("sc.proxy", JSON.stringify(url.trim() || DEFAULT_PROXY));
import { sendSerial, serialApi, serialConnected } from "./web-serial";
import { bluetoothApi, bluetoothConnected } from "./web-bluetooth";
import type { SpeechLanguages } from "./audio-diagnostics";
import { requestSummary, wifiError, type StereoDiagnostic } from "./robot-network";
import { robotAppStatusSchema, type robotAppRequest, type RobotAppStatus } from "./robot-app";
import { focusStatusSchema, type FocusStatus, type focusStartRequest } from "./focus-app";
import { readStored, writeStored } from "./app-storage";

const commandListeners = new Set<(line: string) => void>();
export function onRobotCommand(fn: (line: string) => void) { commandListeners.add(fn); return () => { commandListeners.delete(fn); }; }
let externalLogger: (m: string) => void = () => {};
const logger = (line: string) => { externalLogger(line); commandListeners.forEach(fn => fn(line)); };
export const setGeminiRobotLogger = (fn: (m: string) => void) => (externalLogger = fn);

const base = () => {
  const p = getProxy();
  if (!p) throw new Error("Ingen brygga inställd. Starta tools/robot-proxy.mjs.");
  return p.replace(/\/$/, "");
};

async function call<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const method = body === undefined ? "GET" : "POST";
  if (serialConnected()) {
    if (method === "POST") logger(`→ USB ${path} ${requestSummary(path, body)}`);
    const { status, data } = await serialApi(method, path, body);
    if (status >= 400) { logger(`✗ USB ${path}: ${status}`); throw new Error(`Roboten svarade ${status}: ${JSON.stringify(data).slice(0, 120)}`); }
    return data as T;
  }
  if (bluetoothConnected()) {
    if (method === "POST") logger(`→ BT ${path} ${requestSummary(path, body)}`);
    const { status, data } = await bluetoothApi(method, path, body);
    if (status >= 400) { logger(`✗ BT ${path}: ${status}`); throw new Error(`Roboten svarade ${status}: ${JSON.stringify(data).slice(0, 120)}`); }
    return data as T;
  }
  if (method === "POST") logger(`→ ${path} ${requestSummary(path, body)}`);
  const init: RequestInit = { method, signal: AbortSignal.timeout(8000) };
  if (body !== undefined) { init.headers = { "Content-Type": "application/json" }; init.body = JSON.stringify(body); }
  let r: Response;
  try { r = await fetch(`${base()}${path}`, init); }
  catch {
    logger(`✗ ${path}: bryggan svarar inte`);
    throw new Error("Bryggan svarar inte. Starta den på datorn: node tools/robot-proxy.mjs 192.168.0.188");
  }
  const text = await r.text();
  let data: unknown = text;
  try { data = JSON.parse(text); } catch { /* plain text */ }
  if (!r.ok) { logger(`✗ ${path}: ${r.status}`); throw new Error(`Roboten svarade ${r.status}: ${text.slice(0, 120)}`); }
  return data as T;
}

export type Runtime = {
  robot_id: string; gemini_model: string; gemini_voice: string; speaker_volume: number;
  mic_magnification: number; mic_noise_filter_level: number; vad_prefix_padding_ms: number;
  vad_silence_duration_ms: number; vad_start_sensitivity_high: boolean; vad_end_sensitivity_low: boolean;
  vad_turn_includes_all_input: boolean; wifi_enabled: boolean; web_enabled: boolean; wifi_ssid?: string; wifi_password?: "set" | "missing";
  gemini_enabled: boolean; gateway_enabled: boolean; web_search_enabled: boolean; tavily_api_key?: "set" | "missing";
  // v42+: Smart Life (Tuya) lights
  smart_home_enabled?: boolean; tuya_client_id?: "set" | "missing"; tuya_client_secret?: "set" | "missing";
  // v19+: per-feature tool toggles (missing on older firmware)
  tool_wikipedia?: boolean; tool_images?: boolean; tool_gestures?: boolean; tool_camera?: boolean;
  tool_memory?: boolean; tool_screen?: boolean; tool_emotions?: boolean;
  speech_languages?: SpeechLanguages;
};

export type AudioTestStatus = {
  ok: boolean; id: number; state: "idle" | "recording" | "ready" | "error";
  error: string; sample_rate: number; pcm_bytes: number; captured_ms: number;
  peak: number; rms: number; clipped_samples: number;
  mic_magnification: number; mic_noise_filter_level: number;
};

export const TOOL_TOGGLES = [
  ["tool_wikipedia", "Wikipedia-uppslag", "Av = svarar bara från Geminis egen kunskap"],
  ["tool_images", "Bilder från internet", "Söker och visar foton från Wikimedia"],
  ["tool_gestures", "Huvudrörelser & gester", "Rörelser på begäran; v26 pausar lyssningen tills rörelsen är klar"],
  ["tool_emotions", "Byter ansiktsuttryck själv", "Gemini får välja min"],
  ["tool_camera", "Kamera", "Får titta när du ber om det"],
  ["tool_memory", "Minne", "Får söka och spara i robotens minne"],
  ["tool_screen", "Visa info på skärmen", "Text, listor och diagram"],
] as const;

export const GESTURES = [
  ["nod_yes", "Nicka ja"], ["shake_no", "Skaka nej"], ["curious_tilt", "Nyfiken"],
  ["look_left", "Titta vänster"], ["look_right", "Titta höger"], ["look_up", "Titta upp"],
  ["look_down", "Titta ner"], ["center_head", "Centrera"], ["stop_motion", "Stoppa"],
] as const;
export const EMOTIONS = [
  ["neutral", "Neutral"], ["happy", "Glad"], ["angry", "Arg"], ["looking", "Tittar"], ["sleep", "Sover"],
] as const;
export const VOICES = ["Puck", "Aoede", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Zephyr"];

export async function bridgeOnline(): Promise<boolean> {
  if (serialConnected() || bluetoothConnected()) return true;
  try { const r = await fetch(`${base()}/api/status`, { signal: AbortSignal.timeout(3000) }); return r.ok; } catch { return false; }
}

export interface SearchTestResult {
  ok?: boolean; pending?: boolean; searched_web?: boolean; error?: string; last_error?: string;
  answer?: string; results?: { title: string; url: string; snippet: string }[];
}

export interface HomeDevice { name: string; category: string; kind: "light" | "switch"; online: boolean }
export interface HomeResult {
  ok?: boolean; done?: boolean; pending?: boolean; enabled?: boolean; configured?: boolean; error?: string; last_error?: string;
  devices?: HomeDevice[]; changed?: string[]; failed?: { name: string; error: string }[]; known_devices?: string[]; duration_ms?: number;
  scenes?: string[]; scenes_error?: string; scene?: string; known_scenes?: string[];
}
export type SceneStepAction = "on" | "off" | "brightness" | "color" | "white";
export interface SceneStep { device: string; action: SceneStepAction; brightness?: number; color?: string }
export interface LocalScene { name: string; steps: SceneStep[] }
export type HomeAction = "on" | "off" | "brightness" | "color" | "white" | "scene";

export const PERSONALITY_STATES = ["neutral", "listening", "thinking", "speaking", "happy", "angry", "sleep"] as const;
export type PersonalityState = (typeof PERSONALITY_STATES)[number];
/** v46: "default" | "off" | "solid:#RRGGBB" | "pulse:#RRGGBB" */
export type LedSetting = string;
export interface Personality {
  sleep_after_s: number; screen_off_after_s: number; sleep_face: boolean;
  awake_brightness: number; sleep_brightness: number; subtitles: boolean; listen_cue: boolean;
  touch_menu: boolean; nod_on_start: boolean;
  status_text?: boolean; listening_waves?: boolean; eyebrows?: boolean; cheeks?: boolean; wake_word?: boolean;
  proximity_control?: boolean; proximity_threshold?: number;
  proximity_threshold_min?: number;
  wake_min_peak?: number; wake_threshold_milli?: number;
  led: Record<PersonalityState, LedSetting>; eye: Record<PersonalityState, string>;
}
export interface TodoItem { id: number; text: string; done: boolean }
export interface TodoResponse { ok: boolean; items?: TodoItem[]; error?: string; max_items?: number }

async function appCall(body?: unknown): Promise<RobotAppStatus> {
  try {
    const parsed = robotAppStatusSchema.safeParse(await call("/api/apps", body));
    if (!parsed.success) throw new Error("Roboten saknar stöd för klockappar. Installera testversion v66 under Uppdatera roboten; v61 finns kvar som återställning.");
    return parsed.data;
  } catch (error) {
    if (error instanceof Error && /404|not found/i.test(error.message)) throw new Error("Roboten saknar stöd för klockappar. Installera testversion v66 under Uppdatera roboten; v61 finns kvar som återställning.");
    throw error;
  }
}

async function focusCall(body?: unknown): Promise<FocusStatus> {
  const unsupported = "Roboten saknar stöd för fokustimern. Installera testversion v68 under Uppdatera roboten; v61 finns kvar som återställning.";
  try {
    const parsed = focusStatusSchema.safeParse(await call("/api/apps/focus", body));
    if (!parsed.success) throw new Error(unsupported);
    return parsed.data;
  } catch (error) {
    if (error instanceof Error && /404|not found/i.test(error.message)) throw new Error(unsupported);
    throw error;
  }
}

export const robot = {
  focus: () => focusCall(),
  focusStart: (body: ReturnType<typeof focusStartRequest>) => focusCall(body),
  focusControl: (action: "pause" | "resume" | "stop") => focusCall({ action }),
  apps: () => appCall(),
  startApp: (body: ReturnType<typeof robotAppRequest>) => appCall(body),
  stopApp: () => appCall({ action: "stop" }),
  status: () => call("/api/status"),
  sensors: () => call<Record<string, unknown>>("/api/sensors"),
  servoStatus: () => call<Record<string, unknown>>("/api/servo/status"),
  /** v77+: bounded diagnostic mode; transcripts are not stored while active. 404 on older firmware. */
  /** USB console commands (firmware SerialCommandPolicy): explicit conversation stop/start. */
  stopConversation: async () => { if (!serialConnected()) throw new Error("Kräver USB."); await sendSerial("stop"); },
  listen: async () => { if (!serialConnected()) throw new Error("Kräver USB."); await sendSerial("listen"); },
  diagnostic: (active: boolean, seconds = 900) => call<{ ok: boolean; active: boolean; remaining_ms: number }>("/api/diagnostic", { active, seconds }),
  performance: (enabled?: boolean) => call<{ enabled: boolean }>("/api/performance", enabled === undefined ? undefined : { enabled }),
  stereoTest: () => call<{ audio_direction?: StereoDiagnostic }>("/api/sensors?audio=1"),
  proximityTest: () => call<{ ltr553?: { ps_raw?: number; ps_ok?: boolean; ps_saturated?: boolean; config_ok?: boolean; near_threshold?: number; control_enabled?: boolean; als_avg?: number; als_valid?: boolean; lux_estimate?: number; last_error?: string } }>("/api/sensors"),
  changeWifi: async (ssid: string, password: string) => {
    const error = wifiError(ssid, password);
    if (error) throw new Error(error);
    const secrets = await call<{ ok?: boolean; updated?: boolean }>("/api/secrets", { wifi_password: password });
    if (secrets.ok !== true || secrets.updated !== true) throw new Error("Lösenordet kunde inte sparas. Nätverksnamnet är inte ändrat.");
    const runtime = await call<{ ok?: boolean; rebooting?: boolean }>("/api/runtime", { wifi_ssid: ssid, wifi_enabled: true, web_enabled: true, reboot: true });
    if (runtime.ok !== true) throw new Error("Lösenordet sparades, men nätverksbytet kunde inte slutföras. Försök igen via USB.");
    return runtime;
  },
  runtime: () => call<Runtime>("/api/runtime"),
  saveRuntime: (r: Partial<Runtime>, reboot = false) => call("/api/runtime", { ...r, reboot }),
  prompts: () => call<{ system_prompt?: string; persona_prompt?: string }>("/api/prompts"),
  savePrompts: (system_prompt: string, persona_prompt: string) => call("/api/prompts", { system_prompt, persona_prompt }),
  say: (text: string) => call("/api/gemini/text", { text }),
  /** Ask Gemini to speak a fixed line (the firmware has no plain TTS). */
  speak: (line: string) => call("/api/gemini/text", { text: `Säg exakt detta högt på svenska, ingenting annat: "${line}"` }),
  lookAndDescribe: () => call("/api/gemini/look", {}),
  toggleVoice: () => call("/api/voice/toggle", {}),
  interrupt: () => call("/api/voice/interrupt", {}),
  showText: (text: string) => call("/api/display", { type: "text", text }),
  clearScreen: () => call("/api/display", { image: "clear" }),
  /** Bounded JPEG (≤64 KiB decoded; over USB the whole request line must fit 6144 bytes). */
  /** v85+: apps stored and played on the robot (404 on older firmware). */
  robotApps: () => call<Record<string, unknown>>("/api/robotapps"),
  robotAppsPost: (body: Record<string, unknown>) => call<Record<string, unknown>>("/api/robotapps", body),
  showImage: (jpeg_base64: string) => call<{ ok: boolean }>("/api/display", { jpeg_base64 }),
  gesture: (gesture: string) => call("/api/servo/gesture", { gesture }),
  emotion: (emotion: string) => call("/api/emotion", { emotion }),
  /** pan −90…90°, tilt −30…30° → firmware units (x ±1280, y 0…900). */
  look: (pan: number, tilt: number, speed = 600) =>
    call("/api/servo/move", { action: "move", x: Math.round((pan / 90) * 1280), y: Math.round(450 + (tilt / 30) * 450), speed }),
  home: () => call("/api/servo/move", { action: "home", speed: 500 }),
  led: (mode: "auto" | "solid" | "off" | "rainbow" | "pulse", hex = "#000000") => {
    const n = parseInt(hex.slice(1), 16);
    return call("/api/led", { mode, r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 });
  },
  dialogues: () => call<{ dialogues_preview?: string; note?: string }>("/api/memory/dialogues"),
  searchTest: (query: string) => call("/api/search/test", { query }),
  saveTuyaKeys: (clientId: string, clientSecret: string) =>
    call<{ ok?: boolean; tuya_client_id?: string; tuya_client_secret?: string; error?: string }>("/api/secrets", { tuya_client_id: clientId.trim(), tuya_client_secret: clientSecret.trim() }),
  clearTuyaKeys: () => call("/api/secrets", { tuya_clear: true }),
  homeStart: (body: { action: "list" } | { action: HomeAction; target: string; brightness?: number; color?: string }) => call("/api/home", body),
  homePoll: () => call<HomeResult>("/api/home"),
  homeScenes: () => call<{ ok: boolean; scenes: LocalScene[] }>("/api/home/scenes"),
  saveHomeScene: (scene: LocalScene) => call<{ ok: boolean; scenes: LocalScene[] }>("/api/home/scenes", { action: "save", scene }),
  deleteHomeScene: (name: string) => call<{ ok: boolean; scenes: LocalScene[] }>("/api/home/scenes", { action: "delete", name }),
  searchResult: () => call<SearchTestResult>("/api/search/test"),
  /** Saved on the robot only; the robot never returns the key, just "set"/"missing". */
  saveTavilyKey: (key: string) => call<{ tavily_api_key?: string }>("/api/secrets", { tavily_api_key: key.trim() }),
  clearTavilyKey: () => call<{ tavily_api_key?: string }>("/api/secrets", { tavily_api_key_clear: true }),
  startAudioTest: () => call<AudioTestStatus>("/api/audio/test", { action: "start" }),
  audioTestStatus: () => call<AudioTestStatus>("/api/audio/test"),
  clearAudioTest: (id: number) => call("/api/audio/test", { action: "clear", id }),
  audioTestChunk: (id: number, offset: number, count: number) =>
    call<{ ok: boolean; id: number; offset: number; data: string }>("/api/audio/chunk", { id, offset, count }),
  bluetooth: () => call<{ enabled: boolean; connected: boolean; at_boot: boolean; name: string }>("/api/ble"),
  setBluetooth: (b: { enabled?: boolean; at_boot?: boolean }) => call("/api/ble", b),
  cameraStreamUrl: () => `${base()}/stream?t=${Date.now()}`,
  cameraStatus: () => call<{ streaming?: boolean; stream_frames?: number; last_error?: string }>("/api/camera/status"),
  stopCameraStream: () => call("/api/camera/stream/stop", {}),
  /** v28: one JPEG frame as base64 – works over USB with no network. */
  personality: () => call<{ ok: boolean; personality: Personality }>("/api/personality"),
  savePersonality: (p: Partial<Personality>) => call<{ ok: boolean; personality?: Personality; error?: string }>("/api/personality", p),
  todos: (body?: { action: "add" | "complete" | "remove" | "clear_done"; text?: string; id?: number }) =>
    call<TodoResponse>("/api/todos", body),
  cameraFrame: () => call<{ ok: boolean; jpeg_base64?: string; jpeg_bytes?: number; error?: string }>("/api/camera/frame", {}),
  cameraUrl: () => `${base()}/api/camera/latest.jpg?t=${Date.now()}`,
};
