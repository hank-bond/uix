import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@uix/api": resolve(__dirname, "packages/api/src"),
      "@uix/runtime": resolve(__dirname, "packages/runtime/src"),
      "#backend": resolve(__dirname, "src/main"),
      "#features": resolve(__dirname, "src/features"),
      "#shared": resolve(__dirname, "src/shared"),
    },
  },
});
