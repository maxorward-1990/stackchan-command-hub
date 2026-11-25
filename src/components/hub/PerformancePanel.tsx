import { useEffect, useRef, useState } from "react";
import { Activity, Download, Upload, Trash2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { onSerialLine, useWebSerial } from "@/lib/web-serial";
import { appendPerf, importPerf, parsePerf, percentile, type PerfSample } from "@/lib/performance";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const modeNames: Record<string, string> = { speaking: "Svarar", listening: "Lyssnar", tool: "Verktyg", waiting: "Väntar", idle: "Vila" };
const ms = (us: number) => `${(us / 1000).toFixed(1)} ms`;
const kb = (bytes: number) => `${Math.round(bytes / 1024)} KiB`;
const cpu = (value: number, ticks: number) => value < 0 || ticks === 0 ? "Ej tillgängligt" : `≈${value}%`;

export function PerformancePanel() {
  const { connected, send } = useWebSerial();
  const [samples, setSamples] = useState<PerfSample[]>([]);
  const [paused, setPaused] = useState(false);
  const [imported, setImported] = useState(false);
  const [error, setError] = useState("");
  const [receivedAt, setReceivedAt] = useState(0);
  const [now, setNow] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (paused || imported) return;
    return onSerialLine((line) => {
      const sample = parsePerf(line);
      if (!sample) return;
      setSamples((list) => appendPerf(list, sample));
      setReceivedAt(Date.now());
    });
  }, [paused, imported]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const latest = samples.at(-1);
  const live = connected && !paused && !imported && receivedAt > 0 && now - receivedAt < 3500;
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({
      schema: "stackchan-performance-v1", exportedAt: new Date().toISOString(),
      cpuMethod: "FreeRTOS tick occupancy estimate; excludes ISR runtime accounting",
      stageMethod: "Maximum elapsed microseconds per reporting window; nested stages overlap",
      queueMethod: "Application FIFO only; speaker slots reported separately",
      samples,
    }, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `stackchan-prestanda-${new Date().toISOString().slice(0, 16).replaceAll(":", "_")}.json`; a.click(); URL.revokeObjectURL(url);
  };
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError("Filen är för stor (max 10 MB)."); return; }
    try {
      const data = importPerf(await file.text());
      if (!data.length) { setError("Filen saknar giltiga [PERF]-mätningar från v36 eller senare."); return; }
      setSamples(data); setImported(true); setError("");
    } catch { setError("Kunde inte läsa filen."); }
  };
  const chart = samples.map((s, i) => ({ index: i, cpu0: s.cpu0 < 0 ? null : s.cpu0, cpu1: s.cpu1 < 0 ? null : s.cpu1, loop: s.loop_us / 1000, lcd: s.lcd_us / 1000, queue: s.queue_ms }));
  const speaking = samples.filter((s) => s.mode === "speaking");
  const max = (key: "ws_us" | "lcd_us" | "audio_us" | "mic_us" | "services_us" | "gap_us") => Math.max(0, ...samples.map((s) => s[key]));
  const warnings = [
    speaking.some((s) => s.underruns > 0) ? "Ljudsvält registrerad i minst en talrunda." : "",
    samples.some((s) => s.dropped > 0) ? "Ljudbitar har tappats i minst en talrunda." : "",
    samples.some((s) => s.wait_ms > 0) ? "Ljudkön har blockerat mottagningen i minst en talrunda." : "",
    samples.some((s) => s.skipped > 0) ? "Vissa mätningar kunde inte skrivas till USB utan väntan." : "",
  ].filter(Boolean);
  return (
    <section className="col-span-full space-y-4 border-t pt-5" aria-label="Prestanda">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><Activity className="size-5" />Prestanda</h2><Badge variant={live ? "default" : "outline"}>{imported ? "Importerad logg" : paused ? "Pausad" : live ? "Live · USB" : latest ? "Ingen färsk mätning" : "Inväntar mätning"}</Badge></div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!connected} onClick={() => void send("perf on")}><Activity />Telemetri på</Button>
          <Button size="sm" variant="outline" disabled={!connected} onClick={() => void send("perf off")}>Telemetri av</Button>
          <Button size="sm" variant="outline" onClick={() => { if (imported) { setImported(false); setSamples([]); setReceivedAt(0); setPaused(false); } else setPaused(!paused); }} aria-label={paused || imported ? "Återuppta mätning" : "Pausa mätning"}>{paused || imported ? <Play /> : <Pause />}{imported ? "Till live" : paused ? "Återuppta" : "Pausa"}</Button>
          <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}><Upload />Läs logg</Button>
          <Button size="sm" variant="outline" disabled={!samples.length} onClick={download}><Download />Spara mätningar</Button>
          <Button size="icon" variant="ghost" aria-label="Rensa mätningar" onClick={() => { setSamples([]); setReceivedAt(0); setError(""); }}><Trash2 /></Button>
          <input ref={fileInput} type="file" accept=".txt,.json" className="hidden" aria-label="Läs prestandalogg" onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!latest ? <p className="text-sm text-muted-foreground">Inga prestandamätningar. {connected ? "Telemetrin är av som standard (v37) – tryck Telemetri på." : "USB är inte ansluten."}</p> : <>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"><span>{latest.fw}</span><span>{modeNames[latest.mode]}</span><span>{samples.length} mätningar</span><span>Fönster: {(latest.window_ms / 1000).toFixed(1)} s</span><span>Wi-Fi: {latest.rssi === 0 ? "Ej ansluten" : `${latest.rssi} dBm`}</span><span>Bluetooth: {latest.ble ? "På" : "Av"}</span></div>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          {[
            ["CPU 0 · samplad", cpu(latest.cpu0, latest.ticks0)], ["CPU 1 · samplad", cpu(latest.cpu1, latest.ticks1)],
            ["Loop · max", ms(latest.loop_us)], ["LCD · max", ms(latest.lcd_us)], ["Ljudkö · FIFO", `${latest.queue_ms} ms`],
            ["Ljudsvält · tur", String(latest.underruns)], ["Internminne", kb(latest.heap)], ["Största block", kb(latest.largest)],
          ].map(([label, value]) => <div key={label} className="min-w-0 border-l pl-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-mono text-base">{value}</dd></div>)}
        </dl>
        <div className="grid gap-5 lg:grid-cols-3">
          {[
            { title: "CPU · samplad %", keys: ["cpu0", "cpu1"], names: ["Kärna 0", "Kärna 1"], domain: [0, 100] },
            { title: "Max per mätfönster · ms", keys: ["loop", "lcd"], names: ["Loop", "LCD"], domain: [0, "auto"] },
            { title: "Ljudkö · ms", keys: ["queue"], names: ["FIFO"], domain: [0, "auto"] },
          ].map((c) => <div key={c.title} className="min-w-0"><h3 className="mb-2 text-sm font-medium">{c.title}</h3><div className="h-44 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" /><XAxis dataKey="index" hide /><YAxis width={42} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} domain={[0, c.keys.includes("cpu0") ? 100 : "auto"]} /><Tooltip contentStyle={{ background: "var(--popover)", borderColor: "var(--border)", color: "var(--popover-foreground)" }} labelFormatter={(v) => `Mätning ${Number(v) + 1}`} />{c.keys.map((key, i) => <Line key={key} name={c.names[i] ?? key} dataKey={key} stroke={i === 0 ? "var(--primary)" : "var(--chart-2)"} dot={false} isAnimationActive={false} strokeWidth={2} />)}</LineChart></ResponsiveContainer></div></div>)}
        </div>
        <div className="space-y-2 text-sm">
          <h3 className="font-semibold">Observerat i mätningarna</h3>
          <p className="text-muted-foreground">Loopmax P95: {ms(percentile(samples.map((s) => s.loop_us), 0.95))} · längsta loopgap: {ms(max("gap_us"))} · LCD: {ms(max("lcd_us"))} · WebSocket: {ms(max("ws_us"))} · ljudmatning: {ms(max("audio_us"))} · mikrofon: {ms(max("mic_us"))} · tjänster: {ms(max("services_us"))}</p>
          <p className="text-muted-foreground">PSRAM: {kb(latest.psram)} · stackmarginal: {latest.stack} B · högtalarplatser: {latest.slots} · tappade ljudbitar denna tur: {latest.dropped}</p>
          {warnings.map((w) => <p key={w} className="text-destructive">{w}</p>)}
          <p className="text-xs text-muted-foreground">CPU är en tick-samplad uppskattning ({latest.ticks0}/{latest.ticks1} prov), inte exakt processortid. Delmoment överlappar; WebSocket inkluderar mottagning och dess följdanrop. Ljudkö mäter inte återstående ljud i högtalaren. Loopgap inkluderar avsiktliga pauser. Mätningar visar sammanfall, inte bevisad orsak.</p>
        </div>
      </>}
    </section>
  );
}