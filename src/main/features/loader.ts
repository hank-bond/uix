// Feature loader — activates the workspace's feature composition:
// bundled defaults first, then the workspace manifest's entries, all
// through one registration path.
//
// Responsibilities:
//   1. Re-read and validate the workspace manifest for every load pass
//      (before clearing anything, so a bad manifest leaves the current
//      tree intact).
//   2. Clear the owned feature bag before activation.
//   3. Activate bundled FeatureDefinitions (in-tree defaults) so
//      their ids are claimed before any manifest entry runs.
//   4. Load each manifest entry file with jiti so workspace features
//      can be TypeScript files in a packaged Electron app.
//   5. Validate every definition the same way (shape, id grammar,
//      reserved/duplicate ids) — bundled and manifest alike.
//   6. Build one FeatureContext shape and run each definition through
//      registerFeatureContributions, into a per-feature DisposableBag.
//   7. Enroll the per-feature bag into the parent bag so a single
//      clear or dispose tears every contribution down cleanly.
//
// Activation is sequential (`for...of` + `await`), in manifest order
// after bundled — order is the composition semantics (registration
// order is semantic for agent-facing facets), so it is explicit and
// author-controlled, never emergent.
//
// Error isolation: each entry is wrapped in try/catch. If loading,
// validation, or contribution throws, the partially-built per-feature
// bag is disposed (so anything registered before the throw is torn
// down) and we move on. The broken feature lands in the `failed`
// array with a normalized Error. Manifest-level failures (unreadable,
// bad JSON, schema mismatch) are different: they throw out of the
// load pass before anything is cleared. Process-level error handlers
// (installed separately, in lifecycle.ts) catch the
// async-after-activation case where a feature's interval or promise
// throws after the loader has moved on.
//
// jiti mirrors pi's extension-loading posture one layer up: feature
// authors can write `.ts` files, and `moduleCache: false` means a
// reload re-evaluates the same path without Node ESM query-string
// hacks — which is what makes "agent edits feature source, user
// reloads" work with no build step. jiti is a loader/transpiler,
// not a sandbox; workspace features remain trusted local code.

import { dirname } from "node:path";

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
import { readWorkspaceManifest, type ManifestFeatureRef } from "./manifest";

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
}

/** The feature sources a load pass composes, bundled first. */
export interface FeatureSources {
  /**
   * Absolute path to the workspace's `uix.workspace.json`. Omitted when
   * the workspace has no manifest (transitional dev bootstrapping) —
   * only bundled features load.
   */
  manifestPath?: string;
  /** In-tree default features, activated before any manifest entry. */
  bundled?: readonly FeatureDefinition[];
}

/**
 * Builds the context bag a feature's `context`/`contribute` hooks receive.
 * One construction path for bundled and manifest features — the substrate
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

/** A single activated feature that loaded and registered successfully. */
export interface LoadedFeature {
  /** The definition's feature id — keys every facet contribution. */
  id: string;
  /** The manifest ref as written (or `bundled` for in-tree defaults). */
  displayName: string;
  /** Absolute entry-file path (`bundled:<id>` pseudo-path for defaults). */
  entry: string;
  /** Per-feature bag; disposing it removes all the feature's contributions. */
  bag: DisposableBag;
}

/**
 * A single entry whose activation threw. Separate type from
 * `LoadedFeature` because the use cases diverge — loaded features
 * contribute behavior; failed ones are inert, surfaced in logs and
 * (eventually) a status panel. Keeping them in different arrays
 * means callers don't have to narrow a discriminator and can't
 * accidentally treat a failed feature as if it had a bag. No `id`
 * field: failure can precede a valid definition (bad export, bad id).
 */
