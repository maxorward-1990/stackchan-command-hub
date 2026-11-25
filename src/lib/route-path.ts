// Router paths end with "/" (trailingSlash: "always" for GitHub Pages); compare them
// without it so "/diagnostics/" matches the "/diagnostics" nav entry.
export function normalizePath(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
}
