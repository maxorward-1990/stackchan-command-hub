import { useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Save, Power, MessageSquare, Monitor, Eraser, Ear, Sparkles, Trash2, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocal } from "@/lib/use-local";
import { robot, VOICES, TOOL_TOGGLES, type Runtime } from "@/lib/gemini-robot";
import { Hardware } from "@/components/hub/Hardware";
import { RobotStatus } from "@/components/hub/RobotStatus";
import { WebSearchCard } from "@/components/hub/WebSearchCard";
import { WifiCard } from "@/components/hub/WifiCard";
import { useRobotConnection } from "./RobotConnection";
import { SPEECH_LANGUAGES, isSpeechLanguages } from "@/lib/audio-diagnostics";

type Profile = { id: string; name: string; system: string; persona: string };
// Language-neutral on purpose: the robot's speech-language setting decides the reply language. The old
// "Tala uteslutande på … svenska" forced Swedish answers to English questions even with "auto".
const BASE_SV = "Svara på samma språk som användaren just talade, svenska eller engelska. När du talar svenska: använd ren, naturlig rikssvenska med neutralt uttal, utan norska eller danska ord och utan regional dialekt.";
const OLD_BASE_SV = "Tala uteslutande på ren, naturlig svenska. Blanda aldrig in norska eller danska ord eller uttal. Använd neutral rikssvenska (standardsvenska) med neutralt uttal, utan regional dialekt eller brytning som småländska, skånska eller norrländska.";
/** Replaces the old forced-Swedish sentence in saved profiles and in the prompt read back from the robot. */
export const migrateLanguagePrompt = (text: string) => text.split(OLD_BASE_SV).join(BASE_SV);
const DEFAULT_PROFILES: Profile[] = [
  { id: "desk", name: "Skrivbordsassistent", system: BASE_SV + " Svara kort och sakligt, max 2–3 meningar.", persona: "Lugn, hjälpsam och rak. Inget smicker." },
  { id: "buddy", name: "Lekfull kompis", system: BASE_SV, persona: "Glad, nyfiken och skämtsam. Använd gester ofta och ställ gärna en motfråga." },
  { id: "tech", name: "Teknisk rådgivare", system: BASE_SV + " Skilj på verifierade fakta och uppskattningar. Säg när du inte vet.", persona: "Noggrann och utmanande. Peka ut svagheter i resonemang." },
  { id: "research", name: "Forskare", system: BASE_SV + " Använd lookup_wikipedia för faktafrågor där källa spelar roll och nämn källan. Säg tydligt vad som kommer från Wikipedia och vad som är din egen kunskap.", persona: "Saklig och källkritisk." },
];

const run = async (label: string, fn: () => Promise<unknown>) => {
  try { await fn(); toast.success(label); } catch (e) { toast.error((e as Error).message); }
};

function SliderRow({ label, value, min, max, step = 1, unit = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm"><Label>{label}</Label><span className="font-mono text-muted-foreground">{value}{unit}</span></div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v ?? value)} />
    </div>
  );
}

export function RobotControl() {
  const [say, setSay] = useState("");
  const [screen, setScreen] = useState("");
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="size-4" />Samtal</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void run("Skickat till Gemini", () => robot.say(say)); setSay(""); }}>
              <Input value={say} onChange={(e) => setSay(e.target.value)} placeholder="Fråga roboten något…" />
              <Button type="submit" disabled={!say.trim()}>Skicka fråga</Button>
            </form>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => run("Växlade lyssning", robot.toggleVoice)}><Ear />Väck / sov</Button>
              <Button variant="secondary" size="sm" onClick={() => run("Avbröt svaret", robot.interrupt)}><Power />Avbryt svar</Button>
              <Button variant="secondary" size="sm" onClick={() => run("Roboten tittar", robot.lookAndDescribe)}><Sparkles />Titta & beskriv</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Monitor className="size-4" />Robotens skärm</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={screen} onChange={(e) => setScreen(e.target.value)} placeholder="Text som visas på robotens skärm" rows={3} />
            <div className="flex gap-2">
              <Button size="sm" disabled={!screen.trim()} onClick={() => run("Visas på skärmen", () => robot.showText(screen))}><Monitor />Visa text</Button>
              <Button size="sm" variant="outline" onClick={() => run("Skärmen rensad", robot.clearScreen)}><Eraser />Rensa</Button>
            </div>
          </CardContent>
        </Card>
      </div>
      <Hardware />
      <details className="border-t pt-4"><summary className="mb-4 cursor-pointer text-sm font-semibold">Status & sensorer</summary><RobotStatus /></details>
    </div>
  );
}

