// Feature loader — discovers feature packages and registers each
// entry's FeatureDefinition through the substrate contribution path.
//
// Responsibilities:
//   1. Re-run side-effect-free discovery for every load pass.
//   2. Log the roots and discovered packages in one shared path.
//   3. Clear the owned feature bag before activation.
//   4. Resolve each `uix.features` entry relative to its package dir.
//   5. Load the entry with jiti so user/project features can be
//      TypeScript files in a packaged Electron app.
//   6. Validate the default export as a FeatureDefinition (shape,
//      id grammar, reserved/duplicate ids).
//   7. Build the same FeatureContext bundled features receive and run
//      the definition through registerFeatureContributions, into a
//      per-feature DisposableBag.
//   8. Enroll the per-feature bag into the parent bag so a single
//      clear or dispose tears every contribution down cleanly.
//
// Activation is sequential (`for...of` + `await`). Matches pi.
// Predictable log order; a tiny feature can't be slowed down by a
// slow neighbor activating in parallel because there is no parallel.
//
// Error isolation: each entry is wrapped in try/catch. If loading,
// validation, or contribution throws, the partially-built per-feature
// bag is disposed (so anything registered before the throw is torn
// down) and we move on. The broken feature lands in the `failed`
// array with a normalized Error. Process-level error handlers
// (installed separately, in lifecycle.ts) catch the
// async-after-activation case where a feature's interval or promise
// throws after the loader has moved on — those log as
// `unhandled_exception` / `unhandled_rejection` without attribution
// (best-effort attribution can be layered on later if needed).
//
// jiti mirrors pi's extension-loading posture one layer up: feature
// authors can write `.ts` files, and `moduleCache: false` means a
// reload re-evaluates the same path without Node ESM query-string
// hacks — which is what makes "agent edits feature source, user
// reloads" work with no build step. jiti is a loader/transpiler,
// not a sandbox; discovered features remain trusted local code.

import fs from "node:fs";
import path from "node:path";

import type { FeatureContext, FeatureDefinition } from "@uix/api/feature";
import type { DocumentStoreFactory } from "@uix/api/documents";
import { createJiti } from "jiti";

import { createFeatureEventPublisherFactory } from "../channels/registry";
import type { ChannelRegistry } from "../channels/registry";
import { DisposableBag } from "../lifecycle";
import { createLogger } from "../log";
import { isIdToken } from "#shared/contribution-id";

import {
  registerFeatureContributions,
  type FeatureContributionRegistries,
} from "./contributions";
import { discoverPackages } from "./discovery";

import type { DiscoveredPackage } from "./discovery";

const log = createLogger("features");

const jiti = createJiti(__filename, {
  // Same hot-reload lever pi uses. Disabling the runtime module cache
  // lets editing a feature's .ts/.js file and reloading evaluate the
  // new source for the same absolute path. jiti may still keep its
  // filesystem transform cache for performance; that cache tracks
  // source state and is not the stale-module problem Node import() has.
  moduleCache: false,
});

/**
 * Feature ids the loader refuses outright: `agent` occupies the channel
 * registry (the substrate's prompt/history/event channels), and `uix`
 * prefixes substrate-owned session entry types (`uix.turn-state`,
 * `uix.state`).
 */
const ReservedFeatureIds: ReadonlySet<string> = new Set(["agent", "uix"]);

/** What the loader needs from the substrate to activate a feature. */
export interface FeatureSubstrate {
  documents: DocumentStoreFactory;
  channels: ChannelRegistry;
  registries: FeatureContributionRegistries;
  /**
   * Feature ids already claimed outside discovery (the bundled
   * features). A discovered feature reusing one fails activation
   * instead of cross-wiring the id's channels/tools/resources.
   */
  takenIds?: ReadonlySet<string>;
}

/**
 * Builds the context bag a feature's `context`/`contribute` hooks receive.
 * One construction path for bundled and discovered features — the substrate
 * facets a feature can touch are exactly what this returns.
 */
