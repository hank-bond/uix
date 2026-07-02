import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Minimal electron-vite config.
// - main: src/main/index.ts            → out/main/index.js
// - preload: src/preload/index.ts      → out/preload/index.js
// - renderer: src/renderer/index.html  → out/renderer/
//
// externalizeDepsPlugin() leaves `dependencies` from package.json as
// runtime requires from node_modules instead of bundling them into
// out/main/index.js. Necessary for packages that load their own
// internal files via runtime paths (pino's worker_threads, native
// modules, etc.) — bundling breaks those path lookups.
//
// parse5 is excluded (i.e. bundled) because it is ESM-only: left external it
// would emit `require("parse5")`, which throws under the CJS main bundle. It is
// pure JS with no runtime path lookups, so bundling it is safe.
//
// typebox is bundled into preload because sandboxed preload scripts cannot
// resolve dependency external requires. The preload currently imports bundled
// feature channel contracts so bridge adapters consume the same contribution
// metadata as the rest of the channel facet.
const alias = {
  "@uix/api": resolve(__dirname, "src/api"),
  "#backend": resolve(__dirname, "src/main"),
  "#features": resolve(__dirname, "src/features"),
  "#shared": resolve(__dirname, "src/shared"),
};

export default defineConfig({
  main: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin({ exclude: ["parse5"] })],
    build: {
      outDir: "out/main",
      rollupOptions: {
        input: resolve(__dirname, "src/main/index.ts"),
      },
    },
  },
  preload: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin({ exclude: ["typebox"] })],
    build: {
      outDir: "out/preload",
      rollupOptions: {
        input: resolve(__dirname, "src/preload/index.ts"),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    resolve: { alias },
    plugins: [react()],
    build: {
      outDir: "out/renderer",
      rollupOptions: {
        input: {
          // index is the workspace page; picker is the App-shell start
          // picker shown when no workspace target is known.
          index: resolve(__dirname, "src/renderer/index.html"),
          picker: resolve(__dirname, "src/renderer/picker.html"),
        },
      },
    },
  },
});
