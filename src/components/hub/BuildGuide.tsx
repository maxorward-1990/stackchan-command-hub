import { ChevronLeft, ChevronRight, CheckCircle2, Lightbulb, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useLocal } from "@/lib/use-local";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import finalImg from "@/assets/stackchan-rover-final.jpg";
import { BUILDS, type BuildId, type BuildStep } from "@/lib/build-steps";
import miniImg from "@/assets/stackchan-mini-final.jpg";
import { FootTest } from "@/components/hub/FootTest";

type View = "top" | "side";
type Part = { id: string; step: number; view: View; el: (cls: string) => React.ReactNode };

const S = "stroke-foreground";
// Top view: front of robot points UP. Hub in the middle, wheels left/right of centre.
const SCOUT_PARTS: Part[] = [
  { id: "hub", step: 1, view: "top", el: (c) => (<g className={c}><rect x="155" y="90" width="90" height="130" rx="10" className={S} strokeWidth="2" /><circle cx="200" cy="155" r="10" className="fill-background" /><text x="200" y="108" textAnchor="middle" className="fill-foreground text-[10px] font-bold">A    B</text><text x="200" y="212" textAnchor="middle" className="fill-foreground text-[10px] font-bold">C    D</text></g>) },
  { id: "beamL", step: 2, view: "top", el: (c) => <Beam c={c} x={141} y={80} h={180} holes={11} /> },
  { id: "beamR", step: 2, view: "top", el: (c) => <Beam c={c} x={247} y={80} h={180} holes={11} /> },
  { id: "motL", step: 3, view: "top", el: (c) => (<g className={c}><rect x="95" y="128" width="44" height="54" rx="8" className={S} strokeWidth="2" /><circle cx="110" cy="155" r="5" className="fill-background" /><text x="117" y="176" textAnchor="middle" className="fill-foreground text-[9px] font-bold">L</text></g>) },
  { id: "motR", step: 3, view: "top", el: (c) => (<g className={c}><rect x="261" y="128" width="44" height="54" rx="8" className={S} strokeWidth="2" /><circle cx="290" cy="155" r="5" className="fill-background" /><text x="283" y="176" textAnchor="middle" className="fill-foreground text-[9px] font-bold">L</text></g>) },
  { id: "gearL", step: 4, view: "top", el: (c) => (<g className={c}><rect x="84" y="140" width="8" height="30" className={S} strokeWidth="1.5" /><rect x="74" y="133" width="8" height="44" className={S} strokeWidth="1.5" /></g>) },
  { id: "gearR", step: 4, view: "top", el: (c) => (<g className={c}><rect x="308" y="140" width="8" height="30" className={S} strokeWidth="1.5" /><rect x="318" y="133" width="8" height="44" className={S} strokeWidth="1.5" /></g>) },
  { id: "wheelL", step: 5, view: "top", el: (c) => <rect className={c + " " + S} x="34" y="115" width="36" height="80" rx="8" strokeWidth="2" strokeDasharray="0" /> },
  { id: "wheelR", step: 5, view: "top", el: (c) => <rect className={c + " " + S} x="330" y="115" width="36" height="80" rx="8" strokeWidth="2" /> },
  { id: "caster", step: 6, view: "top", el: (c) => (<g className={c}><rect x="150" y="250" width="100" height="10" rx="3" className={S} strokeWidth="1.5" /><circle cx="200" cy="268" r="9" className={S} strokeWidth="1.5" /></g>) },
  { id: "cables", step: 7, view: "top", el: (c) => (<g className={c} strokeWidth="3" strokeLinecap="round"><path d="M120 128 C120 90 170 80 178 98" className="stroke-foreground" style={{ fill: "none" }} /><path d="M280 128 C280 90 230 80 222 98" className="stroke-foreground" style={{ fill: "none" }} /></g>) },
  { id: "rails", step: 8, view: "top", el: (c) => (<g className={c}><Beam c="" x={165} y={115} h={80} holes={7} /><Beam c="" x={227} y={115} h={80} holes={7} /></g>) },
  { id: "chan", step: 9, view: "top", el: (c) => (<g className={c}><rect x="172" y="120" width="56" height="70" rx="10" className={S} strokeWidth="2" /><circle cx="190" cy="150" r="4" className="fill-foreground" /><circle cx="210" cy="150" r="4" className="fill-foreground" /><path d="M190 165 q10 8 20 0" className="stroke-foreground fill-none" strokeWidth="2" /></g>) },
  // Side view: front points LEFT. Ground at y=262.
  { id: "hub", step: 1, view: "side", el: (c) => <rect className={c + " " + S} x="140" y="165" width="130" height="50" rx="8" strokeWidth="2" /> },
  { id: "beamL", step: 2, view: "side", el: (c) => <rect className={c + " " + S} x="130" y="180" width="180" height="12" rx="6" strokeWidth="1.5" /> },
  { id: "motL", step: 3, view: "side", el: (c) => <rect className={c + " " + S} x="178" y="170" width="54" height="40" rx="8" strokeWidth="2" /> },
  { id: "wheelL", step: 5, view: "side", el: (c) => (<g className={c}><circle cx="205" cy="222" r="40" className={S} strokeWidth="3" /><circle cx="205" cy="222" r="18" className="fill-background stroke-foreground" strokeWidth="2" /></g>) },
  { id: "caster", step: 6, view: "side", el: (c) => (<g className={c}><path d="M292 192 L292 238 L310 238" className="stroke-foreground fill-none" strokeWidth="10" strokeLinejoin="round" /><circle cx="300" cy="252" r="10" className={S} strokeWidth="2" /></g>) },
  { id: "rails", step: 8, view: "side", el: (c) => (<g className={c}><rect x="165" y="150" width="80" height="12" rx="6" className={S} strokeWidth="1.5" /><rect x="168" y="125" width="10" height="28" className={S} /><rect x="232" y="125" width="10" height="28" className={S} /></g>) },
  { id: "chan", step: 9, view: "side", el: (c) => (<g className={c}><rect x="170" y="100" width="70" height="40" rx="6" className={S} strokeWidth="2" /><rect x="168" y="30" width="74" height="68" rx="12" className={S} strokeWidth="2" /><circle cx="180" cy="62" r="4" className="fill-foreground" /><line x1="205" y1="20" x2="205" y2="270" className="stroke-primary" strokeDasharray="4 4" strokeWidth="1.5" /></g>) },
];

