// Web Bluetooth link to firmware v15 (Nordic UART layout). Same line protocol as USB:
// "api #id METHOD /api/... json" -> "API #id <status> <json>". Pairing uses the
// 6-digit PIN the robot shows in its on-screen menu (Meny → Bluetooth).
import { useEffect, useState } from "react";

const SVC = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

type Char = { writeValueWithResponse(v: BufferSource): Promise<void>; startNotifications(): Promise<unknown>; addEventListener(t: string, f: (e: Event) => void): void; value?: DataView };
type Device = { name?: string; gatt?: { connected: boolean; connect(): Promise<{ getPrimaryService(u: string): Promise<{ getCharacteristic(u: string): Promise<Char> }> }>; disconnect(): void }; addEventListener(t: string, f: () => void): void };

export const bluetoothSupported = () => typeof navigator !== "undefined" && "bluetooth" in navigator;

type State = { connected: boolean; name: string; error: string; busy: boolean };
let state: State = { connected: false, name: "", error: "", busy: false };
const subs = new Set<() => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };

let device: Device | null = null;
let rx: Char | null = null;
let partial = "";
let nextId = 1;
const pending = new Map<string, (line: string) => void>();
let chain: Promise<void> = Promise.resolve();

function onChunk(text: string) {
  const parts = (partial + text).split("\n");
  partial = parts.pop() ?? "";
  for (const line of parts) {
    const m = /^API #(\w+) /.exec(line);
    if (m?.[1] && pending.has(m[1])) { pending.get(m[1])?.(line); pending.delete(m[1]); }
  }
}

export async function connectBluetooth() {
  set({ error: "" });
  if (!bluetoothSupported()) { set({ error: "Webbläsaren saknar Bluetooth. Använd Chrome på Android/dator, eller Bluefy på iPhone." }); return; }
  try {
    set({ busy: true });
    const bt = (navigator as unknown as { bluetooth: { requestDevice(o: unknown): Promise<Device> } }).bluetooth;
    const d = await bt.requestDevice({ filters: [{ services: [SVC] }] });
    d.addEventListener("gattserverdisconnected", () => { rx = null; set({ connected: false }); });
    const server = await d.gatt!.connect();
    const svc = await server.getPrimaryService(SVC);
    const tx = await svc.getCharacteristic(TX);
    rx = await svc.getCharacteristic(RX);
    const dec = new TextDecoder();
    tx.addEventListener("characteristicvaluechanged", (e) => { const v = (e.target as unknown as Char).value; if (v) onChunk(dec.decode(v)); });
    await tx.startNotifications();  // triggers PIN pairing on first use
    device = d; partial = "";
    set({ connected: true, name: d.name ?? "StackChan" });
  } catch (e) {
    const m = (e as Error).message;
    set({ error: /cancel/i.test(m) ? "Ingen robot vald." : /auth|encrypt|insufficient/i.test(m) ? "Parkopplingen misslyckades – kontrollera PIN-koden på robotens skärm." : m });
  } finally { set({ busy: false }); }
}

export function disconnectBluetooth() { try { device?.gatt?.disconnect(); } catch { /* ignore */ } rx = null; set({ connected: false }); }
export const bluetoothConnected = () => state.connected;

async function write(text: string) {
  const run = async () => {
    if (!rx) throw new Error("Bluetooth inte ansluten.");
    const bytes = new TextEncoder().encode(text);
    for (let i = 0; i < bytes.length; i += 180) await rx.writeValueWithResponse(bytes.slice(i, i + 180));
  };
  const p = chain.then(run, run); chain = p.catch(() => undefined); return p;
}

export function bluetoothApi(method: "GET" | "POST", path: string, body?: unknown, timeoutMs = 10000): Promise<{ status: number; data: unknown }> {
  const id = "b" + (nextId++ % 100000);
  const json = body === undefined ? "" : " " + JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { pending.delete(id); reject(new Error("Roboten svarade inte via Bluetooth (tidsgräns).")); }, timeoutMs);
    pending.set(id, (line) => {
      clearTimeout(t);
      const rest = line.replace(/^API #\w+ /, ""); const sp = rest.indexOf(" ");
      const raw = rest.slice(sp + 1); let data: unknown = raw;
      try { data = JSON.parse(raw); } catch { /* text */ }
      resolve({ status: Number(rest.slice(0, sp)), data });
    });
    write(`api #${id} ${method} ${path}${json}\n`).catch((e: Error) => { clearTimeout(t); pending.delete(id); reject(e); });
  });
}

export function useWebBluetooth() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return { ...state, supported: bluetoothSupported(), connect: connectBluetooth, disconnect: disconnectBluetooth };
}
