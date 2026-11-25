// Flashes bundled firmware over USB with esptool-js (Chrome/Edge desktop).
// Frees the shared USB console first; verifies the file's MD5 before writing.
import { ESPLoader, Transport } from "esptool-js";
import CryptoJS from "crypto-js";
import { disconnectSerial } from "./web-serial";
import { flashPlan, type Release } from "./firmware-releases";
import { firmwareUrl } from "./asset-url";

const md5 = (data: Uint8Array) => CryptoJS.MD5(CryptoJS.lib.WordArray.create(data as unknown as number[])).toString();

export async function flashRelease(r: Release, onLog: (m: string) => void, onProgress: (pct: number) => void) {
  const serial = (navigator as unknown as { serial?: { requestPort(): Promise<SerialPort> } }).serial;
  if (!serial) throw new Error("Webbläsaren saknar USB-stöd. Använd Chrome eller Edge på datorn.");
  onLog(`Hämtar ${r.version}…`);
  const plan = flashPlan(r);
  const files: { data: Uint8Array; address: number }[] = [];
  for (const img of plan.images) {
    const res = await fetch(firmwareUrl(img.file));
    if (!res.ok) throw new Error(`Kunde inte hämta firmwarefilen (${res.status}).`);
    const data = new Uint8Array(await res.arrayBuffer());
    if (md5(data) !== img.md5) throw new Error("Filen är skadad (fel kontrollsumma). Flashar inte.");
    onLog(`Fil OK (${(data.length / 1024).toFixed(0)} kB, MD5 stämmer) → 0x${img.address.toString(16)}.`);
    files.push({ data, address: img.address });
  }
  await disconnectSerial();
  const port = await serial.requestPort();
  const transport = new Transport(port, false);
  const terminal = { clean() {}, writeLine: (s: string) => onLog(s), write: (s: string) => { if (s.trim()) onLog(s); } };
  const loader = new ESPLoader({ transport, baudrate: 921600, romBaudrate: 115200, terminal });
  try {
    onLog("Ansluter till roboten…");
    const chip = await loader.main();
    onLog(`Hittade ${chip}.`);
    onLog(`Skriver ${files.length} fil(er) utan radering…`);
    await loader.writeFlash({
      fileArray: files,
      flashMode: "keep", flashFreq: "keep", flashSize: "keep",
      eraseAll: plan.eraseAll, compress: true,
      reportProgress: (_i, written, total) => onProgress(Math.round((written / total) * 100)),
      calculateMD5Hash: (img: Uint8Array) => md5(img),
    });
    onLog("Skrivet och verifierat. Startar om roboten…");
    // The image is already written and verified; a failed reset must not mark the flash as failed.
    try { await loader.after("hard_reset"); } catch { onLog("Kunde inte starta om automatiskt – dra ur och sätt i USB-sladden."); }
  } finally {
    try { await transport.disconnect(); } catch { /* ignore */ }
  }
}
