import { useEffect, useState } from "react";
import type { Personality, PersonalityState } from "@/lib/gemini-robot";

// Browser replica of the robot's 320×240 face (EmotionController::renderFace), so owners can
// try colours and states before saving. Colours here are the device's own screen colours.
export const DEFAULT_EYE: Record<PersonalityState, string> = {
  neutral: "#00FFFF", listening: "#87CEEB", thinking: "#FFFF00", speaking: "#ADFF2F",
  happy: "#FFFF00", angry: "#FF0000", sleep: "#808080",
};
const DEFAULT_LED: Record<PersonalityState, string> = {
  neutral: "#3C0078", listening: "#0078FF", thinking: "#F5F5F5", speaking: "#00C850",
  happy: "#FFDC00", angry: "#C80000", sleep: "#14143C",
};

export function parseLed(v: string, state: PersonalityState): { color: string; pulse: boolean } {
  if (v === "off") return { color: "#000000", pulse: false };
  const [kind, hex] = v.split(":");
  if ((kind === "solid" || kind === "pulse") && hex) return { color: hex, pulse: kind === "pulse" };
  return { color: DEFAULT_LED[state], pulse: state === "listening" || state === "sleep" };
}

export function FaceSimulator({ p, state, subtitle, asleepDark }: { p: Personality; state: PersonalityState; subtitle?: string; asleepDark?: boolean }) {
  const [t, setT] = useState(0);
  useEffect(() => { const id = setInterval(() => setT((x) => x + 1), 90); return () => clearInterval(id); }, []);
  const eyeSetting = p.eye[state];
  const eye = eyeSetting && eyeSetting !== "default" ? eyeSetting : DEFAULT_EYE[state];
  const led = parseLed(p.led[state] ?? "default", state);
  const k = led.pulse ? 0.35 + 0.65 * Math.abs(Math.sin(t / 6)) : 1;
  const bright = (state === "sleep" ? p.sleep_brightness : p.awake_brightness) / 255;
  const dark = asleepDark || (state === "sleep" && !p.sleep_face);
  const panel = !!subtitle && p.subtitles && state === "speaking";
  const cy = panel ? (240 - 70) / 2 : 120;
  const cx = 160, ey = cy - 26, lx = cx - 58, rx = cx + 58;
  const tri = (ph: number, a: number) => { const v = ph % 256; const w = v < 128 ? v : 255 - v; return (w * 2 * a) / 255 - a; };
  const pdx = state === "listening" ? tri(t * 6, 10) : state === "thinking" ? tri(t * 4, 14) : tri(t * 3, 4);
  const closed = state === "sleep" || (state === "neutral" && t % 40 === 0);
  const mouthH = state === "speaking" ? ([8, 28, 14, 36, 10, 24][t % 6] ?? 8) : 6;
  return <div className="w-full max-w-[400px]">
    <div className="rounded-lg border bg-muted p-4">
      <div className="mb-3 flex justify-between gap-8" aria-label="Två LED-ramper på ovansidan">
        {[0, 1].map((bar) => <div key={bar} className="flex flex-1 gap-1 rounded border p-1">
          {Array.from({ length: 6 }, (_, i) => <span key={i} aria-hidden className="h-2 flex-1 rounded-sm"
            style={{ background: led.color, opacity: led.color === "#000000" ? 0.15 : k }} />)}
        </div>)}
      </div>
      <svg viewBox="0 0 320 240" role="img" aria-label={`Förhandsvisning av robotens skärm: ${state}`} className="block w-full rounded-md" style={{ background: "#000" }}>
        {!dark && <g opacity={Math.max(0.15, bright)}>
          {closed ? <><rect x={lx - 24} y={ey - 2} width={48} height={5} fill={eye} /><rect x={rx - 24} y={ey - 2} width={48} height={5} fill={eye} /></>
            : <><circle cx={lx} cy={ey} r={25} fill={eye} /><circle cx={rx} cy={ey} r={25} fill={eye} />
              <circle cx={lx + pdx} cy={ey} r={10} fill="#000" /><circle cx={rx + pdx} cy={ey} r={10} fill="#000" /></>}
          {(p.cheeks ?? true) && <><circle cx={cx - 92} cy={cy + 22} r={5} fill={eye} /><circle cx={cx + 92} cy={cy + 22} r={5} fill={eye} /></>}
          {(p.eyebrows ?? true) && state === "angry" && <><line x1={lx - 28} y1={ey - 36} x2={lx + 18} y2={ey - 24} stroke={eye} strokeWidth={2} /><line x1={rx - 18} y1={ey - 24} x2={rx + 28} y2={ey - 36} stroke={eye} strokeWidth={2} /></>}
          {(p.eyebrows ?? true) && state === "thinking" && <><line x1={lx - 22} y1={ey - 34} x2={lx + 18} y2={ey - 38} stroke={eye} /><line x1={rx - 18} y1={ey - 38} x2={rx + 22} y2={ey - 34} stroke={eye} /></>}
          {(p.eyebrows ?? true) && state === "listening" && <><rect x={lx - 20} y={ey - 44} width={40} height={5} fill={eye} /><rect x={rx - 20} y={ey - 44} width={40} height={5} fill={eye} /></>}
          {(p.listening_waves ?? true) && state === "listening" && [0, 1, 2].map((r) => <g key={r}><circle cx={cx - 132} cy={cy + 20} r={10 + r * 9 + tri(t * 4, 6)} stroke={eye} fill="none" /><circle cx={cx + 132} cy={cy + 20} r={10 + r * 9 + tri(t * 4, 6)} stroke={eye} fill="none" /></g>)}
          {(p.status_text ?? true) && ["listening", "thinking", "speaking"].includes(state) && <text x={cx} y={16} textAnchor="middle" fill={eye} fontSize={14}>{state === "listening" ? "LYSSNAR" : state === "speaking" ? "SVARAR" : "VÄNTA..."}</text>}
          {state === "happy" ? <path d={`M ${cx - 46} ${cy + 40} Q ${cx} ${cy + 70} ${cx + 46} ${cy + 40}`} stroke={eye} strokeWidth={7} fill="none" />
            : state === "angry" ? <path d={`M ${cx - 36} ${cy + 56} Q ${cx} ${cy + 34} ${cx + 36} ${cy + 56}`} stroke={eye} strokeWidth={6} fill="none" />
            : <rect x={cx - (state === "speaking" ? 35 : 22)} y={cy + 44 - mouthH / 2} width={state === "speaking" ? 70 : 44} height={mouthH} rx={3} fill={eye} />}
          {panel && <g><rect x={0} y={170} width={320} height={70} fill="#000" /><line x1={0} y1={170} x2={320} y2={170} stroke="#444" />
            <foreignObject x={8} y={174} width={304} height={62}><p style={{ color: "#fff", font: "13px/17px monospace", margin: 0, overflow: "hidden" }}>{subtitle}</p></foreignObject></g>}
        </g>}
      </svg>
    </div>
  </div>;
}