// Mini (4 wheels): top view front UP, side view front LEFT.
const wheelTop = (x: number, y: number) => <rect x={x} y={y} width="34" height="64" rx="8" className={S} strokeWidth="2" />;
const MINI_PARTS: Part[] = [
  { id: "frame", step: 1, view: "top", el: (c) => (<g className={c}><Beam c="" x={136} y={45} h={225} holes={15} /><Beam c="" x={252} y={45} h={225} holes={15} /><rect x="136" y="45" width="128" height="10" rx="4" className={S} strokeWidth="1.5" /><rect x="136" y="262" width="128" height="10" rx="4" className={S} strokeWidth="1.5" /><rect x="150" y="58" width="100" height="125" rx="10" className="stroke-muted-foreground fill-none" strokeDasharray="4 4" /></g>) },
  { id: "frame", step: 1, view: "side", el: (c) => <rect className={c + " " + S} x="80" y="205" width="255" height="12" rx="6" strokeWidth="1.5" /> },
  { id: "hub", step: 1, view: "top", el: (c) => (<g className={c}><rect x="150" y="58" width="100" height="125" rx="10" className={S} strokeWidth="2" /><circle cx="200" cy="120" r="10" className="fill-background" /><text x="200" y="76" textAnchor="middle" className="fill-foreground text-[10px] font-bold">A    B</text></g>) },
  { id: "hub", step: 1, view: "side", el: (c) => <rect className={c + " " + S} x="90" y="168" width="150" height="40" rx="8" strokeWidth="2" /> },
  { id: "mot", step: 2, view: "top", el: (c) => (<g className={c}><rect x="162" y="185" width="36" height="76" rx="6" className={S} strokeWidth="2" /><rect x="202" y="185" width="36" height="76" rx="6" className={S} strokeWidth="2" /><circle cx="168" cy="230" r="4" className="fill-background" /><circle cx="232" cy="230" r="4" className="fill-background" /><text x="182" y="215" textAnchor="middle" className="fill-foreground text-[9px] font-bold">L</text><text x="220" y="215" textAnchor="middle" className="fill-foreground text-[9px] font-bold">L</text></g>) },
  { id: "mot", step: 2, view: "side", el: (c) => <rect className={c + " " + S} x="245" y="180" width="85" height="28" rx="6" strokeWidth="2" /> },
  { id: "rear", step: 3, view: "top", el: (c) => (<g className={c}>{wheelTop(100, 198)}{wheelTop(266, 198)}</g>) },
  { id: "rear", step: 3, view: "side", el: (c) => (<g className={c}><circle cx="290" cy="228" r="34" className={S} strokeWidth="3" /><circle cx="290" cy="228" r="14" className="fill-background stroke-foreground" strokeWidth="2" /></g>) },
  { id: "front", step: 4, view: "top", el: (c) => (<g className={c}>{wheelTop(100, 58)}{wheelTop(266, 58)}</g>) },
  { id: "front", step: 4, view: "side", el: (c) => (<g className={c}><circle cx="125" cy="228" r="34" className={S} strokeWidth="3" /><circle cx="125" cy="228" r="14" className="fill-background stroke-foreground" strokeWidth="2" /></g>) },
  { id: "cables", step: 5, view: "top", el: (c) => (<g className={c} strokeWidth="3" strokeLinecap="round"><path d="M180 186 C150 170 150 70 176 64" className="stroke-foreground" style={{ fill: "none" }} /><path d="M220 186 C250 170 250 70 224 64" className="stroke-foreground" style={{ fill: "none" }} /></g>) },
  { id: "chan", step: 6, view: "top", el: (c) => (<g className={c}><rect x="172" y="105" width="56" height="66" rx="10" className={S} strokeWidth="2" /><circle cx="190" cy="132" r="4" className="fill-foreground" /><circle cx="210" cy="132" r="4" className="fill-foreground" /></g>) },
  { id: "chan", step: 6, view: "side", el: (c) => (<g className={c}><rect x="172" y="154" width="70" height="14" rx="4" className={S} /><rect x="174" y="114" width="66" height="40" rx="6" className={S} strokeWidth="2" /><rect x="172" y="46" width="70" height="66" rx="12" className={S} strokeWidth="2" /><circle cx="184" cy="78" r="4" className="fill-foreground" /><line x1="207" y1="36" x2="207" y2="270" className="stroke-primary" strokeDasharray="4 4" strokeWidth="1.5" /></g>) },
];

