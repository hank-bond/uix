// surface module pipeline.
//
// Turns registered surface entry files into ES modules the workspace page
// can dynamic-import, served over the reserved substrate origin
// (`uix-resource://uix.<ws>`). Per surface, esbuild bundles feature-local
// code in while two seams stay external:
//
//   - The blessed shared set (react, typebox, @uix/api/workspace — see
//     src/shared/surface-shared-modules.ts) resolves to virtual CommonJS modules
//     reading the page-populated global, so every surface shares the page's
//     instances. esbuild's CJS interop turns named imports into runtime
//     property reads, which is what makes re-exporting a runtime object
//     work at all.
//   - CSS module scripts (`with { type: "css" }`) stay external, rewritten
//     to content-hash-busted URLs on the files route; the browser executes
//     them natively. A CSS import without the attribute fails the bundle
//     loudly — the convention is checkable, so it's checked.
//
// Module URLs carry a content hash (`?v=`), so a reload after an agent edit
// is a new URL and the browser's module cache can never serve stale code.
// Everything rebuilds per list request (boot + reload only — cheap enough,
// and always correct). Build failures don't fail the list: the entry
// carries the error and the page renders it as an error card, the frontend
// twin of the loader's `failed[]`.

import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

import { build } from "esbuild";
import type { Plugin } from "esbuild";
import { Type } from "typebox";

import type { ResourceContribution } from "@uix/api/resources";
import type { SurfaceEntry } from "#shared/ipc";
import {
  encodeResourceUrl,
  normalizeResourceRoute,
} from "#shared/resource-routes";
import {
  SurfaceSharedGlobal,
  SurfaceSharedModules,
} from "#shared/surface-shared-modules";

import { createLogger } from "../log";
import type { SurfaceRegistration } from "./surfaces";

const log = createLogger("surfaces");

const ModuleRouteName = "surface";
const FilesRouteName = "surface-files";

const VersionQuery = Type.Object({ v: Type.Optional(Type.String()) });

const ModuleRoute = normalizeResourceRoute({
  path: "/:feature/:file",
  query: VersionQuery,
  origin: "feature",
});

const FilesRoute = normalizeResourceRoute({
  path: "/:feature/:path*",
  query: VersionQuery,
  origin: "feature",
});

const FileContentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

interface BuiltModule {
  readonly code: string;
  readonly hash: string;
}

const hashOf = (content: string | Buffer): string =>
  createHash("sha256").update(content).digest("hex").slice(0, 12);

const escapeForRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Maps the blessed bare specifiers to virtual CommonJS modules that read the
 * page's shared instances off the well-known global.
 */
const sharedModulesPlugin: Plugin = {
  name: "uix-shared-modules",
  setup(builder) {
    const filter = new RegExp(
      `^(${SurfaceSharedModules.map(escapeForRegExp).join("|")})$`,
    );
    builder.onResolve({ filter }, (args) => ({
      path: args.path,
      namespace: "uix-shared",
    }));
    builder.onLoad({ filter: /.*/, namespace: "uix-shared" }, (args) => ({
      contents: `module.exports = globalThis.${SurfaceSharedGlobal}[${JSON.stringify(args.path)}];`,
      loader: "js",
    }));
  },
};

export class SurfaceModulePipeline {
  readonly #workspaceId: string;
  /** `${featureId}/${file}` → last-built module, replaced per build pass. */
  #built = new Map<string, BuiltModule>();
  /** featureId → feature root dir, for the files route. */
  #roots = new Map<string, string>();

  constructor(workspaceId: string) {
    this.#workspaceId = workspaceId;
  }

