// Firmware versions bundled with Command Hub (files in public/firmware) and the
// safety rules for flashing them: app updates always go to 0x10000, only the
// explicit recovery image goes to 0x0, and nothing is ever erased.
export type Release = {
  id: string; version: string; file: string; md5: string; size: number;
  kind: "app" | "recovery"; date: string; notes: string[];
  /** Withdrawn after failing on the real robot: kept for history, never offered for flashing. */
  withdrawn?: boolean;
  /** Built but not yet verified on the physical robot; never becomes the restore target. */
  experimental?: boolean;
  /** Extra images written in the same session (v50 wake word): only the partition table and model partition. */
  parts?: { file: string; md5: string; size: number; address: typeof PARTITION_TABLE_ADDRESS | typeof WAKE_MODEL_ADDRESS }[];
};

export const APP_ADDRESS = 0x10000;
export const RECOVERY_ADDRESS = 0x0;
// v50: partition table adds a 512 KiB "model" partition carved from the unused end of app1;
// LittleFS (0xC90000, 3456 KiB) is untouched so settings survive.
export const PARTITION_TABLE_ADDRESS = 0x8000;
export const WAKE_MODEL_ADDRESS = 0xc10000;
export const WAKE_MODEL_MAX = 0x80000;
export const LITTLEFS_ADDRESS = 0xc90000;