const SCENES: Record<BuildId, Part[]> = { scout: SCOUT_PARTS, mini: MINI_PARTS };
const IMAGES: Record<BuildId, string> = { scout: finalImg, mini: miniImg };

function Beam({ c, x, y, h, holes }: { c: string; x: number; y: number; h: number; holes: number }) {
  const gap = h / holes;
  return (
    <g className={c}>
      <rect x={x} y={y} width="12" height={h} rx="6" className={S} strokeWidth="1.5" />
      {Array.from({ length: holes }, (_, i) => <circle key={i} cx={x + 6} cy={y + gap / 2 + i * gap} r="2.5" className="fill-background" />)}
    </g>
  );
}

function Scene({ build, s, step, view }: { build: BuildId; s: BuildStep; step: number; view: View }) {
  return (
    <svg viewBox="0 0 400 300" className="h-auto w-full rounded-xl border bg-muted/30" role="img" aria-label={`Bild för steg ${step + 1}: ${s.title}`}>
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" className="fill-primary" /></marker>
      </defs>
      {view === "side" && <line x1="10" y1="262" x2="390" y2="262" className="stroke-muted-foreground" strokeWidth="2" />}
      {SCENES[build].filter((p) => p.view === view && p.step <= step).map((p, i) => (
        <g key={p.id + i}>{p.el(p.step === step ? "fill-primary/25 animate-in fade-in zoom-in-95 duration-500 [&_.stroke-foreground]:stroke-primary" : "fill-muted [&_.stroke-foreground]:stroke-muted-foreground opacity-80")}</g>
      ))}
      {s.arrows?.filter((a) => a.view === view).map((a, i) => (
        <g key={i}>
          <path d={a.d} className="fill-none stroke-primary" strokeWidth="2.5" markerEnd="url(#arr)" />
          {a.label && <text x={a.lx} y={a.ly} textAnchor="middle" className="fill-primary text-[11px] font-bold">{a.label}</text>}
        </g>
      ))}
      <text x="12" y="20" className="fill-muted-foreground text-[10px]">{view === "top" ? "OVANIFRÅN · fram ↑" : "FRÅN SIDAN · fram ←"}</text>
    </svg>
  );
}

function FinalBuild({ build, big }: { build: BuildId; big?: boolean }) {
  const finalSrc = IMAGES[build];
  const scout = build === "scout";
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="group block w-full overflow-hidden rounded-xl border text-left" aria-label="Visa den färdiga roboten i stort format">
          <img src={finalSrc} alt="Den färdiga StackChan-roboten på LEGO-hjulbasen" width={1280} height={896} className="h-auto w-full transition-transform group-hover:scale-[1.02]" loading={big ? undefined : "lazy"} />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>Så ska den färdiga roboten se ut</DialogTitle></DialogHeader>
        <img src={finalSrc} alt="Den färdiga StackChan-roboten på LEGO-hjulbasen" width={1280} height={896} className="h-auto w-full rounded-lg" />
        <ul className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
          {(scout ? ["Grå hubb i mitten = chassit", "En motor på var sida driver ett hjul", "Kugghjul mellan motor och hjul = lugnare fart", "Glidtass bak håller den i balans", "Vita balkar ovanpå = vaggan för StackChan", "Hjulen sitter under StackChans huvud, så den snurrar på stället"]
            : ["Hubben ligger platt i mitten och bestämmer bredden", "Fyra hjul i hörnen = står stadigt", "Motorerna ligger på längden bakom hubben", "Motorerna driver bakhjulen direkt, inga kugghjul", "Framhjulen rullar fritt", "Svänger genom att köra sidorna olika fort"]).map((t) => <li key={t}>• {t}</li>)}
        </ul>
        <p className="text-xs text-muted-foreground">AI-genererad referensbild för att visa idén. Detaljerna stämmer inte exakt med stegen: följ stegen när de skiljer sig, {scout ? "till exempel ska hjulen sitta mitt på sidorna." : "till exempel kan hjulens storlek och motorernas placering skilja sig."}</p>
      </DialogContent>
    </Dialog>
  );
}

