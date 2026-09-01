import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@uix/api": resolve(__dirname, "packages/api/src"),
      "@uix/runtime": resolve(__dirname, "packages/runtime/src"),
      "@uix/client": resolve(__dirname, "packages/client/src"),
      "@uix/host": resolve(__dirname, "packages/host/src"),
    },
  },
});
