import { useRef, useState } from "react";
import { Timer, Play, Square, Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { onSerialLine, sendSerial, useWebSerial } from "@/lib/web-serial";
import { applyLine, newRun, PRESETS, SPEECH_TEST_TIMEOUT_MS, type SpeechRun } from "@/lib/speech-timing";

const s = (ms?: number) => (ms === undefined ? "–" : `${(ms / 1000).toFixed(1)} s`);

function runOne(prompt: string, onUpdate: (r: SpeechRun) => void, stopped: () => boolean): Promise<SpeechRun> {
  return new Promise((resolve) => {
    let run = newRun(prompt);
    const t0 = performance.now();
    const finish = () => { off(); clearInterval(tick); resolve(run); };
    const step = (line: string) => { run = applyLine(run, line, performance.now() - t0); onUpdate(run); if (run.done) finish(); };
    const off = onSerialLine(step);
    const tick = setInterval(() => {
      if (stopped()) { run = { ...run, error: "Stoppad", done: true }; onUpdate(run); finish(); return; }
      if (performance.now() - t0 >= SPEECH_TEST_TIMEOUT_MS) step("");
    }, 500);
    void sendSerial(`say ${prompt}`);
  });
}

export function SpeechTest() {
  const serial = useWebSerial();
  const [picked, setPicked] = useState<string[]>(PRESETS.slice(0, 3).map((p) => p.label));
  const [runs, setRuns] = useState<SpeechRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState("");
  const stop = useRef(false);

  const start = async (prompts?: string[]) => {
    stop.current = false; setBusy(true); setRuns([]);
    const list = prompts ? prompts.map((prompt) => ({ prompt })) : PRESETS.filter((p) => picked.includes(p.label));
    for (let i = 0; i < list.length && !stop.current; i++) {
      const item = list[i]; if (!item) continue;
      await runOne(item.prompt, (r) => setRuns((prev) => { const n = [...prev]; n[i] = r; return n; }), () => stop.current);
      await new Promise((r) => setTimeout(r, 1500));
    }
    void sendSerial("stop");
    setBusy(false);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(runs, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `stackchan-taltest-${new Date().toISOString().slice(0, 16)}.json`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Timer className="size-4" />Automatiskt taltest</CardTitle>
        <CardDescription>Skickar frågor som text via USB och mäter svarstider. Mikrofonen testas inte här. Kräver v30.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {PRESETS.map((p) => (
            <label key={p.label} className="flex items-start gap-2 text-sm">
              <Checkbox checked={picked.includes(p.label)} disabled={busy}
                onCheckedChange={(v) => setPicked((x) => (v ? [...x, p.label] : x.filter((l) => l !== p.label)))} />
              <span className="flex-1"><span className="font-medium">{p.label}</span> <span className="text-muted-foreground">– {p.prompt}</span></span>
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2" disabled={busy || !serial.connected}
                onClick={(e) => { e.preventDefault(); void start([p.prompt]); }}><Play />Kör nu</Button>
            </label>
          ))}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const q = custom.trim(); if (q) void start([q]); }}>
          <Input value={custom} maxLength={300} placeholder="Egen testfråga, t.ex. Vad har jag på min att-göra-lista?" onChange={(e) => setCustom(e.target.value)} disabled={busy} />
          <Button type="submit" size="sm" disabled={busy || !serial.connected || !custom.trim()}><Play />Kör</Button>
        </form>
        <p className="text-xs text-muted-foreground">Rör inte robotens skärm under testet – ett tryck avbryter frågan.</p>
        <div className="flex gap-2">
          {busy
            ? <Button variant="outline" size="sm" onClick={() => { stop.current = true; }}><Square />Stoppa</Button>
            : <Button size="sm" disabled={!serial.connected || !picked.length} onClick={() => void start()}><Play />Kör valda</Button>}
          <Button variant="outline" size="sm" disabled={!runs.length || busy} onClick={download}><Download />Spara resultat</Button>
        </div>
        {!serial.connected && <p className="text-xs text-muted-foreground">Anslut roboten med USB först.</p>}
        {runs.length > 0 && (
          <div className="space-y-2">
            {runs.map((r, i) => (
              <div key={i} className="rounded-lg border p-2 text-xs">
                <div className="font-medium">{r.prompt}</div>
                <div className="mt-1 grid grid-cols-2 gap-x-2 text-muted-foreground">
                  <span>Första ljud: {s(r.firstAudioMs)}</span><span>Första text: {s(r.firstTextMs)}</span>
                  <span>Svar klart: {s(r.turnDoneMs)}</span><span>Uppspelat: {s(r.playbackDoneMs)}</span>
                </div>
                {r.tools.length > 0 && <div className="mt-1">Verktyg: {r.tools.join(", ")}</div>}
                {r.reply && <div className="mt-1 line-clamp-2 text-muted-foreground">"{r.reply}"</div>}
                {r.error ? <div className="mt-1 text-destructive">{r.error}</div> : !r.done && <div className="mt-1 text-primary">Väntar…</div>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
