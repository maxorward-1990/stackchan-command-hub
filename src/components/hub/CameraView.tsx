import { useEffect, useRef, useState } from "react";
import { useWebSerial } from "@/lib/web-serial";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, Crosshair, Expand, Play, Square } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { robot } from "@/lib/gemini-robot";

// Head limits match robot.look(): pan ±90°, tilt ±30°.
const PAN_STEP = 15, TILT_STEP = 8;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function CameraView() {
  const [src, setSrc] = useState("");
  const [err, setErr] = useState("");
  const [pos, setPos] = useState({ pan: 0, tilt: 0 });
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);

  const { connected: usb } = useWebSerial();
  const [usbOn, setUsbOn] = useState(false);
  const [usbFps, setUsbFps] = useState(0);
  // USB mode: fetch one frame at a time over the cable (no network at all).
  useEffect(() => {
    if (!usbOn || !usb) return;
    let alive = true;
    void (async () => {
      while (alive) {
        const t0 = performance.now();
        try {
          const f = await robot.cameraFrame();
          if (!alive) break;
          if (f.jpeg_base64) { setSrc(`data:image/jpeg;base64,${f.jpeg_base64}`); setErr(""); }
          setUsbFps(Math.round(10000 / (performance.now() - t0)) / 10);
        } catch (e) {
          if (!alive) break;
          setErr(`${(e as Error).message} – kräver firmware v28.`); setUsbOn(false); setSrc(""); break;
        }
      }
    })();
    return () => { alive = false; };
  }, [usbOn, usb]);
  useEffect(() => { if (!usb && usbOn) { setUsbOn(false); setSrc(""); } }, [usb, usbOn]);

  const start = () => { if (usb) { setErr(""); setUsbOn(true); return; } setErr(""); try { setSrc(robot.cameraStreamUrl()); } catch (e) { setErr((e as Error).message); } };
  const stop = () => { if (usbOn) { setUsbOn(false); setSrc(""); return; } setSrc(""); void robot.stopCameraStream().catch(() => {}); };
  const move = (pan: number, tilt: number) => {
    const next = { pan: clamp(pan, -90, 90), tilt: clamp(tilt, -30, 30) };
    setPos(next);
    void robot.look(next.pan, next.tilt, 500).catch((e: Error) => toast.error(e.message));
  };
  const snapshot = () => {
    const el = img.current;
    if (!el || !el.naturalWidth) { toast.error("Ingen bild att spara än."); return; }
    const c = document.createElement("canvas");
    c.width = el.naturalWidth; c.height = el.naturalHeight;
    try {
      c.getContext("2d")?.drawImage(el, 0, 0);
      const a = document.createElement("a");
      a.href = c.toDataURL("image/jpeg", 0.92);
      a.download = `stackchan-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`;
      a.click();
    } catch { toast.error("Webbläsaren tillät inte att spara bilden – ta en skärmdump istället."); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Camera className="size-5" />Livekamera</CardTitle>
          <CardDescription>Rösten pausas medan kameran sänder. Tryck på roboten för att stoppa direkt; den stänger själv efter 10 minuter.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div ref={box} className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-lg border bg-muted">
            {src ? (
              <img ref={img} src={src} crossOrigin={usbOn ? undefined : "anonymous"} alt="Direktbild från robotens kamera" className="size-full object-contain"
                onError={() => { if (usbOn) return; setSrc(""); setErr("Ingen ström. Kontrollera att v27 är flashad, att roboten är på Wi-Fi och att bryggan körs. Roboten vägrar också medan den pratar."); }} />
            ) : (
              <p className="px-6 text-center text-sm text-muted-foreground">Kameran är av.</p>
            )}
            {src && <span className="absolute left-2 top-2 rounded bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">● LIVE{usbOn ? ` · USB ${usbFps} bild/s` : ""}</span>}
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex flex-wrap gap-2">
            {src ? <Button variant="destructive" onClick={stop}><Square />Stoppa</Button> : <Button onClick={start}><Play />Starta kamera</Button>}
            <Button variant="outline" disabled={!src} onClick={snapshot}><Camera />Spara bild</Button>
            <Button variant="outline" disabled={!src} onClick={() => void box.current?.requestFullscreen?.()}><Expand />Helskärm</Button>
          </div>
          <p className="text-xs text-muted-foreground">{usb
            ? "USB anslutet: bilden hämtas direkt via kabeln, utan nätverk (ca 1–2 bilder/s, kräver v28)."
            : <>Wi-Fi-video via bryggan (<code className="font-mono">node tools/robot-proxy.mjs ROBOTENS-IP</code>). Anslut USB för att istället se kameran via kabeln utan nätverk.</>}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Styr huvudet</CardTitle><CardDescription>Fungerar via USB, Bluetooth eller bryggan.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="mx-auto grid w-48 grid-cols-3 gap-2">
            <span />
            <Button size="lg" variant="secondary" aria-label="Titta upp" onClick={() => move(pos.pan, pos.tilt + TILT_STEP)}><ArrowUp /></Button>
            <span />
            <Button size="lg" variant="secondary" aria-label="Titta vänster" onClick={() => move(pos.pan - PAN_STEP, pos.tilt)}><ArrowLeft /></Button>
            <Button size="lg" aria-label="Centrera" onClick={() => move(0, 0)}><Crosshair /></Button>
            <Button size="lg" variant="secondary" aria-label="Titta höger" onClick={() => move(pos.pan + PAN_STEP, pos.tilt)}><ArrowRight /></Button>
            <span />
            <Button size="lg" variant="secondary" aria-label="Titta ner" onClick={() => move(pos.pan, pos.tilt - TILT_STEP)}><ArrowDown /></Button>
            <span />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" onClick={() => move(-45, pos.tilt)}>Vänster 45°</Button>
            <Button size="sm" variant="outline" onClick={() => move(45, pos.tilt)}>Höger 45°</Button>
            <Button size="sm" variant="outline" onClick={() => move(0, -30)}>Ner mot bordet</Button>
            <Button size="sm" variant="outline" onClick={() => move(0, 20)}>Upp mot rummet</Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">Sida {pos.pan}° · höjd {pos.tilt}°</p>
        </CardContent>
      </Card>
    </div>
  );
}
