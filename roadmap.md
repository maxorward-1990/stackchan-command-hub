- [x] Flash stackchan-gemini-firmware and configure Gemini without an SD card
- [x] Correct gateway capabilities and privacy instructions; build replacement firmware
- [x] Add touch interruption and a real on-device image display tool
- [x] Verify firmware build and tests; deliver flashing instructions
- [x] Replace fixed stone tool with request-specific text, lists and bar charts
- [x] Add direct Wikipedia lookup and relevant internet photos/illustrations without a gateway; build and test replacement firmware
- [x] Add broad Google-grounded web research using the robot's own Gemini key; build and test firmware
- [x] Replace paid-only search model with free-tier Gemini search; build and deliver v6 with unchanged partitions
- [x] Fix Wikipedia/Commons TLS stack overflow with cancellable background fetching; test and deliver firmware-only v7
- [ ] Verify live Google web search — requires user flashing v8 with their free-tier key, Google permitting access to the legacy model, opting in and asking a real current-information question
- [ ] Verify Wikipedia crash correction, interruption, retained settings, camera and information/internet-image display on physical robot — requires user flashing v8 and testing
- [ ] Adapt Command Hub to new firmware API — deferred until replacement firmware is verified on the robot

## Nästa runda (research 2026-11-20)
- [x] Stabiliseringsrunda v8: rätta ljud-/turavslut, mikrofonkvittering, asynkrona verktyg och diagnoser; kör regressionstester och bygg en uppdatering utan radering.
- [x] Utred WakeNet: stöder S3 men eget väckningsord kräver separat modell; Espressifs anpassning kostar pengar, därför inte vald.
- [x] v50: lokalt väckningsord "Hi Stack Chan" (Espressif-modell), av som standard, byggt och testat i mjukvara
- [x] Verifiera v50-start på roboten — användarens logg visar krasch i WakeNet-reset; ersätts av v51, v49 är reserv
- [ ] "Svarar inte på vissa saker": behöver seriell logg + exakta frågor för att skilja tystnad, verktygsfel och avbrott.
- [x] Googling: Google-grounding ger 429 på gratiskonton (bekräftat i logg) → v13 byter till gratis DuckDuckGo-sökning.
- [x] v13: tysta vilseledande "does not exist"-fel vid läsning av minnesfiler.
- [ ] Verifiera DuckDuckGo-sökning på roboten — kräver att användaren flashar v13 och slår på Web search.
- [ ] WebSerial-konsol i Command Hub — nästa steg efter att v13 verifierats.

## v15 (2026-11-20)
- [x] Bluetooth-styrning (Web Bluetooth i Command Hub + BLE i firmware, PIN-parkoppling)
- [x] Skärmmeny på roboten: Wi-Fi-sökning + tangentbord, Bluetooth, volym, info, omstart
- [ ] Verifiera v15 på roboten (flasha 0x10000) — kräver användaren
- [x] v16: neutral firmware, Wikipedia endast på begäran; beteende via profiler
- [ ] Verifiera v16 på roboten — kräver användaren
- [ ] Egen tränad "Hey Stackchan"-modell — bara om "Hi Stack Chan" inte räcker
- [ ] Små appar från minneskort (förslag: JSON/Lua-skript mot samma API) — efter att v15 är stabil
- [x] Flasha från Command Hub (Firmware-flik, versionshistorik, nödåterställning)
- [x] v18: ingen krasch efter svar, gester stänger inte mikrofonen, END_SENSITIVITY_LOW, mic-förstärkning max 10, påminnelse om att dra ur USB efter flash
- [ ] Verifiera v18 på roboten — kräver användaren

## v21
- [x] Språkval i Command Hub, sparat på roboten och tillämpat vid nästa samtal.
- [x] Flytta startsignalen till färdig Gemini-anslutning; tydligt väntar/lyssnar/tänker.
- [x] Textpanel som behåller ansiktet; rensa vid ny fråga och samtalsavslut.
- [x] Lokal tresekunders ljuddiagnostik med WAV-nedladdning via samma USB/Bluetooth/nätverksklient.
- [x] Regressionstester, firmwarebygge och v21 i Firmware-fliken; webbfunktioner verifierade med simulerade robotsvar.
- [ ] Verifiera lyssningssignal, skärm och mikrofonljud på fysisk robot — kräver användaren och flashning av v21.

## v22
- [x] Tavily-webbsökning med egen gratisnyckel (firmware + Command Hub)
- [ ] Testa sökning på riktig robot (väntar på användarens Tavily-nyckel)

