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
// Error isolation: each factory call is wrapped in try/catch. If
// the factory throws, the partially-built per-extension bag is
// disposed (so anything the factory got far enough to register is
// torn down) and we move on. The broken extension lands in the
// `failed` array with a normalized Error. Process-level error
// handlers (installed separately, in lifecycle.ts) catch the
// async-after-activation case where an extension's interval or
// promise throws after the loader has moved on — those log as
// `unhandled_exception` / `unhandled_rejection` without attribution
// (best-effort attribution can be layered on later if needed).
//
// TypeScript extensions aren't supported yet. Pi uses jiti to
// transpile TS at runtime; we'll add the same when there's a real
// TS extension to load. For now, entry files are `.js` / `.mjs`
// only.

import path from "node:path";
import { pathToFileURL } from "node:url";

import type { ExtensionFactory } from "@trellis/api";

import { DisposableBag } from "../lifecycle";
import { createLogger } from "../log";

import { createExtensionAPI } from "./context";

import type { DiscoveredExtension } from "./discovery";

const log = createLogger("extensions");

/** A single activated entry file that loaded successfully. */
export interface LoadedExtension {
  /** Human-readable label, taken from the package directory name. */
  displayName: string;
  /** Absolute path to the entry file. The unique identifier. */
  entry: string;
  /** Per-extension bag; disposing it removes all the extension's contributions. */
  bag: DisposableBag;
}

/**
 * A single entry file whose activation threw. Separate type from
 * `LoadedExtension` because the use cases diverge — loaded
 * extensions feed the registry and contribute behavior; failed
 * ones are inert, surfaced in logs and (eventually) a status
 * panel. Keeping them in different arrays means callers don't
 * have to narrow a discriminator and can't accidentally treat a
 * failed extension as if it had a bag.
 */
export interface FailedExtension {
  /** Human-readable label, taken from the package directory name. */
  displayName: string;
  /** Absolute path to the entry file. */
  entry: string;
  /** The thrown value, normalized to an Error instance. */
  error: Error;
}

/** Result of `activateTrellisExtensions`. */
export interface ActivationResult {
  loaded: LoadedExtension[];
  failed: FailedExtension[];
}

const normalize = (thrown: unknown): Error =>
  thrown instanceof Error ? thrown : new Error(String(thrown));

interface TrellisManifest {
  /** Relative paths to entry files inside the extension's directory. */
  extensions?: string[];
}

const readTrellisManifest = (
  ext: DiscoveredExtension,
): TrellisManifest | null => {
  const raw = ext.packageJson["trellis"];
  if (!raw || typeof raw !== "object") return null;
  // `TrellisManifest` only has optional fields, so the narrowed
  // `object` type already satisfies it structurally — no cast.
  return raw;
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
): Promise<ActivationResult> => {
  const loaded: LoadedExtension[] = [];
  const failed: FailedExtension[] = [];

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

      // The per-extension bag is built early so the factory's
      // registrations land somewhere disposable. We only enroll
      // it in the parent bag after the factory succeeds — a
      // failed extension's bag is disposed immediately and never
      // becomes part of app-shutdown teardown.
      const bag = new DisposableBag();
      const api = createExtensionAPI(
        { displayName: ext.displayName, entry },
        bag,
      );

      try {
        const moduleUrl = pathToFileURL(entry).href;
        const mod = (await import(moduleUrl)) as {
          default?: ExtensionFactory;
        };
        const factory = mod.default;
        if (typeof factory !== "function") {
          elog.warn({}, "no_default_export");
          bag[Symbol.dispose]();
          continue;
        }

        await factory(api);

        parentBag.add(bag);
        loaded.push({ displayName: ext.displayName, entry, bag });
        elog.info({}, "activation_succeeded");
      } catch (thrown) {
        const error = normalize(thrown);
        // Tear down anything the factory managed to register
        // before it threw — partial activation shouldn't leak
        // half-wired contributions.
        bag[Symbol.dispose]();
        failed.push({ displayName: ext.displayName, entry, error });
        elog.error(
          { err: error.message, stack: error.stack },
          "activation_failed",
        );
      }
    }
  }

  return { loaded, failed };
};