export function buildFeatureContext(
  featureId: string,
  substrate: FeatureSubstrate,
): FeatureContext {
  return {
    documents: substrate.documents,
    channels: createFeatureEventPublisherFactory(featureId, substrate.channels),
    log: createLogger(featureId),
  };
}

/** A single activated feature entry that loaded and registered successfully. */
export interface LoadedFeature {
  /** The definition's feature id — keys every facet contribution. */
  id: string;
  /** Human-readable label, taken from the package directory name. */
  displayName: string;
  /** Absolute path to the entry file. The unique identifier. */
  entry: string;
  /** Per-feature bag; disposing it removes all the feature's contributions. */
  bag: DisposableBag;
}

/**
 * A single entry file whose activation threw. Separate type from
 * `LoadedFeature` because the use cases diverge — loaded features
 * contribute behavior; failed ones are inert, surfaced in logs and
 * (eventually) a status panel. Keeping them in different arrays
 * means callers don't have to narrow a discriminator and can't
 * accidentally treat a failed feature as if it had a bag. No `id`
 * field: failure can precede a valid definition (bad export, bad id).
 */
export interface FailedFeature {
  /** Human-readable label, taken from the package directory name. */
  displayName: string;
  /** Absolute path to the entry file. */
  entry: string;
  /** The thrown value, normalized to an Error instance. */
  error: Error;
}

/** Result of a feature activation pass. */
export interface ActivationResult {
  loaded: LoadedFeature[];
  failed: FailedFeature[];
}

const normalize = (thrown: unknown): Error =>
  thrown instanceof Error ? thrown : new Error(String(thrown));

interface FeatureManifest {
  /** Relative paths to entry files inside the package's directory. */
  features?: string[];
}

const readFeatureManifest = (
  pkg: DiscoveredPackage,
): FeatureManifest | null => {
  const raw = pkg.packageJson["uix"];
  if (!raw || typeof raw !== "object") return null;
  // `FeatureManifest` only has optional fields, so the narrowed
  // `object` type already satisfies it structurally — no cast.
  return raw;
};

/**
 * Narrows an entry's default export to a FeatureDefinition or throws
 * with a message that names what's wrong — the throw lands in
 * `failed[]` like any other activation error.
 */
const validateFeatureDefinition = (value: unknown): FeatureDefinition => {
  if (typeof value !== "object" || value === null) {
    throw new Error(
      "default export is not a FeatureDefinition (expected an object with id + contribute)",
    );
  }
  const def = value as Partial<FeatureDefinition>;
  if (typeof def.id !== "string" || !isIdToken(def.id)) {
    throw new Error(
      `FeatureDefinition id is missing or invalid: ${String(def.id)}`,
    );
  }
  if (typeof def.contribute !== "function") {
    throw new Error(`FeatureDefinition ${def.id} has no contribute() function`);
  }
  if (def.context !== undefined && typeof def.context !== "function") {
    throw new Error(`FeatureDefinition ${def.id} context is not a function`);
  }
  return def as FeatureDefinition;
};

/**
 * Discover feature packages under `roots` and emit the standard
 * discovery log sequence. Discovery is intentionally side-effect-free:
 * it reads directories/package.json only and never runs feature code.
 */
export const discoverFeaturePackages = (
  roots: string[],
): DiscoveredPackage[] => {
  log.debug({ count: roots.length }, "scanning_roots");
  for (const dir of roots) {
    log.debug({ dir, present: fs.existsSync(dir) }, "root");
  }

  const discovered = discoverPackages(roots);
  log.debug({ count: discovered.length }, "discovered");
  for (const pkg of discovered) {
    log.debug(
      {
        displayName: pkg.displayName,
        dir: pkg.dir,
        hasPi: pkg.hasPi,
        hasUIX: pkg.hasUIX,
      },
      "found",
    );
  }

  return discovered;
};

