import { defineConfig } from "electron-vite";
import { resolve } from "node:path";

// Minimal electron-vite config.
// - main: src/main/index.ts            → out/main/index.js
// - preload: src/preload/index.ts      → out/preload/index.js
// - renderer: src/renderer/index.html  → out/renderer/
//
// React lands in commit 4; for now the renderer is a single TS module.
export default defineConfig({
  main: {
    build: {
      outDir: "out/main",
      rollupOptions: {
        input: resolve(__dirname, "src/main/index.ts"),
      },
    },
  },
  preload: {
    build: {
      outDir: "out/preload",
      rollupOptions: {
        input: resolve(__dirname, "src/preload/index.ts"),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    build: {
      outDir: "out/renderer",
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
  },
});
