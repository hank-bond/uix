// Trellis extension loader — turns DiscoveredExtensions into
// activated extensions (one per entry file).
//
// Responsibilities:
//   1. For each discovered extension with a `trellis` manifest,
//      resolve its entry files (relative paths in
//      `ext.packageJson.trellis.extensions`).
//   2. Dynamic-import each entry file (ESM, via file:// URL).
//   3. Build an ExtensionAPI bound to a per-entry DisposableBag.
//   4. Invoke the default-exported factory with that API.
//   5. Enroll the per-entry bag into the parent bag so a single
//      dispose at app shutdown (or reload) tears every contribution
//      down cleanly.
//
// Activation is sequential (`for...of` + `await`). Matches pi.
// Predictable log order; tiny extension can't be slowed down by a
// slow neighbor activating in parallel because there is no parallel.
//
// Error isolation is NOT here yet. A broken extension factory will
// throw and stop the loop. The next commit adds try/catch with
// attribution, process-level uncaughtException + unhandledRejection
// handlers, and a `failed` state we surface in the registry.
//
// TypeScript extensions aren't supported yet either. Pi uses jiti
// to transpile TS at runtime; we'll add the same when there's a
// real TS extension to load. For now, entry files are `.js` /
// `.mjs` only.

import path from "node:path";
import { pathToFileURL } from "node:url";

import type { ExtensionFactory } from "@trellis/api";

import { DisposableBag } from "../lifecycle";
import { createLogger } from "../log";

import { createExtensionAPI } from "./context";

import type { DiscoveredExtension } from "./discovery";

const log = createLogger("extensions");

/** A single activated entry file. */
export interface LoadedExtension {
  /** Human-readable label, taken from the package directory name. */
  displayName: string;
  /** Absolute path to the entry file. The unique identifier. */
  entry: string;
  /** Per-extension bag; disposing it removes all the extension's contributions. */
  bag: DisposableBag;
}

interface TrellisManifest {
  /** Relative paths to entry files inside the extension's directory. */
  extensions?: string[];
}

const readTrellisManifest = (
  ext: DiscoveredExtension,
): TrellisManifest | null => {
  const raw = ext.packageJson["trellis"];
  if (!raw || typeof raw !== "object") return null;
  return raw as TrellisManifest;
};

/**
 * Activate the trellis side of each discovered extension.
 *
 * Extensions that don't declare a `trellis` field are skipped (the
 * pi side, if present, is the agent's concern, not the cockpit's).
 * Manifests with an empty or missing `trellis.extensions` list get
 * a warning and are otherwise ignored.
 *
 * Each entry file becomes its own LoadedExtension with its own bag,
 * matching pi's "entry is the unit of loading" model.
 *
 * @param extensions from `discoverExtensions()`.
 * @param parentBag every per-entry bag is added here, so one
 *   dispose at app shutdown tears down everything.
 */
export const activateTrellisExtensions = async (
  extensions: DiscoveredExtension[],
  parentBag: DisposableBag,
): Promise<LoadedExtension[]> => {
  const loaded: LoadedExtension[] = [];

  for (const ext of extensions) {
    if (!ext.hasTrellis) continue;

    const manifest = readTrellisManifest(ext);
    const entries = manifest?.extensions ?? [];
    if (entries.length === 0) {
      log.warn({ dir: ext.dir }, "trellis_manifest_empty");
      continue;
    }

    for (const relativeEntry of entries) {
      const entry = path.resolve(ext.dir, relativeEntry);
      const elog = log.child({
        extension: ext.displayName,
        entry,
      });

      elog.info({}, "activating");

      const moduleUrl = pathToFileURL(entry).href;
      const mod = (await import(moduleUrl)) as {
        default?: ExtensionFactory;
      };
      const factory = mod.default;
      if (typeof factory !== "function") {
        elog.warn({}, "no_default_export");
        continue;
      }

      const bag = new DisposableBag();
      parentBag.add(bag);
      const api = createExtensionAPI(
        { displayName: ext.displayName, entry },
        bag,
      );
      await factory(api);

      elog.info({}, "activated");

      loaded.push({ displayName: ext.displayName, entry, bag });
    }
  }

  return loaded;
};
