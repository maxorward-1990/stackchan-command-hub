import { useEffect, useRef, useState } from "react";
import { Clock, CloudSun, Copy, Download, LayoutPanelTop, Loader2, Maximize, Play, Plus, RefreshCw, Save, Search, Send, Square, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLocal } from "@/lib/use-local";
import { robot } from "@/lib/gemini-robot";
import { FocusAppCard } from "./FocusAppCard";
import { AppBuilder } from "./AppBuilder";
import { robotAppRequest, type RobotAppStatus } from "@/lib/robot-app";
import { DEFAULT_APP, clockText, deskAppSchema, fetchWeather, findPlaces, importApps, readApps, snapshotText, weatherLabel, weatherStale, type DeskApp, type Place, type Weather } from "@/lib/desk-app";

export function AppsPage() {
  const [stored, setStored] = useLocal<DeskApp[]>("sc.apps.v1", [DEFAULT_APP]);
  const apps = readApps(stored);
  const [draft, setDraft] = useState<DeskApp>(DEFAULT_APP);
  const [now, setNow] = useState<Date | null>(null);
  const [weather, setWeather] = useState<{ place: string; value: Weather } | null>(null);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [appStatus, setAppStatus] = useState<RobotAppStatus | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const placeKey = JSON.stringify(draft.place);
  const currentWeather = weather?.place === placeKey ? weather.value : null;
  useEffect(() => { const tick = () => setNow(new Date()); tick(); const timer = setInterval(tick, 1000); return () => { clearInterval(timer); request.current?.abort(); }; }, []);
  const action = async (key: string, work: () => Promise<void>) => {
    setBusy(key); setError("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Åtgärden misslyckades."); } finally { setBusy(null); }
  };
  const signal = () => { request.current?.abort(); const controller = new AbortController(); request.current = controller; return AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]); };
  const save = () => {
    const parsed = deskAppSchema.safeParse(draft);
    if (!parsed.success) { setError("Ge appen ett namn (högst 40 tecken)."); return; }
    if (!apps.some(a => a.id === draft.id) && apps.length >= 20) { setError("Biblioteket rymmer 20 appar."); return; }
    setStored([...apps.filter(a => a.id !== draft.id), parsed.data]); toast.success("Appen sparad på den här enheten.");
  };
  const newApp = () => { setDraft({ ...DEFAULT_APP, id: crypto.randomUUID(), name: "Min skrivbordsklocka" }); setError(""); setPlaces([]); };
  const exportApps = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, apps }, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "stackchan-appar.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="space-y-7">
    <AppBuilder />
    <details className="rounded-md border p-4"><summary className="cursor-pointer font-medium">Inbyggda appar: Klocka &amp; Väder och Fokustimer <span className="text-xs font-normal text-muted-foreground">(finns i firmware, egna inställningar)</span></summary><div className="mt-5 space-y-7">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-5">
      <div><p className="font-medium">Klocka & Väder och Fokustimer</p><p className="mt-1 text-sm text-muted-foreground">Inbyggda appar i robotens firmware · inställningar sparas här och på roboten</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="icon" title="Exportera appar" aria-label="Exportera appar" disabled={!apps.length} onClick={exportApps}><Download /></Button>
        <Button variant="outline" size="icon" title="Importera appar" aria-label="Importera appar" disabled={busy !== null} onClick={() => file.current?.click()}><Upload /></Button>
        <Button onClick={newApp} disabled={busy !== null}><Plus />Ny app</Button>
        <input ref={file} type="file" accept=".json,application/json" className="hidden" onChange={e => { const uploaded = e.target.files?.[0]; e.target.value = ""; if (!uploaded) return; void action("import", async () => {
          if (uploaded.size > 64000) throw new Error("Appfilen är för stor.");
          const imported = importApps(await uploaded.text()).map(a => ({ ...a, id: crypto.randomUUID() }));
          if (apps.length + imported.length > 20) throw new Error("Biblioteket rymmer 20 appar.");
          setStored([...apps, ...imported]); const first = imported[0]; if (first) setDraft(first); toast.success("Apparna importerade.");
        }); }} />
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {apps.map(app => <Button key={app.id} variant="outline" disabled={busy !== null} className={`h-auto min-h-20 justify-start gap-4 whitespace-normal px-4 py-4 text-left ${draft.id === app.id ? "border-primary bg-secondary" : ""}`} onClick={() => { setDraft(app); setPlaces([]); setError(""); }}>
        <Clock className="size-6 shrink-0 text-primary" /><span className="min-w-0"><span className="block break-words font-semibold">{app.name}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{app.place.name} · {app.mode === "widget" ? "Widget" : "Helskärm"}</span></span>
      </Button>)}
    </div>
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(320px,1fr)]">
      <section className="min-w-0 space-y-5">
        <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Klocka & Väder</h3><span className="text-xs text-muted-foreground">Appmall 01</span></div>
        <div className="space-y-2"><Label htmlFor="app-name">Appnamn</Label><Input id="app-name" maxLength={40} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></div>
        <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Skärmläge</legend><div className="grid grid-cols-2 gap-2">
          <Button variant={draft.mode === "widget" ? "secondary" : "outline"} aria-pressed={draft.mode === "widget"} onClick={() => setDraft({ ...draft, mode: "widget" })}><LayoutPanelTop />Widget</Button>
          <Button variant={draft.mode === "fullscreen" ? "secondary" : "outline"} aria-pressed={draft.mode === "fullscreen"} onClick={() => setDraft({ ...draft, mode: "fullscreen" })}><Maximize />Helskärm</Button>
        </div></fieldset>
        <div className="flex items-center justify-between border-b pb-4"><Label htmlFor="app-seconds">Visa sekunder</Label><Switch id="app-seconds" checked={draft.seconds} onCheckedChange={seconds => setDraft({ ...draft, seconds })} /></div>
        <div className="space-y-2"><Label htmlFor="app-place">Ort</Label><p className="break-words text-sm">{draft.place.name}</p><form className="flex gap-2" onSubmit={e => { e.preventDefault(); void action("search", async () => { const found = await findPlaces(query, signal()); setPlaces(found); if (!found.length) throw new Error("Ingen ort hittades."); }); }}>
          <Input id="app-place" placeholder="Sök annan ort…" value={query} maxLength={80} onChange={e => setQuery(e.target.value)} /><Button type="submit" variant="outline" size="icon" aria-label="Sök ort" title="Sök ort" disabled={busy !== null}>{busy === "search" ? <Loader2 className="animate-spin" /> : <Search />}</Button>
        </form>
        {places.length > 0 && <div className="divide-y border">{places.map(p => <Button key={JSON.stringify(p)} variant="ghost" disabled={busy !== null} className="h-auto w-full justify-start whitespace-normal py-3 text-left" onClick={() => { setDraft({ ...draft, place: p }); setPlaces([]); }}>{p.name}</Button>)}</div>}
        </div>
        <div className="flex flex-wrap gap-2"><Button onClick={save} disabled={busy !== null}><Save />Spara app</Button><Button variant="outline" disabled={busy !== null} onClick={() => setDraft({ ...draft, id: crypto.randomUUID(), name: `${draft.name.slice(0, 32)} kopia` })}><Copy />Duplicera</Button>
          <Button variant="ghost" size="icon" aria-label="Ta bort app" title="Ta bort app" disabled={busy !== null || !apps.some(a => a.id === draft.id)} onClick={() => { if (!window.confirm(`Ta bort ${draft.name}?`)) return; setStored(apps.filter(a => a.id !== draft.id)); newApp(); }}><Trash2 /></Button>
        </div>
      </section>
      <section className="min-w-0 space-y-4">
        <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Förhandsvisning</h3><span className="text-xs text-muted-foreground">320 × 240 · skiss</span></div>
        <div className="mx-auto flex aspect-[4/3] w-full max-w-[480px] flex-col overflow-hidden rounded-lg bg-face text-face-foreground" aria-label={`${draft.mode === "widget" ? "Widget" : "Helskärm"} förhandsvisning`}>
          {draft.mode === "widget" ? <>
            <div className="flex min-h-0 flex-1 items-center justify-center gap-14" aria-hidden="true"><div className="h-16 w-7 rounded-full bg-chart-2" /><div className="h-16 w-7 rounded-full bg-chart-2" /></div>
            <div className="flex h-[30%] items-center justify-between gap-3 border-t border-face-foreground/20 px-5"><span className="font-mono text-2xl tabular-nums sm:text-3xl">{now ? clockText(draft, now) : "--:--"}</span><div className="min-w-0 text-right"><p className="flex items-center justify-end gap-2 text-lg"><CloudSun className="size-5 shrink-0 text-chart-3" />{currentWeather ? `${Math.round(currentWeather.current.temperature_2m)}°C` : "—°C"}</p><p className="max-w-32 truncate text-xs">{draft.place.name}</p></div></div>
          </> : <div className="flex h-full flex-col items-center justify-around px-5 py-6 text-center"><p className="text-sm capitalize">{now ? new Intl.DateTimeFormat("sv-SE", { timeZone: draft.place.timezone, weekday: "long", day: "numeric", month: "long" }).format(now) : "—"}</p><p className={`font-mono tabular-nums ${draft.seconds ? "text-4xl sm:text-5xl" : "text-5xl sm:text-6xl"}`}>{now ? clockText(draft, now) : "--:--"}</p><div><p className="flex items-center justify-center gap-2"><CloudSun className="text-chart-3" />{currentWeather ? `${Math.round(currentWeather.current.temperature_2m)}°C · ${weatherLabel(currentWeather.current.weather_code)}` : "Väder ej hämtat"}</p><p className="mt-1 max-w-64 truncate text-xs">{draft.place.name}</p></div></div>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{currentWeather ? `${weatherStale(currentWeather) ? "Äldre väder" : "Hämtat"} ${new Date(currentWeather.fetchedAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}` : "Inget väder hämtat"}</p><Button variant="outline" size="sm" disabled={busy !== null} onClick={() => { void action("weather", async () => { const value = await fetchWeather(draft.place, signal()); setWeather({ place: placeKey, value }); }); }}>{busy === "weather" ? <Loader2 className="animate-spin" /> : <RefreshCw />}Hämta väder</Button></div>
        {currentWeather && <div className="grid grid-cols-3 gap-3 border-y py-3 text-sm"><div><p className="text-xs text-muted-foreground">Min / max</p>{Math.round(currentWeather.daily.temperature_2m_min[0] ?? 0)}° / {Math.round(currentWeather.daily.temperature_2m_max[0] ?? 0)}°</div><div><p className="text-xs text-muted-foreground">Regnrisk</p>{currentWeather.daily.precipitation_probability_max[0]}%</div><div><p className="text-xs text-muted-foreground">Vind</p>{Math.round(currentWeather.current.wind_speed_10m)} km/h</div></div>}
        <p className="text-xs text-muted-foreground">Källa: <a className="underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · vald ort skickas vid hämtning</p>
      </section>
    </div>
    <section className="space-y-4 border-t pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">På roboten</h3><Button variant="outline" disabled={busy !== null} onClick={() => { void action("status", async () => { setAppStatus(null); setCheckedAt(null); const status = await robot.apps(); setAppStatus(status); setCheckedAt(new Date()); }); }}><RefreshCw />Läs appstatus</Button></div>
      {appStatus && <div role="status" className="border-l-2 border-primary pl-3"><p className="font-medium">{appStatus.active ? `${apps.find(a => a.id === appStatus.id)?.name ?? "Klockapp"} · ${appStatus.mode === "fullscreen" ? "Helskärm" : "Widget"}${appStatus.suspended ? " · pausad" : ""}` : "Ingen app körs"}</p><p className="mt-1 text-xs text-muted-foreground">Avläst {checkedAt?.toLocaleTimeString("sv-SE")} · {appStatus.weather_remaining_ms > 0 ? "väder sparat tillfälligt" : "inget aktuellt väder"} · {appStatus.persistent ? `sparad på roboten${appStatus.saved_place ? ` (${appStatus.saved_place})` : ""}` : "inte sparad på roboten"}</p></div>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy !== null || now === null} onClick={() => { void action("start", async () => {
          const payload = robotAppRequest(draft, new Date(), currentWeather);
          setAppStatus(null); setCheckedAt(null);
          await robot.apps();
          const result = await robot.startApp(payload);
          if (!result.active || result.id !== draft.id || result.mode !== draft.mode) throw new Error("Roboten bekräftade inte appstarten.");
          const readback = await robot.apps();
          setAppStatus(readback); setCheckedAt(new Date());
          if (!readback.active || readback.id !== draft.id || readback.mode !== draft.mode) throw new Error("Appen startade men är inte längre aktiv. Läs appstatus igen.");
          toast.success("Klockappen körs på roboten.");
        }); }}>{busy === "start" ? <Loader2 className="animate-spin" /> : <Play />}Starta på roboten</Button>
        <Button variant="outline" disabled={busy !== null} onClick={() => { void action("stop", async () => { const result = await robot.stopApp(); if (result.active) throw new Error("Roboten bekräftade inte stoppet."); const readback = await robot.apps(); setAppStatus(readback); setCheckedAt(new Date()); if (readback.active) throw new Error("En app är fortfarande aktiv."); toast.success("Appen stoppad."); }); }}><Square />Stoppa app</Button>
        <Button variant="ghost" disabled={busy !== null || now === null} onClick={() => { void action("send", async () => { const response = await robot.showText(snapshotText(draft, new Date(), currentWeather)); if (response['ok'] !== true) throw new Error("Roboten bekräftade inte skärmvisningen."); toast.success("Textpanelen har skickats till roboten."); }); }}><Send />Visa textpanel en gång</Button>
      </div>
      <p className="text-sm text-muted-foreground">Klockappen kräver testversion v66 eller v67. Med v67 sparas appen på roboten när du startar den, och du kan sedan starta den själv på roboten: svep upp, svep åt vänster till Appar. Vädret behöver hämtas och skickas igen efter 30 minuter. v66 glömmer appen vid omstart.</p>
      <p className="text-sm text-muted-foreground">Helskärm avslutas av tryck, väckningsord eller annan aktivitet. Widgeten lämnar plats under samtal och återkommer därefter.</p>
    </section>
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    <FocusAppCard />
    </div></details>
  </div>;
}