/**
 * Activate the uix side of each discovered package.
 *
 * Packages that don't declare a `uix` field are skipped (the
 * pi side, if present, is the agent's concern, not the cockpit's).
 * Manifests with an empty or missing `uix.features` list get
 * a warning and are otherwise ignored.
 *
 * Each entry file becomes its own LoadedFeature with its own bag,
 * matching pi's "entry is the unit of loading" model.
 *
 * @param packages from `discoverFeaturePackages()` or `discoverPackages()`.
 * @param parentBag every per-feature bag is added here, so one
 *   dispose at app shutdown or reload clear tears down everything.
 * @param substrate the facet registries and context ingredients the
 *   definitions register into.
 */
export const activateFeatures = async (
  packages: DiscoveredPackage[],
  parentBag: DisposableBag,
  substrate: FeatureSubstrate,
): Promise<ActivationResult> => {
  const loaded: LoadedFeature[] = [];
  const failed: FailedFeature[] = [];
  const takenIds = new Set(substrate.takenIds);

  for (const pkg of packages) {
    if (!pkg.hasUIX) continue;

    const manifest = readFeatureManifest(pkg);
    const entries = manifest?.features ?? [];
    if (entries.length === 0) {
      log.warn({ dir: pkg.dir }, "uix_manifest_empty");
      continue;
    }

    for (const relativeEntry of entries) {
      const entry = path.resolve(pkg.dir, relativeEntry);
      const flog = log.child({
        package: pkg.displayName,
        entry,
      });

      flog.debug({}, "activating");

      // The per-feature bag is built early so the definition's
      // registrations land somewhere disposable. We only enroll
      // it in the parent bag after activation succeeds — a
      // failed feature's bag is disposed immediately and never
      // becomes part of app-shutdown teardown.
      const bag = new DisposableBag();

      try {
        const exported = await jiti.import<unknown>(entry, { default: true });
        const definition = validateFeatureDefinition(exported);

        if (ReservedFeatureIds.has(definition.id)) {
          throw new Error(`Feature id is reserved: ${definition.id}`);
        }
        if (takenIds.has(definition.id)) {
          throw new Error(`Feature id already registered: ${definition.id}`);
        }

        const baseContext = buildFeatureContext(definition.id, substrate);
        const contributedContext = definition.context?.(baseContext) ?? {};
        bag.add(
          registerFeatureContributions(
            substrate.registries,
            definition.id,
            definition.contribute({ ...baseContext, ...contributedContext }),
          ),
        );

        takenIds.add(definition.id);
        parentBag.add(bag);
        loaded.push({
          id: definition.id,
          displayName: pkg.displayName,
          entry,
          bag,
        });
        flog.debug({ id: definition.id }, "activation_succeeded");
      } catch (thrown) {
        const error = normalize(thrown);
        // Tear down anything the definition managed to register
        // before it threw — partial activation shouldn't leak
        // half-wired contributions.
        bag[Symbol.dispose]();
        failed.push({ displayName: pkg.displayName, entry, error });
        flog.error(
          { err: error.message, stack: error.stack },
          "activation_failed",
        );
      }
    }
  }

  return { loaded, failed };
};

/**
 * Load discovered features from disk into the owned feature bag,
 * replacing whatever that bag currently contains. Safe for initial
 * startup (empty clear) and for manual reload (old contributions are
 * disposed before activation).
 *
 * Discovery runs before clearing so a discovery-only substrate failure
 * leaves the current feature tree intact. Concurrent callers share
 * the same in-flight pass so clear/activate never overlaps itself.
 */
let inFlightFeatureLoad: Promise<ActivationResult> | undefined;

export const loadFeatures = (
  roots: string[],
  featuresBag: DisposableBag,
  substrate: FeatureSubstrate,
): Promise<ActivationResult> => {
  if (inFlightFeatureLoad) return inFlightFeatureLoad;

  inFlightFeatureLoad = (async () => {
    const discovered = discoverFeaturePackages(roots);
    featuresBag.clear();
    return activateFeatures(discovered, featuresBag, substrate);
  })().finally(() => {
    inFlightFeatureLoad = undefined;
  });

  return inFlightFeatureLoad;
};
