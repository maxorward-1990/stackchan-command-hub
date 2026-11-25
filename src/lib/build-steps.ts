export type Arrow = { view: "top" | "side"; d: string; label?: string; lx?: number; ly?: number };
export type BuildStep = { title: string; parts: string[]; do: string[]; tip?: string; views?: ("top" | "side")[]; arrows?: Arrow[] };

export type PartItem = { id: string; qty: number; name: string; hint: string };
export type BuildId = "scout" | "mini";

export const PART_LIST: PartItem[] = [
  { id: "hub", qty: 1, name: "Technic Hub", hint: "Den grå batterilådan med 4 portar (A–D)" },
  { id: "mot", qty: 2, name: "L-motor (Large Angular)", hint: "Grå/svart motor med kabel" },
  { id: "b11", qty: 2, name: "Rak balk 1×11", hint: "Räkna 11 hål. 1×13 funkar också" },
  { id: "b7", qty: 2, name: "Rak balk 1×7", hint: "För vaggan ovanpå" },
  { id: "l35", qty: 6, name: "L-balk 3×5", hint: "Vinklade balkar" },
  { id: "b5", qty: 1, name: "Rak balk 1×5", hint: "Till glidtassen" },
  { id: "ax", qty: 4, name: "Axel 5L–6L", hint: "Kryssformade stavar" },
  { id: "g12", qty: 2, name: "Kugghjul 12 kuggar", hint: "Det lilla (beige)" },
  { id: "g20", qty: 2, name: "Kugghjul 20 eller 28 kuggar", hint: "Ett större" },
  { id: "wh", qty: 2, name: "Hjul med däck", hint: "Två av buggyns fyra" },
  { id: "bu", qty: 4, name: "Bussning (stopp)", hint: "Låser hjul och kugg på axeln" },
  { id: "pin", qty: 24, name: "Svarta friktionspinnar", hint: "Ta gärna några extra" },
  { id: "dome", qty: 1, name: "Rund slät bit", hint: "Glider mot golvet" },
];

