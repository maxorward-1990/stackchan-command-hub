// Merge a preview build into the main Pages build without duplicating firmware:
//   node tools/assemble-pages.mjs <main dist/client> <preview dist/client>
// The preview's pages go to <main>/preview/. Its firmware images are served from the main
// site (VITE_FIRMWARE_BASE); an image that only the preview has is copied into <main>/firmware/
// (never overwriting a main image), then all images are removed from the preview folder.
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const [mainDir, previewDir] = process.argv.slice(2);
if (!mainDir || !previewDir) { console.error("usage: assemble-pages.mjs <main> <preview>"); process.exit(2); }
const pfw = join(previewDir, "firmware"), mfw = join(mainDir, "firmware");
let added = 0, shared = 0;
for (const name of existsSync(pfw) ? readdirSync(pfw) : []) {
  if (!name.endsWith(".bin")) continue;
  const src = join(pfw, name), dst = join(mfw, name);
  if (!existsSync(dst)) { copyFileSync(src, dst); added++; }
  else if (!readFileSync(src).equals(readFileSync(dst))) { console.error(`Conflict: ${name} differs between preview and main`); process.exit(1); }
  else shared++;
  rmSync(src);
}
cpSync(previewDir, join(mainDir, "preview"), { recursive: true });
console.log(`Preview merged: ${shared} shared firmware images, ${added} preview-only images added to main/firmware`);
