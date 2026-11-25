// WebSerial link to the robot's USB console (115200 baud), shared by the whole app
// so the connection survives tab switches and Styrning can send API calls over USB.
// The firmware answers "api #id METHOD /api/path json" with one line "API #id <status> <json>".
import { useCallback, useEffect, useState } from "react";

type SerialPortLike = {
  open(o: { baudRate: number; bufferSize?: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
};

export const serialSupported = () => typeof navigator !== "undefined" && "serial" in navigator;

const MAX_LINES = 800;
type State = { lines: string[]; connected: boolean; error: string };
let state: State = { lines: [], connected: false, error: "" };
const subs = new Set<() => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };

let port: SerialPortLike | null = null;
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let closing = false;
let partial = "";
let nextId = 1;
const pending = new Map<string, (line: string) => void>();
let writeChain: Promise<void> = Promise.resolve();

const lineListeners = new Set<(line: string) => void>();
const commandListeners = new Set<(line: string) => void>();
export function onSerialCommand(fn: (line: string) => void) { commandListeners.add(fn); return () => { commandListeners.delete(fn); }; }
/** Subscribe to every complete line from the robot (returns unsubscribe). */
export function onSerialLine(fn: (line: string) => void) { lineListeners.add(fn); return () => { lineListeners.delete(fn); }; }
function onLine(line: string) {
  lineListeners.forEach((f) => f(line));
  const m = /^API #(\w+) /.exec(line);
  if (m?.[1] && pending.has(m[1])) { pending.get(m[1])?.(line); pending.delete(m[1]); }
}
function push(chunk: string) {
  const parts = (partial + chunk).split(/\r?\n/);
  partial = parts.pop() ?? "";
  const done = parts.filter((l) => l.trim().length > 0);
  done.forEach(onLine);
  // Camera frames arrive as huge base64 lines; keep the console readable.
  const shown = done.map((l) => (l.length > 600 ? `${l.slice(0, 120)}… (${l.length} tecken)` : l));
  if (shown.length) set({ lines: [...state.lines, ...shown].slice(-MAX_LINES) });
}

export async function disconnectSerial() {
  closing = true;
  try { await reader?.cancel(); } catch { /* ignore */ }
  try { await port?.close(); } catch { /* ignore */ }
  reader = null; port = null; set({ connected: false });
}

export async function connectSerial() {
  set({ error: "" });
  if (!serialSupported()) { set({ error: "Din webbläsare saknar USB-stöd. Använd Chrome eller Edge på datorn." }); return; }
  try {
    const serial = (navigator as unknown as { serial: { requestPort(): Promise<SerialPortLike> } }).serial;
    const p = await serial.requestPort();
    await p.open({ baudRate: 115200, bufferSize: 16384 });
    closing = false; port = p; set({ connected: true });
    const decoder = new TextDecoder();
    void (async () => {
      while (p.readable && !closing) {
        const r = p.readable.getReader(); reader = r;
        try {
          for (;;) { const { value, done } = await r.read(); if (done) break; if (value) push(decoder.decode(value, { stream: true })); }
        } catch { break; } finally { r.releaseLock(); }
        if (closing || !port) break;
      }
      set({ connected: false });
    })();
  } catch (e) {
    const msg = (e as Error).message;
    set({ error: msg.includes("No port selected") ? "Ingen port vald." : msg.includes("open") ? "Porten är upptagen – stäng Spacehuhn/ESP Tool först." : msg });
  }
}

async function writeRaw(text: string) {
  const run = async () => {
    const w = port?.writable?.getWriter();
    if (!w) throw new Error("USB inte ansluten.");
    try {
      // Small chunks so the robot's receive buffer never overflows on long JSON.
      const bytes = new TextEncoder().encode(text);
      for (let i = 0; i < bytes.length; i += 256) {
        await w.write(bytes.slice(i, i + 256));
        if (bytes.length > 256) await new Promise((r) => setTimeout(r, 15));
      }
    } finally { w.releaseLock(); }
  };
  const p = writeChain.then(run, run);
  writeChain = p.catch(() => undefined);
  return p;
}

export async function sendSerial(cmd: string) {
  try {
    await writeRaw(cmd.trim() + "\n");
    commandListeners.forEach(fn => fn(`> ${cmd.trim()}`));
    set({ lines: [...state.lines, `> ${cmd.trim()}`].slice(-MAX_LINES) });
  } catch (e) { set({ error: (e as Error).message }); }
}

export const serialConnected = () => state.connected;

/** Run one robot API call over USB. Resolves with HTTP-like status and parsed JSON. */
export function serialApi(method: "GET" | "POST", path: string, body?: unknown, timeoutMs = 10000): Promise<{ status: number; data: unknown }> {
  const id = String(nextId++ % 100000);
  const json = body === undefined ? "" : " " + JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { pending.delete(id); reject(new Error("Roboten svarade inte via USB (tidsgräns). Kör du firmware v14?")); }, timeoutMs);
    pending.set(id, (line) => {
      clearTimeout(t);
      const rest = line.replace(/^API #\w+ /, "");
      const sp = rest.indexOf(" ");
      const status = Number(rest.slice(0, sp));
      const raw = rest.slice(sp + 1);
      let data: unknown = raw;
      try { data = JSON.parse(raw); } catch { /* keep text */ }
      resolve({ status, data });
    });
    writeRaw(`api #${id} ${method} ${path}${json}\n`).catch((e: Error) => { clearTimeout(t); pending.delete(id); reject(e); });
  });
}

export function useWebSerial() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  const setLines = useCallback((fn: string[] | ((l: string[]) => string[])) => set({ lines: typeof fn === "function" ? fn(state.lines) : fn }), []);
  return { lines: state.lines, connected: state.connected, error: state.error, setLines, connect: connectSerial, disconnect: disconnectSerial, send: sendSerial };
}
