import { useState } from "react";
import { Wifi, RefreshCw, Power } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { robot } from "@/lib/gemini-robot";
import { wifiError } from "@/lib/robot-network";

export function WifiCard() {
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const load = async () => {
    setBusy(true); setFailed(false);
    try { const r = await robot.runtime(); setStatus(`${r.wifi_enabled ? "Wi-Fi på" : "Wi-Fi av"} · nätverk ${r.wifi_ssid === "set" ? "sparat" : "saknas"} · lösenord ${r.wifi_password === "set" ? "sparat" : "saknas"}`); }
    catch (e) { setFailed(true); setStatus((e as Error).message); }
    finally { setBusy(false); }
  };
  const save = async () => {
    const error = wifiError(ssid, password);
    if (error) { setFailed(true); setStatus(error); return; }
    setBusy(true); setFailed(false); setStatus("Sparar på roboten…");
    try { await robot.changeWifi(ssid, password); setPassword(""); setStatus("Sparat – roboten startar om. Återanslut USB/Bluetooth; via bryggan behöver du robotens nya IP-adress."); }
    catch (e) { setFailed(true); setStatus((e as Error).message); }
    finally { setBusy(false); }
  };
  return <Card>
    <CardHeader className="flex-row items-center justify-between"><CardTitle className="flex items-center gap-2 text-base"><Wifi className="size-4" />Wi-Fi på roboten</CardTitle>
      <Button size="icon" variant="ghost" disabled={busy} onClick={() => void load()} aria-label="Läs Wi-Fi-status" title="Läs Wi-Fi-status"><RefreshCw className="size-4" /></Button></CardHeader>
    <CardContent className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="robot-wifi-ssid">Nätverksnamn (SSID)</Label><Input id="robot-wifi-ssid" value={ssid} onChange={(e) => setSsid(e.target.value)} autoComplete="off" disabled={busy} /></div>
          <div className="space-y-1"><Label htmlFor="robot-wifi-password">Wi-Fi-lösenord</Label><Input id="robot-wifi-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" disabled={busy} /></div>
        </div>
        <p className="text-xs text-muted-foreground">2,4 GHz · WPA/WPA2. Lösenordet sparas bara på roboten. Använd helst USB vid nätverksbyte; nuvarande nätverksanslutning bryts vid omstart.</p>
        <Button type="submit" disabled={busy || !ssid.trim() || !password}><Power className="size-4" />{busy ? "Vänta…" : "Byt Wi-Fi och starta om"}</Button>
      </form>
      {status && <p role="status" className={`text-sm ${failed ? "text-destructive" : "text-muted-foreground"}`}>{status}</p>}
    </CardContent>
  </Card>;
}