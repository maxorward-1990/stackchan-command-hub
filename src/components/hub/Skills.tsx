import { useEffect, useRef, useState } from "react";
import * as Icons from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useLocal } from "@/lib/use-local";
import { robot, GESTURES } from "@/lib/gemini-robot";

type Note = { id: string; text: string; tag: string; at: string };
// Custom skill instruction: one command per line, e.g. "face happy", "led pulse #ff0000", "servo 30 10", "wait 500", "seq robyn", "say Hej"
type Custom = { id: string; title: string; icon: string; instruction: string };
const ICONS = ["Zap", "Star", "Heart", "Smile", "Bell", "Rocket", "Coffee", "Hand", "Bot", "Megaphone"];

type LedMode = "auto" | "solid" | "off" | "rainbow" | "pulse";
const LED_MODES: LedMode[] = ["auto", "solid", "off", "rainbow", "pulse"];
// Old skill names mapped onto what our firmware supports.
const FACE_ALIAS: Record<string, string> = { neutral: "neutral", happy: "happy", angry: "angry", looking: "looking", sleep: "sleep", sleepy: "sleep", focused: "looking", surprised: "happy", sad: "neutral" };
const SEQ_ALIAS: Record<string, string[]> = {
  nod: ["nod_yes"], shake: ["shake_no"], look: ["look_left", "look_right", "center_head"],
  robyn: ["look_left", "look_right", "nod_yes", "curious_tilt", "look_left", "look_right", "center_head"],
};
const GESTURE_IDS: string[] = GESTURES.map(([g]) => g);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Same commands over USB or the bridge – everything goes through the gemini-robot client. */
export async function runInstruction(text: string) {
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [cmd = "", ...a] = line.split(/\s+/);
    try {
      if (cmd === "face") await robot.emotion(FACE_ALIAS[a[0] ?? ""] ?? "neutral");
      else if (cmd === "led") await robot.led(LED_MODES.includes(a[0] as LedMode) ? (a[0] as LedMode) : "solid", a[1] ?? "#ffffff");
      else if (cmd === "servo") await robot.look(Number(a[0]) || 0, Number(a[1]) || 0);
      else if (cmd === "home") await robot.home();
      else if (cmd === "gesture" && a[0] && GESTURE_IDS.includes(a[0])) await robot.gesture(a[0]);
      else if (cmd === "wait") await sleep(Math.min(10000, Number(a[0]) || 0));
      else if (cmd === "seq" && a[0] && SEQ_ALIAS[a[0]]) { for (const g of SEQ_ALIAS[a[0]] ?? []) { await robot.gesture(g); await sleep(700); } }
      else if (cmd === "say") await robot.speak(a.join(" "));
      else if (cmd === "ask") await robot.say(a.join(" "));
      else if (cmd === "show") await robot.showText(a.join(" "));
      else { toast.error(`Okänt kommando: ${line}`); return; }
    } catch (e) { toast.error(`${line}: ${(e as Error).message}`); return; }
  }
}

export function Skills() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Notes />
      <Focus />
      <CustomSkills />
    </div>
  );
}

