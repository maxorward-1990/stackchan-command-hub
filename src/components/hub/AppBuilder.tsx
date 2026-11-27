import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Download, FolderDown, Gauge, Loader2, Play, Plus, RefreshCw, RotateCcw, Save, Send, Sparkles, Square, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useLocal } from "@/lib/use-local";
import { fitJpeg } from "@/lib/jpeg-fit";
import { ROBOT_APPS_KEY, readSensorsOnce, resetRobot, runApp, setEngineApps, stopRunning, useAppEngine } from "@/lib/robot-app-engine";
import {
  ACTION_LABELS, EMOTION_CHOICES, EXAMPLE_APP, GESTURE_CHOICES, MAX_ACTIONS, MAX_APPS, MAX_IMAGE_BASE64, MAX_TRIGGERS, ROBOT_ONLY_ACTIONS, ROBOT_ONLY_TRIGGERS,
  SOUND_CHOICES, TRIGGER_LABELS, appProblem, defaultAction, defaultTrigger, exportRobotApps, importRobotApps, readRobotApps,
  type Action, type ActionKind, type RobotApp, type SensorSnapshot, type Trigger, type TriggerKind,
} from "@/lib/robot-apps";
import { useRobotApps, type RobotState } from "./RobotAppsPanel";

const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";
const DAYS = ["S", "M", "T", "O", "T", "F", "L"];  // getDay(): 0 = söndag
const newApp = (): RobotApp => ({ id: crypto.randomUUID(), name: "Ny app", enabled: false, cooldown_s: 5, triggers: [{ kind: "button" }], actions: [defaultAction("led")] });
const short = (k: string) => (TRIGGER_LABELS[k as TriggerKind] ?? k).replace(/^Om /, "").replace(/ \(.*\)$/, "");
const summary = (app: RobotApp) => app.triggers.map(t => t.kind === "says" ? `säger "${t.phrase}"` : t.kind === "time" ? `kl ${t.at}` : short(t.kind)).join(" · ");
const robotOnly = <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">bara på roboten</span>;
const STATE_TEXT: Record<RobotState, string> = { unknown: "", not_sent: "Inte skickad till roboten", synced: "På roboten", changed: "Ändrad – skicka igen" };

function TriggerFields({ t, set, sensors }: { t: Trigger; set: (t: Trigger) => void; sensors: SensorSnapshot | null }) {
  switch (t.kind) {
    case "time": return <div className="flex flex-wrap items-center gap-2">
      <Input type="time" className="w-32" value={t.at} onChange={e => set({ ...t, at: e.target.value || t.at })} />
      {DAYS.map((d, i) => { const on = t.days.includes(i); return <Button key={i} size="sm" variant={on ? "secondary" : "outline"} aria-pressed={on} className="w-9 px-0"
        onClick={() => set({ ...t, days: on ? t.days.filter(x => x !== i) : [...t.days, i].sort() })}>{d}</Button>; })}
    </div>;
    case "says": return <div className="space-y-1"><Input maxLength={60} value={t.phrase} placeholder="ord eller fras" onChange={e => set({ ...t, phrase: e.target.value })} />
      <p className="text-xs text-muted-foreground">På roboten fungerar det alltid; när du provar från datorn krävs USB. Taligenkänningen kan höra fel – välj ett tydligt ord. "Starta appen …" fungerar även utan det här villkoret.</p></div>;
    case "near": return <div className="space-y-1"><div className="flex flex-wrap items-center gap-2 text-sm"><span>Nära när värdet ≥</span><Input type="number" className="w-24" min={1} max={2047} value={t.threshold} onChange={e => set({ ...t, threshold: Number(e.target.value) || 1 })} />
      <span className="text-xs text-muted-foreground">nu: {sensors?.ps_raw ?? "–"}</span></div>
      <p className="text-xs text-muted-foreground">Sensorn sitter vid skärmens nederkant. Typiskt 0–2 utan hand och 10–60 med handen nära nederkanten – 10 är en bra start.</p></div>;
    case "light": return <div className="space-y-1"><div className="flex flex-wrap items-center gap-2 text-sm">
      <select className={sel} value={t.when} onChange={e => set({ ...t, when: e.target.value as "dark" | "bright" })}><option value="dark">Mörkt: värde ≤</option><option value="bright">Ljust: värde ≥</option></select>
      <Input type="number" className="w-24" min={0} max={65535} value={t.threshold} onChange={e => set({ ...t, threshold: Number(e.target.value) || 0 })} />
      <span className="text-xs text-muted-foreground">nu: {sensors?.als_avg ?? "–"}</span></div>
      <p className="text-xs text-muted-foreground">Mät med taklampan tänd och släckt. En hand framför sensorn ger också "mörkt".</p></div>;
    default: return ROBOT_ONLY_TRIGGERS.includes(t.kind) ? <p className="text-xs text-muted-foreground">Roboten känner av det här själv (firmware v87+).</p> : null;
  }
}

