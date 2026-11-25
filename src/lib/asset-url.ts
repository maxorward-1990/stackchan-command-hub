// Resolves a root-relative public asset ("/firmware/x.bin") against Vite's base, so the
// same paths work locally ("/") and on GitHub Pages ("/stackchan-command-hub/").
export function assetUrl(path: string, base: string = import.meta.env.BASE_URL): string {
  if (!path.startsWith("/")) return path;
  return base.replace(/\/+$/, "") + path;
}

// Firmware images live once, on the main site. The preview build sets VITE_FIRMWARE_BASE to
// the main base; images that exist only in a preview are copied there by tools/assemble-pages.mjs.
export function firmwareUrl(path: string): string {
  const base = import.meta.env["VITE_FIRMWARE_BASE"];
  return assetUrl(path, typeof base === "string" && base ? base : import.meta.env.BASE_URL);
}