export function BuildGuide() {
  const [build, setBuild] = useLocal<BuildId>("sc.build.variant", "scout");
  const [steps, setSteps] = useLocal<Record<string, number>>("sc.build.steps", {});
  const [have, setHave] = useLocal<Record<string, boolean>>("sc.build.parts", {});
  const B = BUILDS[build] ?? BUILDS.scout;
  const BUILD_STEPS = B.steps;
  const step = Math.min(steps[build] ?? 0, BUILD_STEPS.length - 1);
  const setStep = (n: number) => setSteps({ ...steps, [build]: n });
  const s = BUILD_STEPS[step] ?? BUILD_STEPS[0]!;
  const last = BUILD_STEPS.length - 1;
  const views: View[] = s.views ?? ["top"];

  return (
    <div className="space-y-4">
    <FootTest />
    <div className="grid grid-cols-2 gap-2 sm:max-w-md" role="radiogroup" aria-label="Välj bygge">
      {(Object.keys(BUILDS) as BuildId[]).map((id) => (
        <button key={id} role="radio" aria-checked={build === id} onClick={() => setBuild(id)} className={`rounded-xl border p-3 text-left transition-colors ${build === id ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>
          <span className="block font-display font-bold">{BUILDS[id].name}</span>
          <span className="text-xs text-muted-foreground">{BUILDS[id].tagline}</span>
        </button>
      ))}
    </div>
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Steg {step + 1} av {BUILD_STEPS.length}</p>
            <Button variant="ghost" size="sm" onClick={() => setStep(0)}><RotateCcw className="size-3.5" />Börja om</Button>
          </div>
          <Progress value={((step + 1) / BUILD_STEPS.length) * 100} />
          <CardTitle className="font-display text-2xl">{s.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 ? (
            <>
            <FinalBuild build={build} big />
            <p className="text-sm font-semibold">Plocka fram de här delarna:</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {B.parts.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm hover:bg-muted/50">
                  <Checkbox checked={!!have[p.id]} onCheckedChange={(v) => setHave({ ...have, [p.id]: !!v })} />
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/15 font-bold text-primary">{p.qty}×</span>
                  <span><span className="font-medium">{p.name}</span><br /><span className="text-xs text-muted-foreground">{p.hint}</span></span>
                </label>
              ))}
            </div>
            </>
          ) : (
            <div className={views.length > 1 ? "grid gap-3 md:grid-cols-2" : ""}>
              {views.map((v) => <Scene key={v} build={build} s={s} step={step} view={v} />)}
            </div>
          )}
          {s.parts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {s.parts.map((p) => <span key={p} className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium">{p}</span>)}
            </div>
          )}
          <ol className="space-y-2">
            {s.do.map((d, i) => (
              <li key={i} className="flex gap-3 text-sm"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span><span className="pt-0.5">{d}</span></li>
            ))}
          </ol>
          {s.tip && <p className="flex gap-2 rounded-lg bg-accent p-3 text-sm text-accent-foreground"><Lightbulb className="size-4 shrink-0" />{s.tip}</p>}
          <div className="flex justify-between pt-2">
            <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}><ChevronLeft />Föregående</Button>
            {step < last ? <Button onClick={() => setStep(step + 1)}>Nästa steg<ChevronRight /></Button>
              : <Button disabled><CheckCircle2 />Klart!</Button>}
          </div>
        </CardContent>
      </Card>
      <Card className="h-fit">
        <CardHeader className="space-y-3"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Färdig robot · klicka för stor bild</p><FinalBuild build={build} /><CardTitle className="pt-2 text-base">Alla steg</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {BUILD_STEPS.map((b, i) => (
            <button key={i} onClick={() => setStep(i)} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${i === step ? "bg-primary/15 font-semibold" : "hover:bg-muted"}`}>
              {i < step ? <CheckCircle2 className="size-4 text-primary" /> : <span className="grid size-4 place-items-center text-[10px] text-muted-foreground">{i + 1}</span>}
              {b.title}
            </button>
          ))}
          <p className="pt-3 text-xs text-muted-foreground">Bilderna är förenklade skisser, inte exakta LEGO-ritningar. Räkna hål på riktigt och provsätt innan du trycker in pinnar hårt.</p>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