function ActionFields({ a, set }: { a: Action; set: (a: Action) => void }) {
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  switch (a.kind) {
    case "led": return <div className="flex flex-wrap items-center gap-2">
      <select className={sel} value={a.mode} onChange={e => set({ ...a, mode: e.target.value as typeof a.mode })}>
        <option value="solid">Fast färg</option><option value="pulse">Pulserande</option><option value="rainbow">Regnbåge</option><option value="off">Av</option><option value="auto">Normal (som vanligt)</option></select>
      {(a.mode === "solid" || a.mode === "pulse") && <input type="color" aria-label="Färg" className="h-9 w-14 rounded border" value={a.color} onChange={e => set({ ...a, color: e.target.value })} />}
    </div>;
    case "emotion": return <select className={sel} value={a.emotion} onChange={e => set({ ...a, emotion: e.target.value })}>{EMOTION_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
    case "gesture": return <select className={sel} value={a.gesture} onChange={e => set({ ...a, gesture: e.target.value })}>{GESTURE_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
    case "sound": return <select className={sel} value={a.sound} onChange={e => set({ ...a, sound: e.target.value as typeof a.sound })}>{SOUND_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
    case "look": return <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>Sida</span><Input type="number" className="w-20" min={-90} max={90} value={a.pan} onChange={e => set({ ...a, pan: Math.max(-90, Math.min(90, Number(e.target.value) || 0)) })} />
      <span>Upp/ner</span><Input type="number" className="w-20" min={-30} max={30} value={a.tilt} onChange={e => set({ ...a, tilt: Math.max(-30, Math.min(30, Number(e.target.value) || 0)) })} /><span className="text-xs text-muted-foreground">grader</span></div>;
    case "text": case "speak": case "todo": return <div className="space-y-1"><Input maxLength={a.kind === "todo" ? 120 : 200} value={a.text} onChange={e => set({ ...a, text: e.target.value })} />
      {a.kind === "speak" && <p className="text-xs text-muted-foreground">Gemini läser upp meningen (roboten har ingen egen talsyntes). Nästa steg väntar tills roboten pratat klart.</p>}</div>;
    case "ask": return <Textarea maxLength={400} rows={2} value={a.prompt} onChange={e => set({ ...a, prompt: e.target.value })} />;
    case "describe": return <div className="space-y-1"><Textarea maxLength={400} rows={2} value={a.prompt} onChange={e => set({ ...a, prompt: e.target.value })} />
      <p className="text-xs text-muted-foreground">Roboten tar en bild, Gemini tittar och svarar högt. Kräver att verktyget Kamera är påslaget i Inställningar.</p></div>;
    case "photo": return <label className="flex flex-wrap items-center gap-2 text-sm"><Switch checked={a.show} onCheckedChange={show => set({ ...a, show })} />Visa bilden på skärmen
      <span className="text-xs text-muted-foreground">· sparas på roboten (senaste 20) och på SD-kortet om det sitter i. Se Kamera → Foton.</span></label>;
    case "image": return <div className="flex flex-wrap items-center gap-3">
      {a.jpeg_base64 && <img alt={a.name || "Vald bild"} className="h-16 rounded border" src={`data:image/jpeg;base64,${a.jpeg_base64}`} />}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => file.current?.click()}>{busy ? <Loader2 className="animate-spin" /> : <Upload />}{a.jpeg_base64 ? "Byt bild" : "Välj bild"}</Button>
      <span className="text-xs text-muted-foreground">Förminskas till 320×240.</span>
      <input ref={file} type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
        setBusy(true); try { set({ ...a, name: f.name.slice(0, 80), jpeg_base64: await fitJpeg(f, MAX_IMAGE_BASE64) }); } catch (err) { toast.error(err instanceof Error ? err.message : "Bilden kunde inte läsas."); } finally { setBusy(false); } }} />
    </div>;
    case "lights": return <div className="flex flex-wrap items-center gap-2">
      <select className={sel} value={a.action} onChange={e => set({ ...a, action: e.target.value as typeof a.action })}><option value="scene">Kör scen</option><option value="on">Tänd lampa</option><option value="off">Släck lampa</option></select>
      <Input className="w-48" maxLength={40} placeholder={a.action === "scene" ? "scenens namn" : "lampans namn"} value={a.target} onChange={e => set({ ...a, target: e.target.value })} /></div>;
    case "timer": return <div className="flex items-center gap-2 text-sm"><Input type="number" className="w-20" min={1} max={90} value={a.minutes} onChange={e => set({ ...a, minutes: Math.max(1, Math.min(90, Math.round(Number(e.target.value) || 1))) })} /><span>minuter (widget)</span></div>;
    case "wait": return <div className="flex items-center gap-2 text-sm"><Input type="number" className="w-20" step={0.5} min={0.2} max={60} value={a.seconds} onChange={e => set({ ...a, seconds: Math.max(0.2, Math.min(60, Number(e.target.value) || 1)) })} /><span>sekunder</span></div>;
    case "listen": return <p className="text-xs text-muted-foreground">Roboten börjar lyssna som när du trycker på skärmen. Appen fortsätter när samtalet är slut.</p>;
    case "stop_talk": return <p className="text-xs text-muted-foreground">Avslutar ett pågående samtal.</p>;
    case "reset": return <p className="text-xs text-muted-foreground">Vanlig LED, rensad skärm, neutralt ansikte, huvudet i mitten.</p>;
    default: return null;
  }
}