## v26
- [x] Rörelser/dans med pausad mikrofon, köade verktyg och återupptagen lyssning efter rörelsens slut.
- [x] Ljudförbuffring, progressbaserad dränering och rensning av gamla ljud/transkript vid avbrott.
- [x] Regressionstester, firmwarebygge och v26 i Command Hub; versionskort och filens storlek/MD5 verifierade i webbläsaren.
- [ ] Fysiskt test av dans, skärmpanel och svenska/engelska — kräver flashning och användarens robot.

## v36 prestanda
- [x] Mät loop/delmoment, ljudkö, minne, nätläge och CPU/idle med tydliga begränsningar.
- [x] Lägg till USB-panel med tidsserier och lokal JSON-export, utan aktiva belastningstester under tal.
- [x] Minska skärmuppdatering under tal och separera startbuffring från återstart efter ljudsvält.
- [x] Kör tester, bygg v36 och verifiera panelens USB-flöde, import/export och dator-/telefonvy med simulerad robot.
- [ ] Verifiera faktisk ljudkvalitet, CPU-mätning och stabilitet — kräver flashning av v36 och användarens fysiska robot.

## v40 Wi-Fi och sensorer
- [x] Wi-Fi-byte i Styrning och Inställningar; lösenord får inte loggas eller lagras i webbläsaren.
- [x] Explicit stereomikrofontest med L/R-mätare och lokal export genom den gemensamma robotklienten.
- [x] Mjukare knacktröskel och återställ ansiktet när roboten blir upprätt/nerställd även under samtal.
- [x] Regressionstester, firmwarebygge och v40 i Firmware-fliken; webbflöden verifierade med simulerade robotsvar.
- [ ] Fysisk verifiering av Wi-Fi-byte, bordsknack och stereo — kräver användarens robot och flashning av v40.

## Command Hub – slutanvändarrunda
- [x] Samla USB/Bluetooth/brygga i en anslutning tillgänglig på alla sidor.
- [x] Separera robotstyrning, kamera, lampor/scener, att-göra, aktiviteter, inställningar och felsökning; ta bort dubbla kontroller.
- [x] Verifiera inställningshämtning och scenhämtning med simulerad USB-robot, kvarvarande felsökningsutkast efter sidbyte samt alla sidor i telefonvy; 51 regressionstester passerar. Fysisk robot och Bluetooth/brygga inte provade här.
- [ ] Omgång 2: personlighet, knapp-till-svar-mätning och skärmtexter — avsiktligt nästa omgång, inte denna UI-runda.

## v46 Personlighet
- [x] Personlighet-flik: skärmsimulator, ögonfärger/lampor per läge, vila, ljusstyrka, undertext, startljud, nick, tryckmeny – sparas på roboten utan omflashning
- [ ] Verifiera v46 på roboten — kräver att användaren flashar

## v47 Samtalsstart och ansiktsreglage
- [x] Buffra mikrofonen under uppkoppling, behåll ordningen och avbryt tydligt vid full buffert; varm, mikrofonstängd väntan i 60 s efter automatisk vila. Uttryckligt avslut stänger anslutningen.
- [x] Ansiktsreglage för statustext, ljudvågor, ögonbryn och kinder; visa två LED-ramper.
- [x] Alla firmwaretester och 52 apptester passerar; v47 byggd. Hämtning/sparning/återläsning och förhandsvisning verifierade på dator/telefon med simulerade robotsvar.
- [ ] Fysisk mätning av tryck till mikrofon och nätverksavbrott — kräver användarens robot med v47.

## v48
- [x] Listening face immediately at mic open (no yellow start face)
- [x] Smart-home prefetch never runs while Live is connected
- [ ] Wake word "Hey Stackchan" (microWakeWord, idle-only) — next step, waits on v48 test

## v51
- [x] Ta bort kraschande WakeNet-reset; testa modulens start/paus/återstart/detektering och bygg v51 med oförändrad lagring och v49 som reserv.
- [x] Användarens v51-logg bekräftar väckningsord men visar minnesfel vid Gemini-anslutning; ersätts av v52.

## v52
- [x] Rätta PSRAM-val och frigör aktiv väckningsmodell före samtal; minneslogg, alla C++-tester och utökat livscykeltest passerar; v52 byggd utan att röra v49. Fysiskt HTTP-test kan inte nå roboten härifrån.
- [x] Användarens logg visar omstartsloop i v52: OPI-läget gav noll PSRAM; ersätts av v53.

## v54
- [x] Bound sent history to 2000 bytes and move Live setup JSON/text to PSRAM; all 24 C++ tests, setup/wake lifecycle tests and 13 release tests pass. v54 built; browser confirms version and downloadable checksum, with qio_qspi/settings/v49 unchanged.
- [ ] Verify Gemini setup and five wake/touch conversations, Tavily and lights — requires user's physical robot with v54 and USB log.