function Notes() {
  const [notes, setNotes] = useLocal<Note[]>("sc.notes", []);
  const [hook, setHook] = useLocal("sc.webhook", "");
  const [text, setText] = useState("");
  const [tag, setTag] = useState<"Anteckning" | "Jobb">("Anteckning");
  const add = async () => {
    if (!text.trim()) return;
    const n: Note = { id: crypto.randomUUID(), text: text.trim(), tag, at: new Date().toISOString() };
    setNotes([n, ...notes]); setText(""); robot.emotion("happy").catch(() => {});
    if (hook) {
      try { await fetch(hook, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(n) }); toast.success("Skickad till webhook"); }
      catch { toast.error("Webhook misslyckades"); }
    }
  };
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Icons.NotebookPen className="size-4" />Ta en anteckning</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <div className="flex gap-2">
          {(["Anteckning", "Jobb"] as const).map((t) => <Button key={t} size="sm" variant={tag === t ? "default" : "outline"} onClick={() => setTag(t)}>{t}</Button>)}
        </div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Skriv här…" />
        <div className="flex gap-2"><Input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="Webhook-URL (valfri, t.ex. Zapier/Make)" /><Button onClick={add}>Spara</Button></div>
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {notes.map((n) => (
            <div key={n.id} className="group rounded-lg border p-2 text-sm">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{n.tag} · {new Date(n.at).toLocaleString("sv-SE")}</span>
                <span className="flex gap-1">
                  <button aria-label="Kopiera" onClick={() => { navigator.clipboard.writeText(n.text); toast.success("Kopierad"); }}><Icons.Copy className="size-3.5" /></button>
                  <button aria-label="Ta bort" onClick={() => setNotes(notes.filter((x) => x.id !== n.id))}><Icons.Trash2 className="size-3.5" /></button>
                </span>
              </div>
              <p className="whitespace-pre-wrap">{n.text}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Focus() {
  const q = (p: Promise<unknown>) => { p.catch(() => {}); };
  const [mins, setMins] = useState(25);
  const [left, setLeft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const stop = (done = false) => {
    clearInterval(timer.current); setLeft(null);
    q(robot.led(done ? "rainbow" : "auto")); q(robot.emotion(done ? "happy" : "neutral"));
    if (done) { toast.success("Fokuspass klart!"); q(robot.gesture("nod_yes")); }
  };
  const start = () => {
    const end = Date.now() + mins * 60000;
    setLeft(mins * 60); q(robot.led("solid", "#ff3b30")); q(robot.emotion("looking"));
    timer.current = setInterval(() => {
      const s = Math.round((end - Date.now()) / 1000);
      if (s <= 0) stop(true); else setLeft(s);
    }, 1000);
  };
  useEffect(() => () => clearInterval(timer.current), []);
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Icons.Timer className="size-4" />Fokus-timer (Stör ej)</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-center">
        <p className="font-mono text-5xl tabular-nums">{left === null ? `${String(mins).padStart(2, "0")}:00` : `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`}</p>
        <div className="flex justify-center gap-2">
          {[15, 25, 50].map((m) => <Button key={m} size="sm" variant={mins === m ? "default" : "outline"} disabled={left !== null} onClick={() => setMins(m)}>{m} min</Button>)}
        </div>
        {left === null ? <Button onClick={start}><Icons.Play />Starta fokuspass</Button> : <Button variant="destructive" onClick={() => stop()}><Icons.Square />Avbryt</Button>}
      </CardContent>
    </Card>
  );
}

function CustomSkills() {
  const [skills, setSkills] = useLocal<Custom[]>("sc.skills", [
    { id: "robyn", title: "Dansa som Robyn", icon: "Music", instruction: "seq robyn\nsay Dancing on my own!" },
    { id: "hej", title: "Säg hej", icon: "Hand", instruction: "face happy\nled pulse #ffd60a\nseq nod\nsay Hej Max!" },
  ]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", icon: "Zap", instruction: "" });
  const [running, setRunning] = useState<string | null>(null);
  const save = () => {
    if (!form.title.trim() || !form.instruction.trim()) { toast.error("Rubrik och instruktion krävs"); return; }
    setSkills([...skills, { id: crypto.randomUUID(), ...form }]); setForm({ title: "", icon: "Zap", instruction: "" }); setOpen(false);
  };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Icons.Blocks className="size-4" />Egna snabbkommandon</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Icons.Plus />Ny</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nytt snabbkommando</DialogTitle></DialogHeader>
            <Input placeholder="Rubrik" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div className="flex flex-wrap gap-2">
              {ICONS.map((i) => { const I = (Icons as unknown as Record<string, Icons.LucideIcon>)[i] ?? Icons.Zap; return (
                <Button key={i} size="icon" variant={form.icon === i ? "default" : "outline"} onClick={() => setForm({ ...form, icon: i })}><I /></Button>); })}
            </div>
            <Textarea rows={6} className="font-mono text-xs" value={form.instruction} onChange={(e) => setForm({ ...form, instruction: e.target.value })}
              placeholder={"face happy\nled pulse #ff0000\nservo 30 10\nwait 500\nseq robyn\nsay Hej"} />
            <p className="text-xs text-muted-foreground">Kommandon: face (neutral/happy/angry/looking/sleep), led (solid/pulse/rainbow/off/auto + #färg), servo pan tilt, home, gesture (nod_yes, shake_no, curious_tilt…), seq (nod/look/shake/robyn), wait ms, say text, ask fråga, show text. Fungerar via USB eller bryggan.</p>
            <Button onClick={save}>Spara snabbkommando</Button>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {skills.map((s) => {
          const I = (Icons as unknown as Record<string, Icons.LucideIcon>)[s.icon] ?? Icons.Zap;
          return (
            <div key={s.id} className="group relative">
              <Button variant="secondary" className="h-20 w-full flex-col" disabled={running !== null}
                onClick={async () => { setRunning(s.id); await runInstruction(s.instruction); setRunning(null); }}>
                {running === s.id ? <Icons.Loader2 className="animate-spin" /> : <I />}<span className="text-xs">{s.title}</span>
              </Button>
              <button aria-label="Ta bort" className="absolute right-1 top-1 hidden group-hover:block" onClick={() => setSkills(skills.filter((x) => x.id !== s.id))}><Icons.X className="size-3.5" /></button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
