import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { robot } from "@/lib/gemini-robot";
import { readStored, writeStored } from "@/lib/app-storage";
import { useWebSerial } from "@/lib/web-serial";
import type { RobotApp } from "@/lib/robot-apps";
import { packageFiles, robotAppsStatusSchema, robotErrorText, sendPackage, toRobotPackage, type RobotAppsStatus } from "@/lib/robot-app-transfer";

const SENT_KEY = "sc.robotAppsSent.v1";
/** Short fingerprint of what the robot would receive, to show "Ändrad – skicka igen". */
export function fingerprint(app: RobotApp) {
  const pkg = toRobotPackage({ ...app, enabled: true }, true);
  const s = pkg.json + pkg.files.map(f => `${f.file}:${f.base64.length}:${f.base64.slice(-24)}`).join("|");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
const readSent = (): Record<string, string> => { try { return JSON.parse(readStored(SENT_KEY) ?? "{}") as Record<string, string>; } catch { return {}; } };

export type RobotState = "unknown" | "not_sent" | "synced" | "changed";

/** Robot side of the app builder: status (fetched automatically), send, run, enable, delete, SD export. */
export function useRobotApps() {
  const [status, setStatus] = useState<RobotAppsStatus | null>(null);
  const [problem, setProblem] = useState("");  // why the robot list is unavailable (not connected / old firmware)
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, string>>({});
  const { connected: usb } = useWebSerial();
  useEffect(() => { setSent(readSent()); }, []);

  const accept = (r: unknown) => {
    const p = robotAppsStatusSchema.safeParse(r);
    if (!p.success) throw new Error("Oväntat svar från roboten – kräver firmware v85 eller senare.");
    setStatus(p.data); setProblem("");
    return p.data;
  };
  const work = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error(robotErrorText(e instanceof Error ? e.message : String(e))); } finally { setBusy(null); }
  };
  const refresh = useCallback(async (quiet = true) => {
    try { accept(await robot.robotApps()); }
    catch (e) { setStatus(null); setProblem(robotErrorText(e instanceof Error ? e.message : String(e))); if (!quiet) toast.error(robotErrorText(e instanceof Error ? e.message : String(e))); }
  }, []);
  useEffect(() => { void refresh(true); }, [refresh, usb]);  // on open and whenever USB connects

  const post = async (body: Record<string, unknown>) => accept(await robot.robotAppsPost(body));
  const stateOf = (app: RobotApp): RobotState => {
    if (!status) return "unknown";
    if (!status.apps.some(a => a.id === app.id)) return "not_sent";
    try { return sent[app.id] === fingerprint(app) ? "synced" : "changed"; } catch { return "changed"; }
  };
  const robotApp = (id: string) => status?.apps.find(a => a.id === id);
  const send = (app: RobotApp) => work(`send:${app.id}`, async () => {
    const enabled = robotApp(app.id)?.enabled ?? true;
    const pkg = toRobotPackage(app, enabled);
    accept(await sendPackage(pkg, b => robot.robotAppsPost(b), (d, n) => setBusy(`send:${app.id}:${Math.round((d / n) * 100)}`)));
    const next = { ...readSent(), [app.id]: fingerprint(app) };
    writeStored(SENT_KEY, JSON.stringify(next)); setSent(next);
    toast.success(`${app.name} finns på roboten${enabled ? " och är aktiv" : " (avstängd)"}. Starta den med rösten ("starta appen ${app.name}"), från robotens meny Mina appar eller med ▶ här.`, { duration: 8000 });
  });
  const run = (id: string) => work("run", async () => { await post({ action: "run", id }); });
  const enable = (id: string, enabled: boolean) => work("enable", async () => { await post({ action: "enable", id, enabled }); });
  const remove = (id: string) => work("delete", async () => { await post({ action: "delete", id }); });
  const stop = () => work("stop", async () => { await post({ action: "stop" }); });
  const exportSd = (apps: RobotApp[]) => work("sd", async () => {
    const picker = (window as unknown as { showDirectoryPicker?: (o: { mode: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
    if (!picker) throw new Error("Webbläsaren kan inte skriva mappar. Använd Chrome eller Edge på datorn.");
    if (!apps.length) throw new Error("Det finns inga appar att exportera.");
    const root = await picker({ mode: "readwrite" });
    const dir = await root.getDirectoryHandle("stackchan-apps", { create: true });
    const skipped: string[] = [];
    let written = 0;
    for (const app of apps) {
      let files;
      try { files = packageFiles(toRobotPackage(app, true)); } catch { skipped.push(app.name); continue; }
      for (const f of files) {
        const w = await (await dir.getFileHandle(f.name, { create: true })).createWritable();
        await w.write(new Blob([f.bytes as Uint8Array<ArrayBuffer>])); await w.close();
      }
      written++;
    }
    toast.success(`${written} appar sparade i mappen stackchan-apps${skipped.length ? ` (hoppade över: ${skipped.join(", ")})` : ""}. Sätt i kortet i roboten och välj Mina appar → SD-kort i robotens meny.`, { duration: 12000 });
  });
  return { status, problem, busy, refresh, send, run, enable, remove, stop, exportSd, stateOf, robotApp };
}