export const BUILD_STEPS: BuildStep[] = [
  { title: "Sortera delarna", parts: [], do: ["Plocka isär buggyn helt.", "Lägg ut delarna i högar och bocka av listan ovan.", "Ha alla delar framme innan du börjar bygga."], tip: "Lägg delarna på en ljus handduk så rullar inget iväg." },
  { title: "Lägg hubben rätt", parts: ["1× Technic Hub"], do: ["Lägg hubben platt med knappen uppåt.", "Vänd den så att portarna A och B pekar framåt (bort från dig).", "Batteriluckan ska vara på undersidan. Den får aldrig byggas över."], views: ["top"], arrows: [{ view: "top", d: "M200 70 L200 40", label: "FRAM", lx: 235, ly: 52 }] },
  { title: "Sidobalkar", parts: ["2× balk 1×11", "8× svart pinne"], do: ["Tryck 4 svarta pinnar i hålen längs hubbens vänstra sida.", "Tryck fast en 1×11-balk på pinnarna.", "Låt balken sticka ut cirka 3 hål bakom hubben.", "Gör likadant på högra sidan."], views: ["top", "side"], arrows: [{ view: "top", d: "M110 230 L138 220" }, { view: "top", d: "M290 230 L262 220" }], tip: "Båda balkarna ska sticka ut lika långt bak. Räkna hålen." },
  { title: "Motorerna", parts: ["2× L-motor", "8× svart pinne"], do: ["Håll motorn mot vänster balk med axelhålet utåt.", "Placera den mitt på hubbens längd, inte längst fram.", "Lås med 4 pinnar.", "Gör likadant på högra sidan, spegelvänt."], views: ["top", "side"], arrows: [{ view: "top", d: "M60 155 L92 155", label: "IN", lx: 60, ly: 145 }, { view: "top", d: "M340 155 L308 155", label: "IN", lx: 340, ly: 145 }], tip: "Mitt på hubben betyder att roboten snurrar runt sin egen mittpunkt." },
  { title: "Kugghjul (nedväxling)", parts: ["2× 12 kuggar", "2× 20/28 kuggar", "4× axel", "2× bussning"], do: ["Stick en axel i motorns hål och sätt på det lilla kugghjulet.", "Stick en ny axel i ett hål på motorns ram, precis bredvid. Det blir hjulaxeln.", "Sätt det stora kugghjulet på den så att kuggarna griper i varandra.", "Snurra för hand. Det ska gå lätt utan att hacka."], views: ["top"], arrows: [{ view: "top", d: "M88 110 L88 135", label: "litet", lx: 88, ly: 102 }, { view: "top", d: "M78 205 L78 180", label: "stort", lx: 78, ly: 220 }], tip: "Litet driver stort = långsammare men starkare och mer exakt." },
  { title: "Hjulen", parts: ["2× hjul med däck", "2× bussning"], do: ["Skjut på hjulet på hjulaxeln.", "Lås med en bussning på utsidan.", "Gör likadant på andra sidan.", "Snurra hjulen. Inget får skava mot balkarna."], views: ["top", "side"], arrows: [{ view: "top", d: "M20 155 L32 155" }, { view: "top", d: "M380 155 L368 155" }] },
  { title: "Glidtass bak", parts: ["2× L-balk 3×5", "1× balk 1×5", "1× rund slät bit", "6× pinne"], do: ["Sätt en L-balk längst bak på varje sidobalk, pekande nedåt.", "Koppla ihop dem under hubben med 1×5-balken.", "Fäst den runda släta biten underst.", "Ställ roboten på bordet. Den ska stå rakt, inte luta."], views: ["side", "top"], arrows: [{ view: "side", d: "M340 200 L312 230", label: "ner", lx: 352, ly: 195 }], tip: "Lutar den bakåt: flytta tassen ett hål upp. Lutar den framåt: ett hål ner." },
  { title: "Kablar", parts: [], do: ["Vänster motor till port A.", "Höger motor till port B.", "Vira överbliven kabel runt balkarna.", "Kolla att ingen kabel når hjul eller kugghjul."], views: ["top"], arrows: [{ view: "top", d: "M120 70 L170 92", label: "A", lx: 112, ly: 66 }, { view: "top", d: "M280 70 L230 92", label: "B", lx: 288, ly: 66 }] },
  { title: "Vaggan för StackChan", parts: ["2× balk 1×7", "4× L-balk 3×5", "8× pinne"], do: ["Fäst två 1×7-balkar längs hubbens ovansida, en på var sida om knappen.", "Sätt L-balkar som stolpar i hörnen.", "Provställ StackChan. Den ska stå mitt mellan hjulen.", "Knappen på hubben och StackChans USB-port ska gå att nå."], views: ["top", "side"], arrows: [{ view: "side", d: "M120 120 L162 140", label: "stolpar", lx: 100, ly: 112 }] },
  { title: "StackChan på plats", parts: ["Kardborreband eller 2 axlar"], do: ["Ställ StackChan i vaggan.", "Lås med kardborre eller två axlar genom foten.", "Kontrollera att huvudets mitt är rakt över hjulens mitt (streckad linje).", "Klart! Nästa steg är att lära hubben ta emot körkommandon."], views: ["side", "top"], tip: "Tung topp kan välta i inbromsning. Kör långsamt de första gångerna." },
];

// Compact variant: 4 wheels at the corners, both motors lengthwise behind the hub driving the rear wheels directly, front wheels roll freely. No gears.
export const MINI_PART_LIST: PartItem[] = [
  { id: "hub", qty: 1, name: "Technic Hub", hint: "Ca 8 × 10 hål (≈6,5 × 8 cm). Den bestämmer bredden" },
  { id: "mot", qty: 2, name: "L-motor (Large Angular)", hint: "Ca 3 hål bred, 7 hål lång" },
  { id: "b13", qty: 2, name: "Lång rak balk 1×13 eller 1×15", hint: "Ramens långsidor. Finns inte lång nog: skarva två" },
  { id: "b9", qty: 2, name: "Rak balk 1×9", hint: "Tvärslåar fram och bak" },
  { id: "ax", qty: 2, name: "Axel 5L", hint: "Framhjulens axlar" },
  { id: "wh", qty: 4, name: "Hjul med däck", hint: "Alla fyra från buggyn" },
  { id: "bu", qty: 6, name: "Bussning (stopp)", hint: "Låser hjulen på axlarna" },
  { id: "l35", qty: 2, name: "L-balk 3×5", hint: "Låg vagga för StackChan" },
  { id: "pin", qty: 24, name: "Svarta friktionspinnar", hint: "Ta gärna några extra" },
];

