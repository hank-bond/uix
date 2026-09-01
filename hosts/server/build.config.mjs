// Builds one runnable server distribution from its process, browser, and author-API sources.

import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import { basename, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const defaultOutputRoot = resolve(repositoryRoot, "out/server");

const browserJsxOptions = Object.freeze({
  jsx: "automatic",
});

export async function buildServer(outputRoot = defaultOutputRoot) {
  await rm(outputRoot, { force: true, recursive: true });
  await mkdir(resolve(outputRoot, "public"), { recursive: true });
  await Promise.all([
    cp(
      resolve(repositoryRoot, "packages/api/src"),
      resolve(outputRoot, "api"),
      { filter: isAuthorApiDistributionSource, recursive: true },
    ),
    copyFile(
      resolve(repositoryRoot, "hosts/server/src/browser/launcher.html"),
      resolve(outputRoot, "public/index.html"),
    ),
    copyFile(
      resolve(repositoryRoot, "hosts/server/src/browser/workspace.html"),
      resolve(outputRoot, "public/workspace.html"),
    ),
    build({
      absWorkingDir: repositoryRoot,
      entryPoints: {
        launcher: "hosts/server/src/browser/main.ts",
        workspace: "hosts/server/src/browser/workspace-main.ts",
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
      external: [
        "@earendil-works/pi-coding-agent",
        "@fastify/websocket",
        "esbuild",
        "fastify",
        "jiti",
        "pino",
        "pino-pretty",
      ],
      format: "esm",
      platform: "node",
      target: "node22",
    }),
  ]);
}

function isAuthorApiDistributionSource(path) {
  const name = basename(path);
  return name !== "AGENTS.md" && !/\.(?:test|spec)\./.test(name);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await buildServer();
}
