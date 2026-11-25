import { useState } from "react";
import { MessagesSquare, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { robot } from "@/lib/gemini-robot";

/** Reads the robot's saved transcript (what it heard and answered) over USB/Bluetooth/bridge. */
export function DialogueLog() {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    try { const d = await robot.dialogues(); setText(d.dialogues_preview || "(tomt)"); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base"><MessagesSquare className="size-4" />Samtalslogg</CardTitle>
        <Button size="sm" variant="outline" onClick={load} disabled={busy}><RefreshCw className={busy ? "animate-spin" : ""} />Hämta</Button>
      </CardHeader>
      <CardContent>
        {text ? <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs">{text}</pre>
          : <p className="text-sm text-muted-foreground">Visar vad roboten hörde dig säga och vad den svarade, sparat i robotens minne.</p>}
      </CardContent>
    </Card>
  );
}
