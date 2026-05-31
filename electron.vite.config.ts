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
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "out/main",
      rollupOptions: {
        input: resolve(__dirname, "src/main/index.ts"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "out/preload",
      rollupOptions: {
        input: resolve(__dirname, "src/preload/index.ts"),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react()],
    build: {
      outDir: "out/renderer",
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
  },
});
