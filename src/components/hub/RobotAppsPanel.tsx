import { useState } from "react";
import { FolderDown, Loader2, Play, RefreshCw, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { robot } from "@/lib/gemini-robot";
import { TRIGGER_LABELS, type RobotApp, type TriggerKind } from "@/lib/robot-apps";
import { packageFiles, robotAppsStatusSchema, robotErrorText, sendPackage, toRobotPackage, type RobotAppsStatus } from "@/lib/robot-app-transfer";

const short = (k: string) => (TRIGGER_LABELS[k as TriggerKind] ?? k).replace(/^Om /, "").replace(/ \(.*\)$/, "").replace("När jag trycker på Kör", "knapp/röst/meny");

async function readStatus(r: unknown): Promise<RobotAppsStatus> {
  const p = robotAppsStatusSchema.safeParse(r);
  if (!p.success) throw new Error("Oväntat svar från roboten – kräver firmware v85.");
  return p.data;
}

/** Robot side of the app builder: send, list, run, enable, delete and SD-card export. */
export function useRobotApps() {
  const [status, setStatus] = useState<RobotAppsStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const work = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error(robotErrorText(e instanceof Error ? e.message : String(e))); } finally { setBusy(null); }
  };
  const post = async (body: Record<string, unknown>) => readStatus(await robot.robotAppsPost(body));
  const refresh = () => work("refresh", async () => setStatus(await readStatus(await robot.robotApps())));
  const send = (app: RobotApp, after: () => void) => work(`send:${app.id}`, async () => {
    const pkg = toRobotPackage(app, true);
    setStatus(await readStatus(await sendPackage(pkg, b => robot.robotAppsPost(b), (d, n) => setBusy(`send:${app.id}:${Math.round((d / n) * 100)}`))));
    after();
    toast.success(`${app.name} finns nu på roboten och är aktiv. Starta den med rösten ("starta appen ${app.name}") eller under Mina appar i robotens meny.`);
  });
  return { status, busy, refresh, send, post, setStatus, work };
}

export function RobotAppsPanel({ state, apps }: { state: ReturnType<typeof useRobotApps>; apps: RobotApp[] }) {
  const { status, busy, refresh, post, setStatus, work } = state;
  const exportSd = () => work("sd", async () => {
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
    toast.success(`${written} appar sparade i mappen stackchan-apps${skipped.length ? ` (hoppade över: ${skipped.join(", ")})` : ""}. Sätt i kortet när roboten redan är igång, öppna menyn → Mina appar → SD-kort, och ta sedan ut kortet.`, { duration: 12000 });
  });
  const sending = busy?.startsWith("send:") ? busy.split(":")[2] : null;
  return <div className="space-y-3 rounded-md border p-4">
    <div className="flex flex-wrap items-center gap-2">
      <h4 className="mr-auto font-medium">På roboten <span className="text-xs font-normal text-muted-foreground">(firmware v85+, fungerar utan dator)</span></h4>
      {sending && <span className="text-xs text-muted-foreground">Skickar… {sending}%</span>}
      <Button size="sm" variant="outline" disabled={busy !== null} onClick={refresh}>{busy === "refresh" ? <Loader2 className="animate-spin" /> : <RefreshCw />}Hämta</Button>
      <Button size="sm" variant="outline" disabled={busy !== null} title="Spara alla appar i en mapp på ett SD-kort" onClick={exportSd}><FolderDown />SD-kort</Button>
    </div>
    {!status && <p className="text-sm text-muted-foreground">Tryck Hämta för att se apparna på roboten. Skicka en app med knappen ↑ vid appen ovan.</p>}
    {status && <>
      <p className="text-xs text-muted-foreground">{status.apps.length}/{status.max_apps} appar · {Math.round(status.bytes_used / 1024)} av {Math.round(status.bytes_max / 1024)} kB
        {status.running ? ` · kör ${status.running.name} (steg ${status.running.step})` : status.pending ? ` · startar ${status.pending}` : ""}{status.last_error ? ` · senaste fel: ${status.last_error}` : ""}</p>
      {status.running && <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => work("stop", async () => setStatus(await post({ action: "stop" })))}><Square />Stoppa appen på roboten</Button>}
      <div className="divide-y">{status.apps.map(a => <div key={a.id} className="flex items-center gap-3 py-2">
        <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{a.name}</p><p className="text-xs text-muted-foreground">{a.triggers.map(short).join(" · ")} · {a.steps} steg</p></div>
        <Button size="icon" variant="outline" title="Kör på roboten" aria-label={`Kör ${a.name} på roboten`} disabled={busy !== null} onClick={() => work("run", async () => setStatus(await post({ action: "run", id: a.id })))}><Play /></Button>
        <Switch aria-label={`${a.name} aktiv på roboten`} title="Aktiv: lyssnar på sina villkor på roboten" checked={a.enabled} disabled={busy !== null} onCheckedChange={enabled => work("enable", async () => setStatus(await post({ action: "enable", id: a.id, enabled })))} />
        <Button size="icon" variant="ghost" title="Ta bort från roboten" aria-label={`Ta bort ${a.name} från roboten`} disabled={busy !== null} onClick={() => { if (window.confirm(`Ta bort ${a.name} från roboten?`)) void work("delete", async () => setStatus(await post({ action: "delete", id: a.id }))); }}><Trash2 /></Button>
      </div>)}</div>
    </>}
  </div>;
}
