import pinImg from "@/assets/lego-pin-2780.png";
import beamImg from "@/assets/lego-beam-1x7.png";
import footImg from "@/assets/stackchan-foot-holes.jpg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocal } from "@/lib/use-local";

const ANSWERS = [
  { v: "5", label: "Hål 1 och 5", gap: "4 hål" },
  { v: "6", label: "Hål 1 och 6", gap: "5 hål" },
  { v: "7", label: "Hål 1 och 7", gap: "6 hål" },
  { v: "no", label: "Passar inte", gap: "" },
];

function Num({ n }: { n: number }) {
  return <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{n}</span>;
}

export function FootTest() {
  const [ans, setAns] = useLocal<string>("sc.build.foot", "");
  const picked = ANSWERS.find((a) => a.v === ans);
  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Innan du bygger · 2 minuter</p>
        <CardTitle className="font-display text-xl">Passar StackChans fot på LEGO?</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2 rounded-xl border p-3">
          <div className="flex items-center gap-2 font-semibold"><Num n={1} />Hitta den här pinnen</div>
          <div className="grid place-items-center rounded-lg bg-card p-2 dark:bg-foreground"><img src={pinImg} alt="Svart LEGO Technic-pinne" className="h-28 object-contain" /></div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Svart, liten cylinder, ca 1,6 cm lång.</li>
            <li>Rund i båda ändarna, med en ring på mitten.</li>
            <li>Det finns massor i lådan. Inte den blå med kryss i ena änden.</li>
          </ul>
        </div>
        <div className="space-y-2 rounded-xl border p-3">
          <div className="flex items-center gap-2 font-semibold"><Num n={2} />Tryck in den i ett hörnhål</div>
          <img src={footImg} alt="Undersidan av StackChan med fyra hörnhål markerade 1 till 4" className="w-full rounded-lg" />
          <p className="text-sm text-muted-foreground">Vänd StackChan upp och ner. Tryck in pinnen i hål 1 och sedan en till i hål 2. Halva pinnen ska sticka upp.</p>
        </div>
        <div className="space-y-2 rounded-xl border p-3">
          <div className="flex items-center gap-2 font-semibold"><Num n={3} />Lägg en balk över pinnarna</div>
          <div className="grid place-items-center rounded-lg bg-card p-2 dark:bg-foreground"><img src={beamImg} alt="Rak svart LEGO-balk med sju hål" className="h-20 object-contain" /></div>
          <svg viewBox="0 0 300 70" className="w-full" role="img" aria-label="Balk med sju hål, numrerade 1 till 7">
            <rect x="5" y="15" width="290" height="36" rx="18" className="fill-muted stroke-border" strokeWidth="2" />
            {Array.from({ length: 7 }, (_, i) => (
              <g key={i}>
                <circle cx={25 + i * 41.7} cy={33} r={12} className="fill-background stroke-border" strokeWidth="2" />
                <text x={25 + i * 41.7} y={38} textAnchor="middle" className="fill-foreground text-[13px] font-bold">{i + 1}</text>
              </g>
            ))}
          </svg>
          <p className="text-sm text-muted-foreground">Ta en balk med 7 hål eller fler. Tryck ner den så att pinnarna går in i balkens hål, med pinnen från hål 1 i balkens hål 1. Vilket balkhål hamnar den andra pinnen i?</p>
          <div className="grid grid-cols-2 gap-2">
            {ANSWERS.map((a) => (
              <button key={a.v} onClick={() => setAns(a.v)} className={`rounded-lg border p-2 text-left text-sm transition-colors ${ans === a.v ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted"}`}>{a.label}</button>
            ))}
          </div>
          {picked && (
            <p className="rounded-lg bg-accent p-2 text-sm text-accent-foreground">
              {picked.v === "no" ? "Skriv till mig vad som hände (pinnen går inte in, hålen hamnar mellan balkens hål, osv)." : `Avstånd: ${picked.gap}. Skriv "${picked.gap}" till mig i chatten så anpassar jag bygget.`}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
