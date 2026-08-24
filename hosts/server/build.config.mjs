// Builds the server process and browser launcher into one runnable output tree.

import { copyFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const outputRoot = resolve(repositoryRoot, "out/server");

export const browserJsxOptions = Object.freeze({
  jsx: "automatic",
});

export async function buildServer() {
  await rm(outputRoot, { force: true, recursive: true });
  await mkdir(resolve(outputRoot, "public"), { recursive: true });
  await Promise.all([
    copyFile(
      resolve(repositoryRoot, "hosts/server/src/browser/launcher.html"),
      resolve(outputRoot, "public/index.html"),
    ),
    build({
      absWorkingDir: repositoryRoot,
      entryPoints: {
        launcher: "hosts/server/src/browser/main.ts",
      },
      outdir: resolve(outputRoot, "public/assets"),
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      ...browserJsxOptions,
    }),
    build({
      absWorkingDir: repositoryRoot,
      entryPoints: ["hosts/server/src/node/main.ts"],
      outfile: resolve(outputRoot, "index.mjs"),
      bundle: true,
      external: ["fastify", "pino", "pino-pretty"],
      format: "esm",
      platform: "node",
      target: "node22",
    }),
  ]);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await buildServer();
}
