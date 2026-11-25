// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// GitHub Pages: PAGES_BASE=/stackchan-command-hub/ npm run build:pages builds a static SPA
// (no server) under that sub-path. Without it the normal local/SSR build is unchanged.
const pagesBase = process.env["PAGES_BASE"];

export default defineConfig(
  pagesBase
    ? {
        nitro: false,
        vite: { base: pagesBase },
        tanstackStart: {
          server: { entry: "server" },
          spa: { enabled: true },
          // One static page per route, so deep links load with status 200 and hydrate cleanly.
          prerender: { enabled: true, crawlLinks: true },
        },
      }
    : {
        tanstackStart: {
          // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
          // nitro/vite builds from this
          server: { entry: "server" },
        },
      },
);
