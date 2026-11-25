import { useRef, useState } from "react";
import { Crosshair, Palette, Sparkles, Power, Rainbow, Hand, Smile, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { robot, EMOTIONS, GESTURES } from "@/lib/gemini-robot";

const COLORS = ["#ff3b30", "#ff9500", "#ffd60a", "#34c759", "#0abab5", "#0a84ff", "#bf5af2", "#ffffff"];
type LedMode = "auto" | "solid" | "off" | "rainbow" | "pulse";

const tryRun = (fn: () => Promise<unknown>) => { fn().catch((e: Error) => toast.error(e.message)); };

export function Hardware() {
  const [pan, setPan] = useState(0);
  const [tilt, setTilt] = useState(0);
  const [color, setColor] = useState("#0abab5");
  const [ledMode, setLedMode] = useState<LedMode>("auto");
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Send at most ~5 moves/s, always ending with the final position.
  const move = (p: number, t: number) => {
    setPan(p); setTilt(t);
    if (timer.current) clearTimeout(timer.current);
    const send = () => { last.current = Date.now(); tryRun(() => robot.look(p, t)); };
    const wait = 200 - (Date.now() - last.current);
    if (wait <= 0) send(); else timer.current = setTimeout(send, wait);
  };

  const pad = useRef<HTMLDivElement>(null);
  const onPad = (e: React.PointerEvent) => {
    if (e.buttons !== 1 && e.type !== "pointerdown") return;
    const r = pad.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = ((e.clientY - r.top) / r.height) * 2 - 1;
    move(Math.round(Math.max(-1, Math.min(1, x)) * 90), Math.round(-Math.max(-1, Math.min(1, y)) * 30));
  };
  const led = (m: LedMode, c = color) => { setLedMode(m); tryRun(() => robot.led(m, c)); };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:row-span-2">
        <CardHeader><CardTitle className="flex items-center gap-2"><Crosshair className="size-4" />Huvud (pan / tilt)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div ref={pad} onPointerDown={onPad} onPointerMove={onPad}
            className="relative aspect-[3/1.4] touch-none cursor-crosshair rounded-xl border bg-muted bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] [background-size:16px_16px]">
            <div className="absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-glow transition-all duration-75"
              style={{ left: `${((pan + 90) / 180) * 100}%`, top: `${((30 - tilt) / 60) * 100}%` }} />
          </div>
          <div className="space-y-1"><div className="flex justify-between text-xs text-muted-foreground"><span>Vänster / höger</span><span className="font-mono">{pan}°</span></div>
            <Slider min={-90} max={90} value={[pan]} onValueChange={([v]) => move(v ?? 0, tilt)} /></div>
          <div className="space-y-1"><div className="flex justify-between text-xs text-muted-foreground"><span>Upp / ner</span><span className="font-mono">{tilt}°</span></div>
            <Slider min={-30} max={30} value={[tilt]} onValueChange={([v]) => move(pan, v ?? 0)} /></div>
          <Button variant="secondary" onClick={() => { setPan(0); setTilt(0); tryRun(robot.home); }}><RotateCcw />Hemläge</Button>
          <div><p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground"><Hand className="size-3" />Gester</p>
            <div className="flex flex-wrap gap-1.5">{GESTURES.map(([g, l]) => <Button key={g} size="sm" variant="secondary" onClick={() => tryRun(() => robot.gesture(g))}>{l}</Button>)}</div></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Smile className="size-4" />Ansikte</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {EMOTIONS.map(([e, l]) => <Button key={e} size="sm" variant="outline" onClick={() => tryRun(() => robot.emotion(e))}>{l}</Button>)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Palette className="size-4" />Lampor (12×)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-center gap-1.5">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} className={`size-4 rounded-full ${ledMode === "pulse" ? "animate-pulse" : ""}`}
                style={{ background: ledMode === "off" || ledMode === "auto" ? "var(--muted)" : ledMode === "rainbow" ? `hsl(${i * 30} 90% 55%)` : color }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button key={c} aria-label={`Färg ${c}`} onClick={() => { setColor(c); led(ledMode === "pulse" ? "pulse" : "solid", c); }}
                className={`size-7 rounded-full border-2 ${color === c ? "border-foreground" : "border-border"}`} style={{ background: c }} />
            ))}
            <input type="color" aria-label="Egen färg" value={color} onChange={(e) => { setColor(e.target.value); led("solid", e.target.value); }} className="size-7 rounded" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => led("pulse")}><Sparkles />Puls</Button>
            <Button size="sm" variant="outline" onClick={() => led("rainbow")}><Rainbow />Regnbåge</Button>
            <Button size="sm" variant="outline" onClick={() => led("off")}><Power />Släck</Button>
            <Button size="sm" variant={ledMode === "auto" ? "default" : "outline"} onClick={() => led("auto")}>Följ ansiktet</Button>
          </div>
          <p className="text-xs text-muted-foreground">"Följ ansiktet" låter roboten själv styra lamporna efter humör igen.</p>
        </CardContent>
      </Card>
    </div>
  );
}
