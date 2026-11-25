// All browser storage goes through these helpers. The preview build (VITE_PREVIEW=1,
// served under /preview/ on the same origin) uses its own key prefix, so testing a
// preview can never change the notes, skills, chat or settings of the real hub.
export const IS_PREVIEW = import.meta.env["VITE_PREVIEW"] === "1";

export function storageKey(key: string, preview: boolean = IS_PREVIEW): string {
  return preview ? `preview:${key}` : key;
}
export function readStored(key: string): string | null {
  try { return localStorage.getItem(storageKey(key)); } catch { return null; }
}
export function writeStored(key: string, value: string): void {
  try { localStorage.setItem(storageKey(key), value); } catch { /* storage full or blocked */ }
}
