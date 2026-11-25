// Static build for GitHub Pages: node tools/build-pages.mjs [/base/]
// Builds the SPA under the repo sub-path with one prerendered page per route, and uses
// the SPA shell as 404.html (Pages serves it for any path without its own page).
import { spawnSync } from "node:child_process";
import { copyFileSync, writeFileSync, existsSync } from "node:fs";

const base = process.argv[2] || "/stackchan-command-hub/";
const r = spawnSync("npx", ["vite", "build"], { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, PAGES_BASE: base } });
if (r.status !== 0) process.exit(r.status ?? 1);
const out = "dist/client";
if (!existsSync(`${out}/_shell.html`)) { console.error("Missing dist/client/_shell.html (SPA shell)"); process.exit(1); }
if (!existsSync(`${out}/index.html`)) copyFileSync(`${out}/_shell.html`, `${out}/index.html`);
copyFileSync(`${out}/_shell.html`, `${out}/404.html`);
writeFileSync(`${out}/.nojekyll`, "");
console.log(`Pages build ready in ${out} (base ${base})`);
