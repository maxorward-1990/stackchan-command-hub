#!/usr/bin/env node
// Adds a GitHub-built firmware image (branch firmware-builds) to Command Hub's Firmware tab.
// Usage: node tools/release-firmware.mjs <build.json> <app.bin> "note 1; note 2" [--recommend]
// Copies the image to public/firmware/<id>-app.bin and inserts its entry at the top of RELEASES in
// src/lib/firmware-releases.ts (experimental unless --recommend, which also moves RECOMMENDED_ID).
// Parts (partitions + wake model) are copied from the current recommendation. Never flashes anything.
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function addRelease(source, build, notes, recommend, date) {
  const id = String(build.version ?? "").replace(/^custom-/, "");
  if (!/^v\d+$/.test(id)) throw new Error(`Ogiltig version: ${build.version}`);
  if (!/^[0-9a-f]{32}$/.test(build.md5 ?? "") || !(build.size > 0))
    throw new Error("MD5 eller storlek saknas");
  if (build.address !== "0x10000") throw new Error("Endast app-bilder på 0x10000 kan släppas här");
  if (source.includes(`{ id: "${id}",`)) throw new Error(`${id} finns redan i Firmware-fliken`);
  const rec = /export const RECOMMENDED_ID = "(v\d+)";/.exec(source);
  if (!rec) throw new Error("RECOMMENDED_ID saknas");
  const recEntry = source.slice(source.indexOf(`{ id: "${rec[1]}",`));
  const parts = /\n    parts: \[\n[\s\S]*?\n    \],\n/.exec(
    recEntry.slice(0, recEntry.indexOf("notes:")),
  );
  const q = (s) => JSON.stringify(s);
  const allNotes = [...notes, `Byggd av GitHub från commit ${String(build.commit).slice(0, 7)}`];
  if (!recommend)
    allNotes.push(`${rec[1]} är fortfarande rekommenderad tills ${id} testats på roboten`);
  const entry =
    `  { id: ${q(id)},${recommend ? "" : " experimental: true,"} version: ${q(build.version)}, file: ${q(`/firmware/${id}-app.bin`)}, md5: ${q(build.md5)}, size: ${build.size}, kind: "app", date: ${q(date)},` +
    (parts ? parts[0].slice(0, -1) : "") +
    `\n    notes: [${allNotes.map(q).join(", ")}] },\n`;
  const marker = "export const RELEASES: Release[] = [\n";
  if (!source.includes(marker)) throw new Error("RELEASES saknas");
  let out = source.replace(marker, marker + entry);
  if (recommend) out = out.replace(rec[0], `export const RECOMMENDED_ID = "${id}";`);
  return { id, source: out };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [jsonPath, binPath, notesArg = "", flag] = process.argv.slice(2);
  if (!jsonPath || !binPath) {
    console.error('Usage: release-firmware.mjs <build.json> <app.bin> "notes" [--recommend]');
    process.exit(2);
  }
  const build = JSON.parse(readFileSync(jsonPath, "utf8"));
  const current = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/lib/firmware-releases.ts"), "utf8");
  if (build.md5 && current.includes(`md5: "${build.md5}"`)) {
    console.log(`${build.version} (${build.md5}) är redan släppt i Firmware-fliken – inget att göra.`);
    process.exit(0);
  }
  const bin = readFileSync(binPath);
  if (createHash("md5").update(bin).digest("hex") !== build.md5 || bin.length !== build.size)
    throw new Error("Binären matchar inte bygg-JSON (MD5/storlek)");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const file = join(root, "src/lib/firmware-releases.ts");
  const notes = notesArg
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const { id, source } = addRelease(
    readFileSync(file, "utf8"),
    build,
    notes,
    flag === "--recommend",
    new Date().toISOString().slice(0, 10),
  );
  const target = join(root, "public/firmware", `${id}-app.bin`);
  if (existsSync(target)) throw new Error(`${target} finns redan`);
  copyFileSync(binPath, target);
  writeFileSync(file, source);
  console.log(
    `Släppte ${id}${flag === "--recommend" ? " som rekommenderad" : " som experimentell"}`,
  );
}
