import { useState } from "react";
import { toast } from "sonner";
import { ListTodo, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { robot, type TodoItem, type TodoResponse } from "@/lib/gemini-robot";
import { useRobotConnection } from "./RobotConnection";

const ERRORS: Record<string, string> = {
  todo_list_full: "Listan är full (max 30). Rensa avklarade först.",
  empty_text: "Skriv något först.",
  todo_not_found: "Hittade inte punkten.",
  storage_write_failed: "Roboten kunde inte spara listan.",
};

export function TodoCard() {
  const connection = useRobotConnection();
  const [items, setItems] = useState<TodoItem[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<TodoResponse>) => {
    setBusy(true);
    try {
      const r = await fn();
      if (r.items) setItems(r.items);
      if (!r.ok && r.error) toast.error(ERRORS[r.error] ?? r.error);
    } catch (e) {
      const msg = String((e as Error).message);
      toast.error(msg.includes("404") && items === null ? "Roboten känner inte till listan – flasha v29." : msg);
    } finally { setBusy(false); }
  };

  const open = items?.filter((i) => !i.done).length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ListTodo className="size-4" />Att göra (på roboten)</CardTitle>
        <CardDescription>
          Samma lista som när du säger "skriv upp att…" till roboten. Sparas bara på roboten (kräver v29 och att Minne är på).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => connection.requestConnection(() => void run(() => robot.todos()))}><RefreshCw />{connection.connected ? "Hämta från roboten" : "Anslut & hämta listan"}</Button>
          {items && items.some((i) => i.done) && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => robot.todos({ action: "clear_done" }))}>Rensa avklarade</Button>
          )}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (!t) return; setText(""); void run(() => robot.todos({ action: "add", text: t })); }}>
          <Input value={text} maxLength={120} placeholder="Ny punkt…" onChange={(e) => setText(e.target.value)} />
          <Button type="submit" disabled={busy || !text.trim()}><Plus />Lägg till</Button>
        </form>
        {items === null ? (
          <p className="text-sm text-muted-foreground">Tryck Hämta för att läsa listan från roboten.</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Listan är tom.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{open} kvar av {items.length}</p>
            <ul className="space-y-1">
              {items.map((i) => (
                <li key={i.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                  <Checkbox checked={i.done} disabled={busy || i.done} aria-label={`Bocka av ${i.text}`}
                    onCheckedChange={() => run(() => robot.todos({ action: "complete", id: i.id }))} />
                  <span className={`flex-1 text-sm ${i.done ? "text-muted-foreground line-through" : ""}`}>{i.text}</span>
                  <Button variant="ghost" size="icon" disabled={busy} aria-label={`Ta bort ${i.text}`}
                    onClick={() => run(() => robot.todos({ action: "remove", id: i.id }))}><Trash2 /></Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
