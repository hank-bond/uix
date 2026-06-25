import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@uix/api": resolve(__dirname, "src/api"),
      "#backend": resolve(__dirname, "src/main"),
      "#features": resolve(__dirname, "src/features"),
      "#shared": resolve(__dirname, "src/shared"),
    },
  },
});
