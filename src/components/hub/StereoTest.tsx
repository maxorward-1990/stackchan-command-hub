import { useEffect, useRef, useState } from "react";
import { AudioLines, CheckCircle2, Download, Play, Square, TriangleAlert, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { robot } from "@/lib/gemini-robot";
import { channelFindings, micVerdict, stereoLabel, stereoLevel, type MicStep, type StereoDiagnostic } from "@/lib/robot-network";

export function StereoTest() {
  const [samples, setSamples] = useState<{ at: string; audio: StereoDiagnostic }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [target, setTarget] = useState(1);
  const [steps, setSteps] = useState<Partial<Record<MicStep, StereoDiagnostic[]>>>({});
  const [stepBusy, setStepBusy] = useState<MicStep | null>(null);
  const cancelled = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancelled.current = true; }; }, []);
  // Explicit finite runs only: no polling/capture on mount or background logging.
  const run = async (count: number) => {
    cancelled.current = false; setTarget(count); setBusy(true); setError(""); setSamples([]);
    try {
      for (let i = 0; i < count && !cancelled.current; i++) {
        const r = await robot.stereoTest();
        if (cancelled.current || !mounted.current) break;
        const audio = r.audio_direction;
        if (!audio) throw new Error("Roboten saknar stereomätning. Flasha v40 först.");
        setSamples((s) => [...s, { at: new Date().toISOString(), audio }]);
        if (!audio.ok) break;
        if (i + 1 < count) await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (e) { if (mounted.current && !cancelled.current) setError((e as Error).message); }
    finally { if (mounted.current) setBusy(false); }
  };
  // Guided step: 3 explicit captures while the user is silent / knocks one side.
  const runStep = async (step: MicStep) => {
    cancelled.current = false; setStepBusy(step); setError("");
    const got: StereoDiagnostic[] = [];
    try {
      for (let i = 0; i < 3 && !cancelled.current; i++) {
        const audio = (await robot.stereoTest()).audio_direction;
        if (!audio) throw new Error("Roboten saknar stereomätning. Flasha v41 först.");
        if (!audio.ok) throw new Error(stereoLabel(audio));
        got.push(audio);
        setSamples((s) => [...s, { at: new Date().toISOString(), audio }]);
        if (i < 2) await new Promise((resolve) => setTimeout(resolve, 300));
      }
      if (mounted.current && got.length) setSteps((s) => ({ ...s, [step]: got }));
    } catch (e) { if (mounted.current) setError((e as Error).message); }
    finally { if (mounted.current) setStepBusy(null); }
  };
  const verdict = steps.quiet && steps.left && steps.right ? micVerdict(steps) : [];
  const stepLabels: Record<MicStep, string> = { quiet: "1. Var tyst", left: "2. Knacka vänster sida", right: "3. Knacka höger sida" };
  const last = samples.at(-1)?.audio;
  const live = last ? channelFindings(last) : [];
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ schema: 2, kind: "stackchan-stereo", samples, steps, verdict }, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `stackchan-stereo-${new Date().toISOString().replace(/[:.]/g, "-")}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AudioLines className="size-4" />Två mikrofoner – stereotest</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-xs text-muted-foreground">Avsluta samtalet först. Prata eller klicka med fingrarna vid ena sidan under testet, sedan vid andra. Endast nivåer sparas, inte ljud; L/R är kanaler, inte en kalibrerad riktning.</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void run(1)} variant="outline"><Play />Mät en gång</Button>
        <Button disabled={busy} onClick={() => void run(10)}><AudioLines />Kör 10 mätningar</Button>
        {busy && <Button variant="outline" onClick={() => { cancelled.current = true; }}><Square />Stoppa</Button>}
        <Button size="icon" variant="ghost" disabled={busy || !samples.length} onClick={download} aria-label="Spara stereomätning" title="Spara stereomätning"><Download /></Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["left", "right"] as const).map((channel) => <div key={channel} className="space-y-2">
          <div className="flex justify-between text-sm"><span>{channel === "left" ? "Vänster (L)" : "Höger (R)"}</span><span className="font-mono">RMS {last?.ok ? Math.round(last[`${channel}_rms`] ?? 0) : "—"}</span></div>
          <Progress value={last?.ok ? stereoLevel(last[`${channel}_rms`]) : 0} aria-label={channel === "left" ? "Vänster mikrofonnivå" : "Höger mikrofonnivå"} />
          <p className="text-xs text-muted-foreground">Peak {last?.ok ? last[`${channel}_peak`] ?? "—" : "—"}</p>
        </div>)}
      </div>
      <p role="status" className="text-sm text-muted-foreground">{busy ? `Mäter… ${samples.length}/${target} · ` : ""}{last ? stereoLabel(last) : "Ingen mätning ännu"}</p>
      {last?.ok && <p className="font-mono text-xs text-muted-foreground">Balans R−L: {last.balance_r_minus_l?.toFixed(2) ?? "—"} · fördröjning: {last.tdoa_us?.toFixed(0) ?? "—"} µs · korrelation: {last.corr?.toFixed(2) ?? "—"}</p>}
      {live.map((f) => <p key={f.text} className="text-sm text-destructive">{f.text}</p>)}
      <div className="space-y-2 rounded-md border p-3">
        <p className="text-sm font-medium">Guidat test av båda mikrofonerna</p>
        <p className="text-xs text-muted-foreground">Varje steg tar ~2 s. Knacka med fingret eller knäpp tätt intill robotens vänstra resp. högra sida (sett framifrån) under hela steget.</p>
        <div className="flex flex-wrap gap-2">
          {(["quiet", "left", "right"] as const).map((st) => <Button key={st} size="sm" variant={steps[st] ? "secondary" : "outline"} disabled={busy || stepBusy !== null} onClick={() => void runStep(st)}>{stepBusy === st ? "Mäter…" : stepLabels[st]}{steps[st] ? " ✓" : ""}</Button>)}
          {Object.keys(steps).length > 0 && <Button size="sm" variant="ghost" disabled={stepBusy !== null} onClick={() => setSteps({})}>Börja om</Button>}
        </div>
        {verdict.length > 0 && <ul className="space-y-1" aria-label="Resultat mikrofontest">{verdict.map((f) => <li key={f.text} className="flex items-start gap-2 text-sm">{f.level === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> : f.level === "warn" ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />}<span>{f.text}</span></li>)}</ul>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </CardContent>
  </Card>;
}