## v53
- [x] Återställ qio_qspi, blockera väckningsmodell utan PSRAM; alla C++-tester och verkliga modulens host-livscykeltester passerar, v53 byggd med oförändrad lagring/v49.
- [x] Användarens v53-logg bekräftar väckning och PSRAM men visar AES-allokeringsfel vid Live setup; uppföljning i v54.

## v55 sökning under samtal
- [x] Tavily-arbetarens 24 KiB stack och JSON/svarsbuffertar använder PSRAM; en sovande arbetare återanvänds utan riskabel självradering; säkra gränser och minnesdiagnoser tillagda.
- [x] Alla 24 C++-tester, wake/setup/search-minnestester och firmwarebygge passerar; v55 finns i Uppdatera roboten, v49 och partitionstabellen oförändrade.
- [ ] Verifiera upprepade röstsökningar på fysisk robot — kräver användarens robot och logg efter flashning.

## v56 säker sökning
- [x] Frigör WakeNet och Live före Tavily på alla sökvägar; återanslut med begränsat, tydligt avgränsat sökunderlag utan gamla verktygs-ID:n.
- [x] Konsolen skickar igenkända råkommandon utan say; firmwaretester och v56-bygge passerar, oförändrad partitionstabell och v49-reserv.
- [ ] Fysisk verifiering av upprepade sökningar och avbrott — kräver användarens robot och USB-logg.

## v59
- [x] Höj avslutshåll till 1000 ms, neutralt ansikte, behåll tryck under mikrofonstart och låg ljudnivå; tyst avslut skickas i små tidsstyrda steg.
- [x] Byggt v59, samtliga C++-regressioner och fyra minnes/livscykeltester passerar; tillgänglig i Command Hub.
- [ ] Verifiera tryck→svar, långtryck→avslut, väckning och sökning på roboten — kräver användarens robot och logg.

## v60
- [x] Återställ huvudet vid uttryckligt avslut och inför försiktig minnesvakt endast i vila; samtliga C++-tester och fyra livscykel/minnestester passerar, v60 byggd utan lagringsändring.
- [ ] Verifiera huvudåtergång, ny väckning och 30 min upprepade sökningar/samtal — kräver fysisk robot efter flashning.

## v61
- [x] En gemensam Starta test / Stoppa och spara i Command Hub: tidsstämplade USB-händelser, samtal, prestanda och säkra statusbilder; begränsad insamling på datorn, inget ljud eller automatisk uppladdning.
- [x] Färsk klockavläsning för Gemini, svengelska-instruktion och rensning av klickavslut mellan turer; inga garantier om modellens igenkänning eller tystnadsdetektion.
- [x] 29 C++-policytester och fyra minnes-/livscykelregressioner passerar; v61 byggd, teststart/märkning/stopp/export och återställning av telemetri verifierade i webbläsare med simulerad USB-robot på dator/mobil.
- [ ] Fysisk verifiering av v61 — kräver användarens robot och testpaket.

## v62
- [x] Valbar närhetsstyrning och justerbar råvärdesgräns under Personlighet; gemensam samtalsstyrning, spärrar och regressionstester.
- [x] v62 byggd utan ändrad lagring, v61 behållen; spara/hämta och äldre firmware verifierade i Command Hub med simulerad robot på dator/mobil.
- [ ] Prova kort/lång handrörelse, falsktrigg och ljudprestanda — kräver användarens fysiska robot med v62.

## v63
- [x] Databladskontrollerad IR-konfiguration, tröskel 5–2047 och ljusdiagnostik; sparade värden och samtalsarkitektur behålls.
- [x] 30 C++-tester, fem I/O/minnes/livscykeltester och 83 apptester passerar; v63 byggd och levererad med verifierad kontrollsumma. Sparande/återläsning, sensorvärden och äldre firmware verifierade med simulerade robotsvar på dator/telefon.
- [ ] Verifiera handstyrning och ljusvärden på fysisk robot — kräver användarens flashning och mätningar.

## v64
- [x] Verifiera WakeNet-inställningar: behåll PSRAM-läget (flashläge gäller WakeNet10), inför justerbar modelltröskel och toppvärdesskydd med begränsad evidensring samt logga godkända/avvisade kandidater utan ljudinspelning.
- [x] Ta bort handrörelsens döda zon med bibehållet samtalsavslut och skydd mot upprepade triggar.
- [x] Återställ aktivt samtalsunderlag via engångsarkivering av aktuell rådialog utan att radera sparade samtal, fakta eller inställningar; sammanfattningar behålls.
- [x] 31 C++-regressioner och fem modul-/livscykeltester passerar; v64 byggd med oförändrade partitioner, kontrollsumma verifierad; sparande/återläsning och äldre firmware provade med simulerad robot i dator-/telefonvy, nedladdning verifierad.
- [ ] Verifiera naturligt Hej/Hey Stackchan, handstart och falsktrigg — kräver fysisk robot efter flashning och nytt testpaket.

