import { useState } from "react";
import { Loader2, Maximize, LayoutPanelTop, Pause, Play, RefreshCw, Square, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocal } from "@/lib/use-local";
import { robot } from "@/lib/gemini-robot";
import { DEFAULT_FOCUS, focusConfigSchema, focusStartRequest, focusTotalMinutes, mmss, readFocus, type FocusConfig, type FocusStatus } from "@/lib/focus-app";

const PHASE: Record<FocusStatus["phase"], string> = { off: "Inte igång", focus: "Fokus", break: "Paus", done: "Klart" };
const LIMITS = { focus_min: [1, 90, "Fokus (min)"], break_min: [1, 30, "Paus (min)"], rounds: [1, 8, "Antal pass"] } as const;

export function FocusAppCard() {
  const [stored, setStored] = useLocal<FocusConfig>("sc.focus.v1", DEFAULT_FOCUS);
  const config = readFocus(stored);
  const [status, setStatus] = useState<FocusStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const valid = focusConfigSchema.safeParse(stored).success;
  const run = async (key: string, work: () => Promise<FocusStatus>) => {
    setBusy(key); setError("");
    try { setStatus(await work()); } catch (e) { setError(e instanceof Error ? e.message : "Åtgärden misslyckades."); } finally { setBusy(null); }
  };
  const active = status && (status.phase === "focus" || status.phase === "break");
  return <section className="space-y-5 border-t pt-7">
    <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-lg font-semibold"><Timer className="size-5 text-primary" />Fokustimer</h3><span className="text-xs text-muted-foreground">Appmall 02 · kräver v68</span></div>
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(320px,1fr)]">
      <div className="min-w-0 space-y-5">
        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(LIMITS) as (keyof typeof LIMITS)[]).map(key => { const [min, max, label] = LIMITS[key]; return <div key={key} className="space-y-2">
            <Label htmlFor={`focus-${key}`}>{label}</Label>
            <Input id={`focus-${key}`} type="number" inputMode="numeric" min={min} max={max} value={stored[key]} onChange={e => setStored({ ...stored, [key]: Number(e.target.value) })} />
          </div>; })}
        </div>
        {!valid && <p className="text-sm text-destructive">Fokus 1–90 min, paus 1–30 min, 1–8 pass.</p>}
        <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Skärmläge vid start</legend><div className="grid grid-cols-2 gap-2">
          <Button variant={config.mode === "widget" ? "secondary" : "outline"} aria-pressed={config.mode === "widget"} onClick={() => setStored({ ...config, mode: "widget" })}><LayoutPanelTop />Widget</Button>
          <Button variant={config.mode === "fullscreen" ? "secondary" : "outline"} aria-pressed={config.mode === "fullscreen"} onClick={() => setStored({ ...config, mode: "fullscreen" })}><Maximize />Helskärm</Button>
        </div></fieldset>
        <p className="text-sm text-muted-foreground">Totalt {focusTotalMinutes(config)} min. Ingen paus efter sista passet.</p>
      </div>
      <div className="mx-auto flex aspect-[4/3] w-full max-w-[480px] flex-col overflow-hidden rounded-lg bg-face text-face-foreground" aria-label="Fokustimer förhandsvisning">
        {config.mode === "widget" ? <>
          <div className="flex min-h-0 flex-1 items-center justify-center gap-14" aria-hidden="true"><div className="h-16 w-7 rounded-full bg-chart-2" /><div className="h-16 w-7 rounded-full bg-chart-2" /></div>
          <div className="flex h-[30%] flex-col items-center justify-center border-t border-chart-3 px-5"><span className="font-mono text-3xl tabular-nums text-chart-3">{mmss(config.focus_min * 60000)}</span><span className="text-sm">Fokus · 1/{config.rounds}</span></div>
        </> : <div className="flex h-full flex-col items-center justify-around px-6 py-6 text-center">
          <p className="text-sm">Fokus · pass 1/{config.rounds}</p>
          <p className="font-mono text-6xl tabular-nums text-chart-3">{mmss(config.focus_min * 60000)}</p>
          <div className="h-3 w-full rounded-sm border border-face-foreground/30" />
          <p className="text-xs opacity-60">Tryck: tillbaka till ansiktet</p>
        </div>}
      </div>
    </div>
    <div className="space-y-3">
      {status && <div role="status" className="border-l-2 border-primary pl-3"><p className="font-medium">{PHASE[status.phase]}{status.paused ? " (pausad)" : ""}{status.phase !== "off" ? ` · ${mmss(status.remaining_ms)} · pass ${status.round}/${status.rounds}` : ""}</p>
        <p className="text-sm text-muted-foreground">{status.saved ? (status.persistent ? `Sparad på roboten: ${status.focus_min}/${status.break_min} min` : "Kunde inte sparas på roboten, körs bara tills omstart") : "Ingen timer sparad på roboten"}</p></div>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy !== null || !valid} onClick={() => { void run("start", async () => {
          const result = await robot.focusStart(focusStartRequest(config));
          if (result.phase !== "focus") throw new Error("Roboten bekräftade inte starten.");
          toast.success("Fokustimern körs på roboten."); return result;
        }); }}>{busy === "start" ? <Loader2 className="animate-spin" /> : <Play />}Starta på roboten</Button>
        {active && <Button variant="outline" disabled={busy !== null} onClick={() => { void run("pause", () => robot.focusControl(status.paused ? "resume" : "pause")); }}>{status.paused ? <Play /> : <Pause />}{status.paused ? "Fortsätt" : "Pausa"}</Button>}
        <Button variant="outline" disabled={busy !== null} onClick={() => { void run("stop", async () => { const r = await robot.focusControl("stop"); if (r.phase !== "off") throw new Error("Roboten bekräftade inte stoppet."); return r; }); }}><Square />Stoppa</Button>
        <Button variant="ghost" disabled={busy !== null} onClick={() => { void run("status", () => robot.focus()); }}>{busy === "status" ? <Loader2 className="animate-spin" /> : <RefreshCw />}Läs status</Button>
      </div>
      <p className="text-sm text-muted-foreground">När du startat en gång sparas tiderna på roboten. Sedan kan du starta, pausa och stoppa direkt på roboten: svep upp och svep till sidan Fokus. Tryck eller väckningsord tar tillbaka ansiktet, men timern fortsätter i bottenremsan. Inget ljudlarm ännu, fasbyte syns med färg och ram.</p>
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    </div>
  </section>;
}
