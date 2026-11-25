import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Play, Square, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { onSerialCommand, onSerialLine, serialConnected, useWebSerial } from "@/lib/web-serial";
import { onRobotCommand, robot } from "@/lib/gemini-robot";
import { TestRecording, type TestReport } from "@/lib/test-recording";
import { DEFAULT_OPTIONS, runDiagnosis, type DiagnosisOptions, type DiagnosisResult } from "@/lib/standard-diagnosis";
import { readStored, writeStored } from "@/lib/app-storage";

const LAST_KEY = "sc.diagnosis.last";
type Package = DiagnosisResult & { recording: TestReport | null };

function download(pkg: Package) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = `stackchan-diagnos-${pkg.startedAt.slice(0, 16).replaceAll(":", "-")}.json`; a.click();
  URL.revokeObjectURL(url);
}

/** Voices load asynchronously in Chrome; wait briefly for them. */
async function voices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  let list = synth.getVoices();
  if (list.length) return list;
  await new Promise<void>((resolve) => { const t = setTimeout(resolve, 1500); synth.addEventListener("voiceschanged", () => { clearTimeout(t); resolve(); }, { once: true }); });
  list = synth.getVoices();
  return list;
}
async function hasVoice(prefix: string): Promise<boolean> {
  return (await voices()).some((v) => v.lang.toLowerCase().startsWith(prefix.toLowerCase()));
}

/** Computer speech for the voice simulation (Web Speech API); resolves when the phrase has been spoken. */
async function speak(text: string, lang: string): Promise<void> {
  const list = await voices();
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; u.rate = 0.95; u.volume = 1;
    const voice = list.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ?? list.find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase().slice(0, 2)));
    if (voice) u.voice = voice;
    const done = () => resolve();
    u.onend = done; u.onerror = done;
    setTimeout(done, 8000);
    synth.speak(u);
  });
}

const OPTION_LABELS: [keyof Omit<DiagnosisOptions, "idleSeconds">, string][] = [
  ["servo", "Servon (huvudet rör sig lite)"],
  ["camera", "Kamera (en bild, sparas inte)"],
  ["voiceSim", "Röstsimulering via datorns högtalare (ställ roboten nära, volym upp)"],
  ["lampService", "Lamptjänsten (listar bara, tänder/släcker inget)"],
  ["performance", "Prestandamätning varje sekund (CPU, minne, loop-tider)"],
];

export function StandardDiagnosis() {
  const { connected } = useWebSerial();
  const [options, setOptions] = useState<DiagnosisOptions>(DEFAULT_OPTIONS);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<{ index: number; count: number; title: string } | null>(null);
  const [question, setQuestion] = useState<{ text: string; answer: (v: boolean | null) => void } | null>(null);
  const [result, setResult] = useState<Package | null>(null);
  const [error, setError] = useState("");
  const abort = useRef(false);
  // Decided after mount: the prerendered HTML has no speechSynthesis, so reading it during render would break hydration.
  const [canSpeak, setCanSpeak] = useState(true);
  useEffect(() => { setCanSpeak("speechSynthesis" in window); }, []);

  const recorder = useMemo(() => new TestRecording({
    connected: serialConnected, subscribe: onSerialLine,
    commands: (fn) => { const a = onRobotCommand(fn); const b = onSerialCommand(fn); return () => { a(); b(); }; },
    performance: robot.performance, status: robot.status, runtime: robot.runtime, now: Date.now,
  }), []);

  const previous = (): DiagnosisResult | null => {
    try { return JSON.parse(readStored(LAST_KEY) ?? "null") as DiagnosisResult | null; } catch { return null; }
  };

  const run = async () => {
    setError(""); setResult(null); abort.current = false; setRunning(true);
    let recording: TestReport | null = null;
    try {
      await recorder.start({ performance: options.performance });
      const res = await runDiagnosis({
        robot,
        subscribe: onSerialLine,
        now: Date.now,
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        ask: (text) => new Promise((resolve) => {
          const timer = setTimeout(() => { setQuestion(null); resolve(null); }, 120000);
          setQuestion({ text, answer: (v) => { clearTimeout(timer); setQuestion(null); resolve(v); } });
        }),
        ...(canSpeak ? { speak, hasVoice } : {}),
        progress: (index, count, title) => setStep({ index, count, title }),
        aborted: () => abort.current || !serialConnected(),
      }, { ...options, voiceSim: options.voiceSim && canSpeak }, previous());
      recording = await recorder.stop("diagnosis finished").catch(() => null);
      // Only key metrics are kept for the next comparison; the full package is downloaded.
      const { keyMetrics, firmware, startedAt, verdict } = res;
      if (!res.aborted) writeStored(LAST_KEY, JSON.stringify({ keyMetrics, firmware, startedAt, verdict }));
      const pkg: Package = { ...res, recording };
      setResult(pkg);
      download(pkg);
    } catch (e) {
      setError((e as Error).message);
      if (recorder.active) await recorder.stop("diagnosis error").catch(() => undefined);
    } finally {
      setRunning(false); setStep(null); setQuestion(null);
    }
  };

  return <section className="mb-6 space-y-3 border-b pb-5" aria-label="Standarddiagnos">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-semibold"><Stethoscope className="size-5 text-primary" />Standarddiagnos</h3>
        <p className="text-sm text-muted-foreground">Samma fasta test varje gång, ca 7–9 min. Ger ett paket med mätvärden och jämförelse med förra körningen.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!connected || running} onClick={() => void run()}><Play />Kör standarddiagnos</Button>
        <Button variant="outline" disabled={!running} onClick={() => { abort.current = true; }}><Square />Avbryt</Button>
        {result && <Button variant="outline" onClick={() => download(result)}><Download />Spara diagnospaket</Button>}
      </div>
    </div>
    {!connected && <p className="text-sm text-muted-foreground">Anslut roboten med USB för att köra diagnosen.</p>}
    <div className="grid gap-2 sm:grid-cols-2">
      {OPTION_LABELS.map(([key, label]) => <label key={key} className="flex items-start gap-2 text-sm">
        <Checkbox checked={options[key]} disabled={running || (key === "voiceSim" && !canSpeak)} onCheckedChange={(v) => setOptions((o) => ({ ...o, [key]: v === true }))} />
        {label}{key === "voiceSim" && !canSpeak ? " – stöds inte i den här webbläsaren" : ""}
      </label>)}
    </div>
    <p className="text-xs text-muted-foreground">Under diagnosen sparas inga samtal i robotens minne (firmware v77+). Tekniska loggar och testsamtalens text samlas lokalt på datorn; inget ljud spelas in eller laddas upp. Alla ändrade inställningar återställs, även om du avbryter.</p>
    {running && step && <div className="space-y-2" role="status">
      <p className="text-sm font-medium">Steg {step.index + 1} av {step.count}: {step.title}</p>
      <Progress value={((step.index + 0.5) / step.count) * 100} />
    </div>}
    {question && <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary bg-primary/10 p-3" role="alertdialog" aria-label="Fråga under diagnosen">
      <p className="text-sm font-medium">{question.text}</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => question.answer(true)}>Ja</Button>
        <Button size="sm" variant="outline" onClick={() => question.answer(false)}>Nej</Button>
        <Button size="sm" variant="ghost" onClick={() => question.answer(null)}>Vet inte</Button>
      </div>
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {result && <div className="space-y-2">
      <p className="text-sm">Diagnosen är klar och paketet har laddats ned. Bifoga filen i chatten med Claude.</p>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">{result.summaryText}</pre>
    </div>}
  </section>;
}
