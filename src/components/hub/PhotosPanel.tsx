import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { robot } from "@/lib/gemini-robot";
import { robotErrorText } from "@/lib/robot-app-transfer";

const listSchema = z.object({ ok: z.literal(true), photos: z.array(z.object({ name: z.string(), bytes: z.number() })), max_photos: z.number(), sd_copy: z.boolean().optional() });
type Photo = { name: string; bytes: number; src?: string };

/** Photos taken by robot apps (firmware v87+): the newest 20 are kept on the robot, all of them on an SD card. */
export function PhotosPanel() {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (quiet = false) => {
    setBusy(true);
    try {
      const p = listSchema.safeParse(await robot.photos());
      if (!p.success) throw new Error("Oväntat svar – foton kräver firmware v87.");
      setInfo(`${p.data.photos.length} av ${p.data.max_photos} bilder på roboten${p.data.sd_copy ? " · kopior sparas även på SD-kortet" : ""}`);
      const list: Photo[] = p.data.photos.map(x => ({ ...x }));
      setPhotos(list);
      for (const ph of list) {  // thumbnails one at a time (each is one USB request)
        const r = await robot.photos({ action: "get", name: ph.name }) as { jpeg_base64?: string };
        if (r.jpeg_base64) { ph.src = `data:image/jpeg;base64,${r.jpeg_base64}`; setPhotos([...list]); }
      }
    } catch (e) {
      setPhotos(null);
      const msg = robotErrorText(e instanceof Error ? e.message : String(e));
      setInfo(/v85|v87|404/.test(msg) ? "Foton kräver firmware v87." : msg);
      if (!quiet) toast.error(msg);
    } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(true); }, [load]);
  const remove = async (name: string) => {
    try { await robot.photos({ action: "delete", name }); setPhotos(p => p?.filter(x => x.name !== name) ?? null); }
    catch (e) { toast.error(robotErrorText(e instanceof Error ? e.message : String(e))); }
  };
  const label = (n: string) => { const m = /^\d+_(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(n); return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : n; };
  return <section className="mt-8 space-y-3 border-t pt-6">
    <div className="flex flex-wrap items-center gap-2">
      <div className="mr-auto"><h3 className="text-lg font-semibold">Foton</h3><p className="text-xs text-muted-foreground">Tagna av appar med steget "Ta en bild". {info}</p></div>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void load()}>{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}Uppdatera</Button>
      {!!photos?.length && <Button size="sm" variant="ghost" disabled={busy} onClick={async () => { if (!window.confirm("Ta bort alla bilder på roboten?")) return; await robot.photos({ action: "clear" }).catch(() => undefined); void load(true); }}><Trash2 />Ta bort alla</Button>}
    </div>
    {photos && !photos.length && <p className="text-sm text-muted-foreground">Inga bilder än.</p>}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{photos?.map(p => <figure key={p.name} className="space-y-1">
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border bg-muted">{p.src ? <img src={p.src} alt={label(p.name)} className="h-full w-full object-cover" /> : <Loader2 className="size-5 animate-spin text-muted-foreground" />}</div>
      <figcaption className="flex items-center gap-1 text-xs text-muted-foreground"><span className="mr-auto">{label(p.name)} · {Math.round(p.bytes / 1024)} kB</span>
        {p.src && <a href={p.src} download={p.name} title="Ladda ner" aria-label={`Ladda ner ${p.name}`} className="rounded p-1 hover:bg-muted"><Download className="size-4" /></a>}
        <button title="Ta bort" aria-label={`Ta bort ${p.name}`} className="rounded p-1 hover:bg-muted" onClick={() => void remove(p.name)}><Trash2 className="size-4" /></button></figcaption>
    </figure>)}</div>
  </section>;
}
