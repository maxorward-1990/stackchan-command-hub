// Moves Command Hub apps (robot-apps.ts format v1) onto the robot (firmware v85+, /api/robotapps).
// The robot stores images as separate JPEG files, so an image step becomes {file:"<id>_<step>.jpg"}.
// Every file is sent in base64 chunks small enough for one USB "api" line (6144 bytes).
import { z } from "zod";
import type { RobotApp } from "./robot-apps";

export const ROBOT_MAX_IMAGES = 6;
export const CHUNK_BASE64 = 4096;  // firmware RobotAppPolicy::kChunkBase64Max
const ID = /^[A-Za-z0-9_-]{1,40}$/;

export interface RobotFile { file: string; base64: string }
export interface RobotPackage { id: string; json: string; files: RobotFile[] }

function utf8Base64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** The robot's on-disk form of an app plus its files. Throws a Swedish message when the app cannot live on the robot. */
export function toRobotPackage(app: RobotApp, enabled = true): RobotPackage {
  if (!ID.test(app.id)) throw new Error("Appens id går inte att använda på roboten. Duplicera appen och skicka kopian.");
  const images = app.actions.filter(a => a.kind === "image").length;
  if (images > ROBOT_MAX_IMAGES) throw new Error(`Roboten rymmer högst ${ROBOT_MAX_IMAGES} bilder per app (den här har ${images}).`);
  const files: RobotFile[] = [];
  const actions = app.actions.map((a, i) => {
    if (a.kind !== "image") return a;
    const file = `${app.id}_${i}.jpg`;
    files.push({ file, base64: a.jpeg_base64 });
    return { kind: "image" as const, name: a.name, file };
  });
  const json = JSON.stringify({ ...app, enabled, actions });
  return { id: app.id, json, files: [{ file: `${app.id}.json`, base64: utf8Base64(json) }, ...files] };
}

export function chunks(base64: string, size = CHUNK_BASE64): string[] {
  const out: string[] = [];
  for (let i = 0; i < base64.length; i += size) out.push(base64.slice(i, i + size));
  return out;
}
const decodedLength = (b64: string) => (b64.length / 4) * 3 - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);

export type RobotPost = (body: Record<string, unknown>) => Promise<unknown>;

/** Uploads every file chunk by chunk, then asks the robot to validate and install the app. */
export async function sendPackage(pkg: RobotPackage, post: RobotPost, onProgress?: (done: number, total: number) => void) {
  const all = pkg.files.map(f => ({ ...f, parts: chunks(f.base64), total: decodedLength(f.base64) }));
  const totalParts = all.reduce((n, f) => n + f.parts.length, 0) + 1;
  let done = 0;
  for (const f of all) {
    let offset = 0;
    for (const data of f.parts) {
      await post({ action: "upload", file: f.file, offset, total: f.total, data });
      offset += decodedLength(data);
      onProgress?.(++done, totalParts);
    }
  }
  const status = await post({ action: "install", id: pkg.id });
  onProgress?.(++done, totalParts);
  return status;
}

export const robotAppsStatusSchema = z.object({
  ok: z.literal(true), supported: z.boolean(), version: z.literal(1),
  max_apps: z.number(), bytes_used: z.number(), bytes_max: z.number(),
  running: z.object({ name: z.string(), step: z.number() }).optional(),
  pending: z.string().optional(), last_error: z.string().optional(), message: z.string().optional(),
  apps: z.array(z.object({ id: z.string(), name: z.string(), enabled: z.boolean(), cooldown_s: z.number(), steps: z.number(), images: z.number(), triggers: z.array(z.string()) })),
});
export type RobotAppsStatus = z.infer<typeof robotAppsStatusSchema>;

export const ROBOT_ERRORS: Record<string, string> = {
  invalid_app: "Roboten godkände inte appen (ogiltigt innehåll).", missing_image: "En bild kom inte fram – försök igen.",
  invalid_image: "En bild är inte en giltig JPEG.", too_many_apps: "Roboten rymmer inga fler appar – ta bort någon först.",
  storage_limit: "Robotens appminne (1 MB) är fullt – ta bort en app eller använd färre bilder.",
  storage_full: "Robotens lagring är full.", wrong_offset: "Överföringen kom i otakt – försök igen.",
  unknown_app: "Appen finns inte längre på roboten.", robot_apps_unavailable: "Roboten kunde inte starta appdelen (saknar PSRAM).",
};
export function robotErrorText(message: string) {
  const code = /"error":"([a-z_]+)"/.exec(message)?.[1];
  if (/\b404\b/.test(message) && (!code || code === "unknown_path")) return "Roboten saknar stöd för appar. Installera firmware v85 under Uppdatera roboten.";
  return (code && ROBOT_ERRORS[code]) || message;
}

// ---- SD card export (Chrome's folder picker): /stackchan-apps/<id>.json + <id>_<step>.jpg ----
export function packageFiles(pkg: RobotPackage): { name: string; bytes: Uint8Array }[] {
  return pkg.files.map(f => ({ name: f.file, bytes: Uint8Array.from(atob(f.base64), c => c.charCodeAt(0)) }));
}