export const MINI_STEPS: BuildStep[] = [
  { title: "Sortera delarna", parts: [], do: ["Plocka fram delarna i listan ovan.", "Mät hubben: räkna hålen på kortsidan och långsidan. Listan utgår från ca 8 × 10.", "Ha allt framme innan du börjar."], tip: "Fyra hjul, inga kugghjul. Bredden blir hubben plus två hjul, smalare än så går inte med de här delarna." },
  { title: "Ramen", parts: ["2× lång balk", "2× balk 1×9", "8× pinne"], do: ["Pinna fast en lång balk längs hubbens vänstra och högra sida, tätt mot hubben.", "Låt balkarna sticka ut ca 7 hål bakom hubben. Där ska motorerna ligga.", "Knyt ihop balkarna med en 1×9 tvärs längst fram och en längst bak.", "Ramen ska kännas stel när du vrider den."], views: ["top", "side"], arrows: [{ view: "top", d: "M115 120 L134 120" }, { view: "top", d: "M285 120 L266 120" }], tip: "Båda balkarna lika långt bak. Räkna hålen." },
  { title: "Motorerna bakom hubben", parts: ["2× L-motor", "8× pinne"], do: ["Lägg motorerna på längden, sida vid sida, bakom hubben inne i ramen.", "Vänd dem så att axelhålen pekar UT mot ramens sidor (vänster motor åt vänster, höger åt höger).", "Pinna fast varje motor i sin sidobalk.", "Axelhålet ska ligga mitt för ett hål i balken."], views: ["top", "side"], arrows: [{ view: "top", d: "M200 300 L200 272", label: "axelhål utåt ← →", lx: 300, ly: 292 }], tip: "Två motorer bredvid varandra är ca 6 hål breda, alltså smalare än hubben. Därför får de plats." },
  { title: "Bakhjulen", parts: ["2× hjul", "2× bussning"], do: ["Stick motorns axel (eller en kort axel i motorns hål) ut genom sidobalken.", "Skjut på hjulet tätt mot balken, inte så det skaver.", "Lås med en bussning ytterst.", "Gör likadant på andra sidan."], views: ["top", "side"], arrows: [{ view: "top", d: "M80 230 L98 230" }, { view: "top", d: "M320 230 L302 230" }], tip: "Inga kugghjul: motorn driver hjulet direkt. Färre delar, mindre som kan glappa." },
  { title: "Framhjulen", parts: ["2× axel 5L", "2× hjul", "4× bussning"], do: ["Stick en axel genom sidobalken i höjd med hubbens främre del, en per sida.", "Lås axeln på insidan med en bussning.", "Sätt på hjulet och lås ytterst med en bussning.", "Snurra: framhjulen ska rulla fritt, de är inte kopplade till något."], views: ["top", "side"], arrows: [{ view: "top", d: "M80 90 L98 90" }, { view: "top", d: "M320 90 L302 90" }], tip: "Kort avstånd mellan fram- och bakhjul gör att den svänger lättare. Flytta framhjulen bakåt ett par hål om den hackar i svängar." },
  { title: "Kablar", parts: [], do: ["Vänster motor till port A, höger till port B.", "Dra kablarna längs ramens insida.", "Kolla att inget når hjulen."], views: ["top"], arrows: [{ view: "top", d: "M120 30 L168 52", label: "A", lx: 112, ly: 28 }, { view: "top", d: "M280 30 L232 52", label: "B", lx: 288, ly: 28 }] },
  { title: "StackChan på plats", parts: ["2× L-balk 3×5", "Kardborre eller 2 axlar"], do: ["Sätt två L-balkar som låg vagga på hubben.", "Ställ StackChan mitt mellan fram- och bakhjul (streckad linje).", "Lås med kardborre eller axlar.", "Hubbens knapp och StackChans USB ska gå att nå."], views: ["side", "top"], tip: "Fyra hjul står stadigt, men en hög topp kan ändå tippa vid tvärstopp. Bygg vaggan så låg det går." },
];

export const BUILDS: Record<BuildId, { name: string; tagline: string; parts: PartItem[]; steps: BuildStep[] }> = {
  scout: { name: "Scout", tagline: "Bred och stabil", parts: PART_LIST, steps: BUILD_STEPS },
  mini: { name: "Mini", tagline: "Fyra hjul, så smal det går", parts: MINI_PART_LIST, steps: MINI_STEPS },
};