export interface FailedFeature {
  /** The manifest ref as written (or `bundled` for in-tree defaults). */
  displayName: string;
  /** Absolute entry-file path. */
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
 * Activate bundled definitions and the manifest's feature entries, in
 * that order — bundled features claim their ids first, so a workspace
 * feature can't cross-wire a default's channels/tools.
 *
 * Each manifest entry becomes its own LoadedFeature with its own bag;
 * bundled definitions get the same per-feature bag and error isolation
 * (a throwing default lands in `failed[]` instead of aborting startup).
 *
 * @param sources bundled definitions plus resolved manifest refs.
 * @param parentBag every per-feature bag is added here, so one
 *   dispose at app shutdown or reload clear tears down everything.
 * @param substrate the facet registries and context ingredients the
 *   definitions register into.
 */
export const activateFeatures = async (
  sources: {
    bundled: readonly FeatureDefinition[];
    entries: readonly ManifestFeatureRef[];
  },
  parentBag: DisposableBag,
  substrate: FeatureSubstrate,
): Promise<ActivationResult> => {
  const loaded: LoadedFeature[] = [];
  const failed: FailedFeature[] = [];
  const takenIds = new Set<string>();

  const activate = async (
    displayName: string,
    entry: string,
    loadDefinition: () => unknown,
    entryDir?: string,
  ): Promise<void> => {
    const flog = log.child({ feature: displayName, entry });
    flog.debug({}, "activating");

    // The per-feature bag is built early so the definition's
    // registrations land somewhere disposable. We only enroll
    // it in the parent bag after activation succeeds — a
    // failed feature's bag is disposed immediately and never
    // becomes part of app-shutdown teardown.
    const bag = new DisposableBag();

    try {
      const definition = validateFeatureDefinition(await loadDefinition());

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
          { entryDir },
        ),
      );

      takenIds.add(definition.id);
      parentBag.add(bag);
      loaded.push({ id: definition.id, displayName, entry, bag });
      flog.debug({ id: definition.id }, "activation_succeeded");
    } catch (thrown) {
      const error = normalize(thrown);
      // Tear down anything the definition managed to register
      // before it threw — partial activation shouldn't leak
      // half-wired contributions.
      bag[Symbol.dispose]();
      failed.push({ displayName, entry, error });
      flog.error(
        { err: error.message, stack: error.stack },
        "activation_failed",
      );
    }
  };

  for (const definition of sources.bundled) {
    // Bundled definitions have no entry file; the synthetic `bundled:`
    // pseudo-path keeps `entry` unique and log-greppable.
    await activate("bundled", `bundled:${definition.id}`, () => definition);
  }

  for (const { ref, entry } of sources.entries) {
    await activate(
      ref,
      entry,
      () => jiti.import<unknown>(entry, { default: true }),
      dirname(entry),
    );
  }

  return { loaded, failed };
};

/**
 * Load the whole feature composition — bundled defaults plus the
 * workspace manifest's entries — into the owned feature bag, replacing
 * whatever that bag currently contains. Safe for initial startup
 * (empty clear) and for manual reload (old contributions are disposed
 * before activation, and bundled features re-register with fresh
 * context/bags).
 *
 * The manifest is read and validated before clearing, so a manifest
 * failure (unreadable, bad JSON, schema mismatch) rejects the pass and
 * leaves the current feature tree intact. Concurrent callers share the
 * same in-flight pass so clear/activate never overlaps itself.
 */
let inFlightFeatureLoad: Promise<ActivationResult> | undefined;

export const loadFeatures = (
  sources: FeatureSources,
  featuresBag: DisposableBag,
  substrate: FeatureSubstrate,
): Promise<ActivationResult> => {
  if (inFlightFeatureLoad) return inFlightFeatureLoad;

  inFlightFeatureLoad = (async () => {
    let entries: readonly ManifestFeatureRef[] = [];
    if (sources.manifestPath) {
      const { manifest, features } = await readWorkspaceManifest(
        sources.manifestPath,
      );
      log.debug(
        {
          manifest: sources.manifestPath,
          workspace: manifest.name,
          features: features.map((f) => f.ref),
        },
        "manifest_read",
      );
      entries = features;
    }
    featuresBag.clear();
    return activateFeatures(
      { bundled: sources.bundled ?? [], entries },
      featuresBag,
      substrate,
    );
  })().finally(() => {
    inFlightFeatureLoad = undefined;
  });

  return inFlightFeatureLoad;
};
