# StackChan Command Hub

Webbapp och egen Gemini-firmware för StackChan (M5Stack CoreS3).
Projektet utvecklas med git på GitHub; Lovable används inte längre.

**Öppna appen:** https://maxorward-1990.github.io/stackchan-command-hub/ (Chrome eller Edge;
USB och Bluetooth fungerar därifrån, Wi-Fi-styrning kräver bryggan nedan på en dator).
**Testversion (preview):** https://maxorward-1990.github.io/stackchan-command-hub/preview/ – byggs från
branchen `preview`, har en gul banner och egen lagring (rör inte anteckningar/inställningar i den vanliga).
Push till `main` eller `preview` kör testerna och publicerar båda (`.github/workflows/pages.yml`).
Firmware byggs av `.github/workflows/firmware.yml` till branchen `firmware-builds` (inget flashas automatiskt).

## Starta appen (Windows)

1. Öppna mappen i Utforskaren, högerklicka och välj **Öppna i terminal**.
2. Första gången: `npx npm@11 install` (npm 10 kraschar på det här projektet).
3. `npm run dev` och öppna http://localhost:8080 i Chrome eller Edge.

Tester: `npm test`. Bygge: `npm run build` (GitHub Pages: `npm run build:pages`).
Firmwaretester (Linux/WSL eller Claude): `bash firmware/run_tests.sh`.

## Firmwareversioner

- `v61-baseline` (git-tagg): stabil återställningspunkt, källa i `v61/firmware/` (ändras aldrig).
- v66 och senare byggs som overlays: `python3 firmware/apps/prepare_apps.py /tmp/stackchan-vNN`, sedan PlatformIO där.
- Färdiga binärer ligger i `public/firmware/` och flashas från appens Firmware-flik.

## StackChan Command Hub

### Kör lokalt (krävs för att nå roboten)
Webbläsare blockerar anrop från en https-sida till `http://192.168.x.x`. Kör därför appen lokalt över http:
```
npm run dev   # öppna http://localhost:8080
```

### Robot API (firmware-kontrakt)
Appen skickar enkla GET-anrop till `http://<IP>`. Din StackChan-firmware behöver exponera:
| Endpoint | Parametrar |
|---|---|
| `/api/servo` | `pan` (-90..90), `tilt` (-30..30) |
| `/api/face` | `expr` = happy/neutral/focused/angry/surprised/sleepy |
| `/api/led` | `mode` = solid/pulse/rainbow/alert/off, `color` = hex utan # |
| `/api/say` | `text` |
| `/api/capture.jpg` | returnerar JPEG |

Ändra sökvägarna i `src/lib/robot.ts` om din firmware använder andra.


## Anslutning
All styrning (status, huvud, ansikte, lampor, tal, inställningar, skills) går via USB-kabel (Chrome/Edge, firmware v14+) eller via bryggan:

    node tools/robot-proxy.mjs 192.168.0.188

Kamerabilden visas bara via bryggan.