export function RobotSettings() {
  const connection = useRobotConnection();
  const [loading, setLoading] = useState(false);
  const [rt, setRt] = useState<Runtime | null>(null);
  const [profiles, setProfiles] = useLocal<Profile[]>("sc.profiles", DEFAULT_PROFILES);
  const [sys, setSys] = useState("");
  const [persona, setPersona] = useState("");
  const [newName, setNewName] = useState("");
  const load = () => run("Inställningar hämtade", async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([robot.runtime(), robot.prompts()]);
      setRt(r); setSys(migrateLanguagePrompt(p.system_prompt ?? "")); setPersona(p.persona_prompt ?? "");
    } finally { setLoading(false); }
  });
  const upd = (p: Partial<Runtime>) => setRt((r) => (r ? { ...r, ...p } : r));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <p className="text-sm text-muted-foreground">{rt ? "Inställningar hämtade från roboten" : "Inga robotinställningar hämtade"}</p>
        <Button disabled={loading} onClick={() => connection.requestConnection(() => void load())}><RefreshCw className={loading ? "animate-spin" : ""} />{loading ? "Hämtar…" : connection.connected ? "Hämta från roboten" : "Anslut & hämta inställningar"}</Button>
      </div>
      <WifiCard />
      <details className="border-b pb-4"><summary className="mb-4 cursor-pointer font-semibold">Personlighet & instruktioner</summary>
      <Card>
        <CardHeader><CardTitle className="text-base">Personlighet & instruktioner</CardTitle>
          <CardDescription>Välj en profil eller skriv egen. Gäller från nästa samtal – tryck på skärmen två gånger.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <div key={p.id} className="flex items-center rounded-md border">
                <Button size="sm" variant="ghost" onClick={() => { setSys(migrateLanguagePrompt(p.system)); setPersona(p.persona); }}>{p.name}</Button>
                <Button size="icon" variant="ghost" className="size-8" aria-label={`Ta bort ${p.name}`} onClick={() => setProfiles(profiles.filter((x) => x.id !== p.id))}><Trash2 className="size-3.5" /></Button>
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1"><Label>Instruktioner</Label><Textarea rows={5} value={sys} onChange={(e) => setSys(e.target.value)} /></div>
            <div className="space-y-1"><Label>Personlighet / stil</Label><Textarea rows={5} value={persona} onChange={(e) => setPersona(e.target.value)} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!rt} onClick={() => run("Sparat på roboten", () => robot.savePrompts(sys, persona))}><Save />Skicka till roboten</Button>
            <Input className="w-48" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Namn på ny profil" />
            <Button variant="outline" disabled={!newName.trim()} onClick={() => { setProfiles([...profiles, { id: crypto.randomUUID(), name: newName.trim(), system: sys, persona }]); setNewName(""); }}><Plus />Spara som profil</Button>
          </div>
        </CardContent>
      </Card>

      </details>

      {rt && (
        <Card>
          <CardHeader><CardTitle className="text-base">Förmågor</CardTitle>
            <CardDescription>{"tool_wikipedia" in rt
              ? "Avstängda förmågor skickas inte alls till Gemini, så den kan inte använda dem. Gäller från nästa samtal efter Spara – ingen omstart behövs."
              : "Kräver firmware v19. Uppdatera under Uppdatera roboten."}</CardDescription></CardHeader>
          {"tool_wikipedia" in rt && (
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {TOOL_TOGGLES.map(([k, l, d]) => (
                  <div key={k} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div><Label htmlFor={k} className="text-sm">{l}</Label><p className="text-xs text-muted-foreground">{d}</p></div>
                    <Switch id={k} checked={!!rt[k]} onCheckedChange={(v) => upd({ [k]: v })} /></div>
                ))}
              </div>
              <Button variant="outline" onClick={() => run("Förmågor sparade", () => robot.saveRuntime(rt, false))}><Save />Spara förmågor</Button>
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Ljud, röst & lyssning</CardTitle>
          <CardDescription>{rt ? "Spara och starta om för att allt ska gälla." : "Klicka \"Hämta från roboten\" först."}</CardDescription></CardHeader>
        {rt && (
          <CardContent className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2"><Label>Röst</Label>
                <Select value={rt.gemini_voice} onValueChange={(v) => upd({ gemini_voice: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{VOICES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select></div>
              {rt.speech_languages !== undefined && <div className="space-y-2">
                <Label htmlFor="speech-languages">Talade språk</Label>
                <Select value={rt.speech_languages} onValueChange={(v) => { if (isSpeechLanguages(v)) upd({ speech_languages: v }); }}>
                  <SelectTrigger id="speech-languages"><SelectValue /></SelectTrigger>
                  <SelectContent>{SPEECH_LANGUAGES.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Svarar på språket du talar. Sparas på roboten och gäller vid nästa samtal, även utan omstart. Gemini kan fortfarande höra fel; detta är inte ett garanterat språkfilter.</p>
              </div>}
              <SliderRow label="Volym" value={rt.speaker_volume} min={0} max={255} onChange={(v) => upd({ speaker_volume: v })} />
              <SliderRow label="Mikrofonförstärkning" value={rt.mic_magnification} min={1} max={10} onChange={(v) => upd({ mic_magnification: v })} />
              <SliderRow label="Brusfilter" value={rt.mic_noise_filter_level} min={0} max={4} onChange={(v) => upd({ mic_noise_filter_level: v })} />
              <SliderRow label="Tystnad innan den svarar" value={rt.vad_silence_duration_ms} min={100} max={3000} step={50} unit=" ms" onChange={(v) => upd({ vad_silence_duration_ms: v })} />
              <SliderRow label="Ljud sparat före tal" value={rt.vad_prefix_padding_ms} min={0} max={2000} step={50} unit=" ms" onChange={(v) => upd({ vad_prefix_padding_ms: v })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ["vad_start_sensitivity_high", "Reagerar snabbt när jag börjar prata"],
                ["vad_end_sensitivity_low", "Väntar på helt tyst (av = bättre med bakgrundsljud)"],
                ["gemini_enabled", "Gemini på"],
              ] as const).map(([k, l]) => (
                <div key={k} className="flex items-center justify-between gap-3 rounded-lg border p-3"><Label htmlFor={k} className="text-sm">{l}</Label>
                  <Switch id={k} checked={rt[k]} onCheckedChange={(v) => upd({ [k]: v })} /></div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => run("Sparat", () => robot.saveRuntime(rt, false))}><Save />Spara</Button>
              <Button onClick={() => run("Sparat – roboten startar om", () => robot.saveRuntime(rt, true))}><Power />Spara och starta om</Button>
            </div>
          </CardContent>
        )}
      </Card>
      <WebSearchCard hasKey={rt?.tavily_api_key} enabled={rt?.web_search_enabled} onEnabled={(v) => upd({ web_search_enabled: v })} onSaved={(v) => rt && upd({ tavily_api_key: v })} />
    </div>
  );
}
