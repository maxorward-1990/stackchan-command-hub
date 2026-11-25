import { useState } from "react";
import { toast } from "sonner";
import { Download, Eye, Save, Undo2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { robot, PERSONALITY_STATES, type Personality, type PersonalityState } from "@/lib/gemini-robot";
import { useRobotConnection } from "./RobotConnection";
import { DEFAULT_EYE, FaceSimulator } from "./FaceSimulator";

const STATE_LABEL: Record<PersonalityState, string> = {
  neutral: "Vaken", listening: "Lyssnar", thinking: "Tänker", speaking: "Pratar", happy: "Glad", angry: "Arg / fel", sleep: "Sover",
};
const ROBOT_EMOTION: Record<PersonalityState, string> = { neutral: "neutral", listening: "listening", thinking: "thinking", speaking: "speaking", happy: "happy", angry: "angry", sleep: "sleep" };
const DEFAULTS: Personality = {
  sleep_after_s: 45, screen_off_after_s: 30, sleep_face: true, awake_brightness: 127, sleep_brightness: 40,
  subtitles: false, listen_cue: true, touch_menu: true, nod_on_start: false,
  status_text: true, listening_waves: true, eyebrows: true, cheeks: true, wake_word: false,
  proximity_control: false, proximity_threshold: 100,
  wake_min_peak: 1500, wake_threshold_milli: 490,
  led: Object.fromEntries(PERSONALITY_STATES.map((s) => [s, "default"])) as Personality["led"],
  eye: Object.fromEntries(PERSONALITY_STATES.map((s) => [s, "default"])) as Personality["eye"],
};
const ERRORS: Record<string, string> = {
  invalid_seconds: "Tider måste vara 0–3600 sekunder.", invalid_brightness: "Ljusstyrka måste vara 0–255.",
  invalid_led: "Ogiltig lampinställning.", invalid_eye_color: "Ogiltig ögonfärg.", save_failed: "Roboten kunde inte spara.",
  invalid_proximity_threshold: "Närhetsgränsen måste vara 5–2047 i v63, eller 200–2047 i v62.",
  invalid_wake_min_peak: "Ogiltigt ljudskydd för väckning.", invalid_wake_threshold: "Ogiltig väckningskänslighet.",
};
const SLEEP_OPTIONS = [[15, "15 s"], [45, "45 s"], [120, "2 min"], [600, "10 min"], [0, "Aldrig"]] as const;
const OFF_OPTIONS = [[10, "10 s"], [30, "30 s"], [120, "2 min"], [0, "Aldrig"]] as const;

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <div className="flex items-start justify-between gap-4 py-2">
    <div><Label htmlFor={id}>{label}</Label><p className="text-xs text-muted-foreground">{hint}</p></div>
    <Switch id={id} checked={checked} onCheckedChange={onChange} />
  </div>;
}

