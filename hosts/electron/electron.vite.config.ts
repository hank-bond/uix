// Builds the Electron main, preload, and renderer entries from their discrete host root.

import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

// externalizeDepsPlugin() leaves `dependencies` from package.json as
// runtime requires from node_modules instead of bundling them into
// out/main/index.js. Necessary for packages that load their own
// internal files via runtime paths (pino's worker_threads, native
// modules, etc.). Bundling breaks those path lookups.
//
// TypeBox is bundled into preload because sandboxed preload scripts cannot
// resolve dependency external requires. The preload imports the substrate
// channel contracts, which value-import typebox.
const root = resolve(__dirname, "../..");
const alias = {
  "@uix/api": resolve(root, "packages/api/src"),
  "@uix/client": resolve(root, "packages/client/src"),
  "@uix/host": resolve(root, "packages/host/src"),
  "@uix/runtime": resolve(root, "packages/runtime/src"),
};

export default defineConfig({
  main: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve(root, "out/main"),
      rollupOptions: {
        input: resolve(__dirname, "src/main/index.ts"),
      },
    },
  },
  preload: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin({ exclude: ["typebox"] })],
    build: {
      outDir: resolve(root, "out/preload"),
      rollupOptions: {
        input: { index: resolve(__dirname, "src/preload.ts") },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    resolve: { alias },
    plugins: [react()],
    build: {
      outDir: resolve(root, "out/renderer"),
      rollupOptions: {
        input: {
          // index is the workspace page. launcher is the App-shell start page
          // shown when no workspace target is known.
          index: resolve(__dirname, "src/renderer/index.html"),
          launcher: resolve(__dirname, "src/renderer/launcher.html"),
        },
      },
    },
  },
});
