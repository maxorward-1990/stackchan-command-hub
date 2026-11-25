// Static build for GitHub Pages:
//   node tools/build-pages.mjs                                  -> /stackchan-command-hub/
//   node tools/build-pages.mjs /stackchan-command-hub/preview/ --preview
// Builds the SPA under the given sub-path with one prerendered page per route, and uses
// the SPA shell as 404.html (Pages serves it for any path without its own page).
// --preview sets VITE_PREVIEW=1: a banner and separate browser storage (src/lib/app-storage.ts).
import { spawnSync } from "node:child_process";
import { copyFileSync, writeFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const preview = args.includes("--preview");
const base = args.find((a) => !a.startsWith("--")) || "/stackchan-command-hub/";
const mainBase = "/stackchan-command-hub/";
const env = { ...process.env, PAGES_BASE: base, ...(preview ? { VITE_PREVIEW: "1", VITE_FIRMWARE_BASE: mainBase } : {}) };
const r = spawnSync("npx", ["vite", "build"], { stdio: "inherit", shell: process.platform === "win32", env });
if (r.status !== 0) process.exit(r.status ?? 1);
const out = "dist/client";
if (!existsSync(`${out}/_shell.html`)) { console.error("Missing dist/client/_shell.html (SPA shell)"); process.exit(1); }
if (!existsSync(`${out}/index.html`)) copyFileSync(`${out}/_shell.html`, `${out}/index.html`);
copyFileSync(`${out}/_shell.html`, `${out}/404.html`);
writeFileSync(`${out}/.nojekyll`, "");
console.log(`Pages build ready in ${out} (base ${base}${preview ? ", preview" : ""})`);
