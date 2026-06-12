// UIX extension loader — discovers extension package dirs and turns
// their entry files into activated extensions.
//
// Responsibilities:
//   1. Re-run side-effect-free discovery for every load pass.
//   2. Log the roots and discovered packages in one shared path.
//   3. Clear the owned extension bag before activation.
//   4. Resolve each `uix.extensions` entry relative to its package dir.
//   5. Load the entry with jiti so user/project extensions can be
//      TypeScript files in a packaged Electron app.
//   6. Build an ExtensionAPI bound to a per-entry DisposableBag.
//   7. Invoke the default-exported factory with that API.
//   8. Enroll the per-entry bag into the parent bag so a single clear
//      or dispose tears every contribution down cleanly.
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
// jiti mirrors pi's extension loading posture: extension authors can
// write `.ts` files, and `moduleCache: false` means a reload
// re-evaluates the same path without Node ESM query-string hacks.
// jiti is a loader/transpiler, not a sandbox; UIX extensions remain
// trusted local code.

import fs from "node:fs";
import path from "node:path";

import type { ExtensionFactory } from "@uix/api";
import { createJiti } from "jiti";

import { DisposableBag } from "../lifecycle";
import { createLogger } from "../log";

import { createExtensionAPI } from "./context";
import { discoverExtensions } from "./discovery";

import type { DiscoveredExtension } from "./discovery";

const log = createLogger("extensions");

const jiti = createJiti(__filename, {
  // Same hot-reload lever pi uses. Disabling the runtime module cache
  // lets editing an extension's .ts/.js file and reloading evaluate the
  // new source for the same absolute path. jiti may still keep its
  // filesystem transform cache for performance; that cache tracks
  // source state and is not the stale-module problem Node import() has.
  moduleCache: false,
});

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

/** Result of an extension activation pass. */
export interface ActivationResult {
  loaded: LoadedExtension[];
  failed: FailedExtension[];
}

const normalize = (thrown: unknown): Error =>
  thrown instanceof Error ? thrown : new Error(String(thrown));

interface UIXManifest {
  /** Relative paths to entry files inside the extension's directory. */
  extensions?: string[];
}

const readUIXManifest = (ext: DiscoveredExtension): UIXManifest | null => {
  const raw = ext.packageJson["uix"];
  if (!raw || typeof raw !== "object") return null;
  // `UIXManifest` only has optional fields, so the narrowed
  // `object` type already satisfies it structurally — no cast.
  return raw;
};

const loadExtensionFactory = async (
  entry: string,
): Promise<ExtensionFactory | undefined> => {
  const factory = await jiti.import<unknown>(entry, { default: true });
  return typeof factory === "function"
    ? (factory as ExtensionFactory)
    : undefined;
};

/**
 * Discover UIX extension packages under `roots` and emit the standard
 * discovery log sequence. Discovery is intentionally side-effect-free:
 * it reads directories/package.json only and never runs extension code.
 */
export const discoverUIXExtensions = (
  roots: string[],
): DiscoveredExtension[] => {
  log.debug({ count: roots.length }, "scanning_roots");
  for (const dir of roots) {
    log.debug({ dir, present: fs.existsSync(dir) }, "root");
  }

  const discovered = discoverExtensions(roots);
  log.debug({ count: discovered.length }, "discovered");
  for (const ext of discovered) {
    log.debug(
      {
        displayName: ext.displayName,
        dir: ext.dir,
        hasPi: ext.hasPi,
        hasUIX: ext.hasUIX,
      },
      "found",
    );
  }

  return discovered;
};

/**
 * Activate the uix side of each discovered extension.
 *
 * Extensions that don't declare a `uix` field are skipped (the
 * pi side, if present, is the agent's concern, not the cockpit's).
 * Manifests with an empty or missing `uix.extensions` list get
 * a warning and are otherwise ignored.
 *
 * Each entry file becomes its own LoadedExtension with its own bag,
 * matching pi's "entry is the unit of loading" model.
 *
 * @param extensions from `discoverUIXExtensions()` or
 *   `discoverExtensions()`.
 * @param parentBag every per-entry bag is added here, so one
 *   dispose at app shutdown or reload clear tears down everything.
 */
export const activateUIXExtensions = async (
  extensions: DiscoveredExtension[],
  parentBag: DisposableBag,
): Promise<ActivationResult> => {
  const loaded: LoadedExtension[] = [];
  const failed: FailedExtension[] = [];

  for (const ext of extensions) {
    if (!ext.hasUIX) continue;

    const manifest = readUIXManifest(ext);
    const entries = manifest?.extensions ?? [];
    if (entries.length === 0) {
      log.warn({ dir: ext.dir }, "uix_manifest_empty");
      continue;
    }

    for (const relativeEntry of entries) {
      const entry = path.resolve(ext.dir, relativeEntry);
      const elog = log.child({
        extension: ext.displayName,
        entry,
      });

      elog.debug({}, "activating");

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
        const factory = await loadExtensionFactory(entry);
        if (!factory) {
          elog.warn({}, "no_default_export");
          bag[Symbol.dispose]();
          continue;
        }

        await factory(api);

        parentBag.add(bag);
        loaded.push({ displayName: ext.displayName, entry, bag });
        elog.debug({}, "activation_succeeded");
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

/**
 * Load UIX extensions from disk into the owned extension bag,
 * replacing whatever that bag currently contains. Safe for initial
 * startup (empty clear) and for manual reload (old contributions are
 * disposed before activation).
 *
 * Discovery runs before clearing so a discovery-only substrate failure
 * leaves the current extension tree intact. Concurrent callers share
 * the same in-flight pass so clear/activate never overlaps itself.
 */
let inFlightExtensionLoad: Promise<ActivationResult> | undefined;

export const loadExtensions = (
  roots: string[],
  extensionsBag: DisposableBag,
): Promise<ActivationResult> => {
  if (inFlightExtensionLoad) return inFlightExtensionLoad;

  inFlightExtensionLoad = (async () => {
    const discovered = discoverUIXExtensions(roots);
    extensionsBag.clear();
    return activateUIXExtensions(discovered, extensionsBag);
  })().finally(() => {
    inFlightExtensionLoad = undefined;
  });

  return inFlightExtensionLoad;
};
