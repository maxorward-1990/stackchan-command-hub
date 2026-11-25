import { useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { robot } from "@/lib/gemini-robot";
import { isWithdrawnVersion, LATEST } from "@/lib/firmware-releases";

type S = Record<string, unknown>;
const fmtUptime = (ms: number) => { const m = Math.floor(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

/** Works over USB or the bridge – same /api/status call. */
export function RobotStatus() {
  const [s, setS] = useState<S | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    try { setS(await robot.status()); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const num = (k: string) => (typeof s?.[k] === "number" ? (s[k] as number) : null);
  const mv = num("battery_mv"); const ma = num("battery_ma"); const up = num("uptime_ms"); const heap = num("free_heap");
  const obj = (k: string) => (s?.[k] && typeof s[k] === "object" ? (s[k] as Record<string, unknown>) : {});
  const power = obj("power"); const motion = obj("motion"); const clock = obj("clock");
  const pct = typeof power["battery_percent"] === "number" && (power["battery_percent"] as number) >= 0 ? `${power["battery_percent"]} %` : null;
  const stateSv: Record<string, string> = { charging: "laddar", usb: "på USB", ok: "ok", low: "lågt", critical: "kritiskt", unknown: "okänt" };
  const motionSv: Record<string, string> = { tap: "knack", lifted: "upplyft", tipped: "vält", upright: "upprätt", none: "–" };
  const rows: [string, string][] = s ? [
    ["Firmware", isWithdrawnVersion(String(s["firmware_version"] ?? "")) ? `${String(s["firmware_version"])} – tillbakadragen, flasha ${LATEST.version}` : String(s["firmware_version"] ?? "–")],
    ["Batteri", pct ? `${pct} · ${stateSv[String(power["state"])] ?? "–"}` : mv ? `${(mv / 1000).toFixed(2)} V${ma !== null ? ` · ${ma} mA` : ""}` : "–"],
    ["Rörelse", motion["available"] ? `${motionSv[String(motion["last"])] ?? "–"} · ${Number(motion["taps"] ?? 0)} knack` : "–"],
    ["Klocka", typeof clock["utc"] === "string" ? new Date(clock["utc"] as string).toLocaleString("sv-SE") : clock["rtc_available"] ? "inte satt" : "–"],
    ["IP", String(s["wifi_ip"] ?? "–")],
    ["Igång", up !== null ? fmtUptime(up) : "–"],
    ["Ledigt minne", heap !== null ? `${Math.round(heap / 1024)} KB` : "–"],
  ] : [];
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base"><Activity className="size-4" />Status</CardTitle>
        <Button size="sm" variant="outline" onClick={load} disabled={busy}><RefreshCw className={busy ? "animate-spin" : ""} />Läs status</Button>
      </CardHeader>
      <CardContent>
        {s ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            {rows.map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-mono">{v}</dd></div>)}
          </dl>
        ) : null}
        {s && isWithdrawnVersion(String(s["firmware_version"] ?? "")) && (
          <Button asChild className="mt-3 w-full"><Link to="/firmware/">Återställ till {LATEST.version}</Link></Button>
        )}
        {!s && <p className="text-sm text-muted-foreground">Tryck "Läs status" (via USB eller bryggan).</p>}
      </CardContent>
    </Card>
  );
}