  /**
   * Bundles every registered surface and returns the list the `uix.surfaces`
   * channel serves. Rebuilds from scratch each call (called once per load
   * pass per window); previously built modules are dropped so a deleted
   * surface can't be served stale.
   */
  async buildAll(
    registrations: readonly SurfaceRegistration[],
  ): Promise<SurfaceEntry[]> {
    const built = new Map<string, BuiltModule>();
    const roots = new Map<string, string>();
    const entries: SurfaceEntry[] = [];
    const perFeatureIndex = new Map<string, number>();

    for (const registration of registrations) {
      const index = perFeatureIndex.get(registration.featureId) ?? 0;
      perFeatureIndex.set(registration.featureId, index + 1);

      const file = `${String(index)}.js`;
      try {
        // Realpath so containment checks agree with esbuild's resolved
        // paths (macOS /tmp is a symlink, and feature dirs may be too).
        const featureRoot = await realpath(registration.featureRoot);
        roots.set(registration.featureId, featureRoot);
        const module = await this.#bundle(registration, featureRoot);
        built.set(`${registration.featureId}/${file}`, module);
        entries.push({
          featureId: registration.featureId,
          entry: registration.entry,
          url: encodeResourceUrl(ModuleRoute, {
            featureId: "uix",
            name: ModuleRouteName,
            workspaceId: this.#workspaceId,
            params: { feature: registration.featureId, file },
            query: { v: module.hash },
          }),
        });
        log.debug(
          { feature: registration.featureId, entry: registration.entry },
          "surface_built",
        );
      } catch (thrown) {
        const error =
          thrown instanceof Error ? thrown : new Error(String(thrown));
        entries.push({
          featureId: registration.featureId,
          entry: registration.entry,
          error: error.message,
        });
        log.error(
          {
            feature: registration.featureId,
            entry: registration.entry,
            err: error.message,
          },
          "surface_build_failed",
        );
      }
    }

    this.#built = built;
    this.#roots = roots;
    return entries;
  }

  /** The substrate resource routes, registered under the reserved `uix` id. */
  resourceContributions(): readonly ResourceContribution[] {
    return [
      {
        name: ModuleRouteName,
        route: ModuleRoute,
        handle: ({ params }) => {
          const key = `${String(params["feature"])}/${String(params["file"])}`;
          const module = this.#built.get(key);
          if (!module) {
            return textResponse(`No built surface module: ${key}`, 404);
          }
          return new Response(module.code, {
            status: 200,
            headers: {
              "Cache-Control": "no-store",
              "Content-Type": "text/javascript; charset=utf-8",
            },
          });
        },
      },
      {
        name: FilesRouteName,
        route: FilesRoute,
        handle: async ({ params }) => {
          const featureId = String(params["feature"]);
          const root = this.#roots.get(featureId);
          const segments = params["path"];
          if (!root || !isStringArray(segments) || segments.length === 0) {
            return textResponse("Resource not found", 404);
          }
          const filePath = resolve(join(root, ...segments));
          if (!filePath.startsWith(root + sep)) {
            return textResponse("Resource not found", 404);
          }
          try {
            const content = await readFile(filePath);
            return new Response(new Uint8Array(content), {
              status: 200,
              headers: {
                "Cache-Control": "no-store",
                "Content-Type":
                  FileContentTypes[extname(filePath)] ??
                  "application/octet-stream",
              },
            });
          } catch {
            return textResponse("Resource not found", 404);
          }
        },
      },
    ];
  }

  async #bundle(
    registration: SurfaceRegistration,
    featureRoot: string,
  ): Promise<BuiltModule> {
    const result = await build({
      entryPoints: [registration.entry],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      sourcemap: "inline",
      logLevel: "silent",
      // Never read on-disk tsconfigs: repo path aliases must not leak into
      // surface bundles (features import only relative paths, the blessed
      // shared set, and CSS module scripts).
      tsconfigRaw: { compilerOptions: { jsx: "react-jsx" } },
      plugins: [
        sharedModulesPlugin,
        this.#cssPlugin(registration.featureId, featureRoot),
      ],
    });
    const code = result.outputFiles[0]?.text ?? "";
    return { code, hash: hashOf(code) };
  }

  /**
   * Keeps CSS module scripts external, rewritten to content-hash-busted
   * files-route URLs so the browser fetches and executes them natively.
   */
  #cssPlugin(featureId: string, featureRoot: string): Plugin {
    const workspaceId = this.#workspaceId;
    return {
      name: "uix-surface-css",
      setup: (builder) => {
        builder.onResolve({ filter: /\.css$/ }, async (args) => {
          if (args.with["type"] !== "css") {
            return {
              errors: [
                {
                  text: `Import CSS as a module script: import sheet from "${args.path}" with { type: "css" }`,
                },
              ],
            };
          }
          const absolute = resolve(args.resolveDir, args.path);
          const relativePath = relative(featureRoot, absolute);
          if (relativePath.startsWith("..")) {
            return {
              errors: [
                {
                  text: `Surface styles must live inside the feature directory: ${args.path} escapes ${featureRoot}`,
                },
              ],
            };
          }
          const content = await readFile(absolute);
          return {
            path: encodeResourceUrl(FilesRoute, {
              featureId: "uix",
              name: FilesRouteName,
              workspaceId,
              params: {
                feature: featureId,
                path: relativePath.split(sep),
              },
              query: { v: hashOf(content) },
            }),
            external: true,
          };
        });
      },
    };
  }
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
