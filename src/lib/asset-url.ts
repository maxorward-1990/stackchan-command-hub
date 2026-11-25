// Resolves a root-relative public asset ("/firmware/x.bin") against Vite's base, so the
// same paths work locally ("/") and on GitHub Pages ("/stackchan-command-hub/").
export function assetUrl(path: string, base: string = import.meta.env.BASE_URL): string {
  if (!path.startsWith("/")) return path;
  return base.replace(/\/+$/, "") + path;
}
