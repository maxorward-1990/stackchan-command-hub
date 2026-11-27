# v64 — väckning och handstyrning

- Samma Espressif-modell för **Hi Stack Chan**, fonetiskt nära Hej/Hey Stackchan. Inget byte till ChatGPT eller annat väckningsord.
- WakeNet9 behåller sitt fungerande PSRAM-läge. SDK:n dokumenterar DET_MODE_90 som flashläge för WakeNet10; därför används inte det tidigare föreslagna lägesbytet.
- Modelltröskel 0,650 och ljudskydd: senaste sekundens färdiga PCM måste ha topp över 1500. Endast toppvärden hålls i en fast liten ring, inget diagnosljud sparas. Detta är en försiktig första inställning, inte en garanti mot falsklarm eller en kalibrerad ljudnivå.
- Personlighet → Väckningsord: justera ljudskydd och frasigenkänning, även återställ tidigare 0,585. Inställningarna sparas via samma robot-API och gäller utan omflashning.
- `[WAKE] rejected` skiljer avvisad svag kandidat från `[WAKE] detected`; loggar topp, senaste topp och inställningar. En avvisad kandidat ansluter inte till Gemini.
- Hand som tas bort efter minst 80 ms men före 1000 ms behandlas som ett skärmtryck. Vid 1000 ms ger fortsatt hand en hållning. Ingen död zon; avläsningsspärrar, hysteres och återaktivering behålls.
- På första v64-start arkiveras aktuell aktiv rådialog under `/app/StackChan/memory/index/dialogues-pre-v64.jsonl`. En separat markör förhindrar upprepning. Fakta, sammanfattningar, privata minnen, Wi-Fi och personlighet raderas inte. Reset tar inte bort eventuell kontamination i tidigare sammanfattningar.
- `[DU]` är fortfarande Geminis uppskattade transkription, inte bevis för vad användaren faktiskt sa. Ett lågt toppvärde i slutblocket bevisar inte tystnad och logg utan ljud bevisar inte hallucinationens orsak.

## Verifiering på roboten

Flasha v64 i Uppdatera roboten och starta om. Behåll din fungerande handgräns 79. Använd Felsökning → Starta test, prova vanlig Hej/Hey Stackchan och naturliga handrörelser; lämna även roboten i fred en stund. Stoppa och spara testet. Ändra inte flera inställningar samtidigt. Testfilen kan skilja svaga avvisningar, godkända väckningar, handkommandon och faktisk mikrofonstart; hårdvaruigenkänning återstår att verifiera.