export function AppBuilder() {
  const [stored, setStored] = useLocal<RobotApp[]>(ROBOT_APPS_KEY, []);
  const apps = readRobotApps(stored);
  const [draft, setDraft] = useState<RobotApp | null>(null);
  const engine = useAppEngine();
  const r = useRobotApps();
  const file = useRef<HTMLInputElement>(null);
  const problem = draft ? appProblem(draft) : null;
  const appsKey = JSON.stringify(apps);
  useEffect(() => { setEngineApps(apps); }, [appsKey]);  // eslint-disable-line react-hooks/exhaustive-deps
  const busy = r.busy !== null || engine.running !== null;

  const store = (next: RobotApp[]) => setStored(next);
  const save = (d: RobotApp) => {
    if (appProblem(d)) return false;
    if (!apps.some(a => a.id === d.id) && apps.length >= MAX_APPS) { toast.error(`Biblioteket rymmer ${MAX_APPS} appar.`); return false; }
    store(apps.some(a => a.id === d.id) ? apps.map(a => a.id === d.id ? d : a) : [...apps, d]);
    return true;
  };
  const setTrigger = (i: number, t: Trigger) => draft && setDraft({ ...draft, triggers: draft.triggers.map((x, j) => j === i ? t : x) });
  const setAction = (i: number, a: Action) => draft && setDraft({ ...draft, actions: draft.actions.map((x, j) => j === i ? a : x) });
  const move = (i: number, d: -1 | 1) => { if (!draft) return; const l = [...draft.actions]; const [x] = l.splice(i, 1); if (x) l.splice(i + d, 0, x); setDraft({ ...draft, actions: l }); };
  const runAnywhere = (app: RobotApp) => { if (r.stateOf(app) === "synced") void r.run(app.id); else void runApp(app, "provkörning från datorn"); };
  const exportAll = () => {
    const url = URL.createObjectURL(new Blob([exportRobotApps(apps)], { type: "application/json" }));
    const el = document.createElement("a"); el.href = url; el.download = "stackchan-robotappar.json"; el.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const robotOnlyApps = r.status?.apps.filter(a => !apps.some(h => h.id === a.id)) ?? [];
  const sendingPct = r.busy?.startsWith("send:") ? r.busy.split(":")[2] : null;

  return <section className="space-y-5 border-b pb-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-lg font-semibold">Mina appar</h3><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Om … så …: välj vad som startar appen och vad roboten ska göra. Skicka appen till roboten så fungerar den utan dator – starta med rösten ("starta appen …"), från robotens meny Mina appar eller automatiskt.</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="icon" title="Exportera appar till en fil" aria-label="Exportera appar" disabled={!apps.length} onClick={exportAll}><Download /></Button>
        <Button variant="outline" size="icon" title="Importera appar från en fil" aria-label="Importera appar" onClick={() => file.current?.click()}><Upload /></Button>
        <Button variant="outline" size="icon" title="Spara alla appar på ett SD-kort" aria-label="Spara på SD-kort" disabled={busy} onClick={() => void r.exportSd(apps)}><FolderDown /></Button>
        <Button variant="outline" onClick={() => setDraft({ ...EXAMPLE_APP, id: crypto.randomUUID() })}><Sparkles />Exempel</Button>
        <Button onClick={() => setDraft(newApp())}><Plus />Ny app</Button>
        <input ref={file} type="file" accept=".json,application/json" className="hidden" onChange={async e => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
          try { if (f.size > 1_500_000) throw new Error("Filen är för stor."); const imported = importRobotApps(await f.text()).map(a => ({ ...a, id: crypto.randomUUID() }));
            if (apps.length + imported.length > MAX_APPS) throw new Error(`Biblioteket rymmer ${MAX_APPS} appar.`); store([...apps, ...imported]); toast.success(`${imported.length} appar importerade.`);
          } catch (err) { toast.error(err instanceof Error ? err.message : "Importen misslyckades."); } }} />
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm">
      {engine.running ? <><Loader2 className="size-4 animate-spin text-primary" /><span>Provkör <b>{engine.running.name}</b> från datorn</span><Button size="sm" variant="outline" onClick={stopRunning}><Square />Stoppa</Button></>
        : r.status?.running ? <><Loader2 className="size-4 animate-spin text-primary" /><span>Roboten kör <b>{r.status.running.name}</b></span><Button size="sm" variant="outline" disabled={r.busy !== null} onClick={() => void r.stop()}><Square />Stoppa</Button></>
        : <span className="text-muted-foreground">{r.status ? `Roboten: ${r.status.apps.length} av ${r.status.max_apps} appar · ${Math.round(r.status.bytes_used / 1024)} kB${r.status.last_error ? ` · senaste fel: ${r.status.last_error}` : ""}` : r.problem || "Hämtar robotens appar…"}</span>}
      {sendingPct && <span className="text-xs text-muted-foreground">Skickar… {sendingPct}%</span>}
      <Button size="icon" variant="ghost" title="Uppdatera robotens status" aria-label="Uppdatera" disabled={r.busy !== null} onClick={() => void r.refresh(false)}><RefreshCw /></Button>
      <span className="ml-auto text-xs text-muted-foreground">{engine.sensorError ? `Sensorer: ${engine.sensorError}` : engine.sensors ? `Närhet ${engine.sensors.ps_raw ?? "–"} · ljus ${engine.sensors.als_avg ?? "–"} · huvud ${engine.sensors.head_pressed ? "rörs" : "–"}` : ""}</span>
      <Button size="sm" variant="ghost" title="Läs sensorerna en gång, för att välja gränsvärden" onClick={() => void readSensorsOnce().catch(e => toast.error(e instanceof Error ? e.message : "Sensorerna svarar inte."))}><Gauge />Läs sensorer</Button>
      <Button size="sm" variant="outline" title="Stoppa appen och återställ LED, skärm, ansikte och huvud" onClick={() => void resetRobot().then(() => r.refresh(true)).catch(e => toast.error(e instanceof Error ? e.message : "Återställningen misslyckades."))}><RotateCcw />Återställ</Button>
    </div>

    {apps.length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{apps.map(app => {
      const st = r.stateOf(app); const onRobot = r.robotApp(app.id);
      return <div key={app.id} className={`space-y-2 rounded-md border px-3 py-3 ${draft?.id === app.id ? "border-primary bg-secondary" : ""}`}>
        <button className="block w-full text-left" title="Redigera" onClick={() => setDraft(app)}>
          <span className="block break-words font-semibold">{app.name}</span>
          <span className="mt-1 block text-xs text-muted-foreground">{summary(app)} · {app.actions.length} steg</span>
          {st !== "unknown" && <span className={`mt-1 block text-xs ${st === "changed" ? "text-amber-600 dark:text-amber-400" : st === "synced" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
            {STATE_TEXT[st]}{st === "synced" && onRobot ? (onRobot.enabled ? " · aktiv" : " · avstängd") : ""}{app.enabled ? " · provas från datorn" : ""}</span>}
        </button>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={st === "synced" ? "outline" : "default"} disabled={busy || !!appProblem(app)} title="Skicka till roboten (fungerar sedan utan dator)" onClick={() => void r.send(app)}>
            {r.busy?.startsWith(`send:${app.id}`) ? <Loader2 className="animate-spin" /> : <Send />}{st === "synced" ? "Skickad" : st === "changed" ? "Uppdatera" : "Skicka"}</Button>
          <Button size="sm" variant="outline" disabled={busy} title={st === "synced" ? "Kör på roboten" : "Provkör från datorn"} aria-label={`Kör ${app.name}`} onClick={() => runAnywhere(app)}><Play />Kör</Button>
          {onRobot && <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground" title="Aktiv: roboten lyssnar på appens villkor (klockslag, sensorer, ord …)">
            <Switch aria-label={`${app.name} aktiv på roboten`} checked={onRobot.enabled} disabled={r.busy !== null} onCheckedChange={en => void r.enable(app.id, en)} />Aktiv</label>}
        </div>
      </div>; })}</div>}

    {robotOnlyApps.length > 0 && <div className="space-y-2 rounded-md border border-dashed p-3">
      <p className="text-sm font-medium">Bara på roboten <span className="text-xs font-normal text-muted-foreground">(finns inte i den här webbläsaren – t.ex. från SD-kort eller en annan dator)</span></p>
      {robotOnlyApps.map(a => <div key={a.id} className="flex items-center gap-3 text-sm">
        <span className="min-w-0 flex-1 break-words">{a.name} <span className="text-xs text-muted-foreground">· {a.triggers.map(short).join(" · ")} · {a.steps} steg</span></span>
        <Button size="icon" variant="outline" title="Kör på roboten" aria-label={`Kör ${a.name} på roboten`} disabled={busy} onClick={() => void r.run(a.id)}><Play /></Button>
        <Switch aria-label={`${a.name} aktiv på roboten`} checked={a.enabled} disabled={r.busy !== null} onCheckedChange={en => void r.enable(a.id, en)} />
        <Button size="icon" variant="ghost" title="Ta bort från roboten" aria-label={`Ta bort ${a.name} från roboten`} disabled={busy} onClick={() => { if (window.confirm(`Ta bort ${a.name} från roboten?`)) void r.remove(a.id); }}><Trash2 /></Button>
      </div>)}
    </div>}

    {draft && <div className="space-y-6 rounded-md border p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-48 flex-1 space-y-2"><Label htmlFor="rapp-name">Appnamn <span className="font-normal text-muted-foreground">(det du säger: "starta appen …")</span></Label><Input id="rapp-name" maxLength={40} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="rapp-cool">Minsta tid mellan automatiska starter (s)</Label><Input id="rapp-cool" type="number" className="w-28" min={0} max={3600} value={draft.cooldown_s} onChange={e => setDraft({ ...draft, cooldown_s: Math.max(0, Math.min(3600, Math.round(Number(e.target.value) || 0))) })} /></div>
        <Button variant="ghost" size="icon" aria-label="Stäng" title="Stäng utan att spara" onClick={() => setDraft(null)}><X /></Button>
      </div>

      <div className="space-y-3"><h4 className="font-medium">Om … <span className="text-xs font-normal text-muted-foreground">(något av villkoren startar appen automatiskt; meny, röst och Kör fungerar alltid)</span></h4>
        {draft.triggers.map((t, i) => <div key={i} className="space-y-2 rounded-md bg-muted/40 p-3">
          <div className="flex items-center gap-2"><span className="flex-1 text-sm font-medium">{TRIGGER_LABELS[t.kind]}{ROBOT_ONLY_TRIGGERS.includes(t.kind) && robotOnly}</span>
            <Button size="icon" variant="ghost" aria-label="Ta bort villkor" disabled={draft.triggers.length <= 1} onClick={() => setDraft({ ...draft, triggers: draft.triggers.filter((_, j) => j !== i) })}><Trash2 /></Button></div>
          <TriggerFields t={t} set={x => setTrigger(i, x)} sensors={engine.sensors} />
        </div>)}
        {draft.triggers.length < MAX_TRIGGERS && <select className={sel} value="" aria-label="Lägg till villkor" onChange={e => { const k = e.target.value as TriggerKind; if (k) setDraft({ ...draft, triggers: [...draft.triggers, defaultTrigger(k)] }); }}>
          <option value="">+ Lägg till villkor…</option>{(Object.keys(TRIGGER_LABELS) as TriggerKind[]).map(k => <option key={k} value={k}>{TRIGGER_LABELS[k]}{ROBOT_ONLY_TRIGGERS.includes(k) ? " (bara på roboten)" : ""}</option>)}</select>}
      </div>

      <div className="space-y-3"><h4 className="font-medium">… så <span className="text-xs font-normal text-muted-foreground">(stegen körs i ordning – eller samtidigt med steget före)</span></h4>
        {draft.actions.map((a, i) => <div key={i} className={`space-y-2 rounded-md bg-muted/40 p-3 ${a.with_previous && i > 0 ? "ml-6 border-l-4 border-primary/60" : ""}`}>
          <div className="flex flex-wrap items-center gap-1"><span className="flex-1 text-sm font-medium">{a.with_previous && i > 0 ? "+ samtidigt: " : `${i + 1}. `}{ACTION_LABELS[a.kind]}{ROBOT_ONLY_ACTIONS.includes(a.kind) && robotOnly}</span>
            {i > 0 && <label className="mr-2 flex items-center gap-1.5 text-xs text-muted-foreground" title="Starta samtidigt som steget före i stället för efter">
              <Switch aria-label={`Steg ${i + 1} samtidigt`} checked={!!a.with_previous} onCheckedChange={w => setAction(i, { ...a, with_previous: w })} />samtidigt</label>}
            <Button size="icon" variant="ghost" aria-label="Flytta upp" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
            <Button size="icon" variant="ghost" aria-label="Flytta ner" disabled={i === draft.actions.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
            <Button size="icon" variant="ghost" aria-label="Ta bort steg" disabled={draft.actions.length <= 1} onClick={() => setDraft({ ...draft, actions: draft.actions.filter((_, j) => j !== i) })}><Trash2 /></Button></div>
          <ActionFields a={a} set={x => setAction(i, x)} />
        </div>)}
        {draft.actions.length < MAX_ACTIONS && <select className={sel} value="" aria-label="Lägg till steg" onChange={e => { const k = e.target.value as ActionKind; if (k) setDraft({ ...draft, actions: [...draft.actions, defaultAction(k)] }); }}>
          <option value="">+ Lägg till steg…</option>{(Object.keys(ACTION_LABELS) as ActionKind[]).map(k => <option key={k} value={k}>{ACTION_LABELS[k]}{ROBOT_ONLY_ACTIONS.includes(k) ? " (bara på roboten)" : ""}</option>)}</select>}
        <p className="text-xs text-muted-foreground">Samtidigt: högst en rörelse, ett tal och en sak på skärmen per grupp. Rörelser i en grupp med tal startar när roboten börjar prata.</p>
      </div>

      <label className="flex items-start gap-3 rounded-md border border-dashed p-3 text-sm">
        <Switch className="mt-0.5" checked={draft.enabled} onCheckedChange={enabled => setDraft({ ...draft, enabled })} />
        <span><b>Prova villkoren från datorn</b><span className="block text-xs text-muted-foreground">Command Hub lyssnar på villkoren medan sidan är öppen och ansluten – för att testa utan att skicka. Stäng av när appen är skickad, annars kan den starta två gånger.</span></span>
      </label>

      {problem && <p className="text-sm text-destructive">{problem}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!!problem || busy} onClick={() => { if (save(draft)) void r.send(draft); }}><Send />Spara och skicka till roboten</Button>
        <Button variant="outline" disabled={!!problem} onClick={() => { if (save(draft)) toast.success("Appen sparad i Command Hub."); }}><Save />Spara</Button>
        <Button variant="outline" disabled={!!problem || busy} onClick={() => void runApp(draft, "provkörning från datorn")}><Play />Provkör från datorn</Button>
        <Button variant="outline" onClick={() => setDraft({ ...draft, id: crypto.randomUUID(), name: `${draft.name.slice(0, 33)} kopia`, enabled: false })}><Copy />Duplicera</Button>
        <Button variant="ghost" size="icon" aria-label="Ta bort app" title="Ta bort app" disabled={busy || !apps.some(a => a.id === draft.id)} onClick={() => {
          const onRobot = !!r.robotApp(draft.id);
          if (!window.confirm(onRobot ? `Ta bort ${draft.name} här och från roboten?` : `Ta bort ${draft.name}?`)) return;
          if (onRobot) void r.remove(draft.id);
          store(apps.filter(a => a.id !== draft.id)); setDraft(null); }}><Trash2 /></Button>
      </div>
    </div>}

    {engine.log.length > 0 && <details className="text-xs"><summary className="cursor-pointer font-medium">Logg för provkörningar från datorn ({engine.log.length})</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-muted-foreground">{engine.log.join("\n")}</pre></details>}
  </section>;
}
