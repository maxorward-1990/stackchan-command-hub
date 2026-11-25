import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Cpu, History, LifeBuoy, ShieldCheck, Usb } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useLocal } from "@/lib/use-local";
import { useWebSerial } from "@/lib/web-serial";
import { robot } from "@/lib/gemini-robot";
import { RELEASES, OFFERED, LATEST, RESTORE, HISTORY_KEY, addHistory, flashPlan, isWithdrawnVersion, type FlashRecord, type Release } from "@/lib/firmware-releases";

export function Firmware() {
  const [history, setHistory] = useLocal<FlashRecord[]>(HISTORY_KEY, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [reported, setReported] = useState<string>("");
  const usb = useWebSerial();
  const lastOk = history.find((h) => h.ok);

  const flash = async (r: Release) => {
    if (r.experimental && !confirm(`${r.version} är en testversion och ännu inte provad på din robot. v61 finns kvar som stabil återställning. Installera testversionen?`)) return;
    if (r.kind === "recovery" && !confirm("Grundbilden skriver till 0x0 och ska bara användas om roboten inte startar alls. Inställningar behålls. Fortsätta?")) return;
    setBusy(r.id); setPct(0); setLog([]);
    const add = (m: string) => setLog((l) => [...l, m].slice(-200));
    try {
      const { flashRelease } = await import("@/lib/flasher");
      await flashRelease(r, add, setPct);
      setHistory((h) => addHistory(h, { id: r.id, version: r.version, at: new Date().toISOString(), ok: true }));
      toast.success(`${r.version} flashad. Dra ur USB-sladden och sätt i den igen.`, { duration: 15000 });
      add("Klart. Dra ur USB-sladden och sätt i den igen så startar den nya versionen. Vänta ~10 s och klicka sedan \"Läs version från roboten\".");
    } catch (e) {
      const msg = (e as Error).message;
      add("FEL: " + msg);
      if (!/No port selected/i.test(msg)) setHistory((h) => addHistory(h, { id: r.id, version: r.version, at: new Date().toISOString(), ok: false, error: msg.slice(0, 160) }));
      toast.error(/No port selected/i.test(msg) ? "Ingen port vald." : /open|busy/i.test(msg) ? "Porten är upptagen – stäng ESP Tool/Spacehuhn och försök igen." : msg);
    } finally { setBusy(null); }
  };

  const readVersion = async (silent = false) => {
    try {
      if (!usb.connected) { if (silent) return; await usb.connect(); }
      const s = await robot.status() as { firmware_version?: string };
      const v = s.firmware_version ?? "okänd";
      setReported(v);
      setHistory((h) => h.length && h[0]?.ok ? [{ ...h[0], reportedVersion: v }, ...h.slice(1)] : h);
      if (!silent) toast.success(`Roboten kör ${v}`);
    } catch (e) { if (!silent) toast.error((e as Error).message); }
  };

  // Ask the robot itself whenever USB is connected; browser history is per-browser and can be stale.
  useEffect(() => {
    if (!usb.connected || busy) return;
    const t = setTimeout(() => void readVersion(true), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usb.connected, busy]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Cpu className="size-5" />Uppdatera roboten</CardTitle>
          <CardDescription>Flasha direkt härifrån via USB-kabeln. Wi-Fi, Gemini-nyckel och prompts ligger kvar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <span>Uppdateringar skrivs alltid till rätt adress (0x10000), raderar aldrig och kontrolleras före och efter.</span>
          </div>
          {reported ? (
            isWithdrawnVersion(reported) ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
                <AlertTriangle className="mt-0.5 size-4 text-destructive" />
                <div className="flex-1 space-y-2">
                  <span className="block"><b>Roboten kör just nu {reported}</b> – en tillbakadragen version.</span>
                  <Button className="w-full" disabled={!!busy} onClick={() => void flash(RESTORE)}>
                    {busy === RESTORE.id ? `Återställer… ${pct}%` : `Återställ till ${RESTORE.version} nu`}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-accent bg-accent/30 p-3">
                <CheckCircle2 className="mt-0.5 size-4 text-accent-foreground" />
                <span><b>Roboten kör just nu {reported}</b>{reported === LATEST.version ? " – den stabila versionen." : "."}</span>
              </div>
            )
          ) : (
            <p className="text-muted-foreground">Anslut USB så läser appen av vilken version roboten faktiskt kör.</p>
          )}
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>Senast flashad från den här webbläsaren:</span>
            <span>{lastOk ? `${lastOk.version} (${new Date(lastOk.at).toLocaleString("sv-SE")})` : "ingen"}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void readVersion()} disabled={!!busy}><Usb />Läs version från roboten</Button>
          <p className="text-xs text-muted-foreground">Kräver Chrome eller Edge på datorn. Stäng ESP Tool och Spacehuhn först – de använder samma kabelport. När flashningen är klar: dra ur USB-sladden och sätt i den igen, annars startar inte den nya versionen ordentligt.</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {OFFERED.filter((r) => r.kind === "app").map((r) => (
          <Card key={r.id} className={r.id === LATEST.id ? "border-primary/50" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span>{r.version}</span>
                {r.id === LATEST.id ? <Badge>Stabil (rekommenderad)</Badge> : <Badge variant="outline">{r.id === RESTORE.id ? "Säker återställning" : r.experimental ? "Testversion · appar" : "Äldre"}</Badge>}
              </CardTitle>
              <CardDescription>{r.date} · {(r.size / 1024 / 1024).toFixed(1)} MB · 0x{flashPlan(r).address.toString(16)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="list-disc pl-5 text-sm text-muted-foreground">{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>
              <Button className="w-full" variant={r.id === LATEST.id ? "default" : "secondary"} disabled={!!busy} onClick={() => void flash(r)}>
                {busy === r.id ? `Flashar… ${pct}%` : r.experimental ? "Installera testversion" : r.id === LATEST.id ? "Flasha" : "Gå tillbaka till denna"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {(busy || log.length > 0) && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Förlopp</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Progress value={pct} />
            <pre className="max-h-56 overflow-y-auto rounded-md bg-muted p-2 font-mono text-xs">{log.join("\n")}</pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><History className="size-4" />Historik</CardTitle></CardHeader>
        <CardContent>
          {history.length === 0 ? <p className="text-sm text-muted-foreground">Inget flashat från den här webbläsaren än.</p> : (
            <ul className="space-y-1 text-sm">{history.map((h) => (
              <li key={h.at} className="flex flex-wrap gap-2">
                <span className="font-mono text-xs text-muted-foreground">{new Date(h.at).toLocaleString("sv-SE")}</span>
                <span className="font-medium">{h.version}</span>
                {h.ok ? <Badge variant="secondary">OK</Badge> : <Badge variant="destructive">Misslyckades</Badge>}
                {h.reportedVersion && <span className="text-muted-foreground">rapporterar {h.reportedVersion}</span>}
                {h.error && <span className="text-destructive">{h.error}</span>}
              </li>))}</ul>)}
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><LifeBuoy className="size-4" />Nödläge: roboten startar inte</CardTitle>
          <CardDescription>Bara vid svart skärm eller "Invalid image" i loggen. Lägger grundbilden på 0x0; flasha den rekommenderade versionen direkt efteråt.</CardDescription></CardHeader>
        <CardContent><Button variant="destructive" size="sm" disabled={!!busy} onClick={() => { const r = RELEASES.find((x) => x.kind === "recovery"); if (r) void flash(r); }}>Återställ grundbild</Button></CardContent>
      </Card>
    </div>
  );
}
