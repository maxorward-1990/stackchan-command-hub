import { useEffect, useMemo, useRef, useState } from "react";
import { Usb, Send, Trash2, Download, Mic, Activity, Search, Ear, Square, HelpCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { serialSupported, useWebSerial } from "@/lib/web-serial";
import { consoleCommand } from "@/lib/console-command";

const QUICK = [
  { cmd: "status", label: "Status", icon: Activity },
  { cmd: "mic", label: "Testa mic", icon: Mic },
  { cmd: "listen", label: "Lyssna", icon: Ear },
  { cmd: "stop", label: "Stoppa", icon: Square },
  { cmd: "help", label: "Hjälp", icon: HelpCircle },
];

function tone(line: string) {
  if (line.startsWith(">")) return "text-primary font-semibold";
  if (/error|fail|panic|ok=false|✗|\[E\]/i.test(line)) return "text-destructive";
  if (/toolCall|tool result|CMD/i.test(line)) return "text-accent-foreground";
  if (/mic level/.test(line)) return "text-muted-foreground/60";
  return "text-muted-foreground";
}

export function UsbConsole() {
  const s = useWebSerial();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [hideMic, setHideMic] = useState(true);
  const [filter, setFilter] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported(serialSupported()), []);

  const shown = useMemo(() => s.lines.filter((l) => !l.startsWith("> api #") && !l.startsWith("API #") && (!hideMic || !l.includes("mic level")) && (!filter || l.toLowerCase().includes(filter.toLowerCase()))), [s.lines, hideMic, filter]);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [shown.length]);

  const submit = (cmd: string) => { if (cmd.trim()) void s.send(cmd); };
  const download = () => {
    const url = URL.createObjectURL(new Blob([s.lines.join("\n")], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = `stackchan-logg-${new Date().toISOString().slice(0, 16)}.txt`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2"><Usb className="size-5" />USB-konsol</CardTitle>
            <CardDescription>Robotens händelser · USB</CardDescription>
          </div>
          {s.connected ? <Badge>Ansluten</Badge> : <Badge variant="outline">Inte ansluten</Badge>}
        </CardHeader>
        <CardContent className="space-y-3">
          {!supported && <p className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">USB fungerar bara i Chrome eller Edge på datorn, inte på telefonen.</p>}
          <div className="flex flex-wrap gap-2">
            {QUICK.map(({ cmd, label, icon: Icon }) => (
              <Button key={cmd} variant="secondary" size="sm" disabled={!s.connected} onClick={() => submit(cmd)}><Icon />{label}</Button>
            ))}
          </div>
          {s.error && <p className="text-sm text-destructive">{s.error}</p>}
          <div ref={box} className="h-[420px] overflow-y-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
            {shown.length ? shown.map((l, i) => <div key={i} className={tone(l)}>{l}</div>) : <p className="text-muted-foreground">Loggen visas här när roboten är ansluten.</p>}
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(consoleCommand(input)); setInput(""); }}>
            <Input aria-label="Fråga eller USB-kommando" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Fråga eller kommando, t.ex. search gotland" disabled={!s.connected} />
            <Button type="submit" disabled={!s.connected || !input.trim()}><Send />Skicka</Button>
          </form>
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Testa webbsökning</CardTitle></CardHeader>
          <CardContent>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(`search ${query.trim().replace(/^search\s+/i, "")}`); }}>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Sveriges befolkning" disabled={!s.connected} />
              <Button size="icon" type="submit" aria-label="Sök" disabled={!s.connected || !query.trim()}><Search /></Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Logg</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between"><Label htmlFor="hm">Dölj mic-nivårader</Label><Switch id="hm" checked={hideMic} onCheckedChange={setHideMic} /></div>
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrera, t.ex. toolCall" />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={download} disabled={!s.lines.length}><Download />Spara</Button>
              <Button variant="outline" size="sm" onClick={() => s.setLines([])}><Trash2 />Rensa</Button>
            </div>
            <p className="text-xs text-muted-foreground">Stäng Spacehuhn och ESP Tool först – bara ett fönster åt gången kan använda USB-porten.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
