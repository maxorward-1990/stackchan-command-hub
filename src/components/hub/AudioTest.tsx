import { useEffect, useRef, useState } from "react";
import { Download, Mic, LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { robot, type AudioTestStatus } from "@/lib/gemini-robot";
import { AUDIO_CHUNK_BYTES, AUDIO_PCM_BYTES, AUDIO_SAMPLE_RATE, makeWav } from "@/lib/audio-diagnostics";

type Recording = { url: string; filename: string; measurements: AudioTestStatus };
export function AudioTest() {
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [progress, setProgress] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => () => { if (recording) URL.revokeObjectURL(recording.url); }, [recording]);
  const capture = async () => {
    const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError(""); setProgress(0); setPhase("Förbereder mikrofonen…");
    let id: number | undefined;
    const check = () => { if (controller.signal.aborted) throw new Error("canceled"); };
    try {
      let state = await robot.startAudioTest(); id = state.id; check();
      if (!state.ok) throw new Error(state.error || "Ljudtestet kunde inte startas.");
      setPhase("Spelar in – prata nu");
      const deadline = Date.now() + 12000;
      while (state.state === "recording") {
        if (Date.now() > deadline) throw new Error("Mikrofonen blev inte klar. Försök igen.");
        await new Promise((resolve) => setTimeout(resolve, 250)); check();
        state = await robot.audioTestStatus(); check();
        if (state.id !== id) throw new Error("Ljudtestet ersattes av en annan inspelning.");
        setProgress(Math.min(100, state.captured_ms / 30));
      }
      if (!state.ok || state.state !== "ready" || state.pcm_bytes !== AUDIO_PCM_BYTES || state.sample_rate !== AUDIO_SAMPLE_RATE) {
        throw new Error(state.error || "Ofullständig inspelning. Flasha v21 och försök igen.");
      }
      setPhase("Hämtar ljudfilen…"); setProgress(0);
      const pcm = new Uint8Array(AUDIO_PCM_BYTES);
      for (let offset = 0; offset < pcm.length; offset += AUDIO_CHUNK_BYTES) {
        check(); const count = Math.min(AUDIO_CHUNK_BYTES, pcm.length - offset);
        const part = await robot.audioTestChunk(id, offset, count); check();
        const data = Uint8Array.from(atob(part.data), (c) => c.charCodeAt(0));
        if (!part.ok || part.id !== id || part.offset !== offset || data.length !== count) throw new Error("Ljudöverföringen blev ofullständig.");
        pcm.set(data, offset); setProgress(Math.round((offset + count) / pcm.length * 100));
      }
      const wav = makeWav(pcm);
      const url = URL.createObjectURL(new Blob([new Uint8Array(wav)], { type: "audio/wav" }));
      setRecording({ url, filename: `stackchan-ljudtest-${new Date().toISOString().replace(/[:.]/g, "-")}.wav`, measurements: state });
      setPhase(""); toast.success("Ljudtestet är klart");
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message.includes("stop_conversation")
        ? "Avsluta samtalet på roboten innan ljudtestet. Tryck på skärmen när den lyssnar."
        : (e as Error).message);
    } finally {
      if (id !== undefined) await robot.clearAudioTest(id).catch(() => {});
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Mic className="size-4" />Mikrofonens testljud</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">3 sekunder med robotens aktuella förstärkning och brusfilter. Sparas tillfälligt på roboten, inte hos Gemini. Kräver v21.</p>
      <Button disabled={busy} onClick={() => void capture()}>{busy ? <LoaderCircle className="animate-spin" /> : <Mic />}Spela in 3 s testljud</Button>
      {busy && <div className="space-y-2" role="status"><p className="text-sm">{phase}</p><Progress value={progress} /></div>}
      {error && <p role="alert" className="text-sm text-destructive break-words">{error}</p>}
      {recording && <div className="space-y-3">
        <audio controls src={recording.url} className="w-full" aria-label="Robotens mikrofontest" />
        <p className="text-sm text-muted-foreground">Toppnivå {Math.round(recording.measurements.peak / 32768 * 100)} % · RMS {recording.measurements.rms} · Förstärkning {recording.measurements.mic_magnification} · Brusfilter {recording.measurements.mic_noise_filter_level}</p>
        {recording.measurements.clipped_samples > 0 && <p className="text-sm text-destructive">{recording.measurements.clipped_samples} ljudprover nära klippning. Prova lägre förstärkning och spela in igen.</p>}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><a href={recording.url} download={recording.filename}><Download />Ladda ner WAV</a></Button>
          <Button variant="ghost" onClick={() => setRecording(null)}><Trash2 />Radera testljud</Button>
        </div>
      </div>}
    </CardContent>
  </Card>;
}