## Appar – första steget
- [x] Bygg lokalt appbibliotek med klocka/väder, egna varianter, import/export och widget-/helskärmsförhandsvisning utan firmwareändring.
- [x] Hämta verkligt väder på vald ort och skicka en engångsbild som textpanel via befintlig v61-klient.
- [x] 94 regressionstester passerar; skapa/spara/återläsning, verklig ortsökning/väder och dator/telefon verifierade. Import/export och skärmkvittens verifierade med simulerad robot.
- [ ] Verifiera textpanelen på fysisk robot — kräver användarens anslutna robot; automatisk widget och exklusiv helskärm är inte implementerade i v61.

## Robotappar – nästa steg
- [x] Återskapa v61-källbas utan tillbakadragna beteenden och behåll stabil återställning; reproducerbart överlägg från v61, röst/väckning/minne verifierade byte för byte.
- [x] Lägg till en avgränsad lokal klock-/väderapp med widget, helskärm och säkert avslut; inga nya ljudägare, nätarbetare eller flashskrivningar.
- [x] Koppla start, stopp och återläsning till Appar genom gemensam robotklient; v61 avvisas innan appstart skickas.
- [x] 103 apptester, 29 v61 C++-tester, apppolicy/hanterartester och fyra minnes-/livscykeltester passerar; v66 byggd och dess serverade fil/kontrollsumma verifierad. Webbflöden och telefonvy verifierade med simulerad robot; v61 är stabil rekommendation och v66 separat testversion.
- [ ] Verifiera skärm, väckning och samtal på fysisk robot — kräver ägarens flashning och test.

## v67 appar på roboten
- [x] Spara klockappen på roboten (/apps.json) och läs in vid start
- [x] Svepmeny: Inställningar + Appar, starta klockappen offline
- [ ] Prova v67 på roboten (svep, omstart, röst efter app) — kräver användaren
- [ ] Appar från SD-kort som tillägg — senare

## v68 Fokustimer
- [x] Pomodoro-app: firmware v68, menysida Fokus, Command Hub-kort, tester
- [ ] Prova v68 på roboten (helskärm, widget, paus, fasbyte, röst under timer) — kräver användaren

## v72 väckningströskel
- [x] Bygg tröskeljustering på v61 + v71-appar, standard 0,490, utan v64-ljudspärr/närhetsändringar.
- [x] Personlighet: hämta, ändra, spara och återläsa tröskeln; v61-kompatibilitet verifierad med simulerad USB-robot på dator/telefon; sparning/omstart verifierad med riktig Personality-kod och låtsaslagring.
- [x] 112 apptester, v61-policyregressioner, timer-/modell-/tröskeltester passerar; v72 byggd, serverad fil och kontrollsumma verifierade; v61-återställning och v71-fil oförändrade.
- [ ] Prova Hej/Hey/Hi, falskväckning och svenska svar — kräver användarens fysiska robot med v72.

## v73 kvantiserad väckningströskel
- [x] Rätta avrundningskontrollen på v61 + v71-appar och regressionstesta 0,490 → 0,486, kvarvarande lyssning och felaktiga SDK-svar; testet fallerar på v72 och passerar på v73, sparning/omstart passerar.
- [x] Bygg v73 och verifiera serverad fil, kontrollsumma och oförändrad v61-återställning/v71-referens; 114 apptester och 30 rena firmwarepolicytester passerar, versionskort/nedladdning verifierade i webbläsaren; v72 inte längre erbjuden.
- [ ] Prova Hi/Hey/Hej och falskväckningar efter omstart — kräver användarens fysiska robot och ny logg.

## v76 spara väckningskänslighet
- [x] Begränsa DMA-spärren till start av lyssning; behåll v75:s arbetarskydd. Verklig WakeWord-kod med simulerat minne testar 0,450 och utebliven omstartsloop; regressionstestet fallerar på v75.
- [x] Bygg v76; 35 versionstester och fem firmwaremodultester passerar. Versionskort och serverad kontrollsumma verifierade på dator/telefon; v75 indragen, v61-återställning och v71-fil oförändrade.
- [x] Användarens v76-logg och bekräftelse: ingen omstartsloop; behåll standard 0,490, förstärkning 4 och brusfilter 2.
- [x] Gör v76 officiellt rekommenderad; behåll v61 som separat säker återställning.
