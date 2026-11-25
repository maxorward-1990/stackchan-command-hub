import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { robot, type HomeDevice, type LocalScene, type SceneStep, type SceneStepAction } from "@/lib/gemini-robot";

const COLORS: [string, string][] = [["red", "Röd"], ["orange", "Orange"], ["yellow", "Gul"], ["green", "Grön"], ["cyan", "Turkos"], ["blue", "Blå"], ["purple", "Lila"], ["pink", "Rosa"]];
const SCENE_ERRORS: Record<string, string> = {
  scene_name_missing: "Ge scenen ett namn.", scene_name_too_long: "Namnet får vara högst 40 tecken.",
  scene_has_no_devices: "Välj minst en lampa.", scene_too_many_devices: "Högst 16 enheter per scen.",
  scene_brightness_invalid: "Ljusstyrkan måste vara 1–100 %.", scene_color_invalid: "Okänd färg.",
  too_many_scenes: "Högst 20 scener på roboten.", storage_write_failed: "Roboten kunde inte spara scenen.",
};
const sel = "h-8 rounded-md border border-input bg-background px-2 text-sm";

function stepLabel(s: SceneStep) {
  if (s.action === "on") return "på";
  if (s.action === "off") return "av";
  if (s.action === "white") return "vitt";
  if (s.action === "brightness") return `${s.brightness} %`;
  return `${COLORS.find((c) => c[0] === s.color)?.[1] ?? s.color}${s.brightness ? ` ${s.brightness} %` : ""}`;
}

export function SceneEditor({ devices, scenes, setScenes, busy, run }: {
  devices: HomeDevice[] | null; scenes: LocalScene[] | null; setScenes: (s: LocalScene[]) => void;
  busy: boolean; run: (name: string) => void;
}) {
  const [draft, setDraft] = useState<{ original?: string; name: string; steps: Record<string, SceneStep> } | null>(null);

  const startNew = () => setDraft({ name: "", steps: {} });
  const edit = (s: LocalScene) => setDraft({ original: s.name, name: s.name, steps: Object.fromEntries(s.steps.map((x) => [x.device, x])) });
  const setStep = (device: string, step: SceneStep | null) => setDraft((d) => {
    if (!d) return d;
    const steps = { ...d.steps };
    if (step) steps[device] = step; else delete steps[device];
    return { ...d, steps };
  });

  const save = async () => {
    if (!draft) return;
    const scene: LocalScene = { name: draft.name.trim(), steps: Object.values(draft.steps) };
    try {
      if (draft.original && draft.original.toLowerCase() !== scene.name.toLowerCase()) await robot.deleteHomeScene(draft.original);
      const r = await robot.saveHomeScene(scene);
      setScenes(r.scenes); setDraft(null); toast.success(`Scenen "${scene.name}" sparad på roboten`);
    } catch (e) {
      const m = String((e as Error).message); const code = /"error":"([^"]+)"/.exec(m)?.[1];
      toast.error(code ? SCENE_ERRORS[code] ?? code : m);
    }
  };
  const remove = async (name: string) => {
    try { const r = await robot.deleteHomeScene(name); setScenes(r.scenes); toast.success(`Scenen "${name}" borttagen`); }
    catch (e) { toast.error(String((e as Error).message)); }
  };

  return (
    <section className="space-y-3 border-t pt-4" aria-label="Mina scener">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Mina scener</p>
        {!draft && <Button size="sm" variant="outline" disabled={!devices} onClick={startNew}><Plus />Ny scen</Button>}
      </div>
      {!devices && <p className="text-xs text-muted-foreground">Hämta enheter först för att skapa scener.</p>}
      {scenes && scenes.length === 0 && !draft && devices && (
        <p className="text-xs text-muted-foreground">Inga scener än. Skapa t.ex. "Mys" med dimrade vardagsrumslampor och säg sedan "kör Mys" till roboten.</p>
      )}
      {!draft && scenes?.map((s) => (
        <div key={s.name} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 p-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium">{s.name}</p>
            <p className="break-words text-xs text-muted-foreground">{s.steps.map((x) => `${x.device} ${stepLabel(x)}`).join(" · ")}</p>
          </div>
          <span className="flex gap-1">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(s.name)}><Sparkles />Kör</Button>
            <Button size="sm" variant="ghost" aria-label={`Redigera ${s.name}`} disabled={!devices} onClick={() => edit(s)}><Pencil /></Button>
            <Button size="sm" variant="ghost" aria-label={`Ta bort ${s.name}`} onClick={() => void remove(s.name)}><Trash2 /></Button>
          </span>
        </div>
      ))}
      {draft && devices && (
        <div className="space-y-3">
          <div><Label htmlFor="scene-name" className="text-xs">Scenens namn (det du säger till roboten)</Label>
            <Input id="scene-name" maxLength={40} placeholder="t.ex. Mys" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
          <ul className="divide-y rounded-md border">
            {devices.map((d) => {
              const st = draft.steps[d.name];
              const light = d.kind === "light";
              return (
                <li key={d.name} className="flex flex-wrap items-center gap-2 p-2 text-sm">
                  <Checkbox id={`sc-${d.name}`} checked={!!st} onCheckedChange={(v) => setStep(d.name, v ? { device: d.name, action: "on" } : null)} />
                  <label htmlFor={`sc-${d.name}`} className="flex-1">{d.name}</label>
                  {st && (
                    <span className="flex flex-wrap items-center gap-2">
                      <select aria-label={`Vad ${d.name} ska göra`} className={sel} value={st.action}
                        onChange={(e) => {
                          const action = e.target.value as SceneStepAction;
                          setStep(d.name, { device: d.name, action, ...(action === "brightness" ? { brightness: st.brightness ?? 50 } : {}),
                            ...(action === "color" ? { color: st.color ?? "orange", brightness: st.brightness ?? 60 } : {}) });
                        }}>
                        <option value="on">På</option><option value="off">Av</option>
                        {light && <><option value="brightness">Ljusstyrka</option><option value="color">Färg</option><option value="white">Vitt ljus</option></>}
                      </select>
                      {st.action === "color" && (
                        <select aria-label={`Färg för ${d.name}`} className={sel} value={st.color} onChange={(e) => setStep(d.name, { ...st, color: e.target.value })}>
                          {COLORS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      )}
                      {(st.action === "brightness" || st.action === "color") && (
                        <span className="flex items-center gap-1">
                          <input type="range" min={1} max={100} aria-label={`Ljusstyrka för ${d.name}`} value={st.brightness ?? 50}
                            onChange={(e) => setStep(d.name, { ...st, brightness: Number(e.target.value) })} className="w-24 accent-primary" />
                          <span className="w-10 text-xs tabular-nums">{st.brightness ?? 50} %</span>
                        </span>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void save()}><Save />Spara scen</Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}><X />Avbryt</Button>
          </div>
        </div>
      )}
    </section>
  );
}
