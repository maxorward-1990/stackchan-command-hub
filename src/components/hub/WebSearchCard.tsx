import { useState } from "react";
import { toast } from "sonner";
import { Globe, KeyRound, Search, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { robot, type SearchTestResult } from "@/lib/gemini-robot";

const ERRORS: Record<string, string> = {
  tavily_key_missing: "Ingen Tavily-nyckel sparad på roboten.",
  tavily_invalid_key: "Tavily godkände inte nyckeln – kontrollera att du kopierade hela.",
  tavily_monthly_quota_used_up: "Månadens 1000 gratissökningar är slut. De fylls på den 1:a.",
  tavily_rate_limited_try_later: "För många sökningar i rad – vänta en stund.",
  wifi_offline: "Roboten är inte uppkopplad på Wi-Fi.",
  search_disabled_busy_or_invalid_query: "Slå på Webbsökning och spara en nyckel först (eller så pågår redan en sökning).",
};
const explain = (e?: string) => (e ? ERRORS[e] ?? e : "Okänt fel");

export function WebSearchCard({ hasKey, onSaved, enabled, onEnabled }: { hasKey?: "set" | "missing" | undefined; onSaved: (v: "set" | "missing") => void; enabled?: boolean | undefined; onEnabled?: (v: boolean) => void }) {
  const [key, setKey] = useState("");
  const [query, setQuery] = useState("Hur många bor på Öland?");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SearchTestResult | null>(null);

  const save = async () => {
    try { const r = await robot.saveTavilyKey(key); setKey(""); onSaved(r.tavily_api_key === "set" ? "set" : "missing"); toast.success("Nyckeln sparad på roboten – gäller direkt"); }
    catch (e) { toast.error(String((e as Error).message)); }
  };
  const clear = async () => {
    try { await robot.clearTavilyKey(); onSaved("missing"); toast.success("Nyckeln borttagen"); }
    catch (e) { toast.error(String((e as Error).message)); }
  };
  const test = async () => {
    setBusy(true); setResult(null);
    try {
      await robot.searchTest(query);
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const r = await robot.searchResult();
        if (r.searched_web !== undefined) { setResult(r); return; }
      }
      setResult({ ok: false, error: "Inget svar inom 25 sekunder" });
    } catch (e) { setResult({ ok: false, error: String((e as Error).message) }); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Globe className="size-4" />Webbsökning (Tavily)</CardTitle>
        <CardDescription>
          Gratis 1000 sökningar/månad utan kort – stoppar vid gränsen, kostar aldrig något. Skapa nyckel på{" "}
          <a className="underline" href="https://app.tavily.com" target="_blank" rel="noopener noreferrer">app.tavily.com</a>.
          Nyckeln sparas bara på roboten, aldrig i den här appen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="search-enabled">Webbsökning på roboten</Label>
          <Switch id="search-enabled" checked={!!enabled} disabled={enabled === undefined} onCheckedChange={(v) => onEnabled?.(v)} />
        </div>
        {enabled !== undefined && <Button variant="outline" size="sm" onClick={() => void robot.saveRuntime({ web_search_enabled: enabled }, false).then(() => toast.success("Webbsökning sparad")).catch((e: Error) => toast.error(e.message))}>Spara webbsökning</Button>}
        <p className="text-sm">Status: {hasKey === "set" ? "nyckel sparad ✓" : hasKey === "missing" ? "ingen nyckel" : "hämta från roboten för att se"}</p>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (key.trim()) void save(); }}>
          <Label htmlFor="tavily-key" className="sr-only">Tavily-nyckel</Label>
          <Input id="tavily-key" type="password" autoComplete="off" placeholder="tvly-..." value={key} onChange={(e) => setKey(e.target.value)} className="max-w-sm" />
          <Button type="submit" disabled={!key.trim()}><KeyRound />Spara nyckel</Button>
          {hasKey === "set" && <Button type="button" variant="outline" onClick={() => void clear()}><Trash2 />Ta bort</Button>}
        </form>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void test(); }}>
          <Label htmlFor="search-test" className="sr-only">Testfråga</Label>
          <Input id="search-test" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-sm" />
          <Button type="submit" variant="secondary" disabled={busy || !query.trim()}><Search />{busy ? "Söker…" : "Testa sökning (1 av 1000)"}</Button>
        </form>
        {result && (result.ok ? (
          <div className="space-y-2 rounded-lg border p-3 text-sm">
            {result.answer && <p><b>Sammanfattning:</b> {result.answer}</p>}
            <ol className="list-decimal space-y-1 pl-5">
              {result.results?.map((r) => <li key={r.url}><a className="underline" href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a></li>)}
            </ol>
          </div>
        ) : <p className="text-sm text-destructive">{explain(result.error ?? result.last_error)}</p>)}
      </CardContent>
    </Card>
  );
}