export function PersonalityPage() {
  const connection = useRobotConnection();
  const [p, setP] = useState<Personality>(DEFAULTS);
  const [saved, setSaved] = useState<Personality | null>(null);
  const [state, setState] = useState<PersonalityState>("listening");
  const [busy, setBusy] = useState(false);
  const [appearanceSupported, setAppearanceSupported] = useState(false);
  const [wakeSupported, setWakeSupported] = useState(false);
  const [wakeTuningSupported, setWakeTuningSupported] = useState(false);
  const [wakePeakSupported, setWakePeakSupported] = useState(false);
  const [proximitySupported, setProximitySupported] = useState(false);
  const [sensor, setSensor] = useState<Awaited<ReturnType<typeof robot.proximityTest>>["ltr553"]>();
  const proximityMin = p.proximity_threshold_min ?? 200;
  const dirty = saved !== null && JSON.stringify(saved) !== JSON.stringify(p);
  const set = <K extends keyof Personality>(k: K, v: Personality[K]) => setP((x) => ({ ...x, [k]: v }));

  const fail = (e: unknown) => {
    const msg = String((e as Error).message);
    toast.error(msg.includes("404") ? "Roboten har äldre firmware – flasha den rekommenderade versionen under Uppdatera roboten." : msg);
  };
  const load = () => connection.requestConnection(async () => {
    setBusy(true);
    try { const r = await robot.personality(); setAppearanceSupported(typeof r.personality.status_text === "boolean"); setWakeSupported(typeof r.personality.wake_word === "boolean"); setWakeTuningSupported(typeof r.personality.wake_threshold_milli === "number"); setWakePeakSupported(typeof r.personality.wake_min_peak === "number"); setProximitySupported(typeof r.personality.proximity_control === "boolean"); setP({ ...DEFAULTS, ...r.personality }); setSaved({ ...DEFAULTS, ...r.personality }); toast.success("Hämtade robotens personlighet"); }
    catch (e) { fail(e); } finally { setBusy(false); }
  });
  const save = () => connection.requestConnection(async () => {
    setBusy(true);
    try {
      const { proximity_threshold_min, wake_min_peak, wake_threshold_milli, ...base } = p;
      const editable = { ...base, ...(wakeTuningSupported ? { wake_threshold_milli: wake_threshold_milli ?? 490 } : {}), ...(wakePeakSupported ? { wake_min_peak: wake_min_peak ?? 1500 } : {}) };
      const { proximity_control, proximity_threshold, ...noProximity } = editable;
      const supported = proximitySupported ? editable : noProximity;
      const { wake_word, ...noWake } = supported;
      const { status_text, listening_waves, eyebrows, cheeks, ...legacy } = noWake;
      const r = await robot.savePersonality(wakeSupported ? supported : appearanceSupported ? noWake : legacy);
      if (!r.ok || !r.personality) { toast.error(ERRORS[r.error ?? ""] ?? r.error ?? "Kunde inte spara"); return; }
      setP({ ...DEFAULTS, ...r.personality }); setSaved({ ...DEFAULTS, ...r.personality }); toast.success("Sparat – gäller direkt på roboten");
    } catch (e) { fail(e); } finally { setBusy(false); }
  });
  const showOnRobot = () => connection.requestConnection(async () => {
    try { await robot.emotion(ROBOT_EMOTION[state]); } catch (e) { fail(e); }
  });
  const readSensor = () => connection.requestConnection(async () => {
    setBusy(true);
    try { setSensor((await robot.proximityTest()).ltr553); }
    catch (e) { fail(e); } finally { setBusy(false); }
  });

  const led = p.led[state];
  const ledKind = led === "off" ? "off" : led.startsWith("solid:") ? "solid" : led.startsWith("pulse:") ? "pulse" : "default";
  const ledColor = led.includes(":") ? (led.split(":")[1] ?? "#FFFFFF") : "#FFFFFF";
  const eye = p.eye[state];

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" disabled={busy} onClick={load}><Download />{connection.connected ? "Hämta från roboten" : "Anslut & hämta"}</Button>
      <Button disabled={busy || saved === null || !dirty} onClick={save}><Save />Spara på roboten</Button>
      <Button variant="ghost" disabled={busy} onClick={() => setP({ ...DEFAULTS, proximity_threshold: Math.max(proximityMin, 100), ...(p.proximity_threshold_min === undefined ? {} : { proximity_threshold_min: p.proximity_threshold_min }) })}><Undo2 />Standardvärden</Button>
      <p className="text-sm text-muted-foreground">{saved === null ? "Hämta först, så du inte skriver över robotens inställningar." : dirty ? "Osparade ändringar." : "Allt sparat. Ändringar gäller direkt, utan omflashning."}</p>
    </div>

    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <Card className="h-fit lg:sticky lg:top-4">
        <CardHeader><CardTitle>Skärmen</CardTitle><CardDescription>Förhandsvisning i webbläsaren. Välj ett läge och ändra färger till höger.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <FaceSimulator p={p} state={state} subtitle="Hej! Idag blir det soligt i Stockholm med upp till tolv grader." />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Läge">
            {PERSONALITY_STATES.map((s) => <Button key={s} size="sm" variant={s === state ? "secondary" : "ghost"} aria-pressed={s === state} onClick={() => setState(s)}>{STATE_LABEL[s]}</Button>)}
          </div>
          <Button variant="outline" size="sm" onClick={showOnRobot}><Eye />Visa läget på roboten</Button>
          <p className="text-xs text-muted-foreground">Förhandsvisningen är en kopia av robotens ritning, inte en direktbild från skärmen.</p>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Utseende: {STATE_LABEL[state]}</CardTitle><CardDescription>Ögonfärg och de två LED-ramperna på ovansidan.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="eye">Ögonfärg</Label>
              <div className="flex items-center gap-2">
                <input id="eye" type="color" className="h-9 w-14 cursor-pointer rounded border bg-transparent" value={eye === "default" ? DEFAULT_EYE[state] : eye}
                  onChange={(e) => set("eye", { ...p.eye, [state]: e.target.value.toUpperCase() })} />
                <Button size="sm" variant="ghost" disabled={eye === "default"} onClick={() => set("eye", { ...p.eye, [state]: "default" })}>Standard</Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>LED-ramperna</Label>
              <div className="flex items-center gap-2">
                <Select value={ledKind} onValueChange={(v) => set("led", { ...p.led, [state]: v === "default" || v === "off" ? v : `${v}:${ledColor}` })}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="default">Standardeffekt</SelectItem><SelectItem value="solid">Fast färg</SelectItem><SelectItem value="pulse">Pulserande</SelectItem><SelectItem value="off">Släckt</SelectItem></SelectContent>
                </Select>
                {(ledKind === "solid" || ledKind === "pulse") && <input aria-label="Lampfärg" type="color" className="h-9 w-14 cursor-pointer rounded border bg-transparent" value={ledColor}
                  onChange={(e) => set("led", { ...p.led, [state]: `${ledKind}:${e.target.value.toUpperCase()}` })} />}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Ansiktsdetaljer</CardTitle><CardDescription>Gäller alla lägen. {saved !== null && !appearanceSupported ? "Flasha v47 och hämta igen för att spara dessa val." : ""}</CardDescription></CardHeader>
          <CardContent className="divide-y">
            <Toggle id="status_text" label="Statustext" hint="LYSSNAR, VÄNTA och SVARAR över ansiktet." checked={p.status_text ?? true} onChange={(v) => set("status_text", v)} />
            <Toggle id="listening_waves" label="Ljudvågor vid öronen" hint="Pulserande cirklar när mikrofonen spelar in." checked={p.listening_waves ?? true} onChange={(v) => set("listening_waves", v)} />
            <Toggle id="eyebrows" label="Ögonbryn" hint="Uttrycksstreck ovanför ögonen." checked={p.eyebrows ?? true} onChange={(v) => set("eyebrows", v)} />
            <Toggle id="cheeks" label="Kindprickar" hint="De två små färgprickarna bredvid munnen." checked={p.cheeks ?? true} onChange={(v) => set("cheeks", v)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Väckningsord</CardTitle><CardDescription>Starta samtal med rösten i stället för att trycka. {saved !== null && !wakeSupported ? "Flasha v50 och hämta igen för att kunna slå på detta." : ""}</CardDescription></CardHeader>
          <CardContent className="divide-y">
            <Toggle id="wake_word" label={'Lyssna efter "Hi Stack Chan"'} hint="Bara när roboten är tyst och inte i samtal, kamera eller meny. Ljudet analyseras på roboten och skickas inte vidare förrän frasen hörts. Skärmtryck fungerar som vanligt." checked={p.wake_word ?? false} onChange={(v) => set("wake_word", v)} />
            {(wakeTuningSupported || wakePeakSupported) && <div className="grid gap-4 py-4 sm:grid-cols-2">
              {wakePeakSupported && <div className="space-y-2"><Label>Skydd mot svaga ljud</Label>
                <Select disabled={busy} value={String(p.wake_min_peak ?? 1500)} onValueChange={(v) => set("wake_min_peak", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="750">Lättare att väcka</SelectItem><SelectItem value="1500">Balanserat</SelectItem><SelectItem value="2500">Starkare skydd</SelectItem>
                    {![750, 1500, 2500].includes(p.wake_min_peak ?? 1500) && <SelectItem value={String(p.wake_min_peak)}>Egen inställning</SelectItem>}
                  </SelectContent>
                </Select></div>}
              {wakeTuningSupported && <div className="space-y-2"><Label htmlFor="wake-threshold">Frasigenkänning</Label>
                <Select disabled={busy} value={String(p.wake_threshold_milli ?? 490)} onValueChange={(v) => set("wake_threshold_milli", Number(v))}>
                  <SelectTrigger id="wake-threshold"><SelectValue /></SelectTrigger><SelectContent>
                    {!wakePeakSupported && <><SelectItem value="450">0,450 – känsligast</SelectItem><SelectItem value="490">0,490 – v72 standard</SelectItem><SelectItem value="520">0,520 – mellannivå</SelectItem></>}
                    <SelectItem value="585">0,585 – v61 känslighet</SelectItem><SelectItem value="650">0,650 – försiktigare</SelectItem><SelectItem value="700">0,700 – striktare</SelectItem>
                    {!(wakePeakSupported ? [585, 650, 700] : [450, 490, 520, 585, 650, 700]).includes(p.wake_threshold_milli ?? 490) && <SelectItem value={String(p.wake_threshold_milli)}>Egen inställning</SelectItem>}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Lägre gräns kan ge fler falskväckningar. Modellen är fortfarande ”Hi Stack Chan”; ”Hej” och ”Hey” är inte garanterade.</p>
                </div>}
            </div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Hand framför skärmen</CardTitle><CardDescription>{saved === null ? "Hämta robotens inställningar först." : !proximitySupported ? "Finns inte i den stabila v61. Handstyrningen är pausad tills vidare." : "Pausad från v65: handen startar eller avbryter inget, även om reglaget är på. Sensorvärden kan fortfarande läsas."}</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <Label htmlFor="proximity_control">Närhetsstyrning</Label>
              <Switch id="proximity_control" disabled={!proximitySupported || busy} checked={p.proximity_control ?? false} onCheckedChange={(v) => set("proximity_control", v)} />
            </div>
            <dl className="space-y-2 text-sm">
              <div><dt className="font-medium">För handen framför och ta bort den</dt><dd className="text-muted-foreground">Börja lyssna, avsluta din fråga eller avbryt robotens svar – som ett skärmtryck.</dd></div>
              <div><dt className="font-medium">Håll kvar handen</dt><dd className="text-muted-foreground">Avsluta samtalet helt. Gör ingenting i vila och öppnar aldrig menyn.</dd></div>
            </dl>
            <div className="space-y-2">
              <Label>Gräns för mycket nära: {p.proximity_threshold ?? 100}</Label>
              <Slider aria-label="Närhetsgräns" min={proximityMin} max={2047} step={1} disabled={!proximitySupported || !p.proximity_control || busy} value={[p.proximity_threshold ?? 100]} onValueChange={([v]) => set("proximity_threshold", v ?? 100)} />
              <p className="text-xs text-muted-foreground">Råvärde, inte avstånd i cm. Högre kräver starkare reflektion. v63 tillåter 5–2047; tidigare sparad gräns behålls.</p>
            </div>
            <Button variant="outline" size="sm" disabled={busy || !proximitySupported} onClick={readSensor}><Download />Läs sensorvärden</Button>
            {sensor && <dl className="grid grid-cols-2 gap-2 text-sm" aria-live="polite">
              <dt>Handreflektion</dt><dd>{sensor.ps_raw ?? "—"}</dd>
              <dt>Sparad gräns</dt><dd>{sensor.near_threshold ?? "—"}</dd>
              <dt>Styrning på roboten</dt><dd>{sensor.control_enabled ? "På" : "Av"}</dd>
              <dt>Sensorstatus</dt><dd>{sensor.ps_saturated ? "Mättad – ignoreras" : sensor.config_ok && sensor.ps_ok ? "Avläst" : sensor.last_error || "Avläsning misslyckades"}</dd>
              <dt>Ljus vid sensorn</dt><dd>{sensor.als_valid && typeof sensor.lux_estimate === "number" ? `≈ ${sensor.lux_estimate.toFixed(1)} lux` : "Ingen giltig ljusmätning"}</dd>
            </dl>}
            <p className="text-xs text-muted-foreground">Jämför en avläsning utan hand med en mycket nära. Gränsen måste ligga mellan värdena. Ljusvärdet är en uppskattning bakom glaset, inte kalibrerat rumsljus.</p>
            <p className="text-xs text-muted-foreground">v64 accepterar även långsammare handrörelser. Ta bort handen mellan gester. Pausad i meny, kamera, mikrofontest och huvudrörelser.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Vila och skärm</CardTitle><CardDescription>När roboten somnar och hur mörk skärmen blir.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Somnar efter</Label>
                <Select value={String(p.sleep_after_s)} onValueChange={(v) => set("sleep_after_s", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SLEEP_OPTIONS.map(([v, l]) => <SelectItem key={v} value={String(v)}>{l}</SelectItem>)}{!SLEEP_OPTIONS.some(([v]) => v === p.sleep_after_s) && <SelectItem value={String(p.sleep_after_s)}>{p.sleep_after_s} s</SelectItem>}</SelectContent>
                </Select></div>
              <div className="space-y-2"><Label>Skärmen släcks efter sovansiktet</Label>
                <Select value={String(p.screen_off_after_s)} disabled={!p.sleep_face} onValueChange={(v) => set("screen_off_after_s", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{OFF_OPTIONS.map(([v, l]) => <SelectItem key={v} value={String(v)}>{l}</SelectItem>)}{!OFF_OPTIONS.some(([v]) => v === p.screen_off_after_s) && <SelectItem value={String(p.screen_off_after_s)}>{p.screen_off_after_s} s</SelectItem>}</SelectContent>
                </Select></div>
            </div>
            <Toggle id="sleep_face" label="Visa sovansikte" hint="Av: skärmen blir svart direkt när roboten somnar." checked={p.sleep_face} onChange={(v) => set("sleep_face", v)} />
            <div className="space-y-2"><Label>Ljusstyrka vaken: {Math.round(p.awake_brightness / 2.55)} %</Label>
              <Slider min={10} max={255} step={5} value={[p.awake_brightness]} onValueChange={([v]) => set("awake_brightness", v ?? 127)} /></div>
            <div className="space-y-2"><Label>Ljusstyrka när den sover (nedtonad): {Math.round(p.sleep_brightness / 2.55)} %</Label>
              <Slider min={0} max={255} step={5} value={[p.sleep_brightness]} onValueChange={([v]) => set("sleep_brightness", v ?? 40)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Samtal och tryck</CardTitle><CardDescription>Hur snabbt den reagerar och vad som syns och hörs under samtal.</CardDescription></CardHeader>
          <CardContent className="divide-y">
            <Toggle id="touch_menu" label="Håll inne för meny" hint="Av: ett tryck startar samtalet så fort fingret nuddar skärmen (snabbare). Menyn nås då via Command Hub." checked={p.touch_menu} onChange={(v) => set("touch_menu", v)} />
            <Toggle id="listen_cue" label="Ljudsignal när den börjar lyssna" hint="Kort pip när mikrofonen faktiskt är öppen." checked={p.listen_cue} onChange={(v) => set("listen_cue", v)} />
            <Toggle id="subtitles" label="Undertext på skärmen" hint="Robotens svar visas som text längst ner medan den pratar. Av: bara röst." checked={p.subtitles} onChange={(v) => set("subtitles", v)} />
            <Toggle id="nod_on_start" label="Nicka när samtalet startar" hint="En liten nick som kvittens när du trycker. Kräver att motorerna är påslagna." checked={p.nod_on_start} onChange={(v) => set("nod_on_start", v)} />
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">Mät hur snabbt den svarar efter tryck under Felsökning → Svarstider. Röst, språk och vad roboten säger ställs in under Inställningar.</p>
      </div>
    </div>
  </div>;
}
