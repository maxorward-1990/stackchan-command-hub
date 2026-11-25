import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Lightbulb, LightbulbOff, Plug, RefreshCw, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { robot, type HomeAction, type HomeDevice, type HomeResult, type LocalScene } from "@/lib/gemini-robot";
import { SceneEditor } from "./SceneEditor";
import { useRobotConnection } from "./RobotConnection";
import { tuyaKeyError } from "@/lib/robot-network";

const ERRORS: Record<string, string> = {
  tuya_keys_missing: "Inga Tuya-nycklar sparade på roboten.",
  smart_home_disabled: "Slå på \"Lampstyrning\" först.",
  tuya_sign_invalid_check_secret: "Tuya godkände inte nycklarna – kontrollera Access ID och Secret.",
  tuya_token_invalid: "Inloggningen mot Tuya gick ut – försök igen.",
  tuya_permission_denied: "Tuya-projektet saknar behörighet – kontrollera att Smart Life-kontot är länkat.",
  tuya_api_not_subscribed: "API-tjänsten IoT Core är inte aktiv i Tuya-projektet.",
  tuya_command_not_supported: "Enheten stöder inte det kommandot.",
  tuya_device_offline: "Enheten är offline.",
  tuya_clock_wrong: "Robotens klocka gick fel även efter omsynk – försök igen om en stund.",
  no_matching_scene: "Hittade ingen scen med det namnet.",
  no_scenes: "Inga scener sparade på roboten än.",
  tuya_home_id_missing: "Kunde inte hitta ditt Smart Life-hem.",
  no_matching_device: "Hittade ingen enhet med det namnet.",
  action_not_supported_by_device: "Gick inte på den enheten (t.ex. dimra ett uttag).",
  wifi_offline: "Roboten är inte på Wi-Fi.",
  voice_tool_in_progress: "Roboten håller på med ett röstkommando – vänta lite.",
  home_busy_or_invalid_request: "Upptagen med ett annat lampkommando.",
  invalid_tuya_keys: "Nycklarna har fel format.",
};
const explain = (e?: string) => (e ? ERRORS[e] ?? e : "Okänt fel");