export const RELEASES: Release[] = [
  { id: "v83", experimental: true, version: "custom-v83", file: "/firmware/v83-app.bin", md5: "9fda10b327e9bcce5609d9759a11e293", size: 3114528, kind: "app", date: "2026-11-26",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Byggd av GitHub från commit 2303814", "v80 är fortfarande rekommenderad tills v83 testats på roboten"] },
  { id: "v82", experimental: true, version: "custom-v82", file: "/firmware/v82-app.bin", md5: "e85e3f289545428672b6c29bb27a0056", size: 3114528, kind: "app", date: "2026-11-26",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Byggd av GitHub från commit 87e4f46", "v80 är fortfarande rekommenderad tills v82 testats på roboten"] },
  { id: "v81", experimental: true, version: "custom-v81", file: "/firmware/v81-app.bin", md5: "f725b4aeec9db24fbd0912a8bce8dfc5", size: 3113968, kind: "app", date: "2026-11-26",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Byggd av GitHub från commit 10bc639", "v80 är fortfarande rekommenderad tills v81 testats på roboten"] },
  { id: "v65", withdrawn: true, version: "custom-v65", file: "/firmware/v65-app.bin", md5: "b73412d66c9e90c8b499e7ac99e8ec1a", size: 3085904, kind: "app", date: "2026-11-23",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Handstyrning pausad: närhetssensorn startar eller avbryter aldrig samtal, oavsett sparad inställning", "Tryck för att avsluta talet utan svar fryser inte längre i 30 s på tänkande ansikte; efter 10 s utan svar återgår roboten till vila", "Textturer från Command Hub behåller 30 s väntan; övrigt oförändrat från v64"] },
  { id: "v64", withdrawn: true, version: "custom-v64", file: "/firmware/v64-app.bin", md5: "eab5b4f4cb67e143a152d9d157b963a0", size: 3085568, kind: "app", date: "2026-11-23",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Samma Hi Stack Chan-modell och fungerande minnesläge; försiktigare frasigenkänning, inget ChatGPT-väckningsord", "Svaga väckningskandidater avvisas innan Gemini ansluts; loggen visar avvisning, ljudtopp och skyddsgräns utan ljudinspelning", "Personlighet → Väckningsord: välj ljudskydd och frasigenkänning utan omflashning; även tidigare känslighet finns kvar", "Naturligare handrörelser: döda zonen borttagen, fortsatt hand avslutar samtalet; fungerande sparad närhetsgräns behålls", "Första start arkiverar aktuell aktiv rådialog en gång; original, fakta, sammanfattningar, privata minnen och inställningar raderas inte", "31 C++-regressioner och fem modultester passerar; falsktrigg, Hej/Hey Stackchan och faktisk handstart måste fortfarande provas på roboten; v63/v49 finns kvar"] },
  { id: "v63", withdrawn: true, version: "custom-v63", file: "/firmware/v63-app.bin", md5: "63514415b52ee194d9d71c5c692e0c95", size: 3083728, kind: "app", date: "2026-11-23",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Starkare IR-reflektion: åtta pulser med 100 mA toppeffekt och 100 % puls-duty; avläsning var 50 ms, inte kontinuerligt ljus", "Närhetsgränsen kan nu ställas till 5–2047; nya inställningar börjar på 100, din tidigare sparade gräns behålls", "Personlighet → Läs sensorvärden visar handreflektion, sparad gräns och sensorstatus utan konsolkommandon", "Längre ljusmätning och uppskattad lux vid sensorn; inte kalibrerat rumsljus och råvärden är inte lux", "Mättade och ogiltiga mätningar ignoreras; samtalsstyrning, minnesvakt, lagring och väckningsord oförändrade", "Byggd och regressionstestad; prova handrörelser och falsktrigg på roboten, v62/v61/v49 finns kvar"] },
  { id: "v62", withdrawn: true, version: "custom-v62", file: "/firmware/v62-app.bin", md5: "96396ccac155a3a813f7647b64a6e1e5", size: 3082608, kind: "app", date: "2026-11-23",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Valbar närhetsstyrning under Personlighet, av som standard: hand mycket nära 0,1–0,5 s och bort = samma som ett skärmtryck", "Håll handen minst 1 s för att avsluta samtalet helt; lång hand i vila gör inget och öppnar aldrig menyn", "Justerbar råvärdesgräns, försiktig standard 1800; inga avstånd i cm eller riktningsgester utlovas", "Spärrar under meny, kamera, mikrofontest och huvudrörelser; brus, avläsningsfel och 0,5–1 s ignoreras", "Samma lagringslayout och väckningsmodell; sparade inställningar och v61/v49 som reserv behålls", "Byggd och regressionstestad; närhetsgräns, falsktrigg och faktisk påverkan på ljud måste provas på roboten"] },
  { id: "v61", version: "custom-v61", file: "/firmware/v61-app.bin", md5: "04eba1aed7207425c1a40bb0d22311fb", size: 3081136, kind: "app", date: "2026-11-23",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Felsökning: Starta test slår på prestandamätning och samlar tidsstämplade USB-händelser, samtal och status; Stoppa och spara laddar ner ett paket på datorn", "Inget ljud spelas in och inget laddas upp; insamling kräver USB och medgivande för lokal samtalstext", "Färsk klockavläsning för UTC, Stockholm med sommartid, Tokyo och Port Moresby; gamla sökträffar ska inte användas som aktuell tid", "Svenska meningar tillåter engelska teknikord utan att orden ensamma ska byta svarsspråk; språkigenkänning är inte garanterad", "Rensar väntande klickavslut mellan turer; samma inställningar, väckningsmodell och v60/v49-reserver", "Byggd och regressionstestad; testa språk, tid och klick/tystnad på roboten och skicka det samlade testpaketet"] },
  { id: "v80", version: "custom-v80", file: "/firmware/v80-app.bin", md5: "40477c96789e2a482670a6c00cc527b0", size: 3113968, kind: "app", date: "2026-11-26",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Svarar på samma språk som din senaste fråga, även när profil och minne är på svenska; svenska bara när språket är oklart", "Start av samtal som väntar på huvudrörelse eller uppkoppling räknas inte längre som fel (inget felansikte, ingen 'CMD listen: failed')", "Roboten återger inte sina instruktioner för dig", "Standarddiagnosen kontrollerar nu även svarets språk", "Innehåller v79:s kameraklocka; byggd av GitHub från commit cae516f", "Rekommenderad 2026-11-26: standarddiagnos utan fel, svarsspråk 2/3 (bättre än v79:s 1/3)"] },
  { id: "v79", experimental: true, version: "custom-v79", file: "/firmware/v79-app.bin", md5: "797b5451c53890792d71ec11852d7496", size: 3113584, kind: "app", date: "2026-11-25",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Kameran ska fungera även när mikrofonen är av (t.ex. efter motorrörelser): kameran startar mikrofonens klocka själv och lämnar tillbaka den efteråt", "Under Standarddiagnos blockeras lampkommandon, så ett missförstått testsamtal inte kan tända lampor", "Loggar [CAMERA] clock/no frame för att visa orsaken om en bild ändå saknas", "Innehåller v77:s och v78:s ändringar; byggd av GitHub från commit 730ea5d", "v76 är fortfarande rekommenderad tills v79 testats på roboten"] },
  { id: "v78", experimental: true, version: "custom-v78", file: "/firmware/v78-app.bin", md5: "38e5d4b9b933727177a0c3a09d30eb01", size: 3112912, kind: "app", date: "2026-11-25",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Kameran fungerar även efter längre användning, via USB och Wi-Fi: bilddata går direkt till PSRAM i stället för att kräva 30 kB internt minne", "Loggar högtalarstart med volym och minne ([AUDIO]) för att förklara tyst uppspelning", "Innehåller v77:s diagnosläge; allt annat oförändrat från v76; byggd av GitHub från commit 3e017d6", "v76 är fortfarande rekommenderad tills v78 testats på roboten"] },
  { id: "v77", experimental: true, version: "custom-v77", file: "/firmware/v77-app.bin", md5: "bd4fd3e56482bedae3ad9d94fe525b26", size: 3112400, kind: "app", date: "2026-11-25",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Experiment för Standarddiagnos i Felsökning: diagnosläge där testsamtal inte sparas i robotens samtalsminne (stängs av automatiskt efter högst 15 min)", "Status visar nu om väckordet faktiskt finns och lyssnar", "Allt annat är oförändrat från v76; byggd av GitHub från commit 63f0b07", "v76 är fortfarande rekommenderad tills v77 testats på roboten"] },
  { id: "v76", version: "custom-v76", file: "/firmware/v76-app.bin", md5: "ea9d15aad7621697a2c53e1aec2d971e", size: 3110592, kind: "app", date: "2026-11-25",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Officiell stabil version, bekräftad på roboten 2026-11-25: rättar v75:s upprepade modellstarter vid sparning av väckningskänslighet", "Minnesmarginalen kontrolleras bara innan lyssningen startar, inte för att avbryta pågående lyssning", "Skyddet mot upptagna lampkommandon, webbsökningar och bildhämtningar behålls; ljud och svarsbeteende är oförändrade från v75", "Testad standard: frasigenkänning 0,490 (WakeNet använder 0,486), mikrofonförstärkning 4 och brusfilter 2", "v61 är stabil återställning och v71-referensen är oförändrad"] },
  { id: "v75", withdrawn: true, experimental: true, version: "custom-v75", file: "/firmware/v75-app.bin", md5: "de8d025cc9fa54d845c1da6e4a286ed3", size: 3110576, kind: "app", date: "2026-11-25",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Testversion: ett lampkommando som hänger sig kan inte längre stänga av mikrofonen för väckningsordet", "Avbrutna lampkommandon slutar efter pågående anrop; väckningsordet väntar tills de är klara och tills minnet räcker", "Allt annat är samma som v74", "v61 är stabil återställning"] },
  { id: "v74", experimental: true, version: "custom-v74", file: "/firmware/v74-app.bin", md5: "58746d6b0d602ddce24e0e08391a97ef", size: 3110320, kind: "app", date: "2026-11-25",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Testversion: inställningen \"Väntar på helt tyst\" styr nu på riktigt när roboten bedömer att du pratat klart", "Stäng av den under Inställningar för snabbare svar när du sitter nära; påslagen fungerar som v73", "Allt annat är samma som v73: väckningströskel, appar, minne och röst", "Avbrott mitt i svenska meningar kan komma tillbaka när den är avstängd; prova på roboten", "v61 är stabil återställning"] },
  { id: "v73", experimental: true, version: "custom-v73", file: "/firmware/v73-app.bin", md5: "24e3148e1d52e106727f724b1ff2abb1", size: 3110320, kind: "app", date: "2026-11-24",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Testversion: rättar v72-felet som stängde av väckningsordets lyssning", "WakeNet får avrunda 0,490 till 0,486; begärd och faktisk tröskel visas i USB-loggen", "Sparad tröskel behålls; välj Personlighet → Väckningsord → 0,490 och spara för detta test", "Ingen ändring av mikrofon, språk, minne eller appar; samma stabila v61-grund som v72", "Hi/Hey/Hej och falskväckning behöver provas på roboten; Hej/Hey är fortfarande inte garanterade", "v61 är stabil återställning och v71-filen finns kvar som testad appreferens"] },
  { id: "v72", withdrawn: true, experimental: true, version: "custom-v72", file: "/firmware/v72-app.bin", md5: "149c5c489d85f80f78da3894df7ee25d", size: 3110192, kind: "app", date: "2026-11-24",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Testversion: v71-appar på stabil v61-grund, endast väckningströskeln ändrad", "Personlighet → Väckningsord: justerbar frasigenkänning, standard 0,490; 0,585 återger v61-gränsen", "Sparad tröskel behålls; hämta efter uppdateringen och välj 0,490 om en äldre inställning ligger kvar", "Ingen min-peak-spärr, närhetsstyrning eller riskabel modellreset från v64; röst, språk, minne och mikrofoninställningar oförändrade", "Modellen är fortfarande Hi Stack Chan: Hej/Hey och falskväckning måste provas på roboten, inte garanterade", "v61 är stabil återställning och den testade v71-filen finns kvar som appreferens"] },
  { id: "v71", experimental: true, version: "custom-v71", file: "/firmware/v71-app.bin", md5: "1b2817bb8f9c5a1dcf2ab30916a3caa2", size: 3109680, kind: "app", date: "2026-11-24",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Testversion byggd på v70: väckningsord, minne och röst oförändrade", "Tryck på timerraden längst ner för att stoppa timern; tryck på ansiktet startar samtal som förut", "Timer från 10 sekunder: säg till exempel 'timer på 30 sekunder', och Fokus-sidan har 15, 30 och 45 sekunder", "Svep nedåt stänger menyn från vilken sida som helst, och krysset är lättare att träffa", "Går tillbaka till v61 om rösten eller väckningsordet krånglar"] },
  { id: "v70", experimental: true, version: "custom-v70", file: "/firmware/v70-app.bin", md5: "cc860cfdfc3f6abb143b7e93e44119f2", size: 3108784, kind: "app", date: "2026-11-24",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Testversion byggd på v69: väckningsord, minne och timer oförändrade", "Sov-ansiktet visas först när avskedsfrasen har spelats klart, inte innan", "Bara en timer-begäran avslutar samtalet direkt efter bekräftelsen; ber du om mer fortsätter den lyssna", "Det är Gemini som avgör när samtalet avslutas, så det kan missa ibland", "Går tillbaka till v61 om rösten eller väckningsordet krånglar"] },
  { id: "v69", experimental: true, version: "custom-v69", file: "/firmware/v69-app.bin", md5: "545b87a79589f3ca3a12f3a1a4091d67", size: 3108672, kind: "app", date: "2026-11-24",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Testversion byggd på v61: röst, väckningsord och minne är oförändrade", "Fokus-sidan på roboten har - och + för att ställa fokustiden direkt på skärmen; ändringen sparas på roboten", "Röst: \"sätt en timer på 2 minuter\" startar en nedräkning längst ner på skärmen; stoppa, pausa och fråga hur lång tid som är kvar fungerar också", "Inget ljudlarm: timern syns när samtalet är slut, och roboten ringer inte", "Går tillbaka till v61 om rösten eller väckningsordet krånglar"] },
  { id: "v68", experimental: true, version: "custom-v68", file: "/firmware/v68-app.bin", md5: "dced5094cb30e925c98b21e9e37d91eb", size: 3105056, kind: "app", date: "2026-11-24",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Testversion byggd direkt från v61 som v67; röst, väckning, personlighet och sparade samtal är oförändrade", "Ny app: Fokustimer (Pomodoro) med fokus-, paus- och passlängd från Command Hub, sparad på roboten", "Ny menysida Fokus: starta som helskärm eller widget, pausa, fortsätt och stoppa direkt på roboten, helt utan nät", "Tryck eller väckningsord i helskärm går tillbaka till ansiktet men timern fortsätter i bottenremsan", "Fasbyte visas med färg och ram på skärmen; inget ljudlarm ännu eftersom högtalaren delas med rösten", "Byggd och testad på dator; måste provas på roboten. v61 är fortfarande stabil återställning"] },
  { id: "v67", experimental: true, version: "custom-v67", file: "/firmware/v67-app.bin", md5: "a6f10eb90e3dcbcf6371d5208c7c947e", size: 3094080, kind: "app", date: "2026-11-24",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Testversion byggd direkt från v61 som v66; röst, väckning, personlighet och sparade samtal är oförändrade", "Klockappen sparas på roboten när du startar den från Command Hub och finns kvar efter omstart, utan dator eller nät", "Svep upp för menyn, svep vänster/höger (eller tryck < >) mellan Inställningar och Appar; starta Klocka & Väder som helskärm eller widget direkt på roboten", "Klockan tas från robotens inbyggda klocka; vädret visas bara så länge det ursprungliga 30-minutersfönstret gäller", "Byggd och testad på dator; svep, sparning efter omstart och röst efter app måste provas på roboten. v61 är fortfarande stabil återställning"] },
  { id: "v66", experimental: true, version: "custom-v66", file: "/firmware/v66-app.bin", md5: "45499caee65c1ea44f07900a87c0f9b1", size: 3087648, kind: "app", date: "2026-11-24",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Testversion byggd direkt från v61: röst, väckningsmodell, personlighet och sparade samtal behåller v61-källan; inga v62–v65-beteenden", "Appar: starta Klocka & Väder som widget eller helskärm; klockan fortsätter lokalt när datorn kopplas bort", "Widget lämnar plats under samtal och återkommer; helskärm avslutas av tryck, väckningsord, samtal, kamera, meny eller test", "Väder hämtas uttryckligen i Command Hub och gäller högst 30 minuter; ingen automatisk väderhämtning på roboten ännu", "Stockholm inklusive sommartid, UTC, Tokyo och Port Moresby; appen stannar vid omstart eller efter sju dagar", "Byggd och regressionstestad; fysisk skärm, ljud och väckning ännu inte verifierade. v61 är fortfarande stabil rekommendation och återställning"] },
  { id: "v60", version: "custom-v60", file: "/firmware/v60-app.bin", md5: "cb5ca7ef2ab277f940a74a4604182c28", size: 3077136, kind: "app", date: "2026-11-23",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Långtryck och andra uttryckliga samtalsavslut återför huvudet till normalläge; väckningsordet väntar tills rörelsen är klar", "Minnesvakten frigör tillfälligt väckningsordets arbetsminne vid ihållande minnesbrist i vila; avbryter inte samtal, startar inte om och raderar ingenting", "Samma lagringslayout och inställningar; v59 och v49 finns kvar som reserv", "Byggd och regressionstestad; prova huvudåtergång och ny väckning, sedan 30 minuter med samtal och sökningar på roboten"] },
  { id: "v59", version: "custom-v59", file: "/firmware/v59-app.bin", md5: "cd6169808e34e39f9fd2a269adfcee36", size: 3076464, kind: "app", date: "2026-11-23",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Kort tryck under lyssning avslutar inspelningen även vid låg volym eller mikrofonstart; en kort tyst avslutning hjälper Gemini att börja svara", "Långtryck för att avsluta samtalet kräver nu en hel sekund; ansiktet blir neutralt, inte sovande", "Svep upp för menyn behålls; inställningar och v49 som reserv lämnas orörda", "Byggd och regressionstestad på datorn; tryck, svar och sökning behöver fortfarande provas på roboten"] },
  { id: "v58", version: "custom-v58", file: "/firmware/v58-app.bin", md5: "06e8f03952d61e93dc13ab22cfd99a91", size: 3076320, kind: "app", date: "2026-11-23",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Menyn på skärmen öppnas nu bara med en svepning uppåt; långa tryck i vila gör ingenting, så väckningsordet slutar inte lyssna av misstag", "Långt tryck under samtal avslutar fortfarande samtalet", "Påhittade rörelsenamn från Gemini blir en mjuk huvudrörelse i stället för ett fel, så svaret fortsätter direkt", "Sparade inställningar, Wi-Fi och v49 som reserv behålls; inget raderas", "Byggd och testad på datorn, inte provad på roboten"] },
  { id: "v57", version: "custom-v57", file: "/firmware/v57-app.bin", md5: "8d453a1567dc589f5b7bb76a8e9511fa", size: 3075056, kind: "app", date: "2026-11-22",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Rättar att roboten inte kunde ansluta igen efter en webbsökning: säkra anslutningar använder nu robotens stora extraminne", "Gemini, sökning, lampor och väckningsord konkurrerar inte längre om samma lilla minne", "Tar bort de upprepade vakthundsraderna (task not found) i USB-loggen", "Ny loggrad [TLS] visar hur minnet används; inga nycklar eller samtal loggas", "Sparade inställningar, Wi-Fi och v49 som reserv behålls; inget raderas", "Byggd och testad på datorn, inte provad på roboten: testa röstsökning följt av en ny fråga, och search gotland två gånger"] },
  { id: "v56", version: "custom-v56", file: "/firmware/v56-app.bin", md5: "da306bfc605436fb18fa12ebf142eb71", size: 3073984, kind: "app", date: "2026-11-22",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Sökning frigör väckningsordets minne och stänger samtalet tillfälligt; efter sökningen ansluts rösten igen med sökunderlaget", "Säkra, krypterade anslutningar behålls; USB-loggen visar sökningens steg med [SEARCH]", "Konsolen skickar search och status direkt; vanliga frågor skickas fortfarande till Gemini", "Sparade inställningar, Wi-Fi och v49 som reserv behålls; inget raderas", "Byggd och regressionstestad, inte provad på roboten: flasha, starta om, testa search gotland och fem röstsökningar samt avbrott; skicka USB-loggen"] },
  { id: "v55", version: "custom-v55", file: "/firmware/v55-app.bin", md5: "5bd5d75bf7b77b8cf64220997e1f948e", size: 3070048, kind: "app", date: "2026-11-22",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Sökningen använder extraminnet för sin arbetsplats och sina stora svarsbuffertar, så mer internminne lämnas åt samtalet", "En sökarbetare återanvänds; [SEARCH]-loggen visar minnet före sökning och krypterad anslutning", "Wi-Fi, sparade samtal och inställningar behålls; inget raderas och v49 finns kvar som reserv", "Byggd och regressionstestad, inte provad på roboten: flasha, dra ur och sätt i USB, testa fem röstsökningar och skicka loggen; samtidig sökning och samtal behöver fortfarande verifieras"] },
  { id: "v54", version: "custom-v54", file: "/firmware/v54-app.bin", md5: "3a0c801375b33108d0dc7c9cf0528ad7", size: 3068816, kind: "app", date: "2026-11-22",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Mindre samtalsminne skickas vid anslutning; sparade samtal raderas inte", "Stora tillfälliga anslutningsbuffertar använder extraminnet för att lämna plats åt krypteringen; minnesmått visas i [SETUP]-loggen", "Samma fungerande minnesläge som v53; Wi-Fi och inställningar behålls, v49 finns kvar som reserv", "Byggd och regressionstestad, inte provad på roboten: flasha, dra ur och sätt i USB, testa fem väckningar/samtal och skicka loggen"] },
  { id: "v53", version: "custom-v53", file: "/firmware/v53-app.bin", md5: "b2346a520a178ed979e09b17879a5da9", size: 3067040, kind: "app", date: "2026-11-22",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Återställer minnesläget från v49/v51 efter omstartsloopen i v52", "Väckningsordet startar inte om extraminnet saknas; dess aktiva minne frigörs före samtalet", "Inställningar och Wi-Fi behålls; inget raderas, v49 finns kvar som reserv", "Byggd och regressionstestad, ännu inte provad på roboten: flasha, dra ur och sätt i USB, testa fem väckningar och samtal och spara loggen"] },
  { id: "v52", version: "custom-v52", file: "/firmware/v52-app.bin", md5: "5c27e77ab77af257a8df4d87ff169d58", size: 3100064, kind: "app", date: "2026-11-22",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["ANVÄND INTE: fel minnesläge orsakar omstartsloop på denna robot; välj v53 eller v49", "USB-loggen visade att extraminnet inte startade; v53 återställer tidigare minnesläge", "Sparade inställningar raderades inte"] },
  { id: "v51", version: "custom-v51", file: "/firmware/v51-app.bin", md5: "3c34b7e1256e416095f66009aec8ca69", size: 3066336, kind: "app", date: "2026-11-22",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Tar bort anropet som kraschade vid start av väckningsordet i v50", "Samma väckningsord och sparade inställningar; inget raderas", "Flasha, dra ur och sätt i USB, låt roboten vila och säg Hi Stack Chan; avsluta samtalet och prova igen", "Byggd och regressionstestad; stabilitet och igenkänning måste fortfarande testas på roboten. v49 finns kvar som reserv"] },
  { id: "v50", version: "custom-v50", file: "/firmware/v50-app.bin", md5: "a81d8cc2e13d8cd9681d850c8c59a174", size: 3066336, kind: "app", date: "2026-11-22",
    parts: [
      { file: "/firmware/v50-partitions.bin", md5: "6733215c5bdc586a37e24fb0b50485a8", size: 3072, address: 0x8000 },
      { file: "/firmware/v50-wake-model.bin", md5: "1ee5a6100d24af4eb0e7b363ea5fbc51", size: 291070, address: 0xc10000 },
    ],
    notes: ["Väckningsord: säg \"Hi Stack Chan\" när roboten är tyst så startar samtalet som vid ett skärmtryck", "Av som standard; slå på under Personlighet", "Nytt grundsystem under huven och en liten röstmodell skrivs samtidigt; inställningar och Wi-Fi ligger kvar", "Byggd och regressionstestad, INTE testad på roboten. Fungerar något sämre: flasha tillbaka v49"] },
  { id: "v49", version: "custom-v49", file: "/firmware/v49-app.bin", md5: "ea01a4c89be29afe91b243d4aa5c59e0", size: 2406304, kind: "app", date: "2026-11-22",
    notes: ["Misslyckad webbsökning, bildhämtning eller lampanrop stänger alltid sin nätanslutning, så nästa samtal inte fastnar", "Startbufferten rymmer 6 s tal i stället för 3 s när nätet är segt", "Mikrofon och högtalare stängs bara om de faktiskt är igång (färre I2S-fel i loggen)", "Byggd och regressionstestad, ännu inte testad på roboten"] },
  { id: "v48", version: "custom-v48", file: "/firmware/v48-app.bin", md5: "d9a254fa9cc377cfac9a8b891adca022", size: 2405776, kind: "app", date: "2026-11-22",
    notes: ["Inget gult väntansikte vid start: lyssnaransiktet visas så fort mikrofonen är öppen", "Lampornas bakgrundskoll väntar tills samtalet är helt nedkopplat (inga minneskrockar)", "USB-loggen visar [START] mic_open_ms", "Byggd, ännu inte testad på roboten"] },
  { id: "v47", version: "custom-v47", file: "/firmware/v47-app.bin", md5: "2452f193e92b0c256091c70b13c54751", size: 2405696, kind: "app", date: "2026-11-22",
    notes: ["Mikrofonen spelar in under uppkoppling: upp till 3 s (6 s från v49) i lokal buffert, utan att skriva över ord", "Varm anslutning i 60 s efter automatisk vila, mikrofon av; uttryckligt avslut kopplar fortfarande från", "Statustext, ljudvågor, ögonbryn och kindprickar kan stängas av under Personlighet; två LED-ramper i förhandsvisningen", "USB-loggens [START] mäter tryck till lokal ljudfångst separat från Gemini-uppkoppling och svarstid", "Byggd och regressionstestad; faktisk starttid och ljud behöver testas på roboten"] },
  { id: "v46", version: "custom-v46", file: "/firmware/v46-app.bin", md5: "d73ec32e93577f2ec906417bdd5ab3ca", size: 2403824, kind: "app", date: "2026-11-22",
    notes: ["Personlighet: viloskärm, ljusstyrka, lampor per läge, ögonfärger, undertexter, startljud, nick och tryckmeny ställs in i Command Hub", "Ändringar gäller direkt utan omflashning eller omstart", "Utan tryckmeny startar ett tryck samtalet direkt när fingret nuddar skärmen", "Byggd och regressionstestad, ännu inte testad på roboten"] },
  { id: "v45", version: "custom-v45", file: "/firmware/v45-app.bin", md5: "eff597b0d9b1bbf1c1da381262d5b3c5", size: 2396224, kind: "app", date: "2026-11-22",
    notes: ["Egna scener: välj lampor i Command Hub och sätt på/av, ljusstyrka eller färg per lampa", "Scenerna sparas på roboten; säg t.ex. \"kör Mys\" så sätter roboten alla lampor i scenen", "Tuyas betalda molnscener används inte längre", "Byggd och regressionstestad, ännu inte testad på roboten"] },
  { id: "v44", version: "custom-v44", file: "/firmware/v44-app.bin", md5: "cb0b30235eb175ab335307d4db1d47d7", size: 2390912, kind: "app", date: "2026-11-22",
    notes: ["Klockan synkas mot nätet direkt vid Wi-Fi-anslutning; vid Tuyas klockfel synkas den om och försöker igen", "Smart Life-scener (Tap-to-run): säg scenens namn eller tryck på scenknappen i Lampkortet", "Flera enheter i samma mening (t.ex. LED-lamporna och switcharna) hittas nu", "Byggd och regressionstestad, ännu inte testad på roboten"] },
  { id: "v43", version: "custom-v43", file: "/firmware/v43-app.bin", md5: "0e8461d626e7852b670f07bc28735b8d", size: 2381040, kind: "app", date: "2026-11-22",
    notes: ["Röststyrning av lampor: lampkanalen använder mycket mindre minne så Tuya och Gemini Live får plats samtidigt", "Ett automatiskt omförsök om anslutningen till Tuya misslyckas"] },
  { id: "v42", version: "custom-v42", file: "/firmware/v42-app.bin", md5: "0e595c02f3726fe98523fcd61ff4a6b1", size: 2380032, kind: "app", date: "2026-11-22",
    notes: ["Styr Smart Life-lampor och uttag med rösten via Tuya (Central Europe)", "Nycklar sparas bara på roboten; Lampkort i Inställningar med enhetslista och På/Av-knappar", "Gemini får bara lampverktyget när Lampstyrning är på och nycklar finns", "Byggd och regressionstestad, ännu inte testad på roboten"] },
  { id: "v41", version: "custom-v41", file: "/firmware/v41-app.bin", md5: "0212e85fcd2d020d25f798173679434a", size: 2340256, kind: "app", date: "2026-11-22",
    notes: ["Stereomikrofontestet fungerar nu även via USB-kabeln (tidigare 404)", "Avslöjar döda mikrofonkanaler och kopierad mono i stället för två riktiga mikrofoner", "Guidat test i Command Hub: tyst, knacka vänster, knacka höger ger slutsats per mikrofon", "Byggd och regressionstestad, ännu inte testad på roboten"] },
  { id: "v40", version: "custom-v40", file: "/firmware/v40-app.bin", md5: "c48e6f7771df354dca750937e343c967", size: 2337984, kind: "app", date: "2026-11-22",
    notes: ["Wi-Fi-byte i Styrning och Inställningar: sparar på roboten och startar om; använd helst USB", "Känsligare knackning (0,20 g) med fortsatt skydd mot egna motorer/högtalare", "Ansiktet återställs när roboten ställs upprätt eller ner, även under samtal", "Stereomikrofontest med L/R-nivåer och lokal JSON-export; körs bara på begäran i vila", "Byggd och regressionstestad, ännu inte testad på roboten"] },
  { id: "v39", version: "custom-v39", file: "/firmware/v39-app.bin", md5: "531288bdbc4cf52680d2dd2b3224d0a0", size: 2337936, kind: "app", date: "2026-11-22",
    notes: ["Batteri i procent och laddstatus i Status; varnar en gång vid 20 % och 10 %", "Knacka i bordet för att väcka roboten när den sover; glad min när den lyfts, felmin när den vält", "Hårdvaruklockan ställs från nätet och ger rätt tid även utan internet", "Byggd och regressionstestad, ännu inte testad på roboten"] },
  { id: "v38", version: "custom-v38", file: "/firmware/v38-app.bin", md5: "cddceb225a4c4c36002f39a691985644", size: 2332752, kind: "app", date: "2026-11-22",
    notes: ["Nätverket och krypteringen körs på robotens andra processorkärna, så ansiktet och talet inte fryser när mobilnätet hackar", "Dubbelt så stor talbuffert (64 platser) mot tystnad mellan orden", "Byggd och regressionstestad, ännu inte testad på roboten"] },
  { id: "v37", version: "custom-v37", file: "/firmware/v37-app.bin", md5: "263bc36a9bb8e2dabf2ef196ee023ecc", size: 2331296, kind: "app", date: "2026-11-22",
    notes: ["Prestandaloggen är av som standard; slå på/av med knappar i Prestanda eller perf on/off", "Ljudet startar först när 0,4 s faktiskt ljud är buffrat (säkerhetsgräns 2 s)", "Byggd och regressionstestad, ännu inte testad på roboten"] },
  { id: "v36", version: "custom-v36", file: "/firmware/v36-app.bin", md5: "ddcddcb64ccc378ec08a2fbbe8fd61a9", size: 2331088, kind: "app", date: "2026-11-22",
    notes: ["Prestanda i USB-konsolen: samplad CPU per kärna, loop/skärm/nätverk, ljudkö och minne; spara mätningar som JSON", "Skärmen uppdateras cirka 11 gånger/s under tal i stället för 25", "Efter ljudsvält återstartar buffringen efter 120 ms i stället för 800 ms; första starten behåller 800 ms", "Mätningar skickas bara lokalt via USB; byggd och regressionstestad, ännu inte testad på roboten"] },
  { id: "v35", version: "custom-v35", file: "/firmware/v35-app.bin", md5: "37273a2e1e22c93e6b28076a530f99f1", size: 2328848, kind: "app", date: "2026-11-22",
    notes: ["Håller Gemini-anslutningen vid liv via mobilens hotspot (även under webbsökning)", "Ingen krasch när telefonen kopplar från Bluetooth", "Lite större ljudbuffert mot hack på mobilnät", "Byggd; inte testad på roboten"] },
  { id: "v34", version: "custom-v34", file: "/firmware/v34-app.bin", md5: "f8407c5451c37b0394ca69e0dfb6e450", size: 2328464, kind: "app", date: "2026-11-22",
    notes: ["Bluetooth kan slås på utan att roboten startar om (Wi-Fi delar radion med Bluetooth)", "Byggd; inte testad på roboten"] },
  { id: "v33", version: "custom-v33", file: "/firmware/v33-app.bin", md5: "de3c96eaa4454b8356e1a6cda2957e8b", size: 2328368, kind: "app", date: "2026-11-22",
    notes: ["Rättar att roboten blev stum efter Stoppa/avbrott: svar ignorerades tills omstart", "Byggd; inte testad på roboten"] },
  { id: "v32", version: "custom-v32", file: "/firmware/v32-app.bin", md5: "adcba33f65d68df2216803aea651c43a", size: 2328368, kind: "app", date: "2026-11-22",
    notes: ["Om Gemini är tyst 10 s efter en testfråga skickas den om som en avslutad fråga, så Gemini inte väntar på mer text", "Byggd; inte testad på roboten"] },
  { id: "v31", version: "custom-v31", file: "/firmware/v31-app.bin", md5: "ad9019ea7188560c52468a114970d428", size: 2328016, kind: "app", date: "2026-11-22",
    notes: ["Skärmen vaknar direkt när en fråga skickas från USB-testet och slocknar inte mitt i", "Om Gemini är tyst 10 s efter en testfråga skickas frågan om en gång ([TID] omforsok_text_ms)", "Tryck på skärmen ignoreras medan en testfråga väntar på första svar", "Byggd och regressionstestad; inte testad på roboten"] },
  { id: "v30", version: "custom-v30", file: "/firmware/v30-app.bin", md5: "1e4e83398b7f7ce6683a55dc8c230b83", size: 2327408, kind: "app", date: "2026-11-22",
    notes: ["Håll inne 0,5 s under samtal avslutar det (menyn kräver fortfarande ~1 s när roboten sover)", "Trycker du 'klar' utan att ha sagt något avslutas samtalet direkt i stället för att fastna på thinking i 30 s", "Menyn kan inte poppa upp precis när ett samtal tagit slut", "Svarstider loggas som [TID]-rader; nytt automatiskt taltest i USB-konsolen", "Byggd och regressionstestad; trycken behöver testas på roboten"] },
  { id: "v29", version: "custom-v29", file: "/firmware/v29-app.bin", md5: "6ec1014df1a979bf89b341f1884f53fa", size: 2326672, kind: "app", date: "2026-11-22",
    notes: ["Tryck på skärmen: första trycket = börja lyssna, andra trycket = jag är klar, svara nu (väntar inte på tystnad)", "Tryck medan den pratar avbryter; håll inne ~1 s under samtal avslutar det (håll när den sover öppnar menyn som förut)", "Att göra-lista på roboten: säg 'skriv upp att…' eller 'vad har jag på listan?'; syns och redigeras under Styrning", "Byggd och regressionstestad; tryckstyrningen behöver testas på roboten"] },
  { id: "v28", version: "custom-v28", file: "/firmware/v28-app.bin", md5: "d50dbfb9de6167e9049049d01b0f5bfd", size: 2316528, kind: "app", date: "2026-11-22",
    notes: ["Se kameran via USB-kabeln utan Wi-Fi eller nätverk (ca 1–2 bilder/s) i fliken Kamera", "Wi-Fi-videon via bryggan finns kvar för mjukare bild", "Allt från v27; USB-bilden behöver testas på roboten"] },
  { id: "v27", version: "custom-v27", file: "/firmware/v27-app.bin", md5: "1b302949ab93029b003fd0201b4a6264", size: 2316000, kind: "app", date: "2026-11-22",
    notes: ["Livekamera: se robotens kamera i fliken Kamera och styr huvudet med pilknappar", "Rösten pausas medan kameran sänder; roboten visar sitt tittar-ansikte så det syns att den filmar", "Tryck på roboten för att stoppa sändningen direkt; den stängs också själv efter 10 minuter", "Kräver Wi-Fi och bryggan på datorn (inte USB/Bluetooth)", "Byggd och regressionstestad; bildfrekvens och stabilitet behöver testas på roboten"] },
  { id: "v26", version: "custom-v26", file: "/firmware/v26-app.bin", md5: "d12af2f749d743c0e20b825824a56e5b", size: 2286768, kind: "app", date: "2026-11-20",
    notes: ["På begäran: nicka, titta upp eller gör en liten dans; mikrofonen pausas medan rörelserna utförs i ordning", "Slå på Huvudrörelser & gester under Inställningar och starta ett nytt samtal – ditt sparade av-läge ändras inte", "Tal förbuffras upp till 0,5 s; långa svar avbryts inte efter fem sekunder när uppspelningen fortfarande går framåt", "Gamla ljudköer och transkript rensas vid avbrott; loggen mäter underruns och buffertdjup", "Byggd och regressionstestad; dans och hörbart ljud behöver testas på roboten"] },
  { id: "v25", version: "custom-v25", file: "/firmware/v25-app.bin", md5: "ea72a814dd0a8668f0e5b75459ca7d89", size: 2282000, kind: "app", date: "2026-11-20",
    notes: ["Större talbuffert (32 platser): rösten ska hacka mindre", "Kort paus mellan högtalare och mikrofon så den inte låser sig och startar om efter ett svar", "Allt från v24; ej testad på roboten ännu"] },
  { id: "v24", version: "custom-v24", file: "/firmware/v24-app.bin", md5: "014c33bcfa2638979ac2ca4ff6d0dec9", size: 2281712, kind: "app", date: "2026-11-20",
    notes: ["Jämnare tal: ljudet buffras i stället för att stoppa nätverket", "Fryser inte längre på gula ansiktet när den slutar lyssna – somnar, eller startar om efter 3 s om mikrofonen hänger sig", "Allt från v23; ej testad på roboten ännu"] },
  { id: "v23", version: "custom-v23", file: "/firmware/v23-app.bin", md5: "5d04335a7f0acb07a510558430f6fde2", size: 2281184, kind: "app", date: "2026-11-20",
    notes: ["Kraschar inte längre när det är tyst efter ett svar – somnar i stället", "Visar inte längre 'Söker...'-text på skärmen medan den googlar, bara färdiga svar", "Allt från v22; fysisk test av tystnadsfixen återstår"] },
  { id: "v22", version: "custom-v22", file: "/firmware/v22-app.bin", md5: "843b72ddc3d501e9eae7776b8bb9a289", size: 2281024, kind: "app", date: "2026-11-20",
    notes: ["Riktig webbsökning via Tavily med din egen gratisnyckel (1000 sökningar/månad, stoppar vid gränsen)", "Nyckeln sparas under Styrning → Webbsökning och gäller direkt utan omstart", "DuckDuckGo borttaget (blockerades av CAPTCHA)", "Allt från v21; sökning på riktig robot ej testad ännu"] },
  { id: "v21", version: "custom-v21", file: "/firmware/v21-app.bin", md5: "2bc99d95ba90b5cf7f256af256ebf40d", size: 2277536, kind: "app", date: "2026-11-20",
    notes: ["Språkval sparas på roboten: svenska, engelska, båda eller automatiskt – ändras under Inställningar utan ny flash", "Kort startsignal först när Gemini anslutit; VÄNTA / LYSSNAR / SVARAR på skärmen", "Text och listor i bläddrande bottenpanel; rensas vid nästa fråga eller avslut", "Spela in 3 s lokalt mikrofontest och ladda ner WAV via USB, Bluetooth eller brygga", "Geminis språkval styrs med instruktioner, inte ett garanterat språkfilter; fysisk ljud/skärm-test återstår"] },
  { id: "v20", version: "custom-v20", file: "/firmware/v20-app.bin", md5: "7bbbcf81e9ccfd431b2f2b00f7b6e796", size: 2265856, kind: "app", date: "2026-11-20",
    notes: ["USB-loggen visar i klartext vad du sa ([DU]) och vad roboten svarade ([ROBOT])", "Visar vilket verktyg som anropas och med vad ([VERKTYG]/[RESULTAT])", "Markerar när en tur är klar eller avbryts ([TUR])"] },
  { id: "v19", version: "custom-v19", file: "/firmware/v19-app.bin", md5: "fb9976c86c44807a5962847148b0249e", size: 2264832, kind: "app", date: "2026-11-20",
    notes: ["Slå av/på Wikipedia, bilder, gester m.m. under Inställningar → Förmågor", "Wikipedia avstängt som standard", "Tydligt lyssnar-ansikte med ljudringar medan mikrofonen är öppen"] },
  { id: "v18", version: "custom-v18", file: "/firmware/v18-app.bin", md5: "0ab24f31650683bca6e4ae4fc00a0f9b", size: 2263216, kind: "app", date: "2026-11-20",
    notes: ["Kraschar inte längre efter att den svarat", "Slutar inte lyssna när den nickar eller byter min", "Väntar in att du pratat klart, mikrofonen distorderar inte"] },
  { id: "v17", version: "custom-v17", file: "/firmware/v17-app.bin", md5: "3d88519225729498425941d30d92c2e1", size: 2263168, kind: "app", date: "2026-11-20",
    notes: ["Startar om mikrofonen själv om den fastnar", "Loggar lyssningsstatus varannan sekund", "Allt från v16 (Gemini först, Wikipedia på begäran)"] },
  { id: "v16", version: "custom-v16", file: "/firmware/v16-app.bin", md5: "1b2bc01786b16b8b5c11c3a92aee5a65", size: 2262704, kind: "app", date: "2026-11-20",
    notes: ["Svarar från Geminis egen kunskap först", "Wikipedia bara när du ber om det", "Beteende styrs via profiler i Inställningar"] },
  { id: "v15", version: "custom-v15", file: "/firmware/v15-app.bin", md5: "ee4f2cebfcb57827de5e0b9b04b3aa16", size: 2262576, kind: "app", date: "2026-11-20",
    notes: ["Bluetooth-styrning från telefon (PIN-parkoppling)", "Meny på skärmen: håll på ansiktet ~1 s", "Wi-Fi-byte med tangentbord på skärmen"] },
  { id: "v14", version: "custom-v8 (v14)", file: "/firmware/v14-app.bin", md5: "b7910801a13743232daaa57c9b2b6566", size: 2057520, kind: "app", date: "2026-11-20",
    notes: ["Styrning via USB-kabel", "LED-lägen och gester"] },
  { id: "recovery", version: "grundbild", file: "/firmware/recovery-full.bin", md5: "dfc297322645af28697ca0cd3d63017f", size: 1566000, kind: "recovery", date: "2026-11-19",
    notes: ["Endast om roboten inte startar alls (svart skärm, 'Invalid image')", "Flasha sedan den rekommenderade versionen direkt efteråt"] },
];

/** Recommendation and historical restore are deliberately independent. */
/** The officially recommended app image; tools/release-firmware.mjs updates this line. */
export const RECOMMENDED_ID = "v80";
export const OFFERED = RELEASES.filter((r) => !r.withdrawn).sort((a, b) => Number(b.id === RECOMMENDED_ID) - Number(a.id === RECOMMENDED_ID));
const latest = OFFERED.find((r) => r.id === RECOMMENDED_ID && !r.experimental);
if (!latest) throw new Error("Ingen firmwareuppdatering är tillgänglig.");
export const LATEST = latest;
const restore = OFFERED.find((r) => r.id === "v61" && !r.experimental);
if (!restore) throw new Error("Säker återställning saknas.");
export const RESTORE = restore;

export function flashPlan(r: Release) {
  const address = r.kind === "recovery" ? RECOVERY_ADDRESS : APP_ADDRESS;
  const images = [{ file: r.file, md5: r.md5, address }, ...(r.parts ?? []).map((p) => ({ file: p.file, md5: p.md5, address: p.address }))];
  return { address, images, eraseAll: false as const };
}

export type FlashRecord = { id: string; version: string; at: string; ok: boolean; error?: string; reportedVersion?: string };
export const HISTORY_KEY = "sc.flashHistory";
export function addHistory(list: FlashRecord[], rec: FlashRecord, max = 30): FlashRecord[] {
  return [rec, ...list].slice(0, max);
}

/** True when the robot reports a withdrawn version, including failed wake checks in v72/v75. */
export function isWithdrawnVersion(reported: string): boolean {
  const v = reported.trim();
  return RELEASES.some((r) => r.withdrawn && r.version === v);
}