export function SmartHomeCard({ enabled, hasKeys, onEnabled }: {
  enabled?: boolean | undefined; hasKeys?: boolean | undefined; onEnabled?: (v: boolean) => void;
}) {
  const connection = useRobotConnection();
  const [localEnabled, setLocalEnabled] = useState(enabled);
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [devices, setDevices] = useState<HomeDevice[] | null>(null);
  const [scenes, setScenes] = useState<LocalScene[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean | undefined>(hasKeys);
  const keysSet = saved ?? hasKeys;

  const runJob = async (label: string, body: Parameters<typeof robot.homeStart>[0]): Promise<HomeResult | null> => {
    setBusy(label); setStatus(null);
    try {
      await robot.homeStart(body);
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const r = await robot.homePoll();
        if (r.done) return r;
      }
      setStatus("Inget svar inom 40 sekunder."); return null;
    } catch (e) {
      const m = String((e as Error).message); const code = /"error":"([^"]+)"/.exec(m)?.[1];
      setStatus(code ? explain(code) : m); return null;
    } finally { setBusy(null); }
  };

  const list = async () => {
    try { const runtime = await robot.runtime(); setLocalEnabled(runtime.smart_home_enabled); setSaved(runtime.tuya_client_id === "set" && runtime.tuya_client_secret === "set"); }
    catch (e) { setStatus((e as Error).message); return; }
    const r = await runJob("list", { action: "list" });
    if (!r) return;
    if (r.ok && r.devices) {
      setDevices(r.devices);
      let sc: LocalScene[] = [];
      try { sc = (await robot.homeScenes()).scenes ?? []; } catch { /* firmware before v45 */ }
      setScenes(sc);
      setStatus(`${r.devices.length} enheter och ${sc.length} egna scener (${((r.duration_ms ?? 0) / 1000).toFixed(1)} s).`);
    }
    else setStatus(explain(r.error));
  };
  const control = async (target: string, action: HomeAction, extra: { brightness?: number } = {}) => {
    const r = await runJob(target + action, { action, target, ...extra });
    if (!r) return;
    const t = ((r.duration_ms ?? 0) / 1000).toFixed(1);
    if (r.ok && action === "scene") setStatus(`Scenen "${r.scene ?? target}" kördes: ${r.changed?.join(", ")} (${t} s)` + (r.failed?.length ? ` · misslyckades: ${r.failed.map((f) => `${f.name} (${explain(f.error)})`).join(", ")}` : ""));
    else if (r.ok) setStatus(`Klart: ${r.changed?.join(", ")} (${t} s)` + (r.failed?.length ? ` · misslyckades: ${r.failed.map((f) => `${f.name} (${explain(f.error)})`).join(", ")}` : ""));
    else setStatus(explain(r.failed?.[0]?.error ?? r.error));
  };
  const save = async () => {
    const err = tuyaKeyError(id, secret);
    if (err) { toast.error(err); return; }
    try {
      const r = await robot.saveTuyaKeys(id, secret);
      if (r.tuya_client_id !== "set" || r.tuya_client_secret !== "set") throw new Error("Nycklarna sparades inte.");
      setId(""); setSecret(""); setSaved(true); toast.success("Tuya-nycklar sparade på roboten – gäller direkt");
    } catch (e) { toast.error(String((e as Error).message)); }
  };
  const clear = async () => {
    try { await robot.clearTuyaKeys(); setSaved(false); setDevices(null); toast.success("Tuya-nycklar borttagna"); }
    catch (e) { toast.error(String((e as Error).message)); }
  };
  const toggle = async (v: boolean) => {
    try { await robot.saveRuntime({ smart_home_enabled: v }, false); setLocalEnabled(v); onEnabled?.(v); toast.success(v ? "Lampstyrning på" : "Lampstyrning av"); }
    catch (e) { toast.error(String((e as Error).message)); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="size-4" />Lampor (Smart Life / Tuya)</CardTitle>
        <CardDescription>
          Smart Life · egna scener sparade på roboten
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div><Label htmlFor="smart-home-enabled" className="text-sm">Lampstyrning</Label>
            <p className="text-xs text-muted-foreground">Av = Gemini får inte veta att lamporna finns.</p></div>
          <Switch id="smart-home-enabled" checked={!!localEnabled} disabled={localEnabled === undefined} onCheckedChange={(v) => void toggle(v)} />
        </div>
        <details className="border-b pb-3"><summary className="mb-3 cursor-pointer text-sm font-semibold">Anslut Smart Life · nycklar</summary>
        <p className="mb-3 text-sm">Nycklar: {keysSet === true ? "sparade ✓" : keysSet === false ? "saknas" : "hämta från roboten för att se"}</p>
        <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div><Label htmlFor="tuya-id" className="sr-only">Access ID</Label>
            <Input id="tuya-id" autoComplete="off" placeholder="Access ID / Client ID" value={id} onChange={(e) => setId(e.target.value)} /></div>
          <div><Label htmlFor="tuya-secret" className="sr-only">Access Secret</Label>
            <Input id="tuya-secret" type="password" autoComplete="off" placeholder="Access Secret" value={secret} onChange={(e) => setSecret(e.target.value)} /></div>
          <div className="flex gap-2">
            <Button type="submit" disabled={!id.trim() || !secret.trim()}><KeyRound />Spara</Button>
            {keysSet && <Button type="button" variant="outline" onClick={() => void clear()} aria-label="Ta bort nycklar"><Trash2 /></Button>}
          </div>
        </form>
        </details>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={!!busy} onClick={() => connection.requestConnection(() => void list())}><RefreshCw className={busy === "list" ? "animate-spin" : ""} />{connection.connected ? "Hämta enheter & scener" : "Anslut & hämta enheter"}</Button>
          <Button variant="outline" disabled={!!busy} onClick={() => void control("lights", "on")}><Lightbulb />Alla lampor på</Button>
          <Button variant="outline" disabled={!!busy} onClick={() => void control("lights", "off")}><LightbulbOff />Alla lampor av</Button>
        </div>
        {status && <p className="text-sm" role="status">{status}</p>}
        <SceneEditor devices={devices} scenes={scenes} setScenes={setScenes} busy={!!busy} run={(n) => void control(n, "scene")} />
        {devices && (
          <ul className="divide-y rounded-lg border">
            {devices.map((d) => (
              <li key={d.name} className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm">
                <span className="flex items-center gap-2">
                  {d.kind === "light" ? <Lightbulb className="size-4" /> : <Plug className="size-4" />}
                  {d.name}{!d.online && <span className="text-xs text-muted-foreground">(offline)</span>}
                </span>
                <span className="flex gap-1">
                  <Button size="sm" variant="outline" disabled={!!busy || !d.online} onClick={() => void control(d.name, "on")}>På</Button>
                  <Button size="sm" variant="outline" disabled={!!busy || !d.online} onClick={() => void control(d.name, "off")}>Av</Button>
                  {d.kind === "light" && <Button size="sm" variant="ghost" disabled={!!busy || !d.online} onClick={() => void control(d.name, "brightness", { brightness: 30 })}>30 %</Button>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
